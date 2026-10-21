# Free Agent — navegador híbrido implementado

Entrega local de 21/10/2026. Projeto: `C:\Projetos\free-agent-status`.

## Resultado e escopo

A implementação mantém a conversa atual e o navegador lado a lado, com divisão ajustável, expansão, abas, página inicial com até cinco atalhos e pesquisa convencional. `yt`, `YouTube` e frases abrem resultados do Google; domínios e URLs abrem os endereços. Nomes de atalhos não criam aliases na barra.

O Electron renderiza a página diretamente em `WebContentsView`. A versão web local recebe áudio e vídeo do worker Electron por WebRTC, preservando a mesma interface e os dispositivos do PC que executa o serviço. Terminal e hospedagem remota não fazem parte da entrega.

Foram adicionados controles de permissões, adblock, downloads, extensões no executável e ferramentas de observação e ação da IA. O trabalho permanece local, sem commit, push, PR, publicação ou contratação de serviço.

## Alterações por etapa

1. **Interface:** conversa à esquerda, navegador à direita; divisor persistente; expandir/restaurar; alternância em janela estreita; diagnósticos recolhidos; home sem erro de transmissão quando não há página. Diálogos suspendem a superfície nativa para receber cliques.
2. **Navegação:** resolvedor compartilhado nos dois motores; atalhos editáveis e persistentes; ícone com alternativa; um botão de adicionar, oculto ao atingir cinco; Ctrl+L/T/W no contexto do navegador.
3. **Estabilidade:** encerramento das conexões anteriores, identificadores para ignorar respostas antigas, recuperação do worker após timeout e pausa da captura ao ocultar. O problema de mDNS após expirar o cache foi corrigido enviando uma pergunta por datagrama, sem liberar endereços externos ou aumentar o prazo de dois segundos.
4. **Escala e renderização:** tamanho lógico separado da resolução física; captura atualizada ao redimensionar; entrada mapeada à página. Geometria agrupada por eventos e conferida periodicamente, em vez de percorrer a interface a cada quadro. O vídeo usa superfície de pintura independente. A animação Matrix pausa enquanto o navegador está aberto e retorna respeitando a preferência do usuário. A resolução da página é mantida.
5. **Permissões e bloqueio:** decisões por origem/recurso; uma vez por documento, sessão do processo, sempre e bloqueio persistente. Câmera e microfone têm indicadores reais de trilhas; revogação recarrega o documento e encerra a captura. Extensões descompactadas podem ser carregadas, desabilitadas, reabilitadas e removidas no Electron. O bloqueio pode ser desligado por site ou globalmente.
6. **IA e conversa:** observações com endereço, título, texto e controles identificáveis; preencher, clicar, rolar, navegar, capturar e parar. Alvos/documentos inválidos exigem nova observação. Um clique sem navegação requer evidência nova esperada para ser confirmado; relógios e anúncios não comprovam sucesso. Citar seleção anexa uma citação ao campo da conversa para revisão, sem envio automático.

Páginas externas permanecem sem Node, preload privilegiado ou ferramentas internas. O bloqueador foi composto com o fluxo de rede existente, preservando o isolamento e a autorização dos downloads. Cookies e perfis dos motores continuam separados. Alterações anteriores do projeto foram preservadas; foi guardada uma cópia dos fontes anteriores à implementação na área de trabalho intermediária.

## Validação

A suíte principal executou nove grupos com saída zero: política de URLs/rede, harness existente (29/29), evidências da IA, desenvolvimento, Electron com reinício independente, controles/permissões/extensões, segurança web (12 verificações), workspace e audiovisual.

O workspace validou as quatro escalas, alinhamento de mouse e teclado, 20 ciclos de ocultar/reabrir, quatro reconexões manuais adicionais, seleção real anexada à conversa e cinco atalhos persistentes. O Electron validou arrastar o divisor, expandir/restaurar, sobreposição de diálogos, histórico, falha de rede, cookies e abas após reinício.

O teste de mDNS incluiu cinco peers reais do Chrome e uma espera de 31 segundos para expirar o cache antes da terceira conexão. As 12 verificações passaram, incluindo negociação limitada de SPED/ICE2 e rejeição de opções desconhecidas ou endereços estrangeiros. O teste de Matrix confirmou pausa/retomada e a manutenção das escolhas de movimento reduzido e pausa manual.

