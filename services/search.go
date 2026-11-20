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
	Query           string
	Author          string
	Lang            string
	Sort            string
	Since           string
	Until           string
	Domain          string
	Mentions        string
	Tag             []string
	URL             string
	Cursor          string
	AllTime         bool
	Following       bool
	HasMedia        bool
	HasVideo        bool
	ExcludeReplies  bool
	RepliesOnly     bool
	ExcludeAuthors  []string
	ExcludeHashtags []string
	ExcludeDomains  []string
	ThreadRootURI   string
}

func (s *SearchService) SearchPosts(filter *PostSearchFilter) (*SearchDTO, error) {
	ctx, cancel := s.clientMgr.NewContext()
	defer cancel()
	var out *SearchDTO
	err := s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
		sort := filter.Sort
		if sort == "" {
			sort = "latest"
		}
		v2Sort := sort
		if v2Sort == "latest" {
			v2Sort = "recent"
		}
		var authors []string
		if filter.Author != "" {
			authors = []string{filter.Author}
		}
		var domains []string
		if filter.Domain != "" {
			domains = []string{filter.Domain}
		}
		var languages []string
		if filter.Lang != "" {
			languages = []string{filter.Lang}
		}
		var mentions []string
		if filter.Mentions != "" {
			mentions = []string{filter.Mentions}
		}
		var urls []string
		if filter.URL != "" {
			urls = []string{filter.URL}
		}

		resV2, errV2 := bsky.FeedSearchPostsV2(
			ctx,
			c,
			filter.AllTime,
			authors,
			filter.Cursor,
			domains,
			nil,
			filter.ExcludeAuthors,
			filter.ExcludeDomains,
			nil,
			filter.ExcludeHashtags,
			nil,
			nil,
			filter.ExcludeReplies,
			nil,
			filter.Following,
			filter.HasMedia,
			filter.HasVideo,
			filter.Tag,
			languages,
			50,
			mentions,
			filter.Query,
			"",
			filter.RepliesOnly,
			"",
			filter.Since,
			v2Sort,
			filter.ThreadRootURI,
			filter.Until,
			urls,
		)
		if errV2 == nil && resV2 != nil {
			out = &SearchDTO{Cursor: safeString(resV2.Cursor)}
			for _, item := range resV2.Posts {
				if item != nil {
					if dto := ParsePostView(item); dto != nil {
						out.Posts = append(out.Posts, dto)
					}
				}
			}
			return nil
		}

		res, err := bsky.FeedSearchPosts(ctx, c, filter.Author, filter.Cursor, filter.Domain, filter.Lang, 50, filter.Mentions, filter.Query, filter.Since, filter.Sort, filter.Tag, filter.Until, filter.URL)
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
