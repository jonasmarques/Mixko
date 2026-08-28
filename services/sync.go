package services

import (
	"context"
	"encoding/json"
	"math/rand/v2"
	"net/url"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// syncInterval is how often the background poller checks for new activity.
const syncInterval = 60 * time.Second

type SyncService struct {
	clientMgr *ATClient
	feedSvc   *FeedService
	notifSvc  *NotificationsService
	chatSvc   *ChatService

	// mu guards every field below; Start/Stop run on the UI goroutine while
	// pollLoop runs on its own.
	mu        sync.Mutex
	ctx       context.Context
	cancel    context.CancelFunc
	isRunning bool

	lastUnreadCount     int64
	lastUnreadChatCount int64
	// lastTopPostCID identifies the newest post already delivered to the UI, so
	// an unchanged timeline does not get re-emitted every minute.
	lastTopPostCID string
}

func NewSyncService(clientMgr *ATClient, feedSvc *FeedService, notifSvc *NotificationsService, chatSvc *ChatService) *SyncService {
	return &SyncService{
		clientMgr: clientMgr,
		feedSvc:   feedSvc,
		notifSvc:  notifSvc,
		chatSvc:   chatSvc,
	}
}

func (s *SyncService) Start(ctx context.Context) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.isRunning {
		return
	}
	s.ctx, s.cancel = context.WithCancel(ctx)
	s.isRunning = true
	go s.pollLoop(s.ctx)
	go s.jetstreamLoop(s.ctx)
}

func (s *SyncService) Stop() {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.cancel != nil {
		s.cancel()
		s.cancel = nil
	}
	s.isRunning = false
}

func (s *SyncService) pollLoop(ctx context.Context) {
	ticker := time.NewTicker(syncInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			s.checkForUpdates(ctx)
		}
	}
}

func (s *SyncService) checkForUpdates(ctx context.Context) {
	// Nothing to poll until the user is logged in.
	if _, err := s.clientMgr.GetClient(); err != nil {
		return
	}

	if unread, err := s.notifSvc.GetUnreadCount(); err == nil {
		s.mu.Lock()
		changed := unread > s.lastUnreadCount
		s.lastUnreadCount = unread
		s.mu.Unlock()

		if changed {
			runtime.EventsEmit(ctx, "new_notifications", unread)
		}
	}

	if s.chatSvc != nil {
		if convos, err := s.chatSvc.ListConvos(""); err == nil {
			var unreadChat int64
			for _, c := range convos {
				unreadChat += c.UnreadCount
			}

			s.mu.Lock()
			changed := unreadChat > s.lastUnreadChatCount
			s.lastUnreadChatCount = unreadChat
			s.mu.Unlock()

			if changed {
				runtime.EventsEmit(ctx, "new_chat_messages", unreadChat)
			}
		}
	}

	// Only hand the timeline to the UI when the newest post actually changed;
	// otherwise every tick would re-render the same posts.
	timeline, err := s.feedSvc.GetTimeline("", 30)
	if err != nil || timeline == nil || len(timeline.Posts) == 0 {
		return
	}

	topCID := timeline.Posts[0].CID

	s.mu.Lock()
	changed := topCID != "" && topCID != s.lastTopPostCID
	if changed {
		s.lastTopPostCID = topCID
	}
	s.mu.Unlock()

	if changed {
		runtime.EventsEmit(ctx, "new_timeline_posts", timeline.Posts)
	}
}

// jetstreamHosts are the public Jetstream instances. They are equivalent, so a
// host that refuses us is simply skipped rather than taking the stream down.
var jetstreamHosts = []string{
	"jetstream1.us-east.bsky.network",
	"jetstream2.us-east.bsky.network",
	"jetstream1.us-west.bsky.network",
	"jetstream2.us-west.bsky.network",
}

// jetstreamCollections are the record types worth waking the UI for.
var jetstreamCollections = []string{
	"app.bsky.feed.post",
	"app.bsky.feed.like",
	"app.bsky.feed.repost",
	"app.bsky.graph.follow",
}

const (
	// jetstreamCoalesce bounds how often events may trigger a refresh. Each
	// refresh costs three API calls, so posting a thread in one go must not
	// turn into a burst of them.
	jetstreamCoalesce = 5 * time.Second

	// jetstreamReadTimeout treats a silent socket as dead. Filtering to a
	// single DID means genuine silence can last hours, so keepalive pongs —
	// not traffic — are what hold the connection open.
	jetstreamReadTimeout  = 90 * time.Second
	jetstreamPingInterval = 30 * time.Second
	jetstreamWriteTimeout = 10 * time.Second

	// jetstreamMinUptime is how long a connection must survive to count as
	// working. Anything shorter is treated as a failing host.
	jetstreamMinUptime = 30 * time.Second

	jetstreamMaxBackoff = 60 * time.Second

	// jetstreamMaxMessage caps a single event, so a malformed frame cannot
	// make the client allocate without bound.
	jetstreamMaxMessage = 2 << 20 // 2 MiB
)

