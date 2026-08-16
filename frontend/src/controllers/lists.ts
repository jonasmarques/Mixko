import { esc } from '../utils/helpers';
import { state } from '../config/state';
import { announcePolite, announceAssertive } from '../utils/a11y';
import { confirmDialog, promptDialog } from '../utils/dialog';
import { createPostArticle } from '../components/post';
import { createListArticle } from '../components/list';
import { loadProfile } from './profile';
import { i18n } from '../utils/i18n';

export async function loadListsTab(loadMore = false) {
    const container = document.getElementById('panel-lists') as HTMLDivElement;
    if (!container) return;

    if (!loadMore) {
        state.listsCursor = "";
        state.currentPosts = [];
        container.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px; flex-wrap:wrap; gap:10px;">
                <h2 style="margin:0;">${i18n.t('lists.management')}</h2>
                <div style="display:flex; gap:10px;">
                    <button id="btn-create-list" type="button" style="padding:8px 14px; font-weight:bold;">${i18n.t('lists.createNewList')}</button>
                    <button id="btn-create-starter-pack" type="button" style="padding:8px 14px; font-weight:bold;">${i18n.t('lists.createStarterPack')}</button>
                </div>
            </div>
            <div id="lists-items-container" aria-busy="true">${i18n.t('lists.loading')}</div>
        `;
        document.getElementById('btn-create-list')?.addEventListener('click', () => showCreateListModal());
        document.getElementById('btn-create-starter-pack')?.addEventListener('click', () => showCreateStarterPackModal());
    }

    const itemsContainer = document.getElementById('lists-items-container') as HTMLDivElement;
    if (!itemsContainer) return;

    try {
        const handle = state.loggedInHandle || state.currentHandle;
        const res = await window.go.services.SocialService.GetActorLists(handle, state.listsCursor);
        itemsContainer.setAttribute('aria-busy', 'false');
        
        if (!loadMore) {
            itemsContainer.innerHTML = '';
        }

        if (res && res.lists && res.lists.length > 0) {
            state.listsCursor = res.cursor || "";
            res.lists.forEach((list: any) => {
                const article = createListArticle(list, {
                    onRefresh: () => loadListsTab(false),
                    targetContainerId: 'panel-lists',
                    onBack: () => loadListsTab(false)
                });
                itemsContainer.appendChild(article);
                state.currentPosts.push(article);
            });
            announcePolite(i18n.t('lists.listsDisplayed', { count: state.currentPosts.length.toString() }));
        } else if (!loadMore) {
            itemsContainer.innerHTML = `<p>${i18n.t('lists.noListsCreated')}</p>`;
            announcePolite(i18n.t('lists.noListsFound'));
        }
        state.tabStates['lists'].loaded = true;
    } catch (err: unknown) {
        console.error(err);
        itemsContainer.setAttribute('aria-busy', 'false');
        announceAssertive(i18n.t('lists.loadError'));
    }
}

export async function showCreateListModal() {
    const name = await promptDialog(i18n.t('lists.newListName'), "", i18n.t('lists.createListTitle'));
    if (!name) return;

    const desc = await promptDialog(i18n.t('lists.listDesc'), "", i18n.t('lists.createListDescTitle')) || "";
    const isMod = await confirmDialog(i18n.t('lists.isModList'), i18n.t('lists.listTypeTitle'));
    const purpose = isMod ? "app.bsky.graph.defs#modlist" : "app.bsky.graph.defs#curatelist";

    try {
        announcePolite(i18n.t('lists.creatingList'));
        await window.go.services.SocialService.CreateList(name, purpose, desc);
        announceAssertive(i18n.t('lists.listCreated', { name }));
        loadListsTab(false);
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        announceAssertive(i18n.t('lists.createListError', { msg }));
    }
}

export async function showEditListModal(list: any, onRefresh?: () => void) {
    const newName = await promptDialog(i18n.t('lists.newListNamePrompt'), list.name, i18n.t('lists.editListTitle'));
    if (!newName) return;

    const newDesc = await promptDialog(i18n.t('lists.newListDesc'), list.description || "", i18n.t('lists.editListTitle')) || "";
    try {
        announcePolite(i18n.t('lists.updatingList'));
        await window.go.services.SocialService.EditList(list.uri, newName, list.purpose, newDesc);
        announceAssertive(i18n.t('lists.listUpdated'));
        if (onRefresh) {
            onRefresh();
        } else {
            loadListsTab(false);
        }
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        announceAssertive(i18n.t('lists.editListError', { msg }));
    }
}

export async function viewListMembers(listUri: string, listName: string) {
    try {
        announcePolite(i18n.t('lists.loadingMembers', { name: listName }));
        const res = await window.go.services.SocialService.GetListMembers(listUri, "");
        
        const dialog = document.createElement('dialog');
        dialog.className = 'custom-dialog modal-content';
        dialog.setAttribute('role', 'dialog');
        dialog.setAttribute('aria-labelledby', 'list-members-title');
        dialog.style.cssText = 'padding:20px; border-radius:8px; border:1px solid var(--border-color, #444); background:var(--bg-color, #1e1e2e); color:var(--text-color, #fff); max-width:500px; width:90%; max-height:80vh; overflow-y:auto;';

        let membersHtml = '';
        if (res && res.profiles && res.profiles.length > 0) {
            membersHtml = res.profiles.map((p) => `
                <div class="post-item" style="display:flex; justify-content:space-between; align-items:center; padding:10px; margin-bottom:8px; background:#121212; border-radius:6px;">
                    <div>
                        <strong>${esc(p.displayName || p.handle)}</strong>
                        <small style="display:block; color:#aaa;">@${esc(p.handle)}</small>
                    </div>
                    <button type="button" class="btn-open-member-profile" data-handle="${esc(p.handle)}" style="padding:4px 10px;">${i18n.t('lists.viewProfile')}</button>
                </div>
            `).join('');
        } else {
            membersHtml = `<p>${i18n.t('lists.noMembers')}</p>`;
        }

        dialog.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px; border-bottom:1px solid #333; padding-bottom:10px;">
                <h3 id="list-members-title" style="margin:0;">${i18n.t('lists.listMembersTitle', { name: listName })}</h3>
                <button type="button" id="btn-close-members-modal" style="padding:4px 10px;">${i18n.t('lists.close')}</button>
            </div>
            <div id="members-list-body">${membersHtml}</div>
        `;

        document.body.appendChild(dialog);
        announcePolite(i18n.t('lists.membersLoaded', { name: listName }));

        const closeBtn = dialog.querySelector('#btn-close-members-modal') as HTMLButtonElement;
        const cleanup = () => {
            dialog.close();
            dialog.remove();
        };

        closeBtn?.addEventListener('click', cleanup);
        dialog.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                cleanup();
            }
        });

        dialog.querySelectorAll('.btn-open-member-profile').forEach((btn) => {
            btn.addEventListener('click', (e) => {
                const handle = (e.currentTarget as HTMLButtonElement).dataset.handle;
                if (handle) {
                    cleanup();
                    state.currentHandle = handle;
                    state.profileTabMode = 'posts';
                    announcePolite(i18n.t('lists.openingProfile', { handle }));
                    loadProfile();
                }
            });
        });

        dialog.showModal();
        closeBtn?.focus();
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        announceAssertive(i18n.t('lists.loadMembersError', { msg }));
    }
}

