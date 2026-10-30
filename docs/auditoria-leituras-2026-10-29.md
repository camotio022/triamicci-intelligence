# Auditoria de leituras — 29/10/2026

Base publicada conferida no GitHub: `01d884debf6ddbc39af6cb08893078be85ff1074` (#128). Esta auditoria não altera o banco, faturamento, permissões ou código operacional.

## Veredito

Há amplificação de leituras comprovada no código. Não é necessário apagar históricos para reduzir consumo. Cache local sozinho não resolve: o principal trabalho é reduzir cargas duplicadas, a abrangência das consultas e as invalidações entre assuntos diferentes.

O print do painel informa 53 mil leituras e 191 gravações em uma janela móvel de 24 horas. Logs da publicação mostram `RESOURCE_EXHAUSTED: Quota exceeded` em estoque, catálogo, recebimento e pessoas. Isso sustenta a indisponibilidade por cota, mas não atribui cada leitura a uma tela nem identifica o contador exato da cota na API Google Cloud. O próprio painel adverte sobre diferenças entre métricas e faturamento. Os 14 listeners são um pico de assinaturas, não 14 leituras totais nem prova isolada de desperdício.

**A faixa de economia de 30% a 60% mencionada na conversa era hipótese, não medição. Não deve ser usada como compromisso de entrega.**

## Cobertura e método

- Inventário estático dos 58 arquivos JS/JSX diretos de `src`: 51 pontos de `fetch`, 20 componentes consumidores de `useUnitLive`; isso não significa 20 componentes montados simultaneamente.
- Mapeamento de 72 arquivos JS de `api`/`server`, com inspeção dos caminhos de consulta, transações e chamadas encadeadas relevantes ao consumo. O mapa inclui falsos positivos de `.get()` em `Map`; não equivale a uma contagem de requisições Firestore.
- Revisão dos listeners, cache, autenticação, navegação, cargas iniciais, mutações, histórico e modos de falha.
- Diagnóstico reproduzível: `node scripts/audit-read-cost.mjs`. Usa a função real de paginação com documentos sintéticos; não inicializa Firebase e não acessa produção.
- Não foi executado um turno real nem medido o total de leituras por sessão de usuário. As observações prévias de produção e prints foram reaproveitados para não pressionar o banco esgotado.

## Achados priorizados

| ID | Gravidade | Evidência no código | Consequência | Correção indicada |
|---|---|---|---|---|
| Q01 | Alta | `useUnitLive.js`: primeiro snapshot conectado chama `load`; consumidores como KitchenHome, KitchenV3, Inventory, Production, TeamMural e NotificationCenter também chamam carga em `useEffect` | Duas cargas iniciais independentes; a trava do hook não deduplica a chamada feita pelo componente | Dar um único responsável à carga inicial e coalescer pedidos simultâneos por usuário/unidade/ação/parâmetros; preservar recuperação se listener falhar |
| Q02 | Alta | `server/live-signal.js` publica toda mudança em `live/attendance`; `useUnitLive.js` não distingue domínio | Presença, leitura de aviso, foto, catálogo ou produção podem provocar refresh de assuntos não relacionados | Revisões por domínio no documento compatível com Rules e assinaturas filtradas; manter fallback para versões antigas durante transição |
| Q03 | Alta | `v3-service.js`, ação `v3Dashboard`: lê products, operationalProfiles, stockSignals, purchaseOrdersV3, physicalBalances e v3PhysicalBalances | Uma chamada HTTP corresponde a seis consultas de coleção mais autorização; registros filtrados em memória já foram lidos | Endpoints/escopos de leitura por seção; dados de apoio compartilhados; consultar apenas o necessário, preservando reconciliação de registros antigos |
| Q04 | Alta | `products/manage.js:list`: products + physicalBalances + productCatalog; filtros do catálogo operacional acontecem depois do GET | Produtos experimentais e definições sem uso podem ser lidos sem aparecer na tela | Filtrar no banco com índices/campos consistentes; buscar definições por IDs necessários e separar cadastro estável do saldo |
| Q05 | Alta | `NotificationCenter.jsx`: cargas no mount, no listener e ao abrir; busca até 50 notificações e `v3Alerts` mesmo com painel fechado | A campainha amplifica consultas em qualquer tela; abertura também consulta ao fechar o painel | Coalescer início, carregar detalhes ao abrir, atualizar contador com mecanismo próprio; não perder avisos importantes |
| Q06 | Alta | `daily-report.js`: fallback sem resumo percorre todas as contagens do produto, entradas, saídas e toda productionRuns em páginas de 200 | Paginação por lote não limita o total; custo cresce com histórico e pode repetir por produto | Preservar resumo transacional existente como caminho principal; restringir cálculo antigo à janela necessária ou tarefa explícita de revisão, sem apagar/converter histórico |
| Q07 | Alta | `inventory-today.js`: chama handler dailyReport para cada produto; este autentica/lê vínculo e produto novamente | N+1: repetição de autenticação, vínculo, produto, catálogo e saldo; fallback Q06 agrava | Extrair serviço de cálculo com contexto já validado e reutilizar snapshots da requisição; autorização continua no limite HTTP |
| Q08 | Média/alta | `today-count-page.js`: busca até 200 saldos por consulta e filtra datas em JS para devolver 12 | Número exibido difere do número de documentos retornados pelo banco; páginas seguintes podem reler documentos já retornados no lote anterior | Query por data + cursor estável/índice e limite de página; manter todas as contagens acessíveis |
| Q09 | Média/alta | `fastCache.js` e Inventory: cache sessionStorage de 2 min exibe produtos, mas `load()` continua incondicional e listener também inicia carga | Cache melhora aparência/latência percebida, sem evitar as mesmas consultas de produtos | Política explícita de frescor/revisão, invalidar ao mudar dados e permitir atualização forçada |
| Q10 | Média | `schedules.js:list/mine`: lê até 120/100 escalas e filtra períodos/pessoas depois; list também resolve nomes e busca staffRegistry | Mural/Minha Ficha releem escalas antigas e diretório para mostrar mês corrente ou uma pessoa | Consulta por período/status, endpoint pessoal e diretório compartilhado, histórico sob demanda |
| Q11 | Média | MyAttendance: lê teamDirectory inteiro para achar a própria pessoa; workflow lê presença de ontem antes de teamDirectory/teamToday/correct | Leituras desnecessárias até em consultas que não usam o estado individual de ontem | Endpoint do próprio perfil; mover consulta de overnight apenas para ações que precisam dela |
| Q12 | Média | `mural.js:publicNotices`: varre lotes de 100, filtra tipo/status e lê marcações pessoais; noticeRead sinaliza a unidade inteira | Poucos avisos podem consumir muitos documentos; marcar leitura recarrega outros usuários/áreas | Filtrar tipo/status no banco e paginação com índice; atualização de leitura pessoal sem invalidação global |
| Q13 | Média | `productActivity`: lê até 100 produções da unidade e filtra por produto no servidor; `summary` antigo lê até 501 registros de três tipos | Detalhe de um produto pode consultar operações sem relação ou histórico excessivo | Índice de participação do produto e intervalo/cursor; manter aviso de consulta incompleta |
| Q14 | Média | `investigationGet`: até 100 investigações, até 20 versões por investigação | Uma consulta pode criar 100 subconsultas e trazer versões que não foram abertas | Listar cabeçalhos primeiro e carregar versões no detalhe/página |
| Q15 | Média | `shipmentsList`: histórico de 21 e fila pendente de 201 são consultados juntos, inclusive ao paginar histórico | Pendências são relidas em cada página e podem se sobrepor ao histórico | Separar fila e histórico/reusar fila vigente; preservar pendências antigas fora da primeira página |
| Q16 | Alta, UX | KitchenV3, ShipmentReceiving, NotificationCenter e Inventory iniciam dados vazios e exibem totais/ausência de pendências junto de erro genérico | Falha parece estoque zero ou ausência de aviso; catch de alguns refresh não retorna false ao hook | Estados loading/ready/stale/unavailable explícitos; nunca fabricar zero; preservar última consulta com data e marcar erro do listener |

## Caminhos da interface

| Área | Leitura principal e problema | Situação |
|---|---|---|
| Shell/campainha/foto | myProfile (cache do avatar pode evitar), notifications, v3Alerts | Campainha sempre montada; maior alcance do Q05 |
| Cozinha inicial | products:list + stock:list (cinco históricos até 31 documentos cada) | Dupla carga; filtrar Hoje no navegador não reduz histórico buscado |
| Estoque e insumos | v3Dashboard e componentes de seção montados condicionalmente | Seções já são condicionais, mas dashboard base é amplo |
| Administração | products:list, configuração dos 56, conciliação e cadastros | Não remover leituras transacionais de prevenção de duplicidade só para economizar |
| Recebimento/contagem/histórico físico | products:list + stock:list + catalog:list; modo receive também v3Dashboard | Dados comuns repetidos entre endpoints e componentes; revisão de produto consulta summary/lots |
| Produção | products:list + production:list + dayList | Lista de produção relê produtos no backend e inclui receitas + execuções; atualização global recarrega tudo |
| Inventário inteligente | products:list + todayCounts + closeList para gestão + dailyReport/investigation no produto selecionado | Q06–Q08 e Q14; prioridade alta |
| Mural/equipe | schedules:list + publicNotices + teamDirectory + teamToday + dayList | Snapshot global repete cinco ações; relógio de 30 s não consulta a cada tick |
| Minha Ficha | myProfile, presença, escala pessoal, diretório e cobertura quando montada | Perfil próprio não deve exigir leitura recorrente da equipe inteira |
| Folgas/cobertura/escala | Listas, contexto de data e dashboard com diversas coleções | Consultas gerenciais devem ser paginadas/filtradas; propostas próprias podem filtrar por destinatário no banco |
| Pessoas/perfis | Vínculos + perfis + cadastro mestre + convites conforme aba | Deduplicar diretório; manter negações de acesso e verificação transacional |
| Etiquetas/medição/atividade | Listas e detalhes específicos, alguns com joins de nomes/lotes | Carregar histórico de evento/lote sob demanda; não quebrar validade e FEFO |
| Mentor/preferências | Progresso já local | Sem evidência de ser causa relevante das leituras do Firestore |

## Medição reproduzida

No helper real `todayCountPage`, com **56 saldos sintéticos contados no dia**, o banco simulado retorna **56 documentos** em uma consulta; a função entrega **12 linhas** à tela. Não há acesso de rede nessa prova. São documentos retornados no modelo, não uma medição da fatura real.

Modelo de volume (não contagem faturada): products:list retorna P+B+C documentos de três coleções; v3Dashboard retorna P+F+S+O+B+L de seis. P=produtos, B=saldos, C=catálogo central, F=perfis, S=avisos, O=pedidos, L=saldos antigos. Somam-se autorização, leitura mínima de consultas vazias, eventuais índices e retries; nenhuma dessas fórmulas permite deduzir o total real a partir dos cinco produtos exibidos.

## O que preservar

- AuthGate continua confirmando vínculo no servidor e acompanhando revogação. Cache não concede acesso.
- Escritas seguem transacionais, idempotentes e autorizadas. Não cachear decisão de aprovação nem pular validação de estoque/lote para reduzir leituras.
- Não apagar dados históricos, desligar rastreabilidade ou esconder pendências antigas.
- Timers de relógio/dia em geral atualizam estado local; não tratá-los como polling Firestore sem verificar sua função. StrictMode duplica efeitos em desenvolvimento, não é por si causa da duplicação de produção encontrada em Q01.
- Evitar cache HTTP público para respostas autenticadas. Chaves em memória/sessão precisam considerar conta, unidade, perfil/geração de autorização e parâmetros.

## Plano de implementação e aceite

1. **Contenção e verdade na tela:** erro de cota reconhecível, pausa de tentativas automáticas/cooldown, zero somente com consulta bem-sucedida, data da última leitura. Sem retries infinitos. Repetir ações de gravação não é mecanismo de recuperação.
2. **Entrada única e compartilhamento:** uma carga inicial, requisições simultâneas compartilhadas, um assinante por documento para consumidores locais, invalidação de resultados após escritas. Testar listener falhando, reconexão e mudança de conta/unidade/perfil.
3. **Revisões por domínio:** estoque, produção, equipe/escala, mural e notificações. Cada revisão atualiza apenas consumidores relacionados; sincronização entre usuários continua funcionando.
4. **Consultas menores:** desacoplar cadastro de saldo, retirar históricos da home, consultas por período/status, cursor de histórico e remover N+1. Índices devem ser planejados/testados antes de publicar queries novas.
5. **Cache explícito:** memória primeiro para duplicação durante sessão; sessionStorage/localStorage somente dados aprovados e pequenos. Cache persistente apenas para cadastro não sensível/progresso/preferências com versão/validade; foto/perfil/financeiro não devem ser copiados indiscriminadamente. Saldo pode ter cópia transitória identificada como desatualizada, nunca autoridade para gravar.
6. **Prova final:** medir a mesma sequência antes/depois, com conjunto fixo de 56 produtos sintéticos e dois clientes: abrir cozinha, navegar estoque, abrir produto, receber/aprovar, produzir, contar, mudar de usuário/unidade. Contabilizar chamadas HTTP, queries e documentos retornados por ação. Confirmar atualizações após escrita e negar acesso revogado. Depois acompanhar consumo agregado real sem testes em massa na produção.

Critérios: uma carga inicial por ação/chave, consultas simultâneas equivalentes não duplicadas, presença não recarrega estoque, paginação não relê páginas anteriores, ausência de consultas ocultas sem justificativa, nenhuma escrita/saldo/permissão dependente de cache local. O resultado percentual só será publicado depois dessa medição.

## Estado desta rodada

Auditoria e diagnóstico sintético concluídos. **Nenhuma otimização operacional foi implementada ou publicada nesta rodada.** O banco segue sujeito à cota já consumida. Não foi contratado plano nem alterado faturamento. A revisão técnica identifica onde corrigir, mas não restaura o serviço por si só.

## Implementação posterior à auditoria (mesma data)

A rodada de correção adiciona uma carga inicial por listener, transporte compartilhado por conta/unidade e revisões por domínio com compatibilidade para clientes antigos. Mural e campainha também distinguem quais partes precisam atualizar. Requisições de leitura simultâneas equivalentes compartilham o transporte; respostas resolvidas não são tratadas como saldo atual em cache. Escritas nunca são coalescidas e invalidam a reutilização em andamento.

A home consulta apenas registros de hoje em prévia de cinco por tipo; o histórico completo permanece nas telas próprias. products:list consulta apenas definições centrais dos produtos vinculados. todayCounts reutiliza autenticação/vínculo/produto/saldo na requisição interna; o próprio perfil substitui o diretório inteiro na jornada pessoal. A paginação de contagens não antecipa documentos além das linhas necessárias: o diagnóstico sintético passou de 56 retornados/12 exibidos para 12/12 na primeira página, sem perder os 56 ao percorrer todas as páginas.

Erros de cota identificados recebem 503 e Retry-After, com pausa de 60 segundos nas novas leituras automáticas da mesma sessão. Quatro telas principais não apresentam zero/ausência de pendências antes de uma primeira consulta válida. Notificações distinguem indisponibilidade de ausência de avisos. AuthGate não usa cache para autorizar; mudança de conta, unidade ou perfil isola consultas e remonta o workspace.

Não houve migração/apagamento de dados nem contratação. O fallback de apuração de históricos antigos, filtros/índices adicionais de escalas/mural/avisos e paginação de versões de investigação continuam oportunidades de uma etapa posterior; não foram eliminados sem planejar a compatibilidade. Nenhuma porcentagem global foi medida. As evidências de CI e publicação devem ser verificadas no PR final; testes locais e o script não recuperam cota já consumida.
