package services

import (
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"testing"
	"time"
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
		nil, nil, "", "", "", "", "", "", 0, 0, nil)
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
		nil, nil, "", "", "", "", "", "", 0, 0, nil)
	if err != nil {
		t.Fatalf("CreatePost: %v", err)
	}

	if got.RootUri != got.Uri || got.RootCid != got.Cid {
		t.Errorf("root = (%q, %q), want the post itself (%q, %q)",
			got.RootUri, got.RootCid, got.Uri, got.Cid)
	}
}