Os testes do executável empacotado são entregues em arquivos `FreeAgent-packaged-tests*.json`; verificam inicialização, servidor/preload, abas, bloqueio real de recurso, preencher/clicar com evidência, ausência de Node na página externa e persistência das escolhas após reiniciar.

### Audiovisual

Ambiente: Windows 11, Intel Core i5-12450H (8 núcleos/12 processadores lógicos), aproximadamente 7,71 GiB de RAM utilizável; receptor Chrome instalado em modo de teste headless. As escalas são controladas pelo Chromium; não foram alteradas as preferências de tela do Windows.

O piso continua sendo **20 FPS de apresentação**. A medição final usa a diferença do contador `metadata.presentedFrames` da API do vídeo, separada dos callbacks JavaScript e dos quadros decodificados. A API informa quadros enviados ao compositor; não mede a varredura física do monitor. A contagem antiga usava callbacks, que podem pular quadros já compostos, e por isso não é equivalente.

| Escala | Resolução recebida | FPS de apresentação | Callbacks/s | Pico do worker |
|---|---|---:|---:|---:|
| 100% | 704 × 706 | 27.31 | 23.31 | 844 MiB |
| 125% | 882 × 882 | 26.15 | 22.83 | 873 MiB |
| 150% | 1058 × 1060 | 25.54 | 20.88 | 881 MiB |
| 200% | 1412 × 1414 | 26.40 | 22.19 | 933 MiB |

A repetição de 200% registrou 24.84 FPS de apresentação.

Cada janela de medição dura aproximadamente 4,5 segundos após aquecimento. Os testes também verificam áudio decodificado e energia de áudio, volume, teclado Unicode, Service Worker, bloqueio de rede privada, autorização de download, expansão, interrupção da captura e reabertura. O teste registra tempo entre clique e confirmação de início do player; inclui inicialização de mídia, polling e automação e **não representa latência visual ponta a ponta**. A sincronia áudio/vídeo é uma estimativa por pulsos, sem medição instrumental.

O pico de memória é a soma dos working sets do worker Electron, com possíveis páginas compartilhadas; não inclui Chrome receptor, Codex ou o restante do Windows. Não representa o consumo total do PC nem uma promessa de desempenho em todos os sites.

**Histórico preservado:** houve rodadas com 17,62, 9,86 e 18,48 callbacks/s em 200%, queda de quadros decodificados em uma rodada de 150%, falhas de mDNS e um timeout. As falhas motivaram as correções; os valores antigos não foram convertidos retroativamente em quadros apresentados. Uma tentativa de preferência H.264 continuou negociando VP8/libvpx e foi descartada. A configuração final permanece VP8/Opus, até 30 FPS, preservação de resolução e bitrate local limitado a 4–20 Mbit/s.

A conferência manual na prévia do Codex mostrou os resultados reais do Google para `yt`. Foi necessário aceitar a capacidade `googspedv1` anunciada por esse cliente, mantendo a validação independente dos candidatos e dos endereços locais. A captura está em `FreeAgent-previa-Codex.png`.

## Versões, pacote e licenças

- Fonte-base Git: `4496e6bef2d205a8018906619861effc860be0e3`, com alterações locais preservadas.
- Node de desenvolvimento: 24.17.0; npm: 11.17.0; electron-builder: 26.15.3.
- Electron: 44.9.0; Chromium do executável: 152.0.7977.167; Node incorporado: 24.22.0.
- Chrome de teste instalado: 155.0.8059.85.
- Ghostery Adblocker: 2.20.1, fixado; MPL 2.0. EasyList/EasyPrivacy locais, com licença, atribuição, origem e SHA-256 em `assets/browser/`.

O uBlock Origin Chromium 1.61.2 foi avaliado isoladamente. O carregamento apresentou APIs incompatíveis e o recurso de anúncio de teste continuou carregando; por isso a extensão não foi adotada. A alternativa Ghostery foi testada no fluxo real de requisições. Stands não foi incluído. Não há dois bloqueadores ativos.

O portátil `Free-Agent-Browser-Preview-win64.exe` é Windows x64, sem assinatura digital e sem instalação automática. A versão de pacote continua 1.0.1; é uma compilação local de prévia, não uma nova publicação oficial. O manifesto SHA-256 identifica o binário entregue. Tamanho: 415,184,437 bytes (aproximadamente 396 MiB). A prévia foi empacotada com armazenamento sem compressão adicional para evitar a rodada longa de compressão; o lançador portátil extraiu e iniciou seus recursos HTTP em 5.88 segundos no teste isolado. Os testes de interface, ações e reinício foram repetidos no binário empacotado nas quatro escalas, selecionando explicitamente a janela principal de confiança.

