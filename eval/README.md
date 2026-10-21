# Eval do Free Agent Harness — golden tasks

## Navegador nativo (FA-002)

### Navegador híbrido V2

### Audiovisual V3

- `node eval/browser-av-quality.cjs text-hint`: resolução da faixa/encoder/receptor.
- `node eval/browser-download-eval.cjs`: autorização e quarentena de arquivos pequenos.
- `node eval/browser-av-eval.cjs`: integração AV completa; mantém o piso medido de
  20 fps ao final. A última rodada integral não está aprovada.
- Evidências, timeout e restrições: `docs/pt-BR/FA-002V3-audiovisual.md`.

Os testes V3 acima usam serviços em portas efêmeras e perfis temporários para não
encerrar um serviço de uso normal. Leia os limites antes de interpretar exit 0 de
um teste focado como aprovação de toda a aplicação.

### Registro dos testes V2

`node eval/browser-web-eval.cjs` executa o frontend real com um Chromium remoto,
em perfil de teste. `node eval/browser-web-security.cjs` cobre autenticação e
fronteiras do protocolo. `node eval/browser-web-startup.cjs` testa Node/Python e
encerramento real. `node eval/browser-web-live.cjs` observa sites públicos, sem
marcar bloqueios de sites como buscas aprovadas. Não execute os testes que usam
47812 enquanto seu serviço de uso normal estiver nessa porta.

Relatório e limitações: `docs/pt-BR/FA-002V2-hibrido.md`.

- `node eval/browser-policy-eval.cjs`: URL/IP/IPC e bloqueio HTTP/CONNECT privado.
- `node eval/browser-restart-eval.cjs`: integração real no Electron e restauração
  de sessão em segundo processo, com perfil temporário isolado.
- Detalhes, variante HTTPS público e limites das evidências:
  `docs/pt-BR/FA-002-navegador.md`.

Conjunto automatizado de comportamentos esperados. Roda **a cada mudança**:
antes de comemorar feature nova, o eval tem que estar verde.

## 1. Eval Node (lógica + loop real) — CI

```bash
cd nexus-harness
node eval/run-eval.mjs   # exit 0 = verde · exit 1 = regressão
```

O que cobre, contra os **módulos reais** (sem mock de harness):
- **[A] parse** — `golden-tasks.json` × `tools-registry.js` (toda tool, + caso sem tool)
- **[B] verifiers** — URL alucinada, fonte ausente, tarefa alegada-sem-tool,
  tarefa chutada sem ler lista, rotina falha, skill fantasma
- **[C] gate** — comando destrutivo bloqueado, host estranho pede aprovação,
  `stripSecrets` zera keys
- **[D] contexto** — offload >4k vira `file://ref`, curto fica inline
- **[E] loop real** — `runReAct` com LLM simulado em 3 cenários:
  1. modelo mente que terminou → correção **chama a tool** → entregue ok
  2. tool + fonte citada → ok sem correção
  3. modelo teimoso → máx 2 correções → entregue **com pendência explícita**
- **[F]** golden íntegro (todo caso tem id/input/expect)

## 2. Self-test no navegador (comportamento de verdade) — manual

Teste isolado do motor Matrix (Node, sem dependências):

```bash
node eval/matrix-eval.mjs
```

Verifica fallback ASCII em fontes monoespaçadas, fade temporal, limite de DPR,
pausa/retomada, resize pausado, visibilidade, troca de fundo, movimento reduzido
e ausência de contexto Canvas. O contexto simulado não comprova estética,
FPS, consumo de memória ou compatibilidade gráfica no Electron.

```
http://localhost:8080/?eval=1
```

Executa os cenários `browser` do golden contra o app vivo
(intents reais, player real, IndexedDB real) e mostra o placar na aba **Log**.
**Isolamento total:** snapshot de todo `localStorage` + fila + conversa antes,
restore de tudo depois. Seus dados não são destruídos. (O teste toca 0,2s de
sine wave — deixe no mudo se preferir.)

Cenários: criar tarefa → listar tarefas → lista vazia → pausa sem fila →
tocar faixa local → pausar tocando → aba Log visível.

## 3. Adicionando caso novo (regra do time)

Toda feature nova entra com pelo menos 1 caso:
1. `golden-tasks.json` → `parse` (se tem tool nova) e/ou `browser`
2. `run-eval.mjs` → assert no módulo afetado (Node, se for lógica pura)
3. `browser-eval.js` → cenário fim-a-fim (se toca DOM/store)

## Limitação honesta

A correção textual do loop **não prova execução** — por isso a regra é estrita:
alegar sem tool = pendência, e a correção precisa **chamar a tool**.
O eval trava essa regra (cenário E1 falharia se alguém afrouxar o verifier).
