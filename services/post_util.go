package services

import (
	"bytes"
	"context"
	"encoding/base64"
	"fmt"
	"image"
	"image/jpeg"
	_ "image/png"
	"io"
	"mime"
	"net"
	"net/http"
	"net/url"
	"os"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/bluesky-social/indigo/api/bsky"
	"github.com/bluesky-social/indigo/api/atproto"
	"github.com/bluesky-social/indigo/xrpc"
	"golang.org/x/image/draw"
	"golang.org/x/net/html"
)

// maxRemoteBodyBytes caps how much of an untrusted response we will read. Link
// previews and GIF downloads both follow URLs that come from other users, so an
// endless or huge body must not be able to exhaust memory or disk.
const maxRemoteBodyBytes = 8 << 20 // 8 MiB

// remoteFetchTimeout bounds a single fetch of third-party content.
const remoteFetchTimeout = 15 * time.Second

var remoteTransport = &http.Transport{
	Proxy: http.ProxyFromEnvironment,
	DialContext: (&net.Dialer{
		Timeout:   10 * time.Second,
		KeepAlive: 30 * time.Second,
	}).DialContext,
	ForceAttemptHTTP2:   true,
	MaxIdleConns:        50,
	MaxIdleConnsPerHost: 10,
	IdleConnTimeout:     90 * time.Second,
}

// remoteClient is used for every request to a URL we did not choose. It has an
// explicit timeout (http.DefaultClient has none) and refuses to follow long
// redirect chains.
var remoteClient = &http.Client{
	Timeout:   remoteFetchTimeout,
	Transport: remoteTransport,
	CheckRedirect: func(req *http.Request, via []*http.Request) error {
		if len(via) >= 5 {
			return fmt.Errorf("stopped after %d redirects", len(via))
		}
		return nil
	},
}

// fetchRemote performs a bounded GET against untrusted content. The caller owns
// closing the returned body.
func fetchRemote(ctx context.Context, rawURL string) (*http.Response, error) {
	parsed, err := url.Parse(rawURL)
	if err != nil {
		return nil, fmt.Errorf("invalid URL: %w", err)
	}
	if parsed.Scheme != "http" && parsed.Scheme != "https" {
		return nil, fmt.Errorf("unsupported URL scheme %q", parsed.Scheme)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, rawURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "Mixko")

	resp, err := remoteClient.Do(req)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode != http.StatusOK {
		resp.Body.Close()
		return nil, fmt.Errorf("request to %s returned status %d", parsed.Host, resp.StatusCode)
	}
	return resp, nil
}

func trimURLTrailingPunctuation(raw string) string {
	for len(raw) > 0 {
		last := raw[len(raw)-1]
		if strings.IndexByte(".,;:?!\"'>]", last) != -1 {
			raw = raw[:len(raw)-1]
			continue
		}
		if last == ')' && strings.Count(raw, ")") > strings.Count(raw, "(") {
			raw = raw[:len(raw)-1]
			continue
		}
		break
	}
	return raw
}

var (
	facetMentionRegex  = regexp.MustCompile(`(?:^|[\s(])@([a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+)`)
	facetLinkRegex     = regexp.MustCompile(`https?://[^\s<>"]+`)
	facetBareLinkRegex = regexp.MustCompile(`(?i)(?:^|[\s(])((?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:com|org|net|edu|gov|io|co|app|dev|me|info|biz|tv|gg|xyz|social|br|pt|es|uk|de|fr|it|ca|au|jp|kr|cn|in|ru|mx|ar|cl)(?:/[^\s<>"]*)?)`)
	facetTagRegex      = regexp.MustCompile(`(?i)(?:^|[\s(])#([\p{L}\p{N}_-]+)`)
)

