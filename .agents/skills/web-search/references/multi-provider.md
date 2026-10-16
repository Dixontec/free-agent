# Multi-Provider Strategies

The skill supports three execution modes: single provider, named subset, or every-configured-provider fan-out. Each mode runs requests in a thread pool — multi-provider calls are concurrent, not serial.

## Modes

| Flag / config | Behavior | When to use |
|---|---|---|
| (none) | Single provider — uses `default` from config. | Routine searches; you trust one provider. |
| (none) + `fallback` in config | Sequential fallback chain — tries providers in order, stops on first success. | Resilience against rate limits / outages; future-proof slots for keys not yet pasted. |
| `--provider <name>` | Force a single specific provider. | When you need a known feature (e.g. Perplexity recency filter, Anthropic dynamic filtering). |
| `--providers a,b,c` | Run an explicit subset in parallel. | A/B compare two providers; combine independent index (Brave) with proxied Google (Serper). |
| `--all` | Run every provider that has credentials, in parallel. | Comprehensive sweep; cost-tolerant; novel topic with sparse coverage. |

`--provider`, `--providers`, `--all` all override the config's `fallback` chain. The chain only kicks in when none of those flags are passed.

## How parallelism works

The skill uses `ThreadPoolExecutor` from the stdlib. Every provider call is one HTTP request, so threads (not processes) are correct — they share network bandwidth and complete asynchronously while waiting for I/O.

```
--parallelism N        Max concurrent provider calls (default 8).
```

For `--all` with 8 providers configured, all 8 fire in parallel. With 12 configured and `--parallelism 4`, the runner queues four at a time. The pool shuts down cleanly on Ctrl-C or after all results return.

Each provider writes its own `<provider>.json` and `<provider>-raw.json` independently, so partial failures do not break the run.

## Why fan out?

| Reason | Concrete benefit |
|---|---|
| **Diversity of indexes** | Brave is independent; Tavily uses its own crawler; Serper proxies Google; Perplexity has a separate ranker. Different indexes find different long-tail pages. |
| **Confidence by triangulation** | If three providers all surface the same URL near the top, that URL is robustly relevant. A single hit is suspicious. |
| **Coverage during outages** | Free-tier limits, regional outages, and rate-limit hiccups happen. A `--all` run that succeeds on 7 of 9 providers still produces useful output. |
| **Cost-aware mixing** | Combine free providers (DuckDuckGo, MWMBL) with one paid provider — get the breadth of free + the precision of paid for marginal cost. |

## Combining results

Each provider's results live independently. To merge them client-side:

```bash
RESULT=$(python3 scripts/web-search --all --print-path-only "...")

# Dedupe by URL, take top 10 by score where available:
jq '
  [.manifests[].results[]]
  | unique_by(.url)
  | sort_by(-(.score // 0))
  | .[:10]
' "$RESULT"
```

For a "consensus rank" where URLs hit by multiple providers float to the top:

```bash
jq '
  [.manifests[].results[].url]
  | group_by(.)
  | map({url: .[0], count: length})
  | sort_by(-.count)
' "$RESULT"
```

Pair the consensus URLs with their best-quality snippets:

```bash
jq '
  [.manifests[].results[]]
  | group_by(.url)
  | map({
      url: .[0].url,
      hits: length,
      providers: [.[] | (.source // "?")] | unique,
      title: .[0].title,
      snippet: ([.[] | .snippet // ""] | max_by(length))
    })
  | sort_by(-.hits)
' "$RESULT"
```

## Pre-built strategies

### "Free first, paid second"

```bash
# Free providers only — instant, zero-cost:
python3 scripts/web-search --providers duckduckgo,mwmbl "..."

# If results were thin, escalate to a paid provider:
python3 scripts/web-search --providers tavily,brave "..."
```

You can wrap this in a tiny shell function:

```bash
ws() {
  local query="$1"
  local result
  result=$(python3 scripts/web-search --providers duckduckgo,mwmbl --print-path-only "$query")
  local count
  count=$(jq '[.manifests[].results[]] | length' "$result")
  if [ "$count" -lt 5 ]; then
    echo "Free providers thin ($count results) — escalating to paid"
    result=$(python3 scripts/web-search --providers tavily,brave --print-path-only "$query")
  fi
  jq '.manifests[].results[] | {title, url}' "$result"
}
```

### "Independent + proxied Google"

```bash
python3 scripts/web-search --providers brave,serper "..."
```

Brave's index is independent; Serper proxies Google. Together you cover the two main kinds of web index in 2026.

### "AI-mediated triangulation"

```bash
python3 scripts/web-search --providers tavily,perplexity,anthropic "..."
```

Tavily gives you raw cleaned snippets. Perplexity (in pure mode) gives you a separate index. Anthropic gives you Claude-curated, reasoning-filtered citations. Disagreements between the three are diagnostic — they often surface different angles on a question.

### "Cost-bounded sweep"

```bash
python3 scripts/web-search --all --max-results 3 "..."
```

`--all` fans out, but the per-provider `--max-results 3` keeps token cost low for the model-mediated providers (xAI, OpenAI, Anthropic). You still get 3 × N URLs to merge.

