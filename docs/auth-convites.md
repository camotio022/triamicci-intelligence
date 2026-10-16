# Autenticação e convites — MVP 1.0

## Implementação
- Login Google via Firebase Authentication; o acesso depende de `memberships/{uid}` ativo.
- Convites por **link/WhatsApp** (sem domínio de e-mail) e por **e-mail/Resend** (opcional).
- A criação, aceitação e revogação ocorrem apenas via API autenticada da Vercel, com Firebase Admin SDK.
- Administradores podem convidar funções da própria unidade; gerentes somente cozinheiro e auxiliar. Bloqueio de autoconvite e de contas já vinculadas.
- O convite guarda apenas o **SHA-256 do token**, expira em sete dias e é consumido uma única vez por transação Firestore.
- A aceitação exige Google/Firebase ID token com **e-mail verificado idêntico** ao endereço cadastrado, ausência de vínculo prévio e autorização ainda válida do emissor.
- A criação é limitada a cinco tentativas por hora por emissor (FireStore); eventos são registrados em `auditLogs`.
- O link é devolvido **apenas na resposta da criação**, não pode ser recuperado pela listagem e deve ser compartilhado manualmente com o destinatário correto.
- Revogação pela API `/api/invitations/revoke`, apenas administrador da unidade ou emissor; invalida token e registra auditoria.
- Os documentos são guardados em `units/{unitId}/invitations/{id}` e os vínculos em `memberships/{uid}`.
- A interface de recebimento e as métricas do dashboard ainda usam dados demonstrativos.

## Fluxo pelo WhatsApp
1. Administrador ou gerente abre Colaboradores e seleciona **Link / WhatsApp**.
2. Informa o e-mail **exato da conta Google que o funcionário usará**, função e unidade.
3. Clica em **Gerar link de convite**; a API valida permissões, cria convite `pending` e devolve link temporário.
4. Escolhe **Compartilhar pelo WhatsApp** e confirma o destinatário no WhatsApp, ou copia a mensagem.
5. Colaborador abre link, entra com a conta Google indicada e clica em **Aceitar convite**.
6. API valida token, expiração, e-mail, função, emissor e vínculo; grava membership e marca `accepted`.
7. Para cancelar, usa **Revogar convite**. Não partilhar links em grupos ou screenshots.

## Variáveis de ambiente na Vercel
Obrigatórias: `FIREBASE_SERVICE_ACCOUNT_JSON` (segredo) e `PUBLIC_APP_URL` (URL HTTPS da implantação).
Opcionais **somente para envio de e-mail**: `RESEND_API_KEY` e `INVITE_FROM_EMAIL`.
As variáveis devem estar no ambiente do deployment utilizado (Production ou Preview). Reimplantar após alterações.
Nunca colocar a conta de serviço no frontend, GitHub ou logs.

## Firestore e segurança
Publicar e testar as regras de `firestore.rules`: leitura de convites somente por admin/gerente da unidade; nenhuma escrita direta de convite ou membership no browser.
Verificar as regras publicadas, que podem diferir do arquivo do repositório. A API Admin SDK ignora as regras e deve aplicar todas as autorizações.
O domínio usado em `PUBLIC_APP_URL` deve coincidir com o Origin do browser, e o domínio deve estar autorizado no Firebase Auth.
Para produção, testar cenários de convite duplicado, e-mail divergente, conta já vinculada, convite expirado, revogado, papel proibido e cliques simultâneos.

## Primeiro administrador
O primeiro vínculo deve ser criado por operação privilegiada após comprovação de autorização; nunca permitir autoatribuição de administrador pelo browser.

## Gestão de colaboradores
- API `POST /api/members/manage` aceita `action:"list"` ou `action:"update"`, exige token Firebase válido, `Origin` autorizado e vínculo ativo de admin/gerente.
- Lista até 200 vínculos da **unidade do solicitante** (nunca aceita unitId arbitrário do cliente). Nomes vêm do Firebase Auth quando disponíveis.
- Atualizações exigem `uid`, `role`, `status`; validam a unidade e o papel atual **dentro de transação**.
- Gerentes só alteram contas atualmente de cozinheiro/auxiliar, mantendo cargos de cozinheiro/auxiliar.
- Ninguém altera a própria conta. Não é permitido desativar/rebaixar o último admin ativo da unidade.
- Todas as mudanças gravam `auditLogs` com autor, alvo, papel/situação anterior e posterior.
- Desativação é lógica (`status:inactive`); Auth não é excluído. O backend e as regras Firestore exigem vínculo ativo. Sessões com dados já carregados devem ser atualizadas para refletir mudanças.
- Testar com contas separadas, sem alterar o administrador principal. Não publicar sem validar regras Firestore e endpoints.

## Bloqueio em tempo real (AuthGate)
- `onSnapshot` acompanha `memberships/{uid}` com `includeMetadataChanges:true`.
- Somente uma confirmação do servidor (`metadata.fromCache === false`) autoriza renderizar o Workspace.
- Alterar `status` para `inactive` remove o Workspace imediatamente após a entrega do evento, mostra `Acesso desativado` e mantém a conta Google (sem apagar histórico).
- Reativar `status:active` e manter `unitId` válido permite voltar ao Workspace automaticamente, sem novo convite.
- Sem conexão/erro de listener, a interface operacional fica bloqueada por precaução. A sessão Google continua autenticada.
- A checagem de UID impede renderização do vínculo anterior ao trocar de conta.
- Validar manualmente com duas contas: funcionário com dashboard aberto; admin desativa; conferir bloqueio e recusa das novas chamadas API; admin reativa; conferir retorno. Repetir sem conexão.
- Atenção: isto é bloqueio de interface e novas operações protegidas, não revogação global do token Google. Dados já baixados para memória/cache ou abas fora do aplicativo não são apagados retroativamente. Exige regras Firestore publicadas e backend com validação de vínculo ativo.
