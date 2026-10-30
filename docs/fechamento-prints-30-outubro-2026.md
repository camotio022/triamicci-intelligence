# Fechamento da revisão dos 56 prints — 30/10/2026

Base revisada: main e692b55. Escopo: tornar a rotina e as pendências compreensíveis, preservar histórico e testar as fronteiras operacionais existentes.

## Correções

- Mural: horário previsto em curso fica separado de jornadas declaradas. Entrada, intervalo, saída, ausência e presença validada têm rótulos próprios. Saída registrada não fica em andamento por ainda estar dentro do horário habitual. Erro de consulta de presença aparece como indisponível.
- Comunicados: validade opcional até o fim da data em São Paulo; vencidos ficam em anteriores. A gestão pode arquivar avisos com auditoria e histórico preservado. Sem data, não inferimos vencimento de um texto como “próxima semana”. Avisos antigos existentes precisam da revisão do gerente.
- Folgas: pendências de datas passadas têm filtro próprio e aviso. Aprovação retroativa bloqueada também no servidor; encerramento sem aprovação exige justificativa, preservando a solicitação e notificando o interessado.
- Catálogo: consulta das 56 posições explica ausência, inatividade, configuração, revisão ou duplicidade. Sem resposta do servidor, não apresenta zero ativos como informação confirmada. Nenhuma ativação em massa nem alteração de unidade/conversão/saldo.
- Mobile: campo de mês/data contido no formulário; data máxima real do mês; configurações de folgas recolhíveis para reduzir rolagem; filtro de setor na matriz de habilidades/jornadas e fichas ativas.
- Estoque: atalhos distinguem registro de movimentação de investigação; linguagem operacional substitui referências técnicas nos resumos.

## Evidência e limites

- 185 testes puros locais e build aprovados. Firebase E2E e telas reais são executados no CI do commit final; conferir os resultados antes de integrar.
- Suíte Firebase: 56 produtos, revisão de identidade, pedido, conferência sem alterar saldo, aprovação idempotente, Reserva/Giro, lotes, produção idempotente e contagem. Cinco perfis, recusa de acesso entre unidades, jornada/intervalo, folgas, convites e revogação.
- Novos cenários: arquivo de comunicado gerencial/idempotente/auditado, validade explícita, proteção entre unidades e encerramento de pedido passado sem aprovação retroativa.
- Telas reais: Mural, escala com campo de mês, produção, inventário, folgas, ficha, cozinha, recebimento, contagem, acessos e cadastro; larguras 320/390/768/1280. APIs das telas usam fixtures; gravações e permissões são verificadas separadamente no emulador.
- Diagnóstico de leituras usa documentos sintéticos. Não há percentual global medido de redução de cotas em produção.

## Preparação operacional que não se resolve inventando dados

Os prints mostram 23 produtos, 19 sem primeira contagem; 12 colaboradores, 9 sem vínculo. São evidências de 30/10, não totais fixos do sistema.

1. Responsável revisa as unidades, origem, validade e fichas técnicas dos produtos do piloto. Ativar só o que foi conferido.
2. Gerência registra a contagem inicial real em Reserva e Giro; nenhum saldo de teste deve virar estoque real por presunção.
3. Cada participante entra na própria conta e solicita vínculo. A gerência confirma identidade antes de conceder acesso. Nome parecido não basta.
4. Revisar/arquivar avisos antigos e encerrar pedidos passados com justificativa.
5. Gerente repete a rotina em seu iPhone/PWA e aceita o piloto. Testes automatizados não comprovam impressão, teclado Safari nem operação de um turno real.

Não foram apagados históricos nem feitas alterações automáticas de acesso, cadastro real ou saldo de produção para simular prontidão.
