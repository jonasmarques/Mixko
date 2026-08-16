package database

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

const testPDSHost = "https://pds.example.com"

func TestSessionEncryptionAndMigration(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "test_mixko.sqlite")

	db, err := InitDB(dbPath)
	if err != nil {
		t.Fatalf("failed to init db: %v", err)
	}
	defer db.Close()

	did := "did:plc:1234567890"
	handle := "user.bsky.social"
	accessJwt := "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.access"
	refreshJwt := "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.refresh"

	if err := db.SaveSession(did, handle, accessJwt, refreshJwt, testPDSHost); err != nil {
		t.Fatalf("failed to save session: %v", err)
	}

	got, err := db.GetSession()
	if err != nil {
		t.Fatalf("failed to get session: %v", err)
	}
	if got.DID != did || got.Handle != handle || got.AccessJwt != accessJwt || got.RefreshJwt != refreshJwt {
		t.Fatalf("session mismatch after decryption: got %+v", got)
	}
	if got.PDSHost != testPDSHost {
		t.Errorf("PDS host = %q, want %q", got.PDSHost, testPDSHost)
	}

	var rawAccess, rawRefresh string
	if err := db.conn.QueryRow(
		"SELECT access_jwt, refresh_jwt FROM session_info WHERE id = 1",
	).Scan(&rawAccess, &rawRefresh); err != nil {
		t.Fatalf("failed to query raw DB: %v", err)
	}

	if !strings.HasPrefix(rawAccess, encPrefix) {
		t.Errorf("access_jwt not encrypted, got: %s", rawAccess)
	}
	if !strings.HasPrefix(rawRefresh, encPrefix) {
		t.Errorf("refresh_jwt not encrypted, got: %s", rawRefresh)
	}
	if strings.Contains(rawAccess, accessJwt) || strings.Contains(rawRefresh, refreshJwt) {
		t.Error("raw DB contains unencrypted tokens")
	}

	// A session written by an older build is stored in the clear; reading it
	// must succeed and silently re-encrypt it.
	legacyAccess := "eyJlegacy_access_jwt"
	legacyRefresh := "eyJlegacy_refresh_jwt"
	if _, err := db.conn.Exec(
		"UPDATE session_info SET access_jwt = ?, refresh_jwt = ? WHERE id = 1",
		legacyAccess, legacyRefresh,
	); err != nil {
		t.Fatalf("failed to inject legacy session: %v", err)
	}

	migrated, err := db.GetSession()
	if err != nil {
		t.Fatalf("failed to get legacy session: %v", err)
	}
	if migrated.AccessJwt != legacyAccess || migrated.RefreshJwt != legacyRefresh {
		t.Fatalf("legacy session mismatch: got %+v", migrated)
	}

	var migratedAccess string
	if err := db.conn.QueryRow("SELECT access_jwt FROM session_info WHERE id = 1").Scan(&migratedAccess); err != nil {
		t.Fatalf("failed to re-read session: %v", err)
	}
	if !strings.HasPrefix(migratedAccess, encPrefix) {
		t.Errorf("legacy session was not re-encrypted, got: %s", migratedAccess)
	}
}

func TestUninitializedSession(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "empty.sqlite")

	db, err := InitDB(dbPath)
	if err != nil {
		t.Fatalf("failed to init db: %v", err)
	}
	defer db.Close()

	session, err := db.GetSession()
	if err != nil {
		t.Fatalf("unexpected error on empty db: %v", err)
	}
	if session != (Session{}) {
		t.Fatalf("expected zero session, got %+v", session)
	}
}

// TestKeyStoreRoundTrip checks that whichever store this platform provides can
// return the key it just saved.
func TestKeyStoreRoundTrip(t *testing.T) {
	dir := t.TempDir()

	key, err := loadOrCreateKey(dir)
	if err != nil {
		t.Fatalf("loadOrCreateKey: %v", err)
	}
	if len(key) != keySize {
		t.Fatalf("key size = %d, want %d", len(key), keySize)
	}

	again, err := loadOrCreateKey(dir)
	if err != nil {
		t.Fatalf("second loadOrCreateKey: %v", err)
	}
	if string(again) != string(key) {
		t.Error("key changed between calls; sessions would not survive a restart")
	}
}

// TestLegacyKeyFileIsMigrated covers users upgrading from the build that kept
// the key in plaintext next to the database.
func TestLegacyKeyFileIsMigrated(t *testing.T) {
	dir := t.TempDir()

	legacy := make([]byte, keySize)
	for i := range legacy {
		legacy[i] = byte(i)
	}
	legacyPath := filepath.Join(dir, legacyKeyFileName)
	if err := os.WriteFile(legacyPath, legacy, 0600); err != nil {
		t.Fatalf("failed to write legacy key: %v", err)
	}

	key, err := loadOrCreateKey(dir)
	if err != nil {
		t.Fatalf("loadOrCreateKey: %v", err)
	}
	if string(key) != string(legacy) {
		t.Error("legacy key was not adopted; saved sessions would be lost")
	}
	if _, err := os.Stat(legacyPath); !os.IsNotExist(err) {
		t.Error("plaintext key file still present after migration")
	}
}

// TestEncryptDecryptRoundTrip covers the cipher itself, including the
// passthrough for values written before encryption existed.
func TestEncryptDecryptRoundTrip(t *testing.T) {
	cm, err := newCipherManager(filepath.Join(t.TempDir(), "x.sqlite"))
	if err != nil {
		t.Fatalf("newCipherManager: %v", err)
	}

	for _, plain := range []string{"", "short", strings.Repeat("long-token-", 100), "acentuação e emoji 🎉"} {
		enc, err := cm.Encrypt(plain)
		if err != nil {
			t.Fatalf("Encrypt(%q): %v", plain, err)
		}
		dec, err := cm.Decrypt(enc)
		if err != nil {
			t.Fatalf("Decrypt(%q): %v", plain, err)
		}
		if dec != plain {
			t.Errorf("round trip = %q, want %q", dec, plain)
		}
	}

	plaintext, err := cm.Decrypt("not-encrypted-value")
	if err != nil {
		t.Fatalf("Decrypt of legacy value: %v", err)
	}
	if plaintext != "not-encrypted-value" {
		t.Errorf("legacy passthrough = %q", plaintext)
	}
}
