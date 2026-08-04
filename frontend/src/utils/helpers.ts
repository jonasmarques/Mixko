const BSKY_HOST = /^https?:\/\/(?:www\.)?bsky\.app/i;

interface BskyRoute {
    type: 'profile' | 'post' | 'feed' | 'list' | 'starterpack';
    handle: string;
    rkey?: string;
}

function parseBskyUrl(url: string): BskyRoute | null {
    try {
        const u = new URL(url);
        if (!BSKY_HOST.test(u.origin + u.pathname.slice(0, 0) + url.split('?')[0].split('#')[0])) return null;
        if (!BSKY_HOST.test(url)) return null;
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

function bskyRouteAttrs(route: BskyRoute, url: string): string {
    const base = `data-bsky-route="${route.type}" data-handle="${route.handle}"`;
    const rkey = route.rkey ? ` data-rkey="${route.rkey}"` : '';
    return `${base}${rkey} data-original-url="${url}"`;
}

function bskyRoutLabel(url: string): string {
    return url;
}

export function linkify(text: string): string {
    if (!text) return '';

    const tokenRegex = /(https?:\/\/[^\s<>"]+)|(#[\p{L}\p{N}_]+)/gu;

    return text.replace(tokenRegex, (_match, urlMatch: string | undefined, hashMatch: string | undefined) => {
        if (hashMatch) {
            const tag = hashMatch.slice(1);
            return `<a href="#" class="bsky-link bsky-hashtag" data-bsky-route="hashtag" data-tag="${tag}" style="color: var(--brand-color, #0066cc);">${hashMatch}</a>`;
        }

        const url = urlMatch!;
        const route = parseBskyUrl(url);

        if (route) {
            return `<a href="#" class="bsky-link bsky-internal" ${bskyRouteAttrs(route, url)} style="color: var(--brand-color, #0066cc);">${bskyRoutLabel(url)}</a>`;
        }

        const safeUrl = url.replace(/'/g, '%27');
        return `<a href="#" class="bsky-link bsky-external" onclick="(window as any).runtime.BrowserOpenURL('${safeUrl}'); return false;" style="color: var(--brand-color, #0066cc);">${url}</a>`;
    });
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

