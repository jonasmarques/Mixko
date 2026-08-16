package services

import (
	"context"
	"encoding/json"
	"fmt"
	"mime"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/bluesky-social/indigo/api/atproto"
	"github.com/bluesky-social/indigo/api/bsky"
	"github.com/bluesky-social/indigo/lex/util"
	"github.com/bluesky-social/indigo/xrpc"
)

type SocialService struct {
	clientMgr *ATClient
}

func NewSocialService(clientMgr *ATClient) *SocialService {
	return &SocialService{clientMgr: clientMgr}
}

// mutatePrefs runs a read-modify-write cycle over the account preferences.
//
// putPreferences replaces the whole array, so every update has to fetch the
// current set, change one entry and send all of them back. transform receives
// the existing preferences and returns the full set to store.
func (s *SocialService) mutatePrefs(transform func([]bsky.ActorDefs_Preferences_Elem) []bsky.ActorDefs_Preferences_Elem) error {
	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()

	return s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		res, err := bsky.ActorGetPreferences(ctx, c)
		if err != nil {
			return err
		}

		return bsky.ActorPutPreferences(ctx, c, &bsky.ActorPutPreferences_Input{
			Preferences: transform(res.Preferences),
		})
	})
}

// replacePref swaps the single preference entry matched by match for the one
// built by build, appending it when the account has none yet.
func replacePref(
	prefs []bsky.ActorDefs_Preferences_Elem,
	match func(bsky.ActorDefs_Preferences_Elem) bool,
	build func() bsky.ActorDefs_Preferences_Elem,
) []bsky.ActorDefs_Preferences_Elem {
	out := make([]bsky.ActorDefs_Preferences_Elem, 0, len(prefs)+1)
	replaced := false

	for _, pref := range prefs {
		if match(pref) {
			if replaced {
				// Drop duplicates rather than keeping stale copies around.
				continue
			}
			out = append(out, build())
			replaced = true
			continue
		}
		out = append(out, pref)
	}

	if !replaced {
		out = append(out, build())
	}
	return out
}

// buildMutedWords converts the UI's plain word list into preference records.
func buildMutedWords(words []string) []*bsky.ActorDefs_MutedWord {
	items := make([]*bsky.ActorDefs_MutedWord, 0, len(words))
	for _, w := range words {
		valContent := "content"
		valTag := "tag"
		items = append(items, &bsky.ActorDefs_MutedWord{
			Value:   w,
			Targets: []*string{&valContent, &valTag},
		})
	}
	return items
}

// buildContentLabelPrefs converts UI filters into preference records.
func buildContentLabelPrefs(filters []ContentFilterDTO) []bsky.ActorDefs_Preferences_Elem {
	out := make([]bsky.ActorDefs_Preferences_Elem, 0, len(filters))
	for _, filter := range filters {
		var labelerDid *string
		if filter.LabelerDid != "" {
			did := filter.LabelerDid
			labelerDid = &did
		}

		// The lexicon spells "show" as "ignore".
		vis := filter.Visibility
		if vis == "show" {
			vis = "ignore"
		}

		out = append(out, bsky.ActorDefs_Preferences_Elem{
			ActorDefs_ContentLabelPref: &bsky.ActorDefs_ContentLabelPref{
				Label:      filter.Label,
				Visibility: vis,
				LabelerDid: labelerDid,
			},
		})
	}
	return out
}

func (s *SocialService) GetPreferences() (*PreferencesDTO, error) {
	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()
	var out *PreferencesDTO
	err := s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		res, err := bsky.ActorGetPreferences(ctx, c)
		if err != nil {
			return err
		}
		
		out = &PreferencesDTO{}
		for _, pref := range res.Preferences {
			if pref.ActorDefs_AdultContentPref != nil {
				out.AdultContentEnabled = pref.ActorDefs_AdultContentPref.Enabled
			}
			if pref.ActorDefs_ContentLabelPref != nil {
				labeler := ""
				if pref.ActorDefs_ContentLabelPref.LabelerDid != nil {
					labeler = *pref.ActorDefs_ContentLabelPref.LabelerDid
				}
				vis := pref.ActorDefs_ContentLabelPref.Visibility
				if vis == "show" {
					vis = "ignore"
				}
				out.ContentFilters = append(out.ContentFilters, ContentFilterDTO{
					LabelerDid: labeler,
					Label:      pref.ActorDefs_ContentLabelPref.Label,
					Visibility: vis,
				})
			}
			if pref.ActorDefs_MutedWordsPref != nil {
				for _, w := range pref.ActorDefs_MutedWordsPref.Items {
					targets := []string{}
					for _, t := range w.Targets {
						targets = append(targets, *t)
					}
					out.MutedWords = append(out.MutedWords, MutedWordDTO{
						Value:   w.Value,
						Targets: targets,
					})
				}
			}
			foundSavedV2 := false
			if pref.ActorDefs_SavedFeedsPrefV2 != nil {
				foundSavedV2 = true
				for _, f := range pref.ActorDefs_SavedFeedsPrefV2.Items {
					if f != nil {
						if f.Pinned {
							out.PinnedFeeds = append(out.PinnedFeeds, f.Value)
						}
						out.SavedFeeds = append(out.SavedFeeds, f.Value)
					}
				}
			}
			if !foundSavedV2 && pref.ActorDefs_SavedFeedsPref != nil {
				out.SavedFeeds = append(out.SavedFeeds, pref.ActorDefs_SavedFeedsPref.Saved...)
				out.PinnedFeeds = append(out.PinnedFeeds, pref.ActorDefs_SavedFeedsPref.Pinned...)
			}
			if pref.ActorDefs_ThreadViewPref != nil {
				if pref.ActorDefs_ThreadViewPref.Sort != nil {
					out.ThreadSort = *pref.ActorDefs_ThreadViewPref.Sort
				}
			}
		}
		return nil
	})
	return out, err
}

func (s *SocialService) UpdateMutedWords(words []string) error {
	return s.mutatePrefs(func(prefs []bsky.ActorDefs_Preferences_Elem) []bsky.ActorDefs_Preferences_Elem {
		return replacePref(prefs,
			func(p bsky.ActorDefs_Preferences_Elem) bool { return p.ActorDefs_MutedWordsPref != nil },
			func() bsky.ActorDefs_Preferences_Elem {
				return bsky.ActorDefs_Preferences_Elem{
					ActorDefs_MutedWordsPref: &bsky.ActorDefs_MutedWordsPref{
						Items: buildMutedWords(words),
					},
				}
			})
	})
}

