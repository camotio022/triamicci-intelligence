# Pacote 02 — Fechamento operacional (PR #31)

## Fluxos implementados

- **Recebimento:** entrada auditada no Firestore; quando existe contagem-base, acrescenta a quantidade recebida à reserva e ao total físico (sem alterar legado). Se não existe contagem-base, é preciso fazer uma contagem antes de disponibilizar fisicamente o produto.
- **Contagem diária:** estabelece/reconcilia o saldo observado em reserva e giro; registra diferença em relação ao saldo esperado, sem presumir que seja venda.
- **Transferência interna:** movimenta da reserva para o giro (ou inversamente), preservando o total físico e auditando quem realizou.
- **Saídas, perdas, devoluções ao fornecedor e ajustes de saída:** debitam apenas a área informada, impedem saldo negativo, registram motivo, responsável e horário.
- **Lotes com validade:** recebimentos novos armazenam quantidade disponível por área. Para produtos com controle de validade, saídas e transferências aplicam FEFO sobre **lotes conferidos**, bloqueiam faltas e vencidos para consumo; perdas e devoluções podem registrar baixas de vencidos.
- **Conciliação administrativa de lotes:** administrador informa quantidades físicas por lote, cuja soma deve corresponder exatamente à última contagem de reserva e giro, com justificativa e auditoria. Dados legados sem saldo por lote nunca são presumidos disponíveis.
- **Correção de unidades:** administrador pode especificar unidade física e comercial por produto da unidade, com justificativa e necessidade de recantar; a operação não converte contagens antigas nem edita registros históricos.
- **Histórico e resumos:** listagens paginadas por recebimento, contagem, saída e transferência; contadores materiais desde a última contagem para evitar varrer todo o histórico.
- **Interface:** ações na ficha do produto, formulários mobile-first do pacote 2.6 preservados.

## Modelo de dados

- `units/{unitId}/physicalBalances/{productId}`: reserva, giro, total, última contagem-base, entradas e saídas acumuladas.
- `physicalReceipts`, `physicalCounts`, `physicalOutflows`, `physicalTransfers`, `physicalLotReconciliations` separados e auditados.
- `physicalLots/{productId}/lots/{sha256(lot|expiry)}`: reserva/giro por lote, quantidade recebida histórica e disponibilidade atual.
- `products.quantity` antigo permanece preservado — fonte antiga não é silenciosamente convertida em novo saldo.

## Fluxo de homologação após um único merge

1. Selecionar um **produto de teste** na unidade Barigui e confirmar unidade física e comercial, sem mexer em saldos reais.
2. Registrar a **primeira contagem** de reserva e giro. Verificar no Estoque e na ficha.
3. Se houver validade, executar **Conferir lotes** como admin, incluindo todos os lotes e conferindo que soma reserva+giro corresponde à contagem.
4. Registrar **recebimento** com lote válido; atualizar e confirmar acréscimo na reserva, disponibilidade por lote e histórico.
5. Transferir da reserva para o giro; confirmar redução e aumento correspondentes, total inalterado.
6. Registrar saída por consumo/produção; confirmar FEFO e redução do giro e do total.
7. Registrar perda ou devolução, conforme permissões; confirmar motivo, responsável, lote e saldo.
8. Fazer nova contagem e conferir diferença; esta não deve ser classificada automaticamente como venda.
9. Atualizar a página e testar envio repetido com o mesmo ID, ausência de saldo, produto inativo e usuário sem permissão.
10. Testar no iPhone e desktop: botões acessíveis, campos responsivos, mensagens de erro legíveis e histórico com carregar mais.
11. Se houver produto com unidade errada, **corrigir com administrador e refazer contagem**, nunca converter números automaticamente.

## Observações e limites

- Até existir uma contagem-base, recebimentos são eventos auditados, mas o saldo físico não é presumido conhecido.
- Para produtos com validade, **saída é bloqueada quando lotes não conferem com o estoque físico**, evitando baixas fictícias.
- Lotes já registrados anteriormente podem não ter reservas/giro por lote. Exigem uma conciliação inicial humana, e não migração automática.
- Produtos com mais de 100 lotes são bloqueados para FEFO automático até haver estratégia adicional de paginação administrativa; páginas de histórico físico são paginadas.
- Os produtos com unidades historicamente incoerentes (ex.: latinha em `ml`) exigem correção individual verificada, para não reinterpretar 13 ml como 13 latas sem conferência.
- O controle antigo de movimentações continua separado e identificado como legado na área administrativa; não deve ser utilizado para entradas novas.
- Os testes automatizados não substituem **integração real no Firebase e verificação visual no iOS**, previstas após a publicação combinada.

## Publicação

Branch `feat/pacote-02-fechamento-operacional`. PR #31; **um único squash-merge em main** após CI verde e revisão. Nenhuma escrita em dados Firebase pela publicação.
