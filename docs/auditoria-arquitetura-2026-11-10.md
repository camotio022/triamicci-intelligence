# Auditoria de arquitetura e consolidação — Triamicci Intelligence

Data: 10/11/2026, horário de São Paulo. Base auditada: **main `f39bc8e8c3cee030d0c135e1aecd9fcc9c63b158`**.
Este documento é o diagnóstico histórico da base acima. A implementação posterior está
em [refatoração da auditoria](refatoracao-auditoria-2026-11-10.md) e os contratos atuais
em [arquitetura](architecture.md).

## Parecer executivo

O projeto é um monólito modular em evolução, com uma base útil de regras puras,
transações, isolamento por unidade e testes. A principal dívida é **sobreposição
de modelos e caminhos de operação**, acompanhada por contratos de dados espalhados
e crescimento da interface por camadas sucessivas. Não há evidência que justifique
reescrever tudo, trocar de framework ou separar em microserviços agora.

Há três tipos distintos de trabalho: corrigir comportamentos comprovadamente
inconsistentes; decidir a responsabilidade de cada modelo operacional; compartilhar
infraestrutura repetida. Renomear arquivos ou mover pastas não resolve os dois primeiros.

O problema mais urgente encontrado nesta auditoria é o arquivamento de produto com
saldo legado ainda existente quando falta o saldo canônico. A reprodução está anexada.
As diferenças entre os estoques antigo, físico e por armazenamento também precisam
de uma decisão explícita de produto antes de qualquer migração.

## Escopo, método e limites

- Inventário dos **424 arquivos versionados**: 297 JS/JSX/MJS, 53 CSS e 18 workflows.
- Inventário por AST de importações, coleções literais, módulos de API e chamadas do
  cliente. São 191 módulos de implementação/scripts/worker: 79 em src, 90 em server,
  12 APIs, nove scripts e um worker. O inventário não é prova de cobertura dinâmica.
- Revisão manual dos caminhos principais de autenticação, estoque, catálogo,
  recebimento, produção, inventário, pessoas, escalas, checklists, etiquetas,
  notificações, arquivos, navegação, cache e automação.
- Execução de `npm run test:rules`: **284 testes aprovados na main auditada**.
- Execução de `npm run build`: aprovada. Dependências reutilizadas da instalação
  local desta sessão; o repositório não possui lockfile para reproduzir exatamente
  a instalação de um deployment anterior.
- Duas reproduções de handlers reais com `_lib` substituído, banco somente em
  memória e rede externa bloqueada. Nenhum dado real foi consultado ou modificado.
- Consulta aos resultados de CI do PR #194; não se confundem com testes da main.

Não foi feita homologação de todas as telas em todos os dispositivos, inspeção de
dados reais, teste de restauração de backup ou certificação de segurança. Não existe
medição de cobertura que permita declarar uma porcentagem de código protegido.

Evidências: [inventário de módulos](audit-2026-11-10/module-inventory.json),
[reprodução executável](audit-2026-11-10/reproduce.mjs) e
[resultados](audit-2026-11-10/reproductions.json).

## Mapa dos domínios e decisões de consolidação

