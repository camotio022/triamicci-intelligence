# Pacote 02 — Operação física real (implementação inicial)

## Entregue nesta branch
- API autenticada POST `/api/operations/stock`, com operações `receive`, `count` e `list`, escopo por unidade e auditoria.
- Recebimentos persistidos em `units/{unitId}/physicalReceipts/{requestId}`.
- Contagens persistidas em `units/{unitId}/physicalCounts/{requestId}`.
- Formulários reais e histórico na navegação Recebimento / Contagem diária.
- Diferenciação de unidades para `alcatra-bife`, `alcatra-cubos` e `frango-file-120g` **quando há catalogId vinculado**.

## Limites importantes
- **Não mexe em `products.quantity` nem na coleção legada `movements`**. São registros físicos separados, não saldo contábil.
- Não conta unidades a partir de quilogramas automaticamente.
- Recebimento exige fornecedor; perecíveis exigem lote e validade, mas a baixa de lotes e FEFO **ainda não estão implementados**.
- Recebimentos só por gerente/admin; contagens exigem membro ativo. Ambas operações revalidam vínculo em transação.
- Não libera automaticamente os 20 documentos do catálogo central; o processo de homologação em lote e a migração v2 **estão pendentes**.
- Só permite selecionar produtos já vinculados à unidade; sem produto vinculado e ativo, não há formulário salvável.
- **Não** calcula consumo/saídas até haver conciliação, pois entradas físicas e contagem podem ter unidades divergentes.
- Com a regra atual de Origin, endpoints funcionam no domínio `PUBLIC_APP_URL` configurado; ambiente preview com domínio diferente pode rejeitar POST.

## Testes obrigatórios antes do merge
1. Build Vite, teste React (mobile/desktop) e checagem de importações.
2. Recebimento com gerente/admin: validar conteúdo salvo e histórico após recarga.
3. Contagem: zero permitido, unidades indivisíveis válidas para três produtos citados, histórico após recarga.
4. Repetição requestId sem duplicidade; requisição conflitante com mesmo ID retorna 409.
5. Usuário de outra unidade não consulta ou altera registros de unidade alheia.
6. Usuário sem gestão não registra recebimento, mas membro pode contar.
7. Produto inativo não recebe novos registros; controle de validade exige lote e data não vencida.
8. Conferir se catálogo central real inclui novos IDs e aprovações antes de oferecer fluxo completo.

**Status: implementação parcial, sem homologação; não fazer merge/produção até revisão e testes.**
