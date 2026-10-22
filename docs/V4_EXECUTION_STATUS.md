# V4 — execução e bloqueadores reais

Base auditada: `main` em `ad8da9855fae4cf06cc306cb4fa891f2624c183d` (PR #81).
Continuidade na PR #82. Fonte dos requisitos: Issue #76 e plano mestre da PR #77.
**Esta branch não representa a V4 integralmente concluída. Não fazer merge como entrega completa.**

## Alterações preparadas nesta continuidade

- Invalidação transacional por unidade, escutada por `onSnapshot`, substituindo polling nas vistas alteradas. Reaproveita `units/{unitId}/live/attendance`, já autorizado pelas Rules existentes, sem dados de negócio no sinal. Não exige liberar novas coleções ao cliente.
- Estado de conexão no Mural/Produção, sem selo Ao vivo em cache, erro ou offline. Carregamentos silenciosos e cancelamento de listeners; remonta o conteúdo ao mudar unidade, papel ou conta.
- Mural mantém identidade e estilos existentes; ordem Comunicados → Escala → Produção; prioridade, autoria e data; publicação gerencial; equipe filtrável numa lista única.
- Estoque e Cozinha: indicadores acionáveis; consultas compactas em vez de três cartões grandes de saldo por produto.
- Minha Jornada consulta escala oficial pessoal, distingue folga de trabalho previsto e inclui próximos dias/consulta completa. Trocas/coberturas com formulário recolhível e estados traduzidos.
- Folgas: contexto da escala, prevenção transacional de duplicados, bloqueio de pedido comum após publicação; janela de publicação de vinte dias, meses encerrados bloqueados e pedidos pendentes impedem publicar. Gerador considera pedidos aprovados; publicação verifica o seu respeito.
- Investigação: alocação parcial de divergência por motivo e quantidade, histórico, revisão por outra pessoa da gestão, controle de versão e auditoria. Não altera estoque nem transforma alegação em movimento comprovado.
- Produção: correção de snapshot usado indevidamente na leitura da unidade, teste real de concorrência/idempotência e prevenção de ciclos entre receitas.
- Nenhuma função API nova. Mantidas doze funções em `api/`. Nenhuma migração, exclusão ou backfill executado.

## Verificações

- Build Vite.
- Testes puros/contratos existentes e novos.
- Firebase Auth/Firestore em projeto demo isolado: concorrência de produção, repetição idempotente, acesso por unidade, leitura/escrita das Rules do sinal, duplicação de folga, mês publicado, investigação e ausência de movimentação de saldo.
- Telas reais em Playwright com Firebase emulado e APIs de fixture: Mural, Produção, Inventário, Folgas, Minha Ficha e Cozinha, nas larguras 320/390/768/1280; ações de formulário e ausência de overflow. Isto não é homologação contra dados produtivos.

## Consolidação dos saldos experimentais — atualização após esclarecimento do responsável

O responsável esclareceu que todos os registros são experimentais. O diagnóstico da versão anterior identificou estes caminhos independentes:

| Fluxo | Fonte |
|---|---|
| Atalho Recebimento/Contagem, Estoque, Produção por ficha e Inventário | `physicalBalances`, `physicalReceipts`, `physicalCounts`, `productionRuns` |
| Estoque e Insumos, pedidos de compra, inspeção/aprovação e produção operacional | `v3PhysicalBalances`, `v3ReceiptInspections`, `v3Operations`, `purchaseOrdersV3` |

A continuação passa a usar `physicalBalances` e `physicalLots` para as novas operações dos dois caminhos. O adaptador traduz os nomes de locais usados pela interface operacional para os campos físicos, sem somar fontes. Documentos experimentais antigos de V3 permanecem preservados; quando não existe saldo canônico, a leitura compatível pode usar o saldo antigo, e a próxima operação escreve na fonte canônica. Havendo saldo canônico, ele prevalece. Não há limpeza, exclusão ou migração em massa.

Recebimentos, transferências, perdas e produção operacional passam a gerar os eventos canônicos consultados pelo histórico/inventário. Contagens por local só geram uma contagem física conjunta quando reserva e giro pertencem à mesma rodada. O atalho principal de Recebimento reutiliza o mesmo componente de conferência/aprovação ligado a pedidos.

O HTTP 403 da Vercel permanece uma limitação de acesso à configuração/publicação, **não um bloqueio para implementar ou testar com dados experimentais**. A consolidação é validada no Firebase emulado, sem depender de leitura produtiva. Produtos com lotes antigos incompatíveis continuam exigindo conferência explícita antes de movimentação; não se inventa disponibilidade de lote.

## Escopo que ainda não pode ser marcado concluído

- Recebimento único por pedido com múltiplas linhas, lotes e aprovação consistente com a fonte de saldo homologada.
- Unificação completa dos caminhos de insumos/recebimento/produção/contagem/histórico.
- Transformações com todos os rendimentos/unidades e origem por ingrediente, lotes de saída e fluxo de revisão/correção de ficha. O caminho atual continua conservador: destino `un`, reserva, sem lote final.
- Inventário automático escalável: paginação, resumo de todos os estados, invalidação por produto e relação com ambos os históricos após consolidação.
- Planejador de cobertura completa por setor/turno/competência, pausas e jornada específica de domingo. Não declarar validação trabalhista por implementação de regras conservadoras existentes.
- Navegação pelo botão Voltar e preservação de contexto em todos os caminhos; diretório e reconciliação de pessoas integralmente revisados.
- Comunicados com histórico paginado, estado pessoal de novo/não lido e eventual confirmação obrigatória (decisão ainda aberta no plano).
- Homologação funcional com dados reais e revisão final de segurança/matriz-unidades.

Uma suíte verde não fecha estes itens. O responsável faz a homologação funcional após a implementação e integração efetivamente completas.
