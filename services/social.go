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
	"github.com/wailsapp/wails/v2/pkg/runtime"
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
					if w == nil {
						continue
					}
					targets := []string{}
					for _, t := range w.Targets {
						if t != nil {
							targets = append(targets, *t)
						}
					}
					out.MutedWords = append(out.MutedWords, MutedWordDTO{
						ID:          safeString(w.Id),
						Value:       w.Value,
						Targets:     targets,
						ActorTarget: safeString(w.ActorTarget),
						ExpiresAt:   safeString(w.ExpiresAt),
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
			if pref.ActorDefs_FeedViewPref != nil {
				fvp := pref.ActorDefs_FeedViewPref
				if fvp.HideReplies != nil {
					out.HideReplies = *fvp.HideReplies
				}
				if fvp.HideReposts != nil {
					out.HideReposts = *fvp.HideReposts
				}
				if fvp.HideQuotePosts != nil {
					out.HideQuotePosts = *fvp.HideQuotePosts
				}
				if fvp.HideRepliesByUnfollowed != nil {
					out.HideRepliesByUnfollowed = *fvp.HideRepliesByUnfollowed
				}
			}
			if pref.ActorDefs_HiddenPostsPref != nil {
				out.HiddenPosts = append(out.HiddenPosts, pref.ActorDefs_HiddenPostsPref.Items...)
			}
			if pref.ActorDefs_PostInteractionSettingsPref != nil {
				pis := pref.ActorDefs_PostInteractionSettingsPref
				for _, pg := range pis.PostgateEmbeddingRules {
					if pg != nil && pg.FeedPostgate_DisableRule != nil {
						out.DefaultDisableQuotes = true
					}
				}
				for _, tg := range pis.ThreadgateAllowRules {
					if tg == nil {
						continue
					}
					if tg.FeedThreadgate_MentionRule != nil {
						out.DefaultThreadgateRules = append(out.DefaultThreadgateRules, "mentioned")
					} else if tg.FeedThreadgate_FollowingRule != nil {
						out.DefaultThreadgateRules = append(out.DefaultThreadgateRules, "following")
					} else if tg.FeedThreadgate_FollowerRule != nil {
						out.DefaultThreadgateRules = append(out.DefaultThreadgateRules, "followers")
					} else if tg.FeedThreadgate_ListRule != nil {
						out.DefaultThreadgateRules = append(out.DefaultThreadgateRules, "list:"+tg.FeedThreadgate_ListRule.List)
					}
				}
			}
			if pref.ActorDefs_InterestsPref != nil {
				out.Interests = append(out.Interests, pref.ActorDefs_InterestsPref.Tags...)
			}
			if pref.ActorDefs_VerificationPrefs != nil && pref.ActorDefs_VerificationPrefs.HideBadges != nil {
				out.HideVerificationBadges = *pref.ActorDefs_VerificationPrefs.HideBadges
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

func parseActorStatusView(sv *bsky.ActorDefs_StatusView) *ActorStatusDTO {
	if sv == nil {
		return nil
	}
	isActive := false
	if sv.IsActive != nil {
		isActive = *sv.IsActive
	}
	dto := &ActorStatusDTO{
		Status:    sv.Status,
		ExpiresAt: safeString(sv.ExpiresAt),
		IsActive:  isActive,
	}
	if sv.Embed != nil && sv.Embed.EmbedExternal_View != nil && sv.Embed.EmbedExternal_View.External != nil {
		ext := sv.Embed.EmbedExternal_View.External
		dto.URI = ext.Uri
		dto.Title = ext.Title
		dto.Description = ext.Description
	}
	return dto
}

func parseVerificationState(v *bsky.ActorDefs_VerificationState) (bool, bool) {
	if v == nil {
		return false, false
	}
	verified := v.VerifiedStatus == "valid"
	trusted := v.TrustedVerifierStatus == "valid"
	return verified, trusted
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
		if res.PinnedPost != nil {
			pinnedPostUri = res.PinnedPost.Uri
		}
		isLabeler := false
		if res.Associated != nil && res.Associated.Labeler != nil && *res.Associated.Labeler {
			isLabeler = true
		}

		var labelerInfo *LabelerDTO
		viewerSubscribedLabeler := false

		if isLabeler {
			lbs, err := s.GetLabelerServices([]string{res.Did})
			if err == nil && len(lbs) > 0 {
				labelerInfo = lbs[0]
				viewerSubscribedLabeler = labelerInfo.IsSubscribed
			}
		} else {
			subDids, err := s.GetSubscribedLabelerDIDs()
			if err == nil {
				for _, d := range subDids {
					if d == res.Did {
						viewerSubscribedLabeler = true
						lbs, err := s.GetLabelerServices([]string{res.Did})
						if err == nil && len(lbs) > 0 {
							isLabeler = true
							labelerInfo = lbs[0]
						}
						break
					}
				}
			}
		}

		var viewerActivitySubscription *ActivitySubscriptionDTO
		if res.Viewer != nil && res.Viewer.ActivitySubscription != nil {
			viewerActivitySubscription = &ActivitySubscriptionDTO{
				Post:  res.Viewer.ActivitySubscription.Post,
				Reply: res.Viewer.ActivitySubscription.Reply,
			}
		}

		verified, trustedVerifier := parseVerificationState(res.Verification)

		out = &ProfileDTO{
			DID:                        res.Did,
			Handle:                     res.Handle,
			DisplayName:                name,
			Description:                desc,
			Avatar:                     safeString(res.Avatar),
			Followers:                  followers,
			Follows:                    follows,
			Posts:                      posts,
			ViewerFollowing:            viewerFollowing,
			ViewerFollowedBy:           viewerFollowedBy,
			ViewerMuted:                viewerMuted,
			ViewerBlocking:             viewerBlocking,
			ViewerBlockedBy:            viewerBlockedBy,
			PinnedPostUri:              pinnedPostUri,
			IsMe:                       res.Did == c.Auth.Did,
			IsLabeler:                  isLabeler,
			ViewerSubscribedLabeler:    viewerSubscribedLabeler,
			ViewerActivitySubscription: viewerActivitySubscription,
			LabelerInfo:                labelerInfo,
			Verified:                   verified,
			TrustedVerifier:            trustedVerifier,
			Status:                     parseActorStatusView(res.Status),
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

	verified, trustedVerifier := parseVerificationState(view.Verification)

	return &ProfileDTO{
		DID:             view.Did,
		Handle:          view.Handle,
		DisplayName:     safeString(view.DisplayName),
		Description:     safeString(view.Description),
		Avatar:          safeString(view.Avatar),
		ViewerFollowing: viewerFollowing,
		Verified:        verified,
		TrustedVerifier: trustedVerifier,
		Status:          parseActorStatusView(view.Status),
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

	verified, trustedVerifier := parseVerificationState(view.Verification)

	return &ProfileDTO{
		DID:             view.Did,
		Handle:          view.Handle,
		DisplayName:     safeString(view.DisplayName),
		Avatar:          safeString(view.Avatar),
		ViewerFollowing: viewerFollowing,
		Verified:        verified,
		TrustedVerifier: trustedVerifier,
		Status:          parseActorStatusView(view.Status),
	}
}

func (s *SocialService) GetFollowers(actor string, cursor string) (*ProfileListDTO, error) {
	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()
	var out *ProfileListDTO
	err := s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		res, err := bsky.GraphGetFollowers(ctx, c, actor, cursor, 30)
		if err != nil {
			return err
		}
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
		if err != nil {
			return err
		}
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

func (s *SocialService) GetKnownFollowers(actor string, cursor string) (*ProfileListDTO, error) {
	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()
	var out *ProfileListDTO
	err := s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		res, err := bsky.GraphGetKnownFollowers(ctx, c, actor, cursor, 50)
		if err != nil {
			return err
		}
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
					CreatedAt:     nowISO8601(),
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
		subscribedMap := make(map[string]bool)
		if len(res.Lists) > 0 && c.Auth != nil && c.Auth.Did != "" {
			subRes, subErr := atproto.RepoListRecords(ctx, c, "app.bsky.graph.listitem", "", 100, c.Auth.Did, false)
			if subErr == nil && subRes != nil {
				for _, rec := range subRes.Records {
					if rec.Value == nil {
						continue
					}
					bytes, mErr := json.Marshal(rec.Value.Val)
					if mErr != nil {
						continue
					}
					var item struct {
						List    string `json:"list"`
						Subject string `json:"subject"`
					}
					if uErr := json.Unmarshal(bytes, &item); uErr == nil && item.List != "" && item.Subject == c.Auth.Did {
						subscribedMap[item.List] = true
					}
				}
			}
		}
		out = &ListResponseDTO{Cursor: safeString(res.Cursor)}
		for _, list := range res.Lists {
			desc := ""
			if list.Description != nil {
				desc = *list.Description
			}
			purpose := ""
			if list.Purpose != nil {
				purpose = *list.Purpose
			}

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
				URI:              list.Uri,
				CID:              list.Cid,
				Name:             list.Name,
				Purpose:          purpose,
				Description:      desc,
				Creator:          creatorHandle,
				CreatorDID:       creatorDid,
				CreatorHandle:    creatorHandle,
				Avatar:           avatar,
				ListItemCount:    itemCount,
				ViewerMuted:      viewerMuted,
				ViewerBlock:      viewerBlock,
				ViewerSubscribed: subscribedMap[list.Uri],
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
						Name        string `json:"name"`
						Description string `json:"description"`
						List        string `json:"list"`
					}
					if uErr := json.Unmarshal(bytes, &rec); uErr == nil {
						name = rec.Name
						desc = rec.Description
						listUri = rec.List
					}
				}
			}

			creator := ""
			creatorDid := ""
			if pack.Creator != nil {
				creator = pack.Creator.Handle
				creatorDid = pack.Creator.Did
			}

			out.StarterPacks = append(out.StarterPacks, &StarterPackDTO{
				URI:         pack.Uri,
				CID:         pack.Cid,
				Name:        name,
				Description: desc,
				Creator:     creator,
				CreatorDID:  creatorDid,
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
			CreatedAt:     nowISO8601(),
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
			CreatedAt:     nowISO8601(),
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
					CreatedAt:     nowISO8601(),
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
			CreatedAt:     nowISO8601(),
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
					CreatedAt:     nowISO8601(),
				},
			},
		}
		_, err := atproto.RepoCreateRecord(ctx, c, input)
		return err
	})
}

func (s *SocialService) UnblockList(blockUri string) error {
	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()
	return s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		rkey := ""
		if strings.Contains(blockUri, "app.bsky.graph.listblock") {
			parts := strings.Split(blockUri, "/")
			if len(parts) >= 3 {
				rkey = parts[len(parts)-1]
			}
		} else {
			// If a list URI is provided, look up the listblock record in the user's blocks
			blocksRes, err := bsky.GraphGetListBlocks(ctx, c, "", 100)
			if err == nil && blocksRes != nil {
				for _, l := range blocksRes.Lists {
					if l != nil && l.Uri == blockUri && l.Viewer != nil && l.Viewer.Blocked != nil {
						parts := strings.Split(*l.Viewer.Blocked, "/")
						if len(parts) >= 3 {
							rkey = parts[len(parts)-1]
							break
						}
					}
				}
			}
			if rkey == "" {
				parts := strings.Split(blockUri, "/")
				if len(parts) >= 3 {
					rkey = parts[len(parts)-1]
				}
			}
		}

		if rkey == "" {
			return nil
		}

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
					CreatedAt:     nowISO8601(),
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
				if dto := ParseProfileView(item.Subject); dto != nil {
					dto.ListItemURI = item.Uri
					out.Profiles = append(out.Profiles, dto)
				}
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
		var writes []*atproto.RepoApplyWrites_Input_Writes_Elem
		createdAt := nowISO8601()
		for _, item := range res.Items {
			if item.Subject != nil && item.Subject.Did != c.Auth.Did {
				alreadyFollowing := item.Subject.Viewer != nil && item.Subject.Viewer.Following != nil && *item.Subject.Viewer.Following != ""
				if !alreadyFollowing {
					writes = append(writes, &atproto.RepoApplyWrites_Input_Writes_Elem{
						RepoApplyWrites_Create: &atproto.RepoApplyWrites_Create{
							LexiconTypeID: "com.atproto.repo.applyWrites#create",
							Collection:    "app.bsky.graph.follow",
							Value: &util.LexiconTypeDecoder{
								Val: &bsky.GraphFollow{
									LexiconTypeID: "app.bsky.graph.follow",
									Subject:       item.Subject.Did,
									CreatedAt:     createdAt,
								},
							},
						},
					})
				}
			}
		}

		const batchSize = 50
		for i := 0; i < len(writes); i += batchSize {
			end := i + batchSize
			if end > len(writes) {
				end = len(writes)
			}
			chunk := writes[i:end]
			_, err := atproto.RepoApplyWrites(ctx, c, &atproto.RepoApplyWrites_Input{
				Repo:   c.Auth.Did,
				Writes: chunk,
			})
			if err != nil {
				return err
			}
			count += len(chunk)
		}
		return nil
	})
	return count, err
}

