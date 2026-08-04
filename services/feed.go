package services

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/bluesky-social/indigo/api/bsky"
	"github.com/bluesky-social/indigo/xrpc"
)

type FeedService struct {
	clientMgr *BSkyClient
}

func NewFeedService(clientMgr *BSkyClient) *FeedService {
	return &FeedService{
		clientMgr: clientMgr,
	}
}

// GetTimeline retrieves the home timeline for the authenticated user
func (s *FeedService) GetTimeline(cursor string, limit int64) (*FeedDTO, error) {
	ctx := context.Background()
	var out *FeedDTO
	err := s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		var algo string = "reverse-chronological"
		res, err := bsky.FeedGetTimeline(ctx, c, algo, cursor, limit)
		if err != nil {
			return err
		}
		
		out = &FeedDTO{Cursor: safeString(res.Cursor)}
		for _, item := range res.Feed {
			if item.Post != nil {
				dto := ParsePostView(item.Post)
				if item.Reason != nil && item.Reason.FeedDefs_ReasonRepost != nil {
					if item.Reason.FeedDefs_ReasonRepost.By.DisplayName != nil {
						dto.RepostedBy = *item.Reason.FeedDefs_ReasonRepost.By.DisplayName
					} else {
						dto.RepostedBy = item.Reason.FeedDefs_ReasonRepost.By.Handle
					}
				}
				if item.Reply != nil {
					if item.Reply.Parent != nil && item.Reply.Parent.FeedDefs_PostView != nil {
						parentPV := item.Reply.Parent.FeedDefs_PostView
						CacheDID(parentPV.Author.Did, parentPV.Author.Handle)
						dto.IsReply = true
						dto.ReplyToAuthor = parentPV.Author.Handle
						dto.ReplyToURI = parentPV.Uri
						dto.ParentPost = ParsePostView(parentPV)
						if dto.ParentPost != nil && strings.HasPrefix(dto.ParentPost.ReplyToAuthor, "did:") {
							if h, ok := GetHandleForDID(dto.ParentPost.ReplyToAuthor); ok {
								dto.ParentPost.ReplyToAuthor = h
							}
						}
					}
					if item.Reply.Root != nil && item.Reply.Root.FeedDefs_PostView != nil {
						rootPV := item.Reply.Root.FeedDefs_PostView
						CacheDID(rootPV.Author.Did, rootPV.Author.Handle)
						dto.RootAuthor = rootPV.Author.Handle
						dto.RootURI = rootPV.Uri
					}
				}
				out.Posts = append(out.Posts, dto)
			}
		}
		return nil
	})
	return out, err
}

func safeString(s *string) string {
	if s == nil { return "" }
	return *s
}