// ParseFacets parses mentions, links, and tags from text and generates Facets.
func ParseFacets(ctx context.Context, c *xrpc.Client, text string) []*bsky.RichtextFacet {
	var facets []*bsky.RichtextFacet
	textBytes := []byte(text)

	type byteSpan struct {
		start int
		end   int
	}
	var occupied []byteSpan
	overlaps := func(s, e int) bool {
		for _, sp := range occupied {
			if s < sp.end && e > sp.start {
				return true
			}
		}
		return false
	}

	type mentionMatch struct {
		start  int
		end    int
		handle string
	}
	var mentionMatches []mentionMatch
	uniqueHandles := make(map[string]struct{})
	for _, match := range facetMentionRegex.FindAllSubmatchIndex(textBytes, -1) {
		handleStart, handleEnd := match[2], match[3]
		start := handleStart - 1
		end := handleEnd
		handle := string(textBytes[handleStart:handleEnd])
		occupied = append(occupied, byteSpan{start: start, end: end})
		mentionMatches = append(mentionMatches, mentionMatch{start: start, end: end, handle: handle})
		uniqueHandles[handle] = struct{}{}
	}

	if c != nil && len(mentionMatches) > 0 {
		resolvedDIDs := make(map[string]string, len(uniqueHandles))
		var uncached []string
		for handle := range uniqueHandles {
			if did, ok := GetDIDForHandle(handle); ok && did != "" {
				resolvedDIDs[handle] = did
			} else {
				uncached = append(uncached, handle)
			}
		}
		if len(uncached) > 0 {
			var (
				resMu sync.Mutex
				resWG sync.WaitGroup
			)
			for _, handle := range uncached {
				resWG.Add(1)
				go func(h string) {
					defer resWG.Done()
					res, err := atproto.IdentityResolveHandle(ctx, c, h)
					if err == nil && res != nil && res.Did != "" {
						CacheDID(res.Did, h)
						resMu.Lock()
						resolvedDIDs[h] = res.Did
						resMu.Unlock()
					}
				}(handle)
			}
			resWG.Wait()
		}
		for _, m := range mentionMatches {
			if did := resolvedDIDs[m.handle]; did != "" {
				facets = append(facets, &bsky.RichtextFacet{
					Index:    &bsky.RichtextFacet_ByteSlice{ByteStart: int64(m.start), ByteEnd: int64(m.end)},
					Features: []*bsky.RichtextFacet_Features_Elem{{RichtextFacet_Mention: &bsky.RichtextFacet_Mention{Did: did}}},
				})
			}
		}
	}

	for _, match := range facetLinkRegex.FindAllIndex(textBytes, -1) {
		start, end := match[0], match[1]
		raw := string(textBytes[start:end])
		cleaned := trimURLTrailingPunctuation(raw)
		if cleaned == "http://" || cleaned == "https://" || cleaned == "" {
			continue
		}
		end = start + len(cleaned)
		if overlaps(start, end) {
			continue
		}
		occupied = append(occupied, byteSpan{start: start, end: end})
		facets = append(facets, &bsky.RichtextFacet{
			Index:    &bsky.RichtextFacet_ByteSlice{ByteStart: int64(start), ByteEnd: int64(end)},
			Features: []*bsky.RichtextFacet_Features_Elem{{RichtextFacet_Link: &bsky.RichtextFacet_Link{Uri: cleaned}}},
		})
	}

	for _, match := range facetBareLinkRegex.FindAllSubmatchIndex(textBytes, -1) {
		start, end := match[2], match[3]
		if start > 0 && (textBytes[start-1] == '@' || textBytes[start-1] == '/' || textBytes[start-1] == '.') {
			continue
		}
		raw := string(textBytes[start:end])
		cleaned := trimURLTrailingPunctuation(raw)
		if cleaned == "" {
			continue
		}
		end = start + len(cleaned)
		if overlaps(start, end) {
			continue
		}
		occupied = append(occupied, byteSpan{start: start, end: end})
		uri := "https://" + cleaned
		facets = append(facets, &bsky.RichtextFacet{
			Index:    &bsky.RichtextFacet_ByteSlice{ByteStart: int64(start), ByteEnd: int64(end)},
			Features: []*bsky.RichtextFacet_Features_Elem{{RichtextFacet_Link: &bsky.RichtextFacet_Link{Uri: uri}}},
		})
	}

	for _, match := range facetTagRegex.FindAllSubmatchIndex(textBytes, -1) {
		tagStart, tagEnd := match[2], match[3]
		start := tagStart - 1
		end := tagEnd
		if overlaps(start, end) {
			continue
		}
		tag := string(textBytes[tagStart:tagEnd])
		facets = append(facets, &bsky.RichtextFacet{
			Index:    &bsky.RichtextFacet_ByteSlice{ByteStart: int64(start), ByteEnd: int64(end)},
			Features: []*bsky.RichtextFacet_Features_Elem{{RichtextFacet_Tag: &bsky.RichtextFacet_Tag{Tag: tag}}},
		})
	}
	return facets
}

