# openai

OpenAI hosted web search via the Responses API + `web_search` tool. **Model-mediated only** — there is no raw-search alternative.

## At a glance

| | |
|---|---|
| Provider ID | `openai` |
| Default endpoint | `https://api.openai.com/v1/responses` |
| Method | `POST` |
| Auth | header `Authorization: Bearer <key>` |
| Model | **required** (default `gpt-5.4-mini` if config omits it) |
| Server max results | model decides — cap with `max_tool_calls` |
| Free tier | none |
| Pricing | $10 / 1,000 `web_search` tool calls + standard model token costs |

## Important: no raw search alternative

OpenAI **does not offer** any raw search endpoint. The legacy `/v1/search` was deprecated in 2022. SearchGPT remained a consumer prototype. ChatGPT Search is a consumer feature. Confirmed against current platform docs and the official Python/Node SDKs.

The Responses API + `web_search` tool is the only path. The deprecated `gpt-4o-search-preview` and `gpt-4o-mini-search-preview` Chat Completions models shut down 2026-07-23.

If you need model-less search, use `tavily`, `brave`, `serper`, or `perplexity` instead.

## When to use

| Use | Avoid |
|---|---|
| You want GPT's synthesis + reasoning on top of search | Cost-sensitive bulk search |
| Domain-restricted research (up to 100 domains) | Predictable per-call cost |
| `external_web_access: false` cached/snapshot mode | Pure raw-link results |

## Setup

1. Get an API key from [platform.openai.com/api-keys](https://platform.openai.com/api-keys).
2. Make sure your project has access to a model that supports the `web_search` tool — any GPT-5.x except `nano`, GPT-4.1, GPT-4o, o3, o4-mini.
3. Config:
   ```json
   {
     "providers": {
       "openai": {
         "apiKey": "sk-proj-...",
         "model": "gpt-5.4-mini",
         "searchContextSize": "medium",
         "mode": "live"
       }
     }
   }
   ```
4. Env: `OPENAI_API_KEY`.

Optional config fields:
- `model` (default `gpt-5.4-mini`) — see supported list above. Use `gpt-5.5` or `gpt-5.5-pro` for higher synthesis quality at higher cost.
- `searchContextSize` — `low` / `medium` / `high`
- `mode` — `live` (default) or `cached` (sets `external_web_access: false`)
- `userLocation` — `{country, region, city, timezone}`
- `maxToolCalls` — integer, caps total tool invocations per request

## Request

```http
POST https://api.openai.com/v1/responses
Authorization: Bearer <key>
Content-Type: application/json

{
  "model": "gpt-5.4-mini",
  "input": "<query>",
  "tools": [{
    "type": "web_search",
    "external_web_access": true,
    "search_context_size": "medium",
    "filters": {
      "allowed_domains": ["docs.python.org", "..."]   ; up to 100
      ; OR
      "blocked_domains": ["spam.com"]                  ; up to 100
    },
    "user_location": {
      "type": "approximate",
      "country": "US",
      "region": "California",
      "city": "San Francisco",
      "timezone": "America/Los_Angeles"
    }
  }],
  "tool_choice": "required",
  "max_tool_calls": 5
}
```

## Response

```json
{
  "output": [
    {
      "type": "web_search_call",
      "id": "ws_...",
      "status": "completed",
      "action": {
        "type": "search",
        "queries": ["..."],
        "sources": [{"type": "url", "url": "https://..."}]
      }
    },
    {
      "type": "message",
      "role": "assistant",
      "content": [{
        "type": "output_text",
        "text": "Synthesized answer.",
        "annotations": [
          {
            "type": "url_citation",
            "url": "https://...",
            "title": "...",
            "start_index": 2606,
            "end_index": 2758
          }
        ]
      }]
    }
  ],
  "usage": {"total_tokens": 1370}
}
```

### Field mapping (canonical schema)

Same logic as `xai.md` — walks `output[]` for annotations first, falls back to `web_search_call.action.sources[]`, then top-level `citations[]`.

| Upstream | Canonical | Notes |
|---|---|---|
| `annotations[].title` | `title` | required |
| `annotations[].url` | `url` | required |
| `annotations[].cited_text` / message text | `snippet` | |
| n/a | `score` | not provided |
| n/a | `publishedAt` | not provided |

## Domain filtering

Native structured field — `allowed_domains` and `blocked_domains`, up to **100** entries each. Mutually exclusive.

```bash
python3 scripts/web-search --provider openai --include docs.openai.com,platform.openai.com "..."
```

## baseUrl override

```json
{"providers": {"openai": {
  "apiKey": "sk-...",
  "model": "gpt-5.4-mini",
  "baseUrl": "https://my-azure.openai.azure.com/openai/v1/responses?api-version=2026-04-01"
}}}
```

Common patterns:
- Azure-hosted OpenAI: `https://<endpoint>.openai.azure.com/openai/v1/responses?api-version=...`
- Corporate gateway: `https://llm-gw.internal/openai/v1/responses`
- Local mock for tests: `http://localhost:8787/openai/v1/responses`

The skill preserves any pre-existing query parameters on the override URL. See [`../base-urls.md`](../base-urls.md).

## curl recipe (Python-less fallback)

```bash
curl -fsSL -X POST "https://api.openai.com/v1/responses" \
  -H "Authorization: Bearer ${OPENAI_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-5.4-mini",
    "input": "what was a positive news story from today",
    "tools": [{
      "type": "web_search",
      "search_context_size": "medium",
      "external_web_access": true
    }],
    "tool_choice": "required",
    "max_tool_calls": 3
  }' \
  | jq '.output[] | select(.type=="message") | .content[].annotations[]? | {title, url}'
```

## Quirks

- **Model is mandatory.** No raw search endpoint.
- **`gpt-4o-mini` and `gpt-4.1-mini`** are billed at a fixed 8,000 input tokens per `web_search` call regardless of actual context size.
- **`external_web_access: false`** uses cached/snapshot data instead of live web. The legacy `web_search_preview` tool ignores this flag (always live).
- **Domain filters up to 100 entries** — most generous in this catalog.
- **Set `max_tool_calls`** to cap runaway agentic search loops. Default is unlimited.
- The deprecated `gpt-4o-search-preview` and `gpt-4o-mini-search-preview` Chat Completions models shut down 2026-07-23.

## Pricing

$10 per 1,000 `web_search` tool calls plus standard model token costs. The deprecated preview models cost $25/1k calls but had free search content tokens — not relevant after the 2026-07-23 shutdown.

See [openai.com/api/pricing](https://openai.com/api/pricing) for current rates.

## See also

- [Pipelines](../pipelines.md), [Multi-provider](../multi-provider.md), [Result schema](../result-schema.md), [baseUrl](../base-urls.md)
- For raw-search alternatives: [perplexity.md](perplexity.md), [tavily.md](tavily.md), [brave.md](brave.md), [serper.md](serper.md)