func (s *SocialService) UpdateAdultContentEnabled(enabled bool) error {
	return s.mutatePrefs(func(prefs []bsky.ActorDefs_Preferences_Elem) []bsky.ActorDefs_Preferences_Elem {
		return replacePref(prefs,
			func(p bsky.ActorDefs_Preferences_Elem) bool { return p.ActorDefs_AdultContentPref != nil },
			func() bsky.ActorDefs_Preferences_Elem {
				return bsky.ActorDefs_Preferences_Elem{
					ActorDefs_AdultContentPref: &bsky.ActorDefs_AdultContentPref{Enabled: enabled},
				}
			})
	})
}

func (s *SocialService) UpdateContentFilters(filters []ContentFilterDTO) error {
	return s.mutatePrefs(func(prefs []bsky.ActorDefs_Preferences_Elem) []bsky.ActorDefs_Preferences_Elem {
		// Content label prefs are one entry per label, so the whole group is
		// rebuilt rather than replaced entry by entry.
		out := make([]bsky.ActorDefs_Preferences_Elem, 0, len(prefs)+len(filters))
		for _, pref := range prefs {
			if pref.ActorDefs_ContentLabelPref == nil {
				out = append(out, pref)
			}
		}
		return append(out, buildContentLabelPrefs(filters)...)
	})
}

func (s *SocialService) UpdateAllPreferences(threadSort string, adultContent bool, mutedWords []string, filters []ContentFilterDTO) error {
	return s.mutatePrefs(func(prefs []bsky.ActorDefs_Preferences_Elem) []bsky.ActorDefs_Preferences_Elem {
		out := make([]bsky.ActorDefs_Preferences_Elem, 0, len(prefs)+len(filters)+3)

		// Keep every preference this call does not own.
		for _, pref := range prefs {
			if pref.ActorDefs_ThreadViewPref != nil ||
				pref.ActorDefs_AdultContentPref != nil ||
				pref.ActorDefs_MutedWordsPref != nil ||
				pref.ActorDefs_ContentLabelPref != nil {
				continue
			}
			out = append(out, pref)
		}

		out = append(out,
			bsky.ActorDefs_Preferences_Elem{
				ActorDefs_ThreadViewPref: &bsky.ActorDefs_ThreadViewPref{Sort: &threadSort},
			},
			bsky.ActorDefs_Preferences_Elem{
				ActorDefs_AdultContentPref: &bsky.ActorDefs_AdultContentPref{Enabled: adultContent},
			},
			bsky.ActorDefs_Preferences_Elem{
				ActorDefs_MutedWordsPref: &bsky.ActorDefs_MutedWordsPref{Items: buildMutedWords(mutedWords)},
			},
		)

		return append(out, buildContentLabelPrefs(filters)...)
	})
}

func (s *SocialService) GetSubscribedLabelerDIDs() ([]string, error) {
	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()
	var dids []string
	err := s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		res, err := bsky.ActorGetPreferences(ctx, c)
		if err != nil {
			return err
		}
		for _, pref := range res.Preferences {
			if pref.ActorDefs_LabelersPref != nil {
				for _, item := range pref.ActorDefs_LabelersPref.Labelers {
					if item != nil && item.Did != "" {
						dids = append(dids, item.Did)
					}
				}
			}
		}
		return nil
	})
	return dids, err
}

func (s *SocialService) SubscribeLabeler(labelerDid string) error {
	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()
	return s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		res, err := bsky.ActorGetPreferences(ctx, c)
		if err != nil {
			return err
		}

		var newPrefs []bsky.ActorDefs_Preferences_Elem
		var labelersPref *bsky.ActorDefs_LabelersPref
		for _, pref := range res.Preferences {
			if pref.ActorDefs_LabelersPref != nil {
				labelersPref = pref.ActorDefs_LabelersPref
			} else {
				newPrefs = append(newPrefs, pref)
			}
		}

		if labelersPref == nil {
			labelersPref = &bsky.ActorDefs_LabelersPref{
				Labelers: []*bsky.ActorDefs_LabelerPrefItem{},
			}
		}

		alreadySubscribed := false
		for _, item := range labelersPref.Labelers {
			if item != nil && item.Did == labelerDid {
				alreadySubscribed = true
				break
			}
		}

		if !alreadySubscribed {
			labelersPref.Labelers = append(labelersPref.Labelers, &bsky.ActorDefs_LabelerPrefItem{
				Did: labelerDid,
			})
		}

		newPrefs = append(newPrefs, bsky.ActorDefs_Preferences_Elem{
			ActorDefs_LabelersPref: labelersPref,
		})

		return bsky.ActorPutPreferences(ctx, c, &bsky.ActorPutPreferences_Input{
			Preferences: newPrefs,
		})
	})
}

func (s *SocialService) UnsubscribeLabeler(labelerDid string) error {
	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()
	return s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		res, err := bsky.ActorGetPreferences(ctx, c)
		if err != nil {
			return err
		}

		var newPrefs []bsky.ActorDefs_Preferences_Elem
		for _, pref := range res.Preferences {
			if pref.ActorDefs_LabelersPref != nil {
				var updatedList []*bsky.ActorDefs_LabelerPrefItem
				for _, item := range pref.ActorDefs_LabelersPref.Labelers {
					if item != nil && item.Did != labelerDid {
						updatedList = append(updatedList, item)
					}
				}
				pref.ActorDefs_LabelersPref.Labelers = updatedList
			}
			newPrefs = append(newPrefs, pref)
		}

		return bsky.ActorPutPreferences(ctx, c, &bsky.ActorPutPreferences_Input{
			Preferences: newPrefs,
		})
	})
}

