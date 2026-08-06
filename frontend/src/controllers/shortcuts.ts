import { state } from '../config/state';
import { DOM } from '../config/dom';
import { announcePolite, announceAssertive } from '../utils/a11y';
import { confirmDialog, promptDialog } from '../utils/dialog';
import { switchTab, reloadCurrentTab } from './tabs';
import { loadTimeline } from './timeline';
import { loadProfile } from './profile';
import { loadChat, openChatConvo } from './chat';
import { openComposeModal } from './compose';
import { createPostArticle } from '../components/post';
import { loadNotifications } from './notifications';
import { loadSavedPosts } from './saved';

function showProfilesModal(title: string, profiles: any[]) {
    const modal = document.getElementById('profiles-list-modal') as HTMLDialogElement;
    const titleEl = document.getElementById('profiles-list-title');
    const container = document.getElementById('profiles-list-container');
    const closeBtn = document.getElementById('btn-close-profiles-list') as HTMLButtonElement;
    
    if (!modal || !titleEl || !container || !closeBtn) return;
    
    titleEl.textContent = title;
    container.innerHTML = '';
    
    if (profiles.length === 0) {
        container.innerHTML = '<p role="alert">Nenhum perfil encontrado.</p>';
    } else {
        profiles.forEach((p, i) => {
            const div = document.createElement('div');
            div.setAttribute('role', 'listitem');
            div.setAttribute('tabindex', i === 0 ? '0' : '-1');
            div.classList.add('profile-list-item');
            div.style.padding = '10px';
            div.style.borderBottom = '1px solid #ccc';
            div.style.cursor = 'pointer';
            div.innerHTML = `<strong>${p.displayName || p.handle}</strong> <small>@${p.handle}</small>`;
            div.setAttribute('aria-label', `Perfil: ${p.displayName || p.handle}, @${p.handle}`);
            
            const selectProfile = () => {
                modal.close();
                state.currentHandle = p.handle;
                state.profileTabMode = 'posts';
                announcePolite(`Abrindo perfil de @${state.currentHandle}`);
                switchTab('profile');
            };

            div.addEventListener('click', selectProfile);
            div.addEventListener('keydown', (ev) => {
                if (ev.key === 'Enter' || ev.key === ' ') {
                    ev.preventDefault();
                    selectProfile();
                } else if (ev.key === 'ArrowDown' || ev.key.toLowerCase() === 'j') {
                    ev.preventDefault();
                    const next = div.nextElementSibling as HTMLElement;
                    if (next && next.classList.contains('profile-list-item')) {
                        div.setAttribute('tabindex', '-1');
                        next.setAttribute('tabindex', '0');
                        next.focus();
                    }
                } else if (ev.key === 'ArrowUp' || ev.key.toLowerCase() === 'k') {
                    ev.preventDefault();
                    const prev = div.previousElementSibling as HTMLElement;
                    if (prev && prev.classList.contains('profile-list-item')) {
                        div.setAttribute('tabindex', '-1');
                        prev.setAttribute('tabindex', '0');
                        prev.focus();
                    } else {
                        div.setAttribute('tabindex', '-1');
                        closeBtn.focus();
                    }
                }
            });
            container.appendChild(div);
        });
    }
    
    closeBtn.onclick = () => modal.close();
    closeBtn.onkeydown = (ev) => {
        if (ev.key === 'ArrowDown' || ev.key.toLowerCase() === 'j') {
            ev.preventDefault();
            const firstItem = container.querySelector('.profile-list-item') as HTMLElement;
            if (firstItem) {
                firstItem.setAttribute('tabindex', '0');
                firstItem.focus();
            }
        } else if (ev.key === 'ArrowUp' || ev.key.toLowerCase() === 'k') {
            ev.preventDefault();
            const items = container.querySelectorAll('.profile-list-item');
            if (items.length > 0) {
                const lastItem = items[items.length - 1] as HTMLElement;
                lastItem.setAttribute('tabindex', '0');
                lastItem.focus();
            }
        }
    };
    modal.showModal();
    announceAssertive(`Modal aberto: ${title}. ${profiles.length} perfis exibidos. Use J e K ou setas para navegar, Enter para abrir, e Esc para fechar.`);
    const firstItem = container.querySelector('.profile-list-item') as HTMLElement;
    if (firstItem) {
        setTimeout(() => firstItem.focus(), 0);
    } else {
        setTimeout(() => closeBtn.focus(), 0);
    }
}

