package services

import (
	"encoding/json"
	"fmt"
	"strings"
	"sync"
)

var globalDIDCache sync.Map
var globalHandleToDIDCache sync.Map
var globalAuthorCache sync.Map
var globalPDSCache sync.Map

func normalizePDSHost(host string) string {
	host = strings.TrimSpace(host)
	if host == "" {
		return ""
	}
	if !strings.HasPrefix(host, "http://") && !strings.HasPrefix(host, "https://") {
		host = "https://" + host
	}
	return strings.TrimRight(host, "/")
}

func CachePDSHost(did, host string) {
	did = strings.TrimSpace(did)
	normalized := normalizePDSHost(host)
	if did == "" || normalized == "" {
		return
	}
	globalPDSCache.Store(did, normalized)
}

func GetPDSHostForDID(did string) (string, bool) {
	if val, ok := globalPDSCache.Load(strings.TrimSpace(did)); ok {
		if host, ok := val.(string); ok && host != "" {
			return host, true
		}
	}
	return "", false
}

type AuthorIdentity struct {
	DID         string `json:"did"`
	Handle      string `json:"handle"`
	DisplayName string `json:"displayName"`
}

func CacheAuthor(did, handle, displayName string) {
	if did == "" {
		return
	}
	if handle != "" && !strings.HasPrefix(handle, "did:") {
		globalDIDCache.Store(did, handle)
		globalHandleToDIDCache.Store(strings.ToLower(strings.TrimSpace(handle)), did)
	}
	existing, ok := GetAuthorForDID(did)
	if ok {
		if handle == "" || strings.HasPrefix(handle, "did:") {
			handle = existing.Handle
		}
		if displayName == "" {
			displayName = existing.DisplayName
		}
	}
	globalAuthorCache.Store(did, AuthorIdentity{
		DID:         did,
		Handle:      handle,
		DisplayName: displayName,
	})
}

func CacheDID(did, handle string) {
	CacheAuthor(did, handle, "")
}

func GetAuthorForDID(did string) (AuthorIdentity, bool) {
	if val, ok := globalAuthorCache.Load(did); ok {
		if identity, ok := val.(AuthorIdentity); ok {
			return identity, true
		}
	}
	if handle, ok := GetHandleForDID(did); ok {
		return AuthorIdentity{DID: did, Handle: handle}, true
	}
	return AuthorIdentity{}, false
}

func GetHandleForDID(did string) (string, bool) {
	if val, ok := globalDIDCache.Load(did); ok {
		if handle, ok := val.(string); ok {
			return handle, true
		}
	}
	return "", false
}

func GetDIDForHandle(handle string) (string, bool) {
	if val, ok := globalHandleToDIDCache.Load(strings.ToLower(strings.TrimSpace(handle))); ok {
		if did, ok := val.(string); ok && did != "" {
			return did, true
		}
	}
	return "", false
}