func ParsePostView(post *bsky.FeedDefs_PostView) *PostDTO {
	if post == nil { return nil }
	CacheDID(post.Author.Did, post.Author.Handle)
	authorName := ""
	if post.Author.DisplayName != nil { authorName = *post.Author.DisplayName }
	
	replyCount, repostCount, likeCount := int64(0), int64(0), int64(0)
	if post.ReplyCount != nil { replyCount = *post.ReplyCount }
	if post.RepostCount != nil { repostCount = *post.RepostCount }
	if post.LikeCount != nil { likeCount = *post.LikeCount }

	var recVal interface{}
	if post.Record != nil { recVal = post.Record.Val }

	var imageAlts []string
	var images []*ImageDTO
	if post.Embed != nil {
		var imgList []*bsky.EmbedImages_ViewImage
		if post.Embed.EmbedImages_View != nil {
			imgList = post.Embed.EmbedImages_View.Images
		} else if post.Embed.EmbedRecordWithMedia_View != nil && post.Embed.EmbedRecordWithMedia_View.Media != nil && post.Embed.EmbedRecordWithMedia_View.Media.EmbedImages_View != nil {
			imgList = post.Embed.EmbedRecordWithMedia_View.Media.EmbedImages_View.Images
		}

		for _, img := range imgList {
			if img == nil {
				continue
			}
			alt := img.Alt
			if alt != "" {
				imageAlts = append(imageAlts, alt)
			} else {
				imageAlts = append(imageAlts, "(imagem sem descrição)")
			}
			dto := &ImageDTO{
				Thumb:    img.Thumb,
				Fullsize: img.Fullsize,
				Alt:      img.Alt,
			}
			if img.AspectRatio != nil {
				dto.Width = img.AspectRatio.Width
				dto.Height = img.AspectRatio.Height
			}
			images = append(images, dto)
		}
	}

	var quotePost *PostDTO
	if post.Embed != nil {
		var rv *bsky.EmbedRecord_ViewRecord
		if post.Embed.EmbedRecord_View != nil && post.Embed.EmbedRecord_View.Record != nil {
			rv = post.Embed.EmbedRecord_View.Record.EmbedRecord_ViewRecord
		} else if post.Embed.EmbedRecordWithMedia_View != nil && post.Embed.EmbedRecordWithMedia_View.Record != nil && post.Embed.EmbedRecordWithMedia_View.Record.Record != nil {
			rv = post.Embed.EmbedRecordWithMedia_View.Record.Record.EmbedRecord_ViewRecord
		}

		if rv != nil {
			var quoteRecVal interface{}
			if rv.Value != nil {
				quoteRecVal = rv.Value.Val
			}
			quotePost = &PostDTO{
				URI:          rv.Uri,
				CID:          rv.Cid,
				AuthorHandle: rv.Author.Handle,
				AuthorDID:    rv.Author.Did,
				Text:         ParseFeedPost(quoteRecVal),
				CreatedAt:    rv.IndexedAt,
			}
			if rv.Author.DisplayName != nil {
				quotePost.AuthorName = *rv.Author.DisplayName
			}
			for _, emb := range rv.Embeds {
				if emb == nil {
					continue
				}
				if emb.EmbedImages_View != nil {
					for _, img := range emb.EmbedImages_View.Images {
						if img == nil {
							continue
						}
						alt := img.Alt
						if alt != "" {
							quotePost.ImageAlts = append(quotePost.ImageAlts, alt)
						} else {
							quotePost.ImageAlts = append(quotePost.ImageAlts, "(imagem sem descrição)")
						}
						dto := &ImageDTO{
							Thumb:    img.Thumb,
							Fullsize: img.Fullsize,
							Alt:      img.Alt,
						}
						if img.AspectRatio != nil {
							dto.Width = img.AspectRatio.Width
							dto.Height = img.AspectRatio.Height
						}
						quotePost.Images = append(quotePost.Images, dto)
					}
					quotePost.HasMedia = true
				}
				if emb.EmbedVideo_View != nil {
					v := emb.EmbedVideo_View
					quotePost.Video = &VideoEmbedDTO{
						Playlist:     v.Playlist,
						Thumbnail:    safeString(v.Thumbnail),
						Alt:          safeString(v.Alt),
						Presentation: safeString(v.Presentation),
					}
					if quotePost.Video.Alt == "" {
						quotePost.Video.Alt = ExtractVideoAltFromRecord(quoteRecVal)
					}
					quotePost.HasMedia = true
				}
				if emb.EmbedExternal_View != nil && emb.EmbedExternal_View.External != nil {
					ext := emb.EmbedExternal_View.External
					quotePost.External = &ExternalEmbedDTO{
						URI:         ext.Uri,
						Title:       ext.Title,
						Description: ext.Description,
						Thumb:       safeString(ext.Thumb),
					}
					quotePost.HasMedia = true
				}
			}
			if quotePost.External == nil && quoteRecVal != nil {
				quotePost.External = ExtractExternalFromRecord(quoteRecVal)
				if quotePost.External != nil {
					quotePost.HasMedia = true
				}
			}
		}
	}

	var external *ExternalEmbedDTO
	if post.Embed != nil {
		if post.Embed.EmbedExternal_View != nil && post.Embed.EmbedExternal_View.External != nil {
			ext := post.Embed.EmbedExternal_View.External
			external = &ExternalEmbedDTO{
				URI:         ext.Uri,
				Title:       ext.Title,
				Description: ext.Description,
				Thumb:       safeString(ext.Thumb),
			}
		} else if post.Embed.EmbedRecordWithMedia_View != nil && post.Embed.EmbedRecordWithMedia_View.Media != nil && post.Embed.EmbedRecordWithMedia_View.Media.EmbedExternal_View != nil && post.Embed.EmbedRecordWithMedia_View.Media.EmbedExternal_View.External != nil {
			ext := post.Embed.EmbedRecordWithMedia_View.Media.EmbedExternal_View.External
			external = &ExternalEmbedDTO{
				URI:         ext.Uri,
				Title:       ext.Title,
				Description: ext.Description,
				Thumb:       safeString(ext.Thumb),
			}
		}
	}
	if external == nil && recVal != nil {
		external = ExtractExternalFromRecord(recVal)
	}

	var video *VideoEmbedDTO
	if post.Embed != nil {
		if post.Embed.EmbedVideo_View != nil {
			v := post.Embed.EmbedVideo_View
			video = &VideoEmbedDTO{
				Playlist:     v.Playlist,
				Thumbnail:    safeString(v.Thumbnail),
				Alt:          safeString(v.Alt),
				Presentation: safeString(v.Presentation),
			}
		} else if post.Embed.EmbedRecordWithMedia_View != nil && post.Embed.EmbedRecordWithMedia_View.Media != nil && post.Embed.EmbedRecordWithMedia_View.Media.EmbedVideo_View != nil {
			v := post.Embed.EmbedRecordWithMedia_View.Media.EmbedVideo_View
			video = &VideoEmbedDTO{
				Playlist:     v.Playlist,
				Thumbnail:    safeString(v.Thumbnail),
				Alt:          safeString(v.Alt),
				Presentation: safeString(v.Presentation),
			}
		}
		if video != nil && video.Alt == "" {
			video.Alt = ExtractVideoAltFromRecord(recVal)
		}
	}

	viewerLike := ""
	if post.Viewer != nil && post.Viewer.Like != nil {
		viewerLike = *post.Viewer.Like
	}

	viewerRepost := ""
	if post.Viewer != nil && post.Viewer.Repost != nil {
		viewerRepost = *post.Viewer.Repost
	}

	isReply, replyToURI, replyToDID := ExtractReplyMetaFromRecord(recVal)
	replyToAuthor := ""
	if isReply {
		if replyToDID != "" && replyToDID == post.Author.Did {
			replyToAuthor = post.Author.Handle
		} else if handle, ok := GetHandleForDID(replyToDID); ok && handle != "" {
			replyToAuthor = handle
		} else {
			replyToAuthor = replyToDID
		}
	}

	return &PostDTO{
		URI:          post.Uri,
		CID:          post.Cid,
		AuthorName:   authorName,
		AuthorHandle: post.Author.Handle,
		AuthorDID:    post.Author.Did,
		Text:         ParseFeedPost(recVal),
		CreatedAt:    post.IndexedAt,
		ReplyCount:   replyCount,
		RepostCount:  repostCount,
		LikeCount:    likeCount,
		IsReply:      isReply,
		ReplyToAuthor: replyToAuthor,
		ReplyToURI:   replyToURI,
		QuotePost:    quotePost,
		ImageAlts:    imageAlts,
		Images:       images,
		External:     external,
		Video:        video,
		HasMedia:     (len(images) > 0) || (external != nil) || (video != nil) || (post.Embed != nil && (post.Embed.EmbedImages_View != nil || post.Embed.EmbedRecordWithMedia_View != nil)),
		ViewerLike:   viewerLike,
		ViewerRepost: viewerRepost,
	}
}

