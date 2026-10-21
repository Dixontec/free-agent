# Componentes de bloqueio de anúncios

O Free Agent utiliza **@ghostery/adblocker 2.20.1**, sem modificações no motor,
sob Mozilla Public License 2.0. Copyright (c) 2017-present Ghostery GmbH.
Uma cópia da licença está em MPL-2.0.txt. Código-fonte da revisão utilizada:
https://github.com/ghostery/adblocker/tree/c18718adc33e82a086d996d0b0f75deb3d01745a
Distribuição original: https://registry.npmjs.org/@ghostery/adblocker/-/adblocker-2.20.1.tgz

As listas **EasyList e EasyPrivacy** são dos **The EasyList authors**:
https://easylist.to/ . São distribuídas aqui, sem modificações, sob
Creative Commons Attribution-ShareAlike 3.0 Unported, dentre as opções de
licenciamento oferecidas pelos autores. Texto da licença em CC-BY-SA-3.0.txt.
Condições e atribuição: https://easylist.to/pages/licence.html

Os próprios arquivos das listas incluem os créditos e identificadores de commit.
sources.json registra URL, data UTC, tamanho e SHA-256 da cópia incluída.
O uso do bloqueador não envia histórico ou telemetria ao fornecedor do motor.
Esta versão inicia com as listas incluídas no aplicativo. O botão Atualizar filtros
baixa uma revisão completa do repositório oficial Ghostery; não há atualização silenciosa.

## Complementos V5

`enhanced/bundle.json` contém os arquivos originais das listas e os recursos de
scriptlets/redirecionamento distribuídos pelo projeto Ghostery. Registra a revisão
completa, URL e SHA-256 de cada arquivo. Revisão inicial:
https://github.com/ghostery/adblocker/tree/c18718adc33e82a086d996d0b0f75deb3d01745a/packages/adblocker/assets

As listas uBlock Origin/uAssets são de seus respectivos autores, sob GPL-3.0:
https://github.com/uBlockOrigin/uAssets . Licença completa em GPL-3.0.txt.
Os scriptlets/recursos são derivados do uBlock Origin, de Raymond Hill e
contribuidores, distribuídos sob GPL-3.0 ou posterior; licença em
uBlock-scriptlets-LICENSE.txt. Fontes correspondentes e instruções de geração:
https://github.com/ghostery/adblocker/tree/c18718adc33e82a086d996d0b0f75deb3d01745a/packages/adblocker/assets/ublock-origin
https://github.com/ghostery/adblocker/tree/c18718adc33e82a086d996d0b0f75deb3d01745a/packages/adblocker/scripts
https://github.com/gorhill/uBlock/tree/master/src/js/resources

A lista de Peter Lowe mantém os créditos e as condições no próprio arquivo:
https://pgl.yoyo.org/adservers/ . As listas EasyList/EasyPrivacy conservam a
atribuição e licença CC-BY-SA-3.0 descritas acima. Os componentes de terceiros
mantêm suas licenças; a licença MIT do harness não substitui essas condições.

O uBlock Origin 1.61.2 foi avaliado isoladamente e NÃO está incluído na distribuição.
O Stands NÃO está incluído. Não há vínculo comercial com esses fornecedores.
