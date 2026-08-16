package services

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"sync"
	"time"

	"mixko/database"

	"github.com/bluesky-social/indigo/api/atproto"
	"github.com/bluesky-social/indigo/atproto/identity"
	"github.com/bluesky-social/indigo/atproto/syntax"
	"github.com/bluesky-social/indigo/xrpc"
)

// DefaultPDSHost is used when a user's own PDS cannot be resolved from their
// DID document.
const DefaultPDSHost = "https://bsky.social"

// defaultCallTimeout bounds a single API call. Without it a stalled connection
// would hang a goroutine for the lifetime of the process.
const defaultCallTimeout = 20 * time.Second

// ATClient owns the authenticated AT Protocol session: the xrpc client, the
// token refresh cycle, and identity lookups.
type ATClient struct {
	mu     sync.RWMutex
	client *xrpc.Client
	db     *database.DB

	// appCtx is the Wails application context. Every derived request context
	// is cancelled when the app shuts down.
	appCtx context.Context

	directory identity.Directory

	// refreshMu guards inflight so that concurrent 401s trigger exactly one
	// refresh. Refresh tokens are single-use: firing two in parallel would
	// invalidate the session.
	refreshMu sync.Mutex
	inflight  *refreshCall
}

// refreshCall lets callers that arrive during an in-progress refresh wait for
// it and observe its result.
type refreshCall struct {
	done chan struct{}
	err  error
}

func NewATClient(db *database.DB) *ATClient {
	return &ATClient{
		db:        db,
		directory: identity.DefaultDirectory(),
	}
}

// SetAppContext binds the client to the application lifetime. Called once at
// startup.
func (c *ATClient) SetAppContext(ctx context.Context) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.appCtx = ctx
}

// AppContext returns the application context, or a background context before
// startup has run.
func (c *ATClient) AppContext() context.Context {
	c.mu.RLock()
	defer c.mu.RUnlock()
	if c.appCtx == nil {
		return context.Background()
	}
	return c.appCtx
}

// NewContext returns a context for a single API call: cancelled when the app
// shuts down, and bounded by defaultCallTimeout. Callers must call cancel.
func (c *ATClient) NewContext() (context.Context, context.CancelFunc) {
	return context.WithTimeout(c.AppContext(), defaultCallTimeout)
}

// NewContextTimeout is NewContext with an explicit bound, for long operations
// such as video upload and transcode polling.
func (c *ATClient) NewContextTimeout(d time.Duration) (context.Context, context.CancelFunc) {
	return context.WithTimeout(c.AppContext(), d)
}

func (c *ATClient) SetClient(client *xrpc.Client) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.client = client
}

func (c *ATClient) GetClient() (*xrpc.Client, error) {
	c.mu.RLock()
	client := c.client
	c.mu.RUnlock()

	if client == nil {
		return nil, fmt.Errorf("client not authenticated")
	}
	return client, nil
}

// ResolvePDSHost finds the PDS that hosts the given handle or DID by reading
// its DID document. Users on a self-hosted PDS need this; assuming
// bsky.social would lock them out.
func (c *ATClient) ResolvePDSHost(ctx context.Context, identifier string) string {
	atid, err := syntax.ParseAtIdentifier(identifier)
	if err != nil {
		return DefaultPDSHost
	}

	ident, err := c.directory.Lookup(ctx, atid)
	if err != nil || ident == nil {
		return DefaultPDSHost
	}

	if endpoint := ident.PDSEndpoint(); endpoint != "" {
		return endpoint
	}
	return DefaultPDSHost
}

// isAuthExpired reports whether an error means the access token needs
// refreshing. It inspects the typed XRPC error rather than matching on message
// text, which changes between server versions.
func isAuthExpired(err error) bool {
	if err == nil {
		return false
	}

	var xrpcErr *xrpc.XRPCError
	if errors.As(err, &xrpcErr) {
		switch xrpcErr.ErrStr {
		case "ExpiredToken", "InvalidToken", "AuthenticationRequired", "AuthMissing":
			return true
		}
	}

	var wrapErr *xrpc.Error
	if errors.As(err, &wrapErr) {
		return wrapErr.StatusCode == http.StatusUnauthorized
	}

	return false
}

// RefreshSession exchanges the refresh token for a new session. Concurrent
// callers share a single refresh and all observe its result.
func (c *ATClient) RefreshSession(ctx context.Context) error {
	c.refreshMu.Lock()
	if existing := c.inflight; existing != nil {
		c.refreshMu.Unlock()
		select {
		case <-existing.done:
			return existing.err
		case <-ctx.Done():
			return ctx.Err()
		}
	}

	call := &refreshCall{done: make(chan struct{})}
	c.inflight = call
	c.refreshMu.Unlock()

	call.err = c.doRefresh(ctx)

	c.refreshMu.Lock()
	c.inflight = nil
	c.refreshMu.Unlock()
	close(call.done)

	return call.err
}

func (c *ATClient) doRefresh(ctx context.Context) error {
	c.mu.Lock()
	defer c.mu.Unlock()

	if c.client == nil || c.client.Auth == nil {
		return fmt.Errorf("no active session to refresh")
	}

	// refreshSession authenticates with the refresh token in the Authorization
	// header, so it temporarily takes the place of the access token.
	previousAccess := c.client.Auth.AccessJwt
	c.client.Auth.AccessJwt = c.client.Auth.RefreshJwt

	refreshOut, err := atproto.ServerRefreshSession(ctx, c.client)
	if err != nil {
		// Put the original token back so an unrelated failure (network blip)
		// does not leave the client holding a refresh token as its access
		// token.
		c.client.Auth.AccessJwt = previousAccess
		return fmt.Errorf("failed to refresh session: %w", err)
	}

	c.client.Auth.AccessJwt = refreshOut.AccessJwt
	c.client.Auth.RefreshJwt = refreshOut.RefreshJwt
	c.client.Auth.Did = refreshOut.Did
	c.client.Auth.Handle = refreshOut.Handle

	if err := c.db.SaveSession(refreshOut.Did, refreshOut.Handle, refreshOut.AccessJwt, refreshOut.RefreshJwt, c.client.Host); err != nil {
		return fmt.Errorf("failed to save refreshed session: %w", err)
	}

	return nil
}

// WithClient runs fn against the authenticated client, refreshing the session
// and retrying once if the token has expired.
func (c *ATClient) WithClient(ctx context.Context, fn func(*xrpc.Client) error) error {
	client, err := c.GetClient()
	if err != nil {
		return err
	}

	err = fn(client)
	if err == nil {
		return nil
	}

	if !isAuthExpired(err) {
		return err
	}

	if refreshErr := c.RefreshSession(ctx); refreshErr != nil {
		return fmt.Errorf("token expired and refresh failed: %w", refreshErr)
	}

	// RefreshSession mutates client.Auth in place, so the same pointer now
	// carries the new token.
	return fn(client)
}
