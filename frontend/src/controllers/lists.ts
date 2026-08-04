import { state } from '../config/state';
import { announcePolite, announceAssertive } from '../utils/a11y';
import { confirmDialog, promptDialog } from '../utils/dialog';
import { createPostArticle } from '../components/post';
import { createListArticle } from '../components/list';
import { loadProfile } from './profile';

export async function loadListsTab(loadMore = false) {
    const container = document.getElementById('panel-lists') as HTMLDivElement;
    if (!container) return;

    if (!loadMore) {
        state.listsCursor = "";
        state.currentPosts = [];
        container.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px; flex-wrap:wrap; gap:10px;">
                <h2 style="margin:0;">Gerenciamento de Listas</h2>
                <div style="display:flex; gap:10px;">
                    <button id="btn-create-list" type="button" style="padding:8px 14px; font-weight:bold;">+ Criar Nova Lista</button>
                    <button id="btn-create-starter-pack" type="button" style="padding:8px 14px; font-weight:bold;">+ Criar Starter Pack</button>
                </div>
            </div>
            <div id="lists-items-container" aria-busy="true">Carregando listas...</div>
        `;
        document.getElementById('btn-create-list')?.addEventListener('click', () => showCreateListModal());
        document.getElementById('btn-create-starter-pack')?.addEventListener('click', () => showCreateStarterPackModal());
    }

    const itemsContainer = document.getElementById('lists-items-container') as HTMLDivElement;
    if (!itemsContainer) return;

    try {
        const handle = state.loggedInHandle || state.currentHandle;
        const res = await window.go.services.SocialService.GetActorLists(handle, state.listsCursor);
        itemsContainer.setAttribute('aria-busy', 'false');
        
        if (!loadMore) {
            itemsContainer.innerHTML = '';
        }

        if (res && res.lists && res.lists.length > 0) {
            state.listsCursor = res.cursor || "";
            res.lists.forEach((list: any) => {
                const article = createListArticle(list, {
                    onRefresh: () => loadListsTab(false),
                    targetContainerId: 'panel-lists',
                    onBack: () => loadListsTab(false)
                });
                itemsContainer.appendChild(article);
                state.currentPosts.push(article);
            });
            announcePolite(`${state.currentPosts.length} listas exibidas.`);
        } else if (!loadMore) {
            itemsContainer.innerHTML = '<p>Você ainda não possui nenhuma lista criada.</p>';
            announcePolite("Nenhuma lista encontrada.");
        }
        state.tabStates['lists'].loaded = true;
    } catch (err: unknown) {
        console.error(err);
        itemsContainer.setAttribute('aria-busy', 'false');
        announceAssertive("Erro ao carregar listas.");
    }
}

export async function showCreateListModal() {
    const name = await promptDialog("Nome da nova lista:", "", "Criar Lista");
    if (!name) return;

    const desc = await promptDialog("Descrição da lista (opcional):", "", "Criar Lista - Descrição") || "";
    const isMod = await confirmDialog("Esta lista será para fins de MODERAÇÃO? (Clique 'Cancelar' para Curadoria)", "Tipo de Lista");
    const purpose = isMod ? "app.bsky.graph.defs#modlist" : "app.bsky.graph.defs#curatelist";

    try {
        announcePolite("Criando lista...");
        await window.go.services.SocialService.CreateList(name, purpose, desc);
        announceAssertive(`Lista "${name}" criada com sucesso.`);
        loadListsTab(false);
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        announceAssertive("Erro ao criar lista: " + msg);
    }
}

export async function showEditListModal(list: any, onRefresh?: () => void) {
    const newName = await promptDialog("Novo nome da lista:", list.name, "Editar Lista");
    if (!newName) return;

    const newDesc = await promptDialog("Nova descrição:", list.description || "", "Editar Lista") || "";
    try {
        announcePolite("Atualizando lista...");
        await window.go.services.SocialService.EditList(list.uri, newName, list.purpose, newDesc);
        announceAssertive("Lista atualizada com sucesso.");
        if (onRefresh) {
            onRefresh();
        } else {
            loadListsTab(false);
        }
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        announceAssertive("Erro ao editar lista: " + msg);
    }
}

export async function viewListMembers(listUri: string, listName: string) {
    try {
        announcePolite(`Carregando membros da lista "${listName}"...`);
        const res = await window.go.services.SocialService.GetListMembers(listUri, "");
        
        const dialog = document.createElement('dialog');
        dialog.className = 'custom-dialog modal-content';
        dialog.setAttribute('role', 'dialog');
        dialog.setAttribute('aria-labelledby', 'list-members-title');
        dialog.style.cssText = 'padding:20px; border-radius:8px; border:1px solid var(--border-color, #444); background:var(--bg-color, #1e1e2e); color:var(--text-color, #fff); max-width:500px; width:90%; max-height:80vh; overflow-y:auto;';

        let membersHtml = '';
        if (res && res.profiles && res.profiles.length > 0) {
            membersHtml = res.profiles.map((p: any) => `
                <div class="post-item" style="display:flex; justify-content:space-between; align-items:center; padding:10px; margin-bottom:8px; background:#121212; border-radius:6px;">
                    <div>
                        <strong>${p.displayName || p.handle}</strong>
                        <small style="display:block; color:#aaa;">@${p.handle}</small>
                    </div>
                    <button type="button" class="btn-open-member-profile" data-handle="${p.handle}" style="padding:4px 10px;">Ver Perfil</button>
                </div>
            `).join('');
        } else {
            membersHtml = '<p>Nenhum membro nesta lista.</p>';
        }

        dialog.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px; border-bottom:1px solid #333; padding-bottom:10px;">
                <h3 id="list-members-title" style="margin:0;">Membros da Lista "${listName}"</h3>
                <button type="button" id="btn-close-members-modal" style="padding:4px 10px;">Fechar</button>
            </div>
            <div id="members-list-body">${membersHtml}</div>
        `;

        document.body.appendChild(dialog);
        announcePolite(`Membros da lista "${listName}" carregados.`);

        const closeBtn = dialog.querySelector('#btn-close-members-modal') as HTMLButtonElement;
        const cleanup = () => {
            dialog.close();
            dialog.remove();
        };

        closeBtn?.addEventListener('click', cleanup);
        dialog.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                cleanup();
            }
        });

        dialog.querySelectorAll('.btn-open-member-profile').forEach((btn) => {
            btn.addEventListener('click', (e) => {
                const handle = (e.currentTarget as HTMLButtonElement).dataset.handle;
                if (handle) {
                    cleanup();
                    state.currentHandle = handle;
                    state.profileTabMode = 'posts';
                    announcePolite(`Abrindo perfil de @${handle}`);
                    loadProfile();
                }
            });
        });

        dialog.showModal();
        closeBtn?.focus();
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        announceAssertive("Erro ao carregar membros da lista: " + msg);
    }
}

