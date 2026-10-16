# curl Recipes — Python-less Fallback

Every provider can be invoked directly with `curl` if Python is not available (some Windows machines, distroless containers, jailed CI runners). The recipes below are the exact shape the skill itself sends. Copy, paste, replace the placeholder, and pipe through `jq` (or `python3 -c "import json"` if you have neither `jq` nor a wrapper).

The recipes assume `bash`-style variable substitution. On PowerShell, replace `${VAR}` with `$env:VAR`. On cmd.exe, replace with `%VAR%`. The HTTP body is identical.

## Saving the response to a temp file

```bash
TMPDIR=/tmp/web-search-manual
mkdir -p "$TMPDIR"
RESULT="$TMPDIR/$(date -u +%Y%m%dT%H%M%SZ).json"
# (any curl below) ... -o "$RESULT"
jq '.' "$RESULT"
```

Or pipe directly through `jq`/`rg`:

```bash
curl ... | jq '.results[].url'
curl ... | rg -i "kubernetes"
```

---

## duckduckgo (free, no auth)

```bash
curl -fsSL --get \
  --data-urlencode "q=python programming language" \
  --data "format=json&no_html=1&skip_disambig=1&no_redirect=1" \
  "https://api.duckduckgo.com/" \
  | jq '.RelatedTopics[] | {title: .Text, url: .FirstURL}'
```

## mwmbl (free, no auth)

```bash
curl -fsSL --get \
  --data-urlencode "s=rust programming" \
  "https://api.mwmbl.org/api/v1/search/" \
  | jq '.[] | {title: ([.title[].value] | join("")), url: .url}'
```

## exa

```bash
curl -fsSL -X POST "https://api.exa.ai/search" \
  -H "Content-Type: application/json" \
  -H "x-api-key: ${EXA_API_KEY}" \
  -d '{"query": "kubernetes 1.31 release notes", "numResults": 10}' \
  | jq '.results[] | {title, url, score}'
```

> Anonymous calls are no longer accepted (return `402 Payment Required` since 2026).

## tavily

```bash
curl -fsSL -X POST "https://api.tavily.com/search" \
  -H "Authorization: Bearer ${TAVILY_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"query": "rust async runtime comparison", "max_results": 10}' \
  | jq '.results[] | {title, url, content}'
```

## brave

```bash
curl -fsSL --get \
  --data-urlencode "q=postgresql vs mysql 2026 site:stackoverflow.com" \
  --data "count=10" \
  -H "Accept: application/json" \
  -H "X-Subscription-Token: ${BRAVE_API_KEY}" \
  "https://api.search.brave.com/res/v1/web/search" \
  | jq '.web.results[] | {title, url, snippet: .description}'
```

## serper

```bash
curl -fsSL -X POST "https://google.serper.dev/search" \
  -H "X-API-KEY: ${SERPER_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"q": "elasticsearch alternatives", "num": 10}' \
  | jq '.organic[] | {title, url: .link, snippet}'
```

## google-cse

```bash
curl -fsSL --get \
  --data-urlencode "q=jq tutorial" \
  --data "key=${GOOGLE_CSE_API_KEY}&cx=${GOOGLE_CSE_ID}&num=10" \
  "https://customsearch.googleapis.com/customsearch/v1" \
  | jq '.items[] | {title, url: .link, snippet}'
```

> Max 10 results per call. Hard limit on the free tier of 100 queries/day.

## z-ai

```bash
curl -fsSL -X POST "https://api.z.ai/api/paas/v4/web_search" \
  -H "Authorization: Bearer ${Z_AI_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"search_engine": "search-prime", "search_query": "ChatGLM open source", "count": 10}' \
  | jq '.search_result[] | {title, url: .link, snippet: .content}'
```

## perplexity — pure search (no model)

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

## perplexity — sonar (chat completions)

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

## xai (Grok web_search tool)

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

To suppress inline citation markers in the answer prose, add `"include": ["no_inline_citations"]` to the body.

## openai (Responses API + web_search tool)

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

## anthropic (Messages API + web_search tool)

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

---

## Multi-provider parallel without the wrapper

If you have `bash` but not Python, run providers concurrently with `&`:

```bash
QUERY="elasticsearch alternatives"
TMPDIR=/tmp/web-search-manual/$(date -u +%Y%m%dT%H%M%SZ)
mkdir -p "$TMPDIR"

(curl -fsSL -X POST https://api.tavily.com/search \
  -H "Authorization: Bearer $TAVILY_API_KEY" -H "Content-Type: application/json" \
  -d "{\"query\":\"$QUERY\",\"max_results\":10}" \
  | jq '{provider:"tavily", results:[.results[] | {title,url,snippet:.content}]}' \
  > "$TMPDIR/tavily.json") &

(curl -fsSL --get --data-urlencode "q=$QUERY" --data "count=10" \
  -H "X-Subscription-Token: $BRAVE_API_KEY" \
  https://api.search.brave.com/res/v1/web/search \
  | jq '{provider:"brave", results:[.web.results[] | {title,url,snippet:.description}]}' \
  > "$TMPDIR/brave.json") &

(curl -fsSL --get --data-urlencode "q=$QUERY" --data "format=json&no_html=1" \
  https://api.duckduckgo.com/ \
  | jq '{provider:"duckduckgo", results:[.RelatedTopics[]? | {title:.Text, url:.FirstURL, snippet:.Text}]}' \
  > "$TMPDIR/duckduckgo.json") &

wait

# Combine all into one ranked, deduped list:
jq -s '
  {query: "'"$QUERY"'", manifests: ., results: [.[].results[]] | unique_by(.url)}
' "$TMPDIR"/*.json > "$TMPDIR/combined.json"

echo "Done: $TMPDIR/combined.json"
jq '.results[] | .url' "$TMPDIR/combined.json"
```

This is exactly what the Python wrapper does internally. Use whichever path is more convenient for your environment.

---

## When neither `curl` nor `python3` is available

This should be vanishingly rare on modern Unix systems and Windows 10+, but if you're stuck:

| Substitute | Tool | Notes |
|---|---|---|
| `wget --post-data` | wget | available everywhere; equivalent to `curl -X POST -d` |
| PowerShell `Invoke-RestMethod` | Windows | `Invoke-RestMethod -Method Post -Uri "..." -Headers @{...} -Body $json` |
| Node.js `node -e "fetch(...)"` | Node 18+ | global `fetch` API |
| `Hurl` | hurl | text-file based HTTP runner; great for repeatable checks |

The HTTP semantics are identical to the curl recipes above.
