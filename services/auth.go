package services

import (
	"context"
	"fmt"
	"strings"

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
	s.clientMgr.SetPersist(true)

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

func (s *AuthService) LoginWithFactor(identifier, password, authFactorToken string, remember bool) error {
	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()

	// Resolve where this account actually lives instead of assuming the
	// flagship PDS, so self-hosted accounts can log in.
	host := s.clientMgr.ResolvePDSHost(ctx, identifier)

	client := &xrpc.Client{Host: host}

	input := &atproto.ServerCreateSession_Input{
		Identifier: identifier,
		Password:   password,
	}
	trimmedToken := strings.TrimSpace(authFactorToken)
	if trimmedToken != "" {
		input.AuthFactorToken = &trimmedToken
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
	s.clientMgr.SetPersist(remember)

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

	var currentDID string
	if sess, err := s.clientMgr.db.GetSession(); err == nil {
		currentDID = sess.DID
	}

	// A failure here just means the server already dropped the session; the
	// local state is cleared either way.
	_ = s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		return atproto.ServerDeleteSession(ctx, c)
	})

	if currentDID != "" {
		_ = s.clientMgr.db.RemoveSavedAccount(currentDID)
	}
	s.clientMgr.SetClient(nil)
	return s.clientMgr.db.ClearSession()
}

func (s *AuthService) ListAccounts() ([]SavedAccountDTO, error) {
	accounts, err := s.clientMgr.db.GetSavedAccounts()
	if err != nil {
		return nil, err
	}
	out := make([]SavedAccountDTO, 0, len(accounts))
	for _, a := range accounts {
		out = append(out, SavedAccountDTO{
			DID:      a.DID,
			Handle:   a.Handle,
			IsActive: a.IsActive,
		})
	}
	return out, nil
}

func (s *AuthService) SwitchAccount(did string) (string, error) {
	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()

	sess, err := s.clientMgr.db.SwitchAccount(did)
	if err != nil {
		return "", err
	}

	ok, err := s.CheckSession(ctx)
	if err != nil || !ok {
		return "", fmt.Errorf("failed to activate account session: %w", err)
	}
	return sess.Handle, nil
}

func (s *AuthService) RemoveAccount(did string) error {
	return s.clientMgr.db.RemoveSavedAccount(did)
}

func (s *AuthService) RequestPasswordReset(email string) error {
	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()

	host := DefaultPDSHost
	if sess, err := s.clientMgr.db.GetSession(); err == nil && sess.PDSHost != "" {
		host = sess.PDSHost
	}
	client := &xrpc.Client{Host: host}
	return atproto.ServerRequestPasswordReset(ctx, client, &atproto.ServerRequestPasswordReset_Input{
		Email: strings.TrimSpace(email),
	})
}

func (s *AuthService) ResetPassword(token, newPassword string) error {
	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()

	host := DefaultPDSHost
	if sess, err := s.clientMgr.db.GetSession(); err == nil && sess.PDSHost != "" {
		host = sess.PDSHost
	}
	client := &xrpc.Client{Host: host}
	return atproto.ServerResetPassword(ctx, client, &atproto.ServerResetPassword_Input{
		Token:    strings.TrimSpace(token),
		Password: newPassword,
	})
}

func (s *AuthService) ListAppPasswords() ([]AppPasswordDTO, error) {
	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()

	var out []AppPasswordDTO
	err := s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		res, err := atproto.ServerListAppPasswords(ctx, c)
		if err != nil {
			return err
		}
		out = make([]AppPasswordDTO, 0, len(res.Passwords))
		for _, p := range res.Passwords {
			if p == nil {
				continue
			}
			priv := p.Privileged != nil && *p.Privileged
			out = append(out, AppPasswordDTO{
				Name:       p.Name,
				CreatedAt:  p.CreatedAt,
				Privileged: priv,
			})
		}
		return nil
	})
	return out, err
}

func (s *AuthService) CreateAppPassword(name string, privileged bool) (*AppPasswordDTO, error) {
	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()

	var out *AppPasswordDTO
	err := s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		res, err := atproto.ServerCreateAppPassword(ctx, c, &atproto.ServerCreateAppPassword_Input{
			Name:       strings.TrimSpace(name),
			Privileged: &privileged,
		})
		if err != nil {
			return err
		}
		priv := res.Privileged != nil && *res.Privileged
		out = &AppPasswordDTO{
			Name:       res.Name,
			Password:   res.Password,
			CreatedAt:  res.CreatedAt,
			Privileged: priv,
		}
		return nil
	})
	return out, err
}

func (s *AuthService) RevokeAppPassword(name string) error {
	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()

	return s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		return atproto.ServerRevokeAppPassword(ctx, c, &atproto.ServerRevokeAppPassword_Input{
			Name: strings.TrimSpace(name),
		})
	})
}

func (s *AuthService) RequestEmailUpdate() (bool, error) {
	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()

	var tokenRequired bool
	err := s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		res, err := atproto.ServerRequestEmailUpdate(ctx, c)
		if err != nil {
			return err
		}
		tokenRequired = res.TokenRequired
		return nil
	})
	return tokenRequired, err
}

func (s *AuthService) UpdateEmail(email, token string) error {
	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()

	return s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		in := &atproto.ServerUpdateEmail_Input{
			Email: strings.TrimSpace(email),
		}
		trimmedToken := strings.TrimSpace(token)
		if trimmedToken != "" {
			in.Token = &trimmedToken
		}
		return atproto.ServerUpdateEmail(ctx, c, in)
	})
}

func (s *AuthService) DeactivateAccount() error {
	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()

	err := s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		return atproto.ServerDeactivateAccount(ctx, c, &atproto.ServerDeactivateAccount_Input{})
	})
	if err != nil {
		return err
	}
	return s.Logout()
}

func (s *AuthService) CheckAccountStatus() (*AccountStatusDTO, error) {
	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()

	var out *AccountStatusDTO
	err := s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		res, err := atproto.ServerCheckAccountStatus(ctx, c)
		if err != nil {
			return err
		}
		out = &AccountStatusDTO{
			Activated:          res.Activated,
			ValidDid:           res.ValidDid,
			RepoCommit:         res.RepoCommit,
			RepoRev:            res.RepoRev,
			RepoBlocks:         res.RepoBlocks,
			IndexedRecords:     res.IndexedRecords,
			PrivateStateValues: res.PrivateStateValues,
			ExpectedBlobs:      res.ExpectedBlobs,
			ImportedBlobs:      res.ImportedBlobs,
		}
		return nil
	})
	return out, err
}

