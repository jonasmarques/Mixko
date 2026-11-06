import { esc, linkify, renderProfileLink } from '../utils/helpers';
import { state } from '../config/state';
import { announcePolite, announceAssertive } from '../utils/a11y';
import { createPostArticle } from '../components/post';
import { switchTab } from './tabs';
import { i18n } from '../utils/i18n';
import type { PostView, ProfileDTO, StarterPackDTO } from '../types/dto';

function createSearchProfileArticle(prof: ProfileDTO): HTMLElement {
    const div = document.createElement('article');
    div.classList.add('post-item');
    div.setAttribute('tabindex', '0');
    const nameWithPronouns = prof.pronouns
        ? `${prof.displayName || prof.handle}. ${i18n.t('profile.pronounsLabel')}: ${prof.pronouns}`
        : (prof.displayName || prof.handle);
    const pronounsHtml = prof.pronouns
        ? `<p class="profile-pronouns" style="margin: 2px 0; font-size: 0.9em; color: var(--text-muted, #9ca3af);">${esc(prof.pronouns)}</p>`
        : '';
    div.dataset.text = i18n.t('search.profileAria', { name: nameWithPronouns, desc: prof.description || "" });
    div.innerHTML = `<h3>${esc(prof.displayName)} <small>(${renderProfileLink(prof.handle)})</small></h3>${pronounsHtml}<p>${linkify(prof.description || '')}</p>`;
    
    div.dataset.index = state.currentPosts.length.toString();
    div.addEventListener('focus', () => {
        const iStr = div.dataset.index;
        if (iStr !== undefined) state.focusedPostIndex = parseInt(iStr, 10);
    });
    
    div.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            state.currentHandle = prof.handle;
            state.profileTabMode = 'posts';
            announcePolite(i18n.t('search.openingProfile', { handle: state.currentHandle }));
            switchTab('profile');
        }
    });
    div.addEventListener('click', () => {
        state.currentHandle = prof.handle;
        state.profileTabMode = 'posts';
        announcePolite(i18n.t('search.openingProfile', { handle: state.currentHandle }));
        switchTab('profile');
    });
    return div;
}

function createSearchStarterPackArticle(item: StarterPackDTO): HTMLElement {
    const article = document.createElement('article');
    article.classList.add('post-item');
    article.setAttribute('tabindex', '0');
    article.dataset.index = state.currentPosts.length.toString();
    article.innerHTML = `
        <h3>${esc(item.name)} <small>(${renderProfileLink(item.creator)})</small></h3>
        <p>${linkify(item.description || '')}</p>
        <div style="margin-top:6px; display:flex; gap:8px;">
            <button type="button" class="btn-view-pack">${esc(i18n.t('sec2.viewStarterPackBtn'))}</button>
            ${item.listUri ? `<button type="button" class="btn-follow-pack">${esc(i18n.t('profile.followAllBtn'))}</button>` : ''}
        </div>
        <div class="starter-pack-details-box hidden" style="margin-top:8px; padding:8px; border-top:1px solid #444;"></div>
    `;
    article.querySelector('.btn-view-pack')?.addEventListener('click', async (e) => {
        e.stopPropagation();
        const detailsBox = article.querySelector('.starter-pack-details-box') as HTMLDivElement | null;
        if (!detailsBox) return;
        if (!detailsBox.classList.contains('hidden')) {
            detailsBox.classList.add('hidden');
            return;
        }
        detailsBox.classList.remove('hidden');
        detailsBox.innerHTML = `<p>${esc(i18n.t('modals.loading'))}</p>`;
        try {
            const detail = await window.go.services.SocialService.GetStarterPack(item.uri);
            const membersHtml = (detail?.members || []).map(m => `<li>${esc(m.displayName || m.handle)} (${renderProfileLink(m.handle)})</li>`).join('');
            detailsBox.innerHTML = `<ul>${membersHtml || '<li>-</li>'}</ul>`;
        } catch (err: unknown) {
            detailsBox.innerHTML = `<p>${esc(String(err))}</p>`;
        }
    });
    if (item.listUri) {
        article.querySelector('.btn-follow-pack')?.addEventListener('click', async (e) => {
            e.stopPropagation();
            try {
                const count = await window.go.services.SocialService.FollowAllInList(item.listUri);
                announceAssertive(i18n.t('profile.followedPackMembersSuccess', { count: count.toString(), name: item.name }));
            } catch (err: unknown) {
                announceAssertive(i18n.t('profile.followPackMembersError', { err: String(err) }));
            }
        });
    }
    article.addEventListener('focus', () => {
        const iStr = article.dataset.index;
        if (iStr !== undefined) state.focusedPostIndex = parseInt(iStr, 10);
    });
    return article;
}

