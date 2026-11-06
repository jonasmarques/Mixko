package services

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/bluesky-social/indigo/api/bsky"
	"github.com/bluesky-social/indigo/lex/util"
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

func TestExtractImagesFromRecord(t *testing.T) {
	record := map[string]interface{}{
		"$type": "app.bsky.feed.post",
		"text":  "Post with image",
		"embed": map[string]interface{}{
			"$type": "app.bsky.embed.images",
			"images": []interface{}{
				map[string]interface{}{
					"alt": "Foto de um gatinho",
					"image": map[string]interface{}{
						"$type": "blob",
						"ref": map[string]interface{}{
							"$link": "bafkreia123",
						},
					},
					"aspectRatio": map[string]interface{}{
						"width":  800,
						"height": 600,
					},
				},
			},
		},
	}

	alts, images := ExtractImagesFromRecord(record, "did:plc:author1")
	if len(alts) != 1 || alts[0] != "Foto de um gatinho" {
		t.Fatalf("unexpected alts: %+v", alts)
	}
	if len(images) != 1 || images[0].Alt != "Foto de um gatinho" {
		t.Fatalf("unexpected images: %+v", images)
	}
	if images[0].Width != 800 || images[0].Height != 600 {
		t.Errorf("unexpected aspect ratio: width=%d height=%d", images[0].Width, images[0].Height)
	}
	expectedThumb := "https://cdn.bsky.app/img/feed_thumbnail/plain/did:plc:author1/bafkreia123@jpeg"
	if images[0].Thumb != expectedThumb {
		t.Errorf("thumb = %q, want %q", images[0].Thumb, expectedThumb)
	}
}

func TestParsePostViewQuoteWithRecordWithMedia(t *testing.T) {
	cDisplayName := "Carol"
	pv := &bsky.FeedDefs_PostView{
		Uri: "at://did:plc:bob/app.bsky.feed.post/postB",
		Cid: "cidB",
		Author: &bsky.ActorDefs_ProfileViewBasic{
			Did:    "did:plc:bob",
			Handle: "bob.bsky.social",
		},
		Record: &util.LexiconTypeDecoder{
			Val: &bsky.FeedPost{
				Text: "Quote by Bob",
			},
		},
		Embed: &bsky.FeedDefs_PostView_Embed{
			EmbedRecord_View: &bsky.EmbedRecord_View{
				Record: &bsky.EmbedRecord_View_Record{
					EmbedRecord_ViewRecord: &bsky.EmbedRecord_ViewRecord{
						Uri: "at://did:plc:carol/app.bsky.feed.post/postC",
						Cid: "cidC",
						Author: &bsky.ActorDefs_ProfileViewBasic{
							Did:         "did:plc:carol",
							Handle:      "carol.bsky.social",
							DisplayName: &cDisplayName,
						},
						Value: &util.LexiconTypeDecoder{
							Val: &bsky.FeedPost{
								Text: "Post original de Carol",
							},
						},
						Embeds: []*bsky.EmbedRecord_ViewRecord_Embeds_Elem{
							{
								EmbedRecordWithMedia_View: &bsky.EmbedRecordWithMedia_View{
									Media: &bsky.EmbedRecordWithMedia_View_Media{
										EmbedImages_View: &bsky.EmbedImages_View{
											Images: []*bsky.EmbedImages_ViewImage{
												{
													Alt:      "Gatinho da Carol",
													Thumb:    "https://example.com/thumb.jpg",
													Fullsize: "https://example.com/full.jpg",
												},
											},
										},
									},
								},
							},
						},
					},
				},
			},
		},
	}

	dto := ParsePostView(pv)
	if dto == nil {
		t.Fatalf("expected dto to be non-nil")
	}
	if dto.QuotePost == nil {
		t.Fatalf("expected QuotePost to be non-nil")
	}
	if dto.QuotePost.AuthorHandle != "carol.bsky.social" || dto.QuotePost.AuthorName != "Carol" {
		t.Errorf("unexpected quote author: %+v", dto.QuotePost)
	}
	if len(dto.QuotePost.Images) != 1 || dto.QuotePost.Images[0].Alt != "Gatinho da Carol" {
		t.Errorf("unexpected quote images: %+v", dto.QuotePost.Images)
	}
	if len(dto.QuotePost.ImageAlts) != 1 || dto.QuotePost.ImageAlts[0] != "Gatinho da Carol" {
		t.Errorf("unexpected quote imageAlts: %+v", dto.QuotePost.ImageAlts)
	}
	if !dto.QuotePost.HasMedia {
		t.Errorf("expected QuotePost.HasMedia to be true")
	}
}

