import test from 'node:test';
import assert from 'node:assert/strict';

import { state } from '../config/state.js';
import {
    MAX_RESTORE_PAGES,
    markPageLoaded,
    pagesLoadedFor,
    resetPagesLoaded,
    restoreFocusAfterReload,
    restoreKeyOf,
} from './pagination.js';

/** A stand-in for a rendered post article: just the bits the restore logic touches. */
function fakeArticle(uri: string, onFocus: (uri: string) => void) {
    return { dataset: { uri }, focus: () => onFocus(uri) } as unknown as HTMLElement;
}

/**
 * Models a feed the loaders page through: `pageSize` posts per page, appended to
 * `state.currentPosts` and counted against the tab's page counter, exactly as
 * the real loaders do.
 */
function fakeFeed(totalPosts: number, pageSize: number, focused: string[]) {
    let served = 0;
    return {
        get fetches() { return Math.ceil(served / pageSize); },
        hasMore: () => served < totalPosts,
        loadPage: async () => {
            if (served >= totalPosts) return;
            const end = Math.min(served + pageSize, totalPosts);
            for (; served < end; served++) {
                state.currentPosts.push(fakeArticle(`at://post/${served}`, u => focused.push(u)));
            }
            markPageLoaded('timeline');
        },
    };
}

function reset() {
    state.currentPosts = [];
    state.focusedPostIndex = -1;
    resetPagesLoaded('timeline');
}

test('page counter tracks loads and resets', () => {
    reset();
    assert.equal(pagesLoadedFor('timeline'), 0);
    markPageLoaded('timeline');
    markPageLoaded('timeline');
    assert.equal(pagesLoadedFor('timeline'), 2);
    resetPagesLoaded('timeline');
    assert.equal(pagesLoadedFor('timeline'), 0);
    // An unknown tab must not throw, and reads as zero.
    assert.equal(pagesLoadedFor('nope'), 0);
});

test('restores focus without paging when the target is on the first page', async () => {
    reset();
    const focused: string[] = [];
    const feed = fakeFeed(500, 100, focused);
    await feed.loadPage();

    const ok = await restoreFocusAfterReload({
        tab: 'timeline',
        targetUri: 'at://post/42',
        pagesBefore: 3,
        hasMore: feed.hasMore,
        loadMore: feed.loadPage,
    });

    assert.equal(ok, true);
    assert.equal(feed.fetches, 1, 'no extra page should be fetched');
    assert.deepEqual(focused, ['at://post/42']);
    assert.equal(state.focusedPostIndex, 42);
});

test('pages forward to reach a target the user had scrolled to', async () => {
    reset();
    const focused: string[] = [];
    const feed = fakeFeed(500, 100, focused);
    await feed.loadPage();

    // The post sat on page 3 before the reload, which only rebuilt page 1.
    const ok = await restoreFocusAfterReload({
        tab: 'timeline',
        targetUri: 'at://post/250',
        pagesBefore: 3,
        hasMore: feed.hasMore,
        loadMore: feed.loadPage,
    });

    assert.equal(ok, true);
    assert.equal(feed.fetches, 3);
    assert.deepEqual(focused, ['at://post/250']);
    assert.equal(state.focusedPostIndex, 250);
});

test('one page of slack absorbs posts published since the reload', async () => {
    reset();
    const focused: string[] = [];
    const feed = fakeFeed(500, 100, focused);
    await feed.loadPage();

    // The target used to be the last item of page 2; new posts pushed it onto
    // page 3, one past the budget the old page count alone would allow.
    const ok = await restoreFocusAfterReload({
        tab: 'timeline',
        targetUri: 'at://post/201',
        pagesBefore: 2,
        hasMore: feed.hasMore,
        loadMore: feed.loadPage,
    });

    assert.equal(ok, true);
    assert.equal(feed.fetches, 3);
    assert.equal(state.focusedPostIndex, 201);
});

test('gives up within budget when the target is gone', async () => {
    reset();
    const focused: string[] = [];
    const feed = fakeFeed(500, 100, focused);
    await feed.loadPage();

    const ok = await restoreFocusAfterReload({
        tab: 'timeline',
        targetUri: 'at://post/deleted',
        pagesBefore: 2,
        hasMore: feed.hasMore,
        loadMore: feed.loadPage,
    });

    assert.equal(ok, false);
    assert.equal(feed.fetches, 3, 'budget is pagesBefore plus one page of slack');
    assert.deepEqual(focused, [], 'nothing should be focused, so the caller can fall back');
    assert.equal(state.focusedPostIndex, -1);
});

