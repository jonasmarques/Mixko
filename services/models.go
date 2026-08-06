package services

import (
	"encoding/json"
	"strings"
	"sync"
)

var globalDIDCache sync.Map

func CacheDID(did, handle string) {
	if did != "" && handle != "" && !strings.HasPrefix(handle, "did:") {
		globalDIDCache.Store(did, handle)
	}
}

func GetHandleForDID(did string) (string, bool) {
	if val, ok := globalDIDCache.Load(did); ok {
		if handle, ok := val.(string); ok {
			return handle, true
		}
	}
	return "", false
}


type PostDTO struct {
	URI          string `json:"uri"`
	CID          string `json:"cid"`
	AuthorName   string `json:"authorName"`
	AuthorHandle string `json:"authorHandle"`
	AuthorDID    string `json:"authorDid"`
	Text         string `json:"text"`
	CreatedAt     string `json:"createdAt"`
	ReplyCount    int64  `json:"replyCount"`
	RepostCount   int64  `json:"repostCount"`
	LikeCount     int64  `json:"likeCount"`
	IsReply       bool     `json:"isReply"`
	ReplyToAuthor string   `json:"replyToAuthor"`
	ReplyToURI    string   `json:"replyToUri"`
	RootAuthor    string   `json:"rootAuthor"`
	RootURI       string   `json:"rootUri"`
	ParentPost    *PostDTO `json:"parentPost"`
	RepostedBy    string   `json:"repostedBy"`
	QuotePost     *PostDTO `json:"quotePost"`
	ImageAlts     []string          `json:"imageAlts"`
	Images        []*ImageDTO       `json:"images"`
	External      *ExternalEmbedDTO `json:"external"`
	Video         *VideoEmbedDTO    `json:"video"`
	HasMedia      bool              `json:"hasMedia"`
	ViewerLike    string            `json:"viewerLike"`
	ViewerRepost  string            `json:"viewerRepost"`
	ViewerBookmark string           `json:"viewerBookmark"`
}

type ImageDTO struct {
	Thumb    string `json:"thumb"`
	Fullsize string `json:"fullsize"`
	Alt      string `json:"alt"`
	Width    int64  `json:"width,omitempty"`
	Height   int64  `json:"height,omitempty"`
}

type ExternalEmbedDTO struct {
	URI         string `json:"uri"`
	Title       string `json:"title"`
	Description string `json:"description"`
	Thumb       string `json:"thumb"`
}

type VideoJobStatusDTO struct {
	JobId    string `json:"jobId"`
	Did      string `json:"did"`
	State    string `json:"state"`
	Progress int64  `json:"progress,omitempty"`
	Message  string `json:"message,omitempty"`
	Error    string `json:"error,omitempty"`
}

type VideoEmbedDTO struct {
	Playlist     string `json:"playlist"`
	Thumbnail    string `json:"thumbnail"`
	Alt          string `json:"alt"`
	Presentation string `json:"presentation"`
}

type SavedFeedDTO struct {
	URI         string `json:"uri"`
	CID         string `json:"cid"`
	DisplayName string `json:"displayName"`
	Creator     string `json:"creator"`
	Pinned      bool   `json:"pinned"`
}

type FeedDTO struct {
	Cursor string     `json:"cursor"`
	Posts  []*PostDTO `json:"posts"`
}

type NotificationDTO struct {
	URI          string `json:"uri"`
	CID          string `json:"cid"`
	AuthorName   string `json:"authorName"`
	AuthorHandle string `json:"authorHandle"`
	Reason        string `json:"reason"`
	IndexedAt     string `json:"indexedAt"`
	Text          string `json:"text"`
	ReasonSubject string `json:"reasonSubject"`
	HasMedia      bool   `json:"hasMedia"`
	Video         *VideoEmbedDTO `json:"video"`
	QuoteAuthorName   string `json:"quoteAuthorName,omitempty"`
	QuoteAuthorHandle string `json:"quoteAuthorHandle,omitempty"`
	QuoteText         string `json:"quoteText,omitempty"`
	QuoteUri          string `json:"quoteUri,omitempty"`
	HydratedPost      *PostDTO `json:"hydratedPost,omitempty"`
}

type NotificationListDTO struct {
	Cursor        string             `json:"cursor"`
	Notifications []*NotificationDTO `json:"notifications"`
}

type LabelerPolicyDefinitionDTO struct {
	Identifier     string `json:"identifier"`
	Severity       string `json:"severity"`
	Blurs          string `json:"blurs"`
	DefaultSetting string `json:"defaultSetting"`
	AdultOnly      bool   `json:"adultOnly"`
	Title          string `json:"title"`
	Description    string `json:"description"`
}

