# Provider Setup Guide

Step-by-step instructions for getting an API key for every paid provider, plus how to point the skill at it. The skill works **with zero configuration** thanks to `duckduckgo` and `mwmbl` (no auth required) — keys only matter when you want better quality, more results, or a specific feature like recency filters.

## Configuration locations

The skill loads the first config file it finds in this order:

1. `--config <path>` CLI argument
2. `$WEBSEARCH_CONFIG` environment variable
3. `~/.config/web-search/config.json`
4. `~/.web-search.json`
5. `./web-search.json` (project-local)
6. `./.web-search.json` (project-local hidden)

After loading the file, env-var fallbacks fill in gaps (so you can ship a partial config and let CI inject the secrets via env).

Shared minimum config (zero-config example — works without any API keys):

```json
{
  "default": "duckduckgo",
  "fallback": ["mwmbl"],
  "maxResults": 10,
  "providers": {}
}
```

Add API keys when you want richer results:

```json
{
  "default": "duckduckgo",
  "fallback": ["mwmbl", "brave", "tavily", "anthropic", "openai"],
  "maxResults": 10,
  "providers": {
    "brave": {"apiKey": "BSA..."},
    "tavily": {"apiKey": "tvly-..."}
  }
}
```

Native zero-config providers (`duckduckgo`, `mwmbl`) are preferred as the default so the skill works out of the box. Add paid providers to the `fallback` chain — they activate the moment you paste a key.

Quick start:

```bash
mkdir -p ~/.config/web-search
cp config/config.example.json ~/.config/web-search/config.json
$EDITOR ~/.config/web-search/config.json
python3 scripts/web-search --check
```

`--check` validates the file and tells you which providers will work.

---

## duckduckgo (free, no auth)

No setup. Just run it.

```bash
python3 scripts/web-search --provider duckduckgo "your query"
```

DuckDuckGo asks that consumers send a meaningful `User-Agent` and use the API "reasonably." The skill sends `web-search-skill/<version>` as its UA.

---

## mwmbl (free, no auth)

No setup. Just run it.

```bash
python3 scripts/web-search --provider mwmbl "your query"
```

MWMBL is a volunteer-run open-source search index. Be polite — there is no published rate limit but the service is small. Cache aggressively in agent harnesses.

---

## exa

1. Sign up at <https://dashboard.exa.ai/login>.
2. Generate an API key from the dashboard's API Keys page.
3. Drop into config:
   ```json
   {"providers": {"exa": {"apiKey": "exa_..."}}}
   ```
   Or export `EXA_API_KEY` in your shell.

> **Heads-up**: Earlier docs claimed Exa accepted anonymous calls. Exa changed that policy in 2026 — calls without a key now return `402 Payment Required`. A real API key is required.

---

## tavily

1. Sign up at <https://app.tavily.com/sign-in>.
2. The dashboard generates a default API key starting with `tvly-`. New keys can be created from the API Keys page.
3. Free tier: 1k searches/month. Paid plans bump that.
4. Config:
   ```json
   {"providers": {"tavily": {"apiKey": "tvly-..."}}}
   ```
   Or export `TAVILY_API_KEY`.

Strong choice for LLM agents — Tavily's snippets are pre-cleaned for downstream consumption. Slot it early in your `fallback` chain (right after the native zero-config providers) for quality results once you have a key.

---

## brave

1. Go to <https://api-dashboard.search.brave.com/app/subscriptions> and create an account.
2. Subscribe to the **Free** tier ($5/month credit, ~1k queries). **Credit card required** as of Feb 2026.
3. Create an API key from the dashboard. The token is sometimes prefixed `BSA`.
4. Config:
   ```json
   {"providers": {"brave": {"apiKey": "BSA..."}}}
   ```
   Or export `BRAVE_API_KEY` (or `BRAVE_SEARCH_API_KEY`).

The free tier rate limit is 1 req/sec. Paid plans go up to 50 req/sec.

---

## serper

1. Sign up at <https://serper.dev>.
2. Get the default API key from the dashboard.
3. Free tier: 2.5k credits.
4. Config:
   ```json
   {"providers": {"serper": {"apiKey": "0123456789abcdef..."}}}
   ```
   Or export `SERPER_API_KEY`.

Cheapest way to get Google's organic results.

---

## google-cse (Google Custom Search Engine)

This requires **two** values: an API key and a Programmable Search Engine ID.

1. **Create a Programmable Search Engine** at <https://programmablesearchengine.google.com/controlpanel/all>:
   - Click "Add"
   - Pick "Search the entire web" or specify domains
   - Save and copy the **Search engine ID** (`cx`) from the Overview tab.
