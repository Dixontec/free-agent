# Eval — Free Agent

> Antes de comemorar feature nova, o eval tem que estar verde.

## 1. Eval Node (CI)

```bash
node eval/run-eval.mjs   # exit 0 = verde · exit 1 = regressão
```

Cobre, contra os **módulos reais** (sem mock de harness):

- **[A] parse** — `golden-tasks.json` × `tools-registry.js`.
- **[B] verifiers** — URL alucinada, fonte ausente, tarefa alegada-sem-tool, rotina falha, skill fantasma.
- **[C] gate** — destrutivo bloqueado, host estranho pede aprovação, `stripSecrets` zera keys.
- **[D] contexto** — offload >4k vira `file://ref`.
- **[E] loop real** — `runReAct` com LLM simulado: mente-que-terminou → corrige chamando a tool; teimoso → entrega com pendência explícita.
- **[F]** golden íntegro (todo caso tem id/input/expect).

## 2. Self-test no navegador

```
http://localhost:8080/?eval=1
```

Cenários fim-a-fim contra o app vivo (tarefas, player, IndexedDB, aba Log) com **snapshot/restore total** — seus dados não são destruídos. (Toca 0,2s de sine wave — deixe no mudo se preferir.)

## 3. Adicionar caso novo

1. `golden-tasks.json` → `parse`/`browser`. 2. `run-eval.mjs` → assert Node. 3. `browser-eval.js` → cenário DOM/store.

## Limitação honesta

Correção textual não prova execução — por isso alegar sem tool = pendência, e a correção precisa **chamar a tool**. O cenário E1 trava essa regra.
