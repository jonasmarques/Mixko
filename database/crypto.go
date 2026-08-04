package database

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
)

const (
	encPrefix = "enc:v1:"
	keySize   = 32
)

type CipherManager struct {
	key []byte
}

func newCipherManager(dbPath string) (*CipherManager, error) {
	dir := filepath.Dir(dbPath)
	keyPath := filepath.Join(dir, ".secret.key")

	var key []byte
	data, err := os.ReadFile(keyPath)
	if err == nil && len(data) == keySize {
		key = data
	} else {
		key = make([]byte, keySize)
		if _, err := io.ReadFull(rand.Reader, key); err != nil {
			return nil, fmt.Errorf("failed to generate encryption key: %w", err)
		}
		if err := os.WriteFile(keyPath, key, 0600); err != nil {
			return nil, fmt.Errorf("failed to save encryption key: %w", err)
		}
	}

	return &CipherManager{key: key}, nil
}

func (cm *CipherManager) Encrypt(plainText string) (string, error) {
	if plainText == "" {
		return "", nil
	}

	block, err := aes.NewCipher(cm.key)
	if err != nil {
		return "", err
	}

	aesGCM, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}

	nonce := make([]byte, aesGCM.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", err
	}

	ciphertext := aesGCM.Seal(nonce, nonce, []byte(plainText), nil)
	encoded := base64.StdEncoding.EncodeToString(ciphertext)
	return encPrefix + encoded, nil
}

func (cm *CipherManager) Decrypt(cipherText string) (string, error) {
	if cipherText == "" {
		return "", nil
	}

	if !strings.HasPrefix(cipherText, encPrefix) {
		return cipherText, nil
	}

	rawCipher := strings.TrimPrefix(cipherText, encPrefix)
	data, err := base64.StdEncoding.DecodeString(rawCipher)
	if err != nil {
		return "", fmt.Errorf("failed to base64 decode cipher text: %w", err)
	}

	block, err := aes.NewCipher(cm.key)
	if err != nil {
		return "", err
	}

	aesGCM, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}

	nonceSize := aesGCM.NonceSize()
	if len(data) < nonceSize {
		return "", errors.New("ciphertext too short")
	}

	nonce, ciphertext := data[:nonceSize], data[nonceSize:]
	plaintext, err := aesGCM.Open(nil, nonce, ciphertext, nil)
	if err != nil {
		return "", fmt.Errorf("failed to decrypt ciphertext: %w", err)
	}

	return string(plaintext), nil
}