func (s *SocialService) GetLabelerServices(dids []string) ([]*LabelerDTO, error) {
	if len(dids) == 0 {
		return []*LabelerDTO{}, nil
	}
	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()
	var out []*LabelerDTO

	subscribedDIDs, _ := s.GetSubscribedLabelerDIDs()
	subMap := make(map[string]bool)
	for _, d := range subscribedDIDs {
		subMap[d] = true
	}

	err := s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		res, err := bsky.LabelerGetServices(ctx, c, true, dids)
		if err != nil {
			return err
		}

		for _, viewElem := range res.Views {
			if viewElem == nil {
				continue
			}
			var dto *LabelerDTO
			if viewElem.LabelerDefs_LabelerViewDetailed != nil {
				v := viewElem.LabelerDefs_LabelerViewDetailed
				handle := ""
				displayName := ""
				description := ""
				avatar := ""
				banner := ""
				did := ""

				if v.Creator != nil {
					did = v.Creator.Did
					handle = v.Creator.Handle
					if v.Creator.DisplayName != nil {
						displayName = *v.Creator.DisplayName
					}
					if v.Creator.Description != nil {
						description = *v.Creator.Description
					}
					if v.Creator.Avatar != nil {
						avatar = *v.Creator.Avatar
					}
				}

				likeCount := int64(0)
				if v.LikeCount != nil {
					likeCount = *v.LikeCount
				}

				viewerLike := ""
				if v.Viewer != nil && v.Viewer.Like != nil {
					viewerLike = *v.Viewer.Like
				}

				var policies []LabelerPolicyDefinitionDTO
				if v.Policies != nil && v.Policies.LabelValueDefinitions != nil {
					for _, def := range v.Policies.LabelValueDefinitions {
						if def == nil {
							continue
						}
						pol := LabelerPolicyDefinitionDTO{
							Identifier: def.Identifier,
							Severity:   def.Severity,
							Blurs:      def.Blurs,
						}
						if def.DefaultSetting != nil {
							pol.DefaultSetting = *def.DefaultSetting
						}
						if def.AdultOnly != nil {
							pol.AdultOnly = *def.AdultOnly
						}
						for _, loc := range def.Locales {
							if loc != nil {
								if loc.Name != "" {
									pol.Title = loc.Name
								}
								if loc.Description != "" {
									pol.Description = loc.Description
								}
							}
						}
						policies = append(policies, pol)
					}
				}

				dto = &LabelerDTO{
					DID:          did,
					Handle:       handle,
					DisplayName:  displayName,
					Description:  description,
					Avatar:       avatar,
					Banner:       banner,
					LikeCount:    likeCount,
					IsSubscribed: subMap[did],
					ViewerLike:   viewerLike,
					IndexedAt:    v.IndexedAt,
					Policies:     policies,
				}
			} else if viewElem.LabelerDefs_LabelerView != nil {
				v := viewElem.LabelerDefs_LabelerView
				handle := ""
				displayName := ""
				description := ""
				avatar := ""
				did := ""

				if v.Creator != nil {
					did = v.Creator.Did
					handle = v.Creator.Handle
					if v.Creator.DisplayName != nil {
						displayName = *v.Creator.DisplayName
					}
					if v.Creator.Avatar != nil {
						avatar = *v.Creator.Avatar
					}
				}

				likeCount := int64(0)
				if v.LikeCount != nil {
					likeCount = *v.LikeCount
				}

				dto = &LabelerDTO{
					DID:          did,
					Handle:       handle,
					DisplayName:  displayName,
					Description:  description,
					Avatar:       avatar,
					LikeCount:    likeCount,
					IsSubscribed: subMap[did],
					IndexedAt:    v.IndexedAt,
				}
			}

			if dto != nil {
				out = append(out, dto)
			}
		}
		return nil
	})
	return out, err
}

func (s *SocialService) GetSubscribedLabelers() ([]*LabelerDTO, error) {
	dids, err := s.GetSubscribedLabelerDIDs()
	if err != nil {
		return nil, err
	}
	if len(dids) == 0 {
		return []*LabelerDTO{}, nil
	}
	return s.GetLabelerServices(dids)
}

func (s *SocialService) GetProfile(actor string) (*ProfileDTO, error) {
	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()
	var out *ProfileDTO
	err := s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		if actor == "" {
			actor = c.Auth.Did
		}
		res, err := bsky.ActorGetProfile(ctx, c, actor)
		if err != nil {
			return err
		}
		
		name := ""
		if res.DisplayName != nil { name = *res.DisplayName }
		desc := ""
		if res.Description != nil { desc = *res.Description }
		
		followers, follows, posts := int64(0), int64(0), int64(0)
		if res.FollowersCount != nil { followers = *res.FollowersCount }
		if res.FollowsCount != nil { follows = *res.FollowsCount }
		if res.PostsCount != nil { posts = *res.PostsCount }

		viewerFollowing := ""
		if res.Viewer != nil && res.Viewer.Following != nil {
			viewerFollowing = *res.Viewer.Following
		}

		viewerFollowedBy := ""
		if res.Viewer != nil && res.Viewer.FollowedBy != nil {
			viewerFollowedBy = *res.Viewer.FollowedBy
		}

		viewerMuted := false
		if res.Viewer != nil && res.Viewer.Muted != nil {
			viewerMuted = *res.Viewer.Muted
		}

		viewerBlocking := ""
		if res.Viewer != nil && res.Viewer.Blocking != nil {
			viewerBlocking = *res.Viewer.Blocking
		}

		viewerBlockedBy := false
		if res.Viewer != nil && res.Viewer.BlockedBy != nil {
			viewerBlockedBy = *res.Viewer.BlockedBy
		}

		pinnedPostUri := ""
		isLabeler := false
		if res.Associated != nil && res.Associated.Labeler != nil && *res.Associated.Labeler {
			isLabeler = true
		}

		var labelerInfo *LabelerDTO
		viewerSubscribedLabeler := false

		if isLabeler {
			lbs, _ := s.GetLabelerServices([]string{res.Did})
			if len(lbs) > 0 {
				labelerInfo = lbs[0]
				viewerSubscribedLabeler = labelerInfo.IsSubscribed
			}
		} else {
			subDids, _ := s.GetSubscribedLabelerDIDs()
			for _, d := range subDids {
				if d == res.Did {
					viewerSubscribedLabeler = true
					lbs, _ := s.GetLabelerServices([]string{res.Did})
					if len(lbs) > 0 {
						isLabeler = true
						labelerInfo = lbs[0]
					}
					break
				}
			}
		}

		out = &ProfileDTO{
			DID:                    res.Did,
			Handle:                 res.Handle,
			DisplayName:            name,
			Description:            desc,
			Followers:              followers,
			Follows:                follows,
			Posts:                  posts,
			ViewerFollowing:        viewerFollowing,
			ViewerFollowedBy:       viewerFollowedBy,
			ViewerMuted:            viewerMuted,
			ViewerBlocking:         viewerBlocking,
			ViewerBlockedBy:        viewerBlockedBy,
			PinnedPostUri:          pinnedPostUri,
			IsMe:                   res.Did == c.Auth.Did,
			IsLabeler:              isLabeler,
			ViewerSubscribedLabeler: viewerSubscribedLabeler,
			LabelerInfo:            labelerInfo,
		}
		return nil
	})
	return out, err
}

