# Changelog — Free Agent

Todas as mudanças notáveis do Free Agent. Datas no formato `AAAA-MM-DD`.

## 2026-10-17 — Telegram sem terminal, terminal ao vivo no monitor e busca web mais contida

### Telegram — direto do navegador (sem Python, sem terminal)

A mudança maior: o bot do Telegram agora conecta **direto do seu navegador** para
`api.telegram.org`.

- **Por que funciona:** a API do Telegram devolve `access-control-allow-origin: *` nas
  respostas, então o navegador tem permissão para lê-las. Um `GET` é uma requisição
  *simples*, logo não dispara o preflight de CORS (um `POST` com corpo JSON dispararia, e
  o `OPTIONS` do Telegram responde `501`). Por isso tudo roda com `GET` puro:
  `getMe`, `deleteWebhook`, `getUpdates` (long-polling, `timeout=10`) e `sendMessage`.
- **Nada pra rodar.** O antigo aviso mandando abrir o terminal para subir a
  ponte/`serve.py` **sumiu**. Fluxo: cole o token do `@BotFather` → **Conectar**.
- **Conecta sozinho ao abrir.** Se já há um token salvo, `restore()` valida e o loop de
  long-polling sobe automaticamente quando o app abre.
- **Token fica local.** Vive só no `localStorage` e é enviado apenas para
  `api.telegram.org` da sua própria máquina — sem intermediário nenhum nosso.
- **Resiste a tela dormindo/offline.** Falhas usam backoff exponencial (2s → teto de
  15s), só a *primeira* falha é registrada no log (acabou o spam de 1 linha por segundo) e
  o status volta para *conectado* sozinho quando a rede volta. Um `401` é tratado como
  token inválido/revogado e para o loop com mensagem clara.
- Respostas longas são fatiadas (≤1500 caracteres por `sendMessage`) para a URL da
  requisição nunca estourar o limite de tamanho.
- Novo campo **Chat ID** (opcional): quando preenchido, só aquela conversa fala com o
  bot.

> **Atenção:** use uma única aba — o Telegram entrega cada update a um único consumidor
> de `getUpdates`, então duas abas competiriam pelo mesmo `offset`.

### Servidor único — `serve.py`

- Novo **`serve.py`** serve o app *e* os endpoints locais numa porta só:
  `python3 serve.py` → `http://localhost:8080` com `/health`, `/exec`, `/ytsearch` e
  `/tg-*`. Um processo, uma porta, um comando.
- As requisições GET da `bridge.py` agora **caem no fallback de arquivos estáticos**,
  então a ponte também consegue servir o app. Path traversal fora de `--root` é
  rejeitado com `403`.
- Segurança inalterada: `/exec` continua exigindo o token da execução (`403` caso
  contrário), o processo continua escutando só em `127.0.0.1` e as rotas `/tg-*` validam
  o token do bot no servidor.
- Os guias de instalação (EN/PT) agora recomendam `python3 serve.py` e marcam
  `http.server`, `npx serve` e `php -S` como alternativas *apenas estáticas* (sem
  endpoints).

### Terminal ao vivo dentro do monitor

- O card do monitor Nexus (canto superior direito) agora mostra um **terminal em tempo
  real** no lugar do "standby": linhas coloridas (`ok` / `warn` / `error`), horários,
  auto-scroll e todo o histórico do log já semeado na abertura.
- Ele é pintado **já na primeira carga** — antes o monitor pequeno ficava VAZIO até você
  clicar para abrir e fechar de novo.
- Clique no card para ampliar; um vídeo ou um preview de código continua tomando a tela
  quando está ativo.
- Novo `js/term-live.js`; o `log()` do app alimenta o terminal (buffer em memória, teto
  de 500 linhas, nada extra persistido).

### Busca web só quando você pedir

- O gate das ferramentas foi dividido. Antes, uma regex larga (casava `nota`, `dado`,
  `tarefa`, `hoje`, `fonte`, `link`, `clima`, `preço`…) liberava o `web_search` em quase
  qualquer frase, então o agente pesquisava do nada.
  - **`web_search`** agora exige pedido explícito: `pesquis…`, `busc…`, `notícias`,
    `procure`, `google`, `preço`, `clima`, `cotação`, `últimas`, `manchete`, `wiki`,
    `definição`, `história de`, `comparar`, `vs`…
  - **`web_open`** mantém o gatilho amplo, então ler uma página que você colou continua
    funcionando.
- A descrição da tool, a seção de ferramentas e **os dois** prompts de sistema (v2 e
  legado) agora dizem explicitamente: *nunca pesquise para enfeitar a resposta*.
- A linha de bloqueio continua sendo linha de controle, então nunca vaza para a resposta
  final.

### Painel de conversas

- Botão `ver todas · N` na barra lateral abre um **modal de conversas em tela cheia**
  com grade de cards (resumo, contagem de mensagens, prévia), contador ao vivo e ações por
  conversa.

### Configurações reconstruídas

- As Configurações agora abrem **uma seção por página** com navegação lateral (coluna
  única no celular), em vez de um rolar infinito.
- Nova seção **Ajuda** com 10 cards rápidos e uma dica sobre a documentação.
- Nova seção **Memória do Agente**: ver a nota de memória e configurar os subagentes
  **Secretária** (resumo noturno, com seletor de horário) e **Briefing** (resumo da
  manhã).

### Polimento de UI

- Botão de **tela cheia** (canto inferior direito) com alternância e dica traduzida.
- Ambos os **subagentes mostram ponto verde pulsando só enquanto trabalham** — cinza em
  repouso.
- Favicon simplificado para um círculo branco limpo; título da aba `Free Agent`.

### i18n

- Todas as strings novas (Telegram, Ajuda, Configurações, conversas, tela cheia)
  traduzidas para **português (BR)**, **inglês** e **espanhol**.

### Documentação

- Guias de instalação (EN/PT) atualizados para `python3 serve.py`.
- Este changelog adicionado, nos dois idiomas.

---

See also the [English version](../en/changelog.md).
