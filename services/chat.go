package services

import (
	"context"
	"encoding/json"
	"strings"

	"github.com/bluesky-social/indigo/api/atproto"
	"github.com/bluesky-social/indigo/api/chat"
	"github.com/bluesky-social/indigo/lex/util"
	"github.com/bluesky-social/indigo/xrpc"
)

type ChatService struct {
	clientMgr *ATClient
}

func NewChatService(clientMgr *ATClient) *ChatService {
	return &ChatService{clientMgr: clientMgr}
}

func chatClient(c *xrpc.Client) *xrpc.Client {
	return &xrpc.Client{
		Client: c.Client,
		Host:   "https://api.bsky.chat",
		Auth:   c.Auth,
	}
}

func parseConvoView(convo *chat.ConvoDefs_ConvoView, cursor string) *ChatConvoDTO {
	if convo == nil {
		return nil
	}
	lastMsg := ""
	if convo.LastMessage != nil && convo.LastMessage.ConvoDefs_MessageView != nil {
		lastMsg = convo.LastMessage.ConvoDefs_MessageView.Text
	}
	var members []ChatMemberDTO
	for _, m := range convo.Members {
		if m == nil {
			continue
		}
		dispName := ""
		if m.DisplayName != nil {
			dispName = *m.DisplayName
		}
		avatar := ""
		if m.Avatar != nil {
			avatar = *m.Avatar
		}
		members = append(members, ChatMemberDTO{
			DID:         m.Did,
			Handle:      m.Handle,
			DisplayName: dispName,
			Avatar:      avatar,
		})
	}
	dto := &ChatConvoDTO{
		ID:          convo.Id,
		Rev:         convo.Rev,
		Members:     members,
		LastMessage: lastMsg,
		UnreadCount: convo.UnreadCount,
		Muted:       convo.Muted,
		Cursor:      cursor,
	}
	if convo.Kind != nil && convo.Kind.ConvoDefs_GroupConvo != nil {
		gc := convo.Kind.ConvoDefs_GroupConvo
		dto.IsGroup = true
		dto.GroupName = gc.Name
		dto.MemberCount = gc.MemberCount
		dto.MemberLimit = gc.MemberLimit
		if gc.LockStatus != nil {
			dto.LockStatus = *gc.LockStatus
		}
		if gc.JoinRequestCount != nil {
			dto.JoinRequestCount = *gc.JoinRequestCount
		}
		if gc.UnreadJoinRequestCount != nil {
			dto.UnreadJoinRequestCount = *gc.UnreadJoinRequestCount
		}
		if gc.JoinLink != nil {
			dto.JoinLinkCode = gc.JoinLink.Code
			dto.JoinLinkRequireApproval = gc.JoinLink.RequireApproval
			dto.JoinLinkEnabled = gc.JoinLink.EnabledStatus != nil && *gc.JoinLink.EnabledStatus == "enabled"
		}
	}
	return dto
}

func (s *ChatService) ListConvos(cursor string) ([]*ChatConvoDTO, error) {
	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()
	var out []*ChatConvoDTO
	err := s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		cc := chatClient(c)

		res, err := chat.ConvoListConvos(ctx, cc, cursor, "", 100, "", "", "")
		if err != nil {
			return err
		}

		cur := safeString(res.Cursor)
		for _, convo := range res.Convos {
			if dto := parseConvoView(convo, cur); dto != nil {
				out = append(out, dto)
			}
		}
		return nil
	})
	return out, err
}

