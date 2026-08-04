import { state } from '../config/state';
import { announcePolite, announceAssertive } from '../utils/a11y';
import { confirmDialog } from '../utils/dialog';
import { ListDTO } from '../types/wails';
import { viewListFeed, viewListMembers, showEditListModal } from '../controllers/lists';

export interface ListArticleOptions {
  onRefresh?: () => void;
  targetContainerId?: string;
  onBack?: () => void;
}

export function createListArticle(list: ListDTO, options?: ListArticleOptions): HTMLElement {
  const div = document.createElement('article');
  div.classList.add('post-item');
  div.setAttribute('tabindex', '0');
  div.dataset.index = state.currentPosts.length.toString();
  div.dataset.uri = list.uri;
  div.dataset.name = list.name;

  const isMod = list.purpose === 'app.bsky.graph.defs#modlist';
  const purposeText = isMod ? 'Lista de Moderação' : 'Lista de Curadoria';
  const creatorHandle = list.creatorHandle || list.creator || '';
  const isOwner = Boolean(
    (state.loggedInHandle && creatorHandle && state.loggedInHandle.toLowerCase() === creatorHandle.toLowerCase()) ||
    (state.loggedInHandle && list.creatorDid && state.loggedInHandle.toLowerCase() === list.creatorDid.toLowerCase())
  );

  const memberText = list.listItemCount !== undefined && list.listItemCount >= 0 ? `${list.listItemCount} membro(s).` : '';
  const accessibleText = `Lista: ${list.name}. ${purposeText}. ${creatorHandle ? `Criada por @${creatorHandle}.` : ''} ${memberText} ${list.description || ''}`;
  div.dataset.text = accessibleText;
  div.setAttribute('aria-label', accessibleText);

  let muteBtnText = list.viewerMuted ? 'Desmutar Lista' : 'Mutar Lista';
  let blockBtnText = list.viewerBlock ? 'Desbloquear Lista' : 'Bloquear Lista';

  div.innerHTML = `
    <div>
      <header style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px;">
        <div>
          <strong style="font-size:1.1em; color:var(--text-color, #fff);">${list.name}</strong>
          ${creatorHandle ? `<small style="display:block; color:#aaa;">por @${creatorHandle}</small>` : ''}
        </div>
        <div style="display:flex; gap:6px; align-items:center;">
          ${list.listItemCount !== undefined ? `<small style="background:#333; padding:2px 8px; border-radius:10px;">${list.listItemCount} membro(s)</small>` : ''}
          <small style="background:${isMod ? '#d32f2f' : '#1976d2'}; color:#fff; padding:2px 8px; border-radius:10px;">${purposeText}</small>
        </div>
      </header>
      ${list.description ? `<p style="margin:8px 0; color:#ddd;">${list.description}</p>` : ''}
      <footer style="margin-top:12px; display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
        <button type="button" class="btn-view-list-feed" style="padding:6px 12px; font-weight:bold;">Ver Feed</button>
        <button type="button" class="btn-view-list-members" style="padding:6px 12px;">Ver Membros</button>
        <button type="button" class="btn-follow-all-list" style="padding:6px 12px;">Seguir Membros</button>
        <button type="button" class="btn-mute-list" style="padding:6px 12px;">${muteBtnText}</button>
        <button type="button" class="btn-block-list" style="padding:6px 12px;">${blockBtnText}</button>
        ${isOwner ? `
          <button type="button" class="btn-edit-list" style="padding:6px 12px;">Editar</button>
          <button type="button" class="btn-delete-list" style="padding:6px 12px; background:#d32f2f; color:#fff;">Excluir</button>
        ` : ''}
      </footer>
    </div>
  `;

  // Focus event for keyboard navigation state
  div.addEventListener('focus', () => {
    const idx = parseInt(div.dataset.index || '-1', 10);
    if (!isNaN(idx) && idx >= 0) {
      state.focusedPostIndex = idx;
    }
  });

  // Direct click on card to view feed
  div.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    if (!target.closest('button')) {
      viewListFeed(list.uri, list.name, options?.targetContainerId, options?.onBack);
    }
  });

  // Keydown event (Enter to open feed)
  div.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const target = e.target as HTMLElement;
      if (!target.closest('button')) {
        e.preventDefault();
        viewListFeed(list.uri, list.name, options?.targetContainerId, options?.onBack);
      }
    }
  });

  // Action listeners
  div.querySelector('.btn-view-list-feed')?.addEventListener('click', (e) => {
    e.stopPropagation();
    viewListFeed(list.uri, list.name, options?.targetContainerId, options?.onBack);
  });

  div.querySelector('.btn-view-list-members')?.addEventListener('click', (e) => {
    e.stopPropagation();
    viewListMembers(list.uri, list.name);
  });

  div.querySelector('.btn-follow-all-list')?.addEventListener('click', async (e) => {
    e.stopPropagation();
    try {
      announcePolite(`Seguindo membros da lista "${list.name}"...`);
      const count = await window.go.services.SocialService.FollowAllInList(list.uri);
      announceAssertive(`Você agora está seguindo ${count} novos membros da lista "${list.name}".`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      announceAssertive("Erro ao seguir membros da lista: " + msg);
    }
  });

  div.querySelector('.btn-mute-list')?.addEventListener('click', async (e) => {
    e.stopPropagation();
    const btn = e.currentTarget as HTMLButtonElement;
    const isMuted = btn.textContent?.includes('Desmutar');
    try {
      if (isMuted) {
        announcePolite(`Removendo silêncio da lista "${list.name}"...`);
        await window.go.services.SocialService.UnmuteList(list.uri);
        list.viewerMuted = false;
        btn.textContent = 'Mutar Lista';
        announceAssertive(`Lista "${list.name}" desmutada com sucesso.`);
      } else {
        announcePolite(`Silenciando lista "${list.name}"...`);
        await window.go.services.SocialService.MuteList(list.uri);
        list.viewerMuted = true;
        btn.textContent = 'Desmutar Lista';
        announceAssertive(`Lista "${list.name}" mutada com sucesso.`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      announceAssertive("Erro ao alterar estado de silêncio da lista: " + msg);
    }
  });

  div.querySelector('.btn-block-list')?.addEventListener('click', async (e) => {
    e.stopPropagation();
    const btn = e.currentTarget as HTMLButtonElement;
    const isBlocked = btn.textContent?.includes('Desbloquear');
    try {
      if (isBlocked && list.viewerBlock) {
        announcePolite(`Desbloqueando lista "${list.name}"...`);
        await window.go.services.SocialService.UnblockList(list.viewerBlock);
        list.viewerBlock = '';
        btn.textContent = 'Bloquear Lista';
        announceAssertive(`Lista "${list.name}" desbloqueada com sucesso.`);
      } else {
        announcePolite(`Bloqueando lista "${list.name}"...`);
        await window.go.services.SocialService.BlockList(list.uri);
        btn.textContent = 'Desbloquear Lista';
        announceAssertive(`Lista "${list.name}" bloqueada com sucesso.`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      announceAssertive("Erro ao alterar bloqueio da lista: " + msg);
    }
  });

  if (isOwner) {
    div.querySelector('.btn-edit-list')?.addEventListener('click', (e) => {
      e.stopPropagation();
      showEditListModal(list, options?.onRefresh);
    });

    div.querySelector('.btn-delete-list')?.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (await confirmDialog(`Deseja excluir a lista "${list.name}"?`, "Excluir Lista")) {
        try {
          announcePolite("Excluindo lista...");
          await window.go.services.SocialService.DeleteList(list.uri);
          announceAssertive("Lista excluída com sucesso.");
          if (options?.onRefresh) {
            options.onRefresh();
          }
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          announceAssertive("Erro ao excluir lista: " + msg);
        }
      }
    });
  }

  return div;
}
