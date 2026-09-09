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

func TestPutActivitySubscription(t *testing.T) {
	targetDID := "did:plc:targetuser"
	var gotBody map[string]interface{}

	mgr := stubClient(t, func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/xrpc/app.bsky.notification.putActivitySubscription" {
			t.Errorf("path = %q, want /xrpc/app.bsky.notification.putActivitySubscription", r.URL.Path)
		}
		if r.Method != http.MethodPost {
			t.Errorf("method = %q, want POST", r.Method)
		}
		if err := json.NewDecoder(r.Body).Decode(&gotBody); err != nil {
			t.Errorf("failed to decode body: %v", err)
		}
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{
			"subject": "` + targetDID + `",
			"activitySubscription": {
				"post": true,
				"reply": false
			}
		}`))
	})

	svc := NewNotificationsService(mgr)
	res, err := svc.PutActivitySubscription(targetDID, true, false)
	if err != nil {
		t.Fatalf("PutActivitySubscription failed: %v", err)
	}
	if res == nil {
		t.Fatal("expected non-nil response")
	}
	if !res.Post || res.Reply {
		t.Errorf("got post=%v reply=%v, want post=true reply=false", res.Post, res.Reply)
	}
	if gotBody["subject"] != targetDID {
		t.Errorf("sent subject = %v, want %s", gotBody["subject"], targetDID)
	}
}

func TestGetNotificationPreferences(t *testing.T) {
	mgr := stubClient(t, func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch r.URL.Path {
		case "/xrpc/app.bsky.notification.getPreferences":
			w.Write([]byte(`{
				"preferences": {
					"like": {"include": "follows", "list": true, "push": false},
					"repost": {"include": "all", "list": false, "push": true},
					"chat": {"include": "accepted", "push": true},
					"subscribedPost": {"list": true, "push": true}
				}
			}`))
		case "/xrpc/app.bsky.notification.listNotifications":
			w.Write([]byte(`{"notifications":[],"priority":true}`))
		default:
			t.Errorf("unexpected path %q", r.URL.Path)
			w.Write([]byte(`{}`))
		}
	})

	svc := NewNotificationsService(mgr)
	prefs, err := svc.GetNotificationPreferences()
	if err != nil {
		t.Fatalf("GetNotificationPreferences failed: %v", err)
	}
	if prefs == nil {
		t.Fatal("expected non-nil prefs")
	}
	if !prefs.Priority {
		t.Errorf("priority = %v, want true", prefs.Priority)
	}
	if prefs.Like.Include != "follows" || !prefs.Like.List || prefs.Like.Push {
		t.Errorf("like = %+v, want follows/true/false", prefs.Like)
	}
	if prefs.Repost.Include != "all" || prefs.Repost.List || !prefs.Repost.Push {
		t.Errorf("repost = %+v, want all/false/true", prefs.Repost)
	}
	if prefs.Chat.Include != "accepted" || !prefs.Chat.Push {
		t.Errorf("chat = %+v, want accepted/true", prefs.Chat)
	}
	if !prefs.SubscribedPost.List || !prefs.SubscribedPost.Push {
		t.Errorf("subscribedPost = %+v, want true/true", prefs.SubscribedPost)
	}
}

func TestPutNotificationPreferences(t *testing.T) {
	var gotV2Body map[string]interface{}
	var gotPriorityBody map[string]interface{}

	mgr := stubClient(t, func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch r.URL.Path {
		case "/xrpc/app.bsky.notification.putPreferencesV2":
			if err := json.NewDecoder(r.Body).Decode(&gotV2Body); err != nil {
				t.Errorf("failed to decode v2 body: %v", err)
			}
			w.Write([]byte(`{"preferences":{}}`))
		case "/xrpc/app.bsky.notification.putPreferences":
			if err := json.NewDecoder(r.Body).Decode(&gotPriorityBody); err != nil {
				t.Errorf("failed to decode priority body: %v", err)
			}
			w.Write([]byte(`{}`))
		default:
			t.Errorf("unexpected path %q", r.URL.Path)
			w.Write([]byte(`{}`))
		}
	})

	svc := NewNotificationsService(mgr)
	input := &NotificationPreferencesDTO{
		Priority: true,
		Like:     &NotificationFilterablePrefDTO{Include: "follows", List: true, Push: false},
		Repost:   &NotificationFilterablePrefDTO{Include: "all", List: true, Push: true},
		Chat:     &NotificationChatPrefDTO{Include: "accepted", Push: true},
	}
	res, err := svc.PutNotificationPreferences(input)
	if err != nil {
		t.Fatalf("PutNotificationPreferences failed: %v", err)
	}
	if res == nil {
		t.Fatal("expected non-nil response")
	}
	if gotPriorityBody["priority"] != true {
		t.Errorf("got priority %v, want true", gotPriorityBody["priority"])
	}
	likeMap, ok := gotV2Body["like"].(map[string]interface{})
	if !ok || likeMap["include"] != "follows" {
		t.Errorf("got like in v2 %v, want include follows", gotV2Body["like"])
	}
}


