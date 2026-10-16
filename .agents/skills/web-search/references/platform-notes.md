# Platform Notes

The skill is designed to run on every modern OS without modification. This page documents the small differences between platforms and the failure modes you might hit on each.

## What the skill needs

| Component | Why | Where to get it |
|---|---|---|
| Python 3.8+ | Runs `scripts/web-search` | macOS 10.15+: pre-installed; Linux: distro package; Windows: Microsoft Store or python.org |
| TLS-capable libssl | HTTPS to provider APIs | Bundled with Python on every supported OS |

That's it. No pip install, no node, no jq, no curl required to run the wrapper. (`jq` and `rg` are recommended for downstream filtering — see [`pipelines.md`](pipelines.md).)

## Python availability

| OS | Python 3 default? | If missing | Notes |
|---|---|---|---|
| macOS 10.15 Catalina+ | Yes (`/usr/bin/python3`) | `xcode-select --install` or `brew install python` | Apple may lag behind upstream; brew gives a current 3.x |
| Ubuntu / Debian / Fedora / Arch | Yes | `apt install python3` etc. | Some minimal containers strip it |
| Alpine Linux | Sometimes | `apk add python3` | Wider stdlib needed than `python3-minimal` — install full `python3` |
| Windows 10/11 | No, but trivial | `winget install Python.Python.3` or Microsoft Store | After install, both `python` and `py` work |
| WSL2 | Whatever the distro ships | Same as Linux | `python3` resolves to the WSL distro's binary |
| Termux (Android) | Optional | `pkg install python` | Works for ad-hoc searches |
| FreeBSD | Yes (`python3.x`) | `pkg install python3` | Standard pkg |
| Distroless / scratch images | No | Use `python:3.12-slim` base instead | Tiny additional layer (~40 MB) |

## Invocation per OS

### macOS / Linux

The shebang `#!/usr/bin/env python3` makes the file directly executable:

```bash
chmod +x scripts/web-search
./scripts/web-search "query"
# or:
python3 scripts/web-search "query"
```

### Windows (cmd.exe)

The shebang is ignored; invoke Python explicitly:

```cmd
python scripts\web-search "query"
:: or, if the py launcher is available:
py scripts\web-search "query"
```

### Windows (PowerShell)

Same as cmd, plus PowerShell-friendly variable substitution if you set env vars:

```powershell
$env:TAVILY_API_KEY = "tvly-..."
python scripts\web-search "your query"
```

### Windows (Git Bash / WSL)

Behaves like Linux; the shebang works:

```bash
./scripts/web-search "query"
```

## Path resolution per OS

The skill resolves three classes of paths automatically.

### Config file search order

| OS | Order |
|---|---|
| macOS / Linux | `~/.config/web-search/config.json`, `~/.web-search.json`, `./web-search.json`, `./.web-search.json` |
| Windows | `%APPDATA%\web-search\config.json`, then the four POSIX-style paths above (with `~` resolving via `Path.home()`) |
| All | `--config <path>` and `$WEBSEARCH_CONFIG` always take precedence |

Confirm with `--list-providers`, which prints the resolved source.

### Temp output directory

| OS | Default `<TMP_ROOT>` |
|---|---|
| macOS | `/tmp/web-search` |
| Linux | `/tmp/web-search` |
| Windows | `<tempfile.gettempdir()>/web-search` (typically `C:\Users\<user>\AppData\Local\Temp\web-search`) |
| Any | `$WEBSEARCH_TMP_DIR` overrides; `--tmp-dir <path>` overrides everything |

The temp dir is created lazily on first run and never auto-cleaned. Wipe it with `rm -rf` (POSIX) or `Remove-Item -Recurse` (PowerShell) when you want to free space.

### Run-directory paths in output

`combined.json` and the footer print absolute paths using the host's native separator:

- POSIX: `/tmp/web-search/20260501T073745Z/combined.json`
- Windows: `C:\Users\foo\AppData\Local\Temp\web-search\20260501T073745Z\combined.json`

`jq` and `rg` accept both. If you script around the output, treat the path as opaque (do not split on `/`).

## SSL and certificates

Python's `urllib.request` uses the system trust store on each OS:

- macOS: Uses the keychain via `Security.framework` (since Python 3.6+).
- Linux: Reads from `/etc/ssl/certs/` or distro-specific bundle.
- Windows: Uses the OS certificate store via `wincertstore` (Python 3.4+).

Corporate proxies that re-sign HTTPS need their root CA installed in the OS store. The skill respects that automatically — no special config needed.

If you hit a TLS error in a sandboxed environment:

