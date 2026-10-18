#!/usr/bin/env python3
"""Free Agent · servidor único — app + ponte (Telegram/Coding) num processo.

Uso:
    python3 serve.py [--port 8080] [--root .]

Sobe a MESMA porta que o app (8080) e serve os arquivos estáticos do Free Agent
ALÉM de /health, /exec, /ytsearch e as rotas /tg-* (long-polling do bot).
Assim "Conectar bot" funciona instantaneamente: o app encontra /health na própria
origem (location.origin), sem precisar de ponte separada nem de código manual.
"""
from bridge import main

if __name__ == "__main__":
    main(default_port=8080)
