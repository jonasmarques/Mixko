package services

import (
	"strings"

	"github.com/bluesky-social/indigo/api/atproto"
	"github.com/bluesky-social/indigo/api/bsky"
	"github.com/bluesky-social/indigo/api/ozone"
	"github.com/bluesky-social/indigo/lex/util"
	"github.com/bluesky-social/indigo/xrpc"
)

type ModerationService struct {
	clientMgr *ATClient
}

func NewModerationService(clientMgr *ATClient) *ModerationService {
	return &ModerationService{clientMgr: clientMgr}
}

// MuteActor mutes a user by their DID or handle
func (s *ModerationService) MuteActor(actor string) error {
	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()

	return s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		return bsky.GraphMuteActor(ctx, c, &bsky.GraphMuteActor_Input{Actor: actor})
	})
}

// muteActorInput mirrors app.bsky.graph.muteActor. The pinned indigo release
// predates the scoped-mute fields, so the call goes out through the raw client.
type muteActorInput struct {
	Actor          string `json:"actor"`
	OnlyReposts    bool   `json:"onlyReposts,omitempty"`
	OnlyQuoteposts bool   `json:"onlyQuoteposts,omitempty"`
}

// MuteActorScoped mutes only part of an account's activity. Repeat calls replace
// the stored scope rather than adding to it.
//
// A server that does not know the scope fields would silently turn this into a
// full mute, which is a much bigger action than the user asked for, so the
// result is read back and undone when that happens.
func (s *ModerationService) MuteActorScoped(actor string, onlyReposts bool, onlyQuoteposts bool) error {
	if !onlyReposts && !onlyQuoteposts {
		return s.MuteActor(actor)
	}

	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()

	err := s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		input := &muteActorInput{Actor: actor, OnlyReposts: onlyReposts, OnlyQuoteposts: onlyQuoteposts}
		return c.Do(ctx, xrpc.Procedure, "application/json", "app.bsky.graph.muteActor", nil, input, nil)
	})
	if err != nil {
		return err
	}

	scope, err := s.GetMuteScope(actor)
	if err != nil {
		return err
	}
	if scope.Muted {
		if unmuteErr := s.UnmuteActor(actor); unmuteErr != nil {
			return codedErrorWrap(ErrCodeMuteScopeUnsupported, unmuteErr)
		}
		return codedError(ErrCodeMuteScopeUnsupported)
	}
	return nil
}

// GetMuteScope reports how an account is currently muted. app.bsky.actor.defs
// gained mutedOnlyReposts/mutedOnlyQuoteposts after the pinned indigo release,
// so only the viewer block is decoded here.
func (s *ModerationService) GetMuteScope(actor string) (*MuteScopeDTO, error) {
	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()

	out := &MuteScopeDTO{}
	err := s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		var raw struct {
			Viewer struct {
				Muted               *bool `json:"muted"`
				MutedOnlyReposts    *bool `json:"mutedOnlyReposts"`
				MutedOnlyQuoteposts *bool `json:"mutedOnlyQuoteposts"`
			} `json:"viewer"`
		}
		params := map[string]interface{}{"actor": actor}
		if err := c.Do(ctx, xrpc.Query, "", "app.bsky.actor.getProfile", params, nil, &raw); err != nil {
			return err
		}
		out.Muted = raw.Viewer.Muted != nil && *raw.Viewer.Muted
		out.MutedOnlyReposts = raw.Viewer.MutedOnlyReposts != nil && *raw.Viewer.MutedOnlyReposts
		out.MutedOnlyQuoteposts = raw.Viewer.MutedOnlyQuoteposts != nil && *raw.Viewer.MutedOnlyQuoteposts
		return nil
	})
	if err != nil {
		return nil, err
	}
	return out, nil
}