| Área | Situação observada | Decisão recomendada |
| --- | --- | --- |
| Catálogo | Definições globais, produtos da unidade e perfis operacionais | Preservar as três responsabilidades; compartilhar a composição da visão operacional |
| Estoque antigo | `products.quantity` + `movements`, ainda com escrita disponível | Definir data de descontinuação de novas escritas; manter histórico legível |
| Estoque físico | `physicalBalances`, `physicalLots` e eventos físicos | Manter como referência documentada das operações atuais de reserva/giro |
| Compatibilidade | Fallback de `v3PhysicalBalances` | Encapsular em um adaptador consistente para leitura, escrita e arquivamento |
| Armazenamentos | `storageBalancesV1.byStorage`, recebimentos e produções próprios | Definir se substitui o físico ou constitui escopo separado; não somar automaticamente |
| Produção | Receitas/configurações, tarefas do dia, execução e porcionamento | Um serviço de aplicação por operação; manter conceitos distintos e validação comum |
| Pessoas | Membership, cadastro profissional, ficha e vínculo com conta | Compartilhar resolvedor de identidade/vínculo; funcionário não equivale a conta |
| Escalas e presença | Planejamento, folgas, cobertura e declaração de jornada | Compartilhar tempo e consultas; nunca transformar previsão em presença |
| Notificações | Inbox pessoal, alertas operacionais e outbox push | Preservar entidades distintas; compartilhar entrega e projeções sem repetir scans |
| Checklists | Rascunho, publicação, execução e evidência versionada | Preservar versões e retenção; aproveitar como exemplo de separação de responsabilidades |
| Etiquetas | Regras de validade e eventos próprios | Compartilhar datas/unidades, sem aplicar automaticamente regras de lotes diferentes |
| Arquivos | Firebase Storage e Cloudinary por adaptador | Manter contrato de provedor; não fundir credenciais, URLs públicas e evidências privadas |

## Achados com evidências e prioridades

### A01 — Prioridade alta: arquivamento ignora saldo legado suportado

**Comprovado em memória.** Em `server/operations/v3-service.js:38`, `balances` já aponta
para `physicalBalances`. Em `:109–112`, os nomes `physical` e `v3` são construídos para
o mesmo documento, que é lido duas vezes. O saldo em `v3PhysicalBalances` não entra
na decisão de arquivamento.

Fixture: produto ativo com `quantity=0`, sem `physicalBalances`, mas com saldo legado
de cinco unidades. `v3ArchiveProduct` respondeu **200**, tornou o produto inativo e
manteve as cinco unidades legadas. `shared-balance.js:7–10` reconhece esse fallback
como saldo operacional nas demais operações.

**Recomendação:** a decisão de arquivar precisa consultar a mesma visão de saldo
dos movimentos, incluindo compatibilidade e o escopo por armazenamento que o produto
decidir adotar. Testar saldo somente legado, somente atual, ambos, zero e operações
concorrentes. Não basta remover a leitura duplicada.

### A02 — Prioridade alta: caminhos distintos escrevem estoques distintos

**Comprovado; parte da separação é intencional.** `api/stock/movements.js:75–90` altera
`products.quantity` e cria `movements`; não atualiza saldos físicos ou por armazenamento
e não emite sinal live. A interface mantém esse caminho em
`src/Inventory.jsx:142`, identificado como controle antigo.

Na fixture, uma entrada antiga levou quantity de 10 para 11,5; o saldo físico continuou
5 e o saldo por armazenamento continuou 7. Isso demonstra independência dos modelos,
não corrupção de dados reais. `server/storage/handler.js:32,57,73` também declara que
a observação de contagem ainda não altera o saldo oficial até sua revisão.

**Recomendação:** definir qual saldo cada tela e operação promete representar. Se o
legado for somente histórico, impedir novas escritas explicitamente no servidor após
decisão e validação. Se continuar operável, suas diferenças precisam de nome, sinal e
reconciliação próprios. Migrar com inventário, ensaio, reconciliação e possibilidade
de retorno; não apagar nem somar os três valores.

### A03 — Prioridade alta: validação de quantidade diverge entre caminhos

**Comprovado.** O validador local de `api/stock/movements.js:5–7` aceita 1,5 para um
produto em `un`; o handler realmente aceitou essa entrada. O contrato atual
`server/operations/logic.js:10–13` rejeita a mesma quantidade para `un`.

**Recomendação:** compartilhar validação por dimensão/unidade. A existência de
subconjuntos em `unit-engine.js` é intencional: apresentação de receita e unidade
física não devem ser igualadas indiscriminadamente. Os dados antigos precisam de
tratamento explícito, sem arredondamento silencioso.

