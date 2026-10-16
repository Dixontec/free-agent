# Base URL Overrides

Every provider supports a `baseUrl` field that fully replaces the default endpoint. Set it once in config to point at a self-hosted proxy, regional mirror, corporate gateway, or local mock — without forking the skill or rebuilding anything.

## How it works

When the skill builds a request for any provider, it resolves the endpoint in this exact order:

1. `providers.<name>.baseUrl` from config (if non-empty string)
2. `DEFAULT_ENDPOINTS[<name>]` (the upstream-official URL)

The override is **complete** — including the path. No prefix concatenation. No string formatting. Whatever you set is what gets called. This means you control:

- the scheme (`https` → `http` for local mocks)
- the hostname (regional mirror, corporate gateway, internal cluster IP)
- the port (test servers, proxies)
- the path (`/v1/search` → `/api/v1/web_search` if your proxy renamed routes)
- pre-baked query parameters (rare, but supported — `parse_qsl` preserves them)

## Where to put it

```json
{
  "providers": {
    "tavily": {
      "apiKey": "tvly-...",
      "baseUrl": "https://eu.api.tavily.com/search"
    },
    "anthropic": {
      "apiKey": "sk-ant-...",
      "baseUrl": "https://anthropic-gw.internal.example.com/v1/messages"
    }
  }
}
```

You can mix-and-match — override one provider's URL while leaving the rest at default.

## Common patterns

### 1. Self-hosted proxy or gateway

You operate a corporate proxy that injects auth, rate-limits, or audit-logs every outbound API call:

```json
{
  "providers": {
    "openai":    {"apiKey": "sk-...", "baseUrl": "https://llm-gw.example.internal/openai/v1/responses"},
    "anthropic": {"apiKey": "sk-ant-...", "baseUrl": "https://llm-gw.example.internal/anthropic/v1/messages"},
    "tavily":    {"apiKey": "tvly-...", "baseUrl": "https://search-gw.example.internal/tavily/search"}
  }
}
```

The skill sends the same request body and headers — the gateway is responsible for forwarding upstream.

### 2. Regional mirrors (latency / data residency)

When a vendor publishes a region-specific endpoint:

```json
{
  "providers": {
    "tavily": {
      "apiKey": "tvly-...",
      "baseUrl": "https://api-eu.tavily.com/search"
    }
  }
}
```

Useful for EU residency requirements, latency-sensitive workloads, or vendor-published regional failover.

### 3. Local mocks for tests

A local HTTP server returns canned JSON for fast unit tests:

```json
{
  "providers": {
    "exa":    {"baseUrl": "http://localhost:8787/exa/search"},
    "tavily": {"apiKey": "test", "baseUrl": "http://localhost:8787/tavily/search"}
  }
}
```

Spin up the mock with any tool (Python `http.server`, Node `msw`, Go `chi`, etc.) and hit it without changing the test command.

Example mock server in 20 lines of Python:

```python
import http.server, json
class H(http.server.BaseHTTPRequestHandler):
    def do_POST(self):
        self.send_response(200); self.end_headers()
        self.wfile.write(json.dumps({
            "results": [{"title": "Mock", "url": "https://example.test", "content": "mock snippet"}]
        }).encode())
http.server.HTTPServer(("127.0.0.1", 8787), H).serve_forever()
```

### 4. Anthropic / OpenAI via cloud gateways

Anthropic on Bedrock, Vertex, or Azure all expose Anthropic-compatible endpoints:

```json
{
  "providers": {
    "anthropic": {
      "apiKey": "<gateway-token>",
      "baseUrl": "https://anthropic-gw.bedrock.us-east-1.amazonaws.com/v1/messages"
    }
  }
}
```

The skill's request body is the standard Anthropic Messages API shape — gateways that speak Anthropic's wire format work transparently.

For Azure-hosted OpenAI, you typically need to switch the path format slightly:

