# Segurança · Security

## 🇧🇷 Português

- Chaves ficam no `localStorage` do seu navegador. Export usa `stripSecrets()` (vira `***`).
- `bridge.py` só escuta em `127.0.0.1`, com token aleatório, jail de pasta e blocklist.
- Achou falha? Abra issue `[SECURITY]` **sem publicar exploit**. Não inclua chaves reais em nenhum report.
- Nunca commite `.env`, `config.json` com chaves, backups com keys ou tokens do bridge.

## 🇺🇸 English

- Keys live in your browser `localStorage`. Export goes through `stripSecrets()` (becomes `***`).
- `bridge.py` listens on `127.0.0.1` only, with random token, folder jail and blocklist.
- Found a flaw? Open a `[SECURITY]` issue **without publishing exploits**. Never include real keys in reports.
- Never commit `.env`, keyed `config.json`, keyed backups or bridge tokens.
