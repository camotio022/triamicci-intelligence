# Homologação controlada de contagens por embalagem — etapa de prévia
Esta implementação **não atualiza o estoque**. O servidor expõe `POST /api/operations/package-review` com ação `preview`, `productId`, `conferenceId` e `openedMeasurements: [{quantity,unit}]`.

## Garantias implementadas
- Identidade autenticada, papel admin/manager e isolamento da unidade.
- Conferência deve pertencer ao produto e à unidade ativa.
- Perfil de medidas deve existir e manter a mesma versão e método utilizado na conferência.
- A unidade do saldo atual deve corresponder à unidade operacional.
- Converte embalagens fechadas apenas se houver equivalência fixa e homologada; embalagens abertas exigem medição de cada unidade aberta.
- Resposta é `READY_FOR_REVIEW`, não aprovação nem atualização. Indica `stockEffect: NONE`.

## Limites antes de permitir escrita real
- Registrar e consultar medições auditáveis e suas origens, não aceitar somente valores temporários como base de uma baixa.
- Vincular contagens físicas a reserva/giro. Uma conferência agregada não deve sobrescrever os dois saldos.
- Conferir e conciliar lotes com FEFO, quantidade física e validade, inclusive inconsistências do saldo legado.
- Prevenir condição de corrida entre prévia e confirmação com transação que relê perfis, conferência, saldos, lotes e movimentos.
- Garantir permissão/autorização e idempotência da aprovação, trilha de auditoria e reversão com procedimento seguro.
- Homologação operacional por produto e teste com dados sintéticos/ambiente isolado.
- Não inferir que prévia numérica significa que o produto está efetivamente disponível, seguro ou em boas condições.

## Próxima entrega
Desenhar fluxo de alocação por reserva/giro e lote no fechamento gerencial e validação da loja antes de habilitar qualquer escrita nos saldos.

## Limite da implementação de aplicação transacional (outubro de 2026)

Existe agora `/api/operations/package-apply`, mas **o endpoint responde 503 por padrão**. Somente uma habilitação explícita de `ENABLE_PACKAGE_BALANCE_APPLY=true`, após homologação em ambiente isolado, permitirá executá-lo.

O caminho implementado permite apenas administração, produtos ativos sem rastreamento de lotes, embalagens fechadas, conversão fixa validada, referência atual de saldo e mesma versão do perfil, com idempotência e auditoria na transação. **Não há interface liberada para chamar essa aplicação**.

Não habilitar a chave em produção sem antes:
- Testar com Firebase de homologação, incluindo concorrência e duplicidade;
- Avaliar cada operação que lê e escreve `physicalBalances` após ajustes (contagem, movimentos, produção, transferência e relatórios);
- Reconciliar todos os fluxos que usam `countId`, `lastMovementAt`, `entriesSinceCount` e `exitsSinceCount`;
- Desenvolver caminho transacional para produtos rastreados por lotes, incluindo evidência da contagem individual;
- Homologar uso da interface com equipe da cozinha e aprovar o plano de deploy.
