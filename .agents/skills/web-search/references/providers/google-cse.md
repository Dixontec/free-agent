# google-cse

Google Programmable Search Engine via the Custom Search JSON API. The official Google route — requires both an API key AND a custom search engine ID.

## At a glance

| | |
|---|---|
| Provider ID | `google-cse` |
| Default endpoint | `https://customsearch.googleapis.com/customsearch/v1` |
| Method | `GET` |
| Auth | query params `key=<api-key>` AND `cx=<search-engine-id>` |
| Model | n/a |
| Server max results | **10** (hard cap, stricter than other providers) |
| Free tier | 100 queries/day |
| Pricing | $5 / 1,000 queries beyond free tier — capped at 10k/day |

## When to use

| Use | Avoid |
|---|---|
| Need official Google with full control | Quick setup (CSE creation is multi-step) |
| Restricting search to specific domains via the CSE config | When you need >10 results per call |
| Auditable / compliance-friendly Google access | When the 100/day free quota is insufficient |

## Setup

This requires **two** values: an API key and a Programmable Search Engine ID.

1. **Create a Programmable Search Engine** at [programmablesearchengine.google.com/controlpanel/all](https://programmablesearchengine.google.com/controlpanel/all):
   - Click *Add*
   - Pick *Search the entire web* or specify domains
   - Save and copy the **Search engine ID** (`cx`) from the *Overview* tab.
2. **Get an API key**:
   - [console.cloud.google.com/apis/credentials](https://console.cloud.google.com/apis/credentials)
   - Create a project if needed
   - *+ Create Credentials* → *API Key*
   - Restrict to *Custom Search API* if possible
3. **Enable the API**: [console.cloud.google.com/apis/library/customsearch.googleapis.com](https://console.cloud.google.com/apis/library/customsearch.googleapis.com) → *Enable*
4. **Config**:
   ```json
   {
     "providers": {
       "google-cse": {
         "apiKey": "AIza...",
         "searchEngineId": "017576662512468239146:omuauf_lfve"
       }
     }
   }
   ```
   Env vars: `GOOGLE_CSE_API_KEY` (or `GOOGLE_API_KEY`) and `GOOGLE_CSE_ID` (or `GOOGLE_SEARCH_ENGINE_ID`).

## Request

```http
GET https://customsearch.googleapis.com/customsearch/v1
    ?q=<query>
    &key=<api-key>
    &cx=<search-engine-id>
    &num=10
Accept: application/json
```

The skill clamps `num` to 10 (hard server cap).

## Response

```json
{
  "items": [
    {
      "title": "...",
      "link": "https://...",
      "snippet": "...",
      "displayLink": "example.com"
    }
  ],
  "queries": {...},
  "searchInformation": {...}
}
```

### Field mapping (canonical schema)

| Upstream | Canonical | Notes |
|---|---|---|
| `items[].title` | `title` | required |
| `items[].link` | `url` | required |
| `items[].snippet` | `snippet` | |
| n/a | `score` | not provided |
| n/a | `publishedAt` | not provided |

## Domain filtering

Google CSE supports domain restriction at the engine level (configure in the PSE control panel). At call time, the skill appends `site:` / `-site:` operators to `q` for ad-hoc filtering.

```bash
python3 scripts/web-search --provider google-cse --include developers.google.com "..."
```

## baseUrl override

```json
{"providers": {"google-cse": {
  "apiKey": "AIza...",
  "searchEngineId": "...",
  "baseUrl": "https://gcse-proxy.internal/customsearch/v1"
}}}
```

The override must accept `q=`, `key=`, `cx=`, `num=` query params. See [`../base-urls.md`](../base-urls.md).

## curl recipe (Python-less fallback)

```bash
curl -fsSL --get \
  --data-urlencode "q=jq tutorial" \
  --data "key=${GOOGLE_CSE_API_KEY}&cx=${GOOGLE_CSE_ID}&num=10" \
  "https://customsearch.googleapis.com/customsearch/v1" \
  | jq '.items[] | {title, url: .link, snippet}'
```

## Quirks

- **Hard cap of 10 results per call** — this is a Google policy, not the skill's choice. Pagination via `start=11`, `start=21`, etc. is possible but not implemented in the skill.
- **API key sent as query parameter** — be careful with logging. Use a CI secret manager.
- **100 queries/day free** is the strictest free quota in this catalog. Plan around it.

## Pricing

$5 / 1,000 queries beyond the 100/day free tier. Hard daily cap of 10,000 queries by default (raise via Google Cloud quota requests).

## See also

- [Pipelines](../pipelines.md), [Multi-provider](../multi-provider.md), [Result schema](../result-schema.md)