export async function viewListFeed(listUri: string, listName: string, targetContainerId = 'panel-lists', onBack?: () => void) {
    const container = document.getElementById(targetContainerId) as HTMLDivElement;
    if (!container) return;

    container.innerHTML = `
        <div style="margin-bottom:15px; display:flex; justify-content:space-between; align-items:center;">
            <button id="btn-back-lists" type="button" style="padding:6px 14px; font-weight:bold;">${i18n.t('lists.back')}</button>
            <h3 style="margin:0;">${i18n.t('lists.listFeedTitle', { name: listName })}</h3>
        </div>
        <div id="list-feed-container" aria-busy="true">${i18n.t('lists.loadingListFeed')}</div>
    `;

    document.getElementById('btn-back-lists')?.addEventListener('click', () => {
        if (onBack) {
            onBack();
        } else {
            loadListsTab(false);
        }
    });

    const feedContainer = document.getElementById('list-feed-container') as HTMLDivElement;
    try {
        const res = await window.go.services.FeedService.GetListFeed(listUri, "", 30);
        feedContainer.setAttribute('aria-busy', 'false');
        feedContainer.innerHTML = '';
        state.currentPosts = [];

        if (res && res.posts && res.posts.length > 0) {
            res.posts.forEach((post, idx: number) => {
                const article = createPostArticle(post, idx);
                feedContainer.appendChild(article);
                state.currentPosts.push(article);
            });
            announcePolite(i18n.t('lists.listFeedLoaded', { count: res.posts.length.toString() }));
        } else {
            feedContainer.innerHTML = `<p>${i18n.t('lists.noRecentPosts')}</p>`;
            announcePolite(i18n.t('lists.noPostsFound'));
        }
    } catch (err: unknown) {
        console.error(err);
        feedContainer.setAttribute('aria-busy', 'false');
        announceAssertive(i18n.t('lists.listFeedError'));
    }
}

export async function showCreateStarterPackModal() {
    try {
        const handle = state.loggedInHandle || state.currentHandle;
        const listsRes = await window.go.services.SocialService.GetActorLists(handle, "");
        if (!listsRes || !listsRes.lists || listsRes.lists.length === 0) {
            announceAssertive(i18n.t('lists.needCurateListForStarterPack'));
            return;
        }

        const name = await promptDialog(i18n.t('lists.starterPackName'), "", i18n.t('lists.createStarterPackTitle'));
        if (!name) return;

        const desc = await promptDialog(i18n.t('lists.starterPackDesc'), "", i18n.t('lists.createStarterPackDescTitle')) || "";
        const options = listsRes.lists.map((l: any, i: number) => `${i + 1}. ${l.name}`).join("\n");
        const chosen = await promptDialog(i18n.t('lists.chooseBaseList', { options }), "1", i18n.t('lists.selectListTitle'));
        if (!chosen) return;

        const idx = parseInt(chosen, 10) - 1;
        if (idx >= 0 && idx < listsRes.lists.length) {
            const selectedList = listsRes.lists[idx];
            announcePolite(i18n.t('lists.creatingStarterPack'));
            await window.go.services.SocialService.CreateStarterPack(name, desc, selectedList.uri);
            announceAssertive(i18n.t('lists.starterPackCreated', { name }));
            loadListsTab(false);
        } else {
            announceAssertive(i18n.t('lists.invalidListOption'));
        }
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        announceAssertive(i18n.t('lists.createStarterPackError', { msg }));
    }
}
