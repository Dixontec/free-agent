# xai

xAI Grok web search via the Responses API + `web_search` tool. **Model-mediated only** — Grok decides when, how, and how often to search. There is no raw-search alternative.

## At a glance

| | |
|---|---|
| Provider ID | `xai` |
| Default endpoint | `https://api.x.ai/v1/responses` |
| Method | `POST` |
| Auth | header `Authorization: Bearer <key>` |
| Model | **required** (default `grok-4.3` if config omits it) |
| Server max results | model decides |
| Free tier | none |
| Pricing | $5 / 1,000 `web_search` tool calls + standard model token costs |

## Important: no raw search alternative

The deprecated `search_parameters` field on `/v1/chat/completions` (Live Search) **returns HTTP 410 Gone** as of Jan 2026. The Responses API + `web_search` tool is the only supported path. Confirmed via xAI docs and SDK source.

If you need model-less search, use `tavily`, `brave`, `serper`, or `perplexity` instead.

## When to use

| Use | Avoid |
|---|---|
| You want Grok's reasoning + synthesis on top of search | Cost-sensitive bulk search |
| You need X/Twitter posts as a source (pair `web_search` + `x_search` tools) | Pure raw-link results |
| You want xAI-specific knowledge cutoff handling | Predictable per-call cost |

## Setup

1. Sign up at [console.x.ai](https://console.x.ai).
2. Generate an API key (`xai-…`).
3. Add a payment method — every request is billed.
4. Config:
   ```json
   {
     "providers": {
       "xai": {
         "apiKey": "xai-...",
         "model": "grok-4.3"
       }
     }
   }
   ```
5. Env: `XAI_API_KEY`.

`model` is optional in config — the skill defaults to `grok-4.3`. Set it explicitly if you want a specific Grok variant (e.g. `grok-4.20-reasoning` for agentic search).

## Request

```http
POST https://api.x.ai/v1/responses
Authorization: Bearer <key>
Content-Type: application/json

{
  "model": "grok-4.3",
  "input": "<query>",
  "tools": [{
    "type": "web_search",
    "filters": {
      "allowed_domains": ["docs.example.com"]   ; max 5
      ; OR
      "excluded_domains": ["spam.example.com"]   ; max 5
    }
  }],
  "tool_choice": "required"
}
```

The skill caps domain filters at 5 entries (xAI's hard limit).

## Response

OpenAI-compatible Responses API shape:

```json
{
  "output": [
    {
      "type": "web_search_call",
      "id": "ws_...",
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
        "text": "Synthesized answer with [[1]](https://...) citations.",
        "annotations": [
          {
            "type": "url_citation",
            "url": "https://...",
            "title": "...",
            "start_index": 0,
            "end_index": 30
          }
        ]
      }]
    }
  ],
  "citations": ["https://..."],
  "usage": {"input_tokens": 32, "output_tokens": 9, "total_tokens": 151}
}
```

### Field mapping (canonical schema)

The skill walks `output[]`:
1. **Annotations** in `output[].content[].annotations[]` (preferred) — gives `title`, `url`, and `cited_text`.
2. **Sources** in `output[].action.sources[]` (fallback) — gives `url` and `title`.
3. **Top-level `citations[]`** (last fallback) — bare URL list.

| Upstream | Canonical | Notes |
|---|---|---|
| `annotations[].title` / `sources[].title` | `title` | required |
| `annotations[].url` / `sources[].url` / `citations[]` | `url` | required |
| `annotations[].cited_text` / message text | `snippet` | citation excerpt or full answer text |
| n/a | `score` | not provided |
| n/a | `publishedAt` | not provided |

## Domain filtering

Native structured field. Max 5 entries each (`allowed_domains` or `excluded_domains`). Mutually exclusive.

```bash
python3 scripts/web-search --provider xai --include docs.x.ai,grokipedia.com "..."
```

## baseUrl override

```json
{"providers": {"xai": {
  "apiKey": "xai-...",
  "model": "grok-4.3",
  "baseUrl": "https://xai-proxy.internal/v1/responses"
}}}
```

The override URL must accept the standard Responses API body shape. See [`../base-urls.md`](../base-urls.md).

## curl recipe (Python-less fallback)

```bash
curl -fsSL -X POST "https://api.x.ai/v1/responses" \
  -H "Authorization: Bearer ${XAI_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "grok-4.3",
    "input": "latest news about EU AI Act",
    "tools": [{"type": "web_search"}],
    "tool_choice": "required"
  }' \
  | jq '.output[] | select(.type=="message") | .content[].annotations[]? | {title, url}'
```

To suppress inline citation markers (`[[1]](...)`) in the answer text:

```bash
curl ... -d '{... "include": ["no_inline_citations"], ...}'
```

## Quirks

- **Model is mandatory.** No raw search.
- **Domain filters limited to 5** entries — fewer than OpenAI (100) or Anthropic (no documented limit).
- **`web_search` and `x_search` are separate tools.** Pair them in the same `tools` array if you want both general web and X/Twitter posts:
  ```json
  "tools": [{"type": "web_search"}, {"type": "x_search"}]
  ```
- **Model decides search count.** No direct way to force exactly N searches.
- The deprecated Live Search `/v1/chat/completions` path is HTTP 410 Gone — do not use.

## Pricing

$5 per 1,000 `web_search` tool calls plus model token costs. See [docs.x.ai/docs/models](https://docs.x.ai/docs/models).

## See also

- [Pipelines](../pipelines.md), [Multi-provider](../multi-provider.md), [Result schema](../result-schema.md), [baseUrl](../base-urls.md)
- For raw-search alternatives: [perplexity.md](perplexity.md), [tavily.md](tavily.md), [brave.md](brave.md)
