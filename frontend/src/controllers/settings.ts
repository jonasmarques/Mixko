import { esc, linkify, renderProfileLink } from '../utils/helpers';
import { state } from '../config/state';
import { announcePolite, announceAssertive, getPostAccessibleLabel } from '../utils/a11y';
import { confirmDialog, promptDialog } from '../utils/dialog';
import { switchTab } from './tabs';
import { captureIdentity } from './auth';
import { loadTimeline } from './timeline';
import { i18n } from '../utils/i18n';
import { NotificationPreferencesDTO, NotificationFilterablePrefDTO, NotificationSimplePrefDTO, SavedAccountDTO, AppPasswordDTO, ProfileDTO, LabelerDTO } from '../types/dto';

type FilterableKey = 'like' | 'repost' | 'reply' | 'mention' | 'quote' | 'follow' | 'likeViaRepost' | 'repostViaRepost';
type SimpleKey = 'subscribedPost' | 'starterpackJoined' | 'verified' | 'unverified';

const FILTERABLE_KEYS: FilterableKey[] = [
    'like', 'repost', 'reply', 'mention', 'quote', 'follow', 'likeViaRepost', 'repostViaRepost'
];

const SIMPLE_KEYS: SimpleKey[] = [
    'subscribedPost', 'starterpackJoined', 'verified', 'unverified'
];

export function populateNotificationPreferences(prefs: NotificationPreferencesDTO): void {
    const priorityCheckbox = document.getElementById('notif-pref-priority') as HTMLInputElement | null;
    if (priorityCheckbox) {
        priorityCheckbox.checked = Boolean(prefs.priority);
    }

    FILTERABLE_KEYS.forEach(key => {
        const pref = prefs[key];
        const listEl = document.getElementById(`notif-list-${key}`) as HTMLInputElement | null;
        const pushEl = document.getElementById(`notif-push-${key}`) as HTMLInputElement | null;
        const includeEl = document.getElementById(`notif-include-${key}`) as HTMLSelectElement | null;
        if (listEl && pref) listEl.checked = Boolean(pref.list);
        if (pushEl && pref) pushEl.checked = Boolean(pref.push);
        if (includeEl && pref) includeEl.value = pref.include || 'all';
    });

    const chatPref = prefs.chat;
    const chatPushEl = document.getElementById('notif-push-chat') as HTMLInputElement | null;
    const chatIncludeEl = document.getElementById('notif-include-chat') as HTMLSelectElement | null;
    if (chatPushEl && chatPref) chatPushEl.checked = Boolean(chatPref.push);
    if (chatIncludeEl && chatPref) chatIncludeEl.value = chatPref.include || 'all';

    SIMPLE_KEYS.forEach(key => {
        const pref = prefs[key];
        const listEl = document.getElementById(`notif-list-${key}`) as HTMLInputElement | null;
        const pushEl = document.getElementById(`notif-push-${key}`) as HTMLInputElement | null;
        if (listEl && pref) listEl.checked = Boolean(pref.list);
        if (pushEl && pref) pushEl.checked = Boolean(pref.push);
    });
}

export function getNotificationPreferencesFromDOM(): NotificationPreferencesDTO {
    const priorityCheckbox = document.getElementById('notif-pref-priority') as HTMLInputElement | null;
    const priority = priorityCheckbox ? priorityCheckbox.checked : false;

    const chatPushEl = document.getElementById('notif-push-chat') as HTMLInputElement | null;
    const chatIncludeEl = document.getElementById('notif-include-chat') as HTMLSelectElement | null;

    const readFilterable = (key: FilterableKey): NotificationFilterablePrefDTO => {
        const listEl = document.getElementById(`notif-list-${key}`) as HTMLInputElement | null;
        const pushEl = document.getElementById(`notif-push-${key}`) as HTMLInputElement | null;
        const includeEl = document.getElementById(`notif-include-${key}`) as HTMLSelectElement | null;
        return {
            list: listEl ? listEl.checked : true,
            push: pushEl ? pushEl.checked : true,
            include: includeEl ? includeEl.value : 'all',
        };
    };

    const readSimple = (key: SimpleKey): NotificationSimplePrefDTO => {
        const listEl = document.getElementById(`notif-list-${key}`) as HTMLInputElement | null;
        const pushEl = document.getElementById(`notif-push-${key}`) as HTMLInputElement | null;
        return {
            list: listEl ? listEl.checked : true,
            push: pushEl ? pushEl.checked : true,
        };
    };

    return {
        priority,
        chat: {
            push: chatPushEl ? chatPushEl.checked : true,
            include: chatIncludeEl ? chatIncludeEl.value : 'all',
        },
        like: readFilterable('like'),
        repost: readFilterable('repost'),
        reply: readFilterable('reply'),
        mention: readFilterable('mention'),
        quote: readFilterable('quote'),
        follow: readFilterable('follow'),
        likeViaRepost: readFilterable('likeViaRepost'),
        repostViaRepost: readFilterable('repostViaRepost'),
        subscribedPost: readSimple('subscribedPost'),
        starterpackJoined: readSimple('starterpackJoined'),
        verified: readSimple('verified'),
        unverified: readSimple('unverified'),
    };
}

const STANDARD_LABELS = ['nsfw', 'porn', 'sexual', 'nudity', 'graphic-media', 'gore', 'spam'];

export function renderMutedWords(listElement: HTMLUListElement) {
    listElement.innerHTML = '';
    state.mutedWordsCache.forEach((word, index) => {
        const li = document.createElement('li');
        li.style.marginBottom = '5px';
        li.innerHTML = `
            <span>${esc(word)}</span>
            <button type="button" aria-label="${esc(i18n.t('app.remove') + ' ' + word)}" data-index="${index}" style="margin-left: 10px;">${i18n.t('app.remove')}</button>
        `;
        li.querySelector('button')?.addEventListener('click', () => {
            state.mutedWordsCache.splice(index, 1);
            renderMutedWords(listElement);
            announcePolite(i18n.t('settingsMsgs.wordRemoved', { word }));
        });
        listElement.appendChild(li);
    });
}

function renderContentFilters(container: HTMLDivElement, filters: Array<{ label: string; visibility: string; labelerDid?: string }>) {
    container.innerHTML = '';
    // Map existing filters by label
    const filterMap = new Map<string, string>();
    filters.forEach(f => {
        if (f && f.label) {
            filterMap.set(f.label, f.visibility);
        }
    });

    const allLabels = Array.from(new Set([...STANDARD_LABELS, ...Array.from(filterMap.keys())]));

    allLabels.forEach(label => {
        const rawVis = filterMap.get(label) || 'warn';
        const isIgnore = rawVis === 'ignore' || rawVis === 'show';
        const isWarn = rawVis === 'warn';
        const isHide = rawVis === 'hide';

        const div = document.createElement('div');
        div.style.display = 'flex';
        div.style.justifyContent = 'space-between';
        div.style.alignItems = 'center';
        div.style.padding = '5px 0';
        div.style.borderBottom = '1px solid #eee';
        div.innerHTML = `
            <span><strong>${esc(label)}</strong></span>
            <select class="content-filter-select" data-label="${esc(label)}">
                <option value="ignore" ${isIgnore ? 'selected' : ''}>${i18n.t('settingsMsgs.filterShow')}</option>
                <option value="warn" ${isWarn ? 'selected' : ''}>${i18n.t('settingsMsgs.filterWarn')}</option>
                <option value="hide" ${isHide ? 'selected' : ''}>${i18n.t('settingsMsgs.filterHide')}</option>
            </select>
        `;
        container.appendChild(div);
    });
}

