import { state } from '../config/state';
import { announcePolite, announceAssertive } from '../utils/a11y';
import { switchTab } from './tabs';
import { viewListFeed } from './lists';
import { createPostArticle } from '../components/post';
import { i18n } from '../utils/i18n';

async function resolveHandleToDID(handle: string): Promise<string> {
    const profile = await window.go.services.SocialService.GetProfile(handle);
    return profile.did as string;
}

function buildAtUri(did: string, collection: string, rkey: string): string {
    return `at://${did}/${collection}/${rkey}`;
}

async function routeProfile(handle: string): Promise<void> {
    state.currentHandle = handle;
    state.profileTabMode = 'posts';
    announcePolite(i18n.t('router.openingProfile', { handle }));
    switchTab('profile');
}

async function routePost(handle: string, rkey: string): Promise<void> {
    try {
        announcePolite(i18n.t('router.loadingPost', { handle }));
        const did = await resolveHandleToDID(handle);
        const uri = buildAtUri(did, 'app.bsky.feed.post', rkey);
        const res = await window.go.services.FeedService.GetPostThread(uri, 6);

        const modal = document.getElementById('posts-list-modal') as HTMLDialogElement;
        const container = document.getElementById('posts-list-container');
        const titleEl = document.getElementById('posts-list-title');

        if (!modal || !container) {
            announceAssertive(i18n.t('router.modalNotFound'));
            return;
        }

        if (titleEl) titleEl.textContent = i18n.t('router.threadOf', { handle });
        container.innerHTML = '';
        state.currentPosts = [];

        const posts = res?.posts ?? [];
        if (posts.length === 0) {
            container.innerHTML = `<p>${i18n.t('router.postNotFound')}</p>`;
        } else {
            posts.forEach((post: any, idx: number) => {
                const article = createPostArticle(post, idx);
                container.appendChild(article);
                state.currentPosts.push(article);
            });
        }

        announcePolite(i18n.t('router.threadLoaded', { count: posts.length.toString() }));
        modal.showModal();
        const closeBtn = modal.querySelector('#btn-close-posts-list') as HTMLElement | null;
        closeBtn?.focus();
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        announceAssertive(i18n.t('router.errorPost', { msg }));
    }
}

async function routeFeed(handle: string, rkey: string): Promise<void> {
    try {
        announcePolite(i18n.t('router.loadingFeed', { handle }));
        const did = await resolveHandleToDID(handle);
        const uri = buildAtUri(did, 'app.bsky.feed.generator', rkey);
        state.currentFeedUri = uri;
        switchTab('timeline');
        announcePolite(i18n.t('router.feedLoaded'));
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        announceAssertive(i18n.t('router.errorFeed', { msg }));
    }
}

async function routeList(handle: string, rkey: string): Promise<void> {
    try {
        announcePolite(i18n.t('router.loadingList', { handle }));
        const did = await resolveHandleToDID(handle);
        const uri = buildAtUri(did, 'app.bsky.graph.list', rkey);
        const listName = i18n.t('router.listOf', { handle });

        const targetTab = state.currentTab === 'lists' ? 'panel-lists' : 'panel-lists';
        switchTab('lists');
        await viewListFeed(uri, listName, targetTab, undefined);
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        announceAssertive(i18n.t('router.errorList', { msg }));
    }
}

async function routeStarterPack(handle: string, rkey: string): Promise<void> {
    try {
        announcePolite(i18n.t('router.loadingStarterPack', { handle }));
        const did = await resolveHandleToDID(handle);
        const uri = buildAtUri(did, 'app.bsky.graph.starterpack', rkey);

        const dialog = document.createElement('dialog');
        dialog.className = 'custom-dialog modal-content';
        dialog.setAttribute('role', 'dialog');
        dialog.setAttribute('aria-labelledby', 'sp-modal-title');
        dialog.style.cssText = 'padding:20px; border-radius:8px; border:1px solid var(--border-color,#444); background:var(--bg-color,#1e1e2e); color:var(--text-color,#fff); max-width:440px; width:90%;';

        const packs = await window.go.services.SocialService.GetActorStarterPacks(did, '');
        const pack = packs?.starterPacks?.find((p: any) => p.uri === uri) ?? packs?.starterPacks?.[0];

        dialog.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
                <h3 id="sp-modal-title" style="margin:0;">Starter Pack</h3>
                <button type="button" id="btn-close-sp-modal" style="padding:4px 10px;">${i18n.t('router.close')}</button>
            </div>
            ${pack ? `
                <p><strong>${pack.name}</strong></p>
                ${pack.description ? `<p style="color:#aaa; font-size:0.9em;">${pack.description}</p>` : ''}
                <p style="font-size:0.85em;">${i18n.t('router.createdBy', { handle: pack.creator })}</p>
                <p style="font-size:0.8em; color:#777; word-break:break-all;">${uri}</p>
            ` : `<p>${i18n.t('router.starterPackOf', { handle, rkey })}</p><p style="font-size:0.8em; color:#777; word-break:break-all;">${uri}</p>`}
        `;

        document.body.appendChild(dialog);
        dialog.showModal();

        const closeBtn = dialog.querySelector('#btn-close-sp-modal') as HTMLButtonElement;
        const cleanup = () => { dialog.close(); dialog.remove(); };
        closeBtn?.addEventListener('click', cleanup);
        dialog.addEventListener('keydown', (e) => { if (e.key === 'Escape') cleanup(); });
        closeBtn?.focus();
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        announceAssertive(i18n.t('router.errorStarterPack', { msg }));
    }
}

function routeHashtag(tag: string): void {
    const searchInput = document.getElementById('search-input') as HTMLInputElement | null;
    const btnSearch = document.getElementById('btn-search') as HTMLButtonElement | null;

    if (!searchInput || !btnSearch) {
        announceAssertive(i18n.t('router.searchUnavailable'));
        return;
    }

    searchInput.value = `#${tag}`;

    const radioPosts = document.querySelector<HTMLInputElement>('input[name="search-type"][value="posts"]');
    if (radioPosts) radioPosts.checked = true;

    switchTab('search');
    announcePolite(i18n.t('router.searchingTag', { tag }));
    btnSearch.click();
}

export function setupBskyLinkDelegation(): void {
    document.body.addEventListener('click', (e) => {
        const target = (e.target as HTMLElement).closest('a[data-bsky-route]') as HTMLAnchorElement | null;
        if (!target) return;

        e.preventDefault();
        e.stopPropagation();

        const route = target.dataset.bskyRoute!;
        const handle = target.dataset.handle ?? '';
        const rkey = target.dataset.rkey ?? '';
        const tag = target.dataset.tag ?? '';

        switch (route) {
            case 'profile':
                routeProfile(handle);
                break;
            case 'post':
                routePost(handle, rkey);
                break;
            case 'feed':
                routeFeed(handle, rkey);
                break;
            case 'list':
                routeList(handle, rkey);
                break;
            case 'starterpack':
                routeStarterPack(handle, rkey);
                break;
            case 'hashtag':
                routeHashtag(tag);
                break;
        }
    });
}
