# Nexus · Harness de IA Premium (estilo Apple)

Aplicação web **linda, premium e 100% local-first** para orquestrar IAs, rotinas e skills.

## O que tem

- **Design Apple premium** com **3 temas**: Light · Dark · Glass translúcido
- **Fundo 3D Three.js** interativo (núcleo + anéis orbitais + 900 partículas, reage ao mouse)
- **Provedores de IA**: Groq · OpenAI · Gemini · Anthropic · Ollama local · OpenRouter
  - Seletor de **provedor + modelo**, temperatura, max tokens, teste de conexão
  - Chaves salvas **só no seu navegador** (`localStorage`)
- **Chat harness** com comandos: `/news <tema>` · `/wiki <termo>` · `/yt <link>` · `/rotina 08:00` · `/skill <nome>`
- **Rotinas agendadas**: ex. todo dia 08:00 → tocar música + vídeo YouTube + notícias + abrir apps + prompt de IA. Scheduler + notificações.
- **8 skills pré-configuradas e pesquisadas**: pesquisa web, digest de notícias, rotina da manhã, YouTube player, música & foco, abridor de apps, resumo inteligente, automação Linux — + **crie as suas** (nome, ícone, prompt, ação).
- **Tarefas com IA** (executar com 1 clique), **log**, **export/import** de tudo em JSON.

## Como rodar

```bash
cd nexus-harness
python3 -m http.server 8080
# abra http://localhost:8080
```

> Use um servidor local (não `file://`) para os módulos Three.js via CDN funcionarem.

## Chaves (grátis para começar)

1. **Groq (recomendado, grátis e ultra-rápido)**: https://console.groq.com → API Keys
2. **Gemini**: https://aistudio.google.com → Get API key
3. OpenAI: https://platform.openai.com → API keys
4. Anthropic: https://console.anthropic.com
5. **Ollama (sem chave)**: `ollama serve` + `ollama pull llama3.1`

## Exemplo — Rotina da manhã 08:00

```
musica: https://www.youtube.com/watch?v=jfKfPfyJRdk
noticias: tecnologia
prompt: Bom dia! Resuma as notícias e monte minha agenda com 3 prioridades.
abrir: https://gmail.com
```

Sintaxe de ações: `musica:` · `youtube:` · `noticias:` · `prompt:` · `abrir:` · `skill:`

## Estrutura

```
nexus-harness/
├── index.html      # layout Apple (topbar, sidebar, chat, painel)
├── styles.css      # light / dark / glass + glassmorphism
└── js/
    ├── three-bg.js # fundo 3D Three.js
    ├── skills.js   # catálogo padrão de 8 skills
    └── app.js      # providers, chat, rotinas, skills, tarefas
```
