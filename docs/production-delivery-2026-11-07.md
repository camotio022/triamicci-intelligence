# Produção — revisão de entrega em 07/11/2026

## Comportamento
- Hoje reúne planejamento e execução. Planejar não movimenta estoque.
- Preparações reúne cadastro guiado, situação de cada ficha e revisão dos vínculos.
- Fichas anteriores permitem apenas revisar registros existentes; criação usa o cadastro guiado.
- Histórico preserva registros e filtros existentes.
- Gestão pode arquivar fichas ativas ou rascunhos. Saldo e histórico são preservados; versão impede que um editor desatualizado reative uma ficha arquivada.
- Auxiliar e cozinheiro podem planejar e executar na própria unidade; cadastro e arquivamento continuam restritos à gestão.
- Transformação usa consumo real, rendimento final e lotes. Porcionamento do mesmo produto não cria estoque.

## Verificação
- 227 testes de regras e build aprovados.
- Emuladores Firebase: cadastro, ativação, arquivamento, versões concorrentes, permissões, isolamento, lotes, execução idempotente e planejamento do auxiliar.
- Interface: 320, 390, 768 e 1280 pixels; cadastro dos três processos, transformação medida, planejamento/execução e filtros de histórico.
- Cloud no site publicado: entrada Google como administrador; ficha já existente de isca de tilápia ativada e confirmada nos seletores; adicionada ao planejamento sem meta; execução aberta. Não foi confirmado consumo fictício de estoque em produção.

## Pendências operacionais reais
Sete fichas permanecem bloqueadas: Legumes Grande, Molho Caesar, Molho ao Sugo, Molho branco, Molho porção, Strogonoff de Carne e Strogonoff de frango. Há ingredientes genéricos a definir, vínculos antigos (inclusive alcatra no strogonoff de frango) e saldo do molho em kg contra cadastro em g. É necessária revisão das receitas e conciliação dos saldos/lotes com a unidade. Nenhuma receita, conversão entre peças e peso ou contagem inicial foi inventada para liberar o fluxo.
