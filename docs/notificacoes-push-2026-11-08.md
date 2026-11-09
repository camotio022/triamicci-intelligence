# Notificações push do Triamicci

## Operação

Abra o sino → **Ativar notificações** → autorize no aparelho. Depois use **Testar aviso**. **Desativar aqui** desliga apenas este dispositivo. No iPhone/iPad, abra o aplicativo instalado na Tela de Início. A permissão é solicitada somente após o toque no botão. Sessões independentes não assumem as notificações da sessão principal.

Eventos conectados:

| Evento | Destinatário | Destino |
| --- | --- | --- |
| Solicitação de folga | Gestão da unidade | Solicitações de folga |
| Decisão sobre folga | Solicitante | Solicitações de folga |
| Convite de cobertura/dobra | Conta vinculada ao colaborador | Minha ficha |
| Resposta ao convite | Gestão da unidade | Pessoas |
| Solicitação de troca/cobertura | Gestão da unidade | Pessoas |
| Decisão sobre troca/cobertura | Solicitante | Minha ficha |
| Decisão sobre proposta de cobertura | Conta vinculada ao colaborador | Minha ficha |
| Conferência de recebimento enviada | Gestão da unidade | Estoque e insumos |

A notificação leva à área correspondente; não abre automaticamente um registro individual. Motivos pessoais, valores e itens da entrega não aparecem na tela bloqueada.

## Implementação e segurança

- `server/push/handler.js` reutiliza `/api/members/manage` (`pushConfiguration`, `pushSubscribe`, `pushUnsubscribe`, `pushTest`), mantendo as 12 funções do plano atual.
- `public/push-sw.js` recebe notificações sem manter a página aberta. Não armazena páginas, dados de usuários ou APIs em cache. Cliques aceitam apenas o próprio domínio.
- Dispositivos em `pushDevices` são acessíveis apenas pelo backend; as regras existentes negam acesso direto.
- Cada envio revalida vínculo ativo, unidade e papel de gestão quando aplicável. No logout, a inscrição local é cancelada mesmo se a remoção no servidor falhar.
- Apenas endpoints HTTPS de serviços de push conhecidos são aceitos; credenciais embutidas, hosts arbitrários e portas alternativas são recusados.
- Limite de 10 dispositivos por conta e um teste por minuto. O teste destina-se exclusivamente ao dispositivo solicitado.
- A fila `units/{unitId}/pushOutbox` é gravada na mesma transação da operação, antes do commit. Rejeição da operação não gera aviso.
- Há lease de processamento e controle dos dispositivos entregues. Entradas do sino usam o ID do evento, evitando duplicação nas tentativas. Em caso de interrupção após o serviço aceitar o envio e antes de salvar o resultado, a entrega pode ser repetida; a mesma tag é usada para reduzir duplicação visual.
- Falha no push não transforma operação já salva em erro. Serviços que retornam 404/410 têm a inscrição removida.

## Configuração

`WEB_PUSH_PUBLIC_KEY` e `WEB_PUSH_PRIVATE_KEY` configuradas no projeto Vercel de produção. A chave privada é secreta e nunca é enviada ao cliente. Usa `PUBLIC_APP_URL` já existente como identificação VAPID e para validar a origem. As chaves não foram gravadas no repositório. Sem configuração, a interface informa que o envio está em preparação.

## Limites e homologação

- Falhas transitórias ficam pendentes para a próxima operação de notificação da unidade; não existe agendador periódico nesta entrega. Limites: 3 eventos por passagem, orçamento de 8 segundos, 5 tentativas e validade de 24 horas. Push não substitui a conferência da operação no aplicativo.
- O sistema operacional, rede, modo Foco e permissões controlam a apresentação; confirmação do serviço não prova que a pessoa leu.
- Validado localmente: build, regras de negócio, contratos de UI e testes de política/entrega/worker, incluindo rollback, falha transitória, unidade, papel de gestão e navegação segura.
- O teste visual automatizado não pôde ser executado: o navegador Chromium não estava instalado e o download retornou arquivo inválido. Não foi simulado um resultado visual aprovado.
- Pendente de homologação física: ativar e testar em iPhone instalado e Android/desktop; conferir chegada com tela bloqueada, toque no aviso, desativação e logout. Nenhum aviso real foi disparado à equipe durante a implementação.