### A04 — Prioridade alta: consultas e atualização live ainda amplificam trabalho

**Comprovado no código e na investigação anterior da Issue #192.**
`src/Production.jsx:38–48`, `PhysicalStock.jsx:36–57`, `NotificationCenter.jsx:25–31`,
`api/products/manage.js:41–47` e `server/production/readiness.js:27–35` repetem leituras
de produtos/perfis/saldos/definições e carregamentos de histórico.

`daily-report.js:10–12` pagina, mas percorre o histórico completo; limites por página
não limitam o custo total. `investigation.js:19–20` consulta versões por investigação.
Esses são candidatos a projeções e carregamento incremental, não a truncamento de dados.

O #194 propõe cache ligado a revisão live e composição compartilhada do catálogo.
É avanço localizado, não encerramento da consolidação nem previsão de consumo diário.

### A05 — Prioridade média: cliente de API e tratamento de falhas espalhados

**Comprovado por inventário.** Há chamadas a `apiFetch` em 43 módulos e obtenção de
token em 44 módulos de src/server/api. O último número inclui autenticação repetida
de wrappers, não 44 usuários ou listeners.

`PhysicalStock.jsx:12–18`, `Production.jsx:14–19`, `StockMovements.jsx:9–19`,
`NotificationCenter.jsx:14–18` repetem obtenção de token, headers, POST, leitura JSON
e conversão de erro. Já existem `api-fetch`, `fastCache`, `useViewState` e estados
locais, cada um com responsabilidade parcialmente diferente.

**Recomendação:** um transporte autenticado e clientes por domínio; respostas e erros
normalizados, cancelamento e política explícita de cache. Preferência de tela,
snapshot de negócio e autorização permanecem categorias separadas. Não criar um
cache global sem escopo nem repetir mutações automaticamente por erro de rede.

### A06 — Prioridade média: dispatch de APIs concentra responsabilidades

`api/members/manage.js` tem aproximadamente 35 KB e mistura cadastro, vínculos,
perfil, notificações e permissões, além de delegar outros módulos. `api/operations/stock.js`
importa 25 módulos e ainda contém handlers legados. `v3-ledger.js` tem aproximadamente
38 KB; contagem de linhas subestima sua complexidade por muitas expressões compactadas.

**Recomendação:** manter as 12 funções existentes enquanto forem uma restrição de
hospedagem, mas tornar os dispatchers finos. Separar serviços de aplicação, políticas
puras e acesso a dados por domínio. Um registro de actions pode explicitar modo
leitura/escrita, autorização, schema, domínio live e idempotência. A convenção de
`action` não é um defeito por si só; o acoplamento implícito entre arquivos é o problema.

### A07 — Prioridade média: política de acesso repetida, com exceções legítimas

O trio de papéis gerenciais aparece como literal em 35 módulos. Existem boas bases
em `permissions/v31-policy.js`, e as operações críticas revalidam contexto em transação.
Não foi demonstrada aqui uma violação geral de isolamento entre unidades.

**Recomendação:** políticas nomeadas por capacidade e testes por operação/papel.
Não substituir tudo por `isManagement`: criar administrador, aprovar alteração própria,
acessar dados financeiros e consultar a própria ficha são permissões diferentes.

### A08 — Prioridade média: calendário tem mais de uma implementação

`restaurant-today.js:1–5`, `temporal-policy.js:1–4`, `production/day-list.js:9` e
`storage/handler.js:13` implementam o dia de São Paulo de formas semelhantes.
`v3-service.js:43` usa dia UTC. Às 22h BRT de 09/11, o dia UTC já é 10/11.
Essa divergência de contrato é reproduzível; não foi demonstrado que o campo UTC
seja exibido incorretamente ao usuário nesse caminho.