func (s *SocialService) UpdateHandle(newHandle string) error {
	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()

	cleanHandle := strings.TrimPrefix(strings.TrimSpace(newHandle), "@")
	if cleanHandle == "" {
		return fmt.Errorf("handle cannot be empty")
	}

	return s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		err := atproto.IdentityUpdateHandle(ctx, c, &atproto.IdentityUpdateHandle_Input{
			Handle: cleanHandle,
		})
		if err != nil {
			return err
		}
		if c.Auth != nil {
			c.Auth.Handle = cleanHandle
		}
		if s.clientMgr.db != nil {
			if sess, dbErr := s.clientMgr.db.GetSession(); dbErr == nil && sess.DID != "" {
				_ = s.clientMgr.db.SaveSession(sess.DID, cleanHandle, sess.AccessJwt, sess.RefreshJwt, sess.PDSHost)
			}
		}
		return nil
	})
}

func (s *SocialService) ExportRepoCAR() (string, error) {
	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()

	var carBytes []byte
	var handle string
	err := s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		handle = c.Auth.Handle
		data, err := atproto.SyncGetRepo(ctx, c, c.Auth.Did, "")
		if err != nil {
			return err
		}
		carBytes = data
		return nil
	})
	if err != nil {
		return "", err
	}

	safeHandle := strings.ReplaceAll(handle, ".", "_")
	if safeHandle == "" {
		safeHandle = "repo"
	}
	defaultFilename := fmt.Sprintf("%s_%s.car", safeHandle, time.Now().Format("20060102"))

	var savePath string
	if s.clientMgr.appCtx != nil {
		chosen, dlgErr := runtime.SaveFileDialog(s.clientMgr.appCtx, runtime.SaveDialogOptions{
			DefaultFilename: defaultFilename,
			Title:           "Export ATProto Repository (.car)",
			Filters: []runtime.FileFilter{
				{DisplayName: "CAR Archive (*.car)", Pattern: "*.car"},
			},
		})
		if dlgErr == nil && chosen != "" {
			savePath = chosen
		} else if dlgErr == nil && chosen == "" {
			return "", nil
		}
	}
	if savePath == "" {
		homeDir, err := os.UserHomeDir()
		if err != nil {
			homeDir = "."
		}
		savePath = filepath.Join(homeDir, defaultFilename)
	}

	if err := os.WriteFile(savePath, carBytes, 0600); err != nil {
		return "", err
	}
	return savePath, nil
}