A auditoria npm registrou oito alertas moderados na árvore de dependências de build existente. Não foi executado `npm audit fix` com alterações amplas de versões.

## Limitações e conferências restantes

- Câmera/microfone foram exercitados com dispositivos sintéticos e localização com coordenadas simuladas. Não foi capturada imagem ou voz pessoal; dispositivos físicos e o provedor de localização do Windows precisam de conferência no uso real. Permissão concedida não foi tratada como prova de hardware funcional.
- Compatibilidade de extensões é parcial. O gerenciador não equivale à Chrome Web Store e recusa extensões que exijam assumir APIs de bloqueio de rede. A pasta descompactada deve continuar disponível após o reinício.
- A observação semântica cobre o documento principal e os elementos visíveis, com paginação; não oferece leitura geral de iframes de outra origem. Capturas são exibidas na interface; não foi implementado um novo pipeline multimodal para provedores de IA.
- A execução ReAct foi testada com modelo simulado e executor real de navegador testado separadamente. Não foi feita chamada paga a modelo nem comprovada uma tarefa real com todos os provedores externos.
- Não há garantia para DRM, anúncios de vídeo, sites que detectem bloqueadores ou uso audiovisual prolongado sob outras cargas do PC. O adblock pode ser desligado pelo usuário.
- As medições automatizadas não constituem teste de resistência de horas. Verifique os relatórios JSON para a situação de cada rodada; uma execução favorável não garante FPS constante em qualquer ambiente.

Essas limitações permanecem explícitas; a entrega não significa aprovação de hardware físico, todas as extensões ou todos os sites.

## Uso e revisão

Consulte `FreeAgent_GUIA_NAVEGADOR.md`. A partir do projeto, `npm start` abre o Electron; `python serve.py` ou `npm run server` abre o fluxo web existente. Para recarregar frontend e reiniciar backend durante desenvolvimento, use `npm run dev:web` ou `npm run dev:electron`; ambos usam perfis separados nas portas 47821/47822.

Os arquivos JSON e as capturas desta pasta documentam os testes. `FreeAgent-arquivos-alterados.json` identifica os arquivos diferentes da cópia inicial feita nesta implementação. O código editado permanece no projeto local. A prévia existente em `http://127.0.0.1:8080/` foi recarregada; apenas seu serviço de navegador foi substituído, preservando o servidor Python, a origem da conversa e o perfil. O supervisor temporário acompanha esse servidor Python e encerra o serviço substituto quando ele termina.

Para reproduzir: `npm run test:browser`; para os testes empacotados, `npm run test:browser:package -- "caminho do Free Agent.exe"` e `npm run test:browser:portable -- "caminho do portátil.exe"`. A integração mDNS real exige as opções de ambiente documentadas em `eval/rtc-policy-eval.cjs`.

## Referências técnicas

- [Electron: extensões](https://www.electronjs.org/docs/latest/api/extensions) — compatibilidade parcial e carregamento descompactado.
- [Electron: webRequest](https://www.electronjs.org/docs/latest/api/web-request) — composição do controle de requisições.
- [Chromium: responder mDNS](https://chromium.googlesource.com/chromium/src/+/HEAD/services/network/mdns_responder.cc) — consulta com uma pergunta.
- [libwebrtc: capacidades ICE/SPED](https://webrtc.googlesource.com/src.git/+/0605df5be8068d1b9524cf60988ee007f0967b02/p2p/base/transport_description.h) — compatibilidade com o navegador integrado.
- [WICG: requestVideoFrameCallback](https://wicg.github.io/video-rvfc/) — apresentação e callbacks são contadores diferentes.
- [Ghostery Adblocker](https://github.com/ghostery/adblocker), [licença das listas](https://easylist.to/pages/licence.html) e [termos do Stands](https://www.standsapp.org/end-user-license-agreement/).

Nota operacional: a revisão automática de aprovação bloqueou a remoção das pastas intermediárias de build, com motivo `blocked by policy`. Elas permanecem em `work`; a cópia final e seu SHA-256 foram verificados antes da tentativa de limpeza.
