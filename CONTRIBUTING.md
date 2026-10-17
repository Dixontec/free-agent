# Contribuir · Contributing

## 🇧🇷 Português

Obrigado por querer melhorar o Free Agent! Fork + PR é o caminho.

1. Faça fork, clone, crie uma branch: `git checkout -b feat/minha-melhoria`.
2. Sirva local (`python3 -m http.server 8080`) e teste.
3. Rode o eval: `node eval/run-eval.mjs` — precisa estar verde.
4. Para feature nova, adicione 1 caso em `eval/golden-tasks.json` (+ `browser-eval.js` se tocar DOM).
5. **Nunca commite chaves, `.env`, `config.json` real ou prints com keys.** Placeholders (`gsk_…`, `sk-…`) ok.
6. PR curto: o que mudou, como testar, print/log do eval verde.

Padrão: JS `// comentários curtos`, sem build, sem dependências novas sem motivo forte.

## 🇺🇸 English

Thanks for improving Free Agent! Fork + PR is the way.

1. Fork, clone, branch: `git checkout -b feat/my-improvement`.
2. Serve locally (`python3 -m http.server 8080`) and test.
3. Run eval: `node eval/run-eval.mjs` — must be green.
4. New features need 1 case in `eval/golden-tasks.json` (+ `browser-eval.js` if DOM-related).
5. **Never commit keys, `.env`, real `config.json` or screenshots with keys.** Placeholders (`gsk_…`, `sk-…`) fine.
6. Short PR: what changed, how to test, green eval log/screenshot.

Style: short `// comments`, no build, no new deps without strong reason.
