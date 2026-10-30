# V4 — diagnóstico de unidade e fronteiras de acesso

Revisão do código em `api/`, `server/`, `src/` e `firestore.rules`, acompanhada de contratos Firebase emulado. Este documento descreve o modelo implementado; não afirma disponibilidade de troca entre múltiplos vínculos ou indicadores corporativos.

| Entidade | Propriedade / acesso |
|---|---|
| `memberships/{uid}` | Identidade global com unidade e papel ativos. Cliente lê somente o próprio vínculo; backend autentica e resolve o contexto. Escrita pelo servidor. |
| `productCatalog` | Catálogo compartilhado, distinto de produtos e saldos de cada unidade; administração via API autorizada. |
| `units/{unitId}/products` e coleções operacionais | Estoque, lotes, recebimentos, produção, contagens, investigação e pedidos pertencem à unidade derivada da sessão. Recebimento/aprovação revalidam produto, unidade, perfil, lote e vínculo dentro da transação. |
| Escalas, pessoas, folgas, comunicados e notificações | Subcoleções da unidade, com leitura/ação por papel ou titular conforme endpoint. Cadastro profissional não é prova de identidade nem cria conta automaticamente. |
| `units/{unitId}/live/attendance` | Somente sinal de revisão/data; ativo da mesma unidade pode escutar. Cliente não escreve. Conteúdo operacional continua nas APIs autenticadas. |
| `auditLogs` | Centralizado no servidor, com `unitId` e autor nos eventos operacionais. Rules não permitem consulta ou escrita direta do cliente. |
| `invitationRateLimits` | Controle técnico global de convites, operado pelo servidor; não é estoque nem registro de colaborador. |

As Rules adotam negação por padrão. O Admin SDK contorna Rules, portanto os testes de API verificam autorização separadamente: uma conta estrangeira não consegue produzir no estoque da outra unidade, escutar seu sinal nem consultar seus comunicados. Cliente também não pode forjar invalidação. O aprovador precisa do papel gerencial ativo dentro da transação.

A aplicação remonta o conteúdo por unidade, papel e conta; listeners são cancelados e preferências de apresentação são separadas por conta/unidade. O histórico de rota só recupera um produto quando pertence ao mesmo contexto armazenado.

## Expansão futura

O modelo atual possui um vínculo ativo por UID. Um seletor de várias unidades exige modelar e validar a lista de vínculos no backend antes de oferecer troca. A matriz exige papel global explícito e agregações autorizadas; não se deve conceder leitura ampla das subcoleções aos gestores locais nem tratar produção como venda.

Não foi necessária mudança de Rules, migração de coleções ou exclusão de dados nesta entrega. Uma expansão deve inventariar documentos e índices, definir responsáveis/retenção de auditoria, ensaiar backup e rollback, testar duas unidades com usuários e papéis distintos e reconciliar contagens/lotes antes de migrar registros. Dados experimentais antigos permanecem preservados e não são somados à fonte canônica.
