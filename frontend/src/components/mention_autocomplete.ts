import { announcePolite } from '../utils/a11y';
import { i18n } from '../utils/i18n';

interface ProfileDTO {
    did: string;
    handle: string;
    displayName?: string;
    description?: string;
    avatar?: string;
    viewerFollowing?: string;
}

export class MentionAutocomplete {
    private textarea: HTMLTextAreaElement;
    private dropdownEl: HTMLUListElement | null = null;
    private profiles: ProfileDTO[] = [];
    private activeIndex: number = -1;
    private searchTimer: any = null;
    private mentionStartPos: number = -1;
    private mentionEndPos: number = -1;
    private isVisible: boolean = false;

    constructor(textarea: HTMLTextAreaElement) {
        this.textarea = textarea;
        this.setupListeners();
    }

    public isOpen(): boolean {
        return this.isVisible;
    }

    public close(): void {
        if (this.dropdownEl) {
            this.dropdownEl.remove();
            this.dropdownEl = null;
        }
        this.isVisible = false;
        this.activeIndex = -1;
        this.profiles = [];
        this.textarea.removeAttribute('aria-activedescendant');
    }

    private setupListeners(): void {
        this.textarea.addEventListener('input', () => this.onInput());
        this.textarea.addEventListener('keydown', (e) => this.onKeyDown(e));
        this.textarea.addEventListener('blur', () => {
            // Pequeno atraso para permitir o clique nos itens antes de fechar
            setTimeout(() => this.close(), 200);
        });
    }

    private onInput(): void {
        const text = this.textarea.value;
        const cursorPos = this.textarea.selectionStart;
        if (cursorPos === null) return;

        // Procura a palavra atual em torno do cursor
        const textBeforeCursor = text.substring(0, cursorPos);
        const match = textBeforeCursor.match(/(?:^|\s)@([a-zA-Z0-9.-]*)$/);

        if (!match) {
            this.close();
            return;
        }

        const query = match[1];
        
        // Posição de início do '@'
        const atIndex = textBeforeCursor.lastIndexOf('@');
        if (atIndex === -1) {
            this.close();
            return;
        }

        this.mentionStartPos = atIndex;
        this.mentionEndPos = cursorPos;

        if (this.searchTimer) clearTimeout(this.searchTimer);
        this.searchTimer = setTimeout(() => {
            this.fetchProfiles(query);
        }, 150);
    }

    private async fetchProfiles(query: string): Promise<void> {
        try {
            if (!window.go?.services?.SearchService?.SearchProfilesTypeahead) {
                return;
            }
            const res = await window.go.services.SearchService.SearchProfilesTypeahead(query);
            if (res && res.profiles && res.profiles.length > 0) {
                this.profiles = res.profiles.slice(0, 8); // Mostrar até 8 resultados
                this.renderDropdown();
            } else {
                this.close();
            }
        } catch (e) {
            this.close();
        }
    }

    private renderDropdown(): void {
        if (!this.dropdownEl) {
            this.dropdownEl = document.createElement('ul');
            this.dropdownEl.id = 'mention-autocomplete-dropdown';
            this.dropdownEl.className = 'mention-autocomplete-dropdown';
            this.dropdownEl.setAttribute('role', 'listbox');
            this.dropdownEl.setAttribute('aria-label', i18n.t('compose.mentionCount', { count: this.profiles.length.toString() }));
            
            // Inserir após o textarea ou no container pai
            const parent = this.textarea.parentElement || document.body;
            parent.style.position = 'relative';
            parent.appendChild(this.dropdownEl);
        }

        this.dropdownEl.innerHTML = '';
        this.activeIndex = 0;
        this.isVisible = true;

        this.profiles.forEach((profile, index) => {
            const item = document.createElement('li');
            item.id = `mention-item-${index}`;
            item.className = `mention-autocomplete-item${index === 0 ? ' active' : ''}`;
            item.setAttribute('role', 'option');
            item.setAttribute('aria-selected', index === 0 ? 'true' : 'false');

            const name = profile.displayName || profile.handle;
            const avatarHtml = profile.avatar
                ? `<img src="${profile.avatar}" alt="" class="mention-avatar" />`
                : `<div class="mention-avatar-placeholder">${name.charAt(0).toUpperCase()}</div>`;
            
            const followingBadgeHtml = profile.viewerFollowing
                ? `<span class="mention-following-badge">${i18n.t('compose.followingBadge')}</span>`
                : '';

            item.innerHTML = `
                ${avatarHtml}
                <div class="mention-user-info">
                    <div class="mention-names">
                        <strong class="mention-display-name">${name}</strong>
                        ${followingBadgeHtml}
                    </div>
                    <span class="mention-handle">@${profile.handle}</span>
                </div>
            `;

            item.addEventListener('mousedown', (e) => {
                e.preventDefault(); // Impede perda de foco do textarea
                this.selectProfile(profile);
            });

            this.dropdownEl!.appendChild(item);
        });

        this.updateActiveItem();
    }

    private updateActiveItem(): void {
        if (!this.dropdownEl || this.profiles.length === 0) return;

        const items = this.dropdownEl.querySelectorAll('li');
        items.forEach((item, idx) => {
            if (idx === this.activeIndex) {
                item.classList.add('active');
                item.setAttribute('aria-selected', 'true');
                item.scrollIntoView({ block: 'nearest' });
                this.textarea.setAttribute('aria-activedescendant', item.id);

                const activeProfile = this.profiles[idx];
                const name = activeProfile.displayName || activeProfile.handle;
                announcePolite(i18n.t('compose.mentionSelected', {
                    name,
                    handle: activeProfile.handle,
                    index: (idx + 1).toString(),
                    total: this.profiles.length.toString()
                }));
            } else {
                item.classList.remove('active');
                item.setAttribute('aria-selected', 'false');
            }
        });
    }

    private onKeyDown(e: KeyboardEvent): void {
        if (!this.isVisible || this.profiles.length === 0) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            e.stopPropagation();
            this.activeIndex = (this.activeIndex + 1) % this.profiles.length;
            this.updateActiveItem();
            return;
        }

        if (e.key === 'ArrowUp') {
            e.preventDefault();
            e.stopPropagation();
            this.activeIndex = (this.activeIndex - 1 + this.profiles.length) % this.profiles.length;
            this.updateActiveItem();
            return;
        }

        if (e.key === 'Enter' || e.key === 'Tab') {
            e.preventDefault();
            e.stopPropagation();
            if (this.activeIndex >= 0 && this.activeIndex < this.profiles.length) {
                this.selectProfile(this.profiles[this.activeIndex]);
            }
            return;
        }

        if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation(); // Impede estritamente o fechamento do modal de composição
            this.close();
            return;
        }
    }

    private selectProfile(profile: ProfileDTO): void {
        const text = this.textarea.value;
        const before = text.substring(0, this.mentionStartPos);
        const after = text.substring(this.mentionEndPos);

        const newText = `${before}@${profile.handle} ${after}`;
        this.textarea.value = newText;

        const newCursorPos = this.mentionStartPos + profile.handle.length + 2; // @ + handle + ' '
        this.textarea.setSelectionRange(newCursorPos, newCursorPos);
        this.textarea.focus();

        // Dispara evento input para atualizar contadores e preview
        this.textarea.dispatchEvent(new Event('input', { bubbles: true }));

        this.close();
    }
}
