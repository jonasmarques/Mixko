package services

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"mime"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/bluesky-social/indigo/api/atproto"
	"github.com/bluesky-social/indigo/api/bsky"
	"github.com/bluesky-social/indigo/lex/util"
	"github.com/bluesky-social/indigo/xrpc"
	"golang.org/x/net/html"
)

// postWithMediaTimeout bounds a post that may carry a video: upload plus up to
// three minutes of transcode polling, with headroom for a slow connection.
const postWithMediaTimeout = 10 * time.Minute

type PostBuilderService struct {
	clientMgr *ATClient
}

func downloadTempFile(ctx context.Context, url string) (string, error) {
	resp, err := fetchRemote(ctx, url)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	ext := ".mp4"
	if strings.Contains(url, ".gif") {
		ext = ".gif"
	}
	tmpFile, err := os.CreateTemp("", "mixko_gif_*"+ext)
	if err != nil {
		return "", err
	}
	defer tmpFile.Close()

	// Cap the copy: the URL comes from a third-party GIF provider and an
	// unbounded body would fill the disk.
	if _, err := io.Copy(tmpFile, io.LimitReader(resp.Body, maxRemoteBodyBytes)); err != nil {
		os.Remove(tmpFile.Name())
		return "", err
	}

	return tmpFile.Name(), nil
}

func truncatePath(p string) string {
	if strings.HasPrefix(p, "data:") {
		parts := strings.SplitN(p, ",", 2)
		return parts[0] + ",<base64...>"
	}
	return p
}

func NewPostBuilderService(clientMgr *ATClient) *PostBuilderService {
	return &PostBuilderService{
		clientMgr: clientMgr,
	}
}

// CreatePost handles creating a new post with optional reply info, images, video, and link preview.
//
// rootUri/rootCid pin the thread the post belongs to. A caller publishing a
// multi-post thread should pass the root returned for the first post back in
// for every following one: it is authoritative and costs no round-trip. When
// they are empty the root is resolved from the parent instead.
func (s *PostBuilderService) CreatePost(text string, replyToUri, replyToCid string, rootUri, rootCid string, imagePaths []string, altTexts []string, videoPath string, videoAlt string, linkUrl string, language string, threadgate string, gifUrl string, videoWidth int64, videoHeight int64, listUris []string) (*PostRefDTO, error) {
	// Posting can include a video upload plus transcode polling, which runs far
	// longer than a plain API call.
	ctx, cancel := s.clientMgr.NewContextTimeout(postWithMediaTimeout)
	defer cancel()
	if len(imagePaths) != len(altTexts) {
		return nil, fmt.Errorf("length of imagePaths and altTexts must be identical")
	}

	var out *PostRefDTO

	err := s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		var langs []string
		if language != "" {
			langs = append(langs, language)
		}

		post := &bsky.FeedPost{
			LexiconTypeID: "app.bsky.feed.post",
			Text:          text,
			CreatedAt:     nowISO8601(),
			Facets:        ParseFacets(ctx, c, text),
			Langs:         langs,
		}

		// 2. Handle Replies
		if replyToUri != "" && replyToCid != "" {
			rUri, rCid := rootUri, rootCid
			if rUri == "" || rCid == "" {
				rUri, rCid = s.resolveThreadRoot(ctx, c, replyToUri, replyToCid)
			}

			post.Reply = &bsky.FeedPost_ReplyRef{
				Parent: &atproto.RepoStrongRef{
					Uri: replyToUri,
					Cid: replyToCid,
				},
				Root: &atproto.RepoStrongRef{
					Uri: rUri,
					Cid: rCid,
				},
			}
		}

		// 3. Handle Images, Video, and Link Previews
		if len(imagePaths) > 0 {
			var images []*bsky.EmbedImages_Image
			for i, path := range imagePaths {
				altText := altTexts[i]
				if altText == "" {
					return codedErrorArg(ErrCodeAltTextRequiredImage, i+1)
				}

				blobRef, err := s.uploadBlob(ctx, c, path)
				if err != nil {
					return fmt.Errorf("failed to upload image %d: %w", i+1, err)
				}

				images = append(images, &bsky.EmbedImages_Image{
					Alt:   altText,
					Image: blobRef,
				})
			}
			
			post.Embed = &bsky.FeedPost_Embed{
				EmbedImages: &bsky.EmbedImages{
					LexiconTypeID: "app.bsky.embed.images",
					Images:        images,
				},
			}
		} else if videoPath != "" || gifUrl != "" {
			altText := videoAlt
			if gifUrl != "" {
				tmpPath, err := downloadTempFile(ctx, gifUrl)
				if err != nil {
					return fmt.Errorf("failed to download GIF: %w", err)
				}
				defer os.Remove(tmpPath)
				videoPath = tmpPath
			}
			
			if altText == "" {
				return codedError(ErrCodeAltTextRequiredVideo)
			}
			// Use native video API
			blobRef, err := s.uploadVideo(ctx, c, videoPath)
			if err != nil {
				// Fallback to blob if video api fails or is not available
				blobRef, err = s.uploadBlob(ctx, c, videoPath)
				if err != nil {
					return fmt.Errorf("failed to upload video: %w", err)
				}
			}
			
			presentationStr := "gif"
			vidEmbed := &bsky.EmbedVideo{
				LexiconTypeID: "app.bsky.embed.video",
				Video:         blobRef,
				Alt:           &altText,
			}
			if videoWidth > 0 && videoHeight > 0 {
				vidEmbed.AspectRatio = &bsky.EmbedDefs_AspectRatio{
					Width:  videoWidth,
					Height: videoHeight,
				}
			}
			
			if gifUrl != "" {
				vidEmbed.Presentation = &presentationStr
			}
			
			post.Embed = &bsky.FeedPost_Embed{
				EmbedVideo: vidEmbed,
			}
		} else if linkUrl != "" {
			preview, err := GenerateLinkPreview(ctx, c, linkUrl)
			if err == nil {
				post.Embed = &bsky.FeedPost_Embed{
					EmbedExternal: preview,
				}
			}
		} else if len(post.Facets) > 0 {
			// Look for link in facets
			for _, facet := range post.Facets {
				for _, feat := range facet.Features {
					if feat.RichtextFacet_Link != nil {
						preview, err := GenerateLinkPreview(ctx, c, feat.RichtextFacet_Link.Uri)
						if err == nil {
							post.Embed = &bsky.FeedPost_Embed{
								EmbedExternal: preview,
							}
						}
						break
					}
				}
				if post.Embed != nil {
					break
				}
			}
		}

		// 4. Create the record
		input := &atproto.RepoCreateRecord_Input{
			Collection: "app.bsky.feed.post",
			Repo:       c.Auth.Did,
			Record: &util.LexiconTypeDecoder{
				Val: post,
			},
		}

		res, err := atproto.RepoCreateRecord(ctx, c, input)
		if err != nil {
			return fmt.Errorf("failed to create post record: %w", err)
		}
		
		if threadgate != "" && threadgate != "everyone" {
			_ = s.createThreadgate(ctx, c, res.Uri, threadgate, listUris)
		}

		out = &PostRefDTO{Uri: res.Uri, Cid: res.Cid}
		if post.Reply != nil {
			out.RootUri = post.Reply.Root.Uri
			out.RootCid = post.Reply.Root.Cid
		} else {
			// A post that replies to nothing opens the thread, so it is its
			// own root. Reporting it uniformly lets the caller chain the next
			// post the same way whether the thread started here or not.
			out.RootUri = res.Uri
			out.RootCid = res.Cid
		}
		return nil
	})

	return out, err
}

