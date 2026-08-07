import { state } from '../config/state';
import { announcePolite, announceAssertive } from '../utils/a11y';
import { confirmDialog } from '../utils/dialog';
import { ListDTO } from '../types/wails';
import { viewListFeed, viewListMembers, showEditListModal } from '../controllers/lists';
import { i18n } from '../utils/i18n';

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
  const purposeText = isMod ? i18n.t('list.modList') : i18n.t('list.curationList');
  const creatorHandle = list.creatorHandle || list.creator || '';
  const isOwner = Boolean(
    (state.loggedInHandle && creatorHandle && state.loggedInHandle.toLowerCase() === creatorHandle.toLowerCase()) ||
    (state.loggedInHandle && list.creatorDid && state.loggedInHandle.toLowerCase() === list.creatorDid.toLowerCase())
  );

  const memberText = list.listItemCount !== undefined && list.listItemCount >= 0 ? i18n.t('list.memberCount', { count: list.listItemCount.toString() }) : '';
  const accessibleText = i18n.t('list.accessibleText', {
    name: list.name,
    purposeText,
    createdBy: creatorHandle ? i18n.t('list.createdBy', { handle: creatorHandle }) : '',
    memberText,
    desc: list.description || ''
  });
  div.dataset.text = accessibleText;
  div.setAttribute('aria-label', accessibleText);

  let muteBtnText = list.viewerMuted ? i18n.t('list.unmute') : i18n.t('list.mute');
  let blockBtnText = list.viewerBlock ? i18n.t('list.unblock') : i18n.t('list.block');

  div.innerHTML = `
    <div>
      <header style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px;">
        <div>
          <strong style="font-size:1.1em; color:var(--text-color, #fff);">${list.name}</strong>
          ${creatorHandle ? `<small style="display:block; color:#aaa;">${i18n.t('list.byHandle', { handle: creatorHandle })}</small>` : ''}
        </div>
        <div style="display:flex; gap:6px; align-items:center;">
          ${list.listItemCount !== undefined ? `<small style="background:#333; padding:2px 8px; border-radius:10px;">${i18n.t('list.memberCount', { count: list.listItemCount.toString() })}</small>` : ''}
          <small style="background:${isMod ? '#d32f2f' : '#1976d2'}; color:#fff; padding:2px 8px; border-radius:10px;">${purposeText}</small>
        </div>
      </header>
      ${list.description ? `<p style="margin:8px 0; color:#ddd;">${list.description}</p>` : ''}
      <footer style="margin-top:12px; display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
        <button type="button" class="btn-view-list-feed" style="padding:6px 12px; font-weight:bold;">${i18n.t('list.viewFeed')}</button>
        <button type="button" class="btn-view-list-members" style="padding:6px 12px;">${i18n.t('list.viewMembers')}</button>
        <button type="button" class="btn-follow-all-list" style="padding:6px 12px;">${i18n.t('list.followMembers')}</button>
        <button type="button" class="btn-mute-list" style="padding:6px 12px;">${muteBtnText}</button>
        <button type="button" class="btn-block-list" style="padding:6px 12px;">${blockBtnText}</button>
        ${isOwner ? `
          <button type="button" class="btn-edit-list" style="padding:6px 12px;">${i18n.t('list.edit')}</button>
          <button type="button" class="btn-delete-list" style="padding:6px 12px; background:#d32f2f; color:#fff;">${i18n.t('list.delete')}</button>
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
      announcePolite(i18n.t('list.followingMembers', { name: list.name }));
      const count = await window.go.services.SocialService.FollowAllInList(list.uri);
      announceAssertive(i18n.t('list.followedMembers', { count: count.toString(), name: list.name }));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      announceAssertive(i18n.t('list.errorFollowing', { msg }));
    }
  });

  div.querySelector('.btn-mute-list')?.addEventListener('click', async (e) => {
    e.stopPropagation();
    const btn = e.currentTarget as HTMLButtonElement;
    const isMuted = btn.textContent?.includes('Desmutar');
    try {
      if (isMuted) {
        announcePolite(i18n.t('list.unmuting', { name: list.name }));
        await window.go.services.SocialService.UnmuteList(list.uri);
        list.viewerMuted = false;
        btn.textContent = i18n.t('list.mute');
        announceAssertive(i18n.t('list.unmuted', { name: list.name }));
      } else {
        announcePolite(i18n.t('list.muting', { name: list.name }));
        await window.go.services.SocialService.MuteList(list.uri);
        list.viewerMuted = true;
        btn.textContent = i18n.t('list.unmute');
        announceAssertive(i18n.t('list.muted', { name: list.name }));
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      announceAssertive(i18n.t('list.errorMuting', { msg }));
    }
  });

  div.querySelector('.btn-block-list')?.addEventListener('click', async (e) => {
    e.stopPropagation();
    const btn = e.currentTarget as HTMLButtonElement;
    const isBlocked = btn.textContent?.includes('Desbloquear');
    try {
      if (isBlocked && list.viewerBlock) {
        announcePolite(i18n.t('list.unblocking', { name: list.name }));
        await window.go.services.SocialService.UnblockList(list.viewerBlock);
        list.viewerBlock = '';
        btn.textContent = i18n.t('list.block');
        announceAssertive(i18n.t('list.unblocked', { name: list.name }));
      } else {
        announcePolite(i18n.t('list.blocking', { name: list.name }));
        await window.go.services.SocialService.BlockList(list.uri);
        btn.textContent = i18n.t('list.unblock');
        announceAssertive(i18n.t('list.blocked', { name: list.name }));
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      announceAssertive(i18n.t('list.errorBlocking', { msg }));
    }
  });

  if (isOwner) {
    div.querySelector('.btn-edit-list')?.addEventListener('click', (e) => {
      e.stopPropagation();
      showEditListModal(list, options?.onRefresh);
    });

    div.querySelector('.btn-delete-list')?.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (await confirmDialog(i18n.t('list.confirmDeleteText', { name: list.name }), i18n.t('list.confirmDeleteTitle'))) {
        try {
          announcePolite(i18n.t('list.deleting'));
          await window.go.services.SocialService.DeleteList(list.uri);
          announceAssertive(i18n.t('list.deleted'));
          if (options?.onRefresh) {
            options.onRefresh();
          }
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          announceAssertive(i18n.t('list.errorDeleting', { msg }));
        }
      }
    });
  }

  return div;
}
