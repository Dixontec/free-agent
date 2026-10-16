# anthropic

Anthropic Claude web search via the Messages API + `web_search` server tool. **Model-mediated only** — there is no raw-search alternative.

## At a glance

| | |
|---|---|
| Provider ID | `anthropic` |
| Default endpoint | `https://api.anthropic.com/v1/messages` |
| Method | `POST` |
| Auth | headers `x-api-key: <key>` AND `anthropic-version: 2023-06-01` |
| Model | **required** (default `claude-sonnet-4-6` if config omits it) |
| Tool version | `web_search_20260209` (latest, with dynamic filtering) — overridable |
| Server max results | controlled via `max_uses` |
| Free tier | none |
| Pricing | **$10 per 1,000 searches** + standard model token costs |

## Important: no raw search alternative

Anthropic **does not offer** any raw search endpoint or `/v1/search` route. The Messages API + `web_search` tool is the only path. Confirmed against:

- The complete `/v1/*` endpoint list at [docs.anthropic.com/en/api/overview](https://docs.anthropic.com/en/api/overview)
- The official TypeScript and Python SDKs (no `search()` method on the client)
- The 2025 "Web Search API" announcement (which described the tool addition, not a new endpoint)

If you need model-less search, use `tavily`, `brave`, `serper`, or `perplexity` instead.

## When to use

| Use | Avoid |
|---|---|
| You want Claude's reasoning + synthesis on top of search | Cost-sensitive bulk search |
| Dynamic filtering (Claude writes code to filter results before they hit context) | Pure raw-link results |
| Multi-turn conversations preserving citations across turns | Predictable per-call cost |

## Setup

1. Get an API key from [console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys) (`sk-ant-…`).
2. Make sure your account has access to a model that supports the `web_search` tool (Claude Opus 4.x, Sonnet 4.x, Haiku 4.x).
3. Config:
   ```json
   {
     "providers": {
       "anthropic": {
         "apiKey": "sk-ant-...",
         "model": "claude-sonnet-4-6",
         "maxUses": 5
       }
     }
   }
   ```
4. Env: `ANTHROPIC_API_KEY`.

Optional config fields:
- `model` (default `claude-sonnet-4-6`) — see supported list below
- `toolVersion` (default `web_search_20260209`) — pin to `web_search_20250305` for ZDR
- `maxUses` (default `5`) — cap how many search calls Claude can make per request
- `maxTokens` (default `2048`) — `max_tokens` in the request body
- `userLocation` — `{country, region, city, timezone}`

### Tool versions

| Version | Status | Features |
|---|---|---|
| `web_search_20260209` | GA, **default** | Dynamic filtering (Claude writes code to filter results before context); ~24% fewer tokens, ~11% accuracy gain |
| `web_search_20250305` | GA | Basic web search, ZDR-eligible |

### Supported models

| Model | `_20250305` | `_20260209` |
|---|---|---|
| `claude-fable-5` | ✅ | ✅ |
| `claude-opus-4-8` / `4-7` / `4-6` | ✅ | ✅ |
| `claude-sonnet-4-6` (default) | ✅ | ✅ |
| `claude-opus-4-5` / `4-1` / `4-0` | ✅ | ❌ |
| `claude-sonnet-4-5` / `4-0` | ✅ | ❌ |
| `claude-haiku-4-5` | ✅ | ❌ |

Older Claude 3.x models support only `web_search_20250305`.

## Request

```http
POST https://api.anthropic.com/v1/messages
x-api-key: <key>
anthropic-version: 2023-06-01
Content-Type: application/json

{
  "model": "claude-sonnet-4-6",
  "max_tokens": 2048,
  "messages": [{"role": "user", "content": "<query>"}],
  "tools": [{
    "type": "web_search_20260209",
    "name": "web_search",
    "max_uses": 5,
    "allowed_domains": ["bloomberg.com", "sec.gov"],   ; OR `blocked_domains` (mutex)
    "user_location": {
      "type": "approximate",
      "country": "US",
      "region": "California",
      "city": "San Francisco",
      "timezone": "America/Los_Angeles"
    }
  }]
}
```

## Response

```json
{
  "id": "msg_...",
  "content": [
    {"type": "text", "text": "I'll search for..."},
    {
      "type": "server_tool_use",
      "id": "srvtoolu_...",
      "name": "web_search",
      "input": {"query": "..."}
    },
    {
      "type": "web_search_tool_result",
      "tool_use_id": "srvtoolu_...",
      "content": [{
        "type": "web_search_result",
        "url": "https://...",
        "title": "...",
        "encrypted_content": "...",
        "page_age": "April 30, 2025"
      }]
    },
    {
      "type": "text",
      "text": "Final answer with cited sources.",
      "citations": [{
        "type": "web_search_result_location",
        "url": "https://...",
        "title": "...",
        "encrypted_index": "...",
        "cited_text": "Up to 150 chars of cited content."
      }]
    }
  ],
  "usage": {"server_tool_use": {"web_search_requests": 1}}
}
```

### Field mapping (canonical schema)

The skill walks `content[]` collecting:
1. **Raw results** from `web_search_tool_result.content[]` blocks → `url`, `title`, `page_age`
2. **Citations** from `text.citations[]` → enriches matching URLs with `cited_text` (up to 150 chars)

| Upstream | Canonical | Notes |
|---|---|---|
| `web_search_result.title` | `title` | required |
| `web_search_result.url` | `url` | required |
| `citations[].cited_text` for matching URL, fallback to text block | `snippet` | citation excerpts, not full page |
| `web_search_result.page_age` | `publishedAt` | human-readable string ("April 30, 2025") |
| n/a | `score` | not provided |

## Domain filtering

Native structured fields — `allowed_domains` and `blocked_domains`. Mutually exclusive.

Wildcard support:
- No scheme: `example.com`, NOT `https://example.com`
- Subdomains auto-included: `example.com` covers `docs.example.com`
- Specific subdomain restricts: `docs.example.com`
- Subpaths: `example.com/blog`
- One `*` wildcard allowed in path: `example.com/*`

```bash
python3 scripts/web-search --provider anthropic --include docs.anthropic.com "..."
```

## baseUrl override

```json
{"providers": {"anthropic": {
  "apiKey": "sk-ant-...",
  "model": "claude-sonnet-4-6",
  "baseUrl": "https://anthropic-gw.bedrock.us-east-1.amazonaws.com/v1/messages"
}}}
```

Common patterns:
- AWS Bedrock-hosted Anthropic: `https://anthropic-gw.bedrock.<region>.amazonaws.com/v1/messages`
- Azure-hosted: `https://anthropic-gw.azure.example.com/v1/messages`
- Vertex AI proxy: `https://anthropic-vertex.example.com/v1/messages`
- Corporate LLM gateway: `https://llm-gw.internal/anthropic/v1/messages`

The override must accept the standard Messages API body shape. See [`../base-urls.md`](../base-urls.md).

## curl recipe (Python-less fallback)

```bash
curl -fsSL -X POST "https://api.anthropic.com/v1/messages" \
  -H "x-api-key: ${ANTHROPIC_API_KEY}" \
  -H "anthropic-version: 2023-06-01" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-sonnet-4-6",
    "max_tokens": 2048,
    "messages": [{"role": "user", "content": "Latest research on transformer interpretability"}],
    "tools": [{
      "type": "web_search_20260209",
      "name": "web_search",
      "max_uses": 3
    }]
  }' \
  | jq '.content[] | select(.type=="web_search_tool_result") | .content[] | {title, url, page_age}'
```

## Quirks

- **Snippets are tricky.** `web_search_result.encrypted_content` is opaque — the readable text only appears in `text.citations[].cited_text` (max 150 chars per citation). The skill matches citations to results by URL.
- **`page_age` is a human-readable string** (`"April 30, 2025"`) — not an ISO date. The skill copies it verbatim to `publishedAt`. Parse downstream if you need a real date.
- **Server tool_use IDs** use `srvtoolu_` prefix (vs client-side `toolu_`).
- **`pause_turn` stop reason** can occur for complex multi-search queries — you must send a continuation request. The skill does NOT handle this automatically (it surfaces the error).
- **Multi-turn citations**: pass back `encrypted_content` and `encrypted_index` from previous results to maintain citations across turns. The skill is single-turn so this does not apply.
- **No score field.** Anthropic does not provide relevance scores.
- **Dynamic filtering** (`web_search_20260209`) requires the code execution tool internally — it is not ZDR-eligible by default. Pin `toolVersion: web_search_20250305` if you need ZDR.

## Pricing

**$10 per 1,000 searches** plus standard model token costs. Search results count as input tokens in current and subsequent turns.

Cost-control tips:
- Set `maxUses: 3` (or lower) to cap agentic loops
- Use `claude-haiku-4-5` for cheaper synthesis (no `_20260209` support)
- Pin `toolVersion: web_search_20250305` if dynamic filtering's ~24% token reduction does not justify ZDR loss

See [docs.anthropic.com/en/docs/about-claude/pricing](https://docs.anthropic.com/en/docs/about-claude/pricing).

## See also

- [Pipelines](../pipelines.md), [Multi-provider](../multi-provider.md), [Result schema](../result-schema.md), [baseUrl](../base-urls.md)
- For raw-search alternatives: [perplexity.md](perplexity.md), [tavily.md](tavily.md), [brave.md](brave.md), [serper.md](serper.md)
