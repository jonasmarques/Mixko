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
import { loadSettings } from './settings';
import { i18n } from '../utils/i18n';

const TAB_CACHE_TTL_MS: Partial<Record<keyof typeof DOM.panels, number>> = {
  notifications: 60_000,
  profile: 60_000,
  chat: 60_000,
  feeds: 120_000,
  saved: 120_000,
  lists: 120_000,
  settings: 300_000,
};

function isTabStale(tabId: keyof typeof DOM.panels, loadedAt?: number): boolean {
  const ttl = TAB_CACHE_TTL_MS[tabId];
  if (!ttl) return false;
  if (!loadedAt) return true;
  return Date.now() - loadedAt >= ttl;
}

export async function updateCurrentTab() {
  state.tabStates[state.currentTab].loadedAt = Date.now();
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
  const muteOptionsModal = document.getElementById('mute-options-modal') as HTMLDialogElement;
  if (muteOptionsModal && muteOptionsModal.open) muteOptionsModal.close();

  if (state.currentTab === tabId && tabId === 'timeline') {
      state.currentFeedUri = "";
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
  const needsLoad =
      !ts.loaded ||
      (tabId === 'profile' && ts.lastHandle !== state.currentHandle) ||
      isTabStale(tabId, ts.loadedAt);

  if (needsLoad) {
      ts.loadedAt = Date.now();
      if (tabId === 'timeline') loadTimeline();
      else if (tabId === 'notifications') loadNotifications();
      else if (tabId === 'profile') loadProfile();
      else if (tabId === 'chat') loadChat();
      else if (tabId === 'feeds') loadFeedsTab();
      else if (tabId === 'saved') loadSavedPosts();
      else if (tabId === 'lists') loadListsTab();
      else if (tabId === 'settings') loadSettings();
  } else {
      announcePolite(i18n.t('tabs.tabItems', { tab: tabId, count: state.currentPosts.length.toString() }));
      if (state.focusedPostIndex >= 0 && state.focusedPostIndex < state.currentPosts.length) {
          state.currentPosts[state.focusedPostIndex].focus();
      }
  }
  if (tabId === 'settings') {
      requestAnimationFrame(() => {
          const firstSetting = document.getElementById('lang-override-select') as HTMLElement | null;
          firstSetting?.focus();
      });
  }
}

export function reloadCurrentTab(keepFocus = true) {
  announcePolite(i18n.t('tabs.reloadingTab', { tab: state.currentTab }));
  state.tabStates[state.currentTab].loadedAt = Date.now();
  if (state.currentTab === 'timeline') loadTimeline(false, keepFocus);
  else if (state.currentTab === 'notifications') loadNotifications(false, keepFocus);
  else if (state.currentTab === 'profile') loadProfile(false, keepFocus);
  else if (state.currentTab === 'chat') loadChat();
  else if (state.currentTab === 'feeds') loadFeedsTab();
  else if (state.currentTab === 'saved') loadSavedPosts(false, keepFocus);
  else if (state.currentTab === 'lists') loadListsTab(false);
  else if (state.currentTab === 'settings') loadSettings();
}
