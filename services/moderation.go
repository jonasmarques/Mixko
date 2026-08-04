package services

import (
	"context"
	"strings"
	"time"

	"github.com/bluesky-social/indigo/api/atproto"
	"github.com/bluesky-social/indigo/api/bsky"
	"github.com/bluesky-social/indigo/lex/util"
)

type ModerationService struct {
	clientMgr *BSkyClient
}

func NewModerationService(clientMgr *BSkyClient) *ModerationService {
	return &ModerationService{clientMgr: clientMgr}
}

// MuteActor mutes a user by their DID or handle
func (s *ModerationService) MuteActor(actor string) error {
	ctx := context.Background()
	c, err := s.clientMgr.GetClient()
	if err != nil {
		return err
	}

	input := &bsky.GraphMuteActor_Input{
		Actor: actor,
	}

	return bsky.GraphMuteActor(ctx, c, input)
}

// BlockActor blocks a user by their DID
func (s *ModerationService) BlockActor(actorDID string) error {
	ctx := context.Background()
	c, err := s.clientMgr.GetClient()
	if err != nil {
		return err
	}

	block := &bsky.GraphBlock{
		LexiconTypeID: "app.bsky.graph.block",
		Subject:       actorDID,
		CreatedAt:     time.Now().Format(time.RFC3339),
	}

	input := &atproto.RepoCreateRecord_Input{
		Collection: "app.bsky.graph.block",
		Repo:       c.Auth.Did,
		Record: &util.LexiconTypeDecoder{
			Val: block,
		},
	}

	_, err = atproto.RepoCreateRecord(ctx, c, input)
	return err
}

func (s *ModerationService) UnmuteActor(actorDID string) error {
	ctx := context.Background()
	c, err := s.clientMgr.GetClient()
	if err != nil {
		return err
	}

	input := &bsky.GraphUnmuteActor_Input{
		Actor: actorDID,
	}

	return bsky.GraphUnmuteActor(ctx, c, input)
}

func (s *ModerationService) UnblockActor(actorDID string) error {
	ctx := context.Background()
	c, err := s.clientMgr.GetClient()
	if err != nil {
		return err
	}

	res, err := bsky.GraphGetBlocks(ctx, c, "", 100)
	if err != nil {
		return err
	}
	var rkey string
	for _, block := range res.Blocks {
		if block.Did == actorDID {
			if block.Viewer != nil && block.Viewer.Blocking != nil {
				parts := strings.Split(*block.Viewer.Blocking, "/")
				if len(parts) > 0 {
					rkey = parts[len(parts)-1]
					break
				}
			}
		}
	}
	if rkey == "" {
		return nil
	}

	input := &atproto.RepoDeleteRecord_Input{
		Collection: "app.bsky.graph.block",
		Repo:       c.Auth.Did,
		Rkey:       rkey,
	}

	_, err = atproto.RepoDeleteRecord(ctx, c, input)
	return err
}

func (s *ModerationService) MuteThread(uri string) error {
	ctx := context.Background()
	c, err := s.clientMgr.GetClient()
	if err != nil {
		return err
	}
	return bsky.GraphMuteThread(ctx, c, &bsky.GraphMuteThread_Input{Root: uri})
}

func (s *ModerationService) UnmuteThread(uri string) error {
	ctx := context.Background()
	c, err := s.clientMgr.GetClient()
	if err != nil {
		return err
	}
	return bsky.GraphUnmuteThread(ctx, c, &bsky.GraphUnmuteThread_Input{Root: uri})
}

func (s *ModerationService) GetMutes(cursor string) (*ProfileListDTO, error) {
	ctx := context.Background()
	c, err := s.clientMgr.GetClient()
	if err != nil {
		return nil, err
	}
	res, err := bsky.GraphGetMutes(ctx, c, cursor, 50)
	if err != nil {
		return nil, err
	}
	out := &ProfileListDTO{Cursor: safeString(res.Cursor)}
	for _, m := range res.Mutes {
		if dto := ParseProfileView(m); dto != nil {
			out.Profiles = append(out.Profiles, dto)
		}
	}
	return out, nil
}

func (s *ModerationService) GetBlocks(cursor string) (*ProfileListDTO, error) {
	ctx := context.Background()
	c, err := s.clientMgr.GetClient()
	if err != nil {
		return nil, err
	}
	res, err := bsky.GraphGetBlocks(ctx, c, cursor, 50)
	if err != nil {
		return nil, err
	}
	out := &ProfileListDTO{Cursor: safeString(res.Cursor)}
	for _, m := range res.Blocks {
		if dto := ParseProfileView(m); dto != nil {
			out.Profiles = append(out.Profiles, dto)
		}
	}
	return out, nil
}

func (s *ModerationService) ReportPost(uri, cid, reasonType, reason string) error {
	ctx := context.Background()
	c, err := s.clientMgr.GetClient()
	if err != nil {
		return err
	}

	input := &atproto.ModerationCreateReport_Input{
		ReasonType: &reasonType,
		Subject: &atproto.ModerationCreateReport_Input_Subject{
			RepoStrongRef: &atproto.RepoStrongRef{
				Uri: uri,
				Cid: cid,
			},
		},
	}
	if reason != "" {
		input.Reason = &reason
	}

	_, err = atproto.ModerationCreateReport(ctx, c, input)
	return err
}

func (s *ModerationService) ReportAccount(did, reasonType, reason string) error {
	ctx := context.Background()
	c, err := s.clientMgr.GetClient()
	if err != nil {
		return err
	}

	input := &atproto.ModerationCreateReport_Input{
		ReasonType: &reasonType,
		Subject: &atproto.ModerationCreateReport_Input_Subject{
			AdminDefs_RepoRef: &atproto.AdminDefs_RepoRef{
				Did: did,
			},
		},
	}
	if reason != "" {
		input.Reason = &reason
	}

	_, err = atproto.ModerationCreateReport(ctx, c, input)
	return err
}