export function applyFontSize(size: string) {
    let scale = 1.0;
    if (size === 'large') scale = 1.2;
    else if (size === 'x-large') scale = 1.4;
    else if (size === 'huge') scale = 1.6;
    document.documentElement.style.setProperty('--font-scale', scale.toString());
}

export function loadLocalSettings() {
    const themeSelect = document.getElementById('theme-select') as HTMLSelectElement;
    const dateFormatSelect = document.getElementById('date-format-select') as HTMLSelectElement;
    const nameDisplayFormatSelect = document.getElementById('name-display-format-select') as HTMLSelectElement;
    const notificationFormatSelect = document.getElementById('notification-format-select') as HTMLSelectElement;
    const fontSizeSelect = document.getElementById('font-size-select') as HTMLSelectElement;
    const hideRepliesCheckbox = document.getElementById('setting-hide-replies') as HTMLInputElement;
    const langOverrideSelect = document.getElementById('lang-override-select') as HTMLSelectElement;

    const savedTheme = localStorage.getItem('theme') || 'system';
    if (themeSelect) themeSelect.value = savedTheme;

    const savedLang = localStorage.getItem('app-language') || '';
    if (langOverrideSelect) langOverrideSelect.value = savedLang;

    const savedFontSize = (localStorage.getItem('fontSize') as 'normal' | 'large' | 'x-large' | 'huge') || 'normal';
    state.fontSize = savedFontSize;
    if (fontSizeSelect) fontSizeSelect.value = savedFontSize;
    applyFontSize(savedFontSize);

    const savedHideReplies = localStorage.getItem('hideReplies') === 'true';
    state.hideReplies = savedHideReplies;
    if (hideRepliesCheckbox) hideRepliesCheckbox.checked = savedHideReplies;

    const savedDateFormat = (localStorage.getItem('dateFormat') as 'relative' | 'exact') || 'relative';
    state.dateFormat = savedDateFormat;
    if (dateFormatSelect) dateFormatSelect.value = savedDateFormat;

    const savedNameFormat = (localStorage.getItem('nameDisplayFormat') as 'name' | 'nameAndHandle' | 'handle') || 'name';
    state.nameDisplayFormat = savedNameFormat;
    if (nameDisplayFormatSelect) nameDisplayFormatSelect.value = savedNameFormat;

    const savedNotifFormat = (localStorage.getItem('notificationFormat') as 'combined' | 'individual') || 'combined';
    state.notificationFormat = savedNotifFormat;
    if (notificationFormatSelect) notificationFormatSelect.value = savedNotifFormat;

    const savedMutedBehavior = (localStorage.getItem('mutedWordsBehavior') as 'hide' | 'warn') || 'hide';
    state.mutedWordsBehavior = savedMutedBehavior;
    const radioHide = document.getElementById('muted-behavior-hide') as HTMLInputElement | null;
    const radioWarn = document.getElementById('muted-behavior-warn') as HTMLInputElement | null;
    if (radioHide && radioWarn) {
        if (savedMutedBehavior === 'warn') {
            radioWarn.checked = true;
        } else {
            radioHide.checked = true;
        }
    }
}

export async function hydrateStartupPreferences(): Promise<void> {
    loadLocalSettings();

    const mutedList = document.getElementById('muted-words-list') as HTMLUListElement | null;
    const adultContentCheckbox = document.getElementById('setting-adult-content') as HTMLInputElement | null;
    const sortSelect = document.getElementById('thread-sort-select') as HTMLSelectElement | null;
    const prioCheckbox = document.getElementById('setting-prioritize-followed') as HTMLInputElement | null;
    const contentFiltersContainer = document.getElementById('content-filters-list') as HTMLDivElement | null;

    const prefs = await window.go.services.SocialService.GetPreferences();
    if (!prefs) return;

    state.adultContentCache = prefs.adultContentEnabled || false;
    if (adultContentCheckbox) adultContentCheckbox.checked = state.adultContentCache;

    state.mutedWordsCache = (prefs.mutedWords || []).map((mw: { value: string }) => mw.value);
    if (mutedList) renderMutedWords(mutedList);

    if (sortSelect && prefs.threadSort) sortSelect.value = prefs.threadSort;
    if (prioCheckbox) prioCheckbox.checked = Boolean(prefs.threadPrioritizeFollowed);

    if (contentFiltersContainer) {
        renderContentFilters(contentFiltersContainer, prefs.contentFilters || []);
    }

    state.hiddenPostUris = prefs.hiddenPosts || [];
    state.hideVerificationBadges = Boolean(prefs.hideVerificationBadges);
    const hideBadgesCb = document.getElementById('setting-hide-verification-badges') as HTMLInputElement | null;
    if (hideBadgesCb) hideBadgesCb.checked = state.hideVerificationBadges;

    state.feedViewHideReposts = Boolean(prefs.hideReposts);
    state.feedViewHideQuotePosts = Boolean(prefs.hideQuotePosts);
    state.feedViewHideRepliesByUnfollowed = Boolean(prefs.hideRepliesByUnfollowed);
    const hideRepostsCb = document.getElementById('setting-hide-reposts') as HTMLInputElement | null;
    const hideQuotesCb = document.getElementById('setting-hide-quote-posts') as HTMLInputElement | null;
    const hideUnfollowedCb = document.getElementById('setting-hide-replies-unfollowed') as HTMLInputElement | null;
    if (hideRepostsCb) hideRepostsCb.checked = state.feedViewHideReposts;
    if (hideQuotesCb) hideQuotesCb.checked = state.feedViewHideQuotePosts;
    if (hideUnfollowedCb) hideUnfollowedCb.checked = state.feedViewHideRepliesByUnfollowed;

    const defGateSel = document.getElementById('setting-default-threadgate') as HTMLSelectElement | null;
    const defDisQuotesCb = document.getElementById('setting-default-disable-quotes') as HTMLInputElement | null;
    if (defGateSel && prefs.defaultThreadgateRules && prefs.defaultThreadgateRules.length > 0) {
        const rawRule = prefs.defaultThreadgateRules.join(',');
        const normalized = rawRule === 'everyone' ? 'everybody' : rawRule;
        defGateSel.value = normalized;
        localStorage.setItem('postThreadgate', normalized === 'everybody' ? 'everyone' : normalized);
    }
    if (defDisQuotesCb) defDisQuotesCb.checked = Boolean(prefs.defaultDisableQuotes);

    const interestsInput = document.getElementById('setting-interests-input') as HTMLInputElement | null;
    if (interestsInput) interestsInput.value = (prefs.interests || []).join(', ');
}

