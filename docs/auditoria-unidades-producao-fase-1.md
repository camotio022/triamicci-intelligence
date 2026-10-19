# Auditoria de unidades — Fase 1 da Produção Inteligente
Data de referência: 2026-10-19. Escopo: inspeção estática do código na branch main e levantamento operacional de 23 itens fornecido pelo responsável da loja. **Sem leitura/mutação de dados do Firebase; nenhuma migração ou deploy.**

## Objetivo e limites
Padronizar apresentação de compra, recebimento, contagem, inventário, movimentação e receita, sem perder a unidade original nem somar valores incompatíveis. O levantamento de 23 itens é uma especificação operacional *proposta*, não a base ativa do Firebase. O catálogo JSON v2 contém regras provisórias em desacordo com algumas respostas (ex.: peito inteiro com `stockUnit: kg` na proposta, mas contagem por pacote na loja): **não aplicar a proposta automaticamente**.

## Achados confirmados no código
| Severidade | Área / arquivos | Evidência | Risco / decisão |
| --- | --- | --- | --- |
| Alta | `server/operations/logic.js`, `api/products/manage.js` | `countUnit` prioriza override/catálogo; correção e cadastro admitem apenas kg,g,L,ml,un. | Pacote/caixa/bandeja/porção não são modelos de saldo nativos. Criar modelo de apresentação sem forçar pacote a ser kg ou un. |
| Alta | `server/operations/logic.js`, `api/operations/stock.js`, `src/PhysicalStock.jsx` | `commercialDelivery` possui exceção kg → un apoiada em peso entregue; entrada física é expressa no saldo operacional. | Não existe conversão genérica por conteúdo da embalagem; recebimento de caixa / pacote requer fatores validados; exceção atual deve ser revista em testes. |
| Alta | `src/Production.jsx`, `api/production/manage.js` | Rendimento e execução são `yieldQuantity`/`portions` inteiros, sem `yieldUnit`; linhas da receita guardam apenas `productId` e `quantity`. | Não há rendimento por kg/L nem unidade explícita por ingrediente/linha histórica. Introduzir versão de schema e snapshot da unidade. |
| Alta | `server/production/logic.js`, `src/Production.jsx` | Cálculo proporcional `quantity * portions / yieldQuantity`, arredonda inteiro quando `individual`. | Arredondamento automático pode alterar receita. Exigir política por ingrediente, sem arredondamento silencioso. |
| Alta | `api/operations/stock.js`, `server/operations/transfer.js`, `server/operations/dispatch.js` | Saldos, lotes e movimentações usam uma `unit` por produto; transações verificam compatibilidade. | Preservar verificações; qualquer mudança de unidade exige revisão/recontagem, nunca multiplicação de saldos legados. |
| Média | `src/PhysicalStock.jsx` | Formulário de contagem recebe apenas números de reserva/giro, exibidos na unidade operacional. | Não há contagem desagregada de pacote fechado/aberto nem reconciliação da quantidade parcial desconhecida. |
| Média | `server/operations/daily-inventory.js` | Requer mesma unidade para contagem, entradas e saídas. | Correto para segurança, mas não suporta apresentações distintas sem normalização prévia e documentada. |
| Média | `api/products/manage.js`, `src/UnitCorrection.jsx` | Correção administrativa solicita motivo, registra auditoria, exige nova contagem; não converte histórico. | Preservar trilha de auditoria e evitar publicação de correções antes de conciliar saldos e lotes. |
| Média | `server/operations/dispatch.js` e `server/operations/transfer.js` | Saídas/transfers registram `quantity` e `unit` operacional e impedem saldo negativo. | Adicionar `originalQuantity`, `originalUnit`, `conversionRuleVersion` opcionais na evolução futura; sem regravar históricos existentes. |
| Média | `data/triamicci-product-catalog-v2.proposal.json` | Proposta possui definições provisórias e alerta de que não deve ser migrada automaticamente. | O levantamento da loja prevalece como demanda, mas inconsistências precisam de homologação antes de migração. |