// ParseProfileView converts a full profile view into the DTO the UI consumes.
func ParseProfileView(view *bsky.ActorDefs_ProfileView) *ProfileDTO {
	if view == nil {
		return nil
	}
	CacheDID(view.Did, view.Handle)

	viewerFollowing := ""
	if view.Viewer != nil && view.Viewer.Following != nil {
		viewerFollowing = *view.Viewer.Following
	}

	return &ProfileDTO{
		DID:             view.Did,
		Handle:          view.Handle,
		DisplayName:     safeString(view.DisplayName),
		Description:     safeString(view.Description),
		Avatar:          safeString(view.Avatar),
		ViewerFollowing: viewerFollowing,
	}
}

// ParseProfileViewBasic converts the trimmed-down profile view returned by
// typeahead endpoints. It carries no description.
func ParseProfileViewBasic(view *bsky.ActorDefs_ProfileViewBasic) *ProfileDTO {
	if view == nil {
		return nil
	}
	CacheDID(view.Did, view.Handle)

	viewerFollowing := ""
	if view.Viewer != nil && view.Viewer.Following != nil {
		viewerFollowing = *view.Viewer.Following
	}

	return &ProfileDTO{
		DID:             view.Did,
		Handle:          view.Handle,
		DisplayName:     safeString(view.DisplayName),
		Avatar:          safeString(view.Avatar),
		ViewerFollowing: viewerFollowing,
	}
}

func (s *SocialService) GetFollowers(actor string, cursor string) (*ProfileListDTO, error) {
	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()
    var out *ProfileListDTO
    err := s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
        res, err := bsky.GraphGetFollowers(ctx, c, actor, cursor, 30)
        if err != nil { return err }
        out = &ProfileListDTO{Cursor: safeString(res.Cursor)}
        for _, p := range res.Followers {
            if dto := ParseProfileView(p); dto != nil {
                out.Profiles = append(out.Profiles, dto)
            }
        }
        return nil
    })
    return out, err
}

func (s *SocialService) GetFollows(actor string, cursor string) (*ProfileListDTO, error) {
	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()
    var out *ProfileListDTO
    err := s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
        res, err := bsky.GraphGetFollows(ctx, c, actor, cursor, 30)
        if err != nil { return err }
        out = &ProfileListDTO{Cursor: safeString(res.Cursor)}
        for _, p := range res.Follows {
            if dto := ParseProfileView(p); dto != nil {
                out.Profiles = append(out.Profiles, dto)
            }
        }
        return nil
    })
    return out, err
}

func (s *SocialService) Follow(actorDID string) error {
	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()
	return s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		input := &atproto.RepoCreateRecord_Input{
			Collection: "app.bsky.graph.follow",
			Repo:       c.Auth.Did,
			Record: &util.LexiconTypeDecoder{
				Val: &bsky.GraphFollow{
					LexiconTypeID: "app.bsky.graph.follow",
					Subject:       actorDID,
					CreatedAt:     time.Now().Format(time.RFC3339),
				},
			},
		}
		_, err := atproto.RepoCreateRecord(ctx, c, input)
		return err
	})
}

func (s *SocialService) Unfollow(followURI string) error {
	parts := strings.Split(followURI, "/")
	if len(parts) < 3 {
		return nil
	}
	rkey := parts[len(parts)-1]

	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()
	return s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		input := &atproto.RepoDeleteRecord_Input{
			Collection: "app.bsky.graph.follow",
			Repo:       c.Auth.Did,
			Rkey:       rkey,
		}
		_, err := atproto.RepoDeleteRecord(ctx, c, input)
		return err
	})
}

func (s *SocialService) GetActorLists(actorDID string, cursor string) (*ListResponseDTO, error) {
	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()
	var out *ListResponseDTO
	err := s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		res, err := bsky.GraphGetLists(ctx, c, actorDID, cursor, 30, nil)
		if err != nil {
			return err
		}
		out = &ListResponseDTO{Cursor: safeString(res.Cursor)}
		for _, list := range res.Lists {
			desc := ""
			if list.Description != nil { desc = *list.Description }
			purpose := ""
			if list.Purpose != nil { purpose = *list.Purpose }
			
			creatorHandle := ""
			creatorDid := ""
			if list.Creator != nil {
				creatorHandle = list.Creator.Handle
				creatorDid = list.Creator.Did
			}

			avatar := ""
			if list.Avatar != nil {
				avatar = *list.Avatar
			}

			var itemCount int64
			if list.ListItemCount != nil {
				itemCount = *list.ListItemCount
			}

			viewerMuted := false
			viewerBlock := ""
			if list.Viewer != nil {
				if list.Viewer.Muted != nil {
					viewerMuted = *list.Viewer.Muted
				}
				if list.Viewer.Blocked != nil {
					viewerBlock = *list.Viewer.Blocked
				}
			}

			out.Lists = append(out.Lists, &ListDTO{
				URI:           list.Uri,
				CID:           list.Cid,
				Name:          list.Name,
				Purpose:       purpose,
				Description:   desc,
				Creator:       creatorHandle,
				CreatorDID:    creatorDid,
				CreatorHandle: creatorHandle,
				Avatar:        avatar,
				ListItemCount: itemCount,
				ViewerMuted:   viewerMuted,
				ViewerBlock:   viewerBlock,
			})
		}
		return nil
	})
	return out, err
}

func (s *SocialService) GetActorStarterPacks(actorDID string, cursor string) (*StarterPackResponseDTO, error) {
	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()
	var out *StarterPackResponseDTO
	err := s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		res, err := bsky.GraphGetActorStarterPacks(ctx, c, actorDID, cursor, 30)
		if err != nil {
			return err
		}
		out = &StarterPackResponseDTO{Cursor: safeString(res.Cursor)}
		for _, pack := range res.StarterPacks {
			var name, desc, listUri string
			if pack.Record != nil {
				bytes, err := json.Marshal(pack.Record.Val)
				if err == nil {
					var rec struct {
						Name string `json:"name"`
						Description string `json:"description"`
						List string `json:"list"`
					}
					json.Unmarshal(bytes, &rec)
					name = rec.Name
					desc = rec.Description
					listUri = rec.List
				}
			}
			
			creator := ""
			if pack.Creator != nil { creator = pack.Creator.Handle }

			out.StarterPacks = append(out.StarterPacks, &StarterPackDTO{
				URI:         pack.Uri,
				CID:         pack.Cid,
				Name:        name,
				Description: desc,
				Creator:     creator,
				ListURI:     listUri,
			})
		}
		return nil
	})
	return out, err
}

