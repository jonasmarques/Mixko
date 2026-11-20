package database

import (
	"crypto/rand"
	"fmt"
	"io"
	"os"
	"path/filepath"
)

// keyStore persists the database encryption key using whatever secret storage
// the host operating system provides. Each platform supplies its own
// implementation via newKeyStore (see keystore_windows.go, keystore_darwin.go
// and keystore_unix.go).
type keyStore interface {
	// Load returns the stored key. found is false when no key has been saved
	// yet, which is not an error.
	Load() (key []byte, found bool, err error)
	Save(key []byte) error
	// Name identifies the backing mechanism, for diagnostics.
	Name() string
}

// keyStoreService and keyStoreAccount identify the secret inside the OS store.
const (
	keyStoreService = "Mixko"
	keyStoreAccount = "database-encryption-key"
)

// legacyKeyFileName is the plaintext key file used before OS-native storage was
// introduced. It is imported once and then removed.
const legacyKeyFileName = ".secret.key"

// loadOrCreateKey returns the key used to encrypt session tokens.
//
// The key lives in the OS secret store. On first run it is generated and saved
// there. A key left over from an older version, stored in plaintext next to the
// database, is migrated into the store and the plaintext copy is deleted.
func loadOrCreateKey(dir string) ([]byte, error) {
	store, err := newKeyStore(dir)
	if err != nil {
		return nil, fmt.Errorf("failed to open OS key store: %w", err)
	}

	key, found, err := store.Load()
	if err != nil || (found && len(key) != keySize) {
		// An unreadable key (a DPAPI blob from another Windows profile, a
		// broken keyring) would fail every launch from now on. The tokens it
		// protected are lost either way, so start over with a new key and let
		// the user log in again.
		fmt.Printf("warning: discarding unusable key from %s: %v\n", store.Name(), err)
		found = false
	}
	if found {
		return key, nil
	}

	// Nothing stored yet: adopt the legacy plaintext key if there is one so
	// existing users keep their saved session.
	legacyPath := filepath.Join(dir, legacyKeyFileName)
	if legacy, lerr := os.ReadFile(legacyPath); lerr == nil && len(legacy) == keySize {
		if err := store.Save(legacy); err != nil {
			return nil, fmt.Errorf("failed to migrate key into %s: %w", store.Name(), err)
		}
		// The key is safe in the OS store now; drop the plaintext copy.
		_ = os.Remove(legacyPath)
		return legacy, nil
	}

	key = make([]byte, keySize)
	if _, err := io.ReadFull(rand.Reader, key); err != nil {
		return nil, fmt.Errorf("failed to generate encryption key: %w", err)
	}
	if err := store.Save(key); err != nil {
		return nil, fmt.Errorf("failed to save key to %s: %w", store.Name(), err)
	}
	return key, nil
}
