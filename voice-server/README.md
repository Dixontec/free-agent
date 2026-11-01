# Servidor de voz local (Kokoro TTS + faster-whisper STT)

Voz de alta qualidade, 100% offline e sem custo, usada pelo modo **conversa em tempo real** (`Alt+V`).
Sem ele rodando, o app cai sozinho para os motores do navegador (nada quebra).

## Instalação (uma vez)
```bash
cd voice-server
uv venv .venv --python 3.12
VIRTUAL_ENV=.venv uv pip install kokoro-onnx faster-whisper soundfile numpy
mkdir -p models && cd models
curl -LO https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.onnx
curl -LO https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin
```

## Rodar
```bash
npm run voice          # a partir da raiz do repo (porta 8880, só 127.0.0.1)
```
Depois, em **Configurações → Voz** escolha a voz Kokoro (🇧🇷 `pf_dora`, `pm_alex`, `pm_santa` são em português).

## Variáveis
- `STT_MODEL` — modelo do faster-whisper (`tiny`, `base` padrão, `small`). `small` é mais preciso e ~3× mais lento.
- `KOKORO_LANG` — idioma do fonemizador (padrão `pt-br`).
