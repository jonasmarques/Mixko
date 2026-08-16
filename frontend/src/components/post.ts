import Hls from 'hls.js';
import { linkify, esc, escUrl } from '../utils/helpers';
import { formatPostDate } from '../utils/format';
import { announcePolite, announceAssertive, getPostAccessibleLabel, formatAuthor } from '../utils/a11y';
import { confirmDialog } from '../utils/dialog';
import { state } from '../config/state';
import type { PostView, ImageDTO } from '../types/dto';
// TODO: extract openComposeModal to controllers/compose
import { openComposeModal } from '../controllers/compose';
import { i18n } from '../utils/i18n';

/** Notification reasons that carry no post, so reply/like counts are meaningless. */
const POSTLESS_NOTIF_REASONS = ['follow', 'starterpack-joined', 'verified', 'unverified', 'contact-match'];

/** Reasons rendered as a plain record of what someone did, with no post to act on. */
const ACTIONLESS_NOTIF_REASONS = [...POSTLESS_NOTIF_REASONS, 'like', 'repost', 'like-via-repost', 'repost-via-repost'];

/**
 * Joins image descriptions for display, substituting a translated placeholder
 * for images the author left undescribed.
 */
function formatAltList(alts: string[]): string {
  return alts.map(alt => alt && alt.trim() !== '' ? alt : i18n.t('post.noImageDescription')).join(' | ');
}

/**
 * Live HLS players, keyed by the video element they drive.
 *
 * Switching tabs or reloading a feed replaces whole subtrees of the DOM. Any
 * player left attached to a discarded element keeps its buffers and network
 * requests alive, so they are tracked here and disposed of once their element
 * is gone.
 */
const activePlayers = new Map<HTMLVideoElement, Hls>();

/** One observer for all players; one per video would be far more expensive. */
let playerObserver: MutationObserver | null = null;

function reapDetachedPlayers(): void {
  for (const [video, hls] of activePlayers) {
    if (!video.isConnected) {
      hls.destroy();
      activePlayers.delete(video);
    }
  }

  if (activePlayers.size === 0 && playerObserver) {
    playerObserver.disconnect();
    playerObserver = null;
  }
}

/** Attaches an HLS stream and registers the player for cleanup. */
function attachHlsStream(video: HTMLVideoElement, playlist: string): void {
  if (!Hls.isSupported()) {
    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = playlist;
    }
    return;
  }

  const hls = new Hls();
  hls.loadSource(playlist);
  hls.attachMedia(video);
  activePlayers.set(video, hls);

  if (!playerObserver) {
    playerObserver = new MutationObserver(reapDetachedPlayers);
    playerObserver.observe(document.body, { childList: true, subtree: true });
  }
}