**Recomendação:** módulo puro de tempo compartilhado e relógio injetável em testes.
Preservar diferenças entre instante, dia operacional, validade, jornada noturna e
janela de publicação. Compartilhar utilitário não significa fundir esses conceitos.

### A09 — Prioridade média: CSS e carregamento inicial acumulam camadas

São 53 CSS em src. A varredura encontrou 171 seletores presentes em mais de um arquivo;
isso **não equivale a 171 erros**. Há sobreposição de `:root`, `button`, `.topbar`,
`.sidebar` e `.inventory-page` entre fundação, responsividade e folhas por versão.
`src/main.jsx:4–12` depende da sequência de importação de várias fundações globais.

No build local, o CSS principal foi 332,19 KB (58,87 KB gzip), e o JS principal
1.107,08 KB (302,44 KB gzip), além de um chunk compartilhado de 264,59 KB. Não houve
medição de tempo de carregamento em aparelho real. Não há divisão explícita por
rota com lazy import no código src examinado.

**Recomendação:** tokens/base únicos, componentes visuais comuns e estilos de página
com escopo. Dividir módulos pesados quando medição justificar. Validar em 320–1280 px,
teclado, foco, contraste e iOS; não remover overrides sem comparação visual.

### A10 — Prioridade média: build e operação não são totalmente reproduzíveis

Não existe lockfile versionado. `package.json:12–19` usa `latest` para React, Vite e
outras dependências. Workflows variam entre Node 22/24, npm install e npm ci.
`import-product-catalog.yml:25–30` habilita cache npm e executa npm ci sem lockfile.
Em diretório isolado contendo o package.json atual, npm ci falhou com **EUSAGE** por
falta de lockfile. O workflow manual não foi disparado.

**Recomendação:** fixar versões, versionar lockfile, escolher runtimes suportados e
padronizar instalação. A matriz de CI deve distinguir regras, contratos de API,
emulador, UI e operações manuais; evitar reconstruções repetidas sem propósito.

### A11 — Prioridade média: testes existem, mas não comprovam cobertura total

O inventário identificou 97 arquivos com chamadas `test`, 12 com nome de emulador,
11 importando Playwright e 19 que inspecionam arquivos-fonte. As categorias podem se
sobrepor. Há 333 declarações estáticas `test`; isso não é o total executado numa única
suíte. Na main foram executados e aprovados 284 testes de regras.

Testes de presença de texto são úteis para contratos específicos, mas podem exigir
implementações antigas sem medir comportamento. No #194, o CI emulado executou 21
testes: 20 passaram e `v4-mobile.test.mjs:66` falhou por esperar duas chamadas quando
o cache permitiu uma. Não se deve simplesmente relaxar a asserção: precisa verificar
ausência de duplicação, dado exibido correto e atualização após alteração relevante.