// resolveThreadRoot returns the root ref of the thread that parentUri sits in,
// falling back to the parent itself when the parent is a thread root or cannot
// be read.
//
// The parent record is read with com.atproto.repo.getRecord rather than
// app.bsky.feed.getPosts whenever it lives in the caller's own repo. The repo
// is read-after-write consistent; the AppView is not — it only sees a post once
// that post has travelled the firehose and been indexed, which takes long
// enough that a post published moments earlier is reliably absent. getPosts
// omits URIs it does not know without raising an error, so that miss used to
// pass silently and leave each post of a thread rooted at its own parent.
func (s *PostBuilderService) resolveThreadRoot(ctx context.Context, c *xrpc.Client, parentUri, parentCid string) (string, string) {
	if rec := s.fetchOwnPostRecord(ctx, c, parentUri); rec != nil {
		if rec.Reply != nil && rec.Reply.Root != nil && rec.Reply.Root.Uri != "" {
			return rec.Reply.Root.Uri, rec.Reply.Root.Cid
		}
		return parentUri, parentCid
	}

	// Someone else's post: it has been indexed for a while, so the AppView is
	// an accurate source for it.
	postRes, err := bsky.FeedGetPosts(ctx, c, []string{parentUri})
	if err == nil && len(postRes.Posts) > 0 {
		parentPost := postRes.Posts[0]
		if parentPost.Record != nil && parentPost.Record.Val != nil {
			if bytes, err := json.Marshal(parentPost.Record.Val); err == nil {
				var rec bsky.FeedPost
				if json.Unmarshal(bytes, &rec) == nil &&
					rec.Reply != nil && rec.Reply.Root != nil && rec.Reply.Root.Uri != "" {
					return rec.Reply.Root.Uri, rec.Reply.Root.Cid
				}
			}
		}
	}

	return parentUri, parentCid
}

// fetchOwnPostRecord reads a post record straight out of the signed-in user's
// repo. It returns nil when the URI is malformed, points at another repo or at
// another collection, or the record cannot be read.
func (s *PostBuilderService) fetchOwnPostRecord(ctx context.Context, c *xrpc.Client, uri string) *bsky.FeedPost {
	repo, collection, rkey, ok := parseATURI(uri)
	if !ok || collection != "app.bsky.feed.post" || c.Auth == nil || repo != c.Auth.Did {
		return nil
	}

	res, err := atproto.RepoGetRecord(ctx, c, "", collection, repo, rkey)
	if err != nil || res == nil || res.Value == nil || res.Value.Val == nil {
		return nil
	}

	bytes, err := json.Marshal(res.Value.Val)
	if err != nil {
		return nil
	}
	var rec bsky.FeedPost
	if json.Unmarshal(bytes, &rec) != nil {
		return nil
	}
	return &rec
}

func buildThreadgateAllow(ruleSpec string, listUris []string) ([]*bsky.FeedThreadgate_Allow_Elem, bool, bool) {
	allow := []*bsky.FeedThreadgate_Allow_Elem{}
	hasReplyRestriction := false
	disableQuotes := false

	tokens := strings.Split(ruleSpec, ",")
	for _, raw := range tokens {
		tok := strings.TrimSpace(raw)
		switch tok {
		case "", "everyone":
			// no restriction
		case "disable_quotes":
			disableQuotes = true
		case "nobody":
			hasReplyRestriction = true
		case "mentioned":
			hasReplyRestriction = true
			allow = append(allow, &bsky.FeedThreadgate_Allow_Elem{
				FeedThreadgate_MentionRule: &bsky.FeedThreadgate_MentionRule{
					LexiconTypeID: "app.bsky.feed.threadgate#mentionRule",
				},
			})
		case "following":
			hasReplyRestriction = true
			allow = append(allow, &bsky.FeedThreadgate_Allow_Elem{
				FeedThreadgate_FollowingRule: &bsky.FeedThreadgate_FollowingRule{
					LexiconTypeID: "app.bsky.feed.threadgate#followingRule",
				},
			})
		case "followers":
			hasReplyRestriction = true
			allow = append(allow, &bsky.FeedThreadgate_Allow_Elem{
				FeedThreadgate_FollowerRule: &bsky.FeedThreadgate_FollowerRule{
					LexiconTypeID: "app.bsky.feed.threadgate#followerRule",
				},
			})
		case "list":
			hasReplyRestriction = true
			for _, lUri := range listUris {
				if lUri != "" {
					allow = append(allow, &bsky.FeedThreadgate_Allow_Elem{
						FeedThreadgate_ListRule: &bsky.FeedThreadgate_ListRule{
							LexiconTypeID: "app.bsky.feed.threadgate#listRule",
							List:          lUri,
						},
					})
				}
			}
		}
	}
	return allow, hasReplyRestriction, disableQuotes
}

