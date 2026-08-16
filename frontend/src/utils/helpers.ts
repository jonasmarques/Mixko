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

/**
 * Turns URLs and hashtags in plain text into anchors.
 *
 * The text is tokenised first and each piece is escaped as it is appended, so
 * markup in the source text is rendered literally and never interpreted.
 */
export function linkify(text: string): string {
    if (!text) return '';

    const tokenRegex = /(https?:\/\/[^\s<>"]+)|(#[\p{L}\p{N}_]+)/gu;

    let out = '';
    let cursor = 0;

    for (const match of text.matchAll(tokenRegex)) {
        const index = match.index ?? 0;
        out += esc(text.slice(cursor, index));

        const [token, urlMatch, hashMatch] = match;

        if (hashMatch) {
            const tag = hashMatch.slice(1);
            out += `<a href="#" class="app-link link-hashtag" data-route="hashtag" data-tag="${esc(tag)}" style="${LINK_STYLE}">${esc(hashMatch)}</a>`;
        } else {
            const url = urlMatch;
            const route = parseAppUrl(url);

            if (route) {
                out += `<a href="#" class="app-link link-internal" ${routeAttrs(route, url)} style="${LINK_STYLE}">${esc(url)}</a>`;
            } else {
                // Opened through the Go runtime by the delegated handler in
                // link_router.ts; an inline onclick would be both fragile and
                // an injection point.
                out += `<a href="#" class="app-link link-external" data-external-url="${escUrl(url)}" style="${LINK_STYLE}">${esc(url)}</a>`;
            }
        }

        cursor = index + token.length;
    }

    out += esc(text.slice(cursor));
    return out;
}

export function getFilePathOrDataUrl(file: File): Promise<string> {
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
