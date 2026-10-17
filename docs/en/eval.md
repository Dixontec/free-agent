# Eval — Free Agent

> Before celebrating a new feature, eval must be green.

## 1. Node eval (CI)

```bash
node eval/run-eval.mjs   # exit 0 = green · exit 1 = regression
```

Covers, against the **real modules** (no harness mocks):

- **[A] parse** — `golden-tasks.json` × `tools-registry.js`.
- **[B] verifiers** — hallucinated URL, missing sources, claimed-without-tool task, failed routine, ghost skill.
- **[C] gate** — destructive blocked, strange host asks approval, `stripSecrets` zeroes keys.
- **[D] context** — >4k offload becomes `file://ref`.
- **[E] real loop** — `runReAct` with mocked LLM: lying-it's-done → fixes by calling the tool; stubborn → delivers with explicit pending.
- **[F]** golden integrity (every case has id/input/expect).

## 2. In-browser self-test

```
http://localhost:8080/?eval=1
```

End-to-end scenarios against the live app (tasks, player, IndexedDB, Log tab) with **full snapshot/restore** — your data is not destroyed. (Plays 0.2s sine wave — mute if you like.)

## 3. Add a new case

1. `golden-tasks.json` → `parse`/`browser`. 2. `run-eval.mjs` → Node assert. 3. `browser-eval.js` → DOM/store scenario.

## Honest limitation

Textual correction doesn't prove execution — hence claiming without a tool = pending, and the fix must **call the tool**. Scenario E1 locks this rule.
