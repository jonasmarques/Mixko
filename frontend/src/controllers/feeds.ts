import { esc } from '../utils/helpers';
import { state } from '../config/state';
import { announcePolite, announceAssertive } from '../utils/a11y';
import { confirmDialog } from '../utils/dialog';
import { switchTab } from './tabs';
import { openTrendLink } from './link_router';
import { createListArticle } from '../components/list';
import { formatPostDate } from '../utils/format';
import { i18n } from '../utils/i18n';
import { TrendDTO } from '../types/dto';

interface SavedFeedItem {
    uri: string;
    cid?: string;
    displayName: string;
    creator?: string;
    pinned: boolean;
}

export async function loadFeedsTab() {
    const container = document.getElementById('feed-list') as HTMLDivElement;
    if (!container) return;

    // Check if search input element exists before resetting innerHTML to preserve typed query
    const existingInput = document.getElementById('discover-feed-search-input') as HTMLInputElement | null;
    if (existingInput) {
        state.discoverFeedSearchQuery = existingInput.value;
    }

    container.setAttribute('aria-busy', 'true');
    container.innerHTML = `<div style="padding: 20px;">${i18n.t('feeds.loading')}</div>`;
    
    // Setup tabs
    ['saved', 'lists', 'discover', 'trending'].forEach(mode => {
        const btn = document.getElementById(`ftab-${mode}`);
        if (btn) {
            const isActive = state.feedsTabMode === mode;
            btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
            btn.setAttribute('tabindex', isActive ? '0' : '-1');
            btn.style.fontWeight = isActive ? 'bold' : 'normal';
            btn.onclick = () => {
                if (state.feedsTabMode !== mode) {
                    state.feedsTabMode = mode as 'saved' | 'lists' | 'discover' | 'trending';
                    loadFeedsTab();
                }
            };
        }
    });

    state.currentPosts = [];

    // Always fetch latest saved feeds first so state.savedFeeds is up-to-date across all sub-tabs
    try {
        const savedRes = await window.go.services.FeedService.GetSavedFeeds();
        state.savedFeeds = savedRes || [];
    } catch (e) {
        console.warn("Failed to fetch saved feeds:", e);
    }

    try {
        if (state.feedsTabMode === 'saved') {
            container.innerHTML = '';
            
            // Render default "Seguindo" (Following) home timeline feed item
            const followingDiv = document.createElement('article');
            followingDiv.classList.add('post-item');
            followingDiv.setAttribute('role', 'article');
            followingDiv.setAttribute('tabindex', '0');
            followingDiv.dataset.index = state.currentPosts.length.toString();
            followingDiv.dataset.uri = "";
            followingDiv.innerHTML = `
                <h3>${i18n.t('feeds.followingMain')}</h3>
                <small>${i18n.t('feeds.followingDesc')}</small>
                <div class="actions" style="margin-top: 10px; display:flex; gap:10px;">
                    <button class="btn-open-feed" data-uri="">${i18n.t('feeds.openFeed')}</button>
                </div>
            `;
            followingDiv.querySelector('.btn-open-feed')?.addEventListener('click', (e) => {
                e.stopPropagation();
                state.currentFeedUri = "";
                switchTab('timeline');
                announcePolite(i18n.t('feeds.mainFeedLoaded'));
            });
            followingDiv.addEventListener('click', () => {
                state.currentFeedUri = "";
                switchTab('timeline');
                announcePolite(i18n.t('feeds.mainFeedLoaded'));
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
                state.savedFeeds.forEach((feed: SavedFeedItem, index: number) => {
                    const div = document.createElement('article');
                    div.classList.add('post-item');
                    div.setAttribute('role', 'article');
                    div.setAttribute('tabindex', '0');
                    div.dataset.index = state.currentPosts.length.toString();
                    div.dataset.uri = feed.uri;
                    const shortcutBadge = index < 9 ? ` <strong>(Atalho: Alt+Shift+${index + 1})</strong>` : '';
                    const pinnedBadge = feed.pinned ? i18n.t('feeds.pinnedBadge') : '';
                    const pinBtnLabel = feed.pinned ? i18n.t('feeds.unpin') : i18n.t('feeds.pin');
                    div.innerHTML = `
                        <h3>${esc(feed.displayName)}${pinnedBadge}</h3>
                        <small>${i18n.t('feeds.createdBy', { creator: feed.creator || '' })}${shortcutBadge}</small>
                        <div class="actions" style="margin-top: 10px; display:flex; gap:10px; flex-wrap:wrap;">
                            <button class="btn-open-feed" data-uri="${feed.uri}">${i18n.t('feeds.openFeed')}</button>
                            <button class="btn-pin-feed" data-uri="${feed.uri}" data-pinned="${feed.pinned ? '1' : '0'}">${pinBtnLabel}</button>
                            <button class="btn-remove-feed" data-uri="${feed.uri}" style="background:#d32f2f; color:#fff; border:none; border-radius:4px; padding:4px 8px;">${i18n.t('feeds.remove')}</button>
                        </div>
                    `;
                    div.querySelector('.btn-open-feed')?.addEventListener('click', (e) => {
                        e.stopPropagation();
                        state.currentFeedUri = feed.uri;
                        switchTab('timeline');
                        announcePolite(i18n.t('feeds.feedLoaded', { displayName: feed.displayName }));
                    });
                    div.querySelector('.btn-pin-feed')?.addEventListener('click', async (e) => {
                        e.stopPropagation();
                        const isPinned = feed.pinned;
                        const allSavedUris = state.savedFeeds.map((f: SavedFeedItem) => f.uri);
                        const currentPinned = state.savedFeeds.filter((f: SavedFeedItem) => f.pinned && f.uri !== feed.uri).map((f: SavedFeedItem) => f.uri);
                        const newPinned = isPinned ? currentPinned : [...currentPinned, feed.uri];
                        try {
                            await window.go.services.SocialService.UpdateSavedFeeds(newPinned, allSavedUris);
                            announceAssertive(isPinned ? i18n.t('feeds.feedUnpinned', { displayName: feed.displayName }) : i18n.t('feeds.feedPinned', { displayName: feed.displayName }));
                            loadFeedsTab();
                        } catch (err) {
                            announceAssertive(i18n.t('feeds.feedUpdateError'));
                        }
                    });
                    div.querySelector('.btn-remove-feed')?.addEventListener('click', async (e) => {
                        e.stopPropagation();
                        if (await confirmDialog(i18n.t('feeds.confirmRemove', { displayName: feed.displayName }), i18n.t('feeds.removeFeedTitle'))) {
                            const newSaved = state.savedFeeds.filter((f: SavedFeedItem) => f.uri !== feed.uri).map((f: SavedFeedItem) => f.uri);
                            const newPinned = state.savedFeeds.filter((f: SavedFeedItem) => f.pinned && f.uri !== feed.uri).map((f: SavedFeedItem) => f.uri);
                            try {
                                await window.go.services.SocialService.UpdateSavedFeeds(newPinned, newSaved);
                                announceAssertive(i18n.t('feeds.feedRemoved'));
                                loadFeedsTab();
                            } catch (err) {
                                announceAssertive(i18n.t('feeds.feedUpdateError'));
                            }
                        }
                    });
                    div.addEventListener('click', () => {
                        state.currentFeedUri = feed.uri;
                        switchTab('timeline');
                        announcePolite(i18n.t('feeds.feedLoaded', { displayName: feed.displayName }));
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
                announcePolite(i18n.t('feeds.availableFeeds', { count: (state.savedFeeds.length + 1).toString() }));
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
                announcePolite(i18n.t('feeds.listsLoaded', { count: res.lists.length.toString() }));
            } else {
                container.innerHTML = `<p>${i18n.t('feeds.noListFound')}</p>`;
            }
        } else if (state.feedsTabMode === 'discover') {
            const query = state.discoverFeedSearchQuery || "";
            const res = await window.go.services.FeedService.GetPopularFeedGenerators("", query);
            container.innerHTML = `
                <div style="margin-bottom: 15px; display: flex; gap: 10px;">
                    <input type="search" id="discover-feed-search-input" placeholder="${i18n.t('feeds.searchFeedsPlaceholder')}" value="${query}" style="flex:1; padding:6px;" />
                    <button type="button" id="btn-search-discover-feeds" style="padding:6px 12px;">${i18n.t('feeds.searchFeedsBtn')}</button>
                </div>
                <div id="discover-feeds-list"></div>
            `;

            const triggerSearch = () => {
                const searchInput = document.getElementById('discover-feed-search-input') as HTMLInputElement;
                state.discoverFeedSearchQuery = searchInput ? searchInput.value.trim() : "";
                loadFeedsTab();
            };

            document.getElementById('btn-search-discover-feeds')?.addEventListener('click', triggerSearch);
            document.getElementById('discover-feed-search-input')?.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    triggerSearch();
                }
            });

            const feedsListContainer = document.getElementById('discover-feeds-list') as HTMLDivElement;
            if (res && res.feeds && res.feeds.length > 0) {
                res.feeds.forEach((feed: any) => {
                    const savedItem = (state.savedFeeds || []).find((f: SavedFeedItem) => f.uri === feed.uri);
                    const isSaved = !!savedItem;
                    const isPinned = savedItem ? savedItem.pinned : false;

                    const statusBadge = isPinned ? i18n.t('feeds.pinnedBadge') : (isSaved ? i18n.t('feeds.savedBadge') : '');

                    const div = document.createElement('article');
                    div.classList.add('post-item');
                    div.setAttribute('role', 'article');
                    div.setAttribute('tabindex', '0');
                    div.dataset.index = state.currentPosts.length.toString();
                    div.dataset.uri = feed.uri;

                    let actionButtonsHtml = `<button class="btn-open-feed" data-uri="${feed.uri}">${i18n.t('feeds.openFeed')}</button>`;
                    if (!isSaved) {
                        actionButtonsHtml += `
                            <button class="btn-save-feed" data-uri="${feed.uri}">${i18n.t('feeds.saveFeed')}</button>
                            <button class="btn-pin-feed" data-uri="${feed.uri}">${i18n.t('feeds.pin')}</button>
                        `;
                    } else {
                        const pinLabel = isPinned ? i18n.t('feeds.unpin') : i18n.t('feeds.pin');
                        actionButtonsHtml += `
                            <button class="btn-pin-feed" data-uri="${esc(feed.uri)}">${esc(pinLabel)}</button>
                            <button class="btn-remove-feed" data-uri="${feed.uri}" style="background:#d32f2f; color:#fff; border:none; border-radius:4px; padding:4px 8px;">${i18n.t('feeds.remove')}</button>
                        `;
                    }

                    div.innerHTML = `
                        <h3>${esc(feed.displayName)}${statusBadge}</h3>
                        <p>${feed.description || i18n.t('feeds.noDescription')}</p>
                        <small>${i18n.t('feeds.createdBy', { creator: feed.creator })}</small>
                        <div style="font-size: 0.8em; margin-top: 5px;">${i18n.t('feeds.likes', { count: (feed.likeCount || 0).toString() })}</div>
                        <div class="actions" style="margin-top: 10px; display:flex; gap:10px; flex-wrap:wrap;">
                            ${actionButtonsHtml}
                        </div>
                    `;

                    div.querySelector('.btn-open-feed')?.addEventListener('click', (e) => {
                        e.stopPropagation();
                        state.currentFeedUri = feed.uri;
                        switchTab('timeline');
                        announcePolite(i18n.t('feeds.feedLoaded', { displayName: feed.displayName }));
                    });

                    div.querySelector('.btn-save-feed')?.addEventListener('click', async (e) => {
                        e.stopPropagation();
                        try {
                            const existingUris = (state.savedFeeds || []).map((f: SavedFeedItem) => f.uri);
                            const pinnedUris = (state.savedFeeds || []).filter((f: SavedFeedItem) => f.pinned).map((f: SavedFeedItem) => f.uri);
                            if (!existingUris.includes(feed.uri)) {
                                existingUris.push(feed.uri);
                            }
                            await window.go.services.SocialService.UpdateSavedFeeds(pinnedUris, existingUris);
                            announceAssertive(i18n.t('feeds.feedSaved', { displayName: feed.displayName }));
                            loadFeedsTab();
                        } catch (err) {
                            announceAssertive(i18n.t('feeds.feedSaveError'));
                        }
                    });

                    div.querySelector('.btn-pin-feed')?.addEventListener('click', async (e) => {
                        e.stopPropagation();
                        try {
                            const existingUris = (state.savedFeeds || []).map((f: SavedFeedItem) => f.uri);
                            if (!existingUris.includes(feed.uri)) {
                                existingUris.push(feed.uri);
                            }
                            const currentPinned = (state.savedFeeds || []).filter((f: SavedFeedItem) => f.pinned && f.uri !== feed.uri).map((f: SavedFeedItem) => f.uri);
                            const newPinned = isPinned ? currentPinned : [...currentPinned, feed.uri];
                            await window.go.services.SocialService.UpdateSavedFeeds(newPinned, existingUris);
                            announceAssertive(isPinned ? i18n.t('feeds.feedUnpinned', { displayName: feed.displayName }) : i18n.t('feeds.feedPinned', { displayName: feed.displayName }));
                            loadFeedsTab();
                        } catch (err) {
                            announceAssertive(i18n.t('feeds.feedUpdateError'));
                        }
                    });

                    div.querySelector('.btn-remove-feed')?.addEventListener('click', async (e) => {
                        e.stopPropagation();
                        if (await confirmDialog(i18n.t('feeds.confirmRemove', { displayName: feed.displayName }), i18n.t('feeds.removeFeedTitle'))) {
                            try {
                                const newSaved = (state.savedFeeds || []).filter((f: SavedFeedItem) => f.uri !== feed.uri).map((f: SavedFeedItem) => f.uri);
                                const newPinned = (state.savedFeeds || []).filter((f: SavedFeedItem) => f.pinned && f.uri !== feed.uri).map((f: SavedFeedItem) => f.uri);
                                await window.go.services.SocialService.UpdateSavedFeeds(newPinned, newSaved);
                                announceAssertive(i18n.t('feeds.feedRemoved'));
                                loadFeedsTab();
                            } catch (err) {
                                announceAssertive(i18n.t('feeds.feedUpdateError'));
                            }
                        }
                    });

                    div.addEventListener('click', () => {
                        state.currentFeedUri = feed.uri;
                        switchTab('timeline');
                        announcePolite(i18n.t('feeds.feedLoaded', { displayName: feed.displayName }));
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
                announcePolite(i18n.t('feeds.popularFeedsLoaded', { count: res.feeds.length.toString() }));
            } else {
                if (feedsListContainer) feedsListContainer.innerHTML = `<p>${i18n.t('feeds.noPopularFeedFound')}</p>`;
                else container.innerHTML = `<p>${i18n.t('feeds.noPopularFeedFound')}</p>`;
            }
        } else if (state.feedsTabMode === 'trending') {
            const res = await window.go.services.FeedService.GetTrends(25);
            container.innerHTML = '';

            if (res && res.trends && res.trends.length > 0) {
                res.trends.forEach((trend: TrendDTO) => {
                    const name = trend.displayName || trend.topic;
                    const startedAt = trend.startedAt ? formatPostDate(trend.startedAt) : "";

                    const details: string[] = [i18n.t('feeds.trendPosts', { count: (trend.postCount || 0).toString() })];
                    if (trend.category && trend.category !== 'other') details.push(trend.category);
                    if (startedAt) details.push(i18n.t('feeds.trendStartedAt', { date: startedAt }));

                    const div = document.createElement('article');
                    div.classList.add('post-item');
                    div.setAttribute('role', 'article');
                    div.setAttribute('tabindex', '0');
                    div.dataset.index = state.currentPosts.length.toString();
                    div.dataset.text = i18n.t('feeds.trendAria', {
                        name,
                        description: trend.description || i18n.t('feeds.trendNoDescription'),
                        details: details.join(', ')
                    });

                    const hotBadge = trend.status === 'hot' ? ` <small>${i18n.t('feeds.trendHot')}</small>` : '';
                    div.innerHTML = `
                        <h3>${esc(name)}${hotBadge}</h3>
                        ${trend.description ? `<p>${esc(trend.description)}</p>` : ''}
                        <div style="font-size: 0.85em; margin-top: 5px;">${esc(details.join(' · '))}</div>
                    `;

                    const openTrend = () => openTrendLink(trend.link, name);
                    div.addEventListener('click', openTrend);
                    div.addEventListener('keydown', (e) => {
                        if (e.key === 'Enter') {
                            e.preventDefault();
                            openTrend();
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
                announcePolite(i18n.t('feeds.trendsLoaded', { count: res.trends.length.toString() }));
            } else {
                container.innerHTML = `<p>${i18n.t('feeds.noTrendsFound')}</p>`;
                announcePolite(i18n.t('feeds.noTrendsFound'));
            }
        }
    } catch (err) {
        console.error(err);
        container.innerHTML = `<p>${i18n.t('feeds.loadFeedsError')}</p>`;
        announceAssertive(i18n.t('feeds.loadFeedsError'));
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
