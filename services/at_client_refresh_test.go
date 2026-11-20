package services

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"

	"mixko/database"

	"github.com/bluesky-social/indigo/xrpc"
)

func TestRefreshSwapsTheClientAndHonoursRememberMe(t *testing.T) {
	db, err := database.InitDB(filepath.Join(t.TempDir(), "test.sqlite"))
	if err != nil {
		t.Fatalf("InitDB: %v", err)
	}
	t.Cleanup(func() { db.Close() })

	var bearer string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		bearer = r.Header.Get("Authorization")
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprint(w, `{"accessJwt":"new-access","refreshJwt":"new-refresh","did":"did:plc:me","handle":"me.test"}`)
	}))
	t.Cleanup(srv.Close)

	mgr := NewATClient(db)
	old := &xrpc.Client{
		Host: srv.URL,
		Auth: &xrpc.AuthInfo{Did: "did:plc:me", AccessJwt: "old-access", RefreshJwt: "old-refresh"},
	}
	mgr.SetClient(old)
	mgr.SetPersist(false)

	if err := mgr.RefreshSession(context.Background()); err != nil {
		t.Fatalf("RefreshSession: %v", err)
	}

	if bearer != "Bearer old-refresh" {
		t.Errorf("refresh was sent with %q, want the refresh token", bearer)
	}
	// Other goroutines hold this pointer mid-request; it must stay as it was.
	if old.Auth.AccessJwt != "old-access" {
		t.Errorf("the client in use was modified: access token is now %q", old.Auth.AccessJwt)
	}
	current, err := mgr.GetClient()
	if err != nil {
		t.Fatalf("GetClient: %v", err)
	}
	if current.Auth.AccessJwt != "new-access" {
		t.Errorf("active access token = %q, want the refreshed one", current.Auth.AccessJwt)
	}
	if sess, _ := db.GetSession(); sess.DID != "" {
		t.Errorf("a login without remember-me was written to disk: %+v", sess)
	}

	mgr.SetPersist(true)
	if err := mgr.RefreshSession(context.Background()); err != nil {
		t.Fatalf("second RefreshSession: %v", err)
	}
	if sess, _ := db.GetSession(); sess.AccessJwt != "new-access" {
		t.Errorf("a remembered session was not saved after refresh: %+v", sess)
	}
}
