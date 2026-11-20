package services

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/bluesky-social/indigo/api/bsky"
	"github.com/bluesky-social/indigo/lex/util"
	"github.com/bluesky-social/indigo/xrpc"
	"github.com/ipfs/go-cid"
)

func TestParseATURI(t *testing.T) {
	tests := []struct {
		name                   string
		uri                    string
		repo, collection, rkey string
		ok                     bool
	}{
		{
			name: "full record uri", uri: "at://did:plc:abc/app.bsky.feed.post/3kabc",
			repo: "did:plc:abc", collection: "app.bsky.feed.post", rkey: "3kabc", ok: true,
		},
		{
			name: "handle instead of did", uri: "at://alice.test/app.bsky.feed.post/3kabc",
			repo: "alice.test", collection: "app.bsky.feed.post", rkey: "3kabc", ok: true,
		},
		{name: "missing rkey", uri: "at://did:plc:abc/app.bsky.feed.post", ok: false},
		{name: "trailing slash leaves an empty rkey", uri: "at://did:plc:abc/app.bsky.feed.post/", ok: false},
		{name: "extra segment", uri: "at://did:plc:abc/app.bsky.feed.post/3kabc/extra", ok: false},
		{name: "wrong scheme", uri: "https://did:plc:abc/app.bsky.feed.post/3kabc", ok: false},
		{name: "empty", uri: "", ok: false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			repo, collection, rkey, ok := parseATURI(tt.uri)
			if ok != tt.ok {
				t.Fatalf("ok = %v, want %v", ok, tt.ok)
			}
			if !tt.ok {
				return
			}
			if repo != tt.repo || collection != tt.collection || rkey != tt.rkey {
				t.Errorf("got (%q, %q, %q), want (%q, %q, %q)",
					repo, collection, rkey, tt.repo, tt.collection, tt.rkey)
			}
		})
	}
}

// A thread is published in one burst, so several posts land inside the same
// second. Timestamps that only resolve to the second make those posts tie, and
// anything ordering by createdAt is then free to return them in any order.
func TestNowISO8601IsUTCAndOrdersWithinASecond(t *testing.T) {
	got := nowISO8601()

	parsed, err := time.Parse(time.RFC3339, got)
	if err != nil {
		t.Fatalf("not a valid RFC3339 datetime: %q: %v", got, err)
	}
	if _, offset := parsed.Zone(); offset != 0 {
		t.Errorf("timestamp %q is not UTC (offset %d)", got, offset)
	}
	if !strings.HasSuffix(got, "Z") {
		t.Errorf("timestamp %q does not end in Z", got)
	}
	if len(got) != len("2006-01-02T15:04:05.000Z") {
		t.Errorf("timestamp %q is not fixed-width, so string ordering is unreliable", got)
	}

	// Two instants inside the same second must stay distinguishable, and must
	// sort the same way as strings as they do in time.
	a := time.Date(2026, 8, 27, 12, 0, 3, 120*int(time.Millisecond), time.UTC).Format("2006-01-02T15:04:05.000Z")
	b := time.Date(2026, 8, 27, 12, 0, 3, 480*int(time.Millisecond), time.UTC).Format("2006-01-02T15:04:05.000Z")
	if a == b {
		t.Fatalf("two instants in the same second collapsed to %q", a)
	}
	if a >= b {
		t.Errorf("string order of %q and %q does not match time order", a, b)
	}
}

