import './style.css';
import { DOM } from './config/dom';
import { setupAuth, initApp } from './controllers/auth';
import { setupShortcuts } from './controllers/shortcuts';
import { setupSearch } from './controllers/search';
import { setupSettings, loadSettings } from './controllers/settings';
import { setupCompose, openComposeModal } from './controllers/compose';
import { setupProfile } from './controllers/profile';
import { switchTab } from './controllers/tabs';
import { setupLinkDelegation } from './controllers/link_router';
import { i18n } from './utils/i18n';

// Translate the DOM initially
i18n.translateDOM();

// Bind Main Navigation Tabs
Object.keys(DOM.tabs).forEach(tabId => {
    const tabEl = DOM.tabs[tabId as keyof typeof DOM.tabs];
    if (tabEl) {
        tabEl.addEventListener('click', () => switchTab(tabId as keyof typeof DOM.tabs));
    }
});

// Setup controllers
const helpTab = document.getElementById('tab-help');
if (helpTab) {
    helpTab.addEventListener('click', () => {
        const modal = document.getElementById('help-modal') as HTMLDialogElement;
        if (modal && !modal.open) {
            modal.showModal();
        }
    });
}

const newPostBtn = document.getElementById('btn-new-post-visual');
if (newPostBtn) {
    newPostBtn.addEventListener('click', () => {
        openComposeModal('post');
    });
}

setupAuth();
setupShortcuts();
setupSearch();
setupSettings();
setupCompose();
setupProfile();
setupLinkDelegation();

// Load initial settings and initialize app
loadSettings().then(() => {
    initApp();
});
