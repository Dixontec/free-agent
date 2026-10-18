#!/usr/bin/env python3
"""Free Agent Harness · bridge local opcional p/ o Coding Agent (stdlib only).

Permite ao app (100% front-end) executar comandos shell DENTRO desta pasta,
com token + jail de diretório + blocklist + timeout. Fail closed por padrão.

Uso:
    python3 bridge.py [--port 8787] [--root .]

O token é impresso no terminal — cole em Configurações → Coding → Bridge.
Sem bridge rodando, a tool code_bash nega com orientação (nada quebra).
"""
import argparse
import hashlib
import json
import os
import re
import secrets
import subprocess
import sys
import threading
import time
import urllib.request
from collections import deque
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, unquote

BLOCK = [
    r"\brm\s+-rf\s+/", r"\bmkfs\b", r"\bdd\s+", r":\(\)\s*\{", r"\bshutdown\b",
    r"\breboot\b", r"\bpoweroff\b", r"\bhalt\b", r"\bcrontab\s+-r\b",
    r"/dev/(sda|nvme|hda)", r"\bchmod\s+-R\s+777\s+/", r"\bchown\s+-R\b\s+/\s",
]

MAX_BODY = 64 * 1024

# MIME p/ servir os arquivos do app (serve.py / bridge em modo servidor único)
MIME = {
    ".html": "text/html; charset=utf-8", ".htm": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp",
    ".ico": "image/x-icon", ".woff": "font/woff", ".woff2": "font/woff2",
    ".ttf": "font/ttf", ".txt": "text/plain; charset=utf-8",
    ".md": "text/plain; charset=utf-8", ".map": "application/json; charset=utf-8",
}

# ── Telegram Bot API (proxy local: o navegador não consegue chamar api.telegram.org
# por causa de CORS — a bridge faz a chamada e devolve o JSON. Nenhum token é guardado
# aqui: o app envia o token do bot a cada chamada e ele só vive no navegador do usuário).
TG_ALLOW = {
    "getMe", "getUpdates", "sendMessage", "sendChatAction",
    "setMyCommands", "deleteWebhook", "getWebhookInfo",
}


def tg_call(tg_token, method, params, timeout=25):
    if method not in TG_ALLOW:
        raise RuntimeError("método Telegram não permitido: " + method)
    if not re.fullmatch(r"\d{6,12}:[A-Za-z0-9_-]{30,}", tg_token or ""):
        raise RuntimeError("token do bot em formato inválido")
    url = "https://api.telegram.org/bot%s/%s" % (tg_token, method)
    body = json.dumps(params or {}).encode()
    req = urllib.request.Request(
        url, data=body, headers={"Content-Type": "application/json"}, method="POST"
    )
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.load(r)


# ── Telegram long-polling (thread gerenciada pelo app) ──
# O processo NÃO sobe sozinho: o app chama /tg-start ao conectar e /tg-stop ao
# desconectar. As mensagens recebidas ficam numa fila (inbox) que o navegador
# consome via /tg-inbox; as respostas saem por /tg-send. Token vive só na RAM
# desta thread — nunca em disco. O harness (browser) é quem responde.
TG = {
    "running": False, "token": "", "chat_id": "",
    "offset": 0, "inbox": deque(maxlen=200),
    "error": "", "received": 0, "sent": 0,
    "bot": "", "stop": None, "thread": None,
}
TG_LOCK = threading.Lock()


def _tg_loop():
    while True:
        with TG_LOCK:
            if not TG["running"]:
                return
            token, offset = TG["token"], TG["offset"]
        try:
            res = tg_call(token, "getUpdates",
                          {"timeout": 20, "offset": offset,
                           "allowed_updates": ["message"]}, timeout=30)
            updates = res.get("result") if isinstance(res, dict) else None
            if isinstance(updates, list):
                with TG_LOCK:
                    for u in updates:
                        TG["offset"] = max(TG["offset"], (u.get("update_id") or 0) + 1)
                        msg = u.get("message")
                        if not msg or not msg.get("text"):
                            continue
                        if TG["chat_id"] and str(msg.get("chat", {}).get("id")) != str(TG["chat_id"]):
                            continue
                        TG["inbox"].append({
                            "chatId": msg.get("chat", {}).get("id"),
                            "text": msg.get("text"),
                            "from": (msg.get("from") or {}).get("first_name") or "",
                        })
                        TG["received"] += 1
        except Exception as e:
            with TG_LOCK:
                TG["error"] = str(e)[:160]
            if "401" in str(e) or "Unauthorized" in str(e):
                with TG_LOCK:
                    TG["running"] = False
                    TG["error"] = "token inválido ou bot desativado"
                return
            time.sleep(3)
        time.sleep(0.4)