## Matriz de decisões operacionais sobre os 23 itens
- **Peito de frango inteiro**: compra/recebimento/contagem em pacote. Peso normalmente não é registrado e varia entre pacotes. Pode haver abertura e consumo parcial, e o restante pode ser guardado ou utilizado conforme o movimento. Contar embalagens físicas não equivale a saber kg disponíveis. Rastrear estados da embalagem e bloquear baixas em kg presumidas.
- **Filé de frango 120 g**: chega pronto do fornecedor; NÃO descontar `peito-frango` por transformação interna. Unidade de contagem un. Peso nominal requer validação para uso como equivalência de massa real.
- **Strogonoff de frango**: peito inteiro é cortado durante a produção; `frango-cubos` não deve ser produção intermediária obrigatória. Toda composição precisa ser ficha técnica versionada (ingredientes adicionais não informados).
- **Óleo de soja**: caixa na compra/recebimento, garrafa de 1 L indicada na observação, saldo em L e contagem em un. Confirmar garrafas por caixa; `un` se refere à garrafa? Não assumir. Sem fator comprovado, não fazer conversão.
- **Alcatra, filé mignon, contrafilé/chorizo, alcatra-bife e tilápia**: compras em kg, contagem de peças/unidades ou porções; não inferir peso por peça. Alcatra legado precisa de plano de retirada sem apagar movimentos antigos.
- **Cubos de alcatra**: marcado como `raw`, mas rendimento `porção` e origem potencial de strogonoff; revisar se matéria-prima recebida ou preparação gerada.
- **Noisettes**: recebido/inventariado em pacotes, saldo em porções, contagem em unidades; exige conteúdo fixo/variável do pacote e porções por unidade.
- **Almôndegas**: marcado raw e comprado em caixas/pacotes embora apareça na categoria Preparações; confirmar se prontas do fornecedor.
- **Arroz e feijão**: compra/recebimento em caixa, contagem em pacote, saldo em kg; exige conteúdo da caixa e peso do pacote.
- **Ovos**: estoque em dúzia, compra em bandeja, contagem em dúzia e inventário em bandeja; confirmar ovos por bandeja e tratamento de ovos avulsos.
- **Margarina**: balde na compra/contagem/estoque; consumo parcial não pode tratar balde aberto como balde cheio. Confirmar peso/capacidade e forma de uso na receita.
- **Queijos**: item genérico, saldo un e recebimento pacote; separar variedades antes de automatizar.
- **Massas, hortifrúti e temperos**: item genérico e/ou saldo Não se aplica. Separar SKUs concretos e definir unidade antes da conciliação.
- **Strogonoff de carne**: preparação com origem `alcatra-cubos`; unidade un ainda precisa significar um recipiente/porção definido.
- **Tilápia grelhada**: novo item `novo-1` classificado raw, recebimento fardo; revisar classificação como preparação e vínculo à tilápia recebida.

## Modelo de dados futuro (NÃO IMPLEMENTADO)
`productMeasurementProfile` por unidade/produto e versão:
- `stockBaseUnit`: unidade *quantitativa* canônica (kg/g/L/mL/un) **quando o saldo for quantificável**;
- `operationalCountPresentation`: pacotes, caixas, bandejas, sacos, porções etc.;
- `packages[]`: id, rótulo, `contentAmount`, `contentUnit`, `fixed` e origem da validação; peso variável não tem fator fixo;
- `unitRelations[]`: origem/destino, fator comprovado, dimensão, vigência/versão; proibir conversão entre massa/volume/peça sem dado específico;
- `partialPackagePolicy`: aberto/fechado/em uso/esgotado/descartado, quantidade restante conhecida ou desconhecida;
- `sourceProvenance`: quem e quando homologou a relação.

`recipeVersion`: `yieldQuantity`, `yieldUnit`, `ingredients[{productId,quantity,unit,roundingPolicy,optionalSubstitutes}]`; congelar snapshot na produção planejada.
`movement`: quantidade informada + unidade/apresentação original; quantidade de saldo normalizada apenas quando conversão comprovada; lote/localização, ator, horário, justificativa e idempotency key. Os registros antigos permanecem intactos.

**Regra de segurança**: “peso desconhecido” é um estado próprio, jamais valor zero ou estimativa apresentada como medição. Quando a produção exigir kg e só existirem pacotes sem pesos, permitir planejamento com aviso, mas não confirmar baixa quantitativa presumida. A reconciliação deverá exigir medição ou fluxo auditado específico.

## Entregas em ordem
1. Criar testes de unidade para dimensão, conversões válidas e casos bloqueados; validar rejeição de pacote variável → kg, kg → peças e recipientes sem conteúdo.
2. Implementar núcleo puro de apresentação/conversão (sem efeitos no Firebase) e esquema de metadados por produto.
3. Apresentar a matriz dos 23 itens para homologação de fatores pendentes; não preencher lacunas com números inventados.
4. Adicionar interface gerencial de configurações e conferência **sem alterar saldos existentes**.
5. Integrar recebimento e contagens por apresentação preservando a unidade original; avaliar perfis com embalagem aberta.
6. Integrar transferências, baixas, inventário e relatórios sob mesma normalização.
7. Evoluir fichas técnicas com rendimento por unidade e produção planejada/concluída, com migração versionada e preservação de histórico.
8. Ensaios em ambiente de teste com cópia anonimizada/sintética; merge/deploy único consolidado após CI e validação.

## Critérios de aceite / bloqueios
- Não alterar `physicalBalances`, `physicalLots`, `productionRuns` ou catálogos ativos na auditoria.
- Uma quantidade não pode mudar de dimensão sem fator validado por produto e embalagem.
- A soma Reserva + Giro = Total usa a **mesma unidade quantitativa**, nunca mistura embalagens fechadas com abertas ou peso desconhecido.
- Consumir parcialmente uma embalagem não deve causar baixa integral nem saldo negativo.
- O estoque legado mantém unidade e valor originais até processo de reconciliação com conferência explícita.
- Testes de regressão devem cobrir recebimento, contagem, inventário, transferências, lotes, produção e relatórios.

## Perguntas de homologação pendentes, priorizadas
1. Óleo: quantas garrafas de 1 L por caixa? Na contagem, “un” = garrafa?
2. Arroz/feijão: quantos pacotes por caixa e qual peso por pacote?
3. Ovos: quantos ovos por bandeja e como contam bandejas incompletas?
4. Noisettes/almôndegas: quantas porções/unidades por pacote, conteúdo fixo ou variável?
5. Pacotes abertos de peito, margarina e outros: como registrar parte restante sem pesagem?
6. Alcatra cubos e tilápia grelhada: são realmente produzidos na loja? Há compra já pronta?
7. Separar cadastro genérico de queijos, massas, hortifrúti e temperos em itens individuais.