func parseListView(list *bsky.GraphDefs_ListView) *ListDTO {
	if list == nil {
		return nil
	}
	desc := safeString(list.Description)
	purpose := safeString(list.Purpose)
	creatorHandle := ""
	creatorDid := ""
	if list.Creator != nil {
		creatorHandle = list.Creator.Handle
		creatorDid = list.Creator.Did
	}
	avatar := safeString(list.Avatar)
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
	return &ListDTO{
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
	}
}

func parseStarterPackViewBasic(pack *bsky.GraphDefs_StarterPackViewBasic) *StarterPackDTO {
	if pack == nil {
		return nil
	}
	var name, desc, listUri string
	if pack.Record != nil {
		if bytes, err := json.Marshal(pack.Record.Val); err == nil {
			var rec struct {
				Name        string `json:"name"`
				Description string `json:"description"`
				List        string `json:"list"`
			}
			if json.Unmarshal(bytes, &rec) == nil {
				name = rec.Name
				desc = rec.Description
				listUri = rec.List
			}
		}
	}
	creator := ""
	creatorDid := ""
	if pack.Creator != nil {
		creator = pack.Creator.Handle
		creatorDid = pack.Creator.Did
	}
	var joinedAllTimeCount, joinedWeekCount int64
	if pack.JoinedAllTimeCount != nil {
		joinedAllTimeCount = *pack.JoinedAllTimeCount
	}
	if pack.JoinedWeekCount != nil {
		joinedWeekCount = *pack.JoinedWeekCount
	}
	return &StarterPackDTO{
		URI:                pack.Uri,
		CID:                pack.Cid,
		Name:               name,
		Description:        desc,
		Creator:            creator,
		CreatorDID:         creatorDid,
		ListURI:            listUri,
		JoinedAllTimeCount: joinedAllTimeCount,
		JoinedWeekCount:    joinedWeekCount,
	}
}

