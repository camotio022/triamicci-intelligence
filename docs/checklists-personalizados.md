# Checklists personalizados da unidade

Acompanhamento: issue #141. Decisões aprovadas em 06/11/2026.

## Produto

A gestão (administrador, gerente e subgerente) cria modelos vazios e cadastra os itens. Não há listas operacionais fixas programadas. Cozinheiros e auxiliares executam as listas da própria unidade. Modelos têm nome, momento (abertura/fechamento/outro), frequência (diário/dias da semana/avulso), horário limite e funções responsáveis. Itens ordenados têm orientação, obrigatório, crítico, foto obrigatória e permissão para não se aplicar.

Tela Hoje com progresso/prazo; execução de um item por vez; Histórico separado; Gestão para criar, revisar, publicar, duplicar e arquivar. Cores e componentes seguem o app, com uso no celular como prioridade.

## Contrato técnico

- API pelo dispatcher existente `/api/members/manage`, módulo `checklists`: evita aumentar o número de funções Vercel.
- Coleções por unidade: `checklistTemplates`, `checklistRuns`, `checklistPhotos`. Nenhuma leitura/escrita de negócio diretamente pelo cliente.
- Modelo: rascunho independente, versão publicada imutável e contador de revisão para concorrência. Editar não substitui a versão operacional até publicar. Arquivar não apaga histórico.
- Execução diária tem ID determinístico por modelo/data local São Paulo. Execução avulsa explícita com idempotência. A execução guarda cópia do modelo publicado e das exigências, sem depender de futuras edições.
- Resposta por item: conferido, com problema ou não se aplica (se permitido), autoria e horário do servidor. Quantidade de itens/progresso deriva das respostas válidas. Pendência crítica nunca some por marcar os outros itens.
- Concorrência com versão esperada evita sobrescrever silenciosamente a conferência de outro funcionário. Sem internet não mostrar sucesso nem marcar como sincronizado.
- Decisões sobre problemas são registradas pela gestão, sem apagar a ocorrência original.
- Foto capturada com `getUserMedia` e canvas, sem seletor de arquivo/galeria. Câmera encerrada ao sair, refazer ou enviar. Sessão curta de captura no servidor limita reuso e vincula unidade/execução/item/autor, mas não garante autenticidade física da cena.
- JPEG comprimido antes de enviar, limite de tamanho no servidor. Arquivo privado no Storage; Firestore contém somente metadados/caminho/hash. Sem URLs públicas permanentes.
- Retenção 90 dias a partir do envio. Problemas abertos mantêm evidência sob retenção; após resolução, prazo de 90 dias a partir da resolução. Histórico textual permanece. Upload abandonado expira em 1 dia.
- Leitura autenticada de foto não entrega imagens expiradas. Limpeza física é separada, idempotente, com geração do objeto, protegendo evidências em uso.

## Configuração externa (não executar automaticamente)

Cloud Storage requer Blaze e bucket privado da mesma conta de projeto. Definir `CHECKLIST_STORAGE_BUCKET` no servidor. Sem bucket, listas sem foto continuam funcionais; tarefas que exigem foto permanecem bloqueadas com mensagem explícita.

Configurar execução diária da limpeza com credencial protegida; não expor segredos no cliente. O código não ativa cobrança, não cria bucket pago e não executa limpeza de produção. Soft delete, versões e backups podem manter bytes cobrados além dos 90 dias; revisar a política do bucket. Não aplicar lifecycle cego por idade, pois apagaria fotos de ocorrências abertas.

## Critérios de aceite

- Modelos personalizados e nenhuma lista fixa criada automaticamente.
- Gestão isolada por unidade; equipe executa somente funções atribuídas, sem poderes de gestão.
- Publicação/revisão/arquivamento e histórico preservados.
- Instância diária única e avulsas idempotentes.
- Foto obrigatória impede confirmação sem evidência pronta e vinculada ao próprio item/autor.
- Conflitos de concorrência exigem recarga, sem perda silenciosa.
- Câmera real no PWA, falha de permissão/rede visível e estado pendente honesto.
- Testes puros, Firebase isolado, armazenamento isolado e interface nas larguras 320/390/768/1280.

## Estado de continuidade

Proposta registrada antes da implementação. Esta seção e o PR devem ser atualizados com testes efetivamente executados e configurações externas pendentes. Não fazer merge automático deste novo módulo.

## Implementação entregue nesta branch

- `server/checklists/`: validação, modelos, rotinas, respostas, tratamento de ocorrências, captura, acesso privado e limpeza.
- `src/Checklists.jsx`, `ChecklistEditor.jsx`, `ChecklistCamera.jsx`: Hoje/Histórico/Gestão, editor de itens e câmera sem galeria. Navegação integrada no app.
- Nenhuma lista de abertura/fechamento foi pré-cadastrada. Toda tarefa vem do modelo da unidade.
- Modelos publicados ficam disponíveis à equipe; a rotina diária é materializada na primeira consulta do dia, sem exigir iniciar a conferência. O worker diário permite guardar também os dias sem nenhum acesso.
- Limites explícitos: até 40 itens por modelo, 100 execuções por unidade/dia e 120 sessões de captura por execução. Hoje possui limite explícito de 100 modelos ativos/execuções. Gestão e histórico têm paginação de 30 registros, sem baixar todo o acervo.
- `qa/checklists.html` usa exclusivamente Firebase de demonstração. Testes de câmera usam dispositivo simulado, sem imagens do restaurante.
- Não há fila offline: falha de rede não conclui item. Rascunhos de formulário não são persistidos no navegador nesta versão.
- Itens respondidos preservam o registro original; correção de uma resposta já concluída é uma evolução futura. Ocorrências têm tratamento separado e auditado.

