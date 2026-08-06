package services

import (
	"context"
	"github.com/bluesky-social/indigo/api/chat"
	"github.com/bluesky-social/indigo/xrpc"
)

type ChatService struct {
	clientMgr *BSkyClient
}

func NewChatService(clientMgr *BSkyClient) *ChatService {
	return &ChatService{clientMgr: clientMgr}
}

func (s *ChatService) ListConvos(cursor string) ([]*ChatConvoDTO, error) {
	ctx := context.Background()
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
	ctx := context.Background()
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
		msgTextMap := make(map[string]string)
		for _, rawMsg := range rawRes.Messages {
			if typeVal, ok := rawMsg["$type"].(string); ok && typeVal == "chat.bsky.convo.defs#messageView" {
				if id, ok := rawMsg["id"].(string); ok {
					if text, ok := rawMsg["text"].(string); ok {
						msgTextMap[id] = text
					}
				}
			}
		}

		for _, rawMsg := range rawRes.Messages {
			if typeVal, ok := rawMsg["$type"].(string); ok && typeVal == "chat.bsky.convo.defs#messageView" {
				id, _ := rawMsg["id"].(string)
				rev, _ := rawMsg["rev"].(string)
				text, _ := rawMsg["text"].(string)
				sentAt, _ := rawMsg["sentAt"].(string)

				senderName := "Desconhecido"
				senderDid := ""
				if senderMap, ok := rawMsg["sender"].(map[string]interface{}); ok {
					if did, ok := senderMap["did"].(string); ok {
						senderDid = did
						senderName = did
						if name, ok := memberMap[senderDid]; ok {
							senderName = name
						} else if senderDid == c.Auth.Did {
							senderName = "Você"
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
				
				replyToText := ""
				replyToSender := ""
				if facets, ok := rawMsg["facets"].([]interface{}); ok {
					for _, f := range facets {
						if facetMap, ok := f.(map[string]interface{}); ok {
							if features, ok := facetMap["features"].([]interface{}); ok {
								for _, feat := range features {
									if featMap, ok := feat.(map[string]interface{}); ok {
										if featType, ok := featMap["$type"].(string); ok && featType == "chat.bsky.convo.defs#messageRef" {
											if parentId, ok := featMap["messageId"].(string); ok {
												replyToText = msgTextMap[parentId]
												if replyToText == "" {
													replyToText = "Mensagem anterior"
												}
											}
										}
									}
								}
							}
						}
					}
				}

				out.Messages = append(out.Messages, &ChatMessageDTO{
					ID:                 id,
					Rev:                rev,
					Sender:             senderName,
					Text:               text,
					SentAt:             sentAt,
					EmbedURI:           embedUri,
					ReplyToMessageText: replyToText,
					ReplyToSender:      replyToSender,
				})
			}
		}
		return nil
	})
	return out, err
}

func (s *ChatService) SendMessage(convoId string, text string) error {
	ctx := context.Background()
	err := s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		chatClient := &xrpc.Client{
			Client: c.Client,
			Host:   "https://api.bsky.chat",
			Auth:   c.Auth,
		}

		msg := &chat.ConvoDefs_MessageInput{
			Text: text,
		}
		// ConvoSendMessage requires a *chat.ConvoDefs_MessageInput
		_, err := chat.ConvoSendMessage(ctx, chatClient, &chat.ConvoSendMessage_Input{
			ConvoId: convoId,
			Message: msg,
		})
		return err
	})
	return err
}

func (s *ChatService) SendMessageWithGif(convoId string, text string, gifUrl string) error {
	ctx := context.Background()
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

		msg := &chat.ConvoDefs_MessageInput{
			Text: finalText,
		}

		_, err := chat.ConvoSendMessage(ctx, chatClient, &chat.ConvoSendMessage_Input{
			ConvoId: convoId,
			Message: msg,
		})
		return err
	})
	return err
}

func (s *ChatService) UpdateReadStatus(convoId string, messageId string) error {
	ctx := context.Background()
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
	ctx := context.Background()
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
	ctx := context.Background()
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
	ctx := context.Background()
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
	ctx := context.Background()
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
	ctx := context.Background()
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
	ctx := context.Background()
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
