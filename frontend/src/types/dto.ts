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

export interface VideoCaptionDTO {
    lang: string;
    url: string;
}

export interface VideoEmbedDTO {
    playlist: string;
    thumbnail: string;
    alt: string;
    presentation: string;
    captions?: VideoCaptionDTO[];
}

export interface VideoUploadLimitsDTO {
    canUpload: boolean;
    remainingDailyVideos: number;
    remainingDailyBytes: number;
    message?: string;
    error?: string;
}

export interface PostDTO {
    uri: string;
    cid: string;
    authorName: string;
    authorHandle: string;
    authorDid: string;
    authorVerified?: boolean;
    text: string;
    createdAt: string;
    replyCount: number;
    repostCount: number;
    likeCount: number;
    isReply: boolean;
    replyToAuthor: string;
    replyToAuthorName?: string;
    replyToUri: string;
    rootAuthor: string;
    rootAuthorName?: string;
    rootUri: string;
    parentPost: PostDTO | null;
    rootPost: PostDTO | null;
    repostedBy: string;
    repostedByHandle: string;
    quotePost: PostDTO | null;
    quoteDetached?: boolean;
    quoteDetachedUri?: string;
    imageAlts: string[] | null;
    images: ImageDTO[] | null;
    external: ExternalEmbedDTO | null;
    video: VideoEmbedDTO | null;
    hasMedia: boolean;
    labels?: string[];
    viewerLike: string;
    viewerRepost: string;
    viewerBookmark: string;
    viewerThreadMuted?: boolean;
    embeddingDisabled?: boolean;
    replyDisabled?: boolean;
    feedContext?: string;
    isPinned?: boolean;

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
/** A post that was just created, plus the root of the thread it belongs to. */
export interface PostRefDTO {
  uri: string;
  cid: string;
  rootUri: string;
  rootCid: string;
}

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

export interface ActivitySubscriptionDTO {
    post: boolean;
    reply: boolean;
}

export interface ActorStatusDTO {
    status: string;
    uri?: string;
    title?: string;
    description?: string;
    expiresAt?: string;
    isActive: boolean;
}

export interface ProfileLinkDTO {
    uri?: string;
    cid?: string;
    title: string;
    url: string;
}

export interface ProfileDTO {
    did: string;
    handle: string;
    displayName: string;
    description: string;
    avatar: string;
    website?: string;
    links?: ProfileLinkDTO[];
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
    viewerActivitySubscription?: ActivitySubscriptionDTO | null;
    labelerInfo?: LabelerDTO;
    listItemUri?: string;
    verified?: boolean;
    trustedVerifier?: boolean;
    status?: ActorStatusDTO | null;
}

export interface ProfileListDTO {
    cursor: string;
    profiles: ProfileDTO[] | null;
}

export interface FeedGeneratorDTO {
    uri: string;
    cid: string;
    did: string;
    creator: string;
    displayName: string;
    description: string;
    likeCount: number;
    avatar: string;
    viewerLike?: string;
    acceptsInteractions?: boolean;
    isOnline?: boolean;
    isValid?: boolean;
}

export interface FeedGeneratorResponseDTO {
    cursor: string;
    feeds: FeedGeneratorDTO[] | null;
}

export interface StarterPackDTO {
    uri: string;
    cid: string;
    name: string;
    description: string;
    creator: string;
    creatorDid?: string;
    listUri: string;
    joinedWeekCount?: number;
    joinedAllTimeCount?: number;
    feeds?: FeedGeneratorDTO[];
    members?: ProfileDTO[];
    listItemUri?: string;
}

export interface StarterPackResponseDTO {
    cursor: string;
    starterPacks: StarterPackDTO[] | null;
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
    replyParentUri?: string;
    replyParentAuthorDid?: string;
    replyParentAuthorHandle?: string;
    replyParentAuthorName?: string;
}

export interface NotificationListDTO {
    cursor: string;
    notifications: NotificationDTO[] | null;
}

export interface NotificationFilterablePrefDTO {
    include: string;
    list: boolean;
    push: boolean;
}

export interface NotificationChatPrefDTO {
    include: string;
    push: boolean;
}

export interface NotificationSimplePrefDTO {
    list: boolean;
    push: boolean;
}

export interface NotificationPreferencesDTO {
    priority: boolean;
    chat: NotificationChatPrefDTO;
    follow: NotificationFilterablePrefDTO;
    like: NotificationFilterablePrefDTO;
    likeViaRepost: NotificationFilterablePrefDTO;
    mention: NotificationFilterablePrefDTO;
    quote: NotificationFilterablePrefDTO;
    reply: NotificationFilterablePrefDTO;
    repost: NotificationFilterablePrefDTO;
    repostViaRepost: NotificationFilterablePrefDTO;
    starterpackJoined: NotificationSimplePrefDTO;
    subscribedPost: NotificationSimplePrefDTO;
    unverified: NotificationSimplePrefDTO;
    verified: NotificationSimplePrefDTO;
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
    releaseUrl?: string;
    releaseURL?: string;
}

export interface ChatMemberDTO {
    did: string;
    handle: string;
    displayName: string;
    avatar?: string;
}

export interface ChatReactionDTO {
    value: string;
    senderDid: string;
    isMine: boolean;
}

export interface ChatMessageDTO {
    id: string;
    rev: string;
    sender: string;
    senderDid: string;
    senderHandle?: string;
    senderDisplayName?: string;
    text: string;
    sentAt: string;
    embedUri?: string;
    replyToMessageId?: string;
    replyToMessageText?: string;
    replyToSender?: string;
    replyToSenderDid?: string;
    replyToSenderHandle?: string;
    replyToSenderDisplayName?: string;
    reactions?: ChatReactionDTO[];
}

export interface ChatConvoDTO {
    id: string;
    rev: string;
    members: ChatMemberDTO[];
    lastMessage: string;
    unreadCount: number;
    muted?: boolean;
    cursor?: string;
    isGroup?: boolean;
    groupName?: string;
    lockStatus?: string;
    joinLinkCode?: string;
    joinLinkEnabled?: boolean;
    joinLinkRequireApproval?: boolean;
    joinRequestCount?: number;
    unreadJoinRequestCount?: number;
    memberCount?: number;
    memberLimit?: number;
}

export interface ChatMessagesDTO {
    cursor: string;
    messages: ChatMessageDTO[] | null;
}

export interface ChatGroupJoinLinkDTO {
    code: string;
    createdAt: string;
    enabledStatus: string;
    joinRule: string;
    requireApproval: boolean;
}

export interface ChatJoinRequestDTO {
    convoId: string;
    requestedAt: string;
    requestedBy: ChatMemberDTO;
}

export interface ChatJoinRequestListDTO {
    cursor: string;
    requests: ChatJoinRequestDTO[] | null;
}

export interface ChatAvailabilityDTO {
    canChat: boolean;
    convoId?: string;
    convo?: ChatConvoDTO;
}

export interface SavedAccountDTO {
    did: string;
    handle: string;
    isActive: boolean;
}

export interface AppPasswordDTO {
    name: string;
    password?: string;
    createdAt: string;
    privileged: boolean;
}

export interface AccountStatusDTO {
    activated: boolean;
    validDid: boolean;
    repoCommit: string;
    repoRev: string;
    repoBlocks: number;
    indexedRecords: number;
    privateStateValues: number;
    expectedBlobs: number;
    importedBlobs: number;
}

export interface DraftDTO {
    id: string;
    text: string;
    langs?: string[];
    selfLabels?: string[];
    threadgateAllow?: string[];
    disableQuotes?: boolean;
    createdAt: string;
    updatedAt: string;
}

export interface DraftListDTO {
    cursor: string;
    drafts: DraftDTO[] | null;
}

export interface ListDTO {
    uri: string;
    cid: string;
    name: string;
    purpose: string;
    description: string;
    creator: string;
    creatorDid?: string;
    creatorHandle?: string;
    avatar?: string;
    listItemCount?: number;
    viewerMuted?: boolean;
    viewerBlock?: string;
    viewerSubscribed?: boolean;
}

export interface ListResponseDTO {
    cursor: string;
    lists: ListDTO[] | null;
}

export interface ListWithMembershipDTO {
    list: ListDTO;
    listItemUri?: string;
    isMember: boolean;
}

export interface ListMembershipResponseDTO {
    cursor: string;
    items: ListWithMembershipDTO[] | null;
}

export interface StarterPackWithMembershipDTO {
    starterPack: StarterPackDTO;
    listItemUri?: string;
    isMember: boolean;
}

export interface StarterPackMembershipResponseDTO {
    cursor: string;
    items: StarterPackWithMembershipDTO[] | null;
}

export interface RelationshipDTO {
    did: string;
    following?: string;
    followedBy?: string;
    blocking?: string;
    blockedBy?: string;
}

export interface AgeAssuranceStateDTO {
    status: string;
    access: string;
    lastInitiatedAt?: string;
}

export interface MutedWordDTO {
    id?: string;
    value: string;
    targets: string[];
    actorTarget?: string;
    expiresAt?: string;
}

export interface ContentFilterDTO {
    labelerDid?: string;
    label: string;
    visibility: string;
}

export interface PreferencesDTO {
    adultContentEnabled: boolean;
    contentFilters?: ContentFilterDTO[];
    mutedWords?: MutedWordDTO[];
    savedFeeds?: string[];
    pinnedFeeds?: string[];
    threadSort?: string;
    threadPrioritizeFollowed?: boolean;
    hideReplies?: boolean;
    hideReposts?: boolean;
    hideQuotePosts?: boolean;
    hideRepliesByUnfollowed?: boolean;
    hiddenPosts?: string[];
    defaultDisableQuotes?: boolean;
    defaultThreadgateRules?: string[];
    interests?: string[];
    hideVerificationBadges?: boolean;
}


