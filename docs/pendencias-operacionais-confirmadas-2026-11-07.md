# Pendências operacionais confirmadas — Barigui — 07/11/2026

## Evidência atual

Inspeção autenticada no site publicado, perfil Administrador, unidade Barigui, Produção → Preparações. A tela mostra sete preparações com revisão pendente. Isca de tilápia está disponível e aparece no planejamento de hoje. Nenhuma preparação, vínculo, quantidade, contagem, lote ou saldo foi alterado nesta inspeção.

Código confrontado: `server/production/readiness.js` e `api/production/manage.js`, referência de main `5b893c9` (PR #178). O bloqueio observado corresponde aos cadastros/compatibilidade de saldo; não foi identificado motivo para enfraquecer a validação. Há mudanças concorrentes em outros chats: reconsultar main e o site antes da próxima alteração.

| Preparação | Bloqueio observado no site | Informação necessária antes de corrigir |
| --- | --- | --- |
| Legumes Grande | Verduras e legumes (itens a definir), fora do catálogo operacional | Quais legumes, quantidades de cada um e rendimento/unidade da receita real |
| Molho Caesar | Queijos (tipo a definir), fora do catálogo operacional | Qual queijo e composição/quantidades/rendimento validados pela cozinha |
| Molho ao Sugo | Verduras e legumes (itens a definir), fora do catálogo operacional | Ingredientes efetivos, quantidades e rendimento/unidade |
| Molho branco | Queijos (tipo a definir), fora do catálogo operacional | Confirmar se leva queijo, qual tipo, quantidades e rendimento/unidade |
| Molho porção | Molho para porção: saldo em kg e cadastro em g | Confirmar unidade desejada, contagem real e lotes; definir rendimento/medida do balde. Não reinterpretar o número antigo automaticamente |
| Strogonoff de Carne | Produto final Strogonoff de carne indisponível no catálogo operacional | Verificar existência/identidade do produto final; confirmar fonte cubos de alcatra, demais ingredientes e rendimento |
| Strogonoff de frango | Ingrediente Alcatra indisponível no catálogo operacional | Confirmar qual produto de frango é usado e sua quantidade; revisar também substitutos e rendimento. Não trocar apenas o ID preservando uma quantidade que pode estar errada |

## Informações já fornecidas pelo responsável

- Molho porção: exemplo de 1 balde com 3 L de óleo, 1 L de leite, 100 g de sal, 40 g de salsinha e uma pitada de alho. A pitada e a capacidade/rendimento operacional do balde não foram quantificados; não transformar esse exemplo em ficha ativa sem confirmação.
- Cubos de alcatra e bifes são cortes distintos; um não substitui automaticamente o outro.
- Isca é transformação com consumo e rendimento reais, sem consumo fixo presumido por porção.

## Continuidade concreta

1. O responsável/gerente confirma os dados reais da tabela. Podem ser enviados por preparação, começando por uma única ficha.
2. Conferir os IDs atuais e candidatos existentes no catálogo; reutilizar produto compatível, evitando duplicidade.
3. Ajustar a ficha com versão/revisão, sem lançar consumo nem ativar uma receita incompleta.
4. Conciliar saldo/lotes do molho somente após validar a unidade e o estoque real. A equivalência matemática kg/g não demonstra como os registros antigos foram digitados.
5. Reexecutar disponibilidade, planejamento e produção em ambiente isolado, incluindo unidade, lote, falta de saldo, reenvio e permissões.
6. Revisar/publicar somente a configuração confirmada. Confirmar no site que a ficha aparece para planejar e executar; não inventar estoque para forçar o teste.
7. Fazer o aceite da rotina real e do iPhone/PWA com a equipe. Essa homologação não foi feita por esta auditoria.

## Situação desta etapa

- [x] Reconsultar main e inspecionar o site autenticado.
- [x] Confirmar quais fichas permanecem bloqueadas e seus motivos.
- [x] Confrontar o comportamento com o código de validação.
- [x] Preservar dados e registrar as informações necessárias à continuidade.
- [ ] Receber as definições operacionais do responsável.
- [ ] Corrigir os cadastros confirmados e testar cada fluxo.
- [ ] Obter aceite operacional da unidade.

Não declarar as sete fichas corrigidas com base apenas neste relatório. Nenhum deploy de aplicação é necessário para registrar este levantamento.