def tg_start(token, chat_id=""):
    if not re.fullmatch(r"\d{6,12}:[A-Za-z0-9_-]{30,}", token or ""):
        raise RuntimeError("token do bot em formato inválido")
    with TG_LOCK:
        if TG["running"]:
            return TG["bot"]
    me = tg_call(token, "getMe", {})
    with TG_LOCK:
        TG.update(running=True, token=token, chat_id=str(chat_id or ""),
                  offset=0, error="", inbox=deque(maxlen=200),
                  bot=(me.get("result") or {}).get("username") or "")
        TG["stop"] = threading.Event()
    t = threading.Thread(target=_tg_loop, daemon=True)
    with TG_LOCK:
        TG["thread"] = t
    t.start()
    return TG["bot"]


def tg_stop():
    with TG_LOCK:
        TG["running"] = False
        stop = TG.get("stop")
        if stop:
            stop.set()
        TG["token"] = ""
    return True


def tg_status():
    with TG_LOCK:
        return {
            "running": TG["running"], "error": TG["error"],
            "received": TG["received"], "sent": TG["sent"],
            "bot": TG["bot"], "chatId": TG["chat_id"],
        }


def tg_inbox():
    with TG_LOCK:
        msgs = list(TG["inbox"])
        TG["inbox"].clear()
    return msgs


def tg_send(chat_id, text):
    with TG_LOCK:
        token = TG["token"]
    if not token:
        raise RuntimeError("Telegram não está conectado")
    out = tg_call(token, "sendMessage", {"chat_id": chat_id, "text": str(text)[:4000]})
    with TG_LOCK:
        TG["sent"] += 1
    return out


# Busca no YouTube via endpoint youtubei.
# A chave é lida de YOUTUBE_API_KEY (nunca commite chaves no repositório).
# Sem chave, /ytsearch responde 501 com orientação — nada quebra.
YTI_KEY = os.environ.get("YOUTUBE_API_KEY", "")
YTI_URL = "https://www.youtube.com/youtubei/v1/search?key=" + YTI_KEY if YTI_KEY else ""


def yti_search(query, timeout=12):
    if not YTI_KEY:
        raise RuntimeError("defina YOUTUBE_API_KEY no ambiente para ativar /ytsearch")
    body = json.dumps({
        "context": {"client": {"clientName": "WEB", "clientVersion": "2.20250101.00.00", "hl": "pt", "gl": "BR"}},
        "query": query[:80],
    }).encode()
    req = urllib.request.Request(YTI_URL, data=body, headers={"Content-Type": "application/json", "User-Agent": "Mozilla/5.0"}, method="POST")
    with urllib.request.urlopen(req, timeout=timeout) as r:
        data = json.load(r)
    out = []

    def walk(o):
        if len(out) >= 5:
            return
        if isinstance(o, dict):
            t = o.get("title")
            if o.get("videoId") and isinstance(t, dict):
                name = "".join(x.get("text", "") for x in t.get("runs", []))
                if name and (o["videoId"], name) not in out:
                    out.append((o["videoId"], name[:80]))
                if len(out) >= 5:
                    return
            for v in o.values():
                walk(v)
        elif isinstance(o, list):
            for v in o:
                walk(v)

    walk(data)
    return [{"id": vid, "title": name} for vid, name in out]


