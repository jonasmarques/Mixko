import { state } from '../config/state';
import { DOM } from '../config/dom';
import { announcePolite, announceAssertive } from '../utils/a11y';
import { switchTab } from './tabs';
import { loadTimeline } from './timeline';
import { loadNotifications } from './notifications';
import { loadChat, openChatConvo } from './chat';
import { checkAppUpdates } from './updater';

export function setupAuth() {
    if (DOM.loginForm) {
        DOM.loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const idInput = document.getElementById('identifier') as HTMLInputElement;
            const pwInput = document.getElementById('appPassword') as HTMLInputElement;
            const rememberInput = document.getElementById('remember-me') as HTMLInputElement;
            announcePolite("Iniciando login, aguarde...");
            try {
                const errDiv = document.getElementById('login-error');
                if (errDiv) errDiv.classList.add('hidden');
                
                await window.go.services.AuthService.Login(idInput.value, pwInput.value, rememberInput.checked);
                state.loggedInHandle = idInput.value;
                state.currentHandle = state.loggedInHandle;
                localStorage.setItem('lastHandle', state.loggedInHandle);
                announceAssertive("Login efetuado.");
                DOM.loginSection.classList.add('hidden');
                DOM.appSections.classList.remove('hidden');
                DOM.mainNav.classList.remove('hidden');
                const newPostBtn = document.getElementById('btn-new-post-visual');
                if (newPostBtn) newPostBtn.classList.remove('hidden');
                state.isAppReady = true;
                try { state.savedFeeds = await window.go.services.FeedService.GetSavedFeeds() || []; } catch(e) {}
                switchTab('timeline');
            } catch (err: any) { 
                announceAssertive("Erro no login: " + err); 
                const errDiv = document.getElementById('login-error');
                if (errDiv) {
                    errDiv.textContent = "Erro no login: " + err;
                    errDiv.classList.remove('hidden');
                }
            }
        });
    }

    // Hook into Wails Events for background sync updates
    (window as any).runtime.EventsOn("new_timeline_posts", () => {
        if (state.currentTab === 'timeline') {
            if (window.scrollY < 100) {
                // Reload timeline silently if at top
                updateTimeline();
            }
        }
    });

    (window as any).runtime.EventsOn("new_notifications", () => {
        if (state.currentTab === 'notifications') {
            if (window.scrollY < 100) {
                updateNotifications();
            }
        } else {
            state.tabStates['notifications'].loaded = false;
            announcePolite("Novas notificações recebidas");
        }
    });

    (window as any).runtime.EventsOn("new_chat_messages", () => {
        if (state.currentTab === 'chat') {
            updateChat();
        } else {
            state.tabStates['chat'].loaded = false;
            announcePolite("Novas mensagens de chat recebidas");
        }
    });

    if (state.autoUpdateInterval) clearInterval(state.autoUpdateInterval);
    state.autoUpdateInterval = window.setInterval(() => {
        if (!state.isAppReady || !state.loggedInHandle) return;

        if (state.currentTab === 'notifications') {
            if (window.scrollY < 100) {
                updateNotifications();
            }
        } else {
            state.tabStates['notifications'].loaded = false;
        }

        if (state.currentTab === 'chat') {
            updateChat();
        } else {
            state.tabStates['chat'].loaded = false;
        }
    }, 60000);
}

export async function updateTimeline() {
    try {
        let res;
        if (state.currentFeedUri === "") {
            res = await window.go.services.FeedService.GetTimeline("", 100);
        } else {
            res = await window.go.services.FeedService.GetCustomFeed(state.currentFeedUri, "", 100);
        }
        if (res && res.posts) {
            loadTimeline(false); // reload the timeline completely
        }
    } catch(err) { console.error(err); }
}

export async function updateNotifications() {
    try {
        const res = await window.go.services.NotificationsService.GetNotifications("");
        if (res && res.notifications) {
            loadNotifications(false, true);
        }
    } catch(err) { console.error(err); }
}

export async function updateChat() {
    try {
        if (state.currentTab === 'chat') {
            if (!state.activeConvoId) {
                loadChat(false);
            } else {
                const msgsContainer = document.getElementById('chat-messages') as HTMLDivElement;
                if (msgsContainer) {
                    const res = await window.go.services.ChatService.GetMessages(state.activeConvoId, "");
                    if (res && res.messages && res.messages.length > 0 && res.messages.length !== state.currentPosts.length) {
                        window.go.services.ChatService.UpdateReadStatus(state.activeConvoId, res.messages[0].id).catch((e: any) => console.error(e));
                        openChatConvo(state.activeConvoId, "", true);
                    }
                }
            }
        } else {
            state.tabStates['chat'].loaded = false;
        }
    } catch(err) { console.error(err); }
}

export async function initApp() {
    window.focus();
    document.body.focus();
    checkAppUpdates();
    const lastHandle = localStorage.getItem('lastHandle');
    if (lastHandle) {
        const idInput = document.getElementById('identifier') as HTMLInputElement;
        if (idInput) idInput.value = lastHandle;
        idInput?.focus();
    }
    try {
        const handle = await window.go.services.AuthService.RestoreSession();
        if (handle) {
            state.loggedInHandle = handle;
            state.currentHandle = state.loggedInHandle;
            announceAssertive("Sessão restaurada.");
            DOM.loginSection.classList.add('hidden');
            DOM.appSections.classList.remove('hidden');
            DOM.mainNav.classList.remove('hidden');
            const newPostBtn = document.getElementById('btn-new-post-visual');
            if (newPostBtn) newPostBtn.classList.remove('hidden');
            state.isAppReady = true;
            try { state.savedFeeds = await window.go.services.FeedService.GetSavedFeeds() || []; } catch(e) {}
            switchTab('timeline');
        } else {
            announcePolite("Pronto para login.");
        }
    } catch (err) {
        announcePolite("Pronto para login.");
    }
}
