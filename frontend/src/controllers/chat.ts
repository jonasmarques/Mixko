import { state } from '../config/state';
import { announcePolite, announceAssertive, formatAuthor } from '../utils/a11y';
import { linkify, esc, escUrl, renderProfileLink } from '../utils/helpers';
import { confirmDialog, promptDialog, promptReportDetails } from '../utils/dialog';
import { createPostArticle, registerInlineVideo, cleanupContainerVideos } from '../components/post';
import { formatPostDate } from '../utils/format';
import { openGifPicker } from '../components/gif_modal';
import { i18n } from '../utils/i18n';
import type { ChatConvoDTO, ChatMemberDTO, ChatMessageDTO } from '../types/dto';

let currentConvoTitle = "";
let currentConvoMuted = false;
let currentConvoMeta: ChatConvoDTO | null = null;

export function formatConvoMembers(members: ChatMemberDTO[] | string | undefined): string {
  if (!members) return '';
  if (typeof members === 'string') return members.trim();
  if (Array.isArray(members)) {
    const otherMembers = members.filter(m => m.did !== state.loggedInDid && m.handle !== state.loggedInHandle);
    const targetMembers = otherMembers.length > 0 ? otherMembers : members;
    return targetMembers.map(m => formatAuthor(m.displayName || '', m.handle || '')).filter(Boolean).join(', ');
  }
  return '';
}

