package services

import (
	"context"
	"github.com/bluesky-social/indigo/api/bsky"
	"github.com/bluesky-social/indigo/xrpc"
)

type NotificationsService struct {
	clientMgr *BSkyClient
}

func NewNotificationsService(clientMgr *BSkyClient) *NotificationsService {
	return &NotificationsService{clientMgr: clientMgr}
}

func (s *NotificationsService) GetNotifications(cursor string) (*NotificationListDTO, error) {
	ctx := context.Background()
	var out *NotificationListDTO
	err := s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		res, err := bsky.NotificationListNotifications(ctx, c, cursor, 50, false, nil, "")
		if err != nil {
			return err
		}
		
		out = &NotificationListDTO{Cursor: safeString(res.Cursor)}
		
		var postUris []string
		for _, item := range res.Notifications {
			if (item.Reason == "like" || item.Reason == "repost") && item.ReasonSubject != nil {
				postUris = append(postUris, *item.ReasonSubject)
				if item.Record != nil {
					if subjURI := ParseRepostSubjectURI(item.Record.Val); subjURI != "" {
						postUris = append(postUris, subjURI)
					}
				}
			} else if item.Reason == "reply" || item.Reason == "quote" || item.Reason == "mention" {
				postUris = append(postUris, item.Uri)
				if item.Reason == "quote" && item.ReasonSubject != nil {
					postUris = append(postUris, *item.ReasonSubject)
				}
			}
		}

		postViews := make(map[string]*PostDTO)
		if len(postUris) > 0 {
			for i := 0; i < len(postUris); i += 25 {
				end := i + 25
				if end > len(postUris) { end = len(postUris) }
				postRes, err := bsky.FeedGetPosts(ctx, c, postUris[i:end])
				if err == nil {
					for _, p := range postRes.Posts {
						postViews[p.Uri] = ParsePostView(p)
					}
				}
			}
		}

		for _, item := range res.Notifications {
			authorName := ""
			if item.Author.DisplayName != nil { authorName = *item.Author.DisplayName }
			
			text := ""
			hasMedia := false
			var video *VideoEmbedDTO
			
			if (item.Reason == "like" || item.Reason == "repost") && item.ReasonSubject != nil {
				if view, ok := postViews[*item.ReasonSubject]; ok {
					text = view.Text
					hasMedia = view.HasMedia
					video = view.Video
				} else if item.Record != nil {
					if subjURI := ParseRepostSubjectURI(item.Record.Val); subjURI != "" {
						if viewSubj, okSubj := postViews[subjURI]; okSubj {
							text = viewSubj.Text
							hasMedia = viewSubj.HasMedia
							video = viewSubj.Video
						}
					}
				}
			} else if item.Reason == "reply" || item.Reason == "quote" || item.Reason == "mention" {
				if view, ok := postViews[item.Uri]; ok {
					text = view.Text
					hasMedia = view.HasMedia
					video = view.Video
				}
			}
			
			if text == "" && item.Record != nil {
				text = ParseFeedPost(item.Record.Val)
			}
			
			if text == "" && item.Reason == "repost" {
				text = "Repostou uma publicação sua"
			}

			var quoteAuthorName, quoteAuthorHandle, quoteText, quoteUri string
			if item.Reason == "quote" && item.ReasonSubject != nil {
				if qView, ok := postViews[*item.ReasonSubject]; ok {
					quoteAuthorName = qView.AuthorName
					quoteAuthorHandle = qView.AuthorHandle
					quoteText = qView.Text
					quoteUri = qView.URI
				}
			}

			out.Notifications = append(out.Notifications, &NotificationDTO{
				URI:               item.Uri,
				CID:               item.Cid,
				AuthorName:        authorName,
				AuthorHandle:      item.Author.Handle,
				Reason:            item.Reason,
				IndexedAt:         item.IndexedAt,
				Text:              text,
				ReasonSubject:     safeString(item.ReasonSubject),
				HasMedia:          hasMedia,
				Video:             video,
				QuoteAuthorName:   quoteAuthorName,
				QuoteAuthorHandle: quoteAuthorHandle,
				QuoteText:         quoteText,
				QuoteUri:          quoteUri,
			})
		}
		
		return nil
	})
	return out, err
}

func (s *NotificationsService) UpdateSeen(seenAt string) error {
	ctx := context.Background()
	return s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		return bsky.NotificationUpdateSeen(ctx, c, &bsky.NotificationUpdateSeen_Input{
			SeenAt: seenAt,
		})
	})
}

func (s *NotificationsService) GetUnreadCount() (int64, error) {
	ctx := context.Background()
	var count int64
	err := s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		res, err := bsky.NotificationGetUnreadCount(ctx, c, false, "")
		if err != nil {
			return err
		}
		if res != nil {
			count = res.Count
		}
		return nil
	})
	return count, err
}
