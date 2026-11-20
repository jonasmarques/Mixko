package services

import (
	"context"
	"errors"
	"fmt"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"

	"mixko/database"

	"github.com/bluesky-social/indigo/api/atproto"
	"github.com/bluesky-social/indigo/api/bsky"
	"github.com/bluesky-social/indigo/atproto/identity"
	"github.com/bluesky-social/indigo/atproto/syntax"
	"github.com/bluesky-social/indigo/xrpc"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

var sharedTransport = &http.Transport{
	Proxy: http.ProxyFromEnvironment,
	DialContext: (&net.Dialer{
		Timeout:   15 * time.Second,
		KeepAlive: 30 * time.Second,
	}).DialContext,
	ForceAttemptHTTP2:     true,
	MaxIdleConns:          100,
	MaxIdleConnsPerHost:   20,
	IdleConnTimeout:       90 * time.Second,
	TLSHandshakeTimeout:   10 * time.Second,
	ExpectContinueTimeout: 1 * time.Second,
}

var sharedHTTPClient = &http.Client{
	Transport: sharedTransport,
}

var sharedShortTimeoutHTTPClient = &http.Client{
	Transport: sharedTransport,
	Timeout:   8 * time.Second,
}

const prefsCacheTTL = 30 * time.Second

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

	// persist is false for a login made without "remember me": refreshed
	// tokens must then stay in memory only.
	persist bool

	// refreshMu guards inflight so that concurrent 401s trigger exactly one
	// refresh. Refresh tokens are single-use: firing two in parallel would
	// invalidate the session.
	refreshMu sync.Mutex
	inflight  *refreshCall

	prefsMu       sync.Mutex
	prefsCache    *bsky.ActorGetPreferences_Output
	prefsCacheDID string
	prefsCacheAt  time.Time
	prefsInflight *prefsCall
}

type prefsCall struct {
	done chan struct{}
	res  *bsky.ActorGetPreferences_Output
	err  error
}

// refreshCall lets callers that arrive during an in-progress refresh wait for
// it and observe its result.
type refreshCall struct {
	done chan struct{}
	err  error
}

var defaultDirectory = identity.DefaultDirectory()