func TestExtractVideoCaptionsFromRecordDefaultAndExternalPDS(t *testing.T) {
	record := map[string]interface{}{
		"$type": "app.bsky.feed.post",
		"text":  "Video with captions",
		"embed": map[string]interface{}{
			"$type": "app.bsky.embed.video",
			"alt":   "Accessible video",
			"video": map[string]interface{}{
				"$type": "blob",
				"ref": map[string]interface{}{
					"$link": "bafkreivideocid",
				},
			},
			"captions": []interface{}{
				map[string]interface{}{
					"lang": "pt",
					"file": map[string]interface{}{
						"$type": "blob",
						"ref": map[string]interface{}{
							"$link": "bafkreicaptionpt",
						},
					},
				},
			},
		},
	}

	vidDefault := ExtractVideoFromRecord(record, "did:plc:defaultuser")
	if vidDefault == nil || len(vidDefault.Captions) != 1 {
		t.Fatalf("expected 1 caption on default PDS, got %+v", vidDefault)
	}
	wantDefaultURL := "https://bsky.social/xrpc/com.atproto.sync.getBlob?did=did%3Aplc%3Adefaultuser&cid=bafkreicaptionpt"
	if vidDefault.Captions[0].Lang != "pt" || vidDefault.Captions[0].URL != wantDefaultURL {
		t.Errorf("unexpected default caption: %+v, want URL %q", vidDefault.Captions[0], wantDefaultURL)
	}

	CachePDSHost("did:plc:custompdsuser", "https://pds.custom.example/")
	vidCustom := ExtractVideoFromRecord(record, "did:plc:custompdsuser")
	if vidCustom == nil || len(vidCustom.Captions) != 1 {
		t.Fatalf("expected 1 caption on custom PDS, got %+v", vidCustom)
	}
	wantCustomURL := "https://pds.custom.example/xrpc/com.atproto.sync.getBlob?did=did%3Aplc%3Acustompdsuser&cid=bafkreicaptionpt"
	if vidCustom.Captions[0].URL != wantCustomURL {
		t.Errorf("custom PDS caption URL = %q, want %q", vidCustom.Captions[0].URL, wantCustomURL)
	}
}

func TestGetPostThreadAndGetPostsFallbackToExternalPDS(t *testing.T) {
	extDID := "did:plc:extuser1"
	rootURI := "at://" + extDID + "/app.bsky.feed.post/root1"
	replyURI := "at://" + extDID + "/app.bsky.feed.post/reply1"

	pdsSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/xrpc/com.atproto.repo.getRecord" {
			http.NotFound(w, r)
			return
		}
		collection := r.URL.Query().Get("collection")
		rkey := r.URL.Query().Get("rkey")
		w.Header().Set("Content-Type", "application/json")
		switch {
		case collection == "app.bsky.actor.profile" && rkey == "self":
			w.Write([]byte(`{
				"uri": "at://` + extDID + `/app.bsky.actor.profile/self",
				"cid": "cidprof",
				"value": {
					"$type": "app.bsky.actor.profile",
					"displayName": "External User"
				}
			}`))
		case collection == "app.bsky.feed.post" && rkey == "root1":
			w.Write([]byte(`{
				"uri": "` + rootURI + `",
				"cid": "cidroot1",
				"value": {
					"$type": "app.bsky.feed.post",
					"text": "Root post on custom PDS",
					"createdAt": "2026-08-14T10:00:00Z"
				}
			}`))
		case collection == "app.bsky.feed.post" && rkey == "reply1":
			w.Write([]byte(`{
				"uri": "` + replyURI + `",
				"cid": "cidreply1",
				"value": {
					"$type": "app.bsky.feed.post",
					"text": "Reply post with captioned video on custom PDS",
					"createdAt": "2026-08-14T10:05:00Z",
					"reply": {
						"root": {"uri": "` + rootURI + `", "cid": "cidroot1"},
						"parent": {"uri": "` + rootURI + `", "cid": "cidroot1"}
					},
					"embed": {
						"$type": "app.bsky.embed.video",
						"alt": "Custom PDS video",
						"video": {
							"$type": "blob",
							"ref": {"$link": "bafkreividext"}
						},
						"captions": [
							{
								"lang": "en",
								"file": {
									"$type": "blob",
									"ref": {"$link": "bafkreicapext"}
								}
							}
						]
					}
				}
			}`))
		default:
			http.NotFound(w, r)
		}
	}))
	t.Cleanup(pdsSrv.Close)

	CachePDSHost(extDID, pdsSrv.URL)
	CacheDID(extDID, "extuser.custom.example")

	mgr := stubClient(t, func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch r.URL.Path {
		case "/xrpc/app.bsky.feed.getPostThread":
			w.WriteHeader(http.StatusBadRequest)
			w.Write([]byte(`{"error":"NotFound","message":"Post not found"}`))
		case "/xrpc/app.bsky.feed.getPosts":
			w.Write([]byte(`{"posts":[]}`))
		default:
			http.NotFound(w, r)
		}
	})

	svc := NewFeedService(mgr)
	thread, err := svc.GetPostThread(replyURI, 6)
	if err != nil {
		t.Fatalf("GetPostThread failed: %v", err)
	}
	if len(thread.Posts) != 2 {
		t.Fatalf("expected 2 posts (root + reply) from external PDS, got %d", len(thread.Posts))
	}
	if thread.Posts[0].URI != rootURI || thread.Posts[0].Text != "Root post on custom PDS" {
		t.Errorf("unexpected root post: %+v", thread.Posts[0])
	}
	replyDTO := thread.Posts[1]
	if replyDTO.URI != replyURI || replyDTO.AuthorHandle != "extuser.custom.example" || replyDTO.AuthorName != "External User" {
		t.Errorf("unexpected reply post metadata: %+v", replyDTO)
	}
	if replyDTO.Video == nil || len(replyDTO.Video.Captions) != 1 {
		t.Fatalf("expected video with 1 caption on external PDS reply, got %+v", replyDTO.Video)
	}
	wantCapURL := pdsSrv.URL + "/xrpc/com.atproto.sync.getBlob?did=did%3Aplc%3Aextuser1&cid=bafkreicapext"
	if replyDTO.Video.Captions[0].URL != wantCapURL {
		t.Errorf("caption URL = %q, want %q", replyDTO.Video.Captions[0].URL, wantCapURL)
	}

	postsRes, err := svc.GetPosts([]string{rootURI})
	if err != nil || len(postsRes.Posts) != 1 || postsRes.Posts[0].URI != rootURI {
		t.Fatalf("GetPosts fallback failed: err=%v, posts=%+v", err, postsRes)
	}
}