func (s *ChatService) GetMessages(convoId string, cursor string) (*ChatMessagesDTO, error) {
	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()
	var out *ChatMessagesDTO
	err := s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		chatClient := &xrpc.Client{
			Client: c.Client,
			Host:   "https://api.bsky.chat",
			Auth:   c.Auth,
		}

		convoRes, _ := chat.ConvoGetConvo(ctx, chatClient, convoId)
		type memberInfo struct {
			handle      string
			displayName string
		}
		memberMap := make(map[string]memberInfo)
		if convoRes != nil && convoRes.Convo != nil {
			for _, m := range convoRes.Convo.Members {
				dispName := ""
				if m.DisplayName != nil && *m.DisplayName != "" {
					dispName = *m.DisplayName
				}
				memberMap[m.Did] = memberInfo{
					handle:      m.Handle,
					displayName: dispName,
				}
			}
		}

		var rawRes struct {
			Cursor   string                   `json:"cursor"`
			Messages []map[string]interface{} `json:"messages"`
		}

		params := map[string]interface{}{
			"convoId": convoId,
			"limit":   100,
		}
		if cursor != "" {
			params["cursor"] = cursor
		}

		if err := chatClient.Do(ctx, xrpc.Query, "", "chat.bsky.convo.getMessages", params, nil, &rawRes); err != nil {
			return err
		}

		out = &ChatMessagesDTO{Cursor: safeString(&rawRes.Cursor)}

		// First pass: map message IDs to text for resolving replies within the same batch
		type msgMeta struct {
			text      string
			senderDid string
		}
		msgMap := make(map[string]msgMeta)
		for _, rawMsg := range rawRes.Messages {
			if typeVal, ok := rawMsg["$type"].(string); ok && typeVal == "chat.bsky.convo.defs#messageView" {
				if id, ok := rawMsg["id"].(string); ok {
					text, _ := rawMsg["text"].(string)
					senderDid := ""
					if sMap, ok := rawMsg["sender"].(map[string]interface{}); ok {
						senderDid, _ = sMap["did"].(string)
					}
					msgMap[id] = msgMeta{text: text, senderDid: senderDid}
				}
			}
		}

		for _, rawMsg := range rawRes.Messages {
			if typeVal, ok := rawMsg["$type"].(string); ok && typeVal == "chat.bsky.convo.defs#messageView" {
				id, _ := rawMsg["id"].(string)
				rev, _ := rawMsg["rev"].(string)
				text, _ := rawMsg["text"].(string)
				sentAt, _ := rawMsg["sentAt"].(string)

				senderName := "Unknown"
				senderDid := ""
				senderHandle := ""
				senderDisplayName := ""
				if senderMap, ok := rawMsg["sender"].(map[string]interface{}); ok {
					if did, ok := senderMap["did"].(string); ok {
						senderDid = did
						if info, ok := memberMap[senderDid]; ok {
							senderHandle = info.handle
							senderDisplayName = info.displayName
							if info.displayName != "" {
								senderName = info.displayName
							} else {
								senderName = info.handle
							}
						} else if senderDid == c.Auth.Did {
							senderName = "Me"
						} else {
							senderName = did
						}
					}
				}

				embedUri := ""
				if embedMap, ok := rawMsg["embed"].(map[string]interface{}); ok {
					if recView, ok := embedMap["record"].(map[string]interface{}); ok {
						if uri, ok := recView["uri"].(string); ok {
							embedUri = uri
						} else if innerRec, ok := recView["record"].(map[string]interface{}); ok {
							if uri, ok := innerRec["uri"].(string); ok {
								embedUri = uri
							}
						}
					} else if extView, ok := embedMap["external"].(map[string]interface{}); ok {
						if uri, ok := extView["uri"].(string); ok {
							embedUri = uri
						}
					}
				}

				// Native replyTo field (official API)
				replyToMessageId := ""
				replyToText := ""
				replyToSender := ""
				replyToSenderDid := ""
				replyToSenderHandle := ""
				replyToSenderDisplayName := ""
				if replyToMap, ok := rawMsg["replyTo"].(map[string]interface{}); ok {
					if parentId, ok := replyToMap["id"].(string); ok {
						replyToMessageId = parentId
						if parentText, ok := replyToMap["text"].(string); ok {
							replyToText = parentText
						} else if meta, found := msgMap[parentId]; found {
							replyToText = meta.text
						}
						if sMap, ok := replyToMap["sender"].(map[string]interface{}); ok {
							if did, ok := sMap["did"].(string); ok {
								replyToSenderDid = did
								if info, found := memberMap[did]; found {
									replyToSenderHandle = info.handle
									replyToSenderDisplayName = info.displayName
									if info.displayName != "" {
										replyToSender = info.displayName
									} else {
										replyToSender = info.handle
									}
								} else if did == c.Auth.Did {
									replyToSender = "Me"
								} else {
									replyToSender = did
								}
							}
						}
					}
				}

				// Parse reactions
				var reactions []ChatReactionDTO
				if rawReactions, ok := rawMsg["reactions"].([]interface{}); ok {
					for _, r := range rawReactions {
						if rMap, ok := r.(map[string]interface{}); ok {
							value, _ := rMap["value"].(string)
							senderDidR := ""
							if sMap, ok := rMap["sender"].(map[string]interface{}); ok {
								senderDidR, _ = sMap["did"].(string)
							}
							if value != "" {
								reactions = append(reactions, ChatReactionDTO{
									Value:     value,
									SenderDID: senderDidR,
									IsMine:    senderDidR == c.Auth.Did,
								})
							}
						}
					}
				}

				out.Messages = append(out.Messages, &ChatMessageDTO{
					ID:                        id,
					Rev:                       rev,
					Sender:                    senderName,
					SenderDID:                 senderDid,
					SenderHandle:              senderHandle,
					SenderDisplayName:         senderDisplayName,
					Text:                      text,
					SentAt:                    sentAt,
					EmbedURI:                  embedUri,
					ReplyToMessageID:          replyToMessageId,
					ReplyToMessageText:        replyToText,
					ReplyToSender:             replyToSender,
					ReplyToSenderDID:          replyToSenderDid,
					ReplyToSenderHandle:       replyToSenderHandle,
					ReplyToSenderDisplayName:  replyToSenderDisplayName,
					Reactions:                 reactions,
				})
			}
		}
		return nil
	})
	return out, err
}


