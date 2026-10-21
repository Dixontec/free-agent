(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const node = (tag, text, parent) => { const el = document.createElement(tag); if (text) el.textContent = text; if (parent) parent.append(el); return el; };
  window.FreeAgentBrowserWorkspace = { setup({ bridge, invoke, setOpen, setExpanded, schedule }) {
    let state = { tabs: [] }, shortcuts = [], settingsSignature = '', permissionId = null;
    try {
      const share = Number(localStorage.getItem('free-agent-browser-share'));
      if (share >= .25 && share <= .75) document.documentElement.style.setProperty('--browser-share', `${share * 100}%`);
      const saved = JSON.parse(localStorage.getItem('free-agent-browser-shortcuts') || '[]');
      if (Array.isArray(saved)) shortcuts = saved.filter(s => typeof s.name === 'string' && typeof s.url === 'string' && /^https?:\/\//.test(s.url)).slice(0, 5);
    } catch {}
    function dialog(id, title) {
      const d = node('dialog'); d.id = id; node('h3', title, d); $('browserDrawer').append(d);
      d.addEventListener('close', schedule); d.addEventListener('cancel', schedule);
      return d;
    }
    function button(parent, text, action) { const b = node('button', text, parent); b.type = 'button'; b.addEventListener('click', action); return b; }
    function show(d) { d.showModal(); schedule(); }
    const shortcutDialog = dialog('browserShortcutDialog', 'Atalho da página inicial');
    const nameLabel = node('label', 'Nome', shortcutDialog), name = node('input', '', nameLabel); name.maxLength = 40;
    const urlLabel = node('label', 'Endereço do site', shortcutDialog), address = node('input', '', urlLabel); address.placeholder = 'youtube.com'; address.maxLength = 4096;
    const shortcutError = node('p', '', shortcutDialog); shortcutError.setAttribute('role', 'status');
    const shortcutActions = node('div', '', shortcutDialog); shortcutActions.className = 'browser-dialog-actions';
    let editing = -1;
    const removeShortcut = button(shortcutActions, 'Excluir', () => { shortcuts.splice(editing, 1); persistShortcuts(); shortcutDialog.close(); });
    button(shortcutActions, 'Cancelar', () => shortcutDialog.close());
    button(shortcutActions, 'Salvar', async () => {
      try {
        if (!name.value.trim()) throw Error('Informe um nome.');
        const raw = address.value.trim();
        if (!/^https?:\/\//i.test(raw) && !/^[^\s/]+\.[^\s/]+(?:\/|$)/.test(raw)) throw Error('Informe um domínio ou endereço HTTP/HTTPS.');
        const result = await bridge.invoke('normalize', { value: raw });
        const value = { name: name.value.trim(), url: result.url };
        if (editing >= 0) shortcuts[editing] = value;
        else { if (shortcuts.length >= 5) throw Error('Limite de cinco atalhos.'); shortcuts.push(value); }
        persistShortcuts(); shortcutDialog.close();
      } catch (error) { shortcutError.textContent = error.message; }
    });
    function editShortcut(index) { editing = index; name.value = shortcuts[index]?.name || ''; address.value = shortcuts[index]?.url || ''; removeShortcut.hidden = index < 0; shortcutError.textContent = ''; show(shortcutDialog); }
    function persistShortcuts() { localStorage.setItem('free-agent-browser-shortcuts', JSON.stringify(shortcuts)); renderShortcuts(); }
    function renderShortcuts() {
      $('browserShortcuts').replaceChildren();
      shortcuts.forEach((s, index) => {
        const card = node('div', '', $('browserShortcuts')); card.className = 'browser-shortcut';
        const b = button(card, '', () => void invoke(state.activeId ? 'navigate' : 'create', state.activeId ? { value: s.url } : { url: s.url })); b.className = 'browser-shortcut-main'; b.setAttribute('aria-label', s.name);
        const icon = node('span', '', b); icon.className = 'browser-shortcut-icon';
        const initial = node('span', s.name[0]?.toUpperCase() || '↗', icon);
        // Saved URL has been normalized by the engine; an icon failure is harmless.
        try { const u = new URL(s.url); if (!u.username && !u.password && u.hostname.includes('.') && !/^(localhost|127\.|10\.|192\.168\.)/.test(u.hostname)) {
          const img = node('img'); img.alt = ''; img.referrerPolicy = 'no-referrer'; img.src = u.origin + '/favicon.ico'; img.onload = () => { initial.hidden = true; }; img.onerror = () => img.remove(); icon.append(img);
        } } catch {}
        node('span', s.name, b).className = 'browser-shortcut-label'; b.title = s.url;
        const edit = button(card, '⋯', () => editShortcut(index)); edit.className = 'browser-shortcut-edit'; edit.setAttribute('aria-label', `Editar atalho ${s.name}`);
      });
      if (shortcuts.length < 5) {
        const card = node('div', '', $('browserShortcuts')); card.className = 'browser-shortcut';
        const b = button(card, '', () => editShortcut(-1)); b.className = 'browser-shortcut-main';
        node('span', '+', b).className = 'browser-shortcut-icon'; node('span', 'Adicionar atalho', b); b.setAttribute('aria-label', 'Adicionar atalho');
      }
    }
    renderShortcuts();
    const settings = dialog('browserSettings', 'Configurações do navegador');
    const settingsBody = node('div', '', settings);
    const settingsError = node('p', '', settings); settingsError.setAttribute('role', 'status');
    async function setting(command, payload = {}) {
      settingsError.textContent = '';
      try { return await bridge.invoke(command, payload); }
      catch (error) { settingsError.textContent = error.message; }
    }
    const actions = node('div', '', settings); actions.className = 'browser-dialog-actions';
    button(actions, 'Fechar', () => settings.close());
    $('browserSettingsButton').addEventListener('click', async () => { await invoke('state'); settingsSignature = ''; renderSettings(); show(settings); });
    $('browserChat').addEventListener('click', () => { setExpanded(false); document.body.classList.toggle('browser-show-chat'); $('input').focus(); schedule(); });
    $('browserSelection').addEventListener('click', async () => {
      try {
        const result = await bridge.invoke('selection');
        if (!result?.text) throw Error('Selecione um texto na página primeiro.');
        const input = $('input');
        input.value += `${input.value ? '\n\n' : ''}[Citação de página — conteúdo externo]\n${result.url}\n${result.text}\n[/Citação]\n`;
        input.dispatchEvent(new Event('input', { bubbles: true })); setExpanded(false); document.body.classList.add('browser-show-chat'); input.focus();
      } catch (e) { $('browserError').hidden = false; $('browserError').textContent = e.message; }
    });
    const permissions = dialog('browserPermissionPrompt', 'Permissão do site');
    const permissionText = node('p', '', permissions), permissionActions = node('div', '', permissions); permissionActions.className = 'browser-dialog-actions';
    for (const [label, decision] of [['Permitir uma vez', 'once'], ['Nesta sessão', 'session'], ['Permitir sempre', 'always'], ['Bloquear', 'block']]) {
      button(permissionActions, label, async () => { const id = permissionId; permissionId = null; permissions.close(); await invoke('permission-answer', { id, decision }); });
    }
    permissions.addEventListener('cancel', event => { event.preventDefault(); const id = permissionId; permissionId = null; permissions.close(); void invoke('permission-answer', { id, decision: 'block' }); });
    const resourceNames = { camera: 'Câmera', microphone: 'Microfone', geolocation: 'Localização', notifications: 'Notificações', ai: 'Acesso da IA' };
    const stopAI = button($('browserDrawer').querySelector('.browser-heading'), 'Parar IA', () => void invoke('ai-stop'));
    stopAI.id = 'browserStopAI'; stopAI.hidden = true;
    const devices = node('p', '', $('browserDrawer').querySelector('.browser-heading')); devices.className = 'browser-permission-status'; devices.hidden = true;
    const captureDialog = dialog('browserCaptureDialog', 'Captura da página');
    const captureImage = node('img', '', captureDialog); captureImage.style.cssText = 'max-width:100%;height:auto'; captureImage.alt = 'Captura da página autorizada';
    button(captureDialog, 'Fechar', () => captureDialog.close());
    window.addEventListener('free-agent-browser-capture', event => {
      const data = event.detail;
      if (data?.mime !== 'image/jpeg' || typeof data.data !== 'string' || !/^[A-Za-z0-9+/=]+$/.test(data.data)) return;
      captureImage.src = 'data:image/jpeg;base64,' + data.data; show(captureDialog);
    });
    function renderSettings() {
      if (!settings.open && settingsSignature) return;
      const active = state.tabs.find(t => t.id === state.activeId);
      const signature = JSON.stringify([active?.url, state.controls]); if (signature === settingsSignature) return; settingsSignature = signature;
      settingsBody.replaceChildren();
      let origin = ''; try { origin = new URL(active.url).origin; if (!/^https?:/.test(origin)) origin = ''; } catch {}
      node('p', origin || 'Abra um site para ajustar as permissões dele.', settingsBody);
      if (origin) for (const resource of Object.keys(resourceNames)) {
        const row = node('label', resourceNames[resource], settingsBody), select = node('select', '', row);
        for (const [value, title] of [['ask', 'Perguntar'], ['once', 'Permitir uma vez'], ['session', 'Permitir nesta sessão'], ['always', 'Permitir sempre'], ['block', 'Bloquear']]) { const o = node('option', title, select); o.value = value; }
        select.value = state.controls?.permissions?.[origin]?.[resource] || 'ask';
        select.addEventListener('change', () => void setting('permission-set', { origin, resource, decision: select.value }));
      }
      node('h4', 'Bloqueio de anúncios', settingsBody);
      node('p', state.controls?.blocker?.status || 'Preparando bloqueador…', settingsBody);
      const block = state.controls?.blocker;
      if (block?.available) {
        node('p', `Bloqueador global: ${block.enabled ? 'ATIVADO' : 'DESATIVADO'}.`, settingsBody);
        if (origin) node('p', `Neste site: ${!block.enabled ? 'desligado globalmente' : block.exceptions?.includes(origin) ? 'anúncios permitidos' : 'bloqueio ativado'}.`, settingsBody);
        button(settingsBody, block.enabled ? 'Desligar bloqueador em todos os sites' : 'Ligar bloqueador em todos os sites', () => void setting('blocker-set', { enabled: !block.enabled }));
        if (origin) button(settingsBody, block.exceptions?.includes(origin) ? 'Bloquear anúncios neste site' : 'Permitir anúncios neste site', () => void setting('blocker-set', { origin, enabled: !!block.exceptions?.includes(origin) }));
        const update = button(settingsBody, block.updating ? 'Atualizando filtros…' : 'Atualizar filtros', () => void setting('blocker-update'));
        update.disabled = !!block.updating;
        node('p', `Revisão: ${block.revision?.slice(0,12) || 'indisponível'}. Recursos bloqueados nesta sessão: ${block.blocked || 0}.`, settingsBody);
        node('p', 'Após alterar o bloqueador ou atualizar os filtros, recarregue a página para aplicar a mudança ao documento inteiro. Sites podem mudar seus anúncios; o bloqueio não é garantido em todos os vídeos.', settingsBody);
        button(settingsBody, 'Recarregar página', () => { settings.close(); void invoke('reload'); });
      }
      node('h4', 'Extensões', settingsBody);
      if (bridge.engine === 'native') {
        button(settingsBody, 'Carregar pasta descompactada', () => void setting('extension-load'));
        for (const extension of state.controls?.extensions || []) {
          const row = node('div', '', settingsBody); row.className = 'browser-setting-row'; node('span', `${extension.name} ${extension.version} — ${extension.enabled ? 'ativa' : 'desativada'}${extension.error ? ': ' + extension.error : ''}`, row);
          button(row, extension.enabled ? 'Desativar' : 'Ativar', () => void setting('extension-set', { id: extension.id, enabled: !extension.enabled }));
          button(row, 'Remover', () => void setting('extension-remove', { id: extension.id }));
        }
        node('p', 'Compatibilidade limitada às APIs de extensão disponíveis no Electron.', settingsBody);
      } else node('p', 'Extensões descompactadas são gerenciadas no executável. O bloqueador acima atua no navegador web local.', settingsBody);
    }
    window.FreeAgentBrowser = Object.freeze({
      async observe(options = {}) { setOpen(true); return bridge.invoke('observe', options); },
      async action(action) { setOpen(true); return bridge.invoke('agent-action', action); },
      async navigate(value) {
        setOpen(true);
        const active = state.tabs.find(t => t.id === state.activeId);
        if (!active || active.url === 'about:blank') {
          const result = await bridge.invoke(active ? 'navigate' : 'create', active ? { value } : { url: value });
          state = result;
          for (let attempt = 0; attempt < 40; attempt++) {
            const next = await bridge.invoke('state');
            const tab = next.tabs.find(t => t.id === next.activeId);
            if (tab && !tab.loading && tab.url !== 'about:blank') { state = next; break; }
            await new Promise(resolve => setTimeout(resolve, 150));
          }
          return bridge.invoke('observe');
        }
        return bridge.invoke('agent-navigate', { value });
      },
      async capture() { return bridge.invoke('capture'); },
      async stop() { return bridge.invoke('ai-stop'); },
      state: () => structuredClone(state)
    });
    return { render(next) {
      state = next; renderSettings();
      const media = state.controls?.media;
      devices.textContent = [media?.camera ? '● Câmera em uso' : '', media?.microphone ? '● Microfone em uso' : ''].filter(Boolean).join(' · ');
      devices.hidden = !devices.textContent;
      let origin; try { origin = new URL(state.tabs.find(t => t.id === state.activeId)?.url).origin; } catch {}
      stopAI.hidden = !['once', 'session', 'always'].includes(state.controls?.permissions?.[origin]?.ai);
      const pending = state.controls?.pending?.[0];
      if (pending && pending.id !== permissionId && !permissions.open) {
        permissionId = pending.id; permissionText.textContent = `${pending.origin} solicita: ${pending.resources.map(r => resourceNames[r] || r).join(', ')}.`;
        if (settings.open) settings.close(); show(permissions);
      } else if (!pending && permissions.open) { permissionId = null; permissions.close(); }
    } };
  } };
})();
