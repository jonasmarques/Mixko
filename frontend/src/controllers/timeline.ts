import { state } from '../config/state';
import { announcePolite, announceAssertive } from '../utils/a11y';
import { createPostArticle } from '../components/post';
import { i18n } from '../utils/i18n';

export async function loadTimeline(loadMore = false, keepFocus = false, fetchDepth = 1) {
  if (loadMore && state.timelineCursor === "") {
    announcePolite(i18n.t('timeline.endOfFeed'));
    return;
  }
  const container = document.getElementById('feed-items') as HTMLDivElement;
  container.setAttribute('aria-busy', 'true');
  
  let targetUri = "";
  if (!loadMore && keepFocus && state.focusedPostIndex >= 0 && state.focusedPostIndex < state.currentPosts.length) {
    targetUri = state.currentPosts[state.focusedPostIndex]?.dataset.uri || "";
  }

  if (!loadMore) {
    state.timelineCursor = "";
    container.innerHTML = '';
    state.currentPosts = [];
  }
  try {
    let res;
    if (state.currentFeedUri === "") {
        res = await window.go.services.FeedService.GetTimeline(state.timelineCursor, 100);
    } else {
        res = await window.go.services.FeedService.GetCustomFeed(state.currentFeedUri, state.timelineCursor, 100);
    }

    let addedCount = 0;
    if (res && res.posts) {
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
                  if (post.parentPost && idx === 0 && !post.repostedBy) {
                      if (!state.currentPosts.some(p => p.dataset.uri === post.parentPost.uri)) {
                          const parentArticle = createPostArticle(post.parentPost, state.currentPosts.length);
                          parentArticle.classList.add('thread-parent');
                          container.appendChild(parentArticle);
                          state.currentPosts.push(parentArticle);
                          addedCount++;
                      }
                  }
                  
                  const article = createPostArticle(post, state.currentPosts.length);
                  if (post.parentPost || idx > 0) article.classList.add('thread-child');
                  container.appendChild(article);
                  state.currentPosts.push(article);
                  addedCount++;
              }
          });
      });
      state.timelineCursor = res.cursor;
      if (state.hideReplies && addedCount < 25 && state.timelineCursor !== "" && fetchDepth < 3) {
          await loadTimeline(true, keepFocus, fetchDepth + 1);
          return;
      }
    }
    state.tabStates['timeline'].loaded = true;
    const hiddenRepliesText = state.hideReplies ? i18n.t('timeline.hiddenReplies') : '';
    announcePolite(i18n.t('timeline.feedLoaded', { count: state.currentPosts.length.toString(), hiddenReplies: hiddenRepliesText }));
    if (!loadMore && state.currentPosts.length > 0) {
        let focused = false;
        if (keepFocus && targetUri) {
            const idx = state.currentPosts.findIndex(p => p.dataset.uri === targetUri);
            if (idx >= 0) {
                state.focusedPostIndex = idx;
                state.currentPosts[idx].focus();
                focused = true;
            }
        }
        if (!focused) {
            state.focusedPostIndex = 0;
            state.currentPosts[0].focus();
        }
    }
  } catch (err: any) { console.error(err); announceAssertive(i18n.t('timeline.loadError')); } 
  finally { container.setAttribute('aria-busy', 'false'); }
}