// jetstreamURL builds a subscription filtered to one repo.
//
// Note this is the user's *own* DID: the stream reports what this account did,
// which is what lets the app pick up posts, likes and follows made from another
// client. Activity by other people still arrives through the poller.
func jetstreamURL(host, did string) string {
	params := url.Values{}
	params.Set("wantedDids", did)
	for _, collection := range jetstreamCollections {
		params.Add("wantedCollections", collection)
	}
	return "wss://" + host + "/subscribe?" + params.Encode()
}

// sleepCtx waits for d, reporting false if the app shut down first.
func sleepCtx(ctx context.Context, d time.Duration) bool {
	timer := time.NewTimer(d)
	defer timer.Stop()

	select {
	case <-ctx.Done():
		return false
	case <-timer.C:
		return true
	}
}

// jetstreamBackoff grows the wait between failed attempts, with jitter so a
// network outage does not have every client reconnect in lockstep.
func jetstreamBackoff(attempt int) time.Duration {
	if attempt <= 0 {
		return 2 * time.Second
	}

	delay := time.Duration(1<<uint(min(attempt, 6))) * time.Second
	if delay > jetstreamMaxBackoff {
		delay = jetstreamMaxBackoff
	}
	return delay/2 + time.Duration(rand.Int64N(int64(delay/2)+1))
}

func (s *SyncService) jetstreamLoop(ctx context.Context) {
	// One-slot mailbox: a burst of events collapses into a single pending
	// refresh instead of one round of API calls per event.
	trigger := make(chan struct{}, 1)
	go s.refreshOnTrigger(ctx, trigger)

	attempt := 0
	for {
		if ctx.Err() != nil {
			return
		}

		client, err := s.clientMgr.GetClient()
		if err != nil || client.Auth == nil || client.Auth.Did == "" {
			if !sleepCtx(ctx, 5*time.Second) {
				return
			}
			continue
		}

		host := jetstreamHosts[attempt%len(jetstreamHosts)]
		if s.consumeJetstream(ctx, host, client.Auth.Did, trigger) {
			attempt = 0
		} else {
			attempt++
		}

		if !sleepCtx(ctx, jetstreamBackoff(attempt)) {
			return
		}
	}
}

// refreshOnTrigger turns the event mailbox into at most one refresh per
// coalescing window, for the lifetime of the app.
func (s *SyncService) refreshOnTrigger(ctx context.Context, trigger <-chan struct{}) {
	for {
		select {
		case <-ctx.Done():
			return
		case <-trigger:
			s.checkForUpdates(ctx)
			// Absorb whatever lands while the refresh settles.
			if !sleepCtx(ctx, jetstreamCoalesce) {
				return
			}
		}
	}
}

// consumeJetstream holds one connection open, signalling trigger on each
// commit. It reports whether the connection stayed up long enough to consider
// the host healthy.
func (s *SyncService) consumeJetstream(ctx context.Context, host, did string, trigger chan<- struct{}) bool {
	dialer := websocket.Dialer{HandshakeTimeout: 10 * time.Second}

	conn, resp, err := dialer.DialContext(ctx, jetstreamURL(host, did), nil)
	if resp != nil && resp.Body != nil {
		// On a rejected handshake the body carries the server's explanation
		// and must be drained by the caller.
		_ = resp.Body.Close()
	}
	if err != nil {
		return false
	}
	defer conn.Close()

	conn.SetReadLimit(jetstreamMaxMessage)
	_ = conn.SetReadDeadline(time.Now().Add(jetstreamReadTimeout))
	conn.SetPongHandler(func(string) error {
		return conn.SetReadDeadline(time.Now().Add(jetstreamReadTimeout))
	})

	stop := make(chan struct{})
	defer close(stop)

	go func() {
		ticker := time.NewTicker(jetstreamPingInterval)
		defer ticker.Stop()

		for {
			select {
			case <-ctx.Done():
				// Unblocks the read below so shutdown does not wait on the
				// read deadline.
				_ = conn.Close()
				return
			case <-stop:
				return
			case <-ticker.C:
				// WriteControl is the concurrency-safe path for control
				// frames, which matters because gorilla answers server pings
				// on its own.
				deadline := time.Now().Add(jetstreamWriteTimeout)
				if err := conn.WriteControl(websocket.PingMessage, nil, deadline); err != nil {
					_ = conn.Close()
					return
				}
			}
		}
	}()

	start := time.Now()
	for {
		_, msg, err := conn.ReadMessage()
		if err != nil {
			return time.Since(start) >= jetstreamMinUptime
		}
		_ = conn.SetReadDeadline(time.Now().Add(jetstreamReadTimeout))

		var evt struct {
			Kind string `json:"kind"`
		}
		if json.Unmarshal(msg, &evt) != nil || evt.Kind != "commit" {
			continue
		}

		select {
		case trigger <- struct{}{}:
		default:
			// A refresh is already pending; this event folds into it.
		}
	}
}
