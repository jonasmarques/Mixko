package services

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/bluesky-social/indigo/api/atproto"
	"github.com/bluesky-social/indigo/api/bsky"
	"github.com/bluesky-social/indigo/lex/util"
	"github.com/bluesky-social/indigo/xrpc"
)

// postWithMediaTimeout bounds a post that may carry a video: upload plus up to
// ten minutes of transcode polling, with headroom for a slow connection.
const postWithMediaTimeout = 15 * time.Minute

// maxVideoUploadBytes is Bluesky's maximum video file size (300 MB).
const maxVideoUploadBytes = 300 * 1024 * 1024

const defaultVideoServiceHost = "https://video.bsky.app"

type PostBuilderService struct {
	clientMgr *ATClient

	// uploadMu guards uploadPath, the temp file AppendVideoChunk is filling.
	uploadMu   sync.Mutex
	uploadPath string

	videoServiceHost string
	pollInterval     time.Duration
	retryDelay       time.Duration
}

type uploadedVideo struct {
	embed     *bsky.EmbedVideo
	localPath string
	reused    bool
	cleanup   func()
}

func (s *PostBuilderService) videoHost() string {
	if s.videoServiceHost != "" {
		return strings.TrimRight(s.videoServiceHost, "/")
	}
	return defaultVideoServiceHost
}

func (s *PostBuilderService) videoPollInterval() time.Duration {
	if s.pollInterval > 0 {
		return s.pollInterval
	}
	return 2 * time.Second
}

func (s *PostBuilderService) blobRetryDelay() time.Duration {
	if s.retryDelay > 0 {
		return s.retryDelay
	}
	return 1 * time.Second
}

func detectDownloadExt(rawURL, contentType string) string {
	if contentType != "" {
		if mediaType, _, err := mime.ParseMediaType(contentType); err == nil {
			switch strings.ToLower(mediaType) {
			case "video/mp4":
				return ".mp4"
			case "image/gif":
				return ".gif"
			case "video/webm":
				return ".webm"
			case "video/quicktime":
				return ".mov"
			case "video/mpeg":
				return ".mpeg"
			}
		}
	}
	if parsed, err := url.Parse(rawURL); err == nil {
		ext := strings.ToLower(filepath.Ext(parsed.Path))
		switch ext {
		case ".mp4", ".gif", ".webm", ".mov", ".mpeg", ".mpg":
			return ext
		}
	}
	return ".mp4"
}

func downloadTempFile(ctx context.Context, rawURL string) (string, error) {
	resp, err := fetchRemote(ctx, rawURL)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	ext := detectDownloadExt(rawURL, resp.Header.Get("Content-Type"))
	tmpFile, err := os.CreateTemp("", "mixko_gif_*"+ext)
	if err != nil {
		return "", err
	}

	// The URL comes from a third-party GIF provider, so the copy is capped.
	// Reading one byte past the cap tells a file that fits from one that
	// would have been cut short.
	n, err := io.Copy(tmpFile, io.LimitReader(resp.Body, maxRemoteBodyBytes+1))
	tmpFile.Close()
	if err == nil && n > maxRemoteBodyBytes {
		err = fmt.Errorf("GIF is larger than %d MiB", maxRemoteBodyBytes>>20)
	}
	if err != nil {
		os.Remove(tmpFile.Name())
		return "", err
	}

	return tmpFile.Name(), nil
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
func (s *PostBuilderService) CreatePost(text string, replyToUri, replyToCid string, rootUri, rootCid string, imagePaths []string, altTexts []string, videoPath string, videoAlt string, linkUrl string, language string, threadgate string, gifUrl string, videoWidth int64, videoHeight int64, listUris []string, selfLabels []string, captionPath string, captionLang string) (*PostRefDTO, error) {
	// Posting can include a video upload plus transcode polling, which runs far
	// longer than a plain API call.
	ctx, cancel := s.clientMgr.NewContextTimeout(postWithMediaTimeout)
	defer cancel()
	if len(imagePaths) != len(altTexts) {
		return nil, fmt.Errorf("length of imagePaths and altTexts must be identical")
	}

	var out *PostRefDTO

	err := s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		post := newFeedPost(ctx, c, text, language, selfLabels)

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

		images, gallery, videoInfo, err := s.uploadMedia(ctx, c, imagePaths, altTexts, videoPath, videoAlt, gifUrl, videoWidth, videoHeight, captionPath, captionLang)
		if err != nil {
			return err
		}
		if videoInfo != nil && videoInfo.cleanup != nil {
			defer videoInfo.cleanup()
		}

		switch {
		case images != nil:
			post.Embed = &bsky.FeedPost_Embed{EmbedImages: images}
		case gallery != nil:
			post.Embed = &bsky.FeedPost_Embed{EmbedGallery: gallery}
		case videoInfo != nil:
			post.Embed = &bsky.FeedPost_Embed{EmbedVideo: videoInfo.embed}
		case linkUrl != "":
			if preview, err := GenerateLinkPreview(ctx, c, linkUrl); err == nil {
				post.Embed = &bsky.FeedPost_Embed{EmbedExternal: preview}
			}
		default:
			// No explicit card: use the first link in the text, if any.
			for _, facet := range post.Facets {
				for _, feat := range facet.Features {
					if feat.RichtextFacet_Link != nil {
						if preview, err := GenerateLinkPreview(ctx, c, feat.RichtextFacet_Link.Uri); err == nil {
							post.Embed = &bsky.FeedPost_Embed{EmbedExternal: preview}
						}
						break
					}
				}
				if post.Embed != nil {
					break
				}
			}
		}

		out, err = s.publishPost(ctx, c, post, threadgate, listUris, videoInfo)
		return err
	})

	return out, err
}

func newFeedPost(ctx context.Context, c *xrpc.Client, text, language string, selfLabels []string) *bsky.FeedPost {
	post := &bsky.FeedPost{
		LexiconTypeID: "app.bsky.feed.post",
		Text:          text,
		CreatedAt:     nowISO8601(),
		Facets:        ParseFacets(ctx, c, text),
	}
	if language != "" {
		post.Langs = []string{language}
	}

	var labels []*atproto.LabelDefs_SelfLabel
	for _, v := range selfLabels {
		if v = strings.TrimSpace(v); v != "" {
			labels = append(labels, &atproto.LabelDefs_SelfLabel{Val: v})
		}
	}
	if len(labels) > 0 {
		post.Labels = &bsky.FeedPost_Labels{
			LabelDefs_SelfLabels: &atproto.LabelDefs_SelfLabels{
				LexiconTypeID: "com.atproto.label.defs#selfLabels",
				Values:        labels,
			},
		}
	}
	return post
}