// GetAuthorFeed retrieves a specific author's feed
func (s *FeedService) GetAuthorFeed(actor string, cursor string, limit int64, filter string) (*FeedDTO, error) {
	if filter == "" {
		filter = "posts_with_replies"
	}
	ctx := context.Background()
	var out *FeedDTO
	err := s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		res, err := bsky.FeedGetAuthorFeed(ctx, c, actor, cursor, filter, false, limit)
		if err != nil {
			return err
		}
		
		out = &FeedDTO{Cursor: safeString(res.Cursor)}
		for _, item := range res.Feed {
			if item.Post != nil {
				dto := ParsePostView(item.Post)
				if item.Reply != nil {
					if item.Reply.Parent != nil && item.Reply.Parent.FeedDefs_PostView != nil {
						dto.IsReply = true
						dto.ReplyToAuthor = item.Reply.Parent.FeedDefs_PostView.Author.Handle
						dto.ReplyToURI = item.Reply.Parent.FeedDefs_PostView.Uri
						dto.ParentPost = ParsePostView(item.Reply.Parent.FeedDefs_PostView)
					}
					if item.Reply.Root != nil && item.Reply.Root.FeedDefs_PostView != nil {
						dto.RootAuthor = item.Reply.Root.FeedDefs_PostView.Author.Handle
						dto.RootURI = item.Reply.Root.FeedDefs_PostView.Uri
					}
				}
				out.Posts = append(out.Posts, dto)
			}
		}
		return nil
	})
	return out, err
}

