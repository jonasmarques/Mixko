package services

import (
	"context"
	"encoding/json"
	"fmt"
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

func (s *SyncService) jetstreamLoop(ctx context.Context) {
	for {
		select {
		case <-ctx.Done():
			return
		default:
		}

		client, err := s.clientMgr.GetClient()
		if err != nil || client.Auth == nil || client.Auth.Did == "" {
			select {
			case <-ctx.Done():
				return
			case <-time.After(5 * time.Second):
				continue
			}
		}

		userDid := client.Auth.Did
		wsURL := fmt.Sprintf("wss://jetstream.us-east.bsky.network/xrpc/network.bsky.jetstream.subscribeEvents?wantedDids=%s&wantedCollections=app.bsky.feed.post&wantedCollections=app.bsky.feed.like&wantedCollections=app.bsky.feed.repost&wantedCollections=app.bsky.graph.follow", url.QueryEscape(userDid))

		dialer := websocket.Dialer{
			HandshakeTimeout: 10 * time.Second,
		}

		conn, _, err := dialer.DialContext(ctx, wsURL, nil)
		if err != nil {
			select {
			case <-ctx.Done():
				return
			case <-time.After(10 * time.Second):
				continue
			}
		}

		done := make(chan struct{})
		go func() {
			select {
			case <-ctx.Done():
				_ = conn.Close()
			case <-done:
			}
		}()

		for {
			_, msg, err := conn.ReadMessage()
			if err != nil {
				_ = conn.Close()
				break
			}

			if len(msg) > 0 {
				var evt struct {
					Kind   string `json:"kind"`
					Commit *struct {
						Collection string `json:"collection"`
					} `json:"commit"`
				}
				if jsonErr := json.Unmarshal(msg, &evt); jsonErr == nil && evt.Kind == "commit" {
					s.checkForUpdates(ctx)
				}
			}
		}
		close(done)

		select {
		case <-ctx.Done():
			return
		case <-time.After(5 * time.Second):
		}
	}
}
