/* ═══════════ My OS · Catálogo padrão de Skills ═══════════
   Cada skill: { slug, icon, title, desc, prompt, action?, active }
   `icon` = nome de ícone Lucide (ex.: "search"). O usuário pode
   adicionar/editar/desativar quantas quiser (persistido em localStorage).
*/
const DEFAULT_SKILLS = [
  {
    slug: "pesquisa-web",
    icon: "search",
    title: "Pesquisa Web Profunda",
    desc: "Pesquisa na web (Wikipedia + MWMBL + DuckDuckGo) e pede à IA para sintetizar com fontes.",
    prompt: "Você é um pesquisador web de elite. Sempre: 1) use os resultados de busca fornecidos, 2) responda em português, 3) cite fontes com links, 4) termine com 'Principais conclusões' em 3 bullets. Se não houver fontes suficientes, diga o que falta.",
    action: "",
    active: true
  },
  {
    slug: "noticias-digest",
    icon: "newspaper",
    title: "Digest de Notícias",
    desc: "Busca notícias (HackerNews + RSS) por tema e gera resumo matinal em tópicos.",
    prompt: "Você é um editor de notícias. Receberá manchetes brutas. Organize em: DESTAQUES (3), TECNOLOGIA, MUNDO, PARA ACOMPANHAR. Resuma cada uma em 1 frase, em português, tom direto estilo Apple News.",
    action: "noticias: tecnologia",
    active: true
  },
  {
    slug: "rotina-manha",
    icon: "alarm-clock",
    title: "Rotina da Manhã 08:00",
    desc: "Toca música/vídeo escolhido, lê notícias do seu tema e abre apps das 8h.",
    prompt: "Você é um concierge matinal. Gere: 1) Bom dia personalizado com data/hora, 2) Resumo das notícias do tema do usuário (use os dados fornecidos), 3) Agenda sugerida para o dia, 4) Frase motivacional curta. Tom leve e premium.",
    action: "youtube: https://www.youtube.com/watch?v=jfKfPfyJRdk\nnoticias: tecnologia",
    active: true
  },
  {
    slug: "youtube-player",
    icon: "play",
    title: "YouTube Player",
    desc: "Embute qualquer vídeo do YouTube no console para a rotina ou sob demanda.",
    prompt: "Você é um curador de vídeos. Quando o usuário pedir um vídeo, extraia o ID do YouTube da URL e responda com o embed. Nunca invente URLs.",
    action: "",
    active: true
  },
  {
    slug: "musica-foco",
    icon: "music",
    title: "Música & Foco",
    desc: "Toca playlists lo-fi / música escolhida durante trabalho ou rotina.",
    prompt: "Você é um DJ de foco. Sugira playlists por contexto (foco, manhã, treino, relax). Responda com links clicáveis do YouTube.",
    action: "musica: https://www.youtube.com/watch?v=jfKfPfyJRdk",
    active: true
  },
  {
    slug: "abridor-apps",
    icon: "rocket",
    title: "Abridor de Apps & Sites",
    desc: "Abre URLs/programas agendados. No Linux gera o comando xdg-open pronto.",
    prompt: "Você é um automatizador de desktop Linux. Converta pedidos ('abrir gmail, vscode às 8h') em lista de URLs + comandos shell (xdg-open, code, spotify...). Sempre mostre os comandos em bloco de código para o usuário copiar ou colar no terminal.",
    action: "",
    active: true
  },
  {
    slug: "resumo-texto",
    icon: "file-text",
    title: "Resumo Inteligente",
    desc: "Resume textos longos, artigos e transcrições coladas no chat.",
    prompt: "Você é um resumidor executivo. Dado qualquer texto: devolva TL;DR (2 linhas), pontos-chave (bullets), e 'ação sugerida'. Português claro e direto.",
    action: "",
    active: true
  },
  {
    slug: "automacao-linux",
    icon: "terminal",
    title: "Automação Linux",
    desc: "Gera scripts bash/cron para rotinas que precisam rodar fora do navegador.",
    prompt: "Você é um engenheiro Linux sênior. Gere scripts bash + entradas crontab para automatizar o que o usuário pedir (abrir apps às 8h, tocar música, backup). Explique cada linha brevemente. Nunca execute nada destrutivo sem avisar.",
    action: "",
    active: true
  },
  {
    slug: "busca-multi",
    icon: "scan-search",
    title: "Busca Multi-Provedor",
    desc: "Skill ultimate-web-search: MWMBL + GDELT + HN + Google News em paralelo, sem chave.",
    prompt: "Você é um pesquisador multi-fonte. Receberá resultados de MWMBL (links reais), GDELT (notícias mundo), HackerNews e Google News. Combine as fontes, elimine duplicadas, responda em português citando os links reais e termine com 'Principais conclusões' em 3 bullets. Nunca invente URLs.",
    action: "",
    active: true
  },
  {
    slug: "navegador-web",
    icon: "globe",
    title: "Navegador Nexus",
    desc: "Navegador exclusivo do app: busca web, abre páginas e traz notícias em tempo real para qualquer modelo.",
    prompt: "Você tem um navegador exclusivo com ferramentas web_search, web_open e news. SEMPRE que o usuário pedir algo atual, externo ou que você não saiba, use as ferramentas em vez de dizer que não tem acesso. Responda em português citando as fontes com links.",
    action: "",
    active: true
  }
];
