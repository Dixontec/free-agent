# Changelog — Free Agent

All notable changes to Free Agent. Dates use `YYYY-MM-DD`.

## 2026-10-17 — Telegram without a terminal, live terminal in the monitor, calmer web search

### Telegram — direct from the browser (no Python, no terminal)

The biggest change: the Telegram bot now connects **straight from your browser** to
`api.telegram.org`.

- **Why it works:** the Telegram API returns `access-control-allow-origin: *` on its
  responses, so the browser is allowed to read them. A `GET` is a *simple request*, so
  no CORS preflight is triggered (a `POST` with a JSON body would be, and Telegram's
  `OPTIONS` answers `501`). Everything therefore runs with plain `GET` calls:
  `getMe`, `deleteWebhook`, `getUpdates` (long-polling, `timeout=10`) and `sendMessage`.
- **Nothing to run.** The old guide that told you to open a terminal and start a
  bridge/`serve.py` is **gone**. Flow: paste the token from `@BotFather` → **Connect**.
- **Connects by itself on load.** If a token is already saved, `restore()` validates it
  and the long-polling loop starts automatically when the app opens.
- **Token stays local.** It lives only in `localStorage` and is sent only to
  `api.telegram.org` from your own machine — never through any middleman of ours.
- **Resilient to sleep/offline.** Failures use exponential backoff (2s → 15s cap), only
  the *first* failure is logged (no more line-per-second spam), and the status returns to
  *connected* on its own when the network comes back. A `401` is treated as an invalid or
  revoked token and stops the loop with a clear message.
- Long replies are chunked (≤1500 characters per `sendMessage`) so the request URL never
  hits length limits.
- New `Chat ID` field (optional): when set, only that chat can talk to the bot.

> **Note:** open the app in a single tab — Telegram delivers each update to only one
> `getUpdates` consumer, so two tabs would compete for the same `offset`.

### Unified server — `serve.py`

- New **`serve.py`** serves the app *and* the local endpoints on one port:
  `python3 serve.py` → `http://localhost:8080` with `/health`, `/exec`, `/ytsearch` and
  `/tg-*`. One process, one port, one command.
- `bridge.py` GET requests now **fall back to serving static files**, so the bridge can
  serve the app itself. Path traversal outside `--root` is rejected with `403`.
- Security unchanged: `/exec` still requires the per-run token (`403` otherwise), the
  process still binds only `127.0.0.1`, and `/tg-*` validate the bot token server-side.
- Install docs (EN/PT) now recommend `python3 serve.py`, and mark `http.server`,
  `npx serve` and `php -S` as *static-only* alternatives (no endpoints).

### Live terminal inside the monitor

- The Nexus monitor card (top-right) now shows a **real-time terminal** instead of the
  "standby" placeholder: color-coded log lines (`ok` / `warn` / `error`), timestamps,
  auto-scroll and the whole log history seeded on open.
- It is painted **on first load** — previously the small monitor stayed empty until you
  clicked it open and closed it again.
- Click the card to expand for a taller view; a video or code preview still takes over
  the screen when one is active.
- New `js/term-live.js`; the app's `log()` feeds it (in-memory buffer, capped at 500
  lines, nothing extra persisted).

### Web search only when you ask for it

- The tool gate was split. Previously one broad regex (matching `nota`, `dado`, `tarefa`,
  `hoje`, `fonte`, `link`, `clima`, `preço`…) allowed `web_search` on almost any prompt,
  so the agent searched out of nowhere.
  - **`web_search`** now requires an explicit request: `pesquis…`, `busc…`, `notícias`,
    `procure`, `google`, `preço`, `clima`, `cotação`, `últimas`, `manchete`, `wiki`,
    `definição`, `história de`, `comparar`, `vs`…
  - **`web_open`** keeps the broad trigger, so reading a page you pasted still works.
- The tool description, the tools section and **both** system prompts (v2 and legacy) now
  state explicitly: *never search to decorate an answer*.
- The block line stays a control line, so it can never leak into the final answer.

### Conversations panel

- `see all · N` button in the sidebar opens a full-screen **conversations modal** with a
  card grid (summary, message count, preview), live count and per-conversation actions.

### Settings rebuilt

- Settings now open as **one section per page** with a side navigation (single column on
  mobile) instead of one endless scroll.
- New **Help** section with 10 quick cards and a tip about the docs.
- New **Agent Memory** section: view the memory note and configure the **Secretary**
  (nightly summary, time picker) and **Briefing** (morning summary) subagents.

### UI polish

- **Fullscreen** button (bottom-right) with `F`-style toggle and translated tooltip.
- Both **subagents show a green, pulsing dot only while busy** — grey when idle.
- Favicon simplified to a clean white circle; tab title is `Free Agent`.

### i18n

- All new strings (Telegram, Help, Settings, conversations, fullscreen) translated to
  **Portuguese (BR)**, **English** and **Spanish**.

### Docs

- Install guides (EN/PT) updated to `python3 serve.py`.
- This changelog added, in both languages.

---

Veja também a versão em [português](../pt-BR/changelog.md).
