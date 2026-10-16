# Bridge & Coding Agent — My OS

## Modos

- **Plan**: só leitura + planejamento (recomendado para explorar).
- **Build**: permite escrita conforme permissões por ferramenta + preview de diff + undo.

## Autorizar pasta

`⚙ → Coding → Autorizar pasta` (File System Access API). Sem isso, escrita é negada com orientação. Tudo fica restrito à pasta autorizada.

## Bridge local (`bridge.py`, opcional, stdlib only)

Libera shell real no projeto + busca YouTube interna.

```bash
python3 bridge.py --root /caminho/do/projeto --port 8787
# TOKEN impresso no terminal → cole em ⚙ → Coding → Bridge → Testar bridge
```

Opcional (busca YouTube interna):

```bash
YOUTUBE_API_KEY="sua-chave" python3 bridge.py --root .
```

Sem `YOUTUBE_API_KEY`, `/ytsearch` responde `501` com orientação — nada quebra. **Nunca commite chaves** (veja `.env.example`).

Segurança: bind só `127.0.0.1`, token aleatório por execução (logado só o sha256), jail `--root`, blocklist (`rm -rf /`, `mkfs`, `dd`, `shutdown`, `crontab -r`, `/dev/sda`, `chmod -R 777 /`...), timeout até 120s, corpo máx. 64 KB, saída truncada (6k stdout / 3k stderr).

## Ferramentas de código

`code_read` · `code_list` · `code_glob` · `code_grep` · `code_write` · `code_edit` · `code_bash`. Formato: `<tool name="code_read">{"path":"src/app.js","limit":120}</tool>` — 1 por turno.

## Fluxo sugerido

1. Plan: `liste a pasta e me explique a estrutura`.
2. Revise o plano. 3. Build: `crie X` / `edite Y`. 4. Confira o diff, teste, use **Desfazer** se precisar.
