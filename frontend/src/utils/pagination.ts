import { state } from '../config/state.js';

/**
 * Hard ceiling on how many pages a focus restore may re-fetch, so a user sitting
 * very deep in a feed cannot turn one reload into an unbounded burst of requests.
 */
export const MAX_RESTORE_PAGES = 12;

/**
 * How many pages of a tab are currently loaded.
 *
 * Reads back the counter the loaders keep in `tabStates`, which is what a later
 * reload uses as its re-fetch budget.
 */
export function pagesLoadedFor(tab: string): number {
    return state.tabStates[tab]?.pagesLoaded ?? 0;
}

/** Records that a page of `tab` was just fetched. */
export function markPageLoaded(tab: string): void {
    const ts = state.tabStates[tab];
    if (ts) ts.pagesLoaded = (ts.pagesLoaded ?? 0) + 1;
}

/** Clears the page counter, for the start of a fresh load. */
export function resetPagesLoaded(tab: string): void {
    const ts = state.tabStates[tab];
    if (ts) ts.pagesLoaded = 0;
}

interface RestoreOptions {
    /** Tab whose page counter bounds the re-fetching. */
    tab: string;
    /** URI of the item the user was on before the reload. */
    targetUri: string;
    /** How many pages were loaded before the reload; the re-fetch budget. */
    pagesBefore: number;
    /** Fetches and appends one more page into `state.currentPosts`. */
    loadMore: () => Promise<void>;
    /** Whether another page exists (i.e. the tab still holds a cursor). */
    hasMore: () => boolean;
}

/**
 * Puts focus back on the item the user was reading before a reload.
 *
 * A reload only rebuilds the first page, so anything the user had reached
 * through "load more" is simply not in the DOM yet and the naive lookup misses,
 * dumping them at the top of the feed. This keeps pulling pages — never more
 * than were loaded before, and never more than {@link MAX_RESTORE_PAGES} — until
 * the item shows up again.
 *
 * Returns whether focus was restored.
 */
export async function restoreFocusAfterReload(opts: RestoreOptions): Promise<boolean> {
    if (!opts.targetUri) return false;

    const findTarget = () => state.currentPosts.findIndex(p => p.dataset.uri === opts.targetUri);

    let idx = findTarget();
    // One page of slack: posts published since the reload push the target down,
    // so it can sit just past the boundary it used to be inside of.
    const budget = Math.min(Math.max(opts.pagesBefore + 1, 1), MAX_RESTORE_PAGES);

    while (idx < 0 && pagesLoadedFor(opts.tab) < budget && opts.hasMore()) {
        const pagesBeforeCall = pagesLoadedFor(opts.tab);
        await opts.loadMore();
        // No page actually landed — the request failed, or the feed ran dry —
        // so stop instead of spinning on the same cursor. A page that arrives
        // but renders nothing (all of it filtered out) still counts, and the
        // loop moves on to the next one.
        if (pagesLoadedFor(opts.tab) === pagesBeforeCall) break;
        idx = findTarget();
    }

    if (idx < 0) return false;
    state.focusedPostIndex = idx;
    state.currentPosts[idx].focus();
    return true;
}
