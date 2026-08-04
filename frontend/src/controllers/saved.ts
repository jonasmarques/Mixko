import { state } from '../config/state';
import { announcePolite, announceAssertive } from '../utils/a11y';
import { createPostArticle } from '../components/post';

export async function loadSavedPosts(loadMore = false, keepFocus = false) {
  if (loadMore && state.savedCursor === "") {
    announcePolite("Fim dos posts salvos alcançado.");
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
  announcePolite(loadMore ? "Carregando mais posts salvos..." : "Carregando posts salvos...");

  try {
    const res = await (window as any).go.services.FeedService.GetBookmarks(state.savedCursor, 50);
    container.setAttribute('aria-busy', 'false');
    console.log('[DEBUG loadSavedPosts response]', res);

    if (!res || !res.posts || res.posts.length === 0) {
      if (!loadMore) {
        container.innerHTML = '<p role="alert">Nenhum post salvo encontrado.</p>';
        announcePolite("Nenhum post salvo encontrado.");
      } else {
        announcePolite("Fim dos posts salvos alcançado.");
      }
      state.tabStates['saved'].loaded = true;
      return;
    }

    res.posts.forEach((p: any) => {
      if (!p.viewerBookmark) p.viewerBookmark = "bookmarked";
      
      if (!state.currentPosts.some(el => el.dataset.uri === p.uri)) {
        const article = createPostArticle(p, state.currentPosts.length);
        container.appendChild(article);
        state.currentPosts.push(article);
      }
    });

    state.savedCursor = res.cursor || "";
    state.tabStates['saved'].loaded = true;

    announcePolite(`${res.posts.length} posts salvos carregados.`);

    if (state.currentPosts.length > 0 && (!keepFocus || state.focusedPostIndex === -1)) {
      if (!keepFocus || state.focusedPostIndex < 0) {
        state.focusedPostIndex = 0;
      }
      if (state.currentPosts[state.focusedPostIndex]) {
        state.currentPosts[state.focusedPostIndex].focus();
      }
    }
  } catch (err) {
    container.setAttribute('aria-busy', 'false');
    container.innerHTML = `<p role="alert">Erro ao carregar posts salvos: ${err}</p>`;
    console.error('[DEBUG loadSavedPosts error]', err);
    announceAssertive("Erro ao carregar posts salvos: " + err);
  }
}
