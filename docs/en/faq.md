# FAQ — My OS

**Free?** The app is MIT and free. Groq has a free tier, Ollama/LM Studio are local and free. OpenAI/Anthropic are paid.

**Offline?** Cloud AI and news need internet. Local player, prompt-less routines and local Ollama work offline.

**Where is my data?** In your browser (`localStorage` `nexus:*`). Backup via Export JSON (keyless).

**Do my keys go to any server?** There is no proprietary server — only direct calls from your browser to official APIs.

**Windows/macOS?** Yes, it's just HTML+JS+CSS. The Linux Automation skill generates `bash/crontab`; on Windows adapt to PowerShell/Scheduler.

**Can I use it with no AI at all?** Yes: `/news`, `/wiki`, music, prompt-less routines, reminders and Plan coding work keyless.

**How to disable 3D background?** Settings → Appearance → None, or `localStorage nexus:bg {"mode":"none"}`.

**How to report a bug?** Open an issue with: browser, provider/model, repro steps, filtered Log screenshot (no keys).