// resolveThreadRoot must read the caller's own posts out of the repo, which is
// read-after-write consistent. Asking the AppView instead is what broke long
// threads: it has not indexed a post published moments earlier, and it omits
// URIs it does not know without reporting an error, so every post from the
// third one onward silently became the root of its own thread.
func TestResolveThreadRootReadsOwnPostsFromTheRepo(t *testing.T) {
	tests := []struct {
		name         string
		parentRecord string
		wantRootUri  string
		wantRootCid  string
	}{
		{
			name: "parent is itself a reply, so its root carries over",
			parentRecord: `{"$type":"app.bsky.feed.post","text":"post 2","createdAt":"2026-08-27T12:00:03.120Z",
				"reply":{
					"root":{"uri":"at://did:plc:me/app.bsky.feed.post/aaa","cid":"cid-aaa"},
					"parent":{"uri":"at://did:plc:me/app.bsky.feed.post/aaa","cid":"cid-aaa"}}}`,
			wantRootUri: "at://did:plc:me/app.bsky.feed.post/aaa",
			wantRootCid: "cid-aaa",
		},
		{
			name:         "parent opens the thread, so it is its own root",
			parentRecord: `{"$type":"app.bsky.feed.post","text":"post 1","createdAt":"2026-08-27T12:00:02.900Z"}`,
			wantRootUri:  "at://did:plc:me/app.bsky.feed.post/bbb",
			wantRootCid:  "cid-bbb",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var askedAppView bool
			mgr := stubClient(t, func(w http.ResponseWriter, r *http.Request) {
				switch r.URL.Path {
				case "/xrpc/com.atproto.repo.getRecord":
					if got := r.URL.Query().Get("repo"); got != "did:plc:me" {
						t.Errorf("repo = %q, want the signed-in did", got)
					}
					if got := r.URL.Query().Get("rkey"); got != "bbb" {
						t.Errorf("rkey = %q, want bbb", got)
					}
					w.Header().Set("Content-Type", "application/json")
					w.Write([]byte(`{"uri":"at://did:plc:me/app.bsky.feed.post/bbb","cid":"cid-bbb","value":` + tt.parentRecord + `}`))
				case "/xrpc/app.bsky.feed.getPosts":
					// The AppView has not indexed a post published seconds ago;
					// this is exactly the empty answer that used to slip through.
					askedAppView = true
					w.Header().Set("Content-Type", "application/json")
					w.Write([]byte(`{"posts":[]}`))
				default:
					t.Errorf("unexpected call to %s", r.URL.Path)
					w.WriteHeader(http.StatusNotFound)
				}
			})

			svc := NewPostBuilderService(mgr)
			c, err := mgr.GetClient()
			if err != nil {
				t.Fatal(err)
			}

			gotUri, gotCid := svc.resolveThreadRoot(t.Context(), c,
				"at://did:plc:me/app.bsky.feed.post/bbb", "cid-bbb")

			if askedAppView {
				t.Error("asked the AppView about a post in the caller's own repo")
			}
			if gotUri != tt.wantRootUri || gotCid != tt.wantRootCid {
				t.Errorf("root = (%q, %q), want (%q, %q)", gotUri, gotCid, tt.wantRootUri, tt.wantRootCid)
			}
		})
	}
}

// Replying to someone else's post is the one case the repo cannot answer, and
// there the AppView is accurate: that post was indexed long ago.
func TestResolveThreadRootFallsBackToAppViewForForeignPosts(t *testing.T) {
	var askedAppView bool
	mgr := stubClient(t, func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/xrpc/app.bsky.feed.getPosts":
			askedAppView = true
			w.Header().Set("Content-Type", "application/json")
			w.Write([]byte(`{"posts":[{
				"uri":"at://did:plc:other/app.bsky.feed.post/ccc",
				"cid":"cid-ccc",
				"author":{"did":"did:plc:other","handle":"other.test"},
				"indexedAt":"2026-08-20T10:00:00.000Z",
				"record":{"$type":"app.bsky.feed.post","text":"a reply","createdAt":"2026-08-20T10:00:00.000Z",
					"reply":{
						"root":{"uri":"at://did:plc:other/app.bsky.feed.post/root","cid":"cid-root"},
						"parent":{"uri":"at://did:plc:other/app.bsky.feed.post/root","cid":"cid-root"}}}
			}]}`))
		default:
			t.Errorf("unexpected call to %s", r.URL.Path)
			w.WriteHeader(http.StatusNotFound)
		}
	})

	svc := NewPostBuilderService(mgr)
	c, err := mgr.GetClient()
	if err != nil {
		t.Fatal(err)
	}

	gotUri, gotCid := svc.resolveThreadRoot(t.Context(), c,
		"at://did:plc:other/app.bsky.feed.post/ccc", "cid-ccc")

	if !askedAppView {
		t.Error("did not consult the AppView for a post outside the caller's repo")
	}
	if gotUri != "at://did:plc:other/app.bsky.feed.post/root" || gotCid != "cid-root" {
		t.Errorf("root = (%q, %q), want the thread root", gotUri, gotCid)
	}
}