func (s *ChatService) SendMessage(convoId string, text string) error {
	return s.sendMessageRaw(convoId, text, "", "", "", "")
}

func (s *ChatService) SendMessageWithGif(convoId string, text string, gifUrl string) error {
	return s.sendMessageRaw(convoId, text, gifUrl, "", "", "")
}

func (s *ChatService) SendReply(convoId string, replyToMessageId string, text string, gifUrl string) error {
	return s.sendMessageRaw(convoId, text, gifUrl, replyToMessageId, "", "")
}

func (s *ChatService) SendMessageWithEmbed(convoId string, text string, embedUri string, embedCid string) error {
	return s.sendMessageRaw(convoId, text, "", "", embedUri, embedCid)
}

func (s *ChatService) sendMessageRaw(convoId string, text string, gifUrl string, replyToMessageId string, embedUri string, embedCid string) error {
	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()
	err := s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		cc := chatClient(c)

		finalText := text
		if gifUrl != "" {
			if finalText != "" {
				finalText += "\n\n" + gifUrl
			} else {
				finalText = gifUrl
			}
		}

		msgPayload := map[string]interface{}{
			"text": finalText,
		}
		if facets := ParseFacets(ctx, c, finalText); len(facets) > 0 {
			msgPayload["facets"] = facets
		}
		if replyToMessageId != "" {
			msgPayload["replyTo"] = map[string]interface{}{
				"messageId": replyToMessageId,
			}
		}
		if embedUri != "" && embedCid != "" {
			msgPayload["embed"] = map[string]interface{}{
				"$type": "app.bsky.embed.record",
				"record": map[string]interface{}{
					"uri": embedUri,
					"cid": embedCid,
				},
			}
		}

		input := map[string]interface{}{
			"convoId": convoId,
			"message": msgPayload,
		}

		var out interface{}
		return cc.Do(ctx, xrpc.Procedure, "application/json", "chat.bsky.convo.sendMessage", nil, input, &out)
	})
	return err
}

func (s *ChatService) AddReaction(convoId string, messageId string, emoji string) error {
	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()
	return s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		cc := chatClient(c)
		_, err := chat.ConvoAddReaction(ctx, cc, &chat.ConvoAddReaction_Input{
			ConvoId:   convoId,
			MessageId: messageId,
			Value:     emoji,
		})
		return err
	})
}

func (s *ChatService) RemoveReaction(convoId string, messageId string, emoji string) error {
	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()
	return s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		cc := chatClient(c)
		_, err := chat.ConvoRemoveReaction(ctx, cc, &chat.ConvoRemoveReaction_Input{
			ConvoId:   convoId,
			MessageId: messageId,
			Value:     emoji,
		})
		return err
	})
}

func (s *ChatService) UpdateReadStatus(convoId string, messageId string) error {
	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()
	return s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		cc := chatClient(c)

		_, err := chat.ConvoUpdateRead(ctx, cc, &chat.ConvoUpdateRead_Input{
			ConvoId:   convoId,
			MessageId: &messageId,
		})
		return err
	})
}

func (s *ChatService) UpdateAllRead() (int64, error) {
	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()
	var updated int64
	err := s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		cc := chatClient(c)
		res, err := chat.ConvoUpdateAllRead(ctx, cc, &chat.ConvoUpdateAllRead_Input{})
		if err != nil {
			return err
		}
		if res != nil {
			updated = res.UpdatedCount
		}
		return nil
	})
	return updated, err
}

