import { announcePolite } from './a11y';

export function confirmDialog(message: string, title: string = 'Confirmação'): Promise<boolean> {
  return new Promise((resolve) => {
    const dialog = document.createElement('dialog');
    dialog.className = 'custom-dialog modal-content';
    dialog.setAttribute('role', 'alertdialog');
    dialog.setAttribute('aria-labelledby', 'dialog-title');
    dialog.setAttribute('aria-describedby', 'dialog-desc');
    dialog.style.padding = '20px';
    dialog.style.borderRadius = '8px';
    dialog.style.border = '1px solid var(--border-color, #444)';
    dialog.style.background = 'var(--bg-color, #1e1e2e)';
    dialog.style.color = 'var(--text-color, #fff)';
    dialog.style.maxWidth = '400px';
    dialog.style.width = '90%';

    dialog.innerHTML = `
      <h3 id="dialog-title" style="margin-top:0;">${title}</h3>
      <p id="dialog-desc" style="margin-bottom:20px;">${message}</p>
      <div style="display:flex; justify-content:flex-end; gap:10px;">
        <button id="dialog-cancel" type="button" style="padding:6px 14px;">Cancelar</button>
        <button id="dialog-confirm" type="button" style="padding:6px 14px; background-color:#d32f2f; color:#fff; border:none; border-radius:4px;">Confirmar</button>
      </div>
    `;

    document.body.appendChild(dialog);
    announcePolite(`${title}: ${message}`);

    const cleanup = (result: boolean) => {
      dialog.close();
      dialog.remove();
      resolve(result);
    };

    const confirmBtn = dialog.querySelector('#dialog-confirm') as HTMLButtonElement;
    const cancelBtn = dialog.querySelector('#dialog-cancel') as HTMLButtonElement;

    confirmBtn.onclick = () => cleanup(true);
    cancelBtn.onclick = () => cleanup(false);

    dialog.onkeydown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        cleanup(false);
      }
    };

    dialog.showModal();
    confirmBtn.focus();
  });
}

export function promptDialog(message: string, defaultValue: string = '', title: string = 'Entrada'): Promise<string | null> {
  return new Promise((resolve) => {
    const dialog = document.createElement('dialog');
    dialog.className = 'custom-dialog modal-content';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-labelledby', 'dialog-title');
    dialog.style.padding = '20px';
    dialog.style.borderRadius = '8px';
    dialog.style.border = '1px solid var(--border-color, #444)';
    dialog.style.background = 'var(--bg-color, #1e1e2e)';
    dialog.style.color = 'var(--text-color, #fff)';
    dialog.style.maxWidth = '400px';
    dialog.style.width = '90%';

    dialog.innerHTML = `
      <h3 id="dialog-title" style="margin-top:0;">${title}</h3>
      <label for="dialog-input" style="display:block; margin-bottom:8px;">${message}</label>
      <input id="dialog-input" type="text" value="${defaultValue}" style="width:100%; padding:8px; margin-bottom:20px; box-sizing:border-box; background:#121212; color:#fff; border:1px solid #555; border-radius:4px;" />
      <div style="display:flex; justify-content:flex-end; gap:10px;">
        <button id="dialog-cancel" type="button" style="padding:6px 14px;">Cancelar</button>
        <button id="dialog-submit" type="button" style="padding:6px 14px; background-color:#1976d2; color:#fff; border:none; border-radius:4px;">OK</button>
      </div>
    `;

    document.body.appendChild(dialog);
    announcePolite(`${title}: ${message}`);

    const input = dialog.querySelector('#dialog-input') as HTMLInputElement;
    const submitBtn = dialog.querySelector('#dialog-submit') as HTMLButtonElement;
    const cancelBtn = dialog.querySelector('#dialog-cancel') as HTMLButtonElement;

    const cleanup = (result: string | null) => {
      dialog.close();
      dialog.remove();
      resolve(result);
    };

    submitBtn.onclick = () => cleanup(input.value);
    cancelBtn.onclick = () => cleanup(null);

    input.onkeydown = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        cleanup(input.value);
      }
    };

    dialog.onkeydown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        cleanup(null);
      }
    };

    dialog.showModal();
    input.focus();
    input.select();
  });
}
