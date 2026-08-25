package services

import (
	"github.com/bluesky-social/indigo/api/bsky"
	"github.com/bluesky-social/indigo/xrpc"
)

type NotificationsService struct {
	clientMgr *ATClient
}

func NewNotificationsService(clientMgr *ATClient) *NotificationsService {
	return &NotificationsService{clientMgr: clientMgr}
}

// reasonUsesReasonSubject reports whether the post to show for a notification is
// the one in reasonSubject. The "-via-repost" reasons fire when someone likes or
// reposts a post through a repost of ours, and point at the original post too.
func reasonUsesReasonSubject(reason string) bool {
	switch reason {
	case "like", "repost", "like-via-repost", "repost-via-repost":
		return true
	}
	return false
}

// reasonUsesOwnURI reports whether the notification's own uri is the post to show.
func reasonUsesOwnURI(reason string) bool {
	switch reason {
	case "reply", "quote", "mention", "subscribed-post":
		return true
	}
	return false
}

func (s *NotificationsService) GetNotifications(cursor string) (*NotificationListDTO, error) {
	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()
	var out *NotificationListDTO
	err := s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		res, err := bsky.NotificationListNotifications(ctx, c, cursor, 50, false, nil, "")
		if err != nil {
			return err
		}
		
		out = &NotificationListDTO{Cursor: safeString(res.Cursor)}
		
		var postUris []string
		for _, item := range res.Notifications {
			if reasonUsesReasonSubject(item.Reason) && item.ReasonSubject != nil {
				postUris = append(postUris, *item.ReasonSubject)
				if item.Record != nil {
					if subjURI := ParseRepostSubjectURI(item.Record.Val); subjURI != "" {
						postUris = append(postUris, subjURI)
					}
				}
			} else if reasonUsesOwnURI(item.Reason) {
				postUris = append(postUris, item.Uri)
				if (item.Reason == "quote" || item.Reason == "reply") && item.ReasonSubject != nil && *item.ReasonSubject != "" {
					postUris = append(postUris, *item.ReasonSubject)
				}
				if item.Reason == "reply" && item.Record != nil {
					if isReply, parentURI, _, _, _ := ExtractReplyMetaFromRecord(item.Record.Val); isReply && parentURI != "" {
						postUris = append(postUris, parentURI)
					}
				}
			}
		}

		// The same post can be referenced by several notifications (and a reply's
		// reasonSubject often is its parent), so collapse duplicates before
		// spending them against the 25-per-call batch budget.
		if len(postUris) > 1 {
			seen := make(map[string]bool, len(postUris))
			unique := postUris[:0]
			for _, uri := range postUris {
				if uri == "" || seen[uri] {
					continue
				}
				seen[uri] = true
				unique = append(unique, uri)
			}
			postUris = unique
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
			var hydratedPost *PostDTO
			
			if reasonUsesReasonSubject(item.Reason) && item.ReasonSubject != nil {
				if view, ok := postViews[*item.ReasonSubject]; ok {
					hydratedPost = view
				} else if item.Record != nil {
					if subjURI := ParseRepostSubjectURI(item.Record.Val); subjURI != "" {
						if viewSubj, okSubj := postViews[subjURI]; okSubj {
							hydratedPost = viewSubj
						}
					}
				}
			} else if reasonUsesOwnURI(item.Reason) {
				if view, ok := postViews[item.Uri]; ok {
					hydratedPost = view
				}
			}
			
			if hydratedPost != nil {
				text = hydratedPost.Text
				hasMedia = hydratedPost.HasMedia
				video = hydratedPost.Video
			}
			
			if text == "" && item.Record != nil {
				text = ParseFeedPost(item.Record.Val)
			}
			
			if text == "" && item.Reason == "repost" {
				text = ""
			}

			var replyParentURI, replyParentDID, replyParentHandle, replyParentName string
			if item.Reason == "reply" && item.Record != nil {
				if isReply, parentURI, parentDID, _, _ := ExtractReplyMetaFromRecord(item.Record.Val); isReply && parentURI != "" {
					replyParentURI = parentURI
					replyParentDID = parentDID
					if pv, ok := postViews[parentURI]; ok && pv != nil {
						replyParentDID = pv.AuthorDID
						replyParentHandle = pv.AuthorHandle
						replyParentName = pv.AuthorName
					} else if author, ok := GetAuthorForDID(parentDID); ok {
						replyParentHandle = author.Handle
						replyParentName = author.DisplayName
					}
				}
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
				AuthorDID:         item.Author.Did,
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
				HydratedPost:      hydratedPost,
				ReplyParentURI:          replyParentURI,
				ReplyParentAuthorDID:    replyParentDID,
				ReplyParentAuthorHandle: replyParentHandle,
				ReplyParentAuthorName:   replyParentName,
			})
		}
		
		return nil
	})
	return out, err
}

func (s *NotificationsService) UpdateSeen(seenAt string) error {
	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()
	return s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		return bsky.NotificationUpdateSeen(ctx, c, &bsky.NotificationUpdateSeen_Input{
			SeenAt: seenAt,
		})
	})
}

func (s *NotificationsService) GetUnreadCount() (int64, error) {
	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()
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