function showPostsModal(title: string, posts: any[]) {
    const modal = document.getElementById('posts-list-modal') as HTMLDialogElement;
    const titleEl = document.getElementById('posts-list-title');
    const container = document.getElementById('posts-list-container');
    const closeBtn = document.getElementById('btn-close-posts-list') as HTMLButtonElement;
    
    if (!modal || !titleEl || !container || !closeBtn) return;
    
    titleEl.textContent = title;
    container.innerHTML = '';
    
    const prevPosts = state.currentPosts;
    const prevIdx = state.focusedPostIndex;

    if (posts.length === 0) {
        container.innerHTML = '<p role="alert">Nenhum post encontrado.</p>';
    } else {
        posts.forEach((p, i) => {
            const article = createPostArticle(p, i);
            container.appendChild(article);
        });
    }
    
    const modalPosts = Array.from(container.querySelectorAll('.post-item')) as HTMLElement[];
    if (modalPosts.length > 0) {
        state.currentPosts = modalPosts;
        state.focusedPostIndex = 0;
    }

    modal.onclose = () => {
        if (state.currentPosts === modalPosts) {
            state.currentPosts = prevPosts;
            state.focusedPostIndex = prevIdx;
            if (prevPosts[prevIdx]) {
                setTimeout(() => prevPosts[prevIdx].focus(), 0);
            }
        }
        announcePolite("Modal fechado.");
    };

    closeBtn.onclick = () => modal.close();
    closeBtn.onkeydown = (ev) => {
        if (ev.key === 'ArrowDown' || ev.key.toLowerCase() === 'j') {
            ev.preventDefault();
            if (modalPosts.length > 0) {
                state.focusedPostIndex = 0;
                modalPosts[0].focus();
            }
        } else if (ev.key === 'ArrowUp' || ev.key.toLowerCase() === 'k') {
            ev.preventDefault();
            if (modalPosts.length > 0) {
                state.focusedPostIndex = modalPosts.length - 1;
                modalPosts[modalPosts.length - 1].focus();
            }
        }
    };
    modal.showModal();
    announceAssertive(`Modal aberto: ${title}. ${posts.length} publicações exibidas. Use J e K para navegar entre os posts, e Esc para fechar.`);
    if (modalPosts.length > 0) {
        setTimeout(() => modalPosts[0].focus(), 0);
    } else {
        setTimeout(() => closeBtn.focus(), 0);
    }
}

