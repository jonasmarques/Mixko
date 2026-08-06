import { state } from '../config/state';
import { DOM } from '../config/dom';
import { announcePolite, announceAssertive } from '../utils/a11y';
import { reloadCurrentTab } from './tabs';
import { getFilePathOrDataUrl } from '../utils/helpers';
import { initGifModal, openGifPicker } from '../components/gif_modal';

export let selectedImages: string[] = [];
export let selectedVideo: string = "";
export let selectedGifUrl: string = "";
export let selectedGifAlt: string = "";
export let postCount = 1;

export function updateCharCounter(text: string) {
    const len = text.length;
    const remaining = 300 - len;
    const charCounter = document.getElementById('char-counter') as HTMLDivElement;
    if (charCounter) {
        charCounter.textContent = `${remaining} caracteres restantes`;
        if (remaining <= 5) {
            charCounter.style.color = 'red';
            charCounter.style.fontWeight = 'bold';
            announceAssertive(`Atenção: restam ${remaining} caracteres`);
        } else {
            charCounter.style.color = '#555';
            charCounter.style.fontWeight = 'normal';
        }
    }
}

export function openComposeModal(mode: 'post' | 'reply' | 'quote' = 'post', target?: {uri: string, cid: string, authorHandle?: string}) {
  state.composeMode = mode;
  state.composeTarget = target || null;
  
  if (DOM.composeTitle) {
      if (mode === 'reply') DOM.composeTitle.textContent = `Respondendo a @${target?.authorHandle}`;
      else if (mode === 'quote') DOM.composeTitle.textContent = `Citando publicação de @${target?.authorHandle}`;
      else DOM.composeTitle.textContent = `Criar Nova Publicação`;
  }
  
  const postLanguageInput = document.getElementById('post-language') as HTMLSelectElement;
  const postThreadgateInput = document.getElementById('post-threadgate') as HTMLSelectElement;
  const postTextInput = document.getElementById('post-text') as HTMLTextAreaElement;
  const postImageInput = document.getElementById('post-image') as HTMLInputElement;
  const postVideoInput = document.getElementById('post-video') as HTMLInputElement;
  const altContainer = document.getElementById('image-alts-container') as HTMLDivElement;
  const videoAltContainer = document.getElementById('video-alt-container') as HTMLDivElement;
  
  const savedLang = localStorage.getItem('postLanguage');
  if (savedLang && postLanguageInput) postLanguageInput.value = savedLang;
  
  const savedGate = localStorage.getItem('postThreadgate');
  if (savedGate && postThreadgateInput) postThreadgateInput.value = savedGate;

  if (DOM.composeModal) DOM.composeModal.showModal();
  
  if (postTextInput) {
      postTextInput.value = "";
      postTextInput.focus();
  }
  updateCharCounter("");
  
  const additionalPosts = document.getElementById('thread-additional-posts');
  if (additionalPosts) additionalPosts.innerHTML = "";
  
  if (postImageInput) postImageInput.value = "";
  if (postVideoInput) postVideoInput.value = "";
  if (altContainer) altContainer.innerHTML = "";
  if (videoAltContainer) videoAltContainer.classList.add('hidden');
  
  const vAltInput = document.getElementById('video-alt') as HTMLInputElement;
  if (vAltInput) vAltInput.value = "";
  
  selectedImages = [];
  selectedVideo = "";
  selectedGifUrl = "";
  selectedGifAlt = "";
  
  const gifContainer = document.getElementById('selected-gif-container');
  if (gifContainer) gifContainer.classList.add('hidden');
  
  postCount = 1;
  post0State = { fetchedLinkUrl: "", dismissedLinkUrl: "", linkPreviewTimer: null };
  const linkPreviewContainer = document.getElementById('compose-link-preview') as HTMLDivElement;
  if (linkPreviewContainer) {
      linkPreviewContainer.innerHTML = "";
      linkPreviewContainer.classList.add('hidden');
  }

  const btnAddPost = document.getElementById('btn-add-thread-post') as HTMLButtonElement;
  if (btnAddPost) {
      btnAddPost.disabled = false;
      btnAddPost.title = "";
  }
}

export function closeComposeModal() {
    if (DOM.composeModal) DOM.composeModal.close();
}

interface PostLinkState {
    fetchedLinkUrl: string;
    dismissedLinkUrl: string;
    linkPreviewTimer: any;
}