## Habilitação de fotos e rotina diária

1. Conferir faturamento Blaze e escolher bucket privado do mesmo projeto. O código não cria bucket nem ativa faturamento.
2. Definir `CHECKLIST_STORAGE_BUCKET` no ambiente servidor da Vercel. Nunca colocar credencial de serviço no frontend.
3. Revisar e aplicar as regras de Storage. As evidências são servidas pelo backend autenticado; não usar URLs públicas/tokens permanentes.
4. Mesclar `firestore.indexes.json` com eventuais índices existentes no projeto antes de publicar: `cleanupAt` necessita índice de collection group. Não excluir índices que outros módulos usam.
5. Cadastrar segredo GitHub `CHECKLIST_CLEANUP_SERVICE_ACCOUNT_JSON` com credencial protegida do projeto e permissões mínimas de Firestore e leitura/exclusão dos objetos de evidência. Variáveis: `CHECKLIST_FIREBASE_PROJECT_ID` e `CHECKLIST_STORAGE_BUCKET`.
6. Somente após revisão operacional, definir a variável GitHub `CHECKLIST_PHOTO_CLEANUP_ENABLED=true`. O workflow opt-in roda diariamente às 03:05 UTC; gera as rotinas do dia em São Paulo e remove fotos expiradas. É possível executar os scripts manualmente sem `--apply` para apenas simular.
7. Monitorar falhas do workflow, uso de armazenamento, tráfego e custos. O horário do agendador é aproximado. A consulta do app mantém a geração idempotente caso o job atrase.
8. Revisar soft delete/versões/backups do bucket: a remoção lógica não significa eliminação imediata de todas as cópias cobradas. Os arquivos normais deixam de ser acessíveis no app após 90 dias, mesmo que a limpeza física aguarde a próxima execução.

Essa configuração externa permanece pendente. Sem ela, o fluxo com fotos não deve ser considerado homologado na produção. Ainda é necessário testar câmera/permissões no iPhone/PWA real, pois a validação automatizada usa Chromium e câmera simulada.

## Validação executada

- 219 testes de regras aprovados e build aprovado.
- Seis cenários integrados aprovados no Firebase isolado: catálogo 56, checklists com Storage, telas dos checklists, rotina dos cinco perfis, gestão por unidade e telas gerais V4.
- Teste próprio dos checklists verifica criação/publicação/edição/arquivo, snapshot, função atribuída, acesso cruzado, revisão concorrente, foto obrigatória, leitura privada, Storage público negado, retenção/limpeza, workers reais e paginação.
- UI exercitada em 320, 390, 768 e 1280 px, incluindo gerente/subgerente/cozinheiro/auxiliar. Câmera simulada: captura, compressão, envio e confirmação; falha de envio não mostra sucesso. Sem seletor de arquivo/galeria.
- A primeira execução da regressão V4 teve timeout no campo de mês da escala. Passou isoladamente e na repetição conjunta; nenhum teste foi removido ou enfraquecido.
- Testes usam dados e imagens fictícios. Sem configuração de Storage de produção, sem merge/deploy e sem habilitação da limpeza de produção.

## Fechamento adicional

- Corrigido o ambiente de CI dos dois jobs de navegador: Ubuntu 24.04 fixo, compatível com o Playwright utilizado. Os jobs anteriores falharam antes de executar os testes ao receber Ubuntu 26.04 em `ubuntu-latest`.
- Gestão possui diagnóstico de armazenamento no próprio módulo. Envio exige bucket com prevenção explícita de acesso público (`iamConfiguration.publicAccessPrevention=enforced`), além das regras privadas. O código não muda políticas nem ativa cobrança.
- A inspeção das variáveis da Vercel confirmou ausência de `CHECKLIST_STORAGE_BUCKET`. Não há credencial/variáveis de preview configuradas. Ativação de fotos na produção ainda depende dessa configuração externa; não afirmar homologação de produção.

Validação do fechamento: diagnóstico do bucket, bloqueio de configuração para a equipe e teste de rotina automática ainda não iniciada incluídos. Os testes próprios de Firebase/Storage e UI passaram novamente. A câmera não abre depois que a tela é abandonada enquanto a autorização do servidor ainda está pendente.

## Teste integrado de ponta a ponta

`tests/checklists-fullstack-emulator.test.mjs` foi aprovado: navegador do gerente cria/publica modelo usando a API real, outro contexto autenticado como auxiliar recebe a rotina, captura JPEG pela câmera simulada, envia ao Storage isolado e conclui via API. O teste confirma documento/autor/arquivo e a atualização ao vivo para o gerente, que abre a evidência em sua sessão. Não há resposta de negócio simulada nesse teste; somente a câmera e a origem HTTPS do proxy local são de homologação. A fixture e seu proxy são exclusivos de teste e não fazem parte do build publicado.

A proposta e o módulo continuam no PR #142. Código/testes não dependem da instalação da conexão Firebase no ChatGPT. Essa conexão seria apenas um caminho para configurar o projeto real; a alternativa é revisar a configuração no console com o titular da conta. Não atribuir a indisponibilidade da conexão ao plano do usuário sem verificar a causa.

## Autonomia da unidade — reforço do contrato

A lista pertence à unidade. Sua gestão define os itens e, individualmente, se cada um exige foto; o sistema não impõe foto a toda conferência. A tela oferece **Excluir item** e **Desfazer exclusão do item**, inclusive para o último item. É permitido salvar rascunho vazio, mas não publicar um modelo sem itens. Excluir/editar um item do modelo só vale para execuções futuras; as anteriores preservam a lista e as exigências que estavam publicadas. Testes cobrem exclusão, desfazer, rascunho vazio, impedimento de publicação vazia e confirmação real de item sem foto ao lado de item com foto obrigatória.