func (s *SocialService) UpdateProfile(displayName, description string) error {
	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()
	return s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		var profile bsky.ActorProfile
		var swapRecord *string
		res, err := atproto.RepoGetRecord(ctx, c, "", "app.bsky.actor.profile", c.Auth.Did, "self")
		if err == nil && res != nil {
			swapRecord = res.Cid
			if res.Value != nil {
				if existingProfile, ok := res.Value.Val.(*bsky.ActorProfile); ok {
					profile = *existingProfile
				} else {
					bytes, err := json.Marshal(res.Value.Val)
					if err == nil {
						json.Unmarshal(bytes, &profile)
					}
				}
			}
		}

		profile.LexiconTypeID = "app.bsky.actor.profile"
		if displayName != "" {
			d := displayName
			profile.DisplayName = &d
		} else {
			profile.DisplayName = nil
		}
		if description != "" {
			desc := description
			profile.Description = &desc
		} else {
			profile.Description = nil
		}

		input := &atproto.RepoPutRecord_Input{
			Collection: "app.bsky.actor.profile",
			Repo:       c.Auth.Did,
			Rkey:       "self",
			Record: &util.LexiconTypeDecoder{
				Val: &profile,
			},
			SwapRecord: swapRecord,
		}

		_, err = atproto.RepoPutRecord(ctx, c, input)
		return err
	})
}

func (s *SocialService) CreateList(name, purpose, description string) error {
	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()
	return s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		list := &bsky.GraphList{
			LexiconTypeID: "app.bsky.graph.list",
			Name:          name,
			Purpose:       &purpose,
			Description:   &description,
			CreatedAt:     time.Now().Format(time.RFC3339),
		}

		input := &atproto.RepoCreateRecord_Input{
			Collection: "app.bsky.graph.list",
			Repo:       c.Auth.Did,
			Record: &util.LexiconTypeDecoder{
				Val: list,
			},
		}

		_, err := atproto.RepoCreateRecord(ctx, c, input)
		return err
	})
}

func (s *SocialService) EditList(uri, name, purpose, description string) error {
	parts := strings.Split(uri, "/")
	if len(parts) < 3 {
		return nil
	}
	rkey := parts[len(parts)-1]

	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()
	return s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		list := &bsky.GraphList{
			LexiconTypeID: "app.bsky.graph.list",
			Name:          name,
			Purpose:       &purpose,
			Description:   &description,
			CreatedAt:     time.Now().Format(time.RFC3339),
		}

		input := &atproto.RepoPutRecord_Input{
			Collection: "app.bsky.graph.list",
			Repo:       c.Auth.Did,
			Rkey:       rkey,
			Record: &util.LexiconTypeDecoder{
				Val: list,
			},
		}

		_, err := atproto.RepoPutRecord(ctx, c, input)
		return err
	})
}

func (s *SocialService) SubscribeList(listUri string) error {
	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()
	return s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		input := &atproto.RepoCreateRecord_Input{
			Collection: "app.bsky.graph.listitem",
			Repo:       c.Auth.Did,
			Record: &util.LexiconTypeDecoder{
				Val: &bsky.GraphListitem{
					LexiconTypeID: "app.bsky.graph.listitem",
					Subject:       c.Auth.Did,
					List:          listUri,
					CreatedAt:     time.Now().Format(time.RFC3339),
				},
			},
		}
		_, err := atproto.RepoCreateRecord(ctx, c, input)
		return err
	})
}

func (s *SocialService) CreateStarterPack(name, description, listUri string) error {
	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()
	return s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		pack := &bsky.GraphStarterpack{
			LexiconTypeID: "app.bsky.graph.starterpack",
			Name:          name,
			Description:   &description,
			List:          listUri,
			CreatedAt:     time.Now().Format(time.RFC3339),
		}

		input := &atproto.RepoCreateRecord_Input{
			Collection: "app.bsky.graph.starterpack",
			Repo:       c.Auth.Did,
			Record: &util.LexiconTypeDecoder{
				Val: pack,
			},
		}

		_, err := atproto.RepoCreateRecord(ctx, c, input)
		return err
	})
}

func (s *SocialService) uploadBlob(ctx context.Context, c *xrpc.Client, path string) (*util.LexBlob, error) {
	localPath, cleanup, err := ResolvePathOrDataURL(path)
	if err != nil {
		return nil, err
	}
	defer cleanup()

	file, err := os.Open(localPath)
	if err != nil {
		return nil, err
	}
	defer file.Close()
	
	res, err := atproto.RepoUploadBlob(ctx, c, file)
	if err != nil {
		return nil, err
	}

	mimeType := "image/jpeg"
	ext := strings.ToLower(filepath.Ext(localPath))
	if m := mime.TypeByExtension(ext); m != "" {
		mimeType = m
	} else {
		switch ext {
		case ".png":
			mimeType = "image/png"
		case ".gif":
			mimeType = "image/gif"
		case ".webp":
			mimeType = "image/webp"
		}
	}
	res.Blob.MimeType = mimeType

	return res.Blob, nil
}

func (s *SocialService) UploadProfileAvatar(imagePath string) error {
	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()
	return s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		blobRef, err := s.uploadBlob(ctx, c, imagePath)
		if err != nil {
			return err
		}

		var profile bsky.ActorProfile
		var swapRecord *string
		res, err := atproto.RepoGetRecord(ctx, c, "", "app.bsky.actor.profile", c.Auth.Did, "self")
		if err == nil && res != nil {
			swapRecord = res.Cid
			if res.Value != nil {
				if existingProfile, ok := res.Value.Val.(*bsky.ActorProfile); ok {
					profile = *existingProfile
				} else {
					bytes, err := json.Marshal(res.Value.Val)
					if err == nil {
						_ = json.Unmarshal(bytes, &profile)
					}
				}
			}
		}
		profile.LexiconTypeID = "app.bsky.actor.profile"
		profile.Avatar = blobRef

		input := &atproto.RepoPutRecord_Input{
			Collection: "app.bsky.actor.profile",
			Repo:       c.Auth.Did,
			Rkey:       "self",
			Record:     &util.LexiconTypeDecoder{Val: &profile},
			SwapRecord: swapRecord,
		}

		_, err = atproto.RepoPutRecord(ctx, c, input)
		return err
	})
}

