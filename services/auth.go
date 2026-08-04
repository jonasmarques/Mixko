package services

import (
	"context"
	"fmt"
	"github.com/bluesky-social/indigo/api/atproto"
	"github.com/bluesky-social/indigo/xrpc"
)

type AuthService struct {
	clientMgr *BSkyClient
}

func NewAuthService(clientMgr *BSkyClient) *AuthService {
	return &AuthService{
		clientMgr: clientMgr,
	}
}

// CheckSession tries to load the session from the DB and initialize the client
func (s *AuthService) CheckSession(ctx context.Context) (bool, error) {
	did, handle, accessJwt, refreshJwt, err := s.clientMgr.db.GetSession()
	if err != nil {
		return false, err
	}

	if accessJwt == "" {
		return false, nil
	}

	client := &xrpc.Client{
		Host: "https://bsky.social", // Default PDS host
		Auth: &xrpc.AuthInfo{
			Did:        did,
			Handle:     handle,
			AccessJwt:  accessJwt,
			RefreshJwt: refreshJwt,
		},
	}

	s.clientMgr.SetClient(client)

	// Try a simple API call to verify the token, if it fails, try to refresh
	err = s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		_, err := atproto.ServerGetSession(ctx, c)
		return err
	})

	if err != nil {
		return false, fmt.Errorf("session invalid or expired: %w", err)
	}

	return true, nil
}

func (s *AuthService) RestoreSession() (string, error) {
	ctx := context.Background()
	ok, err := s.CheckSession(ctx)
	if err != nil {
		return "", err
	}
	if !ok {
		return "", nil
	}
	_, handle, _, _, err := s.clientMgr.db.GetSession()
	return handle, err
}

func (s *AuthService) Login(identifier, appPassword string, remember bool) error {
	ctx := context.Background()
	client := &xrpc.Client{
		Host: "https://bsky.social",
	}

	input := &atproto.ServerCreateSession_Input{
		Identifier: identifier,
		Password:   appPassword,
	}

	output, err := atproto.ServerCreateSession(ctx, client, input)
	if err != nil {
		return fmt.Errorf("login failed: %w", err)
	}

	client.Auth = &xrpc.AuthInfo{
		AccessJwt:  output.AccessJwt,
		RefreshJwt: output.RefreshJwt,
		Did:        output.Did,
		Handle:     output.Handle,
	}

	s.clientMgr.SetClient(client)

	if remember {
		err = s.clientMgr.db.SaveSession(output.Did, output.Handle, output.AccessJwt, output.RefreshJwt)
		if err != nil {
			return fmt.Errorf("failed to save session to DB: %w", err)
		}
	} else {
		_ = s.clientMgr.db.ClearSession()
	}

	return nil
}

func (s *AuthService) Logout() error {
	ctx := context.Background()
	_ = s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		return atproto.ServerDeleteSession(ctx, c)
	})
	
	// Ignore server error for delete session if they are already logged out
	s.clientMgr.SetClient(nil)
	return s.clientMgr.db.ClearSession()
}
