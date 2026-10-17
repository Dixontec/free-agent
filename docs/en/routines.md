# Routines — Free Agent

Routines are time-scheduled automations. Classic example: every day at 08:00.

## Create (UI)

1. **Routines tab → New routine**.
2. Name: `Morning routine`. Time: `08:00`. Repeat: `Daily` + weekdays.
3. Actions (one per line):

```
musica: https://www.youtube.com/watch?v=VIDEO_ID
noticias: technology
prompt: Good morning! Summarize the news and plan my day with 3 priorities.
abrir: https://gmail.com
```

4. Save. At time, the app plays, fetches, asks the AI and opens — with notification + voice.

## Action syntax

| Action | Format | Example |
|---|---|---|
| `musica:` | YouTube URL or query | `musica: lofi` |
| `youtube:` | YouTube URL (embed) | `youtube: https://www.youtube.com/watch?v=...` |
| `noticias:` | free topic | `noticias: economy` |
| `prompt:` | instruction for the AI | `prompt: Summarize my day` |
| `abrir:` | http(s) URL | `abrir: https://gmail.com` |
| `skill:` | catalog slug | `skill: noticias-digest` |

Unknown line → routine is **not** marked done (`assertRoutine` blocks and shows the pending item).

## Via chat

```
Create a morning routine for 08:00 that plays my music,
shows tech news and opens my gmail.
```

## Best practices

- One routine per context (morning, focus, night). Avoid 10 actions in one.
- `prompt:` last — so the AI already has news/music as context.
- For off-browser scripts (boot apps, backup), use the **Linux automation** skill — it generates explained `bash + crontab`.