// parseLinkMeta reads the Open Graph title, description and image of a page.
// The title falls back to the URL and the image URL is made absolute.
func parseLinkMeta(body io.Reader, linkUrl string) (title, description, imageUrl string, err error) {
	doc, err := html.Parse(io.LimitReader(body, maxRemoteBodyBytes))
	if err != nil {
		return "", "", "", err
	}

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
			case "og:title": title = content
			case "og:description": description = content
			case "og:image": imageUrl = content
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
		if parsedBase, err := url.Parse(linkUrl); err == nil {
			if parsedImg, err := url.Parse(imageUrl); err == nil {
				imageUrl = parsedBase.ResolveReference(parsedImg).String()
			}
		}
	}
	return title, description, imageUrl, nil
}

// GenerateLinkPreview fetches the link and returns a card embed.
func GenerateLinkPreview(ctx context.Context, c *xrpc.Client, linkUrl string) (*bsky.EmbedExternal, error) {
	resp, err := fetchRemote(ctx, linkUrl)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	title, description, imageUrl, err := parseLinkMeta(resp.Body, linkUrl)
	if err != nil {
		return nil, err
	}

	external := &bsky.EmbedExternal_External{
		Uri: linkUrl, Title: title, Description: description,
	}

	if imageUrl != "" {
		// A missing or unreachable thumbnail is not fatal: the card is still
		// worth embedding without it.
		if imgResp, err := fetchRemote(ctx, imageUrl); err == nil {
			defer imgResp.Body.Close()
			thumbBuf, mimeType, err := ProcessAndCompressImage(io.LimitReader(imgResp.Body, maxRemoteBodyBytes), 1200, 1200, 950000)
			if err == nil && thumbBuf != nil {
				blobRes, err := atproto.RepoUploadBlob(ctx, c, thumbBuf)
				if err == nil {
					blobRes.Blob.MimeType = mimeType
					external.Thumb = blobRes.Blob
				}
			}
		}
	}

	return &bsky.EmbedExternal{LexiconTypeID: "app.bsky.embed.external", External: external}, nil
}

// ProcessAndCompressImage reads an image stream, resizes it if it exceeds maxWidth/maxHeight,
// and compresses it to JPEG so that the total byte size is <= maxSizeBytes.
func ProcessAndCompressImage(r io.Reader, maxWidth, maxHeight int, maxSizeBytes int) (io.Reader, string, error) {
	rawBytes, err := io.ReadAll(r)
	if err != nil {
		return nil, "", err
	}

	img, _, err := image.Decode(bytes.NewReader(rawBytes))
	if err != nil {
		if len(rawBytes) > 0 && len(rawBytes) <= maxSizeBytes {
			detectedMime := http.DetectContentType(rawBytes)
			return bytes.NewReader(rawBytes), detectedMime, nil
		}
		return nil, "", fmt.Errorf("failed to decode image: %w", err)
	}

	bounds := img.Bounds()
	width, height := bounds.Dx(), bounds.Dy()
	newWidth, newHeight := width, height

	if width > maxWidth || height > maxHeight {
		ratio := float64(width) / float64(height)
		if width > maxWidth {
			newWidth = maxWidth
			newHeight = int(float64(maxWidth) / ratio)
		}
		if newHeight > maxHeight {
			newHeight = maxHeight
			newWidth = int(float64(maxHeight) * ratio)
		}
	}

	var dst image.Image = img
	if newWidth != width || newHeight != height {
		resized := image.NewRGBA(image.Rect(0, 0, newWidth, newHeight))
		draw.CatmullRom.Scale(resized, resized.Bounds(), img, bounds, draw.Over, nil)
		dst = resized
	}

	quality := 85
	for {
		buf := new(bytes.Buffer)
		if err := jpeg.Encode(buf, dst, &jpeg.Options{Quality: quality}); err != nil {
			return nil, "", fmt.Errorf("failed to encode jpeg: %w", err)
		}

		if buf.Len() <= maxSizeBytes || quality <= 30 {
			return buf, "image/jpeg", nil
		}
		quality -= 15
	}
}