func (s *PostBuilderService) createThreadgate(ctx context.Context, c *xrpc.Client, postUri string, threadgate string, listUris []string) error {
	allow, hasReplyRestriction, disableQuotes := buildThreadgateAllow(threadgate, listUris)

	parts := strings.Split(postUri, "/")
	if len(parts) < 5 {
		return fmt.Errorf("invalid post uri")
	}
	rkey := parts[4]

	if disableQuotes {
		pg := &bsky.FeedPostgate{
			LexiconTypeID: "app.bsky.feed.postgate",
			Post:          postUri,
			CreatedAt:     nowISO8601(),
			EmbeddingRules: []*bsky.FeedPostgate_EmbeddingRules_Elem{
				{
					FeedPostgate_DisableRule: &bsky.FeedPostgate_DisableRule{
						LexiconTypeID: "app.bsky.feed.postgate#disableRule",
					},
				},
			},
		}
		if _, err := atproto.RepoPutRecord(ctx, c, &atproto.RepoPutRecord_Input{
			Collection: "app.bsky.feed.postgate",
			Repo:       c.Auth.Did,
			Rkey:       rkey,
			Record:     &util.LexiconTypeDecoder{Val: pg},
		}); err != nil {
			return err
		}
	}

	if !hasReplyRestriction {
		return nil
	}

	tg := &bsky.FeedThreadgate{
		LexiconTypeID: "app.bsky.feed.threadgate",
		Post:          postUri,
		CreatedAt:     nowISO8601(),
		Allow:         allow,
	}

	input := &atproto.RepoPutRecord_Input{
		Collection: "app.bsky.feed.threadgate",
		Repo:       c.Auth.Did,
		Rkey:       rkey,
		Record: &util.LexiconTypeDecoder{
			Val: tg,
		},
	}
	_, err := atproto.RepoPutRecord(ctx, c, input)
	return err
}


func (s *PostBuilderService) uploadBlob(ctx context.Context, c *xrpc.Client, path string) (*util.LexBlob, error) {
	localPath, cleanup, err := ResolvePathOrDataURL(path)
	if err != nil {
		return nil, err
	}
	defer cleanup()

	// Crop and Resize Image before upload
	buf, err := CropAndResizeImage(localPath)
	if err != nil {
		// Fallback to direct read if cropping fails (e.g. for videos or non-images)
		file, err := os.Open(localPath)
		if err != nil {
			return nil, err
		}
		defer file.Close()
		buf = file
	}
	
	res, err := atproto.RepoUploadBlob(ctx, c, buf)
	if err != nil {
		return nil, err
	}

	mimeType := "image/jpeg"
	ext := strings.ToLower(filepath.Ext(localPath))
	if m := mime.TypeByExtension(ext); m != "" {
		mimeType = m
	} else {
		switch ext {
		case ".png":
			mimeType = "image/png"
		case ".gif":
			mimeType = "image/gif"
		case ".webp":
			mimeType = "image/webp"
		case ".mp4":
			mimeType = "video/mp4"
		case ".mov":
			mimeType = "video/quicktime"
		case ".webm":
			mimeType = "video/webm"
		}
	}
	res.Blob.MimeType = mimeType

	return res.Blob, nil
}

func (s *PostBuilderService) uploadVideo(ctx context.Context, c *xrpc.Client, path string) (*util.LexBlob, error) {
	localPath, cleanup, err := ResolvePathOrDataURL(path)
	if err != nil {
		return nil, err
	}
	defer cleanup()

	// Request service auth
	authRes, err := atproto.ServerGetServiceAuth(ctx, c, "did:web:video.bsky.app", 0, "app.bsky.video.uploadVideo")
	if err != nil {
		return nil, fmt.Errorf("failed to get service auth: %w", err)
	}

	videoClient := &xrpc.Client{
		Client: c.Client,
		Host:   "https://video.bsky.app",
		Auth: &xrpc.AuthInfo{
			AccessJwt: authRes.Token,
		},
	}

	file, err := os.Open(localPath)
	if err != nil {
		return nil, err
	}
	defer file.Close()

	uploadRes, err := bsky.VideoUploadVideo(ctx, videoClient, file)
	if err != nil {
		return nil, fmt.Errorf("video upload failed: %w", err)
	}

	jobId := uploadRes.JobStatus.JobId
	
	statusAuthRes, err := atproto.ServerGetServiceAuth(ctx, c, "did:web:video.bsky.app", 0, "app.bsky.video.getJobStatus")
	if err == nil {
		videoClient.Auth.AccessJwt = statusAuthRes.Token
	}

	// Poll until complete
	for i := 0; i < 60; i++ { // wait up to 3 minutes
		// Sleeping on the context means a shutdown or cancelled post aborts the
		// wait instead of blocking for the full interval.
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case <-time.After(3 * time.Second):
		}

		statusRes, err := bsky.VideoGetJobStatus(ctx, videoClient, jobId)
		if err != nil {
			return nil, fmt.Errorf("failed to get job status: %w", err)
		}
		if statusRes.JobStatus.State == "JOB_STATE_COMPLETED" {
			return statusRes.JobStatus.Blob, nil
		}
		if statusRes.JobStatus.State == "JOB_STATE_FAILED" {
			errStr := "unknown error"
			if statusRes.JobStatus.Error != nil {
				errStr = *statusRes.JobStatus.Error
			}
			return nil, fmt.Errorf("video processing failed: %v", errStr)
		}
	}
	
	return nil, fmt.Errorf("video processing timed out")
}

// LikePost handles liking a post
func (s *PostBuilderService) LikePost(uri, cid string) (string, error) {
	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()
	var likeUri string
	err := s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		input := &atproto.RepoCreateRecord_Input{
			Collection: "app.bsky.feed.like",
			Repo:       c.Auth.Did,
			Record: &util.LexiconTypeDecoder{
				Val: &bsky.FeedLike{
					LexiconTypeID: "app.bsky.feed.like",
					Subject: &atproto.RepoStrongRef{
						Uri: uri,
						Cid: cid,
					},
					CreatedAt: nowISO8601(),
				},
			},
		}
		res, err := atproto.RepoCreateRecord(ctx, c, input)
		if err == nil && res != nil {
			likeUri = res.Uri
		}
		return err
	})
	return likeUri, err
}

