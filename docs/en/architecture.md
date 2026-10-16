# Architecture — My OS (harness v2)

> Model is commodity. Harness decides. When in doubt, fail visibly — never hallucinate.

## ReAct loop (`js/harness-core.js`)

```
question → context budget → (tool? → gate → exec → trace)* → verify → answer
```

- Max **8 steps**, **90s** total, **25s** per LLM call, **15s** per tool, **2** corrections.
- **1x retry only** for network/timeout/5xx. Never retry on `VERIFIED fail` or gate deny.
- On the last 2 steps, force a final answer from already-fetched data (fallback synthesizes corpus + sources, never leaks raw `<tool>`).

## Tools (`js/tools-registry.js`)

Web: `web_search` · `web_open` · `run_skill` · `open_site` (+ `music_search`, `music_download`, `create_task`, `list_tasks`). Code: `code_read/list/glob/grep/write/edit/bash`. Single format: `<tool name="web_search">query</tool>` — 1 per turn.

## Context = budget (`js/context-budget.js`)

Summary + last 6 messages + current result. Offload >4 KB to `file://ref`. Abort if `ctxUsed > 85%` without summary. The context bar now **blocks**, not just paints.

## Verification (`js/verifiers.js`)

- `assertNoHallucinatedURL`: cited URLs must exist in the tool corpus (CDN assets excepted).
- `assertSources`: researched → must cite links.
- `assertTaskComplete`: claiming execution without the matching tool = pending (e.g. saying "created" without `create_task`).
- `assertRoutine` / `assertSkillSlug` / `assertNoRawTool`: failure, ghost skill or syntax leak = explicit pending.
- Self-heal: researched-but-linkless answers get real `Sources:` appended from the corpus instead of looping.

## Sandbox + gating (`js/gate.js`, `hooks/`)

- `sandboxCheck`: host allowlist (`youtube`, `gmail`, `github`, `wikipedia`...), off-list requires approval; destructive blocked.
- `requestApproval`: `open_site` always confirms via modal.
- `stripSecrets`: export zeroes `keys` (`***`) and drops `baseUrl`.
- `hooks/pre-tool.js`: arg ≤500 chars, `web_open` requires `https://`. `hooks/post-tool.js`: empty result = reformulate.

## Observability (`js/trace-store.js`)

JSONL with latency, tokens, decision, model, checks. **Log** tab + `Export` (always sanitized).

## Designed obsolescence

- Model with native browse → delete `web_search`, rest intact.
- Model that cites sources alone → delete `assertSources`, keep `assertNoHallucinatedURL`.
- Kill 3D: `localStorage nexus:bg {"mode":"none"}` or `window.__bg3dEnabled=false`. Zero loop impact.

More: [`HARNESS.md`](../HARNESS.md) · [`AGENTS.md`](../AGENTS.md) · [`eval/README.md`](../eval/README.md)
