//go:build windows

package database

import (
	"fmt"
	"os"
	"path/filepath"
	"syscall"
	"unsafe"
)

// Windows has no keychain daemon. The native equivalent is DPAPI, which
// encrypts a blob with a key derived from the logged-in user's credentials;
// only the same Windows user on the same machine can decrypt it. We store the
// resulting ciphertext on disk, which is what Chrome and other desktop apps do.
var (
	crypt32                = syscall.NewLazyDLL("crypt32.dll")
	kernel32               = syscall.NewLazyDLL("kernel32.dll")
	procCryptProtectData   = crypt32.NewProc("CryptProtectData")
	procCryptUnprotectData = crypt32.NewProc("CryptUnprotectData")
	procLocalFree          = kernel32.NewProc("LocalFree")
)

// cryptProtectUIForbidden makes DPAPI fail instead of prompting; this runs
// without a user present on the code path.
const cryptProtectUIForbidden = 0x1

type dataBlob struct {
	cbData uint32
	pbData *byte
}

func newBlob(d []byte) *dataBlob {
	if len(d) == 0 {
		return &dataBlob{}
	}
	return &dataBlob{cbData: uint32(len(d)), pbData: &d[0]}
}

// bytes copies the blob contents out of the memory DPAPI allocated for us.
func (b *dataBlob) bytes() []byte {
	if b.pbData == nil || b.cbData == 0 {
		return nil
	}
	out := make([]byte, b.cbData)
	copy(out, unsafe.Slice(b.pbData, b.cbData))
	return out
}

func (b *dataBlob) free() {
	if b.pbData != nil {
		_, _, _ = procLocalFree.Call(uintptr(unsafe.Pointer(b.pbData)))
		b.pbData = nil
	}
}

type dpapiKeyStore struct {
	path string
}

func newKeyStore(dir string) (keyStore, error) {
	return &dpapiKeyStore{path: filepath.Join(dir, "session.key.dpapi")}, nil
}

func (s *dpapiKeyStore) Name() string { return "Windows DPAPI" }

func (s *dpapiKeyStore) Load() ([]byte, bool, error) {
	blob, err := os.ReadFile(s.path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, false, nil
		}
		return nil, false, err
	}

	key, err := dpapiUnprotect(blob)
	if err != nil {
		return nil, false, err
	}
	return key, true, nil
}

func (s *dpapiKeyStore) Save(key []byte) error {
	blob, err := dpapiProtect(key)
	if err != nil {
		return err
	}
	return os.WriteFile(s.path, blob, 0600)
}

func dpapiProtect(plain []byte) ([]byte, error) {
	var out dataBlob
	// CryptProtectData(pDataIn, szDataDescr, pOptionalEntropy, pvReserved,
	//                  pPromptStruct, dwFlags, pDataOut)
	r, _, err := procCryptProtectData.Call(
		uintptr(unsafe.Pointer(newBlob(plain))),
		0, 0, 0, 0,
		cryptProtectUIForbidden,
		uintptr(unsafe.Pointer(&out)),
	)
	if r == 0 {
		return nil, fmt.Errorf("CryptProtectData failed: %w", err)
	}
	defer out.free()
	return out.bytes(), nil
}

func dpapiUnprotect(blob []byte) ([]byte, error) {
	var out dataBlob
	r, _, err := procCryptUnprotectData.Call(
		uintptr(unsafe.Pointer(newBlob(blob))),
		0, 0, 0, 0,
		cryptProtectUIForbidden,
		uintptr(unsafe.Pointer(&out)),
	)
	if r == 0 {
		return nil, fmt.Errorf("CryptUnprotectData failed: %w", err)
	}
	defer out.free()
	return out.bytes(), nil
}