// GetThread retrieves a specific post and its replies
func (s *FeedService) GetThread(uri string, depth int64) (*bsky.FeedGetPostThread_Output, error) {
	ctx := context.Background()
	var out *bsky.FeedGetPostThread_Output
	err := s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		res, err := bsky.FeedGetPostThread(ctx, c, depth, 10, uri)
		if err != nil {
			return err
		}
		out = res
		return nil
	})
	return out, err
}

func (s *FeedService) GetPostThread(uri string, depth int64) (*FeedDTO, error) {
	ctx := context.Background()
	var out *FeedDTO
	err := s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		res, err := bsky.FeedGetPostThread(ctx, c, depth, 10, uri)
		if err != nil {
			return err
		}
		
		out = &FeedDTO{}
		
		var extractParents func(thread *bsky.FeedDefs_ThreadViewPost)
		extractParents = func(thread *bsky.FeedDefs_ThreadViewPost) {
			if thread == nil {
				return
			}
			if thread.Parent != nil && thread.Parent.FeedDefs_ThreadViewPost != nil {
				extractParents(thread.Parent.FeedDefs_ThreadViewPost)
				postDTO := ParsePostView(thread.Parent.FeedDefs_ThreadViewPost.Post)
				if postDTO != nil {
					out.Posts = append(out.Posts, postDTO)
				}
			}
		}
		
		var extractReplies func(thread *bsky.FeedDefs_ThreadViewPost)
		extractReplies = func(thread *bsky.FeedDefs_ThreadViewPost) {
			if thread == nil {
				return
			}
			for _, rep := range thread.Replies {
				if rep.FeedDefs_ThreadViewPost != nil {
					postDTO := ParsePostView(rep.FeedDefs_ThreadViewPost.Post)
					if postDTO != nil {
						postDTO.IsReply = true
						postDTO.ReplyToAuthor = thread.Post.Author.Handle
						out.Posts = append(out.Posts, postDTO)
						extractReplies(rep.FeedDefs_ThreadViewPost)
					}
				}
			}
		}
		
		if res.Thread != nil && res.Thread.FeedDefs_ThreadViewPost != nil {
			extractParents(res.Thread.FeedDefs_ThreadViewPost)
			targetDTO := ParsePostView(res.Thread.FeedDefs_ThreadViewPost.Post)
			if targetDTO != nil {
				out.Posts = append(out.Posts, targetDTO)
			}
			extractReplies(res.Thread.FeedDefs_ThreadViewPost)
		}
		return nil
	})
	return out, err
}

