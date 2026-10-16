#!/usr/bin/env python3
"""My OS Harness · bridge local opcional p/ o Coding Agent (stdlib only).

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
import urllib.request
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import urlparse

BLOCK = [
    r"\brm\s+-rf\s+/", r"\bmkfs\b", r"\bdd\s+", r":\(\)\s*\{", r"\bshutdown\b",
    r"\breboot\b", r"\bpoweroff\b", r"\bhalt\b", r"\bcrontab\s+-r\b",
    r"/dev/(sda|nvme|hda)", r"\bchmod\s+-R\s+777\s+/", r"\bchown\s+-R\b\s+/\s",
]

MAX_BODY = 64 * 1024


YTI_KEY = "AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8"  # chave web pública do próprio youtube.com
YTI_URL = "https://www.youtube.com/youtubei/v1/search?key=" + YTI_KEY


def yti_search(query, timeout=12):
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
    server_version = "MyOSBridge/1.0"

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self):
        if urlparse(self.path).path == "/health":
            body = json.dumps({"ok": True, "root": self.server.root}).encode()
            self.send_response(200)
            self._cors()
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        else:
            self.send_error(404)

    def do_POST(self):
        path = urlparse(self.path).path
        if path not in ("/exec", "/ytsearch"):
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
        if not secrets.compare_digest(str(data.get("token") or ""), self.server.token):
            return self._err(403, "token inválido")
        if path == "/ytsearch":
            q = str(data.get("q") or "").strip()[:80]
            if len(q) < 2:
                return self._err(400, "q vazio")
            try:
                items = yti_search(q)
            except Exception as e:
                return self._err(502, "youtubei falhou: " + str(e)[:120])
            return self._json({"items": items})
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


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8787)
    ap.add_argument("--root", default=".")
    args = ap.parse_args()
    root = os.path.abspath(args.root)
    token = secrets.token_hex(16)
    print("token sha256: %s" % hashlib.sha256(token.encode()).hexdigest())
    srv = HTTPServer(("127.0.0.1", args.port), Handler)
    srv.root = root
    srv.token = token
    print("My OS bridge ON  http://127.0.0.1:%d  root=%s" % (args.port, root))
    print("TOKEN (cole no app): %s" % token)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