// The root a caller supplies is authoritative and must be written through
// untouched, with no lookup of any kind. This is what keeps the fourth, tenth
// and fiftieth post of a thread attached to the first one.
func TestCreatePostWritesTheSuppliedRootWithoutLookups(t *testing.T) {
	var written struct {
		Record struct {
			Reply *struct {
				Root   struct{ Uri, Cid string } `json:"root"`
				Parent struct{ Uri, Cid string } `json:"parent"`
			} `json:"reply"`
			CreatedAt string `json:"createdAt"`
		} `json:"record"`
	}

	mgr := stubClient(t, func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/xrpc/com.atproto.repo.createRecord" {
			t.Errorf("unexpected lookup at %s: a supplied root needs no resolving", r.URL.Path)
			w.WriteHeader(http.StatusNotFound)
			return
		}
		body, _ := io.ReadAll(r.Body)
		if err := json.Unmarshal(body, &written); err != nil {
			t.Fatalf("decoding createRecord body: %v", err)
		}
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"uri":"at://did:plc:me/app.bsky.feed.post/ddd","cid":"cid-ddd"}`))
	})

	svc := NewPostBuilderService(mgr)
	got, err := svc.CreatePost(
		"post 4 of the thread",
		"at://did:plc:me/app.bsky.feed.post/ccc", "cid-ccc", // parent: the post before
		"at://did:plc:me/app.bsky.feed.post/aaa", "cid-aaa", // root: the post that opened it
		nil, nil, "", "", "", "", "", "", 0, 0, nil, nil, "", "")
	if err != nil {
		t.Fatalf("CreatePost: %v", err)
	}

	if written.Record.Reply == nil {
		t.Fatal("no reply ref was written")
	}
	if written.Record.Reply.Root.Uri != "at://did:plc:me/app.bsky.feed.post/aaa" {
		t.Errorf("root.uri = %q, want the supplied root", written.Record.Reply.Root.Uri)
	}
	if written.Record.Reply.Parent.Uri != "at://did:plc:me/app.bsky.feed.post/ccc" {
		t.Errorf("parent.uri = %q, want the previous post", written.Record.Reply.Parent.Uri)
	}
	if !strings.HasSuffix(written.Record.CreatedAt, "Z") || len(written.Record.CreatedAt) != len("2006-01-02T15:04:05.000Z") {
		t.Errorf("createdAt = %q, want millisecond-precision UTC", written.Record.CreatedAt)
	}

	// The caller chains on this, so it has to echo the root back unchanged.
	if got.RootUri != "at://did:plc:me/app.bsky.feed.post/aaa" || got.RootCid != "cid-aaa" {
		t.Errorf("returned root = (%q, %q), want the supplied root", got.RootUri, got.RootCid)
	}
	if got.Uri != "at://did:plc:me/app.bsky.feed.post/ddd" || got.Cid != "cid-ddd" {
		t.Errorf("returned ref = (%q, %q), want the new post", got.Uri, got.Cid)
	}
}

// The first post of a brand-new thread replies to nothing, so it is its own
// root. Reporting that lets the caller chain every following post the same way.
func TestCreatePostReportsAStandalonePostAsItsOwnRoot(t *testing.T) {
	mgr := stubClient(t, func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/xrpc/com.atproto.repo.createRecord" {
			t.Errorf("unexpected call to %s", r.URL.Path)
			w.WriteHeader(http.StatusNotFound)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"uri":"at://did:plc:me/app.bsky.feed.post/aaa","cid":"cid-aaa"}`))
	})

	svc := NewPostBuilderService(mgr)
	got, err := svc.CreatePost("post 1 of the thread", "", "", "", "",
		nil, nil, "", "", "", "", "", "", 0, 0, nil, nil, "", "")
	if err != nil {
		t.Fatalf("CreatePost: %v", err)
	}

	if got.RootUri != got.Uri || got.RootCid != got.Cid {
		t.Errorf("root = (%q, %q), want the post itself (%q, %q)",
			got.RootUri, got.RootCid, got.Uri, got.Cid)
	}
}

