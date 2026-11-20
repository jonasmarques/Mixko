package services

import (
	"context"
	"encoding/base64"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestHideReplyDoesNotOverwriteAGateItCouldNotRead(t *testing.T) {
	wrote := false
	mgr := stubClient(t, func(w http.ResponseWriter, r *http.Request) {
		if strings.HasSuffix(r.URL.Path, "com.atproto.repo.putRecord") {
			wrote = true
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		fmt.Fprint(w, `{"error":"InternalServerError","message":"boom"}`)
	})

	err := NewPostBuilderService(mgr).HideReply(
		"at://did:plc:me/app.bsky.feed.post/aaa",
		"at://did:plc:other/app.bsky.feed.post/bbb")
	if err == nil {
		t.Error("a failed read was reported as success")
	}
	if wrote {
		t.Error("the gate was rewritten after a failed read; its rules would be lost")
	}
}

func TestHideReplyWritesAFreshGateWhenThereIsNone(t *testing.T) {
	var body string
	mgr := stubClient(t, func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if r.Method == http.MethodGet {
			w.WriteHeader(http.StatusBadRequest)
			fmt.Fprint(w, `{"error":"RecordNotFound","message":"Could not locate record"}`)
			return
		}
		raw, _ := io.ReadAll(r.Body)
		body = string(raw)
		fmt.Fprint(w, `{"uri":"at://did:plc:me/app.bsky.feed.threadgate/aaa","cid":"bafyreib2rxk3rybk3aobmv5cjuql3bm2twh4jo5uxgf5kpqcsgz7soitae"}`)
	})

	reply := "at://did:plc:other/app.bsky.feed.post/bbb"
	if err := NewPostBuilderService(mgr).HideReply("at://did:plc:me/app.bsky.feed.post/aaa", reply); err != nil {
		t.Fatalf("HideReply: %v", err)
	}
	if !strings.Contains(body, reply) {
		t.Errorf("the hidden reply was not written: %s", body)
	}
}

func TestHideReplyRefusesAThreadByAnotherAuthor(t *testing.T) {
	mgr := stubClient(t, func(w http.ResponseWriter, r *http.Request) {
		t.Errorf("unexpected request to %s", r.URL.Path)
	})

	err := NewPostBuilderService(mgr).HideReply(
		"at://did:plc:other/app.bsky.feed.post/aaa",
		"at://did:plc:third/app.bsky.feed.post/bbb")
	if err == nil {
		t.Error("hiding a reply in someone else's thread was reported as success")
	}
}

func TestPreferenceWritesKeepTypesThisBuildDoesNotKnow(t *testing.T) {
	var put string
	mgr := stubClient(t, func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if r.Method == http.MethodGet {
			fmt.Fprint(w, `{"preferences":[`+
				`{"$type":"app.bsky.actor.defs#adultContentPref","enabled":false},`+
				`{"$type":"app.bsky.actor.defs#fromTheFuture","keep":"me"}]}`)
			return
		}
		raw, _ := io.ReadAll(r.Body)
		put = string(raw)
	})

	if err := NewSocialService(mgr).UpdateAdultContentEnabled(true); err != nil {
		t.Fatalf("UpdateAdultContentEnabled: %v", err)
	}
	if !strings.Contains(put, `"keep":"me"`) {
		t.Errorf("the unknown preference was dropped: %s", put)
	}
	if !strings.Contains(put, `"enabled":true`) {
		t.Errorf("the change itself was not written: %s", put)
	}
}

func TestAppendVideoChunkBuildsOneFile(t *testing.T) {
	svc := NewPostBuilderService(NewATClient(nil))
	t.Cleanup(svc.discardVideoUpload)
	enc := base64.StdEncoding.EncodeToString

	if _, err := svc.AppendVideoChunk(".mov", true, enc([]byte("hello "))); err != nil {
		t.Fatalf("first chunk: %v", err)
	}
	path, err := svc.AppendVideoChunk(".mov", false, enc([]byte("world")))
	if err != nil {
		t.Fatalf("second chunk: %v", err)
	}
	got, err := os.ReadFile(path)
	if err != nil || string(got) != "hello world" {
		t.Errorf("file = %q (%v), want the chunks in order", got, err)
	}
	if filepath.Ext(path) != ".mov" {
		t.Errorf("extension = %q, want the one the upload detects its type from", filepath.Ext(path))
	}

	next, err := svc.AppendVideoChunk(".exe", true, enc([]byte("x")))
	if err != nil {
		t.Fatalf("new upload: %v", err)
	}
	if _, err := os.Stat(path); !os.IsNotExist(err) {
		t.Error("starting a new upload left the previous temp file behind")
	}
	if filepath.Ext(next) != ".mp4" {
		t.Errorf("unexpected extension %q was kept", filepath.Ext(next))
	}
}

func TestDownloadTempFileRejectsABodyOverTheCap(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write(make([]byte, maxRemoteBodyBytes+1))
	}))
	t.Cleanup(srv.Close)

	path, err := downloadTempFile(context.Background(), srv.URL+"/big.gif")
	if err == nil {
		os.Remove(path)
		t.Fatal("an oversized GIF was accepted; it would be uploaded cut short")
	}
}
