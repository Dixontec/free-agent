# My OS · AI Harness

> Harness local-first, premium e 100% no navegador para orquestrar modelos de IA, rotinas, skills, tarefas, música e coding agent — sem backend, sem lock-in, sem enviar suas chaves para terceiros.

> Local-first, premium, 100% browser-based harness to orchestrate AI models, routines, skills, tasks, music and a coding agent — no backend, no lock-in, your keys never leave your machine.

**[🇧🇷 Leia em Português](#-versão-em-português) · [🇺🇸 Read in English](#-english-version)**

![license](https://img.shields.io/badge/license-MIT-green) ![local-first](https://img.shields.io/badge/local--first-100%25-blue) ![no-build](https://img.shields.io/badge/setup-no%20build%20needed-lightgrey)

---

<a name="pt-br"></a>
## 🇧🇷 Versão em Português

### O que é o My OS

O **My OS** é um painel web que fica entre você e os provedores de IA (Groq, OpenAI, Gemini, Anthropic, Ollama, LM Studio, OpenRouter). Ele não é um modelo — é o **harness**: quem decide quando chamar o modelo, quando buscar dado real na web, quando pedir confirmação, quando agendar uma rotina e quando dizer "não consegui verificar, está pendente" em vez de inventar resposta.

Princípios:

1. **Local-first** — tudo roda como arquivos estáticos + `localStorage`. Suas chaves nunca saem do seu navegador, exceto nas chamadas diretas às APIs oficiais.
2. **Confiabilidade > velocidade** — loop ReAct com no máximo 8 passos, timeout de 25s no LLM, verificação determinística antes de entregar. Sem `VERIFIED`, a resposta sai marcada como pendente.
3. **Sem alucinação de links** — toda URL citada precisa ter vindo de uma ferramenta. URL inventada é rejeitada automaticamente.
4. **Sandbox + aprovação humana** — abrir site pede confirmação, comando destrutivo é bloqueado, export nunca inclui chaves.

### Funcionalidades

- **Chat harness** com comandos: `/news <tema>` · `/wiki <termo>` · `/yt <link ou busca>` · `/rotina 08:00` · `/skill <nome>` · `toca <nome>` · `baixa <nome>` · `me lembre às 14:30 ...`
- **6+ provedores**: Groq (grátis, recomendado) · OpenAI · Gemini · Anthropic · Ollama local · LM Studio local · OpenRouter/compatível. Seletor de provedor + modelo, temperatura, max tokens, teste de conexão, atualização automática de modelos.
- **Rotinas agendadas**: ex. todo dia 08:00 → toca música + vídeo + notícias + abre apps + prompt de IA. Scheduler interno + notificações + voz.
- **10 skills ativas por padrão**: pesquisa web profunda, digest de notícias, rotina da manhã, YouTube player, música & foco, abridor de apps, resumo inteligente, automação Linux, busca multi-provedor, navegador web — e você pode criar as suas.
- **Música livre sem chave**: busca em Internet Archive + Wikimedia, toca na hora ou baixa MP3. Player local com fila, pasta autorizada, comandos pelo chat.
- **Coding agent (plan/build)**: leia, busque, edite e crie arquivos do projeto com diff preview, permissões por ferramenta, undo, workspace restrito à pasta autorizada e shell local opcional via `bridge.py`.
- **3 temas Apple premium** (Light · Dark · Glass), fundo 3D Three.js + aurora, Núcleo estilo JARVIS com janelas de atividade em tempo real, monitor de sistema, relógio + clima, lembretes, log completo + traces do agente, export/import JSON sem segredos.
- **Eval automatizado**: `node eval/run-eval.mjs` (lógica + loop real) + self-test no navegador `?eval=1` contra o app vivo, com isolamento total dos seus dados.

### Instalação (2 minutos)

Pré-requisito: qualquer navegador moderno + Python 3 (só para servir os arquivos locais).

```bash
git clone https://github.com/SEU-USUARIO/my-os.git
cd my-os
python3 -m http.server 8080
# abra http://localhost:8080
```

> Use um servidor local (não `file://`) para os módulos Three.js via CDN funcionarem.

Guia completo: [`docs/pt-BR/instalacao.md`](docs/pt-BR/instalacao.md) · [`docs/en/install.md`](docs/en/install.md)

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

### Estrutura

```
my-os/
├── index.html          # layout (topbar, sidebar, chat, painel, modais)
├── styles.css          # temas light / dark / glass
├── bridge.py           # bridge local opcional (shell + busca, stdlib only)
├── AGENTS.md           # system prompt do harness (regras earned)
├── HARNESS.md          # arquitetura v2, limites e remoção futura
├── js/
│   ├── app.js          # engine: providers, chat, rotinas, skills, tarefas
│   ├── harness-core.js # loop ReAct (orquestrador)
│   ├── tools-registry.js # ferramentas + schemas sob demanda
│   ├── context-budget.js # orçamento de contexto + offload
│   ├── verifiers.js    # verificação determinística
│   ├── gate.js         # sandbox + stripSecrets
│   ├── trace-store.js  # observabilidade JSONL
│   ├── code-agent.js   # coding agent plan/build
│   ├── skills.js       # catálogo padrão de skills
│   ├── sandbox.js · sandbox monitores, music-*.js · player,
│   │   three-bg.js · neural.js · voice.js · clockwx.js · v2-bridge.js
├── hooks/              # pre-tool.js (feedforward) · post-tool.js (feedback)
├── eval/               # golden-tasks.json · run-eval.mjs · browser-eval.js
├── .agents/skills/web-search/  # skill opcional de busca multi-provedor
└── docs/               # guias completos em PT-BR e EN
```

Arquitetura detalhada: [`docs/pt-BR/arquitetura.md`](docs/pt-BR/arquitetura.md) · [`HARNESS.md`](HARNESS.md)

### Segurança e privacidade

- Chaves em `localStorage` (`nexus:keys`). Export usa `stripSecrets()` — chaves viram `***` e `baseUrl` é removido.
- `open_site` sempre pede confirmação. Hosts fora do allowlist exigem aprovação explícita.
- `bridge.py`: bind só em `127.0.0.1`, token aleatório por execução, jail de diretório (`--root`), blocklist (`rm -rf /`, `mkfs`, `shutdown`, `crontab -r`, ...), timeout, sem CORS amplo além do necessário.
- Nenhuma telemetria. Nenhum backend próprio. Detalhes: [`docs/pt-BR/seguranca.md`](docs/pt-BR/seguranca.md) · [`SECURITY.md`](SECURITY.md)

### Eval e qualidade

```bash
node eval/run-eval.mjs   # exit 0 = verde · exit 1 = regressão
```

E no navegador: `http://localhost:8080/?eval=1` — roda cenários fim-a-fim contra o app vivo com snapshot/restore total dos seus dados. Detalhes: [`docs/pt-BR/eval.md`](docs/pt-BR/eval.md) · [`eval/README.md`](eval/README.md)

### FAQ

**Precisa de internet?** Para chamar APIs de IA e buscar notícias, sim. Player local, rotinas sem prompt e Ollama local funcionam offline. **É grátis?** O app é MIT. Groq tem tier grátis, Ollama/LM Studio são locais e gratuitos. **Minhas chaves vão para algum servidor seu?** Não. Não há servidor — só chamadas diretas do seu navegador às APIs oficiais. Mais: [`docs/pt-BR/faq.md`](docs/pt-BR/faq.md)

---

<a name="english-version"></a>
## 🇺🇸 English Version

### What is My OS

**My OS** is a web panel that sits between you and AI providers (Groq, OpenAI, Gemini, Anthropic, Ollama, LM Studio, OpenRouter). It is not a model — it is the **harness**: the layer that decides when to call the model, when to fetch real data from the web, when to ask for confirmation, when to run a scheduled routine, and when to say "could not verify, marked as pending" instead of making up an answer.

Principles:

1. **Local-first** — runs as static files + `localStorage`. Your keys never leave your browser except for direct calls to official APIs.
2. **Reliability > speed** — ReAct loop with max 8 steps, 25s LLM timeout, deterministic verification before delivery. Without `VERIFIED`, the answer ships marked as pending.
3. **No hallucinated links** — every cited URL must come from a tool. Invented URLs are rejected automatically.
4. **Sandbox + human approval** — opening sites asks for confirmation, destructive commands are blocked, export never includes keys.

### Features

- **Harness chat** with commands: `/news <topic>` · `/wiki <term>` · `/yt <link or query>` · `/routine 08:00` · `/skill <name>` · `play <name>` · `download <name>` · reminders.
- **6+ providers**: Groq (free, recommended) · OpenAI · Gemini · Anthropic · local Ollama · local LM Studio · OpenRouter/compatible. Provider + model picker, temperature, max tokens, connection test, auto model refresh.
- **Scheduled routines**: e.g. daily 08:00 → play music + video + news + open apps + AI prompt. Built-in scheduler + notifications + voice.
- **10 built-in skills**: deep web research, news digest, morning routine, YouTube player, music & focus, app opener, smart summarizer, Linux automation, multi-provider search, web browser — plus create your own.
- **Free music, no key**: search Internet Archive + Wikimedia, play instantly or download MP3. Local player with queue, authorized folder, chat commands.
- **Coding agent (plan/build)**: read, search, edit and create project files with diff preview, per-tool permissions, undo, workspace jailed to the authorized folder, optional local shell via `bridge.py`.
- **3 premium Apple-style themes** (Light · Dark · Glass), Three.js 3D background + aurora, JARVIS-style Core with live activity windows, system monitor, clock + weather, reminders, full log + agent traces, JSON export/import without secrets.
- **Automated eval**: `node eval/run-eval.mjs` (logic + real loop) + in-browser self-test `?eval=1` against the live app, fully isolated from your data.

### Install (2 minutes)

Prerequisite: any modern browser + Python 3 (only to serve local files).

```bash
git clone https://github.com/YOUR-USERNAME/my-os.git
cd my-os
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

### Layout

See the Portuguese tree above — file names are identical. Architecture: [`docs/en/architecture.md`](docs/en/architecture.md) · [`HARNESS.md`](HARNESS.md)

### Security & privacy

- Keys in `localStorage` (`nexus:keys`). Export goes through `stripSecrets()` — keys become `***`, `baseUrl` removed.
- `open_site` always asks for confirmation. Off-allowlist hosts require explicit approval.
- `bridge.py`: binds only to `127.0.0.1`, random token per run, directory jail (`--root`), blocklist (`rm -rf /`, `mkfs`, `shutdown`, `crontab -r`, ...), timeouts.
- No telemetry. No proprietary backend. Details: [`docs/en/security.md`](docs/en/security.md) · [`SECURITY.md`](SECURITY.md)

### Eval & quality

```bash
node eval/run-eval.mjs   # exit 0 = green · exit 1 = regression
```

In the browser: `http://localhost:8080/?eval=1` — end-to-end scenarios against the live app with full snapshot/restore of your data. Details: [`docs/en/eval.md`](docs/en/eval.md)

### FAQ

**Offline?** AI APIs and news need internet. Local player, prompt-less routines and local Ollama work offline. **Free?** The app is MIT. Groq has a free tier; Ollama/LM Studio are free and local. **Do my keys go to your server?** No — there is no server, only direct calls from your browser to official APIs. More: [`docs/en/faq.md`](docs/en/faq.md)

---

## Docs completas · Full docs

| Português | English |
|---|---|
| [Instalação](docs/pt-BR/instalacao.md) | [Install](docs/en/install.md) |
| [Uso](docs/pt-BR/uso.md) | [Usage](docs/en/usage.md) |
| [Rotinas](docs/pt-BR/rotinas.md) | [Routines](docs/en/routines.md) |
| [Skills](docs/pt-BR/skills.md) | [Skills](docs/en/skills.md) |
| [Provedores](docs/pt-BR/provedores.md) | [Providers](docs/en/providers.md) |
| [Bridge & Coding](docs/pt-BR/bridge.md) | [Bridge & Coding](docs/en/bridge.md) |
| [Arquitetura](docs/pt-BR/arquitetura.md) | [Architecture](docs/en/architecture.md) |
| [Segurança](docs/pt-BR/seguranca.md) | [Security](docs/en/security.md) |
| [Eval](docs/pt-BR/eval.md) | [Eval](docs/en/eval.md) |
| [FAQ](docs/pt-BR/faq.md) | [FAQ](docs/en/faq.md) |

Avançado: [AGENTS.md](AGENTS.md) (system prompt) · [HARNESS.md](HARNESS.md) (arquitetura v2) · [eval/README.md](eval/README.md) · [CONTRIBUTING.md](CONTRIBUTING.md) · [SECURITY.md](SECURITY.md)

## Licença · License

MIT — veja [LICENSE](LICENSE). Feito para download, fork e contribuição.

MIT — see [LICENSE](LICENSE). Built for download, fork and contribution.
