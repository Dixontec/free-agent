# Uso — Free Agent

## Chat

- `Enter` envia, `Shift+Enter` quebra linha. `Ctrl+Espaço` dita por voz.
- Botões rápidos no topo: **Pesquisar web**, **Notícias de hoje**, **Rotina 08:00** (editáveis, clique `+` para criar os seus).
- Anexe texto com o clipe 📎 para resumir documentos.

## Comandos

| Comando | O que faz | Precisa de IA? |
|---|---|---|
| `/news <tema>` | manchetes via RSS/HN | não |
| `/wiki <termo>` | resumo da Wikipédia PT | não |
| `/yt <link ou busca>` | embute vídeo / busca via bridge | não (busca usa bridge) |
| `/rotina 08:00` | cria rotina da manhã | parcial |
| `/skill <slug>` | executa skill do catálogo | sim |
| `toca <nome>` | busca e toca música livre | não |
| `baixa <nome>` | baixa MP3 livre | não |
| `pausa` / `próxima` | controla player | não |
| `me lembre às 14:30 de X` | cria lembrete com voz | não |
| `crie uma tarefa X` | salva na aba Tarefas | sim* |

\* Tarefas podem ser criadas sem IA pelo formulário da aba **Tarefas**.

## Rotinas, Skills, Tarefas, Lembretes, Música, Log

- **Rotinas**: `musica:` · `youtube:` · `noticias:` · `prompt:` · `abrir:` · `skill:` (uma por linha). Agendam por horário + dias.
- **Skills**: ative/desative, edite prompt e ação, crie as suas (slug, ícone Lucide, título, prompt).
- **Tarefas**: a IA só pode dizer que criou se a tool `create_task` realmente rodou (verificador trava falsa confirmação).
- **Música**: busca Archive.org + Wikimedia, fila, volume, download MP3, pasta local autorizada.
- **Log**: tudo (eventos, tools, erros, latência, modelo, verificações). Filtre, copie ou exporte — export sempre sem chaves.

## Núcleo, temas e fundo

- **Núcleo** (botão órbita): HUD com atividade em tempo real, máx. 6 janelas.
- **Temas**: Light · Dark · Glass. **Fundo**: Núcleo 3D + Aurora, só 3D, só Aurora, Matrix (chuva digital), imagem própria ou liso. Intensidade e blur ajustáveis; `window.__bg3dEnabled=false` desliga o 3D sem afetar o loop.
- **Descanso**: tela de relógio após N minutos parado (ESPAÇO desperta).

## Atalhos mentais

- Peça dado atual → o harness pesquisa e cita fontes, ou diz que está pendente.
- Peça para abrir algo → ele pede confirmação antes.
- Resposta sem link após pesquisa → ele anexa `Fontes:` automaticamente ou marca pendência.
