import { TabState } from '../types';

export const state = {
    isAppReady: false,
    currentPosts: [] as HTMLElement[],
    focusedPostIndex: -1,
    loggedInHandle: "",
    // The DID is the stable identity; display names and handles are not
    // trustworthy for ownership checks.
    loggedInDid: "",
    currentHandle: "",
    currentTab: 'timeline' as 'timeline' | 'notifications' | 'profile' | 'chat' | 'feeds' | 'saved' | 'search' | 'settings' | 'lists',
    composeMode: 'post' as 'post' | 'reply' | 'quote',
    composeTarget: null as {uri: string, cid: string, authorHandle?: string} | null,
    timelineCursor: "",
    profileCursor: "",
    notificationsCursor: "",
    chatCursor: "",
    savedCursor: "",
    listsCursor: "",
    autoUpdateInterval: null as number | null,
    activeConvoId: "",
    hideReplies: false,
    showOnlyMentions: false,
    savedFeeds: [] as any[],
    currentFeedUri: "",
    discoverFeedSearchQuery: "",
    feedsTabMode: 'saved' as 'saved' | 'lists' | 'discover' | 'trending',
    profileTabMode: 'posts' as 'posts' | 'replies' | 'media' | 'likes' | 'lists' | 'starterPacks' | 'followers' | 'following',
    mutedWordsCache: [] as string[],
    adultContentCache: false,
    dateFormat: 'relative' as 'relative' | 'exact',
    nameDisplayFormat: 'name' as 'name' | 'nameAndHandle' | 'handle',
    notificationFormat: 'combined' as 'combined' | 'individual',
    fontSize: 'normal' as 'normal' | 'large' | 'x-large' | 'huge',
    tabStates: {
        timeline: { posts: [], focusedIndex: -1, loaded: false },
        notifications: { posts: [], focusedIndex: -1, loaded: false },
        profile: { posts: [], focusedIndex: -1, loaded: false },
        chat: { posts: [], focusedIndex: -1, loaded: false },
        feeds: { posts: [], focusedIndex: -1, loaded: false },
        saved: { posts: [], focusedIndex: -1, loaded: false },
        search: { posts: [], focusedIndex: -1, loaded: false },
        settings: { posts: [], focusedIndex: -1, loaded: false },
        lists: { posts: [], focusedIndex: -1, loaded: false }
    } as Record<string, TabState>
};
