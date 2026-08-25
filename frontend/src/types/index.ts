export interface TabState {
    posts: HTMLElement[];
    focusedIndex: number;
    loaded: boolean;
    lastHandle?: string;
    /**
     * How many pages the tab has fetched. A full reload starts over at page one,
     * so this is the budget for re-fetching far enough to find the post the user
     * was on instead of dropping them at the top of the feed.
     */
    pagesLoaded: number;
}