func (s *PostBuilderService) uploadMedia(ctx context.Context, c *xrpc.Client, imagePaths, altTexts []string, videoPath, videoAlt, gifUrl string, videoWidth, videoHeight int64, captionPath, captionLang string) (*bsky.EmbedImages, *bsky.EmbedGallery, *uploadedVideo, error) {
	if len(imagePaths) > 0 {
		limit := len(imagePaths)
		if limit > 10 {
			limit = 10
		}
		if limit > 4 {
			var items []*bsky.EmbedGallery_Items_Elem
			for i := 0; i < limit; i++ {
				if altTexts[i] == "" {
					return nil, nil, nil, codedErrorArg(ErrCodeAltTextRequiredImage, i+1)
				}
				blobRef, err := uploadBlob(ctx, c, imagePaths[i])
				if err != nil {
					return nil, nil, nil, fmt.Errorf("failed to upload image %d: %w", i+1, err)
				}
				items = append(items, &bsky.EmbedGallery_Items_Elem{
					EmbedGallery_Image: &bsky.EmbedGallery_Image{
						LexiconTypeID: "app.bsky.embed.gallery#image",
						Alt:           altTexts[i],
						Image:         blobRef,
					},
				})
			}
			return nil, &bsky.EmbedGallery{LexiconTypeID: "app.bsky.embed.gallery", Items: items}, nil, nil
		}

		var images []*bsky.EmbedImages_Image
		for i := 0; i < limit; i++ {
			if altTexts[i] == "" {
				return nil, nil, nil, codedErrorArg(ErrCodeAltTextRequiredImage, i+1)
			}
			blobRef, err := uploadBlob(ctx, c, imagePaths[i])
			if err != nil {
				return nil, nil, nil, fmt.Errorf("failed to upload image %d: %w", i+1, err)
			}
			images = append(images, &bsky.EmbedImages_Image{Alt: altTexts[i], Image: blobRef})
		}
		return &bsky.EmbedImages{LexiconTypeID: "app.bsky.embed.images", Images: images}, nil, nil, nil
	}

	if videoPath == "" && gifUrl == "" {
		return nil, nil, nil, nil
	}
	if videoAlt == "" {
		return nil, nil, nil, codedError(ErrCodeAltTextRequiredVideo)
	}

	var localPath string
	cleanup := func() {}
	if gifUrl != "" {
		tmpPath, err := downloadTempFile(ctx, gifUrl)
		if err != nil {
			return nil, nil, nil, fmt.Errorf("failed to download GIF: %w", err)
		}
		localPath = tmpPath
		cleanup = func() {
			os.Remove(tmpPath)
		}
	} else {
		resolved, resolvedCleanup, err := ResolvePathOrDataURL(videoPath)
		if err != nil {
			return nil, nil, nil, fmt.Errorf("failed to prepare video: %w", err)
		}
		localPath = resolved
		cleanup = resolvedCleanup
	}

	blobRef, reused, err := s.uploadVideo(ctx, c, localPath)
	if err != nil {
		cleanup()
		return nil, nil, nil, fmt.Errorf("failed to upload video: %w", err)
	}
	video := &bsky.EmbedVideo{
		LexiconTypeID: "app.bsky.embed.video",
		Video:         blobRef,
		Alt:           &videoAlt,
	}
	if videoWidth > 0 && videoHeight > 0 {
		video.AspectRatio = &bsky.EmbedDefs_AspectRatio{Width: videoWidth, Height: videoHeight}
	}
	if gifUrl != "" {
		presentation := "gif"
		video.Presentation = &presentation
	}
	if captionPath != "" {
		caption, err := uploadCaption(ctx, c, captionPath, captionLang)
		if err != nil {
			cleanup()
			return nil, nil, nil, fmt.Errorf("failed to upload captions: %w", err)
		}
		video.Captions = []*bsky.EmbedVideo_Caption{caption}
	}
	return nil, nil, &uploadedVideo{
		embed:     video,
		localPath: localPath,
		reused:    reused,
		cleanup:   cleanup,
	}, nil
}

func uploadCaption(ctx context.Context, c *xrpc.Client, captionPath, lang string) (*bsky.EmbedVideo_Caption, error) {
	localPath, cleanup, err := ResolvePathOrDataURL(captionPath)
	if err != nil {
		return nil, err
	}
	defer cleanup()

	f, err := os.Open(localPath)
	if err != nil {
		return nil, err
	}
	defer f.Close()

	res, err := atproto.RepoUploadBlob(ctx, c, f)
	if err != nil {
		return nil, err
	}
	res.Blob.MimeType = "text/vtt"
	if lang == "" {
		lang = "en"
	}
	return &bsky.EmbedVideo_Caption{File: res.Blob, Lang: lang}, nil
}

func isVideoBlobNotFound(err error, embed *bsky.EmbedVideo) bool {
	if err == nil || embed == nil || embed.Video == nil {
		return false
	}
	var xrpcErr *xrpc.XRPCError
	if !errors.As(err, &xrpcErr) {
		return false
	}
	if xrpcErr.ErrStr != "BlobNotFound" && !strings.Contains(xrpcErr.Message, "Could not find blob") {
		return false
	}
	videoCID := embed.Video.Ref.String()
	for _, cap := range embed.Captions {
		if cap != nil && cap.File != nil {
			capCID := cap.File.Ref.String()
			if capCID != "" && capCID != videoCID && strings.Contains(xrpcErr.Message, capCID) {
				return false
			}
		}
	}
	return true
}

func isMP4File(path string) bool {
	f, err := os.Open(path)
	if err != nil {
		return false
	}
	defer f.Close()

	var header [12]byte
	if _, err := io.ReadFull(f, header[:]); err != nil {
		return false
	}
	return string(header[4:8]) == "ftyp" && string(header[8:12]) != "qt  "
}

