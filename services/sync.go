package services

import (
	"context"
	"time"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

type SyncService struct {
	clientMgr           *BSkyClient
	feedSvc             *FeedService
	notifSvc            *NotificationsService
	chatSvc             *ChatService
	ctx                 context.Context
	cancel              context.CancelFunc
	isRunning           bool
	lastUnreadCount     int64
	lastUnreadChatCount int64
}

func NewSyncService(clientMgr *BSkyClient, feedSvc *FeedService, notifSvc *NotificationsService, chatSvc *ChatService) *SyncService {
	return &SyncService{
		clientMgr: clientMgr,
		feedSvc:   feedSvc,
		notifSvc:  notifSvc,
		chatSvc:   chatSvc,
	}
}

func (s *SyncService) Start(ctx context.Context) {
	if s.isRunning {
		return
	}
	s.ctx, s.cancel = context.WithCancel(ctx)
	s.isRunning = true
	go s.pollLoop()
}

func (s *SyncService) Stop() {
	if s.cancel != nil {
		s.cancel()
	}
	s.isRunning = false
}

func (s *SyncService) pollLoop() {
	ticker := time.NewTicker(60 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-s.ctx.Done():
			return
		case <-ticker.C:
			s.checkForUpdates()
		}
	}
}

func (s *SyncService) checkForUpdates() {
	// Check Notifications
	unread, err := s.notifSvc.GetUnreadCount()
	if err == nil {
		if unread > s.lastUnreadCount {
			runtime.EventsEmit(s.ctx, "new_notifications", unread)
		}
		s.lastUnreadCount = unread
	}

	// Check Chat / DMs
	if s.chatSvc != nil {
		convos, err := s.chatSvc.ListConvos("")
		if err == nil {
			var unreadChat int64 = 0
			for _, c := range convos {
				unreadChat += c.UnreadCount
			}
			if unreadChat > s.lastUnreadChatCount {
				runtime.EventsEmit(s.ctx, "new_chat_messages", unreadChat)
			}
			s.lastUnreadChatCount = unreadChat
		}
	}

	// Check Timeline
	timeline, err := s.feedSvc.GetTimeline("", 30)
	if err == nil && len(timeline.Posts) > 0 {
		runtime.EventsEmit(s.ctx, "new_timeline_posts", timeline.Posts)
	}
}