// BlockActor blocks a user by their DID
func (s *ModerationService) BlockActor(actorDID string) error {
	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()

	return s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		block := &bsky.GraphBlock{
			LexiconTypeID: "app.bsky.graph.block",
			Subject:       actorDID,
			CreatedAt:     nowISO8601(),
		}

		input := &atproto.RepoCreateRecord_Input{
			Collection: "app.bsky.graph.block",
			Repo:       c.Auth.Did,
			Record:     &util.LexiconTypeDecoder{Val: block},
		}

		_, err := atproto.RepoCreateRecord(ctx, c, input)
		return err
	})
}

func (s *ModerationService) UnmuteActor(actorDID string) error {
	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()

	return s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		return bsky.GraphUnmuteActor(ctx, c, &bsky.GraphUnmuteActor_Input{Actor: actorDID})
	})
}

func (s *ModerationService) UnblockActor(actorDID string) error {
	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()

	return s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		res, err := bsky.GraphGetBlocks(ctx, c, "", 100)
		if err != nil {
			return err
		}

		var rkey string
		for _, block := range res.Blocks {
			if block.Did != actorDID {
				continue
			}
			if block.Viewer != nil && block.Viewer.Blocking != nil {
				parts := strings.Split(*block.Viewer.Blocking, "/")
				if len(parts) > 0 {
					rkey = parts[len(parts)-1]
					break
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
	})
}

func (s *ModerationService) MuteThread(uri string) error {
	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()

	return s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		return bsky.GraphMuteThread(ctx, c, &bsky.GraphMuteThread_Input{Root: uri})
	})
}

func (s *ModerationService) UnmuteThread(uri string) error {
	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()

	return s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		return bsky.GraphUnmuteThread(ctx, c, &bsky.GraphUnmuteThread_Input{Root: uri})
	})
}

func (s *ModerationService) GetMutes(cursor string) (*ProfileListDTO, error) {
	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()

	var out *ProfileListDTO
	err := s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		res, err := bsky.GraphGetMutes(ctx, c, cursor, 50)
		if err != nil {
			return err
		}
		out = &ProfileListDTO{Cursor: safeString(res.Cursor)}
		for _, m := range res.Mutes {
			if dto := ParseProfileView(m); dto != nil {
				out.Profiles = append(out.Profiles, dto)
			}
		}
		return nil
	})
	return out, err
}

func (s *ModerationService) GetBlocks(cursor string) (*ProfileListDTO, error) {
	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()

	var out *ProfileListDTO
	err := s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		res, err := bsky.GraphGetBlocks(ctx, c, cursor, 50)
		if err != nil {
			return err
		}
		out = &ProfileListDTO{Cursor: safeString(res.Cursor)}
		for _, m := range res.Blocks {
			if dto := ParseProfileView(m); dto != nil {
				out.Profiles = append(out.Profiles, dto)
			}
		}
		return nil
	})
	return out, err
}

func (s *ModerationService) ReportPost(uri, cid, reasonType, reason string) error {
	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()

	return s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		input := &atproto.ModerationCreateReport_Input{
			ReasonType: &reasonType,
			Subject: &atproto.ModerationCreateReport_Input_Subject{
				RepoStrongRef: &atproto.RepoStrongRef{Uri: uri, Cid: cid},
			},
		}
		if reason != "" {
			input.Reason = &reason
		}

		_, err := atproto.ModerationCreateReport(ctx, c, input)
		return err
	})
}

func (s *ModerationService) ReportAccount(did, reasonType, reason string) error {
	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()

	return s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		input := &atproto.ModerationCreateReport_Input{
			ReasonType: &reasonType,
			Subject: &atproto.ModerationCreateReport_Input_Subject{
				AdminDefs_RepoRef: &atproto.AdminDefs_RepoRef{Did: did},
			},
		}
		if reason != "" {
			input.Reason = &reason
		}

		_, err := atproto.ModerationCreateReport(ctx, c, input)
		return err
	})
}