let post0State: PostLinkState = { fetchedLinkUrl: "", dismissedLinkUrl: "", linkPreviewTimer: null };

function checkAndFetchLinkPreviewForPost(pState: PostLinkState, text: string, containerEl: HTMLDivElement | null) {
    if (!containerEl) return;
    const urlMatch = text.match(/https?:\/\/[^\s]+/i);

    if (!urlMatch) {
        if (!pState.fetchedLinkUrl) {
            pState.dismissedLinkUrl = "";
            containerEl.innerHTML = "";
            containerEl.classList.add('hidden');
        }
        return;
    }

    const url = urlMatch[0];
    if (url === pState.dismissedLinkUrl || url === pState.fetchedLinkUrl) return;

    if (pState.linkPreviewTimer) clearTimeout(pState.linkPreviewTimer);
    pState.linkPreviewTimer = setTimeout(async () => {
        try {
            containerEl.classList.remove('hidden');
            containerEl.innerHTML = `<small>Carregando cartão do link...</small>`;
            const card = await window.go.services.PostBuilderService.FetchLinkCard(url);
            if (card && (card.title || card.description || card.thumb)) {
                pState.fetchedLinkUrl = url;
                containerEl.innerHTML = `
                    <button type="button" class="btn-remove-link-preview" style="position: absolute; top: 5px; right: 5px; background: #d32f2f; color: #fff; border: none; border-radius: 3px; padding: 2px 6px; cursor: pointer; font-size: 0.8em;">Remover pré-visualização</button>
                    ${card.thumb ? `<img src="${card.thumb}" alt="Pré-visualização do link" style="max-height: 100px; display: block; margin-bottom: 6px; border-radius: 4px;" />` : ''}
                    <strong>${card.title || url}</strong>
                    ${card.description ? `<p style="font-size: 0.85em; margin: 4px 0 0 0; color: #555;">${card.description}</p>` : ''}
                `;
                containerEl.querySelector('.btn-remove-link-preview')?.addEventListener('click', () => {
                    pState.dismissedLinkUrl = url;
                    pState.fetchedLinkUrl = "";
                    containerEl.innerHTML = "";
                    containerEl.classList.add('hidden');
                    announcePolite("Pré-visualização do link removida.");
                });
                announcePolite(`Cartão do link carregado: ${card.title || url}`);
            } else {
                if (!pState.fetchedLinkUrl) {
                    containerEl.innerHTML = "";
                    containerEl.classList.add('hidden');
                }
            }
        } catch (e) {
            if (!pState.fetchedLinkUrl) {
                containerEl.innerHTML = "";
                containerEl.classList.add('hidden');
            }
        }
    }, 600);
}


