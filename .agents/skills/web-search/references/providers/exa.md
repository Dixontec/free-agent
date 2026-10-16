# exa

[Exa](https://exa.ai) — semantic / neural search. **API key required** as of 2026 (anonymous calls now return `402 Payment Required`).

## At a glance

| | |
|---|---|
| Provider ID | `exa` |
| Default endpoint | `https://api.exa.ai/search` |
| Method | `POST` |
| Auth | header `x-api-key: <key>` (required) |
| Model | n/a |
| Server max results | 20 |
| Free tier | none — Exa removed anonymous access in 2026 |
| Pricing | usage-based — see [exa.ai/pricing](https://exa.ai/pricing) |

## When to use

| Use | Avoid |
|---|---|
| Semantic search ("find pages similar to this URL") | Strict keyword/Boolean queries |
| Technical / academic content | Real-time news (use Perplexity or Brave) |
| Discovering long-tail relevant pages | Cheap bulk lookups (Serper or Brave are cheaper per call) |

## Setup

1. Sign up at [dashboard.exa.ai](https://dashboard.exa.ai/login).
2. Generate an API key from the dashboard's *API Keys* page (`exa_…` format).
3. Drop into config or set the env var:
   ```json
   {"providers": {"exa": {"apiKey": "exa_..."}}}
   ```
   ```bash
   export EXA_API_KEY="exa_..."
   ```

> **Note**: Earlier versions of this skill claimed Exa accepted anonymous calls. Exa changed that policy in 2026 — calls without a key now return `402 Payment Required`. The skill no longer treats Exa as zero-config.

## Request

```http
POST https://api.exa.ai/search
Content-Type: application/json
x-api-key: <key>

{
  "query": "<query string>",
  "numResults": 10,
  "includeDomains": ["..."],     ; optional
  "excludeDomains": ["..."]      ; optional
}
```

The skill clamps `numResults` to the server cap of 20.

## Response

```json
{
  "results": [
    {
      "title": "...",
      "url": "https://...",
      "text": "Full or summarized page content...",
      "score": 0.87,
      "publishedDate": "2025-09-15"
    }
  ],
  "autopromptString": "..."
}
```

### Field mapping (canonical schema)

| Upstream field | Canonical field | Notes |
|---|---|---|
| `title` | `title` | required |
| `url` | `url` | required |
| `text` (fallback `snippet`) | `snippet` | Exa often returns long extracts |
| `score` | `score` | 0–1 semantic relevance |
| `publishedDate` | `publishedAt` | ISO date when known |

## Domain filtering

Native structured fields. The skill passes `--include` to `includeDomains` and `--exclude` to `excludeDomains`.

```bash
python3 scripts/web-search --provider exa --include arxiv.org "transformer interpretability"
```

## baseUrl override

```json
{"providers": {"exa": {"apiKey": "exa_...", "baseUrl": "https://exa-proxy.internal/search"}}}
```

The override must accept the same JSON body. See [`../base-urls.md`](../base-urls.md).

## curl recipe (Python-less fallback)

```bash
# Anonymous (lower quota):
curl -fsSL -X POST "https://api.exa.ai/search" \
  -H "Content-Type: application/json" \
  -d '{"query": "kubernetes 1.31 release notes", "numResults": 10}'

# With key:
curl -fsSL -X POST "https://api.exa.ai/search" \
  -H "Content-Type: application/json" \
  -H "x-api-key: ${EXA_API_KEY}" \
  -d '{"query": "kubernetes 1.31 release notes", "numResults": 10}' \
  | jq '.results[] | {title, url, score}'
```

## Quirks

- **`text` field doubles as the snippet.** It is sometimes long-form summaries — useful for downstream LLMs but heavier than typical search snippets.
- **Anonymous calls return `402 Payment Required`** as of 2026. The skill now treats Exa like any other paid provider.
- The optional `autopromptString` in the response is Exa's interpreted query — useful for debugging unexpected results.

## Pricing

See the latest at [exa.ai/pricing](https://exa.ai/pricing). Pay-as-you-go with no anonymous tier.

## See also

- [Pipelines (rg / jq recipes)](../pipelines.md)
- [Result schema](../result-schema.md)
- [baseUrl override](../base-urls.md)