// UnlikePost handles unliking a post
func (s *PostBuilderService) UnlikePost(likeUri string) error {
	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()
	return s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		parts := strings.Split(likeUri, "/")
		if len(parts) < 2 {
			return fmt.Errorf("invalid like uri")
		}
		rkey := parts[len(parts)-1]

		input := &atproto.RepoDeleteRecord_Input{
			Collection: "app.bsky.feed.like",
			Repo:       c.Auth.Did,
			Rkey:       rkey,
		}
		_, err := atproto.RepoDeleteRecord(ctx, c, input)
		return err
	})
}

// Repost handles reposting a post
func (s *PostBuilderService) Repost(uri, cid string) (string, error) {
	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()
	var retUri string
	err := s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		input := &atproto.RepoCreateRecord_Input{
			Collection: "app.bsky.feed.repost",
			Repo:       c.Auth.Did,
			Record: &util.LexiconTypeDecoder{
				Val: &bsky.FeedRepost{
					LexiconTypeID: "app.bsky.feed.repost",
					Subject: &atproto.RepoStrongRef{
						Uri: uri,
						Cid: cid,
					},
					CreatedAt: nowISO8601(),
				},
			},
		}
		out, err := atproto.RepoCreateRecord(ctx, c, input)
		if err == nil && out != nil {
			retUri = out.Uri
		}
		return err
	})
	return retUri, err
}

// QuotePost handles quoting a post
func (s *PostBuilderService) QuotePost(text, quoteUri, quoteCid string, imagePaths []string, altTexts []string, videoPath string, videoAlt string, language string, threadgate string, gifUrl string, videoWidth int64, videoHeight int64, listUris []string) (*PostRefDTO, error) {
	// Posting can include a video upload plus transcode polling, which runs far
	// longer than a plain API call.
	ctx, cancel := s.clientMgr.NewContextTimeout(postWithMediaTimeout)
	defer cancel()
	if len(imagePaths) != len(altTexts) {
		return nil, fmt.Errorf("length of imagePaths and altTexts must be identical")
	}

	var out *PostRefDTO
	err := s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		var langs []string
		if language != "" {
			langs = append(langs, language)
		}
		post := &bsky.FeedPost{
			LexiconTypeID: "app.bsky.feed.post",
			Text:          text,
			CreatedAt:     nowISO8601(),
			Facets:        ParseFacets(ctx, c, text),
			Langs:         langs,
		}

		var media *bsky.EmbedRecordWithMedia_Media

		if len(imagePaths) > 0 {
			var images []*bsky.EmbedImages_Image
			for i, path := range imagePaths {
				altText := altTexts[i]
				if altText == "" {
					return codedError(ErrCodeAltTextRequired)
				}
				blobRef, err := s.uploadBlob(ctx, c, path)
				if err != nil {
					return fmt.Errorf("failed to upload image %d: %w", i+1, err)
				}
				images = append(images, &bsky.EmbedImages_Image{
					Alt:   altText,
					Image: blobRef,
				})
			}
			media = &bsky.EmbedRecordWithMedia_Media{
				EmbedImages: &bsky.EmbedImages{
					LexiconTypeID: "app.bsky.embed.images",
					Images:        images,
				},
			}
		} else if videoPath != "" || gifUrl != "" {
			altText := videoAlt
			if gifUrl != "" {
				altText = "GIF"
				tmpPath, err := downloadTempFile(ctx, gifUrl)
				if err != nil {
					return fmt.Errorf("failed to download GIF: %w", err)
				}
				defer os.Remove(tmpPath)
				videoPath = tmpPath
			}
			if altText == "" {
				return codedError(ErrCodeAltTextRequiredVideo)
			}
			blobRef, err := s.uploadVideo(ctx, c, videoPath)
			if err != nil {
				blobRef, err = s.uploadBlob(ctx, c, videoPath)
				if err != nil {
					return fmt.Errorf("failed to upload video: %w", err)
				}
			}
			vidEmbed := &bsky.EmbedVideo{
				LexiconTypeID: "app.bsky.embed.video",
				Video:         blobRef,
				Alt:           &altText,
			}
			if videoWidth > 0 && videoHeight > 0 {
				vidEmbed.AspectRatio = &bsky.EmbedDefs_AspectRatio{
					Width:  videoWidth,
					Height: videoHeight,
				}
			}
			media = &bsky.EmbedRecordWithMedia_Media{
				EmbedVideo: vidEmbed,
			}
		}

		quoteRec := &bsky.EmbedRecord{
			LexiconTypeID: "app.bsky.embed.record",
			Record: &atproto.RepoStrongRef{
				Uri: quoteUri,
				Cid: quoteCid,
			},
		}

		if media != nil {
			post.Embed = &bsky.FeedPost_Embed{
				EmbedRecordWithMedia: &bsky.EmbedRecordWithMedia{
					LexiconTypeID: "app.bsky.embed.recordWithMedia",
					Media:         media,
					Record:        quoteRec,
				},
			}
		} else {
			post.Embed = &bsky.FeedPost_Embed{
				EmbedRecord: quoteRec,
			}
		}

		input := &atproto.RepoCreateRecord_Input{
			Collection: "app.bsky.feed.post",
			Repo:       c.Auth.Did,
			Record: &util.LexiconTypeDecoder{
				Val: post,
			},
		}

		res, err := atproto.RepoCreateRecord(ctx, c, input)
		if err != nil {
			return err
		}
		if threadgate != "" && threadgate != "everyone" {
			_ = s.createThreadgate(ctx, c, res.Uri, threadgate, listUris)
		}
		// A quote embeds the post it points at rather than replying to it, so
		// it opens a thread of its own and is its own root.
		out = &PostRefDTO{Uri: res.Uri, Cid: res.Cid, RootUri: res.Uri, RootCid: res.Cid}
		return nil
	})
	return out, err
}



// DeletePost handles deleting a post
func (s *PostBuilderService) DeletePost(uri string) error {
	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()
	return s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		parts := strings.Split(uri, "/")
		if len(parts) < 5 {
			return fmt.Errorf("invalid uri format")
		}
		rkey := parts[4]
		input := &atproto.RepoDeleteRecord_Input{
			Collection: "app.bsky.feed.post",
			Repo:       c.Auth.Did,
			Rkey:       rkey,
		}
		_, err := atproto.RepoDeleteRecord(ctx, c, input)
		return err
	})
}

