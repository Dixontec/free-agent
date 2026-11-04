# Servidor de voz local (Kokoro TTS + faster-whisper STT)

Voz de alta qualidade, 100% offline e sem custo, usada pelo modo **conversa em tempo real** (`Alt+V`).
Sem ele rodando, o app cai sozinho para os motores do navegador (nada quebra).

## No app empacotado (usuário final)

Nada a instalar. O build (`npm run dist`) embute:

- um **CPython portátil** + dependências do TTS (`vendor/voice/`, gerado por `scripts/build-voice.mjs`);
- os **modelos** do Kokoro (`voice-server/models/`).

No app instalado eles ficam em `resources/voice/` e o Electron sobe o servidor
automaticamente em `127.0.0.1:8880`. Não há download em tempo de execução.

## Desenvolvimento

Modelos (uma vez):

```bash
npm run voice:models      # baixa kokoro-v1.0.onnx + voices-v1.0.bin (~340 MB)
```

Runtime de voz embutido (recomendado — é o mesmo do app):

```bash
npm run voice:bundle      # monta vendor/voice (CPython portátil + deps)
npm run voice             # roda o servidor manualmente, se quiser
```

Alternativa com venv do sistema:

```bash
cd voice-server
uv venv .venv --python 3.12
VIRTUAL_ENV=.venv uv pip install -r requirements-dev.txt
.venv/bin/python voice_server.py --port 8880
```

Depois, em **Configurações → Voz** escolha a voz Kokoro (🇧🇷 `pf_dora`, `pm_alex`, `pm_santana` são em português).

## Variáveis

- `STT_MODEL` — modelo do faster-whisper (`tiny`, `base` padrão, `small`). `small` é mais preciso e ~3× mais lento.
- `KOKORO_LANG` — idioma do fonemizador (padrão `pt-br`).
- `KOKORO_ONNX` / `KOKORO_VOICES` — caminhos alternativos para os modelos.
