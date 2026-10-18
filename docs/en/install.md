# Install — Free Agent

> Estimated time: 2 minutes. No build, no Node dependencies, no database.

## Requirements

- Modern browser (up-to-date Chrome, Edge, Firefox or Brave).
- Python 3.8+ (only to serve files — preinstalled on most Linux/macOS).
- Optional: [Ollama](https://ollama.com) or [LM Studio](https://lmstudio.ai) for 100% local, free AI.
- Optional: free [Groq](https://console.groq.com) key (recommended to start).

## Steps

```bash
# 1. Download (either way)
git clone https://github.com/YOUR-USERNAME/my-os.git
# or click "Code → Download ZIP" and extract

# 2. Serve
cd my-os
python3 serve.py

# 3. Open
# http://localhost:8080
```

> Don't open via `file://` (double-clicking the HTML). Three.js CDN modules require `http://`.
> `serve.py` is the **integrated** server: it serves the app plus `/health` + `/tg-*`,
> so **Telegram → Connect** works out of the box, no separate process.

## Server alternatives

```bash
python3 serve.py            # RECOMMENDED (app + Telegram/Coding on one port)
python3 -m http.server 8080 # static only — Telegram/Coding need the bridge aside
npx serve . -l 8080         # Node (static only)
php -S localhost:8080       # PHP (static only)
```

## First setup

1. Open **⚙ Settings → Connection & Model**.
2. Provider **Groq** → paste key from `console.groq.com → API Keys → Create` → **Save** → **Test connection**.
3. No key: use **Ollama** (`ollama serve` + `ollama pull llama3.1`) or local commands (`/news technology`).

## Update

```bash
cd my-os
git pull
# reload the page — your data lives in the browser, it is not wiped
```

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Black screen / 3D missing | opened via `file://` or CDN blocked | serve via `http.server`, allow `unpkg.com` |
| `API failed` | wrong key / provider down | click **Test connection**, check model |
| Port 8080 busy | another service | `python3 -m http.server 8090` |
| Voice not working | mic permission | allow in browser, use `Ctrl+Space` |

## Uninstall

Delete the folder + clear `localStorage` (DevTools → Application → Clear). No system residue.
