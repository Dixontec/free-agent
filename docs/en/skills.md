# Skills — My OS

Skills are pluggable capabilities the AI invokes via `run_skill <slug>`.

## Built-in (10 active)

| Slug | Title | Auto action |
|---|---|---|
| `pesquisa-web` | Deep Web Research | — |
| `noticias-digest` | News Digest | `noticias: technology` |
| `rotina-manha` | Morning Routine 08:00 | youtube + news |
| `youtube-player` | YouTube Player | — |
| `musica-foco` | Music & Focus | `musica: ...` |
| `abridor-apps` | App & Site Opener | — |
| `resumo-texto` | Smart Summarizer | — |
| `automacao-linux` | Linux Automation | — |
| `busca-multi` | Multi-Provider Search | — |
| `navegador-web` | Nexus Browser | — |

## Create yours

1. **Skills tab → New skill**.
2. Fill: slug (`my-search`), Lucide icon (`search`), title, description, **skill system prompt**, optional action.
3. Save & enable. Call via `/skill my-search` or natural language.

## Harness rules (v2)

- Lazy schemas: the model only sees names + 1 line per skill, never full prompts (context savings).
- Missing/inactive slug → `skill` pending (app lists valid slugs instead of inventing).
- Optional advanced skill in `.agents/skills/web-search/` (multi-provider: Exa, Tavily, Brave, Serper, Perplexity, xAI, Z-AI + free DDG/MWMBL). Configure via `config.example.json` + env vars — **never commit real keys**.

## Skill prompt tip

```
You are a [role]. Always: 1) use the provided data,
2) answer in English, 3) cite sources with links,
4) end with [fixed format]. If data is missing, say what's missing.
```
