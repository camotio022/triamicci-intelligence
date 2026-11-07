# Conferência de estoque — 07/11/2026

## Experiência

O acesso Contagem passa a abrir Conferência de estoque, com abas Hoje/Histórico e áreas Giro/Reserva. A lista usa o catálogo operacional existente; não cria insumos, conversões ou frequências paralelas. Atenção considera primeira contagem, frequência diária/semanal vencida e aviso aberto; criticidade ordena prioridades. Todos permite conferir outros produtos, Contados mostra os que possuem contagem física na área no dia do restaurante (America/Sao_Paulo).

A contagem mostra um produto por vez, teclado numérico, zero explícito, observação recolhida, última conferência e avanço. Nenhum saldo anterior preenche os campos. Produtos com validade continuam exigindo quantidades por lote; o total é calculado da soma digitada. Unidades divergentes impedem o lançamento. Uma diferença grande pede confirmação da reconferência, sem alterar o valor informado.

## Integridade e permissões

A contagem usa o endpoint existente v3Count e o saldo canônico physicalBalances. Apenas administrador, gerente e subgerente podem lançar. A outra área é preservada; enquanto não houver a mesma rodada nas duas áreas, a qualidade continua parcial. O UUID da rodada é mantido por aba, conta, unidade e dia; não guarda quantidades nem credenciais. Nova rodada é uma ação explícita. Não há promessa de envio offline: só é exibido sucesso após confirmação da API.

A conferência rápida Tem/Pouco/Acabou aceita os perfis operacionais da equipe. Registra responsável, data e histórico imutável em availabilityHistory; availabilityChecks contém a última observação por produto/local. Pouco e Acabou notificam a equipe no fluxo existente. Tem não resolve silenciosamente uma falta pendente da gestão. Nenhuma dessas ações grava saldo, recebimento ou contagem. Repetir o mesmo requestId é idempotente; reutilizá-lo com outro conteúdo é recusado.

O histórico de contagens por área lê páginas de 60 movimentações do ledger existente, sem excluir documentos antigos; páginas sem contagens não são apresentadas como histórico completo. Lotes são buscados somente ao abrir um produto que os exige. A rotina reutiliza o listener compartilhado da unidade e não busca pedidos de compra.

## Validação

- Regras puras: frequência, fuso, locais, unidade, primeiro registro e prioridade.
- Firebase isolado: permissões, isolamento de unidade, revogação, contagem parcial/completa, lote obrigatório e reenvio idempotente.
- Navegador: 320, 390, 768 e 1280 px; teclado, zero, decimal por lote, avanço, duas áreas na mesma rodada, disponibilidade sem contagem e ausência de rolagem horizontal.
- Build e suíte existente de catálogo de 56 produtos e cinco perfis.

Não foram criados saldos ou contagens de teste em produção.
