# Convites por e-mail — implantação (Spark + Vercel)

A API está em `api/invitations/create.js` e `api/invitations/accept.js`. O Firebase continua no Spark; **não** usa Cloud Functions.

## Variáveis no Vercel (Project → Settings → Environment Variables)

- `FIREBASE_SERVICE_ACCOUNT_JSON`: JSON completo da conta de serviço gerada em Firebase Console → Configurações do projeto → Contas de serviço → Gerar nova chave privada. **Nunca commitar ou enviar a chave no chat.** Restrinja acesso ao projeto Vercel e faça rotação se vazar.
- `PUBLIC_APP_URL`: `https://triamicci-intelligence.vercel.app` (sem barra final). Para testar previews, use domínio de preview autorizado e configuração de ambiente apropriada.
- `RESEND_API_KEY`: chave de API do Resend.
- `INVITE_FROM_EMAIL`: remetente verificado no Resend (ex.: `convites@seudominio.com`).

Configure as variáveis no ambiente **Production** e faça um novo deploy. O envio falha de forma explícita se faltar configuração. Não use chaves `VITE_` para segredos.

## Firestore

Publique e teste as regras de `firestore.rules` no Firebase Console. O navegador pode ler convites da sua unidade apenas como gerente/admin, mas não pode criar convites ou memberships diretamente. A API usa Admin SDK e deve aplicar as regras no servidor.

## Fluxo

1. Admin/gerente autenticado informa e-mail e cargo no painel Colaboradores.
2. API valida Firebase ID token, membership e permissões.
3. Cria convite com token aleatório de 256 bits, apenas hash SHA-256 no Firestore, validade de sete dias.
4. Envia link por e-mail (token no fragmento `#invite=...`, não nos logs do servidor).
5. Destinatário entra com Google usando o **mesmo e-mail verificado** e clica em Aceitar convite.
6. API valida convite e cria membership em transação; o login é recarregado.

## Segurança e limites antes de produção real

- **Ainda precisa de testes de integração e revisão de segurança.** Não usar como sistema de colaboradores real antes dos testes.
- Falta endpoint de revogação/reenvio; não tratar como completo.
- Falta rate limiting persistente por UID/IP e limites de envio; adicionar antes de expor o endpoint publicamente.
- Revisar a estratégia de convites duplicados, reenvio após falha, retries e idempotência.
- A política atual é uma unidade por UID; uma conta que já tem membership não pode aceitar novo convite.
- Não há elevação de cargo por novo convite para membro existente.
- O administrador deve estar autorizado para a unidade solicitada, não globalmente.
- Verificar permissões no momento da aceitação se a política exigir invalidação de convites cujo autor perdeu o cargo.
- **Não** ativar regras de Firestore permissivas para contornar erros de leitura.

## Testes mínimos

- Admin convida gerente da mesma unidade: permitido.
- Gerente convida auxiliar/cozinheiro da mesma unidade: permitido.
- Gerente tenta convidar admin/gerente: rejeitado.
- Cook/auxiliar tenta criar convite: rejeitado.
- Outra unidade: rejeitada.
- E-mail Google diferente do convite: rejeitado.
- E-mail não verificado: rejeitado.
- Convite expirado ou já usado: rejeitado.
- Conta com membership existente: rejeitada.
- Token falsificado e chamadas sem login: rejeitados.

O projeto está na branch `feat/mvp-v1`. Publicação e credenciais exigem ações do proprietário.