func (s *ChatService) GetUnreadCount() (int64, error) {
	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()
	var count int64
	err := s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		cc := chatClient(c)

		res, err := chat.ConvoListConvos(ctx, cc, "", "", 50, "", "", "")
		if err != nil {
			return err
		}
		for _, convo := range res.Convos {
			count += convo.UnreadCount
		}
		return nil
	})
	return count, err
}

func (s *ChatService) MuteConvo(convoId string) error {
	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()
	return s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		cc := chatClient(c)

		_, err := chat.ConvoMuteConvo(ctx, cc, &chat.ConvoMuteConvo_Input{
			ConvoId: convoId,
		})
		return err
	})
}

func (s *ChatService) UnmuteConvo(convoId string) error {
	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()
	return s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		cc := chatClient(c)

		_, err := chat.ConvoUnmuteConvo(ctx, cc, &chat.ConvoUnmuteConvo_Input{
			ConvoId: convoId,
		})
		return err
	})
}

func (s *ChatService) LeaveConvo(convoId string) error {
	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()
	return s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		cc := chatClient(c)

		_, err := chat.ConvoLeaveConvo(ctx, cc, &chat.ConvoLeaveConvo_Input{
			ConvoId: convoId,
		})
		return err
	})
}

func (s *ChatService) GetConvoForMembers(dids []string) (*ChatConvoDTO, error) {
	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()
	var out *ChatConvoDTO
	err := s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		cc := chatClient(c)
		resolved, err := s.resolveActorsWithClient(ctx, c, dids)
		if err != nil {
			return err
		}

		res, err := chat.ConvoGetConvoForMembers(ctx, cc, resolved)
		if err != nil {
			return err
		}

		out = parseConvoView(res.Convo, "")
		return nil
	})
	return out, err
}

func (s *ChatService) GetConvoAvailability(actorOrDid string) (*ChatAvailabilityDTO, error) {
	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()
	var out *ChatAvailabilityDTO
	err := s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		cc := chatClient(c)
		resolved, err := s.resolveActorsWithClient(ctx, c, []string{actorOrDid})
		if err != nil {
			return err
		}
		res, err := chat.ConvoGetConvoAvailability(ctx, cc, resolved)
		if err != nil {
			return err
		}
		out = &ChatAvailabilityDTO{
			CanChat: res.CanChat,
		}
		if res.Convo != nil {
			out.ConvoID = res.Convo.Id
			out.Convo = parseConvoView(res.Convo, "")
		}
		return nil
	})
	return out, err
}

func (s *ChatService) DeleteMessage(convoId string, messageId string) error {
	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()
	return s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		cc := chatClient(c)

		_, err := chat.ConvoDeleteMessageForSelf(ctx, cc, &chat.ConvoDeleteMessageForSelf_Input{
			ConvoId:   convoId,
			MessageId: messageId,
		})
		return err
	})
}

func (s *ChatService) GetChatDeclaration() (string, error) {
	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()
	allowIncoming := "following"
	err := s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		res, err := atproto.RepoGetRecord(ctx, c, "", "chat.bsky.actor.declaration", c.Auth.Did, "self")
		if err != nil {
			return nil
		}
		if res != nil && res.Value != nil {
			rawBytes, mErr := json.Marshal(res.Value)
			if mErr == nil {
				var decl struct {
					AllowIncoming string `json:"allowIncoming"`
				}
				if json.Unmarshal(rawBytes, &decl) == nil && decl.AllowIncoming != "" {
					allowIncoming = decl.AllowIncoming
				}
			}
		}
		return nil
	})
	return allowIncoming, err
}

func (s *ChatService) UpdateChatDeclaration(allowIncoming string) error {
	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()

	val := strings.TrimSpace(allowIncoming)
	if val != "all" && val != "following" && val != "none" {
		val = "following"
	}

	return s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		decl := &chat.ActorDeclaration{
			LexiconTypeID: "chat.bsky.actor.declaration",
			AllowIncoming: val,
		}
		_, err := atproto.RepoPutRecord(ctx, c, &atproto.RepoPutRecord_Input{
			Collection: "chat.bsky.actor.declaration",
			Repo:       c.Auth.Did,
			Rkey:       "self",
			Record:     &util.LexiconTypeDecoder{Val: decl},
		})
		return err
	})
}

