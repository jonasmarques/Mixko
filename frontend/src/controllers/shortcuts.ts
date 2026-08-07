import { state } from '../config/state';
import { DOM } from '../config/dom';
import { announcePolite, announceAssertive } from '../utils/a11y';
import { confirmDialog, promptDialog } from '../utils/dialog';
import { switchTab, reloadCurrentTab } from './tabs';
import { i18n } from '../utils/i18n';
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
        container.innerHTML = `<p role="alert">${i18n.t('shortcuts.noProfilesFound')}</p>`;
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
            div.setAttribute('aria-label', `${i18n.t('app.profile')}: ${p.displayName || p.handle}, @${p.handle}`);
            
            const selectProfile = () => {
                modal.close();
                state.currentHandle = p.handle;
                state.profileTabMode = 'posts';
                announcePolite(i18n.t('shortcuts.openingProfile', { handle: state.currentHandle }));
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
    announceAssertive(i18n.t('shortcuts.modalOpen', { title, count: profiles.length.toString() }));
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
        container.innerHTML = `<p role="alert">${i18n.t('shortcuts.noPostsFound')}</p>`;
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
        announcePolite(i18n.t('shortcuts.modalClosed'));
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
    announceAssertive(i18n.t('shortcuts.postsModalOpen', { title, count: posts.length.toString() }));
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
            announcePolite(i18n.t('shortcuts.helpClosed'));
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
                    announceAssertive(i18n.t('shortcuts.invalidHandle'));
                    return;
                }
                directProfileModal.close();
                state.currentHandle = handle;
                state.profileTabMode = 'posts';
                announcePolite(i18n.t('shortcuts.openingProfile', { handle: state.currentHandle }));
                switchTab('profile');
            });
        }
        directProfileModal.addEventListener('close', () => {
            announcePolite(i18n.t('shortcuts.profileModalClosed'));
        });
    }

    let altCodeSequence = "";
    
    window.addEventListener('keydown', async (e) => {
        if (!state.isAppReady) return;

        if (e.key === 'Alt') {
            altCodeSequence = "";
            return;
        }

        if (e.altKey && e.code.startsWith('Numpad')) {
            const digit = e.code.replace('Numpad', '');
            if (!isNaN(parseInt(digit))) {
                altCodeSequence += digit;
                e.preventDefault();
            }
            return;
        } else if (!e.altKey) {
            altCodeSequence = "";
        }

        if (e.key === 'F1' && e.altKey) {
            e.preventDefault();
            const modal = document.getElementById('help-modal') as HTMLDialogElement;
            if (modal) {
                if (!modal.open) {
                    modal.showModal();
                    document.getElementById('help-shortcuts-list')?.focus();
                    announceAssertive(i18n.t('shortcuts.helpOpen'));
                } else {
                    modal.close();
                }
            }
            return;
        }

        if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'e') {
            e.preventDefault();
            document.body.classList.toggle('dark-mode');
            const isDark = document.body.classList.contains('dark-mode');
            localStorage.setItem('darkMode', isDark.toString());
            announceAssertive(isDark ? i18n.t('settings.darkModeOn') : i18n.t('settings.darkModeOff'));
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
                announcePolite(i18n.t('shortcuts.enterHandle'));
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
            announcePolite(i18n.t('shortcuts.reloadingTab'));
            reloadCurrentTab();
            return;
        }

        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

        if (e.key.toLowerCase() === 'r' && e.altKey) {
            e.preventDefault();
            state.hideReplies = !state.hideReplies;
            localStorage.setItem('hideReplies', String(state.hideReplies));
            const hideRepliesCheckbox = document.getElementById('setting-hide-replies') as HTMLInputElement;
            if (hideRepliesCheckbox) hideRepliesCheckbox.checked = state.hideReplies;
            announcePolite(state.hideReplies ? i18n.t('settings.repliesHidden') : i18n.t('settings.repliesVisible'));
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
                        announceAssertive(i18n.t('shortcuts.urlCopied'));
                    }).catch(() => {
                        announceAssertive(i18n.t('shortcuts.errorCopyUrl'));
                    });
                }
            } else {
                announceAssertive(i18n.t('shortcuts.noPostFocused'));
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
                    i18n.t('profile.posts'), i18n.t('profile.replies'), i18n.t('profile.media'), i18n.t('profile.likes'), 
                    i18n.t('profile.lists'), i18n.t('profile.starterPacks'), i18n.t('profile.followers'), i18n.t('profile.following')
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
                    announcePolite(i18n.t('timeline.followingSelected'));
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
                        announcePolite(i18n.t('timeline.feedSelected', { name: feed.displayName }));
                        if (state.currentTab !== 'timeline') {
                            state.tabStates['timeline'].loaded = false;
                            switchTab('timeline');
                        } else {
                            loadTimeline();
                        }
                    } else {
                        announcePolite(i18n.t('timeline.noFeedSaved', { num: digitNum.toString() }));
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
                announcePolite(i18n.t('chat.openingChat', { handle: targetHandle }));
                try {
                    const convo = await window.go.services.ChatService.GetConvoForMembers([targetDid]);
                    if (convo && convo.id) {
                        state.tabStates['chat'].loaded = true;
                        switchTab('chat');
                        openChatConvo(convo.id, targetHandle);
                    }
                } catch (err) {
                    announceAssertive(i18n.t('shortcuts.errorOpenChat', { msg: String(err) }));
                }
            } else {
                announceAssertive(i18n.t('shortcuts.noTargetForChat'));
            }
            return;
        }

        if (e.key.toLowerCase() === 'c' && e.shiftKey && !e.ctrlKey) {
            e.preventDefault();
            if (state.focusedPostIndex >= 0 && state.currentPosts[state.focusedPostIndex]) {
                const p = state.currentPosts[state.focusedPostIndex];
                const textToCopy = p.querySelector('.post-content p')?.textContent || p.dataset.text || "";
                navigator.clipboard.writeText(textToCopy).then(() => {
                    announceAssertive(i18n.t('shortcuts.textCopied'));
                }).catch(() => {
                    announceAssertive(i18n.t('shortcuts.errorCopy'));
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
                promptDialog(i18n.t('shortcuts.reportReasonPrompt'), "", i18n.t('shortcuts.reportPostAction')).then(reason => {
                    if (reason) {
                        announcePolite(i18n.t('shortcuts.sendingReport'));
                        window.go.services.ModerationService.ReportPost(uri, cid, 'com.atproto.moderation.defs#reasonOther', reason).then(() => {
                            announceAssertive(i18n.t('shortcuts.reportSuccess'));
                        }).catch(err => announceAssertive(i18n.t('shortcuts.errorReport', { msg: String(err) })));
                    }
                });
            } else if (state.currentTab === 'profile') {
                const reportBtn = document.getElementById('btn-report-user') as HTMLButtonElement | null;
                const targetDid = reportBtn?.dataset.did;
                const targetHandle = state.currentHandle;
                if (targetDid) {
                    promptDialog(i18n.t('shortcuts.reportAccountReason', { handle: targetHandle }), "", i18n.t('shortcuts.reportAccountAction')).then(reason => {
                        if (reason) {
                            announcePolite(i18n.t('shortcuts.sendingAccountReport'));
                            window.go.services.ModerationService.ReportAccount(targetDid, 'com.atproto.moderation.defs#reasonOther', reason).then(() => {
                                announceAssertive(i18n.t('shortcuts.reportAccountSuccess'));
                            }).catch(err => announceAssertive(i18n.t('shortcuts.errorReport', { msg: String(err) })));
                        }
                    });
                } else {
                    announceAssertive(i18n.t('shortcuts.noProfileFocused'));
                }
            } else {
                announceAssertive(i18n.t('shortcuts.noTargetFocused'));
            }
            return;
        }

        if (e.altKey && !e.shiftKey && !e.ctrlKey && e.key.toLowerCase() === 'h') {
            e.preventDefault();
            const focusedPost = state.focusedPostIndex >= 0 ? state.currentPosts[state.focusedPostIndex] : null;
            const uri = focusedPost?.dataset.uri;
            const rootUri = focusedPost?.dataset.rootUri || focusedPost?.dataset.replyToUri || uri;
            if (uri && rootUri) {
                announcePolite(i18n.t('shortcuts.hidingReply'));
                window.go.services.PostBuilderService.HideReply(rootUri, uri).then(() => {
                    announceAssertive(i18n.t('shortcuts.hideReplySuccess'));
                }).catch((err: any) => announceAssertive(i18n.t('shortcuts.errorHideReply', { msg: String(err) })));
            } else {
                announceAssertive(i18n.t('shortcuts.noReplyFocused'));
            }
            return;
        }

        if (!e.altKey && e.shiftKey && !e.ctrlKey && e.key.toLowerCase() === 'm') {
            e.preventDefault();
            const focusedPost = state.focusedPostIndex >= 0 ? state.currentPosts[state.focusedPostIndex] : null;
            const uri = focusedPost?.dataset.uri;
            if (uri) {
                announcePolite(i18n.t('shortcuts.mutingThread'));
                window.go.services.ModerationService.MuteThread(uri).then(() => {
                    announceAssertive(i18n.t('shortcuts.muteThreadSuccess'));
                }).catch((err: any) => announceAssertive(i18n.t('shortcuts.errorMuteThread', { msg: String(err) })));
            } else {
                announceAssertive(i18n.t('shortcuts.noPostFocused'));
            }
            return;
        }

        if (!e.altKey && e.shiftKey && !e.ctrlKey && e.key.toLowerCase() === 'f') {
            e.preventDefault();
            const focusedPost = state.focusedPostIndex >= 0 ? state.currentPosts[state.focusedPostIndex] : null;
            const uri = focusedPost?.dataset.uri;
            const cid = focusedPost?.dataset.cid;
            if (uri && cid) {
                announcePolite(i18n.t('shortcuts.pinningPost'));
                window.go.services.SocialService.PinPost(uri, cid).then(() => {
                    announceAssertive(i18n.t('shortcuts.pinSuccess'));
                }).catch((err: any) => announceAssertive(i18n.t('shortcuts.errorPin', { msg: String(err) })));
            } else {
                announceAssertive(i18n.t('shortcuts.noPostFocused'));
            }
            return;
        }


        if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'r') {
            e.preventDefault();
            if (state.currentTab === 'notifications') {
                state.showOnlyMentions = !state.showOnlyMentions;
                announcePolite(state.showOnlyMentions ? i18n.t('notifications.onlyMentions') : i18n.t('notifications.allNotifications'));
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
                    announcePolite(i18n.t('shortcuts.loadingQuotes'));
                    window.go.services.FeedService.GetQuotes(uri, cid, "").then(res => {
                        showPostsModal(i18n.t('shortcuts.quotesTitle'), res.posts || []);
                    }).catch(err => announceAssertive(i18n.t('shortcuts.errorLoadQuotes', { msg: String(err) })));
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
                    announcePolite(i18n.t('shortcuts.loadingLikes'));
                    window.go.services.FeedService.GetLikes(uri, cid, "").then(res => {
                        showProfilesModal(i18n.t('shortcuts.likesTitle'), res.profiles || []);
                    }).catch(err => announceAssertive(i18n.t('shortcuts.errorLoadLikes', { msg: String(err) })));
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
                    announcePolite(i18n.t('shortcuts.loadingOriginalQuote'));
                    window.go.services.FeedService.GetPosts([quoteUri]).then(res => {
                        showPostsModal(i18n.t('shortcuts.originalQuoteTitle'), res.posts || []);
                    }).catch(err => announceAssertive(i18n.t('shortcuts.errorLoadOriginal', { msg: String(err) })));
                } else {
                    announcePolite(i18n.t('shortcuts.noQuoteFound'));
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
                    announcePolite(i18n.t('shortcuts.loadingReplies'));
                    window.go.services.FeedService.GetPostThread(uri, 5).then(res => {
                        showPostsModal(i18n.t('shortcuts.repliesTitle'), res.posts || []);
                    }).catch(err => announceAssertive(i18n.t('shortcuts.errorLoadReplies', { msg: String(err) })));
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
                    announcePolite(i18n.t('shortcuts.loadingReposts'));
                    window.go.services.FeedService.GetRepostedBy(uri, cid, "").then(res => {
                        showProfilesModal(i18n.t('shortcuts.repostsTitle'), res.profiles || []);
                    }).catch(err => announceAssertive(i18n.t('shortcuts.errorLoadReposts', { msg: String(err) })));
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
                announcePolite(i18n.t('shortcuts.loadingMore'));
                loadTimeline(true);
                } else if (state.currentTab === 'profile' && state.focusedPostIndex > 0) {
                announcePolite(i18n.t('shortcuts.loadingMore'));
                loadProfile(true);
                } else if (state.currentTab === 'notifications') {
                announcePolite(i18n.t('shortcuts.loadingMore'));
                loadNotifications(true);
                } else if (state.currentTab === 'chat' && !state.activeConvoId) {
                announcePolite(i18n.t('shortcuts.loadingMore'));
                loadChat(true);
                } else if (state.currentTab === 'saved') {
                announcePolite(i18n.t('shortcuts.loadingMore'));
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
                    announcePolite(i18n.t('shortcuts.openingProfile', { handle: state.currentHandle }));
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
                                announcePolite(i18n.t('shortcuts.openingProfile', { handle: state.currentHandle }));
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
                        announcePolite(i18n.t('shortcuts.multipleProfilesFound'));
                    }
                }
            }
            break;
            case 'e':
            e.preventDefault();
            if (e.shiftKey) {
                announcePolite(i18n.t('shortcuts.collapsingThreads'));
                reloadCurrentTab();
                break;
            }
            if (state.focusedPostIndex >= 0 && state.currentPosts[state.focusedPostIndex]) {
                const p = state.currentPosts[state.focusedPostIndex];
                const targetUri = p.dataset.uri;
                if (targetUri) {
                    announcePolite(i18n.t('shortcuts.expandingTree'));
                    window.go.services.FeedService.GetPostThread(targetUri, 10).then(res => {
                        showPostsModal(i18n.t('shortcuts.dialogTreeTitle'), res.posts || []);
                    }).catch(err => announceAssertive(i18n.t('shortcuts.errorExpandTree', { msg: String(err) })));
                } else {
                    announcePolite(i18n.t('shortcuts.uriNotFound'));
                }
            }
            break;
            case 'a':
            e.preventDefault();
            if (state.focusedPostIndex >= 0) {
                const p = state.currentPosts[state.focusedPostIndex];
                if (p.dataset.externalUrl) {
                    (window as any).runtime.BrowserOpenURL(p.dataset.externalUrl);
                    announcePolite(i18n.t('shortcuts.openingLink'));
                } else if (p.dataset.text) {
                    const urlMatch = p.dataset.text.match(/(https?:\/\/[^\s]+)/);
                    if (urlMatch) {
                        (window as any).runtime.BrowserOpenURL(urlMatch[0]);
                        announcePolite(i18n.t('shortcuts.openingLink'));
                    } else {
                        announcePolite(i18n.t('shortcuts.noLinkFound'));
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
                            announcePolite(i18n.t('shortcuts.mediaPaused'));
                        } else {
                            vids.forEach(v => {
                                v.play().catch(() => {});
                            });
                            let altMsg = "";
                            const isMainGif = p.dataset.videoIsGif === 'true';
                            const isQuoteGif = p.dataset.quoteVideoIsGif === 'true';
                            if (p.dataset.videoAlt) {
                                altMsg += i18n.t('shortcuts.altDesc', { desc: p.dataset.videoAlt });
                            }
                            if (p.dataset.quoteVideoAlt !== undefined) {
                                altMsg += i18n.t('shortcuts.quoteAltDesc', { type: isQuoteGif ? 'GIF' : i18n.t('app.video'), desc: p.dataset.quoteVideoAlt ? p.dataset.quoteVideoAlt : i18n.t('shortcuts.noDesc') });
                            }
                            if (!altMsg) {
                                altMsg = i18n.t('shortcuts.noAltDesc');
                            }
                            const mediaType = isMainGif || isQuoteGif ? 'GIF' : i18n.t('app.video');
                            announcePolite(i18n.t('shortcuts.playingMedia', { type: mediaType, altMsg }));
                        }
                    } else {
                        announcePolite(i18n.t('shortcuts.mediaNotFound'));
                    }
                } else {
                    announcePolite(i18n.t('shortcuts.noMedia'));
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
                    confirmDialog(i18n.t('shortcuts.muteConfirm', { handle }), i18n.t('shortcuts.muteAction')).then(confirmed => {
                        if (confirmed) {
                            announcePolite(i18n.t('shortcuts.mutingUser', { handle }));
                            window.go.services.ModerationService.MuteActor(did!).then(() => {
                                announceAssertive(i18n.t('shortcuts.muteSuccess', { handle }));
                            }).catch((err: any) => announceAssertive(i18n.t('shortcuts.errorMuteUser', { msg: String(err) })));
                        }
                    });
                } else {
                    announceAssertive(i18n.t('shortcuts.noUserFocused'));
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
                    confirmDialog(i18n.t('shortcuts.blockConfirm', { handle: author }), i18n.t('shortcuts.blockAction')).then(confirmed => {
                        if (confirmed) {
                            announcePolite(i18n.t('shortcuts.blockingUser', { handle: author }));
                            window.go.services.ModerationService.BlockActor(did!).then(() => {
                                announceAssertive(i18n.t('shortcuts.blockSuccess', { handle: author }));
                            }).catch((_err: any) => announceAssertive(i18n.t('shortcuts.errorBlockUser')));
                        }
                    });
                } else {
                    announceAssertive(i18n.t('shortcuts.noUserFocused'));
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
                        announceAssertive(i18n.t('shortcuts.onlyDeleteOwn'));
                        break;
                    }
                    
                    const uri = p.dataset.uri;
                    if (uri) {
                        confirmDialog(i18n.t('shortcuts.deleteConfirm'), i18n.t('shortcuts.deleteAction')).then(async (confirmed) => {
                            if (confirmed) {
                                announcePolite(i18n.t('shortcuts.deletingPost'));
                                try {
                                    await window.go.services.PostBuilderService.DeletePost(uri);
                                    announceAssertive(i18n.t('shortcuts.postDeleted'));
                                    p.remove();
                                    state.currentPosts.splice(state.focusedPostIndex, 1);
                                    if (state.focusedPostIndex >= state.currentPosts.length) {
                                        state.focusedPostIndex = state.currentPosts.length - 1;
                                    }
                                    if (state.focusedPostIndex >= 0 && state.currentPosts[state.focusedPostIndex]) {
                                        state.currentPosts[state.focusedPostIndex].focus();
                                    }
                                } catch (err: any) {
                                    announceAssertive(i18n.t('shortcuts.errorDeletePost', { msg: String(err) }));
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
                        const input = document.getElementById('chat-message-input') as HTMLTextAreaElement;
                        input?.focus();
                        announcePolite(i18n.t('shortcuts.chatReplyMode'));
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

    window.addEventListener('keyup', (e) => {
        if (e.key === 'Alt') {
            if (altCodeSequence.length > 0) {
                e.preventDefault();
                insertAltCode(altCodeSequence);
                altCodeSequence = "";
            }
        }
    });
}

function insertAltCode(seq: string) {
    const activeEl = document.activeElement;
    if (!activeEl || !(activeEl instanceof HTMLInputElement || activeEl instanceof HTMLTextAreaElement)) return;

    let char = "";
    if (seq.startsWith('0')) {
        const code = parseInt(seq, 10);
        // Windows-1252 to Unicode for 128-159
        const win1252: Record<number, string> = {
            128: '€', 130: '‚', 131: 'ƒ', 132: '„', 133: '…', 134: '†', 135: '‡', 
            136: 'ˆ', 137: '‰', 138: 'Š', 139: '‹', 140: 'Œ', 142: 'Ž', 145: '‘', 
            146: '’', 147: '“', 148: '”', 149: '•', 150: '–', 151: '—', 152: '˜', 
            153: '™', 154: 'š', 155: '›', 156: 'œ', 158: 'ž', 159: 'Ÿ'
        };
        if (code >= 128 && code <= 159) {
            char = win1252[code] || "";
        } else {
            char = String.fromCharCode(code);
        }
    } else {
        // Very basic DOS CP437 mapping for common symbols if needed, or fallback
        const code = parseInt(seq, 10);
        const cp437: Record<number, string> = {
            1: '☺', 2: '☻', 3: '♥', 4: '♦', 5: '♣', 6: '♠', 7: '•', 8: '◘', 9: '○', 10: '◙',
            11: '♂', 12: '♀', 13: '♪', 14: '♫', 15: '☼', 16: '►', 17: '◄', 18: '↕', 19: '‼',
            20: '¶', 21: '§', 22: '▬', 23: '↨', 24: '↑', 25: '↓', 26: '→', 27: '←', 28: '∟',
            29: '↔', 30: '▲', 31: '▼'
        };
        if (code >= 1 && code <= 31) {
            char = cp437[code] || "";
        } else {
            char = String.fromCharCode(code);
        }
    }

    if (char) {
        const start = activeEl.selectionStart || 0;
        const end = activeEl.selectionEnd || 0;
        const val = activeEl.value;
        activeEl.value = val.substring(0, start) + char + val.substring(end);
        activeEl.selectionStart = activeEl.selectionEnd = start + char.length;
        
        const event = new Event('input', { bubbles: true });
        activeEl.dispatchEvent(event);
    }
}
