const localeFiles = import.meta.glob<{ default: Record<string, TranslationValue> }>(
    '../locales/*.json',
    { eager: true }
);

export type TranslationValue = string | TranslationMap;
export interface TranslationMap { [key: string]: TranslationValue }
export type Translations = TranslationMap;

export class I18n {
    private currentLang: string = 'pt_br';
    private fallbackLang: string = 'en_us';
    private locales: Record<string, Translations> = {};

    constructor() {
        this.loadLocales();
        this.detectLanguage();
    }

    private loadLocales() {
        for (const path in localeFiles) {
            const langCode = path.match(/\/([^/]+)\.json$/)?.[1];
            if (langCode) {
                this.locales[langCode] = localeFiles[path].default;
            }
        }
    }

    private resolveLocale(lang: string): string {
        if (this.locales[lang]) return lang;
        const prefix = lang.split('_')[0];
        return Object.keys(this.locales).find(k => k.startsWith(prefix)) ?? this.fallbackLang;
    }

    private detectLanguage() {
        const saved = localStorage.getItem('app-language');
        if (saved && this.locales[saved]) {
            this.currentLang = saved;
            return;
        }

        const browserLang = navigator.language.toLowerCase().replace('-', '_');
        this.currentLang = this.resolveLocale(browserLang);
    }

    public setLanguage(lang: string) {
        const finalLang = this.resolveLocale(lang);

        if (this.locales[finalLang]) {
            this.currentLang = finalLang;
            localStorage.setItem('app-language', finalLang);
            this.translateDOM();
            window.dispatchEvent(new CustomEvent('language-changed', { detail: { lang: finalLang } }));
        } else {
            console.warn(`Language ${finalLang} not found.`);
        }
    }

    public getLanguage(): string {
        return this.currentLang;
    }

    public getAvailableLanguages(): string[] {
        return Object.keys(this.locales);
    }

    // Get a nested string by dot notation (e.g., 'nav.timeline')
    public t(key: string, variables?: Record<string, string>): string {
        const keys = key.split('.');
        
        let value = this.getValue(this.locales[this.currentLang], keys);
        
        if (value === undefined && this.currentLang !== this.fallbackLang) {
            value = this.getValue(this.locales[this.fallbackLang], keys);
        }

        if (value === undefined) {
            return key; // return the key itself if not found
        }

        if (typeof value === 'string' && variables) {
            return value.replace(/{{(.*?)}}/g, (_, k) => variables[k.trim()] || '');
        }

        return typeof value === 'string' ? value : key;
    }

    private getValue(obj: Translations | undefined, keys: string[]): TranslationValue | undefined {
        let current: TranslationValue | undefined = obj;
        for (const k of keys) {
            if (current === undefined || current === null || typeof current !== 'object') return undefined;
            current = (current as Record<string, TranslationValue>)[k];
        }
        return current;
    }

    // Translate the static HTML DOM
    public translateDOM(root: Document | HTMLElement = document) {
        const elements = root.querySelectorAll('[data-i18n]');
        elements.forEach(el => {
            const key = el.getAttribute('data-i18n');
            if (key) {
                // If it's an input or textarea with placeholder, translate placeholder
                if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
                    if (el.hasAttribute('placeholder')) {
                        el.placeholder = this.t(key);
                    } else if (el.type === 'submit' || el.type === 'button') {
                        el.value = this.t(key);
                    }
                } else if (el instanceof HTMLOptGroupElement) {
                    el.label = this.t(key);
                } else {
                    el.textContent = this.t(key);
                }
            }
        });
        
        // Also translate aria-labels if needed (using data-i18n-aria)
        const ariaElements = root.querySelectorAll('[data-i18n-aria]');
        ariaElements.forEach(el => {
            const key = el.getAttribute('data-i18n-aria');
            if (key) {
                el.setAttribute('aria-label', this.t(key));
            }
        });
        
        // Translate titles
        const titleElements = root.querySelectorAll('[data-i18n-title]');
        titleElements.forEach(el => {
            const key = el.getAttribute('data-i18n-title');
            if (key) {
                el.setAttribute('title', this.t(key));
            }
        });
    }
}

// Export a singleton instance
export const i18n = new I18n();
export const t = i18n.t.bind(i18n);
