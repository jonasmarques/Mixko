import { announceAssertive, announcePolite } from '../utils/a11y';
import { i18n } from '../utils/i18n';
import { state } from '../config/state';

interface BrowserRuntime {
    BrowserOpenURL?: (url: string) => void;
}

export async function checkAppUpdates() {
    try {
        const res = await window.go?.services?.UpdaterService?.CheckForUpdate();
        if (res && res.hasUpdate) {
            const modal = document.getElementById('update-modal') as HTMLDialogElement | null;
            const textEl = document.getElementById('update-modal-text') as HTMLParagraphElement | null;
            const btnNow = document.getElementById('btn-update-now') as HTMLButtonElement | null;
            const btnIgnore = document.getElementById('btn-update-ignore') as HTMLButtonElement | null;

            if (modal && textEl) {
                textEl.textContent = i18n.t('updater.updateAvailable', { latest: res.latestVersion, current: res.currentVersion });

                const restoreAppFocus = () => {
                    if (state.currentPosts.length > 0) {
                        const idx = state.focusedPostIndex >= 0 ? state.focusedPostIndex : 0;
                        state.focusedPostIndex = idx;
                        state.currentPosts[idx]?.focus();
                    }
                };

                if (btnNow) {
                    btnNow.onclick = () => {
                        const targetUrl = res.releaseUrl || "https://github.com/jonasmarques/Mixko/releases";
                        const rt = (window as unknown as { runtime?: BrowserRuntime }).runtime;
                        if (rt?.BrowserOpenURL) {
                            rt.BrowserOpenURL(targetUrl);
                        } else {
                            window.open(targetUrl, '_blank');
                        }
                        modal.close();
                        restoreAppFocus();
                        announcePolite(i18n.t('updater.redirecting'));
                    };
                }

                if (btnIgnore) {
                    btnIgnore.onclick = () => {
                        modal.close();
                        restoreAppFocus();
                        announcePolite(i18n.t('updater.ignored'));
                    };
                }

                if (!modal.open) modal.showModal();
                requestAnimationFrame(() => {
                    btnNow?.focus();
                });
                announceAssertive(i18n.t('updater.attention', { latest: res.latestVersion, current: res.currentVersion }));
            }
        }
    } catch (err) {
        console.warn("Error checking for updates:", err);
    }
}
