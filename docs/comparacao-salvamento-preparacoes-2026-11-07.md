# Cadastro de preparações: comparação e conclusão — 07/11/2026

## Problema reportado

O cadastro novo com três caminhos já representa a operação, mas o usuário não consegue concluir com clareza: “Salvar para revisão” cria rascunho e não disponibiliza a preparação; “Validar e ativar” depende de uma confirmação adicional. Isso é percebido como falha ao salvar. A solicitação é manter os três caminhos e corrigir a conclusão, não criar outro motor.

## Comparação do código

| Aspecto | Ficha anterior (`saveRecipe`) | Cadastro com três caminhos (`savePreparation`) |
| --- | --- | --- |
| Relações | Ingredientes com consumo fixo por rendimento | Porcionar mesmo insumo, transformar com consumo medido ou seguir receita |
| Salvar | Salva ficha ativa | O antigo botão Salvar para revisão gravava somente rascunho; ativar era ação separada |
| Uso no dia | Ficha ativa/compatível aparece na lista | Rascunho não aparece; uma ficha válida precisa ser disponibilizada |
| Saldo | Cadastro não movimenta estoque | Cadastro não movimenta estoque; execução mantém regras de cada processo |
| Segurança | Gestão, produto/unidade válidos, versão e ciclo | Mesmas garantias, plano de movimentação validado no servidor |

## Alteração

- Preservar os três caminhos e os vínculos do catálogo existente.
- Na revisão, **Salvar preparação** é a conclusão principal. Se as relações estiverem válidas, grava com `activate:true`, sem pedir aprovação adicional ou checkbox intermediário.
- **Salvar rascunho** é uma alternativa explícita; explica que a ficha não entra na produção e não substitui uma ficha ativa.
- As pendências ficam visíveis com o título “O que falta para disponibilizar”. O botão principal continua visível, desabilitado quando o plano está inválido; não remover validações para forçar o salvamento.
- Após confirmar o salvamento e recarregar os dados, abrir Hoje e selecionar a preparação recém-salva para adicioná-la ao planejamento. Isso não cria tarefa nem movimenta saldo automaticamente.
- Se a atualização da tela falhar depois de a gravação ser confirmada, informar que o cadastro foi salvo, em vez de apresentar a gravação como falha.
- Manter o mesmo identificador ao repetir uma tentativa de criação; não criar outra ficha por um novo UUID em cada clique.

## Limites operacionais

Não reativar automaticamente as sete fichas antigas bloqueadas. Ingredientes genéricos, produto final ausente e unidade de saldo incompatível ainda exigem dados reais. O usuário confirmou que 150 g no strogonoff representam frango cru; isso não demonstra o peso de um pacote de peito inteiro nem o peso final com molho. Não salvar conversões ou receitas presumidas com base nessa informação parcial.

## Verificação prevista

Testar os três processos no navegador, rascunho separado de ficha disponível, pendências mantendo o bloqueio, versão/permissões no Firebase isolado e cadastro → lista de produção de hoje → planejamento. Não usar estoque real como massa de teste.

## Resultado local

Build e 240 testes de regras aprovados. Três testes integrados aprovados: preparação no Firebase isolado; cadastro dos três caminhos em 320/390/768/1280 px; e salvar → selecionar em Hoje → adicionar ao planejamento, nas mesmas quatro larguras. As telas de teste usam dados sintéticos; nenhum cadastro ou saldo real foi alterado. A suíte completa do PR deve passar antes da integração.
