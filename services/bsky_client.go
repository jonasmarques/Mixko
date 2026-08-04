package services

import (
	"context"
	"fmt"
	"mixko/database"
	"strings"
	"sync"

	"github.com/bluesky-social/indigo/api/atproto"
	"github.com/bluesky-social/indigo/xrpc"
)

type BSkyClient struct {
	mu     sync.RWMutex
	client *xrpc.Client
	db     *database.DB
}

func NewBSkyClient(db *database.DB) *BSkyClient {
	return &BSkyClient{
		db: db,
	}
}

func (c *BSkyClient) SetClient(client *xrpc.Client) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.client = client
}

func (c *BSkyClient) GetClient() (*xrpc.Client, error) {
	c.mu.RLock()
	client := c.client
	c.mu.RUnlock()

	if client == nil {
		return nil, fmt.Errorf("client not authenticated")
	}

	// Basic refresh check could be added here, but usually, we catch 401s
	// For simplicity, we just return the client and expect callers to handle 401 and call Refresh.
	return client, nil
}

func (c *BSkyClient) RefreshSession(ctx context.Context) error {
	c.mu.Lock()
	defer c.mu.Unlock()

	if c.client == nil {
		return fmt.Errorf("no active session to refresh")
	}

	c.client.Auth.AccessJwt = c.client.Auth.RefreshJwt
	
	refreshOut, err := atproto.ServerRefreshSession(ctx, c.client)
	if err != nil {
		return fmt.Errorf("failed to refresh session: %w", err)
	}

	c.client.Auth.AccessJwt = refreshOut.AccessJwt
	c.client.Auth.RefreshJwt = refreshOut.RefreshJwt
	c.client.Auth.Did = refreshOut.Did
	c.client.Auth.Handle = refreshOut.Handle

	err = c.db.SaveSession(refreshOut.Did, refreshOut.Handle, refreshOut.AccessJwt, refreshOut.RefreshJwt)
	if err != nil {
		return fmt.Errorf("failed to save refreshed session: %w", err)
	}

	return nil
}

func (c *BSkyClient) WithClient(ctx context.Context, fn func(*xrpc.Client) error) error {
	client, err := c.GetClient()
	if err != nil {
		return err
	}

	err = fn(client)
	if err != nil {
		// Very basic retry on 401
		if strings.Contains(err.Error(), "ExpiredToken") || strings.Contains(err.Error(), "AuthenticationRequired") {
			if refreshErr := c.RefreshSession(ctx); refreshErr != nil {
				return fmt.Errorf("token expired and refresh failed: %w", refreshErr)
			}
			return fn(client) // Retry with refreshed client
		}
		return err
	}
	return nil
}
