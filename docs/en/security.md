# Security — Free Agent

## Threat model (honest summary)

- **API keys**: stored in `localStorage` under `nexus:keys`. Risk: anyone with access to your browser profile can read them. Mitigation: we never export keys (`stripSecrets`), never log values, `password` field with show/hide.
- **URL opening**: `open_site`/`web_open` could lead to phishing. Mitigation: allowlist + confirmation modal for unknown hosts; `web_open` only accepts URLs returned by search or typed by you.
- **Local bridge**: real shell — high risk if exposed. Mitigation: `127.0.0.1`-only bind, random token per run, directory jail, blocklist, timeout, no execution without token.
- **Routines/scheduler**: fire alone on schedule. Mitigation: irreversible actions ask for confirmation; failure is never marked done.

## NEVER do

- Never commit `.env`, real `config.json`, keys or tokens (see `.gitignore` + `.env.example`).
- Never run `bridge.py` with `--root /` nor expose the port to the network.
- Never paste keys into issues, screenshots or videos.

## Report a vulnerability

Open an issue tagged `[SECURITY]` or contact the maintainer. Don't publish exploits before a fix. See [`SECURITY.md`](../SECURITY.md).
