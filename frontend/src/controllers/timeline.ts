import { state } from '../config/state';
import { announcePolite, announceAssertive } from '../utils/a11y';
import { createPostArticle, cleanupContainerVideos, bindContainerVideos } from '../components/post';
import { i18n } from '../utils/i18n';
import { markPageLoaded, pagesLoadedFor, resetPagesLoaded, restoreFocusAfterReload, restoreKeyOf } from '../utils/pagination';
import type { PostDTO } from '../types/dto';

const TIMELINE_PAGE_LIMIT = 40;

/** Fetches the next page of the active feed and appends it. Returns how many articles it added. */
async function fetchTimelinePage(container: HTMLDivElement): Promise<number> {
  let res;
  if (state.currentFeedUri === "") {
      res = await window.go.services.FeedService.GetTimeline(state.timelineCursor, TIMELINE_PAGE_LIMIT);
  } else {
      res = await window.go.services.FeedService.GetCustomFeed(state.currentFeedUri, state.timelineCursor, TIMELINE_PAGE_LIMIT);
  }
  if (!res) return 0;
  markPageLoaded('timeline');
  state.timelineCursor = res.cursor || "";
  if (!res.posts) return 0;

  let addedCount = 0;
  const groups = new Map<string, PostDTO[]>();
  const groupOrder: string[] = [];
  const seenUris = new Set<string>();
  for (const existing of state.currentPosts) {
      const uri = existing.dataset.uri;
      if (uri) seenUris.add(uri);
  }

  res.posts.forEach((post: PostDTO) => {
      if (state.feedViewHideReposts && post.repostedBy) return;
      if (state.feedViewHideQuotePosts && post.quotePost) return;
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
      group.sort((a: PostDTO, b: PostDTO) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

      group.forEach((post: PostDTO, idx: number) => {
          if (!seenUris.has(post.uri)) {
              if (idx === 0 && !post.repostedBy) {
                  if (post.rootPost && !seenUris.has(post.rootPost.uri)) {
                      const rootArticle = createPostArticle(post.rootPost, state.currentPosts.length);
                      if (rootArticle) {
                          rootArticle.classList.add('thread-parent');
                          container.appendChild(rootArticle);
                          state.currentPosts.push(rootArticle);
                          seenUris.add(post.rootPost.uri);
                          addedCount++;
                      }
                  }

                  if (post.parentPost &&
                      (!post.rootPost || post.parentPost.uri !== post.rootPost.uri) &&
                      !seenUris.has(post.parentPost.uri)) {
                      const parentArticle = createPostArticle(post.parentPost, state.currentPosts.length);
                      if (parentArticle) {
                          parentArticle.classList.add('thread-child');
                          container.appendChild(parentArticle);
                          state.currentPosts.push(parentArticle);
                          seenUris.add(post.parentPost.uri);
                          addedCount++;
                      }
                  }
              }

              const article = createPostArticle(post, state.currentPosts.length);
              if (article) {
                  if (post.rootPost || post.parentPost || idx > 0) article.classList.add('thread-child');
                  container.appendChild(article);
                  state.currentPosts.push(article);
                  seenUris.add(post.uri);
                  addedCount++;
              }
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
            if (!document.querySelector('dialog[open]')) {
                state.currentPosts[0].focus();
            }
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
