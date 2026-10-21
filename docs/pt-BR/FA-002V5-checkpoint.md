# Navegador V5 — checkpoint de 21/10/2026

**Registro histórico, substituído pela V6.** Consulte
[guia V6](FA-002V6-guia.md) e [relatório V6](FA-002V6-relatorio.md).
As pendências descritas abaixo são do ponto de parada anterior e não devem ser
tratadas automaticamente como o estado atual do código.

Estado: **AJUSTAR — implementação salva, aprovação integral pendente**.
Repositório local: `C:\Projetos\free-agent-status`. Sem commit, push ou publicação.

Última rodada: `outputs/FreeAgent-V5-native-final.log` confirmou novamente
os ciclos nativos de fullscreen, mas terminou com timeout no F após esses ciclos.
Não reclassificar esse resultado como sucesso porque o teste isolado passou.
O teste isolado foi corrigido para eventos canceláveis e encerrou com código 0,
confirmando também que `preventDefault` do site é respeitado.

## Alterações implementadas

- Matrix continua com o navegador aberto, limitada a 30 atualizações decorativas
  por segundo; pausa do usuário, visibilidade e movimento reduzido continuam valendo.
- Permissão HTML Fullscreen autorizada somente em abas próprias e ativas e em
  páginas HTTP/HTTPS públicas. Câmera/microfone/IA continuam independentes.
- `desktop/browser-fullscreen.js` administra vídeo e F11 na janela nativa.
  Fullscreen esconde a moldura do Windows e ocupa todo o conteúdo da janela.
  Esc/F11 restauram a janela e a divisão anterior. Nova aba e falha do renderer
  encerram o modo. Reanexação após resize tardio do Windows.
- Botão Tela cheia e apresentação imersiva compartilhada com web. A saída local
  não espera a fila de captura/RTC. A versão web continua sujeita à permissão
  de fullscreen do navegador externo.
- Preload isolado de conteúdo: F para maior vídeo visível quando o site não
  tratou a tecla; ignora campos editáveis. Não expõe Node/IPC/bridge à página.
- Bloqueador Ghostery 2.20.1 passa a carregar 15 arquivos: EasyList, EasyPrivacy,
  Peter Lowe, listas específicas uAssets e recursos de scripts/redirecionamento.
  Scripts executam no documento antes dos scripts normais da página. CSS acompanha
  alterações do DOM. O fluxo de rede mantém o isolamento existente.
- Configurações mostram claramente ATIVADO/DESATIVADO e a exceção por site.
  Alterações requerem recarregar. Botão Atualizar filtros executa em segundo plano,
  valida limites e SHA-256, compila a revisão inteira e troca cache atomicamente.
  Falha conserva os filtros anteriores. Não há atualização silenciosa.
- Poll de dispositivos não acumula consultas enquanto a página carrega.
- Adicionadas licenças e atribuição em `assets/browser/NOTICE.md`.

Revisão inicial de filtros: `c18718adc33e82a086d996d0b0f75deb3d01745a`.
O motor produziu 30 scripts e CSS específico para a URL de teste do YouTube.
Isso comprova disponibilidade dos recursos, **não eficácia universal contra anúncios**.

## Evidências obtidas nesta rodada

- Matrix: teste de ciclo de vida aprovado, incluindo movimento com browser aberto.
- Política de URLs, DNS, proxy HTTP/CONNECT e origem IPC: aprovada.
- Integração de controles: todas as asserções passaram (bloqueio real de recurso,
  desligar global/site, IA, permissões sintéticas e extensões). Detectado dispose
  duplicado no encerramento; corrigido tornando a operação idempotente.
- Reinício nativo: processo independente recuperou abas, cookie e localStorage.
- V5 nativo: scripts do bloqueador antes do inline, inclusive sob CSP restritiva;
  CSS dinâmico, desativação/reativação, botão HTML fullscreen, janela fullscreen,
  geometria total, cabeçalhos ocultos, restauração e três ciclos F11/Esc passaram
  em rodadas específicas. A suíte completa ainda não fechou sem falha.
- V5 isolado: `eval/browser-shortcut-v5-eval.cjs` passou as asserções de F,
  janela fullscreen, exclusão de editáveis e precedência do handler do site.
  Usa evento de teclado sintético com gesto Electron, não teclado físico.
- Web: fonte e vídeo reais, Matrix em execução, botão fullscreen e Esc passaram.
  F11 e o teste completo do player web ainda precisam fechar na mesma rodada.
- Integridade: alteração de um arquivo do bundle foi rejeitada pelo validador.
- Sintaxe dos arquivos centrais e `git diff --check`: sem erro de código/whitespace.

## Pendências concretas para retomar

1. Fechar `eval/browser-audit-v5-run.cjs` sem timeout. No teste inicial o F não
   chegava ao DOM depois de ciclos de tela cheia. Corrigidos reanexação tardia,
   listener em captura e consulta de mídia acumulada; falta uma rodada integral.
2. Fechar `eval/browser-fullscreen-web-eval.cjs`: F11 após Esc ainda falhou.
   Último ajuste no teste devolve o foco à barra antes de F11. Não aumentar limites
   de tempo nem classificar eventos sintéticos como teste físico.
3. Rerodar controles e regressões de isolamento/downloads/AV após os últimos ajustes.
   Auditoria JPEG teve timeout ao criar Chrome; não foi reclassificada como aprovada.
   Desempenho V4 não prova o desempenho V5 com Matrix em movimento.
4. Teste prolongado real de YouTube: ainda não realizado nesta rodada. Nunca usar
   apenas contador de requisições ou ausência casual de anúncio como prova universal.
5. Gerar e testar novo portable Windows **somente após validação**. O executável
   anterior em outputs é V4; não contém estas mudanças. Nenhum V5 foi entregue.

## Comandos

```powershell
Set-Location 'C:\Projetos\free-agent-status'
npm start
# Desenvolvimento com perfil separado:
npm run dev:electron
# Testes específicos:
node eval/browser-audit-v5-run.cjs
node eval/browser-fullscreen-web-eval.cjs
node eval/browser-controls-run.cjs
# Regressão completa após os específicos passarem:
npm run test:browser
```

Fechar e reabrir o Electron carrega o código-fonte novo; um .exe V4 não se atualiza
automaticamente. Não iniciar instâncias simultâneas sobre o mesmo perfil.

Backup anterior: workspace Codex `work/browser-v5-before/`.
Logs desta rodada: workspace Codex `outputs/FreeAgent-V5-*-test.log`.
Preservar mudanças locais, perfis e conversas. Testes usam perfis temporários.

## Referências pesquisadas

- Brave: https://github.com/brave/adblock-rust — filtros, recursos e scriptlets.
- Zen: https://docs.zen-browser.app/user-manual/extensions — extensões Firefox.
- Ghostery: https://github.com/ghostery/adblocker — motor e integração Electron.
- Electron: https://www.electronjs.org/docs/latest/api/web-contents#event-enter-html-full-screen

O Free Agent continua usando Ghostery; não foi convertido para o motor Brave nem
passou a suportar todas as extensões de Firefox/Chromium.
