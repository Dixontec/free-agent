# z-ai

[Z.ai](https://z.ai) (Zhipu) web search endpoint. Best coverage for Chinese-language queries and Chinese-region content.

## At a glance

| | |
|---|---|
| Provider ID | `z-ai` |
| Default endpoint | `https://api.z.ai/api/paas/v4/web_search` |
| Method | `POST` |
| Auth | header `Authorization: Bearer <key>` |
| Model | n/a |
| Server max results | 50 (highest in the catalog) |
| Free tier | varies — see Z.ai dashboard |
| Pricing | usage-based — see [z.ai](https://z.ai) |

## When to use

| Use | Avoid |
|---|---|
| Chinese-language queries / Chinese sources | English-only queries (prefer Tavily, Brave, Serper) |
| Up to 50 results per call (highest cap) | When you need multi-domain filtering (only single domain supported) |
| Coverage of Chinese tech ecosystem | Strict EU/US data residency requirements |

## Setup

1. Sign up at [z.ai](https://z.ai).
2. Get an API key from the developer console.
3. Config:
   ```json
   {"providers": {"z-ai": {"apiKey": "..."}}}
   ```
   Env: `Z_AI_API_KEY` (also `ZAI_API_KEY`, `ZHIPU_API_KEY`).

## Request

```http
POST https://api.z.ai/api/paas/v4/web_search
Authorization: Bearer <key>
Content-Type: application/json

{
  "search_engine": "search-prime",
  "search_query": "<query>",
  "count": 10,
  "search_domain_filter": "example.com"   ; optional, single domain only
}
```

## Response

```json
{
  "search_result": [
    {
      "title": "...",
      "link": "https://...",
      "content": "...",
      "media": "Example",
      "publish_date": "2025-09-01"
    }
  ]
}
```

### Field mapping (canonical schema)

| Upstream | Canonical | Notes |
|---|---|---|
| `search_result[].title` | `title` | required |
| `search_result[].link` | `url` | required |
| `search_result[].content` | `snippet` | |
| `search_result[].media` | `source` | publication name |
| `search_result[].publish_date` | `publishedAt` | string when present |

## Domain filtering

**Single domain only.** Z.ai's `search_domain_filter` is a string field, not an array. The skill takes the first allowed domain and ignores the rest. Blocked domains are not supported.

```bash
python3 scripts/web-search --provider z-ai --include zhihu.com "transformer 优化"
```

## baseUrl override

```json
{"providers": {"z-ai": {"apiKey": "...", "baseUrl": "https://zai-proxy.internal/web_search"}}}
```

You can also override `searchEngine` in config to use a different upstream search engine name (default `search-prime`):

```json
{"providers": {"z-ai": {"apiKey": "...", "searchEngine": "search-pro"}}}
```

See [`../base-urls.md`](../base-urls.md).

## curl recipe (Python-less fallback)

```bash
curl -fsSL -X POST "https://api.z.ai/api/paas/v4/web_search" \
  -H "Authorization: Bearer ${Z_AI_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"search_engine": "search-prime", "search_query": "ChatGLM 开源", "count": 10}' \
  | jq '.search_result[] | {title, url: .link, snippet: .content, source: .media}'
```

## Quirks

- **Single-domain filter only**. If you pass `--include a.com,b.com`, the skill uses `a.com` and silently drops `b.com`. Use a different provider for multi-domain restriction.
- **No blocked-domain support** at the API level. Use `--exclude` only with other providers, or filter the result file post-hoc with `jq`.
- `search_engine` is hardcoded to `search-prime`. Z.ai may expose other engines (`search-pro`, etc.) — override via the `searchEngine` config field.

## Pricing

See Z.ai's developer dashboard for current tiers. Pricing is usage-based; tiers vary.

## See also

- [Pipelines](../pipelines.md), [Multi-provider](../multi-provider.md), [Result schema](../result-schema.md)
