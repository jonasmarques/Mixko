import { state } from '../config/state';
import { DOM } from '../config/dom';
import { announcePolite, announceAssertive } from '../utils/a11y';
import { reloadCurrentTab } from './tabs';
import { getFilePathOrDataUrl, imageFileToDataUrl, esc, escUrl, countGraphemes } from '../utils/helpers';
import { initGifModal, openGifPicker } from '../components/gif_modal';
import { i18n, translateError } from '../utils/i18n';
import { MentionAutocomplete } from '../components/mention_autocomplete';

export let selectedImages: string[] = [];
export let selectedVideo: string = "";
export let selectedVideoWidth: number = 0;
export let selectedVideoHeight: number = 0;
export let selectedCaptionPath: string = "";
export let selectedGifUrl: string = "";
export let selectedGifAlt: string = "";
export let postCount = 1;
export let currentEditingDraftId: string | null = null;

/**
 * Posts of the thread being published that already went out. After a failure
 * the next attempt resumes here instead of publishing them a second time.
 */
let threadProgress: { sent: number; replyUri: string; replyCid: string; rootUri: string; rootCid: string } | null = null;

/** Sends a video to the backend in pieces and returns the temp file it was written to. */
async function uploadVideoInChunks(file: File): Promise<string> {
    const chunkSize = 4 * 1024 * 1024;
    const ext = (file.name.match(/\.[a-z0-9]+$/i)?.[0] || '').toLowerCase();
    let path = '';
    for (let offset = 0; offset === 0 || offset < file.size; offset += chunkSize) {
        const dataUrl = await getFilePathOrDataUrl(file.slice(offset, offset + chunkSize));
        path = await window.go.services.PostBuilderService.AppendVideoChunk(ext, offset === 0, dataUrl.slice(dataUrl.indexOf(',') + 1));
    }
    return path;
}

export async function loadUserListsForThreadgate() {
    const selectEl = document.getElementById('post-threadgate-list') as HTMLSelectElement;
    if (!selectEl) return;
    try {
        const res = await window.go.services.SocialService.GetActorLists(state.loggedInDid || "", "");
        selectEl.innerHTML = "";
        if (res && res.lists && res.lists.length > 0) {
            for (const list of res.lists) {
                const opt = document.createElement('option');
                opt.value = list.uri;
                opt.textContent = list.name;
                selectEl.appendChild(opt);
            }
        } else {
            const opt = document.createElement('option');
            opt.value = "";
            opt.textContent = i18n.t('compose.noListsFound');
            selectEl.appendChild(opt);
        }
    } catch (e) {
        console.error("Error loading lists for threadgate:", e);
    }
}

export function updateCharCounter(text: string) {
    const len = countGraphemes(text);
    const remaining = 300 - len;
    const charCounter = document.getElementById('char-counter') as HTMLDivElement;
    if (charCounter) {
        charCounter.textContent = i18n.t('compose.charsRemaining', { count: remaining.toString() });
        if (remaining <= 5) {
            charCounter.style.color = 'red';
            charCounter.style.fontWeight = 'bold';
            announceAssertive(i18n.t('compose.warnRemaining', { count: remaining.toString() }));
        } else {
            charCounter.style.color = '#555';
            charCounter.style.fontWeight = 'normal';
        }
    }
}

