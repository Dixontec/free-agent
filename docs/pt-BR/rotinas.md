# Rotinas — Free Agent

Rotinas são automações agendadas por horário. Exemplo clássico: todo dia 08:00.

## Criar (interface)

1. Aba **Rotinas → Nova rotina**.
2. Nome: `Rotina da manhã`. Hora: `08:00`. Repetir: `Todo dia` + dias S T Q Q S S D.
3. Ações (uma por linha):

```
musica: https://www.youtube.com/watch?v=VIDEO_ID
noticias: tecnologia
prompt: Bom dia! Resuma as notícias e monte minha agenda com 3 prioridades.
abrir: https://gmail.com
```

4. Salvar. No horário, o app toca, busca, pergunta à IA e abre — com notificação + voz.

## Sintaxe de ações

| Ação | Formato | Exemplo |
|---|---|---|
| `musica:` | URL YouTube ou busca | `musica: lofi` |
| `youtube:` | URL YouTube (embed) | `youtube: https://www.youtube.com/watch?v=...` |
| `noticias:` | tema livre | `noticias: economia` |
| `prompt:` | instrução para a IA | `prompt: Resuma meu dia` |
| `abrir:` | URL http(s) | `abrir: https://gmail.com` |
| `skill:` | slug do catálogo | `skill: noticias-digest` |

Linha desconhecida → a rotina **não** é marcada como concluída (verificador `assertRoutine` trava e mostra a pendência).

## Via chat

```
Crie uma rotina da manhã para as 08:00 que toca minha música,
mostra notícias de tecnologia e abre meu gmail.
```

## Boas práticas

- Uma rotina por contexto (manhã, foco, noite). Evite 10 ações numa só.
- `prompt:` por último — assim a IA já recebe notícias/música como contexto.
- Para scripts fora do navegador (abrir apps no boot, backup), use a skill **Automação Linux** — ela gera `bash + crontab` explicados.