export async function loadMoreSearch() {
    if (!state.searchLastQuery) return;
    if (!state.searchCursor) {
        announcePolite(i18n.t('search.allResultsLoaded'));
        return;
    }
    const container = document.getElementById('search-results') as HTMLDivElement;
    if (!container) return;
    container.setAttribute('aria-busy', 'true');
    try {
        if (state.searchType === 'posts') {
            const filter = {
                Query: state.searchLastQuery,
                Author: state.searchLastAuthor,
                Lang: state.searchLastLang,
                Sort: state.searchLastSort,
                Since: state.searchLastSince,
                Until: state.searchLastUntil,
                Domain: state.searchLastDomain,
                Mentions: state.searchLastMentions,
                Tag: state.searchLastTag ? state.searchLastTag.split(',').map(t => t.trim().replace(/^#/, '')).filter(Boolean) : [],
                URL: state.searchLastUrl,
                Cursor: state.searchCursor
            };
            const res = await window.go.services.SearchService.SearchPosts(filter);
            state.searchCursor = res?.cursor || "";
            if (res && res.posts && res.posts.length > 0) {
                res.posts.forEach((post: PostView) => {
                    const article = createPostArticle(post, state.currentPosts.length);
                    if (article) {
                        container.appendChild(article);
                        state.currentPosts.push(article);
                    }
                });
                announcePolite(i18n.t('search.postsFound', { count: state.currentPosts.length.toString() }));
            } else {
                announcePolite(i18n.t('search.allResultsLoaded'));
            }
        } else if (state.searchType === 'starterPacks') {
            const res = await window.go.services.SocialService.SearchStarterPacks(state.searchLastQuery, state.searchCursor);
            state.searchCursor = res?.cursor || "";
            if (res && res.starterPacks && res.starterPacks.length > 0) {
                res.starterPacks.forEach((pack: StarterPackDTO) => {
                    const div = createSearchStarterPackArticle(pack);
                    container.appendChild(div);
                    state.currentPosts.push(div);
                });
                announcePolite(i18n.t('sec2.starterPacksFound', { count: state.currentPosts.length.toString() }));
            } else {
                announcePolite(i18n.t('search.allResultsLoaded'));
            }
        } else {
            const res = await window.go.services.SearchService.SearchProfiles(state.searchLastQuery, state.searchCursor);
            state.searchCursor = res?.cursor || "";
            if (res && res.profiles && res.profiles.length > 0) {
                res.profiles.forEach((prof: ProfileDTO) => {
                    const div = createSearchProfileArticle(prof);
                    container.appendChild(div);
                    state.currentPosts.push(div);
                });
                announcePolite(i18n.t('search.profilesFound', { count: state.currentPosts.length.toString() }));
            } else {
                announcePolite(i18n.t('search.allResultsLoaded'));
            }
        }
    } catch (err: unknown) {
        console.error(err);
        announceAssertive(i18n.t('search.searchErrorA11y'));
    } finally {
        container.setAttribute('aria-busy', 'false');
    }
}

export function setupSearch() {
    const btnSearch = document.getElementById('btn-search') as HTMLButtonElement;
    if (btnSearch) {
        btnSearch.addEventListener('click', async () => {
            const input = document.getElementById('search-input') as HTMLInputElement;
            const query = input.value.trim();
            if (!query) return;
            
            const typeRadios = document.getElementsByName('search-type') as NodeListOf<HTMLInputElement>;
            let searchType: 'posts' | 'users' | 'starterPacks' = 'posts';
            typeRadios.forEach((r: HTMLInputElement) => {
                if (r.checked) {
                    if (r.value === 'users') searchType = 'users';
                    else if (r.value === 'starterPacks') searchType = 'starterPacks';
                }
            });
            
            const container = document.getElementById('search-results') as HTMLDivElement;
            container.innerHTML = `<p>${i18n.t('search.searching')}</p>`;
            container.setAttribute('aria-busy', 'true');
            announcePolite(i18n.t('search.searchingFor', { query }));
            state.currentPosts = [];
            state.searchCursor = "";
            state.searchLastQuery = query;
            state.searchType = searchType;
            
            try {
                if (searchType === 'posts') {
                    const langSelect = document.getElementById('search-lang') as HTMLSelectElement;
                    const sortSelect = document.getElementById('search-sort') as HTMLSelectElement;
                    const authorInput = document.getElementById('search-author') as HTMLInputElement;
                    const domainInput = document.getElementById('search-domain') as HTMLInputElement | null;
                    const mentionsInput = document.getElementById('search-mentions') as HTMLInputElement | null;
                    const tagInput = document.getElementById('search-tag') as HTMLInputElement | null;
                    const urlInput = document.getElementById('search-url') as HTMLInputElement | null;
                    const sinceInput = document.getElementById('search-since') as HTMLInputElement | null;
                    const untilInput = document.getElementById('search-until') as HTMLInputElement | null;

                    const lang = langSelect ? langSelect.value : "";
                    const sort = sortSelect ? sortSelect.value : "latest";
                    const author = authorInput ? authorInput.value.trim() : "";
                    const domain = domainInput ? domainInput.value.trim() : "";
                    const mentions = mentionsInput ? mentionsInput.value.trim().replace(/^@/, '') : "";
                    const tagRaw = tagInput ? tagInput.value.trim() : "";
                    const urlVal = urlInput ? urlInput.value.trim() : "";
                    const sinceDate = sinceInput && sinceInput.value ? `${sinceInput.value}T00:00:00Z` : "";
                    const untilDate = untilInput && untilInput.value ? `${untilInput.value}T23:59:59Z` : "";

                    state.searchLastLang = lang;
                    state.searchLastSort = sort;
                    state.searchLastAuthor = author;
                    state.searchLastDomain = domain;
                    state.searchLastMentions = mentions;
                    state.searchLastTag = tagRaw;
                    state.searchLastUrl = urlVal;
                    state.searchLastSince = sinceDate;
                    state.searchLastUntil = untilDate;

                    const filter = {
                        Query: query,
                        Author: author,
                        Lang: lang,
                        Sort: sort,
                        Since: sinceDate,
                        Until: untilDate,
                        Domain: domain,
                        Mentions: mentions,
                        Tag: tagRaw ? tagRaw.split(',').map(t => t.trim().replace(/^#/, '')).filter(Boolean) : [],
                        URL: urlVal,
                        Cursor: ""
                    };
                    const res = await window.go.services.SearchService.SearchPosts(filter);
                    state.searchCursor = res?.cursor || "";
                    container.innerHTML = '';
                    if (res && res.posts && res.posts.length > 0) {
                        res.posts.forEach((post: PostView) => {
                            const article = createPostArticle(post, state.currentPosts.length);
                            if (article) {
                                container.appendChild(article);
                                state.currentPosts.push(article);
                            }
                        });
                        announcePolite(i18n.t('search.postsFound', { count: res.posts.length.toString() }));
                    } else {
                        container.innerHTML = `<p>${i18n.t('search.noPostsFound')}</p>`;
                        announcePolite(i18n.t('search.noPostsFound'));
                    }
                } else if (searchType === 'starterPacks') {
                    const res = await window.go.services.SocialService.SearchStarterPacks(query, "");
                    state.searchCursor = res?.cursor || "";
                    container.innerHTML = '';
                    if (res && res.starterPacks && res.starterPacks.length > 0) {
                        res.starterPacks.forEach((pack: StarterPackDTO) => {
                            const div = createSearchStarterPackArticle(pack);
                            container.appendChild(div);
                            state.currentPosts.push(div);
                        });
                        announcePolite(i18n.t('sec2.starterPacksFound', { count: res.starterPacks.length.toString() }));
                    } else {
                        container.innerHTML = `<p>${i18n.t('sec2.noStarterPacksFound')}</p>`;
                        announcePolite(i18n.t('sec2.noStarterPacksFound'));
                    }
                } else {
                    const res = await window.go.services.SearchService.SearchProfiles(query, "");
                    state.searchCursor = res?.cursor || "";
                    container.innerHTML = '';
                    if (res && res.profiles && res.profiles.length > 0) {
                        res.profiles.forEach((prof: ProfileDTO) => {
                            const div = createSearchProfileArticle(prof);
                            container.appendChild(div);
                            state.currentPosts.push(div);
                        });
                        announcePolite(i18n.t('search.profilesFound', { count: res.profiles.length.toString() }));
                    } else {
                        container.innerHTML = `<p>${i18n.t('search.noProfilesFound')}</p>`;
                        announcePolite(i18n.t('search.noProfilesFound'));
                    }
                }
            } catch (err: unknown) {
                console.error(err);
                container.innerHTML = `<p>${i18n.t('search.searchErrorUI')}</p>`;
                announceAssertive(i18n.t('search.searchErrorA11y'));
            } finally {
                container.setAttribute('aria-busy', 'false');
                state.tabStates['search'].loaded = true;
            }
        });
        
        // Bind Enter key in search input to trigger search
        document.getElementById('search-input')?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') btnSearch.click();
        });
    }
}
