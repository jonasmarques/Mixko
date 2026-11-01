import { state } from '../config/state';
import { announcePolite, announceAssertive, formatAuthor } from '../utils/a11y';
import { createPostArticle } from '../components/post';
import { createListArticle } from '../components/list';
import { confirmDialog, promptDialog, promptReportDetails } from '../utils/dialog';
import { switchTab } from './tabs';
import { loadTimeline } from './timeline';
import { openChatConvo } from './chat';
import { showMuteMenu } from './shortcuts';
import { getFilePathOrDataUrl, esc, escUrl, linkify, renderProfileLink } from '../utils/helpers';
import { i18n } from '../utils/i18n';
import { markPageLoaded, pagesLoadedFor, resetPagesLoaded, restoreFocusAfterReload } from '../utils/pagination';
import type { StarterPackDTO, ProfileDTO, ProfileLinkDTO } from '../types/dto';

function createProfileLinkRowElement(link?: ProfileLinkDTO): HTMLDivElement {
  const row = document.createElement('div');
  row.className = 'profile-link-row';
  row.style.cssText = 'display:flex; gap:6px; align-items:center; flex-wrap:wrap;';
  if (link?.uri) row.dataset.uri = link.uri;
  if (link?.cid) row.dataset.cid = link.cid;

  const titleInput = document.createElement('input');
  titleInput.type = 'text';
  titleInput.className = 'profile-link-title';
  titleInput.placeholder = i18n.t('profile.linkTitlePlaceholder');
  titleInput.setAttribute('aria-label', i18n.t('profile.linkTitlePlaceholder'));
  titleInput.value = link?.title || '';
  titleInput.style.cssText = 'flex:1; min-width:130px;';

  const urlInput = document.createElement('input');
  urlInput.type = 'url';
  urlInput.className = 'profile-link-url';
  urlInput.placeholder = i18n.t('profile.linkUrlPlaceholder');
  urlInput.setAttribute('aria-label', i18n.t('profile.linkUrlPlaceholder'));
  urlInput.value = link?.url || '';
  urlInput.style.cssText = 'flex:2; min-width:180px;';

  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.className = 'btn-remove-profile-link';
  removeBtn.textContent = i18n.t('profile.removeLinkBtn');
  removeBtn.style.cssText = 'background:#ef4444; color:#fff; padding:4px 8px;';
  removeBtn.addEventListener('click', () => {
    row.remove();
  });

  row.appendChild(titleInput);
  row.appendChild(urlInput);
  row.appendChild(removeBtn);
  return row;
}

function populateEditProfileLinks(links: ProfileLinkDTO[]) {
  const listEl = document.getElementById('edit-profile-links-list');
  if (!listEl) return;
  listEl.innerHTML = '';
  links.forEach((l) => {
    listEl.appendChild(createProfileLinkRowElement(l));
  });
}

