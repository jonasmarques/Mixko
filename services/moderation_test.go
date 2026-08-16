package services

import (
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"testing"
)

func TestGetMuteScopeReadsTheScopedFlags(t *testing.T) {
	mgr := stubClient(t, func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/xrpc/app.bsky.actor.getProfile" {
			t.Errorf("path = %q", r.URL.Path)
		}
		if got := r.URL.Query().Get("actor"); got != "did:plc:them" {
			t.Errorf("actor = %q", got)
		}
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"did":"did:plc:them","handle":"them.test",
			"viewer":{"muted":false,"mutedOnlyReposts":true}}`))
	})

	scope, err := NewModerationService(mgr).GetMuteScope("did:plc:them")
	if err != nil {
		t.Fatalf("GetMuteScope: %v", err)
	}
	if scope.Muted {
		t.Error("muted = true, want false for a scoped mute")
	}
	if !scope.MutedOnlyReposts {
		t.Error("mutedOnlyReposts = false, want true")
	}
	if scope.MutedOnlyQuoteposts {
		t.Error("mutedOnlyQuoteposts = true, want false")
	}
}

func TestMuteActorScopedSendsTheScope(t *testing.T) {
	var sent muteActorInput
	mgr := stubClient(t, func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if strings.HasSuffix(r.URL.Path, "muteActor") {
			body, _ := io.ReadAll(r.Body)
			if err := json.Unmarshal(body, &sent); err != nil {
				t.Errorf("input was not valid JSON: %v", err)
			}
			w.Write([]byte(`{}`))
			return
		}
		w.Write([]byte(`{"viewer":{"muted":false,"mutedOnlyReposts":true}}`))
	})

	if err := NewModerationService(mgr).MuteActorScoped("did:plc:them", true, false); err != nil {
		t.Fatalf("MuteActorScoped: %v", err)
	}
	if sent.Actor != "did:plc:them" || !sent.OnlyReposts || sent.OnlyQuoteposts {
		t.Errorf("input = %+v, want a reposts-only mute", sent)
	}
}

// A server that ignores the scope would mute the whole account, which is far
// more than the user asked for, so the mute has to be rolled back.
func TestMuteActorScopedUndoesAFullMute(t *testing.T) {
	unmuted := false
	mgr := stubClient(t, func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch {
		case strings.HasSuffix(r.URL.Path, "unmuteActor"):
			unmuted = true
			w.Write([]byte(`{}`))
		case strings.HasSuffix(r.URL.Path, "muteActor"):
			w.Write([]byte(`{}`))
		default:
			w.Write([]byte(`{"viewer":{"muted":true}}`))
		}
	})

	err := NewModerationService(mgr).MuteActorScoped("did:plc:them", true, false)
	if err == nil {
		t.Fatal("MuteActorScoped returned no error after the scope was ignored")
	}
	if !strings.Contains(err.Error(), ErrCodeMuteScopeUnsupported) {
		t.Errorf("error = %q, want the %s code", err, ErrCodeMuteScopeUnsupported)
	}
	if !unmuted {
		t.Error("the account was left fully muted")
	}
}

func TestMuteActorScopedWithoutAScopeIsAFullMute(t *testing.T) {
	path := ""
	mgr := stubClient(t, func(w http.ResponseWriter, r *http.Request) {
		path = r.URL.Path
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{}`))
	})

	if err := NewModerationService(mgr).MuteActorScoped("did:plc:them", false, false); err != nil {
		t.Fatalf("MuteActorScoped: %v", err)
	}
	if !strings.HasSuffix(path, "app.bsky.graph.muteActor") {
		t.Errorf("called %q, want the plain muteActor procedure", path)
	}
}
