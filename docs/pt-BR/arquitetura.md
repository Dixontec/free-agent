# Arquitetura — Free Agent (harness v2)

> Modelo é commodity. Harness decide. Em dúvida, falhe visível — nunca alucine.

## Loop ReAct (`js/harness-core.js`)

```
pergunta → orçamento de contexto → (tool? → gate → exec → trace)* → verificação → resposta
```

- Máx **8 passos**, **90s** totais, **25s** por chamada LLM, **15s** por tool, **2** correções.
- Retry **1x só** para rede/timeout/5xx. Nunca retry em `VERIFIED fail` ou gate negado.
- Nos 2 últimos passos, força resposta final com os dados já obtidos (fallback sintetiza corpus + fontes, nunca vaza `<tool>` crua).

## Ferramentas (`js/tools-registry.js`)

Web: `web_search` · `web_open` · `run_skill` · `open_site` (+ `music_search`, `music_download`, `create_task`, `list_tasks`). Código: `code_read/list/glob/grep/write/edit/bash`. Formato único: `<tool name="web_search">consulta</tool>` — 1 por turno.

## Contexto = orçamento (`js/context-budget.js`)

Resumo + últimas 6 mensagens + resultado atual. Offload >4 KB vira `file://ref`. Aborta se `ctxUsed > 85%` sem resumo. Barra de contexto agora **bloqueia**, não só pinta.

## Verificação (`js/verifiers.js`)

- `assertNoHallucinatedURL`: URL citada precisa existir no corpus das tools (assets de CDN são exceção).
- `assertSources`: pesquisou → tem que citar link.
- `assertTaskComplete`: alegar execução sem tool correspondente = pendência (ex.: dizer "criei" sem `create_task`).
- `assertRoutine` / `assertSkillSlug` / `assertNoRawTool`: falha, skill fantasma ou vazamento de sintaxe = pendência explícita.
- Auto-cura: se pesquisou mas respondeu sem link, anexa `Fontes:` reais do corpus em vez de travar em loop.

## Sandbox + gating (`js/gate.js`, `hooks/`)

- `sandboxCheck`: allowlist de hosts (`youtube`, `gmail`, `github`, `wikipedia`...), fora dela exige aprovação; destrutivo bloqueia.
- `requestApproval`: `open_site` sempre confirma via modal.
- `stripSecrets`: export zera `keys` (`***`) e remove `baseUrl`.
- `hooks/pre-tool.js`: arg ≤500 chars, `web_open` exige `https://`. `hooks/post-tool.js`: resultado vazio = reformule.

## Observabilidade (`js/trace-store.js`)

JSONL com latência, tokens, decisão, modelo, verificações. Aba **Log** + `Exportar` (sempre sanitizado).

## Obsolescência projetada

- Modelo com browse nativo → delete `web_search`, resto intacto.
- Modelo que cita fontes sozinho → delete `assertSources`, mantenha `assertNoHallucinatedURL`.
- Desligar 3D: `localStorage nexus:bg {"mode":"none"}` ou `window.__bg3dEnabled=false`. Zero impacto no loop.

Mais: [`HARNESS.md`](../HARNESS.md) · [`AGENTS.md`](../AGENTS.md) · [`eval/README.md`](../eval/README.md)
