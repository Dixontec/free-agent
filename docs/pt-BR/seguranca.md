# Segurança — Free Agent

## Modelo de ameaças (resumo honesto)

- **Chaves de API**: ficam em `localStorage` sob `nexus:keys`. Risco: quem tem acesso ao seu perfil do navegador lê. Mitigação: nunca exportamos chaves (`stripSecrets`), nunca logamos valores, campo `password` com mostrar/ocultar.
- **Abertura de URLs**: `open_site`/`web_open` poderiam levar a phishing. Mitigação: allowlist + confirmação modal para hosts desconhecidos; `web_open` só aceita URL retornada pela busca ou digitada por você.
- **Bridge local**: shell real — risco alto se exposto. Mitigação: bind `127.0.0.1` apenas, token aleatório por execução, jail de diretório, blocklist, timeout, sem execução sem token.
- **Rotinas/scheduler**: disparam sozinhos no horário. Mitigação: ações irreversíveis pedem confirmação; falha nunca é marcada como concluída.

## O que NUNCA fazer

- Nunca commite `.env`, `config.json` real, chaves ou tokens (veja `.gitignore` + `.env.example`).
- Nunca rode `bridge.py` com `--root /` nem exponha a porta para a rede.
- Nunca cole chave em issue, print ou vídeo.

## Reportar vulnerabilidade

Abra uma issue com `[SECURITY]` ou contate o mantenedor. Não publique exploit antes da correção. Veja [`SECURITY.md`](../SECURITY.md).
