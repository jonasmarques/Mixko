import { DOM } from '../config/dom';
import { state } from '../config/state';
import { announcePolite } from '../utils/a11y';
import { loadTimeline } from './timeline';
import { loadNotifications } from './notifications';
import { loadProfile } from './profile';
import { loadChat } from './chat';
import { loadFeedsTab } from './feeds';
import { loadSavedPosts } from './saved';
import { loadListsTab } from './lists';

export async function updateCurrentTab() {
  if (state.currentTab === 'timeline') await loadTimeline(false, true);
  else if (state.currentTab === 'profile') await loadProfile(false, true);
  else if (state.currentTab === 'notifications') await loadNotifications(false, true);
  else if (state.currentTab === 'chat' && !state.activeConvoId) await loadChat(false);
  else if (state.currentTab === 'saved') await loadSavedPosts(false, true);
  else if (state.currentTab === 'lists') await loadListsTab(false);
}

export function switchTab(tabId: keyof typeof DOM.panels) {
  const postsModal = document.getElementById('posts-list-modal') as HTMLDialogElement;
  if (postsModal && postsModal.open) postsModal.close();
  const profilesModal = document.getElementById('profiles-list-modal') as HTMLDialogElement;
  if (profilesModal && profilesModal.open) profilesModal.close();

  if (state.currentTab === tabId && tabId === 'timeline') {
      state.currentFeedUri = "";
      // Removed: state.tabStates['timeline'].loaded = false; to prevent annoying reloads
  }

  // Force automatic update for all tabs EXCEPT timeline
  if (tabId !== 'timeline' && state.currentTab !== tabId) {
      state.tabStates[tabId].loaded = false;
  }

  if (state.currentTab) {
      state.tabStates[state.currentTab].posts = state.currentPosts;
      state.tabStates[state.currentTab].focusedIndex = state.focusedPostIndex;
  }
  
  Object.values(DOM.panels).forEach(p => p.classList.add('hidden'));
  Object.values(DOM.tabs).forEach(t => {
      t.setAttribute('aria-selected', 'false');
      t.classList.remove('active');
  });

  DOM.panels[tabId].classList.remove('hidden');
  DOM.tabs[tabId].setAttribute('aria-selected', 'true');
  DOM.tabs[tabId].classList.add('active');
  
  state.currentTab = tabId;
  state.currentPosts = state.tabStates[tabId].posts;
  state.focusedPostIndex = state.tabStates[tabId].focusedIndex;

  const ts = state.tabStates[tabId];
  if (!ts.loaded || (tabId === 'profile' && ts.lastHandle !== state.currentHandle)) {
      if (tabId === 'timeline') loadTimeline();
      else if (tabId === 'notifications') loadNotifications();
      else if (tabId === 'profile') loadProfile();
      else if (tabId === 'chat') loadChat();
      else if (tabId === 'feeds') loadFeedsTab();
      else if (tabId === 'saved') loadSavedPosts();
      else if (tabId === 'lists') loadListsTab();
  } else {
      announcePolite(` ${tabId}: ${state.currentPosts.length} itens.`);
      if (state.focusedPostIndex >= 0 && state.focusedPostIndex < state.currentPosts.length) {
          state.currentPosts[state.focusedPostIndex].focus();
      }
  }
}

export function reloadCurrentTab(keepFocus = true) {
  announcePolite(`Recarregando aba ${state.currentTab}...`);
  if (state.currentTab === 'timeline') loadTimeline(false, keepFocus);
  else if (state.currentTab === 'notifications') loadNotifications(false, keepFocus);
  else if (state.currentTab === 'profile') loadProfile(false, keepFocus);
  else if (state.currentTab === 'chat') loadChat();
  else if (state.currentTab === 'feeds') loadFeedsTab();
  else if (state.currentTab === 'saved') loadSavedPosts(false, keepFocus);
  else if (state.currentTab === 'lists') loadListsTab(false);
}