func (s *FeedService) GetListFeed(listUri string, cursor string, limit int64) (*FeedDTO, error) {
	ctx := context.Background()
	var out *FeedDTO
	err := s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		res, err := bsky.FeedGetListFeed(ctx, c, cursor, limit, listUri)
		if err != nil {
			return err
		}
		
		out = &FeedDTO{Cursor: safeString(res.Cursor)}
		for _, item := range res.Feed {
			if item.Post != nil {
				dto := ParsePostView(item.Post)
				if item.Reply != nil {
					if item.Reply.Parent != nil && item.Reply.Parent.FeedDefs_PostView != nil {
						dto.IsReply = true
						dto.ReplyToAuthor = item.Reply.Parent.FeedDefs_PostView.Author.Handle
						dto.ReplyToURI = item.Reply.Parent.FeedDefs_PostView.Uri
						dto.ParentPost = ParsePostView(item.Reply.Parent.FeedDefs_PostView)
					}
					if item.Reply.Root != nil && item.Reply.Root.FeedDefs_PostView != nil {
						dto.RootAuthor = item.Reply.Root.FeedDefs_PostView.Author.Handle
						dto.RootURI = item.Reply.Root.FeedDefs_PostView.Uri
					}
				}
				out.Posts = append(out.Posts, dto)
			}
		}
		return nil
	})
	return out, err
}

func (s *FeedService) GetSavedFeeds() ([]*SavedFeedDTO, error) {
	ctx := context.Background()
	var out []*SavedFeedDTO
	err := s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		res, err := bsky.ActorGetPreferences(ctx, c)
		if err != nil {
			return err
		}

		var feedUris []string
		pinnedMap := map[string]bool{}
		for _, pref := range res.Preferences {
			if pref.ActorDefs_SavedFeedsPref != nil {
				feedUris = pref.ActorDefs_SavedFeedsPref.Saved
				for _, p := range pref.ActorDefs_SavedFeedsPref.Pinned {
					pinnedMap[p] = true
				}
			} else if pref.ActorDefs_SavedFeedsPrefV2 != nil {
				for _, item := range pref.ActorDefs_SavedFeedsPrefV2.Items {
					if item.Type == "feed" {
						feedUris = append(feedUris, item.Value)
						if item.Pinned {
							pinnedMap[item.Value] = true
						}
					}
				}
			}
		}

		if len(feedUris) > 0 {
			genRes, err := bsky.FeedGetFeedGenerators(ctx, c, feedUris)
			if err == nil {
				for _, gen := range genRes.Feeds {
					creator := ""
					if gen.Creator != nil {
						creator = gen.Creator.Handle
					}
					out = append(out, &SavedFeedDTO{
						URI:         gen.Uri,
						CID:         gen.Cid,
						DisplayName: gen.DisplayName,
						Creator:     creator,
						Pinned:      pinnedMap[gen.Uri],
					})
				}
			}
		}
		return nil
	})
	return out, err
}


func (s *FeedService) GetCustomFeed(feedUri string, cursor string, limit int64) (*FeedDTO, error) {
	ctx := context.Background()
	var out *FeedDTO
	err := s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		res, err := bsky.FeedGetFeed(ctx, c, cursor, feedUri, limit)
		if err != nil {
			return err
		}
		
		out = &FeedDTO{Cursor: safeString(res.Cursor)}
		for _, item := range res.Feed {
			if item.Post != nil {
				dto := ParsePostView(item.Post)
				if item.Reason != nil && item.Reason.FeedDefs_ReasonRepost != nil {
					if item.Reason.FeedDefs_ReasonRepost.By.DisplayName != nil {
						dto.RepostedBy = *item.Reason.FeedDefs_ReasonRepost.By.DisplayName
					} else {
						dto.RepostedBy = item.Reason.FeedDefs_ReasonRepost.By.Handle
					}
				}
				if item.Reply != nil {
					if item.Reply.Parent != nil && item.Reply.Parent.FeedDefs_PostView != nil {
						dto.IsReply = true
						dto.ReplyToAuthor = item.Reply.Parent.FeedDefs_PostView.Author.Handle
						dto.ReplyToURI = item.Reply.Parent.FeedDefs_PostView.Uri
						dto.ParentPost = ParsePostView(item.Reply.Parent.FeedDefs_PostView)
					}
					if item.Reply.Root != nil && item.Reply.Root.FeedDefs_PostView != nil {
						dto.RootAuthor = item.Reply.Root.FeedDefs_PostView.Author.Handle
						dto.RootURI = item.Reply.Root.FeedDefs_PostView.Uri
					}
				}
				out.Posts = append(out.Posts, dto)
			}
		}
		return nil
	})
	return out, err
}

