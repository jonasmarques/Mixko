import { state } from '../config/state';
import { announcePolite, announceAssertive, formatAuthor } from '../utils/a11y';
import { createPostArticle } from '../components/post';

function groupNotificationsList(notifications: any[], hydratedMap: Record<string, any> = {}): any[] {
  const result: any[] = [];
  const groupMap = new Map<string, { main: any; authors: string[]; origText: string; isRepostOfRepost: boolean }>();
  const groupOrder: string[] = [];

  notifications.forEach((notif: any) => {
    if ((notif.reason === 'like' || notif.reason === 'repost') && notif.reasonSubject) {
      const key = `${notif.reason}:${notif.reasonSubject}`;
      const authorLabel = formatAuthor(notif.authorName, notif.authorHandle);
      
      const postUri = notif.reasonSubject;
      const hydrated = hydratedMap[notif.uri] || hydratedMap[postUri];
      let isRepostOfRepost = false;
      if (notif.reason === 'repost') {
        if (hydrated) {
          const isMyPost = (hydrated.authorHandle === state.loggedInHandle) ||
                           (hydrated.authorDid === state.loggedInHandle) ||
                           (hydrated.authorName === state.loggedInHandle);
          if (!isMyPost) {
            isRepostOfRepost = true;
          }
        } else if (notif.text && notif.text.toLowerCase().includes('sua repostagem')) {
          isRepostOfRepost = true;
        }
      }

      if (!groupMap.has(key)) {
        groupMap.set(key, {
          main: notif,
          authors: [authorLabel],
          origText: notif.text || "",
          isRepostOfRepost
        });
        groupOrder.push(key);
      } else {
        const group = groupMap.get(key)!;
        if (!group.authors.includes(authorLabel)) {
          group.authors.push(authorLabel);
        }
        if (isRepostOfRepost) {
          group.isRepostOfRepost = true;
        }
      }
    } else {
      const uniqueKey = `single_${groupOrder.length}_${notif.uri}`;
      groupMap.set(uniqueKey, {
        main: notif,
        authors: [],
        origText: notif.text || "",
        isRepostOfRepost: false
      });
      groupOrder.push(uniqueKey);
    }
  });

  groupOrder.forEach((key) => {
    const group = groupMap.get(key)!;
    const notif = { ...group.main };

    if (group.authors.length > 0) {
      const count = group.authors.length;
      let combinedAuthorName = group.authors[0];
      if (count === 2) {
        combinedAuthorName = `${group.authors[0]} e ${group.authors[1]}`;
      } else if (count > 2) {
        combinedAuthorName = `${group.authors[0]} e outras ${count - 1} pessoas`;
      }

      notif.authorName = combinedAuthorName;

      let verb = "";
      if (notif.reason === 'like') {
        verb = count === 1 ? 'curtiu seu post' : 'curtiram seu post';
      } else {
        const targetNoun = group.isRepostOfRepost ? 'sua repostagem' : 'seu post';
        verb = count === 1 ? `repostou ${targetNoun}` : `repostaram ${targetNoun}`;
      }

      let cleanOrig = group.origText;
      if (cleanOrig.toLowerCase().startsWith('repostou') || cleanOrig.toLowerCase().startsWith('curtiu')) {
        cleanOrig = "";
      }

      notif.text = cleanOrig ? `${verb}: ${cleanOrig}` : verb;
    }

    result.push(notif);
  });

  return result;
}

