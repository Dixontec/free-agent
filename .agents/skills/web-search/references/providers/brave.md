# brave

[Brave Search API](https://api-dashboard.search.brave.com) — independent web index. Privacy-focused, no Google/Bing dependency.

## At a glance

| | |
|---|---|
| Provider ID | `brave` |
| Default endpoint | `https://api.search.brave.com/res/v1/web/search` |
| Method | `GET` |
| Auth | header `X-Subscription-Token: <key>` |
| Model | n/a |
| Server max results | 20 |
| Free tier | $5/month credit (~1,000 queries) — credit card required as of Feb 2026 |
| Pricing | $5 / 1,000 queries on the standard tier |

## When to use

| Use | Avoid |
|---|---|
| Privacy-leaning queries (no Google leakage) | Truly anonymous use (CC required for free tier) |
| Independent index for triangulation | When you need >50 req/sec on the free tier (limit is 1/s) |
| Pairing with Serper for Google + non-Google coverage | Chinese-language queries |

## Setup

1. Go to [api-dashboard.search.brave.com/app/subscriptions](https://api-dashboard.search.brave.com/app/subscriptions) and create an account.
2. Subscribe to the **Free** tier ($5/month credit). **Credit card required** as of Feb 2026.
3. Create an API key from the dashboard. Token is sometimes prefixed `BSA…`.
4. Config:
   ```json
   {"providers": {"brave": {"apiKey": "BSA..."}}}
   ```
   Or env: `BRAVE_API_KEY` (also `BRAVE_SEARCH_API_KEY`).

Free-tier rate limit: 1 req/sec. Paid plans go up to 50 req/sec.

## Request

```http
GET https://api.search.brave.com/res/v1/web/search?q=<query>&count=<n>
Accept: application/json
X-Subscription-Token: <key>
```

The skill builds the query string with `parse_qsl` so any pre-existing query parameters on a `baseUrl` override are preserved.

## Response

```json
{
  "web": {
    "results": [
      {
        "title": "...",
        "url": "https://...",
        "description": "...",
        "page_age": "2025-08-01T12:00:00"
      }
    ]
  },
  "query": {...},
  "infobox": {...}
}
```

### Field mapping (canonical schema)

| Upstream | Canonical | Notes |
|---|---|---|
| `web.results[].title` | `title` | required |
| `web.results[].url` | `url` | required |
| `web.results[].description` | `snippet` | |
| `web.results[].page_age` | `publishedAt` | string when present |

## Domain filtering

Brave does not accept structured domain filter fields. The skill appends `site:` and `-site:` operators to the query.

```bash
python3 scripts/web-search --provider brave --include docs.brave.com "..."
```

## baseUrl override

```json
{"providers": {"brave": {"apiKey": "BSA...", "baseUrl": "https://search-proxy.example.internal/brave"}}}
```

The override URL must accept `q=` and `count=` query params. See [`../base-urls.md`](../base-urls.md).

## curl recipe (Python-less fallback)

```bash
curl -fsSL --get \
  --data-urlencode "q=postgresql vs mysql 2026" \
  --data "count=10" \
  -H "Accept: application/json" \
  -H "X-Subscription-Token: ${BRAVE_API_KEY}" \
  "https://api.search.brave.com/res/v1/web/search" \
  | jq '.web.results[] | {title, url, snippet: .description}'
```

## Quirks

- **Credit-card-required free tier** since Feb 2026. Truly free use is not possible without billing setup.
- Returns rich infoboxes and "discussions" sections. The skill ignores these and uses only `web.results[]`.
- `page_age` is an ISO timestamp string — usable directly in `publishedAt` filters.

## Pricing

$5 / 1,000 queries on the standard tier. Higher tiers for production volume — see [brave.com/search/api](https://brave.com/search/api).

## See also

- [Pipelines](../pipelines.md), [Multi-provider](../multi-provider.md), [Result schema](../result-schema.md)
