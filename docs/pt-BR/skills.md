# Skills — Free Agent

Skills são capacidades plugáveis que a IA pode invocar via `run_skill <slug>`.

## Padrão (10 ativas)

| Slug | Título | Ação automática |
|---|---|---|
| `pesquisa-web` | Pesquisa Web Profunda | — |
| `noticias-digest` | Digest de Notícias | `noticias: tecnologia` |
| `rotina-manha` | Rotina da Manhã 08:00 | youtube + noticias |
| `youtube-player` | YouTube Player | — |
| `musica-foco` | Música & Foco | `musica: ...` |
| `abridor-apps` | Abridor de Apps & Sites | — |
| `resumo-texto` | Resumo Inteligente | — |
| `automacao-linux` | Automação Linux | — |
| `busca-multi` | Busca Multi-Provedor | — |
| `navegador-web` | Navegador Nexus | — |

## Criar a sua

1. Aba **Skills → Nova skill**.
2. Preencha: slug (`minha-pesquisa`), ícone Lucide (`search`), título, descrição, **system prompt da skill**, ação opcional.
3. Salve e ative. Chame no chat: `/skill minha-pesquisa` ou peça em linguagem natural.

## Regras do harness (v2)

- Schemas sob demanda: o modelo vê só nomes + 1 linha por skill, não os prompts inteiros (economia de contexto).
- Slug inexistente/inativo → pendência `skill` (o app lista os slugs válidos em vez de inventar).
- Skill opcional avançada em `.agents/skills/web-search/` (multi-provedor: Exa, Tavily, Brave, Serper, Perplexity, xAI, Z-AI + gratuitos DDG/MWMBL). Config por `config.example.json` + variáveis de ambiente — **nunca commite chaves reais**.

## Dica de prompt de skill

```
Você é um [papel]. Sempre: 1) use os dados fornecidos,
2) responda em português, 3) cite fontes com links,
4) termine com [formato fixo]. Se faltar dado, diga o que falta.
```