// DeleteRepost handles deleting a repost
func (s *PostBuilderService) DeleteRepost(repostUri string) error {
	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()
	return s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		parts := strings.Split(repostUri, "/")
		if len(parts) < 5 {
			return fmt.Errorf("invalid uri format")
		}
		rkey := parts[4]
		input := &atproto.RepoDeleteRecord_Input{
			Collection: "app.bsky.feed.repost",
			Repo:       c.Auth.Did,
			Rkey:       rkey,
		}
		_, err := atproto.RepoDeleteRecord(ctx, c, input)
		return err
	})
}

func (s *PostBuilderService) CheckVideoStatus(jobId string) (*VideoJobStatusDTO, error) {
	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()
	var out *VideoJobStatusDTO
	err := s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		res, err := bsky.VideoGetJobStatus(ctx, c, jobId)
		if err != nil {
			return err
		}
		if res != nil && res.JobStatus != nil {
			status := res.JobStatus
			out = &VideoJobStatusDTO{
				JobId:    status.JobId,
				Did:      status.Did,
				State:    status.State,
			}
			if status.Progress != nil {
				out.Progress = *status.Progress
			}
			if status.Message != nil {
				out.Message = *status.Message
			}
			if status.Error != nil {
				out.Error = *status.Error
			}
		}
		return nil
	})
	return out, err
}

func (s *PostBuilderService) HideReply(postUri string, replyUri string) error {
	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()
	return s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		parts := strings.Split(postUri, "/")
		if len(parts) < 3 {
			return fmt.Errorf("invalid post uri")
		}
		rkey := parts[len(parts)-1]

		res, err := atproto.RepoGetRecord(ctx, c, "", "app.bsky.feed.threadgate", c.Auth.Did, rkey)
		
		var tg bsky.FeedThreadgate
		if err == nil && res != nil && res.Value != nil && res.Value.Val != nil {
			bytes, err := json.Marshal(res.Value.Val)
			if err == nil {
				json.Unmarshal(bytes, &tg)
			}
		} else {
			// Threadgate doesn't exist, create it
			tg = bsky.FeedThreadgate{
				LexiconTypeID: "app.bsky.feed.threadgate",
				Post:          postUri,
				CreatedAt:     nowISO8601(),
			}
		}

		// Ensure it's not already hidden
		for _, hidden := range tg.HiddenReplies {
			if hidden == replyUri {
				return nil
			}
		}

		tg.HiddenReplies = append(tg.HiddenReplies, replyUri)

		input := &atproto.RepoPutRecord_Input{
			Collection: "app.bsky.feed.threadgate",
			Repo:       c.Auth.Did,
			Rkey:       rkey,
			Record: &util.LexiconTypeDecoder{Val: &tg},
		}

		_, err = atproto.RepoPutRecord(ctx, c, input)
		return err
	})
}

func (s *PostBuilderService) FetchLinkCard(linkUrl string) (*ExternalEmbedDTO, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, "GET", linkUrl, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "MixkoApp/1.0 (Bluesky Client)")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("failed to fetch link metadata: HTTP %d", resp.StatusCode)
	}

	doc, err := html.Parse(resp.Body)
	if err != nil {
		return nil, err
	}

	var title, description, imageUrl string
	var f func(*html.Node)
	f = func(n *html.Node) {
		if n.Type == html.ElementNode && n.Data == "meta" {
			var name, content string
			for _, a := range n.Attr {
				if a.Key == "property" || a.Key == "name" {
					name = a.Val
				}
				if a.Key == "content" {
					content = a.Val
				}
			}
			switch name {
			case "og:title":
				title = content
			case "og:description":
				description = content
			case "og:image":
				imageUrl = content
			}
		}
		if n.Type == html.ElementNode && n.Data == "title" && title == "" && n.FirstChild != nil {
			title = n.FirstChild.Data
		}
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			f(c)
		}
	}
	f(doc)

	if title == "" {
		title = linkUrl
	}

	if imageUrl != "" && !strings.HasPrefix(imageUrl, "http") {
		parsedBase, err := url.Parse(linkUrl)
		if err == nil {
			parsedImg, err := url.Parse(imageUrl)
			if err == nil {
				imageUrl = parsedBase.ResolveReference(parsedImg).String()
			}
		}
	}

	return &ExternalEmbedDTO{
		URI:         linkUrl,
		Title:       title,
		Description: description,
		Thumb:       imageUrl,
	}, nil
}

// BookmarkPost handles bookmarking/saving a post online via ATProto
func (s *PostBuilderService) BookmarkPost(uri, cid string) (string, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	err := s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		return bsky.BookmarkCreateBookmark(ctx, c, &bsky.BookmarkCreateBookmark_Input{
			Uri: uri,
			Cid: cid,
		})
	})
	if err != nil {
		return "", fmt.Errorf("BookmarkPost failed: %w", err)
	}
	return "bookmarked_" + cid, nil
}

// UnbookmarkPost handles removing a saved post online via ATProto
func (s *PostBuilderService) UnbookmarkPost(bookmarkUri, postUri string) error {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	return s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		return bsky.BookmarkDeleteBookmark(ctx, c, &bsky.BookmarkDeleteBookmark_Input{
			Uri: postUri,
		})
	})
}

func (s *PostBuilderService) UnhideReply(postUri string, replyUri string) error {
	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()
	return s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		parts := strings.Split(postUri, "/")
		if len(parts) < 3 {
			return fmt.Errorf("invalid post uri")
		}
		rkey := parts[len(parts)-1]

		res, err := atproto.RepoGetRecord(ctx, c, "", "app.bsky.feed.threadgate", c.Auth.Did, rkey)
		if err != nil || res == nil || res.Value == nil || res.Value.Val == nil {
			return nil
		}
		var tg bsky.FeedThreadgate
		bytes, err := json.Marshal(res.Value.Val)
		if err != nil {
			return err
		}
		if err := json.Unmarshal(bytes, &tg); err != nil {
			return err
		}

		filtered := make([]string, 0, len(tg.HiddenReplies))
		for _, h := range tg.HiddenReplies {
			if h != replyUri {
				filtered = append(filtered, h)
			}
		}
		tg.HiddenReplies = filtered

		_, err = atproto.RepoPutRecord(ctx, c, &atproto.RepoPutRecord_Input{
			Collection: "app.bsky.feed.threadgate",
			Repo:       c.Auth.Did,
			Rkey:       rkey,
			Record:     &util.LexiconTypeDecoder{Val: &tg},
		})
		return err
	})
}