2. **Get an API key**:
   - Go to <https://console.cloud.google.com/apis/credentials>
   - Create a project if needed
   - Click "+ Create Credentials" → "API Key"
   - Restrict it to "Custom Search API" if you can
3. **Enable the API**: <https://console.cloud.google.com/apis/library/customsearch.googleapis.com> → Enable
4. Config:
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
   Or export `GOOGLE_CSE_API_KEY` (or `GOOGLE_API_KEY`) and `GOOGLE_CSE_ID` (or `GOOGLE_SEARCH_ENGINE_ID`).

Free tier: **100 queries/day**. Hard cap of **10 results per call** (stricter than other providers).

---

## z-ai

1. Sign up at <https://z.ai>.
2. Get an API key from the developer console.
3. Config:
   ```json
   {"providers": {"z-ai": {"apiKey": "..."}}}
   ```
   Or export `Z_AI_API_KEY` (or `ZAI_API_KEY`, `ZHIPU_API_KEY`).

Best coverage for Chinese-language and Chinese-region queries.

---

## perplexity

Two modes:

### Pure `/search` (no model — recommended)

1. Sign up at <https://www.perplexity.ai/account/api>.
2. Generate an API key (`pplx-...`).
3. Config:
   ```json
   {"providers": {"perplexity": {"apiKey": "pplx-..."}}}
   ```

The skill defaults to the pure `/search` endpoint when no `model` is set. $5/1k requests, no token costs.

### Sonar mode (chat completions with built-in search)

If you want the AI-generated answer instead of (or in addition to) raw results:

```json
{
  "providers": {
    "perplexity": {
      "apiKey": "pplx-...",
      "model": "sonar-pro"
    }
  }
}
```

Available models: `sonar`, `sonar-pro`, `sonar-reasoning-pro`, `sonar-deep-research`. Each is billed per token plus a per-request fee.

Either mode: env var fallback is `PERPLEXITY_API_KEY` (or `PPLX_API_KEY`).

---

## xai (Grok)

1. Sign up at <https://console.x.ai>.
2. Generate an API key (`xai-...`).
3. Add a payment method — xAI charges for every request.
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
   Or export `XAI_API_KEY`.

Model is required (default `grok-4.3` if you omit it). The deprecated Live Search API on `/v1/chat/completions` returns 410 Gone — the skill correctly uses the Responses API only.

Pricing: $5/1k `web_search` tool calls plus standard model token costs.

---

## openai

1. Get an API key from <https://platform.openai.com/api-keys>.
2. Make sure your project has access to a model that supports the `web_search` tool (any GPT-5.x except `nano`, GPT-4.1, GPT-4o, o3, o4-mini).
3. Config:
   ```json
   {
     "providers": {
       "openai": {
         "apiKey": "sk-proj-...",
         "model": "gpt-5.4-mini",
         "searchContextSize": "medium",
         "mode": "live"
       }
     }
   }
   ```
   Or export `OPENAI_API_KEY`.

Pricing: $10/1k `web_search` tool calls plus model token costs. Set `mode` to `cached` for offline/snapshot mode.

---

## anthropic

1. Get an API key from <https://console.anthropic.com/settings/keys> (`sk-ant-...`).
2. Make sure your account has access to Claude models that support the `web_search` tool (Claude Fable 5, Opus 4.x, Sonnet 4.x, Haiku 4.x).
3. Config:
   ```json
   {
     "providers": {
       "anthropic": {
         "apiKey": "sk-ant-...",
         "model": "claude-sonnet-4-6",
         "maxUses": 5
       }
     }
   }
   ```
   Or export `ANTHROPIC_API_KEY`.

Pricing: **$10 per 1,000 searches** plus model token costs. The skill defaults to tool version `web_search_20260209` (with dynamic filtering, current GA). To pin an earlier version set `toolVersion: "web_search_20250305"` in your config block.

`maxUses` caps how many search calls Claude is allowed to make per request — default 5, set lower for predictable cost.

---

## Validating your config

```bash
python3 scripts/web-search --check
python3 scripts/web-search --list-providers
```

`--check` exits 0 when at least one provider has credentials; otherwise prints `WARN:` lines pointing at what's missing. `--list-providers` shows every supported provider, marks the configured ones with `[OK]`, and prints the resolved endpoint (so a `baseUrl` override is visible).

## Rotating keys

The skill never persists keys outside the config file you provide. To rotate:

1. Update the file (`~/.config/web-search/config.json`).
2. Re-run any in-flight commands.
3. There is no daemon to restart and no cache to clear.

If you keep keys in env vars, set them in your shell profile (`~/.zshrc`, `~/.bashrc`, `direnv .envrc`). The agent harnesses (pi, hermes-agent, openclaw) inherit your shell environment.