func (s *FeedService) GetLikes(uri string, cid string, cursor string) (*ProfileListDTO, error) {
	ctx := context.Background()
	var out *ProfileListDTO
	err := s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		res, err := bsky.FeedGetLikes(ctx, c, cid, cursor, 100, uri)
		if err != nil {
			return err
		}
		out = &ProfileListDTO{Cursor: safeString(res.Cursor)}
		for _, like := range res.Likes {
			if like.Actor != nil {
				if dto := ParseProfileView(like.Actor); dto != nil {
					out.Profiles = append(out.Profiles, dto)
				}
			}
		}
		return nil
	})
	return out, err
}

func (s *FeedService) GetRepostedBy(uri string, cid string, cursor string) (*ProfileListDTO, error) {
	ctx := context.Background()
	var out *ProfileListDTO
	err := s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		res, err := bsky.FeedGetRepostedBy(ctx, c, cid, cursor, 100, uri)
		if err != nil {
			return err
		}
		out = &ProfileListDTO{Cursor: safeString(res.Cursor)}
		for _, actor := range res.RepostedBy {
			if dto := ParseProfileView(actor); dto != nil {
				out.Profiles = append(out.Profiles, dto)
			}
		}
		return nil
	})
	return out, err
}

func (s *FeedService) GetQuotes(uri string, cid string, cursor string) (*FeedDTO, error) {
	ctx := context.Background()
	var out *FeedDTO
	err := s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		res, err := bsky.FeedGetQuotes(ctx, c, cid, cursor, 100, uri)
		if err != nil {
			return err
		}
		out = &FeedDTO{Cursor: safeString(res.Cursor)}
		for _, postView := range res.Posts {
			if dto := ParsePostView(postView); dto != nil {
				out.Posts = append(out.Posts, dto)
			}
		}
		return nil
	})
	return out, err
}

func (s *FeedService) GetPosts(uris []string) (*FeedDTO, error) {
	ctx := context.Background()
	var out *FeedDTO
	err := s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		res, err := bsky.FeedGetPosts(ctx, c, uris)
		if err != nil {
			return err
		}
		out = &FeedDTO{}
		for _, postView := range res.Posts {
			if dto := ParsePostView(postView); dto != nil {
				out.Posts = append(out.Posts, dto)
			}
		}
		return nil
	})
	return out, err
}

func (s *FeedService) GetPopularFeedGenerators(cursor string, query string) (*FeedGeneratorResponseDTO, error) {
	ctx := context.Background()
	var out *FeedGeneratorResponseDTO
	err := s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		res, err := bsky.UnspeccedGetPopularFeedGenerators(ctx, c, cursor, 100, query)
		if err != nil {
			return err
		}
		out = &FeedGeneratorResponseDTO{Cursor: safeString(res.Cursor)}
		for _, gen := range res.Feeds {
			avatar := ""
			if gen.Avatar != nil {
				avatar = *gen.Avatar
			}
			desc := ""
			if gen.Description != nil {
				desc = *gen.Description
			}
			likes := int64(0)
			if gen.LikeCount != nil {
				likes = *gen.LikeCount
			}
			out.Feeds = append(out.Feeds, &FeedGeneratorDTO{
				URI:         gen.Uri,
				CID:         gen.Cid,
				DID:         gen.Did,
				Creator:     gen.Creator.Handle,
				DisplayName: gen.DisplayName,
				Description: desc,
				LikeCount:   likes,
				Avatar:      avatar,
			})
		}
		return nil
	})
	return out, err
}

func (s *FeedService) GetActorLikes(actor string, cursor string, limit int64) (*FeedDTO, error) {
	ctx := context.Background()
	var out *FeedDTO
	err := s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		res, err := bsky.FeedGetActorLikes(ctx, c, actor, cursor, limit)
		if err != nil {
			return err
		}
		out = &FeedDTO{Cursor: safeString(res.Cursor)}
		for _, item := range res.Feed {
			if item.Post != nil {
				if dto := ParsePostView(item.Post); dto != nil {
					out.Posts = append(out.Posts, dto)
				}
			}
		}
		return nil
	})
	return out, err
}

