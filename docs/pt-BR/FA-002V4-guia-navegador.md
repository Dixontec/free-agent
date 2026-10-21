# Navegador do Free Agent — guia rápido

## Abrir e navegar

Clique no **globo**. A conversa atual fica à esquerda, e o navegador à direita.
Arraste o divisor para mudar a proporção. **Expandir** ocupa a área de trabalho;
**Conversa** restaura a divisão. Em uma janela estreita, o globo permite voltar
ao navegador depois de abrir a conversa.

A barra funciona como a de um navegador convencional:

- `yt`, `YouTube` ou uma frase: pesquisa no Google, com página de resultados.
- `youtube.com`: abre o site diretamente.
- URL completa: abre o caminho informado.

Com foco no navegador, use **Ctrl+L** para a barra, **Ctrl+T** para nova aba e
**Ctrl+W** para fechar a aba. O botão **+** também cria uma aba.

## Atalhos da página inicial

Na nova aba, clique no único **Adicionar atalho**. Informe um nome livre e o
endereço. Exemplo: nome **YT**, endereço **youtube.com**.

Há espaço para cinco atalhos. O menu **⋯** permite editar ou excluir.
O ícone do site é carregado quando disponível; a inicial do nome serve como
alternativa. Clicar no atalho abre o endereço. Digitar seu nome na barra continua
sendo uma pesquisa. Os atalhos ficam salvos no perfil/origem utilizados.

## Permissões e acesso da IA

Abra **⚙ Configurações do navegador** para ajustar o site atual. Câmera,
microfone, localização, notificações e acesso da IA têm decisões separadas:

- **Perguntar:** pede uma decisão quando o recurso for solicitado.
- **Permitir uma vez:** vale para o documento atual; uma navegação encerra essa autorização.
- **Permitir nesta sessão:** vale até encerrar o processo do Free Agent.
- **Permitir sempre:** fica salvo para aquele site até você mudar.
- **Bloquear:** fica salvo e impede novos pedidos do mesmo recurso.

O botão **Parar IA** revoga o acesso ao site atual. Ao ir para outro site, a IA
precisa da autorização correspondente. O acesso da IA não libera câmera ou
microfone. A autorização do aplicativo também não substitui as configurações
de privacidade do Windows.

**Citar seleção** envia o texto selecionado na página e o endereço para o campo
da conversa atual. Revise o conteúdo e envie quando quiser; o botão não envia a
mensagem automaticamente.

As ferramentas do agente leem o documento principal e os elementos visíveis.
Uma observação identifica os controles disponíveis. O agente pode navegar,
preencher, clicar, rolar e mostrar uma captura. Alvos alterados ou removidos
exigem nova observação. Para confirmar um clique sem navegação, a ferramenta pode
informar o novo texto esperado; mudanças de relógios ou anúncios não comprovam sucesso.

## Bloqueador e extensões

O bloqueador incluído usa **Ghostery Adblocker 2.20.1**, com cópias locais das
listas EasyList e EasyPrivacy. Ele começa habilitado e pode ser desligado:

1. Abra **⚙**.
2. Escolha **Desativar neste site** ou **Desativar globalmente**.
3. Clique em **Recarregar página** para reaplicar a configuração.

A preferência fica salva. Não há telemetria do motor de bloqueio nem atualização
silenciosa das listas. A eficácia em anúncios específicos, como os de plataformas
de vídeo, pode mudar; o bloqueio não garante a reprodução de conteúdo com DRM.

No executável, a seção **Extensões** permite carregar uma **pasta descompactada**
com `manifest.json`, ativar, desativar e remover. A pasta deve continuar disponível
para carregar a extensão novamente após reiniciar.

O Electron oferece compatibilidade parcial. Esta versão recusa extensões que
exijam assumir APIs de bloqueio de rede, para preservar o isolamento do navegador.
O uBlock foi testado e não foi adotado; o Stands não foi redistribuído.
Na versão web, o bloqueador funciona no processo local; o gerenciador de
extensões é exclusivo do executável.

## Versão web local e áudio

A versão web usa um navegador local Electron e transmite a aba por WebRTC para
a interface. Câmera e microfone são os dispositivos do PC que executa o serviço.
Não foi implementado o encaminhamento de dispositivos entre computadores.

Use **Ativar áudio** para ouvir a aba e ajuste o volume. Em caso de falha,
use **Reconectar mídia**. **Diagnóstico** mostra o estado do serviço.
Ocultar o navegador interrompe a transmissão e mantém as abas. A animação Matrix
faz uma pausa enquanto o navegador está aberto e retorna ao fechá-lo, respeitando
a sua preferência de pausa. Isso reserva recursos para a página e o vídeo.

Os testes de dispositivos foram feitos com câmera/microfone sintéticos e
localização simulada. A conferência dos dispositivos físicos e da disponibilidade
do provedor de localização continua necessária no seu ambiente.

## Executável desta entrega

Abra `Free-Agent-Browser-Preview-win64.exe`, entregue nesta mesma pasta.
É uma compilação portátil Windows x64, sem instalador e sem assinatura digital.
O perfil continua no armazenamento do aplicativo; a pasta de produção existente
não foi apagada. Os testes usaram perfis temporários separados.

## Executar a partir do projeto

Abra um terminal em `C:\Projetos\free-agent-status`.

Para Electron:

```powershell
npm start
```

Para web, escolha um dos fluxos existentes:

```powershell
npm run server
```

ou:

```powershell
python serve.py
```

Se um servidor antigo já estava aberto durante a atualização, reinicie esse fluxo
para carregar o backend novo e recarregue a página. As conversas e configurações
continuam vinculadas ao endereço usado anteriormente.

Para desenvolvimento com recarregamento do frontend e reinício do backend:

```powershell
npm run dev:web
```

ou:

```powershell
npm run dev:electron
```

Os modos de desenvolvimento usam `http://127.0.0.1:47821` e perfis separados.
O modo web usa também o serviço na porta 47822. Não execute os dois modos de
desenvolvimento simultaneamente nas portas padrão. O perfil de produção não é
copiado ou apagado. Para encerrar o desenvolvimento, use **Ctrl+C** no terminal.

O terminal integrado ao produto não faz parte desta entrega.
