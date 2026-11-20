package services

import (
	"encoding/json"
	"strings"
	"sync"

	"github.com/bluesky-social/indigo/api/atproto"
	"github.com/bluesky-social/indigo/api/bsky"
	"github.com/bluesky-social/indigo/lex/util"
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

func notificationMatchesFilters(item *bsky.NotificationListNotifications_Notification, reasonSet map[string]bool, priority bool) bool {
	if item == nil {
		return false
	}
	if len(reasonSet) > 0 && !reasonSet[item.Reason] {
		return false
	}
	if priority {
		switch item.Reason {
		case "verified", "unverified", "subscribed-post", "contact-match":
			return true
		}
		if item.Author == nil || item.Author.Viewer == nil || item.Author.Viewer.Following == nil || *item.Author.Viewer.Following == "" {
			return false
		}
	}
	return true
}

func (s *NotificationsService) GetNotifications(cursor string) (*NotificationListDTO, error) {
	return s.GetNotificationsFiltered(cursor, nil, false)
}

func (s *NotificationsService) GetNotificationsFiltered(cursor string, reasons []string, priority bool) (*NotificationListDTO, error) {
	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()
	var out *NotificationListDTO
	err := s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		reasonSet := make(map[string]bool, len(reasons))
		for _, r := range reasons {
			if r != "" {
				reasonSet[r] = true
			}
		}

		maxPages := 1
		if len(reasonSet) > 0 || priority {
			maxPages = 3
		}

		var matched []*bsky.NotificationListNotifications_Notification
		currentCursor := cursor
		nextCursor := ""

		for page := 0; page < maxPages; page++ {
			res, err := bsky.NotificationListNotifications(ctx, c, currentCursor, 50, priority, reasons, "")
			if err != nil {
				return err
			}
			nextCursor = safeString(res.Cursor)
			for _, item := range res.Notifications {
				if notificationMatchesFilters(item, reasonSet, priority) {
					matched = append(matched, item)
				}
			}
			if len(matched) > 0 || nextCursor == "" || nextCursor == currentCursor {
				break
			}
			currentCursor = nextCursor
		}

		out = &NotificationListDTO{
			Cursor:        nextCursor,
			Notifications: []*NotificationDTO{},
		}

		var postUris []string
		for _, item := range matched {
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
			var (
				postMu sync.Mutex
				postWG sync.WaitGroup
			)
			for i := 0; i < len(postUris); i += 25 {
				end := i + 25
				if end > len(postUris) {
					end = len(postUris)
				}
				chunk := postUris[i:end]
				postWG.Add(1)
				go func(uris []string) {
					defer postWG.Done()
					postRes, err := bsky.FeedGetPosts(ctx, c, uris)
					if err != nil || postRes == nil {
						return
					}
					preResolvePostViewCaptionHosts(postRes.Posts)
					parsed := make([]*PostDTO, 0, len(postRes.Posts))
					for _, p := range postRes.Posts {
						if dto := ParsePostView(p); dto != nil {
							parsed = append(parsed, dto)
						}
					}
					postMu.Lock()
					for _, dto := range parsed {
						postViews[dto.URI] = dto
					}
					postMu.Unlock()
				}(chunk)
			}
			postWG.Wait()
		}

		for _, item := range matched {
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

func (s *NotificationsService) ListActivitySubscriptions(cursor string) (*ProfileListDTO, error) {
	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()
	out := &ProfileListDTO{Profiles: []*ProfileDTO{}}
	err := s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		res, err := bsky.NotificationListActivitySubscriptions(ctx, c, cursor, 50)
		if err != nil {
			return err
		}
		out.Cursor = safeString(res.Cursor)
		for _, sub := range res.Subscriptions {
			if p := ParseProfileView(sub); p != nil {
				out.Profiles = append(out.Profiles, p)
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

func (s *NotificationsService) GetNotificationDeclaration() (string, error) {
	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()
	allowSubs := "followers"
	err := s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		raw, err := getOwnRecordJSON(ctx, c, "app.bsky.notification.declaration", "self")
		if err != nil || raw == nil {
			return err
		}
		var rec bsky.NotificationDeclaration
		if err := json.Unmarshal(raw, &rec); err != nil {
			return err
		}
		if rec.AllowSubscriptions != "" {
			allowSubs = rec.AllowSubscriptions
		}
		return nil
	})
	return allowSubs, err
}

func (s *NotificationsService) UpdateNotificationDeclaration(allowSubscriptions string) error {
	val := strings.TrimSpace(allowSubscriptions)
	switch val {
	case "followers", "mutuals", "none":
	default:
		val = "followers"
	}
	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()
	return s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		rec := &bsky.NotificationDeclaration{
			LexiconTypeID:      "app.bsky.notification.declaration",
			AllowSubscriptions: val,
		}
		_, err := atproto.RepoPutRecord(ctx, c, &atproto.RepoPutRecord_Input{
			Collection: "app.bsky.notification.declaration",
			Repo:       c.Auth.Did,
			Rkey:       "self",
			Record:     &util.LexiconTypeDecoder{Val: rec},
		})
		return err
	})
}

func (s *NotificationsService) GetGroupedNotifications(cursor string, feed string) (*NotificationListDTO, error) {
	if feed == "" {
		feed = "all"
	}
	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()
	var out *NotificationListDTO
	err := s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		res, err := bsky.NotificationGetGroupedNotifications(ctx, c, cursor, feed, 30)
		if err != nil || res == nil {
			return err
		}
		profileMap := make(map[string]*bsky.ActorDefs_ProfileViewDetailed)
		postMap := make(map[string]*PostDTO)
		for _, rv := range res.RelatedViews {
			if rv == nil {
				continue
			}
			if rv.ActorDefs_ProfileViewDetailed != nil {
				p := rv.ActorDefs_ProfileViewDetailed
				profileMap[p.Did] = p
				CacheAuthor(p.Did, p.Handle, safeString(p.DisplayName))
			}
			if rv.FeedDefs_PostView != nil {
				if dto := ParsePostView(rv.FeedDefs_PostView); dto != nil {
					postMap[dto.URI] = dto
				}
			}
		}

		resolveActor := func(did string) (string, string) {
			if p, ok := profileMap[did]; ok {
				return p.Handle, safeString(p.DisplayName)
			}
			if a, ok := GetAuthorForDID(did); ok {
				return a.Handle, a.DisplayName
			}
			return did, ""
		}

		out = &NotificationListDTO{
			Cursor:        safeString(res.Cursor),
			Notifications: []*NotificationDTO{},
		}

		for _, g := range res.Groups {
			if g == nil || g.Kind == nil {
				continue
			}
			k := g.Kind
			switch {
			case k.NotificationGetGroupedNotifications_LikeGroup != nil:
				lg := k.NotificationGetGroupedNotifications_LikeGroup
				p := postMap[lg.Post]
				for _, item := range lg.Items {
					if item == nil {
						continue
					}
					handle, name := resolveActor(item.Actor)
					nd := &NotificationDTO{
						URI:           g.Id,
						AuthorDID:     item.Actor,
						AuthorHandle:  handle,
						AuthorName:    name,
						Reason:        "like",
						ReasonSubject: lg.Post,
						IndexedAt:     g.IndexedAt,
						HydratedPost:  p,
					}
					if p != nil {
						nd.Text = p.Text
						nd.HasMedia = p.HasMedia
						nd.Video = p.Video
					}
					out.Notifications = append(out.Notifications, nd)
				}
			case k.NotificationGetGroupedNotifications_RepostGroup != nil:
				rg := k.NotificationGetGroupedNotifications_RepostGroup
				p := postMap[rg.Post]
				for _, item := range rg.Items {
					if item == nil {
						continue
					}
					handle, name := resolveActor(item.Actor)
					nd := &NotificationDTO{
						URI:           g.Id,
						AuthorDID:     item.Actor,
						AuthorHandle:  handle,
						AuthorName:    name,
						Reason:        "repost",
						ReasonSubject: rg.Post,
						IndexedAt:     g.IndexedAt,
						HydratedPost:  p,
					}
					if p != nil {
						nd.Text = p.Text
						nd.HasMedia = p.HasMedia
						nd.Video = p.Video
					}
					out.Notifications = append(out.Notifications, nd)
				}
			case k.NotificationGetGroupedNotifications_FollowGroup != nil:
				fg := k.NotificationGetGroupedNotifications_FollowGroup
				for _, item := range fg.Items {
					if item == nil {
						continue
					}
					handle, name := resolveActor(item.Actor)
					out.Notifications = append(out.Notifications, &NotificationDTO{
						URI:          g.Id,
						AuthorDID:    item.Actor,
						AuthorHandle: handle,
						AuthorName:   name,
						Reason:       "follow",
						IndexedAt:    g.IndexedAt,
					})
				}
			case k.NotificationGetGroupedNotifications_ReplyNotification != nil:
				rn := k.NotificationGetGroupedNotifications_ReplyNotification
				p := postMap[rn.Post]
				nd := &NotificationDTO{
					URI:            rn.Post,
					Reason:         "reply",
					ReasonSubject:  rn.Parent,
					ReplyParentURI: rn.Parent,
					IndexedAt:      g.IndexedAt,
					HydratedPost:   p,
				}
				if p != nil {
					nd.CID = p.CID
					nd.AuthorDID = p.AuthorDID
					nd.AuthorHandle = p.AuthorHandle
					nd.AuthorName = p.AuthorName
					nd.Text = p.Text
					nd.HasMedia = p.HasMedia
					nd.Video = p.Video
				}
				if parentPost := postMap[rn.Parent]; parentPost != nil {
					nd.ReplyParentAuthorDID = parentPost.AuthorDID
					nd.ReplyParentAuthorHandle = parentPost.AuthorHandle
					nd.ReplyParentAuthorName = parentPost.AuthorName
				}
				out.Notifications = append(out.Notifications, nd)
			case k.NotificationGetGroupedNotifications_MentionNotification != nil:
				mn := k.NotificationGetGroupedNotifications_MentionNotification
				p := postMap[mn.Post]
				nd := &NotificationDTO{
					URI:          mn.Post,
					Reason:       "mention",
					IndexedAt:    g.IndexedAt,
					HydratedPost: p,
				}
				if p != nil {
					nd.CID = p.CID
					nd.AuthorDID = p.AuthorDID
					nd.AuthorHandle = p.AuthorHandle
					nd.AuthorName = p.AuthorName
					nd.Text = p.Text
					nd.HasMedia = p.HasMedia
					nd.Video = p.Video
				}
				out.Notifications = append(out.Notifications, nd)
			case k.NotificationGetGroupedNotifications_QuoteNotification != nil:
				qn := k.NotificationGetGroupedNotifications_QuoteNotification
				p := postMap[qn.Post]
				nd := &NotificationDTO{
					URI:           qn.Post,
					Reason:        "quote",
					ReasonSubject: safeString(qn.Parent),
					IndexedAt:     g.IndexedAt,
					HydratedPost:  p,
				}
				if p != nil {
					nd.CID = p.CID
					nd.AuthorDID = p.AuthorDID
					nd.AuthorHandle = p.AuthorHandle
					nd.AuthorName = p.AuthorName
					nd.Text = p.Text
					nd.HasMedia = p.HasMedia
					nd.Video = p.Video
				}
				out.Notifications = append(out.Notifications, nd)
			}
		}
		return nil
	})
	if err != nil {
		return s.GetNotifications(cursor)
	}
	return out, nil
}


