import type Hls from 'hls.js';
import { linkify, esc, escUrl, renderProfileLink } from '../utils/helpers';
import { formatPostDate } from '../utils/format';
import { announcePolite, announceAssertive, getPostAccessibleLabel, formatAuthor } from '../utils/a11y';
import { confirmDialog, promptDialog, promptReportDetails } from '../utils/dialog';
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
 * A player is created only while its video is on screen and destroyed as soon
 * as it leaves, so the feed holds buffers for what the user is actually looking
 * at rather than for every video it has rendered.
 */
const activePlayers = new Map<HTMLVideoElement, Hls>();
const pendingVideos = new Set<HTMLVideoElement>();
let hlsModulePromise: Promise<typeof import('hls.js')> | null = null;

function loadHlsClass(): Promise<typeof import('hls.js')['default']> {
  if (!hlsModulePromise) {
    hlsModulePromise = import('hls.js');
  }
  return hlsModulePromise.then(mod => mod.default);
}

/**
 * Buffer ceiling per player.
 *
 * The hls.js defaults (60 MB, up to 600 s) are sized for a page playing one
 * video. A feed holds dozens at once and it is their sum that exhausts the
 * process, so each player gets only enough to play smoothly.
 */
const HLS_LIMITS = {
  maxBufferLength: 10,
  maxMaxBufferLength: 30,
  maxBufferSize: 8 * 1000 * 1000,
  backBufferLength: 10,
};

/**
 * Drives attach/detach from visibility.
 *
 * Removing an element from the document also makes it stop intersecting, so
 * this doubles as the cleanup path for feed reloads and tab switches.
 */
let visibilityObserver: IntersectionObserver | null = null;

/**
 * Every video handed to the observer.
 *
 * A target that never became visible reports no change when it is removed, so
 * the observer alone would hold on to it forever. The feed rebuilds itself
 * every minute and most of it is below the fold, which is exactly that case.
 */
const registeredVideos = new Set<HTMLVideoElement>();

/** Reclaims registered videos whose element has left the document. */
let sweepTimer: number | null = null;

const SWEEP_INTERVAL_MS = 30_000;

function stopSweep(): void {
  if (sweepTimer !== null) {
    clearInterval(sweepTimer);
    sweepTimer = null;
  }
}

/** Releases `video` and stops tracking it altogether. */
function forgetVideo(video: HTMLVideoElement): void {
  releasePlayer(video);
  visibilityObserver?.unobserve(video);
  registeredVideos.delete(video);
  if (registeredVideos.size === 0) stopSweep();
}

function sweepDetachedVideos(): void {
  for (const video of [...registeredVideos]) {
    if (!video.isConnected) {
      forgetVideo(video);
    } else if (visibilityObserver) {
      visibilityObserver.observe(video);
    }
  }
  if (registeredVideos.size === 0) stopSweep();
}

/** Frees whatever `video` is holding: its player, or its source. */
function releasePlayer(video: HTMLVideoElement): void {
  pendingVideos.delete(video);
  try {
    video.pause();
  } catch {
    // An element already torn down by the browser can throw here.
  }

  // Plain sources carry no player; dropping the source is what frees them.
  if (video.dataset.src) {
    if (video.getAttribute('src')) {
      video.removeAttribute('src');
      video.srcObject = null;
      // Makes the element actually drop the buffered data and hardware decoder.
      try { video.load(); } catch { /* already gone */ }
    }
    return;
  }

  const hls = activePlayers.get(video);
  if (hls) {
    activePlayers.delete(video);
    try {
      hls.detachMedia();
      hls.destroy();
    } catch {
      // A player whose element is already gone can throw on teardown; the
      // instance is dropped either way.
    }
  }

  if (video.getAttribute('src') || video.srcObject) {
    video.removeAttribute('src');
    video.srcObject = null;
    try { video.load(); } catch { /* already gone */ }
  }
}

/** Builds the player for `video` and starts loading, if it has none yet. */
function engagePlayer(video: HTMLVideoElement): void {
  if (activePlayers.has(video) || pendingVideos.has(video)) return;

  const shouldAutoplay = video.dataset.autoplay === 'true';

  // A plain source needs no player, only to be connected when it comes up.
  const plain = video.dataset.src;
  if (plain) {
    if (!video.getAttribute('src')) video.src = plain;
    if (shouldAutoplay) void video.play().catch(() => {});
    return;
  }

  const playlist = video.dataset.playlist;
  if (!playlist) return;

  pendingVideos.add(video);
  void loadHlsClass().then(HlsClass => {
    if (!pendingVideos.has(video) || !video.isConnected || activePlayers.has(video)) {
      pendingVideos.delete(video);
      return;
    }
    pendingVideos.delete(video);

    if (!HlsClass.isSupported()) {
      if (video.canPlayType('application/vnd.apple.mpegurl')) {
        if (!video.src) video.src = playlist;
        if (shouldAutoplay) void video.play().catch(() => {});
      }
      return;
    }

    const hls = new HlsClass(HLS_LIMITS);
    hls.loadSource(playlist);
    hls.attachMedia(video);
    activePlayers.set(video, hls);

    if (shouldAutoplay) {
      hls.on(HlsClass.Events.MANIFEST_PARSED, () => void video.play().catch(() => {}));
    }
  }).catch(() => {
    pendingVideos.delete(video);
  });
}

function onVisibilityChange(entries: IntersectionObserverEntry[]): void {
  for (const entry of entries) {
    const video = entry.target as HTMLVideoElement;

    if (entry.isIntersecting) {
      engagePlayer(video);
    } else if (video.isConnected) {
      // Scrolled away but still in the page, so it may come back.
      releasePlayer(video);
    } else {
      forgetVideo(video);
    }
  }
}

/**
 * Registers a video to be played once it comes into view.
 *
 * Nothing is downloaded here. Attaching every player as the feed renders was
 * what let a few hundred posts pin hundreds of megabytes of video buffer for
 * clips the user never opened.
 */
function registerVideo(video: HTMLVideoElement, playlist: string, isGif: boolean): void {
  video.dataset.playlist = playlist;
  if (isGif) video.dataset.autoplay = 'true';
  observeVideo(video);
}

