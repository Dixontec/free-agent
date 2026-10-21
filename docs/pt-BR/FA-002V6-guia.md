# Free Agent — navegador V6

## Abrir

No Electron, feche a instância antiga antes de abrir `Free-Agent-Browser-V6-win64.exe`.
O executável V4 anterior não recebe alterações automaticamente. O novo portable
mantém o perfil habitual; os testes utilizaram perfis separados.

Para executar diretamente do código-fonte:

```powershell
Set-Location 'C:\Projetos\free-agent-status'
npm start
```

Para acompanhar alterações com recarga automática, use `npm run dev:electron`.
Esse modo usa outro perfil, separado do uso habitual.

No web, reinicie o servidor que estiver utilizando e recarregue a página para
carregar os arquivos novos. Não abra dois serviços sobre as mesmas portas.

Exemplo com desenvolvimento web e ponte Python em terminais separados:

```powershell
# Terminal 1: ponte opcional para Coding Agent
Set-Location 'C:\Projetos\free-agent-status'
py bridge.py --port 8787 --no-browser
```

```powershell
# Terminal 2: interface web + navegador audiovisual + recarga automática
Set-Location 'C:\Projetos\free-agent-status'
$env:FA_APP_PORT = '47831'
$env:FA_BROWSER_PORT = '47832'
npm run dev:web
```

Abra `http://127.0.0.1:47831/`. Nas configurações do Coding Agent, a Bridge URL
é `http://127.0.0.1:8787`; use o token do Terminal 1. A porta 47832 é interna.
O código web é executado a partir da pasta do projeto; o portable utiliza o motor nativo.

## Tela cheia

- **F11** ou **Tela cheia**: a página ocupa a janela inteira. No Electron também
  desaparece a moldura do Windows. **F11** ou **Esc** restauram a apresentação.
- Botão de tela cheia do player: modo de vídeo do próprio site.
- **F**, fora de campos de texto: mantém o atalho do site e oferece uma alternativa
  para vídeo visível. No Electron existe recuperação para teclas ou solicitações
  de fullscreen que o Chromium deixa pendentes após alternâncias repetidas.
- **Expandir** aumenta a área do navegador dentro do aplicativo; é diferente de F11.

No web, a remoção da barra do navegador externo depende da permissão de fullscreen
dele. A página poderá ficar ampliada sem ocultar essa barra se a solicitação for negada.

## Áudio web em segundo plano

1. Reproduza a mídia na página e clique em **Ativar áudio**.
2. A linha **Áudio: …** identifica a aba que está fornecendo o som.
3. Abrir outra aba, visitar outra página, recolher o painel ou minimizar a janela
   mantém esse áudio enquanto a aba de origem e a sessão do aplicativo continuarem abertas.
4. Para ouvir a página que está vendo agora, clique em **Ouvir esta aba**.
5. **Silenciar** é uma escolha explícita. Se também recolher o painel, a captura
   poderá ser encerrada para não manter uma transmissão silenciosa desnecessária.

É transmitida uma aba de áudio por vez; não há mistura de várias abas. Fechar a
aba que fornece o áudio encerra aquela fonte. Fechar/recarregar o Free Agent,
encerrar o servidor ou suspender o Windows interrompe a sessão atual.

O controle **Volume** foi removido do navegador embutido. A saída fica em 100%,
inclusive se havia valor menor salvo anteriormente. Ajuste pelas teclas ou pelo
mixer de volume do Windows. O volume próprio de um site continua pertencendo ao site.

## Anúncios

Nas configurações do navegador, confira **Bloqueador global: ATIVADO**.
**Desligar bloqueador** permite anúncios; não significa aumentar o bloqueio.
As preferências anteriores são preservadas, inclusive uma desativação existente.

Você pode permitir anúncios em um site ou desligar o bloqueador globalmente.
Depois de mudar a configuração ou usar **Atualizar filtros**, recarregue a página.

O teste anônimo de aproximadamente três minutos no YouTube não registrou anúncios
no indicador observado do player. Isso não garante todos os vídeos, contas,
campanhas ou futuras alterações do site. Patrocínios dentro do próprio conteúdo
não são anúncios removíveis por filtros de rede.

## Tema Matrix

A animação continua com o navegador aberto. A pausa escolhida nas configurações,
o movimento reduzido do Windows e a visibilidade do aplicativo continuam sendo respeitados.
