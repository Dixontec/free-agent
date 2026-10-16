# mwmbl

[MWMBL](https://mwmbl.org) — community-crawled open-source independent search index. **Free, no API key.** Returns actual ranked web links (unlike `duckduckgo`'s Instant Answers).

## At a glance

| | |
|---|---|
| Provider ID | `mwmbl` |
| Default endpoint | `https://api.mwmbl.org/api/v1/search/` |
| Method | `GET` |
| Auth | none |
| Model | n/a |
| Server max results | ~20 |
| Free tier | always free |
| Pricing | $0 (be polite — small volunteer-run index) |

## When to use

| Use | Avoid |
|---|---|
| Free fallback for actual web links | High-volume bulk search (the index is small) |
| Diversity in `--all` fan-out | Time-sensitive queries (crawl lag) |
| Privacy-leaning queries | Niche professional content (gaps in coverage) |
| When DuckDuckGo Instant Answer returned nothing | When you need 50+ results |

## Setup

None. The skill calls the public API anonymously.

## Request

```
GET https://api.mwmbl.org/api/v1/search/?s=<query>
```

Headers: `Accept: application/json`, `User-Agent: web-search-skill/<version>`.

## Response

The endpoint returns a top-level JSON array (the skill wraps it as `{"_array": [...]}` for uniform downstream handling).

```json
[
  {
    "url": "https://en.wikipedia.org/wiki/Test",
    "title": [
      {"value": "Test", "is_bold": true},
      {"value": " - Wikipedia", "is_bold": false}
    ],
    "extract": [
      {"value": "Look up ", "is_bold": false},
      {"value": "test", "is_bold": true},
      {"value": " in Wiktionary, the free dictionary.", "is_bold": false}
    ],
    "source": "wikipedia"
  }
]
```

### Field mapping (canonical schema)

| Upstream field | Canonical field | Notes |
|---|---|---|
| concatenation of `title[].value` | `title` | Dropped if empty |
| `url` | `url` | Required |
| concatenation of `extract[].value` | `snippet` | Bold segments preserved as plain text |
| `source` | `source` | E.g. `mwmbl`, `wikipedia`, `youtube` |
| n/a | `score` | not provided |
| n/a | `publishedAt` | not provided |

## Domain filtering

MWMBL has no structured domain filter. The skill appends `site:` and `-site:` operators to the query, which the upstream sometimes honors (best-effort).

```bash
python3 scripts/web-search --provider mwmbl --include rust-lang.org "async runtime"
```

## baseUrl override

```json
{"providers": {"mwmbl": {"baseUrl": "https://mwmbl-self-hosted.internal/api/v1/search/"}}}
```

If you self-host MWMBL the override points there directly. See [`../base-urls.md`](../base-urls.md).

## curl recipe (Python-less fallback)

```bash
curl -fsSL --get \
  --data-urlencode "s=rust programming" \
  "https://api.mwmbl.org/api/v1/search/" \
  | jq '.[] | {title: ([.title[].value] | join("")), url, snippet: ([.extract[].value] | join("")), source}'
```

## Quirks

- **Bold segment encoding**: `title` and `extract` are arrays of `{value, is_bold}` segments. The skill concatenates `value` fields verbatim. If you want HTML-style highlighting you can post-process the raw JSON.
- **Coverage is uneven**. Best for popular sites and high-traffic content. For obscure technical queries the index may have nothing — pair with another provider.
- **Be gentle on rate**. The project is volunteer-run with no documented rate limits. Cache aggressively in agent harnesses.

## Pricing

Free. No quota. No credit card.

## See also

- [Pipelines (rg / jq recipes)](../pipelines.md)
- [Multi-provider strategies](../multi-provider.md) — pair with `duckduckgo` for first-pass coverage
- [Result schema](../result-schema.md)
