#!/usr/bin/env python3
"""Free Agent · servidor de voz LOCAL (Kokoro TTS + faster-whisper STT), 100% offline e sem custo.

  POST /v1/audio/speech   {"input","voice","speed"}  -> audio/wav   (compatível com OpenAI)
  GET  /v1/audio/voices                              -> {"voices":[...]}
  POST /stt               corpo = PCM int16 16 kHz mono  -> {"text": "..."}
  GET  /health

Uso (a partir da raiz do repo):
    voice-server/.venv/bin/python voice-server/voice_server.py [--port 8880]

Modelos: voice-server/models/kokoro-v1.0.onnx + voices-v1.0.bin (veja voice-server/README.md).
STT: faster-whisper baixa o modelo na 1ª execução (env STT_MODEL, padrão 'base').
Escuta só em 127.0.0.1. Sem isso rodando, o app cai para os motores no navegador (nada quebra).
"""
import argparse
import io
import json
import os
import struct
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
MODELS = os.path.join(HERE, "models")
KOKORO_ONNX = os.environ.get("KOKORO_ONNX", os.path.join(MODELS, "kokoro-v1.0.onnx"))
KOKORO_VOICES = os.environ.get("KOKORO_VOICES", os.path.join(MODELS, "voices-v1.0.bin"))
STT_MODEL = os.environ.get("STT_MODEL", "base")
LANG = os.environ.get("KOKORO_LANG", "pt-br")
MAX_BODY = 8 * 1024 * 1024

_kokoro = None
_whisper = None
_tts_lock = threading.Lock()
_stt_lock = threading.Lock()


def load_kokoro():
    global _kokoro
    from kokoro_onnx import Kokoro
    _kokoro = Kokoro(KOKORO_ONNX, KOKORO_VOICES)
    return _kokoro


def load_whisper():
    global _whisper
    from faster_whisper import WhisperModel
    _whisper = WhisperModel(STT_MODEL, device="cpu", compute_type="int8", cpu_threads=max(4, (os.cpu_count() or 8) // 2))
    return _whisper


def wav_bytes(samples, sr):
    pcm = (np.clip(samples, -1.0, 1.0) * 32767).astype("<i2").tobytes()
    hdr = b"RIFF" + struct.pack("<I", 36 + len(pcm)) + b"WAVEfmt " + struct.pack("<IHHIIHH", 16, 1, 1, sr, sr * 2, 2, 16) + b"data" + struct.pack("<I", len(pcm))
    return hdr + pcm


def synth(text, voice, speed):
    with _tts_lock:
        samples, sr = _kokoro.create(text, voice=voice, speed=float(speed or 1.0), lang=LANG)
    return wav_bytes(samples, sr)


def transcribe(pcm_bytes):
    audio = np.frombuffer(pcm_bytes, dtype="<i2").astype(np.float32) / 32768.0
    with _stt_lock:
        segs, _ = _whisper.transcribe(audio, language="pt", beam_size=1, vad_filter=False,
                                      condition_on_previous_text=False, without_timestamps=True,
                                      temperature=0.0)
        return " ".join(s.text.strip() for s in segs).strip()


class H(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.send_header("Access-Control-Allow-Private-Network", "true")

    def _send(self, code, body, ctype):
        self.send_response(code)
        self._cors()
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _json(self, obj, code=200):
        self._send(code, json.dumps(obj, ensure_ascii=False).encode("utf-8"), "application/json; charset=utf-8")

    def _body(self):
        n = int(self.headers.get("Content-Length") or 0)
        if n > MAX_BODY:
            raise ValueError("corpo grande demais")
        return self.rfile.read(n)

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_GET(self):
        if self.path.startswith("/health"):
            return self._json({"ok": True, "tts": _kokoro is not None, "stt": _whisper is not None, "stt_model": STT_MODEL})
        if self.path.startswith("/v1/audio/voices"):
            vs = sorted(v for v in _kokoro.get_voices())
            vs.sort(key=lambda v: (not v.startswith(("pf_", "pm_")), v))  # português primeiro
            return self._json({"voices": vs})
        self._json({"error": "not found"}, 404)

    def do_POST(self):
        try:
            if self.path.startswith("/v1/audio/speech"):
                j = json.loads(self._body() or b"{}")
                text = str(j.get("input") or "").strip()
                if not text:
                    return self._json({"error": "input vazio"}, 400)
                t0 = time.time()
                wav = synth(text[:1000], j.get("voice") or "pf_dora", j.get("speed") or 1.0)
                print(f"[tts] {len(text)} chars -> {len(wav)//1024} KB em {int((time.time()-t0)*1000)} ms", flush=True)
                return self._send(200, wav, "audio/wav")
            if self.path.startswith("/stt"):
                pcm = self._body()
                t0 = time.time()
                text = transcribe(pcm)
                print(f"[stt] {len(pcm)/32000:.1f}s de áudio em {int((time.time()-t0)*1000)} ms -> {text!r}", flush=True)
                return self._json({"text": text})
            self._json({"error": "not found"}, 404)
        except Exception as e:  # nunca derruba o servidor
            print("[erro]", repr(e), file=sys.stderr, flush=True)
            self._json({"error": str(e)[:300]}, 500)

    def log_message(self, fmt, *args):
        pass


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8880)
    ap.add_argument("--no-stt", action="store_true", help="só TTS (não carrega o Whisper)")
    a = ap.parse_args()
    if not (os.path.exists(KOKORO_ONNX) and os.path.exists(KOKORO_VOICES)):
        sys.exit(f"Modelos do Kokoro não encontrados em {MODELS} — veja voice-server/README.md")
    t = time.time(); load_kokoro(); print(f"[kokoro] carregado em {time.time()-t:.1f}s", flush=True)
    t = time.time(); synth("Olá, tudo bem?", "pf_dora", 1.0); print(f"[kokoro] aquecido em {time.time()-t:.2f}s", flush=True)
    if not a.no_stt:
        t = time.time(); load_whisper(); print(f"[whisper:{STT_MODEL}] carregado em {time.time()-t:.1f}s", flush=True)
        t = time.time(); transcribe(np.zeros(16000, dtype="<i2").tobytes()); print(f"[whisper] aquecido em {time.time()-t:.2f}s", flush=True)
    srv = ThreadingHTTPServer(("127.0.0.1", a.port), H)
    print(f"Voz local pronta em http://127.0.0.1:{a.port}  (TTS Kokoro{'' if a.no_stt else ' + STT faster-whisper'})", flush=True)
    srv.serve_forever()


if __name__ == "__main__":
    main()