Registro: [CI do #194](https://github.com/camotio022/triamicci-intelligence/actions/runs/42766073388/job/129662762456).
O resultado observado é do commit `ea6296d`, não uma falha da main atribuída sem prova.

**Recomendação:** matriz fluxo × papéis × unidade × falha × concorrência, com testes
de caracterização antes da extração. Medir cobertura por módulo e impor limites de
leituras por operação; não usar apenas quantidade de testes como indicador de qualidade.

### A12 — Prioridade baixa: resíduos de protótipo e documentação dispersa

`src/App.jsx:31,38–60` mantém import de Dashboard, séries demonstrativas e Metric
que não compõem a rota atual. `src/Receiving.jsx:4–29` é uma demonstração em memória;
não é o recebimento operacional atual, e não possui consumidor operacional nas entradas auditadas.

O grafo apontou `server/checklists/cleanup.js` fora das raízes HTTP, porém ele é usado
por script de manutenção: **não é arquivo morto**. Essa distinção impede apagar jobs
legítimos com uma análise apenas do frontend.

O README tem apenas duas linhas; instruções essenciais estão espalhadas em documentos
datados. `VERSIONING.md` explica corretamente que V3/V4/V5 nos nomes são identificadores
internos, não releases independentes.

**Recomendação:** retirar protótipos das entradas operacionais, mantê-los em qa quando
necessários e criar documentação principal de instalação, arquitetura e operação.
Registrar decisões atuais e arquivar o histórico, sem apagar evidências de migração.

## O que compartilhar — e o que preservar separado

| Compartilhar | Preservar separado |
| --- | --- |
| Transporte autenticado, normalização de erro, escopo/cache | Autorização do servidor e estado de interface |
| Visão de catálogo + perfis + unidade física | Catálogo global e configurações da unidade |
| Adaptador de saldo e validação de transição | Histórico preservado, saldo calculado e observação pendente |
| Quantidades, conversões exatas e regras de precisão | Massa, volume, unidades e apresentação de embalagem |
| Tempo operacional e serialização de instantes | Escala prevista e presença declarada |
| Resolução de funcionário/conta por vínculo explícito | Identidade de conta, cadastro profissional e dados pessoais |
| Infraestrutura de auditoria e idempotência | Fingerprints e invariantes específicas de cada operação |
| Formulários, diálogos e estados de dados | Fluxos de negócio que exigem aprovações diferentes |
| Adaptador de armazenamento de evidências | Retenção de evidência, avatar e recurso público |

## Arquitetura-alvo sugerida

Manter a aplicação atual e reorganizar gradualmente por domínio: catálogo, estoque,
recebimento, produção, pessoas, escalas, checklists, etiquetas e notificações. Cada
domínio deve possuir comandos, consultas, políticas puras e testes de contrato.
API resolve autenticação/contexto e delega; UI apresenta estado e dispara comandos.
Módulos puros usados pelo navegador podem morar em `shared`, evitando a ambiguidade
de importar de `server` algo que realmente é compartilhado. Não mover Admin SDK
ou credenciais para esse diretório compartilhado.

Para estoque, o dono da regra de saldo precisa ser único por escopo definido. As
interfaces legadas tornam-se adaptadores de entrada/consulta até sua retirada,
sem reimplementar baixa, crédito, unidade e controle de lotes em cada tela.

## Sequência recomendada e critérios de aceite

1. **Congelar os contratos:** matriz de saldos/telas e teste do arquivamento com saldo
   legado; registrar as diferenças de unidade. Aceite: nenhuma operação aprovada pode
   ignorar saldo existente ou converter unidade implicitamente.
2. **Estabilizar a entrega:** lockfile/runtime, CI sem falha pendente, documentação de
   setup e testes de caracterização. Aceite: checkout limpo reproduz instalação/build/testes.
3. **Consolidar consultas e transporte:** catálogo composto, clientes por domínio e
   registro de actions. Aceite: mesmos dados/permissões, menos chamadas e leituras medidas.
4. **Consolidar comandos de estoque/recebimento/produção:** extrair serviços em PRs
   pequenos, preservando transações e adaptadores. Aceite: idempotência, concorrência,
   unidade, lote e invariantes de saldo passam em emulador.
5. **Reconciliar modelos:** somente após decisão operacional, backup, ensaio e relatório
   de diferenças. Aceite: contagens e histórico conciliados; sem soma/eliminação silenciosa.
6. **Consolidar interface e estilos:** componentes compartilhados e carregamento por
   domínio. Aceite: fluxos e acessibilidade mantidos nos tamanhos e dispositivos acordados.
7. **Desativar compatibilidades:** retirar uma por vez após provar ausência de consumidores
   e definir retenção do histórico. Aceite: rollback de código e de eventual migração ensaiados.

Não atribuir prazo total antes de esclarecer uso dos três estoques e os cenários
operacionais. Não definir percentual global de economia, maturidade ou segurança
sem medição correspondente. Esta auditoria entrega diagnóstico e roteiro; não autoriza
refatoração em massa, alteração de dados nem publicação em produção.