type LabelerDTO struct {
	DID          string                       `json:"did"`
	Handle       string                       `json:"handle"`
	DisplayName  string                       `json:"displayName"`
	Description  string                       `json:"description"`
	Avatar       string                       `json:"avatar"`
	Banner       string                       `json:"banner"`
	LikeCount    int64                        `json:"likeCount"`
	IsSubscribed bool                         `json:"isSubscribed"`
	ViewerLike   string                       `json:"viewerLike"`
	IndexedAt    string                       `json:"indexedAt"`
	Policies     []LabelerPolicyDefinitionDTO `json:"policies"`
}

type ProfileDTO struct {
	DID                    string      `json:"did"`
	Handle                 string      `json:"handle"`
	DisplayName            string      `json:"displayName"`
	Description            string      `json:"description"`
	Followers              int64       `json:"followersCount"`
	Follows                int64       `json:"followsCount"`
	Posts                  int64       `json:"postsCount"`
	ViewerFollowing        string      `json:"viewerFollowing"`
	ViewerFollowedBy       string      `json:"viewerFollowedBy"`
	ViewerMuted            bool        `json:"viewerMuted"`
	ViewerBlocking         string      `json:"viewerBlocking"`
	ViewerBlockedBy        bool        `json:"viewerBlockedBy"`
	PinnedPostUri          string      `json:"pinnedPostUri"`
	IsMe                   bool        `json:"isMe"`
	IsLabeler              bool        `json:"isLabeler"`
	ViewerSubscribedLabeler bool       `json:"viewerSubscribedLabeler"`
	LabelerInfo            *LabelerDTO `json:"labelerInfo,omitempty"`
}

type ProfileListDTO struct {
	Cursor   string        `json:"cursor"`
	Profiles []*ProfileDTO `json:"profiles"`
}

type ListDTO struct {
	URI           string `json:"uri"`
	CID           string `json:"cid"`
	Name          string `json:"name"`
	Purpose       string `json:"purpose"`
	Description   string `json:"description"`
	Creator       string `json:"creator"`
	CreatorDID    string `json:"creatorDid"`
	CreatorHandle string `json:"creatorHandle"`
	Avatar        string `json:"avatar"`
	ListItemCount int64  `json:"listItemCount"`
	ViewerMuted   bool   `json:"viewerMuted"`
	ViewerBlock   string `json:"viewerBlock"`
}

type StarterPackDTO struct {
	URI         string `json:"uri"`
	CID         string `json:"cid"`
	Name        string `json:"name"`
	Description string `json:"description"`
	Creator     string `json:"creator"`
	ListURI     string `json:"listUri"`
}

type ListResponseDTO struct {
	Cursor string     `json:"cursor"`
	Lists  []*ListDTO `json:"lists"`
}

type StarterPackResponseDTO struct {
	Cursor       string            `json:"cursor"`
	StarterPacks []*StarterPackDTO `json:"starterPacks"`
}

type SearchDTO struct {
	Cursor string     `json:"cursor"`
	Posts  []*PostDTO `json:"posts"`
}

type ChatConvoDTO struct {
	ID            string `json:"id"`
	Rev           string `json:"rev"`
	Members       string `json:"members"`
	LastMessage   string `json:"lastMessage"`
	UnreadCount   int64  `json:"unreadCount"`
}

type ChatMessageDTO struct {
	ID                 string `json:"id"`
	Rev                string `json:"rev"`
	Sender             string `json:"sender"`
	Text               string `json:"text"`
	SentAt             string `json:"sentAt"`
	EmbedURI           string `json:"embedUri,omitempty"`
	ReplyToMessageText string `json:"replyToMessageText,omitempty"`
	ReplyToSender      string `json:"replyToSender,omitempty"`
}

type ChatMessagesDTO struct {
	Cursor   string            `json:"cursor"`
	Messages []*ChatMessageDTO `json:"messages"`
}

type ContentFilterDTO struct {
	LabelerDid string `json:"labelerDid"`
	Label      string `json:"label"`
	Visibility string `json:"visibility"`
}

type MutedWordDTO struct {
	Value   string   `json:"value"`
	Targets []string `json:"targets"`
}

type PreferencesDTO struct {
	AdultContentEnabled        bool               `json:"adultContentEnabled"`
	ContentFilters             []ContentFilterDTO `json:"contentFilters"`
	MutedWords                 []MutedWordDTO     `json:"mutedWords"`
	PinnedFeeds                []string           `json:"pinnedFeeds"`
	SavedFeeds                 []string           `json:"savedFeeds"`
	ThreadSort                 string             `json:"threadSort"`
	ThreadPrioritizeFollowed   bool               `json:"threadPrioritizeFollowed"`
}