export async function loadNotifications(loadMore = false, keepFocus = false) {
  if (loadMore && state.notificationsCursor === "") {
    announcePolite("Fim das notificações alcançado.");
    return;
  }
  const container = document.getElementById('notif-items') as HTMLDivElement;
  container.setAttribute('aria-busy', 'true');
  let targetUri = "";
  if (!loadMore && keepFocus && state.focusedPostIndex >= 0 && state.focusedPostIndex < state.currentPosts.length) {
    targetUri = state.currentPosts[state.focusedPostIndex]?.dataset.uri || "";
  }
  if (!loadMore) {
    state.notificationsCursor = "";
    container.innerHTML = '';
    state.currentPosts = [];
  }
  try {
    const res = await window.go.services.NotificationsService.GetNotifications(state.notificationsCursor);
    if (res && res.notifications) {
      const urisToHydrate = res.notifications
        .map((n: any) => ((n.reason === 'like' || n.reason === 'repost') && n.reasonSubject) ? n.reasonSubject : n.uri)
        .filter((uri: string) => !!uri);
      
      let hydratedMap: Record<string, any> = {};
      if (urisToHydrate.length > 0) {
          try {
              const hydrateRes = await window.go.services.FeedService.GetPosts(urisToHydrate);
              if (hydrateRes && hydrateRes.posts) {
                  hydrateRes.posts.forEach((p: any) => {
                      hydratedMap[p.uri] = p;
                  });
              }
          } catch(e) { console.warn("Failed to hydrate notifications", e); }
      }

      let itemsToRender = res.notifications;
      if (state.notificationFormat === 'combined') {
        itemsToRender = groupNotificationsList(res.notifications, hydratedMap);
      }

      itemsToRender.forEach((notif: any, idx: number) => {
        const postUri = (notif.reason === 'like' || notif.reason === 'repost') && notif.reasonSubject
            ? notif.reasonSubject
            : notif.uri;
        const hydrated = hydratedMap[notif.uri] || hydratedMap[postUri];

        let isRepostOfRepost = false;
        if (notif.reason === 'repost') {
            if (hydrated) {
                const isMyPost = (hydrated.authorHandle === state.loggedInHandle) ||
                                 (hydrated.authorDid === state.loggedInHandle) ||
                                 (hydrated.authorName === state.loggedInHandle);
                if (!isMyPost) {
                    isRepostOfRepost = true;
                }
            } else if (notif.text && notif.text.toLowerCase().includes('sua repostagem')) {
                isRepostOfRepost = true;
            }
        }

        const authorFormatted = formatAuthor(notif.authorName, notif.authorHandle);
        const repostNoun = isRepostOfRepost ? 'sua repostagem' : 'seu post';

        let notifText = notif.text || "";
        if (notif.reason === 'like') {
            if (!notifText.toLowerCase().startsWith('curti')) {
                notifText = `curtiu seu post: ${notif.text || ""}`;
            }
        } else if (notif.reason === 'repost') {
            if (!notifText.toLowerCase().startsWith('repost')) {
                if (notif.text && notif.text.toLowerCase().startsWith('repostou')) {
                    notifText = notif.text;
                } else {
                    notifText = `repostou ${repostNoun}: ${notif.text || ""}`;
                }
            } else {
                if (isRepostOfRepost && notifText.includes('seu post')) {
                    notifText = notifText.replace('seu post', 'sua repostagem');
                }
            }
        } else if (notif.reason === 'follow') {
            notifText = `começou a seguir você.`;
        } else if (notif.reason === 'quote') {
            notifText = `citou seu post: ${notif.text || "Citação sem texto"}`;
        } else if (notif.reason === 'reply') {
            notifText = `respondeu ao seu post: ${notif.text || "Resposta sem texto"}`;
        } else if (notif.reason === 'mention') {
            notifText = `mencionou você: ${notif.text || "Menção sem texto"}`;
        }

        if (!notifText || notifText.trim() === "") {
            if (notif.reason === 'repost') {
                notifText = `repostou ${repostNoun}`;
            } else if (notif.reason === 'like') {
                notifText = `curtiu seu post`;
            } else {
                notifText = `Notificação de ${authorFormatted}`;
            }
        }

        const mockPost = {
           uri: postUri,
           cid: notif.cid,
           authorName: notif.authorName,
           authorHandle: notif.authorHandle,
           text: notifText,
           hasMedia: hydrated ? hydrated.hasMedia : notif.hasMedia,
           video: hydrated ? hydrated.video : notif.video,
           imageAlts: hydrated ? hydrated.imageAlts : undefined,
           external: hydrated ? hydrated.external : undefined,
           createdAt: notif.indexedAt,
           replyCount: hydrated ? hydrated.replyCount : undefined,
           repostCount: hydrated ? hydrated.repostCount : undefined,
           likeCount: hydrated ? hydrated.likeCount : undefined,
           viewerLike: hydrated ? hydrated.viewerLike : undefined,
           viewerRepost: hydrated ? hydrated.viewerRepost : undefined,
           quotePost: (hydrated && hydrated.quotePost) ? hydrated.quotePost : (notif.quoteUri ? {
               uri: notif.quoteUri,
               authorName: notif.quoteAuthorName,
               authorHandle: notif.quoteAuthorHandle,
               text: notif.quoteText,
           } : undefined)
        };
        const article = createPostArticle(mockPost, idx, true, notif.reason);
        container.appendChild(article);
        const isMention = ['mention', 'reply', 'quote'].includes(notif.reason);
        if (state.showOnlyMentions && !isMention) {
            article.style.display = 'none';
        } else {
            article.dataset.index = state.currentPosts.length.toString();
            state.currentPosts.push(article);
        }
      });
      state.notificationsCursor = res.cursor || "";
      announcePolite(`${state.currentPosts.length} notificações carregadas.`);
      window.go.services.NotificationsService.UpdateSeen(new Date().toISOString()).catch((e: any) => console.error(e));
    } else { if (!loadMore) container.innerHTML = '<p>Nenhuma notificação.</p>'; }
    state.tabStates['notifications'].loaded = true;
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
  } catch (err: any) { console.error(err); announceAssertive("Erro ao carregar notificações."); } 
  finally { container.setAttribute('aria-busy', 'false'); }
}
