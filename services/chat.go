package services

import (
	"github.com/bluesky-social/indigo/api/chat"
	"github.com/bluesky-social/indigo/xrpc"
)

type ChatService struct {
	clientMgr *ATClient
}

func NewChatService(clientMgr *ATClient) *ChatService {
	return &ChatService{clientMgr: clientMgr}
}

func (s *ChatService) ListConvos(cursor string) ([]*ChatConvoDTO, error) {
	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()
	var out []*ChatConvoDTO
	err := s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		chatClient := &xrpc.Client{
			Client: c.Client,
			Host:   "https://api.bsky.chat",
			Auth:   c.Auth,
		}

		res, err := chat.ConvoListConvos(ctx, chatClient, cursor, "", 100, "", "", "")
		if err != nil {
			return err
		}
		
		for _, convo := range res.Convos {
			lastMsg := ""
			if convo.LastMessage != nil && convo.LastMessage.ConvoDefs_MessageView != nil {
				lastMsg = convo.LastMessage.ConvoDefs_MessageView.Text
			}
			members := ""
			for _, m := range convo.Members {
				members += m.Handle + " "
			}
			out = append(out, &ChatConvoDTO{
				ID:          convo.Id,
				Rev:         convo.Rev,
				Members:     members,
				LastMessage: lastMsg,
				UnreadCount: convo.UnreadCount,
			})
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
		memberMap := make(map[string]string)
		if convoRes != nil && convoRes.Convo != nil {
			for _, m := range convoRes.Convo.Members {
				name := m.Handle
				if m.DisplayName != nil && *m.DisplayName != "" {
					name = *m.DisplayName
				}
				memberMap[m.Did] = name
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
				if senderMap, ok := rawMsg["sender"].(map[string]interface{}); ok {
					if did, ok := senderMap["did"].(string); ok {
						senderDid = did
						senderName = did
						if name, ok := memberMap[senderDid]; ok {
							senderName = name
						} else if senderDid == c.Auth.Did {
							senderName = "Me"
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
								if name, found := memberMap[did]; found {
									replyToSender = name
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
					ID:                 id,
					Rev:                rev,
					Sender:             senderName,
					SenderDID:          senderDid,
					Text:               text,
					SentAt:             sentAt,
					EmbedURI:           embedUri,
					ReplyToMessageID:   replyToMessageId,
					ReplyToMessageText: replyToText,
					ReplyToSender:      replyToSender,
					Reactions:          reactions,
				})
			}
		}
		return nil
	})
	return out, err
}


func (s *ChatService) SendMessage(convoId string, text string) error {
	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()
	err := s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		chatClient := &xrpc.Client{
			Client: c.Client,
			Host:   "https://api.bsky.chat",
			Auth:   c.Auth,
		}

		msg := &chat.ConvoDefs_MessageInput{
			Text: text,
		}
		_, err := chat.ConvoSendMessage(ctx, chatClient, &chat.ConvoSendMessage_Input{
			ConvoId: convoId,
			Message: msg,
		})
		return err
	})
	return err
}

func (s *ChatService) SendMessageWithGif(convoId string, text string, gifUrl string) error {
	return s.sendMessageRaw(convoId, text, gifUrl, "")
}

func (s *ChatService) SendReply(convoId string, replyToMessageId string, text string, gifUrl string) error {
	return s.sendMessageRaw(convoId, text, gifUrl, replyToMessageId)
}

func (s *ChatService) sendMessageRaw(convoId string, text string, gifUrl string, replyToMessageId string) error {
	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()
	err := s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		chatClient := &xrpc.Client{
			Client: c.Client,
			Host:   "https://api.bsky.chat",
			Auth:   c.Auth,
		}

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
		if replyToMessageId != "" {
			msgPayload["replyTo"] = map[string]interface{}{
				"messageId": replyToMessageId,
			}
		}

		input := map[string]interface{}{
			"convoId": convoId,
			"message": msgPayload,
		}

		var out interface{}
		return chatClient.Do(ctx, xrpc.Procedure, "application/json", "chat.bsky.convo.sendMessage", nil, input, &out)
	})
	return err
}

