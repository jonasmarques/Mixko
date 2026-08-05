import { announceAssertive, announcePolite } from '../utils/a11y';

export async function checkAppUpdates() {
    try {
        const res = await (window as any).go?.services?.UpdaterService?.CheckForUpdate();
        if (res && res.hasUpdate) {
            const modal = document.getElementById('update-modal') as HTMLDialogElement;
            const textEl = document.getElementById('update-modal-text') as HTMLParagraphElement;
            const btnNow = document.getElementById('btn-update-now') as HTMLButtonElement;
            const btnIgnore = document.getElementById('btn-update-ignore') as HTMLButtonElement;

            if (modal && textEl) {
                textEl.textContent = `Uma nova versão do Mixko está disponível (${res.latestVersion}). Você está utilizando a versão ${res.currentVersion}. Deseja atualizar agora?`;

                if (btnNow) {
                    btnNow.onclick = () => {
                        const targetUrl = res.releaseUrl || "https://github.com/jonasmarques/Mixko/releases";
                        if ((window as any).runtime?.BrowserOpenURL) {
                            (window as any).runtime.BrowserOpenURL(targetUrl);
                        } else {
                            window.open(targetUrl, '_blank');
                        }
                        modal.close();
                        announcePolite("Redirecionando para a página de atualização...");
                    };
                }

                if (btnIgnore) {
                    btnIgnore.onclick = () => {
                        modal.close();
                        announcePolite("Atualização ignorada.");
                    };
                }

                modal.showModal();
                btnNow?.focus();
                announceAssertive(`Atenção: Nova versão ${res.latestVersion} disponível. Sua versão atual é ${res.currentVersion}.`);
            }
        }
    } catch (err) {
        console.warn("Erro ao verificar atualizações:", err);
    }
}
