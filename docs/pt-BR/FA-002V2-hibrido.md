# FA-002 V2 — Navegador híbrido: implementação e evidências

> Registro da V2. O serviço padrão foi evoluído para WebRTC na V3. Para operação
> atual e situação de aceite, consulte `FA-002V3-audiovisual.md`.

## Estado da entrega

Dois motores reais utilizam a mesma gaveta. A implementação web não abre URLs
externamente como operação normal nem usa iframe: executa Chrome/Chromium e
transmite JPEGs CDP ao canvas, encaminhando entrada humana à página real.

**Classificação global: AJUSTAR.** Navegação interativa, segurança e recuperação
possuem testes aprovados. Áudio remoto não foi implementado, buscas públicas do
Google foram bloqueadas pelo próprio site no ambiente de teste, e reprodução
audiovisual de sites reais e desempenho prolongado ainda não estão aprovados.
Isso não é uma entrega audiovisual completa nem aprovação de todos os critérios.

## Inicialização

Após instalar as dependências do projeto (`npm install`), escolha UM fluxo web:

```powershell
npm run server
# App: http://127.0.0.1:47811
```

ou, para manter a ponte Python/Telegram existente:

```powershell
python serve.py
# App: http://127.0.0.1:8080
```

Ambos iniciam automaticamente o serviço em `127.0.0.1:47812`. O Chromium só
inicia quando necessário. Use o globo e digite uma URL/pesquisa. Não é preciso
selecionar motor, protocolo ou porta a cada sessão. `python serve.py --no-browser`
mantém o servidor antigo sem iniciar o serviço adicional; bridge-only 8787 não
inicia o browser por padrão, exceto com `--browser`.

Chrome instalado é a primeira opção. Se não houver Chrome/Chromium disponível:

```powershell
npx playwright-core install chromium
```

Esse download é gratuito e local; não é exigido quando o Chrome instalado
funciona. `FA_BROWSER_EXECUTABLE` permite apontar um executável em instalações
administradas; não é necessário no uso normal.

No Electron, continua:

```powershell
npm start
```

O preload é validado por uma chamada de estado. Se funcionar, o motor nativo tem
prioridade e não inicia o serviço Playwright. A sessão interna e as abas nativas
anteriores permanecem separadas do perfil web.

### BrowserSync

Não foi encontrada configuração BrowserSync versionada no projeto. As origens
locais padrão de BrowserSync, `http://localhost:3000` e `http://127.0.0.1:3000`,
estão autorizadas. Se já utiliza BrowserSync, mantenha-o como proxy de 8080 ou
47811; abra o endereço **Local**, não o endereço LAN/External.

Exemplo com BrowserSync previamente disponível:

```powershell
browser-sync start --proxy "http://127.0.0.1:8080" --files "index.html,styles.css,browser-drawer.css,js/*.js"
```

Este comando não foi executado aqui; a compatibilidade de origem foi implementada,
mas um teste real com BrowserSync continua pendente. Portas/origens não padrão
podem ser autorizadas explicitamente no CLI `web/browser-service.cjs --origins`.
Não há CORS wildcard no serviço. Instâncias em porta ocupada não são encerradas
automaticamente. O frontend apresenta diagnóstico e botão de reconexão.

## Arquitetura

- `js/browser-adapter.js`: interface comum `{invoke,onState,mount,dispose}`.
  Prioriza bridge nativo validado; depois bootstrap autenticado do serviço local.
- `js/browser-drawer.js`: mesma interface para abas, navegação, resize e estado.
- `web/browser-service.cjs`: HTTP/WS somente loopback; Host/Origin exatos; token
  aleatório por inicialização, transmitido por bootstrap apenas às origens locais
  autorizadas. O token não é posto em URLs, disco ou logs do novo serviço.
- `web/browser-engine.cjs`: persistent context, abas reais, CDP privado por pipe,
  captura de página e operações fechadas de mouse/teclado/texto. Sem RPC genérico
  de avaliação JavaScript, comandos do sistema ou filesystem.
- `desktop/browser-network.js`: política pública/IP fixado, reutilizada nos dois
  motores. O Chromium web utiliza o proxy, bloqueia SW e restringe WebRTC UDP.
- `web/start-local.cjs` e integração `bridge.py`: início e encerramento dos recursos
  próprios. A ponte antiga não recebeu novas rotas privilegiadas nem CORS ampliado.

Perfil web padrão: `%LOCALAPPDATA%\FreeAgent\browser-web` no Windows; fallback
`~/.local/share/FreeAgent/browser-web` nos demais sistemas. Fica fora da raiz
estática do projeto, separado das chaves e sessões internas do Free Agent.

O controlador é único por serviço; outras interfaces recebem estado como
observadoras. Ao desconectar o controlador, outro cliente autenticado é promovido.
Abas continuam vivas ao recolher; nenhum frame é transmitido com a superfície
oculta. Entradas retidas são liberadas no servidor ao ocultar ou trocar de aba,
fechar ou perder o controlador. São limitadas 16 abas, mensagens de 32 KiB,
frequência de comandos/entrada e buffer de transmissão.

