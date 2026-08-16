package services

import (
	"github.com/bluesky-social/indigo/api/bsky"
	"github.com/bluesky-social/indigo/xrpc"
)

type SearchService struct {
	clientMgr *ATClient
}

func NewSearchService(clientMgr *ATClient) *SearchService {
	return &SearchService{clientMgr: clientMgr}
}

type PostSearchFilter struct {
	Query  string
	Author string
	Lang   string
	Sort   string
	Since  string
	Until  string
	Cursor string
}

func (s *SearchService) SearchPosts(filter *PostSearchFilter) (*SearchDTO, error) {
	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()
	var out *SearchDTO
	err := s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		res, err := bsky.FeedSearchPosts(ctx, c, filter.Author, filter.Cursor, "", filter.Lang, 50, "", filter.Query, filter.Since, filter.Sort, nil, filter.Until, "")
		if err != nil {
			return err
		}
		
		out = &SearchDTO{Cursor: safeString(res.Cursor)}
		for _, item := range res.Posts {
			if item != nil {
				dto := ParsePostView(item)
				if dto != nil {
					out.Posts = append(out.Posts, dto)
				}
			}
		}
		
		return nil
	})
	return out, err
}

func (s *SearchService) SearchProfiles(query string, cursor string) (*ProfileListDTO, error) {
	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()
	var out *ProfileListDTO
	err := s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		res, err := bsky.ActorSearchActors(ctx, c, cursor, 50, query, "")
		if err != nil {
			return err
		}

		out = &ProfileListDTO{Cursor: safeString(res.Cursor)}
		for _, actor := range res.Actors {
			if dto := ParseProfileView(actor); dto != nil {
				out.Profiles = append(out.Profiles, dto)
			}
		}
		return nil
	})
	return out, err
}

func (s *SearchService) SearchProfilesTypeahead(query string) (*ProfileListDTO, error) {
	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()
	var out *ProfileListDTO
	err := s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		res, err := bsky.ActorSearchActorsTypeahead(ctx, c, 50, query, "")
		if err != nil {
			return err
		}

		out = &ProfileListDTO{}
		for _, actor := range res.Actors {
			if dto := ParseProfileViewBasic(actor); dto != nil {
				out.Profiles = append(out.Profiles, dto)
			}
		}
		return nil
	})
	return out, err
}