export function setupCompose() {
    if (DOM.btnCloseModal) DOM.btnCloseModal.addEventListener('click', closeComposeModal);
    
    const postImageInput = document.getElementById('post-image') as HTMLInputElement;
    const postVideoInput = document.getElementById('post-video') as HTMLInputElement;
    const altContainer = document.getElementById('image-alts-container') as HTMLDivElement;
    const videoAltContainer = document.getElementById('video-alt-container') as HTMLDivElement;
    const gifContainer = document.getElementById('selected-gif-container') as HTMLDivElement;
    const gifPreview = document.getElementById('selected-gif-preview') as HTMLVideoElement;
    const btnRemoveGif = document.getElementById('btn-remove-gif') as HTMLButtonElement;
    const btnOpenGifPicker = document.getElementById('btn-open-gif-picker') as HTMLButtonElement;

    initGifModal();

    if (btnOpenGifPicker) {
        btnOpenGifPicker.addEventListener('click', () => {
            openGifPicker((url: string, alt: string) => {
                if (postImageInput) postImageInput.value = "";
                if (postVideoInput) postVideoInput.value = "";
                selectedImages = [];
                selectedVideo = "";
                if (altContainer) altContainer.innerHTML = '';
                if (videoAltContainer) videoAltContainer.classList.add('hidden');
                
                selectedGifUrl = url;
                selectedGifAlt = alt;
                if (videoAltContainer) {
                    videoAltContainer.classList.remove('hidden');
                    const vAltInput = document.getElementById('video-alt') as HTMLInputElement;
                    if (vAltInput) vAltInput.value = alt;
                }
                if (gifContainer && gifPreview) {
                    gifPreview.src = url;
                    gifContainer.classList.remove('hidden');
                }
                announcePolite('GIF selecionado: ' + alt);
            });
        });
    }

    if (btnRemoveGif) {
        btnRemoveGif.addEventListener('click', () => {
            selectedGifUrl = "";
            selectedGifAlt = "";
            if (videoAltContainer) videoAltContainer.classList.add('hidden');
            if (gifContainer && gifPreview) {
                gifContainer.classList.add('hidden');
                gifPreview.src = "";
            }
            announcePolite('GIF removido.');
        });
    }

    if (postImageInput) {
        postImageInput.addEventListener('change', async (e) => {
            const files = (e.target as HTMLInputElement).files;
            if (altContainer) altContainer.innerHTML = '';
            selectedImages = [];
            if (files && files.length > 0) {
                if (files.length > 4) {
                    announceAssertive("Máximo de 4 imagens permitido.");
                    postImageInput.value = "";
                    return;
                }
                if (postVideoInput) postVideoInput.value = "";
                selectedVideo = "";
                selectedGifUrl = "";
                if (gifContainer) gifContainer.classList.add('hidden');
                if (videoAltContainer) videoAltContainer.classList.add('hidden');

                for (let i = 0; i < files.length; i++) {
                    const pathOrData = await getFilePathOrDataUrl(files[i]);
                    selectedImages.push(pathOrData);
                    const div = document.createElement('div');
                    div.style.marginBottom = '10px';
                    const label = document.createElement('label');
                    label.textContent = `Texto Alternativo Imagem ${i+1}:`;
                    label.style.display = 'block';
                    const input = document.createElement('input');
                    input.type = 'text';
                    input.className = 'alt-text-input';
                    input.required = true;
                    input.style.width = '100%';
                    div.appendChild(label);
                    div.appendChild(input);
                    if (altContainer) altContainer.appendChild(div);
                }
                announcePolite(`${files.length} imagens selecionadas. Preencha os textos alternativos.`);
                const firstAltInput = document.querySelector('.alt-text-input') as HTMLInputElement;
                if (firstAltInput) firstAltInput.focus();
            }
        });
    }

    if (postVideoInput) {
        postVideoInput.addEventListener('change', async (e) => {
            const files = (e.target as HTMLInputElement).files;
            if (files && files.length > 0) {
                if (postImageInput) postImageInput.value = "";
                selectedImages = [];
                selectedGifUrl = "";
                if (gifContainer) gifContainer.classList.add('hidden');
                if (altContainer) altContainer.innerHTML = '';

                selectedVideo = await getFilePathOrDataUrl(files[0]);
                if (videoAltContainer) videoAltContainer.classList.remove('hidden');
                announcePolite(`Vídeo selecionado. Preencha o texto alternativo.`);
                const vAltInput = document.getElementById('video-alt') as HTMLInputElement;
                if (vAltInput) vAltInput.focus();
            } else {
                selectedVideo = "";
                if (videoAltContainer) videoAltContainer.classList.add('hidden');
            }
        });
    }

    const postTextInput = document.getElementById('post-text') as HTMLTextAreaElement;
    if (postTextInput) {
        postTextInput.addEventListener('input', (e) => {
            const val = (e.target as HTMLTextAreaElement).value;
            updateCharCounter(val);
            const linkPreviewContainer = document.getElementById('compose-link-preview') as HTMLDivElement;
            checkAndFetchLinkPreviewForPost(post0State, val, linkPreviewContainer);
        });
    }

    const postLanguageInput = document.getElementById('post-language') as HTMLSelectElement;
    if (postLanguageInput) {
        postLanguageInput.addEventListener('change', (e) => {
            localStorage.setItem('postLanguage', (e.target as HTMLSelectElement).value);
        });
    }
    const postThreadgateInput = document.getElementById('post-threadgate') as HTMLSelectElement;
    if (postThreadgateInput) {
        postThreadgateInput.addEventListener('change', (e) => {
            localStorage.setItem('postThreadgate', (e.target as HTMLSelectElement).value);
        });
    }

    const btnAddPost = document.getElementById('btn-add-thread-post') as HTMLButtonElement;
    postCount = 1;
    if (btnAddPost) {
        btnAddPost.addEventListener('click', () => {
            postCount++;
            const container = document.getElementById('thread-additional-posts') as HTMLDivElement;
            if (!container) return;
            
            const wrapper = document.createElement('div');
            wrapper.style.marginTop = '15px';
            wrapper.style.paddingTop = '15px';
            wrapper.style.borderTop = '1px solid #ddd';
            
            const label = document.createElement('label');
            label.textContent = `Post ${postCount}:`;
            label.style.display = 'block';
            label.style.fontWeight = 'bold';
            label.style.marginBottom = '5px';
            
            const textarea = document.createElement('textarea');
            textarea.className = 'thread-text-input';
            textarea.rows = 4;
            textarea.required = true;
            textarea.style.width = '100%';
            
            const threadPostState: PostLinkState = { fetchedLinkUrl: "", dismissedLinkUrl: "", linkPreviewTimer: null };
            (textarea as any)._linkState = threadPostState;

            const previewContainer = document.createElement('div');
            previewContainer.className = 'compose-link-preview hidden';
            previewContainer.style.cssText = 'margin: 10px 0; border: 1px solid #ccc; padding: 10px; border-radius: 6px; position: relative;';

            const counter = document.createElement('div');
            counter.className = 'char-counter';
            counter.style.fontSize = '0.85em';
            counter.style.color = '#555';
            counter.style.marginBottom = '10px';
            counter.textContent = '300 caracteres restantes';
            
            textarea.addEventListener('input', (e) => {
                const val = (e.target as HTMLTextAreaElement).value;
                const len = val.length;
                const remaining = 300 - len;
                counter.textContent = `${remaining} caracteres restantes`;
                if (remaining <= 5) {
                    counter.style.color = 'red';
                    counter.style.fontWeight = 'bold';
                    announceAssertive(`Atenção: restam ${remaining} caracteres no post ${postCount}`);
                } else {
                    counter.style.color = '#555';
                    counter.style.fontWeight = 'normal';
                }
                checkAndFetchLinkPreviewForPost(threadPostState, val, previewContainer);
            });
            
            const btnRemove = document.createElement('button');
            btnRemove.type = 'button';
            btnRemove.textContent = 'Remover Post';
            btnRemove.onclick = () => { wrapper.remove(); };
            
            wrapper.appendChild(label);
            wrapper.appendChild(textarea);
            wrapper.appendChild(counter);
            wrapper.appendChild(previewContainer);
            wrapper.appendChild(btnRemove);
            container.appendChild(wrapper);
            textarea.focus();
            
            announcePolite(`Post ${postCount} adicionado a thread.`);
        });
    }

    if (DOM.composeForm) {
        DOM.composeForm.addEventListener('submit', async (e) => {
          e.preventDefault();
          
          const postItems: { text: string; linkUrl: string }[] = [
              { text: postTextInput.value, linkUrl: post0State.fetchedLinkUrl }
          ];

          const additionalTextareas = document.querySelectorAll('.thread-text-input') as NodeListOf<HTMLTextAreaElement>;
          for (let i = 0; i < additionalTextareas.length; i++) {
              const ta = additionalTextareas[i];
              const linkState = (ta as any)._linkState as PostLinkState | undefined;
              postItems.push({
                  text: ta.value,
                  linkUrl: linkState?.fetchedLinkUrl || ""
              });
          }
          
          const altInputs = document.querySelectorAll('.alt-text-input') as NodeListOf<HTMLInputElement>;
          let alts: string[] = [];
          for (let i = 0; i < altInputs.length; i++) {
              const val = altInputs[i].value.trim();
              if (!val) {
                  announceAssertive("Texto alternativo ausente. Por favor, descreva todas as imagens antes de postar.");
                  alert("Texto alternativo ausente. Por favor, descreva todas as imagens antes de postar.");
                  altInputs[i].focus();
                  return;
              }
              alts.push(val);
          }
          
          let vAlt = "";
          if (selectedVideo !== "" || selectedGifUrl !== "") {
              const vAltInput = document.getElementById('video-alt') as HTMLInputElement;
              if (vAltInput) {
                  vAlt = vAltInput.value.trim();
                  if (!vAlt) {
                      announceAssertive("Texto alternativo da mídia ausente.");
                      alert("Texto alternativo da mídia ausente.");
                      vAltInput.focus();
                      return;
                  }
              }
          }
          
          const language = postLanguageInput ? postLanguageInput.value : "";
          const threadgate = postThreadgateInput ? postThreadgateInput.value : "everyone";
          
          const imageSources = selectedImages.length > 0 ? selectedImages : [];
          const videoPath = selectedVideo;

          // Pré-validação de todos os posts da thread antes de enviar qualquer requisição
          for (let i = 0; i < postItems.length; i++) {
              const item = postItems[i];
              const isFirstPost = i === 0;
              const hasMedia = isFirstPost && (selectedImages.length > 0 || selectedVideo !== "");

              if (item.text.trim() === "" && !hasMedia) {
                  const errorMsg = postItems.length > 1
                      ? `O post ${i + 1} da thread está vazio. Por favor, insira um texto.`
                      : "O post está vazio. Por favor, insira um texto.";
                  announceAssertive(errorMsg);
                  alert(errorMsg);
                  if (isFirstPost) {
                      postTextInput.focus();
                  } else {
                      additionalTextareas[i - 1]?.focus();
                  }
                  return;
              }

              if (item.text.length > 300) {
                  const errorMsg = postItems.length > 1
                      ? `O post ${i + 1} da thread excede o limite de 300 caracteres (possui ${item.text.length} caracteres).`
                      : `O post excede o limite de 300 caracteres (possui ${item.text.length} caracteres).`;
                  announceAssertive(errorMsg);
                  alert(errorMsg);
                  if (isFirstPost) {
                      postTextInput.focus();
                  } else {
                      additionalTextareas[i - 1]?.focus();
                  }
                  return;
              }
          }

          const btnSubmit = document.getElementById('btn-submit-post') as HTMLButtonElement;
          const btnAddPost = document.getElementById('btn-add-thread-post') as HTMLButtonElement;
          if (btnSubmit) btnSubmit.disabled = true;
          if (btnAddPost) btnAddPost.disabled = true;

          announcePolite(`Publicando ${postItems.length > 1 ? postItems.length + ' posts' : 'post'}...`);
          try {
            let currentReplyUri = state.composeTarget?.uri || "";
            let currentReplyCid = state.composeTarget?.cid || "";
            
            for (let i = 0; i < postItems.length; i++) {
                let res;
                const item = postItems[i];
                const pPaths = i === 0 ? imageSources : [];
                const pAlts = i === 0 ? alts : [];
                const pVid = i === 0 ? videoPath : "";
                const pVidAlt = i === 0 ? vAlt : "";
                const pLink = item.linkUrl;
                const pLang = i === 0 ? language : ""; 
                const pThreadgate = i === 0 ? threadgate : "everyone";
                const pGifUrl = i === 0 ? selectedGifUrl : "";
                
                if (state.composeMode === 'quote' && i === 0 && state.composeTarget) {
                    res = await (window as any).go.services.PostBuilderService.QuotePost(item.text, state.composeTarget.uri, state.composeTarget.cid, pPaths, pAlts, pVid, pVidAlt, pLang, pThreadgate, pGifUrl);
                    if (res) {
                        currentReplyUri = res.uri;
                        currentReplyCid = res.cid;
                    }
                } else {
                    res = await (window as any).go.services.PostBuilderService.CreatePost(item.text, currentReplyUri, currentReplyCid, pPaths, pAlts, pVid, pVidAlt, pLink, pLang, pThreadgate, pGifUrl);
                    if (res) {
                        currentReplyUri = res.uri;
                        currentReplyCid = res.cid;
                    }
                }
                
                if (postItems.length > 1) {
                    announcePolite(`Enviado ${i + 1} de ${postItems.length}...`);
                }
            }
            
            if (btnSubmit) btnSubmit.disabled = false;
            if (btnAddPost) btnAddPost.disabled = false;
            announceAssertive(postItems.length > 1 ? "Thread publicada com sucesso." : "Publicado com sucesso.");
            closeComposeModal();
            if (state.currentTab !== 'notifications') {
                reloadCurrentTab();
            }
          } catch (err: any) {
            if (btnSubmit) btnSubmit.disabled = false;
            if (btnAddPost) btnAddPost.disabled = false;
            console.error("Erro ao publicar:", err);
            announceAssertive("Erro: " + err);
            alert("Erro ao publicar: " + err);
          }
        });
    }
}
