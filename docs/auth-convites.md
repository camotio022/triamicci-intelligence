# Autenticação e convites — MVP 1.0

## Estado da implementação
- Firebase Authentication via Google, com login e logout.
- Bloqueio da interface para contas sem vínculo ativo em `memberships/{uid}`.
- Firestore Rules em modo **deny by default**. Nenhum cliente pode criar seu próprio vínculo, convite ou recebimento.
- O fluxo de envio/aceitação de convites **ainda não está implementado**. Não prometer convites por e-mail até existir backend confiável.
- O dashboard e recebimento continuam com dados fictícios; não são registros persistidos.

## Modelo de vínculo
`memberships/{uid}`: `{ unitId: "barigui", role: "auxiliar" | "cook" | "manager" | "admin", status: "active" | "disabled", email, createdAt }`.
Um vínculo por pessoa no MVP. Modelar a migração futura para vários vínculos por unidade antes de ativá-la.

## Fluxo futuro de convite
1. Administrador ou gerente autenticado solicita convite para e-mail e papel em sua unidade.
2. Backend valida permissões atuais a partir do Firestore, não do payload do browser. Gerente só convida `auxiliar` e `cook` na própria unidade. Administrador pode convidar outros perfis somente nas unidades autorizadas.
3. Backend gera token aleatório criptograficamente seguro, guarda apenas hash e expiração (7 dias), registra autor e unidade, envia link por provedor de e-mail.
4. Convidado autentica-se e apresenta token. Backend valida expiração, uso único, e-mail verificado correspondente, revogação e unidade; cria vínculo de modo atômico e marca convite aceito.
5. Ações de reenvio e revogação devem ser auditadas. Acesso a documentos operacionais deve ser autorizado por unidade e função.

## Bootstrap do primeiro administrador
Criar o primeiro vínculo administrativo somente por procedimento privilegiado, fora do browser, após verificar identidade e autorização. **Nunca** criar regras de autoelevação ou permitir cadastro aberto com papel `admin`.

## Passos manuais antes do teste
1. Ativar Authentication > Google no Firebase Console e configurar domínios autorizados.
2. Criar Cloud Firestore e publicar `firestore.rules` após revisão.
3. Provisionar vínculo do primeiro administrador de forma segura, via console/Admin SDK.
4. Validar login, bloqueio sem convite e regras com Emulator Suite. A autenticação sozinha não garante acesso.
