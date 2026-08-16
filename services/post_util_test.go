package services

import (
	"bytes"
	"context"
	"image"
	"image/color"
	"image/png"
	"io"
	"strings"
	"testing"
)

// facetRange is the byte span a facet covers, which is what the AT Protocol
// stores. Getting these wrong is invisible in ASCII text and very visible once
// a post contains accents or emoji.
type facetRange struct {
	start int64
	end   int64
	text  string
}

func TestParseFacetsLinksAndTags(t *testing.T) {
	tests := []struct {
		name  string
		text  string
		want  []facetRange
		kinds []string // "link" or "tag", parallel to want
	}{
		{
			name:  "plain link",
			text:  "veja https://example.com agora",
			want:  []facetRange{{5, 24, "https://example.com"}},
			kinds: []string{"link"},
		},
		{
			name:  "hashtag at start",
			text:  "#golang é bom",
			want:  []facetRange{{0, 7, "#golang"}},
			kinds: []string{"tag"},
		},
		{
			name: "offsets are bytes, not runes",
			// "ação" is 6 bytes (ç and ã take two each) plus the space, so the
			// tag starts at byte 7 even though it is rune 5. A rune-based
			// implementation would report [5,11) here.
			text:  "ação #teste",
			want:  []facetRange{{7, 13, "#teste"}},
			kinds: []string{"tag"},
		},
		{
			name: "emoji before hashtag",
			// The emoji is 4 bytes, so the tag starts at byte 5.
			text:  "🎉 #festa",
			want:  []facetRange{{5, 11, "#festa"}},
			kinds: []string{"tag"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// No mentions in these inputs, so no client call is made.
			facets := ParseFacets(context.Background(), nil, tt.text)

			if len(facets) != len(tt.want) {
				t.Fatalf("got %d facets, want %d", len(facets), len(tt.want))
			}

			raw := []byte(tt.text)
			for i, facet := range facets {
				got := facet.Index
				want := tt.want[i]

				if got.ByteStart != want.start || got.ByteEnd != want.end {
					t.Errorf("facet %d span = [%d,%d), want [%d,%d)",
						i, got.ByteStart, got.ByteEnd, want.start, want.end)
					continue
				}

				// The span must actually address the intended substring.
				if slice := string(raw[got.ByteStart:got.ByteEnd]); slice != want.text {
					t.Errorf("facet %d covers %q, want %q", i, slice, want.text)
				}

				feature := facet.Features[0]
				switch tt.kinds[i] {
				case "link":
					if feature.RichtextFacet_Link == nil {
						t.Errorf("facet %d is not a link", i)
					}
				case "tag":
					if feature.RichtextFacet_Tag == nil {
						t.Errorf("facet %d is not a tag", i)
					}
				}
			}
		})
	}
}

func TestParseFacetsNoMatches(t *testing.T) {
	if facets := ParseFacets(context.Background(), nil, "texto sem nada especial"); len(facets) != 0 {
		t.Errorf("got %d facets, want 0", len(facets))
	}
}

func TestFetchRemoteRejectsNonHTTPSchemes(t *testing.T) {
	for _, raw := range []string{"file:///etc/passwd", "ftp://example.com/x", "javascript:alert(1)"} {
		if _, err := fetchRemote(context.Background(), raw); err == nil {
			t.Errorf("fetchRemote(%q) succeeded, want rejection", raw)
		}
	}
}

// makePNG builds an opaque test image of the requested size.
func makePNG(t *testing.T, w, h int) []byte {
	t.Helper()

	img := image.NewRGBA(image.Rect(0, 0, w, h))
	for y := 0; y < h; y++ {
		for x := 0; x < w; x++ {
			img.Set(x, y, color.RGBA{R: uint8(x % 256), G: uint8(y % 256), B: 120, A: 255})
		}
	}

	var buf bytes.Buffer
	if err := png.Encode(&buf, img); err != nil {
		t.Fatalf("failed to encode test png: %v", err)
	}
	return buf.Bytes()
}

func TestProcessAndCompressImageResizes(t *testing.T) {
	src := makePNG(t, 3000, 1500)

	out, mime, err := ProcessAndCompressImage(bytes.NewReader(src), 1000, 1000, 950000)
	if err != nil {
		t.Fatalf("ProcessAndCompressImage: %v", err)
	}
	if mime != "image/jpeg" {
		t.Errorf("mime = %q, want image/jpeg", mime)
	}

	data, err := io.ReadAll(out)
	if err != nil {
		t.Fatalf("failed to read result: %v", err)
	}
	if len(data) > 950000 {
		t.Errorf("result is %d bytes, over the 950000 limit", len(data))
	}

	cfg, _, err := image.DecodeConfig(bytes.NewReader(data))
	if err != nil {
		t.Fatalf("result is not a decodable image: %v", err)
	}
	if cfg.Width > 1000 || cfg.Height > 1000 {
		t.Errorf("result is %dx%d, want both sides <= 1000", cfg.Width, cfg.Height)
	}
}

func TestProcessAndCompressImageKeepsSmallImages(t *testing.T) {
	src := makePNG(t, 50, 50)

	out, _, err := ProcessAndCompressImage(bytes.NewReader(src), 2000, 2000, 950000)
	if err != nil {
		t.Fatalf("ProcessAndCompressImage: %v", err)
	}

	cfg, _, err := image.DecodeConfig(out)
	if err != nil {
		t.Fatalf("result is not a decodable image: %v", err)
	}
	if cfg.Width != 50 || cfg.Height != 50 {
		t.Errorf("result is %dx%d, want 50x50 (no resize expected)", cfg.Width, cfg.Height)
	}
}

func TestProcessAndCompressImageRejectsGarbage(t *testing.T) {
	garbage := strings.Repeat("not an image", 100000)

	if _, _, err := ProcessAndCompressImage(strings.NewReader(garbage), 100, 100, 10); err == nil {
		t.Error("expected an error for undecodable oversized input")
	}
}

func TestResolvePathOrDataURL(t *testing.T) {
	// A plain path passes through untouched.
	path, cleanup, err := ResolvePathOrDataURL("C:/tmp/photo.png")
	if err != nil {
		t.Fatalf("ResolvePathOrDataURL: %v", err)
	}
	cleanup()
	if path != "C:/tmp/photo.png" {
		t.Errorf("path = %q, want it unchanged", path)
	}

	// A data URL is materialised into a temp file with a matching extension.
	dataURL := "data:image/png;base64,iVBORw0KGgo="
	tmp, cleanup, err := ResolvePathOrDataURL(dataURL)
	if err != nil {
		t.Fatalf("ResolvePathOrDataURL(data): %v", err)
	}
	defer cleanup()

	if !strings.HasSuffix(tmp, ".png") {
		t.Errorf("temp file %q does not carry the .png extension", tmp)
	}
}

func TestResolvePathOrDataURLRejectsMalformed(t *testing.T) {
	if _, _, err := ResolvePathOrDataURL("data:image/png;base64"); err == nil {
		t.Error("expected an error for a data URL with no comma")
	}
}