func (s *PostBuilderService) UpdateThreadgate(postUri string, ruleSpec string, listUris []string) error {
	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()
	return s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		parts := strings.Split(postUri, "/")
		if len(parts) < 5 {
			return fmt.Errorf("invalid post uri")
		}
		rkey := parts[4]

		allow, hasReplyRestriction, disableQuotes := buildThreadgateAllow(ruleSpec, listUris)

		if strings.Contains(ruleSpec, "disable_quotes") || strings.Contains(ruleSpec, "enable_quotes") {
			_ = s.togglePostQuotesInternal(ctx, c, postUri, disableQuotes)
		}

		res, err := atproto.RepoGetRecord(ctx, c, "", "app.bsky.feed.threadgate", c.Auth.Did, rkey)
		var existing bsky.FeedThreadgate
		hasExisting := false
		if err == nil && res != nil && res.Value != nil && res.Value.Val != nil {
			if bytes, mErr := json.Marshal(res.Value.Val); mErr == nil {
				if json.Unmarshal(bytes, &existing) == nil {
					hasExisting = true
				}
			}
		}

		if !hasReplyRestriction {
			if hasExisting && len(existing.HiddenReplies) > 0 {
				existing.Allow = nil
				_, err := atproto.RepoPutRecord(ctx, c, &atproto.RepoPutRecord_Input{
					Collection: "app.bsky.feed.threadgate",
					Repo:       c.Auth.Did,
					Rkey:       rkey,
					Record:     &util.LexiconTypeDecoder{Val: &existing},
				})
				return err
			}
			if hasExisting {
				if _, err := atproto.RepoDeleteRecord(ctx, c, &atproto.RepoDeleteRecord_Input{
					Collection: "app.bsky.feed.threadgate",
					Repo:       c.Auth.Did,
					Rkey:       rkey,
				}); err != nil {
					return err
				}
			}
			return nil
		}

		tg := bsky.FeedThreadgate{
			LexiconTypeID: "app.bsky.feed.threadgate",
			Post:          postUri,
			CreatedAt:     nowISO8601(),
			Allow:         allow,
		}
		if hasExisting {
			if existing.CreatedAt != "" {
				tg.CreatedAt = existing.CreatedAt
			}
			tg.HiddenReplies = existing.HiddenReplies
		}

		_, err = atproto.RepoPutRecord(ctx, c, &atproto.RepoPutRecord_Input{
			Collection: "app.bsky.feed.threadgate",
			Repo:       c.Auth.Did,
			Rkey:       rkey,
			Record:     &util.LexiconTypeDecoder{Val: &tg},
		})
		return err
	})
}

func (s *PostBuilderService) getExistingPostgate(ctx context.Context, c *xrpc.Client, postUri, rkey string) (*bsky.FeedPostgate, bool) {
	res, err := atproto.RepoGetRecord(ctx, c, "", "app.bsky.feed.postgate", c.Auth.Did, rkey)
	if err == nil && res != nil && res.Value != nil && res.Value.Val != nil {
		var pg bsky.FeedPostgate
		if bytes, mErr := json.Marshal(res.Value.Val); mErr == nil {
			if json.Unmarshal(bytes, &pg) == nil {
				pg.LexiconTypeID = "app.bsky.feed.postgate"
				if pg.Post == "" {
					pg.Post = postUri
				}
				if pg.CreatedAt == "" {
					pg.CreatedAt = nowISO8601()
				}
				return &pg, true
			}
		}
	}
	return &bsky.FeedPostgate{
		LexiconTypeID: "app.bsky.feed.postgate",
		Post:          postUri,
		CreatedAt:     nowISO8601(),
	}, false
}

func (s *PostBuilderService) togglePostQuotesInternal(ctx context.Context, c *xrpc.Client, postUri string, disableQuotes bool) error {
	parts := strings.Split(postUri, "/")
	if len(parts) < 5 {
		return fmt.Errorf("invalid post uri")
	}
	rkey := parts[4]

	pg, exists := s.getExistingPostgate(ctx, c, postUri, rkey)
	if disableQuotes {
		pg.EmbeddingRules = []*bsky.FeedPostgate_EmbeddingRules_Elem{
			{
				FeedPostgate_DisableRule: &bsky.FeedPostgate_DisableRule{
					LexiconTypeID: "app.bsky.feed.postgate#disableRule",
				},
			},
		}
	} else {
		pg.EmbeddingRules = nil
	}

	if len(pg.EmbeddingRules) == 0 && len(pg.DetachedEmbeddingUris) == 0 {
		if exists {
			_, err := atproto.RepoDeleteRecord(ctx, c, &atproto.RepoDeleteRecord_Input{
				Collection: "app.bsky.feed.postgate",
				Repo:       c.Auth.Did,
				Rkey:       rkey,
			})
			return err
		}
		return nil
	}

	_, err := atproto.RepoPutRecord(ctx, c, &atproto.RepoPutRecord_Input{
		Collection: "app.bsky.feed.postgate",
		Repo:       c.Auth.Did,
		Rkey:       rkey,
		Record:     &util.LexiconTypeDecoder{Val: pg},
	})
	return err
}

func (s *PostBuilderService) TogglePostQuotes(postUri string, disableQuotes bool) error {
	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()
	return s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		return s.togglePostQuotesInternal(ctx, c, postUri, disableQuotes)
	})
}

func (s *PostBuilderService) DetachQuote(quotedPostUri, quotingPostUri string) error {
	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()
	return s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		parts := strings.Split(quotedPostUri, "/")
		if len(parts) < 5 {
			return fmt.Errorf("invalid post uri")
		}
		rkey := parts[4]

		pg, _ := s.getExistingPostgate(ctx, c, quotedPostUri, rkey)
		for _, u := range pg.DetachedEmbeddingUris {
			if u == quotingPostUri {
				return nil
			}
		}
		pg.DetachedEmbeddingUris = append(pg.DetachedEmbeddingUris, quotingPostUri)

		_, err := atproto.RepoPutRecord(ctx, c, &atproto.RepoPutRecord_Input{
			Collection: "app.bsky.feed.postgate",
			Repo:       c.Auth.Did,
			Rkey:       rkey,
			Record:     &util.LexiconTypeDecoder{Val: pg},
		})
		return err
	})
}

