package services

import "fmt"

// Backend errors reach the user through the UI, which is available in three
// languages. Returning a stable code instead of a localized sentence lets the
// frontend translate the message; unknown codes fall back to the raw text.
//
// Format: "mixko.err.<name>" optionally followed by ":" and one argument.
const ErrCodePrefix = "mixko.err."

const (
	// ErrCodeAltTextRequiredImage carries the 1-based image index.
	ErrCodeAltTextRequiredImage = ErrCodePrefix + "altTextRequiredImage"
	ErrCodeAltTextRequiredVideo = ErrCodePrefix + "altTextRequiredVideo"
	ErrCodeAltTextRequired      = ErrCodePrefix + "altTextRequired"
	ErrCodeInvalidDataURL       = ErrCodePrefix + "invalidDataUrl"
	ErrCodeDecodeBase64         = ErrCodePrefix + "decodeBase64"
	ErrCodeTempFileCreate       = ErrCodePrefix + "tempFileCreate"
	ErrCodeTempFileWrite        = ErrCodePrefix + "tempFileWrite"
	// ErrCodeMuteScopeUnsupported means the server ignored the mute scope and
	// applied a full mute, which was rolled back.
	ErrCodeMuteScopeUnsupported = ErrCodePrefix + "muteScopeUnsupported"
)

// codedError builds an error whose message is a translation code.
func codedError(code string) error {
	return fmt.Errorf("%s", code)
}

// codedErrorArg builds a translation code carrying a single argument, such as
// the index of the image that is missing its description.
func codedErrorArg(code string, arg any) error {
	return fmt.Errorf("%s:%v", code, arg)
}

// codedErrorWrap keeps the underlying cause attached for logging while still
// leading with a translatable code.
func codedErrorWrap(code string, err error) error {
	return fmt.Errorf("%s: %w", code, err)
}