func (s *ModerationService) ReportChatMessage(convoId, messageId, offenderDid, reasonType, reason string) error {
	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()

	return s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		cc := chatClient(c)
		payload := map[string]interface{}{
			"reasonType": reasonType,
			"subject": map[string]interface{}{
				"$type":     "chat.bsky.convo.defs#messageRef",
				"convoId":   convoId,
				"messageId": messageId,
				"did":       offenderDid,
			},
		}
		if strings.TrimSpace(reason) != "" {
			payload["reason"] = strings.TrimSpace(reason)
		}
		var out map[string]interface{}
		return cc.Do(ctx, xrpc.Procedure, "application/json", "com.atproto.moderation.createReport", nil, payload, &out)
	})
}

func parseModerationInboxSubject(sv *ozone.InboxDefs_SubjectView) *ModerationInboxItemDTO {
	if sv == nil {
		return nil
	}
	item := &ModerationInboxItemDTO{
		UpdatedAt: sv.UpdatedAt,
	}
	if sv.Subject != nil {
		if sv.Subject.RepoStrongRef != nil {
			item.SubjectURI = sv.Subject.RepoStrongRef.Uri
			item.SubjectCID = sv.Subject.RepoStrongRef.Cid
		} else if sv.Subject.AdminDefs_RepoRef != nil {
			item.SubjectDID = sv.Subject.AdminDefs_RepoRef.Did
		}
	}
	if sv.Enforcement != nil {
		item.EnforcementState = sv.Enforcement.State
		item.Labels = sv.Enforcement.Labels
	}
	if sv.Appeal != nil {
		item.AppealState = sv.Appeal.State
		item.AppealNote = safeString(sv.Appeal.Note)
	}
	return item
}

func (s *ModerationService) GetModerationInbox(cursor string) (*ModerationInboxListDTO, error) {
	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()
	out := &ModerationInboxListDTO{Items: []*ModerationInboxItemDTO{}}
	_ = s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		params := map[string]interface{}{
			"limit": 50,
		}
		if cursor != "" {
			params["cursor"] = cursor
		}
		var raw struct {
			Cursor   *string                       `json:"cursor,omitempty"`
			Subjects []*ozone.InboxDefs_SubjectView `json:"subjects"`
		}
		if err := c.Do(ctx, xrpc.Query, "", "tools.ozone.inbox.listActionedSubjects", params, nil, &raw); err != nil {
			return nil
		}
		out.Cursor = safeString(raw.Cursor)
		for _, sv := range raw.Subjects {
			if dto := parseModerationInboxSubject(sv); dto != nil {
				out.Items = append(out.Items, dto)
			}
		}
		return nil
	})
	return out, nil
}

func (s *ModerationService) AppealModerationSubject(subjectUri string, subjectCid string, subjectDid string, reason string) (*ModerationInboxItemDTO, error) {
	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()
	var out *ModerationInboxItemDTO
	err := s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		subj := &ozone.InboxAppealActionedSubject_Input_Subject{}
		if subjectUri != "" && subjectCid != "" {
			subj.RepoStrongRef = &atproto.RepoStrongRef{
				LexiconTypeID: "com.atproto.repo.strongRef",
				Uri:           subjectUri,
				Cid:           subjectCid,
			}
		} else {
			did := strings.TrimSpace(subjectDid)
			if did == "" {
				did = c.Auth.Did
			}
			subj.AdminDefs_RepoRef = &atproto.AdminDefs_RepoRef{
				LexiconTypeID: "com.atproto.admin.defs#repoRef",
				Did:           did,
			}
		}
		input := &ozone.InboxAppealActionedSubject_Input{
			Subject: subj,
		}
		if trimmed := strings.TrimSpace(reason); trimmed != "" {
			input.Reason = &trimmed
		}
		res, err := ozone.InboxAppealActionedSubject(ctx, c, input)
		if err != nil {
			return err
		}
		out = parseModerationInboxSubject(res)
		return nil
	})
	return out, err
}