export function setupShortcuts() {
    const helpModal = document.getElementById('help-modal') as HTMLDialogElement;
    const btnCloseHelp = document.getElementById('btn-close-help') as HTMLButtonElement;
    if (helpModal) {
        if (btnCloseHelp) {
            btnCloseHelp.addEventListener('click', () => {
                helpModal.close();
            });
        }
        helpModal.addEventListener('close', () => {
            announcePolite("Menu de Ajuda fechado.");
        });
    }

    const directProfileModal = document.getElementById('direct-profile-modal') as HTMLDialogElement;
    const directProfileForm = document.getElementById('direct-profile-form') as HTMLFormElement;
    const directProfileInput = document.getElementById('direct-profile-input') as HTMLInputElement;
    const btnCloseDirectProfile = document.getElementById('btn-close-direct-profile') as HTMLButtonElement;

    if (directProfileModal) {
        if (btnCloseDirectProfile) {
            btnCloseDirectProfile.addEventListener('click', () => {
                directProfileModal.close();
            });
        }
        if (directProfileForm) {
            directProfileForm.addEventListener('submit', (e) => {
                e.preventDefault();
                const rawHandle = directProfileInput?.value?.trim() || '';
                const handle = rawHandle.startsWith('@') ? rawHandle.slice(1).trim() : rawHandle;
                if (!handle) {
                    announceAssertive("Por favor, digite um handle válido.");
                    return;
                }
                directProfileModal.close();
                state.currentHandle = handle;
                state.profileTabMode = 'posts';
                announcePolite(`Abrindo perfil de @${state.currentHandle}`);
                switchTab('profile');
            });
        }
        directProfileModal.addEventListener('close', () => {
            announcePolite("Modal de Ir para Perfil fechado.");
        });
    }

    window.addEventListener('keydown', async (e) => {
        if (!state.isAppReady) return;
        
        if (e.key === 'F1' && e.altKey) {
            e.preventDefault();
            const modal = document.getElementById('help-modal') as HTMLDialogElement;
            if (modal) {
                if (!modal.open) {
                    modal.showModal();
                    document.getElementById('help-shortcuts-list')?.focus();
                    announceAssertive("Menu de Ajuda aberto. Pressione Esc para fechar.");
                } else {
                    modal.close();
                }
            }
            return;
        }

        // Dark Mode Toggle
        if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'e') {
            e.preventDefault();
            document.body.classList.toggle('dark-mode');
            const isDark = document.body.classList.contains('dark-mode');
            localStorage.setItem('darkMode', isDark.toString());
            announceAssertive(isDark ? "Modo Escuro ativado" : "Modo Claro ativado");
            return;
        }

        if (e.ctrlKey && e.shiftKey && (e.key.toLowerCase() === 'p' || e.code === 'KeyP')) {
            e.preventDefault();
            if (directProfileModal && directProfileInput) {
                directProfileInput.value = '';
                if (!directProfileModal.open) {
                    directProfileModal.showModal();
                }
                directProfileInput.focus();
                announcePolite("Digite o handle do perfil que deseja acessar.");
            }
            return;
        }

        if (e.ctrlKey && e.key === 'Enter' && DOM.composeModal?.open) {
            e.preventDefault();
            const composeForm = document.getElementById('compose-form') as HTMLFormElement;
            if (composeForm) composeForm.requestSubmit();
            return;
        }
        
        if (e.key === 'Escape' && state.activeConvoId && state.currentTab === 'chat') {
            e.preventDefault();
            loadChat();
            return;
        }

        if (e.key === 'F5') {
            e.preventDefault();
            announcePolite("Recarregando aba atual...");
            reloadCurrentTab();
            return;
        }

        if (e.key === 'Alt') {
            e.preventDefault();
        }

        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

        if (e.key.toLowerCase() === 'r' && e.altKey) {
            e.preventDefault();
            state.hideReplies = !state.hideReplies;
            localStorage.setItem('hideReplies', String(state.hideReplies));
            const hideRepliesCheckbox = document.getElementById('setting-hide-replies') as HTMLInputElement;
            if (hideRepliesCheckbox) hideRepliesCheckbox.checked = state.hideReplies;
            announcePolite(state.hideReplies ? "Respostas ocultas" : "Respostas visíveis");
            if (state.currentTab === 'timeline') loadTimeline(false, true);
            return;
        }


        if (e.altKey && !e.shiftKey && !e.ctrlKey && e.key.toLowerCase() === 's') {
            e.preventDefault();
            switchTab('settings');
            return;
        }

        if (e.altKey && !e.shiftKey && !e.ctrlKey && e.key.toLowerCase() === 'c') {
            e.preventDefault();
            if (state.focusedPostIndex >= 0 && state.currentPosts[state.focusedPostIndex]) {
                const p = state.currentPosts[state.focusedPostIndex];
                const uri = p.dataset.uri;
                const authorHandle = p.dataset.authorHandle || p.dataset.author;
                if (uri && authorHandle) {
                    const rkey = uri.split('/').pop();
                    const bskyUrl = `https://bsky.app/profile/${authorHandle}/post/${rkey}`;
                    navigator.clipboard.writeText(bskyUrl).then(() => {
                        announceAssertive("URL do post copiada.");
                    }).catch(() => {
                        announceAssertive("Erro ao copiar URL do post.");
                    });
                }
            } else {
                announceAssertive("Nenhum post focado para copiar a URL.");
            }
            return;
        }

        if (e.ctrlKey && !e.shiftKey && !e.altKey) {
            let digitNum: number | null = null;
            if (e.code.startsWith('Digit')) {
                digitNum = parseInt(e.code.replace('Digit', ''), 10);
            } else if (e.code.startsWith('Numpad')) {
                digitNum = parseInt(e.code.replace('Numpad', ''), 10);
            } else if (e.key >= '1' && e.key <= '8') {
                digitNum = parseInt(e.key, 10);
            }

            if (digitNum !== null && digitNum >= 1 && digitNum <= 8 && state.currentTab === 'profile') {
                e.preventDefault();
                const profileModes: Array<typeof state.profileTabMode> = [
                    'posts', 'replies', 'media', 'likes', 'lists', 'starterPacks', 'followers', 'following'
                ];
                const labels = [
                    'Posts', 'Respostas', 'Mídia', 'Curtidas', 'Listas', 'Pacotes Iniciais', 'Seguidores', 'Seguindo'
                ];
                const mode = profileModes[digitNum - 1];
                const label = labels[digitNum - 1];
                state.profileTabMode = mode;
                announcePolite(label);
                loadProfile();
                return;
            }
        }

        if (e.altKey && e.shiftKey) {
            let digitNum: number | null = null;
            if (e.code.startsWith('Digit')) {
                digitNum = parseInt(e.code.replace('Digit', ''));
            } else if (e.code.startsWith('Numpad')) {
                digitNum = parseInt(e.code.replace('Numpad', ''));
            }

            if (digitNum !== null && !isNaN(digitNum)) {
                e.preventDefault();
                if (digitNum === 0) {
                    state.currentFeedUri = "";
                    announcePolite("Feed principal (Seguindo) selecionado");
                    if (state.currentTab !== 'timeline') {
                        state.tabStates['timeline'].loaded = false;
                        switchTab('timeline');
                    } else {
                        loadTimeline();
                    }
                } else {
                    const feedIdx = digitNum - 1;
                    if (feedIdx >= 0 && feedIdx < state.savedFeeds.length) {
                        const feed = state.savedFeeds[feedIdx];
                        state.currentFeedUri = feed.uri;
                        announcePolite(`Feed ${feed.displayName} selecionado`);
                        if (state.currentTab !== 'timeline') {
                            state.tabStates['timeline'].loaded = false;
                            switchTab('timeline');
                        } else {
                            loadTimeline();
                        }
                    } else {
                        announcePolite(`Nenhum feed salvo no atalho Alt+Shift+${digitNum}`);
                    }
                }
                return;
            }
        }

        if (e.key.toLowerCase() === 'f' && e.ctrlKey) {
            e.preventDefault();
            switchTab('search');
            const searchInput = document.getElementById('search-input') as HTMLInputElement;
            if (searchInput) searchInput.focus();
            return;
        }

        if (e.key.toLowerCase() === 'd' && e.ctrlKey && e.shiftKey) {
            e.preventDefault();
            let targetDid = "";
            let targetHandle = "";
            
            if (state.currentTab === 'profile') {
                const msgBtn = document.getElementById('btn-message');
                if (msgBtn && msgBtn.dataset.did) {
                    targetDid = msgBtn.dataset.did;
                    targetHandle = state.currentHandle;
                }
            } else if (state.focusedPostIndex >= 0 && state.currentPosts[state.focusedPostIndex]) {
                const p = state.currentPosts[state.focusedPostIndex];
                if (p.dataset.authorDid) {
                    targetDid = p.dataset.authorDid;
                    targetHandle = p.dataset.authorHandle || p.dataset.author || "";
                }
            }

            if (targetDid) {
                announcePolite(`Iniciando chat com @${targetHandle}...`);
                try {
                    const convo = await window.go.services.ChatService.GetConvoForMembers([targetDid]);
                    if (convo && convo.id) {
                        state.tabStates['chat'].loaded = true;
                        switchTab('chat');
                        openChatConvo(convo.id, targetHandle);
                    }
                } catch (err) {
                    announceAssertive("Erro ao abrir chat: " + err);
                }
            } else {
                announceAssertive("Nenhum perfil selecionado ou focado para enviar mensagem.");
            }
            return;
        }

        if (e.key.toLowerCase() === 'c' && e.shiftKey && !e.ctrlKey) {
            e.preventDefault();
            if (state.focusedPostIndex >= 0 && state.currentPosts[state.focusedPostIndex]) {
                const p = state.currentPosts[state.focusedPostIndex];
                const textToCopy = p.querySelector('.post-content p')?.textContent || p.dataset.text || "";
                navigator.clipboard.writeText(textToCopy).then(() => {
                    announceAssertive("Texto copiado.");
                }).catch(() => {
                    announceAssertive("Erro ao copiar.");
                });
            }
            return;
        }

        if (e.altKey && !e.shiftKey && !e.ctrlKey && e.key.toLowerCase() === 'd') {
            e.preventDefault();
            const focusedPost = state.focusedPostIndex >= 0 ? state.currentPosts[state.focusedPostIndex] : null;
            const uri = focusedPost?.dataset.uri;
            const cid = focusedPost?.dataset.cid;

            if (uri && cid) {
                promptDialog("Motivo da denúncia para a publicação:", "", "Denunciar Publicação").then(reason => {
                    if (reason) {
                        announcePolite("Enviando denúncia...");
                        window.go.services.ModerationService.ReportPost(uri, cid, 'com.atproto.moderation.defs#reasonOther', reason).then(() => {
                            announceAssertive("Denúncia de post enviada com sucesso.");
                        }).catch(err => announceAssertive("Erro ao enviar denúncia: " + err));
                    }
                });
            } else if (state.currentTab === 'profile') {
                const reportBtn = document.getElementById('btn-report-user') as HTMLButtonElement | null;
                const targetDid = reportBtn?.dataset.did;
                const targetHandle = state.currentHandle;
                if (targetDid) {
                    promptDialog(`Motivo da denúncia para @${targetHandle}:`, "", "Denunciar Conta").then(reason => {
                        if (reason) {
                            announcePolite("Enviando denúncia de conta...");
                            window.go.services.ModerationService.ReportAccount(targetDid, 'com.atproto.moderation.defs#reasonOther', reason).then(() => {
                                announceAssertive("Denúncia de conta enviada com sucesso.");
                            }).catch(err => announceAssertive("Erro ao enviar denúncia: " + err));
                        }
                    });
                } else {
                    announceAssertive("Nenhum perfil focado para denunciar.");
                }
            } else {
                announceAssertive("Nenhuma publicação ou perfil focado para denunciar.");
            }
            return;
        }

        if (e.altKey && !e.shiftKey && !e.ctrlKey && e.key.toLowerCase() === 'h') {
            e.preventDefault();
            const focusedPost = state.focusedPostIndex >= 0 ? state.currentPosts[state.focusedPostIndex] : null;
            const uri = focusedPost?.dataset.uri;
            const rootUri = focusedPost?.dataset.rootUri || focusedPost?.dataset.replyToUri || uri;
            if (uri && rootUri) {
                announcePolite("Ocultando resposta...");
                window.go.services.PostBuilderService.HideReply(rootUri, uri).then(() => {
                    announceAssertive("Resposta ocultada com sucesso.");
                }).catch((err: any) => announceAssertive("Erro ao ocultar resposta: " + err));
            } else {
                announceAssertive("Nenhuma resposta focada para ocultar.");
            }
            return;
        }

        if (!e.altKey && e.shiftKey && !e.ctrlKey && e.key.toLowerCase() === 'm') {
            e.preventDefault();
            const focusedPost = state.focusedPostIndex >= 0 ? state.currentPosts[state.focusedPostIndex] : null;
            const uri = focusedPost?.dataset.uri;
            if (uri) {
                announcePolite("Mutando thread...");
                window.go.services.ModerationService.MuteThread(uri).then(() => {
                    announceAssertive("Thread mutada com sucesso.");
                }).catch((err: any) => announceAssertive("Erro ao mutar thread: " + err));
            } else {
                announceAssertive("Nenhuma postagem focada para mutar thread.");
            }
            return;
        }

        if (!e.altKey && e.shiftKey && !e.ctrlKey && e.key.toLowerCase() === 'f') {
            e.preventDefault();
            const focusedPost = state.focusedPostIndex >= 0 ? state.currentPosts[state.focusedPostIndex] : null;
            const uri = focusedPost?.dataset.uri;
            const cid = focusedPost?.dataset.cid;
            if (uri && cid) {
                announcePolite("Fixando publicação no seu perfil...");
                window.go.services.SocialService.PinPost(uri, cid).then(() => {
                    announceAssertive("Publicação fixada com sucesso.");
                }).catch((err: any) => announceAssertive("Erro ao fixar publicação: " + err));
            } else {
                announceAssertive("Nenhuma postagem focada para fixar.");
            }
            return;
        }


        if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'r') {
            e.preventDefault();
            if (state.currentTab === 'notifications') {
                state.showOnlyMentions = !state.showOnlyMentions;
                announcePolite(state.showOnlyMentions ? "Exibindo apenas menções." : "Exibindo todas as notificações.");
                loadNotifications();
            }
            return;
        }

        if (!e.ctrlKey && !e.altKey && e.shiftKey && e.key.toLowerCase() === 'q') {
            e.preventDefault();
            if (state.focusedPostIndex >= 0 && state.currentPosts[state.focusedPostIndex]) {
                const p = state.currentPosts[state.focusedPostIndex];
                const uri = p.dataset.uri;
                const cid = p.dataset.cid;
                if (uri && cid) {
                    announcePolite("Carregando quotes...");
                    window.go.services.FeedService.GetQuotes(uri, cid, "").then(res => {
                        showPostsModal("Quotes", res.posts || []);
                    }).catch(err => announceAssertive("Erro ao carregar quotes: " + err));
                }
            }
            return;
        }

        if (!e.ctrlKey && !e.altKey && e.shiftKey && e.key.toLowerCase() === 'l') {
            e.preventDefault();
            if (state.focusedPostIndex >= 0 && state.currentPosts[state.focusedPostIndex]) {
                const p = state.currentPosts[state.focusedPostIndex];
                const uri = p.dataset.uri;
                const cid = p.dataset.cid;
                if (uri && cid) {
                    announcePolite("Carregando curtidas...");
                    window.go.services.FeedService.GetLikes(uri, cid, "").then(res => {
                        showProfilesModal("Curtidas", res.profiles || []);
                    }).catch(err => announceAssertive("Erro ao carregar curtidas: " + err));
                }
            }
            return;
        }

        if (!e.ctrlKey && !e.altKey && e.shiftKey && e.key.toLowerCase() === 'o') {
            e.preventDefault();
            if (state.focusedPostIndex >= 0 && state.currentPosts[state.focusedPostIndex]) {
                const p = state.currentPosts[state.focusedPostIndex];
                const quoteUri = p.dataset.quoteUri;
                if (quoteUri) {
                    announcePolite("Carregando post original citado...");
                    window.go.services.FeedService.GetPosts([quoteUri]).then(res => {
                        showPostsModal("Post Citado (Original)", res.posts || []);
                    }).catch(err => announceAssertive("Erro ao carregar post original: " + err));
                } else {
                    announcePolite("Este post não possui uma citação (quote).");
                }
            }
            return;
        }

        if (!e.ctrlKey && !e.altKey && e.shiftKey && e.key.toLowerCase() === 'r') {
            e.preventDefault();
            if (state.focusedPostIndex >= 0 && state.currentPosts[state.focusedPostIndex]) {
                const p = state.currentPosts[state.focusedPostIndex];
                const uri = p.dataset.uri;
                if (uri) {
                    announcePolite("Carregando respostas...");
                    window.go.services.FeedService.GetPostThread(uri, 5).then(res => {
                        showPostsModal("Respostas", res.posts || []);
                    }).catch(err => announceAssertive("Erro ao carregar respostas: " + err));
                }
            }
            return;
        }

        if (!e.ctrlKey && !e.altKey && e.shiftKey && e.key.toLowerCase() === 't') {
            e.preventDefault();
            if (state.focusedPostIndex >= 0 && state.currentPosts[state.focusedPostIndex]) {
                const p = state.currentPosts[state.focusedPostIndex];
                const uri = p.dataset.uri;
                const cid = p.dataset.cid;
                if (uri && cid) {
                    announcePolite("Carregando reposts...");
                    window.go.services.FeedService.GetRepostedBy(uri, cid, "").then(res => {
                        showProfilesModal("Reposts", res.profiles || []);
                    }).catch(err => announceAssertive("Erro ao carregar reposts: " + err));
                }
            }
            return;
        }

        if (!e.ctrlKey && !e.altKey && e.shiftKey && e.key.toLowerCase() === 's') {
            e.preventDefault();
            if (state.focusedPostIndex >= 0 && state.currentPosts[state.focusedPostIndex]) {
                const btn = state.currentPosts[state.focusedPostIndex].querySelector('.btn-bookmark') as HTMLButtonElement;
                if (btn) btn.click();
            }
            return;
        }

        
        switch(e.key.toLowerCase()) {
            case 'j':
            e.preventDefault();
            const profModalJ = document.getElementById('profiles-list-modal') as HTMLDialogElement;
            if (profModalJ && profModalJ.open) {
                const active = document.activeElement as HTMLElement;
                if (active && active.classList.contains('profile-list-item')) {
                    const next = active.nextElementSibling as HTMLElement;
                    if (next && next.classList.contains('profile-list-item')) {
                        active.setAttribute('tabindex', '-1');
                        next.setAttribute('tabindex', '0');
                        next.focus();
                    }
                } else {
                    const first = profModalJ.querySelector('.profile-list-item') as HTMLElement;
                    if (first) { first.setAttribute('tabindex', '0'); first.focus(); }
                }
                break;
            }
            if (state.focusedPostIndex < state.currentPosts.length - 1) {
                state.focusedPostIndex++;
                state.currentPosts[state.focusedPostIndex].focus();
            } else if (state.focusedPostIndex === state.currentPosts.length - 1 && !(document.getElementById('posts-list-modal') as HTMLDialogElement)?.open) {
                if (state.currentTab === 'timeline') {
                announcePolite("Carregando mais posts...");
                loadTimeline(true);
                } else if (state.currentTab === 'profile' && state.focusedPostIndex > 0) {
                announcePolite("Carregando mais conteúdo do perfil...");
                loadProfile(true);
                } else if (state.currentTab === 'notifications') {
                announcePolite("Carregando mais notificações...");
                loadNotifications(true);
                } else if (state.currentTab === 'chat' && !state.activeConvoId) {
                announcePolite("Carregando mais chats...");
                loadChat(true);
                } else if (state.currentTab === 'saved') {
                announcePolite("Carregando mais posts salvos...");
                loadSavedPosts(true);
                }
            }
            break;
            case 'k':
            e.preventDefault();
            const profModalK = document.getElementById('profiles-list-modal') as HTMLDialogElement;
            if (profModalK && profModalK.open) {
                const active = document.activeElement as HTMLElement;
                if (active && active.classList.contains('profile-list-item')) {
                    const prev = active.previousElementSibling as HTMLElement;
                    if (prev && prev.classList.contains('profile-list-item')) {
                        active.setAttribute('tabindex', '-1');
                        prev.setAttribute('tabindex', '0');
                        prev.focus();
                    } else {
                        active.setAttribute('tabindex', '-1');
                        const closeBtn = document.getElementById('btn-close-profiles-list') as HTMLElement;
                        if (closeBtn) closeBtn.focus();
                    }
                }
                break;
            }
            if (state.focusedPostIndex > 0) {
                state.focusedPostIndex--;
                state.currentPosts[state.focusedPostIndex].focus();
            }
            break;
            case 'p':
            e.preventDefault();
            if (state.focusedPostIndex >= 0) {
                const p = state.currentPosts[state.focusedPostIndex];
                const handles = new Set<string>();
                if (p.dataset.authorHandle) handles.add(p.dataset.authorHandle);
                if (p.dataset.replyTo) handles.add(p.dataset.replyTo);
                if (p.dataset.repostedBy) handles.add(p.dataset.repostedBy);
                if (p.dataset.quoteAuthorHandle) handles.add(p.dataset.quoteAuthorHandle);

                const handleArr = Array.from(handles);
                if (handleArr.length === 1) {
                    state.currentHandle = handleArr[0];
                    state.profileTabMode = 'posts';
                    announcePolite(`Abrindo perfil de @${state.currentHandle}`);
                    switchTab('profile');
                } else if (handleArr.length > 1) {
                    const modal = document.getElementById('profile-picker-modal') as HTMLDialogElement;
                    const list = document.getElementById('profile-picker-list') as HTMLDivElement;
                    if (modal && list) {
                        list.innerHTML = '';
                        let modalFocusedIdx = 0;
                        const options: HTMLElement[] = [];
                        
                        handleArr.forEach((h, i) => {
                            const btn = document.createElement('button');
                            btn.setAttribute('role', 'menuitem');
                            btn.setAttribute('tabindex', i === 0 ? '0' : '-1');
                            btn.textContent = `@${h}`;
                            btn.dataset.handle = h;
                            btn.addEventListener('click', () => {
                                modal.close();
                                state.currentHandle = h;
                                state.profileTabMode = 'posts';
                                announcePolite(`Abrindo perfil de @${state.currentHandle}`);
                                switchTab('profile');
                            });
                            btn.addEventListener('keydown', (ev) => {
                                if (ev.key === 'ArrowDown') {
                                    ev.preventDefault();
                                    options[modalFocusedIdx].setAttribute('tabindex', '-1');
                                    modalFocusedIdx = (i + 1) % options.length;
                                    options[modalFocusedIdx].setAttribute('tabindex', '0');
                                    options[modalFocusedIdx].focus();
                                } else if (ev.key === 'ArrowUp') {
                                    ev.preventDefault();
                                    options[modalFocusedIdx].setAttribute('tabindex', '-1');
                                    modalFocusedIdx = (i - 1 + options.length) % options.length;
                                    options[modalFocusedIdx].setAttribute('tabindex', '0');
                                    options[modalFocusedIdx].focus();
                                }
                            });
                            list.appendChild(btn);
                            options.push(btn);
                        });
                        
                        const closeBtn = document.getElementById('btn-close-profile-picker') as HTMLButtonElement;
                        if (closeBtn) closeBtn.onclick = () => modal.close();
                        
                        modal.showModal();
                        if (options.length > 0) options[0].focus();
                        announcePolite(`Múltiplos perfis encontrados. Use as setas para selecionar.`);
                    }
                }
            }
            break;
            case 'e':
            e.preventDefault();
            if (e.shiftKey) {
                announcePolite("Recolhendo postagens expandidas...");
                reloadCurrentTab();
                break;
            }
            if (state.focusedPostIndex >= 0 && state.currentPosts[state.focusedPostIndex]) {
                const p = state.currentPosts[state.focusedPostIndex];
                const targetUri = p.dataset.uri;
                if (targetUri) {
                    announcePolite("Expandindo árvore de diálogo...");
                    window.go.services.FeedService.GetPostThread(targetUri, 10).then(res => {
                        showPostsModal("Árvore de Diálogo", res.posts || []);
                    }).catch(err => announceAssertive("Erro ao expandir árvore de diálogo: " + err));
                } else {
                    announcePolite("Não foi possível identificar o URI do post para expandir o diálogo.");
                }
            }
            break;
            case 'a':
            e.preventDefault();
            if (state.focusedPostIndex >= 0) {
                const p = state.currentPosts[state.focusedPostIndex];
                if (p.dataset.externalUrl) {
                    (window as any).runtime.BrowserOpenURL(p.dataset.externalUrl);
                    announcePolite("Abrindo link externo");
                } else if (p.dataset.text) {
                    const urlMatch = p.dataset.text.match(/(https?:\/\/[^\s]+)/);
                    if (urlMatch) {
                        (window as any).runtime.BrowserOpenURL(urlMatch[0]);
                        announcePolite("Abrindo link do texto");
                    } else {
                        announcePolite("Nenhum link encontrado na postagem.");
                    }
                }
            }
            break;
            case 'v':
            e.preventDefault();
            if (state.focusedPostIndex >= 0) {
                const p = state.currentPosts[state.focusedPostIndex];
                if (p.dataset.hasVideo === 'true') {
                    const vids = p.querySelectorAll<HTMLVideoElement>('.post-video');
                    if (vids.length > 0) {
                        let anyPlaying = false;
                        vids.forEach(v => {
                            if (!v.paused) anyPlaying = true;
                        });
                        if (anyPlaying) {
                            vids.forEach(v => v.pause());
                            announcePolite("Vídeo pausado.");
                        } else {
                            vids.forEach(v => {
                                v.play().catch(() => {});
                            });
                            let altMsg = "";
                            if (p.dataset.videoAlt) {
                                altMsg += ` Descrição: ${p.dataset.videoAlt}.`;
                            }
                            if (p.dataset.quoteVideoAlt !== undefined) {
                                altMsg += ` Descrição do vídeo citado: ${p.dataset.quoteVideoAlt ? p.dataset.quoteVideoAlt : "Sem descrição alternativa"}.`;
                            }
                            if (!altMsg) {
                                altMsg = " (Sem descrição alternativa)";
                            }
                            announcePolite(`Reproduzindo vídeo.${altMsg}`);
                        }
                    } else {
                        announcePolite("Vídeo não encontrado no post.");
                    }
                } else {
                    announcePolite("Este post não possui vídeo.");
                }
            }
            break;
            case 's':
            if (!e.altKey && state.currentTab === 'profile' && document.getElementById('btn-follow')) {
                e.preventDefault();
                document.getElementById('btn-follow')?.click();
            }
            break;
            case 'm':
            e.preventDefault();
            {
                let did = state.focusedPostIndex >= 0 ? state.currentPosts[state.focusedPostIndex]?.dataset.authorDid : undefined;
                let handle = state.focusedPostIndex >= 0 ? state.currentPosts[state.focusedPostIndex]?.dataset.authorHandle : undefined;
                if (!did && state.currentTab === 'profile') {
                    const muteBtn = document.getElementById('btn-mute') as HTMLButtonElement | null;
                    did = muteBtn?.dataset.did;
                    handle = muteBtn?.dataset.handle;
                }
                if (did && handle) {
                    confirmDialog(`Deseja silenciar @${handle}?`, 'Silenciar Usuário').then(confirmed => {
                        if (confirmed) {
                            announcePolite(`Silenciando @${handle}...`);
                            window.go.services.ModerationService.MuteActor(did!).then(() => {
                                announceAssertive(`Usuário @${handle} silenciado.`);
                            }).catch((err: any) => announceAssertive("Erro ao silenciar: " + err));
                        }
                    });
                } else {
                    announceAssertive("Nenhum usuário focado para silenciar.");
                }
            }
            break;
            case 'b':
            e.preventDefault();
            {
                let did = state.focusedPostIndex >= 0 ? state.currentPosts[state.focusedPostIndex]?.dataset.authorDid : undefined;
                let author = state.focusedPostIndex >= 0 ? state.currentPosts[state.focusedPostIndex]?.dataset.authorHandle : undefined;
                if (!did && state.currentTab === 'profile') {
                    const blockBtn = document.getElementById('btn-block') as HTMLButtonElement | null;
                    did = blockBtn?.dataset.did;
                    author = state.currentHandle || undefined;
                }
                if (did && author) {
                    confirmDialog(`Deseja bloquear @${author}?`, 'Bloquear Usuário').then(confirmed => {
                        if (confirmed) {
                            announcePolite(`Bloqueando @${author}...`);
                            window.go.services.ModerationService.BlockActor(did!).then(() => {
                                announceAssertive(`Usuário @${author} bloqueado.`);
                            }).catch((_err: any) => announceAssertive("Erro ao bloquear usuário."));
                        }
                    });
                } else {
                    announceAssertive("Nenhum usuário focado para bloquear.");
                }
            }
            break;
            case 'u':
            if (!e.altKey && state.currentTab === 'profile' && document.getElementById('btn-unfollow')) {
                e.preventDefault();
                document.getElementById('btn-unfollow')?.click();
            }
            break;
            case '.':
            e.preventDefault();
            if (state.currentPosts.length > 0) {
                state.focusedPostIndex = 0;
                state.currentPosts[0].focus();
            }
            break;
            case 'n':
            if (state.currentTab !== 'chat' && state.currentTab !== 'settings') {
                e.preventDefault();
                openComposeModal('post');
            }
            break;
            case 'x':
                if (state.currentTab === 'chat' || state.currentTab === 'settings') break;
                e.preventDefault();
                if (state.focusedPostIndex >= 0 && state.currentPosts[state.focusedPostIndex]) {
                    const p = state.currentPosts[state.focusedPostIndex];
                    const authorHandle = p.dataset.authorHandle || p.dataset.author;
                    const authorDid = p.dataset.authorDid;
                    const isOwner = (authorHandle && authorHandle === state.loggedInHandle) || (authorDid && authorDid === state.loggedInHandle);
                    
                    if (!isOwner) {
                        announceAssertive("Você só pode excluir suas próprias publicações.");
                        break;
                    }
                    
                    const uri = p.dataset.uri;
                    if (uri) {
                        confirmDialog("Deseja realmente excluir esta publicação?", "Excluir Publicação").then(async (confirmed) => {
                            if (confirmed) {
                                announcePolite("Excluindo publicação...");
                                try {
                                    await window.go.services.PostBuilderService.DeletePost(uri);
                                    announceAssertive("Publicação excluída com sucesso.");
                                    p.remove();
                                    state.currentPosts.splice(state.focusedPostIndex, 1);
                                    if (state.focusedPostIndex >= state.currentPosts.length) {
                                        state.focusedPostIndex = state.currentPosts.length - 1;
                                    }
                                    if (state.focusedPostIndex >= 0 && state.currentPosts[state.focusedPostIndex]) {
                                        state.currentPosts[state.focusedPostIndex].focus();
                                    }
                                } catch (err: any) {
                                    announceAssertive("Erro ao excluir publicação: " + err);
                                }
                            }
                        });
                    }
                }
                break;
            case 'l':
                if (state.currentTab === 'chat' || state.currentTab === 'settings') break;
                e.preventDefault();
                if (state.focusedPostIndex >= 0) {
                    const btn = state.currentPosts[state.focusedPostIndex].querySelector('.btn-like') as HTMLButtonElement;
                    if (btn) btn.click();
                }
                break;
            case 't':
                if (state.currentTab === 'chat' || state.currentTab === 'settings') break;
                e.preventDefault();
                if (state.focusedPostIndex >= 0) {
                    const btn = state.currentPosts[state.focusedPostIndex].querySelector('.btn-repost') as HTMLButtonElement;
                    if (btn) btn.click();
                }
                break;
            case 'q':
                if (state.currentTab === 'chat' || state.currentTab === 'settings') break;
                e.preventDefault();
                if (state.focusedPostIndex >= 0) {
                    const btn = state.currentPosts[state.focusedPostIndex].querySelector('.btn-quote') as HTMLButtonElement;
                    if (btn) btn.click();
                }
                break;
            case 'r':
                e.preventDefault();
                if (state.currentTab === 'chat') {
                    if (document.getElementById('chat-input')) {
                        document.getElementById('chat-input')?.focus();
                        announcePolite("Modo de resposta no chat");
                    }
                    break;
                }
                if (state.currentTab === 'settings') break;
                if (state.focusedPostIndex >= 0) {
                    const btn = state.currentPosts[state.focusedPostIndex].querySelector('.btn-reply') as HTMLButtonElement;
                    if (btn) btn.click();
                    else {
                        const p = state.currentPosts[state.focusedPostIndex];
                        if (p.dataset.uri) {
                            openComposeModal('reply', {uri: p.dataset.uri, cid: p.dataset.cid!, authorHandle: p.dataset.author});
                        }
                    }
                }
                break;
            case '1':
            if (e.altKey) { e.preventDefault(); switchTab('timeline'); }
            break;
            case '2':
            if (e.altKey) { e.preventDefault(); switchTab('notifications'); }
            break;
            case '3':
            if (e.altKey) { 
                e.preventDefault(); 
                state.currentHandle = state.loggedInHandle;
                state.profileTabMode = 'posts';
                switchTab('profile'); 
            }
            break;
            case '4':
            if (e.altKey) { e.preventDefault(); switchTab('chat'); }
            break;
            case '5':
            if (e.altKey) { e.preventDefault(); switchTab('feeds'); }
            break;
            case '6':
            if (e.altKey) { e.preventDefault(); switchTab('saved'); }
            break;
            case '7':
            if (e.altKey) { e.preventDefault(); switchTab('search'); }
            break;
            case '8':
            if (e.altKey) { e.preventDefault(); switchTab('settings'); }
            break;
            case '9':
            if (e.altKey) { e.preventDefault(); switchTab('lists'); }
            break;
        }
    });
}
