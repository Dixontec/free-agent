# Bridge & Coding Agent — Free Agent

## Modes

- **Plan**: read-only + planning (recommended for exploring).
- **Build**: allows writes per per-tool permissions + diff preview + undo.

## Authorize folder

`⚙ → Coding → Authorize folder` (File System Access API). Without it, writes are denied with guidance. Everything is jailed to the authorized folder.

## Local bridge (`bridge.py`, optional, stdlib only)

Enables real project shell + internal YouTube search.

```bash
python3 bridge.py --root /path/to/project --port 8787
# TOKEN printed in terminal → paste into ⚙ → Coding → Bridge → Test bridge
```

Optional (internal YouTube search):

```bash
YOUTUBE_API_KEY="your-key" python3 bridge.py --root .
```

Without `YOUTUBE_API_KEY`, `/ytsearch` answers `501` with guidance — nothing breaks. **Never commit keys** (see `.env.example`).

Security: binds `127.0.0.1` only, random token per run (only sha256 logged), `--root` jail, blocklist (`rm -rf /`, `mkfs`, `dd`, `shutdown`, `crontab -r`, `/dev/sda`, `chmod -R 777 /`...), timeout up to 120s, max 64 KB body, truncated output (6k stdout / 3k stderr).

## Code tools

`code_read` · `code_list` · `code_glob` · `code_grep` · `code_write` · `code_edit` · `code_bash`. Format: `<tool name="code_read">{"path":"src/app.js","limit":120}</tool>` — 1 per turn.

## Suggested flow

1. Plan: `list the folder and explain the structure`. 2. Review the plan. 3. Build: `create X` / `edit Y`. 4. Check the diff, test, use **Undo** if needed.
