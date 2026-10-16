# Provedores — My OS

## Suportados

| Provedor | Tipo | Chave | Modelos padrão |
|---|---|---|---|
| Groq (recomendado) | nuvem OpenAI-compat | grátis em console.groq.com | `llama-3.3-70b-versatile`, `llama-3.1-8b-instant`, `mixtral-8x7b-32768`, `gemma2-9b-it` |
| OpenAI | nuvem | paga | `gpt-4o`, `gpt-4o-mini`, `gpt-4-turbo`, `o3-mini` |
| Gemini | nuvem | grátis/paga | `gemini-2.0-flash`, `gemini-1.5-pro/flash` |
| Anthropic | nuvem | paga | `claude-sonnet-4-20250514`, `claude-3-5-sonnet/haiku` |
| Ollama | local | nenhuma | `llama3.1`, `qwen2.5`, `mistral`, `gemma2`, `deepseek-r1` |
| LM Studio | local | nenhuma/`lm-studio` | os carregados no Server |
| OpenRouter | nuvem agregadora | paga/grátis | `llama-3.3-70b`, `gemini-2.0-flash`, `claude-3.5-sonnet`, `gpt-4o-mini` |

## Onde conseguir chaves (grátis para começar)

1. **Groq**: https://console.groq.com → API Keys → Create.
2. **Gemini**: https://aistudio.google.com → Get API key.
3. **OpenAI**: https://platform.openai.com → API keys.
4. **Anthropic**: https://console.anthropic.com.
5. **Ollama**: `ollama serve` + `ollama pull llama3.1` (sem chave).
6. **LM Studio**: aba Server → Start Server em `http://localhost:1234`.

## Configurar

`⚙ → Conexão & Modelo → Provedor → Modelo → API Key → Salvar → Testar conexão`. Temperatura (0–2) e max tokens (256–8192) ajustáveis. Botão **atualizar** lista modelos disponíveis para a sua chave.

## Privacidade

Chaves ficam em `localStorage` (`nexus:keys`). Saem do PC **só** nas chamadas diretas às APIs oficiais. Export/import passa por `stripSecrets()`.
