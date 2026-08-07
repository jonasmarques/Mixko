import { announceAssertive, announcePolite } from '../utils/a11y';
import { i18n } from '../utils/i18n';

export async function checkAppUpdates() {
    try {
        const res = await (window as any).go?.services?.UpdaterService?.CheckForUpdate();
        if (res && res.hasUpdate) {
            const modal = document.getElementById('update-modal') as HTMLDialogElement;
            const textEl = document.getElementById('update-modal-text') as HTMLParagraphElement;
            const btnNow = document.getElementById('btn-update-now') as HTMLButtonElement;
            const btnIgnore = document.getElementById('btn-update-ignore') as HTMLButtonElement;

            if (modal && textEl) {
                textEl.textContent = i18n.t('updater.updateAvailable', { latest: res.latestVersion, current: res.currentVersion });

                if (btnNow) {
                    btnNow.onclick = () => {
                        const targetUrl = res.releaseUrl || "https://github.com/jonasmarques/Mixko/releases";
                        if ((window as any).runtime?.BrowserOpenURL) {
                            (window as any).runtime.BrowserOpenURL(targetUrl);
                        } else {
                            window.open(targetUrl, '_blank');
                        }
                        modal.close();
                        announcePolite(i18n.t('updater.redirecting'));
                    };
                }

                if (btnIgnore) {
                    btnIgnore.onclick = () => {
                        modal.close();
                        announcePolite(i18n.t('updater.ignored'));
                    };
                }

                modal.showModal();
                btnNow?.focus();
                announceAssertive(i18n.t('updater.attention', { latest: res.latestVersion, current: res.currentVersion }));
            }
        }
    } catch (err) {
        console.warn("Error checking for updates:", err);
    }
}