func (s *SocialService) UploadProfileBanner(imagePath string) error {
	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()
	return s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		blobRef, err := s.uploadBlob(ctx, c, imagePath)
		if err != nil {
			return err
		}

		var profile bsky.ActorProfile
		var swapRecord *string
		res, err := atproto.RepoGetRecord(ctx, c, "", "app.bsky.actor.profile", c.Auth.Did, "self")
		if err == nil && res != nil {
			swapRecord = res.Cid
			if res.Value != nil {
				if existingProfile, ok := res.Value.Val.(*bsky.ActorProfile); ok {
					profile = *existingProfile
				} else {
					bytes, err := json.Marshal(res.Value.Val)
					if err == nil {
						_ = json.Unmarshal(bytes, &profile)
					}
				}
			}
		}
		profile.LexiconTypeID = "app.bsky.actor.profile"
		profile.Banner = blobRef

		input := &atproto.RepoPutRecord_Input{
			Collection: "app.bsky.actor.profile",
			Repo:       c.Auth.Did,
			Rkey:       "self",
			Record:     &util.LexiconTypeDecoder{Val: &profile},
			SwapRecord: swapRecord,
		}

		_, err = atproto.RepoPutRecord(ctx, c, input)
		return err
	})
}

func (s *SocialService) DeleteList(uri string) error {
	parts := strings.Split(uri, "/")
	if len(parts) < 3 {
		return nil
	}
	rkey := parts[len(parts)-1]

	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()
	return s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		input := &atproto.RepoDeleteRecord_Input{
			Collection: "app.bsky.graph.list",
			Repo:       c.Auth.Did,
			Rkey:       rkey,
		}
		_, err := atproto.RepoDeleteRecord(ctx, c, input)
		return err
	})
}

func (s *SocialService) UnsubscribeList(listUri string) error {
	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()
	return s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		// Need to find the listitem record first
		res, err := atproto.RepoListRecords(ctx, c, "app.bsky.graph.listitem", "", 100, c.Auth.Did, false)
		if err != nil {
			return err
		}
		var rkey string
		for _, rec := range res.Records {
			bytes, _ := json.Marshal(rec.Value.Val)
			var item struct {
				List string `json:"list"`
			}
			json.Unmarshal(bytes, &item)
			if item.List == listUri {
				parts := strings.Split(rec.Uri, "/")
				rkey = parts[len(parts)-1]
				break
			}
		}

		if rkey == "" {
			return nil // Not subscribed
		}

		input := &atproto.RepoDeleteRecord_Input{
			Collection: "app.bsky.graph.listitem",
			Repo:       c.Auth.Did,
			Rkey:       rkey,
		}
		_, err = atproto.RepoDeleteRecord(ctx, c, input)
		return err
	})
}

func (s *SocialService) MuteList(uri string) error {
	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()
	return s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		input := &bsky.GraphMuteActorList_Input{
			List: uri,
		}
		return bsky.GraphMuteActorList(ctx, c, input)
	})
}

func (s *SocialService) UnmuteList(uri string) error {
	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()
	return s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		input := &bsky.GraphUnmuteActorList_Input{
			List: uri,
		}
		return bsky.GraphUnmuteActorList(ctx, c, input)
	})
}

func (s *SocialService) BlockList(uri string) error {
	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()
	return s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		input := &atproto.RepoCreateRecord_Input{
			Collection: "app.bsky.graph.listblock",
			Repo:       c.Auth.Did,
			Record: &util.LexiconTypeDecoder{
				Val: &bsky.GraphListblock{
					LexiconTypeID: "app.bsky.graph.listblock",
					Subject:       uri,
					CreatedAt:     time.Now().Format(time.RFC3339),
				},
			},
		}
		_, err := atproto.RepoCreateRecord(ctx, c, input)
		return err
	})
}

func (s *SocialService) UnblockList(blockUri string) error {
	parts := strings.Split(blockUri, "/")
	if len(parts) < 3 {
		return nil
	}
	rkey := parts[len(parts)-1]

	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()
	return s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		input := &atproto.RepoDeleteRecord_Input{
			Collection: "app.bsky.graph.listblock",
			Repo:       c.Auth.Did,
			Rkey:       rkey,
		}
		_, err := atproto.RepoDeleteRecord(ctx, c, input)
		return err
	})
}

func (s *SocialService) DeleteStarterPack(uri string) error {
	parts := strings.Split(uri, "/")
	if len(parts) < 3 {
		return nil
	}
	rkey := parts[len(parts)-1]

	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()
	return s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		input := &atproto.RepoDeleteRecord_Input{
			Collection: "app.bsky.graph.starterpack",
			Repo:       c.Auth.Did,
			Rkey:       rkey,
		}
		_, err := atproto.RepoDeleteRecord(ctx, c, input)
		return err
	})
}

func (s *SocialService) GetSuggestedFollows() (*ProfileListDTO, error) {
	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()
	var out *ProfileListDTO
	err := s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		res, err := bsky.GraphGetSuggestedFollowsByActor(ctx, c, c.Auth.Did)
		if err != nil {
			return err
		}
		out = &ProfileListDTO{}
		for _, p := range res.Suggestions {
			if dto := ParseProfileView(p); dto != nil {
				out.Profiles = append(out.Profiles, dto)
			}
		}
		return nil
	})
	return out, err
}