func parseStarterPackViewDetailed(pack *bsky.GraphDefs_StarterPackView) *StarterPackDTO {
	if pack == nil {
		return nil
	}
	var name, desc, listUri string
	if pack.Record != nil {
		if bytes, err := json.Marshal(pack.Record.Val); err == nil {
			var rec struct {
				Name        string `json:"name"`
				Description string `json:"description"`
				List        string `json:"list"`
			}
			if json.Unmarshal(bytes, &rec) == nil {
				name = rec.Name
				desc = rec.Description
				listUri = rec.List
			}
		}
	}
	if listUri == "" && pack.List != nil {
		listUri = pack.List.Uri
	}
	creator := ""
	creatorDid := ""
	if pack.Creator != nil {
		creator = pack.Creator.Handle
		creatorDid = pack.Creator.Did
	}
	var joinedAllTimeCount, joinedWeekCount int64
	if pack.JoinedAllTimeCount != nil {
		joinedAllTimeCount = *pack.JoinedAllTimeCount
	}
	if pack.JoinedWeekCount != nil {
		joinedWeekCount = *pack.JoinedWeekCount
	}
	var feeds []*FeedGeneratorDTO
	for _, f := range pack.Feeds {
		if g := parseGeneratorView(f); g != nil {
			feeds = append(feeds, g)
		}
	}
	var members []*ProfileDTO
	for _, li := range pack.ListItemsSample {
		if li != nil && li.Subject != nil {
			if p := ParseProfileView(li.Subject); p != nil {
				p.ListItemURI = li.Uri
				members = append(members, p)
			}
		}
	}
	return &StarterPackDTO{
		URI:                pack.Uri,
		CID:                pack.Cid,
		Name:               name,
		Description:        desc,
		Creator:            creator,
		CreatorDID:         creatorDid,
		ListURI:            listUri,
		JoinedAllTimeCount: joinedAllTimeCount,
		JoinedWeekCount:    joinedWeekCount,
		Feeds:              feeds,
		Members:            members,
	}
}

func (s *SocialService) GetMutedLists(cursor string) (*ListResponseDTO, error) {
	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()
	out := &ListResponseDTO{Lists: []*ListDTO{}}
	err := s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		res, err := bsky.GraphGetListMutes(ctx, c, cursor, 50)
		if err != nil {
			return err
		}
		out.Cursor = safeString(res.Cursor)
		for _, l := range res.Lists {
			if dto := parseListView(l); dto != nil {
				dto.ViewerMuted = true
				out.Lists = append(out.Lists, dto)
			}
		}
		return nil
	})
	return out, err
}