// CropAndResizeImage resizes an image to a reasonable size and ensures it is under 950KB.
func CropAndResizeImage(filePath string) (io.Reader, error) {
	file, err := os.Open(filePath)
	if err != nil {
		return nil, err
	}
	defer file.Close()

	reader, _, err := ProcessAndCompressImage(file, 2000, 2000, 950000)
	if err != nil {
		return nil, err
	}
	return reader, nil
}

// ResolvePathOrDataURL takes either a filesystem path or a data URL (base64).
// If it is a data URL, it decodes the content, writes it to a temporary file,
// and returns the path to that temporary file along with a cleanup function.
// If it is a normal filesystem path, it returns the path unmodified with a no-op cleanup function.
func ResolvePathOrDataURL(pathOrData string) (string, func(), error) {
	if strings.HasPrefix(pathOrData, "data:") {
		parts := strings.SplitN(pathOrData, ",", 2)
		if len(parts) != 2 {
			return "", nil, codedError(ErrCodeInvalidDataURL)
		}
		header := parts[0]
		dataStr := parts[1]

		mimeType := ""
		headerClean := strings.TrimPrefix(header, "data:")
		if idx := strings.Index(headerClean, ";"); idx != -1 {
			mimeType = headerClean[:idx]
		}

		var data []byte
		var err error
		if strings.Contains(header, ";base64") {
			padded := dataStr
			if mod := len(padded) % 4; mod != 0 {
				padded += strings.Repeat("=", 4-mod)
			}
			data, err = base64.StdEncoding.DecodeString(padded)
			if err != nil {
				return "", nil, codedErrorWrap(ErrCodeDecodeBase64, err)
			}
		} else {
			data = []byte(dataStr)
		}

		ext := ".tmp"
		if strings.Contains(mimeType, "png") {
			ext = ".png"
		} else if strings.Contains(mimeType, "jpeg") || strings.Contains(mimeType, "jpg") {
			ext = ".jpg"
		} else if strings.Contains(mimeType, "gif") {
			ext = ".gif"
		} else if strings.Contains(mimeType, "webp") {
			ext = ".webp"
		} else if strings.Contains(mimeType, "mp4") {
			ext = ".mp4"
		} else if strings.Contains(mimeType, "quicktime") || strings.Contains(mimeType, "mov") {
			ext = ".mov"
		} else if strings.Contains(mimeType, "webm") {
			ext = ".webm"
		} else if strings.Contains(mimeType, "mpeg") || strings.Contains(mimeType, "mpg") {
			ext = ".mpeg"
		} else if exts, _ := mime.ExtensionsByType(mimeType); len(exts) > 0 {
			ext = exts[0]
		}

		tmpFile, err := os.CreateTemp("", "mixko_upload_*"+ext)
		if err != nil {
			return "", nil, codedErrorWrap(ErrCodeTempFileCreate, err)
		}
		defer tmpFile.Close()

		if _, err := tmpFile.Write(data); err != nil {
			os.Remove(tmpFile.Name())
			return "", nil, codedErrorWrap(ErrCodeTempFileWrite, err)
		}

		cleanup := func() {
			os.Remove(tmpFile.Name())
		}
		return tmpFile.Name(), cleanup, nil
	}

	return pathOrData, func() {}, nil
}

// nowISO8601 formats the current instant the way atproto's datetime format
// wants it: UTC, Z-suffixed, with fixed millisecond precision.
//
// time.RFC3339 resolves only to the second, so every post of a thread
// published in one burst lands on an identical createdAt. Anything downstream
// that orders by createdAt then sees a tie and is free to return them in any
// order. Fixed-width milliseconds also keep the strings lexicographically
// comparable, which time.RFC3339Nano does not — it trims trailing zeros.
func nowISO8601() string {
	return time.Now().UTC().Format("2006-01-02T15:04:05.000Z")
}

// parseATURI splits an at:// record URI into the repo that holds it, its
// collection and its record key. It reports false for anything that is not a
// complete record URI.
func parseATURI(uri string) (repo, collection, rkey string, ok bool) {
	rest, found := strings.CutPrefix(uri, "at://")
	if !found {
		return "", "", "", false
	}
	parts := strings.Split(rest, "/")
	if len(parts) != 3 || parts[0] == "" || parts[1] == "" || parts[2] == "" {
		return "", "", "", false
	}
	return parts[0], parts[1], parts[2], true
}