func (s *SocialService) UpdateSavedFeeds(pinnedUris []string, savedUris []string) error {
	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()
	return s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		res, err := bsky.ActorGetPreferences(ctx, c)
		if err != nil {
			return err
		}

		var cleanSaved []string
		for _, u := range savedUris {
			if u != "" && !containsString(cleanSaved, u) {
				cleanSaved = append(cleanSaved, u)
			}
		}

		var cleanPinned []string
		for _, p := range pinnedUris {
			if p != "" && !containsString(cleanPinned, p) {
				cleanPinned = append(cleanPinned, p)
			}
			if p != "" && !containsString(cleanSaved, p) {
				cleanSaved = append(cleanSaved, p)
			}
		}

		existingIds := make(map[string]string)
		for _, pref := range res.Preferences {
			if pref.ActorDefs_SavedFeedsPrefV2 != nil {
				for _, item := range pref.ActorDefs_SavedFeedsPrefV2.Items {
					if item != nil && item.Value != "" && item.Id != "" {
						existingIds[item.Value] = item.Id
					}
				}
			}
		}

		items := []*bsky.ActorDefs_SavedFeed{}
		for i, uri := range cleanSaved {
			isPinned := containsString(cleanPinned, uri)
			itemId := existingIds[uri]
			if itemId == "" {
				itemId = fmt.Sprintf("feed-%d-%d", time.Now().UnixNano(), i)
			}
			items = append(items, &bsky.ActorDefs_SavedFeed{
				Id:     itemId,
				Type:   "feed",
				Value:  uri,
				Pinned: isPinned,
			})
		}

		var newPrefs []bsky.ActorDefs_Preferences_Elem
		foundV2 := false
		foundV1 := false
		for _, pref := range res.Preferences {
			if pref.ActorDefs_SavedFeedsPrefV2 != nil {
				pref.ActorDefs_SavedFeedsPrefV2.Items = items
				foundV2 = true
			}
			if pref.ActorDefs_SavedFeedsPref != nil {
				pref.ActorDefs_SavedFeedsPref.Saved = cleanSaved
				pref.ActorDefs_SavedFeedsPref.Pinned = cleanPinned
				foundV1 = true
			}
			newPrefs = append(newPrefs, pref)
		}

		if !foundV2 {
			newPrefs = append(newPrefs, bsky.ActorDefs_Preferences_Elem{
				ActorDefs_SavedFeedsPrefV2: &bsky.ActorDefs_SavedFeedsPrefV2{
					Items: items,
				},
			})
		}
		if !foundV1 {
			newPrefs = append(newPrefs, bsky.ActorDefs_Preferences_Elem{
				ActorDefs_SavedFeedsPref: &bsky.ActorDefs_SavedFeedsPref{
					Saved:  cleanSaved,
					Pinned: cleanPinned,
				},
			})
		}

		input := &bsky.ActorPutPreferences_Input{
			Preferences: newPrefs,
		}
		return bsky.ActorPutPreferences(ctx, c, input)
	})
}

// UpdateThreadPreferences sets how threads are sorted.
//
// prioritizeFollowed is accepted for compatibility with the existing frontend
// call, but app.bsky.actor.defs#threadViewPref no longer carries that field, so
// there is nothing to store for it.
func (s *SocialService) UpdateThreadPreferences(sort string, prioritizeFollowed bool) error {
	_ = prioritizeFollowed

	return s.mutatePrefs(func(prefs []bsky.ActorDefs_Preferences_Elem) []bsky.ActorDefs_Preferences_Elem {
		return replacePref(prefs,
			func(p bsky.ActorDefs_Preferences_Elem) bool { return p.ActorDefs_ThreadViewPref != nil },
			func() bsky.ActorDefs_Preferences_Elem {
				return bsky.ActorDefs_Preferences_Elem{
					ActorDefs_ThreadViewPref: &bsky.ActorDefs_ThreadViewPref{Sort: &sort},
				}
			})
	})
}

func (s *SocialService) PinPost(postUri string, cid string) error {
	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()
	return s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		res, err := atproto.RepoGetRecord(ctx, c, "", "app.bsky.actor.profile", c.Auth.Did, "self")
		if err != nil {
			return err
		}

		var profile bsky.ActorProfile
		bytes, err := json.Marshal(res.Value.Val)
		if err != nil {
			return err
		}
		if err := json.Unmarshal(bytes, &profile); err != nil {
			return fmt.Errorf("failed to unmarshal profile: %w", err)
		}
		profile.LexiconTypeID = "app.bsky.actor.profile"
		
		profile.PinnedPost = &atproto.RepoStrongRef{
			Uri: postUri,
			Cid: cid,
		}

		input := &atproto.RepoPutRecord_Input{
			Collection: "app.bsky.actor.profile",
			Repo:       c.Auth.Did,
			Rkey:       "self",
			Record:     &util.LexiconTypeDecoder{Val: &profile},
			SwapRecord: res.Cid,
		}

		_, err = atproto.RepoPutRecord(ctx, c, input)
		return err
	})
}

func (s *SocialService) AddSelfLabel(val string) error {
	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()
	return s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		res, err := atproto.RepoGetRecord(ctx, c, "", "app.bsky.actor.profile", c.Auth.Did, "self")
		if err != nil {
			return err
		}

		var profile bsky.ActorProfile
		bytes, err := json.Marshal(res.Value.Val)
		if err != nil {
			return err
		}
		if err := json.Unmarshal(bytes, &profile); err != nil {
			return fmt.Errorf("failed to unmarshal profile: %w", err)
		}
		profile.LexiconTypeID = "app.bsky.actor.profile"

		if profile.Labels == nil {
			profile.Labels = &bsky.ActorProfile_Labels{
				LabelDefs_SelfLabels: &atproto.LabelDefs_SelfLabels{
					Values: []*atproto.LabelDefs_SelfLabel{},
				},
			}
		}

		// Try to decode SelfLabels
		var selfLabels atproto.LabelDefs_SelfLabels
		bytesLabels, err := json.Marshal(profile.Labels.LabelDefs_SelfLabels)
		if err == nil {
			json.Unmarshal(bytesLabels, &selfLabels)
		}

		for _, l := range selfLabels.Values {
			if l.Val == val {
				return nil // already has label
			}
		}

		selfLabels.Values = append(selfLabels.Values, &atproto.LabelDefs_SelfLabel{
			Val: val,
		})

		profile.Labels.LabelDefs_SelfLabels = &selfLabels

		input := &atproto.RepoPutRecord_Input{
			Collection: "app.bsky.actor.profile",
			Repo:       c.Auth.Did,
			Rkey:       "self",
			Record:     &util.LexiconTypeDecoder{Val: &profile},
			SwapRecord: res.Cid,
		}

		_, err = atproto.RepoPutRecord(ctx, c, input)
		return err
	})
}

