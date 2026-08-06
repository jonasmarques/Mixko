import { state } from '../config/state';
import { announcePolite, announceAssertive } from '../utils/a11y';
import { linkify } from '../utils/helpers';
import { confirmDialog, promptDialog } from '../utils/dialog';
import { createPostArticle } from '../components/post';
import { formatPostDate } from '../utils/format';
import { openGifPicker } from '../components/gif_modal';

export async function loadChat(loadMore = false) {
  if (loadMore) {
    announcePolite("Todos os chats recentes foram carregados.");
    return;
  }
  const container = document.getElementById('chat-list') as HTMLDivElement;
  container.setAttribute('aria-busy', 'true');
  try {
    const res = await window.go.services.ChatService.ListConvos("");
    container.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
        <h3 style="margin:0;">Suas Mensagens</h3>
        <button id="btn-new-chat" type="button" style="padding:6px 12px;">+ Novo Chat</button>
      </div>
      <div id="chat-list-items"></div>
    `;
    
    document.getElementById('btn-new-chat')?.addEventListener('click', async () => {
      const handle = await promptDialog("Digite o @handle da pessoa para conversar:", "", "Novo Chat");
      if (handle) {
        try {
          announcePolite(`Buscando perfil de @${handle}...`);
          const prof = await window.go.services.SocialService.GetProfile(handle);
          if (prof && prof.did) {
            const convo = await window.go.services.ChatService.GetConvoForMembers([prof.did]);
            if (convo && convo.id) {
              openChatConvo(convo.id, prof.displayName || prof.handle);
            }
          }
        } catch (e) {
          announceAssertive("Não foi possível encontrar a pessoa com este handle.");
        }
      }
    });

    const itemsContainer = document.getElementById('chat-list-items') as HTMLDivElement;
    state.currentPosts = [];
    if (res && res.length > 0) {
      res.forEach((convo: any, idx: number) => {
        const div = document.createElement('div');
        div.classList.add('post-item');
        div.setAttribute('tabindex', '0');
        div.dataset.index = idx.toString();
        div.dataset.convoId = convo.id;
        div.dataset.author = convo.members;
        div.dataset.text = `Conversa com ${(convo.members || '').trim()}. ${convo.lastMessage}` + (convo.unreadCount > 0 ? `. ${convo.unreadCount} não lidas` : '');
        div.setAttribute('aria-label', div.dataset.text);
        div.innerHTML = `
          <div aria-hidden="true">
            <header><strong>Conversa com:</strong> ${convo.members}</header>
            <div class="post-content"><p><strong>Última:</strong> ${convo.lastMessage}</p></div>
            <footer><small>${convo.unreadCount} não lidas</small></footer>
          </div>
        `;
        div.addEventListener('focus', () => { state.focusedPostIndex = idx; });
        div.addEventListener('click', () => openChatConvo(convo.id, convo.members));
        div.addEventListener('keydown', (e) => {
           if (e.key === 'Enter') openChatConvo(convo.id, convo.members);
        });
        itemsContainer.appendChild(div);
        state.currentPosts.push(div);
      });
      announcePolite(`${state.currentPosts.length} chats carregados.`);
    } else {
      itemsContainer.innerHTML = '<p>Nenhum chat encontrado.</p>';
      announcePolite("Nenhum chat.");
    }
    state.tabStates['chat'].loaded = true;
  } catch (err: any) { console.error(err); announceAssertive("Erro no chat."); } 
  finally { container.setAttribute('aria-busy', 'false'); }
}

export async function openChatConvo(convoId: string, members: string, silent = false) {
  state.activeConvoId = convoId;
  const container = document.getElementById('chat-list') as HTMLDivElement;
  if (!silent) {
    container.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
        <button id="btn-back-chat" tabindex="0">Voltar para lista de chats (Esc)</button>
        <div>
          <button id="btn-mute-chat" style="padding:4px 8px; margin-right:5px;">Mutar Chat</button>
          <button id="btn-leave-chat" style="padding:4px 8px; background:#d32f2f; color:#fff; border:none; border-radius:4px;">Sair</button>
        </div>
      </div>
      <h3>Conversa com ${members}</h3>
      <div id="chat-messages" aria-live="polite">Carregando...</div>
      
      <div id="chat-selected-gif-container" class="hidden" style="margin-top: 10px; border: 1px solid #ccc; padding: 10px; border-radius: 4px; position: relative; max-width: 300px;">
        <button type="button" id="btn-chat-remove-gif" style="position: absolute; top: 5px; right: 5px; background: #d32f2f; color: #fff; border: none; border-radius: 3px; padding: 2px 6px; cursor: pointer;">X</button>
        <video id="chat-selected-gif-preview" autoplay loop muted playsinline style="max-width: 100%; max-height: 150px; border-radius: 4px; display: block; margin: 0 auto;"></video>
      </div>

      <form id="chat-send-form" style="margin-top: 1rem; display: flex; gap: 8px;">
        <input type="text" id="chat-input" placeholder="Digite sua mensagem..." style="flex-grow: 1;" />
        <button type="button" id="btn-chat-gif" style="background: var(--primary-bg, #0085ff); color: white; border: none; padding: 6px 12px; border-radius: 4px; font-weight: bold;">GIF</button>
        <button type="submit">Enviar</button>
      </form>
    `;
    
    let chatSelectedGifUrl = "";

    const gifContainer = document.getElementById('chat-selected-gif-container') as HTMLDivElement;
    const gifPreview = document.getElementById('chat-selected-gif-preview') as HTMLVideoElement;
    const chatInput = document.getElementById('chat-input') as HTMLInputElement;

    document.getElementById('btn-back-chat')?.addEventListener('click', () => loadChat(false));
    document.getElementById('btn-mute-chat')?.addEventListener('click', async () => {
      try {
        await window.go.services.ChatService.MuteConvo(convoId);
        announceAssertive("Conversa mutada com sucesso.");
      } catch (e) {
        announceAssertive("Erro ao mutar conversa.");
      }
    });
    document.getElementById('btn-leave-chat')?.addEventListener('click', async () => {
      if (await confirmDialog("Deseja realmente sair desta conversa?", "Sair da Conversa")) {
        try {
          await window.go.services.ChatService.LeaveConvo(convoId);
          announceAssertive("Você saiu da conversa.");
          loadChat(false);
        } catch (e) {
          announceAssertive("Erro ao sair da conversa.");
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
            announcePolite('GIF selecionado para enviar no chat.');
            chatInput?.focus();
        });
    });

    document.getElementById('btn-chat-remove-gif')?.addEventListener('click', () => {
        chatSelectedGifUrl = "";
        if (gifContainer && gifPreview) {
            gifContainer.classList.add('hidden');
            gifPreview.src = "";
        }
        announcePolite('GIF removido do chat.');
        chatInput?.focus();
    });

    document.getElementById('chat-send-form')?.addEventListener('submit', async (e) => {
       e.preventDefault();
       const text = chatInput.value;
       if (!text && !chatSelectedGifUrl) return;
       announcePolite("Enviando mensagem...");
       try {
         await (window as any).go.services.ChatService.SendMessageWithGif(convoId, text, chatSelectedGifUrl);
         announceAssertive("Enviado.");
         chatInput.value = "";
         chatSelectedGifUrl = "";
         if (gifContainer && gifPreview) {
             gifContainer.classList.add('hidden');
             gifPreview.src = "";
         }
         openChatConvo(convoId, members, true);
       } catch (err: any) {
         announceAssertive("Erro ao enviar: " + err);
       }
    });
    chatInput?.focus();
  }

  state.currentPosts = []; // Clear focusable articles for main navigation
  try {
    const res = await window.go.services.ChatService.GetMessages(convoId, "");
    const msgsContainer = document.getElementById('chat-messages') as HTMLDivElement;
    if (!msgsContainer) return;
    msgsContainer.innerHTML = '';
    if (res && res.messages) {
      if (res.messages.length > 0) {
          window.go.services.ChatService.UpdateReadStatus(convoId, res.messages[0].id).catch((e: any) => console.error(e));
      }
      res.messages.slice().reverse().forEach((msg: any) => {
        const div = document.createElement('div');
        div.classList.add('post-item');
        div.setAttribute('tabindex', '0');
        div.dataset.messageId = msg.id;
        
        // Render raw Klipy/MP4 URLs as native GIFs inside the chat message text
        let rawText = msg.text || "";
        let inlineVideo = "";
        const klipyRegex = /(https?:\/\/[^\s]+?klipy[^\s]+?\.mp4|(?:https?:\/\/[^\s]+\.mp4))/g;
        rawText = rawText.replace(klipyRegex, (match: string) => {
            inlineVideo += `<video src="${match}" autoplay loop muted playsinline style="max-width: 100%; max-height: 250px; border-radius: 8px; margin-top: 8px; display: block;"></video>`;
            return ""; // Remove the URL from the text since it's now a video
        }).trim();

        let msgContent = linkify(rawText) + inlineVideo;

        let targetEmbedUri = msg.embedUri;
        if (!targetEmbedUri && rawText) {
          const match = rawText.match(/https?:\/\/bsky\.app\/profile\/([^\/]+)\/post\/([^\/\s\?]+)/);
          if (match) {
            targetEmbedUri = `at://${match[1]}/app.bsky.feed.post/${match[2]}`;
          }
        }
        let embedContainerId = `chat-embed-${msg.id}`;
        let embedInfo = targetEmbedUri ? `<div id="${embedContainerId}" style="border: 1px solid var(--border-color, #38444d); padding: 10px; border-radius: 5px; margin-top: 10px; font-size: 0.9em;">Carregando post anexado...</div>` : "";
        let replyInfo = "";
        const msgDateFormatted = msg.sentAt ? formatPostDate(msg.sentAt, undefined, true) : "";
        const senderPrefix = msg.sender ? `${msg.sender}${msgDateFormatted ? `, ${msgDateFormatted}` : ""}: ` : "";
        let accessibleLabel = `${senderPrefix}${msg.text || ""}`;

        if (msg.replyToMessageText) {
            replyInfo = `<div style="border-left: 3px solid var(--brand-color, #1da1f2); padding-left: 10px; margin-bottom: 10px; font-size: 0.9em; opacity: 0.8; background: rgba(29, 161, 242, 0.1); padding: 8px; border-radius: 4px;">
                <strong>Respondendo a:</strong> ${linkify(msg.replyToMessageText)}
            </div>`;
            accessibleLabel = `Respondendo a mensagem: ${msg.replyToMessageText}, ${accessibleLabel}`;
        }
        
        div.dataset.text = accessibleLabel;
        div.setAttribute('aria-label', div.dataset.text);
        div.innerHTML = `
          <div aria-hidden="true">
            ${replyInfo}
            <div style="display:flex; justify-content:space-between; align-items:flex-start;">
              <div><strong>${msg.sender}:</strong>${msgDateFormatted ? `<small style="margin-left: 8px; opacity: 0.7;">${msgDateFormatted}</small>` : ''}</div>
              <button class="btn-delete-msg" data-id="${msg.id}" style="padding:2px 6px; font-size:0.8em;">Apagar</button>
            </div>
            <p style="margin:4px 0;">${msgContent}</p>
            ${embedInfo}
          </div>
        `;
        
        div.querySelector('.btn-delete-msg')?.addEventListener('click', async (e) => {
          e.stopPropagation();
          if (await confirmDialog("Apagar esta mensagem para você?", "Apagar Mensagem")) {
            try {
              await window.go.services.ChatService.DeleteMessage(convoId, msg.id);
              announceAssertive("Mensagem apagada.");
              div.remove();
            } catch (err) {
              announceAssertive("Erro ao apagar mensagem.");
            }
          }
        });

        if (targetEmbedUri) {
          window.go.services.FeedService.GetPosts([targetEmbedUri]).then((postRes: any) => {
            const embedEl = document.getElementById(embedContainerId);
            if (embedEl && postRes && postRes.posts && postRes.posts.length > 0) {
              embedEl.innerHTML = '';
              const article = createPostArticle(postRes.posts[0], 0);
              embedEl.appendChild(article);
            } else if (embedEl) {
              embedEl.innerHTML = `<strong>Link anexado:</strong> ${linkify(targetEmbedUri)}`;
            }
          }).catch(() => {
            const embedEl = document.getElementById(embedContainerId);
            if (embedEl) embedEl.innerHTML = `<strong>Link anexado:</strong> ${linkify(targetEmbedUri)}`;
          });
        }

        div.dataset.index = state.currentPosts.length.toString();
        div.addEventListener('focus', () => {
            const iStr = div.dataset.index;
            if (iStr !== undefined) state.focusedPostIndex = parseInt(iStr, 10);
        });

        msgsContainer.appendChild(div);
        state.currentPosts.push(div);
      });
      if (!silent) {
        document.getElementById('chat-input')?.focus();
      }
    }
  } catch (err: any) {
    console.error(err);
  }
}
