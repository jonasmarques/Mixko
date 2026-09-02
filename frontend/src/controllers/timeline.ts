import { state } from '../config/state';
import { announcePolite, announceAssertive } from '../utils/a11y';
import { createPostArticle, cleanupContainerVideos, bindContainerVideos } from '../components/post';
import { i18n } from '../utils/i18n';
import { markPageLoaded, pagesLoadedFor, resetPagesLoaded, restoreFocusAfterReload, restoreKeyOf } from '../utils/pagination';

/** Fetches the next page of the active feed and appends it. Returns how many articles it added. */
async function fetchTimelinePage(container: HTMLDivElement): Promise<number> {
  let res;
  if (state.currentFeedUri === "") {
      res = await window.go.services.FeedService.GetTimeline(state.timelineCursor, 100);
  } else {
      res = await window.go.services.FeedService.GetCustomFeed(state.currentFeedUri, state.timelineCursor, 100);
  }
  if (!res) return 0;
  markPageLoaded('timeline');
  state.timelineCursor = res.cursor || "";
  if (!res.posts) return 0;

  let addedCount = 0;
  const groups = new Map<string, any[]>();
  const groupOrder: string[] = [];

  res.posts.forEach((post: any) => {
      if (state.hideReplies && post.isReply) {
          const isSelfReply = post.authorHandle === post.replyToAuthor || post.authorDid === post.replyToAuthor;
          const rootIsOther = post.rootAuthor && post.rootAuthor !== post.authorHandle && post.rootAuthor !== post.authorDid;
          if (!isSelfReply || rootIsOther) return;
      }
      const root = post.repostedBy ? post.uri + "-repost-" + post.repostedBy : (post.rootUri || post.uri) + "-" + post.authorHandle;
      if (!groups.has(root)) {
          groups.set(root, []);
          groupOrder.push(root);
      }
      groups.get(root)!.push(post);
  });

  groupOrder.forEach(root => {
      const group = groups.get(root)!;
      group.sort((a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

      group.forEach((post: any, idx: number) => {
          if (!state.currentPosts.some(p => p.dataset.uri === post.uri)) {
              if (idx === 0 && !post.repostedBy) {
                  if (post.rootPost && !state.currentPosts.some(p => p.dataset.uri === post.rootPost.uri)) {
                      const rootArticle = createPostArticle(post.rootPost, state.currentPosts.length);
                      rootArticle.classList.add('thread-parent');
                      container.appendChild(rootArticle);
                      state.currentPosts.push(rootArticle);
                      addedCount++;
                  }

                  if (post.parentPost &&
                      (!post.rootPost || post.parentPost.uri !== post.rootPost.uri) &&
                      !state.currentPosts.some(p => p.dataset.uri === post.parentPost.uri)) {
                      const parentArticle = createPostArticle(post.parentPost, state.currentPosts.length);
                      parentArticle.classList.add('thread-child');
                      container.appendChild(parentArticle);
                      state.currentPosts.push(parentArticle);
                      addedCount++;
                  }
              }

              const article = createPostArticle(post, state.currentPosts.length);
              if (post.rootPost || post.parentPost || idx > 0) article.classList.add('thread-child');
              container.appendChild(article);
              state.currentPosts.push(article);
              addedCount++;
          }
      });
  });

  return addedCount;
}

export async function loadTimeline(loadMore = false, keepFocus = false) {
  if (loadMore && state.timelineCursor === "") {
    announcePolite(i18n.t('timeline.endOfFeed'));
    return;
  }
  const container = document.getElementById('feed-items') as HTMLDivElement;
  container.setAttribute('aria-busy', 'true');

  let targetUri = "";
  let pagesBefore = 0;
  if (!loadMore && keepFocus && state.focusedPostIndex >= 0 && state.focusedPostIndex < state.currentPosts.length) {
    targetUri = restoreKeyOf(state.currentPosts[state.focusedPostIndex]);
    pagesBefore = pagesLoadedFor('timeline');
  }

  // A fresh load renders into a detached node and swaps it in once the page
  // has actually arrived. Clearing the feed up front left it blank for the
  // whole request, and empty for good whenever the request failed.
  const previousPosts = state.currentPosts;
  const previousCursor = state.timelineCursor;
  const staging = loadMore ? container : document.createElement('div');

  if (!loadMore) {
    state.timelineCursor = "";
    resetPagesLoaded('timeline');
    state.currentPosts = [];
  }
  try {
    let addedCount = await fetchTimelinePage(staging);

    // Hiding replies can strip a page down to almost nothing, so top it up
    // before handing the feed over.
    for (let depth = 1; state.hideReplies && addedCount < 25 && state.timelineCursor !== "" && depth < 3; depth++) {
        addedCount = await fetchTimelinePage(staging);
    }

    if (!loadMore) {
      cleanupContainerVideos(container);
      container.replaceChildren(...staging.childNodes);
      bindContainerVideos(container);
    }

    state.tabStates['timeline'].loaded = true;
    const hiddenRepliesText = state.hideReplies ? i18n.t('timeline.hiddenReplies') : '';
    announcePolite(i18n.t('timeline.feedLoaded', { count: state.currentPosts.length.toString(), hiddenReplies: hiddenRepliesText }));
    if (!loadMore && state.currentPosts.length > 0) {
        const restored = await restoreFocusAfterReload({
            tab: 'timeline',
            targetUri,
            pagesBefore,
            hasMore: () => state.timelineCursor !== "",
            loadMore: async () => { await fetchTimelinePage(container); }
        });
        if (!restored) {
            state.focusedPostIndex = 0;
            state.currentPosts[0].focus();
        }
    }
  } catch (err: any) {
    console.error(err);
    // The feed on screen was never touched, so put the bookkeeping back with
    // it rather than leaving the state describing a load that did not happen.
    if (!loadMore) {
      state.currentPosts = previousPosts;
      state.timelineCursor = previousCursor;
    }
    announceAssertive(i18n.t('timeline.loadError'));
  }
  finally { container.setAttribute('aria-busy', 'false'); }
}
