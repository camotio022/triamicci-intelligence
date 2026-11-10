# Acesso individual e terminal compartilhado

## Como homologar

1. No computador do caixa, entre normalmente com uma conta gerencial ativa.
2. Abra **Terminais e minhas sessões**, informe o nome e clique em
   **Cadastrar este navegador como caixa**. A unidade vem do vínculo autenticado.
   O cadastro encerra a sessão pessoal naquele navegador.
3. Clique em **Gerar QR Code para entrar**. O código dura 60 segundos e não é
   renovado automaticamente quando ninguém está usando o terminal.
4. Escaneie com a câmera do celular. Entre com sua conta individual se necessário.
   Confira terminal, unidade, pessoa, perfil e código de quatro dígitos.
5. Confirme **Autorizar entrada**. O computador recebe uma sessão própria daquela
   pessoa: auxiliar usa permissões de auxiliar; gerente usa as de gerente.
6. Teste **Bloquear / trocar operador**. O próximo operador precisa de outro QR.
7. No celular, abra **Terminais e minhas sessões** e encerre sua sessão no caixa.
   A gerência também pode revogar o terminal inteiro.
8. Teste **Sair do modo caixa e desvincular navegador**, inclusive sem conexão.
   A saída local sempre volta ao acesso individual. Se estiver sem rede, a
   revogação no servidor precisa ser feita pelo celular quando houver conexão.

O navegador é reconhecido pelo cadastro, não por IP, Wi-Fi ou geolocalização.
Outro navegador ou limpeza de armazenamento exige novo cadastro. O modo caixa
não impede o uso de outro navegador: isso exige gestão/quiosque no computador.

## Contratos de segurança

- `terminals`: identificação da unidade e nome; somente o hash do segredo do
  navegador é persistido no servidor. O segredo permite iniciar uma solicitação
  e desvincular o terminal, mas não acessar dados operacionais.
- `terminalRequests`: solicitações temporárias. Há segredos independentes para o
  navegador e o QR. O celular pode aprovar, mas só o navegador que iniciou pode
  resgatar. Aprovação e resgate são transacionais, de uso único.
- `terminalSessions`: pessoa, unidade, perfil aprovado, terminal, expiração e hash
  de credencial própria. O token Firebase do celular nunca é enviado ao caixa.
- `server/_lib.authenticate`: aceita a credencial opaca `ts1`, verifica sessão,
  vínculo atual, perfil, unidade e terminal em cada requisição, além de suspensão/
  revogação da conta no Firebase Auth. As APIs continuam usando o UID individual
  e suas verificações de autorização/transação anteriores.
- Alteração de perfil/unidade, desativação do vínculo, troca de operador,
  revogação, três minutos de inatividade ou limite absoluto de 12 horas invalidam
  a sessão. Sessão encerrada não é reativada ao restaurar o perfil.
- Uma sessão delegada não cadastra/revoga dispositivos nem aprova outro terminal.
  Essas ações exigem uma sessão pessoal; cada pessoa pode encerrar suas próprias
  sessões pelo celular.
- Nenhuma regra Firebase é ampliada. O caixa não recebe autenticação Firebase
  nem acesso direto ao Firestore. Usa o backend autenticado existente.
- Registro, aprovação, abertura, encerramento e revogação são auditados. Cada
  chamada operacional autorizada no caixa também gera `terminal.request_authorized`
  com pessoa, terminal, sessão, action e caminho, sem payload ou segredos. Esse
  evento registra autorização da chamada; o resultado de negócio permanece nos
  registros transacionais de cada operação.
- Notificações push persistentes são desabilitadas para a sessão compartilhada,
  evitando avisos pessoais entregues ao caixa após a troca de operador.

## Tempo real, custo e desconexão

O endpoint existente `members/manage` delega `module: terminals`; não há nova
função HTTP. Um stream NDJSON do backend acompanha sessão, terminal, vínculo e
sinal live da unidade. Ele alimenta o mesmo hub de invalidação das telas. O
cadastro de novas coleções é feito apenas pelo Admin SDK, sem deploy de regras.

Não há polling do QR. O stream da solicitação termina na aprovação ou expiração.
Na sessão, o stream é renovado a cada quatro minutos por limite de execução; uma
renovação pode gerar novas leituras iniciais de quatro documentos e revalidar a
sessão. A renovação programada mantém a tela por até três segundos enquanto o
novo stream é confirmado, evitando remontar e reler todas as telas a cada rotação.
Falha inesperada de conexão oculta as telas até confirmação do servidor. Não há garantia
de custo zero durante uma sessão ativa. A atividade real no navegador pode renovar
o prazo de inatividade, no máximo uma vez por minuto; stream e atualizações de
dados não contam como atividade humana. O servidor também aplica a expiração.

As chamadas operacionais de terminal têm leituras adicionais para validar sessão,
terminal e vínculo e uma gravação de auditoria por chamada autorizada. Isso é
deliberado para revogação e rastreabilidade; não resolve o custo inicial elevado
da composição do catálogo, que é um trabalho separado.

Fechar ou perder o stream bloqueia a visualização enquanto reconecta. Operações
já autorizadas/em andamento não são desfeitas. Comandos mantêm suas proteções de
integridade e idempotência existentes.

## Testes isolados

`terminal-policy.test.mjs` cobre hashes, credenciais inválidas, identidade, papel,
unidade, revogação e expiração. `terminal-access-emulator.test.mjs` usa somente
`demo-triamicci-v31`: percorre dois navegadores, handlers reais, APIs, listener,
revogação remota, inatividade virtual, uso único e escape sem backend. Ele integra
`npm run test:emulator`; os testes puros integram `npm run test:rules`.
