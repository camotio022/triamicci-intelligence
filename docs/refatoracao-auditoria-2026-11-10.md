# Implementação da auditoria — 10/11/2026

## Rastreabilidade

| Achado | Implementação |
| --- | --- |
| A01 — Arquivamento | Verifica físico atual/fallback, estoque armazenado e quantidade antiga; rejeita dados inconsistentes; cenários testados no emulador |
| A02 — Modelos de saldo | Contratos explícitos por escopo; nenhuma soma/migração automática; catálogo operacional não aceita novas escritas no fluxo antigo |
| A03 — Quantidades | Validação central no legado e V3; unidades inteiras não aceitam frações; precisão e lotes preservados |
| A04 — Leituras | Contenção do #193 + cache por revisão, catálogo compartilhado e workspace consolidado do #194; orçamento reproduzível preservado |
| A05 — Transporte/estado | 33 funções de transporte substituídas por cliente comum; erros normalizados; estados de dados compartilhados |
| A06 — Responsabilidades | Consultas físicas, workspace e notificações extraídos dos dispatchers; fronteiras de autenticação preservadas |
| A07 — Permissões | Grupo gerencial centralizado nos módulos que repetiam a mesma lista; exceções por capacidade/titularidade mantidas |
| A08 — Calendário | Fonte única em shared e aliases compatíveis; conversões de dia redundantes centralizadas; UTC/BRT testado |
| A09 — Interface | Cabeçalho/tokens e estado de consulta comuns; módulos secundários carregados sob demanda; sem remoção indiscriminada de overrides responsivos |
| A10 — Reprodutibilidade | Node 24, versões exatas, lockfile, npm ci e ferramentas de teste fixadas |
| A11 — Testes | Contratos de arquitetura, teste emulado de saldo/legado/unidade/inbox e teste de navegação que verifica dados/invalidação, não somente quantidade fixa de requests |
| A12 — Protótipos/docs | Dashboard e recebimento demonstrativos em qa/demos; dados fictícios retirados do App; README e arquitetura atuais documentados |

## Validação

Os comandos oficiais estão no README. A homologação final exige regras e build,
contratos e orçamento de leituras, navegador e suíte Firebase demo completos, além
dos checks do PR. As fixtures usam unidades/usuários sintéticos e projeto
`demo-triamicci-v31`; não consomem a quota do projeto publicado.

Validação local concluída nesta implementação: 310 testes de regras/contratos,
22 testes dos fluxos emulados e 3 testes de navegador passaram; o build de produção
também passou. A reprodução sintética de navegação conservou o resultado de
2.917 leituras estimadas contra 50.135 no cenário anterior, com os mesmos dados
e sem alterações concorrentes. Esse número não representa uma medição de cobrança
em produção nem demonstra sozinho a causa definitiva do incidente histórico.

A suíte de papéis é uma barreira obrigatória: extração de um handler não pode mover
uma autorização para fora de seu dispatcher. Há asserções explícitas de que equipe
não consulta listagem/perfis administrativos, mesmo após separar notificações pessoais.

O resultado de leitura reduzida de navegação não é previsão de consumo durante um
expediente com muitas gravações. Medir ações reais após a liberação da quota continua
necessário para dimensionar o uso com todos os funcionários.

## Operação após integração

1. Confirmar que o deployment da main corresponde ao commit integrado.
2. Reabrir/atualizar o aplicativo para carregar o novo bundle.
3. Quando a quota estiver disponível, conferir telas por papel e a resposta entre
   duas sessões: recebimento, contagem, transferência e produção.
4. Distinguir observação pendente, saldo físico e saldo por armazenamento.
5. Monitorar leituras por action antes de concluir uma redução global de custo.

Não foram removidos eventos, fotos, registros profissionais, lotes ou saldos. Reverter
código não reverte operações que forem realizadas depois; nenhuma migração real faz
parte desta integração.