## Sequential fallback chain (config-driven)

Add `fallback` to your config and the skill runs providers in order, stopping at the first that returns results:

```json
{
  "default": "duckduckgo",
  "fallback": ["mwmbl", "brave", "tavily", "anthropic", "openai"]
}
```

Recommended ordering: native zero-config providers first (so the skill works without any key), then paid raw-search, then LLM-backed.

Behavior:

1. Start with `default`. If it errors (HTTP non-2xx, network error, etc.) or returns zero results, fall through.
2. Walk `fallback` in order. Providers without configured credentials are silently skipped (logged as `(skipped: no credentials)` in `--list-providers`).
3. Stop at the first provider that produces a non-empty `results[]`.
4. Footer shows `MODE: fallback` and `FALLBACK_TRIED: <names>` listing every slot that fell through.

`--list-providers` displays the resolved chain at the bottom:

```
Fallback chain:   duckduckgo -> mwmbl -> brave -> tavily (skipped: no credentials) -> anthropic (skipped: no credentials) -> openai (skipped: no credentials)
```

### When to use a fallback chain

| Situation | Why a chain helps |
|---|---|
| You have a paid primary (Brave / Tavily) and want a safety net | Paid provider hits its quota → free provider takes over without manual intervention. |
| You want to future-proof a slot for a key you haven't pasted yet | List `openai` in `fallback` now; it auto-activates the moment you fill in `providers.openai.apiKey`. |
| Your harness is non-interactive (CI, agent loop) | Single CLI invocation handles the failover internally — no shell-level retry logic to maintain. |
| You want to escalate from cheap to expensive | Order by cost: `["duckduckgo", "tavily", "anthropic"]` — only pay for Anthropic if everything cheaper failed. |

### Difference vs `--all`

| Mode | Calls | Cost | Latency | Best for |
|---|---|---|---|---|
| `fallback` (config) | 1 to N (sequential, early-exit) | minimal — only pays for providers that actually run | shortest path; long only if all fall through | resilience under a primary |
| `--all` (CLI) | N (parallel) | sum of all configured providers | bounded by the slowest | comprehensive comparison |
| `--providers a,b,c` (CLI) | M (parallel, explicit subset) | sum of M | bounded by slowest of M | A/B testing two indexes |

A chain is the right choice for "I want one good answer cheaply"; `--all` is the right choice for "I want every angle". Pick based on what the caller is going to do with the result.

### Fall-through triggers

The chain advances when the current provider:

- returns a non-2xx HTTP status
- fails to reach the network (DNS / TLS / timeout)
- returns 200 but with `results: []` (empty result set)
- has no credentials in the config (silently skipped, no error logged)

The chain does **not** advance on:

- 200 with at least one result (success — return immediately)
- partial successes (e.g. 5 out of 10 results) — these still count as success

If you want "always run the chain to completion regardless of partial success", use `--providers a,b,c` instead and merge the results with `jq`.

## Error isolation

When `--all` runs and provider X errors out (bad key, rate limit, network blip), the skill:

1. Records the error in `combined.json` under `errors[].`
2. Still saves the partial result manifest under `manifests[]` for the providers that succeeded.
3. Exits with code 0 if at least one provider returned results, 1 if every provider failed.

You can spot errored providers without re-reading the whole file:

```bash
jq '.errors' "$RESULT"
```

The footer also lists them:

```
ERRORED: brave,xai
```

## Concurrency tuning

| Scenario | Suggested `--parallelism` |
|---|---|
| Default | 8 (matches typical home/dev bandwidth) |
| Slow upstream provider in mix (e.g. Anthropic + 5 cheap providers) | 8 — Anthropic blocks its own thread, others proceed |
| Strict per-IP rate limits across providers | 2-4 to stay polite |
| Large `--all` with 10+ configured | 4-8; raising to 16 rarely helps because most providers are upstream-bound |
| Test runs against a local mock | 1 (deterministic ordering for assertions) |

The skill never spawns more threads than the number of providers in the call.

## Caching across providers

Each provider's HTTP call is unique — there is no sensible way to cache one provider's response and reuse it for another. If you want to cache the *combined* result for a given query, hash the query string and store the manifest:

```bash
QUERY="kubernetes 1.31 release notes"
KEY=$(printf "%s" "$QUERY" | shasum | head -c 12)
CACHE="/tmp/web-search-cache/$KEY.json"
mkdir -p "$(dirname "$CACHE")"
[ -f "$CACHE" ] || python3 scripts/web-search --all --json "$QUERY" > "$CACHE"
jq '.manifests[].results[].url' "$CACHE"
```

## When NOT to fan out

`--all` is wasteful for:

| Case | Better alternative |
|---|---|
| You already trust one provider for this query class | `--provider tavily` |
| You need a specific provider feature (recency, domain depth) | `--provider perplexity` with config-level `recency` |
| You have a tight budget for paid providers | `--providers duckduckgo,mwmbl,brave` (cheaper subset) |
| You're checking liveness of a single key | `--check` (no actual search) |
