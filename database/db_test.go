package database

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestSessionEncryptionAndMigration(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "mixko_db_test_*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tempDir)

	dbPath := filepath.Join(tempDir, "test_mixko.sqlite")

	db, err := InitDB(dbPath)
	if err != nil {
		t.Fatalf("failed to init db: %v", err)
	}
	defer db.Close()

	did := "did:plc:1234567890"
	handle := "user.bsky.social"
	accessJwt := "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.access"
	refreshJwt := "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.refresh"

	if err := db.SaveSession(did, handle, accessJwt, refreshJwt); err != nil {
		t.Fatalf("failed to save session: %v", err)
	}

	gotDid, gotHandle, gotAccess, gotRefresh, err := db.GetSession()
	if err != nil {
		t.Fatalf("failed to get session: %v", err)
	}
	if gotDid != did || gotHandle != handle || gotAccess != accessJwt || gotRefresh != refreshJwt {
		t.Fatalf("session mismatch after decryption.\nExpected: %s, %s, %s, %s\nGot: %s, %s, %s, %s",
			did, handle, accessJwt, refreshJwt, gotDid, gotHandle, gotAccess, gotRefresh)
	}

	var rawAccess, rawRefresh string
	rowErr := db.conn.QueryRow("SELECT access_jwt, refresh_jwt FROM session_info WHERE id = 1").Scan(&rawAccess, &rawRefresh)
	if rowErr != nil {
		t.Fatalf("failed to query raw DB: %v", rowErr)
	}

	if !strings.HasPrefix(rawAccess, "enc:v1:") {
		t.Errorf("expected access_jwt to be encrypted with prefix 'enc:v1:', got: %s", rawAccess)
	}
	if !strings.HasPrefix(rawRefresh, "enc:v1:") {
		t.Errorf("expected refresh_jwt to be encrypted with prefix 'enc:v1:', got: %s", rawRefresh)
	}
	if strings.Contains(rawAccess, accessJwt) || strings.Contains(rawRefresh, refreshJwt) {
		t.Errorf("raw DB contains unencrypted tokens!")
	}

	legacyAccess := "eyJlegacy_access_jwt"
	legacyRefresh := "eyJlegacy_refresh_jwt"
	_, execErr := db.conn.Exec("UPDATE session_info SET access_jwt = ?, refresh_jwt = ? WHERE id = 1", legacyAccess, legacyRefresh)
	if execErr != nil {
		t.Fatalf("failed to inject legacy session: %v", execErr)
	}

	mDid, mHandle, mAccess, mRefresh, err := db.GetSession()
	if err != nil {
		t.Fatalf("failed to get legacy session: %v", err)
	}
	if mDid != did || mHandle != handle || mAccess != legacyAccess || mRefresh != legacyRefresh {
		t.Fatalf("legacy session mismatch. Expected %s / %s, got %s / %s", legacyAccess, legacyRefresh, mAccess, mRefresh)
	}

	var migratedAccess string
	_ = db.conn.QueryRow("SELECT access_jwt FROM session_info WHERE id = 1").Scan(&migratedAccess)
	if !strings.HasPrefix(migratedAccess, "enc:v1:") {
		t.Errorf("expected legacy session to be auto-migrated to encrypted, got: %s", migratedAccess)
	}
}

func TestUninitializedSession(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "mixko_db_test_empty_*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tempDir)

	dbPath := filepath.Join(tempDir, "empty.sqlite")
	db, err := InitDB(dbPath)
	if err != nil {
		t.Fatalf("failed to init db: %v", err)
	}
	defer db.Close()

	did, handle, access, refresh, err := db.GetSession()
	if err != nil {
		t.Fatalf("unexpected error on empty db: %v", err)
	}
	if did != "" || handle != "" || access != "" || refresh != "" {
		t.Fatalf("expected empty session, got did=%s, handle=%s", did, handle)
	}
}