func (s *SocialService) GetSelfLabels() ([]string, error) {
	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()
	var labels []string
	err := s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		res, err := atproto.RepoGetRecord(ctx, c, "", "app.bsky.actor.profile", c.Auth.Did, "self")
		if err != nil || res == nil || res.Value == nil {
			return nil
		}

		var profile bsky.ActorProfile
		bytes, err := json.Marshal(res.Value.Val)
		if err != nil {
			return nil
		}
		if err := json.Unmarshal(bytes, &profile); err != nil {
			return nil
		}

		if profile.Labels != nil && profile.Labels.LabelDefs_SelfLabels != nil {
			var selfLabels atproto.LabelDefs_SelfLabels
			bytesLabels, err := json.Marshal(profile.Labels.LabelDefs_SelfLabels)
			if err == nil {
				_ = json.Unmarshal(bytesLabels, &selfLabels)
				for _, l := range selfLabels.Values {
					if l.Val != "" {
						labels = append(labels, l.Val)
					}
				}
			}
		}
		return nil
	})
	if labels == nil {
		labels = []string{}
	}
	return labels, err
}

func (s *SocialService) RemoveSelfLabel(val string) error {
	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()
	return s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		res, err := atproto.RepoGetRecord(ctx, c, "", "app.bsky.actor.profile", c.Auth.Did, "self")
		if err != nil {
			return err
		}

		var profile bsky.ActorProfile
		bytes, err := json.Marshal(res.Value.Val)
		if err != nil {
			return err
		}
		if err := json.Unmarshal(bytes, &profile); err != nil {
			return fmt.Errorf("failed to unmarshal profile: %w", err)
		}
		profile.LexiconTypeID = "app.bsky.actor.profile"

		if profile.Labels == nil || profile.Labels.LabelDefs_SelfLabels == nil {
			return nil
		}

		var selfLabels atproto.LabelDefs_SelfLabels
		bytesLabels, err := json.Marshal(profile.Labels.LabelDefs_SelfLabels)
		if err != nil {
			return nil
		}
		if err := json.Unmarshal(bytesLabels, &selfLabels); err != nil {
			return nil
		}

		var newValues []*atproto.LabelDefs_SelfLabel
		for _, l := range selfLabels.Values {
			if l.Val != val {
				newValues = append(newValues, l)
			}
		}
		selfLabels.Values = newValues
		profile.Labels.LabelDefs_SelfLabels = &selfLabels

		input := &atproto.RepoPutRecord_Input{
			Collection: "app.bsky.actor.profile",
			Repo:       c.Auth.Did,
			Rkey:       "self",
			Record:     &util.LexiconTypeDecoder{Val: &profile},
			SwapRecord: res.Cid,
		}

		_, err = atproto.RepoPutRecord(ctx, c, input)
		return err
	})
}

func (s *SocialService) UnpinPost() error {
	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()
	return s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		res, err := atproto.RepoGetRecord(ctx, c, "", "app.bsky.actor.profile", c.Auth.Did, "self")
		if err != nil {
			return err
		}

		var profile bsky.ActorProfile
		bytes, err := json.Marshal(res.Value.Val)
		if err != nil {
			return err
		}
		if err := json.Unmarshal(bytes, &profile); err != nil {
			return fmt.Errorf("failed to unmarshal profile: %w", err)
		}
		profile.LexiconTypeID = "app.bsky.actor.profile"
		profile.PinnedPost = nil

		input := &atproto.RepoPutRecord_Input{
			Collection: "app.bsky.actor.profile",
			Repo:       c.Auth.Did,
			Rkey:       "self",
			Record:     &util.LexiconTypeDecoder{Val: &profile},
			SwapRecord: res.Cid,
		}

		_, err = atproto.RepoPutRecord(ctx, c, input)
		return err
	})
}

func (s *SocialService) AddUserToList(listUri string, subjectDid string) (string, error) {
	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()
	var itemUri string
	err := s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		input := &atproto.RepoCreateRecord_Input{
			Collection: "app.bsky.graph.listitem",
			Repo:       c.Auth.Did,
			Record: &util.LexiconTypeDecoder{
				Val: &bsky.GraphListitem{
					LexiconTypeID: "app.bsky.graph.listitem",
					Subject:       subjectDid,
					List:          listUri,
					CreatedAt:     time.Now().Format(time.RFC3339),
				},
			},
		}
		res, err := atproto.RepoCreateRecord(ctx, c, input)
		if err != nil {
			return err
		}
		if res != nil {
			itemUri = res.Uri
		}
		return nil
	})
	return itemUri, err
}

func (s *SocialService) RemoveUserFromList(itemUri string) error {
	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()
	return s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		parts := strings.Split(itemUri, "/")
		if len(parts) < 3 {
			return fmt.Errorf("invalid listitem uri")
		}
		rkey := parts[len(parts)-1]
		_, err := atproto.RepoDeleteRecord(ctx, c, &atproto.RepoDeleteRecord_Input{
			Collection: "app.bsky.graph.listitem",
			Repo:       c.Auth.Did,
			Rkey:       rkey,
		})
		return err
	})
}

func (s *SocialService) GetListMembers(listUri string, cursor string) (*ProfileListDTO, error) {
	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()
	var out *ProfileListDTO
	err := s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		res, err := bsky.GraphGetList(ctx, c, cursor, 50, listUri)
		if err != nil {
			return err
		}
		out = &ProfileListDTO{Cursor: safeString(res.Cursor)}
		for _, item := range res.Items {
			if item.Subject != nil {
				dto := ParseProfileView(item.Subject)
				out.Profiles = append(out.Profiles, dto)
			}
		}
		return nil
	})
	return out, err
}

func (s *SocialService) FollowAllInList(listUri string) (int, error) {
	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()
	count := 0
	err := s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		res, err := bsky.GraphGetList(ctx, c, "", 100, listUri)
		if err != nil {
			return err
		}
		for _, item := range res.Items {
			if item.Subject != nil && item.Subject.Did != c.Auth.Did {
				alreadyFollowing := item.Subject.Viewer != nil && item.Subject.Viewer.Following != nil && *item.Subject.Viewer.Following != ""
				if !alreadyFollowing {
					input := &atproto.RepoCreateRecord_Input{
						Collection: "app.bsky.graph.follow",
						Repo:       c.Auth.Did,
						Record: &util.LexiconTypeDecoder{
							Val: &bsky.GraphFollow{
								LexiconTypeID: "app.bsky.graph.follow",
								Subject:       item.Subject.Did,
								CreatedAt:     time.Now().Format(time.RFC3339),
							},
						},
					}
					_, err := atproto.RepoCreateRecord(ctx, c, input)
					if err == nil {
						count++
					}
				}
			}
		}
		return nil
	})
	return count, err
}