func extractURIsAndPostsFromJSON(rawJSON []byte) ([]string, []*bsky.FeedDefs_PostView, string) {
	var uris []string
	var posts []*bsky.FeedDefs_PostView
	var cursor string

	var raw map[string]interface{}
	if err := json.Unmarshal(rawJSON, &raw); err != nil {
		return uris, posts, cursor
	}

	if c, ok := raw["cursor"].(string); ok {
		cursor = c
	}

	inspectObject := func(obj map[string]interface{}) {
		if postObj, ok := obj["post"].(map[string]interface{}); ok {
			if u, ok := postObj["uri"].(string); ok && strings.Contains(u, "/app.bsky.feed.post/") {
				uris = append(uris, u)
				return
			}
		}
		if itemObj, ok := obj["item"].(map[string]interface{}); ok {
			if u, ok := itemObj["uri"].(string); ok && strings.Contains(u, "/app.bsky.feed.post/") {
				uris = append(uris, u)
				return
			}
		}
		if valObj, ok := obj["value"].(map[string]interface{}); ok {
			if subj, ok := valObj["subject"].(map[string]interface{}); ok {
				if u, ok := subj["uri"].(string); ok && strings.Contains(u, "/app.bsky.feed.post/") {
					uris = append(uris, u)
					return
				}
			}
		}
		if subjObj, ok := obj["subject"].(map[string]interface{}); ok {
			if u, ok := subjObj["uri"].(string); ok && strings.Contains(u, "/app.bsky.feed.post/") {
				uris = append(uris, u)
				return
			}
		}
		if u, ok := obj["uri"].(string); ok && strings.Contains(u, "/app.bsky.feed.post/") {
			uris = append(uris, u)
			return
		}
	}

	for _, key := range []string{"bookmarks", "feed", "records", "items", "posts"} {
		if arr, ok := raw[key].([]interface{}); ok {
			for _, elem := range arr {
				if obj, ok := elem.(map[string]interface{}); ok {
					inspectObject(obj)
				}
			}
		}
	}

	var postViewsStruct struct {
		Bookmarks []struct {
			Item *bsky.FeedDefs_PostView `json:"item"`
			Post *bsky.FeedDefs_PostView `json:"post"`
		} `json:"bookmarks"`
		Feed []struct {
			Post *bsky.FeedDefs_PostView `json:"post"`
		} `json:"feed"`
	}
	if json.Unmarshal(rawJSON, &postViewsStruct) == nil {
		for _, bm := range postViewsStruct.Bookmarks {
			if bm.Item != nil {
				posts = append(posts, bm.Item)
			} else if bm.Post != nil {
				posts = append(posts, bm.Post)
			}
		}
		for _, item := range postViewsStruct.Feed {
			if item.Post != nil {
				posts = append(posts, item.Post)
			}
		}
	}

	return uris, posts, cursor
}

