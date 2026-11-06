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
