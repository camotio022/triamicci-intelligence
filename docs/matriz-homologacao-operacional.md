# Matriz de decisão e homologação — Triamicci Intelligence
Data: 2026-10-19. Aplicável aos módulos já publicados e às evoluções em desenvolvimento.
Status deste documento: **proposta de governança e roteiro de homologação**, não aprovação operacional. Nenhum dado Firebase foi inspecionado ou alterado.

## Política de decisão
Uma feature passa por três estados distintos: IMPLEMENTADA (existe em código), PUBLICADA (deploy acessível) e HOMOLOGADA (fluxo aprovado por responsáveis da loja com evidências). Testes automatizados e build não substituem a homologação real.

Pesos propostos para priorizar melhorias: fidelidade operacional 30%, simplicidade 25%, integridade dos dados 25%, rastreabilidade 10%, integração 10%. **Segurança de dados, integridade física e acesso são travas obrigatórias e não podem ser compensadas por uma nota alta.** A pontuação somente será aplicada a partir de evidências; não inventar notas sem testes.

Decisão possível: MANTER; AJUSTAR; REDESENHAR; BLOQUEAR ATÉ CORRIGIR. Separar classificação do software da decisão de disponibilizar a funcionalidade operacionalmente.

## Matriz inicial
| Módulo publicado | Evidência observada | Decisão proposta | Homologação |
| --- | --- | --- | --- |
| Recebimento | `src/PhysicalStock.jsx`, `api/operations/stock.js`, `server/operations/logic.js`: unidade física/comercial com exceção pontual kg → un | REDESENHAR PARCIALMENTE: embalagem e conteúdo validados | PENDENTE |
| Estoque e cadastro | `api/products/manage.js`: kg,g,L,ml,un; override administrativo auditado | AJUSTAR: perfil de apresentação sem converter legado | PENDENTE |
| Contagem física | `src/PhysicalStock.jsx`: reserva/giro na unidade operacional | REDESENHAR PARCIALMENTE: fechados/abertos e peso desconhecido | PENDENTE |
| Inventário diário | `server/operations/daily-inventory.js`: exige unidades iguais | AJUSTAR: normalizar apenas conversões comprovadas | PENDENTE |
| Transferência | `server/operations/transfer.js`: valida saldo/unidade/lotes | MANTER PROTEÇÕES, AMPLIAR apresentação original | PENDENTE |
| Perdas/ajustes | `server/operations/dispatch.js`: registra motivo e impede negativo | AJUSTAR: apresentação e quantidade original | PENDENTE |
| Produção/fichas | `src/Production.jsx`, `api/production/manage.js`: rendimento em porções, baixa ao concluir | REDESENHAR: rendimento por ficha, planejamento separado e consumo confirmado | PENDENTE |
| Gestão de Pessoas/cobertura | Fluxos publicados; avaliação da linguagem e do uso real ainda necessária | VALIDAR COM USUÁRIOS antes de decidir | PENDENTE |
| Triamicci Mentor | Trilhas iniciais publicadas com ajuda contextual e progresso local | AJUSTAR em função dos fluxos homologados | PENDENTE |

## Casos de homologação de unidade obrigatórios
Todos devem usar dados sintéticos ou ambiente isolado. Registrar evidência de tela, entrada, expectativa, resultado observado e responsável. Não operar em produção para testar.

1. **Peito inteiro, recebimento**: registrar 3 pacotes de peso variável, sem peso informado; resultado esperado: 3 embalagens, kg indeterminado, nenhum valor arbitrário.
2. **Peito inteiro, contagem**: 2 fechados + 1 aberto sem pesagem; resultado esperado: embalagem aberta rastreável e sem quantidade restante presumida.
3. **Peito inteiro, produção**: planejamento de strogonoff com necessidade em kg e apenas pacotes não pesados; permitir planejar, impedir baixa em kg inferida e explicar conferência necessária.
4. **Filé recebido pronto**: lançar entrada de filés; não gerar baixa de peito inteiro nem transformação automática.
5. **Óleo**: receber caixa com quantidade de garrafas não confirmada; não converter automaticamente para L. Quando quantidade de garrafas/volume por garrafa forem homologados, comparar resultado exato com registro de recebimento.
6. **Arroz e feijão**: contar pacotes e receber caixas; exigir conteúdo da caixa e peso do pacote para consolidar kg.
7. **Ovos**: receber bandeja e contar dúzias; não equiparar bandeja e dúzia sem conteúdo informado.
8. **Alcatra e tilápia**: comprar em kg e contar bifes/peças; recusar kg → un sem pesagem ou porcionamento rastreado.
9. **Noisettes**: conferir pacote → porção com fator homologado; bloquear quando desconhecido.
10. **Receita com kg/L/un**: criar ficha versionada com rendimento próprio, calcular ingredientes, impedir arredondamento silencioso de quantidades indivisíveis.
11. **Transação duplicada**: repetir mesma confirmação; não debitar duas vezes.
12. **Troca de unidade legada**: manter histórico e saldos anteriores intactos, exigir reconciliação/recontagem antes de operar nova unidade.
13. **Multiunidade/permissões**: garantir que perfis sem acesso não alterem catálogo, taxa ou estoque de outra unidade.
14. **Retorno dos usuários**: funcionário consegue encontrar, registrar e corrigir ações sem telas ou perguntas irrelevantes.

## Ficha de teste — modelo
- Módulo / cenário / data / responsável
- Perfil e unidade de teste
- Estado inicial (dados fictícios)
- Passos executados
- Resultado esperado e observado
- Evidência: captura de tela, operação e histórico correspondentes
- Nota 0–5 para fidelidade, simplicidade, integridade, rastreabilidade e integração
- Há travas de segurança/integridade? SIM/NÃO
- Decisão: manter/ajustar/redesenhar/bloquear
- Ação corretiva, responsável e revalidação
- Homologação explícita do responsável: SIM/NÃO

## Ordem de execução recomendada
A. Finalizar núcleo puro e testes das conversões.
B. Disponibilizar cadastro/validação de apresentações com efeitos isolados.
C. Adaptar Recebimento e Contagem — primeiro gargalo.
D. Ajustar Transferências, Inventário, Produção e dashboards sem violar unidade canônica.
E. Homologar os 14 cenários com a loja antes de ativação real.
F. Realizar um merge/deploy consolidado, sujeito à aprovação e validação de CI.

## Regras de bloqueio
- Nunca gravar conversão arbitrária entre kg ↔ peça, caixa ↔ pacote ou recipiente ↔ peso.
- Nunca misturar total de embalagens com saldo físico medido.
- Nunca alterar balanços, lotes ou históricos legados de forma silenciosa.
- Nunca usar deploy READY como sinônimo de homologação.
- Caso uma funcionalidade publicada apresente risco concreto de integridade, propor contenção específica antes da próxima operação, sem afirmar bloqueio em produção sem implementar.