```bash
# Diagnose: which CA bundle is being used?
python3 -c "import ssl; print(ssl.get_default_verify_paths())"
```

If `openafile` or `cafile` is empty/missing, the OS trust store is broken — fix that first (e.g. `pip install certifi` in a venv as a fallback, then `export SSL_CERT_FILE=$(python3 -m certifi)`).

## Locale and encoding

The skill writes JSON in UTF-8 and reads stdin/stdout in UTF-8. On Windows, ensure your terminal is set to UTF-8 to avoid mojibake on non-ASCII results:

```powershell
chcp 65001       # set the cmd.exe code page to UTF-8 for the session
```

Modern Windows Terminal / VS Code Terminal are UTF-8 by default. The legacy `cmd.exe` opened from `Win+R cmd` may still default to cp1252 — switch to Windows Terminal if you see garbled snippets from Chinese-language results (z.ai), Korean queries, etc.

## Threading and process model

`ThreadPoolExecutor` works identically on all OSes. The skill never forks subprocesses, so:

- No `fork()` / `spawn()` differences between macOS and Linux.
- No issues with macOS's `OBJC_DISABLE_INITIALIZE_FORK_SAFETY` warning.
- No Windows multiprocessing pickling quirks.

This is intentional — every provider call is one urllib request, and threads are the right primitive.

## Shell shebang on Windows

The shebang `#!/usr/bin/env python3` is a comment from Windows's perspective. The file is plain text, and Windows file association decides what runs it:

- File Explorer double-click: opens `.py` files with the default Python launcher if one is installed (we don't ship a `.py` extension, so this won't auto-resolve).
- `python scripts\web-search "..."`: explicit, always works.
- `py scripts\web-search "..."`: works if the py launcher (Python.org installers) is available.

If you want to wire up `web-search "..."` as a top-level command on Windows, drop a small batch file `web-search.cmd` in your PATH:

```cmd
@echo off
python "C:\path\to\skill\scripts\web-search" %*
```

Or a PowerShell function in your `$PROFILE`:

```powershell
function web-search { python "C:\path\to\skill\scripts\web-search" @Args }
```

## Containerization

Minimal Dockerfile that includes the skill plus `jq` and `rg` for the full pipeline experience:

```dockerfile
FROM python:3.12-slim
RUN apt-get update && apt-get install -y --no-install-recommends jq ripgrep ca-certificates && rm -rf /var/lib/apt/lists/*
COPY . /skill
WORKDIR /skill
RUN chmod +x scripts/web-search
ENTRYPOINT ["python3", "scripts/web-search"]
```

```bash
docker build -t web-search .
docker run --rm \
  -e TAVILY_API_KEY="$TAVILY_API_KEY" \
  -v /tmp/web-search:/tmp/web-search \
  web-search "kubernetes 1.31 release notes"
```

Mounting `/tmp/web-search` lets the host script consume the result files written inside the container. Pass keys via `-e ENV_VAR` or mount a config:

```bash
docker run --rm \
  -v $HOME/.config/web-search:/root/.config/web-search:ro \
  -v /tmp/web-search:/tmp/web-search \
  web-search "..."
```

## Known platform-specific gotchas

| OS | Symptom | Fix |
|---|---|---|
| macOS Sequoia under Apple sandbox | TMPDIR points to `/var/folders/...` not `/tmp/`; the skill still defaults to `/tmp/web-search` | Set `WEBSEARCH_TMP_DIR=$TMPDIR/web-search` if your sandbox forbids `/tmp` writes |
| Old Windows 10 builds (pre-1709) | `curl.exe` not in PATH | Install `curl` or use Python wrapper only |
| Alpine Linux minimal | Some `python3-minimal` lack `ssl` module | `apk add python3 ca-certificates` |
| WSL1 | Slow file I/O on `/mnt/c/...` | Run from WSL filesystem (`~`) for 10× speed-up |
| Corporate Windows with Zscaler / similar | Cert chain rewrites cause 525 / 526 / SSL errors | Install corporate root CA into Windows store; Python picks it up automatically |
| iOS Pythonista | `urllib` works but `concurrent.futures` is limited | Add `--parallelism 1` to disable threads |

## Verifying portability

Quick self-test that works on every supported OS:

```bash
python3 scripts/web-search --version
python3 scripts/web-search --list-providers
python3 scripts/web-search --check
python3 scripts/web-search --provider duckduckgo "hello world"
```

If the last line completes and writes a result file, the skill is ready on this host. The first three commands produce no network traffic — they only validate the config and print metadata.
