# My OS Harness v2 — Arquitetura mínima

## Por que v2? (falhas da v1 mapeadas nos 8 princípios)

| # | Princípio | Falha v1 (arquivo:linha) | Correção v2 |
|---|---|---|---|
| 1 | Agent=Model+Harness | `callLLM` sem timeout p/ LLM, só 1 tool/turno, sem loop (`app.js:448-495`). Modelo decide tudo. | `harness-core.js`: loop ReAct máx 8 steps, timeout 25s, retry só rede/5xx |
| 2 | Menos é mais | 9 skills + 5 tools + 3 agentes + 4 overlays no mesmo `app.js` (2070 linhas). `detectSkill` por substring (`app.js:729`). | 4 tools distintas em `tools-registry.js`. Skills viram `run_skill` com schema lazy. Subagente só com contexto limpo |
| 3 | Contexto=orçamento | `skillsCtx()` despeja todas skills + `history.slice(-10)` cego (`app.js:448`). `toolOpen` trunca 6000 chars (`app.js:1754`). | `context-budget.js`: resumo + últimas 6 + offload >4k p/ arquivo + contador coercitivo |
| 4 | Verificação determinística | `coreWinDone(win,'Rotina concluída')` sempre (`app.js:916`), mesmo com `Ação ignorada` (`app.js:898`). | `verifiers.js`: `assertRoutine`, `assertSources`, `assertNoHallucinatedURL`. Sem `VERIFIED` = incompleto |
| 5 | Regra earned | `TOOLS_SYS`: "NUNCA responda explicando..." absoluto, intestável (`app.js:1687`). | Cada regra em `AGENTS.md` tem falha real numerada. Removido resto |
| 6 | Sandbox+gating | `window.open(val)` direto (`app.js:878`), export inclui `keys` (`app.js:2044`), scheduler dispara sem confirm. | `gate.js`: allowlist, confirmação p/ irreversível, keys nunca em export/trace |
| 7 | Feedforward+Feedback | `log()` 100 linhas em localStorage, sem latência/tokens (`app.js:2025`). `ctxUsed` pinta barra mas não limita (`app.js:1558`). | `trace-store.js`: JSONL com latência, tokens, decisão. `paintCtx` agora bloqueia |
| 8 | Obsolescence | Three.js `three-bg.js` + `neural.js` acoplados via `window.__neural*`, MutationObserver sempre on. | `HARNESS.md#remoção`: desliga com 1 flag `window.__bg3dEnabled=false`. Núcleo visual é plugin, não core |

## Estrutura v2 (drop-in, compatível com v1)
```
nexus-harness/
├── AGENTS.md               # system prompt (substitui TOOLS_SYS + skillsCtx gigante)
├── HARNESS.md              # este arquivo
├── js/
│   ├── app.js              # legado — manter, importar v2 via patch abaixo
│   ├── harness-core.js     # NOVO: loop ReAct mínimo (o único orquestrador)
│   ├── tools-registry.js   # NOVO: 4 tools, schemas sob demanda
│   ├── context-budget.js   # NOVO: compactação estruturada + offload
│   ├── verifiers.js        # NOVO: checks determinísticos
│   ├── gate.js             # NOVO: sandbox + aprovação humana
│   └── trace-store.js      # NOVO: observabilidade JSONL
└── hooks/
    ├── pre-tool.js         # exemplo feedforward (allowlist)
    └── post-tool.js        # exemplo feedback (verifier)
```

## Limites claros (default, tunável)
- steps: 8 · tempo total: 90s · tool timeout: 15s · LLM timeout: 25s
- tokens/turno: min(ctxLimit, 12k) · custo: aborta se `ctxUsed > 85%` sem resumo
- retries: 1x só p/ rede/timeout/5xx. Nunca retry em `VERIFIED fail` ou gate deny.

## Compatibilidade model-agnostic
- Mantém `cfg.provider/model` (groq default `llama-3.3-70b-versatile`).
- `harness-core.js` chama `callLLM(messages)` existente — nenhuma mudança de provider.
- Timeout/retry por fora (AbortController), não por provider. Funciona p/ Groq/OpenAI/Gemini/Anthropic/Ollama/OpenRouter.

## Remoção futura (design for obsolescence)
- Quando modelo tiver browse nativo: delete `web_search` de `tools-registry.js`, resto intacto.
- Quando modelo citar fontes sozinho: delete `assertSources`, mantenha `assertNoHallucinatedURL`.
- Para desligar 3D: `localStorage nexus:bg {"mode":"none"}` ou `window.__bg3dEnabled=false`. Zero impacto no loop.

## Patch de integração (3 linhas em app.js)
```js
// topo de app.js após PROVIDERS:
import { runReAct } from './harness-core.js';
// no submit do composer, substitua bloco try{...} por:
const out = await runReAct(text, { history, cfg, callLLM, getSkills });
// runReAct já faz: budget → tool → gate → verifier → trace → persist
```
Ver `hooks/` para exemplos de gating real.