export async function loadChat(loadMore = false) {
  state.activeConvoId = "";
  currentConvoTitle = "";
  currentConvoMeta = null;
  if (loadMore && !state.chatCursor) {
    announcePolite(i18n.t('chat.allChatsLoaded'));
    return;
  }
  const container = document.getElementById('chat-list') as HTMLDivElement;
  container.setAttribute('aria-busy', 'true');
  try {
    if (!loadMore) {
      state.chatCursor = "";
      state.currentPosts = [];
      container.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px; flex-wrap:wrap; gap:8px;">
          <h3 style="margin:0;">${i18n.t('chat.yourMessages')}</h3>
          <div style="display:flex; gap:6px; flex-wrap:wrap;">
            <button id="btn-mark-all-chats-read" type="button" style="padding:6px 12px;">${i18n.t('extended.markAllReadBtn')}</button>
            <button id="btn-new-group-chat" type="button" style="padding:6px 12px;">${i18n.t('extended.newGroupBtn')}</button>
            <button id="btn-new-chat" type="button" style="padding:6px 12px;">${i18n.t('chat.newChatBtn')}</button>
          </div>
        </div>
        <div id="chat-list-items"></div>
      `;

      document.getElementById('btn-mark-all-chats-read')?.addEventListener('click', async () => {
        try {
          await window.go.services.ChatService.UpdateAllRead();
          announceAssertive(i18n.t('extended.markedAllReadMsg'));
          await loadChat(false);
        } catch (err: unknown) {
          announceAssertive(String(err));
        }
      });

      document.getElementById('btn-new-group-chat')?.addEventListener('click', async () => {
        const groupName = await promptDialog(i18n.t('extended.groupNamePrompt'), '', i18n.t('extended.newGroupBtn'));
        if (!groupName || !groupName.trim()) return;
        const membersRaw = await promptDialog(i18n.t('extended.groupMembersPrompt'), '', i18n.t('extended.newGroupBtn'));
        if (!membersRaw || !membersRaw.trim()) return;
        const memberActors = membersRaw.split(',').map(s => s.trim()).filter(Boolean);
        if (memberActors.length === 0) return;
        try {
          const convo = await window.go.services.ChatService.CreateGroup(groupName.trim(), memberActors);
          if (convo && convo.id) {
            announceAssertive(i18n.t('extended.groupCreatedMsg', { name: convo.groupName || groupName.trim() }));
            openChatConvo(convo.id, convo.groupName || groupName.trim(), false, Boolean(convo.muted), convo);
          }
        } catch (err: unknown) {
          announceAssertive(String(err));
        }
      });
      
      document.getElementById('btn-new-chat')?.addEventListener('click', async () => {
        const handle = await promptDialog(i18n.t('chat.enterHandle'), "", i18n.t('chat.newChatTitle'));
        if (handle) {
          try {
            announcePolite(i18n.t('chat.searchingProfile', { handle }));
            const prof = await window.go.services.SocialService.GetProfile(handle);
            if (prof && prof.did) {
              try {
                const avail = await window.go.services.ChatService.GetConvoAvailability(prof.did);
                if (avail && !avail.canChat && !avail.convoId) {
                  announceAssertive(i18n.t('extended.cannotChatMsg'));
                  return;
                }
              } catch {
                // Continue if PDS does not support getConvoAvailability
              }
              const convo = await window.go.services.ChatService.GetConvoForMembers([prof.did]);
              if (convo && convo.id) {
                const formattedName = formatAuthor(prof.displayName || '', prof.handle);
                openChatConvo(convo.id, formattedName, false, Boolean(convo.muted), convo);
              }
            }
          } catch (e) {
            announceAssertive(i18n.t('chat.personNotFound'));
          }
        }
      });
    }

    const res = await window.go.services.ChatService.ListConvos(state.chatCursor);
    const itemsContainer = document.getElementById('chat-list-items') as HTMLDivElement;
    if (res && res.length > 0) {
      state.chatCursor = res[0].cursor || "";
      res.forEach((convo: ChatConvoDTO) => {
        const idx = state.currentPosts.length;
        const div = document.createElement('div');
        div.classList.add('post-item');
        div.setAttribute('tabindex', '0');
        div.dataset.index = idx.toString();
        div.dataset.convoId = convo.id;
        
        const formattedMembers = convo.isGroup && convo.groupName
          ? `${convo.groupName} (${formatConvoMembers(convo.members)})`
          : formatConvoMembers(convo.members);
        div.dataset.author = formattedMembers;
        
        let unreadText = convo.unreadCount > 0 ? i18n.t('chat.unreadCountAccessible', { count: convo.unreadCount.toString() }) : '';
        div.dataset.text = i18n.t('chat.convoWithAccessible', { members: formattedMembers, lastMessage: convo.lastMessage }) + unreadText;
        
        div.setAttribute('aria-label', div.dataset.text);
        div.innerHTML = `
          <div aria-hidden="true">
            <header><strong>${i18n.t('chat.convoWith')}</strong> ${esc(formattedMembers)}</header>
            <div class="post-content"><p><strong>${i18n.t('chat.lastMessage')}</strong> ${esc(convo.lastMessage)}</p></div>
            <footer><small>${convo.unreadCount > 0 ? i18n.t('chat.unreadCount', { count: convo.unreadCount.toString() }) : ''}</small></footer>
          </div>
        `;
        div.addEventListener('focus', () => { state.focusedPostIndex = idx; });
        div.addEventListener('click', () => openChatConvo(convo.id, formattedMembers, false, Boolean(convo.muted), convo));
        div.addEventListener('keydown', (e) => {
           if (e.key === 'Enter') openChatConvo(convo.id, formattedMembers, false, Boolean(convo.muted), convo);
        });
        itemsContainer.appendChild(div);
        state.currentPosts.push(div);
      });
      announcePolite(i18n.t('chat.chatsLoaded', { count: state.currentPosts.length.toString() }));
    } else if (!loadMore) {
      state.chatCursor = "";
      itemsContainer.innerHTML = `<p>${i18n.t('chat.noChatFound')}</p>`;
      announcePolite(i18n.t('chat.noChat'));
    } else {
      state.chatCursor = "";
      announcePolite(i18n.t('chat.allChatsLoaded'));
    }
    state.tabStates['chat'].loaded = true;
  } catch (err: unknown) { console.error(err); announceAssertive(i18n.t('chat.chatError')); } 
  finally { container.setAttribute('aria-busy', 'false'); }
}

export async function openChatConvo(convoId: string, members?: string, silent = false, muted?: boolean, convoMeta?: ChatConvoDTO) {
  state.activeConvoId = convoId;
  if (members) {
    currentConvoTitle = members;
  }
  if (muted !== undefined) {
    currentConvoMuted = muted;
  }
  if (convoMeta !== undefined) {
    currentConvoMeta = convoMeta;
  }
  const displayTitle = currentConvoTitle || i18n.t('chat.defaultUser');
  if (!silent) {
    state.chatMessagesCursor = "";
    announcePolite(i18n.t('chat.startingConvo', { title: displayTitle }));
  }
  const container = document.getElementById('chat-list') as HTMLDivElement;
  if (!silent) {
    cleanupContainerVideos(container);
    const muteBtnLabel = currentConvoMuted ? i18n.t('chat.unmuteChat') : i18n.t('chat.muteChat');
    const isGroup = Boolean(currentConvoMeta?.isGroup);
    const isLocked = currentConvoMeta?.lockStatus === 'locked';
    const lockBtnLabel = isLocked ? i18n.t('extended.unlockConvoBtn') : i18n.t('extended.lockConvoBtn');
    const groupControlsHtml = isGroup ? `
      <div style="display:flex; gap:6px; flex-wrap:wrap; margin-bottom:10px;">
        <button type="button" id="btn-rename-group" style="padding:4px 8px;">${esc(i18n.t('extended.renameGroupBtn'))}</button>
        <button type="button" id="btn-add-group-member" style="padding:4px 8px;">${esc(i18n.t('extended.addGroupMemberBtn'))}</button>
        <button type="button" id="btn-remove-group-member" style="padding:4px 8px;">${esc(i18n.t('extended.removeGroupMemberBtn'))}</button>
        <button type="button" id="btn-toggle-lock-convo" style="padding:4px 8px;">${esc(lockBtnLabel)}</button>
        <button type="button" id="btn-group-join-link" style="padding:4px 8px;">${esc(i18n.t('extended.joinLinkBtn'))}</button>
        <button type="button" id="btn-group-join-requests" style="padding:4px 8px;">${esc(i18n.t('extended.joinRequestsBtn'))}</button>
      </div>
    ` : '';
    container.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
        <button id="btn-back-chat" tabindex="0">${i18n.t('chat.backToList')}</button>
        <div>
          <button id="btn-mute-chat" style="padding:4px 8px; margin-right:5px;">${muteBtnLabel}</button>
          <button id="btn-leave-chat" style="padding:4px 8px; background:#d32f2f; color:#fff; border:none; border-radius:4px;">${i18n.t('chat.leaveChat')}</button>
        </div>
      </div>
      ${groupControlsHtml}
      <h3>${esc(i18n.t('chat.convoWithTitle', { members: displayTitle }))}</h3>
      <div id="chat-older-messages-wrapper" style="margin-bottom:8px; display:none;">
        <button type="button" id="btn-load-older-messages" style="width:100%; padding:6px;">${i18n.t('chat.loadOlderMessages')}</button>
      </div>
      <div id="chat-messages" aria-live="polite">${i18n.t('chat.loading')}</div>
      
      <div id="chat-reply-preview-container" class="hidden" style="margin-top: 10px; border-left: 3px solid var(--primary-bg, #0085ff); padding: 8px; background: rgba(0, 133, 255, 0.08); border-radius: 4px; position: relative;">
        <button type="button" id="btn-chat-cancel-reply" style="position: absolute; top: 5px; right: 5px; background: transparent; border: none; font-size: 1.1em; cursor: pointer;" data-i18n-aria="chat.cancelReplyAria">✕</button>
        <div style="font-size: 0.85em; font-weight: bold; color: var(--primary-bg, #0085ff);" id="chat-reply-sender"></div>
        <div style="font-size: 0.9em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" id="chat-reply-text"></div>
      </div>

      <div id="chat-selected-gif-container" class="hidden" style="margin-top: 10px; border: 1px solid #ccc; padding: 10px; border-radius: 4px; position: relative; max-width: 300px;">
        <button type="button" id="btn-chat-remove-gif" style="position: absolute; top: 5px; right: 5px; background: #d32f2f; color: #fff; border: none; border-radius: 3px; padding: 2px 6px; cursor: pointer;">X</button>
        <video id="chat-selected-gif-preview" autoplay loop muted playsinline style="max-width: 100%; max-height: 150px; border-radius: 4px; display: block; margin: 0 auto;"></video>
      </div>

      <form id="chat-send-form" style="margin-top: 1rem; display: flex; gap: 8px;">
        <input type="text" id="chat-input" placeholder="${i18n.t('chat.typeMessage')}" style="flex-grow: 1;" />
        <button type="button" id="btn-chat-gif" style="background: var(--primary-bg, #0085ff); color: white; border: none; padding: 6px 12px; border-radius: 4px; font-weight: bold;">GIF</button>
        <button type="submit">${i18n.t('chat.send')}</button>
      </form>
    `;
    
    let chatSelectedGifUrl = "";
    let replyingToMessageId = "";

    const gifContainer = document.getElementById('chat-selected-gif-container') as HTMLDivElement;
    const gifPreview = document.getElementById('chat-selected-gif-preview') as HTMLVideoElement;
    const replyContainer = document.getElementById('chat-reply-preview-container') as HTMLDivElement;
    const replySenderEl = document.getElementById('chat-reply-sender') as HTMLDivElement;
    const replyTextEl = document.getElementById('chat-reply-text') as HTMLDivElement;
    const chatInput = document.getElementById('chat-input') as HTMLInputElement;

    const setReplyingTo = (msgId: string, sender: string, text: string) => {
      replyingToMessageId = msgId;
      if (replyContainer && replySenderEl && replyTextEl) {
        replySenderEl.textContent = `↩ ${sender}`;
        replyTextEl.textContent = text;
        replyContainer.classList.remove('hidden');
      }
      chatInput?.focus();
    };
    (window as unknown as Record<string, unknown>).__chatSetReplyingTo = setReplyingTo;

    const clearReplyingTo = () => {
      replyingToMessageId = "";
      if (replyContainer) {
        replyContainer.classList.add('hidden');
      }
    };

    document.getElementById('btn-chat-cancel-reply')?.addEventListener('click', clearReplyingTo);

    document.getElementById('btn-rename-group')?.addEventListener('click', async () => {
      const newName = await promptDialog(i18n.t('extended.groupNamePrompt'), currentConvoMeta?.groupName || '', i18n.t('extended.renameGroupBtn'));
      if (!newName || !newName.trim()) return;
      try {
        const updated = await window.go.services.ChatService.EditGroup(convoId, newName.trim());
        currentConvoMeta = updated;
        openChatConvo(convoId, updated.groupName || newName.trim(), false, Boolean(updated.muted), updated);
      } catch (err: unknown) {
        announceAssertive(String(err));
      }
    });

    document.getElementById('btn-add-group-member')?.addEventListener('click', async () => {
      const raw = await promptDialog(i18n.t('extended.groupMembersPrompt'), '', i18n.t('extended.addGroupMemberBtn'));
      if (!raw || !raw.trim()) return;
      const actors = raw.split(',').map(s => s.trim()).filter(Boolean);
      if (actors.length === 0) return;
      try {
        const updated = await window.go.services.ChatService.AddGroupMembers(convoId, actors);
        currentConvoMeta = updated;
        openChatConvo(convoId, currentConvoTitle, false, Boolean(updated.muted), updated);
      } catch (err: unknown) {
        announceAssertive(String(err));
      }
    });

    document.getElementById('btn-remove-group-member')?.addEventListener('click', async () => {
      const raw = await promptDialog(i18n.t('extended.groupMembersPrompt'), '', i18n.t('extended.removeGroupMemberBtn'));
      if (!raw || !raw.trim()) return;
      const actors = raw.split(',').map(s => s.trim()).filter(Boolean);
      if (actors.length === 0) return;
      try {
        const updated = await window.go.services.ChatService.RemoveGroupMembers(convoId, actors);
        currentConvoMeta = updated;
        openChatConvo(convoId, currentConvoTitle, false, Boolean(updated.muted), updated);
      } catch (err: unknown) {
        announceAssertive(String(err));
      }
    });

    document.getElementById('btn-toggle-lock-convo')?.addEventListener('click', async () => {
      try {
        const currentlyLocked = currentConvoMeta?.lockStatus === 'locked';
        const updated = currentlyLocked
          ? await window.go.services.ChatService.UnlockConvo(convoId)
          : await window.go.services.ChatService.LockConvo(convoId);
        currentConvoMeta = updated;
        openChatConvo(convoId, currentConvoTitle, false, Boolean(updated.muted), updated);
      } catch (err: unknown) {
        announceAssertive(String(err));
      }
    });

    document.getElementById('btn-group-join-link')?.addEventListener('click', async () => {
      try {
        if (currentConvoMeta?.joinLinkCode && currentConvoMeta.joinLinkEnabled) {
          if (await confirmDialog(i18n.t('extended.joinLinkDisableConfirm', { code: currentConvoMeta.joinLinkCode }), i18n.t('extended.joinLinkBtn'))) {
            await window.go.services.ChatService.DisableGroupJoinLink(convoId);
            if (currentConvoMeta) currentConvoMeta.joinLinkEnabled = false;
            announceAssertive(i18n.t('extended.joinLinkDisabledMsg'));
          }
        } else if (currentConvoMeta?.joinLinkCode && !currentConvoMeta.joinLinkEnabled) {
          const jl = await window.go.services.ChatService.EnableGroupJoinLink(convoId);
          if (currentConvoMeta) currentConvoMeta.joinLinkEnabled = true;
          await promptDialog(i18n.t('extended.joinLinkCreatedMsg', { code: jl.code }), jl.code, i18n.t('extended.joinLinkBtn'));
        } else {
          const jl = await window.go.services.ChatService.CreateGroupJoinLink(convoId, true);
          if (currentConvoMeta) {
            currentConvoMeta.joinLinkCode = jl.code;
            currentConvoMeta.joinLinkEnabled = true;
          }
          await promptDialog(i18n.t('extended.joinLinkCreatedMsg', { code: jl.code }), jl.code, i18n.t('extended.joinLinkBtn'));
        }
      } catch (err: unknown) {
        announceAssertive(String(err));
      }
    });

    document.getElementById('btn-group-join-requests')?.addEventListener('click', async () => {
      try {
        const res = await window.go.services.ChatService.ListGroupJoinRequests(convoId, '');
        const requests = res?.requests || [];
        if (requests.length === 0) {
          announceAssertive(i18n.t('extended.noJoinRequestsMsg'));
          return;
        }
        for (const req of requests) {
          const handle = req.requestedBy?.handle || req.requestedBy?.did || '';
          const approve = await confirmDialog(i18n.t('extended.approveJoinConfirm', { handle }), i18n.t('extended.joinRequestsBtn'));
          if (approve) {
            await window.go.services.ChatService.ApproveGroupJoinRequest(convoId, req.requestedBy.did);
          } else {
            await window.go.services.ChatService.RejectGroupJoinRequest(convoId, req.requestedBy.did);
          }
        }
      } catch (err: unknown) {
        announceAssertive(String(err));
      }
    });

    document.getElementById('btn-back-chat')?.addEventListener('click', () => {
      state.activeConvoId = "";
      currentConvoTitle = "";
      currentConvoMeta = null;
      loadChat(false);
    });
    document.getElementById('btn-mute-chat')?.addEventListener('click', async () => {
      const muteBtn = document.getElementById('btn-mute-chat') as HTMLButtonElement | null;
      if (currentConvoMuted) {
        try {
          await window.go.services.ChatService.UnmuteConvo(convoId);
          currentConvoMuted = false;
          if (muteBtn) muteBtn.textContent = i18n.t('chat.muteChat');
          announceAssertive(i18n.t('chat.chatUnmuted'));
        } catch (e) {
          announceAssertive(i18n.t('chat.unmuteError'));
        }
      } else {
        try {
          await window.go.services.ChatService.MuteConvo(convoId);
          currentConvoMuted = true;
          if (muteBtn) muteBtn.textContent = i18n.t('chat.unmuteChat');
          announceAssertive(i18n.t('chat.chatMuted'));
        } catch (e) {
          announceAssertive(i18n.t('chat.muteError'));
        }
      }
    });
    document.getElementById('btn-leave-chat')?.addEventListener('click', async () => {
      if (await confirmDialog(i18n.t('chat.confirmLeave'), i18n.t('chat.leaveTitle'))) {
        try {
          await window.go.services.ChatService.LeaveConvo(convoId);
          announceAssertive(i18n.t('chat.leftChat'));
          state.activeConvoId = "";
          currentConvoTitle = "";
          currentConvoMeta = null;
          loadChat(false);
        } catch (e) {
          announceAssertive(i18n.t('chat.leaveError'));
        }
      }
    });
    
    document.getElementById('btn-chat-gif')?.addEventListener('click', () => {
        openGifPicker((url: string, _alt: string) => {
            chatSelectedGifUrl = url;
            if (gifContainer && gifPreview) {
                gifPreview.src = url;
                gifContainer.classList.remove('hidden');
            }
            announcePolite(i18n.t('chat.gifSelected'));
            chatInput?.focus();
        });
    });

    document.getElementById('btn-chat-remove-gif')?.addEventListener('click', () => {
        chatSelectedGifUrl = "";
        if (gifContainer && gifPreview) {
            gifContainer.classList.add('hidden');
            gifPreview.src = "";
        }
        announcePolite(i18n.t('chat.gifRemoved'));
        chatInput?.focus();
    });

    document.getElementById('chat-send-form')?.addEventListener('submit', async (e) => {
       e.preventDefault();
       const text = chatInput.value;
       if (!text && !chatSelectedGifUrl) return;
       announcePolite(i18n.t('chat.sending'));
       try {
         if (replyingToMessageId) {
           await window.go.services.ChatService.SendReply(convoId, replyingToMessageId, text, chatSelectedGifUrl);
         } else {
           await window.go.services.ChatService.SendMessageWithGif(convoId, text, chatSelectedGifUrl);
         }
         announceAssertive(i18n.t('chat.sent'));
         chatInput.value = "";
         chatSelectedGifUrl = "";
         clearReplyingTo();
         if (gifContainer && gifPreview) {
             gifContainer.classList.add('hidden');
             gifPreview.src = "";
         }
         openChatConvo(convoId, currentConvoTitle, true);
       } catch (err: unknown) {
         announceAssertive(i18n.t('chat.sendError', { err: String(err) }));
       }
    });
    chatInput?.focus();
  }

  state.currentPosts = []; // Clear focusable articles for main navigation
  try {
    const res = await window.go.services.ChatService.GetMessages(convoId, "");
    const msgsContainer = document.getElementById('chat-messages') as HTMLDivElement;
    if (!msgsContainer) return;
    cleanupContainerVideos(msgsContainer);
    msgsContainer.innerHTML = '';
    if (res && res.messages) {
      state.chatMessagesCursor = res.cursor || "";
      const olderWrapper = document.getElementById('chat-older-messages-wrapper') as HTMLDivElement | null;
      const olderBtn = document.getElementById('btn-load-older-messages') as HTMLButtonElement | null;
      if (olderWrapper && olderBtn) {
        olderWrapper.style.display = state.chatMessagesCursor ? 'block' : 'none';
        olderBtn.onclick = async () => {
          if (!state.chatMessagesCursor) {
            announcePolite(i18n.t('chat.allMessagesLoaded'));
            olderWrapper.style.display = 'none';
            return;
          }
          try {
            announcePolite(i18n.t('chat.loading'));
            const olderRes = await window.go.services.ChatService.GetMessages(convoId, state.chatMessagesCursor);
            state.chatMessagesCursor = olderRes?.cursor || "";
            if (!state.chatMessagesCursor) {
              olderWrapper.style.display = 'none';
            }
            if (olderRes && olderRes.messages && olderRes.messages.length > 0) {
              const frag = document.createDocumentFragment();
              const newEls: HTMLElement[] = [];
              olderRes.messages.slice().reverse().forEach((olderMsg: ChatMessageDTO) => {
                const el = buildChatMessageElement(convoId, olderMsg);
                frag.appendChild(el);
                newEls.push(el);
              });
              msgsContainer.prepend(frag);
              state.currentPosts = [...newEls, ...state.currentPosts];
              state.currentPosts.forEach((itemEl, i) => {
                itemEl.dataset.index = i.toString();
              });
              announcePolite(i18n.t('chat.olderMessagesLoaded', { count: olderRes.messages.length.toString() }));
            } else {
              announcePolite(i18n.t('chat.allMessagesLoaded'));
            }
          } catch (e) {
            announceAssertive(i18n.t('chat.chatError'));
          }
        };
      }
      if (res.messages.length > 0) {
          window.go.services.ChatService.UpdateReadStatus(convoId, res.messages[0].id).catch((e: unknown) => console.error(e));
      }
      res.messages.slice().reverse().forEach((msg: ChatMessageDTO) => {
        const div = buildChatMessageElement(convoId, msg);
        div.dataset.index = state.currentPosts.length.toString();
        msgsContainer.appendChild(div);
        state.currentPosts.push(div);
      });
      if (!silent) {
        document.getElementById('chat-input')?.focus();
      }
    }
  } catch (err: unknown) {
    console.error(err);
  }
}

function buildChatMessageElement(convoId: string, msg: ChatMessageDTO): HTMLElement {
  const EMOJI_PALETTE = ['❤️', '👍', '😂', '😮', '😢', '🔥', '👏', '🎉'];
  const div = document.createElement('div');
  div.classList.add('post-item');
  div.setAttribute('tabindex', '0');
  div.dataset.messageId = msg.id;
  
  let rawText = msg.text || "";
  let inlineVideo = "";
  const klipyRegex = /(https?:\/\/[^\s]+?klipy[^\s]+?\.mp4|(?:https?:\/\/[^\s]+\.mp4))/g;
  rawText = rawText.replace(klipyRegex, (match: string) => {
      inlineVideo += `<video class="chat-inline-gif" data-inline-src="${escUrl(match)}" loop muted playsinline preload="none" style="max-width: 100%; max-height: 250px; border-radius: 8px; margin-top: 8px; display: block;"></video>`;
      return "";
  }).trim();

  let msgContent = linkify(rawText) + inlineVideo;

  let targetEmbedUri = msg.embedUri;
  if (!targetEmbedUri && rawText) {
    const match = rawText.match(/https?:\/\/bsky\.app\/profile\/([^\/]+)\/post\/([^\/\s\?]+)/);
    if (match) {
      targetEmbedUri = `at://${match[1]}/app.bsky.feed.post/${match[2]}`;
    }
  }
  let embedContainerId = `chat-embed-${esc(msg.id)}`;
  let embedInfo = targetEmbedUri ? `<div id="${esc(embedContainerId)}" style="border: 1px solid var(--border-color, #38444d); padding: 10px; border-radius: 5px; margin-top: 10px; font-size: 0.9em;">${i18n.t('chat.loadingAttachedPost')}</div>` : "";
  let replyInfo = "";
  const msgDateFormatted = msg.sentAt ? formatPostDate(msg.sentAt, undefined, true) : "";

  const isMe = msg.senderDid === state.loggedInDid || msg.sender === 'Me';
  const senderDisplay = isMe
    ? i18n.t('chat.me')
    : formatAuthor(msg.senderDisplayName || (msg.sender !== msg.senderDid ? msg.sender : ''), msg.senderHandle || (msg.sender && msg.sender.includes('.') ? msg.sender : ''));

  const senderPrefix = senderDisplay ? `${senderDisplay}${msgDateFormatted ? `, ${msgDateFormatted}` : ""}: ` : "";
  let accessibleLabel = `${senderPrefix}${msg.text || ""}`;

  if (msg.replyToMessageText || msg.replyToSender || msg.replyToSenderDisplayName || msg.replyToSenderHandle) {
      let replySenderDisplay = i18n.t('chat.replyingTo');
      const replyIsMe = msg.replyToSenderDid === state.loggedInDid || msg.replyToSender === 'Me';
      if (replyIsMe) {
        replySenderDisplay = i18n.t('chat.me');
      } else if (msg.replyToSenderDisplayName || msg.replyToSenderHandle) {
        replySenderDisplay = formatAuthor(msg.replyToSenderDisplayName || '', msg.replyToSenderHandle || '');
      } else if (msg.replyToSender) {
        replySenderDisplay = msg.replyToSender;
      }
      const replySenderHtml = (!replyIsMe && msg.replyToSenderHandle)
        ? renderProfileLink(msg.replyToSenderHandle, replySenderDisplay)
        : esc(replySenderDisplay);
      replyInfo = `<div style="border-left: 3px solid var(--brand-color, #1da1f2); padding-left: 10px; margin-bottom: 10px; font-size: 0.9em; opacity: 0.85; background: rgba(29, 161, 242, 0.08); padding: 6px 10px; border-radius: 4px;">
          <strong>↩ ${replySenderHtml}:</strong> ${linkify(msg.replyToMessageText || "")}
      </div>`;
      accessibleLabel = i18n.t('chat.replyingToAccessible', { msg: msg.replyToMessageText || "", rest: accessibleLabel });
  }
  
  const reactionCounts: Record<string, { count: number; isMine: boolean }> = {};
  if (msg.reactions && Array.isArray(msg.reactions)) {
    msg.reactions.forEach((r) => {
      if (!reactionCounts[r.value]) {
        reactionCounts[r.value] = { count: 0, isMine: false };
      }
      reactionCounts[r.value].count++;
      if (r.isMine) reactionCounts[r.value].isMine = true;
    });
  }

  let reactionsHtml = '';
  Object.entries(reactionCounts).forEach(([emoji, data]) => {
    const bgStyle = data.isMine ? 'background: var(--primary-bg, #0085ff); color: white; border-color: var(--primary-bg, #0085ff);' : 'background: rgba(255,255,255,0.1); border: 1px solid var(--border-color, #444);';
    reactionsHtml += `<button type="button" class="btn-chat-reaction" data-msg-id="${esc(msg.id)}" data-emoji="${esc(emoji)}" data-is-mine="${data.isMine}" style="padding: 2px 6px; border-radius: 12px; font-size: 0.85em; cursor: pointer; margin-right: 4px; margin-top: 4px; ${bgStyle}">${esc(emoji)} ${data.count}</button>`;
  });

  let emojiPickerButtons = EMOJI_PALETTE.map(emoji => 
    `<button type="button" class="btn-add-emoji" data-msg-id="${esc(msg.id)}" data-emoji="${esc(emoji)}" style="border: none; background: transparent; font-size: 1.2em; cursor: pointer; padding: 2px 4px; border-radius: 4px;">${esc(emoji)}</button>`
  ).join('');

  let emojiPickerHtml = `<div class="chat-emoji-picker" id="emoji-picker-${esc(msg.id)}" style="display: none; position: absolute; right: 0; top: -35px; background: var(--card-bg, #1e2732); border: 1px solid var(--border-color, #38444d); border-radius: 20px; padding: 4px 8px; gap: 4px; box-shadow: 0 4px 12px rgba(0,0,0,0.3); z-index: 10;">
    ${emojiPickerButtons}
  </div>`;

  const senderHandleForLink = !isMe ? (msg.senderHandle || (msg.sender && msg.sender.includes('.') ? msg.sender : '')) : '';
  const senderHeaderHtml = senderHandleForLink
    ? renderProfileLink(senderHandleForLink, senderDisplay)
    : esc(senderDisplay);

  div.dataset.text = accessibleLabel;
  div.setAttribute('aria-label', div.dataset.text);
  div.style.position = 'relative';
  div.innerHTML = `
    ${replyInfo}
    <header style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
      <div><strong>${senderHeaderHtml}:</strong>${msgDateFormatted ? `<small style="margin-left: 8px; opacity: 0.7;">${esc(msgDateFormatted)}</small>` : ''}</div>
    </header>
    <div class="post-content">
      <p style="margin:4px 0;">${msgContent}</p>
      ${embedInfo}
    </div>
    <div class="chat-msg-actions" aria-label="${i18n.t('chat.actionsAria')}">
      <button type="button" class="btn-reply-msg" data-id="${esc(msg.id)}" data-sender="${esc(senderDisplay)}" data-text="${esc(msg.text || '')}" aria-label="${esc(i18n.t('chat.replyBtnAria', { sender: senderDisplay }))}" title="${i18n.t('chat.replyBtn')}">↩ ${i18n.t('chat.replyBtn')}</button>
      <button type="button" class="btn-show-reactions" data-msg-id="${esc(msg.id)}" aria-label="${esc(i18n.t('chat.reactBtnAria', { sender: senderDisplay }))}" title="${i18n.t('chat.reactBtn')}">😀 ${i18n.t('chat.reactBtn')}</button>
      ${emojiPickerHtml}
      <button type="button" class="btn-delete-msg" data-id="${esc(msg.id)}" aria-label="${esc(i18n.t('chat.deleteMsgAria', { sender: senderDisplay }))}" title="${i18n.t('chat.delete')}">🗑️ ${i18n.t('chat.delete')}</button>
      ${!isMe && msg.senderDid ? `<button type="button" class="btn-report-msg" data-id="${esc(msg.id)}" data-sender-did="${esc(msg.senderDid)}" title="${esc(i18n.t('extended.reportMsg'))}">${esc(i18n.t('extended.reportMsg'))}</button>` : ''}
    </div>
    <div class="chat-reactions-container">
      ${reactionsHtml}
    </div>
  `;

  div.querySelectorAll<HTMLVideoElement>('video.chat-inline-gif').forEach((video) => {
    const src = video.dataset.inlineSrc;
    if (src) registerInlineVideo(video, src);
  });

  const pickerEl = div.querySelector(`#emoji-picker-${msg.id}`) as HTMLDivElement;
  div.querySelector('.btn-show-reactions')?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (pickerEl) {
      const isHidden = pickerEl.style.display === 'none';
      pickerEl.style.display = isHidden ? 'flex' : 'none';
      if (isHidden) {
        const firstEmojiBtn = pickerEl.querySelector('.btn-add-emoji') as HTMLButtonElement;
        firstEmojiBtn?.focus();
      }
    }
  });

  div.querySelectorAll('.btn-add-emoji').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const emoji = (btn as HTMLElement).dataset.emoji || "";
      if (pickerEl) pickerEl.style.display = 'none';
      try {
        await window.go.services.ChatService.AddReaction(convoId, msg.id, emoji);
        openChatConvo(convoId, currentConvoTitle, true);
      } catch (err) {
        announceAssertive(i18n.t('chat.addReactionError'));
      }
    });
  });

  div.querySelectorAll('.btn-chat-reaction').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const emoji = (btn as HTMLElement).dataset.emoji || "";
      const isMine = (btn as HTMLElement).dataset.isMine === "true";
      try {
        if (isMine) {
          await window.go.services.ChatService.RemoveReaction(convoId, msg.id, emoji);
        } else {
          await window.go.services.ChatService.AddReaction(convoId, msg.id, emoji);
        }
        openChatConvo(convoId, currentConvoTitle, true);
      } catch (err) {
        announceAssertive(isMine ? i18n.t('chat.removeReactionError') : i18n.t('chat.addReactionError'));
      }
    });
  });

  div.querySelector('.btn-reply-msg')?.addEventListener('click', (e) => {
    e.stopPropagation();
    const target = e.currentTarget as HTMLElement;
    const msgId = target.dataset.id || msg.id;
    const sender = target.dataset.sender || senderDisplay;
    const text = target.dataset.text || msg.text || "";
    const setReplyFn = (window as unknown as Record<string, ((id: string, s: string, t: string) => void) | undefined>).__chatSetReplyingTo;
    if (setReplyFn) {
      setReplyFn(msgId, sender, text);
    } else {
      const input = document.getElementById('chat-input') as HTMLInputElement;
      if (input) {
        input.value = `↩ @${sender}: `;
        input.focus();
      }
    }
  });
  
  div.querySelector('.btn-delete-msg')?.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (await confirmDialog(i18n.t('chat.confirmDeleteMsg'), i18n.t('chat.deleteMsgTitle'))) {
      try {
        await window.go.services.ChatService.DeleteMessage(convoId, msg.id);
        announceAssertive(i18n.t('chat.msgDeleted'));
        div.remove();
      } catch (err) {
        announceAssertive(i18n.t('chat.deleteMsgError'));
      }
    }
  });

  div.querySelector('.btn-report-msg')?.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (!msg.senderDid) return;
    const details = await promptReportDetails(i18n.t('extended.reportMsg'));
    if (details) {
      try {
        await window.go.services.ModerationService.ReportChatMessage(convoId, msg.id, msg.senderDid, details.reasonType, details.reason);
        announceAssertive(i18n.t('extended.reportMsgSuccess'));
      } catch (err: unknown) {
        announceAssertive(String(err));
      }
    }
  });

  if (targetEmbedUri) {
    window.go.services.FeedService.GetPosts([targetEmbedUri]).then((postRes) => {
      const embedEl = document.getElementById(embedContainerId);
      if (embedEl && postRes && postRes.posts && postRes.posts.length > 0) {
        embedEl.innerHTML = '';
        const article = createPostArticle(postRes.posts[0], 0, false, "", true);
        if (article) embedEl.appendChild(article);
      } else if (embedEl) {
        embedEl.innerHTML = `<strong>${i18n.t('chat.attachedLink')}</strong> ${linkify(targetEmbedUri!)}`;
      }
    }).catch(() => {
      const embedEl = document.getElementById(embedContainerId);
      if (embedEl) embedEl.innerHTML = `<strong>${i18n.t('chat.attachedLink')}</strong> ${linkify(targetEmbedUri!)}`;
    });
  }

  div.addEventListener('focus', () => {
      const iStr = div.dataset.index;
      if (iStr !== undefined) state.focusedPostIndex = parseInt(iStr, 10);
  });

  return div;
}
