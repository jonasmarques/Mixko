import { esc } from '../utils/helpers';
import { state } from '../config/state';
import { announcePolite, announceAssertive } from '../utils/a11y';
import { createPostArticle } from '../components/post';
import { i18n } from '../utils/i18n';

export async function loadSavedPosts(loadMore = false, keepFocus = false) {
  if (loadMore && state.savedCursor === "") {
    announcePolite(i18n.t('saved.endOfSavedPosts'));
    return;
  }

  const container = document.getElementById('saved-posts-list');
  if (!container) return;

  if (!loadMore) {
    state.savedCursor = "";
    container.innerHTML = "";
    state.currentPosts = [];
    state.focusedPostIndex = -1;
  }

  container.setAttribute('aria-busy', 'true');
  announcePolite(loadMore ? i18n.t('saved.loadingMoreSaved') : i18n.t('saved.loadingSaved'));

  try {
    const res = await (window as any).go.services.FeedService.GetBookmarks(state.savedCursor, 50);
    container.setAttribute('aria-busy', 'false');
    console.log('[DEBUG loadSavedPosts response]', res);

    const posts = res?.posts || [];

    if (!posts || posts.length === 0) {
      if (!loadMore) {
        container.innerHTML = `
          <div role="alert" tabindex="0" style="padding:1rem; border:1px solid var(--border-color, #444); border-radius:6px; margin:1rem 0;">
            <p><strong>${i18n.t('saved.noSavedFound')}</strong></p>
          </div>
        `;
        announceAssertive(i18n.t('saved.noSavedFound'));
      } else {
        announceAssertive(i18n.t('saved.endOfSavedPosts'));
      }
      state.tabStates['saved'].loaded = true;
      return;
    }

    posts.forEach((p: any) => {
      if (!p.viewerBookmark) p.viewerBookmark = "bookmarked";
      
      if (!state.currentPosts.some(el => el.dataset.uri === p.uri)) {
        const article = createPostArticle(p, state.currentPosts.length);
        container.appendChild(article);
        state.currentPosts.push(article);
      }
    });

    state.savedCursor = res?.cursor || "";
    state.tabStates['saved'].loaded = true;
    state.tabStates['saved'].posts = state.currentPosts;

    const loadedMsg = i18n.t('saved.savedLoaded', { count: state.currentPosts.length.toString() });
    announceAssertive(loadedMsg);

    if (state.currentPosts.length > 0 && (!keepFocus || state.focusedPostIndex === -1)) {
      if (!keepFocus || state.focusedPostIndex < 0) {
        state.focusedPostIndex = 0;
      }
      state.tabStates['saved'].focusedIndex = state.focusedPostIndex;
      if (state.currentPosts[state.focusedPostIndex]) {
        state.currentPosts[state.focusedPostIndex].focus();
      }
    }
  } catch (err) {
    container.setAttribute('aria-busy', 'false');
    const errText = i18n.t('saved.savedError', { err: String(err) });
    container.innerHTML = `
      <div role="alert" tabindex="0" style="padding:1rem; border:1px solid var(--border-color, #444); border-radius:6px; margin:1rem 0;">
        <p><strong>${esc(errText)}</strong></p>
      </div>
    `;
    console.error('[loadSavedPosts]', err);
    announceAssertive(errText);
  }
}
