# FA-002 — Navegador integrado

> Registro da V1. A versão web agora possui motor Chromium interativo opcional.
> Consulte `FA-002V2-hibrido.md` para operação atual, testes e limitações.

## Uso

No Electron, o globo antes do indicador de conexão abre a gaveta do navegador.
Use `+` para criar abas e a barra para digitar um site ou pesquisar no Google.
Arraste a borda esquerda para ajustar a largura; expandir/restaurar não fecha
as páginas. Recolher mantém as abas carregadas, com histórico e posição de
rolagem da sessão atual. Fechar uma aba encerra seu webContents.

No navegador web local, o mesmo botão mostra a explicação e um link de abertura
externa. Não existe iframe nem simulação do navegador nativo.

## Arquitetura

- `desktop/browser-manager.js`: um WebContentsView por aba, limite de 16 abas,
  história nativa, downloads, permissões e IPC limitado ao frame principal do app.
- `desktop/browser-preload.js`: única ponte exposta ao Free Agent. Não é instalada
  nas páginas externas. Conteúdo externo não recebe Node nem ferramentas do agente.
- `desktop/browser-policy.js`: normalização de URLs/pesquisas, validação de IP,
  protocolos e identidade do remetente IPC.
- `desktop/browser-network.js`: proxy de saída local, sem serviço externo. Resolve
  DNS, rejeita respostas privadas e conecta diretamente a um IP aprovado. Isso
  evita validar um IP e conectar a outro após uma segunda resolução. Até oito
  endereços públicos podem ser tentados antes de transmitir a requisição.
  TLS continua entre Chromium e o site, sem interceptação ou certificado próprio.
- `js/browser-drawer.js` e `browser-drawer.css`: gaveta, abas, redimensionamento e
  sincronização de limites. Os limites CSS são convertidos pelo zoom do renderer
  no main, não pelo DPR. A view nativa é removida temporariamente durante menus,
  modais, resize por arraste e recolhimento, sem destruir as abas.

A sessão `persist:free-agent-browser` é separada da sessão do aplicativo.
Cookies persistentes e armazenamento de sites sobrevivem à reinicialização.
`browser-tabs.json`, no userData do Electron, guarda URLs e índice da aba ativa.
Depois de reiniciar, restaura as URLs; não promete restaurar formulários, scroll
ou histórico anterior ao encerramento. Sites ainda podem expirar ou recusar logins.

## Segurança e permissões

Somente navegação pública HTTP/HTTPS. Localhost, rede privada, metadados de nuvem,
URLs com credenciais e protocolos como file/javascript são rejeitados. A sessão
usa proxy sem bypass implícito de loopback e as abas desabilitam UDP WebRTC não
proxiado. Redirecionamentos e novas janelas também passam pela política.

Câmera/microfone e notificações exigem confirmação, somente para a origem
principal da aba ativa e com a gaveta visível. Demais permissões, incluindo
captura de tela, arquivos, dispositivos e rede local, são negadas por padrão.
Downloads usam a escolha nativa de destino, sem abertura automática do arquivo.
Arquivos blob são aceitos somente para a origem pública da própria aba.

O proxy exige saída direta para a internet. Ambientes que exigem proxy
corporativo/PAC/autenticação de proxy precisam de avaliação adicional; a aplicação
não cai silenciosamente para conexão direta quando falha a configuração de
isolamento. DRM, passkeys, videoconferência e OAuth podem ter restrições do site,
do Electron ou da política de permissões. Não há garantia de suporte universal.

## Testes reproduzíveis

```powershell
node eval/browser-policy-eval.cjs
node eval/matrix-eval.mjs
node eval/run-eval.mjs
node eval/browser-restart-eval.cjs
```

O último comando inicia dois processos Electron reais, com perfil temporário em
`$env:TEMP\opencode`. O diretório pai deve existir. Requer o binário Electron das
dependências do projeto. Não usa as chaves nem o perfil real do aplicativo.

Teste adicional com site HTTPS público (rede necessária):

```powershell
$env:ELECTRON_RUN_AS_NODE=$null
$env:FA_BROWSER_LIVE='1'
& .\node_modules\electron\dist\electron.exe eval\browser-electron-eval.cjs
$env:FA_BROWSER_LIVE=$null
```

Fixtures HTTPS determinísticas testam views nativas, sandbox, navegação, abas,
downloads blob, erro de rede, modais, expansão, resize com eventos de mouse reais,
recolhimento, descarte, sessão e fallback sem preload. O teste de download fornece
um destino temporário automaticamente: não valida a interação humana com o seletor
de arquivo. O teste de notificações simula a resposta do diálogo nativo.
Mensagens ERR_FAILED e recusas IPC são esperadas nos testes negativos.

O teste de reinicialização comprova restauração em outro processo de uma URL,
localStorage e cookie com expiração explícita. Isso não comprova login real de
serviços de terceiros. Snapshot agregado de workingSet é apenas diagnóstico,
pode contar memória compartilhada mais de uma vez e não representa benchmark.

## Validação humana pendente

1. Abrir pelo globo, criar abas, navegar em sites habituais e pesquisar no Google.
2. Arrastar, expandir, restaurar e recolher; confirmar o layout nos três temas.
3. Abrir Configurações e menus sobre a gaveta; confirmar prioridade visual.
4. Baixar um arquivo escolhendo seu destino no diálogo real.
5. Testar somente permissões que deseja conceder e observar o diálogo real.
6. Entrar em um site e reiniciar para conferir o comportamento específico do login.
7. Avaliar uso prolongado e consumo com as páginas reais do dia a dia.

Auditoria independente estática: **APROVADO**, sem novo defeito concreto encontrado
após correções. Validação visual, compatibilidade dos sites e desempenho prolongado
permanecem separados dessa aprovação técnica. Sem commit/push/PR/merge automático.
