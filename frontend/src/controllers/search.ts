import { state } from '../config/state';
import { announcePolite, announceAssertive } from '../utils/a11y';
import { createPostArticle } from '../components/post';
import { switchTab } from './tabs';

export function setupSearch() {
    const btnSearch = document.getElementById('btn-search') as HTMLButtonElement;
    if (btnSearch) {
        btnSearch.addEventListener('click', async () => {
            const input = document.getElementById('search-input') as HTMLInputElement;
            const query = input.value.trim();
            if (!query) return;
            
            const typeRadios = document.getElementsByName('search-type');
            let searchType = 'posts';
            typeRadios.forEach((r: any) => { if (r.checked) searchType = r.value; });
            
            const container = document.getElementById('search-results') as HTMLDivElement;
            container.innerHTML = '<p>Buscando...</p>';
            container.setAttribute('aria-busy', 'true');
            announcePolite(`Buscando por ${query}...`);
            state.currentPosts = [];
            
            try {
                if (searchType === 'posts') {
                    const langSelect = document.getElementById('search-lang') as HTMLSelectElement;
                    const sortSelect = document.getElementById('search-sort') as HTMLSelectElement;
                    const authorInput = document.getElementById('search-author') as HTMLInputElement;

                    const lang = langSelect ? langSelect.value : "";
                    const sort = sortSelect ? sortSelect.value : "latest";
                    const author = authorInput ? authorInput.value.trim() : "";

                    const filter = {
                        Query: query,
                        Author: author,
                        Lang: lang,
                        Sort: sort,
                        Since: "",
                        Until: "",
                        Cursor: ""
                    };
                    const res = await window.go.services.SearchService.SearchPosts(filter);
                    container.innerHTML = '';
                    if (res && res.posts && res.posts.length > 0) {
                        res.posts.forEach((post: any) => {
                            const article = createPostArticle(post, state.currentPosts.length);
                            container.appendChild(article);
                            state.currentPosts.push(article);
                        });
                        announcePolite(`Encontrados ${res.posts.length} posts.`);
                    } else {
                        container.innerHTML = '<p>Nenhum post encontrado.</p>';
                        announcePolite('Nenhum post encontrado.');
                    }
                } else {
                    const res = await window.go.services.SearchService.SearchProfiles(query, "");
                    container.innerHTML = '';
                    if (res && res.profiles && res.profiles.length > 0) {
                        res.profiles.forEach((prof: any) => {
                            const div = document.createElement('article');
                            div.classList.add('post-item');
                            div.setAttribute('tabindex', '0');
                            div.dataset.text = `Perfil: ${prof.displayName}. ${prof.description}`;
                            div.innerHTML = `<h3>${prof.displayName} <small>(@${prof.handle})</small></h3><p>${prof.description}</p>`;
                            
                            div.dataset.index = state.currentPosts.length.toString();
                            div.addEventListener('focus', () => {
                                const iStr = div.dataset.index;
                                if (iStr !== undefined) state.focusedPostIndex = parseInt(iStr, 10);
                            });
                            
                            div.addEventListener('keydown', (e) => {
                                if (e.key === 'Enter') {
                                    state.currentHandle = prof.handle;
                                    state.profileTabMode = 'posts';
                                    announcePolite(`Abrindo perfil de @${state.currentHandle}`);
                                    switchTab('profile');
                                }
                            });
                            div.addEventListener('click', () => {
                                state.currentHandle = prof.handle;
                                state.profileTabMode = 'posts';
                                announcePolite(`Abrindo perfil de @${state.currentHandle}`);
                                switchTab('profile');
                            });
                            
                            container.appendChild(div);
                            state.currentPosts.push(div);
                        });
                        announcePolite(`Encontrados ${res.profiles.length} perfis.`);
                    } else {
                        container.innerHTML = '<p>Nenhum perfil encontrado.</p>';
                        announcePolite('Nenhum perfil encontrado.');
                    }
                }
            } catch (err: any) {
                console.error(err);
                container.innerHTML = '<p>Erro na busca.</p>';
                announceAssertive("Erro ao buscar.");
            } finally {
                container.setAttribute('aria-busy', 'false');
                state.tabStates['search'].loaded = true;
            }
        });
        
        // Bind Enter key in search input to trigger search
        document.getElementById('search-input')?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') btnSearch.click();
        });
    }
}
