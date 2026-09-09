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

func (s *NotificationsService) PutActivitySubscription(subject string, post bool, reply bool) (*ActivitySubscriptionDTO, error) {
	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()
	var out *ActivitySubscriptionDTO
	err := s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		res, err := bsky.NotificationPutActivitySubscription(ctx, c, &bsky.NotificationPutActivitySubscription_Input{
			Subject: subject,
			ActivitySubscription: &bsky.NotificationDefs_ActivitySubscription{
				Post:  post,
				Reply: reply,
			},
		})
		if err != nil {
			return err
		}
		if res != nil && res.ActivitySubscription != nil {
			out = &ActivitySubscriptionDTO{
				Post:  res.ActivitySubscription.Post,
				Reply: res.ActivitySubscription.Reply,
			}
		} else {
			out = &ActivitySubscriptionDTO{
				Post:  post,
				Reply: reply,
			}
		}
		return nil
	})
	return out, err
}

func mapFilterablePrefToDTO(pref *bsky.NotificationDefs_FilterablePreference) *NotificationFilterablePrefDTO {
	if pref == nil {
		return &NotificationFilterablePrefDTO{Include: "all", List: true, Push: true}
	}
	include := pref.Include
	if include == "" {
		include = "all"
	}
	return &NotificationFilterablePrefDTO{
		Include: include,
		List:    pref.List,
		Push:    pref.Push,
	}
}

func mapChatPrefToDTO(pref *bsky.NotificationDefs_ChatPreference) *NotificationChatPrefDTO {
	if pref == nil {
		return &NotificationChatPrefDTO{Include: "all", Push: true}
	}
	include := pref.Include
	if include == "" {
		include = "all"
	}
	return &NotificationChatPrefDTO{
		Include: include,
		Push:    pref.Push,
	}
}

func mapSimplePrefToDTO(pref *bsky.NotificationDefs_Preference) *NotificationSimplePrefDTO {
	if pref == nil {
		return &NotificationSimplePrefDTO{List: true, Push: true}
	}
	return &NotificationSimplePrefDTO{
		List: pref.List,
		Push: pref.Push,
	}
}

func mapDTOToFilterablePref(dto *NotificationFilterablePrefDTO) *bsky.NotificationDefs_FilterablePreference {
	if dto == nil {
		return nil
	}
	include := dto.Include
	if include == "" {
		include = "all"
	}
	return &bsky.NotificationDefs_FilterablePreference{
		Include: include,
		List:    dto.List,
		Push:    dto.Push,
	}
}

func mapDTOToChatPref(dto *NotificationChatPrefDTO) *bsky.NotificationDefs_ChatPreference {
	if dto == nil {
		return nil
	}
	include := dto.Include
	if include == "" {
		include = "all"
	}
	return &bsky.NotificationDefs_ChatPreference{
		Include: include,
		Push:    dto.Push,
	}
}

func mapDTOToSimplePref(dto *NotificationSimplePrefDTO) *bsky.NotificationDefs_Preference {
	if dto == nil {
		return nil
	}
	return &bsky.NotificationDefs_Preference{
		List: dto.List,
		Push: dto.Push,
	}
}

func (s *NotificationsService) GetNotificationPreferences() (*NotificationPreferencesDTO, error) {
	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()
	var out *NotificationPreferencesDTO
	err := s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		res, err := bsky.NotificationGetPreferences(ctx, c)
		if err != nil {
			return err
		}

		priority := false
		notifListRes, listErr := bsky.NotificationListNotifications(ctx, c, "", 1, false, nil, "")
		if listErr == nil && notifListRes != nil && notifListRes.Priority != nil {
			priority = *notifListRes.Priority
		}

		p := res.Preferences
		if p == nil {
			p = &bsky.NotificationDefs_Preferences{}
		}

		out = &NotificationPreferencesDTO{
			Priority:          priority,
			Chat:              mapChatPrefToDTO(p.Chat),
			Follow:            mapFilterablePrefToDTO(p.Follow),
			Like:              mapFilterablePrefToDTO(p.Like),
			LikeViaRepost:     mapFilterablePrefToDTO(p.LikeViaRepost),
			Mention:           mapFilterablePrefToDTO(p.Mention),
			Quote:             mapFilterablePrefToDTO(p.Quote),
			Reply:             mapFilterablePrefToDTO(p.Reply),
			Repost:            mapFilterablePrefToDTO(p.Repost),
			RepostViaRepost:   mapFilterablePrefToDTO(p.RepostViaRepost),
			StarterpackJoined: mapSimplePrefToDTO(p.StarterpackJoined),
			SubscribedPost:    mapSimplePrefToDTO(p.SubscribedPost),
			Unverified:        mapSimplePrefToDTO(p.Unverified),
			Verified:          mapSimplePrefToDTO(p.Verified),
		}
		return nil
	})
	return out, err
}

func (s *NotificationsService) PutNotificationPreferences(input *NotificationPreferencesDTO) (*NotificationPreferencesDTO, error) {
	if input == nil {
		return nil, nil
	}
	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()

	err := s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		v2Input := &bsky.NotificationPutPreferencesV2_Input{
			Chat:              mapDTOToChatPref(input.Chat),
			Follow:            mapDTOToFilterablePref(input.Follow),
			Like:              mapDTOToFilterablePref(input.Like),
			LikeViaRepost:     mapDTOToFilterablePref(input.LikeViaRepost),
			Mention:           mapDTOToFilterablePref(input.Mention),
			Quote:             mapDTOToFilterablePref(input.Quote),
			Reply:             mapDTOToFilterablePref(input.Reply),
			Repost:            mapDTOToFilterablePref(input.Repost),
			RepostViaRepost:   mapDTOToFilterablePref(input.RepostViaRepost),
			StarterpackJoined: mapDTOToSimplePref(input.StarterpackJoined),
			SubscribedPost:    mapDTOToSimplePref(input.SubscribedPost),
			Unverified:        mapDTOToSimplePref(input.Unverified),
			Verified:          mapDTOToSimplePref(input.Verified),
		}

		_, err := bsky.NotificationPutPreferencesV2(ctx, c, v2Input)
		if err != nil {
			return err
		}

		_ = bsky.NotificationPutPreferences(ctx, c, &bsky.NotificationPutPreferences_Input{
			Priority: input.Priority,
		})

		return nil
	})

	if err != nil {
		return nil, err
	}
	return input, nil
}


