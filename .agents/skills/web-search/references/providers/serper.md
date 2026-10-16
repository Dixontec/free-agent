# serper

[Serper](https://serper.dev) — Google's organic search results via a paid proxy. Cheap, fast, and returns the actual Google ranking.

## At a glance

| | |
|---|---|
| Provider ID | `serper` |
| Default endpoint | `https://google.serper.dev/search` |
| Method | `POST` |
| Auth | header `X-API-KEY: <key>` |
| Model | n/a |
| Server max results | 20 |
| Free tier | 2,500 starter credits |
| Pricing | low per-query rate — see [serper.dev/pricing](https://serper.dev/pricing) |

## When to use

| Use | Avoid |
|---|---|
| You specifically want Google's ranking | Privacy-sensitive queries (results trace back to Google) |
| Cheapest paid provider for raw web links | When upstream Google A/B-tests change rankings (use a separate provider too) |
| News + organic results in one call | When you need 10+ results per query (Serper caps at 20) |

## Setup

1. Sign up at [serper.dev](https://serper.dev).
2. Get the default API key from the dashboard.
3. Config:
   ```json
   {"providers": {"serper": {"apiKey": "0123456789abcdef..."}}}
   ```
   Or env: `SERPER_API_KEY`.

Free-tier credits (2,500) are usually enough for an experiment or small production workload.

## Request

```http
POST https://google.serper.dev/search
X-API-KEY: <key>
Content-Type: application/json

{
  "q": "<query>",
  "num": 10
}
```

## Response

```json
{
  "organic": [
    {
      "title": "...",
      "link": "https://...",
      "snippet": "...",
      "position": 1,
      "date": "2 days ago"
    }
  ],
  "knowledgeGraph": {...},
  "answerBox": {...},
  "peopleAlsoAsk": [...]
}
```

### Field mapping (canonical schema)

| Upstream | Canonical | Notes |
|---|---|---|
| `organic[].title` | `title` | required |
| `organic[].link` | `url` | required |
| `organic[].snippet` | `snippet` | |
| `organic[].date` | `publishedAt` | human-readable string ("2 days ago") |

The skill ignores `knowledgeGraph`, `answerBox`, and `peopleAlsoAsk` — use the raw response if you need them.

## Domain filtering

Serper does not accept structured domain filters. The skill appends `site:` / `-site:` operators to the `q` field.

```bash
python3 scripts/web-search --provider serper --exclude reddit.com,medium.com "..."
```

## baseUrl override

```json
{"providers": {"serper": {"apiKey": "...", "baseUrl": "https://serper-proxy.internal/search"}}}
```

## curl recipe (Python-less fallback)

```bash
curl -fsSL -X POST "https://google.serper.dev/search" \
  -H "X-API-KEY: ${SERPER_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"q": "elasticsearch alternatives", "num": 10}' \
  | jq '.organic[] | {title, url: .link, snippet}'
```

## Quirks

- **`date` is a human-readable string** ("2 days ago"). The skill copies it verbatim to `publishedAt`. Parse downstream if you need a real date.
- Includes Google's structured features (knowledge graph, answer box, "people also ask") in the raw response. Inspect the `<provider>-raw.json` file for these.

## Pricing

See [serper.dev/pricing](https://serper.dev/pricing). One of the cheapest paid providers in the catalog.

## See also

- [Pipelines](../pipelines.md), [Multi-provider](../multi-provider.md), [Result schema](../result-schema.md)
