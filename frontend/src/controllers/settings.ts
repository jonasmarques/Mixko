import { state } from '../config/state';
import { announcePolite, announceAssertive, getPostAccessibleLabel } from '../utils/a11y';
import { confirmDialog } from '../utils/dialog';
import { switchTab } from './tabs';

const STANDARD_LABELS = ['porn', 'sexual', 'graphic-media', 'gore', 'spam'];

export function renderMutedWords(listElement: HTMLUListElement) {
    listElement.innerHTML = '';
    state.mutedWordsCache.forEach((word, index) => {
        const li = document.createElement('li');
        li.style.marginBottom = '5px';
        li.innerHTML = `
            <span>${word}</span>
            <button type="button" aria-label="Remover ${word}" data-index="${index}" style="margin-left: 10px;">Remover</button>
        `;
        li.querySelector('button')?.addEventListener('click', () => {
            state.mutedWordsCache.splice(index, 1);
            renderMutedWords(listElement);
            announcePolite(`Palavra ${word} removida da lista. Lembre-se de salvar.`);
        });
        listElement.appendChild(li);
    });
}

function renderContentFilters(container: HTMLDivElement, filters: any[]) {
    container.innerHTML = '';
    // Map existing filters by label
    const filterMap = new Map<string, string>();
    filters.forEach(f => filterMap.set(f.label, f.visibility));

    STANDARD_LABELS.forEach(label => {
        const currentVis = filterMap.get(label) || 'hide';
        const div = document.createElement('div');
        div.style.display = 'flex';
        div.style.justifyContent = 'space-between';
        div.style.alignItems = 'center';
        div.style.padding = '5px 0';
        div.style.borderBottom = '1px solid #eee';
        div.innerHTML = `
            <span><strong>${label}</strong></span>
            <select class="content-filter-select" data-label="${label}">
                <option value="hide" ${currentVis === 'hide' ? 'selected' : ''}>Ocultar</option>
                <option value="warn" ${currentVis === 'warn' ? 'selected' : ''}>Avisar</option>
                <option value="show" ${currentVis === 'show' ? 'selected' : ''}>Mostrar</option>
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

export async function loadSettings() {
    const mutedList = document.getElementById('muted-words-list') as HTMLUListElement;
    const adultContentCheckbox = document.getElementById('setting-adult-content') as HTMLInputElement;
    const themeSelect = document.getElementById('theme-select') as HTMLSelectElement;
    const sortSelect = document.getElementById('thread-sort-select') as HTMLSelectElement;
    const prioCheckbox = document.getElementById('setting-prioritize-followed') as HTMLInputElement;
    const contentFiltersContainer = document.getElementById('content-filters-list') as HTMLDivElement;

    const dateFormatSelect = document.getElementById('date-format-select') as HTMLSelectElement;
    const nameDisplayFormatSelect = document.getElementById('name-display-format-select') as HTMLSelectElement;
    const notificationFormatSelect = document.getElementById('notification-format-select') as HTMLSelectElement;
    const fontSizeSelect = document.getElementById('font-size-select') as HTMLSelectElement;
    const hideRepliesCheckbox = document.getElementById('setting-hide-replies') as HTMLInputElement;

    const savedTheme = localStorage.getItem('theme') || 'system';
    if (themeSelect) themeSelect.value = savedTheme;

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

    try {
        const prefs = await window.go.services.SocialService.GetPreferences();
        if (prefs) {
            state.adultContentCache = prefs.adultContentEnabled || false;
            if (adultContentCheckbox) adultContentCheckbox.checked = state.adultContentCache;

            state.mutedWordsCache = (prefs.mutedWords || []).map((mw: any) => mw.value);
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
                mutedListDiv.innerHTML = '<p>Nenhum usuário silenciado.</p>';
            }
            mutedRes.profiles.forEach((p: any) => {
                const div = document.createElement('div');
                div.style.padding = '5px';
                div.style.borderBottom = '1px solid #ccc';
                div.innerHTML = `<span>@${p.handle}</span> <button class="btn-unmute" style="float: right;" data-did="${p.did}" data-handle="${p.handle}">Dessilenciar</button>`;
                mutedListDiv.appendChild(div);
            });
            mutedListDiv.querySelectorAll('.btn-unmute').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    e.preventDefault();
                    const target = e.currentTarget as HTMLButtonElement;
                    const did = target.dataset.did!;
                    const handle = target.dataset.handle!;
                    if (await confirmDialog(`Deseja dessilenciar @${handle}?`, 'Desmutar Usuário')) {
                        await window.go.services.ModerationService.UnmuteActor(did);
                        announceAssertive(`@${handle} dessilenciado.`);
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
                blockedListDiv.innerHTML = '<p>Nenhum usuário bloqueado.</p>';
            }
            blockedRes.profiles.forEach((p: any) => {
                const div = document.createElement('div');
                div.style.padding = '5px';
                div.style.borderBottom = '1px solid #ccc';
                div.innerHTML = `<span>@${p.handle}</span> <button class="btn-unblock" style="float: right;" data-did="${p.did}" data-handle="${p.handle}">Desbloquear</button>`;
                blockedListDiv.appendChild(div);
            });
            blockedListDiv.querySelectorAll('.btn-unblock').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    e.preventDefault();
                    const target = e.currentTarget as HTMLButtonElement;
                    const did = target.dataset.did!;
                    const handle = target.dataset.handle!;
                    if (await confirmDialog(`Deseja desbloquear @${handle}?`, 'Desbloquear Usuário')) {
                        await window.go.services.ModerationService.UnblockActor(did);
                        announceAssertive(`@${handle} desbloqueado.`);
                        target.parentElement?.remove();
                    }
                });
            });
        }

        state.tabStates['settings'].loaded = true;
    } catch (err) {
        console.error(err);
        announceAssertive("Erro ao carregar configurações.");
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
            announcePolite(`Tamanho da fonte alterado para ${fontSizeSelect.options[fontSizeSelect.selectedIndex].text}`);
        });
    }

    const hideRepliesCheckbox = document.getElementById('setting-hide-replies') as HTMLInputElement;
    if (hideRepliesCheckbox) {
        hideRepliesCheckbox.addEventListener('change', async () => {
            state.hideReplies = hideRepliesCheckbox.checked;
            localStorage.setItem('hideReplies', String(state.hideReplies));
            announcePolite(state.hideReplies ? "Ocultar respostas ativado" : "Exibir respostas ativado");
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

            announcePolite("Salvando configurações...");
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
                const filtersToSave: any[] = [];
                filterSelects.forEach((sel: any) => {
                    const label = sel.dataset.label;
                    const visibility = sel.value;
                    if (label && visibility) {
                        filtersToSave.push({ label, visibility, labelerDid: '' });
                    }
                });

                await window.go.services.SocialService.UpdateAllPreferences(threadSort, adultContent, mutedWords, filtersToSave);

                announceAssertive("Configurações salvas com sucesso!");
                switchTab('timeline');
            } catch (err) {
                console.error(err);
                announceAssertive("Erro ao salvar configurações.");
            }
        });
    }

    const btnAddMutedWord = document.getElementById('btn-add-muted-word');
    if (btnAddMutedWord) {
        btnAddMutedWord.addEventListener('click', () => {
            const input = document.getElementById('muted-word-input') as HTMLInputElement;
            const word = input.value.trim();
            if (word && !state.mutedWordsCache.includes(word)) {
                state.mutedWordsCache.push(word);
                input.value = '';
                const mutedList = document.getElementById('muted-words-list') as HTMLUListElement;
                if (mutedList) renderMutedWords(mutedList);
                announcePolite(`Palavra ${word} adicionada à lista. Lembre-se de salvar.`);
            }
        });
    }

    document.querySelectorAll('.btn-self-label').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.preventDefault();
            const label = (btn as HTMLElement).dataset.label;
            if (label) {
                try {
                    announcePolite(`Aplicando rótulo de conteúdo "${label}"...`);
                    await window.go.services.SocialService.AddSelfLabel(label);
                    announceAssertive(`Rótulo "${label}" aplicado à sua conta com sucesso.`);
                } catch (err: any) {
                    announceAssertive("Erro ao aplicar rótulo: " + err);
                }
            }
        });
    });
}
