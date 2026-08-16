//go:build !windows && !darwin

package database

import (
	"bytes"
	"encoding/hex"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

// On Linux and the BSDs the native store is the Secret Service API (GNOME
// Keyring, KWallet and friends), reached through the `secret-tool` binary from
// libsecret. Desktop sessions normally have it; headless or minimal setups may
// not, so we degrade to a file-backed store rather than refusing to start.
type secretToolStore struct{}

func newKeyStore(dir string) (keyStore, error) {
	if _, err := exec.LookPath("secret-tool"); err != nil {
		return &fileKeyStore{path: filepath.Join(dir, "session.key")}, nil
	}
	return &secretToolStore{}, nil
}

func (s *secretToolStore) Name() string { return "Secret Service (libsecret)" }

func (s *secretToolStore) Load() ([]byte, bool, error) {
	cmd := exec.Command("secret-tool", "lookup",
		"service", keyStoreService,
		"account", keyStoreAccount)

	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		// A missing item exits non-zero with no output, which is not an error
		// for our purposes.
		var exitErr *exec.ExitError
		if errors.As(err, &exitErr) && stdout.Len() == 0 {
			return nil, false, nil
		}
		return nil, false, fmt.Errorf("secret-tool lookup: %w: %s", err, stderr.String())
	}

	out := strings.TrimSpace(stdout.String())
	if out == "" {
		return nil, false, nil
	}

	key, err := hex.DecodeString(out)
	if err != nil {
		return nil, false, fmt.Errorf("stored secret is not valid hex: %w", err)
	}
	return key, true, nil
}

func (s *secretToolStore) Save(key []byte) error {
	cmd := exec.Command("secret-tool", "store",
		"--label", keyStoreService+" session key",
		"service", keyStoreService,
		"account", keyStoreAccount)
	// secret-tool reads the secret from stdin, so it never reaches the process
	// table.
	cmd.Stdin = strings.NewReader(hex.EncodeToString(key))

	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("secret-tool store: %w: %s", err, stderr.String())
	}
	return nil
}

// fileKeyStore is the last resort when no Secret Service provider is present.
// It offers no protection beyond file permissions, so it announces itself
// clearly through Name().
type fileKeyStore struct {
	path string
}

func (s *fileKeyStore) Name() string {
	return "unencrypted file (no Secret Service provider found; install libsecret-tools for OS-backed storage)"
}

func (s *fileKeyStore) Load() ([]byte, bool, error) {
	data, err := os.ReadFile(s.path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, false, nil
		}
		return nil, false, err
	}
	return data, true, nil
}

func (s *fileKeyStore) Save(key []byte) error {
	return os.WriteFile(s.path, key, 0600)
}