func (s *ChatService) AddReaction(convoId string, messageId string, emoji string) error {
	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()
	return s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		chatClient := &xrpc.Client{
			Client: c.Client,
			Host:   "https://api.bsky.chat",
			Auth:   c.Auth,
		}
		_, err := chat.ConvoAddReaction(ctx, chatClient, &chat.ConvoAddReaction_Input{
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
		chatClient := &xrpc.Client{
			Client: c.Client,
			Host:   "https://api.bsky.chat",
			Auth:   c.Auth,
		}
		_, err := chat.ConvoRemoveReaction(ctx, chatClient, &chat.ConvoRemoveReaction_Input{
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
		chatClient := &xrpc.Client{
			Client: c.Client,
			Host:   "https://api.bsky.chat",
			Auth:   c.Auth,
		}

		_, err := chat.ConvoUpdateRead(ctx, chatClient, &chat.ConvoUpdateRead_Input{
			ConvoId:   convoId,
			MessageId: &messageId,
		})
		return err
	})
}

func (s *ChatService) GetUnreadCount() (int64, error) {
	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()
	var count int64
	err := s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		chatClient := &xrpc.Client{
			Client: c.Client,
			Host:   "https://api.bsky.chat",
			Auth:   c.Auth,
		}

		res, err := chat.ConvoListConvos(ctx, chatClient, "", "", 50, "", "", "")
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
		chatClient := &xrpc.Client{
			Client: c.Client,
			Host:   "https://api.bsky.chat",
			Auth:   c.Auth,
		}

		_, err := chat.ConvoMuteConvo(ctx, chatClient, &chat.ConvoMuteConvo_Input{
			ConvoId: convoId,
		})
		return err
	})
}

func (s *ChatService) UnmuteConvo(convoId string) error {
	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()
	return s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		chatClient := &xrpc.Client{
			Client: c.Client,
			Host:   "https://api.bsky.chat",
			Auth:   c.Auth,
		}

		_, err := chat.ConvoUnmuteConvo(ctx, chatClient, &chat.ConvoUnmuteConvo_Input{
			ConvoId: convoId,
		})
		return err
	})
}

func (s *ChatService) LeaveConvo(convoId string) error {
	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()
	return s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		chatClient := &xrpc.Client{
			Client: c.Client,
			Host:   "https://api.bsky.chat",
			Auth:   c.Auth,
		}

		_, err := chat.ConvoLeaveConvo(ctx, chatClient, &chat.ConvoLeaveConvo_Input{
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
		chatClient := &xrpc.Client{
			Client: c.Client,
			Host:   "https://api.bsky.chat",
			Auth:   c.Auth,
		}

		res, err := chat.ConvoGetConvoForMembers(ctx, chatClient, dids)
		if err != nil {
			return err
		}
		
		convo := res.Convo
		lastMsg := ""
		if convo.LastMessage != nil && convo.LastMessage.ConvoDefs_MessageView != nil {
			lastMsg = convo.LastMessage.ConvoDefs_MessageView.Text
		}
		members := ""
		for _, m := range convo.Members {
			members += m.Handle + " "
		}
		out = &ChatConvoDTO{
			ID:          convo.Id,
			Rev:         convo.Rev,
			Members:     members,
			LastMessage: lastMsg,
			UnreadCount: convo.UnreadCount,
		}
		return nil
	})
	return out, err
}

func (s *ChatService) DeleteMessage(convoId string, messageId string) error {
	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()
	return s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		chatClient := &xrpc.Client{
			Client: c.Client,
			Host:   "https://api.bsky.chat",
			Auth:   c.Auth,
		}

		_, err := chat.ConvoDeleteMessageForSelf(ctx, chatClient, &chat.ConvoDeleteMessageForSelf_Input{
			ConvoId:   convoId,
			MessageId: messageId,
		})
		return err
	})
}
