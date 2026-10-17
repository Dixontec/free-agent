/* Free Agent — i18n (pt-BR · es · en)
   Aplica traduções em elementos com data-i18n (texto), data-i18n-ph (placeholder)
   e data-i18n-title (title). Idioma persistido em nexus:cfg.lang. */
'use strict';
(function () {
  const DICT = {
    'pt-BR': {
      'nav.core': 'Núcleo', 'nav.new': 'Nova', 'nav.disconnected': 'desconectado',
      'side.convs': 'Conversas', 'side.new': 'nova', 'side.agents': 'Agentes',
      'side.music': 'Música', 'side.skills': 'Skills ativas', 'side.system': 'Sistema',
      'side.nothing': 'Nada tocando', 'side.nothingSub': 'toque + arquivos ou peça no chat',
      'tab.routines': 'Rotinas', 'tab.music': 'Música', 'tab.skills': 'Skills',
      'tab.tasks': 'Tarefas', 'tab.reminders': 'Lembretes', 'tab.log': 'Log', 'tab.notes': 'Notas',
      'head.routines': 'Rotinas agendadas', 'head.newRoutine': 'Nova rotina',
      'head.skills': 'Catálogo de Skills', 'head.newSkill': 'Nova skill',
      'head.tasks': 'Tarefas com IA', 'head.newTask': 'Nova tarefa',
      'head.reminders': 'Lembretes', 'head.new': 'Novo',
      'head.notes': 'Notas', 'head.newNote': 'Nova nota',
      'c.ph': 'Pergunte, peça pesquisa, rotina…  @slug invoca uma skill  ·  Enter envia · Shift+Enter quebra',
      'c.send': 'Enviar', 'c.voice': 'Falar · Ctrl+Espaço',
      'set.title': 'Configurações',
      'set.navConn': 'Conexão & Modelo', 'set.navLook': 'Aparência & Fundo',
      'set.navData': 'Meus dados', 'set.navCode': 'Coding Agent',
      'set.lang': 'Idioma', 'set.provider': 'Provedor', 'set.model': 'Modelo',
      'set.refresh': 'atualizar', 'set.keyOnly': 'só no seu navegador',
      'set.temp': 'Temperatura', 'set.maxTok': 'Máx tokens',
      'set.save': 'Salvar', 'set.test': 'Testar conexão',
      'set.lockHint': 'As chaves ficam em localStorage. Nada sai do seu PC exceto chamadas diretas às APIs oficiais.',
      'set.whereKeys': 'Onde conseguir chaves', 'set.theme': 'Tema',
      'set.bg': 'Plano de fundo',
      'set.bgPreset': 'Galeria',
      'bg.green': 'Verde papel', 'bg.pink': 'Rosa papel',
      'set.bgOpt2': 'Só Núcleo 3D', 'set.bgOpt3': 'Só Aurora',
      'set.bgOpt4': 'Imagem personalizada', 'set.bgOpt5': 'Nenhum (liso)',
      'set.upload': 'Enviar imagem', 'set.gallery': 'Galeria (toque para aplicar)',
      'set.blur': 'Desfoque do fundo', 'set.rest': 'Tela de descanso',
      'set.rest0': 'Desligada', 'set.rest1': 'Após 1 min parado', 'set.rest3': 'Após 3 min parado',
      'set.rest5': 'Após 5 min parado', 'set.rest10': 'Após 10 min parado',
      'set.fx': 'Intensidade 3D', 'set.pauseBg': 'Pausar fundo',
      'set.dataHint': 'Backup de provedores, rotinas, skills e tarefas em JSON.',
      'set.export': 'Exportar', 'set.import': 'Importar',
      'set.workDir': 'Pasta de trabalho (arquivos)', 'set.authDir': 'Autorizar pasta',
      'set.noDir': 'Nenhuma pasta autorizada.',
      'set.mode': 'Modo', 'set.workspace': 'Workspace (pasta do projeto)',
      'set.perms': 'Permissões por ferramenta',
      'set.testBridge': 'Testar bridge', 'set.undo': 'Desfazer',
      'set.codingHint': 'Escrita restrita à pasta autorizada. Sem bridge, shell é negado. Rode python3 bridge.py na pasta do projeto p/ liberar shell local.',
      'r.daily': 'Todo dia', 'r.weekdays': 'Seg–Sex', 'r.weekends': 'Fim de semana', 'r.once': 'Uma vez',
      'r.name': 'Nome', 'r.hour': 'Hora', 'r.repeat': 'Repetir', 'r.actions': 'Ações (uma por linha)',
      'r.save': 'Salvar rotina', 'r.cancel': 'Cancelar',
      'rm.notice': 'Aviso', 'rm.hint': 'Peça no chat: “me lembre às 14:30 de beber água”. Disparam com aviso + voz, mesmo sem IA.',
      'task.add': 'Adicionar',
      'keys.ok': 'Entendi',
      'langNames': 'português'
    },
    es: {
      'nav.core': 'Núcleo', 'nav.new': 'Nueva', 'nav.disconnected': 'desconectado',
      'side.convs': 'Conversaciones', 'side.new': 'nueva', 'side.agents': 'Agentes',
      'side.music': 'Música', 'side.skills': 'Skills activas', 'side.system': 'Sistema',
      'side.nothing': 'Nada reproduciendo', 'side.nothingSub': 'añade archivos o pídelo en el chat',
      'tab.routines': 'Rutinas', 'tab.music': 'Música', 'tab.skills': 'Skills',
      'tab.tasks': 'Tareas', 'tab.reminders': 'Recordatorios', 'tab.log': 'Log', 'tab.notes': 'Notas',
      'head.routines': 'Rutinas programadas', 'head.newRoutine': 'Nueva rutina',
      'head.skills': 'Catálogo de skills', 'head.newSkill': 'Nueva skill',
      'head.tasks': 'Tareas con IA', 'head.newTask': 'Nueva tarea',
      'head.reminders': 'Recordatorios', 'head.new': 'Nuevo',
      'head.notes': 'Notas', 'head.newNote': 'Nueva nota',
      'c.ph': 'Pregunta, pide una búsqueda, una rutina…  @slug invoca una skill  ·  Enter envía · Shift+Enter salta de línea',
      'c.send': 'Enviar', 'c.voice': 'Hablar · Ctrl+Espacio',
      'set.title': 'Configuración',
      'set.navConn': 'Conexión y modelo', 'set.navLook': 'Apariencia y fondo',
      'set.navData': 'Mis datos', 'set.navCode': 'Coding Agent',
      'set.lang': 'Idioma', 'set.provider': 'Proveedor', 'set.model': 'Modelo',
      'set.refresh': 'actualizar', 'set.keyOnly': 'solo en tu navegador',
      'set.temp': 'Temperatura', 'set.maxTok': 'Máx. tokens',
      'set.save': 'Guardar', 'set.test': 'Probar conexión',
      'set.lockHint': 'Las claves se guardan en localStorage. Nada sale de tu PC salvo llamadas directas a las APIs oficiales.',
      'set.whereKeys': 'Dónde obtener claves', 'set.theme': 'Tema',
      'set.bg': 'Fondo',
      'set.bgPreset': 'Galería',
      'bg.green': 'Verde papel', 'bg.pink': 'Rosa papel',
      'set.bgOpt2': 'Solo Núcleo 3D', 'set.bgOpt3': 'Solo Aurora',
      'set.bgOpt4': 'Imagen personalizada', 'set.bgOpt5': 'Ninguno (liso)',
      'set.upload': 'Subir imagen', 'set.gallery': 'Galería (toca para aplicar)',
      'set.blur': 'Desenfoque del fondo', 'set.rest': 'Pantalla de descanso',
      'set.rest0': 'Desactivada', 'set.rest1': 'Tras 1 min inactivo', 'set.rest3': 'Tras 3 min inactivo',
      'set.rest5': 'Tras 5 min inactivo', 'set.rest10': 'Tras 10 min inactivo',
      'set.fx': 'Intensidad 3D', 'set.pauseBg': 'Pausar fondo',
      'set.dataHint': 'Copia de seguridad de proveedores, rutinas, skills y tareas en JSON.',
      'set.export': 'Exportar', 'set.import': 'Importar',
      'set.workDir': 'Carpeta de trabajo (archivos)', 'set.authDir': 'Autorizar carpeta',
      'set.noDir': 'Ninguna carpeta autorizada.',
      'set.mode': 'Modo', 'set.workspace': 'Workspace (carpeta del proyecto)',
      'set.perms': 'Permisos por herramienta',
      'set.testBridge': 'Probar bridge', 'set.undo': 'Deshacer',
      'set.codingHint': 'Escritura restringida a la carpeta autorizada. Sin bridge, shell denegado. Ejecuta python3 bridge.py en la carpeta del proyecto para habilitar el shell local.',
      'r.daily': 'Cada día', 'r.weekdays': 'Lun–Vie', 'r.weekends': 'Fin de semana', 'r.once': 'Una vez',
      'r.name': 'Nombre', 'r.hour': 'Hora', 'r.repeat': 'Repetir', 'r.actions': 'Acciones (una por línea)',
      'r.save': 'Guardar rutina', 'r.cancel': 'Cancelar',
      'rm.notice': 'Aviso', 'rm.hint': 'Pídelo en el chat: “recuérdame a las 14:30 beber agua”. Se disparan con aviso + voz, incluso sin IA.',
      'task.add': 'Añadir',
      'keys.ok': 'Entendido',
      'langNames': 'español'
    },
    en: {
      'nav.core': 'Core', 'nav.new': 'New', 'nav.disconnected': 'disconnected',
      'side.convs': 'Conversations', 'side.new': 'new', 'side.agents': 'Agents',
      'side.music': 'Music', 'side.skills': 'Active skills', 'side.system': 'System',
      'side.nothing': 'Nothing playing', 'side.nothingSub': 'add files or ask in chat',
      'tab.routines': 'Routines', 'tab.music': 'Music', 'tab.skills': 'Skills',
      'tab.tasks': 'Tasks', 'tab.reminders': 'Reminders', 'tab.log': 'Log', 'tab.notes': 'Notes',
      'head.routines': 'Scheduled routines', 'head.newRoutine': 'New routine',
      'head.skills': 'Skills catalog', 'head.newSkill': 'New skill',
      'head.tasks': 'AI tasks', 'head.newTask': 'New task',
      'head.reminders': 'Reminders', 'head.new': 'New',
      'head.notes': 'Notes', 'head.newNote': 'New note',
      'c.ph': 'Ask, request research, a routine…  @slug invokes a skill  ·  Enter sends · Shift+Enter new line',
      'c.send': 'Send', 'c.voice': 'Voice · Ctrl+Space',
      'set.title': 'Settings',
      'set.navConn': 'Connection & Model', 'set.navLook': 'Appearance & Background',
      'set.navData': 'My data', 'set.navCode': 'Coding Agent',
      'set.lang': 'Language', 'set.provider': 'Provider', 'set.model': 'Model',
      'set.refresh': 'refresh', 'set.keyOnly': 'only in your browser',
      'set.temp': 'Temperature', 'set.maxTok': 'Max tokens',
      'set.save': 'Save', 'set.test': 'Test connection',
      'set.lockHint': 'Keys stay in localStorage. Nothing leaves your PC except direct calls to official APIs.',
      'set.whereKeys': 'Where to get keys', 'set.theme': 'Theme',
      'set.bg': 'Background',
      'set.bgPreset': 'Gallery',
      'bg.green': 'Green paper', 'bg.pink': 'Pink paper',
      'set.bgOpt2': '3D Core only', 'set.bgOpt3': 'Aurora only',
      'set.bgOpt4': 'Custom image', 'set.bgOpt5': 'None (flat)',
      'set.upload': 'Upload image', 'set.gallery': 'Gallery (tap to apply)',
      'set.blur': 'Background blur', 'set.rest': 'Screen saver',
      'set.rest0': 'Off', 'set.rest1': 'After 1 min idle', 'set.rest3': 'After 3 min idle',
      'set.rest5': 'After 5 min idle', 'set.rest10': 'After 10 min idle',
      'set.fx': '3D intensity', 'set.pauseBg': 'Pause background',
      'set.dataHint': 'Backup of providers, routines, skills and tasks in JSON.',
      'set.export': 'Export', 'set.import': 'Import',
      'set.workDir': 'Working folder (files)', 'set.authDir': 'Authorize folder',
      'set.noDir': 'No folder authorized.',
      'set.mode': 'Mode', 'set.workspace': 'Workspace (project folder)',
      'set.perms': 'Permissions per tool',
      'set.testBridge': 'Test bridge', 'set.undo': 'Undo',
      'set.codingHint': 'Writes restricted to the authorized folder. Without bridge, shell is denied. Run python3 bridge.py in the project folder to enable local shell.',
      'r.daily': 'Every day', 'r.weekdays': 'Mon–Fri', 'r.weekends': 'Weekend', 'r.once': 'Once',
      'r.name': 'Name', 'r.hour': 'Time', 'r.repeat': 'Repeat', 'r.actions': 'Actions (one per line)',
      'r.save': 'Save routine', 'r.cancel': 'Cancel',
      'rm.notice': 'Notice', 'rm.hint': 'Ask in chat: “remind me at 14:30 to drink water”. They fire with notice + voice, even without AI.',
      'task.add': 'Add',
      'keys.ok': 'Got it',
      'langNames': 'English'
    }
  };
  function getLang() {
    try { const c = JSON.parse(localStorage.getItem('nexus:cfg') || '{}'); return DICT[c.lang] ? c.lang : 'pt-BR'; } catch { return 'pt-BR'; }
  }
  function t(k) {
    const l = getLang();
    return (DICT[l] && DICT[l][k] != null) ? DICT[l][k] : (DICT['pt-BR'][k] != null ? DICT['pt-BR'][k] : k);
  }
  function promptLang() { return { 'pt-BR': 'pt-BR', es: 'español', en: 'English' }[getLang()] || 'pt-BR'; }
  function greetLead() {
    const h = new Date().getHours();
    const m = getLang() === 'es'
      ? (h < 6 ? 'buena madrugada' : h < 12 ? 'buenos días' : h < 18 ? 'buenas tardes' : 'buenas noches')
      : getLang() === 'en'
        ? (h < 6 ? 'hello' : h < 12 ? 'good morning' : h < 18 ? 'good afternoon' : 'good evening')
        : (h < 6 ? 'boa madrugada' : h < 12 ? 'bom dia' : h < 18 ? 'boa tarde' : 'boa noite');
    return (getLang() === 'es' ? 'Hola, ' : getLang() === 'en' ? 'Hello, ' : 'Olá, ') + m;
  }
  function greetFallback() {
    return { 'pt-BR': 'dia tranquilo por aqui. Se precisar de algo, é só falar.', es: 'día tranquilo por aquí. Si necesitas algo, solo dilo.', en: 'a calm day around here. If you need anything, just ask.' }[getLang()] || 'dia tranquilo por aqui.';
  }
  function applyLang() {
    try { document.documentElement.lang = getLang(); } catch {}
    try {
      document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
      document.querySelectorAll('[data-i18n-ph]').forEach(el => { el.placeholder = t(el.dataset.i18nPh); });
      document.querySelectorAll('[data-i18n-title]').forEach(el => { el.title = t(el.dataset.i18nTitle); });
    } catch {}
  }
  window.I18N = { getLang, t, applyLang, promptLang, greetLead, greetFallback };
})();
