# Situação da implementação — PR 45

## Recursos desenvolvidos na branch (não homologados)
- Pacote 05: regras de habilidades por setor, habilidade etiquetagem, exceções multifuncionais administradas, preservação de competências preexistentes; testes unitários.
- Pacote 06: calendário mensal, rascunho, envio, validação de conflitos, aprovação por admin diferente do criador, publicação, notificação e substituição de versão anterior; API isolada por unidade; testes unitários.
- Pacote 07: mural de preparações/comunicados com aprovação e proposta de nova versão, escalas publicadas no mural, classificação auditada de produtos, políticas de validade em rascunho/aprovação, emissão e troca de etiquetas, trilha de eventos e componente de impressão; testes unitários.
- Na última rodada verificada (commit 5000cec), Pacotes 02/04/05 de CI concluíram com sucesso.

## Pendências impeditivas do merge
- [ ] Completar as solicitações de folga, deferimento e comunicação ao trabalhador; tratar ausências especiais e exceções legais.
- [ ] Validar regras de folgas e cobertura com a gerência (6x1, domingo mensal, cobertura de auxiliares e quatro pessoas como meta ou bloqueio). Testar bordas de mês, férias e escala parcial.
- [ ] Testes de autorização por papel, isolamento de unidades, aprovações, concorrência, idempotência e notificações no ambiente Firebase isolado de homologação.
- [ ] Configurar índices/regras Firebase e dados de homologação quando aplicáveis; verificar ausência de escrita em produção.
- [ ] Revisão sanitária real, assinada por responsável qualificado, dos prazos sugeridos (massas 10 dias, carne em reserva 30 dias, giro 3 dias). Não ativar prazos sem aprovação documentada.
- [ ] Conferir etiquetas reais: prazo e origem por lote, impressão A4/térmica, transferência, reimpressão, embalagem e conservação.
- [ ] Melhorar fluxos completos de fichas de preparações, alergênicos, versão e avisos; testar leitura no celular.
- [ ] Revisão visual mobile/tablet/desktop, acessibilidade por teclado, mensagens de erro, estado vazio e desempenho.
- [ ] Testes de ponta a ponta usando contas reais de teste por perfil e revisão manual de todos os critérios do documento principal.
- [ ] Aprovação funcional final; somente então realizar um squash merge e verificar o deploy.

A PR deve continuar em **draft** e nunca ser mesclada enquanto qualquer item bloqueante permanecer.