var sampleMP4Bytes = []byte{
	0x00, 0x00, 0x00, 0x20, 'f', 't', 'y', 'p',
	'i', 's', 'o', 'm', 0x00, 0x00, 0x02, 0x00,
	'i', 's', 'o', 'm', 'i', 's', 'o', '2',
	'a', 'v', 'c', '1', 'm', 'p', '4', '1',
}

func startSampleGifServer(t *testing.T, payload []byte, contentType string) string {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", contentType)
		w.Write(payload)
	}))
	t.Cleanup(srv.Close)
	return srv.URL + "/reaction.mp4"
}

func TestCreatePostWithGifRecoversFromBlobNotFoundAfter409AlreadyExists(t *testing.T) {
	const staleCID = "bafkreibnp4mb24hfsxxw3o5whyhscapwq53idmyttku54muspyov35gb2a"
	const freshCID = "bafkreihdwdcefgh4dqkjv67uzcmw7ojee6xedzdetojuzjevtenxquvyku"

	gifURL := startSampleGifServer(t, sampleMP4Bytes, "video/mp4")

	videoSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/xrpc/app.bsky.video.uploadVideo" {
			t.Errorf("unexpected video service path %s", r.URL.Path)
			w.WriteHeader(http.StatusNotFound)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusConflict)
		w.Write([]byte(`{
			"did":"did:plc:me",
			"error":"already_exists",
			"jobId":"job-stale",
			"message":"Video already processed",
			"state":"JOB_STATE_COMPLETED",
			"blob":{"$type":"blob","ref":{"$link":"` + staleCID + `"},"mimeType":"video/mp4","size":32}
		}`))
	}))
	t.Cleanup(videoSrv.Close)

	var createCalls int
	var uploadBlobCalls int
	var uploadBlobContentType string
	var finalEmbed struct {
		Presentation string `json:"presentation"`
		Alt          string `json:"alt"`
		Video        struct {
			Ref struct {
				Link string `json:"$link"`
			} `json:"ref"`
			MimeType string `json:"mimeType"`
		} `json:"video"`
	}

	mgr := stubClient(t, func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch r.URL.Path {
		case "/xrpc/com.atproto.server.getServiceAuth":
			w.Write([]byte(`{"token":"service-jwt"}`))
		case "/xrpc/com.atproto.repo.uploadBlob":
			uploadBlobCalls++
			uploadBlobContentType = r.Header.Get("Content-Type")
			body, _ := io.ReadAll(r.Body)
			if len(body) != len(sampleMP4Bytes) {
				t.Errorf("uploadBlob size = %d, want %d", len(body), len(sampleMP4Bytes))
			}
			w.Write([]byte(`{"blob":{"$type":"blob","ref":{"$link":"` + freshCID + `"},"mimeType":"video/mp4","size":32}}`))
		case "/xrpc/com.atproto.repo.createRecord":
			createCalls++
			var req struct {
				Record struct {
					Embed json.RawMessage `json:"embed"`
				} `json:"record"`
			}
			body, _ := io.ReadAll(r.Body)
			if err := json.Unmarshal(body, &req); err != nil {
				t.Fatalf("unmarshal createRecord: %v", err)
			}
			if err := json.Unmarshal(req.Record.Embed, &finalEmbed); err != nil {
				t.Fatalf("unmarshal embed: %v", err)
			}
			if createCalls == 1 {
				if finalEmbed.Video.Ref.Link != staleCID {
					t.Errorf("first createRecord cid = %q, want %q", finalEmbed.Video.Ref.Link, staleCID)
				}
				w.WriteHeader(http.StatusBadRequest)
				w.Write([]byte(`{"error":"BlobNotFound","message":"Could not find blob: ` + staleCID + `"}`))
				return
			}
			w.Write([]byte(`{"uri":"at://did:plc:me/app.bsky.feed.post/gif1","cid":"cid-gif1"}`))
		case "/xrpc/app.bsky.feed.getPosts":
			w.Write([]byte(`{"posts":[{"uri":"at://did:plc:me/app.bsky.feed.post/gif1","cid":"cid-gif1","author":{"did":"did:plc:me","handle":"me.test"},"indexedAt":"2026-11-20T10:00:00.000Z","record":{"$type":"app.bsky.feed.post","text":"hi","createdAt":"2026-11-20T10:00:00.000Z"},"embed":{"$type":"app.bsky.embed.video#view","cid":"` + freshCID + `","playlist":"https://video.bsky.app/watch/did:plc:me/` + freshCID + `/playlist.m3u8"}}]}`))
		default:
			t.Errorf("unexpected PDS call %s", r.URL.Path)
			w.WriteHeader(http.StatusNotFound)
		}
	})

	svc := NewPostBuilderService(mgr)
	svc.videoServiceHost = videoSrv.URL
	svc.pollInterval = time.Millisecond
	svc.retryDelay = time.Millisecond

	got, err := svc.CreatePost("friday!", "", "", "", "",
		nil, nil, "", "Joey celebrating Friday", "", "pt", "everyone", gifURL, 640, 320, nil, nil, "", "")
	if err != nil {
		t.Fatalf("CreatePost with GIF failed: %v", err)
	}
	if got.Uri != "at://did:plc:me/app.bsky.feed.post/gif1" {
		t.Errorf("uri = %q, want published gif post", got.Uri)
	}
	if uploadBlobCalls != 1 {
		t.Errorf("uploadBlobCalls = %d, want 1", uploadBlobCalls)
	}
	if uploadBlobContentType != "video/mp4" {
		t.Errorf("uploadBlob Content-Type = %q, want video/mp4", uploadBlobContentType)
	}
	if createCalls != 2 {
		t.Errorf("createCalls = %d, want 2", createCalls)
	}
	if finalEmbed.Video.Ref.Link != freshCID {
		t.Errorf("final blob cid = %q, want %q", finalEmbed.Video.Ref.Link, freshCID)
	}
	if finalEmbed.Presentation != "gif" {
		t.Errorf("presentation = %q, want gif", finalEmbed.Presentation)
	}
	if finalEmbed.Alt != "Joey celebrating Friday" {
		t.Errorf("alt = %q, want preserved alt text", finalEmbed.Alt)
	}
}

