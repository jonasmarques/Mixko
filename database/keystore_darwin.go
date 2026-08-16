//go:build darwin

package database

import (
	"bytes"
	"encoding/hex"
	"errors"
	"fmt"
	"os/exec"
	"strings"
)

// On macOS the native secret store is the login Keychain, reached through the
// /usr/bin/security tool that ships with the OS. The key is kept as a generic
// password item, so it inherits Keychain's at-rest encryption and per-app
// access control.
type keychainStore struct{}

func newKeyStore(_ string) (keyStore, error) {
	return &keychainStore{}, nil
}

func (s *keychainStore) Name() string { return "macOS Keychain" }

// errSecItemNotFound is the exit status `security` uses for a missing item.
const errSecItemNotFound = 44

func (s *keychainStore) Load() ([]byte, bool, error) {
	cmd := exec.Command("security", "find-generic-password",
		"-s", keyStoreService,
		"-a", keyStoreAccount,
		"-w")

	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		var exitErr *exec.ExitError
		if errors.As(err, &exitErr) && exitErr.ExitCode() == errSecItemNotFound {
			return nil, false, nil
		}
		return nil, false, fmt.Errorf("security find-generic-password: %w: %s", err, stderr.String())
	}

	key, err := hex.DecodeString(strings.TrimSpace(stdout.String()))
	if err != nil {
		return nil, false, fmt.Errorf("stored keychain item is not valid hex: %w", err)
	}
	return key, true, nil
}

func (s *keychainStore) Save(key []byte) error {
	encoded := hex.EncodeToString(key)

	// Prefer handing the secret over on stdin so it never appears in the
	// process table. Older `security` builds only accept it as an argument, so
	// fall back to that if stdin is rejected.
	cmd := exec.Command("security", "add-generic-password",
		"-s", keyStoreService,
		"-a", keyStoreAccount,
		"-U", // update the item if it already exists
		"-w")
	cmd.Stdin = strings.NewReader(encoded + "\n")

	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	if err := cmd.Run(); err == nil {
		return nil
	}

	fallback := exec.Command("security", "add-generic-password",
		"-s", keyStoreService,
		"-a", keyStoreAccount,
		"-U",
		"-w", encoded)
	var fallbackErr bytes.Buffer
	fallback.Stderr = &fallbackErr
	if err := fallback.Run(); err != nil {
		return fmt.Errorf("security add-generic-password: %w: %s", err, fallbackErr.String())
	}
	return nil
}
