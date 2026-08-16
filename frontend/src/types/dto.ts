/**
 * TypeScript mirrors of the DTOs the Go services return (see services/models.go).
 *
 * These replace `any` at the boundary between the Wails bindings and the UI, so
 * a renamed or removed field is a compile error instead of `undefined` on
 * screen.
 */

export interface ImageDTO {
    thumb: string;
    fullsize: string;
    alt: string;
    width?: number;
    height?: number;
}

export interface ExternalEmbedDTO {
    uri: string;
    title: string;
    description: string;
    thumb: string;
}

export interface VideoEmbedDTO {
    playlist: string;
    thumbnail: string;
    alt: string;
    presentation: string;
}

export interface PostDTO {
    uri: string;
    cid: string;
    authorName: string;
    authorHandle: string;
    authorDid: string;
    text: string;
    createdAt: string;
    replyCount: number;
    repostCount: number;
    likeCount: number;
    isReply: boolean;
    replyToAuthor: string;
    replyToUri: string;
    rootAuthor: string;
    rootUri: string;
    parentPost: PostDTO | null;
    repostedBy: string;
    repostedByHandle: string;
    quotePost: PostDTO | null;
    imageAlts: string[] | null;
    images: ImageDTO[] | null;
    external: ExternalEmbedDTO | null;
    video: VideoEmbedDTO | null;
    hasMedia: boolean;
    viewerLike: string;
    viewerRepost: string;
    viewerBookmark: string;

    /** Present only on notification-derived posts. */
    indexedAt?: string;
    isRepostOfRepost?: boolean;
}

/**
 * What the post renderer actually accepts.
 *
 * Feeds deliver a full PostDTO, but the notifications view synthesises posts
 * from notification records and can only fill in some fields. The renderer
 * guards every optional field, so this models the real contract.
 */
export type PostView = Partial<PostDTO> & Pick<PostDTO, 'uri' | 'cid' | 'authorHandle'>;

export interface FeedDTO {
    cursor: string;
    posts: PostDTO[] | null;
    debugMessage?: string;
}

export interface LabelerPolicyDTO {
    identifier: string;
    severity: string;
    blurs: string;
    defaultSetting: string;
    adultOnly: boolean;
    title: string;
    description: string;
}

export interface LabelerDTO {
    did: string;
    handle: string;
    displayName: string;
    description: string;
    avatar: string;
    banner: string;
    likeCount: number;
    isSubscribed: boolean;
    viewerLike: string;
    indexedAt: string;
    policies: LabelerPolicyDTO[] | null;
}

export interface ProfileDTO {
    did: string;
    handle: string;
    displayName: string;
    description: string;
    avatar: string;
    followersCount: number;
    followsCount: number;
    postsCount: number;
    viewerFollowing: string;
    viewerFollowedBy: string;
    viewerMuted: boolean;
    viewerBlocking: string;
    viewerBlockedBy: boolean;
    pinnedPostUri: string;
    isMe: boolean;
    isLabeler: boolean;
    viewerSubscribedLabeler: boolean;
    labelerInfo?: LabelerDTO;
}

export interface ProfileListDTO {
    cursor: string;
    profiles: ProfileDTO[] | null;
}

export interface NotificationDTO {
    uri: string;
    cid: string;
    authorDid: string;
    authorName: string;
    authorHandle: string;
    reason: string;
    indexedAt: string;
    text: string;
    reasonSubject: string;
    hasMedia: boolean;
    video: VideoEmbedDTO | null;
    quoteAuthorName?: string;
    quoteAuthorHandle?: string;
    quoteText?: string;
    quoteUri?: string;
    hydratedPost?: PostDTO;
}

export interface NotificationListDTO {
    cursor: string;
    notifications: NotificationDTO[] | null;
}

export interface SavedFeedDTO {
    uri: string;
    cid: string;
    displayName: string;
    creator: string;
    pinned: boolean;
}

export interface TrendDTO {
    topic: string;
    displayName: string;
    description: string;
    link: string;
    category: string;
    status: string;
    postCount: number;
    startedAt: string;
    actors: string[] | null;
}

export interface TrendListDTO {
    trends: TrendDTO[] | null;
}

export interface MuteScopeDTO {
    muted: boolean;
    mutedOnlyReposts: boolean;
    mutedOnlyQuoteposts: boolean;
}

export interface UpdateInfoDTO {
    hasUpdate: boolean;
    currentVersion: string;
    latestVersion: string;
    releaseURL: string;
}
