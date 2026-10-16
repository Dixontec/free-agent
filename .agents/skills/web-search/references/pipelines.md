# Pipeline Recipes

The skill is designed to be Unix-pipeable. Every search writes JSON files to a temp directory and prints a path to stdout, so you can chain `rg`, `jq`, `grep`, `awk`, `python -c`, or any other tool downstream.

## Output anatomy

A single search creates a directory like `/tmp/web-search/20260501T073744Z/` with these files:

```
/tmp/web-search/<run-id>/
├── combined.json           # Manifest with metadata + all normalized results across providers
├── <provider>.json         # Per-provider normalized results (canonical schema)
└── <provider>-raw.json     # Per-provider raw API response (debug + advanced parsing)
```

`combined.json` is the canonical entry point for downstream pipelines. `<provider>.json` is convenient for single-provider queries.

The schema is in [`result-schema.md`](result-schema.md).

## Capturing the path

Three idiomatic ways:

```bash
# 1. --print-path-only emits ONLY the combined.json path (clean for $(...) substitution)
RESULT=$(python3 scripts/web-search --print-path-only "kubernetes 1.31 release notes")
jq '.manifests[].results[].url' "$RESULT"

# 2. The default human-readable output ends with a "--- WEBSEARCH ---" footer; grep for the path
python3 scripts/web-search "..." | awk '/^RESULT_FILE:/ {print $2}'

# 3. --json prints the full manifest to stdout — pipe directly into jq without disk
python3 scripts/web-search --json "..." | jq '.manifests[].results[].url'
```

## ripgrep recipes

`rg` reads every file in the run directory by default — no need to know the provider name.

### Filter results to lines containing a keyword

```bash
RUN=$(python3 scripts/web-search --providers tavily,brave --print-path-only "release notes" | xargs dirname)
rg -i "stable|release" "$RUN"
```

### Find URLs from a specific domain

```bash
rg -o "https://[a-zA-Z0-9./_-]*github.com[a-zA-Z0-9./_-]*" "$RUN"
```

### Show snippets containing a phrase, with surrounding result block

```bash
rg -B 2 -A 2 -i "vulnerability" "$RUN"/*.json
```

### Pipe straight from --json

```bash
python3 scripts/web-search --json "..." | rg -i "deprecated"
```

## jq recipes

`combined.json` (and the per-provider files) are valid JSON, so `jq` works directly.

### Extract every URL across all providers

```bash
RESULT=$(python3 scripts/web-search --all --print-path-only "...")
jq -r '.manifests[].results[].url' "$RESULT"
```

### Top result per provider

```bash
jq -r '.manifests[] | "\(.provider): \(.results[0].title) - \(.results[0].url)"' "$RESULT"
```

### Aggregate across providers, deduped by URL, ranked by score where available

```bash
jq '
  [.manifests[].results[]]                # flatten everything
  | unique_by(.url)                       # dedupe by URL
  | sort_by(-(.score // 0))               # rank by score (missing => 0)
  | .[:10]
' "$RESULT"
```

### Filter by provider

```bash
jq '.manifests[] | select(.provider == "tavily").results' "$RESULT"
```

### Convert to TSV for spreadsheet pasting

```bash
jq -r '
  .manifests[].results[]
  | [.title, .url, (.snippet // "")] | @tsv
' "$RESULT"
```

### Extract published dates, filter to last 30 days

```bash
jq --arg cutoff "$(date -u -v-30d +%Y-%m-%d 2>/dev/null || date -u -d '30 days ago' +%Y-%m-%d)" '
  [.manifests[].results[]
   | select(.publishedAt? and (.publishedAt[:10] >= $cutoff))]
' "$RESULT"
```

### Count results per provider

```bash
jq '.manifests | map({provider, count: (.results | length)})' "$RESULT"
```

### Find providers that errored

```bash
jq '.errors' "$RESULT"
```

### Build a markdown digest

```bash
jq -r '
  .manifests[]
  | "## \(.provider)\n",
    (.results[] | "- [\(.title)](\(.url))\n  > \(.snippet // "(no snippet)")\n")
' "$RESULT"
```

## Combining tools

### Open every URL in your browser

```bash
jq -r '.manifests[].results[].url' "$RESULT" | xargs -I{} open "{}"   # macOS
jq -r '.manifests[].results[].url' "$RESULT" | xargs -I{} xdg-open "{}"  # Linux
```

### Send the top 5 to an LLM for summarization

```bash
jq -r '
  .manifests[].results[:5][]
  | "TITLE: \(.title)\nURL: \(.url)\n\(.snippet // "")\n---"
' "$RESULT" | llm "Summarize these results in 3 bullets."
```

(Replace `llm` with whatever CLI your harness uses.)

### Snapshot results for offline reading

```bash
jq -r '.manifests[].results[].url' "$RESULT" | xargs -I{} \
  curl -fsSL --max-time 10 "{}" -o "snapshot/$(echo "{}" | sha1sum | head -c 12).html"
```

### Diff two searches

```bash
A=$(python3 scripts/web-search --print-path-only "rust async")
B=$(python3 scripts/web-search --print-path-only "rust tokio")
diff <(jq -r '.manifests[].results[].url' "$A" | sort) \
     <(jq -r '.manifests[].results[].url' "$B" | sort)
```

## Streaming a JSON Lines feed

For tools that prefer NDJSON over a single JSON object:

```bash
jq -c '.manifests[].results[]' "$RESULT" > /tmp/results.ndjson
```

Now every line is a single result, suitable for `parallel`, `xargs -L 1`, or stream-processing jobs.

## When you have neither rg nor jq

Pure POSIX fallback:

```bash
RESULT=$(python3 scripts/web-search --print-path-only "...")
python3 -c "import json,sys; [print(r['url']) for m in json.load(open(sys.argv[1]))['manifests'] for r in m['results']]" "$RESULT"
```

`python3 -c` is the most universal substitute — it ships with Python on every Unix and runs from PowerShell/cmd.exe on Windows.

## Pretty-print without paging

The skill never invokes `less` or any pager. Pipe to `cat` if you want to ensure no terminal-aware behavior:

```bash
python3 scripts/web-search "..." | cat
```

## Background searches

For long-running multi-provider fan-outs, run in the background and wait for the sentinel file:

```bash
RUN_DIR=/tmp/web-search/$(date -u +%Y%m%dT%H%M%SZ)-bg
nohup python3 scripts/web-search --all --tmp-dir "$RUN_DIR" "..." \
  > "$RUN_DIR.log" 2>&1 &
echo "Started $!"

# In another shell or after waiting:
tail -f "$RUN_DIR.log"
ls "$RUN_DIR"      # combined.json appears when finished
```

## Caching across runs

The skill never caches between invocations — every call writes a fresh directory under `/tmp/web-search/`. To deduplicate identical queries, build your own cache layer:

```bash
QUERY="kubernetes 1.31 release notes"
KEY=$(printf "%s" "$QUERY" | sha1sum | head -c 12)
CACHE="/tmp/web-search-cache/$KEY.json"
mkdir -p "$(dirname "$CACHE")"
if [ ! -f "$CACHE" ]; then
  python3 scripts/web-search --json "$QUERY" > "$CACHE"
fi
jq '.manifests[].results[].url' "$CACHE"
```

`/tmp/web-search/` itself is meant to be ephemeral — clear it whenever you want:

```bash
rm -rf /tmp/web-search/    # safe; the skill recreates the directory on next run
```
