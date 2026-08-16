package services

import (
	"context"
	"fmt"

	"github.com/bluesky-social/indigo/api/atproto"
	"github.com/bluesky-social/indigo/xrpc"
)

type AuthService struct {
	clientMgr *ATClient
}

func NewAuthService(clientMgr *ATClient) *AuthService {
	return &AuthService{
		clientMgr: clientMgr,
	}
}

// CheckSession loads the stored session and verifies it against the PDS,
// refreshing the token if needed.
func (s *AuthService) CheckSession(ctx context.Context) (bool, error) {
	session, err := s.clientMgr.db.GetSession()
	if err != nil {
		return false, err
	}

	if session.AccessJwt == "" {
		return false, nil
	}

	// Sessions saved before PDS discovery have no host recorded.
	host := session.PDSHost
	if host == "" {
		host = s.clientMgr.ResolvePDSHost(ctx, session.DID)
	}

	client := &xrpc.Client{
		Host: host,
		Auth: &xrpc.AuthInfo{
			Did:        session.DID,
			Handle:     session.Handle,
			AccessJwt:  session.AccessJwt,
			RefreshJwt: session.RefreshJwt,
		},
	}

	s.clientMgr.SetClient(client)

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
	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()

	ok, err := s.CheckSession(ctx)
	if err != nil {
		return "", err
	}
	if !ok {
		return "", nil
	}

	session, err := s.clientMgr.db.GetSession()
	return session.Handle, err
}

func (s *AuthService) Login(identifier, appPassword string, remember bool) error {
	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()

	// Resolve where this account actually lives instead of assuming the
	// flagship PDS, so self-hosted accounts can log in.
	host := s.clientMgr.ResolvePDSHost(ctx, identifier)

	client := &xrpc.Client{Host: host}

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
		err = s.clientMgr.db.SaveSession(output.Did, output.Handle, output.AccessJwt, output.RefreshJwt, host)
		if err != nil {
			return fmt.Errorf("failed to save session to DB: %w", err)
		}
	} else {
		_ = s.clientMgr.db.ClearSession()
	}

	return nil
}

func (s *AuthService) Logout() error {
	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()

	// A failure here just means the server already dropped the session; the
	// local state is cleared either way.
	_ = s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		return atproto.ServerDeleteSession(ctx, c)
	})

	s.clientMgr.SetClient(nil)
	return s.clientMgr.db.ClearSession()
}
