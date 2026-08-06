import { formatPostDate } from './format';
import { state } from '../config/state';

export function announcePolite(message: string) {
  const politeAnnouncer = document.getElementById('a11y-announcer') as HTMLDivElement;
  if (politeAnnouncer) politeAnnouncer.textContent = message;
}

export function announceAssertive(message: string) {
  const assertiveAnnouncer = document.getElementById('a11y-assertive') as HTMLDivElement;
  if (assertiveAnnouncer) assertiveAnnouncer.textContent = message;
}

export function formatAuthor(displayName: string, handle: string): string {
    const fmt = state.nameDisplayFormat || 'name';
    const cleanHandle = handle ? (handle.startsWith('@') ? handle : `@${handle}`) : '';
    const cleanName = displayName || (handle ? handle : '');

    if (fmt === 'handle') {
        return cleanHandle || cleanName;
    }
    if (fmt === 'nameAndHandle') {
        if (displayName && handle && displayName !== handle) {
            return `${displayName} (${cleanHandle})`;
        }
        return cleanHandle || cleanName;
    }
    // Default: 'name'
    return cleanName;
}

export function getPostAccessibleLabel(article: HTMLElement): string {
    const text = article.dataset.text || "";
    const authorName = article.dataset.authorName || article.dataset.author || "";
    const authorHandle = article.dataset.authorHandle || "";
    const author = formatAuthor(authorName, authorHandle);
    const createdAt = article.dataset.createdAt || "";
    const dateFormatted = createdAt ? formatPostDate(createdAt) : "";

    let replyContext = "";
    if (article.dataset.replyTo && !article.dataset.replyTo.startsWith('did:')) {
        if (article.dataset.rootAuthor && !article.dataset.rootAuthor.startsWith('did:')) {
            replyContext = `Em resposta a @${article.dataset.replyTo} na thread de @${article.dataset.rootAuthor}: `;
        } else {
            replyContext = `Em resposta a @${article.dataset.replyTo}: `;
        }
    }
    let repostText = "";
    if (article.dataset.repostedBy) {
        repostText = `Repostado por ${article.dataset.repostedBy}: `;
    }
    let quoteText = "";
    if (article.dataset.quoteText || article.dataset.quoteImageAlts || article.dataset.quoteVideoAlt !== undefined || article.dataset.quoteExternalTitle) {
        const qAuthor = article.dataset.quoteAuthorHandle ? `${formatAuthor("", article.dataset.quoteAuthorHandle)}: ` : "";
        const qBody = article.dataset.quoteText ? article.dataset.quoteText : "";
        let qMedia = "";
        if (article.dataset.quoteImageAlts) {
            qMedia += ` [Imagens: ${article.dataset.quoteImageAlts}]`;
        }
        if (article.dataset.quoteVideoAlt !== undefined) {
            const isGif = article.dataset.quoteVideoIsGif === 'true';
            qMedia += ` [${isGif ? 'GIF' : 'Vídeo'}: ${article.dataset.quoteVideoAlt ? `Descrição: ${article.dataset.quoteVideoAlt}` : "Sem descrição alternativa"}]`;
        }
        if (article.dataset.quoteExternalTitle) {
            qMedia += ` [Link: ${article.dataset.quoteExternalTitle}${article.dataset.quoteExternalDesc ? ` - ${article.dataset.quoteExternalDesc}` : ""}]`;
        }
        quoteText = ` Citando ${qAuthor}${qBody}${qMedia}`;
    }
    let altsText = "";
    if (article.dataset.alts) {
        altsText += ` [Imagens: ${article.dataset.alts}]`;
    } else if (article.dataset.hasImage === 'true') {
        altsText += ` [Imagens]`;
    }
    if (article.dataset.hasMainVideo === 'true') {
        const isGif = article.dataset.videoIsGif === 'true';
        altsText += ` [${isGif ? 'GIF' : 'Vídeo'}: ${article.dataset.videoAlt ? `Descrição: ${article.dataset.videoAlt}` : 'Sem descrição alternativa'}]`;
    }
    let metricsText = "";
    if (article.dataset.metrics) {
        metricsText = ` : ${article.dataset.metrics}`;
    }
    let linkText = "";
    if (article.dataset.externalUrl) {
        const title = article.dataset.externalTitle || "";
        const desc = article.dataset.externalDescription || "";
        if (title || desc) {
            linkText = ` Thumbnail: ${title}${desc ? ` - ${desc}` : ""}`;
        } else {
            linkText = ` URL: ${article.dataset.externalUrl}`;
        }
    } else if (article.dataset.text) {
        const urlMatch = article.dataset.text.match(/(https?:\/\/[^\s]+)/);
        if (urlMatch && !article.dataset.text.endsWith(urlMatch[0])) {
            linkText = ` URL do link: ${urlMatch[0]}`;
        }
    }
    let prefix = `${author}${dateFormatted ? `, ${dateFormatted}` : ""}: `;
    if (article.dataset.notifReason) {
        prefix = `${author}${dateFormatted ? `, ${dateFormatted}` : ""}: `;
    }
    return `${repostText}${replyContext}${prefix}${text}${linkText}${altsText}${quoteText}${metricsText}`;
}

export function announcePost(article: HTMLElement) {
    if (article.dataset.uri) {
       announcePolite(getPostAccessibleLabel(article));
    }
}
