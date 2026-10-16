# Providers — Index

The skill ships with 12 search providers behind a single CLI. This page is the routing layer: comparison table, selection guide, and pointers into the per-provider deep-dives. Each `<provider>.md` file in this directory is the **authoritative source** for that provider — endpoint, auth, request/response shape, setup steps, curl recipe, baseUrl override pattern, and quirks all in one place.

## Quick comparison

| Provider | Auth | Pure search? | Model required? | Server cap | Free tier | File |
|---|---|---|---|---|---|---|
| `duckduckgo` | none | partial | no | ~30 | always free | [duckduckgo.md](duckduckgo.md) |
| `mwmbl` | none | yes | no | ~20 | always free | [mwmbl.md](mwmbl.md) |
| `exa` | required | yes | no | 20 | none (paid only since 2026) | [exa.md](exa.md) |
| `tavily` | required | yes | no | 20 | 1k/month | [tavily.md](tavily.md) |
| `brave` | required | yes | no | 20 | $5/mo credit | [brave.md](brave.md) |
| `serper` | required | yes | no | 20 | 2.5k credits | [serper.md](serper.md) |
| `google-cse` | key + CSE id | yes | no | 10 | 100/day | [google-cse.md](google-cse.md) |
| `z-ai` | required | yes | no | 50 | varies | [z-ai.md](z-ai.md) |
| `perplexity` | required | yes (or sonar) | optional | 20 | small | [perplexity.md](perplexity.md) |
| `xai` | required | no — model-mediated | yes | model decides | none | [xai.md](xai.md) |
| `openai` | required | no — model-mediated | yes | model decides | none | [openai.md](openai.md) |
| `anthropic` | required | no — model-mediated | yes | model decides | none | [anthropic.md](anthropic.md) |

`Pure search?` = "does the endpoint return raw ranked links without an LLM in the loop?". For model-mediated providers (xai/openai/anthropic) the LLM decides when, how often, and how to search — you trade direct control for synthesis and reasoning.

> **No raw search API exists for Anthropic or OpenAI as of May 2026.** Both vendors gate web search behind their model-inference endpoints (Messages API / Responses API + `web_search` tool). Confirmed against current docs and SDKs. If you need model-less search results, use the dedicated providers above (Tavily, Brave, Serper, Exa, Perplexity, etc.).

## How to choose

| Need | Provider |
|---|---|
| Free, no signup | `duckduckgo`, `mwmbl` (the only truly free providers) |
| Cheap raw web links | `tavily`, `brave`, `serper` |
| Semantic / "find pages similar to X" | `exa` |
| Recency-filtered news | `perplexity` (with `search_recency_filter`) |
| Chinese-language coverage | `z-ai` |
| Google's actual organic results | `serper` or `google-cse` |
| Independent index (privacy-leaning) | `brave`, `mwmbl` |
| Built-in synthesized answer | `perplexity` (sonar mode), `anthropic`, `openai`, `xai` |
| X/Twitter posts as a source | `xai` (pair `web_search` + `x_search`) |

For research-style queries where you want diverse coverage, fan out across several:

```bash
python3 scripts/web-search --providers tavily,brave,perplexity "..."
python3 scripts/web-search --all "..."
```

See [`../multi-provider.md`](../multi-provider.md) for parallel fan-out strategies and consensus ranking recipes.

## baseUrl override (every provider)

Every provider supports a `baseUrl` config field that fully replaces the default endpoint. Use it for self-hosted proxies, regional mirrors, corporate gateways, or local mocks. Per-provider examples are inside each `<provider>.md`. The cross-cutting concept and patterns are documented in [`../base-urls.md`](../base-urls.md).

## Adding a new provider

The skill is intentionally easy to extend. To add a new provider in your fork:

1. **Edit `scripts/web-search`**:
   - Add the name to `PROVIDERS`, `DEFAULT_ENDPOINTS`, and `MAX_RESULTS_CAPS`.
   - Register an `ENV_KEY_MAP` entry for env-var fallback (or add to `_NO_AUTH_PROVIDERS` for no-auth).
   - Implement `build_<name>(cfg, query, max_results, allowed, blocked)` returning `(method, url, headers, body)`.
   - Implement `normalize_<name>(payload)` returning a list of canonical result dicts.
   - Register both in `PROVIDER_BUILDERS` and `PROVIDER_NORMALIZERS`.
2. **Add a docs file** at `references/providers/<name>.md` following the template — see any existing provider page.
3. **Update this `index.md`** comparison table.

The canonical result schema is documented in [`../result-schema.md`](../result-schema.md).
