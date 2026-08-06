import { announcePolite } from '../utils/a11y';

const KLIPY_API_KEY = '7RT7Bt5gNsatGnkoxIUjYknENTEBMHtcnup2LeLJQRFDM5JZ37OEN4OlcowrK4eq';
const BASE_URL = `https://api.klipy.com/api/v1/${KLIPY_API_KEY}/gifs`;

let currentCallback: ((url: string, alt: string) => void) | null = null;
let searchTimeout: any = null;

export function initGifModal() {
    const modal = document.getElementById('gif-picker-modal') as HTMLDialogElement;
    const btnClose = document.getElementById('btn-close-gif-picker') as HTMLButtonElement;
    const searchInput = document.getElementById('gif-search-input') as HTMLInputElement;

    if (btnClose) {
        btnClose.addEventListener('click', () => {
            modal.close();
        });
    }

    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const query = (e.target as HTMLInputElement).value.trim();
            if (searchTimeout) clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                if (query) {
                    searchGifs(query);
                } else {
                    loadTrendingGifs();
                }
            }, 500);
        });
    }
}

export function openGifPicker(onSelect: (url: string, alt: string) => void) {
    currentCallback = onSelect;
    const modal = document.getElementById('gif-picker-modal') as HTMLDialogElement;
    const searchInput = document.getElementById('gif-search-input') as HTMLInputElement;
    if (modal) {
        modal.showModal();
        if (searchInput) {
            searchInput.value = '';
            searchInput.focus();
        }
        loadTrendingGifs();
    }
}

async function loadTrendingGifs() {
    try {
        const grid = document.getElementById('gif-results-grid');
        if (grid) grid.innerHTML = '<p>Carregando tendências...</p>';
        announcePolite('Carregando GIFs em tendência');
        
        // Use the Klipy native API endpoints
        const res = await fetch(`${BASE_URL}/trending?limit=20`);
        if (!res.ok) throw new Error('Falha ao buscar GIFs');
        const data = await res.json();
        let items = [];
        if (data.data && Array.isArray(data.data.data)) {
            items = data.data.data;
        } else if (data.data && Array.isArray(data.data)) {
            items = data.data;
        } else if (Array.isArray(data.results)) {
            items = data.results;
        }
        renderGifs(items);
    } catch (e) {
        console.error(e);
        const grid = document.getElementById('gif-results-grid');
        if (grid) grid.innerHTML = '<p>Erro ao carregar GIFs.</p>';
    }
}

async function searchGifs(query: string) {
    try {
        const grid = document.getElementById('gif-results-grid');
        if (grid) grid.innerHTML = '<p>Buscando...</p>';
        announcePolite(`Buscando GIFs para ${query}`);
        
        const res = await fetch(`${BASE_URL}/search?q=${encodeURIComponent(query)}&limit=20`);
        if (!res.ok) throw new Error('Falha ao buscar GIFs');
        const data = await res.json();
        let items = [];
        if (data.data && Array.isArray(data.data.data)) {
            items = data.data.data;
        } else if (data.data && Array.isArray(data.data)) {
            items = data.data;
        } else if (Array.isArray(data.results)) {
            items = data.results;
        }
        renderGifs(items);
    } catch (e) {
        console.error(e);
        const grid = document.getElementById('gif-results-grid');
        if (grid) grid.innerHTML = '<p>Erro ao buscar GIFs.</p>';
    }
}

function renderGifs(items: any[]) {
    const grid = document.getElementById('gif-results-grid');
    if (!grid) return;
    grid.innerHTML = '';
    
    if (!items || items.length === 0) {
        grid.innerHTML = '<p>Nenhum GIF encontrado.</p>';
        return;
    }

    items.forEach((item) => {
        // Handle both Klipy native and Tenor-compatible response formats
        let mp4Url = '';
        let thumbUrl = '';
        let title = item.title || item.content_description || 'GIF Animado';

        if (item.file) {
            // Klipy Native Format
            mp4Url = item.file.hd?.mp4?.url || item.file.md?.mp4?.url || item.file.hd?.gif?.url || '';
            thumbUrl = item.file.sm?.webp?.url || item.file.xs?.gif?.url || item.file.sm?.gif?.url || mp4Url;
        } else if (item.media && item.media.length > 0) {
            // Tenor compatibility format
            const media = item.media[0];
            if (media.mp4) mp4Url = media.mp4.url;
            else if (media.tinymp4) mp4Url = media.tinymp4.url;
            else if (media.gif) mp4Url = media.gif.url;
            
            if (media.nanogif) thumbUrl = media.nanogif.url;
            else if (media.tinygif) thumbUrl = media.tinygif.url;
            else thumbUrl = mp4Url;
        } else if (item.images) {
            // Giphy/Klipy format
            mp4Url = item.images.original?.mp4 || item.images.original?.url || '';
            thumbUrl = item.images.fixed_height_small?.url || item.images.preview_gif?.url || mp4Url;
        }

        if (!mp4Url) return; // Skip if we can't find a valid URL

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.style.border = 'none';
        btn.style.padding = '0';
        btn.style.background = 'transparent';
        btn.style.cursor = 'pointer';
        btn.style.borderRadius = '4px';
        btn.style.overflow = 'hidden';
        btn.setAttribute('aria-label', `Selecionar GIF: ${title}`);
        
        const img = document.createElement('img');
        img.src = thumbUrl;
        img.alt = title;
        img.style.width = '100%';
        img.style.height = '120px';
        img.style.objectFit = 'cover';
        img.style.display = 'block';
        
        btn.appendChild(img);
        btn.addEventListener('click', () => {
            if (currentCallback) {
                currentCallback(mp4Url, title);
            }
            const modal = document.getElementById('gif-picker-modal') as HTMLDialogElement;
            if (modal) modal.close();
        });
        
        grid.appendChild(btn);
    });
    
    announcePolite(`${items.length} GIFs encontrados.`);
}
