# FA-002 V3 — Navegador web audiovisual

## Estado de aceitação

**AJUSTAR.** A implementação possui WebRTC real, áudio de aba, controles, downloads
com autorização e Service Workers. A melhora de resolução está medida. Isso não
significa que a suíte audiovisual completa esteja aprovada: a última rodada teve
uma apresentação abaixo do piso do teste e outra execução excedeu três minutos.
Não foi aumentado o timeout para ocultar essa falha.

## Como iniciar no Windows

Reinicie o servidor que já estava aberto. Escolha apenas um fluxo:

```powershell
python serve.py
# http://127.0.0.1:8080
```

ou:

```powershell
npm run server
# http://127.0.0.1:47811
```

O serviço local permanece em 127.0.0.1:47812. Abra o globo e crie uma aba. O vídeo
começa silenciado no cliente; use **Ativar áudio** e ajuste **Volume**. Uma troca
de aba ou nova conexão volta ao estado silenciado por segurança. Não é necessário
configurar um dispositivo de loopback nem um servidor de nuvem.

As dependências do projeto incluem Electron, playwright-core, ws e multicast-dns.
O Electron instalado deve ter seu binário disponível. A inicialização normal do
executável continua usando o navegador nativo e não depende do worker web.

## Arquitetura efetivamente adotada

- O serviço autenticado Node gerencia comandos e sinalização; um worker Electron
  separado mantém as páginas em janelas ocultas, sandboxed e sem Node/preload.
- Um renderer local confiável captura `video: WebFrameMain` e `audio: WebFrameMain`
  da aba ativa. Não há captura de desktop, microfone ou loopback global do sistema.
  `enableLocalEcho:false` evita reprodução duplicada no emissor.
- O sender envia áudio/vídeo por WebRTC, sem STUN/TURN. A oferta completa é validada;
  candidatos devem pertencer à máquina local. mDNS é resolvido e reescrito para um
  IP validado; pins curtos são revalidados contra as interfaces atuais.
- O frontend compartilha a gaveta e operações com o motor nativo. A superfície web
  utiliza `<video>`, não uma sequência de JPEGs como transporte normal. O modo JPEG
  permanece selecionável apenas pelo código de teste legado, sem fallback silencioso.
- Ocultar a gaveta encerra as tracks/peer e silencia fontes, mas conserva abas.
  A captura tem prazo de estabelecimento; falha do sender encerra o worker para
  permitir recuperação, e não mantém captura indefinidamente.

O perfil novo é `%LOCALAPPDATA%\FreeAgent\browser-av`, fora da raiz estática.
O perfil V2 `browser-web` não é sobrescrito. URLs públicas podem ser restauradas,
mas cookies e logins de runtimes diferentes não são copiados automaticamente.
Portanto, pode ser necessário entrar novamente nos sites no perfil audiovisual.

## Correção de legibilidade

O diagnóstico separou a resolução da faixa capturada, do encoder e do receptor.
Com `contentHint='motion'`, a faixa já havia sido reduzida para 202×178 e o encoder
informava limitação por banda. A superfície é uma página com texto; foi alterada
para `contentHint='text'`, mantendo os demais limites e proteções.

