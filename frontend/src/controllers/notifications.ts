import { state } from '../config/state';
import { announcePolite, announceAssertive, formatAuthor } from '../utils/a11y';
import { createPostArticle } from '../components/post';
import { i18n } from '../utils/i18n';
import { markPageLoaded, pagesLoadedFor, resetPagesLoaded, restoreFocusAfterReload, restoreKeyOf } from '../utils/pagination';

/** Reasons whose post lives in reasonSubject, so several of them collapse into one row. */
const GROUPABLE_REASONS = ['like', 'repost', 'like-via-repost', 'repost-via-repost'];

function groupNotificationsList(notifications: any[], hydratedMap: Record<string, any> = {}): any[] {
  const result: any[] = [];
  const groupMap = new Map<string, { main: any; authors: string[]; origText: string; isRepostOfRepost: boolean }>();
  const groupOrder: string[] = [];

  notifications.forEach((notif: any) => {
    if (GROUPABLE_REASONS.includes(notif.reason) && notif.reasonSubject) {
      const key = `${notif.reason}:${notif.reasonSubject}`;
      const authorLabel = formatAuthor(notif.authorName, notif.authorHandle);
      
      const postUri = notif.reasonSubject;
      const hydrated = hydratedMap[notif.uri] || hydratedMap[postUri];
      let isRepostOfRepost = false;
      if (notif.reason === 'repost' && hydrated) {
        // Identity is the DID or the handle; a display name proves nothing.
        const isMyPost = Boolean(hydrated.authorDid && hydrated.authorDid === state.loggedInDid) ||
                         Boolean(hydrated.authorHandle && hydrated.authorHandle === state.loggedInHandle);
        if (!isMyPost) {
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
        combinedAuthorName = i18n.t('notif.andOneOther', { name: group.authors[1] }).replace('{{name}}', group.authors[1]);
        if (combinedAuthorName.startsWith('and ') || combinedAuthorName.startsWith('y ') || combinedAuthorName.startsWith('e ')) {
             combinedAuthorName = `${group.authors[0]} ${combinedAuthorName}`;
        }
      } else if (count > 2) {
        let othersStr = i18n.t('notif.andOthers', { count: (count - 1).toString() });
        combinedAuthorName = `${group.authors[0]} ${othersStr}`;
      }

      notif.authorName = combinedAuthorName;

      const plural = count > 1;
      let verb = "";
      if (notif.reason === 'like') {
        verb = plural ? i18n.t('notif.likedYourPostPlural') : i18n.t('notif.likedYourPost');
      } else if (notif.reason === 'like-via-repost') {
        verb = plural ? i18n.t('notif.likedViaYourRepostPlural') : i18n.t('notif.likedViaYourRepost');
      } else if (notif.reason === 'repost-via-repost') {
        verb = plural ? i18n.t('notif.repostedViaYourRepostPlural') : i18n.t('notif.repostedViaYourRepost');
      } else if (group.isRepostOfRepost) {
        verb = plural ? i18n.t('notif.repostedYourRepostPlural') : i18n.t('notif.repostedYourRepost');
      } else {
        verb = plural ? i18n.t('notif.repostedYourPostPlural') : i18n.t('notif.repostedYourPost');
      }

      let cleanOrig = group.origText;
      if (cleanOrig.toLowerCase().startsWith('repostou') || cleanOrig.toLowerCase().startsWith('curtiu') || cleanOrig.toLowerCase().startsWith('liked') || cleanOrig.toLowerCase().startsWith('reposted')) {
        cleanOrig = "";
      }

      notif.text = cleanOrig ? `${verb}: ${cleanOrig}` : verb;
    }

    result.push(notif);
  });

  return result;
}

/** @param silent suppresses the "loaded" announcement, for pages fetched to restore focus. */
export async function loadNotifications(loadMore = false, keepFocus = false, silent = false) {
  if (loadMore && state.notificationsCursor === "") {
    announcePolite(i18n.t('notif.endOfNotifs'));
    return;
  }
  const container = document.getElementById('notif-items') as HTMLDivElement;
  container.setAttribute('aria-busy', 'true');
  let targetUri = "";
  let pagesBefore = 0;
  if (!loadMore && keepFocus && state.focusedPostIndex >= 0 && state.focusedPostIndex < state.currentPosts.length) {
    targetUri = restoreKeyOf(state.currentPosts[state.focusedPostIndex]);
    pagesBefore = pagesLoadedFor('notifications');
  }
  if (!loadMore) {
    state.notificationsCursor = "";
    resetPagesLoaded('notifications');
    // The list is cleared only once the response is in hand; wiping it here
    // left it empty for the whole request, and for good if the request failed.
  }
    try {
      const res = await window.go.services.NotificationsService.GetNotifications(state.notificationsCursor);
      if (res) markPageLoaded('notifications');
      if (res && res.notifications) {
        if (!loadMore) {
          container.innerHTML = '';
          state.currentPosts = [];
        }
        let itemsToRender = res.notifications;

        const hydratedMap: Record<string, any> = {};
        res.notifications.forEach((n) => {
            if (n.hydratedPost) {
                const key = GROUPABLE_REASONS.includes(n.reason) && n.reasonSubject ? n.reasonSubject : n.uri;
                hydratedMap[key] = n.hydratedPost;
            }
        });

        if (state.notificationFormat === 'combined') {
          itemsToRender = groupNotificationsList(res.notifications, hydratedMap);
        }

        itemsToRender.forEach((notif: any, idx: number) => {
          const postUri = GROUPABLE_REASONS.includes(notif.reason) && notif.reasonSubject
              ? notif.reasonSubject
              : notif.uri;
          const hydrated = notif.hydratedPost || hydratedMap[postUri];

        // The "-via-repost" reasons are, by definition, about a post we reposted.
        let isRepostOfRepost = notif.reason.endsWith('-via-repost');
        if (notif.reason === 'repost' && hydrated) {
            const isMyPost = Boolean(hydrated.authorDid && hydrated.authorDid === state.loggedInDid) ||
                             Boolean(hydrated.authorHandle && hydrated.authorHandle === state.loggedInHandle);
            if (!isMyPost) {
                isRepostOfRepost = true;
            }
        }

        const authorFormatted = formatAuthor(notif.authorName, notif.authorHandle);
        const repostNoun = isRepostOfRepost ? i18n.t('notif.yourRepost') : i18n.t('notif.yourPost');

        let notifText = notif.text || "";
        if (state.notificationFormat !== 'combined') {
            if (notif.reason === 'like') {
                notifText = notif.text ? i18n.t('notif.likedYourPostText', { text: notif.text }) : i18n.t('notif.likedYourPost');
            } else if (notif.reason === 'repost') {
                notifText = notif.text
                    ? (isRepostOfRepost ? i18n.t('notif.repostedYourRepostText', { text: notif.text }) : i18n.t('notif.repostedYourPostText', { text: notif.text }))
                    : (isRepostOfRepost ? i18n.t('notif.repostedYourRepost') : i18n.t('notif.repostedYourPost'));
            } else if (notif.reason === 'repost-via-repost') {
                notifText = notif.text
                    ? i18n.t('notif.repostedViaYourRepostText', { text: notif.text })
                    : i18n.t('notif.repostedViaYourRepost');
            } else if (notif.reason === 'like-via-repost') {
                notifText = notif.text
                    ? i18n.t('notif.likedViaYourRepostText', { text: notif.text })
                    : i18n.t('notif.likedViaYourRepost');
            }
        }

        if (notif.reason === 'follow') {
            notifText = i18n.t('notif.startedFollowing');
        } else if (notif.reason === 'quote') {
            notifText = i18n.t('notif.quotedYourPost', { text: notif.text || i18n.t('notif.quoteNoText') });
        } else if (notif.reason === 'reply') {
            // A reply notification also fires when we are only the thread root
            // author, so the answered post is frequently somebody else's.
            const replyText = notif.text || i18n.t('notif.replyNoText');
            const parentDid = notif.replyParentAuthorDid || "";
            const parentHandle = notif.replyParentAuthorHandle || "";
            // The DID is the stable identity; fall back to the handle only when
            // one of the two DIDs is missing, and to the old wording when the
            // answered post identifies nobody at all.
            let repliedToMe = true;
            if (parentDid && state.loggedInDid) {
                repliedToMe = parentDid === state.loggedInDid;
            } else if (parentHandle) {
                repliedToMe = parentHandle === state.loggedInHandle;
            }
            if (repliedToMe) {
                notifText = i18n.t('notif.repliedYourPost', { text: replyText });
            } else {
                const parentAuthor = formatAuthor(notif.replyParentAuthorName || "", parentHandle);
                // Unnamed parent: the notification still only reached us because
                // we own the thread root, so say that rather than claim the post.
                notifText = parentAuthor
                    ? i18n.t('notif.repliedToAuthor', { author: parentAuthor, text: replyText })
                    : i18n.t('notif.repliedInYourThread', { text: replyText });
            }
        } else if (notif.reason === 'mention') {
            notifText = i18n.t('notif.mentionedYou', { text: notif.text || i18n.t('notif.mentionNoText') });
        } else if (notif.reason === 'starterpack-joined') {
            notifText = i18n.t('notif.joinedStarterPack');
        } else if (notif.reason === 'verified') {
            notifText = i18n.t('notif.verifiedYou');
        } else if (notif.reason === 'unverified') {
            notifText = i18n.t('notif.unverifiedYou');
        } else if (notif.reason === 'contact-match') {
            notifText = i18n.t('notif.contactMatch');
        } else if (notif.reason === 'subscribed-post') {
            notifText = i18n.t('notif.subscribedPost', { text: notif.text || i18n.t('notif.postNoText') });
        }

        if (!notifText || notifText.trim() === "") {
            if (notif.reason === 'repost' || notif.reason === 'repost-via-repost') {
                notifText = `${i18n.t('notif.reposted')} ${repostNoun}`;
            } else if (notif.reason === 'like' || notif.reason === 'like-via-repost') {
                notifText = i18n.t('notif.likedYourPost');
            } else {
                notifText = i18n.t('notif.notificationFrom', { author: authorFormatted });
            }
        }

        const mockPost = {
           uri: postUri,
           cid: notif.cid,
           authorDid: notif.authorDid,
           authorName: notif.authorName,
           authorHandle: notif.authorHandle,
           isRepostOfRepost,
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

        // Identity for focus restore. A row's uri is the subject post, which
        // every like and repost of it shares, so it cannot tell rows apart. In
        // combined mode the row *is* the group, and the group key stays put as
        // new likes fold into it; otherwise the notification's own URI is
        // unique to the row.
        const isGroupedRow = state.notificationFormat === 'combined'
            && GROUPABLE_REASONS.includes(notif.reason)
            && Boolean(notif.reasonSubject);
        article.dataset.restoreKey = isGroupedRow
            ? `${notif.reason}:${notif.reasonSubject}`
            : (notif.uri || postUri);

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
      if (!silent) announcePolite(i18n.t('notif.notifsLoaded', { count: state.currentPosts.length.toString() }));
      window.go.services.NotificationsService.UpdateSeen(new Date().toISOString()).catch((e: any) => console.error(e));
    } else { if (!loadMore) container.innerHTML = `<p>${i18n.t('notif.noNotifs')}</p>`; }
    state.tabStates['notifications'].loaded = true;
    if (!loadMore && state.currentPosts.length > 0) {
        const focused = await restoreFocusAfterReload({
            tab: 'notifications',
            targetUri: keepFocus ? targetUri : "",
            pagesBefore,
            hasMore: () => state.notificationsCursor !== "",
            loadMore: async () => { await loadNotifications(true, false, true); }
        });
        // A refresh that was holding the user's place has to land them
        // somewhere definite. The row they were on has just been removed from
        // the DOM, so doing nothing drops focus to the document and loses the
        // reading position outright. A plain load leaves focus alone: there
        // the user is still standing on the tab button they pressed.
        const wasHoldingPlace = keepFocus && Boolean(targetUri);
        if (!focused && (wasHoldingPlace || state.focusedPostIndex === -1)) {
            state.focusedPostIndex = 0;
            state.currentPosts[0].focus();
        } else if (state.focusedPostIndex >= state.currentPosts.length) {
            // The rebuilt list is shorter than where the saved index pointed.
            state.focusedPostIndex = state.currentPosts.length - 1;
        }
    }
  } catch (err: any) { console.error(err); announceAssertive(i18n.t('notif.loadError')); } 
  finally { container.setAttribute('aria-busy', 'false'); }
}
