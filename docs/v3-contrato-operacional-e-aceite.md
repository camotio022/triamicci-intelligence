# Triamicci Intelligence V3 — contrato operacional e critérios de aceite
Status: planejamento técnico em branch isolada. NÃO migrar, NÃO publicar sem homologação.

## Invariantes
1. Todos os insumos existem no catálogo, mas contagem quantitativa é opt-in por produto, alterável por gerente/admin. Modalidades: quantitative, availability, on_demand. Status *desconhecido* nunca é *sem estoque*.
2. Reservado ao 2º piso e Giro ao 1º são endereços do MESMO produto. Reserva+Giro=Total somente se contagens têm mesma unidade, cobertura e referência. Data/hora de cada localização são independentes; nunca declarar total físico atual quando uma delas estiver desatualizada.
3. Recebimento comercial (kg, pacote, fardo, caixa) ≠ unidade física ≠ porção preparada. Sem conversões por peso nominal, especialmente produto com peso variável. Registrar peso aferido sem calcular porções automaticamente.
4. Produção: débito da origem e crédito do produto preparado em uma transação idempotente e auditável, lotes/validade preservados; rendimento real informado. As receitas alternativas exigem confirmação humana e motivo, não inferir de diferença de inventário.
5. Consumo durante serviço não recebe baixa por pedido. Diferença da contagem é *saída estimada não classificada*, nunca igualar automaticamente a venda ou produção.
6. Transferências Reserva↔Giro registram movimentação, não consumo e não alteram o total. Possibilidade de recontagem rápida sem transferência não dispensa trilha histórica.
7. Sinalização de falta por funcionário: observação separada do saldo quantitativo, autoria, local, data, duplicações agregadas, revisável por pessoas autorizadas, visível no estoque para todos; nunca altera saldo.
8. Compra é registrada DEPOIS do pedido externo (WhatsApp). Data prevista obrigatória, status solicitado/confirmado/atrasado/parcial/recebido/cancelado, quantidades comerciais e fornecedor. Só recebimento aferido altera estoque; domingo sem entrega é alerta de planejamento, não proibição universal de cadastro.
9. Gerência arquiva/restaura itens sem apagar histórico; renomeações e fusões mantêm identidade, referência histórica e relações; nenhuma migração de saldo ou lote implícita.
10. Qualquer alteração operacional tem autorização da unidade, trilha de auditoria, idempotência, verificação de versão e regra de concorrência; nunca confiar só no controle de interface.

## Entidades propostas (não migradas)
Product: id permanente, displayName único por unidade e aliases pesquisáveis; category, lifecycle(active/inactive), origin(supplier/internal/both), controlMode, allowedLocations, countUnit, receivingPresentations, defaultPreparation; sourceVersions.
StockObservation: productId, location?, available|low|missing|unknown, reporter, timestamp, description, resolution; signal não altera physicalBalances.
CountSession: productId, location, quantity, countUnit, observer, timestamp, baseRevision, coverageComplete; submitted/approved/invalidated.
PurchaseOrder: id, supplier, orderedAt, etaDate obrigatório, status, items[{productId,quantity,presentation}], actor, externalChannel=WhatsApp, notes, confirmations.
Receipt: purchaseOrderId opcional, itemId, deliveredCommercial, measuredWeight opcional, quality/temperature/expiry/lot, difference, acceptedQuantity, actor; saldo somente após validação da unidade.
PreparationDefinition (versão): resultProductId, inputs aceitos e alternativas, yields reais registrados, productionUnit, outputUnit, allowedLocations, traceability.
ProductionRun: recipeVersion, consumed[{sourceId,location,measuredQty,unit,lot}], produced[{targetId,location,quantity,unit,lot}], actor, idemKey, audit.
StorageContainer: etiqueta com quantidade INICIAL, validade e lote; não exigir atualização a cada retirada. Embalagem física não altera unidade contada.