func uploadVideoBlobToPDS(ctx context.Context, c *xrpc.Client, localPath string) (*util.LexBlob, error) {
	f, err := os.Open(localPath)
	if err != nil {
		return nil, err
	}
	defer f.Close()

	var out atproto.RepoUploadBlob_Output
	if err := c.Do(ctx, xrpc.Procedure, "video/mp4", "com.atproto.repo.uploadBlob", nil, f, &out); err != nil {
		return nil, err
	}
	if out.Blob == nil {
		return nil, fmt.Errorf("uploadBlob returned empty blob")
	}
	if out.Blob.MimeType == "" || out.Blob.MimeType == "application/octet-stream" {
		out.Blob.MimeType = "video/mp4"
	}
	return out.Blob, nil
}

func (s *PostBuilderService) createPostRecord(ctx context.Context, c *xrpc.Client, post *bsky.FeedPost, videoInfo *uploadedVideo) (*atproto.RepoCreateRecord_Output, error) {
	createInput := func() *atproto.RepoCreateRecord_Input {
		return &atproto.RepoCreateRecord_Input{
			Collection: "app.bsky.feed.post",
			Repo:       c.Auth.Did,
			Record:     &util.LexiconTypeDecoder{Val: post},
		}
	}

	res, err := atproto.RepoCreateRecord(ctx, c, createInput())
	if err == nil || videoInfo == nil || !isVideoBlobNotFound(err, videoInfo.embed) {
		return res, err
	}

	if !videoInfo.reused {
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case <-time.After(s.blobRetryDelay()):
		}
		res, err = atproto.RepoCreateRecord(ctx, c, createInput())
		if err == nil || !isVideoBlobNotFound(err, videoInfo.embed) {
			return res, err
		}
	}

	if videoInfo.localPath == "" || !isMP4File(videoInfo.localPath) {
		return nil, err
	}

	s.clientMgr.EmitEvent("video_upload_progress", map[string]interface{}{
		"state":    "UPLOADING",
		"progress": 0,
	})
	directBlob, uploadErr := uploadVideoBlobToPDS(ctx, c, videoInfo.localPath)
	if uploadErr != nil {
		if isAuthExpired(uploadErr) {
			return nil, uploadErr
		}
		return nil, fmt.Errorf("%w (PDS blob upload fallback failed: %v)", err, uploadErr)
	}

	videoInfo.embed.Video = directBlob
	s.clientMgr.EmitEvent("video_upload_progress", map[string]interface{}{
		"state":    "JOB_STATE_COMPLETED",
		"progress": 100,
	})
	return atproto.RepoCreateRecord(ctx, c, createInput())
}

// publishPost writes the record and then applies the reply and quote
// restrictions. Once the record exists it never returns an error: the caller
// would retry and publish the post twice. A restriction that could not be
// applied is reported through Warning instead.
func (s *PostBuilderService) publishPost(ctx context.Context, c *xrpc.Client, post *bsky.FeedPost, threadgate string, listUris []string, videoInfo *uploadedVideo) (*PostRefDTO, error) {
	res, err := s.createPostRecord(ctx, c, post, videoInfo)
	if err != nil {
		return nil, fmt.Errorf("failed to create post record: %w", err)
	}
	s.discardVideoUpload()

	// A post that replies to nothing opens the thread, so it is its own root.
	// Reporting it uniformly lets the caller chain the next post the same way
	// whether the thread started here or not.
	out := &PostRefDTO{Uri: res.Uri, Cid: res.Cid, RootUri: res.Uri, RootCid: res.Cid}
	if post.Reply != nil {
		out.RootUri, out.RootCid = post.Reply.Root.Uri, post.Reply.Root.Cid
	}

	if threadgate != "" && threadgate != "everyone" && threadgate != "everybody" {
		if err := s.createThreadgate(ctx, c, res.Uri, threadgate, listUris, post.Reply != nil); err != nil {
			out.Warning = ErrCodeReplyGateFailed
		}
	}

	if e := post.Embed; e != nil && (e.EmbedVideo != nil || (e.EmbedRecordWithMedia != nil && e.EmbedRecordWithMedia.Media.EmbedVideo != nil)) {
		s.waitForVideoPostIndexed(ctx, c, res.Uri)
	}
	return out, nil
}

// AppendVideoChunk streams a picked video into a temp file piece by piece and
// returns its path, to be passed on as videoPath. Sent as one base64 string, a
// 300 MB video would sit in memory several times over. first starts a new file
// and drops the previous one.
func (s *PostBuilderService) AppendVideoChunk(ext string, first bool, chunkBase64 string) (string, error) {
	data, err := base64.StdEncoding.DecodeString(chunkBase64)
	if err != nil {
		return "", codedErrorWrap(ErrCodeDecodeBase64, err)
	}

	s.uploadMu.Lock()
	defer s.uploadMu.Unlock()

	if first {
		if s.uploadPath != "" {
			os.Remove(s.uploadPath)
			s.uploadPath = ""
		}
		switch ext {
		case ".mp4", ".mov", ".webm", ".mpeg", ".mpg":
		default:
			ext = ".mp4"
		}
		f, err := os.CreateTemp("", "mixko_upload_*"+ext)
		if err != nil {
			return "", codedErrorWrap(ErrCodeTempFileCreate, err)
		}
		f.Close()
		s.uploadPath = f.Name()
	}
	if s.uploadPath == "" {
		return "", fmt.Errorf("no video upload in progress")
	}

	f, err := os.OpenFile(s.uploadPath, os.O_APPEND|os.O_WRONLY, 0600)
	if err != nil {
		return "", codedErrorWrap(ErrCodeTempFileWrite, err)
	}
	defer f.Close()

	if info, err := f.Stat(); err == nil && info.Size()+int64(len(data)) > maxVideoUploadBytes {
		return "", fmt.Errorf("video exceeds maximum allowed size of 300 MB")
	}
	if _, err := f.Write(data); err != nil {
		return "", codedErrorWrap(ErrCodeTempFileWrite, err)
	}
	return s.uploadPath, nil
}