```json
{
  "providers": {
    "openai": {
      "apiKey": "<azure-key>",
      "baseUrl": "https://my-azure.openai.azure.com/openai/v1/responses?api-version=2026-04-01"
    }
  }
}
```

(The skill preserves any pre-existing query parameters on the override URL.)

### 5. Vendor-staged variants

Many vendors publish staging or beta endpoints alongside production:

```json
{
  "providers": {
    "perplexity": {
      "apiKey": "pplx-...",
      "baseUrl": "https://staging.api.perplexity.ai/search"
    }
  }
}
```

### 6. Switching Perplexity between pure search and Sonar

Perplexity has two endpoints:

| Behavior | `model` config | Resolved endpoint |
|---|---|---|
| Pure search (default) | unset / `null` | `https://api.perplexity.ai/search` |
| Sonar (chat completions) | `"sonar-pro"` etc. | `https://api.perplexity.ai/chat/completions` |

You can override either with a custom `baseUrl`:

```json
{
  "providers": {
    "perplexity": {
      "apiKey": "pplx-...",
      "baseUrl": "https://api-proxy.example.com/perplexity/search"
    }
  }
}
```

When `model` is set, the override is interpreted as the chat-completions URL; otherwise the pure search URL.

### 7. Self-hosted SearXNG as a stand-in for any search provider

If you operate a SearXNG instance that exposes a JSON API and you want the skill to use it as a "Tavily-shaped" backend, you'd:

1. Run a small adapter that translates Tavily's request body to SearXNG's `?format=json` query and reshapes the response.
2. Point Tavily's `baseUrl` at the adapter:

```json
{
  "providers": {
    "tavily": {
      "apiKey": "ignored-by-adapter",
      "baseUrl": "https://searxng-adapter.example.internal/search"
    }
  }
}
```

The adapter does the translation; the skill remains unchanged.

## Per-provider notes

| Provider | What the override replaces | Caveats |
|---|---|---|
| `duckduckgo` | The full Instant Answer URL (default `https://api.duckduckgo.com/`) | Must accept the same query parameters |
| `mwmbl` | The search path (default `https://api.mwmbl.org/api/v1/search/`) | The `s=` parameter is appended |
| `exa` | `POST` URL | Body shape unchanged |
| `tavily` | `POST` URL | Body shape unchanged |
| `brave` | `GET` URL with `q=` and `count=` query params | Query string is appended |
| `serper` | `POST` URL | Body shape unchanged |
| `google-cse` | `GET` URL with `q=`, `key=`, `cx=`, `num=` | Query string is appended |
| `z-ai` | `POST` URL | Body shape unchanged |
| `perplexity` | Pure search OR chat completions URL (depending on `model`) | See §6 above |
| `xai` | Responses API URL | Must accept Responses API body shape |
| `openai` | Responses API URL | Must accept Responses API body shape |
| `anthropic` | Messages API URL | Must accept Messages API body shape |

## Verification

After setting an override, verify with `--list-providers`:

```bash
python3 scripts/web-search --list-providers
```

The output marks overridden providers with `(baseUrl-overridden)`:

```
[OK] tavily        https://eu.api.tavily.com/search  (baseUrl-overridden)
```

Then run a test query:

```bash
python3 scripts/web-search --provider tavily "kubernetes deployment" --json | jq '.manifests[0].endpoint'
```

The `endpoint` field in the manifest reflects the actual URL called — if the override didn't take effect, it shows the default URL.

## Failure modes

The skill does **not** validate the override URL. If you point at the wrong path:

- HTTP-level errors (404, 405, 410) surface in the manifest's `errors[]` with the upstream status code.
- Schema mismatches surface as `Failed to parse response: ...` in the same `errors[]` list.

Both cases preserve the raw response in `<provider>-raw.json` so you can inspect what came back. Use `--check` to confirm credentials are present, but the only way to validate the override URL is to run a real query.

## Reverting

Remove the `baseUrl` field from the provider's config block, or set it to `null` / empty string. The skill falls back to the upstream default for that provider on the next call.
