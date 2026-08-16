package services

import (
	"errors"
	"fmt"
	"net/http"
	"testing"

	"github.com/bluesky-social/indigo/xrpc"
)

func TestIsAuthExpired(t *testing.T) {
	tests := []struct {
		name string
		err  error
		want bool
	}{
		{"nil", nil, false},
		{
			name: "expired token",
			err:  &xrpc.XRPCError{ErrStr: "ExpiredToken", Message: "token has expired"},
			want: true,
		},
		{
			name: "authentication required",
			err:  &xrpc.XRPCError{ErrStr: "AuthenticationRequired"},
			want: true,
		},
		{
			name: "wrapped expired token",
			err:  fmt.Errorf("call failed: %w", &xrpc.XRPCError{ErrStr: "InvalidToken"}),
			want: true,
		},
		{
			name: "401 without a typed body",
			err:  &xrpc.Error{StatusCode: http.StatusUnauthorized},
			want: true,
		},
		{
			name: "rate limited is not an auth problem",
			err:  &xrpc.Error{StatusCode: http.StatusTooManyRequests},
			want: false,
		},
		{
			name: "unrelated XRPC error",
			err:  &xrpc.XRPCError{ErrStr: "InvalidRequest"},
			want: false,
		},
		{
			name: "plain error",
			err:  errors.New("connection reset"),
			want: false,
		},
		{
			// The previous implementation matched on message text, so an error
			// merely mentioning the phrase triggered a pointless refresh.
			name: "message text alone does not trigger a refresh",
			err:  errors.New("the post body contained the word ExpiredToken"),
			want: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := isAuthExpired(tt.err); got != tt.want {
				t.Errorf("isAuthExpired(%v) = %v, want %v", tt.err, got, tt.want)
			}
		})
	}
}

func TestResolvePDSHostFallsBackOnGarbage(t *testing.T) {
	c := NewATClient(nil)

	// An unparseable identifier must not reach the network or return empty.
	if got := c.ResolvePDSHost(c.AppContext(), "not a handle!!"); got != DefaultPDSHost {
		t.Errorf("ResolvePDSHost = %q, want the default host", got)
	}
}