func (s *SocialService) GetBlockedLists(cursor string) (*ListResponseDTO, error) {
	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()
	out := &ListResponseDTO{Lists: []*ListDTO{}}
	err := s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		res, err := bsky.GraphGetListBlocks(ctx, c, cursor, 50)
		if err != nil {
			return err
		}
		out.Cursor = safeString(res.Cursor)
		for _, l := range res.Lists {
			if dto := parseListView(l); dto != nil {
				out.Lists = append(out.Lists, dto)
			}
		}
		return nil
	})
	return out, err
}

func (s *SocialService) GetListsWithMembership(actor string, cursor string) (*ListMembershipResponseDTO, error) {
	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()
	out := &ListMembershipResponseDTO{Items: []*ListWithMembershipDTO{}}
	err := s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		res, err := bsky.GraphGetListsWithMembership(ctx, c, actor, cursor, 50, nil)
		if err != nil {
			return err
		}
		out.Cursor = safeString(res.Cursor)
		for _, item := range res.ListsWithMembership {
			if item == nil || item.List == nil {
				continue
			}
			lDto := parseListView(item.List)
			listItemURI := ""
			if item.ListItem != nil {
				listItemURI = item.ListItem.Uri
			}
			out.Items = append(out.Items, &ListWithMembershipDTO{
				List:        lDto,
				ListItemURI: listItemURI,
				IsMember:    listItemURI != "",
			})
		}
		return nil
	})
	return out, err
}

func (s *SocialService) GetStarterPacksWithMembership(actor string, cursor string) (*StarterPackMembershipResponseDTO, error) {
	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()
	out := &StarterPackMembershipResponseDTO{Items: []*StarterPackWithMembershipDTO{}}
	err := s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		res, err := bsky.GraphGetStarterPacksWithMembership(ctx, c, actor, cursor, 50)
		if err != nil {
			return err
		}
		out.Cursor = safeString(res.Cursor)
		for _, item := range res.StarterPacksWithMembership {
			if item == nil || item.StarterPack == nil {
				continue
			}
			spDto := parseStarterPackViewDetailed(item.StarterPack)
			listItemURI := ""
			if item.ListItem != nil {
				listItemURI = item.ListItem.Uri
			}
			out.Items = append(out.Items, &StarterPackWithMembershipDTO{
				StarterPack: spDto,
				ListItemURI: listItemURI,
				IsMember:    listItemURI != "",
			})
		}
		return nil
	})
	return out, err
}

func (s *SocialService) SearchStarterPacks(query string, cursor string) (*StarterPackResponseDTO, error) {
	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()
	out := &StarterPackResponseDTO{StarterPacks: []*StarterPackDTO{}}
	err := s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		res, err := bsky.GraphSearchStarterPacks(ctx, c, cursor, 50, query)
		if err != nil {
			return err
		}
		out.Cursor = safeString(res.Cursor)
		for _, pack := range res.StarterPacks {
			if dto := parseStarterPackViewBasic(pack); dto != nil {
				out.StarterPacks = append(out.StarterPacks, dto)
			}
		}
		return nil
	})
	return out, err
}

func (s *SocialService) GetStarterPack(uri string) (*StarterPackDTO, error) {
	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()
	var out *StarterPackDTO
	err := s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		res, err := bsky.GraphGetStarterPack(ctx, c, uri)
		if err != nil {
			return err
		}
		if res != nil && res.StarterPack != nil {
			out = parseStarterPackViewDetailed(res.StarterPack)
		}
		return nil
	})
	return out, err
}

func (s *SocialService) GetStarterPacks(uris []string) (*StarterPackResponseDTO, error) {
	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()
	out := &StarterPackResponseDTO{StarterPacks: []*StarterPackDTO{}}
	err := s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		res, err := bsky.GraphGetStarterPacks(ctx, c, uris)
		if err != nil {
			return err
		}
		for _, pack := range res.StarterPacks {
			if dto := parseStarterPackViewBasic(pack); dto != nil {
				out.StarterPacks = append(out.StarterPacks, dto)
			}
		}
		return nil
	})
	return out, err
}

func (s *SocialService) EditStarterPack(uri, name, description, listUri string, feedUris []string) error {
	parts := strings.Split(uri, "/")
	if len(parts) < 3 {
		return fmt.Errorf("invalid starterpack uri")
	}
	rkey := parts[len(parts)-1]

	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()
	return s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		var feeds []*bsky.GraphStarterpack_FeedItem
		for _, fu := range feedUris {
			if fu != "" {
				feeds = append(feeds, &bsky.GraphStarterpack_FeedItem{
					Uri: fu,
				})
			}
		}
		pack := &bsky.GraphStarterpack{
			LexiconTypeID: "app.bsky.graph.starterpack",
			Name:          name,
			Description:   &description,
			List:          listUri,
			Feeds:         feeds,
			CreatedAt:     nowISO8601(),
		}
		_, err := atproto.RepoPutRecord(ctx, c, &atproto.RepoPutRecord_Input{
			Collection: "app.bsky.graph.starterpack",
			Repo:       c.Auth.Did,
			Rkey:       rkey,
			Record:     &util.LexiconTypeDecoder{Val: pack},
		})
		return err
	})
}