test('never pages past the hard ceiling', async () => {
    reset();
    const focused: string[] = [];
    const feed = fakeFeed(10000, 100, focused);
    await feed.loadPage();

    const ok = await restoreFocusAfterReload({
        tab: 'timeline',
        targetUri: 'at://post/9999',
        pagesBefore: 500,
        hasMore: feed.hasMore,
        loadMore: feed.loadPage,
    });

    assert.equal(ok, false);
    assert.equal(feed.fetches, MAX_RESTORE_PAGES);
});

test('stops at the end of the feed instead of spinning', async () => {
    reset();
    const focused: string[] = [];
    const feed = fakeFeed(150, 100, focused);
    await feed.loadPage();

    const ok = await restoreFocusAfterReload({
        tab: 'timeline',
        targetUri: 'at://post/999',
        pagesBefore: 8,
        hasMore: feed.hasMore,
        loadMore: feed.loadPage,
    });

    assert.equal(ok, false);
    assert.equal(feed.fetches, 2, 'only the two pages that exist');
});

test('stops when a page fails to land rather than retrying the same cursor', async () => {
    reset();
    let calls = 0;
    await (async () => {
        state.currentPosts.push(fakeArticle('at://post/0', () => {}));
        markPageLoaded('timeline');
    })();

    const ok = await restoreFocusAfterReload({
        tab: 'timeline',
        targetUri: 'at://post/500',
        pagesBefore: 6,
        hasMore: () => true,
        // Mimics a loader whose fetch failed: it swallows the error and returns
        // without recording a page.
        loadMore: async () => { calls++; },
    });

    assert.equal(ok, false);
    assert.equal(calls, 1, 'a page that never lands must not be retried in a loop');
});

test('does nothing without a target', async () => {
    reset();
    let calls = 0;
    const ok = await restoreFocusAfterReload({
        tab: 'timeline',
        targetUri: '',
        pagesBefore: 5,
        hasMore: () => true,
        loadMore: async () => { calls++; },
    });

    assert.equal(ok, false);
    assert.equal(calls, 0);
    assert.equal(state.focusedPostIndex, -1);
});

/**
 * A notification row. Several rows can concern the same subject post, so the
 * uri alone does not identify one; `restoreKey` does.
 */
function fakeNotifRow(uri: string, restoreKey: string, onFocus: (key: string) => void) {
    return { dataset: { uri, restoreKey }, focus: () => onFocus(restoreKey) } as unknown as HTMLElement;
}

test('restoreKeyOf prefers the explicit key and falls back to the uri', () => {
    assert.equal(restoreKeyOf(fakeArticle('at://post/1', () => {})), 'at://post/1');
    assert.equal(restoreKeyOf(fakeNotifRow('at://post/1', 'like:at://post/1', () => {})), 'like:at://post/1');
    assert.equal(restoreKeyOf(undefined), '');
    assert.equal(restoreKeyOf({ dataset: {} } as unknown as HTMLElement), '');
});

test('tells apart notification rows that share a subject post', async () => {
    reset();
    const focused: string[] = [];
    // Both rows are about the same post of ours: one groups the reposts, the
    // other the likes. Matching on the uri cannot choose between them.
    state.currentPosts = [
        fakeNotifRow('at://post/1', 'repost:at://post/1', k => focused.push(k)),
        fakeNotifRow('at://post/1', 'like:at://post/1', k => focused.push(k)),
    ];
    markPageLoaded('timeline');

    const restored = await restoreFocusAfterReload({
        tab: 'timeline',
        targetUri: 'like:at://post/1',
        pagesBefore: 1,
        hasMore: () => false,
        loadMore: async () => { throw new Error('must not page: the row is already here'); },
    });

    assert.equal(restored, true);
    assert.equal(state.focusedPostIndex, 1);
    assert.deepEqual(focused, ['like:at://post/1']);
});

test('does not page back through history for a row already on the first page', async () => {
    reset();
    const focused: string[] = [];
    let pagesFetched = 0;

    // The row the user was on is present, but an older row about the same post
    // sits further down. Identity has to stop the search here.
    state.currentPosts = [
        fakeNotifRow('at://post/9', 'like:at://post/9', k => focused.push(k)),
        fakeNotifRow('at://post/9', 'repost:at://post/9', k => focused.push(k)),
    ];
    markPageLoaded('timeline');

    const restored = await restoreFocusAfterReload({
        tab: 'timeline',
        targetUri: 'like:at://post/9',
        pagesBefore: 6,
        hasMore: () => true,
        loadMore: async () => { pagesFetched++; markPageLoaded('timeline'); },
    });

    assert.equal(restored, true);
    assert.equal(pagesFetched, 0, 'refetching pages is what dragged focus into the past');
    assert.deepEqual(focused, ['like:at://post/9']);
});