## Catálogo operacional já homologado em conversa (proposta inicial, conferir com usuários)
Tilápia crua recebida em fardo/saco, aferida kg. Produto preparado "Tilápia grelhada": cru temperado, unidade de 120 g ensacada individualmente. "Tilápia à milanesa": filé empanado, unidade. "Isca de tilápia": porção de 330 g ensacada.
Alcatra grelhada: recebida pré-cortada 120 g, conferida kg, unidade individual em saquinho, crua NÃO temperada. Pode virar parmegiana, ou strogonoff de carne em falta de cubos. Cubos de alcatra: pacotes conferidos kg, insumo para porção de alcatra 250 g ou strogonoff. Não transformar cubos em bife.
Frango grelhado: filé 120 g recebido pronto, contado individualmente; pode virar parmegiana, em exceção strogonoff. Peito inteiro: controle por PACOTE com peso desconhecido se não medido, origem preferida strogonoff e alimentação funcionários, abertura parcial rastreável. Parmegiana de frango unidade.
Contrafilé/chorizo: pacote conferido kg, peças individualizadas em saquinhos no palafrão, contadas un; confirmar gramatura nominal antes de impor 120 g.
Mignon para parmegiana: peças 110 g recebidas do fornecedor, por vezes na Reserva antes de bater/empanar; contadas un. Medalhão de mignon: 150 g em unidades embaladas individualmente para grelha, não confundir com 110 g.
Rondelli: rolo/saco conferido kg, corta em conjuntos de 5 rodelas ensacadas, cada conjunto equivale a UMA porção; reserva/giro.
Frango a passarinho: congelado pré-cortado recebido kg, temperado e porcionado 500 g por saquinho, grupos de cinco porções por saco maior; na Reserva o saco maior, movimenta cinco porções para Giro e consome por unidade.
Strogonoff de frango/carne: 10 saquinhos de porção individual por saco maior etiquetado; controlar por porção. Peso individual ainda pendente.
Palafrão: recipiente agrupador de porções embaladas, etiqueta identifica quantidade inicial e validade, não restante.

## UX obrigatório
- Mobile first E desktop completo, sem rolagem horizontal de conteúdo crítico. Testar larguras 320, 375, 430, 768, 1024, 1440.
- Cadastro guiado por etapas: identidade e duplicados; origem/recebimento; controle; preparo/origem; armazenamento; revisão. Campos condicionais.
- Nenhuma contagem obrigatória para produto em disponibilidade; funcionário comunica baixo/ausente sem alterar saldo.
- Estoque mostra "disponível" e confiança da informação: confirmado por contagem, estimado por movimentos ou não conferido.
- Recebimento pode ser relacionado a pedido e agenda; conferência separa pedido vs entregue vs aceito e registra divergência.
- Tabelas em desktop; cartões completos no celular; foco visível, botões com alvo confortável, loading/erro/vazio/sucesso acessíveis, toast sem esconder alertas.
- Alterações destrutivas com confirmação clara de consequências e reversão segura; sem apagar histórico.

## Critérios de aceite para merge
A. Catálogo: configurar qualquer modo + arquivar/reactivar, duplicados, aliases e legado sem reescrever lançamentos; teste com tomate.
B. Pedidos: ETA obrigatória; todos veem futuras entregas, atrasos e recebimento parcial; não somar pedido ao estoque; teste quinta/sábado/domingo.
C. Sinalização: 2 funcionários reportam mesma falta, 1 pendência consolidada, gerente confirma/resolve, alertas visíveis.
D. Recebimento: tilápia 10 kg aferidos e saldo bruto; sem criação de 83 porções por fórmula; duplicado idempotente; validade/lote.
E. Produção: filé tilápia vira grelha/milanesa/isca, saída real em kg, rendimento real e local registrado; alternativa com justificativa.
F. Contagem: reserva+giro quando ambas verificadas e coerentes; dois momentos diferentes exibem aviso de defasagem; consumo estimado não vira venda.
G. Embalagens: 5 porções frango passarinho/saco grande; 10 strogonoffs/saco; saquinhos abertos contados exatamente, nada inferido.
H. Segurança: multiunit, papel, histórico, concorrência, revisão de migração legada e restauração; testes E2E com Firebase de teste.
I. Estética: acessibilidade e revisão visual de todas as telas novas/alteradas em mobile/tablet/desktop.
J. CI/build + homologação funcional antes de habilitar mutação de saldos. Um único merge/deploy consolidado depois da autorização explícita.

## Sequência sem deploy
1. Fixar contrato e casos de teste.
2. Catálogo e permissões com modo de controle e migração explícita.
3. Sinalização + agenda.
4. Recebimento vinculado a agenda, lotes.
5. Produção transacional; contagem/localizações.
6. Design e E2E, scripts de migração reversíveis, somente preview.
7. PR final para autorização de merge; usuário testa telas após deploy.