/**
 * Registers a video that carries a plain source rather than an HLS playlist.
 *
 * Exported because chat builds its own markup: without this, every GIF a
 * conversation has ever shown keeps looping and decoding for as long as the
 * messages stay rendered.
 */
export function registerInlineVideo(video: HTMLVideoElement, src: string, autoplay = true): void {
  video.dataset.src = src;
  if (autoplay) video.dataset.autoplay = 'true';
  observeVideo(video);
}

function observeVideo(video: HTMLVideoElement): void {
  registeredVideos.add(video);

  if (video.isConnected) {
    if (!visibilityObserver) {
      visibilityObserver = new IntersectionObserver(onVisibilityChange, { rootMargin: '200px' });
    }
    visibilityObserver.observe(video);
  }

  if (sweepTimer === null) {
    sweepTimer = window.setInterval(sweepDetachedVideos, SWEEP_INTERVAL_MS);
  }
}

export function bindContainerVideos(container: HTMLElement): void {
  if (!visibilityObserver) {
    visibilityObserver = new IntersectionObserver(onVisibilityChange, { rootMargin: '200px' });
  }
  const videos = container.querySelectorAll<HTMLVideoElement>('video');
  videos.forEach(v => {
    if (v.dataset.playlist || v.dataset.src) {
      registeredVideos.add(v);
      if (v.isConnected) {
        visibilityObserver?.observe(v);
      }
    }
  });
  if (registeredVideos.size > 0 && sweepTimer === null) {
    sweepTimer = window.setInterval(sweepDetachedVideos, SWEEP_INTERVAL_MS);
  }
}

export function cleanupContainerVideos(container: HTMLElement): void {
  const videos = container.querySelectorAll<HTMLVideoElement>('video');
  videos.forEach(v => forgetVideo(v));
}

