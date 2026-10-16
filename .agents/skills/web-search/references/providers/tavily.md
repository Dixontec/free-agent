# tavily

[Tavily](https://tavily.com) — search API designed specifically for LLM agents. Returns clean, pre-extracted snippets ideal for downstream model consumption.

## At a glance

| | |
|---|---|
| Provider ID | `tavily` |
| Default endpoint | `https://api.tavily.com/search` |
| Method | `POST` |
| Auth | header `Authorization: Bearer <key>` |
| Model | n/a |
| Server max results | 20 |
| Free tier | 1,000 searches/month |
| Pricing | tiered — see [tavily.com/pricing](https://tavily.com/pricing) |

## When to use

| Use | Avoid |
|---|---|
| LLM agent default — clean snippets | Bulk scraping (per-call cost adds up) |
| Mixed factual + recent queries | Strict ranking-equivalent-to-Google needs (use Serper) |
| When you want a sane single provider | Chinese-language queries (use z-ai) |

## Setup

1. Sign up at [app.tavily.com/sign-in](https://app.tavily.com/sign-in).
2. The dashboard generates a default API key (`tvly-…`). Create more on the *API Keys* page.
3. Config:
   ```json
   {"providers": {"tavily": {"apiKey": "tvly-..."}}}
   ```
   Or env: `TAVILY_API_KEY`.

## Request

```http
POST https://api.tavily.com/search
Authorization: Bearer <key>
Content-Type: application/json

{
  "query": "<query>",
  "max_results": 10,
  "include_domains": [...],     ; optional
  "exclude_domains": [...]       ; optional
}
```

The skill clamps `max_results` to 20.

## Response

```json
{
  "query": "...",
  "results": [
    {
      "title": "...",
      "url": "https://...",
      "content": "Pre-extracted snippet, cleaned for LLM consumption.",
      "score": 0.92,
      "published_date": "2025-09-12"
    }
  ],
  "response_time": 0.83
}
```

### Field mapping (canonical schema)

| Upstream | Canonical | Notes |
|---|---|---|
| `title` | `title` | required |
| `url` | `url` | required |
| `content` | `snippet` | already cleaned |
| `score` | `score` | 0–1 |
| `published_date` | `publishedAt` | ISO date when present |

## Domain filtering

Native structured fields (`include_domains`, `exclude_domains`).

```bash
python3 scripts/web-search --provider tavily --include docs.python.org "asyncio"
```

## baseUrl override

```json
{"providers": {"tavily": {"apiKey": "tvly-...", "baseUrl": "https://eu.api.tavily.com/search"}}}
```

Useful for regional mirrors and corporate gateways. See [`../base-urls.md`](../base-urls.md).

## curl recipe (Python-less fallback)

```bash
curl -fsSL -X POST "https://api.tavily.com/search" \
  -H "Authorization: Bearer ${TAVILY_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"query": "rust async runtime comparison", "max_results": 10}' \
  | jq '.results[] | {title, url, content}'
```

## Quirks

- The `content` field is **already cleaned** (no HTML tags, no boilerplate). Tavily extracts page content per result and trims to a reasonable length.
- The free tier's 1k/month resets monthly — keep an eye on it for high-volume agents.

## Pricing

Tiered — see [tavily.com/pricing](https://tavily.com/pricing). Free tier covers most light usage.

## See also

- [Pipelines](../pipelines.md), [Multi-provider](../multi-provider.md), [Result schema](../result-schema.md)