export async function viewListFeed(listUri: string, listName: string, targetContainerId = 'panel-lists', onBack?: () => void) {
    const container = document.getElementById(targetContainerId) as HTMLDivElement;
    if (!container) return;

    container.innerHTML = `
        <div style="margin-bottom:15px; display:flex; justify-content:space-between; align-items:center;">
            <button id="btn-back-lists" type="button" style="padding:6px 14px; font-weight:bold;">Voltar</button>
            <h3 style="margin:0;">Feed da Lista: ${listName}</h3>
        </div>
        <div id="list-feed-container" aria-busy="true">Carregando feed da lista...</div>
    `;

    document.getElementById('btn-back-lists')?.addEventListener('click', () => {
        if (onBack) {
            onBack();
        } else {
            loadListsTab(false);
        }
    });

    const feedContainer = document.getElementById('list-feed-container') as HTMLDivElement;
    try {
        const res = await window.go.services.FeedService.GetListFeed(listUri, "", 30);
        feedContainer.setAttribute('aria-busy', 'false');
        feedContainer.innerHTML = '';
        state.currentPosts = [];

        if (res && res.posts && res.posts.length > 0) {
            res.posts.forEach((post: any, idx: number) => {
                const article = createPostArticle(post, idx);
                feedContainer.appendChild(article);
                state.currentPosts.push(article);
            });
            announcePolite(`${res.posts.length} postagens carregadas do feed da lista.`);
        } else {
            feedContainer.innerHTML = '<p>Nenhuma publicação recente nesta lista.</p>';
            announcePolite("Nenhuma publicação encontrada no feed da lista.");
        }
    } catch (err: unknown) {
        console.error(err);
        feedContainer.setAttribute('aria-busy', 'false');
        announceAssertive("Erro ao carregar feed da lista.");
    }
}

export async function showCreateStarterPackModal() {
    try {
        const handle = state.loggedInHandle || state.currentHandle;
        const listsRes = await window.go.services.SocialService.GetActorLists(handle, "");
        if (!listsRes || !listsRes.lists || listsRes.lists.length === 0) {
            announceAssertive("Você precisa ter pelo menos uma lista de curadoria criada para gerar um Starter Pack.");
            return;
        }

        const name = await promptDialog("Nome do seu Starter Pack:", "", "Criar Starter Pack");
        if (!name) return;

        const desc = await promptDialog("Descrição do Starter Pack:", "", "Criar Starter Pack - Descrição") || "";
        const options = listsRes.lists.map((l: any, i: number) => `${i + 1}. ${l.name}`).join("\n");
        const chosen = await promptDialog(`Escolha o número da lista base para este Starter Pack:\n\n${options}`, "1", "Selecionar Lista");
        if (!chosen) return;

        const idx = parseInt(chosen, 10) - 1;
        if (idx >= 0 && idx < listsRes.lists.length) {
            const selectedList = listsRes.lists[idx];
            announcePolite("Criando Starter Pack...");
            await window.go.services.SocialService.CreateStarterPack(name, desc, selectedList.uri);
            announceAssertive(`Starter Pack "${name}" criado com sucesso!`);
            loadListsTab(false);
        } else {
            announceAssertive("Opção de lista inválida.");
        }
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        announceAssertive("Erro ao criar Starter Pack: " + msg);
    }
}
