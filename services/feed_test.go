package services

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/bluesky-social/indigo/xrpc"
)

// stubClient points an ATClient at a test server, so the raw XRPC decoding can
// be exercised without a real session.
func stubClient(t *testing.T, handler http.HandlerFunc) *ATClient {
	t.Helper()
	srv := httptest.NewServer(handler)
	t.Cleanup(srv.Close)

	mgr := NewATClient(nil)
	mgr.SetClient(&xrpc.Client{
		Host: srv.URL,
		Auth: &xrpc.AuthInfo{Did: "did:plc:me", AccessJwt: "token", RefreshJwt: "token"},
	})
	return mgr
}

func TestGetTrendsDecodesTheFieldsTheUIShows(t *testing.T) {
	var gotLimit string
	mgr := stubClient(t, func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/xrpc/app.bsky.unspecced.getTrends" {
			t.Errorf("path = %q", r.URL.Path)
		}
		gotLimit = r.URL.Query().Get("limit")
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"trends":[{
			"topic":"1d151bdcba70",
			"displayName":"Something happened",
			"description":"Why it happened.",
			"link":"/profile/did:plc:abc/feed/1d151bdcba70",
			"startedAt":"2026-08-14T02:48:10.875658+00:00",
			"postCount":2357,
			"status":"trending",
			"category":"other",
			"actors":[{"did":"did:plc:a","handle":"alice.test"},{"did":"did:plc:b","handle":"bob.test"}]
		}]}`))
	})

	out, err := NewFeedService(mgr).GetTrends(0)
	if err != nil {
		t.Fatalf("GetTrends: %v", err)
	}
	if gotLimit != "25" {
		t.Errorf("limit = %q, want the clamped 25", gotLimit)
	}
	if len(out.Trends) != 1 {
		t.Fatalf("got %d trends, want 1", len(out.Trends))
	}

	trend := out.Trends[0]
	if trend.DisplayName != "Something happened" {
		t.Errorf("displayName = %q", trend.DisplayName)
	}
	// The description is the reason this response is decoded by hand.
	if trend.Description != "Why it happened." {
		t.Errorf("description = %q, want the description carried through", trend.Description)
	}
	if trend.Link != "/profile/did:plc:abc/feed/1d151bdcba70" {
		t.Errorf("link = %q", trend.Link)
	}
	if trend.PostCount != 2357 {
		t.Errorf("postCount = %d", trend.PostCount)
	}
	if len(trend.Actors) != 2 || trend.Actors[0] != "alice.test" {
		t.Errorf("actors = %v, want the handles", trend.Actors)
	}
}

func TestGetTrendsClampsLimitToTheLexiconMaximum(t *testing.T) {
	var gotLimit string
	mgr := stubClient(t, func(w http.ResponseWriter, r *http.Request) {
		gotLimit = r.URL.Query().Get("limit")
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"trends":[]}`))
	})

	if _, err := NewFeedService(mgr).GetTrends(500); err != nil {
		t.Fatalf("GetTrends: %v", err)
	}
	if gotLimit != "25" {
		t.Errorf("limit = %q, want 25", gotLimit)
	}
}

func TestExtractReplyMetaFromRecord(t *testing.T) {
	record := map[string]interface{}{
		"text": "Reply to post 2",
		"reply": map[string]interface{}{
			"parent": map[string]interface{}{
				"uri": "at://did:plc:user2/app.bsky.feed.post/post2",
			},
			"root": map[string]interface{}{
				"uri": "at://did:plc:user1/app.bsky.feed.post/post1",
			},
		},
	}

	isReply, parentURI, parentDID, rootURI, rootDID := ExtractReplyMetaFromRecord(record)
	if !isReply {
		t.Fatalf("expected isReply to be true")
	}
	if parentURI != "at://did:plc:user2/app.bsky.feed.post/post2" || parentDID != "did:plc:user2" {
		t.Errorf("unexpected parent: uri=%q, did=%q", parentURI, parentDID)
	}
	if rootURI != "at://did:plc:user1/app.bsky.feed.post/post1" || rootDID != "did:plc:user1" {
		t.Errorf("unexpected root: uri=%q, did=%q", rootURI, rootDID)
	}

	CacheAuthor("did:plc:user1", "alice.test", "Alice")
	CacheAuthor("did:plc:user2", "bob.test", "Bob")

	identity1, ok1 := GetAuthorForDID("did:plc:user1")
	if !ok1 || identity1.Handle != "alice.test" || identity1.DisplayName != "Alice" {
		t.Errorf("unexpected identity1: %+v", identity1)
	}

	identity2, ok2 := GetAuthorForDID("did:plc:user2")
	if !ok2 || identity2.Handle != "bob.test" || identity2.DisplayName != "Bob" {
		t.Errorf("unexpected identity2: %+v", identity2)
	}
}