func (s *PostBuilderService) discardVideoUpload() {
	s.uploadMu.Lock()
	defer s.uploadMu.Unlock()
	if s.uploadPath != "" {
		os.Remove(s.uploadPath)
		s.uploadPath = ""
	}
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
		return parentUri, parentCid
	}

	if repo, collection, rkey, ok := parseATURI(parentUri); ok && collection == "app.bsky.feed.post" {
		if _, _, rawVal, err := fetchRawRecordFromPDS(ctx, s.clientMgr, c, repo, collection, rkey); err == nil && rawVal != nil {
			if bytes, err := json.Marshal(rawVal); err == nil {
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
		case "", "everyone", "everybody", "enable_quotes":
			// no reply restriction
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

func serializeThreadgateAllowList(allow []*bsky.FeedThreadgate_Allow_Elem) []map[string]interface{} {
	allowList := make([]map[string]interface{}, 0, len(allow))
	for _, elem := range allow {
		if elem == nil {
			continue
		}
		if elem.FeedThreadgate_MentionRule != nil {
			allowList = append(allowList, map[string]interface{}{
				"$type": "app.bsky.feed.threadgate#mentionRule",
			})
		} else if elem.FeedThreadgate_FollowingRule != nil {
			allowList = append(allowList, map[string]interface{}{
				"$type": "app.bsky.feed.threadgate#followingRule",
			})
		} else if elem.FeedThreadgate_FollowerRule != nil {
			allowList = append(allowList, map[string]interface{}{
				"$type": "app.bsky.feed.threadgate#followerRule",
			})
		} else if elem.FeedThreadgate_ListRule != nil {
			allowList = append(allowList, map[string]interface{}{
				"$type": "app.bsky.feed.threadgate#listRule",
				"list":  elem.FeedThreadgate_ListRule.List,
			})
		}
	}
	return allowList
}

func putThreadgateRecord(ctx context.Context, c *xrpc.Client, rkey string, postUri string, createdAt string, allow []*bsky.FeedThreadgate_Allow_Elem, hasReplyRestriction bool, hiddenReplies []string) error {
	if createdAt == "" {
		createdAt = nowISO8601()
	}
	rec := map[string]interface{}{
		"$type":     "app.bsky.feed.threadgate",
		"post":      postUri,
		"createdAt": createdAt,
	}
	if hasReplyRestriction {
		// Non-nil slice guarantees "allow": [] is serialized in JSON when nobody can reply,
		// rather than being omitted by struct tag omitempty (which ATProto interprets as everyone).
		rec["allow"] = serializeThreadgateAllowList(allow)
	}
	if len(hiddenReplies) > 0 {
		rec["hiddenReplies"] = hiddenReplies
	}
	body := map[string]interface{}{
		"repo":       c.Auth.Did,
		"collection": "app.bsky.feed.threadgate",
		"rkey":       rkey,
		"record":     rec,
	}
	var out atproto.RepoPutRecord_Output
	return c.Do(ctx, xrpc.Procedure, "application/json", "com.atproto.repo.putRecord", nil, body, &out)
}

func (s *PostBuilderService) createThreadgate(ctx context.Context, c *xrpc.Client, postUri string, threadgate string, listUris []string, isReply bool) error {
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

	if !hasReplyRestriction || isReply {
		return nil
	}

	return putThreadgateRecord(ctx, c, rkey, postUri, nowISO8601(), allow, true, nil)
}

// uploadBlob uploads an image, shrinking it first to fit the 1 MB blob limit.
func uploadBlob(ctx context.Context, c *xrpc.Client, path string) (*util.LexBlob, error) {
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

func detectVideoMimeType(filePath string) string {
	ext := strings.ToLower(filepath.Ext(filePath))
	switch ext {
	case ".mp4":
		return "video/mp4"
	case ".mov":
		return "video/quicktime"
	case ".webm":
		return "video/webm"
	case ".mpeg", ".mpg":
		return "video/mpeg"
	case ".gif":
		return "image/gif"
	default:
		if m := mime.TypeByExtension(ext); m != "" {
			return m
		}
		return "video/mp4"
	}
}

func formatVideoJobError(st *bsky.VideoDefs_JobStatus) string {
	if st == nil {
		return ""
	}
	if st.Error != nil && *st.Error != "" {
		if st.Message != nil && *st.Message != "" && *st.Message != *st.Error {
			return *st.Error + ": " + *st.Message
		}
		return *st.Error
	}
	if st.FailureCode != nil && *st.FailureCode != "" {
		return *st.FailureCode
	}
	if st.Message != nil && *st.Message != "" {
		return *st.Message
	}
	return ""
}

func (s *PostBuilderService) getVideoUploadAuthToken(ctx context.Context, c *xrpc.Client) (string, error) {
	exp := time.Now().Add(30 * time.Minute).Unix()
	pdsHost := normalizePDSHost(c.Host)
	if pdsHost == "" || pdsHost == DefaultPDSHost {
		resolved := s.clientMgr.ResolvePDSHost(ctx, c.Auth.Did)
		if resolved != "" {
			pdsHost = resolved
		}
	}
	if parsed, err := url.Parse(pdsHost); err == nil && parsed.Hostname() != "" {
		pdsDid := "did:web:" + parsed.Hostname()
		if authRes, err := atproto.ServerGetServiceAuth(ctx, c, pdsDid, exp, "com.atproto.repo.uploadBlob"); err == nil && authRes != nil && authRes.Token != "" {
			return authRes.Token, nil
		}
	}
	authRes, err := atproto.ServerGetServiceAuth(ctx, c, "did:web:video.bsky.app", exp, "app.bsky.video.uploadVideo")
	if err != nil {
		return "", err
	}
	return authRes.Token, nil
}

func (s *PostBuilderService) waitForVideoPostIndexed(ctx context.Context, c *xrpc.Client, postUri string) {
	s.clientMgr.EmitEvent("video_upload_progress", map[string]interface{}{
		"state":    "INDEXING",
		"progress": 100,
	})
	for i := 0; i < 6; i++ {
		res, err := bsky.FeedGetPosts(ctx, c, []string{postUri})
		if err == nil && res != nil && len(res.Posts) > 0 && res.Posts[0] != nil && res.Posts[0].Embed != nil {
			return
		}
		select {
		case <-ctx.Done():
			return
		case <-time.After(1 * time.Second):
		}
	}
}

func (s *PostBuilderService) tryMultipartVideoUpload(ctx context.Context, c *xrpc.Client, httpClient *http.Client, token string, localPath string, fileName string, fileSize int64) (*bsky.VideoDefs_JobStatus, error) {
	videoClient := &xrpc.Client{
		Client: httpClient,
		Host:   s.videoHost(),
		Auth: &xrpc.AuthInfo{
			AccessJwt: token,
			Did:       c.Auth.Did,
			Handle:    c.Auth.Handle,
		},
	}
	startOut, err := bsky.VideoStartUpload(ctx, videoClient, &bsky.VideoStartUpload_Input{
		MimeType:  detectVideoMimeType(localPath),
		Name:      &fileName,
		SizeBytes: fileSize,
	})
	if err != nil || startOut == nil || startOut.JobId == "" {
		if err == nil {
			err = fmt.Errorf("empty startUpload jobId")
		}
		return nil, err
	}

	f, err := os.Open(localPath)
	if err != nil {
		_, _ = bsky.VideoAbortUpload(ctx, videoClient, &bsky.VideoAbortUpload_Input{JobId: startOut.JobId})
		return nil, err
	}
	defer f.Close()

	partCount := startOut.PartCount
	if partCount <= 0 {
		partCount = 1
	}
	partSize := startOut.PartSizeBytes
	if partSize <= 0 {
		partSize = fileSize
	}

	for partNum := int64(1); partNum <= partCount; partNum++ {
		limit := partSize
		remaining := fileSize - (partNum-1)*partSize
		if remaining < limit || partNum == partCount {
			limit = remaining
		}
		if limit <= 0 {
			break
		}
		chunk := make([]byte, limit)
		n, readErr := io.ReadFull(f, chunk)
		if readErr != nil && !errors.Is(readErr, io.ErrUnexpectedEOF) && !errors.Is(readErr, io.EOF) {
			_, _ = bsky.VideoAbortUpload(ctx, videoClient, &bsky.VideoAbortUpload_Input{JobId: startOut.JobId})
			return nil, readErr
		}
		if _, upErr := bsky.VideoUploadPart(ctx, videoClient, bytes.NewReader(chunk[:n]), startOut.JobId, partNum); upErr != nil {
			_, _ = bsky.VideoAbortUpload(ctx, videoClient, &bsky.VideoAbortUpload_Input{JobId: startOut.JobId})
			return nil, upErr
		}
		s.clientMgr.EmitEvent("video_upload_progress", map[string]interface{}{
			"state":    "UPLOADING",
			"progress": (partNum * 50) / partCount,
		})
	}

	finishOut, err := bsky.VideoFinishUpload(ctx, videoClient, &bsky.VideoFinishUpload_Input{
		JobId: startOut.JobId,
	})
	if err != nil || finishOut == nil {
		_, _ = bsky.VideoAbortUpload(ctx, videoClient, &bsky.VideoAbortUpload_Input{JobId: startOut.JobId})
		if err == nil {
			err = fmt.Errorf("empty finishUpload output")
		}
		return nil, err
	}

	st := finishOut.JobStatus
	if st == nil {
		st = &bsky.VideoDefs_JobStatus{}
	}
	if finishOut.CompletedJobId != "" {
		st.JobId = finishOut.CompletedJobId
	} else if st.JobId == "" {
		st.JobId = startOut.JobId
	}
	return st, nil
}

func (s *PostBuilderService) uploadVideo(ctx context.Context, c *xrpc.Client, localPath string) (*util.LexBlob, bool, error) {
	fileInfo, err := os.Stat(localPath)
	if err != nil {
		return nil, false, err
	}
	if fileInfo.Size() > maxVideoUploadBytes {
		return nil, false, fmt.Errorf("video exceeds maximum allowed size of 300 MB")
	}

	token, err := s.getVideoUploadAuthToken(ctx, c)
	if err != nil {
		return nil, false, fmt.Errorf("failed to get service auth: %w", err)
	}

	s.clientMgr.EmitEvent("video_upload_progress", map[string]interface{}{
		"state":    "UPLOADING",
		"progress": 0,
	})

	fileName := filepath.Base(localPath)
	if fileName == "" || fileName == "." {
		fileName = fmt.Sprintf("video_%d.mp4", time.Now().UnixNano())
	}

	httpClient := c.Client
	if httpClient == nil {
		httpClient = s.clientMgr.HTTPClient()
	}

	var jobStatus *bsky.VideoDefs_JobStatus
	var reused bool

	if !strings.HasPrefix(fileName, "mixko_gif_") {
		if mpStatus, mpErr := s.tryMultipartVideoUpload(ctx, c, httpClient, token, localPath, fileName, fileInfo.Size()); mpErr == nil && mpStatus != nil {
			jobStatus = mpStatus
		}
	}

	if jobStatus == nil {
		file, openErr := os.Open(localPath)
		if openErr != nil {
			return nil, false, openErr
		}
		defer file.Close()

		uploadURL := fmt.Sprintf("%s/xrpc/app.bsky.video.uploadVideo?did=%s&name=%s",
			s.videoHost(),
			url.QueryEscape(c.Auth.Did),
			url.QueryEscape(fileName),
		)

		req, reqErr := http.NewRequestWithContext(ctx, http.MethodPost, uploadURL, file)
		if reqErr != nil {
			return nil, false, reqErr
		}
		req.Header.Set("Authorization", "Bearer "+token)
		req.Header.Set("Content-Type", detectVideoMimeType(localPath))
		req.ContentLength = fileInfo.Size()

		resp, doErr := httpClient.Do(req)
		if doErr != nil {
			return nil, false, fmt.Errorf("video upload failed: %w", doErr)
		}
		respBytes, readErr := io.ReadAll(resp.Body)
		resp.Body.Close()
		if readErr != nil {
			return nil, false, fmt.Errorf("failed to read video upload response: %w", readErr)
		}

		var wrapped bsky.VideoUploadVideo_Output
		var directStatus bsky.VideoDefs_JobStatus
		if json.Unmarshal(respBytes, &wrapped) == nil && wrapped.JobStatus != nil && (wrapped.JobStatus.JobId != "" || wrapped.JobStatus.Blob != nil || wrapped.JobStatus.Error != nil) {
			jobStatus = wrapped.JobStatus
		} else if json.Unmarshal(respBytes, &directStatus) == nil && (directStatus.JobId != "" || directStatus.Blob != nil || directStatus.Error != nil) {
			jobStatus = &directStatus
		}

		if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusConflict {
			return nil, false, fmt.Errorf("video upload failed (HTTP %d): %s", resp.StatusCode, strings.TrimSpace(string(respBytes)))
		}
		reused = resp.StatusCode == http.StatusConflict
	}

	if jobStatus != nil && jobStatus.Error != nil && *jobStatus.Error == "already_exists" {
		reused = true
	}
	if jobStatus != nil && jobStatus.Blob != nil {
		s.clientMgr.EmitEvent("video_upload_progress", map[string]interface{}{
			"state":    "JOB_STATE_COMPLETED",
			"progress": 100,
		})
		return jobStatus.Blob, reused, nil
	}
	if jobStatus == nil || jobStatus.JobId == "" {
		if reused && isMP4File(localPath) {
			if directBlob, upErr := uploadVideoBlobToPDS(ctx, c, localPath); upErr == nil {
				return directBlob, false, nil
			}
		}
		if errMsg := formatVideoJobError(jobStatus); errMsg != "" {
			return nil, false, fmt.Errorf("video upload failed: %s", errMsg)
		}
		return nil, false, fmt.Errorf("video upload did not return a job ID")
	}

	jobId := jobStatus.JobId
	videoClient := &xrpc.Client{
		Client: httpClient,
		Host:   s.videoHost(),
	}

	const maxPollErrors = 50
	consecutiveErrors := 0
	completedWithoutBlob := 0
	for i := 0; i < 300; i++ {
		select {
		case <-ctx.Done():
			return nil, false, ctx.Err()
		case <-time.After(s.videoPollInterval()):
		}

		statusRes, err := bsky.VideoGetJobStatus(ctx, videoClient, jobId)
		if err != nil {
			consecutiveErrors++
			if isAuthExpired(err) {
				if statusAuthRes, authErr := atproto.ServerGetServiceAuth(ctx, c, "did:web:video.bsky.app", time.Now().Add(30*time.Minute).Unix(), "app.bsky.video.getJobStatus"); authErr == nil && statusAuthRes != nil && statusAuthRes.Token != "" {
					videoClient.Auth = &xrpc.AuthInfo{
						AccessJwt: statusAuthRes.Token,
						Did:       c.Auth.Did,
						Handle:    c.Auth.Handle,
					}
				}
			}
			if consecutiveErrors >= maxPollErrors {
				return nil, false, fmt.Errorf("failed to get video job status: %w", err)
			}
			continue
		}
		consecutiveErrors = 0
		if statusRes == nil || statusRes.JobStatus == nil {
			continue
		}
		st := statusRes.JobStatus
		var prog int64
		if st.Progress != nil {
			prog = *st.Progress
		}
		s.clientMgr.EmitEvent("video_upload_progress", map[string]interface{}{
			"state":    st.State,
			"progress": prog,
		})
		if st.Error != nil && *st.Error == "already_exists" {
			reused = true
		}
		if st.Blob != nil {
			return st.Blob, reused, nil
		}
		if st.State == "JOB_STATE_COMPLETED" {
			completedWithoutBlob++
			if completedWithoutBlob >= 3 {
				if reused && isMP4File(localPath) {
					if directBlob, upErr := uploadVideoBlobToPDS(ctx, c, localPath); upErr == nil {
						return directBlob, false, nil
					}
				}
				return nil, false, fmt.Errorf("video processing completed without returning a blob")
			}
			continue
		}
		if st.State == "JOB_STATE_FAILED" {
			if reused && isMP4File(localPath) {
				if directBlob, upErr := uploadVideoBlobToPDS(ctx, c, localPath); upErr == nil {
					return directBlob, false, nil
				}
			}
			errStr := formatVideoJobError(st)
			if errStr == "" {
				errStr = "unknown error"
			}
			return nil, false, fmt.Errorf("video processing failed: %v", errStr)
		}
	}

	return nil, false, fmt.Errorf("video processing timed out")
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
func (s *PostBuilderService) QuotePost(text, quoteUri, quoteCid string, imagePaths []string, altTexts []string, videoPath string, videoAlt string, language string, threadgate string, gifUrl string, videoWidth int64, videoHeight int64, listUris []string, selfLabels []string, captionPath string, captionLang string) (*PostRefDTO, error) {
	// Posting can include a video upload plus transcode polling, which runs far
	// longer than a plain API call.
	ctx, cancel := s.clientMgr.NewContextTimeout(postWithMediaTimeout)
	defer cancel()
	if len(imagePaths) != len(altTexts) {
		return nil, fmt.Errorf("length of imagePaths and altTexts must be identical")
	}

	var out *PostRefDTO
	err := s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		post := newFeedPost(ctx, c, text, language, selfLabels)

		images, gallery, videoInfo, err := s.uploadMedia(ctx, c, imagePaths, altTexts, videoPath, videoAlt, gifUrl, videoWidth, videoHeight, captionPath, captionLang)
		if err != nil {
			return err
		}
		if videoInfo != nil && videoInfo.cleanup != nil {
			defer videoInfo.cleanup()
		}

		quoteRec := &bsky.EmbedRecord{
			LexiconTypeID: "app.bsky.embed.record",
			Record: &atproto.RepoStrongRef{
				Uri: quoteUri,
				Cid: quoteCid,
			},
		}

		if images != nil || gallery != nil || videoInfo != nil {
			var videoEmbed *bsky.EmbedVideo
			if videoInfo != nil {
				videoEmbed = videoInfo.embed
			}
			post.Embed = &bsky.FeedPost_Embed{
				EmbedRecordWithMedia: &bsky.EmbedRecordWithMedia{
					LexiconTypeID: "app.bsky.embed.recordWithMedia",
					Media:         &bsky.EmbedRecordWithMedia_Media{EmbedImages: images, EmbedGallery: gallery, EmbedVideo: videoEmbed},
					Record:        quoteRec,
				},
			}
		} else {
			post.Embed = &bsky.FeedPost_Embed{EmbedRecord: quoteRec}
		}

		// A quote embeds the post it points at rather than replying to it, so
		// it opens a thread of its own and is its own root.
		out, err = s.publishPost(ctx, c, post, threadgate, listUris, videoInfo)
		return err
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

// getOwnRecordJSON reads a record from the signed-in user's repo. It returns
// nil without an error only when the server says the record does not exist:
// every caller writes the record back afterwards, and treating a failed read
// as "nothing there" would wipe what the record already holds.
func getOwnRecordJSON(ctx context.Context, c *xrpc.Client, collection, rkey string) ([]byte, error) {
	res, err := atproto.RepoGetRecord(ctx, c, "", collection, c.Auth.Did, rkey)
	if err != nil {
		var xrpcErr *xrpc.XRPCError
		if errors.As(err, &xrpcErr) && (xrpcErr.ErrStr == "RecordNotFound" || strings.Contains(xrpcErr.Message, "Could not locate record")) {
			return nil, nil
		}
		return nil, err
	}
	if res == nil || res.Value == nil || res.Value.Val == nil {
		return nil, nil
	}
	return json.Marshal(res.Value.Val)
}

// loadThreadgate returns the gate record of a thread, or a fresh one when
// there is none yet. hasAllow reports whether the stored record restricts who
// may reply.
func loadThreadgate(ctx context.Context, c *xrpc.Client, rkey, postUri string) (tg bsky.FeedThreadgate, hasAllow, exists bool, err error) {
	tg = bsky.FeedThreadgate{
		LexiconTypeID: "app.bsky.feed.threadgate",
		Post:          postUri,
		CreatedAt:     nowISO8601(),
	}
	raw, err := getOwnRecordJSON(ctx, c, "app.bsky.feed.threadgate", rkey)
	if err != nil || raw == nil {
		return tg, false, false, err
	}
	if err := json.Unmarshal(raw, &tg); err != nil {
		return tg, false, false, err
	}
	var fields map[string]json.RawMessage
	if json.Unmarshal(raw, &fields) == nil {
		_, hasAllow = fields["allow"]
	}
	return tg, hasAllow, true, nil
}

// ownThreadRkey returns the record key of a thread root, refusing a root in
// someone else's repo: only the thread author's gate record has any effect.
func ownThreadRkey(c *xrpc.Client, postUri string) (string, error) {
	repo, _, rkey, ok := parseATURI(postUri)
	if !ok {
		return "", fmt.Errorf("invalid post uri")
	}
	if repo != c.Auth.Did {
		return "", fmt.Errorf("only the author of the thread can hide its replies")
	}
	return rkey, nil
}

func (s *PostBuilderService) HideReply(postUri string, replyUri string) error {
	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()
	return s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		rkey, err := ownThreadRkey(c, postUri)
		if err != nil {
			return err
		}
		tg, hasAllow, _, err := loadThreadgate(ctx, c, rkey, postUri)
		if err != nil {
			return err
		}

		for _, hidden := range tg.HiddenReplies {
			if hidden == replyUri {
				return nil
			}
		}
		tg.HiddenReplies = append(tg.HiddenReplies, replyUri)

		return putThreadgateRecord(ctx, c, rkey, postUri, tg.CreatedAt, tg.Allow, hasAllow, tg.HiddenReplies)
	})
}

func (s *PostBuilderService) FetchLinkCard(linkUrl string) (*ExternalEmbedDTO, error) {
	ctx, cancel := context.WithTimeout(s.clientMgr.AppContext(), 5*time.Second)
	defer cancel()

	var dynamicCard *ExternalEmbedDTO
	if s.clientMgr != nil {
		_ = s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
			res, err := bsky.EmbedGetEmbedExternalView(ctx, c, []string{}, linkUrl)
			if err == nil && res != nil && res.View != nil && res.View.External != nil && res.View.External.Title != "" {
				ext := res.View.External
				dynamicCard = &ExternalEmbedDTO{
					URI:         ext.Uri,
					Title:       ext.Title,
					Description: ext.Description,
					Thumb:       safeString(ext.Thumb),
				}
				if ext.Source != nil {
					dynamicCard.SourceTitle = ext.Source.Title
					dynamicCard.SourceURI = ext.Source.Uri
				}
			}
			return nil
		})
	}
	if dynamicCard != nil {
		return dynamicCard, nil
	}

	resp, err := fetchRemote(ctx, linkUrl)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	title, description, imageUrl, err := parseLinkMeta(resp.Body, linkUrl)
	if err != nil {
		return nil, err
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
		rkey, err := ownThreadRkey(c, postUri)
		if err != nil {
			return err
		}
		tg, hasAllow, exists, err := loadThreadgate(ctx, c, rkey, postUri)
		if err != nil || !exists {
			return err
		}

		filtered := make([]string, 0, len(tg.HiddenReplies))
		for _, h := range tg.HiddenReplies {
			if h != replyUri {
				filtered = append(filtered, h)
			}
		}
		tg.HiddenReplies = filtered

		if !hasAllow && len(tg.HiddenReplies) == 0 {
			_, err = atproto.RepoDeleteRecord(ctx, c, &atproto.RepoDeleteRecord_Input{
				Collection: "app.bsky.feed.threadgate",
				Repo:       c.Auth.Did,
				Rkey:       rkey,
			})
			return err
		}

		return putThreadgateRecord(ctx, c, rkey, postUri, tg.CreatedAt, tg.Allow, hasAllow, tg.HiddenReplies)
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
			if err := s.togglePostQuotesInternal(ctx, c, postUri, disableQuotes); err != nil {
				return err
			}
		}

		existing, _, hasExisting, err := loadThreadgate(ctx, c, rkey, postUri)
		if err != nil {
			return err
		}

		if !hasReplyRestriction {
			if hasExisting && len(existing.HiddenReplies) > 0 {
				return putThreadgateRecord(ctx, c, rkey, postUri, existing.CreatedAt, nil, false, existing.HiddenReplies)
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

		createdAt := nowISO8601()
		var hiddenReplies []string
		if hasExisting {
			if existing.CreatedAt != "" {
				createdAt = existing.CreatedAt
			}
			hiddenReplies = existing.HiddenReplies
		}

		return putThreadgateRecord(ctx, c, rkey, postUri, createdAt, allow, true, hiddenReplies)
	})
}

func (s *PostBuilderService) getExistingPostgate(ctx context.Context, c *xrpc.Client, postUri, rkey string) (*bsky.FeedPostgate, bool, error) {
	pg := &bsky.FeedPostgate{
		LexiconTypeID: "app.bsky.feed.postgate",
		Post:          postUri,
		CreatedAt:     nowISO8601(),
	}
	raw, err := getOwnRecordJSON(ctx, c, "app.bsky.feed.postgate", rkey)
	if err != nil || raw == nil {
		return pg, false, err
	}
	if err := json.Unmarshal(raw, pg); err != nil {
		return pg, false, err
	}
	pg.LexiconTypeID = "app.bsky.feed.postgate"
	return pg, true, nil
}

func (s *PostBuilderService) togglePostQuotesInternal(ctx context.Context, c *xrpc.Client, postUri string, disableQuotes bool) error {
	parts := strings.Split(postUri, "/")
	if len(parts) < 5 {
		return fmt.Errorf("invalid post uri")
	}
	rkey := parts[4]

	pg, exists, err := s.getExistingPostgate(ctx, c, postUri, rkey)
	if err != nil {
		return err
	}
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

	_, err = atproto.RepoPutRecord(ctx, c, &atproto.RepoPutRecord_Input{
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

		pg, _, err := s.getExistingPostgate(ctx, c, quotedPostUri, rkey)
		if err != nil {
			return err
		}
		for _, u := range pg.DetachedEmbeddingUris {
			if u == quotingPostUri {
				return nil
			}
		}
		pg.DetachedEmbeddingUris = append(pg.DetachedEmbeddingUris, quotingPostUri)

		_, err = atproto.RepoPutRecord(ctx, c, &atproto.RepoPutRecord_Input{
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

		pg, exists, err := s.getExistingPostgate(ctx, c, quotedPostUri, rkey)
		if err != nil || !exists {
			return err
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

		_, err = atproto.RepoPutRecord(ctx, c, &atproto.RepoPutRecord_Input{
			Collection: "app.bsky.feed.postgate",
			Repo:       c.Auth.Did,
			Rkey:       rkey,
			Record:     &util.LexiconTypeDecoder{Val: pg},
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

const draftThreadSplitMarker = "\n---MIXKO_THREAD_SPLIT---\n"

func buildDraftRecordFromPosts(posts []string, langs []string, selfLabels []string, threadgateAllow []string, disableQuotes bool) *bsky.DraftDefs_Draft {
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
		trimmed := strings.TrimSpace(r)
		switch {
		case trimmed == "mentioned":
			tgAllow = append(tgAllow, &bsky.DraftDefs_Draft_ThreadgateAllow_Elem{
				FeedThreadgate_MentionRule: &bsky.FeedThreadgate_MentionRule{
					LexiconTypeID: "app.bsky.feed.threadgate#mentionRule",
				},
			})
		case trimmed == "following":
			tgAllow = append(tgAllow, &bsky.DraftDefs_Draft_ThreadgateAllow_Elem{
				FeedThreadgate_FollowingRule: &bsky.FeedThreadgate_FollowingRule{
					LexiconTypeID: "app.bsky.feed.threadgate#followingRule",
				},
			})
		case trimmed == "followers":
			tgAllow = append(tgAllow, &bsky.DraftDefs_Draft_ThreadgateAllow_Elem{
				FeedThreadgate_FollowerRule: &bsky.FeedThreadgate_FollowerRule{
					LexiconTypeID: "app.bsky.feed.threadgate#followerRule",
				},
			})
		case strings.HasPrefix(trimmed, "list:"):
			listURI := strings.TrimSpace(strings.TrimPrefix(trimmed, "list:"))
			if listURI != "" {
				tgAllow = append(tgAllow, &bsky.DraftDefs_Draft_ThreadgateAllow_Elem{
					FeedThreadgate_ListRule: &bsky.FeedThreadgate_ListRule{
						LexiconTypeID: "app.bsky.feed.threadgate#listRule",
						List:          listURI,
					},
				})
			}
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

	draftPosts := make([]*bsky.DraftDefs_DraftPost, 0, len(posts))
	for i, pText := range posts {
		dp := &bsky.DraftDefs_DraftPost{
			Text: pText,
		}
		if i == 0 {
			dp.Labels = labelsUnion
		}
		draftPosts = append(draftPosts, dp)
	}
	if len(draftPosts) == 0 {
		draftPosts = append(draftPosts, &bsky.DraftDefs_DraftPost{
			Text:   "",
			Labels: labelsUnion,
		})
	}

	return &bsky.DraftDefs_Draft{
		Langs:                  langs,
		Posts:                  draftPosts,
		ThreadgateAllow:        tgAllow,
		PostgateEmbeddingRules: pgRules,
	}
}

func buildDraftRecord(text string, langs []string, selfLabels []string, threadgateAllow []string, disableQuotes bool) *bsky.DraftDefs_Draft {
	parts := strings.Split(text, draftThreadSplitMarker)
	return buildDraftRecordFromPosts(parts, langs, selfLabels, threadgateAllow, disableQuotes)
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
			for i, p := range dv.Draft.Posts {
				if p == nil {
					continue
				}
				d.Posts = append(d.Posts, p.Text)
				if i == 0 {
					d.Text = p.Text
					if p.Labels != nil && p.Labels.LabelDefs_SelfLabels != nil {
						for _, lv := range p.Labels.LabelDefs_SelfLabels.Values {
							if lv != nil && lv.Val != "" {
								d.SelfLabels = append(d.SelfLabels, lv.Val)
							}
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

func (s *PostBuilderService) CreateThreadDraft(posts []string, langs []string, selfLabels []string, threadgateAllow []string, disableQuotes bool) (string, error) {
	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()
	var draftID string
	err := s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		draft := buildDraftRecordFromPosts(posts, langs, selfLabels, threadgateAllow, disableQuotes)
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

func (s *PostBuilderService) UpdateThreadDraft(id string, posts []string, langs []string, selfLabels []string, threadgateAllow []string, disableQuotes bool) error {
	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()
	return s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		draft := buildDraftRecordFromPosts(posts, langs, selfLabels, threadgateAllow, disableQuotes)
		return bsky.DraftUpdateDraft(ctx, c, &bsky.DraftUpdateDraft_Input{
			Draft: &bsky.DraftDefs_DraftWithId{
				Id:    id,
				Draft: draft,
			},
		})
	})
}
