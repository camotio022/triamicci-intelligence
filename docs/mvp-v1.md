# Triamicci Intelligence — MVP 1.0

## Objetivo
Apoiar a operação da cozinha com registros rastreáveis de recebimento, produção, reserva, giro e contagens. O painel atual é **demonstrativo**: seus números não são saldos reais nem CMV calculado.

## Princípios
- Registrar eventos com data/hora, autor e unidade; preservar histórico de correções.
- Não confundir transferência reserva → giro com consumo.
- Não apresentar saldo projetado como conferido. Exibir data da última contagem e nível de confiabilidade.
- Evitar contagem diária obrigatória pelos cozinheiros e auxiliares.
- Não prometer cálculo ou redução de CMV sem dados de custos, vendas e inventário validados.

## Fluxos do MVP
1. **Recebimento:** auxiliar compara quantidade solicitada com quantidade física (balança quando aplicável). Se divergir, registrar quantidade efetiva, diferença e observação opcional; status `pendente` até resolução por responsável autorizado. A assinatura do documento externo não deve ser simulada pelo sistema.
2. **Produção:** registrar insumos utilizados, unidade, quantidade efetivamente produzida, rendimento e responsável. Ficha técnica é referência, não substitui o rendimento real.
3. **Movimentação:** registrar origem, destino, item e quantidade. Reserva → giro é transferência interna, não saída de consumo.
4. **Contagem:** gerente ou pessoa autorizada registra quantidade física, momento da conferência e eventuais ajustes justificados. Contagens podem ser periódicas.
5. **Dashboard:** exibir registros recentes, divergências pendentes, última contagem por produto e avisos de saldo estimado.

## Entidades propostas
- `Product`: id, nome, categoria, unidadeBase, ativo.
- `Location`: id, unidade, tipo (`reserva` | `giro`).
- `PurchaseOrderLine`: id, pedidoId, produtoId, quantidadeSolicitada, unidade.
- `Receipt`: id, pedidoId, itens [{produtoId, solicitado, recebido, unidade}], status, observacao, criadoEm, criadoPor, resolvidoEm?, resolvidoPor?.
- `Recipe`: id, produtoFinalId, insumos [{produtoId, quantidade, unidade}], rendimentoPrevisto.
- `Production`: id, receitaId, insumosReais, quantidadeProduzida, localDestino, criadoEm, criadoPor.
- `Movement`: id, produtoId, quantidade, unidade, origem, destino, motivo, criadoEm, criadoPor.
- `Count`: id, localId, itens [{produtoId, quantidadeFisica}], contadoEm, contadoPor.
- `Adjustment`: id, produtoId, localId, delta, motivo, contagemId?, aprovadoPor, criadoEm.

## Regras de validação
- Quantidades devem ser números finitos e não negativos; movimentações devem ser positivas.
- Unidades incompatíveis não podem ser somadas sem conversão explícita.
- Alterações confirmadas geram novo evento de correção; não sobrescrevem silenciosamente o histórico.
- Acesso por permissão de ação, não apenas por nome do cargo.
- No protótipo, usar dados fictícios identificados como tal; antes de produção, definir autenticação, autorização no backend, persistência e auditoria.

## Próxima implementação
Criar o fluxo de recebimento com formulário, comparação pedido × recebido, sinalização de divergência e lista de pendências, inicialmente com dados demonstrativos. Depois integrar persistência e permissões.