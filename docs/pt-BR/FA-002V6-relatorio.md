# Navegador V6 — relatório de implementação e validação

Data: 21/10/2026. Alterações locais em `C:\Projetos\free-agent-status`.
**Regressão final `npm run test:browser`: aprovada, código de saída 0.**
Sem commit, push, PR ou publicação. Alterações de outros trabalhos, incluindo
Discord, foram preservadas. Backup anterior em `work/browser-v6-before/` no workspace Codex.

## Correções

1. A montagem da superfície nativa passou a ser idempotente. Não remove/recoloca
   o mesmo WebContentsView em cada consulta de geometria; bounds só são atualizados
   quando mudam. Isso evita flashes do compositor e perda de foco.
2. Transições do Windows e HTML Fullscreen são coordenadas. F11/Esc restauram o
   layout. Recuperação de F respeita editáveis e handlers do site e, quando o
   Chromium mantém uma solicitação HTML pendente, apresenta temporariamente o
   player via CSS e fullscreen nativo, sem mover/recarregar o vídeo. A recuperação
   é removida ao sair, navegar, fechar ou encerrar o processo.
3. O conteúdo nativo usa backgroundThrottling desabilitado para não ficar suspenso
   durante essas transições. Páginas em segundo plano podem consumir recursos.
4. No web, áudio e vídeo podem ter abas de origem diferentes: a troca de imagem usa
   RTCRtpSender.replaceTrack e preserva a faixa de áudio. Há uma fonte de áudio
   identificada na interface, com troca explícita por Ouvir esta aba.
5. Ocultar o painel ou a janela não encerra uma sessão de áudio ativada pelo usuário.
   Perder controle/autenticação, fechar o aplicativo ou silenciar e recolher ainda
   liberam recursos. A captura continua limitada a frames de abas próprias; não
   captura som arbitrário do Windows nem dispositivos sem as permissões anteriores.
6. Volume redundante removido. Saída fixa em 1; o valor antigo de localStorage
   não é lido. Ativar/Silenciar continua disponível.

## Resultados

- **Nativo:** teste integrado completo aprovado, inclusive F após três ciclos
  F11/Esc, geometria total, restauração, ausência de remontagem repetida durante
  fullscreen, scripts antes do inline sob CSP, CSS dinâmico e adblock global/site.
- **Web fullscreen:** sequência completa de botão, Esc, F11, F11 novamente,
  fullscreen do player e saída aprovada; Matrix permanece executando.
- **Web audiovisual:** reprodução real VP8/Opus, áudio decodificado e volume máximo;
  fonte mantida ao abrir aba vazia, ver outro site, recolher, reabrir e alternar
  aba externa. Troca explícita da fonte de áudio aprovada sem duplicar o peer.
- **Minimização Windows:** Chrome com interface real foi minimizado via CDP;
  Browser.getWindowBounds confirmou windowState=minimized e o áudio continuou.
  Não se utilizou document.hidden como substituto do estado real da janela.
- **Isolamento/regressões:** políticas de URL/DNS/HTTP/CONNECT/IPC, 29 casos do
  harness, permissões sintéticas, IA verificada, extensões e downloads autorizados
  foram exercitados. Workspace validou quatro escalas, alinhamento de entrada,
  vinte reconexões, recuperação manual, atalhos e seleção para o chat.
- **Reinício:** abas, cookie e localStorage recuperados em processo nativo independente.
- **Pacote Windows:** abertura do executável extraído, navegação, bloqueio real de
  recurso, observação/preenchimento/clique verificados, isolamento, fullscreen,
  remoção do slider e preferências após reinício. Portable real extraiu e abriu o
  servidor em aproximadamente 32 segundos neste PC.
- **Integridade:** dez arquivos/componentes nativos compartilhados e os filtros
  do ASAR conferidos byte a byte com os fontes usados na validação.

Medições sequenciais do cenário audiovisual controlado, com piso mantido em 20 FPS:

| Escala | Quadros apresentados/s |
|---|---:|
| 100% | 26,81 |
| 125% | 24,19 |
| 150% | 27,09 |
| 200% | 27,50 |

Usou-se o delta de requestVideoFrameCallback.metadata.presentedFrames. Callbacks
e quadros decodificados foram registrados separadamente. Esses números são do
cenário de teste neste equipamento, não garantia para qualquer página ou carga.

## YouTube real

Fonte: [500 Million Subscriber Livestream!](https://www.youtube.com/watch?v=A9TikdsD5eg).
Perfil anônimo separado, sem uso de login pessoal, sem salto de anúncios pelo teste.
Resultado final: **playback-tested**, 180,348 segundos observados, 173,318 segundos
de avanço do vídeo, zero amostras com ad-showing no player. JSON contém as amostras.

Isso não demonstra que o bloqueador remove todos os anúncios. Não houve comparação
de uma campanha idêntica com bloqueio desligado. Amostras a cada cinco segundos
também não excluem eventos curtos entre coletas. A captura PNG dessa superfície
oculta apresentou UnknownVizError; não se entrega screenshot como prova visual do YouTube.

## Falhas anteriores e limites preservados

- A primeira regressão geral ainda encontrou o F pendente. Após a correção, os
  testes nativo, web e AV foram repetidos; o log anterior não foi apagado.
- Medições sob concorrência com testes/empacotamento ficaram em torno de 15–16 FPS,
  abaixo do piso. Foram registradas como falhas de desempenho. As quatro medições
  sequenciais acima passaram sem alterar o critério. O teste headed de minimização
  aprovou a continuidade de áudio, mas sua medição sob carga não aprovou o piso.
- Primeira tentativa YouTube abortou pela captura PNG; outra ficou esperando uma
  promessa de play após interrupção/recarregamento e atingiu o timeout. O teste
  passou a não bloquear a coleta nessa promessa e foi repetido com janela oculta
  e perfil novo. Não se usa a tentativa incompleta como teste prolongado aprovado.
- Dispositivos físicos de câmera/microfone e provedores reais de localização não
  foram revalidados; testes anteriores desses recursos usam dispositivos sintéticos.
- DRM, iframes restritivos, políticas de autoplay e decisões do próprio site podem
  limitar a mídia. A transmissão web precisa do serviço e da página do Free Agent abertos.

## Entrega

`Free-Agent-Browser-V6-win64.exe`, Windows x64 portable, 110.546.071 bytes.
SHA-256: `bbc74dffa9a41f90962c802ea3aa5e2ca81c9be9bb253c8a17d694b7ae8d27a2`.

Runtime empacotado: Electron 44.9.0, Chromium 152.0.7977.167, Node 24.22.0.
Ghostery 2.20.1; bundle c18718adc33e82a086d996d0b0f75deb3d01745a.
As atribuições e licenças estão em assets/browser/NOTICE.md e arquivos associados.
V6 identifica esta revisão local do navegador; a versão upstream do aplicativo
permanece 1.0.1. O worker web roda pelos fontes; o portable utiliza o motor nativo.

O log da última execução de `npm run test:browser` e os resultados JSON detalhados
acompanham o relatório em outputs. Consulte esses registros para o resultado da
regressão final completa, sem substituir falhas antigas por sucesso retroativo.
