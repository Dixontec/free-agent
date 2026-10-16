# Result Schema

The skill normalizes every provider's response into a single canonical schema, so downstream consumers (LLMs, scripts, dashboards) only need to learn one shape.

## Output files per run

Every invocation creates a directory `<TMP_ROOT>/<run-id>/` with this layout:

```
<TMP_ROOT>/<run-id>/
├── combined.json              # Top-level manifest. The entry point for pipelines.
├── <provider>.json            # Per-provider normalized results.
└── <provider>-raw.json        # Per-provider raw upstream response.
```

`<run-id>` is a UTC timestamp `YYYYMMDDTHHMMSSZ`, with a `-N` suffix if the same second is reused.

`<TMP_ROOT>` defaults to:
- `/tmp/web-search` on macOS and Linux
- `<tempfile.gettempdir()>/web-search` on Windows (`C:\Users\<user>\AppData\Local\Temp\web-search`)
- `$WEBSEARCH_TMP_DIR` if the env var is set
- `--tmp-dir` if the CLI flag is passed

## `combined.json`

```json
{
  "query": "kubernetes 1.31 release notes",
  "ranAt": "2026-05-01T07:37:45+00:00",
  "execMode": "single",
  "chain": null,
  "providers": ["tavily", "brave"],
  "manifests": [
    /* one entry per successful provider */
  ],
  "errors": [
    /* one entry per failed provider */
  ],
  "runDir": "/tmp/web-search/20260501T073745Z"
}
```

| Field | Type | Notes |
|---|---|---|
| `query` | string | The query as passed on the CLI. |
| `ranAt` | ISO 8601 string | UTC timestamp of when the run started. |
| `execMode` | `"single"` \| `"parallel"` \| `"fallback"` | Execution mode the skill picked based on flags + config. |
| `chain` | string[] \| null | The full fallback chain (in order). Only populated when `execMode == "fallback"`. |
| `providers` | string[] | Names of providers that returned successfully. |
| `manifests` | object[] | Per-provider manifest objects (see below). |
| `errors` | object[] | Per-provider error objects (see below). In fallback mode, these are the providers that fell through. |
| `runDir` | string | Absolute path to the run directory. |

## `<provider>.json` / per-manifest entry

```json
{
  "provider": "tavily",
  "query": "kubernetes 1.31 release notes",
  "endpoint": "https://api.tavily.com/search",
  "method": "POST",
  "status": 200,
  "startedAt": "2026-05-01T07:37:45+00:00",
  "durationMs": 412,
  "maxResults": 10,
  "truncated": false,
  "results": [
    /* see canonical result item below */
  ],
  "files": {
    "raw": "/tmp/web-search/20260501T073745Z/tavily-raw.json",
    "normalized": "/tmp/web-search/20260501T073745Z/tavily.json"
  }
}
```

| Field | Type | Notes |
|---|---|---|
| `provider` | string | Identifier from the supported list. |
| `query` | string | Echoes the user query. |
| `endpoint` | string | Full URL the skill called (reflects any `baseUrl` override). |
| `method` | `"GET"` \| `"POST"` | HTTP method actually used. |
| `status` | integer | HTTP status code returned. |
| `startedAt` | ISO 8601 string | UTC start time. |
| `durationMs` | integer | Elapsed time. |
| `maxResults` | integer | Cap that was applied. |
| `truncated` | boolean | `true` if the upstream returned more results than `maxResults`. |
| `results` | object[] | List of canonical result items. |
| `files.raw` | string | Path to the raw upstream JSON. |
| `files.normalized` | string | Path to the manifest itself (this same file). |

## Canonical result item

```json
{
  "title": "Kubernetes 1.31 Release Notes",
  "url": "https://kubernetes.io/blog/2024/08/13/kubernetes-v1-31-release/",
  "snippet": "Kubernetes 1.31 introduces stable AppArmor support...",
  "score": 0.92,
  "source": "kubernetes.io",
  "publishedAt": "2024-08-13"
}
```