func (s *PostBuilderService) ReattachQuote(quotedPostUri, quotingPostUri string) error {
	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()
	return s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		parts := strings.Split(quotedPostUri, "/")
		if len(parts) < 5 {
			return fmt.Errorf("invalid post uri")
		}
		rkey := parts[4]

		pg, exists := s.getExistingPostgate(ctx, c, quotedPostUri, rkey)
		if !exists {
			return nil
		}
		filtered := make([]string, 0, len(pg.DetachedEmbeddingUris))
		for _, u := range pg.DetachedEmbeddingUris {
			if u != quotingPostUri {
				filtered = append(filtered, u)
			}
		}
		pg.DetachedEmbeddingUris = filtered

		if len(pg.EmbeddingRules) == 0 && len(pg.DetachedEmbeddingUris) == 0 {
			_, err := atproto.RepoDeleteRecord(ctx, c, &atproto.RepoDeleteRecord_Input{
				Collection: "app.bsky.feed.postgate",
				Repo:       c.Auth.Did,
				Rkey:       rkey,
			})
			return err
		}

		_, err := atproto.RepoPutRecord(ctx, c, &atproto.RepoPutRecord_Input{
			Collection: "app.bsky.feed.postgate",
			Repo:       c.Auth.Did,
			Rkey:       rkey,
			Record:     &util.LexiconTypeDecoder{Val: pg},
		})
		return err
	})
}

// ApplyPostExtras attaches self-labels, video captions (.vtt), and/or postgate rules to an authored post.
func (s *PostBuilderService) ApplyPostExtras(postUri string, selfLabels []string, disableQuotes bool, captionPath string, captionLang string) error {
	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()
	return s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		if disableQuotes {
			if err := s.togglePostQuotesInternal(ctx, c, postUri, true); err != nil {
				return err
			}
		}

		if len(selfLabels) == 0 && captionPath == "" {
			return nil
		}

		parts := strings.Split(postUri, "/")
		if len(parts) < 5 {
			return fmt.Errorf("invalid post uri")
		}
		rkey := parts[4]

		rec := s.fetchOwnPostRecord(ctx, c, postUri)
		if rec == nil {
			return fmt.Errorf("post record not found")
		}

		if len(selfLabels) > 0 {
			vals := make([]*atproto.LabelDefs_SelfLabel, 0, len(selfLabels))
			for _, v := range selfLabels {
				vTrim := strings.TrimSpace(v)
				if vTrim != "" {
					vals = append(vals, &atproto.LabelDefs_SelfLabel{Val: vTrim})
				}
			}
			if len(vals) > 0 {
				rec.Labels = &bsky.FeedPost_Labels{
					LabelDefs_SelfLabels: &atproto.LabelDefs_SelfLabels{
						LexiconTypeID: "com.atproto.label.defs#selfLabels",
						Values:        vals,
					},
				}
			}
		}

		if captionPath != "" {
			localPath, cleanup, err := ResolvePathOrDataURL(captionPath)
			if err != nil {
				return err
			}
			defer cleanup()

			f, err := os.Open(localPath)
			if err != nil {
				return err
			}
			defer f.Close()

			upRes, err := atproto.RepoUploadBlob(ctx, c, f)
			if err != nil {
				return err
			}
			if upRes.Blob != nil {
				upRes.Blob.MimeType = "text/vtt"
			}
			lang := captionLang
			if lang == "" {
				lang = "en"
			}
			capItem := &bsky.EmbedVideo_Caption{
				File: upRes.Blob,
				Lang: lang,
			}
			if rec.Embed != nil {
				if rec.Embed.EmbedVideo != nil {
					rec.Embed.EmbedVideo.Captions = append(rec.Embed.EmbedVideo.Captions, capItem)
				} else if rec.Embed.EmbedRecordWithMedia != nil && rec.Embed.EmbedRecordWithMedia.Media != nil && rec.Embed.EmbedRecordWithMedia.Media.EmbedVideo != nil {
					rec.Embed.EmbedRecordWithMedia.Media.EmbedVideo.Captions = append(rec.Embed.EmbedRecordWithMedia.Media.EmbedVideo.Captions, capItem)
				}
			}
		}

		_, err := atproto.RepoPutRecord(ctx, c, &atproto.RepoPutRecord_Input{
			Collection: "app.bsky.feed.post",
			Repo:       c.Auth.Did,
			Rkey:       rkey,
			Record:     &util.LexiconTypeDecoder{Val: rec},
		})
		return err
	})
}

func (s *PostBuilderService) GetVideoUploadLimits() (*VideoUploadLimitsDTO, error) {
	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()
	var out *VideoUploadLimitsDTO
	err := s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		authOut, err := atproto.ServerGetServiceAuth(ctx, c, "did:web:video.bsky.app", 0, "app.bsky.video.getUploadLimits")
		if err != nil {
			return err
		}
		videoClient := &xrpc.Client{
			Client: c.Client,
			Host:   "https://video.bsky.app",
			Auth: &xrpc.AuthInfo{
				AccessJwt: authOut.Token,
				Did:       c.Auth.Did,
				Handle:    c.Auth.Handle,
			},
		}
		res, err := bsky.VideoGetUploadLimits(ctx, videoClient)
		if err != nil {
			return err
		}
		out = &VideoUploadLimitsDTO{
			CanUpload: res.CanUpload,
		}
		if res.RemainingDailyVideos != nil {
			out.RemainingDailyVideos = *res.RemainingDailyVideos
		}
		if res.RemainingDailyBytes != nil {
			out.RemainingDailyBytes = *res.RemainingDailyBytes
		}
		if res.Message != nil {
			out.Message = *res.Message
		}
		if res.Error != nil {
			out.Error = *res.Error
		}
		return nil
	})
	return out, err
}

