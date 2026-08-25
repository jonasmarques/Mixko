package services

import (
	"encoding/json"
	"net/http"
	"testing"
)

// notificationsStub serves a listNotifications page plus the getPosts hydration
// it triggers, recording the URIs that were asked for.
func notificationsStub(t *testing.T, notifications string, posts map[string]string, gotURIs *[]string) *ATClient {
	t.Helper()
	return stubClient(t, func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch r.URL.Path {
		case "/xrpc/app.bsky.notification.listNotifications":
			w.Write([]byte(`{"notifications":[` + notifications + `]}`))
		case "/xrpc/app.bsky.feed.getPosts":
			uris := r.URL.Query()["uris"]
			*gotURIs = append(*gotURIs, uris...)
			out := ""
			for _, uri := range uris {
				if post, ok := posts[uri]; ok {
					if out != "" {
						out += ","
					}
					out += post
				}
			}
			w.Write([]byte(`{"posts":[` + out + `]}`))
		default:
			t.Errorf("unexpected path %q", r.URL.Path)
			w.Write([]byte(`{}`))
		}
	})
}

func postView(uri, did, handle, displayName, text string, reply string) string {
	record := map[string]interface{}{
		"$type":     "app.bsky.feed.post",
		"text":      text,
		"createdAt": "2026-08-20T10:00:00Z",
	}
	if reply != "" {
		var parsed map[string]interface{}
		if err := json.Unmarshal([]byte(reply), &parsed); err == nil {
			record["reply"] = parsed
		}
	}
	encoded, _ := json.Marshal(map[string]interface{}{
		"uri": uri,
		"cid": "cid-" + did,
		"author": map[string]interface{}{
			"did":         did,
			"handle":      handle,
			"displayName": displayName,
		},
		"record":    record,
		"indexedAt": "2026-08-20T10:00:00Z",
	})
	return string(encoded)
}

const meDID = "did:plc:me"

// A reply notification also fires when we merely own the thread root, so the
// answered post is often somebody else's and the UI must not claim it as ours.
func TestGetNotificationsResolvesTheAuthorOfTheAnsweredPost(t *testing.T) {
	rootURI := "at://" + meDID + "/app.bsky.feed.post/root1"
	daniURI := "at://did:plc:dani/app.bsky.feed.post/d1"
	replyURI := "at://did:plc:bruno/app.bsky.feed.post/b1"
	replyMeta := `{"parent":{"uri":"` + daniURI + `","cid":"c1"},"root":{"uri":"` + rootURI + `","cid":"c0"}}`

	notification := `{
		"uri":"` + replyURI + `",
		"cid":"cid-bruno",
		"author":{"did":"did:plc:bruno","handle":"bruno.test","displayName":"Bruno"},
		"reason":"reply",
		"reasonSubject":"` + rootURI + `",
		"record":{"$type":"app.bsky.feed.post","text":"discordo","createdAt":"2026-08-20T10:00:00Z","reply":` + replyMeta + `},
		"isRead":false,
		"indexedAt":"2026-08-20T10:00:00Z"
	}`

	var gotURIs []string
	mgr := notificationsStub(t, notification, map[string]string{
		replyURI: postView(replyURI, "did:plc:bruno", "bruno.test", "Bruno", "discordo", replyMeta),
		daniURI:  postView(daniURI, "did:plc:dani", "dani.test", "Dani", "meu ponto", ""),
		rootURI:  postView(rootURI, meDID, "eu.test", "Eu", "abrindo a thread", ""),
	}, &gotURIs)

	out, err := NewNotificationsService(mgr).GetNotifications("")
	if err != nil {
		t.Fatalf("GetNotifications: %v", err)
	}
	if len(out.Notifications) != 1 {
		t.Fatalf("got %d notifications, want 1", len(out.Notifications))
	}

	notif := out.Notifications[0]
	if notif.ReplyParentURI != daniURI {
		t.Errorf("replyParentUri = %q, want the post actually answered (%q)", notif.ReplyParentURI, daniURI)
	}
	if notif.ReplyParentAuthorDID != "did:plc:dani" {
		t.Errorf("replyParentAuthorDid = %q, want did:plc:dani and not our own DID", notif.ReplyParentAuthorDID)
	}
	if notif.ReplyParentAuthorHandle != "dani.test" || notif.ReplyParentAuthorName != "Dani" {
		t.Errorf("parent author = %q/%q, want dani.test/Dani",
			notif.ReplyParentAuthorHandle, notif.ReplyParentAuthorName)
	}
}

func TestGetNotificationsMarksARepliedToPostOfOurOwn(t *testing.T) {
	myURI := "at://" + meDID + "/app.bsky.feed.post/mine"
	replyURI := "at://did:plc:bruno/app.bsky.feed.post/b2"
	replyMeta := `{"parent":{"uri":"` + myURI + `","cid":"c1"},"root":{"uri":"` + myURI + `","cid":"c1"}}`

	notification := `{
		"uri":"` + replyURI + `",
		"cid":"cid-bruno",
		"author":{"did":"did:plc:bruno","handle":"bruno.test","displayName":"Bruno"},
		"reason":"reply",
		"reasonSubject":"` + myURI + `",
		"record":{"$type":"app.bsky.feed.post","text":"boa","createdAt":"2026-08-20T10:00:00Z","reply":` + replyMeta + `},
		"isRead":false,
		"indexedAt":"2026-08-20T10:00:00Z"
	}`

	var gotURIs []string
	mgr := notificationsStub(t, notification, map[string]string{
		replyURI: postView(replyURI, "did:plc:bruno", "bruno.test", "Bruno", "boa", replyMeta),
		myURI:    postView(myURI, meDID, "eu.test", "Eu", "meu post", ""),
	}, &gotURIs)

	out, err := NewNotificationsService(mgr).GetNotifications("")
	if err != nil {
		t.Fatalf("GetNotifications: %v", err)
	}
	if len(out.Notifications) != 1 {
		t.Fatalf("got %d notifications, want 1", len(out.Notifications))
	}
	if got := out.Notifications[0].ReplyParentAuthorDID; got != meDID {
		t.Errorf("replyParentAuthorDid = %q, want our own DID so the UI says \"your post\"", got)
	}

	// The reply's own URI, its reasonSubject and its parent overlap here; each
	// should be requested once.
	seen := map[string]int{}
	for _, uri := range gotURIs {
		seen[uri]++
	}
	for uri, count := range seen {
		if count > 1 {
			t.Errorf("uri %q hydrated %d times, want once", uri, count)
		}
	}
}