func NewATClient(db *database.DB) *ATClient {
	return &ATClient{
		db:        db,
		directory: defaultDirectory,
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

// EmitEvent safely emits a Wails runtime event if the Wails application context is initialized.
func (c *ATClient) EmitEvent(eventName string, optionalData ...interface{}) {
	c.mu.RLock()
	ctx := c.appCtx
	c.mu.RUnlock()
	if ctx != nil {
		runtime.EventsEmit(ctx, eventName, optionalData...)
	}
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
	if client != nil && client.Client == nil {
		client.Client = sharedHTTPClient
	}
	c.client = client
	c.mu.Unlock()
	c.InvalidatePreferencesCache()
}

// SetPersist records whether the active session may be written to disk.
func (c *ATClient) SetPersist(persist bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.persist = persist
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

// HTTPClient returns the shared pooled HTTP client.
func (c *ATClient) HTTPClient() *http.Client {
	return sharedHTTPClient
}

// ShortTimeoutHTTPClient returns the shared pooled HTTP client with an 8s timeout.
func (c *ATClient) ShortTimeoutHTTPClient() *http.Client {
	return sharedShortTimeoutHTTPClient
}

func (c *ATClient) InvalidatePreferencesCache() {
	if c == nil {
		return
	}
	c.prefsMu.Lock()
	c.prefsCache = nil
	c.prefsCacheDID = ""
	c.prefsCacheAt = time.Time{}
	c.prefsMu.Unlock()
}

func (c *ATClient) GetCachedPreferences(ctx context.Context, client *xrpc.Client) (*bsky.ActorGetPreferences_Output, error) {
	if client == nil || client.Auth == nil {
		return bsky.ActorGetPreferences(ctx, client)
	}
	did := client.Auth.Did

	c.prefsMu.Lock()
	if c.prefsCache != nil && c.prefsCacheDID == did && time.Since(c.prefsCacheAt) < prefsCacheTTL {
		res := c.prefsCache
		c.prefsMu.Unlock()
		return res, nil
	}
	if existing := c.prefsInflight; existing != nil {
		c.prefsMu.Unlock()
		select {
		case <-existing.done:
			return existing.res, existing.err
		case <-ctx.Done():
			return nil, ctx.Err()
		}
	}
	call := &prefsCall{done: make(chan struct{})}
	c.prefsInflight = call
	c.prefsMu.Unlock()

	res, err := bsky.ActorGetPreferences(ctx, client)
	call.res = res
	call.err = err

	c.prefsMu.Lock()
	if err == nil && res != nil {
		c.prefsCache = res
		c.prefsCacheDID = did
		c.prefsCacheAt = time.Now()
	}
	c.prefsInflight = nil
	c.prefsMu.Unlock()
	close(call.done)

	return res, err
}

// ResolvePDSHost finds the PDS that hosts the given handle or DID by reading
// its DID document. Users on a self-hosted PDS need this; assuming
// bsky.social would lock them out.
func resolvePDSHostFromDirectory(ctx context.Context, dir identity.Directory, identifier string) string {
	identifier = strings.TrimSpace(identifier)
	if identifier == "" {
		return DefaultPDSHost
	}
	if strings.HasPrefix(identifier, "did:") {
		if host, ok := GetPDSHostForDID(identifier); ok && host != "" {
			return host
		}
	}

	atid, err := syntax.ParseAtIdentifier(identifier)
	if err != nil {
		return DefaultPDSHost
	}

	if dir == nil {
		dir = defaultDirectory
	}
	ident, err := dir.Lookup(ctx, atid)
	if err != nil || ident == nil {
		return DefaultPDSHost
	}

	didStr := ident.DID.String()
	handleStr := ident.Handle.String()
	if didStr != "" && handleStr != "" && handleStr != "handle.invalid" {
		CacheDID(didStr, handleStr)
	}

	if endpoint := normalizePDSHost(ident.PDSEndpoint()); endpoint != "" {
		if didStr != "" {
			CachePDSHost(didStr, endpoint)
		}
		return endpoint
	}
	return DefaultPDSHost
}

func ResolveAuthorPDSHost(authorDid string) string {
	authorDid = strings.TrimSpace(authorDid)
	if authorDid == "" {
		return DefaultPDSHost
	}
	if host, ok := GetPDSHostForDID(authorDid); ok && host != "" {
		return host
	}
	if strings.HasPrefix(authorDid, "did:plc:") && len(authorDid) != 32 {
		return DefaultPDSHost
	}
	ctx, cancel := context.WithTimeout(context.Background(), 2500*time.Millisecond)
	defer cancel()
	return resolvePDSHostFromDirectory(ctx, defaultDirectory, authorDid)
}

func ResolveAuthorPDSHostsBatch(dids []string) {
	if len(dids) == 0 {
		return
	}
	var pending []string
	seen := make(map[string]struct{}, len(dids))
	for _, raw := range dids {
		did := strings.TrimSpace(raw)
		if did == "" {
			continue
		}
		if _, dup := seen[did]; dup {
			continue
		}
		seen[did] = struct{}{}
		if host, ok := GetPDSHostForDID(did); ok && host != "" {
			continue
		}
		if strings.HasPrefix(did, "did:plc:") && len(did) != 32 {
			continue
		}
		pending = append(pending, did)
	}
	if len(pending) == 0 {
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 2500*time.Millisecond)
	defer cancel()

	const maxWorkers = 6
	sem := make(chan struct{}, maxWorkers)
	var wg sync.WaitGroup
	for _, did := range pending {
		wg.Add(1)
		go func(d string) {
			defer wg.Done()
			select {
			case sem <- struct{}{}:
				defer func() { <-sem }()
			case <-ctx.Done():
				return
			}
			resolvePDSHostFromDirectory(ctx, defaultDirectory, d)
		}(did)
	}
	wg.Wait()
}

func (c *ATClient) ResolvePDSHost(ctx context.Context, identifier string) string {
	var dir identity.Directory
	if c != nil {
		dir = c.directory
	}
	return resolvePDSHostFromDirectory(ctx, dir, identifier)
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
	c.mu.RLock()
	current := c.client
	persist := c.persist
	c.mu.RUnlock()

	if current == nil || current.Auth == nil {
		return fmt.Errorf("no active session to refresh")
	}

	// refreshSession authenticates with the refresh token as the bearer. It
	// goes out on a copy, and the result lands on another copy, because other
	// goroutines are sending requests through current right now.
	refreshClient := *current
	refreshClient.Auth = &xrpc.AuthInfo{AccessJwt: current.Auth.RefreshJwt}

	refreshOut, err := atproto.ServerRefreshSession(ctx, &refreshClient)
	if err != nil {
		return fmt.Errorf("failed to refresh session: %w", err)
	}

	next := *current
	next.Auth = &xrpc.AuthInfo{
		AccessJwt:  refreshOut.AccessJwt,
		RefreshJwt: refreshOut.RefreshJwt,
		Did:        refreshOut.Did,
		Handle:     refreshOut.Handle,
	}

	c.mu.Lock()
	// The user may have switched account or logged out while we waited.
	stillActive := c.client == current
	if stillActive {
		c.client = &next
	}
	c.mu.Unlock()

	if stillActive && persist {
		if err := c.db.SaveSession(refreshOut.Did, refreshOut.Handle, refreshOut.AccessJwt, refreshOut.RefreshJwt, next.Host); err != nil {
			return fmt.Errorf("failed to save refreshed session: %w", err)
		}
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

	// The refresh installed a new client; the old pointer still carries the
	// expired token.
	client, err = c.GetClient()
	if err != nil {
		return err
	}
	return fn(client)
}