type PostDTO struct {
	URI               string            `json:"uri"`
	CID               string            `json:"cid"`
	AuthorName        string            `json:"authorName"`
	AuthorHandle      string            `json:"authorHandle"`
	AuthorDID         string            `json:"authorDid"`
	AuthorPronouns    string            `json:"authorPronouns,omitempty"`
	AuthorVerified    bool              `json:"authorVerified,omitempty"`
	Text              string            `json:"text"`
	CreatedAt         string            `json:"createdAt"`
	ReplyCount        int64             `json:"replyCount"`
	RepostCount       int64             `json:"repostCount"`
	LikeCount         int64             `json:"likeCount"`
	IsReply           bool              `json:"isReply"`
	ReplyToAuthor     string            `json:"replyToAuthor"`
	ReplyToAuthorName string            `json:"replyToAuthorName,omitempty"`
	ReplyToURI        string            `json:"replyToUri"`
	RootAuthor        string            `json:"rootAuthor"`
	RootAuthorName    string            `json:"rootAuthorName,omitempty"`
	RootURI           string            `json:"rootUri"`
	ParentPost        *PostDTO          `json:"parentPost"`
	RootPost          *PostDTO          `json:"rootPost"`
	RepostedBy        string            `json:"repostedBy"`
	RepostedByHandle  string            `json:"repostedByHandle"`
	QuotePost         *PostDTO          `json:"quotePost"`
	QuoteDetached     bool              `json:"quoteDetached,omitempty"`
	QuoteDetachedURI  string            `json:"quoteDetachedUri,omitempty"`
	ImageAlts         []string          `json:"imageAlts"`
	Images            []*ImageDTO       `json:"images"`
	External          *ExternalEmbedDTO `json:"external"`
	Video             *VideoEmbedDTO    `json:"video"`
	HasMedia          bool              `json:"hasMedia"`
	Labels            []string          `json:"labels,omitempty"`
	ViewerLike        string            `json:"viewerLike"`
	ViewerRepost      string            `json:"viewerRepost"`
	ViewerBookmark    string            `json:"viewerBookmark"`
	ViewerThreadMuted bool              `json:"viewerThreadMuted"`
	EmbeddingDisabled bool              `json:"embeddingDisabled,omitempty"`
	ReplyDisabled     bool              `json:"replyDisabled,omitempty"`
	FeedContext       string            `json:"feedContext,omitempty"`
}