func TestQuotePostWithGifRecoversFromBlobNotFound(t *testing.T) {
	const staleCID = "bafkreibnp4mb24hfsxxw3o5whyhscapwq53idmyttku54muspyov35gb2a"
	const freshCID = "bafkreihdwdcefgh4dqkjv67uzcmw7ojee6xedzdetojuzjevtenxquvyku"

	gifURL := startSampleGifServer(t, sampleMP4Bytes, "video/mp4")

	videoSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusConflict)
		w.Write([]byte(`{
			"did":"did:plc:me",
			"error":"already_exists",
			"jobId":"job-stale",
			"state":"JOB_STATE_COMPLETED",
			"blob":{"$type":"blob","ref":{"$link":"` + staleCID + `"},"mimeType":"video/mp4","size":32}
		}`))
	}))
	t.Cleanup(videoSrv.Close)

	var createCalls int
	var finalCID string
	mgr := stubClient(t, func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch r.URL.Path {
		case "/xrpc/com.atproto.server.getServiceAuth":
			w.Write([]byte(`{"token":"service-jwt"}`))
		case "/xrpc/com.atproto.repo.uploadBlob":
			w.Write([]byte(`{"blob":{"$type":"blob","ref":{"$link":"` + freshCID + `"},"mimeType":"video/mp4","size":32}}`))
		case "/xrpc/com.atproto.repo.createRecord":
			createCalls++
			var req struct {
				Record struct {
					Embed struct {
						Media struct {
							Video struct {
								Ref struct {
									Link string `json:"$link"`
								} `json:"ref"`
							} `json:"video"`
						} `json:"media"`
					} `json:"embed"`
				} `json:"record"`
			}
			body, _ := io.ReadAll(r.Body)
			if err := json.Unmarshal(body, &req); err != nil {
				t.Fatalf("unmarshal quote createRecord: %v", err)
			}
			finalCID = req.Record.Embed.Media.Video.Ref.Link
			if createCalls == 1 {
				w.WriteHeader(http.StatusBadRequest)
				w.Write([]byte(`{"error":"BlobNotFound","message":"Could not find blob: ` + staleCID + `"}`))
				return
			}
			w.Write([]byte(`{"uri":"at://did:plc:me/app.bsky.feed.post/qgif","cid":"cid-qgif"}`))
		case "/xrpc/app.bsky.feed.getPosts":
			w.Write([]byte(`{"posts":[{"uri":"at://did:plc:me/app.bsky.feed.post/qgif","cid":"cid-qgif","author":{"did":"did:plc:me","handle":"me.test"},"indexedAt":"2026-11-20T10:00:00.000Z","record":{"$type":"app.bsky.feed.post","text":"quote","createdAt":"2026-11-20T10:00:00.000Z"},"embed":{"$type":"app.bsky.embed.video#view","cid":"` + freshCID + `","playlist":"https://video.bsky.app/watch/did:plc:me/` + freshCID + `/playlist.m3u8"}}]}`))
		default:
			t.Errorf("unexpected PDS call %s", r.URL.Path)
			w.WriteHeader(http.StatusNotFound)
		}
	})

	svc := NewPostBuilderService(mgr)
	svc.videoServiceHost = videoSrv.URL
	svc.pollInterval = time.Millisecond
	svc.retryDelay = time.Millisecond

	got, err := svc.QuotePost("quoting with gif", "at://did:plc:other/app.bsky.feed.post/orig", "cid-orig",
		nil, nil, "", "Reaction GIF", "pt", "everyone", gifURL, 320, 320, nil, nil, "", "")
	if err != nil {
		t.Fatalf("QuotePost with GIF failed: %v", err)
	}
	if got.Uri != "at://did:plc:me/app.bsky.feed.post/qgif" {
		t.Errorf("uri = %q, want quote post uri", got.Uri)
	}
	if finalCID != freshCID {
		t.Errorf("final quote video cid = %q, want %q", finalCID, freshCID)
	}
}

