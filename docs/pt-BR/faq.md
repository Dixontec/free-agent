# FAQ — My OS

**É grátis?** O app é MIT e gratuito. Groq tem plano grátis, Ollama/LM Studio são locais e gratuitos. OpenAI/Anthropic são pagas.

**Precisa de internet?** Para IA em nuvem e notícias, sim. Player local, rotinas sem `prompt:` e Ollama local funcionam offline.

**Onde ficam meus dados?** No seu navegador (`localStorage` `nexus:*`). Backup via Exportar JSON (sem chaves).

**Minhas chaves vão para algum servidor?** Não há servidor próprio — só chamadas diretas do seu navegador às APIs oficiais.

**Funciona no Windows/macOS?** Sim, é só HTML+JS+CSS. A skill Automação Linux gera `bash/crontab`; no Windows adapte para PowerShell/Agendador.

**Posso usar sem nenhuma IA?** Sim: `/news`, `/wiki`, música, rotinas sem prompt, lembretes e coding em Plan funcionam sem chave.

**Como desativo o fundo 3D?** Configurações → Aparência → Nenhum, ou `localStorage nexus:bg {"mode":"none"}`.

**Como reporto bug?** Abra issue com: navegador, provedor/modelo, passo a passo, print do Log filtrado (sem chaves).
