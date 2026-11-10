# Redução de leituras Firestore — Issue #192

Esta alteração estende a contenção do PR #193. Não migra dados, não muda regras
de autorização e não altera as transações de estoque. Os resultados abaixo são
de fixtures isoladas; não representam faturamento nem uma previsão por funcionário.

## Comportamento

- O transporte live informa a revisão ao cache **antes** de distribuir o evento
  aos componentes. Uma alteração invalida as dependências correspondentes uma vez.
- Produtos, workspace de produção, tarefas, notificações e algumas consultas
  operacionais possuem dependências explícitas em `src/read-policy.js`.
- Respostas dessas consultas podem ser reutilizadas por até cinco minutos somente
  com o listener da mesma identidade/unidade confirmado pelo servidor, protocolo 2.
  O prazo parte da resposta original: navegar ou receber metadados não o renova.
  Revisões relevantes invalidam imediatamente; não é necessário esperar cinco minutos.
- Desconexão, erro do listener, encerramento do último consumidor, troca de escopo
  e sinais globais descartam a confiança anterior. Sem confirmação live, permanece
  o TTL conservador de 12 segundos. Não há timer de polling ou revalidação ao expirar.
- Chaves incluem escopo, autorização, endpoint, payload e dia do restaurante.
  A virada de dia não pode reapresentar as tarefas de ontem.
- Mutações nunca são deduplicadas. Invalidam no início e no fim, inclusive em erro.
  Consultas iniciadas antes/durante a mutação não podem alimentar o cache posterior.
- Atualizações manuais invalidam o cache; o wrapper também respeita `cache: 'no-store'`
  e `cache: 'reload'`.
- O workspace de Produção solicita `list` com `includeProducts: true`. Um helper
  compartilha produtos, perfis, saldos e definições com a validação das receitas,
  eliminando o segundo carregamento de catálogo. A API antiga sem essa opção
  continua compatível. A projeção pública não expõe documentos internos adicionais.
- Armazenamentos agora usa o hub live compartilhado para carga inicial e atualização.
  Uma consulta bem-sucedida confirma o estado carregado; erro inicial não vira zero
  nem onboarding. Respostas antigas não substituem uma carga mais recente.

## Medição reproduzível

```sh
npm install --no-audit --no-fund
node --experimental-test-module-mocks scripts/measure-firestore-reads.mjs --session
node --test tests/firestore-live-cache.test.mjs tests/read-catalog.test.mjs tests/quota-reads.test.js
npm run test:rules
npm run build
```

O ensaio usa Node com suporte a module mocks (Node 22/24), substitui `_lib` antes
de importar os handlers, bloqueia fetch externo e proíbe transações de escrita.
Conta chamadas `.get`/`getAll` da fixture, incluindo o mínimo de uma leitura para
consultas vazias. Não modela cobranças de índices, regras, retries ou listeners.
Um argumento de caminho permite comparar outro checkout da mesma aplicação.

Fixture: 56 produtos/saldos/perfis/definições, 10 receitas envolvendo 56 produtos,
30 execuções retornadas, 20 tarefas, 25 notificações, 20 sinais e 10 pedidos.

| Cenário sem alterações de dados | PR #193 ab96f14 | Esta alteração |
| --- | ---: | ---: |
| 98 cargas iniciais de Produção, separadas por 30 s: chamadas backend | 296 | 22 |
| Documentos de QUERY | 27.887 | 2.335 |
| Leituras pontuais | 22.248 | 582 |
| Total estimado de documentos lidos | 50.135 | 2.917 |
| 34 chamadas de summary a cada 30 s, histórico legado: total estimado | 51.136 | 6.016 |

No primeiro cenário a redução foi aproximadamente 94,2%. O teto de cinco minutos
produz dez cargas de workspace/tarefas em 49 minutos; não são dados guardados
indefinidamente. O script verifica um orçamento de 3.000 leituras nesse cenário,
a igualdade do catálogo público e a equivalência das receitas/permissões/histórico
entre a resposta consolidada e as APIs anteriores.

## Verificação de interface

`tests/firestore-read-mobile.test.mjs` usa Chromium, componentes e hook live reais,
com Firebase e API substituídos por fixtures. Verifica navegação, um listener físico,
invalidação após sinal de estoque, tarefas preservadas, atualização de Armazenamentos,
erro inicial sem falso zero e oito horas **virtuais** de repouso sem novas consultas.
Todos os destinos externos são bloqueados. O workflow mobile existente executa esse teste.

```sh
# Com Playwright e seu Chromium instalados:
node --test tests/firestore-read-mobile.test.mjs
# Para um Chromium já instalado no sistema:
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium node --test tests/firestore-read-mobile.test.mjs
```

Na implementação: 304 testes de regras aprovados; build aprovado; teste de navegador
aprovado. Isso não substitui um ensaio com carga operacional representativa em staging.

## Limites e continuidade

O custo de um cache miss histórico ainda pode ser alto: `summary` legado e
`dailyReport` continuam conciliando históricos para preservar exatidão. Eventos de
estoque continuam causando recargas amplas nas telas interessadas; não se deve
extrapolar a redução de navegação para um expediente com muitas gravações.

Próxima etapa: instrumentar documentos por action e testar funcionários/operações
representativos em staging; depois introduzir invalidação por produto e projeções
transacionais auditáveis para substituir scans históricos. Toda nova escrita deve
emitir o domínio live correspondente; alterações externas sem sinal ficam limitadas
pelo prazo máximo do cache, assim como já exigiam recarga das telas.

Não remover validação transacional, truncar históricos ou desativar listeners para
atingir uma meta de quota. Não integrar/publicar sem revisar CI e consistência entre
sessões. A atribuição quantitativa do incidente original continua dependente de
evidências operacionais que não existem nas fixtures.