export async function loadSettings() {
    try {
        const loadMutes = async () => {
            const mutedRes = await window.go.services.ModerationService.GetMutes("");
            const mutedListDiv = document.getElementById('muted-users-list');
            if (mutedListDiv && mutedRes && mutedRes.profiles) {
                mutedListDiv.innerHTML = '';
                if (mutedRes.profiles.length === 0) {
                    mutedListDiv.innerHTML = `<p>${i18n.t('settingsMsgs.noMuted')}</p>`;
                }
                mutedRes.profiles.forEach((p: ProfileDTO) => {
                    const div = document.createElement('div');
                    div.style.padding = '5px';
                    div.style.borderBottom = '1px solid #ccc';
                    div.innerHTML = `<span>${renderProfileLink(p.handle)}</span> <button class="btn-unmute" style="float: right;" data-did="${esc(p.did)}" data-handle="${esc(p.handle)}">${i18n.t('settingsMsgs.btnUnmute')}</button>`;
                    mutedListDiv.appendChild(div);
                });
                mutedListDiv.querySelectorAll('.btn-unmute').forEach(btn => {
                    btn.addEventListener('click', async (e) => {
                        e.preventDefault();
                        const target = e.currentTarget as HTMLButtonElement;
                        const did = target.dataset.did!;
                        const handle = target.dataset.handle!;
                        if (await confirmDialog(i18n.t('settingsMsgs.unmuteConfirm', { handle }), i18n.t('settingsMsgs.btnUnmute'))) {
                            await window.go.services.ModerationService.UnmuteActor(did);
                            announceAssertive(i18n.t('settingsMsgs.unmuteSuccess', { handle }));
                            target.parentElement?.remove();
                        }
                    });
                });
            }
        };

        const loadBlocks = async () => {
            const blockedRes = await window.go.services.ModerationService.GetBlocks("");
            const blockedListDiv = document.getElementById('blocked-users-list');
            if (blockedListDiv && blockedRes && blockedRes.profiles) {
                blockedListDiv.innerHTML = '';
                if (blockedRes.profiles.length === 0) {
                    blockedListDiv.innerHTML = `<p>${i18n.t('settingsMsgs.noBlocked')}</p>`;
                }
                blockedRes.profiles.forEach((p: ProfileDTO) => {
                    const div = document.createElement('div');
                    div.style.padding = '5px';
                    div.style.borderBottom = '1px solid #ccc';
                    div.innerHTML = `<span>${renderProfileLink(p.handle)}</span> <button class="btn-unblock" style="float: right;" data-did="${esc(p.did)}" data-handle="${esc(p.handle)}">${i18n.t('settingsMsgs.btnUnblock')}</button>`;
                    blockedListDiv.appendChild(div);
                });
                blockedListDiv.querySelectorAll('.btn-unblock').forEach(btn => {
                    btn.addEventListener('click', async (e) => {
                        e.preventDefault();
                        const target = e.currentTarget as HTMLButtonElement;
                        const did = target.dataset.did!;
                        const handle = target.dataset.handle!;
                        if (await confirmDialog(i18n.t('settingsMsgs.unblockConfirm', { handle }), i18n.t('settingsMsgs.btnUnblock'))) {
                            await window.go.services.ModerationService.UnblockActor(did);
                            announceAssertive(i18n.t('settingsMsgs.unblockSuccess', { handle }));
                            target.parentElement?.remove();
                        }
                    });
                });
            }
        };

        const loadLabelers = async () => {
            const subscribedLabelersListDiv = document.getElementById('subscribed-labelers-list');
            if (!subscribedLabelersListDiv) return;
            try {
                subscribedLabelersListDiv.innerHTML = i18n.t('app.loading');
                const labelers = await window.go.services.SocialService.GetSubscribedLabelers();
                subscribedLabelersListDiv.innerHTML = '';
                if (!labelers || labelers.length === 0) {
                    subscribedLabelersListDiv.innerHTML = `<p style="color: #888; font-size: 0.9em;">${i18n.t('settingsMsgs.noLabelers')}</p>`;
                } else {
                    labelers.forEach((l: LabelerDTO) => {
                        const div = document.createElement('div');
                        div.style.display = 'flex';
                        div.style.alignItems = 'center';
                        div.style.justifyContent = 'space-between';
                        div.style.padding = '8px 12px';
                        div.style.background = 'rgba(255, 255, 255, 0.05)';
                        div.style.borderRadius = '6px';
                        div.style.borderLeft = '3px solid #3b82f6';
                        div.innerHTML = `
                            <div>
                                <strong>${renderProfileLink(l.handle, l.displayName || l.handle)}</strong>
                                <span style="font-size: 0.85em; color: #aaa;">(${renderProfileLink(l.handle)})</span>
                                ${l.description ? `<p style="margin: 2px 0 0 0; font-size: 0.85em; color: #ccc;">${linkify(l.description)}</p>` : ''}
                            </div>
                            <button type="button" class="btn-unsubscribe-setting" data-did="${l.did}" data-handle="${l.handle}" style="background-color: #ef4444; color: white; border: none; padding: 4px 10px; border-radius: 4px; cursor: pointer;">${i18n.t('settingsMsgs.btnUnsub')}</button>
                        `;
                        div.querySelector('.btn-unsubscribe-setting')?.addEventListener('click', async (e) => {
                            e.preventDefault();
                            if (await confirmDialog(i18n.t('settingsMsgs.unsubConfirm', { handle: l.handle }), i18n.t('settingsMsgs.btnUnsub'))) {
                                announcePolite(i18n.t('settingsMsgs.unsubbing'));
                                await window.go.services.SocialService.UnsubscribeLabeler(l.did);
                                announceAssertive(i18n.t('settingsMsgs.unsubSuccess', { handle: l.handle }));
                                loadSettings();
                            }
                        });
                        subscribedLabelersListDiv.appendChild(div);
                    });
                }
            } catch (err: unknown) {
                console.error("Error loading subscribed labelers:", err);
                subscribedLabelersListDiv.innerHTML = '<p style="color: #f87171;">' + i18n.t('settingsMsgs.labelerError') + '</p>';
            }
        };

        const loadNotifPrefs = async () => {
            try {
                const notifPrefs = await window.go.services.NotificationsService.GetNotificationPreferences();
                if (notifPrefs) {
                    populateNotificationPreferences(notifPrefs);
                }
            } catch (notifErr) {
                console.error("Error loading notification preferences:", notifErr);
            }
        };

        const loadChatDecl = async () => {
            try {
                if (window.go.services.ChatService.GetChatDeclarationFull) {
                    const decl = await window.go.services.ChatService.GetChatDeclarationFull();
                    const chatAllowSelect = document.getElementById('setting-chat-allow-incoming') as HTMLSelectElement | null;
                    const grpAllowSelect = document.getElementById('setting-chat-allow-group-invites') as HTMLSelectElement | null;
                    if (chatAllowSelect && decl?.allowIncoming) {
                        chatAllowSelect.value = decl.allowIncoming;
                    }
                    if (grpAllowSelect && decl?.allowGroupInvites) {
                        grpAllowSelect.value = decl.allowGroupInvites;
                    }
                } else {
                    const allowIncoming = await window.go.services.ChatService.GetChatDeclaration();
                    const chatAllowSelect = document.getElementById('setting-chat-allow-incoming') as HTMLSelectElement | null;
                    if (chatAllowSelect && allowIncoming) {
                        chatAllowSelect.value = allowIncoming;
                    }
                }
            } catch (chatDeclErr) {
                console.error("Error loading chat declaration:", chatDeclErr);
            }
        };

        const loadNotifDecl = async () => {
            try {
                if (window.go.services.NotificationsService.GetNotificationDeclaration) {
                    const allowSubs = await window.go.services.NotificationsService.GetNotificationDeclaration();
                    const subsSelect = document.getElementById('setting-notif-allow-subscriptions') as HTMLSelectElement | null;
                    if (subsSelect && allowSubs) {
                        subsSelect.value = allowSubs;
                    }
                }
            } catch (notifDeclErr) {
                console.error("Error loading notification declaration:", notifDeclErr);
            }
        };

        const loadContentVisDecl = async () => {
            try {
                if (window.go.services.SocialService.GetContentVisibilityDeclaration) {
                    const hideAlgo = await window.go.services.SocialService.GetContentVisibilityDeclaration();
                    const hideAlgoCb = document.getElementById('setting-hide-algo-recs') as HTMLInputElement | null;
                    if (hideAlgoCb) {
                        hideAlgoCb.checked = Boolean(hideAlgo);
                    }
                }
            } catch (visDeclErr) {
                console.error("Error loading content visibility declaration:", visDeclErr);
            }
        };

        const loadAccounts = async () => {
            const accountsListDiv = document.getElementById('settings-accounts-list');
            if (!accountsListDiv) return;
            try {
                const accounts: SavedAccountDTO[] = await window.go.services.AuthService.ListAccounts() || [];
                accountsListDiv.innerHTML = '';
                accounts.forEach((acc: SavedAccountDTO) => {
                    const row = document.createElement('div');
                    row.style.display = 'flex';
                    row.style.justifyContent = 'space-between';
                    row.style.alignItems = 'center';
                    row.style.padding = '6px 10px';
                    row.style.border = '1px solid #444';
                    row.style.borderRadius = '6px';
                    const badge = acc.isActive ? ` <strong>(${esc(i18n.t('extended.activeAccountBadge'))})</strong>` : '';
                    row.innerHTML = `
                        <span>@${esc(acc.handle)}${badge}</span>
                        <div style="display:flex; gap:6px;">
                            ${!acc.isActive ? `<button type="button" class="btn-switch-acc" data-did="${esc(acc.did)}">${esc(i18n.t('extended.switchAccountBtn'))}</button>` : ''}
                            <button type="button" class="btn-remove-acc" data-did="${esc(acc.did)}">${esc(i18n.t('extended.removeAccountBtn'))}</button>
                        </div>
                    `;
                    row.querySelector('.btn-switch-acc')?.addEventListener('click', async () => {
                        try {
                            const newHandle = await window.go.services.AuthService.SwitchAccount(acc.did);
                            state.loggedInHandle = newHandle;
                            state.currentHandle = newHandle;
                            localStorage.setItem('lastHandle', newHandle);
                            state.currentFeedUri = "";
                            Object.keys(state.tabStates).forEach((k) => {
                                state.tabStates[k].loaded = false;
                                state.tabStates[k].loadedAt = undefined;
                            });
                            await Promise.allSettled([
                                captureIdentity(),
                                hydrateStartupPreferences(),
                                window.go.services.FeedService.GetSavedFeeds().then(feeds => {
                                    state.savedFeeds = feeds || [];
                                }),
                            ]);
                            announceAssertive(i18n.t('extended.switchedAccountMsg', { handle: newHandle }));
                            switchTab('timeline');
                        } catch (err: unknown) {
                            announceAssertive(String(err));
                        }
                    });
                    row.querySelector('.btn-remove-acc')?.addEventListener('click', async () => {
                        try {
                            await window.go.services.AuthService.RemoveAccount(acc.did);
                            announceAssertive(i18n.t('extended.removedAccountMsg'));
                            await loadSettings();
                        } catch (err: unknown) {
                            announceAssertive(String(err));
                        }
                    });
                    accountsListDiv.appendChild(row);
                });
            } catch (accErr) {
                console.error("Error loading saved accounts:", accErr);
            }
        };

        const loadAppPasswords = async () => {
            const appPasswordsListDiv = document.getElementById('settings-app-passwords-list');
            if (!appPasswordsListDiv) return;
            try {
                const passwords: AppPasswordDTO[] = await window.go.services.AuthService.ListAppPasswords() || [];
                appPasswordsListDiv.innerHTML = '';
                if (passwords.length === 0) {
                    appPasswordsListDiv.innerHTML = `<p style="font-size:0.9em; color:#888;">${esc(i18n.t('extended.appPasswordNone'))}</p>`;
                } else {
                    passwords.forEach((pw: AppPasswordDTO) => {
                        const row = document.createElement('div');
                        row.style.display = 'flex';
                        row.style.justifyContent = 'space-between';
                        row.style.alignItems = 'center';
                        row.style.padding = '6px 10px';
                        row.style.border = '1px solid #444';
                        row.style.borderRadius = '6px';
                        row.innerHTML = `
                            <span><strong>${esc(pw.name)}</strong> <small>(${esc(pw.createdAt.slice(0, 10))})</small></span>
                            <button type="button" class="btn-revoke-app-pw" data-name="${esc(pw.name)}">${esc(i18n.t('extended.appPasswordRevokeBtn'))}</button>
                        `;
                        row.querySelector('.btn-revoke-app-pw')?.addEventListener('click', async () => {
                            if (await confirmDialog(i18n.t('extended.appPasswordRevokeConfirm', { name: pw.name }), i18n.t('extended.appPasswordRevokeBtn'))) {
                                try {
                                    await window.go.services.AuthService.RevokeAppPassword(pw.name);
                                    announceAssertive(i18n.t('extended.appPasswordRevokedMsg'));
                                    await loadSettings();
                                } catch (err: unknown) {
                                    announceAssertive(String(err));
                                }
                            }
                        });
                        appPasswordsListDiv.appendChild(row);
                    });
                }
            } catch {
                appPasswordsListDiv.innerHTML = `<p style="font-size:0.9em; color:#888;">${esc(i18n.t('extended.appPasswordNone'))}</p>`;
            }
        };

        const loadMutedLists = async () => {
            const mutedListsDiv = document.getElementById('muted-lists-container');
            if (!mutedListsDiv) return;
            try {
                const mlRes = await window.go.services.SocialService.GetMutedLists("");
                mutedListsDiv.innerHTML = '';
                if (!mlRes?.lists || mlRes.lists.length === 0) {
                    mutedListsDiv.innerHTML = `<p style="font-size:0.9em; color:#888;">${esc(i18n.t('sec2.noMutedLists'))}</p>`;
                } else {
                    mlRes.lists.forEach(lst => {
                        const row = document.createElement('div');
                        row.style.cssText = 'display:flex; justify-content:space-between; align-items:center; padding:6px; border-bottom:1px solid #444;';
                        row.innerHTML = `<span><strong>${esc(lst.name)}</strong> <small>(${renderProfileLink(lst.creator)})</small></span> <button type="button">${esc(i18n.t('sec2.unmuteListBtn'))}</button>`;
                        row.querySelector('button')?.addEventListener('click', async () => {
                            try {
                                await window.go.services.SocialService.UnmuteList(lst.uri);
                                row.remove();
                            } catch (err: unknown) {
                                announceAssertive(String(err));
                            }
                        });
                        mutedListsDiv.appendChild(row);
                    });
                }
            } catch {
                mutedListsDiv.innerHTML = `<p style="font-size:0.9em; color:#888;">${esc(i18n.t('sec2.noMutedLists'))}</p>`;
            }
        };

        const loadBlockedLists = async () => {
            const blockedListsDiv = document.getElementById('blocked-lists-container');
            if (!blockedListsDiv) return;
            try {
                const blRes = await window.go.services.SocialService.GetBlockedLists("");
                blockedListsDiv.innerHTML = '';
                if (!blRes?.lists || blRes.lists.length === 0) {
                    blockedListsDiv.innerHTML = `<p style="font-size:0.9em; color:#888;">${esc(i18n.t('sec2.noBlockedLists'))}</p>`;
                } else {
                    blRes.lists.forEach(lst => {
                        const row = document.createElement('div');
                        row.style.cssText = 'display:flex; justify-content:space-between; align-items:center; padding:6px; border-bottom:1px solid #444;';
                        row.innerHTML = `<span><strong>${esc(lst.name)}</strong> <small>(${renderProfileLink(lst.creator)})</small></span> <button type="button">${esc(i18n.t('sec2.unblockListBtn'))}</button>`;
                        row.querySelector('button')?.addEventListener('click', async () => {
                            try {
                                await window.go.services.SocialService.UnblockList(lst.viewerBlock || lst.uri);
                                row.remove();
                            } catch (err: unknown) {
                                announceAssertive(String(err));
                            }
                        });
                        blockedListsDiv.appendChild(row);
                    });
                }
            } catch {
                blockedListsDiv.innerHTML = `<p style="font-size:0.9em; color:#888;">${esc(i18n.t('sec2.noBlockedLists'))}</p>`;
            }
        };

        const loadActivitySubs = async () => {
            const activitySubsDiv = document.getElementById('activity-subs-container');
            if (!activitySubsDiv) return;
            try {
                const subRes = await window.go.services.NotificationsService.ListActivitySubscriptions("");
                activitySubsDiv.innerHTML = '';
                if (!subRes?.profiles || subRes.profiles.length === 0) {
                    activitySubsDiv.innerHTML = `<p style="font-size:0.9em; color:#888;">${esc(i18n.t('sec2.noActivitySubscriptions'))}</p>`;
                } else {
                    subRes.profiles.forEach(prof => {
                        const row = document.createElement('div');
                        row.style.cssText = 'display:flex; justify-content:space-between; align-items:center; padding:6px; border-bottom:1px solid #444;';
                        row.innerHTML = `<span><strong>${esc(prof.displayName || prof.handle)}</strong> <small>(${renderProfileLink(prof.handle)})</small></span> <button type="button">${esc(i18n.t('sec2.unsubscribeActivityBtn'))}</button>`;
                        row.querySelector('button')?.addEventListener('click', async () => {
                            try {
                                await window.go.services.NotificationsService.PutActivitySubscription(prof.did, false, false);
                                row.remove();
                            } catch (err: unknown) {
                                announceAssertive(String(err));
                            }
                        });
                        activitySubsDiv.appendChild(row);
                    });
                }
            } catch {
                activitySubsDiv.innerHTML = `<p style="font-size:0.9em; color:#888;">${esc(i18n.t('sec2.noActivitySubscriptions'))}</p>`;
            }
        };

        const loadAgeAssurance = async () => {
            const ageStatusEl = document.getElementById('age-assurance-status');
            if (!ageStatusEl) return;
            try {
                const ageState = await window.go.services.SocialService.GetAgeAssuranceState("", "");
                if (ageState) {
                    ageStatusEl.textContent = i18n.t('sec2.ageAssuranceStatusLabel', {
                        status: ageState.status || '-',
                        access: ageState.access || '-'
                    });
                }
            } catch {
                ageStatusEl.textContent = '';
            }
        };

        const results = await Promise.allSettled([
            hydrateStartupPreferences(),
            loadMutes(),
            loadBlocks(),
            loadLabelers(),
            loadNotifPrefs(),
            loadChatDecl(),
            loadNotifDecl(),
            loadContentVisDecl(),
            loadAccounts(),
            loadAppPasswords(),
            loadMutedLists(),
            loadBlockedLists(),
            loadActivitySubs(),
            loadAgeAssurance(),
        ]);

        if (results[0].status === 'rejected') {
            throw results[0].reason;
        }

        state.tabStates['settings'].loaded = true;
        state.tabStates['settings'].loadedAt = Date.now();
    } catch (err) {
        console.error(err);
        if (state.loggedInHandle) {
            announceAssertive(i18n.t('settingsMsgs.loadSettingsError'));
        }
    }
}

