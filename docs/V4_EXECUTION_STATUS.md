# V4 — entrega consolidada

Referência inicial: main `ad8da9855fae4cf06cc306cb4fa891f2624c183d` (PR #81). Continuidade: PR #82. Requisitos: Issue #76 e plano mestre da PR #77. A execução foi autorizada pelo responsável nesta conversa, incluindo a conclusão das pendências; todos os dados existentes foram identificados como experimentais.

## Estado por módulo

| Módulo | Entrega |
|---|---|
| Tempo real | Listeners `onSnapshot`, invalidação transacional por unidade, recarga silenciosa, estados de conexão e limpeza ao trocar contexto. Sem consulta periódica de dados. Relógios locais apenas atualizam a apresentação e detectam mudança do dia. |
| Estoque / Cozinha | Indicadores e filtros acionáveis, consultas compactas, separação entre contagem e saldo corrente, mesma fonte canônica de saldo e lotes para novas operações. |
| Recebimento | Conferência guiada em três passos, vários produtos/locais/lotes, pedido ou entrega não prevista justificada, revisão e aprovação gerencial atômica de todo o lote. Receber parcialmente atualiza o saldo restante do pedido; repetição e aprovações concorrentes não duplicam entradas. Pendências individuais anteriores continuam acessíveis. |
| Produção | Lista do dia compartilhada com Mural, metas opcionais com unidade, progresso parcial/concluído, fichas revisáveis com controle de versão, método de preparo, rendimento decimal quando a unidade permite, origem por ingrediente, crédito à reserva e lote/validade reais do produto final quando exigidos. Baixas e crédito são transacionais e idempotentes; ciclos de receitas e frações de peças são bloqueados. |
| Inventário | Triagem automática dos produtos contados hoje, filtros por estado, paginação e consulta individual. Novas contagens fecham o intervalo com acumulados transacionais; registros anteriores usam leitura paginada, sem truncamento em 500 eventos. Unidades incompatíveis impedem cálculo. |
| Investigação | Alocação parcial por motivo, quantidade e evidência declarada; revisão independente pela gestão, bloqueio de versão atrasada, versões preservadas e histórico. Não altera saldo, não cria venda nem transforma uma alegação em movimento comprovado. |
| Escalas / Folgas | Geração de rascunho mensal, rodízio proposto de domingos, respeito a folgas aprovadas, visão de domingos e grade completa opcional. Mínimos configurados por setor, dia, faixa e competência; cálculo por intervalos considera jornadas específicas, pausas e turnos que atravessam meia-noite. Déficits impedem a transição. Publicação com aprovação independente, dentro da janela de vinte dias, sem pedidos pendentes e com revalidação transacional. Rascunho exige a revisão aberta pelo editor. |
| Mural / Comunicados | Comunicados → Escala → Produção, mantendo estilos existentes. Prioridade, autoria/data, histórico paginado e leitura pessoal explícita por versão; exibição não marca leitura automaticamente. Escala oficial e presença real permanecem diferenciadas. |
| Pessoas / Minha ficha | Jornada pessoal integrada à escala oficial, pedidos e convites legíveis, edição de pessoas em modal com foco/Esc, separação entre fichas profissionais e contas; importação e vínculos em área secundária. |
| Navegação | Histórico do navegador, retorno de rota, restauração de busca/aba/filtros por conta e unidade e posição de rolagem. Mudanças de conta, papel ou unidade remontam o conteúdo operacional. |
| Segurança multiunidade | Backend deriva unidade do vínculo autenticado; operações revalidam autorização e não aceitam tenant arbitrário. Rules não liberam novas coleções ao cliente. Diagnóstico e limites estão em `V4_TENANCY_AUDIT.md`. |

## Saldo único e compatibilidade experimental

`physicalBalances` e `physicalLots` são as fontes canônicas para novas operações. O adaptador traduz reserva/giro para reserve/rotation sem somar registros. Se falta documento canônico, o caminho operacional pode ler o antigo `v3PhysicalBalances`; a operação seguinte escreve o canônico. Existindo ambos, o canônico prevalece. O histórico recebe eventos em `physicalReceipts`, `physicalOutflows`, `physicalTransfers`, `productionRuns` e `physicalCounts`.

Contagens por local só formam uma contagem conjunta se reserva e giro pertencem à mesma rodada. Lotes precisam de identificação e quantidades reais; incompatibilidade exige conferência. Nenhuma limpeza, exclusão, migração em massa ou backfill de dados experimentais foi executado. Continuam doze funções em `api/`.

## Verificação técnica

- 144 testes puros/contratos: unidades, catálogo, produção, lotes, inventário, investigação, escalas, permissões e demais regressões.
- Build Vite.
- Firebase Auth/Firestore em projeto demo isolado: concorrência/idempotência de produção e recebimento, falha atômica, entrada parcial por pedido, lote final e rendimento decimal, prioridade do saldo canônico, contagem conjunta, inventário resumido e compatibilidade com 601 entradas antigas, revisão da investigação, leitura pessoal de comunicados e paginação, regras do listener e isolamento de unidade, pedidos duplicados e ciclo completo de escala com pausa impedindo publicação.
- Playwright com telas reais: Mural, Produção, Inventário, Folgas, Minha ficha, Cozinha, Recebimento, Cadastro e navegação em 320/390/768/1280 px; conferência guiada, foco/Esc e retorno com busca preservada. Regressão V3.1 também cobre 320/375/430/768/1280 px. APIs das telas usam fixtures; contratos de escrita são testados separadamente no emulador.

## Decisões e limites explícitos

A homologação de uso pelo responsável é posterior à entrega técnica; testes com fixtures/emulador não são uma alegação de homologação contra o Firebase publicado. A publicação deve ser verificada no commit integrado.

Os horários, pausas e mínimos são configurados pela gestão, sem inferir jornadas ou certificar conformidade trabalhista. Um rodízio proposto precisa de revisão e não publica sozinho. Confirmação obrigatória de leitura, push e expansão corporativa/múltiplos vínculos permanecem decisões de produto separadas na Issue #76; não são simuladas por esta entrega. O estado lido disponível é voluntário e explícito.

Reverter o código segue o fluxo normal de revert da PR. Um revert não apaga eventos já gravados. Em caso de futura migração, exigir inventário, backup, ensaio isolado e reconciliação antes de autorizar a escrita.