func (s *ChatService) resolveActorsWithClient(ctx context.Context, c *xrpc.Client, actors []string) ([]string, error) {
	out := make([]string, 0, len(actors))
	for _, raw := range actors {
		trimmed := strings.TrimPrefix(strings.TrimSpace(raw), "@")
		if trimmed == "" {
			continue
		}
		if strings.HasPrefix(trimmed, "did:") {
			out = append(out, trimmed)
			continue
		}
		res, err := atproto.IdentityResolveHandle(ctx, c, trimmed)
		if err != nil {
			return nil, err
		}
		out = append(out, res.Did)
	}
	return out, nil
}

func (s *ChatService) CreateGroup(name string, memberActors []string) (*ChatConvoDTO, error) {
	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()
	var out *ChatConvoDTO
	err := s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		cc := chatClient(c)
		dids, err := s.resolveActorsWithClient(ctx, c, memberActors)
		if err != nil {
			return err
		}
		res, err := chat.GroupCreateGroup(ctx, cc, &chat.GroupCreateGroup_Input{
			Name:    strings.TrimSpace(name),
			Members: dids,
		})
		if err != nil {
			return err
		}
		out = parseConvoView(res.Convo, "")
		return nil
	})
	return out, err
}

func (s *ChatService) EditGroup(convoId string, name string) (*ChatConvoDTO, error) {
	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()
	var out *ChatConvoDTO
	err := s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		cc := chatClient(c)
		res, err := chat.GroupEditGroup(ctx, cc, &chat.GroupEditGroup_Input{
			ConvoId: convoId,
			Name:    strings.TrimSpace(name),
		})
		if err != nil {
			return err
		}
		out = parseConvoView(res.Convo, "")
		return nil
	})
	return out, err
}

func (s *ChatService) AddGroupMembers(convoId string, memberActors []string) (*ChatConvoDTO, error) {
	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()
	var out *ChatConvoDTO
	err := s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		cc := chatClient(c)
		dids, err := s.resolveActorsWithClient(ctx, c, memberActors)
		if err != nil {
			return err
		}
		res, err := chat.GroupAddMembers(ctx, cc, &chat.GroupAddMembers_Input{
			ConvoId: convoId,
			Members: dids,
		})
		if err != nil {
			return err
		}
		out = parseConvoView(res.Convo, "")
		return nil
	})
	return out, err
}

func (s *ChatService) RemoveGroupMembers(convoId string, memberActors []string) (*ChatConvoDTO, error) {
	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()
	var out *ChatConvoDTO
	err := s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		cc := chatClient(c)
		dids, err := s.resolveActorsWithClient(ctx, c, memberActors)
		if err != nil {
			return err
		}
		res, err := chat.GroupRemoveMembers(ctx, cc, &chat.GroupRemoveMembers_Input{
			ConvoId: convoId,
			Members: dids,
		})
		if err != nil {
			return err
		}
		out = parseConvoView(res.Convo, "")
		return nil
	})
	return out, err
}

func (s *ChatService) LockConvo(convoId string) (*ChatConvoDTO, error) {
	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()
	var out *ChatConvoDTO
	err := s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		cc := chatClient(c)
		res, err := chat.ConvoLockConvo(ctx, cc, &chat.ConvoLockConvo_Input{
			ConvoId: convoId,
		})
		if err != nil {
			return err
		}
		out = parseConvoView(res.Convo, "")
		return nil
	})
	return out, err
}

func (s *ChatService) UnlockConvo(convoId string) (*ChatConvoDTO, error) {
	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()
	var out *ChatConvoDTO
	err := s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		cc := chatClient(c)
		res, err := chat.ConvoUnlockConvo(ctx, cc, &chat.ConvoUnlockConvo_Input{
			ConvoId: convoId,
		})
		if err != nil {
			return err
		}
		out = parseConvoView(res.Convo, "")
		return nil
	})
	return out, err
}

func parseJoinLinkView(jl *chat.GroupDefs_JoinLinkView) *ChatGroupJoinLinkDTO {
	if jl == nil {
		return nil
	}
	return &ChatGroupJoinLinkDTO{
		Code:            jl.Code,
		CreatedAt:       jl.CreatedAt,
		EnabledStatus:   safeString(jl.EnabledStatus),
		JoinRule:        safeString(jl.JoinRule),
		RequireApproval: jl.RequireApproval,
	}
}

func (s *ChatService) CreateGroupJoinLink(convoId string, requireApproval bool) (*ChatGroupJoinLinkDTO, error) {
	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()
	var out *ChatGroupJoinLinkDTO
	err := s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		cc := chatClient(c)
		joinRule := "anyone"
		res, err := chat.GroupCreateJoinLink(ctx, cc, &chat.GroupCreateJoinLink_Input{
			ConvoId:         convoId,
			JoinRule:        &joinRule,
			RequireApproval: &requireApproval,
		})
		if err != nil {
			return err
		}
		out = parseJoinLinkView(res.JoinLink)
		return nil
	})
	return out, err
}