// Helper para parsear de forma segura o texto do Record
func ParseFeedPost(record interface{}) string {
	if record == nil {
		return ""
	}
	
	// Convert to map or struct to extract Text reliably since it's inside LexiconTypeDecoder Val
	bytes, err := json.Marshal(record)
	if err != nil {
		return ""
	}

	var post struct {
		Text string `json:"text"`
	}
	_ = json.Unmarshal(bytes, &post)

	return post.Text
}

func ParseRepostSubjectURI(record interface{}) string {
	if record == nil {
		return ""
	}
	bytes, err := json.Marshal(record)
	if err != nil {
		return ""
	}
	var repostRec struct {
		Subject struct {
			URI string `json:"uri"`
		} `json:"subject"`
	}
	_ = json.Unmarshal(bytes, &repostRec)
	return repostRec.Subject.URI
}

func ExtractExternalFromRecord(record interface{}) *ExternalEmbedDTO {
	if record == nil {
		return nil
	}
	bytes, err := json.Marshal(record)
	if err != nil {
		return nil
	}
	var rec struct {
		Embed struct {
			External struct {
				URI         string `json:"uri"`
				Title       string `json:"title"`
				Description string `json:"description"`
			} `json:"external"`
			Media struct {
				External struct {
					URI         string `json:"uri"`
					Title       string `json:"title"`
					Description string `json:"description"`
				} `json:"external"`
			} `json:"media"`
		} `json:"embed"`
	}
	if err := json.Unmarshal(bytes, &rec); err != nil {
		return nil
	}
	if rec.Embed.External.URI != "" {
		return &ExternalEmbedDTO{
			URI:         rec.Embed.External.URI,
			Title:       rec.Embed.External.Title,
			Description: rec.Embed.External.Description,
		}
	}
	if rec.Embed.Media.External.URI != "" {
		return &ExternalEmbedDTO{
			URI:         rec.Embed.Media.External.URI,
			Title:       rec.Embed.Media.External.Title,
			Description: rec.Embed.Media.External.Description,
		}
	}
	return nil
}

// Helper para extrair metadados de resposta do Record em CBOR/JSON
func ExtractReplyMetaFromRecord(record interface{}) (bool, string, string) {
	if record == nil {
		return false, "", ""
	}
	bytes, err := json.Marshal(record)
	if err != nil {
		return false, "", ""
	}
	var meta struct {
		Reply *struct {
			Parent struct {
				URI string `json:"uri"`
			} `json:"parent"`
			Root struct {
				URI string `json:"uri"`
			} `json:"root"`
		} `json:"reply"`
	}
	if err := json.Unmarshal(bytes, &meta); err != nil || meta.Reply == nil || meta.Reply.Parent.URI == "" {
		return false, "", ""
	}
	parentURI := meta.Reply.Parent.URI
	parentDID := ""
	if strings.HasPrefix(parentURI, "at://") {
		parts := strings.SplitN(parentURI[5:], "/", 2)
		if len(parts) > 0 {
			parentDID = parts[0]
		}
	}
	return true, parentURI, parentDID
}

// Helper para extrair o alt do vídeo a partir do Record CBOR/JSON
func ExtractVideoAltFromRecord(record interface{}) string {
	if record == nil {
		return ""
	}
	bytes, err := json.Marshal(record)
	if err != nil {
		return ""
	}
	var obj struct {
		Embed *struct {
			Type string `json:"$type"`
			Alt  string `json:"alt"`
			Media *struct {
				Type string `json:"$type"`
				Alt  string `json:"alt"`
			} `json:"media"`
		} `json:"embed"`
	}
	if err := json.Unmarshal(bytes, &obj); err != nil || obj.Embed == nil {
		return ""
	}
	if obj.Embed.Alt != "" {
		return obj.Embed.Alt
	}
	if obj.Embed.Media != nil && obj.Embed.Media.Alt != "" {
		return obj.Embed.Media.Alt
	}
	return ""
}

type FeedGeneratorDTO struct {
	URI         string `json:"uri"`
	CID         string `json:"cid"`
	DID         string `json:"did"`
	Creator     string `json:"creator"`
	DisplayName string `json:"displayName"`
	Description string `json:"description"`
	LikeCount   int64  `json:"likeCount"`
	Avatar      string `json:"avatar"`
}

type FeedGeneratorResponseDTO struct {
	Cursor string              `json:"cursor"`
	Feeds  []*FeedGeneratorDTO `json:"feeds"`
}

type UpdateInfoDTO struct {
	HasUpdate      bool   `json:"hasUpdate"`
	CurrentVersion string `json:"currentVersion"`
	LatestVersion  string `json:"latestVersion"`
	ReleaseURL     string `json:"releaseUrl"`
}