export function createPostArticle(
  post: PostView,
  index: number,
  isNotification = false,
  notifReason = "",
  forceWarning = false
): HTMLElement | null {
  if (!forceWarning && !isNotification && state.hiddenPostUris && state.hiddenPostUris.includes(post.uri)) {
    return null;
  }

  const article = document.createElement('article');
  article.setAttribute('role', 'article');
  article.setAttribute('tabindex', '0');
  article.classList.add('post-item');
  article.dataset.uri = post.uri;
  article.dataset.cid = post.cid;
  article.dataset.index = index.toString();
  article.dataset.createdAt = post.createdAt || post.indexedAt || "";
  if (post.rootUri) article.dataset.rootUri = post.rootUri;
  if (post.replyToUri) article.dataset.replyToUri = post.replyToUri;
  if (post.feedContext) article.dataset.feedContext = post.feedContext;
  article.dataset.embeddingDisabled = post.embeddingDisabled ? "true" : "";
  
  let srMetrics = i18n.t('post.metricsReplies', { replies: (post.replyCount || 0).toString(), reposts: (post.repostCount || 0).toString(), likes: (post.likeCount || 0).toString() });
  if (post.quoteCount && post.quoteCount > 0) {
    srMetrics += `, ${i18n.t('sec2.quoteCountLabel', { count: post.quoteCount.toString() })}`;
  }
  if (post.bookmarkCount && post.bookmarkCount > 0) {
    srMetrics += `, ${i18n.t('sec2.bookmarkCountLabel', { count: post.bookmarkCount.toString() })}`;
  }
  if (post.knownLikers && post.knownLikers.length > 0) {
    srMetrics += ` (${i18n.t('sec2.knownLikersInfo', { names: post.knownLikers.join(', ') })})`;
  }
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
  if (post.authorPronouns) {
    article.dataset.authorPronouns = post.authorPronouns;
  }
  if (post.authorIsBot) {
    article.dataset.authorIsBot = "true";
  }
  if (post.opThreadPostCount && post.opThreadPostIndex && post.opThreadPostCount > 1) {
    article.dataset.opThreadProgress = i18n.t('sec2.opThreadProgress', {
      index: post.opThreadPostIndex.toString(),
      count: post.opThreadPostCount.toString()
    });
  }
  article.dataset.viewerLike = post.viewerLike || "";
  article.dataset.viewerBookmark = post.viewerBookmark || "";
  article.dataset.viewerThreadMuted = post.viewerThreadMuted ? "true" : "";
  const isPinnedPost = Boolean(post.isPinned || (state.loggedInPinnedPostUri && state.loggedInPinnedPostUri === post.uri));
  article.dataset.pinned = isPinnedPost ? "true" : "";
  article.dataset.notifReason = notifReason;

  let replyContext = "";
  if (!isNotification && post.isReply && post.replyToAuthor) {
    article.dataset.replyTo = post.replyToAuthor;
    if (post.replyToAuthorName) {
      article.dataset.replyToName = post.replyToAuthorName;
    }
    if (post.rootAuthor) {
      article.dataset.rootAuthor = post.rootAuthor;
      if (post.rootAuthorName) {
        article.dataset.rootAuthorName = post.rootAuthorName;
      }
    }
    const isDidReply = post.replyToAuthor.startsWith('did:');
    const isDidRoot = post.rootAuthor ? post.rootAuthor.startsWith('did:') : false;
    if (!isDidReply) {
      const formattedReplyTo = formatAuthor(post.replyToAuthorName || "", post.replyToAuthor);
      const replyToLink = renderProfileLink(post.replyToAuthor, formattedReplyTo);
      if (post.rootAuthor && !isDidRoot && post.rootAuthor !== post.replyToAuthor) {
        const formattedRoot = formatAuthor(post.rootAuthorName || "", post.rootAuthor);
        const rootLink = renderProfileLink(post.rootAuthor, formattedRoot);
        replyContext = `<div class="reply-context"><small>${i18n.t('post.inReplyToMultiple', { replyTo: replyToLink, rootAuthor: rootLink })}:</small></div>`;
      } else {
        replyContext = `<div class="reply-context"><small>${i18n.t('post.inReplyTo', { handle: replyToLink })}:</small></div>`;
      }
    }
  }

  let repostContext = "";
  if (post.repostedBy) {
    article.dataset.repostedBy = post.repostedBy;
    if (post.repostedByHandle) {
      article.dataset.repostedByHandle = post.repostedByHandle;
    }
    const repostHandle = post.repostedByHandle || post.repostedBy;
    const repostAuthorHtml = repostHandle && !repostHandle.includes(' ')
      ? renderProfileLink(repostHandle, post.repostedBy)
      : esc(post.repostedBy);
    repostContext = `<div class="repost-context"><small>${i18n.t('post.repostedBy', { handle: repostAuthorHtml })}</small></div>`;
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
  if (post.quoteDetached && post.quoteDetachedUri) {
    const isMyQuotedPost = Boolean(state.loggedInDid && post.quoteDetachedUri.includes(state.loggedInDid));
    const reattachBtn = isMyQuotedPost
      ? `<button type="button" class="btn-reattach-quote" data-own-uri="${esc(post.quoteDetachedUri)}" data-quote-uri="${esc(post.uri)}" style="margin-left: 8px; padding: 2px 8px; font-size: 0.85em;">${esc(i18n.t('sec2.reattachQuoteBtn'))}</button>`
      : '';
    quoteContext = `
      <div class="quote-context" style="border: 1px dashed #888; padding: 10px; margin-top: 10px; border-radius: 5px; color: #aaa;">
        <em>${esc(i18n.t('sec2.detachedQuoteText'))}</em>${reattachBtn}
      </div>
    `;
  } else if (post.quotePost) {
    const isMyQuotedPost = Boolean(
      state.loggedInDid &&
      (post.quotePost.authorDid === state.loggedInDid || (post.quotePost.uri && post.quotePost.uri.includes(state.loggedInDid)))
    );
    {
      article.dataset.quoteAuthorHandle = post.quotePost.authorHandle;
      article.dataset.quoteAuthorName = post.quotePost.authorName || post.quotePost.authorHandle;
      article.dataset.quoteText = post.quotePost.text || "";
      article.dataset.quoteUri = post.quotePost.uri;
      article.dataset.quoteCid = post.quotePost.cid;

      const quoteAlts = (post.quotePost.imageAlts && post.quotePost.imageAlts.length > 0)
        ? post.quotePost.imageAlts
        : (post.quotePost.images ? post.quotePost.images.map((img: ImageDTO) => img.alt || "") : []);
      if (quoteAlts.length > 0) {
        article.dataset.quoteHasImage = "true";
        article.dataset.quoteImageAlts = formatAltList(quoteAlts);
      } else if (post.quotePost.images && post.quotePost.images.length > 0) {
        article.dataset.quoteHasImage = "true";
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
        article.dataset.quoteExternalUrl = post.quotePost.external.uri || "";
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
      if (quoteAlts.length > 0) {
        quoteMediaHtml += `<div class="post-alts"><small><strong>${i18n.t('post.imagesTitle')}</strong> ${esc(formatAltList(quoteAlts))}</small></div>`;
      }
      if (post.quotePost.video) {
        const isGif = post.quotePost.video.presentation === 'gif';
        const altText = post.quotePost.video.alt || i18n.t('post.noAlt');
        const posterAttr = post.quotePost.video.thumbnail ? `poster="${escUrl(post.quotePost.video.thumbnail)}"` : '';
        quoteMediaHtml += `
          <div class="video-context quoted-video-context" style="margin-top: 10px;">
            <video class="post-video quoted-post-video" ${isGif ? 'loop muted playsinline' : 'controls'} preload="none" ${posterAttr}>
                ${i18n.t('post.videoNoSupport')}
            </video>
            <div class="post-video-alts" style="margin-top: 4px;"><small><strong>${isGif ? 'GIF:' : 'Video:'}</strong> ${esc(altText)}</small></div>
          </div>
        `;
      }
      if (post.quotePost.external) {
        const qExtSource = post.quotePost.external.sourceTitle
          ? `<small style="display:block; margin-top:2px; color:#888;">📄 ${esc(post.quotePost.external.sourceTitle)}</small>`
          : "";
        quoteMediaHtml += `<div class="external-card" style="border:1px solid #ddd;padding:6px;margin-top:6px;border-radius:4px;font-size:0.85em;">
          ${post.quotePost.external.thumb ? `<img src="${escUrl(post.quotePost.external.thumb)}" alt="${esc(i18n.t('post.linkThumbAlt'))}" style="max-height: 120px; max-width: 100%; object-fit: cover; display: block; margin-bottom: 6px; border-radius: 4px;" />` : ''}
          <strong><a href="#" class="app-link link-external" data-external-url="${escUrl(post.quotePost.external.uri)}">${esc(post.quotePost.external.title || post.quotePost.external.uri)}</a></strong>
          ${post.quotePost.external.description ? `<p style="margin:2px 0 0 0; color: var(--text-muted, #666);">${esc(post.quotePost.external.description)}</p>` : ""}
          ${qExtSource}
        </div>`;
      }

      const detachBtn = isMyQuotedPost
        ? `<button type="button" class="btn-detach-quote" data-own-uri="${esc(post.quotePost.uri)}" data-quote-uri="${esc(post.uri)}" style="float: right; padding: 2px 8px; font-size: 0.8em;">${esc(i18n.t('sec2.detachQuoteBtn'))}</button>`
        : '';
      const qBotBadge = post.quotePost.authorIsBot
        ? ` <span class="bot-badge" title="${esc(i18n.t('sec2.botBadgeAria'))}" aria-label="${esc(i18n.t('sec2.botBadgeAria'))}" style="font-size:0.85em; padding:1px 5px; border-radius:4px; background:rgba(100,116,139,0.2);">${esc(i18n.t('sec2.botBadge'))}</span>`
        : '';

      quoteContext = `
        <div class="quote-context" style="border: 1px solid #ccc; padding: 10px; margin-top: 10px; border-radius: 5px;">
          <header>
            ${detachBtn}
            <strong>${renderProfileLink(post.quotePost.authorHandle, post.quotePost.authorName || post.quotePost.authorHandle)}</strong>${qBotBadge}
            <span>${renderProfileLink(post.quotePost.authorHandle)}</span>
          </header>
          <div class="post-content">
            <p>${post.quotePost.text ? linkify(post.quotePost.text) : i18n.t(post.quotePost.hasMedia ? 'post.mediaAttached' : 'post.contentNotAvailable')}</p>
            ${quoteMediaHtml}
          </div>
        </div>
      `;
    }
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
    
    const extSourceHtml = post.external.sourceTitle
      ? `<small style="display:block; margin-top:4px; color: var(--text-muted, #888);">📄 ${esc(post.external.sourceTitle)}</small>`
      : '';
    externalContext = `
      <div class="external-card" style="border: 1px solid #ddd; padding: 8px; margin-top: 8px; border-radius: 4px;">
        ${post.external.thumb ? `<img src="${escUrl(post.external.thumb)}" alt="${esc(i18n.t('post.linkThumbAlt'))}" style="max-height: 120px; max-width: 100%; object-fit: cover; display: block; margin-bottom: 6px; border-radius: 4px;" />` : ''}
        <strong><a href="#" data-external-url="${escUrl(post.external.uri)}">${esc(post.external.title || post.external.uri)}</a></strong>
        ${post.external.description ? `<p style="font-size: 0.85em; margin: 4px 0 0 0; color: var(--text-muted, #666);">${esc(post.external.description)}</p>` : ''}
        ${extSourceHtml}
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
    const captionsTracksHtml = (post.video.captions || []).map((c, idx) =>
      `<track kind="captions" src="${escUrl(c.url)}" srclang="${esc(c.lang || 'pt')}" label="${esc(c.lang || 'Captions')}" ${idx === 0 ? 'default' : ''} />`
    ).join('');
    
    videoContext = `
      <div class="video-context" style="margin-top: 10px;">
        <video class="post-video" crossorigin="anonymous" ${isGif ? 'loop muted playsinline' : 'controls playsinline'} preload="none" ${posterAttr}>
            ${captionsTracksHtml}
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
    const quotesMetricHtml = (post.quoteCount && post.quoteCount > 0)
      ? `<div class="metric-item metric-quotes">${esc(i18n.t('sec2.quoteCountLabel', { count: post.quoteCount.toString() }))}</div>`
      : '';
    const bookmarksMetricHtml = (post.bookmarkCount && post.bookmarkCount > 0)
      ? `<div class="metric-item metric-bookmarks">${esc(i18n.t('sec2.bookmarkCountLabel', { count: post.bookmarkCount.toString() }))}</div>`
      : '';
    const knownLikersHtml = (post.knownLikers && post.knownLikers.length > 0)
      ? `<div class="known-likers-info" style="font-size:0.85em; color:var(--text-muted, #888); margin-top:4px;">❤️ ${esc(i18n.t('sec2.knownLikersInfo', { names: post.knownLikers.join(', ') }))}</div>`
      : '';
    footerHtml = `
    <div class="post-metrics" aria-label="${i18n.t('post.metricsAria')}">
      <div class="metric-item metric-replies" aria-label="${i18n.t('post.repliesAria', { count: (post.replyCount || 0).toString() })}">${i18n.t('post.metricRepliesCount', { count: (post.replyCount || 0).toString() })}</div>
      <div class="metric-item metric-reposts" aria-label="${i18n.t('post.repostsAria', { count: (post.repostCount || 0).toString() })}">${i18n.t('post.metricRepostsCount', { count: (post.repostCount || 0).toString() })}</div>
      <div class="metric-item metric-likes" aria-label="${i18n.t('post.likesAria', { count: (post.likeCount || 0).toString() })}">${i18n.t('post.metricLikesCount', { count: (post.likeCount || 0).toString() })}</div>
      ${quotesMetricHtml}
      ${bookmarksMetricHtml}
    </div>
    ${knownLikersHtml}
    `;
  }
  if (!isNotification || !ACTIONLESS_NOTIF_REASONS.includes(notifReason)) {
    const muteThreadLabel = post.viewerThreadMuted ? i18n.t('post.actionUnmute') : i18n.t('post.actionMute');
    const muteThreadAria = post.viewerThreadMuted ? i18n.t('post.unmuteThreadAria') : i18n.t('post.muteThreadAria');
    const pinBtnLabel = isPinnedPost ? i18n.t('post.actionUnpin') : i18n.t('post.actionPin');
    const pinBtnAria = isPinnedPost ? i18n.t('post.unpinPostAria') : i18n.t('post.pinPostAria');
    const toggleQuotesLabel = post.embeddingDisabled ? i18n.t('sec2.toggleQuotesEnableBtn') : i18n.t('sec2.toggleQuotesDisableBtn');
    // Only the author of a thread can hide replies in it.
    const threadRootUri = post.rootUri || post.replyToUri || '';
    const isOwnThread = Boolean(state.loggedInDid && threadRootUri.startsWith(`at://${state.loggedInDid}/`));
    const isCustomFeed = !isNotification && state.currentTab === 'timeline' && state.currentFeedUri !== "";
    footerHtml += `
    <footer aria-label="${i18n.t('post.actionsAria')}">
      <button class="btn-reply" ${post.replyDisabled ? 'disabled' : ''} aria-label="${esc(i18n.t('post.replyAria', { handle: post.authorHandle }))}">${i18n.t('post.actionReply')}</button>
      <button class="btn-repost" aria-label="${post.viewerRepost ? i18n.t('post.unrepostAria') : i18n.t('post.repostAria')}">${repostBtnLabel}</button>
      <button class="btn-quote" ${post.embeddingDisabled ? 'disabled' : ''} aria-label="${i18n.t('post.quoteAria')}">${i18n.t('post.actionQuote')}</button>
      <button class="btn-like" aria-label="${post.viewerLike ? i18n.t('post.unlikeAria') : i18n.t('post.likeAria')}">${likeBtnLabel}</button>
      <button class="btn-bookmark" aria-label="${post.viewerBookmark ? i18n.t('post.removeBookmarkAria') : i18n.t('post.savePostAria')}">${bookmarkBtnLabel}</button>
      <button class="btn-share-dm" aria-label="${esc(i18n.t('extended.sharePostDm'))}">${esc(i18n.t('extended.sharePostDm'))}</button>
      <button class="btn-mute-thread" aria-label="${muteThreadAria}">${muteThreadLabel}</button>
      <button class="btn-hide-post-for-me" aria-label="${esc(i18n.t('sec2.hidePostForMeBtn'))}">${esc(i18n.t('sec2.hidePostForMeBtn'))}</button>
      <button class="btn-report-post" aria-label="${i18n.t('post.reportPostAria')}">${i18n.t('post.actionReport')}</button>
      ${isCustomFeed ? `<button class="btn-feed-more" aria-label="${esc(i18n.t('sec2.showMoreLikeThisBtn'))}">${esc(i18n.t('sec2.showMoreLikeThisBtn'))}</button><button class="btn-feed-less" aria-label="${esc(i18n.t('sec2.showLessLikeThisBtn'))}">${esc(i18n.t('sec2.showLessLikeThisBtn'))}</button>` : ''}
      ${post.isReply && isOwnThread ? `<button class="btn-hide-reply" aria-label="${i18n.t('post.hideReplyAria')}">${i18n.t('post.actionHide')}</button><button class="btn-unhide-reply" aria-label="${esc(i18n.t('sec2.unhideReplyBtn'))}">${esc(i18n.t('sec2.unhideReplyBtn'))}</button>` : ''}
      ${isOwner ? `<button class="btn-toggle-quotes" aria-label="${esc(toggleQuotesLabel)}">${esc(toggleQuotesLabel)}</button>` : ''}
      ${isOwner ? `<button class="btn-edit-reply-gate" aria-label="${esc(i18n.t('sec2.editReplyGateBtn'))}">${esc(i18n.t('sec2.editReplyGateBtn'))}</button>` : ''}
      ${isOwner ? `<button class="btn-pin-post" aria-label="${pinBtnAria}">${pinBtnLabel}</button>` : ''}
      ${isOwner ? `<button class="btn-delete-post" aria-label="${i18n.t('post.deletePostAria')}">${i18n.t('post.actionDelete')}</button>` : ''}
    </footer>`;
  }

  let postHasMutedWord = false;
  let triggeredMutedWord = "";
  const cache = state.mutedWordsCache || [];
  if (cache.length > 0) {
      const textsToCheck: string[] = [];
      if (post.text) textsToCheck.push(post.text);
      if (post.imageAlts) textsToCheck.push(...post.imageAlts);
      if (post.external?.title) textsToCheck.push(post.external.title);
      if (post.external?.description) textsToCheck.push(post.external.description);
      if (post.quotePost) {
          if (post.quotePost.text) textsToCheck.push(post.quotePost.text);
          if (post.quotePost.imageAlts) textsToCheck.push(...post.quotePost.imageAlts);
          if (post.quotePost.external?.title) textsToCheck.push(post.quotePost.external.title);
          if (post.quotePost.external?.description) textsToCheck.push(post.quotePost.external.description);
      }

      const combinedText = textsToCheck.join(' ').toLowerCase();
      for (const rawWord of cache) {
          const word = rawWord.trim().toLowerCase();
          if (!word) continue;
          if (combinedText.includes(word)) {
              postHasMutedWord = true;
              triggeredMutedWord = rawWord.trim();
              break;
          }
      }
  }

  const formattedTime = formatPostDate(post.createdAt || post.indexedAt || "");
  const authorDisplay = formatAuthor(post.authorName ?? '', post.authorHandle);
  const showHandleSpan = (state.nameDisplayFormat !== 'handle') && post.authorHandle && (post.authorHandle !== authorDisplay);
  const verifiedBadgeHtml = (!state.hideVerificationBadges && post.authorVerified)
    ? ` <span class="verified-badge" title="${esc(i18n.t('sec2.verifiedBadgeAria'))}" aria-label="${esc(i18n.t('sec2.verifiedBadgeAria'))}" style="color: #3b82f6; font-weight: bold;">✓</span>`
    : '';
  const botBadgeHtml = post.authorIsBot
    ? ` <span class="bot-badge" title="${esc(i18n.t('sec2.botBadgeAria'))}" aria-label="${esc(i18n.t('sec2.botBadgeAria'))}" style="font-size: 0.85em; padding: 1px 6px; border-radius: 4px; background: rgba(100,116,139,0.2);">${esc(i18n.t('sec2.botBadge'))}</span>`
    : '';
  const opThreadBadgeHtml = article.dataset.opThreadProgress
    ? ` <span class="op-thread-badge" style="font-size: 0.8em; padding: 1px 6px; border-radius: 4px; background: rgba(59,130,246,0.15); color: #60a5fa;">${esc(article.dataset.opThreadProgress)}</span>`
    : '';

  const postLabels = (post.labels || []).filter(l => l && !l.startsWith('!') && l.toLowerCase() !== 'bot');
  const hasContentLabels = !forceWarning && !isNotification && postLabels.length > 0;
  const labelBannerHtml = hasContentLabels
    ? `<div class="post-label-warning" style="padding: 8px 12px; margin-bottom: 8px; background: rgba(245, 158, 11, 0.15); border: 1px solid #f59e0b; border-radius: 6px; display: flex; justify-content: space-between; align-items: center; gap: 8px;">
         <span>⚠️ <strong>${esc(i18n.t('sec2.contentWarningTitle', { labels: postLabels.join(', ') }))}</strong></span>
         <button type="button" class="btn-reveal-labeled-post" style="padding: 3px 10px;">${esc(i18n.t('sec2.showLabeledPostBtn'))}</button>
       </div>`
    : '';

  const innerHtmlContent = `
    ${notifContext}
    ${repostContext}
    ${replyContext}
    <header>
      <strong>${renderProfileLink(post.authorHandle, authorDisplay)}</strong>${verifiedBadgeHtml}${botBadgeHtml}
      ${showHandleSpan ? `<span>${renderProfileLink(post.authorHandle)}</span>` : ''}
      <small>${esc(formattedTime)}</small>${opThreadBadgeHtml}
    </header>
    ${labelBannerHtml}
    <div class="post-content" ${hasContentLabels ? 'style="display:none;"' : ''}>
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
      if (state.mutedWordsBehavior === 'hide' && !forceWarning && !isNotification) {
          return null;
      }
      article.dataset.mutedWord = triggeredMutedWord;
      article.dataset.mutedShown = "false";
      article.innerHTML = `
        <div class="muted-warning" style="padding: 15px; background: #fff3cd; color: #856404; border-radius: 5px; text-align: center;">
            <p>${esc(i18n.t('post.mutedWarning', { word: triggeredMutedWord }))}</p>
            <button class="btn-show-muted" style="background: transparent; border: 1px solid #856404; color: #856404; padding: 5px 10px; border-radius: 3px; cursor: pointer;">${i18n.t('post.showAnyway')}</button>
        </div>
        <div class="muted-content" style="display: none;">
            ${innerHtmlContent}
        </div>
      `;
  } else {
      article.innerHTML = innerHtmlContent;
  }

  // HLS binding: registered now, loaded only once on screen.
  if (post.video?.playlist) {
     const vid = (article.querySelector('.root-post-video') || article.querySelector('.post-video:not(.quoted-post-video)')) as HTMLVideoElement | null;
     if (vid) registerVideo(vid, post.video.playlist, post.video.presentation === 'gif');
  }

  if (post.quotePost?.video?.playlist) {
     const qVid = article.querySelector('.quoted-post-video') as HTMLVideoElement | null;
     if (qVid) registerVideo(qVid, post.quotePost.video.playlist, post.quotePost.video.presentation === 'gif');
  }

  articlePostMap.set(article, post);
  ensurePostDelegation();

  article.setAttribute('aria-label', getPostAccessibleLabel(article));
  return article;
}

const articlePostMap = new WeakMap<HTMLElement, PostView>();
let postDelegationBound = false;

function ensurePostDelegation(): void {
  if (postDelegationBound) return;
  postDelegationBound = true;

  document.addEventListener('focusin', (e: FocusEvent) => {
    const target = e.target;
    if (!(target instanceof HTMLElement) || !target.matches('article.post-item')) return;
    const idx = parseInt(target.dataset.index || "-1", 10);
    if (!isNaN(idx) && idx >= 0) {
      state.focusedPostIndex = idx;
    }
  });

  document.addEventListener('click', (e: MouseEvent) => {
    const rawTarget = e.target;
    if (!(rawTarget instanceof Element)) return;

    const btn = rawTarget.closest('button') as HTMLButtonElement | null;
    if (!btn) return;

    const article = btn.closest('article.post-item') as HTMLElement | null;
    if (!article) return;

    const post = articlePostMap.get(article);
    if (!post) return;

    if (btn.classList.contains('btn-show-muted')) {
      e.stopPropagation();
      const contentDiv = article.querySelector('.muted-content') as HTMLElement | null;
      const warningDiv = article.querySelector('.muted-warning') as HTMLElement | null;
      if (contentDiv) contentDiv.style.display = 'block';
      if (warningDiv) warningDiv.style.display = 'none';
      article.dataset.mutedShown = "true";
      article.setAttribute('aria-label', getPostAccessibleLabel(article));
      announcePolite(i18n.t('post.contentShown'));
      return;
    }

    if (btn.classList.contains('btn-reveal-labeled-post')) {
      e.stopPropagation();
      const contentEl = article.querySelector('.post-content') as HTMLElement | null;
      const warnEl = article.querySelector('.post-label-warning') as HTMLElement | null;
      if (contentEl) contentEl.style.display = 'block';
      if (warnEl) warnEl.style.display = 'none';
      announcePolite(i18n.t('post.contentShown'));
      return;
    }

    if (btn.classList.contains('btn-like')) {
      e.stopPropagation();
      void (async () => {
        try {
          const likeMetric = article.querySelector('.metric-likes');
          let count = post.likeCount || 0;
          if (article.dataset.viewerLike) {
            await window.go.services.PostBuilderService.UnlikePost(article.dataset.viewerLike);
            announceAssertive(i18n.t('post.unlikeSuccess'));
            article.dataset.viewerLike = "";
            btn.textContent = i18n.t('post.likeBtn');
            count = Math.max(0, count - 1);
            post.likeCount = count;
            if (likeMetric) likeMetric.textContent = i18n.t('post.metricLikesCount', { count: count.toString() });
          } else {
            const res = await window.go.services.PostBuilderService.LikePost(post.uri, post.cid);
            announceAssertive(i18n.t('post.likeSuccess'));
            article.dataset.viewerLike = res;
            btn.textContent = i18n.t('post.unlikeBtn');
            count += 1;
            post.likeCount = count;
            if (likeMetric) likeMetric.textContent = i18n.t('post.metricLikesCount', { count: count.toString() });
          }
        } catch (err: unknown) {
          announceAssertive(i18n.t('post.error', { error: String(err) }));
        }
      })();
      return;
    }

    if (btn.classList.contains('btn-repost')) {
      e.stopPropagation();
      void (async () => {
        try {
          const repostMetric = article.querySelector('.metric-reposts');
          let count = post.repostCount || 0;
          if (article.dataset.viewerRepost) {
            announcePolite(i18n.t('post.undoingRepost'));
            await window.go.services.PostBuilderService.DeleteRepost(article.dataset.viewerRepost);
            announceAssertive(i18n.t('post.undoRepostSuccess'));
            article.dataset.viewerRepost = "";
            btn.textContent = i18n.t('post.repostBtn');
            count = Math.max(0, count - 1);
            post.repostCount = count;
            if (repostMetric) repostMetric.textContent = i18n.t('post.metricRepostsCount', { count: count.toString() });
          } else {
            announcePolite(i18n.t('post.reposting'));
            const res = await window.go.services.PostBuilderService.Repost(post.uri, post.cid);
            announceAssertive(i18n.t('post.repostSuccess'));
            article.dataset.viewerRepost = res || "reposted";
            btn.textContent = i18n.t('post.undoRepostBtn');
            count += 1;
            post.repostCount = count;
            if (repostMetric) repostMetric.textContent = i18n.t('post.metricRepostsCount', { count: count.toString() });
          }
        } catch (err: unknown) {
          announceAssertive(i18n.t('post.error', { error: String(err) }));
        }
      })();
      return;
    }

    if (btn.classList.contains('btn-reply')) {
      e.stopPropagation();
      openComposeModal('reply', { uri: post.uri, cid: post.cid, authorHandle: post.authorHandle, authorPronouns: post.authorPronouns });
      return;
    }

    if (btn.classList.contains('btn-quote')) {
      e.stopPropagation();
      openComposeModal('quote', { uri: post.uri, cid: post.cid, authorHandle: post.authorHandle, authorPronouns: post.authorPronouns });
      return;
    }

    if (btn.classList.contains('btn-bookmark')) {
      e.stopPropagation();
      void (async () => {
        try {
          if (article.dataset.viewerBookmark) {
            announcePolite(i18n.t('post.removingSaved'));
            await window.go.services.PostBuilderService.UnbookmarkPost(article.dataset.viewerBookmark, post.uri);
            announceAssertive(i18n.t('post.removeSavedSuccess'));
            article.dataset.viewerBookmark = "";
            btn.textContent = i18n.t('post.saveBtn');
          } else {
            announcePolite(i18n.t('post.savingPost'));
            const res = await window.go.services.PostBuilderService.BookmarkPost(post.uri, post.cid);
            announceAssertive(i18n.t('post.saveSuccessPost'));
            article.dataset.viewerBookmark = res || "bookmarked";
            btn.textContent = i18n.t('post.savedBtn');
          }
        } catch (err: unknown) {
          announceAssertive(i18n.t('post.error', { error: String(err) }));
        }
      })();
      return;
    }

    if (btn.classList.contains('btn-delete-post')) {
      e.stopPropagation();
      const uri = article.dataset.uri;
      if (!uri) return;
      void confirmDialog(i18n.t('post.deleteConfirm'), i18n.t('post.deleteTitle')).then(async (confirmed) => {
        if (!confirmed) return;
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
        } catch (err: unknown) {
          announceAssertive(i18n.t('post.error', { error: String(err) }));
        }
      });
      return;
    }

    if (btn.classList.contains('btn-mute-thread')) {
      e.stopPropagation();
      const uri = article.dataset.uri;
      if (!uri) return;
      void (async () => {
        try {
          if (article.dataset.viewerThreadMuted === "true") {
            announcePolite(i18n.t('post.unmutingThread'));
            await window.go.services.ModerationService.UnmuteThread(uri);
            article.dataset.viewerThreadMuted = "";
            post.viewerThreadMuted = false;
            btn.textContent = i18n.t('post.actionMute');
            btn.setAttribute('aria-label', i18n.t('post.muteThreadAria'));
            announceAssertive(i18n.t('post.unmuteThreadSuccess'));
          } else {
            announcePolite(i18n.t('post.mutingThread'));
            await window.go.services.ModerationService.MuteThread(uri);
            article.dataset.viewerThreadMuted = "true";
            post.viewerThreadMuted = true;
            btn.textContent = i18n.t('post.actionUnmute');
            btn.setAttribute('aria-label', i18n.t('post.unmuteThreadAria'));
            announceAssertive(i18n.t('post.muteThreadSuccess'));
          }
        } catch (err: unknown) {
          announceAssertive(i18n.t('post.error', { error: String(err) }));
        }
      })();
      return;
    }

    if (btn.classList.contains('btn-share-dm')) {
      e.stopPropagation();
      const uri = article.dataset.uri;
      const cid = article.dataset.cid;
      if (!uri || !cid) return;
      void (async () => {
        const rawTarget = await promptDialog(i18n.t('extended.sharePostDmPrompt'), "", i18n.t('extended.sharePostDm'));
        if (!rawTarget || !rawTarget.trim()) return;
        const cleanTarget = rawTarget.trim().replace(/^@/, '');
        const msgText = (await promptDialog(i18n.t('extended.sharePostDmTextPrompt'), "", i18n.t('extended.sharePostDm'))) || '';
        try {
          const avail = await window.go.services.ChatService.GetConvoAvailability(cleanTarget);
          if (avail && !avail.canChat) {
            announceAssertive(i18n.t('extended.cannotChatUser'));
            return;
          }
          const convo = await window.go.services.ChatService.GetConvoForMembers([cleanTarget]);
          if (convo && convo.id) {
            await window.go.services.ChatService.SendMessageWithEmbed(convo.id, msgText.trim(), uri, cid);
            announceAssertive(i18n.t('extended.sharePostDmSuccess'));
          }
        } catch (err: unknown) {
          announceAssertive(i18n.t('post.error', { error: String(err) }));
        }
      })();
      return;
    }

    if (btn.classList.contains('btn-report-post')) {
      e.stopPropagation();
      const uri = article.dataset.uri;
      const cid = article.dataset.cid;
      if (!uri || !cid) return;
      void (async () => {
        const details = await promptReportDetails(i18n.t('post.reportTitle'));
        if (details) {
          try {
            announcePolite(i18n.t('post.reporting'));
            await window.go.services.ModerationService.ReportPost(uri, cid, details.reasonType, details.reason);
            announceAssertive(i18n.t('post.reportSuccess'));
          } catch (err: unknown) {
            announceAssertive(i18n.t('post.error', { error: String(err) }));
          }
        }
      })();
      return;
    }

    if (btn.classList.contains('btn-hide-reply')) {
      e.stopPropagation();
      const uri = article.dataset.uri;
      if (!uri) return;
      const rootUri = article.dataset.rootUri || article.dataset.replyToUri || uri;
      void (async () => {
        try {
          announcePolite(i18n.t('post.hidingReply'));
          await window.go.services.PostBuilderService.HideReply(rootUri, uri);
          announceAssertive(i18n.t('post.hideReplySuccess'));
        } catch (err: unknown) {
          announceAssertive(i18n.t('post.error', { error: String(err) }));
        }
      })();
      return;
    }

    if (btn.classList.contains('btn-pin-post')) {
      e.stopPropagation();
      const uri = article.dataset.uri;
      const cid = article.dataset.cid;
      if (!uri || !cid) return;
      void (async () => {
        try {
          const currentlyPinned = article.dataset.pinned === "true" || state.loggedInPinnedPostUri === uri;
          if (currentlyPinned) {
            announcePolite(i18n.t('post.unpinning'));
            await window.go.services.SocialService.UnpinPost();
            article.dataset.pinned = "";
            post.isPinned = false;
            if (state.loggedInPinnedPostUri === uri) {
              state.loggedInPinnedPostUri = "";
            }
            btn.textContent = i18n.t('post.actionPin');
            btn.setAttribute('aria-label', i18n.t('post.pinPostAria'));
            announceAssertive(i18n.t('post.unpinSuccess'));
          } else {
            announcePolite(i18n.t('post.pinning'));
            await window.go.services.SocialService.PinPost(uri, cid);
            article.dataset.pinned = "true";
            post.isPinned = true;
            state.loggedInPinnedPostUri = uri;
            btn.textContent = i18n.t('post.actionUnpin');
            btn.setAttribute('aria-label', i18n.t('post.unpinPostAria'));
            announceAssertive(i18n.t('post.pinSuccess'));
          }
        } catch (err: unknown) {
          announceAssertive(i18n.t('post.error', { error: String(err) }));
        }
      })();
      return;
    }

    if (btn.classList.contains('btn-unhide-reply')) {
      e.stopPropagation();
      const uri = article.dataset.uri;
      if (!uri) return;
      const rootUri = article.dataset.rootUri || article.dataset.replyToUri || uri;
      void (async () => {
        try {
          await window.go.services.PostBuilderService.UnhideReply(rootUri, uri);
          announceAssertive(i18n.t('sec2.unhideReplySuccess'));
        } catch (err: unknown) {
          announceAssertive(i18n.t('post.error', { error: String(err) }));
        }
      })();
      return;
    }

    if (btn.classList.contains('btn-hide-post-for-me')) {
      e.stopPropagation();
      const uri = article.dataset.uri;
      if (!uri) return;
      void (async () => {
        try {
          await window.go.services.SocialService.HidePostForMe(uri);
          if (!state.hiddenPostUris.includes(uri)) {
            state.hiddenPostUris.push(uri);
          }
          article.remove();
          announceAssertive(i18n.t('sec2.hidePostForMeSuccess'));
        } catch (err: unknown) {
          announceAssertive(i18n.t('post.error', { error: String(err) }));
        }
      })();
      return;
    }

    if (btn.classList.contains('btn-feed-more')) {
      e.stopPropagation();
      const uri = article.dataset.uri;
      const feedUri = state.currentFeedUri;
      if (!uri || !feedUri) return;
      void (async () => {
        try {
          await window.go.services.FeedService.SendFeedInteraction(feedUri, uri, 'app.bsky.feed.defs#requestMore', post.feedContext || '');
          announceAssertive(i18n.t('sec2.feedInteractionSent'));
        } catch (err: unknown) {
          announceAssertive(i18n.t('post.error', { error: String(err) }));
        }
      })();
      return;
    }

    if (btn.classList.contains('btn-feed-less')) {
      e.stopPropagation();
      const uri = article.dataset.uri;
      const feedUri = state.currentFeedUri;
      if (!uri || !feedUri) return;
      void (async () => {
        try {
          await window.go.services.FeedService.SendFeedInteraction(feedUri, uri, 'app.bsky.feed.defs#requestLess', post.feedContext || '');
          announceAssertive(i18n.t('sec2.feedInteractionSent'));
        } catch (err: unknown) {
          announceAssertive(i18n.t('post.error', { error: String(err) }));
        }
      })();
      return;
    }

    if (btn.classList.contains('btn-toggle-quotes')) {
      e.stopPropagation();
      const uri = article.dataset.uri;
      if (!uri) return;
      void (async () => {
        try {
          const currentlyDisabled = post.embeddingDisabled === true;
          await window.go.services.PostBuilderService.TogglePostQuotes(uri, !currentlyDisabled);
          post.embeddingDisabled = !currentlyDisabled;
          btn.textContent = post.embeddingDisabled ? i18n.t('sec2.enableQuotes') : i18n.t('sec2.disableQuotes');
          announceAssertive(post.embeddingDisabled ? i18n.t('sec2.quotesDisabledSuccess') : i18n.t('sec2.quotesEnabledSuccess'));
        } catch (err: unknown) {
          announceAssertive(i18n.t('post.error', { error: String(err) }));
        }
      })();
      return;
    }

    if (btn.classList.contains('btn-edit-reply-gate')) {
      e.stopPropagation();
      const uri = article.dataset.uri;
      if (!uri) return;
      void (async () => {
        const gateChoices = [
          { value: 'everyone', label: i18n.t('compose.replyEverybody') },
          { value: 'nobody', label: i18n.t('compose.replyNobody') },
          { value: 'mentioned', label: i18n.t('compose.replyMentioned') },
          { value: 'following', label: i18n.t('compose.replyFollowing') },
          { value: 'followers', label: i18n.t('sec2.replyFollowers') },
          { value: 'followers,mentioned', label: i18n.t('sec2.replyFollowersMentioned') },
          { value: 'following,followers', label: i18n.t('sec2.replyFollowingFollowers') },
        ];
        const promptText = `${i18n.t('sec2.editReplyGatePrompt')}\n` + gateChoices.map((c, idx) => `${idx + 1}. ${c.label}`).join('\n');
        const chosenIdxStr = await promptDialog(promptText, '1', i18n.t('sec2.editReplyGate'));
        if (!chosenIdxStr) return;
        const chosenIdx = parseInt(chosenIdxStr, 10) - 1;
        const selected = gateChoices[chosenIdx]?.value || chosenIdxStr.trim();
        if (!selected) return;
        try {
          await window.go.services.PostBuilderService.UpdateThreadgate(uri, selected, []);
          announceAssertive(i18n.t('sec2.editReplyGateSuccess'));
        } catch (err: unknown) {
          announceAssertive(i18n.t('post.error', { error: String(err) }));
        }
      })();
      return;
    }

    if (btn.classList.contains('btn-detach-quote')) {
      e.stopPropagation();
      const ownUri = btn.dataset.ownUri;
      const quoteUri = btn.dataset.quoteUri;
      if (!ownUri || !quoteUri) return;
      void (async () => {
        try {
          await window.go.services.PostBuilderService.DetachQuote(ownUri, quoteUri);
          announceAssertive(i18n.t('sec2.detachQuoteSuccess'));
        } catch (err: unknown) {
          announceAssertive(i18n.t('post.error', { error: String(err) }));
        }
      })();
      return;
    }

    if (btn.classList.contains('btn-reattach-quote')) {
      e.stopPropagation();
      const ownUri = btn.dataset.ownUri;
      const quoteUri = btn.dataset.quoteUri;
      if (!ownUri || !quoteUri) return;
      void (async () => {
        try {
          await window.go.services.PostBuilderService.ReattachQuote(ownUri, quoteUri);
          announceAssertive(i18n.t('sec2.reattachQuoteSuccess'));
        } catch (err: unknown) {
          announceAssertive(i18n.t('post.error', { error: String(err) }));
        }
      })();
    }
  });
}