export function setupSettings() {
    const fontSizeSelect = document.getElementById('font-size-select') as HTMLSelectElement;
    if (fontSizeSelect) {
        fontSizeSelect.addEventListener('change', () => {
            const selectedFontSize = fontSizeSelect.value as 'normal' | 'large' | 'x-large' | 'huge';
            state.fontSize = selectedFontSize;
            localStorage.setItem('fontSize', selectedFontSize);
            applyFontSize(selectedFontSize);
            announcePolite(`${i18n.t('settingsMsgs.fontChanged')} ${fontSizeSelect.options[fontSizeSelect.selectedIndex].text}`);
        });
    }

    const hideRepliesCheckbox = document.getElementById('setting-hide-replies') as HTMLInputElement;
    if (hideRepliesCheckbox) {
        hideRepliesCheckbox.addEventListener('change', async () => {
            state.hideReplies = hideRepliesCheckbox.checked;
            localStorage.setItem('hideReplies', String(state.hideReplies));
            announcePolite(state.hideReplies ? i18n.t('settingsMsgs.hideRepliesOn') : i18n.t('settingsMsgs.hideRepliesOff'));
            if (state.currentTab === 'timeline') {
                loadTimeline(false, true);
            }
        });
    }

    const settingsForm = document.getElementById('settings-form') as HTMLFormElement;
    if (settingsForm) {
        settingsForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            // Aparência
            const themeSelect = document.getElementById('theme-select') as HTMLSelectElement;
            const selectedTheme = themeSelect ? themeSelect.value : 'system';
            localStorage.setItem('theme', selectedTheme);
            if (selectedTheme === 'dark' || (selectedTheme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
                document.body.classList.add('dark-mode');
            } else {
                document.body.classList.remove('dark-mode');
            }

            const langOverrideSelect = document.getElementById('lang-override-select') as HTMLSelectElement;
            if (langOverrideSelect) {
                const selectedLang = langOverrideSelect.value;
                const oldLang = localStorage.getItem('app-language') || '';
                if (selectedLang !== oldLang) {
                    if (selectedLang === '') {
                        localStorage.removeItem('app-language');
                        await i18n.setLanguage(navigator.language.toLowerCase().replace('-', '_'));
                    } else {
                        localStorage.setItem('app-language', selectedLang);
                        await i18n.setLanguage(selectedLang);
                    }
                    
                    if (state.currentTab === 'timeline') {
                        loadTimeline(false, true);
                    }
                }
            }

            const dateFormatSelect = document.getElementById('date-format-select') as HTMLSelectElement;
            if (dateFormatSelect) {
                const selectedDateFormat = dateFormatSelect.value as 'relative' | 'exact';
                localStorage.setItem('dateFormat', selectedDateFormat);
                state.dateFormat = selectedDateFormat;
            }

            const nameDisplayFormatSelect = document.getElementById('name-display-format-select') as HTMLSelectElement;
            if (nameDisplayFormatSelect) {
                const selectedNameFormat = nameDisplayFormatSelect.value as 'name' | 'nameAndHandle' | 'handle';
                localStorage.setItem('nameDisplayFormat', selectedNameFormat);
                state.nameDisplayFormat = selectedNameFormat;
                state.tabStates['chat'].loaded = false;
            }

            const notificationFormatSelect = document.getElementById('notification-format-select') as HTMLSelectElement;
            if (notificationFormatSelect) {
                const selectedNotifFormat = notificationFormatSelect.value as 'combined' | 'individual';
                localStorage.setItem('notificationFormat', selectedNotifFormat);
                state.notificationFormat = selectedNotifFormat;
            }

            if (state.currentPosts && state.currentPosts.length > 0) {
                state.currentPosts.forEach(article => {
                    article.setAttribute('aria-label', getPostAccessibleLabel(article));
                });
            }

            announcePolite(i18n.t('settingsMsgs.saving'));
            try {
                const sortSelect = document.getElementById('thread-sort-select') as HTMLSelectElement;
                const threadSort = sortSelect ? sortSelect.value : "newest";

                const adultContentCheckbox = document.getElementById('setting-adult-content') as HTMLInputElement;
                const adultContent = adultContentCheckbox ? adultContentCheckbox.checked : false;

                const mutedWords = state.mutedWordsCache;

                const filterSelects = document.querySelectorAll('.content-filter-select');
                const filtersToSave: Array<{ label: string; visibility: string; labelerDid: string }> = [];
                filterSelects.forEach((selElement) => {
                    const sel = selElement as HTMLSelectElement;
                    const label = sel.dataset.label;
                    let visibility = sel.value;
                    if (visibility === 'show') visibility = 'ignore';
                    if (label && visibility) {
                        filtersToSave.push({ label, visibility, labelerDid: '' });
                    }
                });

                await window.go.services.SocialService.UpdateAllPreferences(threadSort, adultContent, mutedWords, filtersToSave);

                const hideRepostsCb = document.getElementById('setting-hide-reposts') as HTMLInputElement | null;
                const hideQuotesCb = document.getElementById('setting-hide-quote-posts') as HTMLInputElement | null;
                const hideUnfollowedCb = document.getElementById('setting-hide-replies-unfollowed') as HTMLInputElement | null;
                state.feedViewHideReposts = Boolean(hideRepostsCb?.checked);
                state.feedViewHideQuotePosts = Boolean(hideQuotesCb?.checked);
                state.feedViewHideRepliesByUnfollowed = Boolean(hideUnfollowedCb?.checked);
                await window.go.services.SocialService.UpdateFeedViewPrefs(
                    state.hideReplies,
                    state.feedViewHideReposts,
                    state.feedViewHideQuotePosts,
                    state.feedViewHideRepliesByUnfollowed
                );

                const hideBadgesCb = document.getElementById('setting-hide-verification-badges') as HTMLInputElement | null;
                state.hideVerificationBadges = Boolean(hideBadgesCb?.checked);
                await window.go.services.SocialService.UpdateVerificationPrefs(state.hideVerificationBadges);

                const defGateSel = document.getElementById('setting-default-threadgate') as HTMLSelectElement | null;
                const defDisQuotesCb = document.getElementById('setting-default-disable-quotes') as HTMLInputElement | null;
                if (defGateSel) {
                    const val = defGateSel.value || 'everybody';
                    const rules = val.split(',').map(r => r.trim()).filter(Boolean);
                    await window.go.services.SocialService.UpdatePostInteractionDefaults(
                        rules.length > 0 ? rules : ['everybody'],
                        Boolean(defDisQuotesCb?.checked)
                    );
                    localStorage.setItem('postThreadgate', val === 'everybody' ? 'everyone' : val);
                }

                const interestsInput = document.getElementById('setting-interests-input') as HTMLInputElement | null;
                if (interestsInput) {
                    const tags = interestsInput.value.split(',').map(t => t.trim()).filter(Boolean);
                    await window.go.services.SocialService.UpdateInterests(tags);
                }

                const notifPrefs = getNotificationPreferencesFromDOM();
                await window.go.services.NotificationsService.PutNotificationPreferences(notifPrefs);

                const chatAllowSelect = document.getElementById('setting-chat-allow-incoming') as HTMLSelectElement | null;
                const grpAllowSelect = document.getElementById('setting-chat-allow-group-invites') as HTMLSelectElement | null;
                if (chatAllowSelect && chatAllowSelect.value) {
                    try {
                        if (window.go.services.ChatService.UpdateChatDeclarationFull && grpAllowSelect) {
                            await window.go.services.ChatService.UpdateChatDeclarationFull(chatAllowSelect.value, grpAllowSelect.value || 'following');
                        } else {
                            await window.go.services.ChatService.UpdateChatDeclaration(chatAllowSelect.value);
                        }
                    } catch (chatErr) {
                        console.error("Error updating chat declaration:", chatErr);
                    }
                }

                const subsSelect = document.getElementById('setting-notif-allow-subscriptions') as HTMLSelectElement | null;
                if (subsSelect && subsSelect.value && window.go.services.NotificationsService.UpdateNotificationDeclaration) {
                    try {
                        await window.go.services.NotificationsService.UpdateNotificationDeclaration(subsSelect.value);
                    } catch (subsErr) {
                        console.error("Error updating notification declaration:", subsErr);
                    }
                }

                const hideAlgoCb = document.getElementById('setting-hide-algo-recs') as HTMLInputElement | null;
                if (hideAlgoCb && window.go.services.SocialService.UpdateContentVisibilityDeclaration) {
                    try {
                        await window.go.services.SocialService.UpdateContentVisibilityDeclaration(hideAlgoCb.checked);
                    } catch (visErr) {
                        console.error("Error updating content visibility declaration:", visErr);
                    }
                }

                const radioWarn = document.getElementById('muted-behavior-warn') as HTMLInputElement | null;
                const selectedBehavior: 'hide' | 'warn' = radioWarn && radioWarn.checked ? 'warn' : 'hide';
                localStorage.setItem('mutedWordsBehavior', selectedBehavior);
                state.mutedWordsBehavior = selectedBehavior;

                state.tabStates['timeline'].loaded = false;
                state.tabStates['notifications'].loaded = false;
                state.tabStates['feeds'].loaded = false;

                announceAssertive(i18n.t('settingsMsgs.saveSuccess'));
                switchTab('timeline');
            } catch (err) {
                console.error(err);
                announceAssertive(i18n.t('settingsMsgs.saveError'));
            }
        });
    }

    const inputMutedWord = document.getElementById('muted-word-input') as HTMLInputElement | null;
    const btnAddMutedWord = document.getElementById('btn-add-muted-word');
    const mutedListEl = document.getElementById('muted-words-list') as HTMLUListElement | null;

    const handleAddMutedWords = async () => {
        if (!inputMutedWord) return;
        const raw = inputMutedWord.value.trim();
        if (!raw) return;

        const targetSel = document.getElementById('muted-word-target') as HTMLSelectElement | null;
        const actorSel = document.getElementById('muted-word-actor') as HTMLSelectElement | null;
        const durSel = document.getElementById('muted-word-duration') as HTMLSelectElement | null;
        const targets = targetSel?.value === 'tag' ? ['tag'] : ['content', 'tag'];
        const actorTarget = actorSel?.value || 'all';
        let expiresAt = '';
        if (durSel?.value === '24h') expiresAt = new Date(Date.now() + 86400 * 1000).toISOString();
        else if (durSel?.value === '7d') expiresAt = new Date(Date.now() + 7 * 86400 * 1000).toISOString();
        else if (durSel?.value === '30d') expiresAt = new Date(Date.now() + 30 * 86400 * 1000).toISOString();

        const words = raw.split(/[,;\n]+/).map(w => w.trim()).filter(w => w.length > 0);
        const addedWords: string[] = [];

        for (const w of words) {
            if (!state.mutedWordsCache.includes(w)) {
                state.mutedWordsCache.push(w);
                addedWords.push(w);
            }
            try {
                await window.go.services.SocialService.AddMutedWordAdvanced(w, targets, actorTarget, expiresAt);
            } catch (err) {
                console.warn("AddMutedWordAdvanced error:", err);
            }
        }

        inputMutedWord.value = '';
        if (mutedListEl) renderMutedWords(mutedListEl);
        if (addedWords.length > 0) {
            announcePolite(i18n.t('settingsMsgs.wordAdded', { word: addedWords.join(', ') }));
        }
    };

    if (btnAddMutedWord) {
        btnAddMutedWord.addEventListener('click', (e) => {
            e.preventDefault();
            handleAddMutedWords();
        });
    }

    if (inputMutedWord) {
        inputMutedWord.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                e.stopPropagation();
                handleAddMutedWords();
            }
        });
    }

    const btnCancelSettings = document.getElementById('btn-cancel-settings');
    if (btnCancelSettings) {
        btnCancelSettings.addEventListener('click', async (e) => {
            e.preventDefault();
            await loadSettings();
            announcePolite(i18n.t('settingsMsgs.cancelSuccess'));
            switchTab('timeline');
        });
    }

    const btnAddLabeler = document.getElementById('btn-add-labeler');
    if (btnAddLabeler) {
        btnAddLabeler.addEventListener('click', async () => {
            const input = document.getElementById('subscribe-labeler-input') as HTMLInputElement;
            const handleOrDid = input ? input.value.trim() : '';
            if (!handleOrDid) {
                announceAssertive(i18n.t('settingsMsgs.typeLabeler'));
                return;
            }
            try {
                announcePolite(i18n.t('settingsMsgs.searchingLabeler', { handle: handleOrDid }));
                const profile = await window.go.services.SocialService.GetProfile(handleOrDid);
                if (!profile || !profile.did) {
                    announceAssertive(i18n.t('settingsMsgs.labelerNotFound'));
                    return;
                }
                await window.go.services.SocialService.SubscribeLabeler(profile.did);
                announceAssertive(i18n.t('settingsMsgs.labelerSubscribed', { handle: profile.handle }));
                if (input) input.value = '';
                loadSettings();
            } catch (err: unknown) {
                announceAssertive(i18n.t('settingsMsgs.labelerError') + String(err));
            }
        });
    }

    document.querySelectorAll('.btn-self-label').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.preventDefault();
            const label = (btn as HTMLElement).dataset.label;
            if (label) {
                try {
                    announcePolite(i18n.t('settingsMsgs.applyingLabel', { label }));
                    await window.go.services.SocialService.AddSelfLabel(label);
                    announceAssertive(i18n.t('settingsMsgs.labelApplied', { label }));
                } catch (err: unknown) {
                    announceAssertive(i18n.t('settingsMsgs.labelError') + String(err));
                }
            }
        });
    });

    const btnUpdateHandle = document.getElementById('btn-update-handle');
    if (btnUpdateHandle) {
        btnUpdateHandle.addEventListener('click', async () => {
            const input = document.getElementById('input-update-handle') as HTMLInputElement | null;
            const newHandle = input?.value?.trim().replace(/^@/, '') || '';
            if (!newHandle) return;
            try {
                await window.go.services.SocialService.UpdateHandle(newHandle);
                state.loggedInHandle = newHandle;
                state.currentHandle = newHandle;
                localStorage.setItem('lastHandle', newHandle);
                if (input) input.value = '';
                announceAssertive(i18n.t('extended.handleUpdatedMsg', { handle: newHandle }));
                await loadSettings();
            } catch (err: unknown) {
                announceAssertive(String(err));
            }
        });
    }

    const btnUpdateEmail = document.getElementById('btn-update-email');
    if (btnUpdateEmail) {
        btnUpdateEmail.addEventListener('click', async () => {
            const newEmail = await promptDialog(i18n.t('extended.emailPromptNew'), '', i18n.t('extended.emailUpdateBtn'));
            if (!newEmail || !newEmail.trim()) return;
            try {
                const tokenRequired = await window.go.services.AuthService.RequestEmailUpdate();
                let token = '';
                if (tokenRequired) {
                    const tokInput = await promptDialog(i18n.t('extended.emailTokenPrompt'), '', i18n.t('extended.emailUpdateBtn'));
                    if (!tokInput || !tokInput.trim()) return;
                    token = tokInput.trim();
                }
                await window.go.services.AuthService.UpdateEmail(newEmail.trim(), token);
                announceAssertive(i18n.t('extended.emailUpdatedMsg'));
            } catch (err: unknown) {
                announceAssertive(String(err));
            }
        });
    }

    const btnCreateAppPw = document.getElementById('btn-create-app-password');
    if (btnCreateAppPw) {
        btnCreateAppPw.addEventListener('click', async () => {
            const name = await promptDialog(i18n.t('extended.appPasswordNamePrompt'), 'Mixko', i18n.t('extended.appPasswordsTitle'));
            if (!name || !name.trim()) return;
            const privileged = await confirmDialog(i18n.t('extended.appPasswordPrivilegedConfirm'), i18n.t('extended.appPasswordsTitle'));
            try {
                const created = await window.go.services.AuthService.CreateAppPassword(name.trim(), privileged);
                if (created?.password) {
                    await promptDialog(
                        i18n.t('extended.appPasswordCreatedMsg', { password: created.password }),
                        created.password,
                        i18n.t('extended.appPasswordCreatedTitle')
                    );
                }
                await loadSettings();
            } catch (err: unknown) {
                announceAssertive(String(err));
            }
        });
    }

    const btnExportCar = document.getElementById('btn-export-repo-car');
    if (btnExportCar) {
        btnExportCar.addEventListener('click', async () => {
            try {
                announcePolite(i18n.t('extended.exportingCarMsg'));
                const savedPath = await window.go.services.SocialService.ExportRepoCAR();
                if (savedPath) {
                    announceAssertive(i18n.t('extended.exportCarSuccess', { path: savedPath }));
                }
            } catch (err: unknown) {
                announceAssertive(String(err));
            }
        });
    }

    const btnCheckStatus = document.getElementById('btn-check-account-status');
    if (btnCheckStatus) {
        btnCheckStatus.addEventListener('click', async () => {
            try {
                const st = await window.go.services.AuthService.CheckAccountStatus();
                if (st) {
                    announceAssertive(i18n.t('extended.accountStatusMsg', {
                        activated: String(st.activated),
                        validDid: String(st.validDid),
                        records: String(st.indexedRecords),
                        blocks: String(st.repoBlocks),
                    }));
                }
            } catch (err: unknown) {
                announceAssertive(String(err));
            }
        });
    }

    const btnDeactivate = document.getElementById('btn-deactivate-account');
    if (btnDeactivate) {
        btnDeactivate.addEventListener('click', async () => {
            if (await confirmDialog(i18n.t('extended.deactivateConfirm'), i18n.t('extended.deactivateAccountBtn'))) {
                try {
                    await window.go.services.AuthService.DeactivateAccount();
                    announceAssertive(i18n.t('extended.deactivatedMsg'));
                    window.location.reload();
                } catch (err: unknown) {
                    announceAssertive(String(err));
                }
            }
        });
    }

    document.getElementById('btn-begin-age-assurance')?.addEventListener('click', async () => {
        const email = await promptDialog(i18n.t('sec2.ageAssuranceEmailPrompt'), '', i18n.t('sec2.beginAgeAssuranceBtn'));
        if (!email || !email.trim()) return;
        const country = await promptDialog(i18n.t('sec2.ageAssuranceCountryPrompt'), 'BR', i18n.t('sec2.beginAgeAssuranceBtn'));
        if (!country || !country.trim()) return;
        const region = (await promptDialog(i18n.t('sec2.ageAssuranceRegionPrompt'), '', i18n.t('sec2.beginAgeAssuranceBtn'))) || '';
        const lang = (localStorage.getItem('app-language') || 'pt').slice(0, 2);
        try {
            const st = await window.go.services.SocialService.BeginAgeAssurance(
                country.trim().toUpperCase(),
                region.trim().toUpperCase(),
                email.trim(),
                lang
            );
            const ageStatusEl = document.getElementById('age-assurance-status');
            if (ageStatusEl && st) {
                ageStatusEl.textContent = i18n.t('sec2.ageAssuranceStatusLabel', { status: st.status || '-', access: st.access || '-' });
            }
            announceAssertive(i18n.t('sec2.ageAssuranceStartedMsg'));
        } catch (err: unknown) {
            announceAssertive(String(err));
        }
    });

    document.getElementById('btn-start-phone-verify')?.addEventListener('click', async () => {
        const phone = await promptDialog(i18n.t('sec2.phoneVerifyPrompt'), '+', i18n.t('sec2.startPhoneVerifyBtn'));
        if (!phone || !phone.trim()) return;
        try {
            await window.go.services.SocialService.StartPhoneVerification(phone.trim());
            announceAssertive(i18n.t('sec2.phoneCodeSentMsg'));
        } catch (err: unknown) {
            announceAssertive(String(err));
        }
    });

    document.getElementById('btn-confirm-phone-verify')?.addEventListener('click', async () => {
        const phone = await promptDialog(i18n.t('sec2.phoneVerifyPrompt'), '+', i18n.t('sec2.confirmPhoneVerifyBtn'));
        if (!phone || !phone.trim()) return;
        const code = await promptDialog(i18n.t('sec2.phoneCodePrompt'), '', i18n.t('sec2.confirmPhoneVerifyBtn'));
        if (!code || !code.trim()) return;
        try {
            await window.go.services.SocialService.VerifyPhone(phone.trim(), code.trim());
            announceAssertive(i18n.t('sec2.phoneVerifiedSuccess'));
        } catch (err: unknown) {
            announceAssertive(String(err));
        }
    });

    document.getElementById('btn-import-contacts')?.addEventListener('click', async () => {
        const raw = await promptDialog(i18n.t('sec2.importContactsPrompt'), '', i18n.t('sec2.importContactsBtn'));
        if (!raw || !raw.trim()) return;
        const numbers = raw.split(',').map(n => n.trim()).filter(Boolean);
        if (numbers.length === 0) return;
        try {
            await window.go.services.SocialService.ImportContacts("", numbers);
            announceAssertive(i18n.t('sec2.contactsImportedSuccess'));
        } catch (err: unknown) {
            announceAssertive(String(err));
        }
    });

    document.getElementById('btn-view-contact-matches')?.addEventListener('click', async () => {
        const listDiv = document.getElementById('contact-matches-container');
        if (!listDiv) return;
        try {
            const res = await window.go.services.SocialService.GetContactMatches("");
            listDiv.innerHTML = '';
            if (!res?.profiles || res.profiles.length === 0) {
                listDiv.innerHTML = `<p style="font-size:0.9em; color:#888;">-</p>`;
                return;
            }
            res.profiles.forEach((p: ProfileDTO) => {
                const row = document.createElement('div');
                row.style.padding = '4px 0';
                row.innerHTML = `<strong>${esc(p.displayName || p.handle)}</strong> <small>(${renderProfileLink(p.handle)})</small>`;
                listDiv.appendChild(row);
            });
        } catch (err: unknown) {
            announceAssertive(String(err));
        }
    });

    document.getElementById('btn-remove-contacts')?.addEventListener('click', async () => {
        try {
            await window.go.services.SocialService.RemoveContactData();
            const listDiv = document.getElementById('contact-matches-container');
            if (listDiv) listDiv.innerHTML = '';
            announceAssertive(i18n.t('sec2.contactDataRemovedSuccess'));
        } catch (err: unknown) {
            announceAssertive(String(err));
        }
    });

    document.getElementById('btn-load-mod-inbox')?.addEventListener('click', async () => {
        const container = document.getElementById('mod-inbox-container') as HTMLDivElement | null;
        if (!container) return;
        container.innerHTML = `<p>${esc(i18n.t('modals.loading'))}</p>`;
        try {
            const res = await window.go.services.ModerationService.GetModerationInbox("");
            const items = res?.items || [];
            if (items.length === 0) {
                container.innerHTML = `<p style="font-size:0.9em; color:#aaa;">${esc(i18n.t('sec2.noModInboxItems'))}</p>`;
                announcePolite(i18n.t('sec2.noModInboxItems'));
                return;
            }
            container.innerHTML = '';
            items.forEach((item) => {
                const row = document.createElement('div');
                row.style.cssText = 'padding:8px 10px; border:1px solid #555; border-radius:6px; display:flex; justify-content:space-between; align-items:center; gap:8px; flex-wrap:wrap;';
                const subjLabel = item.subjectUri || item.subjectDid || '';
                const labelsText = (item.labels || []).join(', ');
                const appealInfo = item.appealState ? ` • Appeal: ${item.appealState}` : '';
                row.innerHTML = `
                    <div>
                        <strong>${esc(item.enforcementState || 'Action')}</strong>${labelsText ? ` (${esc(labelsText)})` : ''}${esc(appealInfo)}
                        <small style="display:block; color:#aaa;">${esc(subjLabel)}</small>
                        ${item.appealNote ? `<small style="display:block; color:#ccc;">${esc(item.appealNote)}</small>` : ''}
                    </div>
                    <button type="button" class="btn-appeal-mod-item" style="padding:4px 10px;">${esc(i18n.t('sec2.appealModBtn'))}</button>
                `;
                row.querySelector('.btn-appeal-mod-item')?.addEventListener('click', async () => {
                    const reason = await promptDialog(i18n.t('sec2.appealReasonPrompt'), '', i18n.t('sec2.appealModBtn'));
                    if (reason === null) return;
                    try {
                        await window.go.services.ModerationService.AppealModerationSubject(item.subjectUri || '', item.subjectCid || '', item.subjectDid || '', reason);
                        announceAssertive(i18n.t('sec2.appealSentMsg'));
                    } catch (err: unknown) {
                        announceAssertive(String(err));
                    }
                });
                container.appendChild(row);
            });
        } catch (err: unknown) {
            container.innerHTML = `<p>${esc(String(err))}</p>`;
        }
    });
}

