import Hls from 'hls.js';
import { linkify } from '../utils/helpers';
import { formatPostDate } from '../utils/format';
import { announcePolite, announceAssertive, getPostAccessibleLabel, formatAuthor } from '../utils/a11y';
import { confirmDialog } from '../utils/dialog';
import { state } from '../config/state';
// TODO: extract openComposeModal to controllers/compose
import { openComposeModal } from '../controllers/compose';

export function createPostArticle(post: any, index: number, isNotification = false, notifReason = ""): HTMLElement {
  const article = document.createElement('article');
  article.setAttribute('role', 'article');
  article.setAttribute('tabindex', '0');
  article.classList.add('post-item');
  article.dataset.uri = post.uri;
  article.dataset.cid = post.cid;
  article.dataset.index = index.toString();
  article.dataset.createdAt = post.createdAt || post.indexedAt || "";
  
  let srMetrics = `Respostas: ${post.replyCount || 0}, Reposts: ${post.repostCount || 0}, Curtidas: ${post.likeCount || 0}`;
  let fullText = post.text ? `${post.text}` : "";
  article.dataset.text = fullText;
  article.dataset.metrics = srMetrics;
  article.dataset.viewerRepost = post.viewerRepost || "";
  if (isNotification && notifReason) {
      article.dataset.notifReason = notifReason;
  }
 
  article.dataset.author = post.authorName || post.authorHandle;
  article.dataset.authorName = post.authorName || post.authorHandle;
  article.dataset.authorHandle = post.authorHandle;
  article.dataset.authorDid = post.authorDid;
  article.dataset.viewerLike = post.viewerLike || "";
  article.dataset.viewerBookmark = post.viewerBookmark || "";
  article.dataset.notifReason = notifReason;

  let replyContext = "";
  if (post.isReply && post.replyToAuthor) {
    article.dataset.replyTo = post.replyToAuthor;
    const isDidReply = post.replyToAuthor.startsWith('did:');
    const isDidRoot = post.rootAuthor ? post.rootAuthor.startsWith('did:') : false;
    if (!isDidReply) {
      if (post.rootAuthor && !isDidRoot && post.rootAuthor !== post.replyToAuthor && post.rootAuthor !== state.currentHandle) {
          replyContext = `<div class="reply-context"><small>Em resposta a @${post.replyToAuthor} (thread de @${post.rootAuthor}):</small></div>`;
          article.dataset.rootAuthor = post.rootAuthor;
      } else {
          replyContext = `<div class="reply-context"><small>Em resposta a @${post.replyToAuthor}:</small></div>`;
      }
    }
  }

  let repostContext = "";
  if (post.repostedBy) {
    article.dataset.repostedBy = post.repostedBy;
    repostContext = `<div class="repost-context"><small>Repostado por ${post.repostedBy}</small></div>`;
  }

  let altsContext = "";
  if (post.imageAlts && post.imageAlts.length > 0) {
      article.dataset.hasImage = "true";
      article.dataset.alts = post.imageAlts.join(" | ");
      altsContext = `<div class="post-alts"><small><strong>Descrição das imagens:</strong> ${post.imageAlts.join(" | ")}</small></div>`;
  }

  let imagesHtml = "";
  if (post.images && post.images.length > 0) {
      const count = post.images.length;
      const layoutClass = count === 1 ? 'single-image' : (count === 2 ? 'two-images' : (count === 3 ? 'three-images' : 'four-images'));
      const imgElements = post.images.map((img: any) => {
          const src = img.thumb || img.fullsize;
          const alt = img.alt || 'Imagem anexada à publicação';
          return `<div class="post-image-item">
            <a href="${img.fullsize || src}" target="_blank" rel="noopener noreferrer" class="post-image-link" aria-label="Abrir imagem em tamanho real: ${alt}">
              <img src="${src}" alt="${alt}" loading="lazy" class="post-image-img" />
            </a>
          </div>`;
      }).join('');
      imagesHtml = `<div class="post-images-grid ${layoutClass}" aria-label="Galeria de imagens anexadas">${imgElements}</div>`;
  }

  let quoteContext = "";
  if (post.quotePost) {
    article.dataset.quoteAuthorHandle = post.quotePost.authorHandle;
    article.dataset.quoteText = post.quotePost.text || "";
    article.dataset.quoteUri = post.quotePost.uri;
    article.dataset.quoteCid = post.quotePost.cid;
    if (post.quotePost.imageAlts && post.quotePost.imageAlts.length > 0) {
      article.dataset.quoteImageAlts = post.quotePost.imageAlts.join(" | ");
    }
    if (post.quotePost.video) {
      article.dataset.hasVideo = "true";
      article.dataset.quoteVideoAlt = post.quotePost.video.alt || "";
    }
    if (post.quotePost.external) {
      article.dataset.quoteExternalTitle = post.quotePost.external.title || post.quotePost.external.uri;
      article.dataset.quoteExternalDesc = post.quotePost.external.description || "";
    }

    let quoteMediaHtml = "";
    if (post.quotePost.images && post.quotePost.images.length > 0) {
      const count = post.quotePost.images.length;
      const layoutClass = count === 1 ? 'single-image' : 'two-images';
      const qImgElements = post.quotePost.images.map((img: any) => {
        const src = img.thumb || img.fullsize;
        const alt = img.alt || 'Imagem do post citado';
        return `<div class="post-image-item">
          <a href="${img.fullsize || src}" target="_blank" rel="noopener noreferrer" class="post-image-link" aria-label="Abrir imagem em tamanho real: ${alt}">
            <img src="${src}" alt="${alt}" loading="lazy" class="post-image-img" />
          </a>
        </div>`;
      }).join('');
      quoteMediaHtml += `<div class="post-images-grid ${layoutClass}" style="margin-top: 8px;">${qImgElements}</div>`;
    }
    if (post.quotePost.imageAlts && post.quotePost.imageAlts.length > 0) {
      quoteMediaHtml += `<div class="post-alts"><small><strong>Imagens do post citado:</strong> ${post.quotePost.imageAlts.join(" | ")}</small></div>`;
    }
    if (post.quotePost.video) {
      const isGif = post.quotePost.video.presentation === 'gif';
      const altText = post.quotePost.video.alt || "Sem descrição alternativa";
      const posterAttr = post.quotePost.video.thumbnail ? `poster="${post.quotePost.video.thumbnail}"` : '';
      quoteMediaHtml += `
        <div class="video-context quoted-video-context" style="margin-top: 10px;">
          <video class="post-video quoted-post-video" ${isGif ? 'autoplay loop muted playsinline' : 'controls'} ${posterAttr}>
              Seu navegador não suporta vídeos.
          </video>
          <div class="post-video-alts" style="margin-top: 4px;"><small><strong>Vídeo no post citado:</strong> ${altText}</small></div>
        </div>
      `;
    }
    if (post.quotePost.external) {
      quoteMediaHtml += `<div class="external-card" style="border:1px solid #ddd;padding:6px;margin-top:6px;border-radius:4px;font-size:0.85em;">
        <strong>${post.quotePost.external.title || post.quotePost.external.uri}</strong>
        ${post.quotePost.external.description ? `<p style="margin:2px 0 0 0;">${post.quotePost.external.description}</p>` : ""}
      </div>`;
    }

    quoteContext = `
      <div class="quote-context" style="border: 1px solid #ccc; padding: 10px; margin-top: 10px; border-radius: 5px;">
        <header>
          <strong>${post.quotePost.authorName || post.quotePost.authorHandle}</strong>
          <span>@${post.quotePost.authorHandle}</span>
        </header>
        <div class="post-content">
          <p>${post.quotePost.text || (post.quotePost.hasMedia ? "Mídia anexada" : "Conteúdo não disponível")}</p>
          ${quoteMediaHtml}
        </div>
      </div>
    `;
  }


  let notifContext = "";
  if (isNotification) {
    let tReason = notifReason;
    if (notifReason === 'repost') {
      const isRepostOfRepost = post.text && post.text.includes('sua repostagem');
      tReason = isRepostOfRepost ? 'repostou sua repostagem' : 'repostou seu post';
    }
    else if (notifReason === 'like') tReason = 'curtiu seu post';
    else if (notifReason === 'reply') tReason = 'respondeu seu post';
    else if (notifReason === 'quote') tReason = 'citou seu post';
    else if (notifReason === 'mention') tReason = 'mencionou você';
    else if (notifReason === 'follow') tReason = 'começou a seguir você';
    notifContext = `<div class="notif-context" aria-hidden="true"><strong>Nova notificação: ${tReason}</strong></div>`;
  }

  let externalContext = "";
  if (post.external) {
    article.dataset.externalUrl = post.external.uri || "";
    article.dataset.externalTitle = post.external.title || post.external.uri || "";
    article.dataset.externalDescription = post.external.description || "";
    
    externalContext = `
      <div class="external-card" style="border: 1px solid #ddd; padding: 8px; margin-top: 8px; border-radius: 4px;">
        ${post.external.thumb ? `<img src="${post.external.thumb}" alt="Thumbnail do link" style="max-height: 120px; max-width: 100%; object-fit: cover; display: block; margin-bottom: 6px; border-radius: 4px;" />` : ''}
        <strong><a href="${post.external.uri}" target="_blank" rel="noopener noreferrer">${post.external.title || post.external.uri}</a></strong>
        ${post.external.description ? `<p style="font-size: 0.85em; margin: 4px 0 0 0; color: var(--text-muted, #666);">${post.external.description}</p>` : ''}
      </div>
    `;
  }
  
  let videoContext = "";
  if (post.video) {
    const isGif = post.video.presentation === 'gif';
    article.dataset.hasVideo = 'true';
    article.dataset.videoPlaylist = post.video.playlist;
    if (post.video.alt) article.dataset.videoAlt = post.video.alt;
    const posterAttr = post.video.thumbnail ? `poster="${post.video.thumbnail}"` : '';
    
    videoContext = `
      <div class="video-context" style="margin-top: 10px;">
        <video class="post-video" ${isGif ? 'autoplay loop muted playsinline' : 'controls playsinline preload="metadata"'} ${posterAttr}>
            Seu navegador não suporta vídeos.
        </video>
        <div class="post-video-alts" style="margin-top: 4px;"><small><strong>Vídeo anexado:</strong> ${post.video.alt ? post.video.alt : 'Sem descrição alternativa'}</small></div>
      </div>
    `;
  }
  
  let footerHtml = "";
  let likeBtnLabel = post.viewerLike ? `Descurtir (L)` : `Curtir (L)`;
  let repostBtnLabel = post.viewerRepost ? `Desfazer Repost (T)` : `Repost (T)`;
  let bookmarkBtnLabel = post.viewerBookmark ? `Salvo (Shift+S)` : `Salvar (Shift+S)`;
  const isOwner = (post.authorHandle === state.loggedInHandle) || (post.authorDid === state.loggedInHandle) || (post.authorName === state.loggedInHandle);
  if (!isNotification || !['like', 'repost', 'follow'].includes(notifReason)) {
    footerHtml = `
    <div class="post-metrics" aria-label="Métricas do post">
      <div class="metric-item metric-replies" aria-label="${post.replyCount || 0} respostas">${post.replyCount || 0} Respostas</div>
      <div class="metric-item metric-reposts" aria-label="${post.repostCount || 0} reposts">${post.repostCount || 0} Reposts</div>
      <div class="metric-item metric-likes" aria-label="${post.likeCount || 0} curtidas">${post.likeCount || 0} Curtidas</div>
    </div>
    <footer aria-label="Ações do post">
      <button class="btn-reply" aria-label="Responder a ${post.authorHandle}">Responder (R)</button>
      <button class="btn-repost" aria-label="${post.viewerRepost ? 'Desfazer Repost' : 'Repostar'}">${repostBtnLabel}</button>
      <button class="btn-quote" aria-label="Citar">Citar (Q)</button>
      <button class="btn-like" aria-label="${post.viewerLike ? 'Descurtir' : 'Curtir'}">${likeBtnLabel}</button>
      <button class="btn-bookmark" aria-label="${post.viewerBookmark ? 'Remover dos Salvos' : 'Salvar Publicação'}">${bookmarkBtnLabel}</button>
      <button class="btn-mute-thread" aria-label="Mutar conversa">Mutar Thread (Shift+M)</button>
      <button class="btn-report-post" aria-label="Denunciar publicação">Denunciar (Alt+D)</button>
      ${post.isReply ? '<button class="btn-hide-reply" aria-label="Ocultar resposta">Ocultar (Alt+H)</button>' : ''}
      ${isOwner ? '<button class="btn-pin-post" aria-label="Fixar publicação">Fixar (Shift+F)</button>' : ''}
      ${isOwner ? '<button class="btn-delete-post" aria-label="Excluir publicação">Excluir (X)</button>' : ''}
    </footer>`;
  }

  let postHasMutedWord = false;
  let triggeredMutedWord = "";
  if (post.text) {
      const lowerText = post.text.toLowerCase();
      const cache = state.mutedWordsCache || [];
      for (const word of cache) {
          if (lowerText.includes(word.toLowerCase())) {
              postHasMutedWord = true;
              triggeredMutedWord = word;
              break;
          }
      }
  }

  article.querySelector('.btn-mute-thread')?.addEventListener('click', async (e) => {
    e.stopPropagation();
    const uri = article.dataset.uri;
    if (!uri) return;
    try {
      announcePolite("Mutando thread...");
      await window.go.services.ModerationService.MuteThread(uri);
      announceAssertive("Thread mutada com sucesso.");
    } catch (err: any) {
      announceAssertive("Erro ao mutar thread: " + err);
    }
  });

  article.querySelector('.btn-report-post')?.addEventListener('click', async (e) => {
    e.stopPropagation();
    const uri = article.dataset.uri;
    const cid = article.dataset.cid;
    if (!uri || !cid) return;
    const { promptDialog } = await import('../utils/dialog');
    const reason = await promptDialog("Motivo da denúncia para a publicação:", "", "Denunciar Publicação");
    if (reason) {
      try {
        announcePolite("Enviando denúncia...");
        await window.go.services.ModerationService.ReportPost(uri, cid, 'com.atproto.moderation.defs#reasonOther', reason);
        announceAssertive("Denúncia enviada com sucesso.");
      } catch (err: any) {
        announceAssertive("Erro ao enviar denúncia: " + err);
      }
    }
  });

  article.querySelector('.btn-hide-reply')?.addEventListener('click', async (e) => {
    e.stopPropagation();
    const uri = article.dataset.uri;
    if (!uri) return;
    const rootUri = article.dataset.rootUri || article.dataset.replyToUri || uri;
    try {
      announcePolite("Ocultando resposta...");
      await window.go.services.PostBuilderService.HideReply(rootUri, uri);
      announceAssertive("Resposta ocultada com sucesso.");
    } catch (err: any) {
      announceAssertive("Erro ao ocultar resposta: " + err);
    }
  });

  article.querySelector('.btn-pin-post')?.addEventListener('click', async (e) => {
    e.stopPropagation();
    const uri = article.dataset.uri;
    const cid = article.dataset.cid;
    if (!uri || !cid) return;
    try {
      announcePolite("Fixando publicação...");
      await window.go.services.SocialService.PinPost(uri, cid);
      announceAssertive("Publicação fixada no seu perfil.");
    } catch (err: any) {
      announceAssertive("Erro ao fixar publicação: " + err);
    }
  });

  const formattedTime = formatPostDate(post.createdAt || post.indexedAt);
  const authorDisplay = formatAuthor(post.authorName, post.authorHandle);
  const showHandleSpan = (state.nameDisplayFormat !== 'handle') && post.authorHandle && (post.authorHandle !== authorDisplay);

  const innerHtmlContent = `
    ${notifContext}
    ${repostContext}
    ${replyContext}
    <header>
      <strong>${authorDisplay}</strong>
      ${showHandleSpan ? `<span>@${post.authorHandle}</span>` : ''}
      <small>${formattedTime}</small>
    </header>
    <div class="post-content">
      <p>${post.text ? linkify(post.text) : (post.hasMedia ? "Mídia anexada" : (post.quotePost ? "Postagem citada" : "Conteúdo não disponível"))}</p>
      ${imagesHtml}
      ${altsContext}
      ${quoteContext}
      ${videoContext}
      ${externalContext}
    </div>
    ${footerHtml}
  `;

  if (postHasMutedWord) {
      article.innerHTML = `
        <div class="muted-warning" style="padding: 15px; background: #fff3cd; color: #856404; border-radius: 5px; text-align: center;">
            <p>Post ocultado por conter uma palavra silenciada (${triggeredMutedWord}).</p>
            <button class="btn-show-muted" style="background: transparent; border: 1px solid #856404; color: #856404; padding: 5px 10px; border-radius: 3px; cursor: pointer;">Mostrar mesmo assim</button>
        </div>
        <div class="muted-content" style="display: none;">
            ${innerHtmlContent}
        </div>
      `;
      setTimeout(() => {
          article.querySelector('.btn-show-muted')?.addEventListener('click', (e) => {
              e.stopPropagation();
              const contentDiv = article.querySelector('.muted-content') as HTMLElement;
              const warningDiv = article.querySelector('.muted-warning') as HTMLElement;
              if (contentDiv) contentDiv.style.display = 'block';
              if (warningDiv) warningDiv.style.display = 'none';
              announcePolite("Conteúdo exibido.");
          });
      }, 0);
  } else {
      article.innerHTML = innerHtmlContent;
  }
  
  // HLS binding
  if (post.video) {
     const vid = (article.querySelector('.root-post-video') || article.querySelector('.post-video:not(.quoted-post-video)')) as HTMLVideoElement;
     if (vid && post.video.playlist) {
         if (Hls.isSupported()) {
             const hls = new Hls();
             hls.loadSource(post.video.playlist);
             hls.attachMedia(vid);
         } else if (vid.canPlayType('application/vnd.apple.mpegurl')) {
             vid.src = post.video.playlist;
         }
     }
  }

  if (post.quotePost && post.quotePost.video) {
     const qVid = article.querySelector('.quoted-post-video') as HTMLVideoElement;
     if (qVid && post.quotePost.video.playlist) {
         if (Hls.isSupported()) {
             const hls = new Hls();
             hls.loadSource(post.quotePost.video.playlist);
             hls.attachMedia(qVid);
         } else if (qVid.canPlayType('application/vnd.apple.mpegurl')) {
             qVid.src = post.quotePost.video.playlist;
         }
     }
  }

  // Interactions
  article.querySelector('.btn-like')?.addEventListener('click', async (e) => {
    e.stopPropagation();
    try {
        const likeMetric = article.querySelector('.metric-likes');
        let count = post.likeCount || 0;
        if (article.dataset.viewerLike) {
            await window.go.services.PostBuilderService.UnlikePost(article.dataset.viewerLike);
            announceAssertive("Descurtido com sucesso");
            article.dataset.viewerLike = "";
            const btn = article.querySelector('.btn-like');
            if (btn) btn.textContent = "Curtir (L)";
            count = Math.max(0, count - 1);
            post.likeCount = count;
            if (likeMetric) likeMetric.textContent = `${count} Curtidas`;
        } else {
            const res = await window.go.services.PostBuilderService.LikePost(post.uri, post.cid);
            announceAssertive("Curtido com sucesso");
            article.dataset.viewerLike = res;
            const btn = article.querySelector('.btn-like');
            if (btn) btn.textContent = "Descurtir (L)";
            count += 1;
            post.likeCount = count;
            if (likeMetric) likeMetric.textContent = `${count} Curtidas`;
        }
    } catch(err) { announceAssertive("Erro: " + err); }
  });
  
  article.querySelector('.btn-repost')?.addEventListener('click', async (e) => {
    e.stopPropagation();
    try {
        const repostMetric = article.querySelector('.metric-reposts');
        let count = post.repostCount || 0;
        if (article.dataset.viewerRepost) {
            announcePolite("Desfazendo repost...");
            await window.go.services.PostBuilderService.DeleteRepost(article.dataset.viewerRepost);
            announceAssertive("Repost desfeito com sucesso");
            article.dataset.viewerRepost = "";
            const btn = article.querySelector('.btn-repost');
            if (btn) btn.textContent = "Repost (T)";
            count = Math.max(0, count - 1);
            post.repostCount = count;
            if (repostMetric) repostMetric.textContent = `${count} Reposts`;
        } else {
            announcePolite("Repostando...");
            const res = await window.go.services.PostBuilderService.Repost(post.uri, post.cid);
            announceAssertive("Repostado com sucesso");
            article.dataset.viewerRepost = res || "reposted";
            const btn = article.querySelector('.btn-repost');
            if (btn) btn.textContent = "Desfazer Repost (T)";
            count += 1;
            post.repostCount = count;
            if (repostMetric) repostMetric.textContent = `${count} Reposts`;
        }
    } catch(err) { announceAssertive("Erro: " + err); }
  });

  article.querySelector('.btn-reply')?.addEventListener('click', (e) => {
    e.stopPropagation();
    openComposeModal('reply', {uri: post.uri, cid: post.cid, authorHandle: post.authorHandle});
  });

  article.querySelector('.btn-quote')?.addEventListener('click', (e) => {
    e.stopPropagation();
    openComposeModal('quote', {uri: post.uri, cid: post.cid, authorHandle: post.authorHandle});
  });

  article.querySelector('.btn-bookmark')?.addEventListener('click', async (e) => {
    e.stopPropagation();
    try {
        if (article.dataset.viewerBookmark) {
            announcePolite("Removendo dos salvos...");
            await (window as any).go.services.PostBuilderService.UnbookmarkPost(article.dataset.viewerBookmark, post.uri);
            announceAssertive("Post removido dos salvos");
            article.dataset.viewerBookmark = "";
            const btn = article.querySelector('.btn-bookmark') as HTMLButtonElement;
            if (btn) btn.textContent = "Salvar (Shift+S)";
        } else {
            announcePolite("Salvando post...");
            const res = await (window as any).go.services.PostBuilderService.BookmarkPost(post.uri, post.cid);
            announceAssertive("Post salvo com sucesso");
            article.dataset.viewerBookmark = res || "bookmarked";
            const btn = article.querySelector('.btn-bookmark') as HTMLButtonElement;
            if (btn) btn.textContent = "Salvo (Shift+S)";
        }
    } catch(err) { announceAssertive("Erro ao alterar salvos: " + err); }
  });

  article.querySelector('.btn-delete-post')?.addEventListener('click', (e) => {
    e.stopPropagation();
    const uri = article.dataset.uri;
    if (!uri) return;
    confirmDialog("Deseja realmente excluir esta publicação?", "Excluir Publicação").then(async (confirmed) => {
      if (confirmed) {
        announcePolite("Excluindo publicação...");
        try {
          await window.go.services.PostBuilderService.DeletePost(uri);
          announceAssertive("Publicação excluída com sucesso.");
          article.remove();
          const idx = state.currentPosts.indexOf(article);
          if (idx !== -1) {
            state.currentPosts.splice(idx, 1);
            if (state.focusedPostIndex >= state.currentPosts.length) {
              state.focusedPostIndex = state.currentPosts.length - 1;
            }
            if (state.focusedPostIndex >= 0 && state.currentPosts[state.focusedPostIndex]) {
              state.currentPosts[state.focusedPostIndex].focus();
            }
          }
        } catch (err: any) {
          announceAssertive("Erro ao excluir publicação: " + err);
        }
      }
    });
  });
  
  // Interactions
  article.addEventListener('focus', () => {
      const idxStr = article.dataset.index;
      if (idxStr !== undefined) state.focusedPostIndex = parseInt(idxStr, 10);
  });
  
  article.addEventListener('focus', () => {
      const idx = parseInt(article.dataset.index || "-1");
      if (!isNaN(idx) && idx >= 0) {
          state.focusedPostIndex = idx;
      }
  });

  article.setAttribute('aria-label', getPostAccessibleLabel(article));
  return article;
}
