import { state } from '../config/state';
import { announcePolite, announceAssertive } from '../utils/a11y';
import { createPostArticle } from '../components/post';
import { createListArticle } from '../components/list';
import { confirmDialog, promptDialog } from '../utils/dialog';
import { switchTab } from './tabs';
import { getFilePathOrDataUrl } from '../utils/helpers';

export async function loadProfile(loadMore = false, keepFocus = false) {
  const container = document.getElementById('profile-card') as HTMLDivElement;
  container.setAttribute('aria-busy', 'true');
  let targetUri = "";
  if (!loadMore && keepFocus && state.focusedPostIndex >= 0 && state.focusedPostIndex < state.currentPosts.length) {
    targetUri = state.currentPosts[state.focusedPostIndex]?.dataset.uri || "";
  }
  
  if (!loadMore) {
      state.profileCursor = "";
      state.currentPosts = [];
      container.innerHTML = '<div style="padding: 20px;">Carregando perfil...</div>';
      const contentContainer = document.getElementById('profile-content');
      if (contentContainer) contentContainer.innerHTML = '';
  }
  
  try {
    if (!loadMore) {
        const res = await window.go.services.SocialService.GetProfile(state.currentHandle);
        if (res) {
          let actionsHtml = "";
          if (!res.isMe) {
              let followBtn = "";
              if (res.viewerFollowing) {
                 followBtn = `<button id="btn-unfollow" data-uri="${res.viewerFollowing}" aria-label="Deixar de seguir ${res.displayName}">Deixar de Seguir (U)</button>`;
              } else {
                 followBtn = `<button id="btn-follow" data-did="${res.did}" aria-label="Seguir ${res.displayName}">Seguir (S)</button>`;
              }

              let muteBtn = "";
              if (res.viewerMuted) {
                muteBtn = `<button id="btn-unmute" data-did="${res.did}" aria-label="Desmutar">Desmutar (M)</button>`;
              } else {
                muteBtn = `<button id="btn-mute" data-handle="${res.handle}" data-did="${res.did}" aria-label="Silenciar">Silenciar (M)</button>`;
              }

              let blockBtn = "";
              if (res.viewerBlocking) {
                blockBtn = `<button id="btn-unblock" data-did="${res.did}" aria-label="Desbloquear">Desbloquear (B)</button>`;
              } else {
                blockBtn = `<button id="btn-block" data-did="${res.did}" aria-label="Bloquear">Bloquear (B)</button>`;
              }

              let labelerBtn = "";
              if (res.isLabeler) {
                  if (res.viewerSubscribedLabeler) {
                      labelerBtn = `<button id="btn-unsubscribe-labeler" data-did="${res.did}" style="background-color: #ef4444; color: white;" aria-label="Cancelar assinatura do rotulador">Cancelar Assinatura de Rótulos</button>`;
                  } else {
                      labelerBtn = `<button id="btn-subscribe-labeler" data-did="${res.did}" style="background-color: #10b981; color: white;" aria-label="Assinar rotulador de conteúdo">Assinar Rotulador</button>`;
                  }
              }

              actionsHtml = `
                ${followBtn}
                ${muteBtn}
                ${blockBtn}
                ${labelerBtn}
                <button id="btn-message" data-did="${res.did}" aria-label="Enviar Mensagem">Mensagem</button>
                <button id="btn-manage-lists" data-did="${res.did}" aria-label="Gerenciar em Listas">Gerenciar em Listas</button>
                <button id="btn-report-user" data-did="${res.did}" aria-label="Denunciar Usuário">Denunciar</button>
              `;

              document.getElementById('btn-manage-lists')?.addEventListener('click', async (e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  try {
                      announcePolite("Carregando suas listas...");
                      const listsRes = await window.go.services.SocialService.GetActorLists(state.loggedInHandle, "");
                      if (!listsRes || !listsRes.lists || listsRes.lists.length === 0) {
                          announceAssertive("Você ainda não possui nenhuma lista criada. Crie uma na aba de Listas (Alt+9).");
                          return;
                      }
                      const options = listsRes.lists.map((l: any, i: number) => `${i + 1}. ${l.name}`).join("\n");
                      const chosen = await promptDialog(`Escolha o número da lista para adicionar @${res.handle}:\n\n${options}`, "1", "Adicionar a Lista");
                      if (chosen) {
                          const idx = parseInt(chosen, 10) - 1;
                          if (idx >= 0 && idx < listsRes.lists.length) {
                              const selectedList = listsRes.lists[idx];
                              announcePolite(`Adicionando @${res.handle} à lista "${selectedList.name}"...`);
                              await window.go.services.SocialService.AddUserToList(selectedList.uri, res.did);
                              announceAssertive(`@${res.handle} adicionado à lista "${selectedList.name}" com sucesso.`);
                          } else {
                              announceAssertive("Opção inválida.");
                          }
                      }
                  } catch (err: any) {
                      announceAssertive("Erro ao gerenciar em listas: " + err);
                  }
              });
          } else {
              actionsHtml = `
                <button id="btn-edit-profile" aria-label="Editar Perfil">Editar Perfil</button>
              `;
          }
          
          let knownFollowersHtml = "";
          try {
            if (!res.isMe && window.go.services.SocialService.GetKnownFollowers) {
              const knownRes = await window.go.services.SocialService.GetKnownFollowers(res.did || res.handle, "");
              if (knownRes && knownRes.profiles && knownRes.profiles.length > 0) {
                const names = knownRes.profiles.map((p: any) => p.displayName || `@${p.handle}`).join(', ');
                knownFollowersHtml = `<p style="font-size:0.9em; color:#aaa;"><em>Seguido por ${names}</em></p>`;
              }
            }
          } catch (e) {
            console.warn("Known followers error:", e);
          }

          let blockedNotice = "";
          if (res.viewerBlockedBy) {
            blockedNotice = `<div style="padding:10px; background:#4a1515; color:#ffaaaa; margin-bottom:10px; border-radius:4px;">Este usuário bloqueou você.</div>`;
          }

          let labelerBadge = "";
          let labelerPoliciesHtml = "";
          if (res.isLabeler) {
            labelerBadge = `<div class="labeler-badge" style="display: inline-block; background: #2563eb; color: #fff; font-size: 0.85em; font-weight: bold; padding: 4px 10px; border-radius: 12px; margin-bottom: 8px;">🏷️ Rotulador de Conteúdo (Labeler) ${res.viewerSubscribedLabeler ? '• Assinado' : ''}</div>`;
            
            if (res.labelerInfo && res.labelerInfo.policies && res.labelerInfo.policies.length > 0) {
              const policiesList = res.labelerInfo.policies.map((p: any) => {
                return `
                  <div style="background: rgba(255,255,255,0.05); padding: 8px 12px; margin-top: 6px; border-radius: 6px; border-left: 3px solid #3b82f6;">
                    <strong>${p.title || p.identifier}</strong> <span style="font-size:0.8em; opacity:0.8;">(${p.identifier})</span>
                    ${p.description ? `<p style="margin: 4px 0 0 0; font-size: 0.9em; opacity: 0.9;">${p.description}</p>` : ''}
                    <div style="font-size:0.75em; margin-top:4px; opacity:0.75;">
                      Severidade: ${p.severity || 'padrão'} | Ocultação: ${p.blurs || 'nenhuma'} ${p.adultOnly ? ' | Conteúdo Adulto' : ''}
                    </div>
                  </div>
                `;
              }).join("");

              labelerPoliciesHtml = `
                <div class="labeler-policies-card" style="margin-top: 12px; padding: 12px; background: rgba(0,0,0,0.25); border-radius: 8px;">
                  <h4 style="margin: 0 0 8px 0; font-size: 1em;">🛡️ Rótulos Definição por este Rotulador (${res.labelerInfo.policies.length})</h4>
                  ${policiesList}
                </div>
              `;
            }
          }

          container.innerHTML = `
            <div class="post-item profile-header" tabindex="0" data-text="Perfil de ${res.displayName}. ${res.viewerFollowedBy ? 'Segue você.' : ''} ${res.isLabeler ? 'Este perfil é um Rotulador de Conteúdo.' : ''} Seguidores: ${res.followersCount}. Seguindo: ${res.followsCount}. ${res.isMe ? '' : 'Use S para Seguir, U para Unfollow.'}">
              ${blockedNotice}
              ${labelerBadge}
              <h3>${res.displayName} (@${res.handle})</h3>
              ${res.viewerFollowedBy ? '<p><em>Segue você</em></p>' : ''}
              ${knownFollowersHtml}
              <p>${res.description}</p>
              <p>
                <strong>${res.followersCount}</strong> Seguidores | 
                <strong>${res.followsCount}</strong> Seguindo | 
                <strong>${res.postsCount}</strong> Posts
              </p>
              <div class="profile-actions">${actionsHtml}</div>
              ${labelerPoliciesHtml}
            </div>
            <div id="profile-content"></div>
          `;

          // Event listeners para assinatura de rotuladores
          document.getElementById('btn-subscribe-labeler')?.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            try {
              announcePolite("Assinando rotulador...");
              await window.go.services.SocialService.SubscribeLabeler(res.did);
              announceAssertive("Rotulador assinado com sucesso!");
              loadProfile(false, true);
            } catch (err: any) {
              announceAssertive("Erro ao assinar rotulador: " + err);
            }
          });

          document.getElementById('btn-unsubscribe-labeler')?.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            try {
              announcePolite("Cancelando assinatura do rotulador...");
              await window.go.services.SocialService.UnsubscribeLabeler(res.did);
              announceAssertive("Assinatura cancelada com sucesso.");
              loadProfile(false, true);
            } catch (err: any) {
              announceAssertive("Erro ao cancelar assinatura: " + err);
            }
          });

          // Handle Pinned Post if exists (ONLY for 'posts' sub-tab)
          if (res.pinnedPostUri && state.profileTabMode === 'posts') {
            try {
              const pinnedRes = await window.go.services.FeedService.GetPosts([res.pinnedPostUri]);
              if (pinnedRes && pinnedRes.posts && pinnedRes.posts.length > 0) {
                const pinnedHeader = document.createElement('div');
                pinnedHeader.style.padding = '8px 12px';
                pinnedHeader.style.background = '#252836';
                pinnedHeader.style.fontWeight = 'bold';
                pinnedHeader.style.borderBottom = '1px solid #333';
                pinnedHeader.innerHTML = 'Post Fixado';
                const pinnedArticle = createPostArticle(pinnedRes.posts[0], state.currentPosts.length);
                const profileContentDiv = document.getElementById('profile-content');
                if (profileContentDiv) {
                  profileContentDiv.appendChild(pinnedHeader);
                  profileContentDiv.appendChild(pinnedArticle);
                  state.currentPosts.push(pinnedArticle);
                }
              }
            } catch (e) {
              console.warn("Failed to fetch pinned post:", e);
            }
          }
          
          const modeLabels: Record<string, string> = {
              posts: 'Posts',
              replies: 'Respostas',
              media: 'Mídia',
              likes: 'Curtidas',
              lists: 'Listas',
              packs: 'Pacotes Iniciais',
              starterPacks: 'Pacotes Iniciais',
              followers: 'Seguidores',
              following: 'Seguindo'
          };
          ['posts', 'replies', 'media', 'likes', 'lists', 'packs', 'followers', 'following'].forEach(mode => {
              const btn = document.getElementById(`ptab-${mode}`);
              if (btn) {
                  const isActive = state.profileTabMode === mode || (state.profileTabMode === 'starterPacks' && mode === 'packs');
                  btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
                  btn.setAttribute('tabindex', isActive ? '0' : '-1');
                  btn.style.fontWeight = isActive ? 'bold' : 'normal';
                  
                  btn.onclick = () => {
                      state.profileTabMode = mode === 'packs' ? 'starterPacks' : mode as any;
                      announcePolite(modeLabels[mode] || mode);
                      loadProfile();
                  };
              }
          });

          if (!res.isMe) {
              document.getElementById('btn-follow')?.addEventListener('click', async (e) => {
                  e.stopPropagation();
                  announcePolite("Seguindo...");
                  await window.go.services.SocialService.Follow(res.did);
                  announceAssertive("Seguindo com sucesso.");
                  loadProfile();
              });
              document.getElementById('btn-unfollow')?.addEventListener('click', async (e) => {
                  e.stopPropagation();
                  announcePolite("Deixando de seguir...");
                  const followUri = (e.target as HTMLButtonElement).dataset.uri!;
                  await window.go.services.SocialService.Unfollow(followUri);
                  announceAssertive("Deixou de seguir.");
                  loadProfile();
              });
              document.getElementById('btn-mute')?.addEventListener('click', async (e) => {
                  e.stopPropagation();
                  if (await confirmDialog(`Deseja silenciar @${res.handle}?`, 'Silenciar Usuário')) {
                      announcePolite(`Silenciando @${res.handle}...`);
                      await window.go.services.ModerationService.MuteActor(res.did);
                      announceAssertive(`Usuário silenciado.`);
                      loadProfile();
                  }
              });
              document.getElementById('btn-unmute')?.addEventListener('click', async (e) => {
                  e.stopPropagation();
                  if (await confirmDialog(`Deseja remover o silêncio de @${res.handle}?`, 'Desmutar Usuário')) {
                      announcePolite(`Removendo silêncio de @${res.handle}...`);
                      await window.go.services.ModerationService.UnmuteActor(res.did);
                      announceAssertive(`Usuário desmutado.`);
                      loadProfile();
                  }
              });
              document.getElementById('btn-block')?.addEventListener('click', async (e) => {
                  e.stopPropagation();
                  if (await confirmDialog(`Deseja bloquear @${res.handle}?`, 'Bloquear Usuário')) {
                      announcePolite(`Bloqueando @${res.handle}...`);
                      await window.go.services.ModerationService.BlockActor(res.did);
                      announceAssertive(`Usuário bloqueado.`);
                      loadProfile();
                  }
              });
              document.getElementById('btn-unblock')?.addEventListener('click', async (e) => {
                  e.stopPropagation();
                  if (await confirmDialog(`Deseja desbloquear @${res.handle}?`, 'Desbloquear Usuário')) {
                      announcePolite(`Desbloqueando @${res.handle}...`);
                      await window.go.services.ModerationService.UnblockActor(res.did);
                      announceAssertive(`Usuário desbloqueado.`);
                      loadProfile();
                  }
              });
              document.getElementById('btn-message')?.addEventListener('click', async (e) => {
                  e.stopPropagation();
                  try {
                    announcePolite("Abrindo conversa...");
                    const convo = await window.go.services.ChatService.GetConvoForMembers([res.did]);
                    if (convo && convo.id) {
                      state.activeConvoId = convo.id;
                      switchTab('chat');
                    }
                  } catch (err) {
                    announceAssertive("Erro ao iniciar conversa.");
                  }
              });
              document.getElementById('btn-report-user')?.addEventListener('click', async (e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const reason = await promptDialog(`Motivo da denúncia para @${res.handle}:`, '', 'Denunciar Conta');
                  if (reason) {
                    announcePolite("Enviando denúncia...");
                    try {
                      await window.go.services.ModerationService.ReportAccount(res.did, 'com.atproto.moderation.defs#reasonOther', reason);
                      announceAssertive("Denúncia enviada com sucesso.");
                    } catch (err: any) {
                      console.error("ReportAccount error:", err);
                      announceAssertive("Erro ao enviar denúncia: " + err);
                    }
                  }
              });
          } else {
              document.getElementById('btn-edit-profile')?.addEventListener('click', async (e) => {
                  e.stopPropagation();
                  const dialog = document.getElementById('edit-profile-modal') as HTMLDialogElement;
                  if (dialog) {
                    const nameInput = document.getElementById('edit-profile-name') as HTMLInputElement;
                    const descInput = document.getElementById('edit-profile-desc') as HTMLTextAreaElement;
                    const avatarInput = document.getElementById('edit-profile-avatar') as HTMLInputElement;
                    const bannerInput = document.getElementById('edit-profile-banner') as HTMLInputElement;
                    if (nameInput) nameInput.value = res.displayName || '';
                    if (descInput) descInput.value = res.description || '';
                    if (avatarInput) avatarInput.value = '';
                    if (bannerInput) bannerInput.value = '';

                    const labelCheckboxes = document.querySelectorAll<HTMLInputElement>('.edit-self-label');
                    labelCheckboxes.forEach(cb => { cb.checked = false; cb.dataset.initial = 'false'; });

                    try {
                      const activeLabels = await window.go.services.SocialService.GetSelfLabels();
                      if (activeLabels && Array.isArray(activeLabels)) {
                        labelCheckboxes.forEach(cb => {
                          if (activeLabels.includes(cb.value)) {
                            cb.checked = true;
                            cb.dataset.initial = 'true';
                          }
                        });
                      }
                    } catch (err) {
                      console.error("Erro ao carregar self-labels:", err);
                    }

                    dialog.showModal();
                  } else {
                    switchTab('settings');
                  }
              });
          }
        }
    }

    const contentContainer = document.getElementById('profile-content') as HTMLDivElement;
    if (state.profileTabMode === 'posts' || state.profileTabMode === 'replies' || state.profileTabMode === 'media') {
        let filter = 'posts_with_replies';
        if (state.profileTabMode === 'posts') filter = 'posts_no_replies';
        if (state.profileTabMode === 'media') filter = 'posts_with_media';

        let feedRes = await window.go.services.FeedService.GetAuthorFeed(state.currentHandle, state.profileCursor, 100, filter);
        if (feedRes && feedRes.posts) {
            feedRes.posts.forEach((post: any) => {
                if (!state.currentPosts.some(p => p.dataset.uri === post.uri)) {
                    const article = createPostArticle(post, state.currentPosts.length);
                    contentContainer.appendChild(article);
                    state.currentPosts.push(article);
                }
            });
            state.profileCursor = feedRes.cursor;
        }
    } else if (state.profileTabMode === 'likes') {
        let feedRes = await window.go.services.FeedService.GetActorLikes(state.currentHandle, state.profileCursor, 100);
        if (feedRes && feedRes.posts) {
            feedRes.posts.forEach((post: any) => {
                if (!state.currentPosts.some(p => p.dataset.uri === post.uri)) {
                    const article = createPostArticle(post, state.currentPosts.length);
                    contentContainer.appendChild(article);
                    state.currentPosts.push(article);
                }
            });
            state.profileCursor = feedRes.cursor;
        }
    } else if (state.profileTabMode === 'followers' || state.profileTabMode === 'following') {
        let resData: any;
        if (state.profileTabMode === 'followers') {
            resData = await window.go.services.SocialService.GetFollowers(state.currentHandle, state.profileCursor);
        } else {
            resData = await window.go.services.SocialService.GetFollows(state.currentHandle, state.profileCursor);
        }
        
        if (resData && resData.profiles) {
            resData.profiles.forEach((prof: any) => {
                const div = document.createElement('article');
                div.classList.add('post-item');
                div.setAttribute('tabindex', '0');
                div.dataset.text = `Perfil: ${prof.displayName}. ${prof.description || ''}`;
                div.innerHTML = `<h3>${prof.displayName} <small>(@${prof.handle})</small></h3><p>${prof.description || ''}</p>`;
                
                div.dataset.index = state.currentPosts.length.toString();
                div.addEventListener('focus', () => {
                    const iStr = div.dataset.index;
                    if (iStr !== undefined) state.focusedPostIndex = parseInt(iStr, 10);
                });
                
                const openProfile = () => {
                    state.currentHandle = prof.handle;
                    state.profileTabMode = 'posts';
                    announcePolite(`Abrindo perfil de @${state.currentHandle}`);
                    loadProfile();
                };
                
                div.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                        openProfile();
                    }
                });
                div.addEventListener('click', openProfile);
                
                contentContainer.appendChild(div);
                state.currentPosts.push(div);
            });
            state.profileCursor = resData.cursor;
        }
    } else if (state.profileTabMode === 'lists') {
        let resData = await window.go.services.SocialService.GetActorLists(state.currentHandle, state.profileCursor);
        if (resData && resData.lists && resData.lists.length > 0) {
            resData.lists.forEach((list: any) => {
                const article = createListArticle(list, {
                    onRefresh: () => loadProfile(false, true),
                    targetContainerId: 'profile-content',
                    onBack: () => loadProfile(false, true)
                });
                contentContainer.appendChild(article);
                state.currentPosts.push(article);
            });
            state.profileCursor = resData.cursor;
        } else if (!loadMore) {
            contentContainer.innerHTML = '<p style="padding:15px; color:#aaa;">Este usuário ainda não possui nenhuma lista criada.</p>';
            announcePolite("Nenhuma lista encontrada para este perfil.");
        }
    } else if (state.profileTabMode === 'starterPacks') {
        let resData = await window.go.services.SocialService.GetActorStarterPacks(state.currentHandle, state.profileCursor);
        if (resData && resData.starterPacks && resData.starterPacks.length > 0) {
            resData.starterPacks.forEach((item: any) => {
                const article = document.createElement('article');
                article.classList.add('post-item');
                article.setAttribute('tabindex', '0');
                article.dataset.index = (state.currentPosts.length).toString();
                article.dataset.text = `Starter Pack: ${item.name}. ${item.description || ''}`;
                article.setAttribute('aria-label', article.dataset.text);
                
                if (item.listUri) {
                    article.innerHTML = `
                        <h3>${item.name}</h3>
                        <p>${item.description || ''}</p>
                        <button class="btn-follow-all-pack" data-list-uri="${item.listUri}" style="margin-top:6px; padding:4px 10px; font-weight:bold;">Seguir Todos</button>
                    `;
                    article.querySelector('.btn-follow-all-pack')?.addEventListener('click', async (e) => {
                        e.stopPropagation();
                        try {
                            announcePolite(`Seguindo todos os perfis do pacote "${item.name}"...`);
                            const count = await window.go.services.SocialService.FollowAllInList(item.listUri);
                            announceAssertive(`Você agora está seguindo ${count} novos perfis do pacote "${item.name}".`);
                        } catch (err: any) {
                            announceAssertive("Erro ao seguir membros do pacote: " + err);
                        }
                    });
                } else {
                    article.innerHTML = `<h3>${item.name}</h3><p>${item.description || ''}</p>`;
                }
                
                article.addEventListener('focus', () => {
                    const iStr = article.dataset.index;
                    if (iStr !== undefined) state.focusedPostIndex = parseInt(iStr, 10);
                });
                
                contentContainer.appendChild(article);
                state.currentPosts.push(article);
            });
            state.profileCursor = resData.cursor;
        } else if (!loadMore) {
            contentContainer.innerHTML = '<p style="padding:15px; color:#aaa;">Este usuário ainda não possui nenhum Starter Pack.</p>';
            announcePolite("Nenhum Starter Pack encontrado para este perfil.");
        }
    }
    
    state.tabStates['profile'].loaded = true;
    state.tabStates['profile'].lastHandle = state.currentHandle;
    announcePolite(`Perfil carregado com ${state.currentPosts.length} itens interativos.`);
    if (!loadMore && state.currentPosts.length > 0) {
        let focused = false;
        if (keepFocus && targetUri) {
            const idx = state.currentPosts.findIndex(p => p.dataset.uri === targetUri);
            if (idx >= 0) {
                state.focusedPostIndex = idx;
                state.currentPosts[idx].focus();
                focused = true;
            }
        }
        if (!focused && state.focusedPostIndex === -1) {
            state.focusedPostIndex = 0;
            state.currentPosts[0].focus();
        }
    }
  } catch (err: any) { console.error(err); announceAssertive("Erro ao carregar perfil."); } 
  finally { container.setAttribute('aria-busy', 'false'); }
}