func TestCreatePostWithGifRetriesTransientBlobNotFoundBeforeFallback(t *testing.T) {
	const videoCID = "bafkreibnp4mb24hfsxxw3o5whyhscapwq53idmyttku54muspyov35gb2a"
	gifURL := startSampleGifServer(t, sampleMP4Bytes, "video/mp4")

	var statusAuthHeader string
	videoSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch r.URL.Path {
		case "/xrpc/app.bsky.video.uploadVideo":
			w.Write([]byte(`{"did":"did:plc:me","jobId":"job-new","state":"JOB_STATE_CREATED"}`))
		case "/xrpc/app.bsky.video.getJobStatus":
			statusAuthHeader = r.Header.Get("Authorization")
			w.Write([]byte(`{"jobStatus":{"did":"did:plc:me","jobId":"job-new","state":"JOB_STATE_COMPLETED","blob":{"$type":"blob","ref":{"$link":"` + videoCID + `"},"mimeType":"video/mp4","size":32}}}`))
		default:
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	t.Cleanup(videoSrv.Close)

	var createCalls int
	var uploadBlobCalls int
	mgr := stubClient(t, func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch r.URL.Path {
		case "/xrpc/com.atproto.server.getServiceAuth":
			w.Write([]byte(`{"token":"service-jwt"}`))
		case "/xrpc/com.atproto.repo.uploadBlob":
			uploadBlobCalls++
			w.WriteHeader(http.StatusInternalServerError)
		case "/xrpc/com.atproto.repo.createRecord":
			createCalls++
			if createCalls == 1 {
				w.WriteHeader(http.StatusBadRequest)
				w.Write([]byte(`{"error":"BlobNotFound","message":"Could not find blob: ` + videoCID + `"}`))
				return
			}
			w.Write([]byte(`{"uri":"at://did:plc:me/app.bsky.feed.post/ok","cid":"cid-ok"}`))
		case "/xrpc/app.bsky.feed.getPosts":
			w.Write([]byte(`{"posts":[{"uri":"at://did:plc:me/app.bsky.feed.post/ok","cid":"cid-ok","author":{"did":"did:plc:me","handle":"me.test"},"indexedAt":"2026-11-20T10:00:00.000Z","record":{"$type":"app.bsky.feed.post","text":"hi","createdAt":"2026-11-20T10:00:00.000Z"},"embed":{"$type":"app.bsky.embed.video#view","cid":"` + videoCID + `","playlist":"https://video.bsky.app/watch/did:plc:me/` + videoCID + `/playlist.m3u8"}}]}`))
		default:
			w.WriteHeader(http.StatusNotFound)
		}
	})

	svc := NewPostBuilderService(mgr)
	svc.videoServiceHost = videoSrv.URL
	svc.pollInterval = time.Millisecond
	svc.retryDelay = time.Millisecond

	if _, err := svc.CreatePost("hi", "", "", "", "",
		nil, nil, "", "Animated GIF", "", "en", "everyone", gifURL, 320, 320, nil, nil, "", ""); err != nil {
		t.Fatalf("CreatePost failed on transient BlobNotFound: %v", err)
	}
	if statusAuthHeader != "" {
		t.Errorf("getJobStatus Authorization = %q, want empty (tokenless)", statusAuthHeader)
	}
	if createCalls != 2 {
		t.Errorf("createCalls = %d, want 2", createCalls)
	}
	if uploadBlobCalls != 0 {
		t.Errorf("uploadBlobCalls = %d, want 0 when transient retry succeeds", uploadBlobCalls)
	}
}

