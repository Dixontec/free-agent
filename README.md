# Free Agent — Local-First AI Harness

<img width="1903" height="1073" alt="Captura de tela de 2026-10-17 15-55-06" src="https://github.com/user-attachments/assets/6620768c-bda6-4696-b6a6-df8ba122ffec" />
<img width="1903" height="1073" alt="Captura de tela de 2026-10-17 15-54-54" src="https://github.com/user-attachments/assets/98160d67-b92b-4a44-a1c3-ab0b97a77dd6" />

<img width="1903" height="1073" alt="image" src="https://github.com/user-attachments/assets/680ff6bf-c62c-4dd9-a1d7-0fe3b9f1426e" />


> **Keywords:** local-first · AI harness · browser-based · no backend · no lock-in · LLM orchestrator · multi-provider · Groq · OpenAI · Gemini · Anthropic · Ollama · LM Studio · OpenRouter · coding agent · scheduled routines · skills · tasks · reminders · notes · privacy · open source · MIT · free & open-weight models

> Free Agent is a 100% browser-based, local-first harness that sits between you and AI providers. No backend, no telemetry, no lock-in — your API keys never leave your machine.

**[🇺🇸 Read in English](#-english) · [🇧🇷 Leia em Português](#-português)**

![license](https://img.shields.io/badge/license-MIT-green) ![local-first](https://img.shields.io/badge/local--first-100%25-blue) ![no-build](https://img.shields.io/badge/setup-no%20build%20needed-lightgrey) ![privacy](https://img.shields.io/badge/privacy-no%20telemetry-brightgreen)

---

<a name="english"></a>
## 🇺🇸 English

### What is Free Agent

**Free Agent** is a web panel that sits between you and AI providers (Groq, OpenAI, Gemini, Anthropic, Ollama, LM Studio, OpenRouter). It is not a model — it is the **harness**: the reliable layer that decides when to call the model, when to fetch real data from the web, when to ask for human confirmation, when to run a scheduled routine, and when to say "could not verify, marked as pending" instead of inventing an answer.

Principles:

1. **Local-first & private** — runs as static files + `localStorage`. Your API keys never leave your browser except for direct calls to the official provider APIs you configure. No accounts, no telemetry, no proprietary backend.
2. **Reliability over speed** — ReAct loop with max 8 steps, 25s LLM timeout, deterministic verification before delivery. Without `VERIFIED`, the answer ships marked as pending.
3. **No hallucinated links** — every cited URL must come from a tool. Invented URLs are rejected automatically.
4. **Sandbox + human approval** — opening sites asks for confirmation, destructive commands are blocked, export never includes keys.

### Features

- **Daily greeting by the LLM** — on load, the agent reads your tasks, reminders and notes and writes a short, gentle context summary of your day (cached per day, refreshed automatically when data changes).
- **Harness chat** with commands: `/news <topic>` · `/wiki <term>` · `/yt <link or query>` · `/routine 08:00` · `/skill <name>` · `play <name>` · `download <name>` · reminders · notes.
- **6+ providers**: Groq (free tier, recommended) · OpenAI · Gemini · Anthropic · local Ollama · local LM Studio · OpenRouter/compatible. Provider + model picker, temperature, max tokens, connection test, auto model refresh.
- **Scheduled routines**: e.g. daily 08:00 → play music + video + news + open apps + AI prompt. Built-in scheduler + notifications + voice.
- **10 built-in skills**: deep web research, news digest, morning routine, YouTube player, music & focus, app opener, smart summarizer, Linux automation, multi-provider search, web browser — plus create your own.
- **Free music, no key**: search Internet Archive + Wikimedia, play instantly or download MP3. Local player with queue, authorized folder, chat commands.
- **Coding agent (plan/build)**: read, search, edit and create project files with diff preview, per-tool permissions, undo, workspace jailed to the authorized folder, optional local shell via `bridge.py`.
- **3 premium Apple-style themes** (Light · Dark · Glass), Three.js 3D background + aurora, JARVIS-style Core with live activity windows, system monitor, clock + weather, reminders, notes, full log + agent traces, JSON export/import without secrets.
- **Automated eval**: `node eval/run-eval.mjs` (logic + real loop) + in-browser self-test `?eval=1` against the live app, fully isolated from your data.

### Install (2 minutes)

Prerequisite: any modern browser + Python 3 (only to serve local files).

```bash
git clone https://github.com/Dixontec/free-agent.git
cd free-agent
python3 -m http.server 8080
# open http://localhost:8080
```

> Use a local server (not `file://`) so Three.js modules load from CDN.

Full guide: [`docs/en/install.md`](docs/en/install.md)

### Quick start

1. Open **Settings → Connection & Model**, pick **Groq**, paste your key from [console.groq.com](https://console.groq.com) (stored only in your browser) and click **Test connection**.
2. No key? Local commands still work: `/news technology`, `/wiki AI`, `play lofi`, routines and local player need no AI.
3. Create a routine: **Routines → New routine → 08:00**, actions:
   ```
   musica: https://www.youtube.com/watch?v=VIDEO_ID
   noticias: technology
   prompt: Good morning! Summarize the news and plan my day with 3 priorities.
   abrir: https://gmail.com
   ```
4. To code on a project: **Settings → Coding → Authorize folder**, pick Plan or Build, and (optionally) run `python3 bridge.py --root /path/to/project` to enable local shell with a token.

Guides: [`docs/en/usage.md`](docs/en/usage.md) · [`docs/en/routines.md`](docs/en/routines.md) · [`docs/en/skills.md`](docs/en/skills.md) · [`docs/en/providers.md`](docs/en/providers.md) · [`docs/en/bridge.md`](docs/en/bridge.md)

### Security & privacy

- Keys live in `localStorage` (`nexus:keys`) — browser-only storage. Export goes through `stripSecrets()`; keys become `***` and `baseUrl` is removed.
- Keys are sent **only** to the official API endpoint of the provider you configured (e.g. `api.groq.com`), in the `Authorization` header. Never to proxies, logs, traces or backups.
- `open_site` always asks for confirmation. Off-allowlist hosts require explicit approval.
- `bridge.py`: binds only to `127.0.0.1`, random token per run, directory jail (`--root`), blocklist (`rm -rf /`, `mkfs`, `shutdown`, `crontab -r`, ...), timeouts.
- No telemetry. No proprietary backend. Details: [`docs/en/security.md`](docs/en/security.md) · [`SECURITY.md`](SECURITY.md)

### Eval & quality

```bash
node eval/run-eval.mjs   # exit 0 = green · exit 1 = regression
```

In the browser: `http://localhost:8080/?eval=1` — end-to-end scenarios against the live app with full snapshot/restore of your data. Details: [`docs/en/eval.md`](docs/en/eval.md)

### Layout

```
free-agent/
├── index.html          # layout (topbar, sidebar, chat, panel, modals)
├── styles.css          # light / dark / glass themes
├── bridge.py           # optional local bridge (shell + fetch, stdlib only)
├── AGENTS.md           # harness system prompt (earned rules)
├── HARNESS.md          # v2 architecture, limits, future removal
├── js/
│   ├── app.js          # engine: providers, chat, routines, skills, tasks, notes, greeting
│   ├── harness-core.js # ReAct loop (orchestrator)
│   ├── tools-registry.js # tools + on-demand schemas
│   ├── context-budget.js # context budget + offload
│   ├── verifiers.js    # deterministic verification
│   ├── gate.js         # sandbox + stripSecrets
│   ├── trace-store.js  # JSONL observability
│   ├── code-agent.js   # coding agent plan/build
│   ├── skills.js       # default skills catalog
│   ├── sandbox.js · system monitors, music-*.js · player,
│   │   three-bg.js · neural.js · voice.js · clockwx.js · v2-bridge.js
├── hooks/              # pre-tool.js (feedforward) · post-tool.js (feedback)
├── eval/               # golden-tasks.json · run-eval.mjs · browser-eval.js
├── .agents/skills/web-search/  # optional multi-provider search skill
└── docs/               # full guides in English and PT-BR
```

Architecture: [`docs/en/architecture.md`](docs/en/architecture.md) · [`HARNESS.md`](HARNESS.md)

### FAQ

**Offline?** AI APIs and news need internet. Local player, prompt-less routines and local Ollama work offline. **Free?** The app is MIT. Groq has a free tier; Ollama/LM Studio are free and local. **Do my keys go to your server?** No — there is no server, only direct calls from your browser to official APIs. More: [`docs/en/faq.md`](docs/en/faq.md)

---

<a name="pt"></a>
## 🇧🇷 Português

### O que é o Free Agent

O **Free Agent** (antes **My OS**) é um painel web que fica entre você e os provedores de IA (Groq, OpenAI, Gemini, Anthropic, Ollama, LM Studio, OpenRouter). Ele não é um modelo — é o **harness**: quem decide quando chamar o modelo, quando buscar dado real na web, quando pedir confirmação, quando agendar uma rotina e quando dizer "não consegui verificar, está pendente" em vez de inventar resposta.

Princípios:

1. **Local-first** — tudo roda como arquivos estáticos + `localStorage`. Suas chaves nunca saem do seu navegador, exceto nas chamadas diretas às APIs oficiais.
2. **Confiabilidade > velocidade** — loop ReAct com no máximo 8 passos, timeout de 25s no LLM, verificação determinística antes de entregar. Sem `VERIFIED`, a resposta sai marcada como pendente.
3. **Sem alucinação de links** — toda URL citada precisa ter vindo de uma ferramenta. URL inventada é rejeitada automaticamente.
4. **Sandbox + aprovação humana** — abrir site pede confirmação, comando destrutivo é bloqueado, export nunca inclui chaves.

### Funcionalidades

- **Saudação diária pelo LLM** — ao abrir, o agente lê suas tarefas, lembretes e notas e escreve um resumo curto e gentil do seu dia (cache por dia, atualiza sozinho quando os dados mudam).
- **Chat harness** com comandos: `/news <tema>` · `/wiki <termo>` · `/yt <link ou busca>` · `/rotina 08:00` · `/skill <nome>` · `toca <nome>` · `baixa <nome>` · lembretes · notas.
- **6+ provedores**: Groq (grátis, recomendado) · OpenAI · Gemini · Anthropic · Ollama local · LM Studio local · OpenRouter/compatível. Seletor de provedor + modelo, temperatura, max tokens, teste de conexão, atualização automática de modelos.
- **Rotinas agendadas**: ex. todo dia 08:00 → toca música + vídeo + notícias + abre apps + prompt de IA. Scheduler interno + notificações + voz.
- **10 skills ativas por padrão**: pesquisa web profunda, digest de notícias, rotina da manhã, YouTube player, música & foco, abridor de apps, resumo inteligente, automação Linux, busca multi-provedor, navegador web — e você pode criar as suas.
- **Música livre sem chave**: busca em Internet Archive + Wikimedia, toca na hora ou baixa MP3. Player local com fila, pasta autorizada, comandos pelo chat.
- **Coding agent (plan/build)**: leia, busque, edite e crie arquivos do projeto com diff preview, permissões por ferramenta, undo, workspace restrito à pasta autorizada e shell local opcional via `bridge.py`.
- **3 temas Apple premium** (Light · Dark · Glass), fundo 3D Three.js + aurora, Núcleo estilo JARVIS com janelas de atividade em tempo real, monitor de sistema, relógio + clima, lembretes, notas, log completo + traces do agente, export/import JSON sem segredos.
- **Eval automatizado**: `node eval/run-eval.mjs` (lógica + loop real) + self-test no navegador `?eval=1` contra o app vivo, com isolamento total dos seus dados.

### Instalação (2 minutos)

Pré-requisito: qualquer navegador moderno + Python 3 (só para servir os arquivos locais).

```bash
git clone https://github.com/Dixontec/free-agent.git
cd free-agent
python3 -m http.server 8080
# abra http://localhost:8080
```

> Use um servidor local (não `file://`) para os módulos Three.js via CDN funcionarem.

Guia completo: [`docs/pt-BR/instalacao.md`](docs/pt-BR/instalacao.md)

### Uso rápido

1. Abra **Configurações → Conexão & Modelo**, escolha **Groq**, cole sua chave de [console.groq.com](https://console.groq.com) (fica só no seu navegador) e clique **Testar conexão**.
2. Sem chave também funciona: comandos locais `/news tecnologia`, `/wiki IA`, `toca lofi`, rotinas e player local não precisam de IA.
3. Crie uma rotina: aba **Rotinas → Nova rotina → 08:00**, ações:
   ```
   musica: https://www.youtube.com/watch?v=VIDEO_ID
   noticias: tecnologia
   prompt: Bom dia! Resuma as notícias e monte minha agenda com 3 prioridades.
   abrir: https://gmail.com
   ```
4. Para codar num projeto: **Configurações → Coding → Autorizar pasta**, escolha Plan ou Build, e (opcional) rode `python3 bridge.py --root /caminho/do/projeto` para liberar shell local com token.

Guias: [`docs/pt-BR/uso.md`](docs/pt-BR/uso.md) · [`docs/pt-BR/rotinas.md`](docs/pt-BR/rotinas.md) · [`docs/pt-BR/skills.md`](docs/pt-BR/skills.md) · [`docs/pt-BR/provedores.md`](docs/pt-BR/provedores.md) · [`docs/pt-BR/bridge.md`](docs/pt-BR/bridge.md)

### Segurança e privacidade

- Chaves ficam em `localStorage` (`nexus:keys`), só no seu navegador. Export usa `stripSecrets()` — chaves viram `***` e `baseUrl` é removido.
- Chaves são enviadas **apenas** ao endpoint oficial do provedor configurado (ex.: `api.groq.com`), no header `Authorization`. Nunca para proxies, logs, traces ou backups.
- `open_site` sempre pede confirmação. Hosts fora do allowlist exigem aprovação explícita.
- `bridge.py`: bind só em `127.0.0.1`, token aleatório por execução, jail de diretório (`--root`), blocklist (`rm -rf /`, `mkfs`, `shutdown`, `crontab -r`, ...), timeout.
- Nenhuma telemetria. Nenhum backend próprio. Detalhes: [`docs/pt-BR/seguranca.md`](docs/pt-BR/seguranca.md) · [`SECURITY.md`](SECURITY.md)

### Eval e qualidade

```bash
node eval/run-eval.mjs   # exit 0 = verde · exit 1 = regressão
```

E no navegador: `http://localhost:8080/?eval=1` — roda cenários fim-a-fim contra o app vivo com snapshot/restore total dos seus dados. Detalhes: [`docs/pt-BR/eval.md`](docs/pt-BR/eval.md) · [`eval/README.md`](eval/README.md)

### Estrutura

Ver a árvore na seção inglesa — os nomes de arquivos são idênticos. Arquitetura detalhada: [`docs/pt-BR/arquitetura.md`](docs/pt-BR/arquitetura.md) · [`HARNESS.md`](HARNESS.md)

### FAQ

**Precisa de internet?** Para chamar APIs de IA e buscar notícias, sim. Player local, rotinas sem prompt e Ollama local funcionam offline. **É grátis?** O app é MIT. Groq tem tier grátis, Ollama/LM Studio são locais e gratuitos. **Minhas chaves vão para algum servidor seu?** Não. Não há servidor — só chamadas diretas do seu navegador às APIs oficiais. Mais: [`docs/pt-BR/faq.md`](docs/pt-BR/faq.md)

---

## Docs · Documentação

| English | Português |
|---|---|
| [Install](docs/en/install.md) | [Instalação](docs/pt-BR/instalacao.md) |
| [Usage](docs/en/usage.md) | [Uso](docs/pt-BR/uso.md) |
| [Routines](docs/en/routines.md) | [Rotinas](docs/pt-BR/rotinas.md) |
| [Skills](docs/en/skills.md) | [Skills](docs/pt-BR/skills.md) |
| [Providers](docs/en/providers.md) | [Provedores](docs/pt-BR/provedores.md) |
| [Bridge & Coding](docs/en/bridge.md) | [Bridge & Coding](docs/pt-BR/bridge.md) |
| [Architecture](docs/en/architecture.md) | [Arquitetura](docs/pt-BR/arquitetura.md) |
| [Security](docs/en/security.md) | [Segurança](docs/pt-BR/seguranca.md) |
| [Eval](docs/en/eval.md) | [Eval](docs/pt-BR/eval.md) |
| [FAQ](docs/en/faq.md) | [FAQ](docs/pt-BR/faq.md) |

Advanced: [AGENTS.md](AGENTS.md) (system prompt) · [HARNESS.md](HARNESS.md) (v2 architecture) · [eval/README.md](eval/README.md) · [CONTRIBUTING.md](CONTRIBUTING.md) · [SECURITY.md](SECURITY.md)

## License · Licença

MIT — see [LICENSE](LICENSE). Built for download, fork and contribution.

MIT — veja [LICENSE](LICENSE). Feito para download, fork e contribuição.
