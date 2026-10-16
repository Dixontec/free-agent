# web-search

LLM-neutral web search skill for AI coding agents (pi, hermes-agent, openclaw, opencode, claude-code, etc.).

Instead of hard-coding a single search provider into every agent, this skill lets the agent invoke a single command (`scripts/web-search`) that fans out across **12 search providers**, dumps raw + normalized results to a temp directory, and prints a path the agent can pipe through `rg`, `jq`, or any other tool.

**Zero config out of the box** — DuckDuckGo and MWMBL accept anonymous calls. Add API keys for richer providers (Tavily, Brave, Perplexity, Anthropic, OpenAI, etc.) when you want them.

## Why a skill, not a library?

Agent harnesses already have a way to load skills on demand. Embedding web search as a skill means:

- **No fixed context cost** — the skill loads only when the agent needs to search.
- **No vendor lock-in** — swap providers per call, or fan out across many in parallel.
- **No SDK churn** — pure Python 3 stdlib + curl. Works wherever Python 3 runs.
- **Pipeline-native** — results live as JSON files on disk so `rg`, `jq`, `grep`, `python -c` all just work.

## Supported providers (12)

| Provider | Auth | Notes |
|---|---|---|
| `duckduckgo` | **none** | Free Instant Answer API. Zero-config. |
| `mwmbl` | **none** | Free open-source independent index. Zero-config. |
| `exa` | API key | Semantic / neural search. (Anonymous calls disabled in 2026.) |
| `tavily` | API key | LLM-friendly result snippets. |
| `brave` | API key | Independent index. Good for privacy-sensitive queries. |
| `serper` | API key | Google results via paid proxy. |
| `google-cse` | API key + Custom Search Engine ID | Official Google. Max 10 results per call. |
| `z-ai` | API key | China-friendly index. |
| `perplexity` | API key | Pure search OR sonar with built-in answer. |
| `xai` | API key | Grok web_search + x_search via Responses API. |
| `openai` | API key | OpenAI hosted web search (Responses API + `web_search` tool). |
| `anthropic` | API key | Claude hosted web search (Messages API + `web_search` tool). |

Every provider supports a **`baseUrl` override** for self-hosted proxies, regional mirrors, corporate gateways, or local mocks. See [`references/base-urls.md`](references/base-urls.md).

Full provider catalog with endpoints, request/response shapes, and quirks: [`references/providers/index.md`](references/providers/index.md). Each provider has its own dedicated reference page with API spec, setup, curl recipe, and quirks all in one place.

Setup instructions for each provider's API key: [`references/setup.md`](references/setup.md).

## Quick start

### Zero-config (no API key)

```bash
python3 scripts/web-search "what is the latest python version"
```

### Add API keys

```bash
mkdir -p ~/.config/web-search                                   # macOS / Linux
cp config/config.example.json ~/.config/web-search/config.json
$EDITOR ~/.config/web-search/config.json
```

On Windows, drop the file in `%APPDATA%\web-search\config.json` instead.

### Common invocations

```bash
# Specific provider:
python3 scripts/web-search --provider tavily "latest python version"

# Parallel across multiple providers:
python3 scripts/web-search --providers tavily,brave,perplexity "..."

# Every configured provider in parallel:
python3 scripts/web-search --all "..."

# Pipeline-friendly:
python3 scripts/web-search "kubernetes 1.31 release notes" | rg -i "release|stable"
jq '.manifests[].results[].url' "$(python3 scripts/web-search --print-path-only "...")"
```

See [`SKILL.md`](SKILL.md) for the full agent-facing documentation.

## Cross-platform

Runs on **macOS, Linux, WSL, Git Bash, native Windows, and any container with Python 3.8+**. Pure stdlib — no `pip install`, no Node, no jq required to use the wrapper. (`jq` and `rg` are recommended for downstream filtering.) Full per-OS notes in [`references/platform-notes.md`](references/platform-notes.md).

## Layout

```
web-search/
├── SKILL.md                      # Agent-facing skill instructions (LLM-neutral)
├── README.md                     # Human-facing project overview (this file)
├── LICENSE
├── scripts/
│   └── web-search                # Single-file Python 3 entry point (stdlib only)
├── references/
│   ├── providers/                # One file per provider — full API spec, setup, curl, quirks
│   │   ├── index.md              # Comparison table, selection guide, "adding a provider"
│   │   ├── duckduckgo.md         # Free, no auth — Instant Answer API
│   │   ├── mwmbl.md              # Free, no auth — open-source independent index
│   │   ├── exa.md                # Optional key — semantic search
│   │   ├── tavily.md             # Required — LLM-friendly clean snippets
│   │   ├── brave.md              # Required — independent index
│   │   ├── serper.md             # Required — Google's organic via paid proxy
│   │   ├── google-cse.md         # Required + CSE id — official Google
│   │   ├── z-ai.md               # Required — Chinese-language coverage
│   │   ├── perplexity.md         # Required — pure /search OR sonar
│   │   ├── xai.md                # Required + model — Grok web_search + x_search
│   │   ├── openai.md             # Required + model — Responses API + web_search
│   │   └── anthropic.md          # Required + model — Messages API + web_search
│   ├── setup.md                  # Per-provider API key acquisition guides (cross-cutting)
│   ├── pipelines.md              # rg/jq/grep filtering recipes
│   ├── multi-provider.md         # Parallel search strategies + consensus ranking
│   ├── curl-recipes.md           # All curl one-liners in one place (Python-less fallback)
│   ├── result-schema.md          # Canonical normalized output format
│   ├── platform-notes.md         # macOS / Linux / Windows / WSL / containers
│   └── base-urls.md              # baseUrl override patterns (proxies, gateways, mocks)
└── config/
    └── config.example.json       # Configuration template (every provider documented)
```

## License

MIT. See [LICENSE](LICENSE).
