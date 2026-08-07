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

type PostBuilderService struct {
	clientMgr *BSkyClient
}

func downloadTempFile(url string) (string, error) {
	resp, err := http.Get(url)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return "", fmt.Errorf("failed to download file: %d", resp.StatusCode)
	}

	ext := ".mp4"
	if strings.Contains(url, ".gif") {
		ext = ".gif"
	}
	tmpFile, err := os.CreateTemp("", "mixko_gif_*"+ext)
	if err != nil {
		return "", err
	}
	defer tmpFile.Close()

	_, err = io.Copy(tmpFile, resp.Body)
	if err != nil {
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

func NewPostBuilderService(clientMgr *BSkyClient) *PostBuilderService {
	return &PostBuilderService{
		clientMgr: clientMgr,
	}
}

// CreatePost handles creating a new post with optional reply info, images, video, and link preview
func (s *PostBuilderService) CreatePost(text string, replyToUri, replyToCid string, imagePaths []string, altTexts []string, videoPath string, videoAlt string, linkUrl string, language string, threadgate string, gifUrl string) (*atproto.RepoCreateRecord_Output, error) {
	ctx := context.Background()
	if len(imagePaths) != len(altTexts) {
		return nil, fmt.Errorf("length of imagePaths and altTexts must be identical")
	}

	var out *atproto.RepoCreateRecord_Output
	
	err := s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		var langs []string
		if language != "" {
			langs = append(langs, language)
		}

		post := &bsky.FeedPost{
			LexiconTypeID: "app.bsky.feed.post",
			Text:          text,
			CreatedAt:     time.Now().Format(time.RFC3339),
			Facets:        ParseFacets(ctx, c, text),
			Langs:         langs,
		}

		// 2. Handle Replies
		if replyToUri != "" && replyToCid != "" {
			rootUri := replyToUri
			rootCid := replyToCid

			// Fetch the parent post to inherit its root if it exists
			postRes, err := bsky.FeedGetPosts(ctx, c, []string{replyToUri})
			if err == nil && len(postRes.Posts) > 0 {
				parentPost := postRes.Posts[0]
				if parentPost.Record != nil && parentPost.Record.Val != nil {
					bytes, err := json.Marshal(parentPost.Record.Val)
					if err == nil {
						var rec struct {
							Reply *struct {
								Root *struct {
									Uri string `json:"uri"`
									Cid string `json:"cid"`
								} `json:"root"`
							} `json:"reply"`
						}
						_ = json.Unmarshal(bytes, &rec)
						if rec.Reply != nil && rec.Reply.Root != nil && rec.Reply.Root.Uri != "" {
							rootUri = rec.Reply.Root.Uri
							rootCid = rec.Reply.Root.Cid
						}
					}
				}
			}

			post.Reply = &bsky.FeedPost_ReplyRef{
				Parent: &atproto.RepoStrongRef{
					Uri: replyToUri,
					Cid: replyToCid,
				},
				Root: &atproto.RepoStrongRef{
					Uri: rootUri,
					Cid: rootCid,
				},
			}
		}

		// 3. Handle Images, Video, and Link Previews
		if len(imagePaths) > 0 {
			var images []*bsky.EmbedImages_Image
			for i, path := range imagePaths {
				altText := altTexts[i]
				if altText == "" {
					return fmt.Errorf("Acessibilidade OBRIGATÓRIA: O Alt text (texto alternativo) não pode estar vazio para a imagem %d", i+1)
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
				tmpPath, err := downloadTempFile(gifUrl)
				if err != nil {
					return fmt.Errorf("failed to download GIF: %w", err)
				}
				defer os.Remove(tmpPath)
				videoPath = tmpPath
			}
			
			if altText == "" {
				return fmt.Errorf("Acessibilidade OBRIGATÓRIA: O Alt text não pode estar vazio para o vídeo")
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
			
			if gifUrl != "" {
				vidEmbed.Presentation = &presentationStr
			}
			
			if gifUrl != "" {
				post.Embed = &bsky.FeedPost_Embed{
					EmbedVideo: vidEmbed,
				}
			} else {
				post.Embed = &bsky.FeedPost_Embed{
					EmbedVideo: vidEmbed,
				}
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
			_ = s.createThreadgate(ctx, c, res.Uri, threadgate)
		}

		out = res
		return nil
	})

	return out, err
}

func (s *PostBuilderService) createThreadgate(ctx context.Context, c *xrpc.Client, postUri string, threadgate string) error {
	var allow []*bsky.FeedThreadgate_Allow_Elem
	switch threadgate {
	case "nobody":
		allow = []*bsky.FeedThreadgate_Allow_Elem{}
	case "mentioned":
		allow = append(allow, &bsky.FeedThreadgate_Allow_Elem{
			FeedThreadgate_MentionRule: &bsky.FeedThreadgate_MentionRule{
				LexiconTypeID: "app.bsky.feed.threadgate#mentionRule",
			},
		})
	case "following":
		allow = append(allow, &bsky.FeedThreadgate_Allow_Elem{
			FeedThreadgate_FollowingRule: &bsky.FeedThreadgate_FollowingRule{
				LexiconTypeID: "app.bsky.feed.threadgate#followingRule",
			},
		})
	}
	
	tg := &bsky.FeedThreadgate{
		LexiconTypeID: "app.bsky.feed.threadgate",
		Post:          postUri,
		CreatedAt:     time.Now().Format(time.RFC3339),
		Allow:         allow,
	}
	parts := strings.Split(postUri, "/")
	if len(parts) < 5 {
		return fmt.Errorf("invalid post uri")
	}
	rkey := parts[4]

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
		time.Sleep(3 * time.Second)
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
	ctx := context.Background()
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
					CreatedAt: time.Now().Format(time.RFC3339),
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
	ctx := context.Background()
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
	ctx := context.Background()
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
					CreatedAt: time.Now().Format(time.RFC3339),
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
func (s *PostBuilderService) QuotePost(text, quoteUri, quoteCid string, imagePaths []string, altTexts []string, videoPath string, videoAlt string, language string, threadgate string, gifUrl string) (*atproto.RepoCreateRecord_Output, error) {
	ctx := context.Background()
	if len(imagePaths) != len(altTexts) {
		return nil, fmt.Errorf("length of imagePaths and altTexts must be identical")
	}

	var out *atproto.RepoCreateRecord_Output
	err := s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		var langs []string
		if language != "" {
			langs = append(langs, language)
		}
		post := &bsky.FeedPost{
			LexiconTypeID: "app.bsky.feed.post",
			Text:          text,
			CreatedAt:     time.Now().Format(time.RFC3339),
			Facets:        ParseFacets(ctx, c, text),
			Langs:         langs,
		}

		var media *bsky.EmbedRecordWithMedia_Media

		if len(imagePaths) > 0 {
			var images []*bsky.EmbedImages_Image
			for i, path := range imagePaths {
				altText := altTexts[i]
				if altText == "" {
					return fmt.Errorf("Acessibilidade OBRIGATÓRIA: O Alt text não pode estar vazio")
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
				tmpPath, err := downloadTempFile(gifUrl)
				if err != nil {
					return fmt.Errorf("failed to download GIF: %w", err)
				}
				defer os.Remove(tmpPath)
				videoPath = tmpPath
			}
			if altText == "" {
				return fmt.Errorf("Acessibilidade OBRIGATÓRIA: O Alt text não pode estar vazio para o vídeo")
			}
			blobRef, err := s.uploadVideo(ctx, c, videoPath)
			if err != nil {
				blobRef, err = s.uploadBlob(ctx, c, videoPath)
				if err != nil {
					return fmt.Errorf("failed to upload video: %w", err)
				}
			}
			media = &bsky.EmbedRecordWithMedia_Media{
				EmbedVideo: &bsky.EmbedVideo{
					LexiconTypeID: "app.bsky.embed.video",
					Video:         blobRef,
					Alt:           &altText,
				},
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
			_ = s.createThreadgate(ctx, c, res.Uri, threadgate)
		}
		out = res
		return nil
	})
	return out, err
}



// DeletePost handles deleting a post
func (s *PostBuilderService) DeletePost(uri string) error {
	ctx := context.Background()
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
	ctx := context.Background()
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
	ctx := context.Background()
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
	ctx := context.Background()
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
				CreatedAt:     time.Now().Format(time.RFC3339),
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

