# Pacote 02 — Operação Real do Estoque

**Situação: implementação funcional em revisão; merge NÃO autorizado até testes de integração e aceite.**

## Código implementado

1. `api/catalog/sync-v2.js`: prévia da sincronização do catálogo v2, migração aditiva condicionada à confirmação explícita por administrador; cria apenas produtos novos suficientemente definidos como **inativos**. Preserva nomes, unidades base, saldos e status dos produtos existentes. Registra auditoria. Não altera produtos com incompatibilidades.
2. `api/catalog/manage.js` + `src/CatalogPicker.jsx`: aprovação individual/em lote para itens com metadados v2 suficientes; itens genéricos e incompletos permanecem bloqueados. Vinculação à unidade continua explícita, com saldo inicial zero para novos vínculos.
3. `src/CatalogV2Review.jsx`: prévia administrativa conectada ao Firebase, com contagem de produtos aptos, pendentes ou divergentes e botão de aplicação controlada. O conteúdo detalhado da proposta ainda é estático para comparações.
4. `api/operations/stock.js`: `receive`, `count`, `summary`, `list`; registros em `physicalReceipts` e `physicalCounts` por unidade, responsáveis e auditoria, com idempotência baseada em `requestId`; sem alteração de `products.quantity`. Ao contar, materializa `physicalBalances/{productId}` com a última reserva/giro.
5. `api/products/manage.js` + `src/Inventory.jsx`: exibem a última contagem física como referência operacional, quando houver, sem sobrescrever saldo legado.
6. `src/PhysicalStock.jsx`: formulários operacionais ligados ao Firestore; quantidade solicitada na unidade comercial, conferência de peso de entrega e contagem individual quando necessário; reserva, giro, total, última entrega, entradas desde contagem anterior, diferença física estimada e histórico recente.
7. `api/operations/logic.js` + `tests`: regras puras testadas para unidade, contagem, pedido-versus-entrega e diferenças físicas.

## Proteções e regras importantes

- **O saldo legado não é conciliado automaticamente** com registros físicos. Mostrar os dois como se fossem o mesmo saldo seria enganoso.
- Não converter kg em peças por estimativa. O registro de bife, cubo e filé pronto exige quantidade física efetivamente contada.
- Diferença física não é classificada como venda ou consumo: pode incluir perdas, devoluções e movimentos não registrados.
- Registrar lote e validade no recebimento de perecíveis não equivale a fazer gestão de saldo por lote, FEFO, baixa e rastreio de saídas.
- Produtos ainda não aprovados/vinculados não entram no formulário de operação.
- Admin/gerente recebem; todo membro ativo da unidade pode contar. A API valida de novo a permissão em transação.
- O histórico por lista traz 50 registros mais recentes; o resumo por produto processa até 500 de cada tipo e desabilita cálculo se exceder. **Paginação completa permanece pendente**.

## Checklist antes de merge

- [ ] CI (obrigatório): `node --check` das APIs, validação do catálogo, testes de regras, `npm run build`.
- [ ] Validar de fato com Firestore/emulador: migração v2 em prévia e aplicação autorizada, sem alterar saldos.
- [ ] Executar aprovação em lote somente com dados elegíveis e conferir auditoria.
- [ ] Vincular pelo menos um produto elegível à unidade de teste e confirmar que aparece no formulário.
- [ ] Executar recebimento de peças conferidas em kg: pedido de 12 kg, peso entregue diferente, peças contadas efetivamente.
- [ ] Executar contagem separada em reserva/giro, recarregar página, verificar histórico persistente e cálculo após novas entradas.
- [ ] Testar duas tentativas com mesmo requestId e resultados 200 duplicado ou 409 em conflito.
- [ ] Testar papel auxiliar (recebimento bloqueado), gerente/admin (recebimento permitido) e acesso por unidade isolada.
- [ ] Validar recebimento vencido, lote ausente, contagem negativa, quantidades fracionadas em peças.
- [ ] Testar comportamento de falha de rede e reenvio no celular.
- [ ] Homologar procedimento operacional de lotes, conciliação de saldos legados e ajustes/devoluções antes de chamar o estoque de consolidado.

## Limites de escopo que não devem ser escondidos

A conciliação do saldo legado, ledger por lote/FEFO, ajustes manuais, devoluções e paginação de histórico **não estão concluídos**. Se forem requisitos indispensáveis para o aceite total do Pacote 02, precisam de implementação e testes adicionais antes de merge.

## Publicação

Nada neste documento autoriza implantação de produção. A branch do pacote tem PR **draft**, sem merge e sem aplicação automática de migração. A Vercel Preview continua desativada para economizar deployments.
