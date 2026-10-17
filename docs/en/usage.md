# Usage — Free Agent

## Chat

- `Enter` sends, `Shift+Enter` newline. `Ctrl+Space` voice input.
- Quick buttons on top: **Web search**, **Today's news**, **08:00 routine** (editable, click `+` for your own).
- Attach text with 📎 to summarize documents.

## Commands

| Command | What it does | Needs AI? |
|---|---|---|
| `/news <topic>` | headlines via RSS/HN | no |
| `/wiki <term>` | PT Wikipedia summary | no |
| `/yt <link or query>` | embeds video / bridge search | no (search uses bridge) |
| `/routine 08:00` | creates morning routine | partial |
| `/skill <slug>` | runs catalog skill | yes |
| `play <name>` | finds & plays free music | no |
| `download <name>` | downloads free MP3 | no |
| `pause` / `next` | player control | no |
| `remind me at 14:30 to X` | voice reminder | no |
| `create a task X` | saves to Tasks tab | yes* |

\* Tasks can also be created keyless via the Tasks tab form.

## Routines, Skills, Tasks, Reminders, Music, Log

- **Routines**: `musica:` · `youtube:` · `noticias:` · `prompt:` · `abrir:` · `skill:` (one per line). Scheduled by time + weekdays.
- **Skills**: enable/disable, edit prompt & action, create your own (slug, Lucide icon, title, prompt).
- **Tasks**: the AI may only claim creation if `create_task` actually ran (verifier blocks false confirmations).
- **Music**: Archive.org + Wikimedia search, queue, volume, MP3 download, authorized local folder.
- **Log**: everything (events, tools, errors, latency, model, checks). Filter, copy or export — export is always keyless.

## Core, themes, background

- **Core** (orbit button): HUD with live activity, max 6 windows.
- **Themes**: Light · Dark · Glass. **Background**: 3D Core + Aurora, 3D only, Aurora only, custom image or plain. Adjustable intensity/blur; `window.__bg3dEnabled=false` kills 3D with zero loop impact.
- **Rest screen**: clock overlay after N idle minutes (SPACE wakes).

## Mental shortcuts

- Ask for fresh data → harness researches and cites sources, or marks pending.
- Ask to open something → it asks for confirmation first.
- Answer without links after research → it auto-appends real `Sources:` or marks pending.