func TestCreatePostWithGifFallsBackAfterPersistentBlobNotFoundOn200(t *testing.T) {
	const staleCID = "bafkreibnp4mb24hfsxxw3o5whyhscapwq53idmyttku54muspyov35gb2a"
	const freshCID = "bafkreihdwdcefgh4dqkjv67uzcmw7ojee6xedzdetojuzjevtenxquvyku"
	gifURL := startSampleGifServer(t, sampleMP4Bytes, "video/mp4")

	videoSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch r.URL.Path {
		case "/xrpc/app.bsky.video.uploadVideo":
			w.Write([]byte(`{"did":"did:plc:me","jobId":"job-200","state":"JOB_STATE_CREATED"}`))
		case "/xrpc/app.bsky.video.getJobStatus":
			w.Write([]byte(`{"jobStatus":{"did":"did:plc:me","jobId":"job-200","state":"JOB_STATE_COMPLETED","blob":{"$type":"blob","ref":{"$link":"` + staleCID + `"},"mimeType":"video/mp4","size":32}}}`))
		default:
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	t.Cleanup(videoSrv.Close)

	var createCalls int
	var uploadBlobCalls int
	mgr := stubClient(t, func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch r.URL.Path {
		case "/xrpc/com.atproto.server.getServiceAuth":
			w.Write([]byte(`{"token":"service-jwt"}`))
		case "/xrpc/com.atproto.repo.uploadBlob":
			uploadBlobCalls++
			w.Write([]byte(`{"blob":{"$type":"blob","ref":{"$link":"` + freshCID + `"},"mimeType":"video/mp4","size":32}}`))
		case "/xrpc/com.atproto.repo.createRecord":
			createCalls++
			if createCalls <= 2 {
				w.WriteHeader(http.StatusBadRequest)
				w.Write([]byte(`{"error":"BlobNotFound","message":"Could not find blob: ` + staleCID + `"}`))
				return
			}
			w.Write([]byte(`{"uri":"at://did:plc:me/app.bsky.feed.post/ok2","cid":"cid-ok2"}`))
		case "/xrpc/app.bsky.feed.getPosts":
			w.Write([]byte(`{"posts":[{"uri":"at://did:plc:me/app.bsky.feed.post/ok2","cid":"cid-ok2","author":{"did":"did:plc:me","handle":"me.test"},"indexedAt":"2026-11-20T10:00:00.000Z","record":{"$type":"app.bsky.feed.post","text":"hi","createdAt":"2026-11-20T10:00:00.000Z"},"embed":{"$type":"app.bsky.embed.video#view","cid":"` + freshCID + `","playlist":"https://video.bsky.app/watch/did:plc:me/` + freshCID + `/playlist.m3u8"}}]}`))
		default:
			w.WriteHeader(http.StatusNotFound)
		}
	})

	svc := NewPostBuilderService(mgr)
	svc.videoServiceHost = videoSrv.URL
	svc.pollInterval = time.Millisecond
	svc.retryDelay = time.Millisecond

	if _, err := svc.CreatePost("hi", "", "", "", "",
		nil, nil, "", "Animated GIF", "", "en", "everyone", gifURL, 320, 320, nil, nil, "", ""); err != nil {
		t.Fatalf("CreatePost failed: %v", err)
	}
	if createCalls != 3 {
		t.Errorf("createCalls = %d, want 3", createCalls)
	}
	if uploadBlobCalls != 1 {
		t.Errorf("uploadBlobCalls = %d, want 1", uploadBlobCalls)
	}
}

