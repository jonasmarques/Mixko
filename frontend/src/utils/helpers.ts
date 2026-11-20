/**
 * Hosts whose links the app opens internally.
 *
 * Compared against `URL.hostname` exactly. A prefix match would accept
 * `bsky.app.evil.com`, letting an attacker-chosen host drive internal routing.
 */
const INTERNAL_HOSTS = new Set(['bsky.app', 'www.bsky.app']);

/**
 * Escapes text for interpolation into HTML.
 *
 * Everything the app renders comes from other users: post text, display names,
 * alt text, link titles, chat messages. Interpolating any of it into innerHTML
 * unescaped lets a crafted post run script inside the webview, which has access
 * to the Go bindings on `window.go`. Every dynamic value in a template literal
 * must go through this.
 */
export function esc(value: unknown): string {
    if (value === null || value === undefined) return '';
    return String(value).replace(/[&<>"']/g, (c) => {
        switch (c) {
            case '&': return '&amp;';
            case '<': return '&lt;';
            case '>': return '&gt;';
            case '"': return '&quot;';
            default: return '&#39;';
        }
    });
}

/**
 * Returns the URL only if it uses a scheme that is safe to put in an `href` or
 * `src`. Anything else (notably `javascript:`) collapses to `#`.
 */
export function safeUrl(url: unknown): string {
    const raw = String(url ?? '').trim();
    if (/^(https?:|data:image\/)/i.test(raw)) return raw;
    return '#';
}

/** Escapes a URL for use inside an HTML attribute, rejecting unsafe schemes. */
export function escUrl(url: unknown): string {
    return esc(safeUrl(url));
}

interface AppRoute {
    type: 'profile' | 'post' | 'feed' | 'list' | 'starterpack';
    handle: string;
    rkey?: string;
}

/**
 * Recognises the bsky.app URLs the app can open internally instead of handing
 * off to the system browser.
 */
