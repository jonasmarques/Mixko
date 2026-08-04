import { state } from '../config/state';
import { announcePolite, announceAssertive } from '../utils/a11y';
import { confirmDialog } from '../utils/dialog';
import { switchTab } from './tabs';
import { createListArticle } from '../components/list';

export async function loadFeedsTab() {
    const container = document.getElementById('feed-list') as HTMLDivElement;
    container.setAttribute('aria-busy', 'true');
    container.innerHTML = '<div style="padding: 20px;">Carregando...</div>';
    
    // Setup tabs
    ['saved', 'lists', 'discover'].forEach(mode => {
        const btn = document.getElementById(`ftab-${mode}`);
        if (btn) {
            const isActive = state.feedsTabMode === mode;
            btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
            btn.setAttribute('tabindex', isActive ? '0' : '-1');
            btn.style.fontWeight = isActive ? 'bold' : 'normal';
            btn.onclick = () => {
                if (state.feedsTabMode !== mode) {
                    state.feedsTabMode = mode as 'saved' | 'lists' | 'discover';
                    loadFeedsTab();
                }
            };
        }
    });

    state.currentPosts = [];

    try {
        if (state.feedsTabMode === 'saved') {
            const res = await window.go.services.FeedService.GetSavedFeeds();
            container.innerHTML = '';
            state.savedFeeds = res || [];
            
            // Render default "Seguindo" (Following) home timeline feed item
            const followingDiv = document.createElement('article');
            followingDiv.classList.add('post-item');
            followingDiv.setAttribute('role', 'article');
            followingDiv.setAttribute('tabindex', '0');
            followingDiv.dataset.index = state.currentPosts.length.toString();
            followingDiv.dataset.uri = "";
            followingDiv.innerHTML = `
                <h3>Seguindo (Timeline Principal)</h3>
                <small>Feed padrão de postagens das contas que você segue. <strong>(Atalho: Alt+Shift+0)</strong></small>
                <div class="actions" style="margin-top: 10px; display:flex; gap:10px;">
                    <button class="btn-open-feed" data-uri="">Abrir Feed</button>
                </div>
            `;
            followingDiv.querySelector('.btn-open-feed')?.addEventListener('click', (e) => {
                e.stopPropagation();
                state.currentFeedUri = "";
                switchTab('timeline');
                announcePolite("Feed principal (Seguindo) carregado na timeline.");
            });
            followingDiv.addEventListener('click', () => {
                state.currentFeedUri = "";
                switchTab('timeline');
                announcePolite("Feed principal (Seguindo) carregado na timeline.");
            });
            followingDiv.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    state.currentFeedUri = "";
                    switchTab('timeline');
                }
            });
            followingDiv.addEventListener('focus', () => {
                const idx = parseInt(followingDiv.dataset.index || "-1");
                if (!isNaN(idx) && idx >= 0) {
                    state.focusedPostIndex = idx;
                }
            });
            container.appendChild(followingDiv);
            state.currentPosts.push(followingDiv);

            if (state.savedFeeds.length > 0) {
                state.savedFeeds.forEach((feed: any, index: number) => {
                    const div = document.createElement('article');
                    div.classList.add('post-item');
                    div.setAttribute('role', 'article');
                    div.setAttribute('tabindex', '0');
                    div.dataset.index = state.currentPosts.length.toString();
                    div.dataset.uri = feed.uri;
                    const shortcutBadge = index < 9 ? ` <strong>(Atalho: Alt+Shift+${index + 1})</strong>` : '';
                    const pinnedBadge = feed.pinned ? ' <em>Fixado</em>' : '';
                    const pinBtnLabel = feed.pinned ? 'Desafixar' : 'Fixar';
                    div.innerHTML = `
                        <h3>${feed.displayName}${pinnedBadge}</h3>
                        <small>Criado por: @${feed.creator}${shortcutBadge}</small>
                        <div class="actions" style="margin-top: 10px; display:flex; gap:10px; flex-wrap:wrap;">
                            <button class="btn-open-feed" data-uri="${feed.uri}">Abrir Feed</button>
                            <button class="btn-pin-feed" data-uri="${feed.uri}" data-pinned="${feed.pinned ? '1' : '0'}">${pinBtnLabel}</button>
                            <button class="btn-remove-feed" data-uri="${feed.uri}" style="background:#d32f2f; color:#fff; border:none; border-radius:4px; padding:4px 8px;">Remover</button>
                        </div>
                    `;
                    div.querySelector('.btn-open-feed')?.addEventListener('click', (e) => {
                        e.stopPropagation();
                        state.currentFeedUri = feed.uri;
                        switchTab('timeline');
                        announcePolite(`Feed ${feed.displayName} carregado na timeline.`);
                    });
                    div.querySelector('.btn-pin-feed')?.addEventListener('click', async (e) => {
                        e.stopPropagation();
                        const isPinned = feed.pinned;
                        const allSavedUris = state.savedFeeds.map((f: any) => f.uri);
                        const currentPinned = state.savedFeeds.filter((f: any) => f.pinned && f.uri !== feed.uri).map((f: any) => f.uri);
                        const newPinned = isPinned ? currentPinned : [...currentPinned, feed.uri];
                        try {
                            await window.go.services.SocialService.UpdateSavedFeeds(newPinned, allSavedUris);
                            announceAssertive(isPinned ? `Feed "${feed.displayName}" desafixado.` : `Feed "${feed.displayName}" fixado.`);
                            loadFeedsTab();
                        } catch (err) {
                            announceAssertive("Erro ao atualizar feed.");
                        }
                    });
                    div.querySelector('.btn-remove-feed')?.addEventListener('click', async (e) => {
                        e.stopPropagation();
                        if (await confirmDialog(`Deseja remover o feed "${feed.displayName}" dos seus salvos?`, 'Remover Feed')) {
                            const newSaved = state.savedFeeds.filter((f: any) => f.uri !== feed.uri).map((f: any) => f.uri);
                            const newPinned = state.savedFeeds.filter((f: any) => f.pinned && f.uri !== feed.uri).map((f: any) => f.uri);
                            await window.go.services.SocialService.UpdateSavedFeeds(newPinned, newSaved);
                            announceAssertive("Feed removido dos salvos.");
                            loadFeedsTab();
                        }
                    });
                    div.addEventListener('click', () => {
                        state.currentFeedUri = feed.uri;
                        switchTab('timeline');
                        announcePolite(`Feed ${feed.displayName} carregado na timeline.`);
                    });
                    div.addEventListener('keydown', (e) => {
                        if (e.key === 'Enter') {
                            e.preventDefault();
                            state.currentFeedUri = feed.uri;
                            switchTab('timeline');
                        }
                    });
                    div.addEventListener('focus', () => {
                        const idx = parseInt(div.dataset.index || "-1");
                        if (!isNaN(idx) && idx >= 0) {
                            state.focusedPostIndex = idx;
                        }
                    });
                    container.appendChild(div);
                    state.currentPosts.push(div);
                });
                announcePolite(`${state.savedFeeds.length + 1} feeds disponíveis.`);
            }
        } else if (state.feedsTabMode === 'lists') {
            const res = await window.go.services.SocialService.GetActorLists(state.loggedInHandle, "");
            container.innerHTML = '';
            if (res && res.lists && res.lists.length > 0) {
                res.lists.forEach((list: any) => {
                    const article = createListArticle(list, {
                        onRefresh: () => loadFeedsTab(),
                        targetContainerId: 'feed-list',
                        onBack: () => loadFeedsTab()
                    });
                    container.appendChild(article);
                    state.currentPosts.push(article);
                });
                announcePolite(`${res.lists.length} listas carregadas.`);
            } else {
                container.innerHTML = '<p>Nenhuma lista encontrada.</p>';
            }
        } else if (state.feedsTabMode === 'discover') {
            const queryInput = document.getElementById('discover-feed-search-input') as HTMLInputElement;
            const query = queryInput ? queryInput.value : "";
            const res = await window.go.services.FeedService.GetPopularFeedGenerators("", query);
            container.innerHTML = `
                <div style="margin-bottom: 15px; display: flex; gap: 10px;">
                    <input type="search" id="discover-feed-search-input" placeholder="Pesquisar feeds por palavra-chave..." value="${query}" style="flex:1; padding:6px;" />
                    <button type="button" id="btn-search-discover-feeds" style="padding:6px 12px;">Buscar Feeds</button>
                </div>
                <div id="discover-feeds-list"></div>
            `;

            document.getElementById('btn-search-discover-feeds')?.addEventListener('click', () => loadFeedsTab());
            document.getElementById('discover-feed-search-input')?.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    loadFeedsTab();
                }
            });

            const feedsListContainer = document.getElementById('discover-feeds-list') as HTMLDivElement;
            if (res && res.feeds && res.feeds.length > 0) {
                res.feeds.forEach((feed: any) => {
                    const alreadySaved = (state.savedFeeds || []).some((f: any) => f.uri === feed.uri);
                    const div = document.createElement('article');
                    div.classList.add('post-item');
                    div.setAttribute('role', 'article');
                    div.setAttribute('tabindex', '0');
                    div.dataset.index = state.currentPosts.length.toString();
                    div.dataset.uri = feed.uri;
                    div.innerHTML = `
                        <h3>${feed.displayName}</h3>
                        <p>${feed.description || "Sem descrição"}</p>
                        <small>Criado por: @${feed.creator}</small>
                        <div style="font-size: 0.8em; margin-top: 5px;">Curtidas: ${feed.likeCount}</div>
                        <div class="actions" style="margin-top: 10px; display:flex; gap:10px;">
                            <button class="btn-open-feed" data-uri="${feed.uri}">Abrir Feed</button>
                            <button class="btn-save-feed" data-uri="${feed.uri}" ${alreadySaved ? 'disabled aria-disabled="true"' : ''}>${alreadySaved ? 'Já Salvo' : 'Salvar Feed'}</button>
                        </div>
                    `;
                    div.querySelector('.btn-open-feed')?.addEventListener('click', (e) => {
                        e.stopPropagation();
                        state.currentFeedUri = feed.uri;
                        switchTab('timeline');
                        announcePolite(`Feed ${feed.displayName} carregado na timeline.`);
                    });
                    div.querySelector('.btn-save-feed')?.addEventListener('click', async (e) => {
                        e.stopPropagation();
                        if (alreadySaved) return;
                        try {
                            const existingUris = (state.savedFeeds || []).map((f: any) => f.uri);
                            const pinnedUris = (state.savedFeeds || []).filter((f: any) => f.pinned).map((f: any) => f.uri);
                            existingUris.push(feed.uri);
                            await window.go.services.SocialService.UpdateSavedFeeds(pinnedUris, existingUris);
                            announceAssertive(`Feed "${feed.displayName}" salvo com sucesso!`);
                            loadFeedsTab();
                        } catch (err) {
                            announceAssertive("Erro ao salvar feed.");
                        }
                    });
                    div.addEventListener('click', () => {
                        state.currentFeedUri = feed.uri;
                        switchTab('timeline');
                        announcePolite(`Feed ${feed.displayName} carregado na timeline.`);
                    });
                    div.addEventListener('keydown', (e) => {
                        if (e.key === 'Enter') {
                            e.preventDefault();
                            state.currentFeedUri = feed.uri;
                            switchTab('timeline');
                        }
                    });
                    div.addEventListener('focus', () => {
                        const idx = parseInt(div.dataset.index || "-1");
                        if (!isNaN(idx) && idx >= 0) {
                            state.focusedPostIndex = idx;
                        }
                    });
                    (feedsListContainer || container).appendChild(div);
                    state.currentPosts.push(div);
                });
                announcePolite(`${res.feeds.length} feeds populares carregados.`);
            } else {
                if (feedsListContainer) feedsListContainer.innerHTML = '<p>Nenhum feed popular encontrado.</p>';
                else container.innerHTML = '<p>Nenhum feed popular encontrado.</p>';
            }
        }
    } catch (err) {
        console.error(err);
        container.innerHTML = '<p>Erro ao carregar feeds.</p>';
        announceAssertive("Erro ao carregar feeds.");
    } finally {
        container.setAttribute('aria-busy', 'false');
        state.tabStates['feeds'].loaded = true;
        if (state.currentPosts.length > 0) {
            state.focusedPostIndex = 0;
            state.currentPosts[0].focus();
        } else {
            state.focusedPostIndex = -1;
        }
    }
}
