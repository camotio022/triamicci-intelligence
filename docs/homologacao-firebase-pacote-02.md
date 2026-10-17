# Homologação isolada — Pacote 02

## Escopo e proteções

Projeto Firebase **diferente de** `triamicci-intelligence`; nunca reutilizar credenciais de produção. Ambiente separado para Auth, Firestore e usuários. Não copiar dados pessoais ou produção; usar registros fictícios.

A branch `feat/pacote-02-operacao-real` aceita:
- Frontend: `VITE_APP_ENV=staging`, `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID`.
- Backend: `APP_ENV=staging`, `FIREBASE_EXPECTED_PROJECT_ID=<id do novo projeto>`, `FIREBASE_SERVICE_ACCOUNT_JSON=<credencial somente de homologação>`, `PUBLIC_APP_URL=https://<domínio de homologação>`. Nunca versionar JSON de conta de serviço.

O frontend aborta se o modo staging não tiver configuração válida ou apontar para o projeto de produção. O backend aborta quando APP_ENV=staging sem ID isolado ou a conta de serviço pertence a projeto diferente do esperado. **Não** utilizar as credenciais de produção no ambiente de homologação.

## Preparação manual no Firebase Console

1. Criar um novo projeto Firebase em https://console.firebase.google.com/ com ID distinto de `triamicci-intelligence`. Escolher plano e região explicitamente.
2. Habilitar Authentication com o provedor email/senha e criar somente usuários de teste.
3. Criar um banco Cloud Firestore vazio. Aplicar regras equivalentes às da aplicação principal (não permitir acesso público).
4. Registrar aplicativo Web e copiar apenas o objeto público de configuração para as variáveis `VITE_FIREBASE_*`. Não publicar segredos em issues, PRs ou chat.
5. Para servidor homologado, usar conta de serviço **do projeto staging**, com privilégios mínimos necessários; configurar em cofre/segredos do ambiente, nunca no Git.
6. Criar `memberships/{uid}` de usuários de teste com `status: active`, `role: admin|manager|auxiliar`, `unitId: unidade-teste` usando canal administrativo autenticado do projeto staging.
7. Configurar domínio HTTPS de homologação e `PUBLIC_APP_URL` exatamente com a mesma origem usada pelo navegador. **Não** enviar deployments para o projeto Vercel de produção para testar.

## Casos de teste de aceitação

- Bloqueio quando frontend/backend recebem projeto de produção em staging.
- Login de admin/manager/auxiliar de teste; isolamento por unidade e bloqueio de entrada para auxiliar.
- Prévia da migração sem escrita; aplicação aditiva autorizada; auditoria; nenhum saldo legado alterado.
- Revisar candidatos e aprovar em lote. Produtos genéricos e incompletos devem continuar pendentes.
- Vincular um produto elegível e validar saldo inicial zero.
- Pedido 12 kg de bifes: conferir 11,6 kg entregues e 20 unidades físicas (números fictícios). Exibir diferença -0,4 kg; não converter peso em peças.
- Contagem 18 reserva + 7 giro; recarregar página; conferir persistência no Firestore.
- Segunda entrega seguida de nova contagem: demonstrar cálculo por todas as entradas compatíveis no período, diferença classificada como física estimada, não vendas.
- Reenviar mesmo `requestId` e verificar que não duplica; payload diferente retorna conflito.
- Registrar lote/validade, rejeitar vencido, quantidades negativas e frações de unidade.
- Verificar trilha de auditoria, falhas de rede e comportamento no celular.

## Critérios de bloqueio do merge

Não publicar na main até: testes CI verdes, integração Firestore homologação executada, isolamento de projeto confirmado, revisão de lotes/saldos e resolução de inconsistências. Saldo antigo e contagem física são fontes distintas; a conciliação completa ainda não foi homologada. O sistema de lotes ainda **não controla saldo e baixa por lote**.

## Estado

Configuração para staging preparada em código. Projeto Firebase de homologação e credenciais ainda dependem de criação/conexão pelo proprietário. Nenhum teste end-to-end contra Firestore staging foi executado.