export function parseAppUrl(url: string): AppRoute | null {
    try {
        const u = new URL(url);
        if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
        if (!INTERNAL_HOSTS.has(u.hostname.toLowerCase())) return null;

        const parts = u.pathname.replace(/^\//, '').split('/');

        // /profile/{handle}
        // /profile/{handle}/post/{rkey}
        // /profile/{handle}/feed/{rkey}
        // /profile/{handle}/lists/{rkey}
        if (parts[0] === 'profile' && parts[1]) {
            const handle = parts[1];
            if (!parts[2]) return { type: 'profile', handle };
            if (parts[2] === 'post' && parts[3]) return { type: 'post', handle, rkey: parts[3] };
            if (parts[2] === 'feed' && parts[3]) return { type: 'feed', handle, rkey: parts[3] };
            if (parts[2] === 'lists' && parts[3]) return { type: 'list', handle, rkey: parts[3] };
        }

        // /starter-pack/{handle}/{rkey}
        if (parts[0] === 'starter-pack' && parts[1] && parts[2]) {
            return { type: 'starterpack', handle: parts[1], rkey: parts[2] };
        }

        return null;
    } catch {
        return null;
    }
}

function routeAttrs(route: AppRoute, url: string): string {
    const rkey = route.rkey ? ` data-rkey="${esc(route.rkey)}"` : '';
    return `data-route="${esc(route.type)}" data-handle="${esc(route.handle)}"${rkey} data-original-url="${escUrl(url)}"`;
}

const LINK_STYLE = 'color: var(--brand-color, #0066cc);';

function escWithBreaks(value: string): string {
    return esc(value).replace(/\r?\n/g, '<br>');
}

function splitUrlTrailingPunctuation(raw: string): { clean: string; trailing: string } {
    let clean = raw;
    let trailing = '';
    while (clean.length > 0) {
        const last = clean[clean.length - 1];
        if ('. ,;:?!"\'>]'.includes(last)) {
            trailing = last + trailing;
            clean = clean.slice(0, -1);
            continue;
        }
        if (last === ')') {
            const opens = (clean.match(/\(/g) || []).length;
            const closes = (clean.match(/\)/g) || []).length;
            if (closes > opens) {
                trailing = last + trailing;
                clean = clean.slice(0, -1);
                continue;
            }
        }
        break;
    }
    return { clean, trailing };
}

/**
 * Turns URLs, bare domains, @mentions, hashtags, and line breaks in plain text into HTML.
 *
 * The text is tokenised first and each piece is escaped as it is appended, so
 * markup in the source text is rendered literally and never interpreted.
 */
export function linkify(text: string): string {
    if (!text) return '';

    const tokenRegex = /(https?:\/\/[^\s<>"]+)|(@(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,63})|(#[\p{L}\p{N}_-]+)|(\b(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+(?:com|org|net|edu|gov|io|co|app|dev|me|info|biz|tv|gg|xyz|social|br|pt|es|uk|de|fr|it|ca|au|jp|kr|cn|in|ru|mx|ar|cl)(?:\/[^\s<>"]*)?)/giu;

    let out = '';
    let cursor = 0;

    for (const match of text.matchAll(tokenRegex)) {
        const index = match.index ?? 0;
        const prevChar = index > 0 ? text[index - 1] : '';
        const [token, urlMatch, mentionMatch, hashMatch, bareDomainMatch] = match;

        const hasBoundaryBefore = index === 0 || /[\s([{"'«“‘]/.test(prevChar);
        if ((mentionMatch || hashMatch || bareDomainMatch) && !hasBoundaryBefore) {
            continue;
        }

        out += escWithBreaks(text.slice(cursor, index));

        if (mentionMatch) {
            const handle = mentionMatch.slice(1);
            out += `<a href="#" class="app-link link-internal link-mention" data-route="profile" data-handle="${esc(handle)}" style="${LINK_STYLE}">${esc(mentionMatch)}</a>`;
        } else if (hashMatch) {
            const tag = hashMatch.slice(1);
            out += `<a href="#" class="app-link link-hashtag" data-route="hashtag" data-tag="${esc(tag)}" style="${LINK_STYLE}">${esc(hashMatch)}</a>`;
        } else if (urlMatch || bareDomainMatch) {
            const rawToken = urlMatch || bareDomainMatch;
            const { clean, trailing } = splitUrlTrailingPunctuation(rawToken);
            const fullUrl = urlMatch ? clean : `https://${clean}`;
            const route = parseAppUrl(fullUrl);

            if (route) {
                out += `<a href="#" class="app-link link-internal" ${routeAttrs(route, fullUrl)} style="${LINK_STYLE}">${esc(clean)}</a>${escWithBreaks(trailing)}`;
            } else {
                out += `<a href="#" class="app-link link-external" data-external-url="${escUrl(fullUrl)}" style="${LINK_STYLE}">${esc(clean)}</a>${escWithBreaks(trailing)}`;
            }
        }

        cursor = index + token.length;
    }

    out += escWithBreaks(text.slice(cursor));
    return out;
}

/**
 * Renders a clickable @handle or author name link that navigates to the user's profile.
 */
export function renderProfileLink(handle: string, label?: string, extraClass = ''): string {
    const rawHandle = String(handle ?? '').trim().replace(/^@/, '');
    const display = label !== undefined && label !== '' ? label : `@${rawHandle}`;
    if (!rawHandle) {
        return esc(display);
    }
    const cls = ['app-link', 'link-internal', 'profile-handle-link', extraClass].filter(Boolean).join(' ');
    return `<a href="#" class="${esc(cls)}" data-route="profile" data-handle="${esc(rawHandle)}" style="${LINK_STYLE}">${esc(display)}</a>`;
}

interface IntlSegmenterInstance {
    segment(input: string): Iterable<{ segment: string }>;
}

interface IntlWithSegmenter {
    Segmenter?: new (locales?: string | string[], options?: { granularity?: 'grapheme' | 'word' | 'sentence' }) => IntlSegmenterInstance;
}

const SegmenterCtor = typeof Intl !== 'undefined' ? (Intl as unknown as IntlWithSegmenter).Segmenter : undefined;
const graphemeSegmenter: IntlSegmenterInstance | null = SegmenterCtor
    ? new SegmenterCtor(undefined, { granularity: 'grapheme' })
    : null;

/**
 * Counts Unicode user-perceived characters (grapheme clusters), matching ATProto's 300-grapheme post limit.
 */
export function countGraphemes(text: string): number {
    if (!text) return 0;
    if (graphemeSegmenter) {
        let count = 0;
        for (const _ of graphemeSegmenter.segment(text)) {
            count++;
        }
        return count;
    }
    return Array.from(text).length;
}

/**
 * Reads an image as a JPEG data URL, at most 2000px on its longest side.
 *
 * The browser applies the EXIF rotation while decoding. The Go re-encoder does
 * not, and drops the tag, so a portrait phone photo would be posted sideways.
 */
export async function imageFileToDataUrl(file: File): Promise<string> {
    try {
        const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
        const scale = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(bitmap.width * scale);
        canvas.height = Math.round(bitmap.height * scale);
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('no 2d context');
        // JPEG has no transparency; without this, clear areas come out black.
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        bitmap.close();
        return canvas.toDataURL('image/jpeg', 0.92);
    } catch {
        // An image the webview cannot decode still goes through untouched.
        return getFilePathOrDataUrl(file);
    }
}

export function getFilePathOrDataUrl(file: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const filePath = (file as unknown as { path?: string }).path;
        if (filePath && typeof filePath === 'string' && filePath.trim() !== '') {
            resolve(filePath);
        } else {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = error => reject(error);
            reader.readAsDataURL(file);
        }
    });
}
