# Instalação — Free Agent

> Tempo estimado: 2 minutos. Sem build, sem dependências de Node, sem banco de dados.

## Requisitos

- Navegador moderno (Chrome, Edge, Firefox ou Brave atualizados).
- Python 3.8+ (só para servir os arquivos — já vem na maioria dos Linux/macOS).
- Opcional: [Ollama](https://ollama.com) ou [LM Studio](https://lmstudio.ai) para IA 100% local e gratuita.
- Opcional: chave gratuita da [Groq](https://console.groq.com) (recomendado para começar).

## Passo a passo

```bash
# 1. Baixar (escolha uma forma)
git clone https://github.com/SEU-USUARIO/my-os.git
# ou baixe o ZIP no botão verde "Code → Download ZIP" e extraia

# 2. Entrar e servir
cd my-os
python3 serve.py

# 3. Abrir
# http://localhost:8080
```

> Não abra com `file://` (duplo clique no HTML). Os módulos Three.js via CDN exigem `http://`.
> O `serve.py` é o servidor **integrado**: serve o app e também `/health` + `/tg-*`,
> então o **Telegram → Conectar** funciona direto, sem rodar código à parte.

## Alternativas de servidor

```bash
python3 serve.py            # RECOMENDADO (app + Telegram/Coding numa porta só)
python3 -m http.server 8080 # só estático — Telegram/Coding exigem a ponte à parte
npx serve . -l 8080         # Node (só estático)
php -S localhost:8080       # PHP (só estático)
```

## Primeira configuração

1. Abra **⚙ Configurações → Conexão & Modelo**.
2. Provedor **Groq** → cole a chave de `console.groq.com → API Keys → Create` → **Salvar** → **Testar conexão**.
3. Sem chave: use **Ollama** (`ollama serve` + `ollama pull llama3.1`) ou comandos locais (`/news tecnologia`).

## Atualizar

```bash
cd my-os
git pull
# recarregue a página — seus dados ficam no navegador, não são apagados
```

## Problemas comuns

| Sintoma | Causa provável | Solução |
|---|---|---|
| Tela preta / 3D não carrega | aberto via `file://` ou CDN bloqueado | sirva via `http.server`, libere `unpkg.com` |
| `Falha na API` | chave errada / provedor fora | clique **Testar conexão**, confira modelo |
| Porta 8080 ocupada | outro serviço | `python3 -m http.server 8090` |
| Voz não funciona | permissão do microfone | permita no navegador, use `Ctrl+Espaço` |

## Desinstalar

Apague a pasta + limpe `localStorage` (`DevTools → Application → Clear`). Nenhum resíduo no sistema.