JPEG: qualidade 65, teto de 12 envios/s, viewport limitado a 1920×1200. Esses são
limites de configuração, **não FPS medidos**. O canvas faz letterboxing e converte
coordenadas de entrada. Após reinício, Chrome pode restaurar geometria externa
menor que o viewport; a captura corrige os limites reais da janela com tentativas
limitadas antes de aceitar frames no tamanho esperado.

## Evidências executadas

| Teste | Evidência |
|---|---|
| `node eval/browser-web-poc.cjs` | Chrome real, 8 JPEGs distintos em 2.008 s (~3.98 fps), input, clique, wheel e captura interrompida |
| `node eval/browser-web-eval.cjs` | 20 verificações: interface web real + outro Chromium; texto Unicode, formulário, popup, scroll, resize, recolhimento, fechamento de aba, perda do serviço, perfil e recuperação após fechar Chromium |
| `node eval/browser-web-security.cjs` | 12 grupos adversariais independentes; autenticação, Host/Origin, payload, comandos, protocolos privados, CDP por pipe, entrada retida e transferência de controle |
| `node eval/browser-web-startup.cjs` | Node e helpers Python iniciam Chrome real e encerram cooperativamente; última medição 227ms/378ms para encerramento |
| `node eval/browser-restart-eval.cjs` | Electron nativo continua funcional e restaura sessão em segundo processo; ausência de serviço web apresenta diagnóstico após detecção |
| `node eval/browser-policy-eval.cjs` | Política URL/IP/IPC e egress privado continua aprovada |
| `node eval/matrix-eval.mjs` | Motor Matrix aprovado |
| `node eval/run-eval.mjs` | Harness 29/29 |

Último cenário integrado web: 27 frames recebidos, JPEG médio 5859 bytes, intervalo
entre timestamp do serviço e recebimento WS médio 5.93ms. Observação de texto
completo após clique/digitação: 600ms, **inclui digitação e polling de título**, não
é latência pura de input. RSS do processo Node de teste ~109.1MB: **não inclui
Chromium nem mede memória total**. Não houve benchmark comparativo ou soak test.

Fixtures testam páginas reais no Chromium com conteúdo determinístico, não mocks
de mouse/teclado ou imagem estática. Testes reais de internet estão separados em
`node eval/browser-web-live.cjs`:

- `youtube.com`: homepage real visível, URL final `https://www.youtube.com/`.
  Nenhum vídeo foi selecionado; reprodução de player real não comprovada.
- `youtube` e `yt`: Google redirecionou para `/sorry/index`. Consultas roteadas
  corretamente, mas resultados de pesquisa **não aprovados**. Sem contornar bloqueio.
- Bing explícito `?q=yt`: interface visível, resultados não visíveis no frame final;
  não serve como evidência de uma alternativa de pesquisa já validada.

## Limites relevantes

1. **Áudio:** CDP screencast é só imagem. A prova criou AudioContext e reproduziu
   vídeo de canvas no Chromium, mas não transmitiu áudio ao frontend. O aviso fica
   visível no modo web. Para áudio, utilize o motor nativo no Electron; abertura
   externa continua apenas como ação explícita, não como substituto da navegação web.
2. **Vídeo:** players podem produzir frames, porém a taxa medida não é garantia de
   vídeo fluido. Codecs, DRM, consentimento, OAuth, passkeys e logins reais continuam
   sujeitos às políticas de cada site; autenticação não foi burlada.
3. **Downloads/permissões web:** downloads e service workers são negados nesta
   versão; nenhuma permissão de câmera/microfone/tela é concedida ao navegador web.
   O Electron mantém seu tratamento anterior de permissões e downloads.
4. **Área de transferência/acessibilidade:** entrada Unicode e paste são
   encaminhados; cópia da seleção remota e DOM semântico para leitor de tela não
   foram implementados. A superfície é uma visualização remota, não DOM local.
5. **Persistência:** cookies persistentes, localStorage e URLs foram testados. Não
   promete restaurar formulário, scroll ou histórico completo depois de reiniciar.
6. **Rede:** proxy corporativo/PAC e sites que dependem de recursos bloqueados
   precisam de avaliação específica. O novo serviço não corrige vulnerabilidades
   preexistentes da bridge Python nem implica certificação global da aplicação.

### Alternativas avaliadas

noVNC exigiria um servidor VNC e uma sessão gráfica Chromium mantida no computador.
RFB também não resolve áudio de navegador por si só. Acrescentaria instalação e
operação especialmente no Windows; não foi prototipado nem medido nesta entrega.
Por isso não houve migração silenciosa para essa pilha. Transmissão audiovisual
mais completa requer outra etapa validada de captura/codec/transporte, não apenas
trocar a biblioteca CDP por noVNC.

## Validação manual pendente

Abrir pelo globo em Electron e web; comparar resize, foco e modais; testar os sites
habituais, consentimento e logins; conferir IME real; observar desempenho prolongado.
Testar BrowserSync no ambiente existente. Resolver/aceitar explicitamente limites
de áudio, pesquisa pública e vídeo antes de aprovar todos os critérios FA-002 V2.

Nenhum commit, push, PR ou merge automático. Alterações locais anteriores preservadas.