func (s *SocialService) GetRelationships(actor string, others []string) ([]RelationshipDTO, error) {
	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()
	var out []RelationshipDTO
	err := s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		if actor == "" {
			actor = c.Auth.Did
		}
		res, err := bsky.GraphGetRelationships(ctx, c, actor, others)
		if err != nil {
			return err
		}
		for _, rel := range res.Relationships {
			if rel == nil || rel.GraphDefs_Relationship == nil {
				continue
			}
			r := rel.GraphDefs_Relationship
			out = append(out, RelationshipDTO{
				DID:        r.Did,
				Following:  safeString(r.Following),
				FollowedBy: safeString(r.FollowedBy),
			})
		}
		return nil
	})
	if out == nil {
		out = []RelationshipDTO{}
	}
	return out, err
}

func (s *SocialService) SetActorStatus(status string, externalUri string, externalTitle string, externalDesc string, durationMinutes int64) error {
	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()
	return s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		if status == "" {
			status = "app.bsky.actor.status#live"
		} else if !strings.Contains(status, "#") {
			status = "app.bsky.actor.status#" + status
		}
		rec := &bsky.ActorStatus{
			LexiconTypeID: "app.bsky.actor.status",
			Status:        status,
			CreatedAt:     nowISO8601(),
		}
		if durationMinutes > 0 {
			rec.DurationMinutes = &durationMinutes
		}
		if externalUri != "" {
			title := externalTitle
			if title == "" {
				title = externalUri
			}
			rec.Embed = &bsky.ActorStatus_Embed{
				EmbedExternal: &bsky.EmbedExternal{
					LexiconTypeID: "app.bsky.embed.external",
					External: &bsky.EmbedExternal_External{
						Uri:         externalUri,
						Title:       title,
						Description: externalDesc,
					},
				},
			}
		}
		_, err := atproto.RepoPutRecord(ctx, c, &atproto.RepoPutRecord_Input{
			Collection: "app.bsky.actor.status",
			Repo:       c.Auth.Did,
			Rkey:       "self",
			Record:     &util.LexiconTypeDecoder{Val: rec},
		})
		return err
	})
}

func (s *SocialService) ClearActorStatus() error {
	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()
	return s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		_, err := atproto.RepoDeleteRecord(ctx, c, &atproto.RepoDeleteRecord_Input{
			Collection: "app.bsky.actor.status",
			Repo:       c.Auth.Did,
			Rkey:       "self",
		})
		return err
	})
}

func (s *SocialService) UpdateFeedViewPrefs(hideReplies, hideReposts, hideQuotePosts, hideRepliesByUnfollowed bool) error {
	return s.mutatePrefs(func(prefs []bsky.ActorDefs_Preferences_Elem) []bsky.ActorDefs_Preferences_Elem {
		return replacePref(prefs,
			func(p bsky.ActorDefs_Preferences_Elem) bool { return p.ActorDefs_FeedViewPref != nil },
			func() bsky.ActorDefs_Preferences_Elem {
				hr := hideReplies
				hrp := hideReposts
				hqp := hideQuotePosts
				hru := hideRepliesByUnfollowed
				return bsky.ActorDefs_Preferences_Elem{
					ActorDefs_FeedViewPref: &bsky.ActorDefs_FeedViewPref{
						LexiconTypeID:           "app.bsky.actor.defs#feedViewPref",
						Feed:                    "home",
						HideReplies:             &hr,
						HideReposts:             &hrp,
						HideQuotePosts:          &hqp,
						HideRepliesByUnfollowed: &hru,
					},
				}
			})
	})
}

func (s *SocialService) HidePostForMe(uri string) error {
	return s.mutatePrefs(func(prefs []bsky.ActorDefs_Preferences_Elem) []bsky.ActorDefs_Preferences_Elem {
		var existing []string
		for _, p := range prefs {
			if p.ActorDefs_HiddenPostsPref != nil {
				existing = append(existing, p.ActorDefs_HiddenPostsPref.Items...)
			}
		}
		if !containsString(existing, uri) {
			existing = append(existing, uri)
		}
		return replacePref(prefs,
			func(p bsky.ActorDefs_Preferences_Elem) bool { return p.ActorDefs_HiddenPostsPref != nil },
			func() bsky.ActorDefs_Preferences_Elem {
				return bsky.ActorDefs_Preferences_Elem{
					ActorDefs_HiddenPostsPref: &bsky.ActorDefs_HiddenPostsPref{
						LexiconTypeID: "app.bsky.actor.defs#hiddenPostsPref",
						Items:         existing,
					},
				}
			})
	})
}

func (s *SocialService) UnhidePostForMe(uri string) error {
	return s.mutatePrefs(func(prefs []bsky.ActorDefs_Preferences_Elem) []bsky.ActorDefs_Preferences_Elem {
		var filtered []string
		for _, p := range prefs {
			if p.ActorDefs_HiddenPostsPref != nil {
				for _, u := range p.ActorDefs_HiddenPostsPref.Items {
					if u != uri {
						filtered = append(filtered, u)
					}
				}
			}
		}
		return replacePref(prefs,
			func(p bsky.ActorDefs_Preferences_Elem) bool { return p.ActorDefs_HiddenPostsPref != nil },
			func() bsky.ActorDefs_Preferences_Elem {
				return bsky.ActorDefs_Preferences_Elem{
					ActorDefs_HiddenPostsPref: &bsky.ActorDefs_HiddenPostsPref{
						LexiconTypeID: "app.bsky.actor.defs#hiddenPostsPref",
						Items:         filtered,
					},
				}
			})
	})
}