| Field | Required? | Type | Notes |
|---|---|---|---|
| `title` | required | string | Page title. Items missing a title are dropped during normalization. |
| `url` | required | string | Page URL. Items missing a URL are dropped. |
| `snippet` | optional | string | Short excerpt or summary. May be absent for some providers (e.g. Anthropic raw results before citation matching). |
| `score` | optional | number | 0–1 relevance score where the provider supplies one (Exa, Tavily). Missing for most others. |
| `source` | optional | string | Provider-tagged source (MWMBL `source`, z.ai `media`, Perplexity Sonar). |
| `publishedAt` | optional | string | Publish or last-update date. Format varies by provider — ISO date for Perplexity/Tavily, human-readable for Brave/Anthropic. |

The normalizer adds optional fields only when the upstream provided them. Empty strings are stripped (no `"snippet": ""`). This keeps the JSON dense and makes filters like `select(.publishedAt)` reliable.

## Per-provider field mapping

| Upstream field | Maps to canonical | Provider |
|---|---|---|
| `Heading` / `Text` (DDG) | `title` | duckduckgo |
| `AbstractText` / `Text` | `snippet` | duckduckgo |
| `AbstractURL` / `FirstURL` | `url` | duckduckgo |
| `title[].value` joined | `title` | mwmbl |
| `extract[].value` joined | `snippet` | mwmbl |
| `text` / `snippet` | `snippet` | exa |
| `score` | `score` | exa, tavily |
| `content` | `snippet` | tavily, z-ai |
| `description` | `snippet` | brave |
| `link` | `url` | serper, z-ai, google-cse |
| `snippet` | `snippet` | serper, perplexity, google-cse |
| `media` | `source` | z-ai |
| `date` / `last_updated` | `publishedAt` | perplexity |
| `published_date` | `publishedAt` | tavily |
| `page_age` | `publishedAt` | brave, anthropic |
| `annotations[].cited_text` | `snippet` | xai, openai, anthropic |

## `errors[]` entry

```json
{
  "provider": "brave",
  "error": "[brave] HTTP 429",
  "status": 429
}
```

| Field | Type | Notes |
|---|---|---|
| `provider` | string | Which provider failed. |
| `error` | string | Human-readable error including provider tag. |
| `status` | integer \| null | Upstream HTTP status if the request reached the server. `null` for transport failures. |

When `status` is set, the raw upstream response is still saved at `<provider>-raw.json` for inspection.

## Stable contract

These rules will hold across point releases:

1. `title` and `url` are always present on every result item. Filters can rely on them.
2. Optional fields are absent (not `null`, not `""`) when missing.
3. `publishedAt` is a string when present — never an integer or object.
4. `combined.json` always exists at the run-dir root after a successful or partial run.

Breaking changes will only happen on major version bumps and will be called out in the README.

## Stdout contract

Default mode prints a human-readable preview followed by a machine-readable footer:

```
=== tavily (10 results, 412ms) ===
  [1] Kubernetes 1.31 Release Notes
      https://kubernetes.io/blog/...
      Kubernetes 1.31 introduces stable AppArmor support...

--- WEBSEARCH ---
RESULT_FILE: /tmp/web-search/20260501T073745Z/combined.json
RUN_DIR:     /tmp/web-search/20260501T073745Z
PROVIDERS:   tavily
TOTAL_RESULTS: 10
ERRORED:     (only present if errors occurred)
```

| Mode | Output |
|---|---|
| (default) | Preview + footer |
| `--no-preview` | Footer only |
| `--print-path-only` | Just the absolute path to `combined.json` (single line) |
| `--json` | Pretty-printed `combined.json` to stdout |
| `--raw` | Each provider's raw upstream JSON, separated by headers |

The footer's `RESULT_FILE: <path>` line is the contract that downstream agents and scripts can rely on. Grep for `^RESULT_FILE:` to find it.