func (s *ChatService) EnableGroupJoinLink(convoId string) (*ChatGroupJoinLinkDTO, error) {
	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()
	var out *ChatGroupJoinLinkDTO
	err := s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		cc := chatClient(c)
		res, err := chat.GroupEnableJoinLink(ctx, cc, &chat.GroupEnableJoinLink_Input{
			ConvoId: convoId,
		})
		if err != nil {
			return err
		}
		out = parseJoinLinkView(res.JoinLink)
		return nil
	})
	return out, err
}

func (s *ChatService) DisableGroupJoinLink(convoId string) (*ChatGroupJoinLinkDTO, error) {
	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()
	var out *ChatGroupJoinLinkDTO
	err := s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		cc := chatClient(c)
		res, err := chat.GroupDisableJoinLink(ctx, cc, &chat.GroupDisableJoinLink_Input{
			ConvoId: convoId,
		})
		if err != nil {
			return err
		}
		out = parseJoinLinkView(res.JoinLink)
		return nil
	})
	return out, err
}

func (s *ChatService) ListGroupJoinRequests(convoId string, cursor string) (*ChatJoinRequestListDTO, error) {
	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()
	var out *ChatJoinRequestListDTO
	err := s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		cc := chatClient(c)
		res, err := chat.GroupListJoinRequests(ctx, cc, convoId, cursor, 50)
		if err != nil {
			return err
		}
		out = &ChatJoinRequestListDTO{
			Cursor: safeString(res.Cursor),
		}
		for _, r := range res.Requests {
			if r == nil {
				continue
			}
			var member ChatMemberDTO
			if r.RequestedBy != nil {
				member = ChatMemberDTO{
					DID:         r.RequestedBy.Did,
					Handle:      r.RequestedBy.Handle,
					DisplayName: safeString(r.RequestedBy.DisplayName),
					Avatar:      safeString(r.RequestedBy.Avatar),
				}
			}
			out.Requests = append(out.Requests, &ChatJoinRequestDTO{
				ConvoID:     r.ConvoId,
				RequestedAt: r.RequestedAt,
				RequestedBy: member,
			})
		}
		return nil
	})
	return out, err
}

func (s *ChatService) ApproveGroupJoinRequest(convoId string, memberDid string) error {
	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()
	return s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		cc := chatClient(c)
		_, err := chat.GroupApproveJoinRequest(ctx, cc, &chat.GroupApproveJoinRequest_Input{
			ConvoId: convoId,
			Member:  memberDid,
		})
		return err
	})
}

func (s *ChatService) RejectGroupJoinRequest(convoId string, memberDid string) error {
	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()
	return s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		cc := chatClient(c)
		_, err := chat.GroupRejectJoinRequest(ctx, cc, &chat.GroupRejectJoinRequest_Input{
			ConvoId: convoId,
			Member:  memberDid,
		})
		return err
	})
}

func (s *ChatService) GetConvoLog(cursor string) (string, bool, error) {
	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()
	var nextCursor string
	var hasNewActivity bool
	err := s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		cc := chatClient(c)
		res, err := chat.ConvoGetLog(ctx, cc, cursor)
		if err != nil {
			return err
		}
		nextCursor = safeString(res.Cursor)
		for _, entry := range res.Logs {
			if entry == nil {
				continue
			}
			if entry.ConvoDefs_LogCreateMessage != nil {
				hasNewActivity = true
				if entry.ConvoDefs_LogCreateMessage.Rev > nextCursor {
					nextCursor = entry.ConvoDefs_LogCreateMessage.Rev
				}
			} else if entry.ConvoDefs_LogAddReaction != nil {
				hasNewActivity = true
				if entry.ConvoDefs_LogAddReaction.Rev > nextCursor {
					nextCursor = entry.ConvoDefs_LogAddReaction.Rev
				}
			} else if entry.ConvoDefs_LogBeginConvo != nil {
				hasNewActivity = true
				if entry.ConvoDefs_LogBeginConvo.Rev > nextCursor {
					nextCursor = entry.ConvoDefs_LogBeginConvo.Rev
				}
			}
		}
		return nil
	})
	return nextCursor, hasNewActivity, err
}

