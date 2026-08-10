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
	"net/http"
	"net/url"
	"os"
	"regexp"
	"strings"

	"github.com/bluesky-social/indigo/api/bsky"
	"github.com/bluesky-social/indigo/api/atproto"
	"github.com/bluesky-social/indigo/xrpc"
	"golang.org/x/image/draw"
	"golang.org/x/net/html"
)

// ParseFacets parses mentions, links, and tags from text and generates Facets.
func ParseFacets(ctx context.Context, c *xrpc.Client, text string) []*bsky.RichtextFacet {
	var facets []*bsky.RichtextFacet
	textBytes := []byte(text)

	// Links
	// Exclude trailing punctuation like .,;!? from the match
	linkRegex := regexp.MustCompile(`https?://[^\s]+[^.,;:?!"' \n]`)
	for _, match := range linkRegex.FindAllIndex(textBytes, -1) {
		start, end := match[0], match[1]
		uri := string(textBytes[start:end])
		facets = append(facets, &bsky.RichtextFacet{
			Index: &bsky.RichtextFacet_ByteSlice{ByteStart: int64(start), ByteEnd: int64(end)},
			Features: []*bsky.RichtextFacet_Features_Elem{{RichtextFacet_Link: &bsky.RichtextFacet_Link{Uri: uri}}},
		})
	}

	// Mentions
	// Use boundaries to avoid matching emails like user@domain.com
	mentionRegex := regexp.MustCompile(`(?:^|\s)@([a-zA-Z0-9.-]+)`)
	for _, match := range mentionRegex.FindAllSubmatchIndex(textBytes, -1) {
		// Because we match `^|\s`, the start index of the actual @ might be offset by 1 if there's a space
		start := match[0]
		if string(textBytes[start]) == " " || string(textBytes[start]) == "\n" {
			start++
		}
		end := match[1]
		handle := string(textBytes[match[2]:match[3]])
		res, err := atproto.IdentityResolveHandle(ctx, c, handle)
		if err == nil {
			facets = append(facets, &bsky.RichtextFacet{
				Index: &bsky.RichtextFacet_ByteSlice{ByteStart: int64(start), ByteEnd: int64(end)},
				Features: []*bsky.RichtextFacet_Features_Elem{{RichtextFacet_Mention: &bsky.RichtextFacet_Mention{Did: res.Did}}},
			})
		}
	}

	// Tags
	tagRegex := regexp.MustCompile(`(?i)(?:^|\s)#([a-z0-9_-]+)`)
	for _, match := range tagRegex.FindAllSubmatchIndex(textBytes, -1) {
		start := match[0]
		if string(textBytes[start]) == " " || string(textBytes[start]) == "\n" {
			start++
		}
		end := match[1]
		tag := string(textBytes[match[2]:match[3]])
		facets = append(facets, &bsky.RichtextFacet{
			Index: &bsky.RichtextFacet_ByteSlice{ByteStart: int64(start), ByteEnd: int64(end)},
			Features: []*bsky.RichtextFacet_Features_Elem{{RichtextFacet_Tag: &bsky.RichtextFacet_Tag{Tag: tag}}},
		})
	}
	return facets
}

// GenerateLinkPreview fetches the link and returns a card embed.
func GenerateLinkPreview(ctx context.Context, c *xrpc.Client, linkUrl string) (*bsky.EmbedExternal, error) {
	req, err := http.NewRequestWithContext(ctx, "GET", linkUrl, nil)
	if err != nil {
		return nil, err
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("failed to fetch link")
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

	if title == "" { title = linkUrl }

	external := &bsky.EmbedExternal_External{
		Uri: linkUrl, Title: title, Description: description,
	}

	if imageUrl != "" {
		if !strings.HasPrefix(imageUrl, "http") {
			parsedBase, err := url.Parse(linkUrl)
			if err == nil {
				parsedImg, err := url.Parse(imageUrl)
				if err == nil {
					imageUrl = parsedBase.ResolveReference(parsedImg).String()
				}
			}
		}
		
		imgReq, err := http.NewRequestWithContext(ctx, "GET", imageUrl, nil)
		if err == nil {
			imgResp, err := http.DefaultClient.Do(imgReq)
			if err == nil && imgResp.StatusCode == 200 {
				defer imgResp.Body.Close()
				thumbBuf, mimeType, err := ProcessAndCompressImage(imgResp.Body, 1200, 1200, 950000)
				if err == nil && thumbBuf != nil {
					blobRes, err := atproto.RepoUploadBlob(ctx, c, thumbBuf)
					if err == nil {
						blobRes.Blob.MimeType = mimeType
						external.Thumb = blobRes.Blob
					}
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
			return "", nil, fmt.Errorf("formato de data URL inválido")
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
				return "", nil, fmt.Errorf("falha ao decodificar base64: %w", err)
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
		} else if exts, _ := mime.ExtensionsByType(mimeType); len(exts) > 0 {
			ext = exts[0]
		}

		tmpFile, err := os.CreateTemp("", "mixko_upload_*"+ext)
		if err != nil {
			return "", nil, fmt.Errorf("falha ao criar arquivo temporário: %w", err)
		}
		defer tmpFile.Close()

		if _, err := tmpFile.Write(data); err != nil {
			os.Remove(tmpFile.Name())
			return "", nil, fmt.Errorf("falha ao gravar arquivo temporário: %w", err)
		}

		cleanup := func() {
			os.Remove(tmpFile.Name())
		}
		return tmpFile.Name(), cleanup, nil
	}

	return pathOrData, func() {}, nil
}
