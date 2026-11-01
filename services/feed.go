package services

import (
	"context"
	"encoding/json"
	"fmt"
	"net/url"
	"strings"
	"time"

	"github.com/bluesky-social/indigo/api/atproto"
	"github.com/bluesky-social/indigo/api/bsky"
	"github.com/bluesky-social/indigo/lex/util"
	"github.com/bluesky-social/indigo/xrpc"
)


type FeedService struct {
	clientMgr *ATClient
}

func NewFeedService(clientMgr *ATClient) *FeedService {
	return &FeedService{
		clientMgr: clientMgr,
	}
}

// GetTimeline retrieves the home timeline for the authenticated user
func (s *FeedService) GetTimeline(cursor string, limit int64) (*FeedDTO, error) {
	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()
	var out *FeedDTO
	err := s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		var algo string = "reverse-chronological"
		res, err := bsky.FeedGetTimeline(ctx, c, algo, cursor, limit, "")
		if err != nil {
			return err
		}
		
		out = &FeedDTO{Cursor: safeString(res.Cursor)}
		for _, item := range res.Feed {
			if item.Post != nil {
				dto := ParsePostView(item.Post)
				if item.Reason != nil && item.Reason.FeedDefs_ReasonRepost != nil {
					if item.Reason.FeedDefs_ReasonRepost.By.DisplayName != nil && *item.Reason.FeedDefs_ReasonRepost.By.DisplayName != "" {
						dto.RepostedBy = *item.Reason.FeedDefs_ReasonRepost.By.DisplayName
					} else {
						dto.RepostedBy = item.Reason.FeedDefs_ReasonRepost.By.Handle
					}
					dto.RepostedByHandle = item.Reason.FeedDefs_ReasonRepost.By.Handle
				}
				if item.Reply != nil {
					if item.Reply.Parent != nil && item.Reply.Parent.FeedDefs_PostView != nil {
						parentPV := item.Reply.Parent.FeedDefs_PostView
						parentName := ""
						if parentPV.Author.DisplayName != nil {
							parentName = *parentPV.Author.DisplayName
						}
						CacheAuthor(parentPV.Author.Did, parentPV.Author.Handle, parentName)
						dto.IsReply = true
						dto.ReplyToAuthor = parentPV.Author.Handle
						dto.ReplyToAuthorName = parentName
						dto.ReplyToURI = parentPV.Uri
						dto.ParentPost = ParsePostView(parentPV)
						if dto.ParentPost != nil && strings.HasPrefix(dto.ParentPost.ReplyToAuthor, "did:") {
							if author, ok := GetAuthorForDID(dto.ParentPost.ReplyToAuthor); ok {
								dto.ParentPost.ReplyToAuthor = author.Handle
								if dto.ParentPost.ReplyToAuthorName == "" {
									dto.ParentPost.ReplyToAuthorName = author.DisplayName
								}
							}
						}
					}
					if item.Reply.Root != nil && item.Reply.Root.FeedDefs_PostView != nil {
						rootPV := item.Reply.Root.FeedDefs_PostView
						rootName := ""
						if rootPV.Author.DisplayName != nil {
							rootName = *rootPV.Author.DisplayName
						}
						CacheAuthor(rootPV.Author.Did, rootPV.Author.Handle, rootName)
						dto.RootAuthor = rootPV.Author.Handle
						dto.RootAuthorName = rootName
						dto.RootURI = rootPV.Uri
					dto.RootPost = ParsePostView(rootPV)
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

func extractSelfLabelsFromRecord(recVal interface{}) []string {
	if recVal == nil {
		return nil
	}
	raw, err := json.Marshal(recVal)
	if err != nil {
		return nil
	}
	var parsed struct {
		Labels struct {
			Values []struct {
				Val string `json:"val"`
			} `json:"values"`
		} `json:"labels"`
	}
	if json.Unmarshal(raw, &parsed) != nil {
		return nil
	}
	var out []string
	for _, v := range parsed.Labels.Values {
		if v.Val != "" {
			out = append(out, v.Val)
		}
	}
	return out
}

func extractVideoCaptionsFromRecord(recVal interface{}, authorDid string) []VideoCaptionDTO {
	if recVal == nil || authorDid == "" {
		return nil
	}
	raw, err := json.Marshal(recVal)
	if err != nil {
		return nil
	}
	type capRaw struct {
		Lang string `json:"lang"`
		File struct {
			Ref struct {
				Link string `json:"$link"`
			} `json:"ref"`
		} `json:"file"`
	}
	var parsed struct {
		Embed struct {
			Captions []capRaw `json:"captions"`
			Media    struct {
				Captions []capRaw `json:"captions"`
			} `json:"media"`
		} `json:"embed"`
	}
	if json.Unmarshal(raw, &parsed) != nil {
		return nil
	}
	caps := parsed.Embed.Captions
	if len(caps) == 0 {
		caps = parsed.Embed.Media.Captions
	}
	var out []VideoCaptionDTO
	for _, c := range caps {
		if c.File.Ref.Link != "" {
			lang := c.Lang
			if lang == "" {
				lang = "en"
			}
			out = append(out, VideoCaptionDTO{
				Lang: lang,
				URL:  "https://bsky.social/xrpc/com.atproto.sync.getBlob?did=" + url.QueryEscape(authorDid) + "&cid=" + url.QueryEscape(c.File.Ref.Link),
			})
		}
	}
	return out
}

func ExtractVideoFromRecord(recVal interface{}, authorDid string) *VideoEmbedDTO {
	if recVal == nil || authorDid == "" {
		return nil
	}
	raw, err := json.Marshal(recVal)
	if err != nil {
		return nil
	}
	var rec bsky.FeedPost
	if json.Unmarshal(raw, &rec) != nil || rec.Embed == nil {
		return nil
	}
	var vid *bsky.EmbedVideo
	if rec.Embed.EmbedVideo != nil {
		vid = rec.Embed.EmbedVideo
	} else if rec.Embed.EmbedRecordWithMedia != nil && rec.Embed.EmbedRecordWithMedia.Media != nil && rec.Embed.EmbedRecordWithMedia.Media.EmbedVideo != nil {
		vid = rec.Embed.EmbedRecordWithMedia.Media.EmbedVideo
	}
	if vid == nil || vid.Video == nil {
		return nil
	}
	cid := vid.Video.Ref.String()
	if cid == "" {
		return nil
	}
	return &VideoEmbedDTO{
		Playlist:     fmt.Sprintf("https://video.bsky.app/watch/%s/%s/playlist.m3u8", url.PathEscape(authorDid), url.PathEscape(cid)),
		Thumbnail:    fmt.Sprintf("https://video.bsky.app/watch/%s/%s/thumbnail.jpg", url.PathEscape(authorDid), url.PathEscape(cid)),
		Alt:          safeString(vid.Alt),
		Presentation: safeString(vid.Presentation),
		Captions:     extractVideoCaptionsFromRecord(recVal, authorDid),
	}
}

func ParsePostView(post *bsky.FeedDefs_PostView) *PostDTO {
	if post == nil { return nil }
	authorName := ""
	if post.Author.DisplayName != nil { authorName = *post.Author.DisplayName }
	CacheAuthor(post.Author.Did, post.Author.Handle, authorName)

	authorVerified := false
	if post.Author.Verification != nil && post.Author.Verification.VerifiedStatus == "valid" {
		authorVerified = true
	}
	
	replyCount, repostCount, likeCount := int64(0), int64(0), int64(0)
	if post.ReplyCount != nil { replyCount = *post.ReplyCount }
	if post.RepostCount != nil { repostCount = *post.RepostCount }
	if post.LikeCount != nil { likeCount = *post.LikeCount }

	var recVal interface{}
	if post.Record != nil { recVal = post.Record.Val }

	var postLabels []string
	addLabel := func(val string) {
		val = strings.TrimSpace(val)
		if val == "" || strings.HasPrefix(val, "!") {
			return
		}
		if !containsString(postLabels, val) {
			postLabels = append(postLabels, val)
		}
	}
	for _, l := range post.Labels {
		if l != nil {
			addLabel(l.Val)
		}
	}
	if post.Author != nil {
		for _, l := range post.Author.Labels {
			if l != nil {
				addLabel(l.Val)
			}
		}
	}
	for _, sl := range extractSelfLabelsFromRecord(recVal) {
		addLabel(sl)
	}

	var imageAlts []string
	var images []*ImageDTO
	if post.Embed != nil {
		var imgList []*bsky.EmbedImages_ViewImage
		if post.Embed.EmbedImages_View != nil {
			imgList = post.Embed.EmbedImages_View.Images
		} else if post.Embed.EmbedGallery_View != nil {
			for _, gItem := range post.Embed.EmbedGallery_View.Items {
				if gItem != nil && gItem.EmbedGallery_ViewImage != nil {
					gv := gItem.EmbedGallery_ViewImage
					imgList = append(imgList, &bsky.EmbedImages_ViewImage{
						Thumb:       gv.Thumbnail,
						Fullsize:    gv.Fullsize,
						Alt:         gv.Alt,
						AspectRatio: gv.AspectRatio,
					})
				}
			}
		} else if post.Embed.EmbedRecordWithMedia_View != nil && post.Embed.EmbedRecordWithMedia_View.Media != nil {
			if post.Embed.EmbedRecordWithMedia_View.Media.EmbedImages_View != nil {
				imgList = post.Embed.EmbedRecordWithMedia_View.Media.EmbedImages_View.Images
			} else if post.Embed.EmbedRecordWithMedia_View.Media.EmbedGallery_View != nil {
				for _, gItem := range post.Embed.EmbedRecordWithMedia_View.Media.EmbedGallery_View.Items {
					if gItem != nil && gItem.EmbedGallery_ViewImage != nil {
						gv := gItem.EmbedGallery_ViewImage
						imgList = append(imgList, &bsky.EmbedImages_ViewImage{
							Thumb:       gv.Thumbnail,
							Fullsize:    gv.Fullsize,
							Alt:         gv.Alt,
							AspectRatio: gv.AspectRatio,
						})
					}
				}
			}
		}

		for _, img := range imgList {
			if img == nil {
				continue
			}
			alt := img.Alt
			if alt != "" {
				imageAlts = append(imageAlts, alt)
			} else {
				imageAlts = append(imageAlts, "")
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
	if len(images) == 0 && recVal != nil {
		recAlts, recImages := ExtractImagesFromRecord(recVal, post.Author.Did)
		if len(recImages) > 0 {
			images = recImages
			imageAlts = recAlts
		}
	}

	var quotePost *PostDTO
	quoteDetached := false
	quoteDetachedURI := ""
	if post.Embed != nil {
		var rv *bsky.EmbedRecord_ViewRecord
		if post.Embed.EmbedRecord_View != nil && post.Embed.EmbedRecord_View.Record != nil {
			rv = post.Embed.EmbedRecord_View.Record.EmbedRecord_ViewRecord
			if post.Embed.EmbedRecord_View.Record.EmbedRecord_ViewDetached != nil {
				quoteDetached = true
				quoteDetachedURI = post.Embed.EmbedRecord_View.Record.EmbedRecord_ViewDetached.Uri
			}
		} else if post.Embed.EmbedRecordWithMedia_View != nil && post.Embed.EmbedRecordWithMedia_View.Record != nil && post.Embed.EmbedRecordWithMedia_View.Record.Record != nil {
			rv = post.Embed.EmbedRecordWithMedia_View.Record.Record.EmbedRecord_ViewRecord
			if post.Embed.EmbedRecordWithMedia_View.Record.Record.EmbedRecord_ViewDetached != nil {
				quoteDetached = true
				quoteDetachedURI = post.Embed.EmbedRecordWithMedia_View.Record.Record.EmbedRecord_ViewDetached.Uri
			}
		}

		if rv != nil {
			var quoteRecVal interface{}
			if rv.Value != nil {
				quoteRecVal = rv.Value.Val
			}
			qVerified := false
			if rv.Author != nil && rv.Author.Verification != nil && rv.Author.Verification.VerifiedStatus == "valid" {
				qVerified = true
			}
			quotePost = &PostDTO{
				URI:            rv.Uri,
				CID:            rv.Cid,
				AuthorHandle:   rv.Author.Handle,
				AuthorDID:      rv.Author.Did,
				AuthorVerified: qVerified,
				Text:           ParseFeedPost(quoteRecVal),
				CreatedAt:      rv.IndexedAt,
			}
			if rv.Author.DisplayName != nil {
				quotePost.AuthorName = *rv.Author.DisplayName
			}
			CacheAuthor(rv.Author.Did, rv.Author.Handle, quotePost.AuthorName)

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
							quotePost.ImageAlts = append(quotePost.ImageAlts, "")
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
				if emb.EmbedRecordWithMedia_View != nil && emb.EmbedRecordWithMedia_View.Media != nil {
					media := emb.EmbedRecordWithMedia_View.Media
					if media.EmbedImages_View != nil {
						for _, img := range media.EmbedImages_View.Images {
							if img == nil {
								continue
							}
							alt := img.Alt
							if alt != "" {
								quotePost.ImageAlts = append(quotePost.ImageAlts, alt)
							} else {
								quotePost.ImageAlts = append(quotePost.ImageAlts, "")
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
					if media.EmbedVideo_View != nil && quotePost.Video == nil {
						v := media.EmbedVideo_View
						quotePost.Video = &VideoEmbedDTO{
							Playlist:     v.Playlist,
							Thumbnail:    safeString(v.Thumbnail),
							Alt:          safeString(v.Alt),
							Presentation: safeString(v.Presentation),
							Captions:     extractVideoCaptionsFromRecord(quoteRecVal, rv.Author.Did),
						}
						if quotePost.Video.Alt == "" {
							quotePost.Video.Alt = ExtractVideoAltFromRecord(quoteRecVal)
						}
						quotePost.HasMedia = true
					}
					if media.EmbedExternal_View != nil && media.EmbedExternal_View.External != nil && quotePost.External == nil {
						ext := media.EmbedExternal_View.External
						quotePost.External = &ExternalEmbedDTO{
							URI:         ext.Uri,
							Title:       ext.Title,
							Description: ext.Description,
							Thumb:       safeString(ext.Thumb),
						}
						quotePost.HasMedia = true
					}
				}
				if emb.EmbedVideo_View != nil && quotePost.Video == nil {
					v := emb.EmbedVideo_View
					quotePost.Video = &VideoEmbedDTO{
						Playlist:     v.Playlist,
						Thumbnail:    safeString(v.Thumbnail),
						Alt:          safeString(v.Alt),
						Presentation: safeString(v.Presentation),
						Captions:     extractVideoCaptionsFromRecord(quoteRecVal, rv.Author.Did),
					}
					if quotePost.Video.Alt == "" {
						quotePost.Video.Alt = ExtractVideoAltFromRecord(quoteRecVal)
					}
					quotePost.HasMedia = true
				}
				if emb.EmbedExternal_View != nil && emb.EmbedExternal_View.External != nil && quotePost.External == nil {
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
			if len(quotePost.Images) == 0 && quoteRecVal != nil {
				recAlts, recImages := ExtractImagesFromRecord(quoteRecVal, rv.Author.Did)
				if len(recImages) > 0 {
					quotePost.Images = recImages
					quotePost.ImageAlts = recAlts
					quotePost.HasMedia = true
				}
			}
			if quotePost.External == nil && quoteRecVal != nil {
				quotePost.External = ExtractExternalFromRecord(quoteRecVal)
				if quotePost.External != nil {
					quotePost.HasMedia = true
				}
			}
			if quotePost.Video == nil && quoteRecVal != nil {
				quotePost.Video = ExtractVideoFromRecord(quoteRecVal, rv.Author.Did)
				if quotePost.Video != nil {
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
				Captions:     extractVideoCaptionsFromRecord(recVal, post.Author.Did),
			}
		} else if post.Embed.EmbedRecordWithMedia_View != nil && post.Embed.EmbedRecordWithMedia_View.Media != nil && post.Embed.EmbedRecordWithMedia_View.Media.EmbedVideo_View != nil {
			v := post.Embed.EmbedRecordWithMedia_View.Media.EmbedVideo_View
			video = &VideoEmbedDTO{
				Playlist:     v.Playlist,
				Thumbnail:    safeString(v.Thumbnail),
				Alt:          safeString(v.Alt),
				Presentation: safeString(v.Presentation),
				Captions:     extractVideoCaptionsFromRecord(recVal, post.Author.Did),
			}
		}
		if video != nil && video.Alt == "" {
			video.Alt = ExtractVideoAltFromRecord(recVal)
		}
	}
	if video == nil && recVal != nil {
		video = ExtractVideoFromRecord(recVal, post.Author.Did)
	}

	viewerLike := ""
	if post.Viewer != nil && post.Viewer.Like != nil {
		viewerLike = *post.Viewer.Like
	}

	viewerRepost := ""
	if post.Viewer != nil && post.Viewer.Repost != nil {
		viewerRepost = *post.Viewer.Repost
	}

	viewerThreadMuted := false
	if post.Viewer != nil && post.Viewer.ThreadMuted != nil {
		viewerThreadMuted = *post.Viewer.ThreadMuted
	}

	embeddingDisabled := false
	replyDisabled := false
	if post.Viewer != nil {
		if post.Viewer.EmbeddingDisabled != nil {
			embeddingDisabled = *post.Viewer.EmbeddingDisabled
		}
		if post.Viewer.ReplyDisabled != nil {
			replyDisabled = *post.Viewer.ReplyDisabled
		}
	}

	isReply, replyToURI, replyToDID, rootURI, rootDID := ExtractReplyMetaFromRecord(recVal)
	replyToAuthor := ""
	replyToAuthorName := ""
	if isReply {
		if replyToDID != "" && replyToDID == post.Author.Did {
			replyToAuthor = post.Author.Handle
			replyToAuthorName = authorName
		} else if author, ok := GetAuthorForDID(replyToDID); ok && author.Handle != "" {
			replyToAuthor = author.Handle
			replyToAuthorName = author.DisplayName
		} else {
			replyToAuthor = replyToDID
		}
	}

	rootAuthor := ""
	rootAuthorName := ""
	if isReply && rootDID != "" {
		if rootDID == post.Author.Did {
			rootAuthor = post.Author.Handle
			rootAuthorName = authorName
		} else if author, ok := GetAuthorForDID(rootDID); ok && author.Handle != "" {
			rootAuthor = author.Handle
			rootAuthorName = author.DisplayName
		} else {
			rootAuthor = rootDID
		}
	}

	return &PostDTO{
		URI:               post.Uri,
		CID:               post.Cid,
		AuthorName:        authorName,
		AuthorHandle:      post.Author.Handle,
		AuthorDID:         post.Author.Did,
		AuthorVerified:    authorVerified,
		Text:              ParseFeedPost(recVal),
		CreatedAt:         post.IndexedAt,
		ReplyCount:        replyCount,
		RepostCount:       repostCount,
		LikeCount:         likeCount,
		IsReply:           isReply,
		ReplyToAuthor:     replyToAuthor,
		ReplyToAuthorName: replyToAuthorName,
		ReplyToURI:        replyToURI,
		RootAuthor:        rootAuthor,
		RootAuthorName:    rootAuthorName,
		RootURI:           rootURI,
		QuotePost:         quotePost,
		QuoteDetached:     quoteDetached,
		QuoteDetachedURI:  quoteDetachedURI,
		ImageAlts:         imageAlts,
		Images:            images,
		External:          external,
		Video:             video,
		HasMedia:          (len(images) > 0) || (external != nil) || (video != nil) || (post.Embed != nil && (post.Embed.EmbedImages_View != nil || post.Embed.EmbedGallery_View != nil || post.Embed.EmbedRecordWithMedia_View != nil)),
		ViewerLike:        viewerLike,
		ViewerRepost:      viewerRepost,
		ViewerThreadMuted: viewerThreadMuted,
		EmbeddingDisabled: embeddingDisabled,
		ReplyDisabled:     replyDisabled,
		Labels:            postLabels,
	}
}

// GetAuthorFeed retrieves a specific author's feed
func (s *FeedService) GetAuthorFeed(actor string, cursor string, limit int64, filter string) (*FeedDTO, error) {
	if filter == "" {
		filter = "posts_with_replies"
	}
	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()
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
				if item.Reason != nil && item.Reason.FeedDefs_ReasonRepost != nil {
					if item.Reason.FeedDefs_ReasonRepost.By.DisplayName != nil && *item.Reason.FeedDefs_ReasonRepost.By.DisplayName != "" {
						dto.RepostedBy = *item.Reason.FeedDefs_ReasonRepost.By.DisplayName
					} else {
						dto.RepostedBy = item.Reason.FeedDefs_ReasonRepost.By.Handle
					}
					dto.RepostedByHandle = item.Reason.FeedDefs_ReasonRepost.By.Handle
				}
				if item.Reply != nil {
					if item.Reply.Parent != nil && item.Reply.Parent.FeedDefs_PostView != nil {
						parentPV := item.Reply.Parent.FeedDefs_PostView
						parentName := ""
						if parentPV.Author.DisplayName != nil {
							parentName = *parentPV.Author.DisplayName
						}
						CacheAuthor(parentPV.Author.Did, parentPV.Author.Handle, parentName)
						dto.IsReply = true
						dto.ReplyToAuthor = parentPV.Author.Handle
						dto.ReplyToAuthorName = parentName
						dto.ReplyToURI = parentPV.Uri
						dto.ParentPost = ParsePostView(parentPV)
					}
					if item.Reply.Root != nil && item.Reply.Root.FeedDefs_PostView != nil {
						rootPV := item.Reply.Root.FeedDefs_PostView
						rootName := ""
						if rootPV.Author.DisplayName != nil {
							rootName = *rootPV.Author.DisplayName
						}
						CacheAuthor(rootPV.Author.Did, rootPV.Author.Handle, rootName)
						dto.RootAuthor = rootPV.Author.Handle
						dto.RootAuthorName = rootName
						dto.RootURI = rootPV.Uri
						dto.RootPost = ParsePostView(rootPV)
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
	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()
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
	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()
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
		
		var extractReplies func(thread *bsky.FeedDefs_ThreadViewPost, rootAuthor string, rootAuthorName string, rootURI string)
		extractReplies = func(thread *bsky.FeedDefs_ThreadViewPost, rootAuthor string, rootAuthorName string, rootURI string) {
			if thread == nil {
				return
			}
			parentName := ""
			if thread.Post.Author.DisplayName != nil {
				parentName = *thread.Post.Author.DisplayName
			}
			for _, rep := range thread.Replies {
				if rep.FeedDefs_ThreadViewPost != nil {
					postDTO := ParsePostView(rep.FeedDefs_ThreadViewPost.Post)
					if postDTO != nil {
						postDTO.IsReply = true
						postDTO.ReplyToAuthor = thread.Post.Author.Handle
						postDTO.ReplyToAuthorName = parentName
						postDTO.ReplyToURI = thread.Post.Uri
						if rootAuthor != "" {
							postDTO.RootAuthor = rootAuthor
							postDTO.RootAuthorName = rootAuthorName
							postDTO.RootURI = rootURI
						}
						out.Posts = append(out.Posts, postDTO)
						extractReplies(rep.FeedDefs_ThreadViewPost, rootAuthor, rootAuthorName, rootURI)
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
			rootAuthor := ""
			rootAuthorName := ""
			rootURI := ""
			if len(out.Posts) > 0 && out.Posts[0] != nil {
				rootAuthor = out.Posts[0].AuthorHandle
				rootAuthorName = out.Posts[0].AuthorName
				rootURI = out.Posts[0].URI
			} else if targetDTO != nil {
				rootAuthor = targetDTO.AuthorHandle
				rootAuthorName = targetDTO.AuthorName
				rootURI = targetDTO.URI
			}
			extractReplies(res.Thread.FeedDefs_ThreadViewPost, rootAuthor, rootAuthorName, rootURI)
		}
		return nil
	})
	return out, err
}

func (s *FeedService) GetListFeed(listUri string, cursor string, limit int64) (*FeedDTO, error) {
	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()
	var out *FeedDTO
	err := s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		res, err := bsky.FeedGetListFeed(ctx, c, cursor, limit, listUri, "")
		if err != nil {
			return err
		}
		
		out = &FeedDTO{Cursor: safeString(res.Cursor)}
		for _, item := range res.Feed {
			if item.Post != nil {
				dto := ParsePostView(item.Post)
				if item.Reason != nil && item.Reason.FeedDefs_ReasonRepost != nil {
					if item.Reason.FeedDefs_ReasonRepost.By.DisplayName != nil && *item.Reason.FeedDefs_ReasonRepost.By.DisplayName != "" {
						dto.RepostedBy = *item.Reason.FeedDefs_ReasonRepost.By.DisplayName
					} else {
						dto.RepostedBy = item.Reason.FeedDefs_ReasonRepost.By.Handle
					}
					dto.RepostedByHandle = item.Reason.FeedDefs_ReasonRepost.By.Handle
				}
				if item.Reply != nil {
					if item.Reply.Parent != nil && item.Reply.Parent.FeedDefs_PostView != nil {
						parentPV := item.Reply.Parent.FeedDefs_PostView
						parentName := ""
						if parentPV.Author.DisplayName != nil {
							parentName = *parentPV.Author.DisplayName
						}
						CacheAuthor(parentPV.Author.Did, parentPV.Author.Handle, parentName)
						dto.IsReply = true
						dto.ReplyToAuthor = parentPV.Author.Handle
						dto.ReplyToAuthorName = parentName
						dto.ReplyToURI = parentPV.Uri
						dto.ParentPost = ParsePostView(parentPV)
					}
					if item.Reply.Root != nil && item.Reply.Root.FeedDefs_PostView != nil {
						rootPV := item.Reply.Root.FeedDefs_PostView
						rootName := ""
						if rootPV.Author.DisplayName != nil {
							rootName = *rootPV.Author.DisplayName
						}
						CacheAuthor(rootPV.Author.Did, rootPV.Author.Handle, rootName)
						dto.RootAuthor = rootPV.Author.Handle
						dto.RootAuthorName = rootName
						dto.RootURI = rootPV.Uri
						dto.RootPost = ParsePostView(rootPV)
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
	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()
	var out []*SavedFeedDTO
	err := s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		res, err := bsky.ActorGetPreferences(ctx, c)
		if err != nil {
			return err
		}

		var feedUris []string
		pinnedMap := map[string]bool{}
		foundV2 := false

		for _, pref := range res.Preferences {
			if pref.ActorDefs_SavedFeedsPrefV2 != nil {
				foundV2 = true
				for _, item := range pref.ActorDefs_SavedFeedsPrefV2.Items {
					if item != nil && (item.Type == "feed" || strings.Contains(item.Value, "/app.bsky.feed.generator/")) {
						if item.Value != "" && !containsString(feedUris, item.Value) {
							feedUris = append(feedUris, item.Value)
						}
						if item.Pinned && item.Value != "" {
							pinnedMap[item.Value] = true
						}
					}
				}
			}
		}

		if !foundV2 || len(feedUris) == 0 {
			for _, pref := range res.Preferences {
				if pref.ActorDefs_SavedFeedsPref != nil {
					for _, uri := range pref.ActorDefs_SavedFeedsPref.Saved {
						if uri != "" && !containsString(feedUris, uri) {
							feedUris = append(feedUris, uri)
						}
					}
					for _, p := range pref.ActorDefs_SavedFeedsPref.Pinned {
						if p != "" {
							pinnedMap[p] = true
						}
					}
				}
			}
		}

		if len(feedUris) > 0 {
			genRes, err := bsky.FeedGetFeedGenerators(ctx, c, feedUris)
			if err == nil && genRes != nil {
				genMap := make(map[string]*bsky.FeedDefs_GeneratorView)
				for _, gen := range genRes.Feeds {
					if gen != nil {
						genMap[gen.Uri] = gen
					}
				}
				for _, uri := range feedUris {
					if gen, ok := genMap[uri]; ok {
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
		}
		return nil
	})
	if out == nil {
		out = []*SavedFeedDTO{}
	}
	return out, err
}


func (s *FeedService) GetCustomFeed(feedUri string, cursor string, limit int64) (*FeedDTO, error) {
	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()
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
				if dto != nil {
					dto.FeedContext = safeString(item.FeedContext)
				}
				if item.Reason != nil && item.Reason.FeedDefs_ReasonRepost != nil {
					if item.Reason.FeedDefs_ReasonRepost.By.DisplayName != nil && *item.Reason.FeedDefs_ReasonRepost.By.DisplayName != "" {
						dto.RepostedBy = *item.Reason.FeedDefs_ReasonRepost.By.DisplayName
					} else {
						dto.RepostedBy = item.Reason.FeedDefs_ReasonRepost.By.Handle
					}
					dto.RepostedByHandle = item.Reason.FeedDefs_ReasonRepost.By.Handle
				}
				if item.Reply != nil {
					if item.Reply.Parent != nil && item.Reply.Parent.FeedDefs_PostView != nil {
						parentPV := item.Reply.Parent.FeedDefs_PostView
						parentName := ""
						if parentPV.Author.DisplayName != nil {
							parentName = *parentPV.Author.DisplayName
						}
						CacheAuthor(parentPV.Author.Did, parentPV.Author.Handle, parentName)
						dto.IsReply = true
						dto.ReplyToAuthor = parentPV.Author.Handle
						dto.ReplyToAuthorName = parentName
						dto.ReplyToURI = parentPV.Uri
						dto.ParentPost = ParsePostView(parentPV)
					}
					if item.Reply.Root != nil && item.Reply.Root.FeedDefs_PostView != nil {
						rootPV := item.Reply.Root.FeedDefs_PostView
						rootName := ""
						if rootPV.Author.DisplayName != nil {
							rootName = *rootPV.Author.DisplayName
						}
						CacheAuthor(rootPV.Author.Did, rootPV.Author.Handle, rootName)
						dto.RootAuthor = rootPV.Author.Handle
						dto.RootAuthorName = rootName
						dto.RootURI = rootPV.Uri
						dto.RootPost = ParsePostView(rootPV)
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
	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()
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
	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()
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
	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()
	var out *FeedDTO
	err := s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		res, err := bsky.FeedGetQuotes(ctx, c, cid, cursor, 100, "", uri)
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
	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()
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

func parseGeneratorView(gen *bsky.FeedDefs_GeneratorView) *FeedGeneratorDTO {
	if gen == nil {
		return nil
	}
	avatar := safeString(gen.Avatar)
	desc := safeString(gen.Description)
	likes := int64(0)
	if gen.LikeCount != nil {
		likes = *gen.LikeCount
	}
	creator := ""
	if gen.Creator != nil {
		creator = gen.Creator.Handle
	}
	acceptsInteractions := false
	if gen.AcceptsInteractions != nil {
		acceptsInteractions = *gen.AcceptsInteractions
	}
	viewerLike := ""
	if gen.Viewer != nil && gen.Viewer.Like != nil {
		viewerLike = *gen.Viewer.Like
	}
	return &FeedGeneratorDTO{
		URI:                 gen.Uri,
		CID:                 gen.Cid,
		DID:                 gen.Did,
		Creator:             creator,
		DisplayName:         gen.DisplayName,
		Description:         desc,
		LikeCount:           likes,
		Avatar:              avatar,
		AcceptsInteractions: acceptsInteractions,
		ViewerLike:          viewerLike,
	}
}

func (s *FeedService) GetPopularFeedGenerators(cursor string, query string) (*FeedGeneratorResponseDTO, error) {
	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()
	var out *FeedGeneratorResponseDTO
	err := s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		res, err := bsky.UnspeccedGetPopularFeedGenerators(ctx, c, cursor, 100, query)
		if err != nil {
			return err
		}
		out = &FeedGeneratorResponseDTO{Cursor: safeString(res.Cursor)}
		for _, gen := range res.Feeds {
			if g := parseGeneratorView(gen); g != nil {
				out.Feeds = append(out.Feeds, g)
			}
		}
		return nil
	})
	return out, err
}

// GetTrends lists what is currently trending on the network. The lexicon caps
// limit at 25, so anything above that is clamped instead of rejected.
//
// The response is decoded by hand because the trend description, which is the
// only part that explains what a topic actually is, is missing from the struct
// generated for the pinned indigo release.
func (s *FeedService) GetTrends(limit int64) (*TrendListDTO, error) {
	if limit <= 0 || limit > 25 {
		limit = 25
	}
	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()
	out := &TrendListDTO{}
	err := s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		var res struct {
			Trends []struct {
				Topic       string `json:"topic"`
				DisplayName string `json:"displayName"`
				Description string `json:"description"`
				Link        string `json:"link"`
				Category    string `json:"category"`
				Status      string `json:"status"`
				PostCount   int64  `json:"postCount"`
				StartedAt   string `json:"startedAt"`
				Actors      []struct {
					Handle string `json:"handle"`
				} `json:"actors"`
			} `json:"trends"`
		}
		params := map[string]interface{}{"limit": limit}
		if err := c.Do(ctx, xrpc.Query, "", "app.bsky.unspecced.getTrends", params, nil, &res); err != nil {
			return err
		}
		out.Trends = nil
		for _, trend := range res.Trends {
			var actors []string
			for _, actor := range trend.Actors {
				actors = append(actors, actor.Handle)
			}
			out.Trends = append(out.Trends, &TrendDTO{
				Topic:       trend.Topic,
				DisplayName: trend.DisplayName,
				Description: trend.Description,
				Link:        trend.Link,
				Category:    trend.Category,
				Status:      trend.Status,
				PostCount:   trend.PostCount,
				StartedAt:   trend.StartedAt,
				Actors:      actors,
			})
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return out, nil
}

func (s *FeedService) GetActorLikes(actor string, cursor string, limit int64) (*FeedDTO, error) {
	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()
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
			if subjStr, ok := valObj["subject"].(string); ok && strings.Contains(subjStr, "/app.bsky.feed.post/") {
				uris = append(uris, subjStr)
				return
			}
		}
		if subjObj, ok := obj["subject"].(map[string]interface{}); ok {
			if u, ok := subjObj["uri"].(string); ok && strings.Contains(u, "/app.bsky.feed.post/") {
				uris = append(uris, u)
				return
			}
		}
		if subjStr, ok := obj["subject"].(string); ok && strings.Contains(subjStr, "/app.bsky.feed.post/") {
			uris = append(uris, subjStr)
			return
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
		Posts []*bsky.FeedDefs_PostView `json:"posts"`
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
		for _, p := range postViewsStruct.Posts {
			if p != nil {
				posts = append(posts, p)
			}
		}
	}

	var altStruct struct {
		Bookmarks []*bsky.FeedDefs_PostView `json:"bookmarks"`
	}
	if json.Unmarshal(rawJSON, &altStruct) == nil {
		for _, p := range altStruct.Bookmarks {
			if p != nil && p.Uri != "" {
				posts = append(posts, p)
			}
		}
	}

	return uris, posts, cursor
}

func (s *FeedService) GetBookmarks(cursor string, limit int64) (*FeedDTO, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	out := &FeedDTO{Posts: []*PostDTO{}}
	err := s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		// Use typed indigo API: bsky.BookmarkGetBookmarks
		result, errBookmarks := bsky.BookmarkGetBookmarks(ctx, c, cursor, limit)

		if errBookmarks != nil {
			return errBookmarks
		}

		if result == nil || len(result.Bookmarks) == 0 {
			return nil
		}

		if result.Cursor != nil {
			out.Cursor = *result.Cursor
		}

		for _, bm := range result.Bookmarks {
			if bm == nil || bm.Item == nil {
				continue
			}
			pv := bm.Item.FeedDefs_PostView
			if pv == nil {
				continue
			}
			dto := ParsePostView(pv)
			if dto == nil {
				continue
			}
			dto.ViewerBookmark = "bookmarked"
			if !containsPost(out.Posts, dto.URI) {
				out.Posts = append(out.Posts, dto)
			}
		}

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

func (s *FeedService) GetActorFeeds(actor string, cursor string) (*FeedGeneratorResponseDTO, error) {
	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()
	out := &FeedGeneratorResponseDTO{Feeds: []*FeedGeneratorDTO{}}
	err := s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		res, err := bsky.FeedGetActorFeeds(ctx, c, actor, cursor, 50)
		if err != nil {
			return err
		}
		out.Cursor = safeString(res.Cursor)
		for _, gen := range res.Feeds {
			if g := parseGeneratorView(gen); g != nil {
				out.Feeds = append(out.Feeds, g)
			}
		}
		return nil
	})
	return out, err
}

func (s *FeedService) GetFeedGenerator(feedUri string) (*FeedGeneratorDTO, error) {
	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()
	var out *FeedGeneratorDTO
	err := s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		res, err := bsky.FeedGetFeedGenerator(ctx, c, feedUri)
		if err != nil {
			return err
		}
		if res != nil && res.View != nil {
			out = parseGeneratorView(res.View)
		}
		return nil
	})
	return out, err
}

func (s *FeedService) GetSuggestedFeeds(cursor string) (*FeedGeneratorResponseDTO, error) {
	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()
	out := &FeedGeneratorResponseDTO{Feeds: []*FeedGeneratorDTO{}}
	err := s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		res, err := bsky.FeedGetSuggestedFeeds(ctx, c, cursor, 50)
		if err != nil {
			return err
		}
		out.Cursor = safeString(res.Cursor)
		for _, gen := range res.Feeds {
			if g := parseGeneratorView(gen); g != nil {
				out.Feeds = append(out.Feeds, g)
			}
		}
		return nil
	})
	return out, err
}

func (s *FeedService) LikeFeedGenerator(uri, cid string) (string, error) {
	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()
	var likeURI string
	err := s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		res, err := atproto.RepoCreateRecord(ctx, c, &atproto.RepoCreateRecord_Input{
			Collection: "app.bsky.feed.like",
			Repo:       c.Auth.Did,
			Record: &util.LexiconTypeDecoder{
				Val: &bsky.FeedLike{
					LexiconTypeID: "app.bsky.feed.like",
					CreatedAt:     nowISO8601(),
					Subject: &atproto.RepoStrongRef{
						Uri: uri,
						Cid: cid,
					},
				},
			},
		})
		if err != nil {
			return err
		}
		if res != nil {
			likeURI = res.Uri
		}
		return nil
	})
	return likeURI, err
}

func (s *FeedService) UnlikeFeedGenerator(likeUri string) error {
	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()
	return s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		parts := strings.Split(likeUri, "/")
		if len(parts) < 5 {
			return fmt.Errorf("invalid like uri")
		}
		_, err := atproto.RepoDeleteRecord(ctx, c, &atproto.RepoDeleteRecord_Input{
			Collection: "app.bsky.feed.like",
			Repo:       c.Auth.Did,
			Rkey:       parts[4],
		})
		return err
	})
}

func (s *FeedService) SendFeedInteraction(feedUri, itemUri, event, feedContext string) error {
	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()
	return s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		if event == "" {
			return fmt.Errorf("event is required")
		}
		ev := event
		if !strings.HasPrefix(ev, "app.bsky.feed.defs#") {
			ev = "app.bsky.feed.defs#" + ev
		}
		interaction := &bsky.FeedDefs_Interaction{
			Event: &ev,
		}
		if itemUri != "" {
			interaction.Item = &itemUri
		}
		if feedContext != "" {
			interaction.FeedContext = &feedContext
		}
		_, err := bsky.FeedSendInteractions(ctx, c, &bsky.FeedSendInteractions_Input{
			Feed:         &feedUri,
			Interactions: []*bsky.FeedDefs_Interaction{interaction},
		})
		return err
	})
}

func (s *FeedService) GetPostThreadV2(uri string) (*FeedDTO, error) {
	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()
	out := &FeedDTO{Posts: []*PostDTO{}}
	err := s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		res, err := bsky.UnspeccedGetPostThreadV2(ctx, c, true, uri, 6, 10, "newest")
		if err != nil {
			return err
		}
		if res == nil {
			return nil
		}
		for _, item := range res.Thread {
			if item == nil || item.Value == nil || item.Value.UnspeccedDefs_ThreadItemPost == nil {
				continue
			}
			pv := item.Value.UnspeccedDefs_ThreadItemPost.Post
			if dto := ParsePostView(pv); dto != nil {
				out.Posts = append(out.Posts, dto)
			}
		}
		if res.HasOtherReplies {
			out.Cursor = "has_other_replies"
		}
		return nil
	})
	return out, err
}

func (s *FeedService) GetPostThreadOtherV2(uri string) (*FeedDTO, error) {
	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()
	out := &FeedDTO{Posts: []*PostDTO{}}
	err := s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		res, err := bsky.UnspeccedGetPostThreadOtherV2(ctx, c, uri)
		if err != nil {
			return err
		}
		if res == nil {
			return nil
		}
		for _, item := range res.Thread {
			if item == nil || item.Value == nil || item.Value.UnspeccedDefs_ThreadItemPost == nil {
				continue
			}
			pv := item.Value.UnspeccedDefs_ThreadItemPost.Post
			if dto := ParsePostView(pv); dto != nil {
				out.Posts = append(out.Posts, dto)
			}
		}
		return nil
	})
	return out, err
}