func TestDetectVideoMimeTypeAndIsMP4File(t *testing.T) {
	if got := detectVideoMimeType("clip.gif"); got != "image/gif" {
		t.Errorf("detectVideoMimeType(clip.gif) = %q, want image/gif", got)
	}
	if got := detectVideoMimeType("clip.mp4"); got != "video/mp4" {
		t.Errorf("detectVideoMimeType(clip.mp4) = %q, want video/mp4", got)
	}

	dir := t.TempDir()
	mp4Path := filepath.Join(dir, "sample.mp4")
	gifPath := filepath.Join(dir, "sample.gif")
	movPath := filepath.Join(dir, "sample.mov")

	if err := os.WriteFile(mp4Path, sampleMP4Bytes, 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(gifPath, []byte("GIF89a\x01\x00\x01\x00\x00\x00"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(movPath, []byte{0x00, 0x00, 0x00, 0x14, 'f', 't', 'y', 'p', 'q', 't', ' ', ' '}, 0600); err != nil {
		t.Fatal(err)
	}

	if !isMP4File(mp4Path) {
		t.Error("isMP4File returned false for valid MP4")
	}
	if isMP4File(gifPath) {
		t.Error("isMP4File returned true for GIF")
	}
	if isMP4File(movPath) {
		t.Error("isMP4File returned true for QuickTime MOV")
	}
}

func TestIsVideoBlobNotFoundIgnoresCaptionBlobErrors(t *testing.T) {
	videoCID, err := cid.Decode("bafkreibnp4mb24hfsxxw3o5whyhscapwq53idmyttku54muspyov35gb2a")
	if err != nil {
		t.Fatal(err)
	}
	captionCID, err := cid.Decode("bafkreihdwdcefgh4dqkjv67uzcmw7ojee6xedzdetojuzjevtenxquvyku")
	if err != nil {
		t.Fatal(err)
	}

	embed := &bsky.EmbedVideo{
		Video: &util.LexBlob{Ref: util.LexLink(videoCID), MimeType: "video/mp4", Size: 32},
		Captions: []*bsky.EmbedVideo_Caption{
			{File: &util.LexBlob{Ref: util.LexLink(captionCID), MimeType: "text/vtt", Size: 16}, Lang: "pt"},
		},
	}

	videoErr := &xrpc.Error{
		StatusCode: http.StatusBadRequest,
		Wrapped:    &xrpc.XRPCError{ErrStr: "BlobNotFound", Message: "Could not find blob: " + videoCID.String()},
	}
	captionErr := &xrpc.Error{
		StatusCode: http.StatusBadRequest,
		Wrapped:    &xrpc.XRPCError{ErrStr: "BlobNotFound", Message: "Could not find blob: " + captionCID.String()},
	}

	if !isVideoBlobNotFound(videoErr, embed) {
		t.Error("expected true for video blob not found error")
	}
	if isVideoBlobNotFound(captionErr, embed) {
		t.Error("expected false when error names a caption blob CID")
	}
}

func TestBuildDraftRecordSupportsMultiPostThreads(t *testing.T) {
	draft := buildDraftRecordFromPosts([]string{"Post 1", "Post 2", "Post 3"}, []string{"pt"}, []string{"nudity"}, []string{"followers", "list:at://did:plc:me/app.bsky.graph.list/l1"}, true)
	if len(draft.Posts) != 3 {
		t.Fatalf("len(draft.Posts) = %d, want 3", len(draft.Posts))
	}
	if draft.Posts[0].Text != "Post 1" || draft.Posts[1].Text != "Post 2" || draft.Posts[2].Text != "Post 3" {
		t.Errorf("unexpected draft post texts: %+v", draft.Posts)
	}
	if len(draft.ThreadgateAllow) != 2 {
		t.Errorf("len(draft.ThreadgateAllow) = %d, want 2", len(draft.ThreadgateAllow))
	}
	if len(draft.PostgateEmbeddingRules) != 1 {
		t.Errorf("len(draft.PostgateEmbeddingRules) = %d, want 1", len(draft.PostgateEmbeddingRules))
	}
}