export function createPostArticle(post: PostView, index: number, isNotification = false, notifReason = ""): HTMLElement {
  const article = document.createElement('article');
  article.setAttribute('role', 'article');
  article.setAttribute('tabindex', '0');
  article.classList.add('post-item');
  article.dataset.uri = post.uri;
  article.dataset.cid = post.cid;
  article.dataset.index = index.toString();
  article.dataset.createdAt = post.createdAt || post.indexedAt || "";
  
  let srMetrics = i18n.t('post.metricsReplies', { replies: (post.replyCount || 0).toString(), reposts: (post.repostCount || 0).toString(), likes: (post.likeCount || 0).toString() });
  article.dataset.metrics = srMetrics;
  let fullText = post.text ? `${post.text}` : "";
  article.dataset.text = fullText;
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
          replyContext = `<div class="reply-context"><small>${esc(i18n.t('post.inReplyTo', { handle: post.replyToAuthor }))} (${esc(i18n.t('post.threadOf', { handle: post.rootAuthor }))}):</small></div>`;
          article.dataset.rootAuthor = post.rootAuthor;
      } else {
          replyContext = `<div class="reply-context"><small>${esc(i18n.t('post.inReplyTo', { handle: post.replyToAuthor }))}:</small></div>`;
      }
    }
  }

  let repostContext = "";
  if (post.repostedBy) {
    article.dataset.repostedBy = post.repostedBy;
    if (post.repostedByHandle) {
      article.dataset.repostedByHandle = post.repostedByHandle;
    }
    repostContext = `<div class="repost-context"><small>${esc(i18n.t('post.repostedBy', { handle: post.repostedBy }))}</small></div>`;
  }

  let altsContext = "";
  if (post.imageAlts && post.imageAlts.length > 0) {
      article.dataset.hasImage = "true";
      article.dataset.alts = post.imageAlts.join(" | ");
      altsContext = `<div class="post-alts"><small><strong>${i18n.t('post.imagesTitle')}</strong> ${esc(formatAltList(post.imageAlts))}</small></div>`;
  }

  let imagesHtml = "";
  if (post.images && post.images.length > 0) {
      const count = post.images.length;
      const layoutClass = count === 1 ? 'single-image' : (count === 2 ? 'two-images' : (count === 3 ? 'three-images' : 'four-images'));
      const imgElements = post.images.map((img: ImageDTO) => {
          const src = img.thumb || img.fullsize;
          const alt = img.alt || i18n.t('post.attachedImageAlt');
          return `<div class="post-image-item">
            <a href="${escUrl(img.fullsize || src)}" target="_blank" rel="noopener noreferrer" class="post-image-link" aria-label="${esc(i18n.t('post.openFullImage', { alt }))}">
              <img src="${escUrl(src)}" alt="${esc(alt)}" loading="lazy" class="post-image-img" />
            </a>
          </div>`;
      }).join('');
      imagesHtml = `<div class="post-images-grid ${layoutClass}" aria-label="${i18n.t('post.imageGalleryAria')}">${imgElements}</div>`;
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
      article.dataset.hasQuoteVideo = "true";
      if (post.quotePost.video.presentation === 'gif') {
          article.dataset.quoteVideoIsGif = "true";
      }
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
      const qImgElements = post.quotePost.images.map((img: ImageDTO) => {
        const src = img.thumb || img.fullsize;
        const alt = img.alt || i18n.t('post.quoteImageAlt');
        return `<div class="post-image-item">
          <a href="${escUrl(img.fullsize || src)}" target="_blank" rel="noopener noreferrer" class="post-image-link" aria-label="${esc(i18n.t('post.openFullImage', { alt }))}">
            <img src="${escUrl(src)}" alt="${esc(alt)}" loading="lazy" class="post-image-img" />
          </a>
        </div>`;
      }).join('');
      quoteMediaHtml += `<div class="post-images-grid ${layoutClass}" style="margin-top: 8px;">${qImgElements}</div>`;
    }
    if (post.quotePost.imageAlts && post.quotePost.imageAlts.length > 0) {
      quoteMediaHtml += `<div class="post-alts"><small><strong>${i18n.t('post.imagesTitle')}</strong> ${esc(formatAltList(post.quotePost.imageAlts))}</small></div>`;
    }
    if (post.quotePost.video) {
      const isGif = post.quotePost.video.presentation === 'gif';
      const altText = post.quotePost.video.alt || i18n.t('post.noAlt');
      const posterAttr = post.quotePost.video.thumbnail ? `poster="${escUrl(post.quotePost.video.thumbnail)}"` : '';
      quoteMediaHtml += `
        <div class="video-context quoted-video-context" style="margin-top: 10px;">
          <video class="post-video quoted-post-video" ${isGif ? 'autoplay loop muted playsinline' : 'controls'} ${posterAttr}>
              ${i18n.t('post.videoNoSupport')}
          </video>
          <div class="post-video-alts" style="margin-top: 4px;"><small><strong>${isGif ? 'GIF:' : 'Video:'}</strong> ${esc(altText)}</small></div>
        </div>
      `;
    }
    if (post.quotePost.external) {
      quoteMediaHtml += `<div class="external-card" style="border:1px solid #ddd;padding:6px;margin-top:6px;border-radius:4px;font-size:0.85em;">
        <strong>${esc(post.quotePost.external.title || post.quotePost.external.uri)}</strong>
        ${post.quotePost.external.description ? `<p style="margin:2px 0 0 0;">${esc(post.quotePost.external.description)}</p>` : ""}
      </div>`;
    }

    quoteContext = `
      <div class="quote-context" style="border: 1px solid #ccc; padding: 10px; margin-top: 10px; border-radius: 5px;">
        <header>
          <strong>${esc(post.quotePost.authorName || post.quotePost.authorHandle)}</strong>
          <span>@${esc(post.quotePost.authorHandle)}</span>
        </header>
        <div class="post-content">
          <p>${post.quotePost.text ? linkify(post.quotePost.text) : i18n.t(post.quotePost.hasMedia ? 'post.mediaAttached' : 'post.contentNotAvailable')}</p>
          ${quoteMediaHtml}
        </div>
      </div>
    `;
  }


  let notifContext = "";
  if (isNotification) {
    // Never fall back to notifReason itself: an unmapped reason would surface
    // its raw lexicon value ("starterpack-joined") in the interface.
    let tReason = i18n.t('post.notifGeneric');
    if (notifReason === 'repost') {
      const isRepostOfRepost = Boolean(post.isRepostOfRepost);
      tReason = isRepostOfRepost ? i18n.t('post.notifRepostOfRepost') : i18n.t('post.notifRepost');
    }
    else if (notifReason === 'like') tReason = i18n.t('post.notifLike');
    else if (notifReason === 'reply') tReason = i18n.t('post.notifReply');
    else if (notifReason === 'quote') tReason = i18n.t('post.notifQuote');
    else if (notifReason === 'mention') tReason = i18n.t('post.notifMention');
    else if (notifReason === 'follow') tReason = i18n.t('post.notifFollow');
    else if (notifReason === 'repost-via-repost') tReason = i18n.t('post.notifRepostViaRepost');
    else if (notifReason === 'like-via-repost') tReason = i18n.t('post.notifLikeViaRepost');
    else if (notifReason === 'starterpack-joined') tReason = i18n.t('post.notifStarterPack');
    else if (notifReason === 'verified') tReason = i18n.t('post.notifVerified');
    else if (notifReason === 'unverified') tReason = i18n.t('post.notifUnverified');
    else if (notifReason === 'subscribed-post') tReason = i18n.t('post.notifSubscribedPost');
    else if (notifReason === 'contact-match') tReason = i18n.t('post.notifContactMatch');
    notifContext = `<div class="notif-context" aria-hidden="true"><strong>${i18n.t('post.newNotification')} ${tReason}</strong></div>`;
  }

  let externalContext = "";
  if (post.external) {
    article.dataset.externalUrl = post.external.uri || "";
    article.dataset.externalTitle = post.external.title || post.external.uri || "";
    article.dataset.externalDescription = post.external.description || "";
    
    externalContext = `
      <div class="external-card" style="border: 1px solid #ddd; padding: 8px; margin-top: 8px; border-radius: 4px;">
        ${post.external.thumb ? `<img src="${escUrl(post.external.thumb)}" alt="${esc(i18n.t('post.linkThumbAlt'))}" style="max-height: 120px; max-width: 100%; object-fit: cover; display: block; margin-bottom: 6px; border-radius: 4px;" />` : ''}
        <strong><a href="#" data-external-url="${escUrl(post.external.uri)}">${esc(post.external.title || post.external.uri)}</a></strong>
        ${post.external.description ? `<p style="font-size: 0.85em; margin: 4px 0 0 0; color: var(--text-muted, #666);">${esc(post.external.description)}</p>` : ''}
      </div>
    `;
  }
  
  let videoContext = "";
  if (post.video) {
    const isGif = post.video.presentation === 'gif';
    article.dataset.hasVideo = 'true';
    article.dataset.hasMainVideo = 'true';
    if (isGif) article.dataset.videoIsGif = 'true';
    article.dataset.videoPlaylist = post.video.playlist;
    if (post.video.alt) article.dataset.videoAlt = post.video.alt;
    const posterAttr = post.video.thumbnail ? `poster="${escUrl(post.video.thumbnail)}"` : '';
    
    videoContext = `
      <div class="video-context" style="margin-top: 10px;">
        <video class="post-video" ${isGif ? 'autoplay loop muted playsinline' : 'controls playsinline preload="metadata"'} ${posterAttr}>
            ${i18n.t('post.videoNoSupport')}
        </video>
        <div class="post-video-alts" style="margin-top: 4px;"><small><strong>${isGif ? 'GIF:' : 'Video:'}</strong> ${esc(post.video.alt || i18n.t('post.noAlt'))}</small></div>
      </div>
    `;
  }
  
  let footerHtml = "";
  let likeBtnLabel = post.viewerLike ? i18n.t('post.unlikeBtn') : i18n.t('post.likeBtn');
  let repostBtnLabel = post.viewerRepost ? i18n.t('post.undoRepostBtn') : i18n.t('post.repostBtn');
  let bookmarkBtnLabel = post.viewerBookmark ? i18n.t('post.savedBtn') : i18n.t('post.saveBtn');
  // Only the DID and handle identify an account. Matching on authorName would
  // let anyone reveal owner-only actions by copying the user's display name.
  const isOwner = Boolean(post.authorDid && post.authorDid === state.loggedInDid) ||
    Boolean(post.authorHandle && post.authorHandle === state.loggedInHandle);
  
  if (!isNotification || !POSTLESS_NOTIF_REASONS.includes(notifReason)) {
    footerHtml = `
    <div class="post-metrics" aria-label="${i18n.t('post.metricsAria')}">
      <div class="metric-item metric-replies" aria-label="${i18n.t('post.repliesAria', { count: (post.replyCount || 0).toString() })}">${i18n.t('post.metricRepliesCount', { count: (post.replyCount || 0).toString() })}</div>
      <div class="metric-item metric-reposts" aria-label="${i18n.t('post.repostsAria', { count: (post.repostCount || 0).toString() })}">${i18n.t('post.metricRepostsCount', { count: (post.repostCount || 0).toString() })}</div>
      <div class="metric-item metric-likes" aria-label="${i18n.t('post.likesAria', { count: (post.likeCount || 0).toString() })}">${i18n.t('post.metricLikesCount', { count: (post.likeCount || 0).toString() })}</div>
    </div>
    `;
  }
  if (!isNotification || !ACTIONLESS_NOTIF_REASONS.includes(notifReason)) {
    footerHtml += `
    <footer aria-label="${i18n.t('post.actionsAria')}">
      <button class="btn-reply" aria-label="${esc(i18n.t('post.replyAria', { handle: post.authorHandle }))}">${i18n.t('post.actionReply')}</button>
      <button class="btn-repost" aria-label="${post.viewerRepost ? i18n.t('post.unrepostAria') : i18n.t('post.repostAria')}">${repostBtnLabel}</button>
      <button class="btn-quote" aria-label="${i18n.t('post.quoteAria')}">${i18n.t('post.actionQuote')}</button>
      <button class="btn-like" aria-label="${post.viewerLike ? i18n.t('post.unlikeAria') : i18n.t('post.likeAria')}">${likeBtnLabel}</button>
      <button class="btn-bookmark" aria-label="${post.viewerBookmark ? i18n.t('post.removeBookmarkAria') : i18n.t('post.savePostAria')}">${bookmarkBtnLabel}</button>
      <button class="btn-mute-thread" aria-label="${i18n.t('post.muteThreadAria')}">${i18n.t('post.actionMute')}</button>
      <button class="btn-report-post" aria-label="${i18n.t('post.reportPostAria')}">${i18n.t('post.actionReport')}</button>
      ${post.isReply ? `<button class="btn-hide-reply" aria-label="${i18n.t('post.hideReplyAria')}">${i18n.t('post.actionHide')}</button>` : ''}
      ${isOwner ? `<button class="btn-pin-post" aria-label="${i18n.t('post.pinPostAria')}">${i18n.t('post.actionPin')}</button>` : ''}
      ${isOwner ? `<button class="btn-delete-post" aria-label="${i18n.t('post.deletePostAria')}">${i18n.t('post.actionDelete')}</button>` : ''}
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
      announcePolite(i18n.t('post.mutingThread'));
      await window.go.services.ModerationService.MuteThread(uri);
      announceAssertive(i18n.t('post.muteThreadSuccess'));
    } catch (err: any) {
      announceAssertive(i18n.t('post.error', { error: err }));
    }
  });

  article.querySelector('.btn-report-post')?.addEventListener('click', async (e) => {
    e.stopPropagation();
    const uri = article.dataset.uri;
    const cid = article.dataset.cid;
    if (!uri || !cid) return;
    const { promptDialog } = await import('../utils/dialog');
    const reason = await promptDialog(i18n.t('post.reportPrompt'), "", i18n.t('post.reportTitle'));
    if (reason) {
      try {
        announcePolite(i18n.t('post.reporting'));
        await window.go.services.ModerationService.ReportPost(uri, cid, 'com.atproto.moderation.defs#reasonOther', reason);
        announceAssertive(i18n.t('post.reportSuccess'));
      } catch (err: any) {
        announceAssertive(i18n.t('post.error', { error: err }));
      }
    }
  });

  article.querySelector('.btn-hide-reply')?.addEventListener('click', async (e) => {
    e.stopPropagation();
    const uri = article.dataset.uri;
    if (!uri) return;
    const rootUri = article.dataset.rootUri || article.dataset.replyToUri || uri;
    try {
      announcePolite(i18n.t('post.hidingReply'));
      await window.go.services.PostBuilderService.HideReply(rootUri, uri);
      announceAssertive(i18n.t('post.hideReplySuccess'));
    } catch (err: any) {
      announceAssertive(i18n.t('post.error', { error: err }));
    }
  });

  article.querySelector('.btn-pin-post')?.addEventListener('click', async (e) => {
    e.stopPropagation();
    const uri = article.dataset.uri;
    const cid = article.dataset.cid;
    if (!uri || !cid) return;
    try {
      announcePolite(i18n.t('post.pinning'));
      await window.go.services.SocialService.PinPost(uri, cid);
      announceAssertive(i18n.t('post.pinSuccess'));
    } catch (err: any) {
      announceAssertive(i18n.t('post.error', { error: err }));
    }
  });

  const formattedTime = formatPostDate(post.createdAt || post.indexedAt || "");
  const authorDisplay = formatAuthor(post.authorName ?? '', post.authorHandle);
  const showHandleSpan = (state.nameDisplayFormat !== 'handle') && post.authorHandle && (post.authorHandle !== authorDisplay);

  const innerHtmlContent = `
    ${notifContext}
    ${repostContext}
    ${replyContext}
    <header>
      <strong>${esc(authorDisplay)}</strong>
      ${showHandleSpan ? `<span>@${esc(post.authorHandle)}</span>` : ''}
      <small>${esc(formattedTime)}</small>
    </header>
    <div class="post-content">
      <p>${post.text ? linkify(post.text) : (post.hasMedia ? i18n.t('post.attachedMediaFallback') : (post.quotePost ? i18n.t('post.quotedPostFallback') : i18n.t('post.contentUnavailableFallback')))}</p>
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
            <p>${esc(i18n.t('post.mutedWarning', { word: triggeredMutedWord }))}</p>
            <button class="btn-show-muted" style="background: transparent; border: 1px solid #856404; color: #856404; padding: 5px 10px; border-radius: 3px; cursor: pointer;">${i18n.t('post.showAnyway')}</button>
        </div>
        <div class="muted-content" style="display: none;">
            ${innerHtmlContent}
        </div>
      `;
      // The markup above is already in the DOM, so the button can be wired up
      // directly.
      article.querySelector('.btn-show-muted')?.addEventListener('click', (e) => {
          e.stopPropagation();
          const contentDiv = article.querySelector('.muted-content') as HTMLElement;
          const warningDiv = article.querySelector('.muted-warning') as HTMLElement;
          if (contentDiv) contentDiv.style.display = 'block';
          if (warningDiv) warningDiv.style.display = 'none';
          announcePolite(i18n.t('post.contentShown'));
      });
  } else {
      article.innerHTML = innerHtmlContent;
  }

  // HLS binding
  if (post.video?.playlist) {
     const vid = (article.querySelector('.root-post-video') || article.querySelector('.post-video:not(.quoted-post-video)')) as HTMLVideoElement | null;
     if (vid) attachHlsStream(vid, post.video.playlist);
  }

  if (post.quotePost?.video?.playlist) {
     const qVid = article.querySelector('.quoted-post-video') as HTMLVideoElement | null;
     if (qVid) attachHlsStream(qVid, post.quotePost.video.playlist);
  }

  // Interactions
  article.querySelector('.btn-like')?.addEventListener('click', async (e) => {
    e.stopPropagation();
    try {
        const likeMetric = article.querySelector('.metric-likes');
        let count = post.likeCount || 0;
        if (article.dataset.viewerLike) {
            await window.go.services.PostBuilderService.UnlikePost(article.dataset.viewerLike);
            announceAssertive(i18n.t('post.unlikeSuccess'));
            article.dataset.viewerLike = "";
            const btn = article.querySelector('.btn-like');
            if (btn) btn.textContent = i18n.t('post.likeBtn');
            count = Math.max(0, count - 1);
            post.likeCount = count;
            if (likeMetric) likeMetric.textContent = i18n.t('post.metricLikesCount', { count: count.toString() });
        } else {
            const res = await window.go.services.PostBuilderService.LikePost(post.uri, post.cid);
            announceAssertive(i18n.t('post.likeSuccess'));
            article.dataset.viewerLike = res;
            const btn = article.querySelector('.btn-like');
            if (btn) btn.textContent = i18n.t('post.unlikeBtn');
            count += 1;
            post.likeCount = count;
            if (likeMetric) likeMetric.textContent = i18n.t('post.metricLikesCount', { count: count.toString() });
        }
    } catch(err) { announceAssertive(i18n.t('post.error', { error: String(err) })); }
  });
  
  article.querySelector('.btn-repost')?.addEventListener('click', async (e) => {
    e.stopPropagation();
    try {
        const repostMetric = article.querySelector('.metric-reposts');
        let count = post.repostCount || 0;
        if (article.dataset.viewerRepost) {
            announcePolite(i18n.t('post.undoingRepost'));
            await window.go.services.PostBuilderService.DeleteRepost(article.dataset.viewerRepost);
            announceAssertive(i18n.t('post.undoRepostSuccess'));
            article.dataset.viewerRepost = "";
            const btn = article.querySelector('.btn-repost');
            if (btn) btn.textContent = i18n.t('post.repostBtn');
            count = Math.max(0, count - 1);
            post.repostCount = count;
            if (repostMetric) repostMetric.textContent = i18n.t('post.metricRepostsCount', { count: count.toString() });
        } else {
            announcePolite(i18n.t('post.reposting'));
            const res = await window.go.services.PostBuilderService.Repost(post.uri, post.cid);
            announceAssertive(i18n.t('post.repostSuccess'));
            article.dataset.viewerRepost = res || "reposted";
            const btn = article.querySelector('.btn-repost');
            if (btn) btn.textContent = i18n.t('post.undoRepostBtn');
            count += 1;
            post.repostCount = count;
            if (repostMetric) repostMetric.textContent = i18n.t('post.metricRepostsCount', { count: count.toString() });
        }
    } catch(err) { announceAssertive(i18n.t('post.error', { error: String(err) })); }
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
            announcePolite(i18n.t('post.removingSaved'));
            await (window as any).go.services.PostBuilderService.UnbookmarkPost(article.dataset.viewerBookmark, post.uri);
            announceAssertive(i18n.t('post.removeSavedSuccess'));
            article.dataset.viewerBookmark = "";
            const btn = article.querySelector('.btn-bookmark') as HTMLButtonElement;
            if (btn) btn.textContent = i18n.t('post.saveBtn');
        } else {
            announcePolite(i18n.t('post.savingPost'));
            const res = await (window as any).go.services.PostBuilderService.BookmarkPost(post.uri, post.cid);
            announceAssertive(i18n.t('post.saveSuccessPost'));
            article.dataset.viewerBookmark = res || "bookmarked";
            const btn = article.querySelector('.btn-bookmark') as HTMLButtonElement;
            if (btn) btn.textContent = i18n.t('post.savedBtn');
        }
    } catch(err) {
        announceAssertive(i18n.t('post.error', { error: String(err) }));
    }
  });

  article.querySelector('.btn-delete-post')?.addEventListener('click', (e) => {
    e.stopPropagation();
    const uri = article.dataset.uri;
    if (!uri) return;
    confirmDialog(i18n.t('post.deleteConfirm'), i18n.t('post.deleteTitle')).then(async (confirmed) => {
      if (confirmed) {
        announcePolite(i18n.t('post.deleting'));
        try {
          await window.go.services.PostBuilderService.DeletePost(uri);
          announceAssertive(i18n.t('post.deleteSuccess'));
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
          announceAssertive(i18n.t('post.error', { error: String(err) }));
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
