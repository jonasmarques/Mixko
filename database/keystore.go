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
	if err != nil {
		return nil, fmt.Errorf("failed to read key from %s: %w", store.Name(), err)
	}
	if found {
		if len(key) != keySize {
			return nil, fmt.Errorf("key from %s has wrong size %d", store.Name(), len(key))
		}
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
