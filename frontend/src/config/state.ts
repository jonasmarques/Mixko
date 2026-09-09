import { TabState } from '../types/index.js';

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
    mutedWordsBehavior: 'hide' as 'hide' | 'warn',
    adultContentCache: false,
    dateFormat: 'relative' as 'relative' | 'exact',
    nameDisplayFormat: 'name' as 'name' | 'nameAndHandle' | 'handle',
    notificationFormat: 'combined' as 'combined' | 'individual',
    fontSize: 'normal' as 'normal' | 'large' | 'x-large' | 'huge',
    tabStates: {
        timeline: { posts: [], focusedIndex: -1, loaded: false, pagesLoaded: 0 },
        notifications: { posts: [], focusedIndex: -1, loaded: false, pagesLoaded: 0 },
        profile: { posts: [], focusedIndex: -1, loaded: false, pagesLoaded: 0 },
        chat: { posts: [], focusedIndex: -1, loaded: false, pagesLoaded: 0 },
        feeds: { posts: [], focusedIndex: -1, loaded: false, pagesLoaded: 0 },
        saved: { posts: [], focusedIndex: -1, loaded: false, pagesLoaded: 0 },
        search: { posts: [], focusedIndex: -1, loaded: false, pagesLoaded: 0 },
        settings: { posts: [], focusedIndex: -1, loaded: false, pagesLoaded: 0 },
        lists: { posts: [], focusedIndex: -1, loaded: false, pagesLoaded: 0 }
    } as Record<string, TabState>
};
