# MVP operacional do Triamicci Intelligence

O gerente e o operador devem conseguir fechar um dia de teste em uma unidade com dados fictícios, do recebimento à conferência do estoque.

| Área | Critério de aceite |
| --- | --- |
| Acesso e equipe | Gerente e operador entram em sessões independentes. Cada conta enxerga sua unidade e suas ações autorizadas. A equipe consulta a escala e registra entrada e saída. |
| Recebimento | Operador confere um pedido. Gerente aprova e verifica que o crédito entra uma vez. |
| Estoque | Equipe localiza o saldo no Giro e na Reserva. Gerente confere uma contagem, incluindo saldo zero, e consulta o histórico. |
| Produção | Gerente ativa fichas. Operador planeja e executa frango, tilápia e molho. A segunda sessão confere a tarefa concluída, os saldos e o histórico depois de atualizar. |
| Checklists | Operador conclui um checklist de abertura ou fechamento. O gerente confere o registro em outra sessão. |
| PWA | Gerente e operador executam o roteiro no link de homologação com tela de celular. |

## Produção

- Frango no mesmo cadastro. Registrar porções de 500 g e conferir que o saldo total permanece igual.
- Frango cru e temperado com cadastros separados. Com peso de 500 g por porção, registrar 1,5 kg de frango preparado e conferir a baixa de 1,5 kg no cru e o crédito de 1,5 kg no preparado.
- Tilápia. Informar consumo e rendimento efetivamente medidos. Conferir a baixa, a entrada do preparado e o lote.
- Molho. Informar o rendimento final e verificar a baixa de cada ingrediente controlado.
- Planejar uma tarefa em um dia e concluí-la no dia seguinte pelo telão. Conferir a tarefa original concluída e o histórico na data da execução.
- Durante o planejamento, verificar que todos os saldos permanecem iguais. Reenviar uma confirmação com o mesmo identificador na suíte automatizada e verificar que a movimentação ocorreu uma única vez.

## Liberação

Para aprovar o piloto, registrar o resultado de cada jornada no ambiente de homologação e resolver qualquer falha que impeça concluir o dia ou altere incorretamente estoque, permissões ou histórico.

OCR, IA, push no iPhone e terminal QR ficam fora dos critérios de liberação do piloto. O login escolhido para as contas de teste precisa funcionar no PWA publicado.