func buildDraftRecord(text string, langs []string, selfLabels []string, threadgateAllow []string, disableQuotes bool) *bsky.DraftDefs_Draft {
	var labelsUnion *bsky.DraftDefs_DraftPost_Labels
	if len(selfLabels) > 0 {
		vals := make([]*atproto.LabelDefs_SelfLabel, 0, len(selfLabels))
		for _, v := range selfLabels {
			if strings.TrimSpace(v) != "" {
				vals = append(vals, &atproto.LabelDefs_SelfLabel{Val: strings.TrimSpace(v)})
			}
		}
		if len(vals) > 0 {
			labelsUnion = &bsky.DraftDefs_DraftPost_Labels{
				LabelDefs_SelfLabels: &atproto.LabelDefs_SelfLabels{
					LexiconTypeID: "com.atproto.label.defs#selfLabels",
					Values:        vals,
				},
			}
		}
	}

	var tgAllow []*bsky.DraftDefs_Draft_ThreadgateAllow_Elem
	for _, r := range threadgateAllow {
		switch strings.TrimSpace(r) {
		case "mentioned":
			tgAllow = append(tgAllow, &bsky.DraftDefs_Draft_ThreadgateAllow_Elem{
				FeedThreadgate_MentionRule: &bsky.FeedThreadgate_MentionRule{
					LexiconTypeID: "app.bsky.feed.threadgate#mentionRule",
				},
			})
		case "following":
			tgAllow = append(tgAllow, &bsky.DraftDefs_Draft_ThreadgateAllow_Elem{
				FeedThreadgate_FollowingRule: &bsky.FeedThreadgate_FollowingRule{
					LexiconTypeID: "app.bsky.feed.threadgate#followingRule",
				},
			})
		case "followers":
			tgAllow = append(tgAllow, &bsky.DraftDefs_Draft_ThreadgateAllow_Elem{
				FeedThreadgate_FollowerRule: &bsky.FeedThreadgate_FollowerRule{
					LexiconTypeID: "app.bsky.feed.threadgate#followerRule",
				},
			})
		}
	}

	var pgRules []*bsky.DraftDefs_Draft_PostgateEmbeddingRules_Elem
	if disableQuotes {
		pgRules = append(pgRules, &bsky.DraftDefs_Draft_PostgateEmbeddingRules_Elem{
			FeedPostgate_DisableRule: &bsky.FeedPostgate_DisableRule{
				LexiconTypeID: "app.bsky.feed.postgate#disableRule",
			},
		})
	}

	return &bsky.DraftDefs_Draft{
		Langs: langs,
		Posts: []*bsky.DraftDefs_DraftPost{
			{
				Text:   text,
				Labels: labelsUnion,
			},
		},
		ThreadgateAllow:        tgAllow,
		PostgateEmbeddingRules: pgRules,
	}
}

func (s *PostBuilderService) GetDrafts(cursor string) (*DraftListDTO, error) {
	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()
	out := &DraftListDTO{Drafts: []*DraftDTO{}}
	err := s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		res, err := bsky.DraftGetDrafts(ctx, c, cursor, 50)
		if err != nil {
			return err
		}
		if res.Cursor != nil {
			out.Cursor = *res.Cursor
		}
		for _, dv := range res.Drafts {
			if dv == nil || dv.Draft == nil {
				continue
			}
			d := &DraftDTO{
				ID:        dv.Id,
				CreatedAt: dv.CreatedAt,
				UpdatedAt: dv.UpdatedAt,
				Langs:     dv.Draft.Langs,
			}
			if len(dv.Draft.Posts) > 0 && dv.Draft.Posts[0] != nil {
				p0 := dv.Draft.Posts[0]
				d.Text = p0.Text
				if p0.Labels != nil && p0.Labels.LabelDefs_SelfLabels != nil {
					for _, lv := range p0.Labels.LabelDefs_SelfLabels.Values {
						if lv != nil && lv.Val != "" {
							d.SelfLabels = append(d.SelfLabels, lv.Val)
						}
					}
				}
			}
			for _, tga := range dv.Draft.ThreadgateAllow {
				if tga == nil {
					continue
				}
				if tga.FeedThreadgate_MentionRule != nil {
					d.ThreadgateAllow = append(d.ThreadgateAllow, "mentioned")
				} else if tga.FeedThreadgate_FollowingRule != nil {
					d.ThreadgateAllow = append(d.ThreadgateAllow, "following")
				} else if tga.FeedThreadgate_FollowerRule != nil {
					d.ThreadgateAllow = append(d.ThreadgateAllow, "followers")
				} else if tga.FeedThreadgate_ListRule != nil {
					d.ThreadgateAllow = append(d.ThreadgateAllow, "list:"+tga.FeedThreadgate_ListRule.List)
				}
			}
			for _, pgr := range dv.Draft.PostgateEmbeddingRules {
				if pgr != nil && pgr.FeedPostgate_DisableRule != nil {
					d.DisableQuotes = true
				}
			}
			out.Drafts = append(out.Drafts, d)
		}
		return nil
	})
	return out, err
}

func (s *PostBuilderService) CreateDraft(text string, langs []string, selfLabels []string, threadgateAllow []string, disableQuotes bool) (string, error) {
	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()
	var draftID string
	err := s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		draft := buildDraftRecord(text, langs, selfLabels, threadgateAllow, disableQuotes)
		res, err := bsky.DraftCreateDraft(ctx, c, &bsky.DraftCreateDraft_Input{
			Draft: draft,
		})
		if err != nil {
			return err
		}
		if res != nil {
			draftID = res.Id
		}
		return nil
	})
	return draftID, err
}

func (s *PostBuilderService) UpdateDraft(id string, text string, langs []string, selfLabels []string, threadgateAllow []string, disableQuotes bool) error {
	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()
	return s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		draft := buildDraftRecord(text, langs, selfLabels, threadgateAllow, disableQuotes)
		return bsky.DraftUpdateDraft(ctx, c, &bsky.DraftUpdateDraft_Input{
			Draft: &bsky.DraftDefs_DraftWithId{
				Id:    id,
				Draft: draft,
			},
		})
	})
}

func (s *PostBuilderService) DeleteDraft(id string) error {
	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()
	return s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		return bsky.DraftDeleteDraft(ctx, c, &bsky.DraftDeleteDraft_Input{
			Id: id,
		})
	})
}


