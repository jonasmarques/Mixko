import { esc } from '../utils/helpers';
import { state } from '../config/state';
import { announcePolite, announceAssertive, getPostAccessibleLabel } from '../utils/a11y';
import { confirmDialog } from '../utils/dialog';
import { switchTab } from './tabs';
import { i18n } from '../utils/i18n';

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
}

export async function loadSettings() {
    loadLocalSettings();

    const mutedList = document.getElementById('muted-words-list') as HTMLUListElement;
    const adultContentCheckbox = document.getElementById('setting-adult-content') as HTMLInputElement;
    const sortSelect = document.getElementById('thread-sort-select') as HTMLSelectElement;
    const prioCheckbox = document.getElementById('setting-prioritize-followed') as HTMLInputElement;
    const contentFiltersContainer = document.getElementById('content-filters-list') as HTMLDivElement;

    try {
        const prefs = await window.go.services.SocialService.GetPreferences();
        if (prefs) {
            state.adultContentCache = prefs.adultContentEnabled || false;
            if (adultContentCheckbox) adultContentCheckbox.checked = state.adultContentCache;

            state.mutedWordsCache = (prefs.mutedWords || []).map((mw: { value: string }) => mw.value);
            if (mutedList) renderMutedWords(mutedList);

            if (sortSelect && prefs.threadSort) sortSelect.value = prefs.threadSort;
            if (prioCheckbox) prioCheckbox.checked = prefs.threadPrioritizeFollowed;

            if (contentFiltersContainer) {
                renderContentFilters(contentFiltersContainer, prefs.contentFilters || []);
            }
        }

        const mutedRes = await window.go.services.ModerationService.GetMutes("");
        const mutedListDiv = document.getElementById('muted-users-list');
        if (mutedListDiv && mutedRes && mutedRes.profiles) {
            mutedListDiv.innerHTML = '';
            if (mutedRes.profiles.length === 0) {
                mutedListDiv.innerHTML = `<p>${i18n.t('settingsMsgs.noMuted')}</p>`;
            }
            mutedRes.profiles.forEach((p: any) => {
                const div = document.createElement('div');
                div.style.padding = '5px';
                div.style.borderBottom = '1px solid #ccc';
                div.innerHTML = `<span>@${esc(p.handle)}</span> <button class="btn-unmute" style="float: right;" data-did="${esc(p.did)}" data-handle="${esc(p.handle)}">${i18n.t('settingsMsgs.btnUnmute')}</button>`;
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

        const blockedRes = await window.go.services.ModerationService.GetBlocks("");
        const blockedListDiv = document.getElementById('blocked-users-list');
        if (blockedListDiv && blockedRes && blockedRes.profiles) {
            blockedListDiv.innerHTML = '';
            if (blockedRes.profiles.length === 0) {
                blockedListDiv.innerHTML = `<p>${i18n.t('settingsMsgs.noBlocked')}</p>`;
            }
            blockedRes.profiles.forEach((p: any) => {
                const div = document.createElement('div');
                div.style.padding = '5px';
                div.style.borderBottom = '1px solid #ccc';
                div.innerHTML = `<span>@${esc(p.handle)}</span> <button class="btn-unblock" style="float: right;" data-did="${esc(p.did)}" data-handle="${esc(p.handle)}">${i18n.t('settingsMsgs.btnUnblock')}</button>`;
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

        const subscribedLabelersListDiv = document.getElementById('subscribed-labelers-list');
        if (subscribedLabelersListDiv) {
            try {
                subscribedLabelersListDiv.innerHTML = i18n.t('app.loading');
                const labelers = await window.go.services.SocialService.GetSubscribedLabelers();
                subscribedLabelersListDiv.innerHTML = '';
                if (!labelers || labelers.length === 0) {
                    subscribedLabelersListDiv.innerHTML = `<p style="color: #888; font-size: 0.9em;">${i18n.t('settingsMsgs.noLabelers')}</p>`;
                } else {
                    labelers.forEach((l: any) => {
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
                                <strong><a href="#" class="open-labeler-profile" data-handle="${esc(l.handle)}" style="color: #60a5fa; text-decoration: none;">${esc(l.displayName || l.handle)}</a></strong>
                                <span style="font-size: 0.85em; color: #aaa;">(@${esc(l.handle)})</span>
                                ${l.description ? `<p style="margin: 2px 0 0 0; font-size: 0.85em; color: #ccc;">${esc(l.description)}</p>` : ''}
                            </div>
                            <button type="button" class="btn-unsubscribe-setting" data-did="${l.did}" data-handle="${l.handle}" style="background-color: #ef4444; color: white; border: none; padding: 4px 10px; border-radius: 4px; cursor: pointer;">${i18n.t('settingsMsgs.btnUnsub')}</button>
                        `;
                        div.querySelector('.open-labeler-profile')?.addEventListener('click', (e) => {
                            e.preventDefault();
                            state.currentHandle = l.handle;
                            switchTab('profile');
                        });
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
            } catch (err: any) {
                console.error("Error loading subscribed labelers:", err);
                subscribedLabelersListDiv.innerHTML = '<p style="color: #f87171;">' + i18n.t('settingsMsgs.labelerError') + '</p>';
            }
        }

        state.tabStates['settings'].loaded = true;
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
                const { loadTimeline } = await import('./timeline');
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
                        i18n.setLanguage(navigator.language.toLowerCase().replace('-', '_')); // Fallback immediately if auto is selected
                    } else {
                        localStorage.setItem('app-language', selectedLang);
                        i18n.setLanguage(selectedLang);
                    }
                    
                    // Force refresh timeline because posts are loaded and cached
                    if (state.currentTab === 'timeline') {
                        import('./timeline').then(m => m.loadTimeline(false, true));
                    } else {
                        // Let's just reload the page to make it clean if we changed language? Or just reload DOM.
                        // Since I18n handles translateDOM, it already translates the static DOM.
                        // But dynamically generated items like feeds may need a refresh.
                        // A quick reload might be better for an app-wide language change, 
                        // but let's stick to dynamically changing it.
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

            // Update accessible labels of currently loaded posts
            if (state.currentPosts && state.currentPosts.length > 0) {
                state.currentPosts.forEach(article => {
                    article.setAttribute('aria-label', getPostAccessibleLabel(article));
                });
            }

            announcePolite(i18n.t('settingsMsgs.saving'));
            try {
                // Thread Prefs
                const sortSelect = document.getElementById('thread-sort-select') as HTMLSelectElement;
                const threadSort = sortSelect ? sortSelect.value : "newest";

                // Adult Content
                const adultContentCheckbox = document.getElementById('setting-adult-content') as HTMLInputElement;
                const adultContent = adultContentCheckbox ? adultContentCheckbox.checked : false;

                // Muted Words
                const mutedWords = state.mutedWordsCache;

                // Content Filters
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

    const handleAddMutedWords = () => {
        if (!inputMutedWord) return;
        const raw = inputMutedWord.value.trim();
        if (!raw) return;

        const words = raw.split(/[,;\n]+/).map(w => w.trim()).filter(w => w.length > 0);
        const addedWords: string[] = [];

        for (const w of words) {
            if (!state.mutedWordsCache.includes(w)) {
                state.mutedWordsCache.push(w);
                addedWords.push(w);
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
            } catch (err: any) {
                announceAssertive(i18n.t('settingsMsgs.labelerError') + err);
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
                } catch (err: any) {
                    announceAssertive(i18n.t('settingsMsgs.labelError') + err);
                }
            }
        });
    });
}