class Handler(BaseHTTPRequestHandler):
    server_version = "FreeAgentBridge/1.0"

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self):
        p = urlparse(self.path).path
        if p == "/health":
            body = json.dumps({"ok": True, "root": self.server.root}).encode()
            self.send_response(200)
            self._cors()
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        elif p == "/tg-status":
            return self._json(tg_status())
        else:
            return self._serve_static()

    def _serve_static(self):
        root = os.path.abspath(self.server.root)
        path = unquote(urlparse(self.path).path)
        if path.endswith("/"):
            path += "index.html"
        if path == "":
            path = "/index.html"
        fs = os.path.abspath(os.path.join(root, path.lstrip("/")))
        if fs != root and not fs.startswith(root + os.sep):
            return self._err(403, "fora da raiz")
        if os.path.isdir(fs):
            fs = os.path.join(fs, "index.html")
        if not os.path.isfile(fs):
            return self._err(404, "não encontrado")
        try:
            with open(fs, "rb") as f:
                data = f.read()
        except OSError:
            return self._err(500, "erro de leitura")
        ctype = MIME.get(os.path.splitext(fs)[1].lower(), "application/octet-stream")
        self.send_response(200)
        self._cors()
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        self.wfile.write(data)

    def do_POST(self):
        path = urlparse(self.path).path
        if path not in ("/exec", "/ytsearch", "/tg", "/tg-start", "/tg-stop", "/tg-inbox", "/tg-send"):
            self.send_error(404)
            return
        try:
            n = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            n = 0
        if n <= 0 or n > MAX_BODY:
            return self._err(400, "body inválido")
        try:
            data = json.loads(self.rfile.read(n).decode("utf-8", "replace"))
        except Exception:
            return self._err(400, "JSON inválido")
        # /tg* : dispensa o token da bridge (as rotas do Telegram já exigem o token
        # do bot, e a bridge só escuta em 127.0.0.1 — nada sai da máquina). /exec
        # continua exigindo token (é shell). /ytsearch mantém o comportamento atual.
        if not path.startswith("/tg"):
            if not secrets.compare_digest(str(data.get("token") or ""), self.server.token):
                return self._err(403, "token inválido")
        if path == "/tg-start":
            try:
                bot = tg_start(str(data.get("token") or ""), str(data.get("chatId") or ""))
            except Exception as e:
                return self._err(502, "telegram: " + str(e)[:160])
            return self._json({"ok": True, "bot": bot})
        if path == "/tg-stop":
            tg_stop()
            return self._json({"ok": True})
        if path == "/tg-inbox":
            return self._json({"ok": True, "messages": tg_inbox()})
        if path == "/tg-send":
            try:
                tg_send(data.get("chatId"), str(data.get("text") or ""))
            except Exception as e:
                return self._err(502, "telegram: " + str(e)[:160])
            return self._json({"ok": True})
        if path == "/ytsearch":
            q = str(data.get("q") or "").strip()[:80]
            if len(q) < 2:
                return self._err(400, "q vazio")
            try:
                items = yti_search(q)
            except Exception as e:
                return self._err(502, "youtubei falhou: " + str(e)[:120])
            return self._json({"items": items})
        if path == "/tg":
            tg_token = str(data.get("tgToken") or "")
            method = str(data.get("method") or "")
            params = data.get("params") or {}
            if not isinstance(params, dict):
                return self._err(400, "params deve ser objeto")
            try:
                out = tg_call(tg_token, method, params)
            except Exception as e:
                return self._err(502, "telegram: " + str(e)[:160])
            # `out` já é a resposta crua do Telegram ({ok, result}). Devolve direto
            # para o app ler j.result — sem envelope duplo (que quebrava getUpdates).
            return self._json(out)
        cmd = str(data.get("cmd") or "")[:4000].strip()
        if not cmd:
            return self._err(400, "cmd vazio")
        for pat in BLOCK:
            if re.search(pat, cmd):
                return self._err(403, "comando bloqueado pela bridge: " + pat)
        try:
            timeout = min(120, max(1, int(data.get("timeoutMs") or 30000) / 1000))
        except (TypeError, ValueError):
            timeout = 30
        try:
            p = subprocess.run(
                cmd, shell=True, cwd=self.server.root, capture_output=True,
                text=True, timeout=timeout,
                env={"PATH": os.environ.get("PATH", "/usr/bin:/bin"),
                     "HOME": os.environ.get("HOME", ""), "LANG": "C.UTF-8"},
            )
            out = {"code": p.returncode, "stdout": p.stdout[-6000:], "stderr": p.stderr[-3000:]}
        except subprocess.TimeoutExpired as e:
            out = {"code": 124, "stdout": (e.stdout or "")[-6000:] if isinstance(e.stdout, str) else "",
                   "stderr": "timeout após %ss" % timeout}
        body = json.dumps(out).encode()
        self.send_response(200)
        self._cors()
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _json(self, obj, code=200):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self._cors()
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _err(self, code, msg):
        body = json.dumps({"error": msg}).encode()
        self.send_response(code)
        self._cors()
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt, *args):
        sys.stderr.write("bridge: " + fmt % args + "\n")


def serve(port=8787, root="."):
    root = os.path.abspath(root)
    token = secrets.token_hex(16)
    print("token sha256: %s" % hashlib.sha256(token.encode()).hexdigest())
    srv = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    srv.root = root
    srv.token = token
    print("Free Agent ON  http://127.0.0.1:%d  root=%s" % (port, root))
    print("TOKEN (cole no app): %s" % token)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


def main(default_port=8787):
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=default_port)
    ap.add_argument("--root", default=".")
    args = ap.parse_args()
    serve(args.port, args.root)


if __name__ == "__main__":
    main()
