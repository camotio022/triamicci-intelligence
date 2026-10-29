# Preparação da entrega — 01/11/2026

Auditoria técnica de 29/10/2026. Base reconciliada: `875df93` (inclui históricos e Minha Ficha aprovados no outro chat, correção do intervalo, horários reais, botões e foco do teclado no iPhone).

## Correções desta entrega

- Endereço direto, navegação e mudança de perfil não abrem Administração, pessoas, escala ou contagem gerencial para auxiliar/cozinheiro. O backend continua validando autorização.
- Saldo inicial zero não é contado como contagem física. Contagem real zero continua válida.
- Resumos da cozinha priorizam o dia do restaurante em São Paulo; eventos anteriores permanecem no histórico.
- Histórico compartilhado mantém o visual aprovado e acrescenta intervalo De/Até, com atualização do dia sem recarregar dados.
- Pendências de recebimento são consultadas separadamente do histórico paginado: uma conferência antiga não some quando há mais de vinte entregas recentes.
- Proposta de cobertura passada não pode ser aceita/aprovada; registros anteriores são preservados.
- Conflito de transação de escala é respondido como 409, sem afirmar sucesso nem duplicar pedidos.
- Revogação de convite revalida o vínculo gerencial dentro da transação.

## Evidência automatizada local

- 167 testes puros aprovados, preservando as regras anteriores.
- Build Vite aprovado.
- Firebase Auth/Firestore isolados (`demo-triamicci-v31`): V3.1, V4, integração dos 56 e suíte dos cinco perfis aprovadas.
- Nenhum teste automatizado usa credenciais ou Firebase de produção. Nenhum e-mail é enviado nos testes de convites.

| Área | Evidência | Limite |
|---|---|---|
| Catálogo e estoque | 56 produtos ativados em unidade fictícia; ID preservado na conciliação; pedido, conferência, aprovação idempotente, lotes, Reserva/Giro, produção e contagem | Não aprova automaticamente as unidades e fichas reais |
| Presença | Cinco perfis fazem entrada, intervalo, retorno e saída; repetição não duplica evento | Não equivale a homologação de registro trabalhista |
| Mural | Cinco perfis consultam comunicado publicado e registram leitura pessoal; não gerenciais não publicam | Conteúdo de teste isolado |
| Folgas | Cinco perfis solicitam; duplicidade bloqueada; gestor diferente aprova; motivo pessoal restrito; notificação ao titular | Aprovar não republica escala |
| Cobertura | Pedido, proposta, aceite do destinatário e aprovação independente; estranho e criador não aprovam; proposta passada bloqueada | Sem alterar escala oficial automaticamente |
| Acessos e convites | Áreas gerenciais negadas a cozinheiro/auxiliar; link aceito pelo e-mail verificado correto, uso único, revogação; vínculo inativo bloqueado | Contas fictícias no emulador |
| Multiunidade | Cinco perfis de outra unidade não consultam conteúdo da unidade original nem aprovam sua folga; payload unitId não concede acesso; Rules e listener testados pela suíte V4 | Administrador permanece restrito à unidade do vínculo |
| Concorrência | Recebimento e produção transacionais; repetição/concorrência não duplicam saldo; falha não deixa gravação parcial | Cenários reproduzidos no emulador |

## Verificação de interface

A suíte com componentes reais foi ampliada para 320/390/768/1280 px, cinco perfis, revogação de área administrativa na mesma sessão, histórico de produção por período, recebimento com lote e rodada conjunta de contagem. Resultado remoto deve ser conferido no commit final do PR. APIs das telas usam fixtures; as gravações são testadas separadamente com Firebase emulado.

Acesso Google, PWA instalado no iPhone, impressão e uso durante um turno real não são comprovados pelo Chromium emulado. Aceite do gerente continua necessário antes da operação oficial.

## Pendências de implantação operacional

- Consulta visual atual ao Barigui confirmou 5 de 56 ativos e 15 candidatos à conciliação. Portanto, 51 posições ainda não estão ativadas; os cinco ativos também usam dados de teste e não representam aceite operacional. Reconsultar antes de qualquer migração.
- Validar origem, unidade de recebimento/contagem, validade, matérias-primas e rendimento real de cada preparação. Manifesto de 56 posições é rascunho sujeito à revisão, não aprovação do restaurante.
- Os dados fictícios criados nas auditorias continuam identificados. Não apagar histórico nem converter saldos em massa para “limpar” o sistema.
- O gerente deve executar o roteiro de aceite: abrir sua conta, consultar equipe/avisos, receber entrega de teste, revisar/aprovar, conferir Reserva/Giro, produzir com ficha revisada e consultar histórico/inventário.

## Liberação

Build, CI e deploy READY são evidência técnica, não aceite operacional. A entrega oficial depende do catálogo real revisado e do aceite do responsável. Não declarar todos os fluxos reais homologados apenas porque a suíte passou.