export function openComposeModal(mode: 'post' | 'reply' | 'quote' = 'post', target?: {uri: string, cid: string, authorHandle?: string, authorPronouns?: string}) {
  state.composeMode = mode;
  state.composeTarget = target || null;
  
  if (DOM.composeTitle) {
      const handleWithPronouns = target?.authorHandle
        ? (target.authorPronouns ? `${target.authorHandle} (${target.authorPronouns})` : target.authorHandle)
        : '';
      if (mode === 'reply') DOM.composeTitle.textContent = i18n.t('compose.replyingTo', { handle: handleWithPronouns });
      else if (mode === 'quote') DOM.composeTitle.textContent = i18n.t('compose.quoting', { handle: handleWithPronouns });
      else DOM.composeTitle.textContent = i18n.t('compose.newPost');
  }
  
  const postLanguageInput = document.getElementById('post-language') as HTMLSelectElement;
  const postThreadgateInput = document.getElementById('post-threadgate') as HTMLSelectElement;
  const postTextInput = document.getElementById('post-text') as HTMLTextAreaElement;
  const postImageInput = document.getElementById('post-image') as HTMLInputElement;
  const postVideoInput = document.getElementById('post-video') as HTMLInputElement;
  const postVideoCaptionInput = document.getElementById('post-video-caption') as HTMLInputElement | null;
  const altContainer = document.getElementById('image-alts-container') as HTMLDivElement;
  const videoAltContainer = document.getElementById('video-alt-container') as HTMLDivElement;
  const tgListContainer = document.getElementById('threadgate-list-container');
  
  const savedLang = localStorage.getItem('postLanguage');
  if (savedLang !== null) {
      if (postLanguageInput) postLanguageInput.value = savedLang;
  } else {
      const currentUiLang = localStorage.getItem('language') || 'pt_br';
      const defaultCode = currentUiLang.startsWith('en') ? 'en' : currentUiLang.startsWith('es') ? 'es' : 'pt';
      if (postLanguageInput) postLanguageInput.value = defaultCode;
      localStorage.setItem('postLanguage', defaultCode);
  }
  
  const rawSavedGate = localStorage.getItem('postThreadgate') || 'everyone';
  const savedGate = rawSavedGate === 'everybody' ? 'everyone' : rawSavedGate;
  if (postThreadgateInput) {
      postThreadgateInput.disabled = mode === 'reply';
      postThreadgateInput.value = savedGate;
      if (!postThreadgateInput.value) {
          postThreadgateInput.value = 'everyone';
      }
      if (postThreadgateInput.value === 'list' && mode !== 'reply' && tgListContainer) {
          tgListContainer.classList.remove('hidden');
      } else if (tgListContainer) {
          tgListContainer.classList.add('hidden');
      }
  } else if (tgListContainer) {
      tgListContainer.classList.add('hidden');
  }
  loadUserListsForThreadgate();

  if (DOM.composeModal && !DOM.composeModal.open) {
      DOM.composeModal.showModal();
  }
  
  if (postTextInput) {
      postTextInput.value = "";
      postTextInput.focus();
      requestAnimationFrame(() => {
          postTextInput.focus();
      });
      setTimeout(() => {
          postTextInput.focus();
      }, 50);
  }
  updateCharCounter("");
  
  const additionalPosts = document.getElementById('thread-additional-posts');
  if (additionalPosts) additionalPosts.innerHTML = "";
  
  if (postImageInput) postImageInput.value = "";
  if (postVideoInput) postVideoInput.value = "";
  if (postVideoCaptionInput) postVideoCaptionInput.value = "";
  if (altContainer) altContainer.innerHTML = "";
  if (videoAltContainer) videoAltContainer.classList.add('hidden');
  
  const vAltInput = document.getElementById('video-alt') as HTMLInputElement;
  if (vAltInput) vAltInput.value = "";
  
  document.querySelectorAll<HTMLInputElement>('.post-self-label').forEach(cb => { cb.checked = false; });
  const disableQuotesInput = document.getElementById('post-disable-quotes') as HTMLInputElement | null;
  if (disableQuotesInput) disableQuotesInput.checked = false;
  const draftsContainer = document.getElementById('drafts-list-container');
  if (draftsContainer) {
      draftsContainer.classList.add('hidden');
      draftsContainer.innerHTML = '';
  }

  const videoLimitsEl = document.getElementById('video-limits-info');
  if (videoLimitsEl) {
      const defaultInfo = i18n.t('compose.videoLimitsDefault');
      videoLimitsEl.textContent = defaultInfo;
      window.go.services.PostBuilderService.GetVideoUploadLimits().then(limits => {
          if (!limits) return;
          if (!limits.canUpload) {
              videoLimitsEl.textContent = limits.message || i18n.t('sec2.videoUploadBlocked');
          } else if (limits.remainingDailyVideos > 0) {
              const mb = Math.round((limits.remainingDailyBytes || 0) / (1024 * 1024));
              videoLimitsEl.textContent = `${defaultInfo} • ${i18n.t('sec2.videoUploadLimitsInfo', { videos: String(limits.remainingDailyVideos), mb: String(mb) })}`;
          }
      }).catch(() => {});
  }
  
  selectedImages = [];
  selectedVideo = "";
  selectedVideoWidth = 0;
  selectedVideoHeight = 0;
  selectedCaptionPath = "";
  selectedGifUrl = "";
  selectedGifAlt = "";
  threadProgress = null;
  currentEditingDraftId = null;

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

let mainMentionAutocomplete: MentionAutocomplete | null = null;
let threadMentionAutocompletes: MentionAutocomplete[] = [];
let isClosingConfirmed = false;

export function forceCloseComposeModal() {
    if (mainMentionAutocomplete) {
        mainMentionAutocomplete.close();
    }
    threadMentionAutocompletes.forEach(autoc => autoc.close());
    threadMentionAutocompletes = [];

    if (DOM.composeModal) {
        isClosingConfirmed = true;
        DOM.composeModal.close();
        isClosingConfirmed = false;
    }
}

export function requestCloseComposeModal() {
    const postTextInput = document.getElementById('post-text') as HTMLTextAreaElement;
    const hasContent = (postTextInput && postTextInput.value.trim().length > 0) ||
        selectedImages.length > 0 ||
        selectedVideo !== "" ||
        selectedGifUrl !== "";

    if (!hasContent) {
        forceCloseComposeModal();
        return;
    }

    const confirmModal = document.getElementById('confirm-discard-modal') as HTMLDialogElement;
    if (confirmModal) {
        if (!confirmModal.open) confirmModal.showModal();
        const btnYes = document.getElementById('btn-confirm-discard-yes');
        const btnNo = document.getElementById('btn-confirm-discard-no');
        requestAnimationFrame(() => {
            (btnNo as HTMLElement | null)?.focus();
        });

        const onYes = () => {
            confirmModal.close();
            forceCloseComposeModal();
            cleanup();
        };

        const onNo = () => {
            confirmModal.close();
            if (postTextInput) postTextInput.focus();
            cleanup();
        };

        const cleanup = () => {
            btnYes?.removeEventListener('click', onYes);
            btnNo?.removeEventListener('click', onNo);
        };

        btnYes?.addEventListener('click', onYes, { once: true });
        btnNo?.addEventListener('click', onNo, { once: true });
    } else {
        if (confirm(i18n.t('compose.confirmDiscardMessage'))) {
            forceCloseComposeModal();
        }
    }
}

export function closeComposeModal() {
    requestCloseComposeModal();
}

interface PostLinkState {
    fetchedLinkUrl: string;
    dismissedLinkUrl: string;
    linkPreviewTimer: ReturnType<typeof setTimeout> | null;
}

let post0State: PostLinkState = { fetchedLinkUrl: "", dismissedLinkUrl: "", linkPreviewTimer: null };

function extractFirstUrlFromText(text: string): string | null {
    const httpMatch = text.match(/https?:\/\/[^\s<>"]+/i);
    if (httpMatch) {
        return httpMatch[0].replace(/[.,;:?!"'>)\]]+$/, '');
    }
    const bareMatch = text.match(/(?:^|[\s(])((?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:com|org|net|edu|gov|io|co|app|dev|me|info|biz|tv|gg|xyz|social|br|pt|es|uk|de|fr|it|ca|au|jp|kr|cn|in|ru|mx|ar|cl)(?:\/[^\s<>"]*)?)/i);
    if (bareMatch && bareMatch[1]) {
        const cleaned = bareMatch[1].replace(/[.,;:?!"'>)\]]+$/, '');
        if (cleaned) {
            return `https://${cleaned}`;
        }
    }
    return null;
}

function checkAndFetchLinkPreviewForPost(pState: PostLinkState, text: string, containerEl: HTMLDivElement | null) {
    if (!containerEl) return;
    const url = extractFirstUrlFromText(text);

    if (!url) {
        if (!pState.fetchedLinkUrl) {
            pState.dismissedLinkUrl = "";
            containerEl.innerHTML = "";
            containerEl.classList.add('hidden');
        }
        return;
    }

    if (url === pState.dismissedLinkUrl || url === pState.fetchedLinkUrl) return;

    if (pState.linkPreviewTimer) clearTimeout(pState.linkPreviewTimer);
    pState.linkPreviewTimer = setTimeout(async () => {
        try {
            containerEl.classList.remove('hidden');
            containerEl.innerHTML = `<small>${i18n.t('compose.loadingLink')}</small>`;
            const card = await window.go.services.PostBuilderService.FetchLinkCard(url);
            if (card && (card.title || card.description || card.thumb)) {
                pState.fetchedLinkUrl = url;
                containerEl.innerHTML = `
                    <button type="button" class="btn-remove-link-preview" style="position: absolute; top: 5px; right: 5px; background: #d32f2f; color: #fff; border: none; border-radius: 3px; padding: 2px 6px; cursor: pointer; font-size: 0.8em;">${i18n.t('compose.removePreviewBtn')}</button>
                    ${card.thumb ? `<img src="${escUrl(card.thumb)}" alt="${esc(i18n.t('compose.linkPreviewAlt'))}" style="max-height: 100px; display: block; margin-bottom: 6px; border-radius: 4px;" />` : ''}
                    <strong>${esc(card.title || url)}</strong>
                    ${card.description ? `<p style="font-size: 0.85em; margin: 4px 0 0 0; color: #555;">${esc(card.description)}</p>` : ''}
                `;
                containerEl.querySelector('.btn-remove-link-preview')?.addEventListener('click', () => {
                    pState.dismissedLinkUrl = url;
                    pState.fetchedLinkUrl = "";
                    containerEl.innerHTML = "";
                    containerEl.classList.add('hidden');
                    announcePolite(i18n.t('compose.previewRemoved'));
                });
                announcePolite(i18n.t('compose.linkLoaded', { title: card.title || url }));
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
    
    if (DOM.composeModal) {
        DOM.composeModal.addEventListener('cancel', (e) => {
            e.preventDefault();
            if (mainMentionAutocomplete && mainMentionAutocomplete.isOpen()) {
                mainMentionAutocomplete.close();
                return;
            }
            for (const autoc of threadMentionAutocompletes) {
                if (autoc.isOpen()) {
                    autoc.close();
                    return;
                }
            }
            if (!isClosingConfirmed) {
                requestCloseComposeModal();
            }
        });
    }

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
                selectedVideoWidth = 0;
                selectedVideoHeight = 0;
                if (altContainer) altContainer.innerHTML = '';
                if (videoAltContainer) videoAltContainer.classList.add('hidden');
                
                selectedGifUrl = url;
                selectedGifAlt = alt;

                try {
                    const tempVideo = document.createElement('video');
                    tempVideo.preload = 'metadata';
                    tempVideo.onloadedmetadata = () => {
                        selectedVideoWidth = tempVideo.videoWidth || 0;
                        selectedVideoHeight = tempVideo.videoHeight || 0;
                    };
                    tempVideo.src = url;
                } catch (_) {}

                if (videoAltContainer) {
                    videoAltContainer.classList.remove('hidden');
                    const vAltInput = document.getElementById('video-alt') as HTMLInputElement;
                    if (vAltInput) vAltInput.value = alt;
                }
                if (gifContainer && gifPreview) {
                    gifPreview.src = url;
                    gifContainer.classList.remove('hidden');
                }
                announcePolite(i18n.t('compose.gifSelected', { alt }));
            });
        });
    }

    if (btnRemoveGif) {
        btnRemoveGif.addEventListener('click', () => {
            selectedGifUrl = "";
            selectedGifAlt = "";
            selectedVideoWidth = 0;
            selectedVideoHeight = 0;
            if (videoAltContainer) videoAltContainer.classList.add('hidden');
            if (gifContainer && gifPreview) {
                gifContainer.classList.add('hidden');
                gifPreview.src = "";
            }
            announcePolite(i18n.t('compose.gifRemoved'));
        });
    }

    if (postImageInput) {
        postImageInput.addEventListener('change', async (e) => {
            const files = (e.target as HTMLInputElement).files;
            if (!files || files.length === 0) return;

            const slotsAvailable = 10 - selectedImages.length;
            if (slotsAvailable <= 0) {
                announceAssertive(i18n.t('compose.maxImagesLimit'));
                postImageInput.value = "";
                return;
            }

            const filesToAdd = Array.from(files).slice(0, slotsAvailable);
            if (filesToAdd.length < files.length) {
                announceAssertive(i18n.t('compose.maxImagesLimit'));
            }

            if (postVideoInput) postVideoInput.value = "";
            selectedVideo = "";
            selectedVideoWidth = 0;
            selectedVideoHeight = 0;
            selectedGifUrl = "";
            if (gifContainer) gifContainer.classList.add('hidden');
            if (videoAltContainer) videoAltContainer.classList.add('hidden');

            for (let i = 0; i < filesToAdd.length; i++) {
                const pathOrData = await imageFileToDataUrl(filesToAdd[i]);
                selectedImages.push(pathOrData);
                const globalIndex = selectedImages.length;
                const div = document.createElement('div');
                div.style.marginBottom = '10px';
                const label = document.createElement('label');
                label.textContent = i18n.t('compose.altImgLabel', { index: globalIndex.toString() });
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

            postImageInput.value = "";
            announcePolite(i18n.t('compose.imgsSelected', { count: selectedImages.length.toString() }));
            const altInputs = altContainer ? altContainer.querySelectorAll<HTMLInputElement>('.alt-text-input') : [];
            const lastAlt = altInputs[altInputs.length - 1];
            if (lastAlt) lastAlt.focus();
        });
    }

    if (postVideoInput) {
        postVideoInput.addEventListener('change', async (e) => {
            const files = (e.target as HTMLInputElement).files;
            if (files && files.length > 0) {
                const file = files[0];
                const maxBytes = 300 * 1024 * 1024;
                if (file.size > maxBytes) {
                    const msg = i18n.t('compose.videoTooLarge');
                    announceAssertive(msg);
                    alert(msg);
                    postVideoInput.value = "";
                    selectedVideo = "";
                    if (videoAltContainer) videoAltContainer.classList.add('hidden');
                    return;
                }

                if (postImageInput) postImageInput.value = "";
                selectedImages = [];
                selectedGifUrl = "";
                selectedVideoWidth = 0;
                selectedVideoHeight = 0;
                if (gifContainer) gifContainer.classList.add('hidden');
                if (altContainer) altContainer.innerHTML = '';

                // Publishing while the file is still on its way would post without it.
                const btnSubmitPost = document.getElementById('btn-submit-post') as HTMLButtonElement | null;
                if (btnSubmitPost) btnSubmitPost.disabled = true;
                selectedVideo = "";
                try {
                    selectedVideo = await uploadVideoInChunks(file);
                } catch (err: unknown) {
                    postVideoInput.value = "";
                    announceAssertive(i18n.t('post.error', { error: translateError(err) }));
                    return;
                } finally {
                    if (btnSubmitPost) btnSubmitPost.disabled = false;
                }

                try {
                    const videoUrl = URL.createObjectURL(file);
                    const tempVideo = document.createElement('video');
                    tempVideo.preload = 'metadata';
                    tempVideo.onloadedmetadata = () => {
                        if (tempVideo.duration && Number.isFinite(tempVideo.duration) && tempVideo.duration > 600.5) {
                            URL.revokeObjectURL(videoUrl);
                            const msg = i18n.t('compose.videoTooLong');
                            announceAssertive(msg);
                            alert(msg);
                            postVideoInput.value = "";
                            selectedVideo = "";
                            selectedVideoWidth = 0;
                            selectedVideoHeight = 0;
                            if (videoAltContainer) videoAltContainer.classList.add('hidden');
                            return;
                        }
                        selectedVideoWidth = tempVideo.videoWidth || 0;
                        selectedVideoHeight = tempVideo.videoHeight || 0;
                        URL.revokeObjectURL(videoUrl);
                    };
                    tempVideo.src = videoUrl;
                } catch (_) {}

                if (videoAltContainer) videoAltContainer.classList.remove('hidden');
                announcePolite(i18n.t('compose.videoSelected'));
                const vAltInput = document.getElementById('video-alt') as HTMLInputElement;
                if (vAltInput) vAltInput.focus();
            } else {
                selectedVideo = "";
                selectedVideoWidth = 0;
                selectedVideoHeight = 0;
                if (videoAltContainer) videoAltContainer.classList.add('hidden');
            }
        });
    }

    const postVideoCaptionInput = document.getElementById('post-video-caption') as HTMLInputElement | null;
    if (postVideoCaptionInput) {
        postVideoCaptionInput.addEventListener('change', async (e) => {
            const files = (e.target as HTMLInputElement).files;
            if (files && files.length > 0) {
                selectedCaptionPath = await getFilePathOrDataUrl(files[0]);
            } else {
                selectedCaptionPath = "";
            }
        });
    }

    const appendThreadPostInput = (initialText = "", focusInput = true) => {
        postCount++;
        const container = document.getElementById('thread-additional-posts') as HTMLDivElement;
        if (!container) return;

        const wrapper = document.createElement('div');
        wrapper.style.marginTop = '15px';
        wrapper.style.paddingTop = '15px';
        wrapper.style.borderTop = '1px solid #ddd';

        const label = document.createElement('label');
        label.textContent = i18n.t('compose.postCountLabel', { count: postCount.toString() });
        label.style.display = 'block';
        label.style.fontWeight = 'bold';
        label.style.marginBottom = '5px';

        const textarea = document.createElement('textarea');
        textarea.className = 'thread-text-input';
        textarea.rows = 4;
        textarea.required = true;
        textarea.style.width = '100%';
        textarea.value = initialText;

        const threadAutoc = new MentionAutocomplete(textarea);
        threadMentionAutocompletes.push(threadAutoc);

        const threadPostState: PostLinkState = { fetchedLinkUrl: "", dismissedLinkUrl: "", linkPreviewTimer: null };
        (textarea as unknown as { _linkState: PostLinkState })._linkState = threadPostState;

        const previewContainer = document.createElement('div');
        previewContainer.className = 'compose-link-preview hidden';
        previewContainer.style.cssText = 'margin: 10px 0; border: 1px solid #ccc; padding: 10px; border-radius: 6px; position: relative;';

        const counter = document.createElement('div');
        counter.className = 'char-counter';
        counter.style.fontSize = '0.85em';
        counter.style.color = '#555';
        counter.style.marginBottom = '10px';
        const initRem = 300 - countGraphemes(initialText);
        counter.textContent = i18n.t('compose.charsRemaining', { count: initRem.toString() });

        textarea.addEventListener('input', (e) => {
            const val = (e.target as HTMLTextAreaElement).value;
            const len = countGraphemes(val);
            const remaining = 300 - len;
            counter.textContent = i18n.t('compose.charsRemaining', { count: remaining.toString() });
            if (remaining <= 5) {
                counter.style.color = 'red';
                counter.style.fontWeight = 'bold';
                announceAssertive(i18n.t('compose.warnRemainingThread', { remaining: remaining.toString(), count: postCount.toString() }));
            } else {
                counter.style.color = '#555';
                counter.style.fontWeight = 'normal';
            }
            checkAndFetchLinkPreviewForPost(threadPostState, val, previewContainer);
        });

        const btnRemove = document.createElement('button');
        btnRemove.type = 'button';
        btnRemove.textContent = i18n.t('compose.removePostBtn');
        btnRemove.onclick = () => { wrapper.remove(); };

        wrapper.appendChild(label);
        wrapper.appendChild(textarea);
        wrapper.appendChild(counter);
        wrapper.appendChild(previewContainer);
        wrapper.appendChild(btnRemove);
        container.appendChild(wrapper);
        if (focusInput) {
            textarea.focus();
            announcePolite(i18n.t('compose.postAdded', { count: postCount.toString() }));
        }
    };

    const btnSaveDraft = document.getElementById('btn-save-draft') as HTMLButtonElement | null;
    if (btnSaveDraft) {
        btnSaveDraft.addEventListener('click', async () => {
            const text = postTextInput ? postTextInput.value.trim() : '';
            if (!text) {
                announceAssertive(i18n.t('compose.emptyPost'));
                return;
            }
            const allPosts: string[] = [text];
            document.querySelectorAll<HTMLTextAreaElement>('.thread-text-input').forEach(ta => {
                if (ta.value.trim()) {
                    allPosts.push(ta.value.trim());
                }
            });
            const lang = postLanguageInput ? postLanguageInput.value : '';
            const selfLabels: string[] = [];
            document.querySelectorAll<HTMLInputElement>('.post-self-label:checked').forEach(cb => selfLabels.push(cb.value));
            const threadgate = postThreadgateInput ? postThreadgateInput.value : 'everybody';
            const disableQuotes = (document.getElementById('post-disable-quotes') as HTMLInputElement | null)?.checked === true;
            try {
                if (currentEditingDraftId && window.go.services.PostBuilderService.UpdateThreadDraft) {
                    await window.go.services.PostBuilderService.UpdateThreadDraft(currentEditingDraftId, allPosts, lang ? [lang] : [], selfLabels, [threadgate], disableQuotes);
                    announceAssertive(i18n.t('sec2.draftUpdatedMsg'));
                } else if (window.go.services.PostBuilderService.CreateThreadDraft) {
                    const newId = await window.go.services.PostBuilderService.CreateThreadDraft(allPosts, lang ? [lang] : [], selfLabels, [threadgate], disableQuotes);
                    if (newId) currentEditingDraftId = newId;
                    announceAssertive(i18n.t('sec2.draftSaved'));
                } else {
                    await window.go.services.PostBuilderService.CreateDraft(allPosts.join('\n---MIXKO_THREAD_SPLIT---\n'), lang ? [lang] : [], selfLabels, [threadgate], disableQuotes);
                    announceAssertive(i18n.t('sec2.draftSaved'));
                }
            } catch (err: unknown) {
                announceAssertive(i18n.t('post.error', { error: String(err) }));
            }
        });
    }

    const btnOpenDrafts = document.getElementById('btn-open-drafts') as HTMLButtonElement | null;
    if (btnOpenDrafts) {
        btnOpenDrafts.addEventListener('click', async () => {
            const container = document.getElementById('drafts-list-container') as HTMLDivElement | null;
            if (!container) return;
            if (!container.classList.contains('hidden')) {
                container.classList.add('hidden');
                return;
            }
            container.classList.remove('hidden');
            container.innerHTML = `<p>${esc(i18n.t('modals.loading'))}</p>`;
            try {
                const res = await window.go.services.PostBuilderService.GetDrafts("");
                const drafts = res?.drafts || [];
                if (drafts.length === 0) {
                    container.innerHTML = `<p>${esc(i18n.t('sec2.noDrafts'))}</p>`;
                    return;
                }
                container.innerHTML = '';
                drafts.forEach(d => {
                    const row = document.createElement('div');
                    row.style.cssText = 'border-bottom: 1px solid #eee; padding: 6px 0; display: flex; justify-content: space-between; align-items: center; gap: 8px;';
                    const draftPosts = (d.posts && d.posts.length > 0) ? d.posts : [d.text || ''];
                    const firstText = draftPosts[0] || '';
                    const threadSuffix = draftPosts.length > 1 ? ` ${i18n.t('sec2.threadDraftBadge', { count: draftPosts.length.toString() })}` : '';
                    const span = document.createElement('span');
                    span.textContent = firstText.slice(0, 80) + (firstText.length > 80 ? '…' : '') + threadSuffix;
                    const actions = document.createElement('div');
                    actions.style.display = 'flex';
                    actions.style.gap = '6px';
                    const btnLoad = document.createElement('button');
                    btnLoad.type = 'button';
                    btnLoad.textContent = i18n.t('sec2.loadDraft');
                    btnLoad.addEventListener('click', () => {
                        currentEditingDraftId = d.id;
                        if (postTextInput) {
                            postTextInput.value = draftPosts[0] || '';
                            updateCharCounter(postTextInput.value);
                        }
                        const addContainer = document.getElementById('thread-additional-posts') as HTMLDivElement | null;
                        if (addContainer) {
                            addContainer.innerHTML = '';
                            postCount = 1;
                            for (let i = 1; i < draftPosts.length; i++) {
                                appendThreadPostInput(draftPosts[i], false);
                            }
                        }
                        if (d.langs && d.langs.length > 0 && postLanguageInput) {
                            postLanguageInput.value = d.langs[0];
                        }
                        if (d.selfLabels) {
                            document.querySelectorAll<HTMLInputElement>('.post-self-label').forEach(cb => {
                                cb.checked = d.selfLabels?.includes(cb.value) === true;
                            });
                        }
                        const disableQuotesInput = document.getElementById('post-disable-quotes') as HTMLInputElement | null;
                        if (disableQuotesInput) {
                            disableQuotesInput.checked = d.disableQuotes === true;
                        }
                        container.classList.add('hidden');
                        announceAssertive(i18n.t('sec2.loadDraft'));
                    });
                    const btnDel = document.createElement('button');
                    btnDel.type = 'button';
                    btnDel.textContent = i18n.t('sec2.deleteDraft');
                    btnDel.addEventListener('click', async () => {
                        try {
                            await window.go.services.PostBuilderService.DeleteDraft(d.id);
                            if (currentEditingDraftId === d.id) {
                                currentEditingDraftId = null;
                            }
                            row.remove();
                            announceAssertive(i18n.t('sec2.draftDeleted'));
                        } catch (err: unknown) {
                            announceAssertive(i18n.t('post.error', { error: String(err) }));
                        }
                    });
                    actions.appendChild(btnLoad);
                    actions.appendChild(btnDel);
                    row.appendChild(span);
                    row.appendChild(actions);
                    container.appendChild(row);
                });
            } catch (err: unknown) {
                container.innerHTML = `<p>${esc(String(err))}</p>`;
            }
        });
    }

    const postTextInput = document.getElementById('post-text') as HTMLTextAreaElement;
    if (postTextInput) {
        mainMentionAutocomplete = new MentionAutocomplete(postTextInput);
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
            const val = (e.target as HTMLSelectElement).value;
            localStorage.setItem('postThreadgate', val);
            const tgListContainer = document.getElementById('threadgate-list-container');
            if (tgListContainer) {
                if (val === 'list') {
                    tgListContainer.classList.remove('hidden');
                    loadUserListsForThreadgate();
                } else {
                    tgListContainer.classList.add('hidden');
                }
            }
        });
    }

    const btnAddPost = document.getElementById('btn-add-thread-post') as HTMLButtonElement;
    postCount = 1;
    if (btnAddPost) {
        btnAddPost.addEventListener('click', () => {
            appendThreadPostInput("", true);
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
              const linkState = (ta as unknown as { _linkState?: PostLinkState })._linkState;
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
                  const msg = i18n.t('compose.altMissing');
                  announceAssertive(msg);
                  alert(msg);
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
                      const msg = i18n.t('compose.mediaAltMissing');
                      announceAssertive(msg);
                      alert(msg);
                      vAltInput.focus();
                      return;
                  }
              }
          }
          
          const language = postLanguageInput ? postLanguageInput.value : "";
          const rawGate = postThreadgateInput && !postThreadgateInput.disabled ? (postThreadgateInput.value || "everyone") : "everyone";
          const normalizedGate = rawGate === "everybody" ? "everyone" : rawGate;
          const selectedListUri = (document.getElementById('post-threadgate-list') as HTMLSelectElement)?.value || "";
          const listUris = (normalizedGate === 'list' && selectedListUri) ? [selectedListUri] : [];
          const selfLabels: string[] = [];
          document.querySelectorAll<HTMLInputElement>('.post-self-label:checked').forEach(cb => selfLabels.push(cb.value));
          const disableQuotes = (document.getElementById('post-disable-quotes') as HTMLInputElement | null)?.checked === true;
          const threadgate = disableQuotes
              ? (normalizedGate === 'everyone' ? 'disable_quotes' : `${normalizedGate},disable_quotes`)
              : normalizedGate;
          
          const imageSources = selectedImages.length > 0 ? selectedImages : [];
          const videoPath = selectedVideo;

          // Pré-validação de todos os posts da thread antes de enviar qualquer requisição
          for (let i = 0; i < postItems.length; i++) {
              const item = postItems[i];
              const isFirstPost = i === 0;
              const hasMedia = isFirstPost && (selectedImages.length > 0 || selectedVideo !== "" || selectedGifUrl !== "");

              if (item.text.trim() === "" && !hasMedia) {
                  const errorMsg = postItems.length > 1
                      ? i18n.t('compose.emptyThreadPost', { count: (i + 1).toString() })
                      : i18n.t('compose.emptyPost');
                  announceAssertive(errorMsg);
                  alert(errorMsg);
                  if (isFirstPost) {
                      postTextInput.focus();
                  } else {
                      additionalTextareas[i - 1]?.focus();
                  }
                  return;
              }

              const graphemeLen = countGraphemes(item.text);
              if (graphemeLen > 300) {
                  const errorMsg = postItems.length > 1
                      ? i18n.t('compose.tooLongThreadPost', { count: (i + 1).toString(), length: graphemeLen.toString() })
                      : i18n.t('compose.tooLongPost', { length: graphemeLen.toString() });
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
          const originalSubmitText = btnSubmit ? btnSubmit.textContent || i18n.t('compose.submit') : i18n.t('compose.submit');
          if (btnSubmit) btnSubmit.disabled = true;
          if (btnAddPost) btnAddPost.disabled = true;

          let offVideoProgress: (() => void) | null = null;
          let lastVideoAnnounceKey = '';
          if ((videoPath !== "" || selectedGifUrl !== "") && window.runtime?.EventsOn) {
              if (btnSubmit) btnSubmit.textContent = i18n.t('compose.videoUploading');
              offVideoProgress = window.runtime.EventsOn('video_upload_progress', (data: { state?: string; progress?: number }) => {
                  const st = data?.state || '';
                  const prog = typeof data?.progress === 'number' ? data.progress : 0;
                  let statusMsg = '';
                  if (st === 'UPLOADING') {
                      statusMsg = i18n.t('compose.videoUploading');
                  } else if (st === 'INDEXING' || st === 'JOB_STATE_COMPLETED') {
                      statusMsg = i18n.t('compose.videoIndexing');
                  } else {
                      statusMsg = i18n.t('compose.videoProcessing', { progress: String(prog) });
                  }
                  if (btnSubmit && statusMsg) {
                      btnSubmit.textContent = statusMsg;
                  }
                  const announceKey = st === 'UPLOADING' || st === 'INDEXING' || st === 'JOB_STATE_COMPLETED' ? st : `${st}:${Math.floor(prog / 25)}`;
                  if (statusMsg && announceKey !== lastVideoAnnounceKey) {
                      lastVideoAnnounceKey = announceKey;
                      announcePolite(statusMsg);
                  }
              });
          }

          announcePolite(postItems.length > 1 ? i18n.t('compose.publishingMultiple', { count: postItems.length.toString() }) : i18n.t('compose.publishingSingle'));
          try {
            const progress = threadProgress ?? {
                sent: 0,
                replyUri: state.composeTarget?.uri || "",
                replyCid: state.composeTarget?.cid || "",
                rootUri: "",
                rootCid: "",
            };

            for (let i = progress.sent; i < postItems.length; i++) {
                let res;
                const item = postItems[i];
                const pPaths = i === 0 ? imageSources : [];
                const pAlts = i === 0 ? alts : [];
                const pVid = i === 0 ? videoPath : "";
                const pVidAlt = i === 0 ? vAlt : "";
                const pLink = item.linkUrl;
                const pLang = language;
                const pThreadgate = i === 0 ? threadgate : "everyone";
                const pGifUrl = i === 0 ? selectedGifUrl : "";
                const pVidWidth = i === 0 ? selectedVideoWidth : 0;
                const pVidHeight = i === 0 ? selectedVideoHeight : 0;
                const pListUris = i === 0 ? listUris : [];
                const pLabels = i === 0 ? selfLabels : [];
                const pCaption = i === 0 ? selectedCaptionPath : "";
                const pCaptionLang = language || 'pt';

                if (state.composeMode === 'quote' && i === 0 && state.composeTarget) {
                    res = await window.go.services.PostBuilderService.QuotePost(item.text, state.composeTarget.uri, state.composeTarget.cid, pPaths, pAlts, pVid, pVidAlt, pLang, pThreadgate, pGifUrl, pVidWidth, pVidHeight, pListUris, pLabels, pCaption, pCaptionLang);
                } else {
                    res = await window.go.services.PostBuilderService.CreatePost(item.text, progress.replyUri, progress.replyCid, progress.rootUri, progress.rootCid, pPaths, pAlts, pVid, pVidAlt, pLink, pLang, pThreadgate, pGifUrl, pVidWidth, pVidHeight, pListUris, pLabels, pCaption, pCaptionLang);
                }

                if (!res || !res.uri || !res.cid) {
                    throw new Error(i18n.t('compose.threadRefMissing', { count: (i + 1).toString() }));
                }
                progress.sent = i + 1;
                progress.replyUri = res.uri;
                progress.replyCid = res.cid;
                if (!progress.rootUri) {
                    progress.rootUri = res.rootUri || res.uri;
                    progress.rootCid = res.rootCid || res.cid;
                }
                threadProgress = progress;
                if (res.warning) {
                    const warning = translateError(res.warning);
                    announceAssertive(warning);
                    alert(warning);
                }

                if (postItems.length > 1) {
                    announcePolite(i18n.t('compose.sendingOf', { current: (i + 1).toString(), total: postItems.length.toString() }));
                }
            }
            
            threadProgress = null;
            announceAssertive(postItems.length > 1 ? i18n.t('compose.threadSuccess') : i18n.t('compose.postSuccess'));
            forceCloseComposeModal();
            if (state.currentTab !== 'notifications') {
                reloadCurrentTab();
            }
          } catch (err: unknown) {
            console.error("Error publishing post:", err);
            const msg = i18n.t('compose.publishError') + translateError(err);
            announceAssertive(msg);
            alert(msg);
          } finally {
            if (offVideoProgress) {
                offVideoProgress();
            }
            if (btnSubmit) {
                btnSubmit.disabled = false;
                btnSubmit.textContent = originalSubmitText;
            }
            if (btnAddPost) btnAddPost.disabled = false;
          }
        });
    }
}