// GetBookmarks retrieves saved posts online for the authenticated user
func (s *FeedService) GetBookmarks(cursor string, limit int64) (*FeedDTO, error) {
	ctx := context.Background()
	out := &FeedDTO{Posts: []*PostDTO{}}
	err := s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		var postURIs []string
		bookmarkMap := make(map[string]string)
		var nextCursor string

		// 1. Query user's online ATProto repository records via com.atproto.repo.listRecords
		paramsRepo := map[string]interface{}{
			"repo":       c.Auth.Did,
			"collection": "app.bsky.bookmark",
			"limit":      limit,
		}
		if cursor != "" {
			paramsRepo["cursor"] = cursor
		}

		var rawRepoResp json.RawMessage
		if errRepo := c.Do(ctx, xrpc.Query, "", "com.atproto.repo.listRecords", paramsRepo, nil, &rawRepoResp); errRepo == nil && len(rawRepoResp) > 0 {
			extractedURIs, _, cur := extractURIsAndPostsFromJSON(rawRepoResp)
			fmt.Printf("[DEBUG Bookmarks] RepoListRecords returned %d bytes, extracted %d post URIs\n", len(rawRepoResp), len(extractedURIs))
			if cur != "" {
				nextCursor = cur
			}
			for _, u := range extractedURIs {
				if u != "" && !containsString(postURIs, u) {
					postURIs = append(postURIs, u)
				}
			}
		} else if errRepo != nil {
			fmt.Printf("[DEBUG Bookmarks] RepoListRecords error: %v\n", errRepo)
		}

		// 2. Query native Bluesky app.bsky.bookmark.getBookmarks endpoint
		paramsBsky := map[string]interface{}{}
		if cursor != "" {
			paramsBsky["cursor"] = cursor
		}
		if limit > 0 {
			paramsBsky["limit"] = limit
		}

		var rawBskyResp json.RawMessage
		if errQuery := c.Do(ctx, xrpc.Query, "", "app.bsky.bookmark.getBookmarks", paramsBsky, nil, &rawBskyResp); errQuery == nil && len(rawBskyResp) > 0 {
			extractedURIs, extractedViews, cur := extractURIsAndPostsFromJSON(rawBskyResp)
			fmt.Printf("[DEBUG Bookmarks] getBookmarks returned %d bytes, extracted %d URIs, %d views\n", len(rawBskyResp), len(extractedURIs), len(extractedViews))
			if cur != "" && nextCursor == "" {
				nextCursor = cur
			}
			for _, pv := range extractedViews {
				if pv != nil {
					dto := ParsePostView(pv)
					if dto != nil && !containsPost(out.Posts, dto.URI) {
						dto.ViewerBookmark = "bookmarked"
						out.Posts = append(out.Posts, dto)
					}
				}
			}
			for _, u := range extractedURIs {
				if u != "" && !containsString(postURIs, u) {
					postURIs = append(postURIs, u)
				}
			}
		} else if errQuery != nil {
			fmt.Printf("[DEBUG Bookmarks] getBookmarks error: %v\n", errQuery)
		}

		// 3. Resolve all post URIs into full PostDTOs via FeedGetPosts
		if len(postURIs) > 0 {
			var fetchURIs []string
			for _, u := range postURIs {
				if !containsPost(out.Posts, u) {
					fetchURIs = append(fetchURIs, u)
				}
			}

			if len(fetchURIs) > 0 {
				fmt.Printf("[DEBUG Bookmarks] Calling FeedGetPosts for %d URIs: %v\n", len(fetchURIs), fetchURIs)
				postsRes, errGetPosts := bsky.FeedGetPosts(ctx, c, fetchURIs)
				if errGetPosts == nil && postsRes != nil {
					fmt.Printf("[DEBUG Bookmarks] FeedGetPosts returned %d posts\n", len(postsRes.Posts))
					for _, p := range postsRes.Posts {
						if p != nil {
							dto := ParsePostView(p)
							if dto != nil {
								if bmUri, ok := bookmarkMap[p.Uri]; ok && bmUri != "" {
									dto.ViewerBookmark = bmUri
								} else {
									dto.ViewerBookmark = "bookmarked"
								}
								out.Posts = append(out.Posts, dto)
							}
						}
					}
				} else if errGetPosts != nil {
					fmt.Printf("[DEBUG Bookmarks] FeedGetPosts error: %v\n", errGetPosts)
				}
			}
		}

		fmt.Printf("[DEBUG Bookmarks] Total posts resolved for UI: %d\n", len(out.Posts))
		out.Cursor = nextCursor
		return nil
	})
	if out == nil {
		out = &FeedDTO{Posts: []*PostDTO{}}
	}
	return out, err
}

func containsString(arr []string, target string) bool {
	for _, s := range arr {
		if s == target {
			return true
		}
	}
	return false
}

func containsPost(posts []*PostDTO, uri string) bool {
	for _, p := range posts {
		if p.URI == uri {
			return true
		}
	}
	return false
}

