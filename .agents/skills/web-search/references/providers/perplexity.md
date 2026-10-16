# perplexity

[Perplexity](https://docs.perplexity.ai/) — two distinct endpoints. By default the skill uses the **pure `/search` endpoint** (no model required). If you set a `model` in config, the skill switches to **Sonar chat completions** (model required, generates an answer with built-in citations).

## At a glance

| | Pure `/search` | Sonar |
|---|---|---|
| Endpoint | `https://api.perplexity.ai/search` | `https://api.perplexity.ai/chat/completions` |
| Method | `POST` | `POST` |
| Auth | header `Authorization: Bearer <key>` | same |
| Model | **not required** | required (`sonar`, `sonar-pro`, `sonar-reasoning-pro`, `sonar-deep-research`) |
| Server max results | 20 | model-dependent |
| Pricing | **$5 / 1,000 requests** (no token cost) | per-token + per-request |
| Recency filters | yes | yes |
| Returns answer? | no — raw results only | yes — generated answer + citations |

The skill defaults to pure search because it is cheaper, faster, and LLM-neutral.

## When to use

| Use | Mode |
|---|---|
| Recency-filtered queries (`hour`/`day`/`week`/`month`/`year`) | pure or sonar |
| Cheapest paid provider with date filters | pure |
| You want a synthesized answer with citations | sonar |
| Streaming responses | sonar |
| Multi-query batched search | pure (accepts `query` as a string array, max 5) |

## Setup

1. Sign up at [perplexity.ai/account/api](https://www.perplexity.ai/account/api).
2. Generate an API key (`pplx-…`).
3. Config (pure mode):
   ```json
   {"providers": {"perplexity": {"apiKey": "pplx-..."}}}
   ```
4. Config (sonar mode):
   ```json
   {"providers": {"perplexity": {"apiKey": "pplx-...", "model": "sonar-pro"}}}
   ```
5. Env: `PERPLEXITY_API_KEY` (also `PPLX_API_KEY`).

## Request — pure `/search`

```http
POST https://api.perplexity.ai/search
Authorization: Bearer <key>
Content-Type: application/json

{
  "query": "<query>",                          ; or string[] for multi-query, max 5
  "max_results": 10,                            ; 1–20
  "max_tokens_per_page": 4096,                  ; per-result content extraction limit
  "country": "US",                              ; ISO 3166-1 alpha-2, optional
  "search_recency_filter": "week",              ; hour|day|week|month|year, optional
  "search_domain_filter": ["docs.example.com"]  ; or ["-spam.example.com"] for blocked
}
```

The skill exposes `country` and `recency` via the provider config block (not the CLI yet — extend in a fork if needed).

## Request — Sonar chat completions

```http
POST https://api.perplexity.ai/chat/completions
Authorization: Bearer <key>
Content-Type: application/json

{
  "model": "sonar-pro",
  "messages": [{"role": "user", "content": "<query>"}],
  "search_domain_filter": ["..."],
  "search_recency_filter": "week"
}
```

## Response — pure `/search`

```json
{
  "id": "uuid",
  "results": [
    {
      "title": "...",
      "url": "https://...",
      "snippet": "Pre-extracted content snippet...",
      "date": "2025-09-15",
      "last_updated": "2025-10-01"
    }
  ]
}
```

## Response — Sonar

```json
{
  "id": "...",
  "model": "sonar-pro",
  "choices": [{"message": {"role": "assistant", "content": "Generated answer..."}}],
  "citations": ["https://...", "https://..."],
  "search_results": [
    {"title": "...", "url": "...", "snippet": "...", "date": "...", "source": "web"}
  ]
}
```

The skill normalizes both shapes — pure `results[]` first, falling back to `search_results[]`, then `citations[]` URLs.

### Field mapping (canonical schema)

| Upstream | Canonical | Notes |
|---|---|---|
| `results[].title` / `search_results[].title` | `title` | required |
| `results[].url` / `search_results[].url` | `url` | required |
| `results[].snippet` / `search_results[].snippet` | `snippet` | |
| `results[].date` / `last_updated` / `search_results[].date` | `publishedAt` | first non-empty wins |
| `search_results[].source` | `source` | sonar only |

## Domain filtering

Native structured field. Blocked domains are negated with `-` prefix.

```bash
python3 scripts/web-search --provider perplexity --include docs.python.org "asyncio"
python3 scripts/web-search --provider perplexity --exclude reddit.com,medium.com "..."
```

Mix-and-match is not allowed in a single call (use one or the other).

## baseUrl override

Override the resolved endpoint (whichever mode you use). The skill picks the correct default based on `model` presence; the override fully replaces the default.

```json
{"providers": {"perplexity": {
  "apiKey": "pplx-...",
  "baseUrl": "https://eu.api.perplexity.ai/search"
}}}
```

For Sonar mode override:

```json
{"providers": {"perplexity": {
  "apiKey": "pplx-...",
  "model": "sonar-pro",
  "baseUrl": "https://my-perplexity-proxy.internal/chat/completions"
}}}
```

See [`../base-urls.md`](../base-urls.md).

## curl recipe (Python-less fallback)

### Pure `/search`

```bash
curl -fsSL -X POST "https://api.perplexity.ai/search" \
  -H "Authorization: Bearer ${PERPLEXITY_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "open source vector database 2026",
    "max_results": 10,
    "search_recency_filter": "month"
  }' \
  | jq '.results[] | {title, url, snippet, date}'
```

### Sonar

```bash
curl -fsSL -X POST "https://api.perplexity.ai/chat/completions" \
  -H "Authorization: Bearer ${PERPLEXITY_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "sonar-pro",
    "messages": [{"role": "user", "content": "Compare Pinecone vs Weaviate vs Qdrant"}]
  }' \
  | jq '{answer: .choices[0].message.content, sources: .citations}'
```

## Quirks

- **Two endpoints, one provider name.** The skill picks based on whether `model` is set in config. Switching modes per-call requires editing config (no CLI flag).
- **Recency filter cannot combine with date-range filters.** If you set both, Perplexity returns an error.
- **`country` filter** is ISO 3166-1 alpha-2 (`"US"`, `"GB"`). Two characters.
- **Pricing**: pure `/search` is $5/1k requests with no token cost. Sonar is per-token + per-request.
- **Rate limit**: 50 QPS flat on pure `/search` regardless of tier.

## Pricing

- Pure `/search`: $5 per 1,000 requests. No token charges.
- Sonar: tier-based per-token + per-request. See [docs.perplexity.ai/docs/getting-started/pricing](https://docs.perplexity.ai/docs/getting-started/pricing).

## See also

- [Pipelines](../pipelines.md), [Multi-provider](../multi-provider.md), [Result schema](../result-schema.md), [baseUrl](../base-urls.md)