func (s *SocialService) UpdatePostInteractionDefaults(threadgateRules []string, disableQuotes bool) error {
	return s.mutatePrefs(func(prefs []bsky.ActorDefs_Preferences_Elem) []bsky.ActorDefs_Preferences_Elem {
		var tgRules []*bsky.ActorDefs_PostInteractionSettingsPref_ThreadgateAllowRules_Elem
		for _, r := range threadgateRules {
			rTrim := strings.TrimSpace(r)
			switch {
			case rTrim == "mentioned":
				tgRules = append(tgRules, &bsky.ActorDefs_PostInteractionSettingsPref_ThreadgateAllowRules_Elem{
					FeedThreadgate_MentionRule: &bsky.FeedThreadgate_MentionRule{
						LexiconTypeID: "app.bsky.feed.threadgate#mentionRule",
					},
				})
			case rTrim == "following":
				tgRules = append(tgRules, &bsky.ActorDefs_PostInteractionSettingsPref_ThreadgateAllowRules_Elem{
					FeedThreadgate_FollowingRule: &bsky.FeedThreadgate_FollowingRule{
						LexiconTypeID: "app.bsky.feed.threadgate#followingRule",
					},
				})
			case rTrim == "followers":
				tgRules = append(tgRules, &bsky.ActorDefs_PostInteractionSettingsPref_ThreadgateAllowRules_Elem{
					FeedThreadgate_FollowerRule: &bsky.FeedThreadgate_FollowerRule{
						LexiconTypeID: "app.bsky.feed.threadgate#followerRule",
					},
				})
			case strings.HasPrefix(rTrim, "list:"):
				lUri := strings.TrimPrefix(rTrim, "list:")
				if lUri != "" {
					tgRules = append(tgRules, &bsky.ActorDefs_PostInteractionSettingsPref_ThreadgateAllowRules_Elem{
						FeedThreadgate_ListRule: &bsky.FeedThreadgate_ListRule{
							LexiconTypeID: "app.bsky.feed.threadgate#listRule",
							List:          lUri,
						},
					})
				}
			}
		}

		var pgRules []*bsky.ActorDefs_PostInteractionSettingsPref_PostgateEmbeddingRules_Elem
		if disableQuotes {
			pgRules = append(pgRules, &bsky.ActorDefs_PostInteractionSettingsPref_PostgateEmbeddingRules_Elem{
				FeedPostgate_DisableRule: &bsky.FeedPostgate_DisableRule{
					LexiconTypeID: "app.bsky.feed.postgate#disableRule",
				},
			})
		}

		return replacePref(prefs,
			func(p bsky.ActorDefs_Preferences_Elem) bool { return p.ActorDefs_PostInteractionSettingsPref != nil },
			func() bsky.ActorDefs_Preferences_Elem {
				return bsky.ActorDefs_Preferences_Elem{
					ActorDefs_PostInteractionSettingsPref: &bsky.ActorDefs_PostInteractionSettingsPref{
						LexiconTypeID:          "app.bsky.actor.defs#postInteractionSettingsPref",
						ThreadgateAllowRules:   tgRules,
						PostgateEmbeddingRules: pgRules,
					},
				}
			})
	})
}

func (s *SocialService) AddMutedWordAdvanced(word string, targets []string, actorTarget string, expiresAt string) error {
	cleanWord := strings.TrimSpace(word)
	if cleanWord == "" {
		return fmt.Errorf("word is required")
	}
	return s.mutatePrefs(func(prefs []bsky.ActorDefs_Preferences_Elem) []bsky.ActorDefs_Preferences_Elem {
		var existing []*bsky.ActorDefs_MutedWord
		for _, p := range prefs {
			if p.ActorDefs_MutedWordsPref != nil {
				for _, item := range p.ActorDefs_MutedWordsPref.Items {
					if item != nil && !strings.EqualFold(item.Value, cleanWord) {
						existing = append(existing, item)
					}
				}
			}
		}
		var ptrTargets []*string
		if len(targets) == 0 {
			c := "content"
			t := "tag"
			ptrTargets = []*string{&c, &t}
		} else {
			for _, tgt := range targets {
				v := tgt
				ptrTargets = append(ptrTargets, &v)
			}
		}
		mw := &bsky.ActorDefs_MutedWord{
			Value:   cleanWord,
			Targets: ptrTargets,
		}
		if actorTarget != "" {
			at := actorTarget
			mw.ActorTarget = &at
		}
		if expiresAt != "" {
			exp := expiresAt
			mw.ExpiresAt = &exp
		}
		existing = append(existing, mw)

		return replacePref(prefs,
			func(p bsky.ActorDefs_Preferences_Elem) bool { return p.ActorDefs_MutedWordsPref != nil },
			func() bsky.ActorDefs_Preferences_Elem {
				return bsky.ActorDefs_Preferences_Elem{
					ActorDefs_MutedWordsPref: &bsky.ActorDefs_MutedWordsPref{
						LexiconTypeID: "app.bsky.actor.defs#mutedWordsPref",
						Items:         existing,
					},
				}
			})
	})
}