export function setupProfile() {
  const editForm = document.getElementById('edit-profile-form') as HTMLFormElement;
  const cancelBtn = document.getElementById('btn-close-edit-profile');
  const saveBtn = document.getElementById('btn-save-profile') as HTMLButtonElement | null;
  const dialog = document.getElementById('edit-profile-modal') as HTMLDialogElement;

  if (editForm) {
    editForm.addEventListener('submit', (e) => {
      e.preventDefault();
      e.stopPropagation();
    });
  }

  if (cancelBtn && dialog) {
    cancelBtn.addEventListener('click', () => {
      dialog.close();
    });
  }

  const showModalError = (msg: string) => {
    let errEl = document.getElementById('edit-profile-error');
    if (!errEl) {
      errEl = document.createElement('p');
      errEl.id = 'edit-profile-error';
      errEl.setAttribute('role', 'alert');
      errEl.style.cssText = 'color:#f44; margin-top:10px; font-size:0.9em;';
      document.querySelector('#edit-profile-form .actions')?.before(errEl);
    }
    errEl.textContent = msg;
  };

  const clearModalError = () => {
    document.getElementById('edit-profile-error')?.remove();
  };

  const doSaveProfile = async () => {
    clearModalError();

    const nameInput = document.getElementById('edit-profile-name') as HTMLInputElement;
    const descInput = document.getElementById('edit-profile-desc') as HTMLTextAreaElement;
    const avatarInput = document.getElementById('edit-profile-avatar') as HTMLInputElement;
    const bannerInput = document.getElementById('edit-profile-banner') as HTMLInputElement;

    const name = nameInput?.value.trim() ?? '';
    const desc = descInput?.value.trim() ?? '';

    if (saveBtn) saveBtn.disabled = true;

    try {
      await window.go.services.SocialService.UpdateProfile(name, desc);

      if (avatarInput?.files && avatarInput.files.length > 0) {
        const pathOrData = await getFilePathOrDataUrl(avatarInput.files[0]);
        if (pathOrData) await window.go.services.SocialService.UploadProfileAvatar(pathOrData);
      }

      if (bannerInput?.files && bannerInput.files.length > 0) {
        const pathOrData = await getFilePathOrDataUrl(bannerInput.files[0]);
        if (pathOrData) await window.go.services.SocialService.UploadProfileBanner(pathOrData);
      }

      // Sync Self Labels
      const labelCheckboxes = document.querySelectorAll<HTMLInputElement>('.edit-self-label');
      for (const cb of Array.from(labelCheckboxes)) {
        const wasChecked = cb.dataset.initial === 'true';
        const isChecked = cb.checked;
        if (isChecked && !wasChecked) {
          await window.go.services.SocialService.AddSelfLabel(cb.value);
          cb.dataset.initial = 'true';
        } else if (!isChecked && wasChecked) {
          await window.go.services.SocialService.RemoveSelfLabel(cb.value);
          cb.dataset.initial = 'false';
        }
      }

      const headerTitle = document.querySelector('.profile-header h3');
      if (headerTitle) {
        headerTitle.textContent = `${name || `@${state.currentHandle}`} (@${state.currentHandle})`;
      }
      const headerDesc = document.querySelector('.profile-header p:not(:has(em))');
      if (headerDesc && !headerDesc.querySelector('strong')) {
        headerDesc.textContent = desc;
      }

      announceAssertive("Perfil atualizado com sucesso!");
      dialog.close();

      setTimeout(() => {
        loadProfile(false, true).catch((e) => console.error(e));
      }, 1200);
    } catch (err: unknown) {
      console.error("Erro ao atualizar perfil:", err);
      const msg = err instanceof Error ? err.message : String(err);
      showModalError(`Erro ao salvar: ${msg}`);
      announceAssertive("Erro ao atualizar perfil: " + msg);
    } finally {
      if (saveBtn) saveBtn.disabled = false;
    }
  };

  if (saveBtn) {
    saveBtn.addEventListener('click', () => {
      doSaveProfile();
    });
  }
}