// PostRefDTO identifies a post that was just created, together with the root of
// the thread it belongs to. Returning the root lets a client publishing a
// multi-post thread carry it forward to the next reply instead of asking the
// network to re-derive it from a parent that may not be indexed yet.
type PostRefDTO struct {
	Uri     string `json:"uri"`
	Cid     string `json:"cid"`
	RootUri string `json:"rootUri"`
	RootCid string `json:"rootCid"`
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

type VideoCaptionDTO struct {
	Lang string `json:"lang"`
	URL  string `json:"url"`
}

type VideoEmbedDTO struct {
	Playlist     string            `json:"playlist"`
	Thumbnail    string            `json:"thumbnail"`
	Alt          string            `json:"alt"`
	Presentation string            `json:"presentation"`
	Captions     []VideoCaptionDTO `json:"captions,omitempty"`
}

type VideoUploadLimitsDTO struct {
	CanUpload            bool   `json:"canUpload"`
	RemainingDailyVideos int64  `json:"remainingDailyVideos"`
	RemainingDailyBytes  int64  `json:"remainingDailyBytes"`
	Message              string `json:"message,omitempty"`
	Error                string `json:"error,omitempty"`
}

type SavedFeedDTO struct {
	URI         string `json:"uri"`
	CID         string `json:"cid"`
	DisplayName string `json:"displayName"`
	Creator     string `json:"creator"`
	Pinned      bool   `json:"pinned"`
}

type FeedDTO struct {
	Cursor          string     `json:"cursor"`
	Posts           []*PostDTO `json:"posts"`
	DebugMessage    string     `json:"debugMessage,omitempty"`
	HasOtherReplies bool       `json:"hasOtherReplies,omitempty"`
}

type NotificationDTO struct {
	URI               string         `json:"uri"`
	CID               string         `json:"cid"`
	AuthorDID         string         `json:"authorDid"`
	AuthorName        string         `json:"authorName"`
	AuthorHandle      string         `json:"authorHandle"`
	Reason            string         `json:"reason"`
	IndexedAt         string         `json:"indexedAt"`
	Text              string         `json:"text"`
	ReasonSubject     string         `json:"reasonSubject"`
	HasMedia          bool           `json:"hasMedia"`
	Video             *VideoEmbedDTO `json:"video"`
	QuoteAuthorName   string         `json:"quoteAuthorName,omitempty"`
	QuoteAuthorHandle string         `json:"quoteAuthorHandle,omitempty"`
	QuoteText         string         `json:"quoteText,omitempty"`
	QuoteUri          string         `json:"quoteUri,omitempty"`
	HydratedPost      *PostDTO       `json:"hydratedPost,omitempty"`
	// Reply notifications also fire for the thread root author, so the post
	// being answered is often somebody else's. These carry that author so the
	// UI can say "replied to X" instead of assuming "replied to your post".
	ReplyParentURI          string `json:"replyParentUri,omitempty"`
	ReplyParentAuthorDID    string `json:"replyParentAuthorDid,omitempty"`
	ReplyParentAuthorHandle string `json:"replyParentAuthorHandle,omitempty"`
	ReplyParentAuthorName   string `json:"replyParentAuthorName,omitempty"`
}

type NotificationListDTO struct {
	Cursor        string             `json:"cursor"`
	Notifications []*NotificationDTO `json:"notifications"`
}

type NotificationFilterablePrefDTO struct {
	Include string `json:"include"`
	List    bool   `json:"list"`
	Push    bool   `json:"push"`
}

type NotificationChatPrefDTO struct {
	Include string `json:"include"`
	Push    bool   `json:"push"`
}

type NotificationSimplePrefDTO struct {
	List bool `json:"list"`
	Push bool `json:"push"`
}

type NotificationPreferencesDTO struct {
	Priority          bool                           `json:"priority"`
	Chat              *NotificationChatPrefDTO       `json:"chat"`
	Follow            *NotificationFilterablePrefDTO `json:"follow"`
	Like              *NotificationFilterablePrefDTO `json:"like"`
	LikeViaRepost     *NotificationFilterablePrefDTO `json:"likeViaRepost"`
	Mention           *NotificationFilterablePrefDTO `json:"mention"`
	Quote             *NotificationFilterablePrefDTO `json:"quote"`
	Reply             *NotificationFilterablePrefDTO `json:"reply"`
	Repost            *NotificationFilterablePrefDTO `json:"repost"`
	RepostViaRepost   *NotificationFilterablePrefDTO `json:"repostViaRepost"`
	StarterpackJoined *NotificationSimplePrefDTO     `json:"starterpackJoined"`
	SubscribedPost    *NotificationSimplePrefDTO     `json:"subscribedPost"`
	Unverified        *NotificationSimplePrefDTO     `json:"unverified"`
	Verified          *NotificationSimplePrefDTO     `json:"verified"`
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

type ActivitySubscriptionDTO struct {
	Post  bool `json:"post"`
	Reply bool `json:"reply"`
}

type ActorStatusDTO struct {
	Status      string `json:"status"`
	URI         string `json:"uri,omitempty"`
	Title       string `json:"title,omitempty"`
	Description string `json:"description,omitempty"`
	ExpiresAt   string `json:"expiresAt,omitempty"`
	IsActive    bool   `json:"isActive"`
}

type ProfileLinkDTO struct {
	URI   string `json:"uri,omitempty"`
	CID   string `json:"cid,omitempty"`
	Title string `json:"title"`
	URL   string `json:"url"`
}

type ProfileDTO struct {
	DID                        string                   `json:"did"`
	Handle                     string                   `json:"handle"`
	DisplayName                string                   `json:"displayName"`
	Description                string                   `json:"description"`
	Pronouns                   string                   `json:"pronouns,omitempty"`
	Avatar                     string                   `json:"avatar"`
	Website                    string                   `json:"website,omitempty"`
	Links                      []ProfileLinkDTO         `json:"links,omitempty"`
	Followers                  int64                    `json:"followersCount"`
	Follows                    int64                    `json:"followsCount"`
	Posts                      int64                    `json:"postsCount"`
	ViewerFollowing            string                   `json:"viewerFollowing"`
	ViewerFollowedBy           string                   `json:"viewerFollowedBy"`
	ViewerMuted                bool                     `json:"viewerMuted"`
	ViewerBlocking             string                   `json:"viewerBlocking"`
	ViewerBlockedBy            bool                     `json:"viewerBlockedBy"`
	PinnedPostUri              string                   `json:"pinnedPostUri"`
	IsMe                       bool                     `json:"isMe"`
	IsLabeler                  bool                     `json:"isLabeler"`
	ViewerSubscribedLabeler    bool                     `json:"viewerSubscribedLabeler"`
	ViewerActivitySubscription *ActivitySubscriptionDTO `json:"viewerActivitySubscription,omitempty"`
	LabelerInfo                *LabelerDTO              `json:"labelerInfo,omitempty"`
	ListItemURI                string                   `json:"listItemUri,omitempty"`
	Verified                   bool                     `json:"verified,omitempty"`
	TrustedVerifier            bool                     `json:"trustedVerifier,omitempty"`
	Status                     *ActorStatusDTO          `json:"status,omitempty"`
}

type ProfileListDTO struct {
	Cursor   string        `json:"cursor"`
	Profiles []*ProfileDTO `json:"profiles"`
}

type ListDTO struct {
	URI              string `json:"uri"`
	CID              string `json:"cid"`
	Name             string `json:"name"`
	Purpose          string `json:"purpose"`
	Description      string `json:"description"`
	Creator          string `json:"creator"`
	CreatorDID       string `json:"creatorDid"`
	CreatorHandle    string `json:"creatorHandle"`
	Avatar           string `json:"avatar"`
	ListItemCount    int64  `json:"listItemCount"`
	ViewerMuted      bool   `json:"viewerMuted"`
	ViewerBlock      string `json:"viewerBlock"`
	ViewerSubscribed bool   `json:"viewerSubscribed"`
}

type ListWithMembershipDTO struct {
	List        *ListDTO `json:"list"`
	ListItemURI string   `json:"listItemUri,omitempty"`
	IsMember    bool     `json:"isMember"`
}

type ListMembershipResponseDTO struct {
	Cursor string                   `json:"cursor"`
	Items  []*ListWithMembershipDTO `json:"items"`
}

type StarterPackDTO struct {
	URI                string              `json:"uri"`
	CID                string              `json:"cid"`
	Name               string              `json:"name"`
	Description        string              `json:"description"`
	Creator            string              `json:"creator"`
	CreatorDID         string              `json:"creatorDid,omitempty"`
	ListURI            string              `json:"listUri"`
	JoinedWeekCount    int64               `json:"joinedWeekCount,omitempty"`
	JoinedAllTimeCount int64               `json:"joinedAllTimeCount,omitempty"`
	Feeds              []*FeedGeneratorDTO `json:"feeds,omitempty"`
	Members            []*ProfileDTO       `json:"members,omitempty"`
	ListItemURI        string              `json:"listItemUri,omitempty"`
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

type ChatMemberDTO struct {
	DID         string `json:"did"`
	Handle      string `json:"handle"`
	DisplayName string `json:"displayName"`
	Avatar      string `json:"avatar,omitempty"`
}

type ChatConvoDTO struct {
	ID                      string          `json:"id"`
	Rev                     string          `json:"rev"`
	Members                 []ChatMemberDTO `json:"members"`
	LastMessage             string          `json:"lastMessage"`
	UnreadCount             int64           `json:"unreadCount"`
	Muted                   bool            `json:"muted"`
	Cursor                  string          `json:"cursor,omitempty"`
	IsGroup                 bool            `json:"isGroup,omitempty"`
	GroupName               string          `json:"groupName,omitempty"`
	LockStatus              string          `json:"lockStatus,omitempty"`
	JoinLinkCode            string          `json:"joinLinkCode,omitempty"`
	JoinLinkEnabled         bool            `json:"joinLinkEnabled,omitempty"`
	JoinLinkRequireApproval bool            `json:"joinLinkRequireApproval,omitempty"`
	JoinRequestCount        int64           `json:"joinRequestCount,omitempty"`
	UnreadJoinRequestCount  int64           `json:"unreadJoinRequestCount,omitempty"`
	MemberCount             int64           `json:"memberCount,omitempty"`
	MemberLimit             int64           `json:"memberLimit,omitempty"`
}

type ChatReactionDTO struct {
	Value     string `json:"value"`
	SenderDID string `json:"senderDid"`
	IsMine    bool   `json:"isMine"`
}

type ChatMessageDTO struct {
	ID                       string            `json:"id"`
	Rev                      string            `json:"rev"`
	Sender                   string            `json:"sender"`
	SenderDID                string            `json:"senderDid"`
	SenderHandle             string            `json:"senderHandle,omitempty"`
	SenderDisplayName        string            `json:"senderDisplayName,omitempty"`
	Text                     string            `json:"text"`
	SentAt                   string            `json:"sentAt"`
	EmbedURI                 string            `json:"embedUri,omitempty"`
	ReplyToMessageID         string            `json:"replyToMessageId,omitempty"`
	ReplyToMessageText       string            `json:"replyToMessageText,omitempty"`
	ReplyToSender            string            `json:"replyToSender,omitempty"`
	ReplyToSenderDID         string            `json:"replyToSenderDid,omitempty"`
	ReplyToSenderHandle      string            `json:"replyToSenderHandle,omitempty"`
	ReplyToSenderDisplayName string            `json:"replyToSenderDisplayName,omitempty"`
	Reactions                []ChatReactionDTO `json:"reactions,omitempty"`
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
	ID          string   `json:"id,omitempty"`
	Value       string   `json:"value"`
	Targets     []string `json:"targets"`
	ActorTarget string   `json:"actorTarget,omitempty"`
	ExpiresAt   string   `json:"expiresAt,omitempty"`
}

type PreferencesDTO struct {
	AdultContentEnabled      bool               `json:"adultContentEnabled"`
	ContentFilters           []ContentFilterDTO `json:"contentFilters"`
	MutedWords               []MutedWordDTO     `json:"mutedWords"`
	PinnedFeeds              []string           `json:"pinnedFeeds"`
	SavedFeeds               []string           `json:"savedFeeds"`
	ThreadSort               string             `json:"threadSort"`
	ThreadPrioritizeFollowed bool               `json:"threadPrioritizeFollowed"`
	HideReplies              bool               `json:"hideReplies"`
	HideReposts              bool               `json:"hideReposts"`
	HideQuotePosts           bool               `json:"hideQuotePosts"`
	HideRepliesByUnfollowed  bool               `json:"hideRepliesByUnfollowed"`
	HiddenPosts              []string           `json:"hiddenPosts"`
	DefaultThreadgateRules   []string           `json:"defaultThreadgateRules"`
	DefaultDisableQuotes     bool               `json:"defaultDisableQuotes"`
	Interests                []string           `json:"interests"`
	HideVerificationBadges   bool               `json:"hideVerificationBadges"`
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

func ExtractImagesFromRecord(record interface{}, authorDID string) ([]string, []*ImageDTO) {
	if record == nil {
		return nil, nil
	}
	bytes, err := json.Marshal(record)
	if err != nil {
		return nil, nil
	}
	var rec struct {
		Embed *struct {
			Type   string `json:"$type"`
			Images []struct {
				Alt   string `json:"alt"`
				Image struct {
					Ref struct {
						Link string `json:"$link"`
					} `json:"ref"`
				} `json:"image"`
				AspectRatio *struct {
					Width  int64 `json:"width"`
					Height int64 `json:"height"`
				} `json:"aspectRatio"`
			} `json:"images"`
			Media *struct {
				Type   string `json:"$type"`
				Images []struct {
					Alt   string `json:"alt"`
					Image struct {
						Ref struct {
							Link string `json:"$link"`
						} `json:"ref"`
					} `json:"image"`
					AspectRatio *struct {
						Width  int64 `json:"width"`
						Height int64 `json:"height"`
					} `json:"aspectRatio"`
				} `json:"images"`
			} `json:"media"`
		} `json:"embed"`
	}
	if err := json.Unmarshal(bytes, &rec); err != nil || rec.Embed == nil {
		return nil, nil
	}

	imagesList := rec.Embed.Images
	if len(imagesList) == 0 && rec.Embed.Media != nil {
		imagesList = rec.Embed.Media.Images
	}
	if len(imagesList) == 0 {
		return nil, nil
	}

	var alts []string
	var images []*ImageDTO
	for _, img := range imagesList {
		alts = append(alts, img.Alt)
		dto := &ImageDTO{
			Alt: img.Alt,
		}
		if img.Image.Ref.Link != "" && authorDID != "" {
			dto.Thumb = fmt.Sprintf("https://cdn.bsky.app/img/feed_thumbnail/plain/%s/%s@jpeg", authorDID, img.Image.Ref.Link)
			dto.Fullsize = fmt.Sprintf("https://cdn.bsky.app/img/feed_fullsize/plain/%s/%s@jpeg", authorDID, img.Image.Ref.Link)
		}
		if img.AspectRatio != nil {
			dto.Width = img.AspectRatio.Width
			dto.Height = img.AspectRatio.Height
		}
		images = append(images, dto)
	}
	return alts, images
}

// Helper para extrair metadados de resposta do Record em CBOR/JSON
func ExtractReplyMetaFromRecord(record interface{}) (bool, string, string, string, string) {
	if record == nil {
		return false, "", "", "", ""
	}
	bytes, err := json.Marshal(record)
	if err != nil {
		return false, "", "", "", ""
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
		return false, "", "", "", ""
	}
	parentURI := meta.Reply.Parent.URI
	parentDID := ""
	if strings.HasPrefix(parentURI, "at://") {
		parts := strings.SplitN(parentURI[5:], "/", 2)
		if len(parts) > 0 {
			parentDID = parts[0]
		}
	}
	rootURI := ""
	rootDID := ""
	if meta.Reply.Root.URI != "" {
		rootURI = meta.Reply.Root.URI
		if strings.HasPrefix(rootURI, "at://") {
			parts := strings.SplitN(rootURI[5:], "/", 2)
			if len(parts) > 0 {
				rootDID = parts[0]
			}
		}
	}
	return true, parentURI, parentDID, rootURI, rootDID
}

// Helper para extrair o alt do vídeo a partir do Record CBOR/JSON
func ExtractQuoteURIFromRecord(record interface{}) string {
	if record == nil {
		return ""
	}
	bytes, err := json.Marshal(record)
	if err != nil {
		return ""
	}
	var obj struct {
		Embed *struct {
			Record *struct {
				URI    string `json:"uri"`
				Record *struct {
					URI string `json:"uri"`
				} `json:"record"`
			} `json:"record"`
		} `json:"embed"`
	}
	if err := json.Unmarshal(bytes, &obj); err != nil || obj.Embed == nil || obj.Embed.Record == nil {
		return ""
	}
	if obj.Embed.Record.URI != "" {
		return obj.Embed.Record.URI
	}
	if obj.Embed.Record.Record != nil && obj.Embed.Record.Record.URI != "" {
		return obj.Embed.Record.Record.URI
	}
	return ""
}

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
			Type  string `json:"$type"`
			Alt   string `json:"alt"`
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
	URI                 string `json:"uri"`
	CID                 string `json:"cid"`
	DID                 string `json:"did"`
	Creator             string `json:"creator"`
	DisplayName         string `json:"displayName"`
	Description         string `json:"description"`
	LikeCount           int64  `json:"likeCount"`
	Avatar              string `json:"avatar"`
	ViewerLike          string `json:"viewerLike,omitempty"`
	AcceptsInteractions bool   `json:"acceptsInteractions,omitempty"`
	IsOnline            bool   `json:"isOnline,omitempty"`
	IsValid             bool   `json:"isValid,omitempty"`
}

type FeedGeneratorResponseDTO struct {
	Cursor string              `json:"cursor"`
	Feeds  []*FeedGeneratorDTO `json:"feeds"`
}

type TrendDTO struct {
	Topic       string   `json:"topic"`
	DisplayName string   `json:"displayName"`
	Description string   `json:"description"`
	Link        string   `json:"link"`
	Category    string   `json:"category"`
	Status      string   `json:"status"`
	PostCount   int64    `json:"postCount"`
	StartedAt   string   `json:"startedAt"`
	Actors      []string `json:"actors"`
}

type TrendListDTO struct {
	Trends []*TrendDTO `json:"trends"`
}

type MuteScopeDTO struct {
	Muted               bool `json:"muted"`
	MutedOnlyReposts    bool `json:"mutedOnlyReposts"`
	MutedOnlyQuoteposts bool `json:"mutedOnlyQuoteposts"`
}

type UpdateInfoDTO struct {
	HasUpdate      bool   `json:"hasUpdate"`
	CurrentVersion string `json:"currentVersion"`
	LatestVersion  string `json:"latestVersion"`
	ReleaseURL     string `json:"releaseUrl"`
}

type ChatGroupJoinLinkDTO struct {
	Code            string `json:"code"`
	CreatedAt       string `json:"createdAt"`
	EnabledStatus   string `json:"enabledStatus"`
	JoinRule        string `json:"joinRule"`
	RequireApproval bool   `json:"requireApproval"`
}

type ChatJoinRequestDTO struct {
	ConvoID     string        `json:"convoId"`
	RequestedAt string        `json:"requestedAt"`
	RequestedBy ChatMemberDTO `json:"requestedBy"`
}

type ChatJoinRequestListDTO struct {
	Cursor   string                `json:"cursor"`
	Requests []*ChatJoinRequestDTO `json:"requests"`
}

type ChatAvailabilityDTO struct {
	CanChat bool          `json:"canChat"`
	ConvoID string        `json:"convoId,omitempty"`
	Convo   *ChatConvoDTO `json:"convo,omitempty"`
}

type SavedAccountDTO struct {
	DID      string `json:"did"`
	Handle   string `json:"handle"`
	IsActive bool   `json:"isActive"`
}

type AppPasswordDTO struct {
	Name       string `json:"name"`
	Password   string `json:"password,omitempty"`
	CreatedAt  string `json:"createdAt"`
	Privileged bool   `json:"privileged"`
}

type AccountStatusDTO struct {
	Activated          bool   `json:"activated"`
	ValidDid           bool   `json:"validDid"`
	RepoCommit         string `json:"repoCommit"`
	RepoRev            string `json:"repoRev"`
	RepoBlocks         int64  `json:"repoBlocks"`
	IndexedRecords     int64  `json:"indexedRecords"`
	PrivateStateValues int64  `json:"privateStateValues"`
	ExpectedBlobs      int64  `json:"expectedBlobs"`
	ImportedBlobs      int64  `json:"importedBlobs"`
}

type DraftDTO struct {
	ID              string   `json:"id"`
	Text            string   `json:"text"`
	Langs           []string `json:"langs,omitempty"`
	SelfLabels      []string `json:"selfLabels,omitempty"`
	ThreadgateAllow []string `json:"threadgateAllow,omitempty"`
	DisableQuotes   bool     `json:"disableQuotes,omitempty"`
	CreatedAt       string   `json:"createdAt"`
	UpdatedAt       string   `json:"updatedAt"`
}

type DraftListDTO struct {
	Cursor string      `json:"cursor"`
	Drafts []*DraftDTO `json:"drafts"`
}

type StarterPackWithMembershipDTO struct {
	StarterPack *StarterPackDTO `json:"starterPack"`
	ListItemURI string          `json:"listItemUri,omitempty"`
	IsMember    bool            `json:"isMember"`
}

type StarterPackMembershipResponseDTO struct {
	Cursor string                          `json:"cursor"`
	Items  []*StarterPackWithMembershipDTO `json:"items"`
}

type RelationshipDTO struct {
	DID        string `json:"did"`
	Following  string `json:"following,omitempty"`
	FollowedBy string `json:"followedBy,omitempty"`
	Blocking   string `json:"blocking,omitempty"`
	BlockedBy  string `json:"blockedBy,omitempty"`
}

type AgeAssuranceStateDTO struct {
	Status          string `json:"status"`
	Access          string `json:"access"`
	LastInitiatedAt string `json:"lastInitiatedAt,omitempty"`
}