func (s *SocialService) UpdateInterests(tags []string) error {
	return s.mutatePrefs(func(prefs []bsky.ActorDefs_Preferences_Elem) []bsky.ActorDefs_Preferences_Elem {
		return replacePref(prefs,
			func(p bsky.ActorDefs_Preferences_Elem) bool { return p.ActorDefs_InterestsPref != nil },
			func() bsky.ActorDefs_Preferences_Elem {
				return bsky.ActorDefs_Preferences_Elem{
					ActorDefs_InterestsPref: &bsky.ActorDefs_InterestsPref{
						LexiconTypeID: "app.bsky.actor.defs#interestsPref",
						Tags:          tags,
					},
				}
			})
	})
}

func (s *SocialService) UpdateVerificationPrefs(hideBadges bool) error {
	return s.mutatePrefs(func(prefs []bsky.ActorDefs_Preferences_Elem) []bsky.ActorDefs_Preferences_Elem {
		return replacePref(prefs,
			func(p bsky.ActorDefs_Preferences_Elem) bool { return p.ActorDefs_VerificationPrefs != nil },
			func() bsky.ActorDefs_Preferences_Elem {
				hb := hideBadges
				return bsky.ActorDefs_Preferences_Elem{
					ActorDefs_VerificationPrefs: &bsky.ActorDefs_VerificationPrefs{
						LexiconTypeID: "app.bsky.actor.defs#verificationPrefs",
						HideBadges:    &hb,
					},
				}
			})
	})
}

func (s *SocialService) GetAgeAssuranceState(countryCode, regionCode string) (*AgeAssuranceStateDTO, error) {
	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()
	out := &AgeAssuranceStateDTO{Status: "unknown", Access: "unknown"}
	err := s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		res, err := bsky.AgeassuranceGetState(ctx, c, countryCode, regionCode)
		if err != nil {
			return err
		}
		if res != nil && res.State != nil {
			out.Status = safeString(res.State.Status)
			out.Access = safeString(res.State.Access)
			out.LastInitiatedAt = safeString(res.State.LastInitiatedAt)
		}
		return nil
	})
	return out, err
}

func (s *SocialService) BeginAgeAssurance(countryCode, regionCode, email, language string) (*AgeAssuranceStateDTO, error) {
	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()
	out := &AgeAssuranceStateDTO{Status: "pending", Access: "unknown"}
	err := s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		var regPtr *string
		if regionCode != "" {
			r := regionCode
			regPtr = &r
		}
		res, err := bsky.AgeassuranceBegin(ctx, c, &bsky.AgeassuranceBegin_Input{
			CountryCode: countryCode,
			RegionCode:  regPtr,
			Email:       email,
			Language:    language,
		})
		if err != nil {
			return err
		}
		if res != nil {
			out.Status = safeString(res.Status)
			out.Access = safeString(res.Access)
			out.LastInitiatedAt = safeString(res.LastInitiatedAt)
		}
		return nil
	})
	return out, err
}

func (s *SocialService) StartPhoneVerification(phone string) error {
	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()
	return s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		_, err := bsky.ContactStartPhoneVerification(ctx, c, &bsky.ContactStartPhoneVerification_Input{
			Phone: phone,
		})
		return err
	})
}

func (s *SocialService) VerifyPhone(phone, code string) (string, error) {
	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()
	var token string
	err := s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		res, err := bsky.ContactVerifyPhone(ctx, c, &bsky.ContactVerifyPhone_Input{
			Phone: phone,
			Code:  code,
		})
		if err != nil {
			return err
		}
		if res != nil {
			token = res.Token
		}
		return nil
	})
	return token, err
}

func (s *SocialService) ImportContacts(token string, contacts []string) (int, error) {
	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()
	matchesCount := 0
	err := s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		res, err := bsky.ContactImportContacts(ctx, c, &bsky.ContactImportContacts_Input{
			Token:    token,
			Contacts: contacts,
		})
		if err != nil {
			return err
		}
		if res != nil {
			matchesCount = len(res.MatchesAndContactIndexes)
		}
		return nil
	})
	return matchesCount, err
}

func (s *SocialService) GetContactMatches(cursor string) (*ProfileListDTO, error) {
	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()
	out := &ProfileListDTO{Profiles: []*ProfileDTO{}}
	err := s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		res, err := bsky.ContactGetMatches(ctx, c, cursor, 50)
		if err != nil {
			return err
		}
		out.Cursor = safeString(res.Cursor)
		for _, m := range res.Matches {
			if p := ParseProfileView(m); p != nil {
				out.Profiles = append(out.Profiles, p)
			}
		}
		return nil
	})
	return out, err
}

func (s *SocialService) RemoveContactData() error {
	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()
	return s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		_, err := bsky.ContactRemoveData(ctx, c, &bsky.ContactRemoveData_Input{})
		return err
	})
}