Fonte consultada: [MDN — MediaStreamTrack.contentHint](https://developer.mozilla.org/en-US/docs/Web/API/MediaStreamTrack/contentHint).
A documentação diferencia movimento de apresentações/páginas com texto. Não houve
remoção de sandbox, ajuste de autenticação ou nova troca de arquitetura nessa correção.

Medição com interface completa, três colunas e Matrix central, viewport 1440×1000:

| Medida | Antes | Depois |
|---|---:|---:|
| Área lógica da gaveta | 718×629 | 718×629 |
| Faixa e vídeo recebido | 202×178 | 716×628 |
| FPS decodificados no probe de qualidade | 28,47 | 26,44 |
| Tempo de encode por frame | 1,28 ms | 2,91 ms |
| Indicador do encoder | bandwidth | none |

O áudio permaneceu com amostras e energia não nulas. Esse probe não substitui o
teste completo de navegação e downloads.

## Downloads e Service Workers

- Downloads usam somente nomes UUID em staging controlado, com limite de 64 MiB
  por arquivo e 20 registros simultâneos. Nada escolhe um caminho arbitrário do SO.
- O usuário precisa permitir antes de obter o arquivo. Respostas pequenas/cacheadas
  podem terminar fisicamente apesar de `pause()`; nesse caso ficam em **quarentena**,
  ainda em `awaiting-authorization`, e não são expostas pelo endpoint HTTP.
- Sem Bearer, a recuperação é negada; mesmo com Bearer o arquivo não é servido
  antes do aceite. Cancelar impede recuperações posteriores e solicita exclusão.
- A interface não recria controles de download quando o estado deles não mudou,
  evitando retirar o botão Permitir entre movimento do ponteiro e clique.
- Histórico terminal pode ser expurgado para liberar capacidade; pendências exigem
  aceitar/cancelar. Não existe expiração automática: 20 pendências podem impedir
  novos downloads até intervenção do usuário.
- Service Workers usam a sessão persistente isolada. A política/proxy da sessão
  continua bloqueando destinos privados; não foi removida a proteção de rede para
  habilitar esse recurso.

## Evidências e limites dos testes

### Executados com sucesso

- `node eval/browser-av-quality.cjs text-hint`: resolução 716×628 e 26,44 fps
  decodificados, áudio com energia/amostras, na interface de produção.
- `node eval/browser-download-eval.cjs`: worker AV real; pendência após 1 s,
  401 sem autenticação, 404 pré-aceite mesmo autenticado, bytes após autorização e
  404 após cancelamento. Não é uma prova do clique final pelo DOM da gaveta.
- `node eval/browser-restart-eval.cjs`: regressão nativa e sessão restaurada em
  segundo processo Electron.
- `node eval/browser-policy-eval.cjs`, `node eval/matrix-eval.mjs` e
  `node eval/run-eval.mjs`: aprovados; harness 29/29.
- Último `node eval/rtc-policy-eval.cjs`: sete testes aprovados e quatro testes
  opt-in pulados; não contabilizados como onze aprovados nessa execução.

### Não aprovados na última rodada

`node eval/browser-av-eval.cjs` mediu vídeo 716×628 e áudio real, mas uma execução
apresentou **19,43 fps**, abaixo do piso de 20 do teste. O teste mantém essa
exigência no final, depois dos cenários funcionais; não foi baixado o limiar.
Em seguida, outra tentativa atingiu o timeout externo de 180 s após iniciar o
player controlado. A investigação foi interrompida; não foi iniciado novo ciclo
de otimização ou aumentado o timeout. A causa desse travamento segue pendente.

Uma medição completa anterior, já com a imagem maior, apresentou 23,56 fps,
218.400 amostras de áudio e RMS máximo 0,01884. A estimativa por bordas periódicas
de imagem/som foi +122 ms de áudio em relação ao vídeo. É uma aproximação por
amostragem na thread principal, não medição calibrada de lip-sync/hardware.

A prova inicial de captura teve 26,48 fps e o teste integrado anterior da V3
validou mídia, controle de volume, Service Worker, downloads, expandir e recolher.
Esses resultados anteriores não apagam as falhas da última rodada.

CPU/memória coletados pelos testes abrangem processos do worker Electron, não o
Chrome receptor. Somas de working set podem contar páginas compartilhadas mais
de uma vez. Não existe, nesta entrega, benchmark total ou soak prolongado aprovado.

## Compatibilidade pública e validação manual

O teste público anterior não comprovou reprodução AV contínua no YouTube; o demo
MP4 externo mostrou imagem/controles, mas não playback contínuo validado. Autoplay,
codecs, consentimento, autenticação e DRM podem impor restrições. Nada foi usado
para contornar essas políticas.

Para validar manualmente: abra uma página, teste áudio explícito, volume/mute,
troca de abas, redimensionamento e reconexão. Baixe um arquivo pequeno, espere
antes de autorizar e confira o salvamento. Observe legibilidade e fluidez reais.

**Auditoria estática:** sem achado crítico nas correções de resolução e quarentena.
**Aceitação global:** AJUSTAR, enquanto a suíte integral e a validação humana
permanecerem pendentes. Nenhum commit, push, PR ou merge automático.
