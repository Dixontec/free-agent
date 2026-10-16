# duckduckgo

DuckDuckGo Instant Answer API. **Free, no API key, official public endpoint.** Best for factual lookups ("what is X", definitions, calculations, named-entity disambiguation).

## At a glance

| | |
|---|---|
| Provider ID | `duckduckgo` |
| Default endpoint | `https://api.duckduckgo.com/` |
| Method | `GET` |
| Auth | none |
| Model | n/a |
| Server max results | ~30 (Instant Answer + RelatedTopics combined) |
| Free tier | always free |
| Pricing | $0 |

## When to use

| Use | Avoid |
|---|---|
| "What is React?" / definitions | Niche or recent technical queries (no relevant `AbstractText`) |
| Wikipedia-style topic summaries | Ranked link lists for arbitrary queries |
| Named-entity disambiguation | Real-time / news (instant answers lag) |
| Zero-config first probe before escalating to a paid provider | When you need 50+ ranked results |

## Setup

None. The skill calls the Instant Answer API anonymously.

## Request

The skill issues a `GET` to `https://api.duckduckgo.com/` with the following query parameters:

| Param | Value | Purpose |
|---|---|---|
| `q` | the query (with `site:` operators if domain filters are set) | search string |
| `format` | `json` | always JSON |
| `no_html` | `1` | strip HTML from text fields |
| `skip_disambig` | `1` | skip the "do you mean…" page |
| `no_redirect` | `1` | suppress `!bang` redirects |

Headers: `Accept: application/json`, `User-Agent: web-search-skill/<version>`.

## Response

```json
{
  "Heading": "Python (programming language)",
  "AbstractText": "Python is a high-level, general-purpose programming language...",
  "AbstractURL": "https://en.wikipedia.org/wiki/Python_(programming_language)",
  "AbstractSource": "Wikipedia",
  "Answer": "",
  "AnswerType": "",
  "Definition": "",
  "DefinitionURL": "",
  "RelatedTopics": [
    {"Text": "NumPy - NumPy is a library for...", "FirstURL": "https://duckduckgo.com/NumPy"},
    {"Topics": [/* nested category groupings */]}
  ],
  "Results": [{"FirstURL": "...", "Text": "..."}]
}
```

### Field mapping (canonical schema)

| Upstream field | Canonical field | Notes |
|---|---|---|
| `Heading` (or `RelatedTopics[].Text` first 50 chars) | `title` | Item is dropped if neither is present |
| `AbstractURL` / `RelatedTopics[].FirstURL` / `Results[].FirstURL` | `url` | Item is dropped if missing |
| `AbstractText` / `Definition` / `RelatedTopics[].Text` | `snippet` | First non-empty wins |
| n/a | `score` | DuckDuckGo does not score results |
| n/a | `publishedAt` | not provided |

The normalizer recursively walks `RelatedTopics[].Topics[]` to flatten category groupings.

## Domain filtering

DuckDuckGo Instant Answer does not accept structured domain filters. The skill appends `site:example.com` and `-site:example.com` operators to the `q` parameter, which the underlying search engine honors.

```bash
python3 scripts/web-search --provider duckduckgo --include en.wikipedia.org "python"
```

## baseUrl override

```json
{"providers": {"duckduckgo": {"baseUrl": "https://ddg-mirror.example.internal/"}}}
```

The override must accept the same query-string parameters listed above. The skill appends `q=`, `format=json`, etc. — your mirror should respect them. See [`../base-urls.md`](../base-urls.md).

## curl recipe (Python-less fallback)

```bash
curl -fsSL --get \
  --data-urlencode "q=python programming language" \
  --data "format=json&no_html=1&skip_disambig=1&no_redirect=1" \
  "https://api.duckduckgo.com/" \
  | jq '{heading: .Heading, abstract_url: .AbstractURL, related: [.RelatedTopics[]? | {title: .Text, url: .FirstURL}]}'
```

## Quirks

- **Not a ranked-links search**. DuckDuckGo "Instant Answer" returns abstracts and topic summaries, not Google-style organic results. For full link sets pair with another provider via `--providers duckduckgo,mwmbl,...`.
- For empty/unknown queries it returns a `200` with all fields blank — the skill yields an empty `results[]`, not an error.
- `RelatedTopics` can nest category groupings under a `Topics` key. The normalizer flattens these.
- No published rate limits. The project asks consumers to use a meaningful `User-Agent` and stay "reasonable."

## Pricing

Free. No quota. No credit card.

## See also

- [Pipelines (rg / jq recipes)](../pipelines.md)
- [Multi-provider strategies](../multi-provider.md) — pair with `mwmbl` for actual web links
- [Result schema](../result-schema.md)
