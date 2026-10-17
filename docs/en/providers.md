# Providers — Free Agent

## Supported

| Provider | Type | Key | Default models |
|---|---|---|---|
| Groq (recommended) | OpenAI-compat cloud | free at console.groq.com | `llama-3.3-70b-versatile`, `llama-3.1-8b-instant`, `mixtral-8x7b-32768`, `gemma2-9b-it` |
| OpenAI | cloud | paid | `gpt-4o`, `gpt-4o-mini`, `gpt-4-turbo`, `o3-mini` |
| Gemini | cloud | free/paid | `gemini-2.0-flash`, `gemini-1.5-pro/flash` |
| Anthropic | cloud | paid | `claude-sonnet-4-20250514`, `claude-3-5-sonnet/haiku` |
| Ollama | local | none | `llama3.1`, `qwen2.5`, `mistral`, `gemma2`, `deepseek-r1` |
| LM Studio | local | none/`lm-studio` | whatever is loaded in Server |
| OpenRouter | aggregator cloud | paid/free | `llama-3.3-70b`, `gemini-2.0-flash`, `claude-3.5-sonnet`, `gpt-4o-mini` |

## Where to get keys (free to start)

1. **Groq**: https://console.groq.com → API Keys → Create.
2. **Gemini**: https://aistudio.google.com → Get API key.
3. **OpenAI**: https://platform.openai.com → API keys.
4. **Anthropic**: https://console.anthropic.com.
5. **Ollama**: `ollama serve` + `ollama pull llama3.1` (no key).
6. **LM Studio**: Server tab → Start Server at `http://localhost:1234`.

## Configure

`⚙ → Connection & Model → Provider → Model → API Key → Save → Test connection`. Temperature (0–2) and max tokens (256–8192) adjustable. **Refresh** lists models available for your key.

## Privacy

Keys live in `localStorage` (`nexus:keys`). They leave your PC **only** in direct calls to official APIs. Export/import goes through `stripSecrets()`.