/** @param silent suppresses the "loaded" announcement, for pages fetched to restore focus. */
export async function loadProfile(loadMore = false, keepFocus = false, silent = false) {
  const container = document.getElementById('profile-card') as HTMLDivElement;
  container.setAttribute('aria-busy', 'true');
  let targetUri = "";
  let pagesBefore = 0;
  if (!loadMore && keepFocus && state.focusedPostIndex >= 0 && state.focusedPostIndex < state.currentPosts.length) {
    targetUri = state.currentPosts[state.focusedPostIndex]?.dataset.uri || "";
    pagesBefore = pagesLoadedFor('profile');
  }
  
  if (!loadMore) {
      state.profileCursor = "";
      resetPagesLoaded('profile');
      state.currentPosts = [];
      container.innerHTML = `<div style="padding: 20px;">${i18n.t('profile.loadingProfile')}</div>`;
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
                 followBtn = `<button id="btn-unfollow" data-uri="${res.viewerFollowing}" aria-label="${i18n.t('profile.unfollowAria', { name: res.displayName || res.handle })}">${i18n.t('profile.unfollowBtn')}</button>`;
              } else {
                 followBtn = `<button id="btn-follow" data-did="${res.did}" aria-label="${i18n.t('profile.followAria', { name: res.displayName || res.handle })}">${i18n.t('profile.followBtn')}</button>`;
              }

              let muteBtn = "";
              if (res.viewerMuted) {
                muteBtn = `<button id="btn-unmute" data-did="${res.did}" aria-label="${i18n.t('profile.unmuteAria')}">${i18n.t('profile.unmuteBtn')}</button>`;
              } else {
                muteBtn = `<button id="btn-mute" data-handle="${res.handle}" data-did="${res.did}" aria-label="${i18n.t('profile.muteAria')}">${i18n.t('profile.muteBtn')}</button>`;
              }
              muteBtn += `<button id="btn-mute-options" data-handle="${res.handle}" data-did="${res.did}" aria-label="${i18n.t('profile.muteOptionsAria')}">${i18n.t('profile.muteOptionsBtn')}</button>`;

              let blockBtn = "";
              if (res.viewerBlocking) {
                blockBtn = `<button id="btn-unblock" data-did="${res.did}" aria-label="${i18n.t('profile.unblockAria')}">${i18n.t('profile.unblockBtn')}</button>`;
              } else {
                blockBtn = `<button id="btn-block" data-did="${res.did}" aria-label="${i18n.t('profile.blockAria')}">${i18n.t('profile.blockBtn')}</button>`;
              }

              let labelerBtn = "";
              if (res.isLabeler) {
                  if (res.viewerSubscribedLabeler) {
                      labelerBtn = `<button id="btn-unsubscribe-labeler" data-did="${res.did}" style="background-color: #ef4444; color: white;" aria-label="${i18n.t('profile.unsubscribeLabelerAria')}">${i18n.t('profile.unsubscribeLabelerBtn')}</button>`;
                  } else {
                      labelerBtn = `<button id="btn-subscribe-labeler" data-did="${res.did}" style="background-color: #10b981; color: white;" aria-label="${i18n.t('profile.subscribeLabelerAria')}">${i18n.t('profile.subscribeLabelerBtn')}</button>`;
                  }
              }

              const isSubscribedToActivity = Boolean(
                res.viewerActivitySubscription && (res.viewerActivitySubscription.post || res.viewerActivitySubscription.reply)
              );
              const authorTitle = formatAuthor(res.displayName || '', res.handle);
              const notifyBtnClass = isSubscribedToActivity ? 'active' : '';
              const notifyBtnText = isSubscribedToActivity
                ? i18n.t('profile.notifyActivityActiveBtn', { name: authorTitle })
                : `🔔 ${i18n.t('profile.notifyActivityBtn', { name: authorTitle })}`;
              const notifyBtnAria = i18n.t('profile.notifyActivityAria', { name: authorTitle });
              const notifyBtn = `<button id="btn-notify-activity" class="${notifyBtnClass}" aria-haspopup="dialog" aria-expanded="false" aria-label="${esc(notifyBtnAria)}">${esc(notifyBtnText)}</button>`;

              actionsHtml = `
                ${followBtn}
                ${notifyBtn}
                <button id="btn-known-followers" aria-haspopup="true" aria-expanded="false" aria-label="${esc(i18n.t('profile.knownFollowersAria'))}">${esc(i18n.t('profile.knownFollowersBtn'))}</button>
                ${muteBtn}
                ${blockBtn}
                ${labelerBtn}
                <button id="btn-message" data-did="${res.did}" data-handle="${esc(res.handle)}" data-display-name="${esc(res.displayName || '')}" aria-label="${i18n.t('profile.messageAria')}">${i18n.t('profile.messageBtn')}</button>
                <button id="btn-manage-lists" data-did="${res.did}" aria-label="${i18n.t('profile.manageListsAria')}">${i18n.t('profile.manageListsBtn')}</button>
                <button id="btn-report-user" data-did="${res.did}" aria-label="${i18n.t('profile.reportAria')}">${i18n.t('profile.reportBtn')}</button>
              `;
          } else {
              state.loggedInPinnedPostUri = res.pinnedPostUri || "";
              const liveStatusBtns = res.status && res.status.isActive
                ? `<button id="btn-set-live-status">${esc(i18n.t('sec2.setLiveStatus'))}</button> <button id="btn-clear-live-status">${esc(i18n.t('sec2.clearLiveStatus'))}</button>`
                : `<button id="btn-set-live-status">${esc(i18n.t('sec2.setLiveStatus'))}</button>`;
              actionsHtml = `
                <button id="btn-edit-profile" aria-label="${i18n.t('profile.editProfileAria')}">${i18n.t('profile.editProfileBtn')}</button>
                ${liveStatusBtns}
              `;
          }

          let blockedNotice = "";
          if (res.viewerBlockedBy) {
            blockedNotice = `<div style="padding:10px; background:#4a1515; color:#ffaaaa; margin-bottom:10px; border-radius:4px;">${i18n.t('profile.userBlockedYou')}</div>`;
          }

          let verificationBadgeHtml = "";
          if (!state.hideVerificationBadges) {
            if (res.trustedVerifier) {
              verificationBadgeHtml = ` <span title="${esc(i18n.t('sec2.trustedVerifierBadge'))}" aria-label="${esc(i18n.t('sec2.trustedVerifierBadge'))}">🛡️✓</span>`;
            } else if (res.verified) {
              verificationBadgeHtml = ` <span title="${esc(i18n.t('sec2.verifiedBadge'))}" aria-label="${esc(i18n.t('sec2.verifiedBadge'))}">✓</span>`;
            }
          }

          let liveStatusHtml = "";
          if (res.status && res.status.isActive) {
            const linkPart = res.status.uri
              ? ` — <a href="${esc(res.status.uri)}" target="_blank" rel="noopener noreferrer">${esc(res.status.title || res.status.uri)}</a>`
              : (res.status.title ? ` — ${esc(res.status.title)}` : '');
            liveStatusHtml = `<div style="padding: 6px 10px; background: #fee2e2; color: #991b1b; border-radius: 6px; margin-bottom: 8px; font-weight: bold;">${esc(i18n.t('sec2.liveStatusBadge'))}${linkPart}</div>`;
          }

          let labelerBadge = "";
          let labelerPoliciesHtml = "";
          if (res.isLabeler) {
            labelerBadge = `<div class="labeler-badge" style="display: inline-block; background: #2563eb; color: #fff; font-size: 0.85em; font-weight: bold; padding: 4px 10px; border-radius: 12px; margin-bottom: 8px;">${i18n.t('profile.labelerBadge')}${res.viewerSubscribedLabeler ? i18n.t('profile.subscribedBadge') : ''}</div>`;
            
            if (res.labelerInfo && res.labelerInfo.policies && res.labelerInfo.policies.length > 0) {
              const policiesList = res.labelerInfo.policies.map((p) => {
                return `
                  <div style="background: rgba(255,255,255,0.05); padding: 8px 12px; margin-top: 6px; border-radius: 6px; border-left: 3px solid #3b82f6;">
                    <strong>${esc(p.title || p.identifier)}</strong> <span style="font-size:0.8em; opacity:0.8;">(${esc(p.identifier)})</span>
                    ${p.description ? `<p style="margin: 4px 0 0 0; font-size: 0.9em; opacity: 0.9;">${esc(p.description)}</p>` : ''}
                    <div style="font-size:0.75em; margin-top:4px; opacity:0.75;">
                      ${esc(i18n.t('profile.policyDetails', { severity: p.severity || 'padrão', blurs: p.blurs || 'nenhuma', adultOnly: p.adultOnly ? i18n.t('profile.adultContent') : '' }))}
                    </div>
                  </div>
                `;
              }).join("");

              labelerPoliciesHtml = `
                <div class="labeler-policies-card" style="margin-top: 12px; padding: 12px; background: rgba(0,0,0,0.25); border-radius: 8px;">
                  <h4 style="margin: 0 0 8px 0; font-size: 1em;">${i18n.t('profile.labelerPoliciesTitle', { count: res.labelerInfo.policies.length.toString() })}</h4>
                  ${policiesList}
                </div>
              `;
            }
          }

          const rawLinks: ProfileLinkDTO[] = Array.isArray(res.links) ? [...res.links] : [];
          if (res.website && !rawLinks.some((l) => l.url === res.website)) {
            rawLinks.push({ url: res.website, title: res.website });
          }
          let profileLinksHtml = "";
          if (rawLinks.length > 0) {
            const items = rawLinks
              .filter((l) => Boolean(l.url))
              .map((l) => {
                const rawUrl = l.url.trim();
                const fullUrl = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;
                const safeUrl = escUrl(fullUrl);
                const label = esc(l.title || rawUrl);
                return `<a href="${safeUrl}" class="app-link link-external profile-ext-link" data-external-url="${safeUrl}" style="display:inline-flex; align-items:center; gap:4px; margin-right:12px; color:var(--primary-color, #38bdf8); text-decoration:underline;">🔗 ${label}</a>`;
              })
              .join(" ");
            if (items) {
              profileLinksHtml = `<div class="profile-links-bar" style="margin: 8px 0; display:flex; flex-wrap:wrap; gap:8px;">${items}</div>`;
            }
          }

          container.innerHTML = `
            <div class="post-item profile-header" tabindex="0" data-text="${esc(i18n.t('profile.profileAriaDetails', { name: res.displayName, followsYou: res.viewerFollowedBy ? i18n.t('profile.followsYouAria') : '', isLabeler: res.isLabeler ? i18n.t('profile.isLabelerAria') : '', followers: res.followersCount.toString(), following: res.followsCount.toString(), shortcuts: res.isMe ? '' : i18n.t('profile.shortcutsAria') }))}">
              ${blockedNotice}
              ${liveStatusHtml}
              ${labelerBadge}
              <h3>${esc(res.displayName)} (${renderProfileLink(res.handle)})${verificationBadgeHtml}</h3>
              ${res.viewerFollowedBy ? `<p><em>${i18n.t('profile.followsYouText')}</em></p>` : ''}
              <div id="known-followers-container" aria-live="polite" style="display:none; margin: 8px 0; padding: 8px; background: rgba(255,255,255,0.05); border-radius: 6px;"></div>
              <p class="profile-bio">${linkify(res.description || '')}</p>
              ${profileLinksHtml}
              <p>
                <strong>${res.followersCount}</strong> ${i18n.t('profile.tabFollowers')} | 
                <strong>${res.followsCount}</strong> ${i18n.t('profile.tabFollowing')} | 
                <strong>${res.postsCount}</strong> ${i18n.t('profile.tabPosts')}
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
              announcePolite(i18n.t('profile.subscribingLabeler'));
              await window.go.services.SocialService.SubscribeLabeler(res.did);
              announceAssertive(i18n.t('profile.subscribedLabelerSuccess'));
              loadProfile(false, true);
            } catch (err: unknown) {
              announceAssertive(i18n.t('profile.subscribeLabelerError', { err: String(err) }));
            }
          });

          document.getElementById('btn-unsubscribe-labeler')?.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            try {
              announcePolite(i18n.t('profile.unsubscribingLabeler'));
              await window.go.services.SocialService.UnsubscribeLabeler(res.did);
              announceAssertive(i18n.t('profile.unsubscribedLabelerSuccess'));
              loadProfile(false, true);
            } catch (err: unknown) {
              announceAssertive(i18n.t('profile.unsubscribeLabelerError', { err: String(err) }));
            }
          });

          // Handle Pinned Post if exists (ONLY for 'posts' sub-tab)
          if (res.pinnedPostUri && state.profileTabMode === 'posts') {
            try {
              const pinnedRes = await window.go.services.FeedService.GetPosts([res.pinnedPostUri]);
              if (pinnedRes && pinnedRes.posts && pinnedRes.posts.length > 0) {
                pinnedRes.posts[0].isPinned = true;
                const pinnedHeader = document.createElement('div');
                pinnedHeader.style.padding = '8px 12px';
                pinnedHeader.style.background = '#252836';
                pinnedHeader.style.fontWeight = 'bold';
                pinnedHeader.style.borderBottom = '1px solid #333';
                pinnedHeader.innerHTML = i18n.t('profile.pinnedPost');
                const pinnedArticle = createPostArticle(pinnedRes.posts[0], state.currentPosts.length);
                const profileContentDiv = document.getElementById('profile-content');
                if (pinnedArticle && profileContentDiv) {
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
              posts: i18n.t('profile.tabPosts'),
              replies: i18n.t('profile.tabReplies'),
              media: i18n.t('profile.tabMedia'),
              likes: i18n.t('profile.tabLikes'),
              feeds: i18n.t('sec2.tabActorFeeds'),
              lists: i18n.t('profile.tabLists'),
              packs: i18n.t('profile.tabPacks'),
              starterPacks: i18n.t('profile.tabPacks'),
              followers: i18n.t('profile.tabFollowers'),
              following: i18n.t('profile.tabFollowing')
          };
          ['posts', 'replies', 'media', 'likes', 'feeds', 'lists', 'packs', 'followers', 'following'].forEach(mode => {
              const btn = document.getElementById(`ptab-${mode}`);
              if (btn) {
                  const isActive = state.profileTabMode === mode || (state.profileTabMode === 'starterPacks' && mode === 'packs');
                  btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
                  btn.setAttribute('tabindex', isActive ? '0' : '-1');
                  btn.style.fontWeight = isActive ? 'bold' : 'normal';
                  
                  btn.onclick = () => {
                      state.profileTabMode = mode === 'packs' ? 'starterPacks' : mode as typeof state.profileTabMode;
                      announcePolite(modeLabels[mode] || mode);
                      loadProfile();
                  };
              }
          });

          if (!res.isMe) {
              const btnKnown = document.getElementById('btn-known-followers');
              btnKnown?.addEventListener('click', async (e) => {
                e.preventDefault();
                e.stopPropagation();
                const kfContainer = document.getElementById('known-followers-container');
                if (!kfContainer) return;

                if (kfContainer.style.display !== 'none') {
                  kfContainer.style.display = 'none';
                  btnKnown.setAttribute('aria-expanded', 'false');
                  announcePolite(i18n.t('profile.knownFollowersClosed'));
                  return;
                }

                kfContainer.style.display = 'block';
                btnKnown.setAttribute('aria-expanded', 'true');
                kfContainer.innerHTML = `<p style="font-size:0.9em; color:#aaa; margin:0;">${esc(i18n.t('profile.loadingKnownFollowers'))}</p>`;
                announcePolite(i18n.t('profile.loadingKnownFollowers'));

                try {
                  const knownRes = await window.go.services.SocialService.GetKnownFollowers(res.did || res.handle, "");
                  if (knownRes && knownRes.profiles && knownRes.profiles.length > 0) {
                    const names = knownRes.profiles.map((p: ProfileDTO) => p.displayName || `@${p.handle}`).join(', ');
                    const profileLinks = knownRes.profiles.map((p: ProfileDTO) => {
                      const name = esc(p.displayName || p.handle);
                      const handle = esc(p.handle);
                      return `<button type="button" class="btn-profile-link" data-handle="${handle}" style="background:none; border:none; color:var(--primary-color, #38bdf8); text-decoration:underline; cursor:pointer; padding:2px 4px; font-size:1em;">${name} (@${handle})</button>`;
                    }).join(', ');
                    kfContainer.innerHTML = `
                      <div style="font-size:0.9em;">
                        <strong>${esc(i18n.t('profile.knownFollowersTitle'))}:</strong>
                        <div style="margin-top:4px;">${profileLinks}</div>
                      </div>
                    `;
                    kfContainer.querySelectorAll('.btn-profile-link').forEach(linkBtn => {
                      linkBtn.addEventListener('click', (ev) => {
                        ev.stopPropagation();
                        const targetHandle = (linkBtn as HTMLElement).dataset.handle;
                        if (targetHandle) {
                          state.currentHandle = targetHandle;
                          announcePolite(i18n.t('profile.openingProfile', { handle: state.currentHandle }));
                          loadProfile();
                        }
                      });
                    });
                    announceAssertive(i18n.t('profile.followedByKnown', { names }));
                  } else {
                    kfContainer.innerHTML = `<p style="font-size:0.9em; color:#aaa; margin:0;">${esc(i18n.t('profile.noKnownFollowers'))}</p>`;
                    announceAssertive(i18n.t('profile.noKnownFollowers'));
                  }
                } catch (err: unknown) {
                  kfContainer.innerHTML = `<p style="font-size:0.9em; color:#f87171; margin:0;">${esc(String(err))}</p>`;
                  announceAssertive(String(err));
                }
              });

              document.getElementById('btn-follow')?.addEventListener('click', async (e) => {
                  e.stopPropagation();
                  announcePolite(i18n.t('profile.followingAction'));
                  await window.go.services.SocialService.Follow(res.did);
                  announceAssertive(i18n.t('profile.followedSuccess'));
                  loadProfile();
              });
              document.getElementById('btn-unfollow')?.addEventListener('click', async (e) => {
                  e.stopPropagation();
                  announcePolite(i18n.t('profile.unfollowingAction'));
                  const followUri = (e.target as HTMLButtonElement).dataset.uri!;
                  await window.go.services.SocialService.Unfollow(followUri);
                  announceAssertive(i18n.t('profile.unfollowedSuccess'));
                  loadProfile();
              });
              document.getElementById('btn-mute')?.addEventListener('click', async (e) => {
                  e.stopPropagation();
                  if (await confirmDialog(i18n.t('profile.mutePrompt', { handle: res.handle }), i18n.t('profile.muteTitle'))) {
                      announcePolite(i18n.t('profile.mutingAction', { handle: res.handle }));
                      await window.go.services.ModerationService.MuteActor(res.did);
                      announceAssertive(i18n.t('profile.mutedSuccess'));
                      loadProfile();
                  }
              });
              document.getElementById('btn-mute-options')?.addEventListener('click', (e) => {
                  e.stopPropagation();
                  showMuteMenu(res.did, res.handle);
              });
              document.getElementById('btn-unmute')?.addEventListener('click', async (e) => {
                  e.stopPropagation();
                  if (await confirmDialog(i18n.t('profile.unmutePrompt', { handle: res.handle }), i18n.t('profile.unmuteTitle'))) {
                      announcePolite(i18n.t('profile.unmutingAction', { handle: res.handle }));
                      await window.go.services.ModerationService.UnmuteActor(res.did);
                      announceAssertive(i18n.t('profile.unmutedSuccess'));
                      loadProfile();
                  }
              });
              document.getElementById('btn-block')?.addEventListener('click', async (e) => {
                  e.stopPropagation();
                  if (await confirmDialog(i18n.t('profile.blockPrompt', { handle: res.handle }), i18n.t('profile.blockTitle'))) {
                      announcePolite(i18n.t('profile.blockingAction', { handle: res.handle }));
                      await window.go.services.ModerationService.BlockActor(res.did);
                      announceAssertive(i18n.t('profile.blockedSuccess'));
                      loadProfile();
                  }
              });
              document.getElementById('btn-unblock')?.addEventListener('click', async (e) => {
                  e.stopPropagation();
                  if (await confirmDialog(i18n.t('profile.unblockPrompt', { handle: res.handle }), i18n.t('profile.unblockTitle'))) {
                      announcePolite(i18n.t('profile.unblockingAction', { handle: res.handle }));
                      await window.go.services.ModerationService.UnblockActor(res.did);
                      announceAssertive(i18n.t('profile.unblockedSuccess'));
                      loadProfile();
                  }
              });
              document.getElementById('btn-message')?.addEventListener('click', async (e) => {
                  e.stopPropagation();
                  try {
                    const memberTitle = formatAuthor(res.displayName || '', res.handle);
                    announcePolite(i18n.t('chat.openingChat', { handle: memberTitle }));
                    const avail = await window.go.services.ChatService.GetConvoAvailability(res.did);
                    if (avail && !avail.canChat) {
                      announceAssertive(i18n.t('extended.cannotChatUser'));
                      return;
                    }
                    const convo = await window.go.services.ChatService.GetConvoForMembers([res.did]);
                    if (convo && convo.id) {
                      state.tabStates['chat'].loaded = true;
                      switchTab('chat');
                      openChatConvo(convo.id, memberTitle);
                    }
                  } catch (err) {
                    announceAssertive(i18n.t('profile.openChatError'));
                  }
              });
              document.getElementById('btn-report-user')?.addEventListener('click', async (e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const details = await promptReportDetails(i18n.t('profile.reportAccountTitle'));
                  if (details) {
                    announcePolite(i18n.t('profile.sendingReport'));
                    try {
                      await window.go.services.ModerationService.ReportAccount(res.did, details.reasonType, details.reason);
                      announceAssertive(i18n.t('profile.reportSuccess'));
                    } catch (err: unknown) {
                      console.error("ReportAccount error:", err);
                      announceAssertive(i18n.t('profile.reportError', { err: String(err) }));
                    }
                  }
              });

              document.getElementById('btn-notify-activity')?.addEventListener('click', (e) => {
                  e.preventDefault();
                  e.stopPropagation();

                  const modal = document.getElementById('activity-sub-modal') as HTMLDialogElement | null;
                  if (!modal) return;

                  const triggerBtn = e.currentTarget as HTMLButtonElement;
                  triggerBtn.setAttribute('aria-expanded', 'true');

                  const postsCheckbox = document.getElementById('activity-sub-posts') as HTMLInputElement | null;
                  const repliesCheckbox = document.getElementById('activity-sub-replies') as HTMLInputElement | null;
                  const form = document.getElementById('activity-sub-form') as HTMLFormElement | null;
                  const closeBtn = document.getElementById('btn-close-activity-sub') as HTMLButtonElement | null;
                  const cancelBtn = document.getElementById('btn-cancel-activity-sub') as HTMLButtonElement | null;

                  if (postsCheckbox) {
                      postsCheckbox.checked = res.viewerActivitySubscription?.post ?? false;
                  }
                  if (repliesCheckbox) {
                      repliesCheckbox.checked = res.viewerActivitySubscription?.reply ?? false;
                  }

                  const handleModalClose = () => {
                      cleanup();
                      triggerBtn.setAttribute('aria-expanded', 'false');
                  };

                  const closeModal = () => {
                      cleanup();
                      modal.close();
                      triggerBtn.setAttribute('aria-expanded', 'false');
                      triggerBtn.focus();
                  };

                  const handleClose = (evt: Event) => {
                      evt.preventDefault();
                      evt.stopPropagation();
                      closeModal();
                  };

                  const handleSubmit = async (evt: Event) => {
                      evt.preventDefault();
                      evt.stopPropagation();

                      const postVal = postsCheckbox ? postsCheckbox.checked : false;
                      const replyVal = repliesCheckbox ? repliesCheckbox.checked : false;

                      try {
                          announcePolite(i18n.t('profile.activitySubSaving'));
                          const updated = await window.go.services.NotificationsService.PutActivitySubscription(res.did, postVal, replyVal);
                          res.viewerActivitySubscription = updated || { post: postVal, reply: replyVal };
                          announceAssertive(i18n.t('profile.activitySubSaved'));
                          closeModal();
                          loadProfile(false, true);
                      } catch (err: unknown) {
                          announceAssertive(i18n.t('profile.activitySubError', { err: String(err) }));
                      }
                  };

                  const cleanup = () => {
                      closeBtn?.removeEventListener('click', handleClose);
                      cancelBtn?.removeEventListener('click', handleClose);
                      form?.removeEventListener('submit', handleSubmit);
                      modal.removeEventListener('close', handleModalClose);
                  };

                  closeBtn?.addEventListener('click', handleClose);
                  cancelBtn?.addEventListener('click', handleClose);
                  form?.addEventListener('submit', handleSubmit);
                  modal.addEventListener('close', handleModalClose, { once: true });

                  modal.showModal();
                  postsCheckbox?.focus();
              });

              document.getElementById('btn-manage-lists')?.addEventListener('click', async (e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  try {
                      announcePolite(i18n.t('profile.loadingLists'));
                      const listsRes = await window.go.services.SocialService.GetListsWithMembership(res.did, "");
                      const listItems = listsRes?.items || [];
                      if (listItems.length === 0) {
                          announceAssertive(i18n.t('profile.noListsCreated'));
                          return;
                      }
                      const options = listItems.map((item, i) => `${i + 1}. ${item.listItemUri ? '[✓] ' : ''}${item.list.name}`).join("\n");
                      const chosen = await promptDialog(i18n.t('profile.chooseListPrompt', { handle: res.handle, options }), "1", i18n.t('profile.addToListTitle'));
                      if (chosen) {
                          const idx = parseInt(chosen, 10) - 1;
                          if (idx >= 0 && idx < listItems.length) {
                              const selected = listItems[idx];
                              if (selected.listItemUri) {
                                  await window.go.services.SocialService.RemoveUserFromList(selected.listItemUri);
                                  announceAssertive(i18n.t('sec2.removedFromListSuccess', { handle: res.handle, name: selected.list.name }));
                              } else {
                                  announcePolite(i18n.t('profile.addingToList', { handle: res.handle, name: selected.list.name }));
                                  await window.go.services.SocialService.AddUserToList(selected.list.uri, res.did);
                                  announceAssertive(i18n.t('profile.addedToList', { handle: res.handle, name: selected.list.name }));
                              }
                          } else {
                              announceAssertive(i18n.t('profile.invalidOption'));
                          }
                      }
                  } catch (err: unknown) {
                      announceAssertive(i18n.t('profile.manageListsError', { err: String(err) }));
                  }
              });
          } else {
              document.getElementById('btn-set-live-status')?.addEventListener('click', async (e) => {
                  e.stopPropagation();
                  const uri = await promptDialog(i18n.t('sec2.liveStatusUriPrompt'), "https://", i18n.t('sec2.setLiveStatus'));
                  if (!uri || !uri.trim()) return;
                  const title = (await promptDialog(i18n.t('sec2.liveStatusTitlePrompt'), "", i18n.t('sec2.setLiveStatus'))) || uri.trim();
                  const durStr = (await promptDialog(i18n.t('sec2.liveStatusDurationPrompt'), "60", i18n.t('sec2.setLiveStatus'))) || "60";
                  const durMin = parseInt(durStr, 10) || 60;
                  try {
                      await window.go.services.SocialService.SetActorStatus("", uri.trim(), title.trim(), "", durMin);
                      announceAssertive(i18n.t('sec2.liveStatusSetSuccess'));
                      loadProfile(false, true);
                  } catch (err: unknown) {
                      announceAssertive(i18n.t('post.error', { error: String(err) }));
                  }
              });

              document.getElementById('btn-clear-live-status')?.addEventListener('click', async (e) => {
                  e.stopPropagation();
                  try {
                      await window.go.services.SocialService.ClearActorStatus();
                      announceAssertive(i18n.t('sec2.liveStatusClearedSuccess'));
                      loadProfile(false, true);
                  } catch (err: unknown) {
                      announceAssertive(i18n.t('post.error', { error: String(err) }));
                  }
              });

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

                    populateEditProfileLinks(rawLinks);

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
                      console.error("Error loading self-labels:", err);
                    }

                    if (!dialog.open) dialog.showModal();
                    requestAnimationFrame(() => {
                      nameInput?.focus();
                    });
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
            feedRes.posts.forEach((post) => {
                if (!state.currentPosts.some(p => p.dataset.uri === post.uri)) {
                    const article = createPostArticle(post, state.currentPosts.length);
                    if (article) {
                        contentContainer.appendChild(article);
                        state.currentPosts.push(article);
                    }
                }
            });
            state.profileCursor = feedRes.cursor;
        }
    } else if (state.profileTabMode === 'likes') {
        let feedRes = await window.go.services.FeedService.GetActorLikes(state.currentHandle, state.profileCursor, 100);
        if (feedRes && feedRes.posts) {
            feedRes.posts.forEach((post) => {
                if (!state.currentPosts.some(p => p.dataset.uri === post.uri)) {
                    const article = createPostArticle(post, state.currentPosts.length);
                    if (article) {
                        contentContainer.appendChild(article);
                        state.currentPosts.push(article);
                    }
                }
            });
            state.profileCursor = feedRes.cursor;
        }
    } else if (state.profileTabMode === 'feeds') {
        const resData = await window.go.services.FeedService.GetActorFeeds(state.currentHandle, state.profileCursor);
        if (resData && resData.feeds && resData.feeds.length > 0) {
            resData.feeds.forEach((feed) => {
                const article = document.createElement('article');
                article.classList.add('post-item');
                article.setAttribute('tabindex', '0');
                article.dataset.index = state.currentPosts.length.toString();
                article.innerHTML = `
                    <h3>${esc(feed.displayName)} <small>(${renderProfileLink(feed.creator)})</small></h3>
                    <p>${linkify(feed.description || '')}</p>
                    <small>${i18n.t('feeds.likesCount', { count: (feed.likeCount || 0).toString() })}</small>
                    <div style="margin-top:6px; display:flex; gap:8px; flex-wrap:wrap;">
                        <button class="btn-open-actor-feed">${esc(i18n.t('feeds.openFeedBtn'))}</button>
                        <button class="btn-like-actor-feed">${esc(feed.viewerLike ? i18n.t('sec2.unlikeFeedBtn') : i18n.t('sec2.likeFeedBtn'))}</button>
                    </div>
                `;
                article.querySelector('.btn-open-actor-feed')?.addEventListener('click', (e) => {
                    e.stopPropagation();
                    state.currentFeedUri = feed.uri;
                    switchTab('timeline');
                    loadTimeline(false);
                });
                article.querySelector('.btn-like-actor-feed')?.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    const btn = e.currentTarget as HTMLButtonElement;
                    try {
                        if (feed.viewerLike) {
                            await window.go.services.FeedService.UnlikeFeedGenerator(feed.viewerLike);
                            feed.viewerLike = "";
                            feed.likeCount = Math.max(0, (feed.likeCount || 1) - 1);
                            btn.textContent = i18n.t('sec2.likeFeedBtn');
                            announceAssertive(i18n.t('sec2.feedUnlikedSuccess'));
                        } else {
                            const likeUri = await window.go.services.FeedService.LikeFeedGenerator(feed.uri, feed.cid || "");
                            feed.viewerLike = likeUri;
                            feed.likeCount = (feed.likeCount || 0) + 1;
                            btn.textContent = i18n.t('sec2.unlikeFeedBtn');
                            announceAssertive(i18n.t('sec2.feedLikedSuccess'));
                        }
                    } catch (err: unknown) {
                        announceAssertive(i18n.t('post.error', { error: String(err) }));
                    }
                });
                article.addEventListener('focus', () => {
                    const iStr = article.dataset.index;
                    if (iStr !== undefined) state.focusedPostIndex = parseInt(iStr, 10);
                });
                contentContainer.appendChild(article);
                state.currentPosts.push(article);
            });
            state.profileCursor = resData.cursor;
        }
    } else if (state.profileTabMode === 'followers' || state.profileTabMode === 'following') {
        const resData = state.profileTabMode === 'followers'
            ? await window.go.services.SocialService.GetFollowers(state.currentHandle, state.profileCursor)
            : await window.go.services.SocialService.GetFollows(state.currentHandle, state.profileCursor);
        
        if (resData && resData.profiles) {
            resData.profiles.forEach((prof) => {
                const div = document.createElement('article');
                div.classList.add('post-item');
                div.setAttribute('tabindex', '0');
                div.dataset.text = i18n.t('profile.profileCardAria', { name: prof.displayName || prof.handle, desc: prof.description || '' });
                div.innerHTML = `<h3>${esc(prof.displayName)} <small>(${renderProfileLink(prof.handle)})</small></h3><p>${linkify(prof.description || '')}</p>`;
                
                div.dataset.index = state.currentPosts.length.toString();
                div.addEventListener('focus', () => {
                    const iStr = div.dataset.index;
                    if (iStr !== undefined) state.focusedPostIndex = parseInt(iStr, 10);
                });
                
                const openProfile = () => {
                    state.currentHandle = prof.handle;
                    state.profileTabMode = 'posts';
                    announcePolite(i18n.t('profile.openingProfile', { handle: state.currentHandle }));
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
        const resData = await window.go.services.SocialService.GetActorLists(state.currentHandle, state.profileCursor);
        if (resData && resData.lists && resData.lists.length > 0) {
            resData.lists.forEach((list) => {
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
            contentContainer.innerHTML = `<p style="padding:15px; color:#aaa;">${i18n.t('profile.noListsForUser')}</p>`;
            announcePolite(i18n.t('profile.noListsFound'));
        }
    } else if (state.profileTabMode === 'starterPacks') {
        const resData = await window.go.services.SocialService.GetActorStarterPacks(state.currentHandle, state.profileCursor);
        if (resData && resData.starterPacks && resData.starterPacks.length > 0) {
            resData.starterPacks.forEach((item: StarterPackDTO) => {
                const article = document.createElement('article');
                article.classList.add('post-item');
                article.setAttribute('tabindex', '0');
                article.dataset.index = (state.currentPosts.length).toString();
                article.dataset.text = i18n.t('profile.starterPackCardAria', { name: item.name, desc: item.description || '' });
                article.setAttribute('aria-label', article.dataset.text);
                
                const isOwner = Boolean(
                    (item.creatorDid && item.creatorDid === state.loggedInDid) ||
                    (item.creator && state.loggedInHandle && item.creator.toLowerCase() === state.loggedInHandle.toLowerCase()) ||
                    (state.currentHandle && state.loggedInHandle && state.currentHandle.toLowerCase() === state.loggedInHandle.toLowerCase())
                );
                const followAllBtnHtml = item.listUri
                    ? `<button class="btn-follow-all-pack" data-list-uri="${esc(item.listUri)}" style="padding:4px 10px; font-weight:bold;">${i18n.t('profile.followAllBtn')}</button>`
                    : '';
                const editBtnHtml = isOwner
                    ? `<button class="btn-edit-starter-pack" data-uri="${esc(item.uri)}" style="padding:4px 10px;">${esc(i18n.t('sec2.editStarterPackBtn'))}</button>`
                    : '';
                const deleteBtnHtml = isOwner
                    ? `<button class="btn-delete-starter-pack" data-uri="${esc(item.uri)}" style="padding:4px 10px; background:#d32f2f; color:#fff;">${i18n.t('profile.deleteStarterPackBtn')}</button>`
                    : '';

                article.innerHTML = `
                    <h3>${esc(item.name)}</h3>
                    <p>${linkify(item.description || '')}</p>
                    <div style="margin-top:6px; display:flex; gap:8px; flex-wrap:wrap;">
                        <button class="btn-view-starter-pack" data-uri="${esc(item.uri)}" style="padding:4px 10px;">${esc(i18n.t('sec2.viewStarterPackBtn'))}</button>
                        ${followAllBtnHtml}
                        ${editBtnHtml}
                        ${deleteBtnHtml}
                    </div>
                    <div class="starter-pack-details-box hidden" style="margin-top:8px; padding:8px; border-top:1px solid #444;"></div>
                `;

                article.querySelector('.btn-view-starter-pack')?.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    const detailsBox = article.querySelector('.starter-pack-details-box') as HTMLDivElement | null;
                    if (!detailsBox) return;
                    if (!detailsBox.classList.contains('hidden')) {
                        detailsBox.classList.add('hidden');
                        return;
                    }
                    detailsBox.classList.remove('hidden');
                    detailsBox.innerHTML = `<p>${esc(i18n.t('modals.loading'))}</p>`;
                    try {
                        const detail = await window.go.services.SocialService.GetStarterPack(item.uri);
                        const membersHtml = (detail?.members || []).map(m => `<li>${esc(m.displayName || m.handle)} (${renderProfileLink(m.handle)})</li>`).join('');
                        const feedsHtml = (detail?.feeds || []).map(f => `<li>${esc(f.displayName)} (${renderProfileLink(f.creator)})</li>`).join('');
                        detailsBox.innerHTML = `
                            <p><strong>${esc(i18n.t('profile.tabFollowers'))}:</strong></p>
                            <ul>${membersHtml || `<li>-</li>`}</ul>
                            ${feedsHtml ? `<p><strong>${esc(i18n.t('sec2.tabActorFeeds'))}:</strong></p><ul>${feedsHtml}</ul>` : ''}
                        `;
                    } catch (err: unknown) {
                        detailsBox.innerHTML = `<p>${esc(String(err))}</p>`;
                    }
                });

                if (item.listUri) {
                    article.querySelector('.btn-follow-all-pack')?.addEventListener('click', async (e) => {
                        e.stopPropagation();
                        try {
                            announcePolite(i18n.t('profile.followingPackMembers', { name: item.name }));
                            const count = await window.go.services.SocialService.FollowAllInList(item.listUri);
                            announceAssertive(i18n.t('profile.followedPackMembersSuccess', { count: count.toString(), name: item.name }));
                        } catch (err: unknown) {
                            announceAssertive(i18n.t('profile.followPackMembersError', { err: String(err) }));
                        }
                    });
                }

                if (isOwner) {
                    article.querySelector('.btn-edit-starter-pack')?.addEventListener('click', async (e) => {
                        e.stopPropagation();
                        const newName = await promptDialog(i18n.t('sec2.editStarterPackNamePrompt'), item.name, i18n.t('sec2.editStarterPackBtn'));
                        if (!newName || !newName.trim()) return;
                        const newDesc = (await promptDialog(i18n.t('sec2.editStarterPackDescPrompt'), item.description || "", i18n.t('sec2.editStarterPackBtn'))) ?? "";
                        try {
                            await window.go.services.SocialService.EditStarterPack(item.uri, newName.trim(), newDesc.trim(), item.listUri || "", []);
                            announceAssertive(i18n.t('sec2.starterPackEditedSuccess'));
                            loadProfile(false, true);
                        } catch (err: unknown) {
                            announceAssertive(i18n.t('post.error', { error: String(err) }));
                        }
                    });

                    article.querySelector('.btn-delete-starter-pack')?.addEventListener('click', async (e) => {
                        e.stopPropagation();
                        if (await confirmDialog(i18n.t('profile.deleteStarterPackConfirm', { name: item.name }), i18n.t('profile.deleteStarterPackTitle'))) {
                            try {
                                announcePolite(i18n.t('profile.deletingStarterPack'));
                                await window.go.services.SocialService.DeleteStarterPack(item.uri);
                                announceAssertive(i18n.t('profile.deletedStarterPackSuccess'));
                                loadProfile(false, true);
                            } catch (err: unknown) {
                                announceAssertive(i18n.t('profile.deleteStarterPackError', { err: String(err) }));
                            }
                        }
                    });
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
            contentContainer.innerHTML = `<p style="padding:15px; color:#aaa;">${i18n.t('profile.noPacksForUser')}</p>`;
            announcePolite(i18n.t('profile.noPacksFound'));
        }
    }
    
    markPageLoaded('profile');
    state.tabStates['profile'].loaded = true;
    state.tabStates['profile'].lastHandle = state.currentHandle;
    if (!silent) announcePolite(i18n.t('profile.profileLoaded', { count: state.currentPosts.length.toString() }));
    if (!loadMore && state.currentPosts.length > 0) {
        const focused = await restoreFocusAfterReload({
            tab: 'profile',
            targetUri: keepFocus ? targetUri : "",
            pagesBefore,
            hasMore: () => Boolean(state.profileCursor),
            loadMore: async () => { await loadProfile(true, false, true); }
        });
        if (!focused && state.focusedPostIndex === -1) {
            state.focusedPostIndex = 0;
            state.currentPosts[0].focus();
        }
    }
  } catch (err: unknown) { console.error(err); announceAssertive(i18n.t('profile.loadProfileError')); } 
  finally { container.setAttribute('aria-busy', 'false'); }
}

export function setupProfile() {
  const editForm = document.getElementById('edit-profile-form') as HTMLFormElement;
  const cancelBtn = document.getElementById('btn-close-edit-profile');
  const saveBtn = document.getElementById('btn-save-profile') as HTMLButtonElement | null;
  const addLinkBtn = document.getElementById('btn-add-profile-link') as HTMLButtonElement | null;
  const dialog = document.getElementById('edit-profile-modal') as HTMLDialogElement;

  if (addLinkBtn) {
    addLinkBtn.addEventListener('click', () => {
      const listEl = document.getElementById('edit-profile-links-list');
      if (!listEl) return;
      const rows = listEl.querySelectorAll('.profile-link-row');
      if (rows.length >= 10) {
        announceAssertive(i18n.t('profile.maxLinksReached'));
        return;
      }
      const newRow = createProfileLinkRowElement();
      listEl.appendChild(newRow);
      (newRow.querySelector('.profile-link-title') as HTMLInputElement | null)?.focus();
    });
  }

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

    const links: ProfileLinkDTO[] = [];
    const linkRows = document.querySelectorAll<HTMLDivElement>('#edit-profile-links-list .profile-link-row');
    linkRows.forEach((row) => {
      const titleVal = (row.querySelector('.profile-link-title') as HTMLInputElement | null)?.value.trim() ?? '';
      let urlVal = (row.querySelector('.profile-link-url') as HTMLInputElement | null)?.value.trim() ?? '';
      if (urlVal) {
        if (!/^https?:\/\//i.test(urlVal)) {
          urlVal = `https://${urlVal}`;
        }
        links.push({
          uri: row.dataset.uri || undefined,
          cid: row.dataset.cid || undefined,
          title: titleVal || urlVal,
          url: urlVal
        });
      }
    });

    if (saveBtn) saveBtn.disabled = true;

    try {
      await window.go.services.SocialService.UpdateProfileWithLinks(name, desc, links);

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
        headerTitle.innerHTML = `${esc(name || `@${state.currentHandle}`)} (${renderProfileLink(state.currentHandle)})`;
      }
      const headerDesc = document.querySelector('.profile-header p.profile-bio');
      if (headerDesc) {
        headerDesc.innerHTML = linkify(desc);
      }

      announceAssertive(i18n.t('profile.profileUpdatedSuccess'));
      dialog.close();

      setTimeout(() => {
        loadProfile(false, true).catch((e) => console.error(e));
      }, 1200);
    } catch (err: unknown) {
      console.error("Error updating profile:", err);
      const msg = err instanceof Error ? err.message : String(err);
      showModalError(i18n.t('profile.saveErrorMsg', { msg }));
      announceAssertive(i18n.t('profile.updateProfileError', { msg }));
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

