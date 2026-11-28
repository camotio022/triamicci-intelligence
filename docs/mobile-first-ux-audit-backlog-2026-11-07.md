# Auditoria UX/UI mobile-first — Backlog executável
Data: 2026-11-07 | Projeto: Triamicci Intelligence | Estado: **PLANEJAMENTO, NÃO IMPLEMENTADO**

> Este documento é a fonte de continuidade do redesenho visual. Foi preparado após revisão estática do código na `main`, levantamento das rotas/JSX/CSS, documentos de auditorias anteriores e testes existentes. **Não é aprovação visual pixel a pixel nem comprovação de teste Safari/iPhone.** Não alterar dados operacionais para simular sucesso.

## Objetivo e limites
Unificar o design mobile-first, tornar as telas compactas, legíveis e operáveis com uma mão, sem perder recursos e sem refazer toda a aplicação. **Preservar** contratos das APIs, Firebase/Firestore, isolamento por unidade, permissões de 5 papéis, trilha de auditoria, idempotência, saldos, entradas, movimentos, lotes e histórico imutável. Esconder IDs técnicos na apresentação não significa eliminar registros. Não fazer merge de alterações de UI sem teste, revisão e autorização.

## Design system único (contrato de aceite)
- **Identidade:** vermelho institucional #A71919 (ações primárias e seleção), neutros claros, textos #202a3d; cores semânticas apenas para alertas/sucesso; não aplicar vermelho a todos os elementos.
- **Mobile-first:** base 320px, depois 375/390/430/600/768/1024/1440px. Page sem overflow horizontal; tabelas densas viram cards/linhas resumidas + detalhe, com tabela desktop quando adequado. Barras de abas podem rolar **dentro** do componente, não o documento.
- **Hierarquia:** cabeçalho por tela curto (título, unidade/contexto, 1 ação prioritária); eliminar explicações redundantes; contadores no máximo 2–3 no primeiro viewport; cards com título 14–16px, metadados 12–13px, margens coerentes e informações secundárias recolhidas.
- **Ritmo:** espaçamento base 4/8/12/16/24px; radius 10–16px; alto contraste; textos não truncados sem alternativa acessível. Campos de edição >=16px no iOS; área de toque >=44×44px; foco acessível e navegação por teclado.
- **Componentes reutilizáveis:** `PageHeader`, `CompactCard`, `FilterBar`, `HistoryList`, `StatusBadge`, `EmptyState`, `ConfirmSheet`, `DetailSheet`, `FormField`, `LoadingState`. Nomes são sugestão; antes de criar, pesquisar componentes existentes e reutilizar. Não duplicar `TriamicciHistory` e `ConferenceHistory` sem estratégia migratória.
- **Históricos:** data/hora, ação, ator legível/foto quando disponível, local, quantidade/unidade, status; filtros busca/período/área; expansão de detalhes; carregar mais sem alegar completude dos dados; arquivamento apenas se regra e endpoint autorizarem; não agregar quantidades incompatíveis nem lançamentos sem relação verificável.
- **Modal e feedback:** substituir `window.confirm/prompt` por sheet/modal acessível para ações críticas, com confirmação contextual. Carregando, erro, vazio, offline e sucesso somente após API. Impedir duplo envio. Fotos/câmera respeitam safe-area e retorno para a tarefa. Zoom de evidências com preservação do arquivo original.
- **PWA/iOS/Android:** verificar status bar/safe area/sidebar aberta e fechada, teclado, bottom bar, rolagem/foco, modo Safari navegador versus standalone, `prefers-reduced-motion`, zoom 200%, modo paisagem quando aplicável.
- **CSS:** reduzir cascata e `!important` concorrentes; padronizar variáveis/tokens antes de reescrever telas; componentes por módulo sem fuga de seletor global; preservar compatibilidade desktop.

## Backlog por tela e estado
Legenda: P0 crítica, P1 alta, P2 refinamento; `[ ]` pendente. **Todos os itens abaixo permanecem pendentes de implementação ou validação, mesmo os de componentes já modernizados.**

### A. Fundação e navegação
- [ ] **A01 P0 — Cabeçalho e breadcrumbs** — `src/App.jsx`, `src/mobile-v42.css`, `src/styles.css`: remover truncamento sem contexto (“Conferência de es…”); garantir título completo no cabeçalho da página, header global compacto com marca, menu, aviso e avatar; reduzir faixas duplicadas.
- [ ] **A02 P0 — Sidebar, atalhos e safe areas** — `SidebarPremium.jsx`, `sidebar-premium.css`, `ios-edge-to-edge.css`, `responsive-system.css`: testar drawer aberta/fechada com notch/status bar, bottom safe area, scroll independente, overlay, foco, body scroll lock, Android e Safari normal; padronizar ativação/fechamento.
- [ ] **A03 P0 — Componentes, botões, inputs, overlays** — `button-foundation.css`, `ios-input-focus.css`, `FeedbackProvider.jsx`, folhas globais: auditar TODAS as variações de botão/ícone/disabled, input numérico, select, date/month, textarea, teclado iOS, modal, toast e erro; eliminar conflitos CSS por prioridade.
- [ ] **A04 P1 — Login e estados de acesso** — `AuthGate.jsx`, `auth-v41.css`: loading, erro, vinculação, convite inválido, sessão independente e foco após autenticação em 320–430px.

### B. Cozinha, estoque e operação
- [ ] **B01 P1 — Painel da cozinha** — `KitchenHome.jsx`, `kitchen.css`: destacar tarefa do dia, separar resumo e histórico, condensar atalhos, limitar textos introdutórios e manter fluxo de operação.
- [ ] **B02 P1 — Estoque/Insumos** — `KitchenV3.jsx`, `v3-kitchen.css`, `v4-stock-overview.css`: alertas, entregas, áreas e estado por produto numa hierarquia única; filtros horizontais internos; não confundir saldo com última contagem.
- [ ] **B03 P1 — Catálogo/Estoque** — `Inventory.jsx`, `responsive-system.css`: cards de produto em mobile; tabela somente desktop; estado de unidade, validade, saldo não conferido e sem cadastro claramente diferenciados; edição em sheet.
- [ ] **B04 P2 — Ficha do produto** — `ProductDetails.jsx`, `product-detail-v41.css`: resumo e ação primária no topo; lotes e histórico recolhíveis; sem números sem unidade; evitar cards aninhados.
- [ ] **B05 P2 — Conferência Hoje** — `StockConference.jsx`, `stock-conference.css`: teclado compacto, campo sem zoom, zero explícito, lotes, próxima tarefa, fluxo Giro/Reserva, mudanças anormais e confirmação de gerente.
- [ ] **B06 P1 — Conferência Histórico** — `ConferenceHistory.jsx`, `conference-history.css`: PR #157 já integrado à main em 07/11; validar com rodada multiárea, múltiplos produtos e paginação; testar nome responsável, busca, períodos, duplicatas e quantidades; sem expor IDs.
- [ ] **B07 P0 — Inventário diário / fechamento** — `DailyInventory.jsx`, `daily-inventory-v4.css`: separar “hoje / pendências / revisão / histórico”; não apresentar `countId` ao operador; diferenciar contagem, divergência e fechamento; eliminar `window.prompt`; preservar aprovação.
- [ ] **B08 P0 — Recebimento legado** — `Receiving.jsx`, `styles.css`: substituir tabela horizontal de conferência por lista de itens com solicitado/recebido/diferença/observação; uma ação principal; não alterar efeitos de API.
- [ ] **B09 P1 — Pedido/Recebimento pendente** — `ShipmentReceiving.jsx`, `shipment-receiving-v2.css`, `PackageConference.jsx`: wizard com resumo por item, exceção/justificativa, aprovação/rejeição, confirmação contextual sem `window.confirm`.
- [ ] **B10 P1 — Estoque físico/lotes** — `PhysicalStock.jsx`, `receiving-experience.css`: tabela de lotes responsiva em cards; vencimento, quantidade e disponibilidade em leitura rápida; edição segura.
- [ ] **B11 P0 — Movimentações** — `StockMovements.jsx`: tabela com 8 colunas vira histórico mobile com filtro, tipo, responsável, antes/depois sob demanda; preservar valores e origem.
- [ ] **B12 P1 — Produção Hoje** — `Production.jsx`, `production-v4.css`: tarefas primeiro, formulário detalhado depois, resumo de insumos/lotes visível antes de confirmar; sem duplicar botões ou mensagens.
- [ ] **B13 P1 — Produção Histórico** — `TriamicciHistory.jsx`, `KitchenV3History.jsx`, `triamicci-history.css`: padronizar comportamento com B06, mesma barra de filtros e detalhes, sem filtrar apenas dados parciais como se fossem todos.
- [ ] **B14 P0 — Fichas técnicas/preparações** — `PreparationSetup.jsx`, `preparation-setup.css`, `PreparedProductForm.jsx`: reduzir formulários longos por etapas, mostrar insumo principal e múltiplos insumos/rendimento claramente; confirmação e arquivar sem diálogo nativo.
- [ ] **B15 P1 — Configuração e conciliação de catálogo** — `OperationalCatalogSetup.jsx`, `CatalogV2Review.jsx`: esconder complexidade técnica em seção avançada, trocar tabela por cards em mobile e preservar regras de unidade/conversão.
- [ ] **B16 P1 — Etiquetas/Validades** — `LabelsManager.jsx`, `PrintableLabel.jsx`: formulário compacto, pré-visualização imprimível, histórico e status; testar impressora sem alterar dados.

### C. Equipe, gestão e jornada
- [ ] **C01 P1 — Mural** — `TeamMural.jsx`, `mural-v5.css`: aba Hoje com equipe/turnos, comunicados e jornada; escala/produção em seções compactas; permitir arquivar comunicados mantendo histórico; substituir confirmações nativas.
- [ ] **C02 P2 — Equipe de hoje** — `TeamTodayV31.jsx`: avatar, função, turno, presença declarada vs prevista; correção de presença com permissão e auditoria.
- [ ] **C03 P0 — Planejamento de escala** — `SchedulePlanner.jsx`, `operations-planning.css`: matriz mensal usa `minWidth: Math.max(860,monthDates(...).length*30+150)`; criar calendário/timeline de mobile (dia/semana), tabela ampla só desktop, folgas e cobertura acessíveis sem scroll horizontal geral.
- [ ] **C04 P1 — Escala publicada** — `PublishedRoster.jsx`, `published-roster.css`: resumo por dia/turno e exceções em cards; grade completa por detalhe sem atrapalhar toque.
- [ ] **C05 P1 — Solicitação de folga** — `LeaveRequests.jsx`, `leave-v4.css`: separar minhas solicitações da fila de gestão, filtros compactos, aprovação/recusa contextual; manter regra de escala e retroatividade.
- [ ] **C06 P1 — Coberturas/dobras** — `CoverageConsole.jsx`, `coverage.css`: fluxo por etapa (data, turno, convite, aprovação), compacto, status temporal legível; salvar com prevenção de duplo envio.
- [ ] **C07 P2 — Minhas coberturas** — `MyCoverageProposals.jsx`: convites atuais antes de históricos; substituir confirm nativo, preservar aceite/recusa.
- [ ] **C08 P1 — Gestão de pessoas** — `PeopleHub.jsx`, `TeamManagement.jsx`, `people-hub.css`: abas por finalidade, lista limpa e ações por pessoa, não empilhar vários painéis.
- [ ] **C09 P1 — Colaboradores/perfis** — `TeamProfiles.jsx`, `MemberDirectory.jsx`: editor de perfil como sheet com etapas, jornadas/competências em detalhes, foto e função visíveis, sem perda de dados não salvos.
- [ ] **C10 P0 — Matriz de habilidades** — `TeamProfiles.jsx`: tabela vira cartões por pessoa e setor no mobile, matrizes completas no desktop; busca e filtro para não rolar lateralmente.
- [ ] **C11 P1 — Convites e acessos** — `TeamManagement.jsx`, `access-management.css`: pendentes/ativos/histórico separados; permissões visíveis e confirmação de revogação contextual; respeitar isolamento entre unidades.
- [ ] **C12 P1 — Cadastro mestre** — `MasterRegistry.jsx`, `master-registry.css`: cartões e ações por colaborador; conciliação/importação avançada recolhida; proteção contra vínculo incorreto e confirmação sem nativos.
- [ ] **C13 P2 — Minha ficha** — `MyProfessionalProfile.jsx`, `profile-v5.css`: foto estável, edição e informações pessoais agrupadas, jornada resumida; evitar scroll excessivo.
- [ ] **C14 P2 — Meu ponto** — `MyAttendanceV31.jsx`, `my-journey-v5.css`: entrada, intervalo, retorno, saída, horas e estados claros, evitar falsa confirmação; testar mudanças de dia/fuso.

### D. Checklists, histórico, alertas e painel
- [ ] **D01 P2 — Checklists Hoje** — `Checklists.jsx`, `checklists.css`: cards de estado e progresso compactos; separar iniciar/continuar/concluído, prazo e pendência de foto.
- [ ] **D02 P1 — Checklist execução, câmera e evidência** — `Checklists.jsx`, `ChecklistCamera.jsx`, `ChecklistEvidence.jsx`: modal de câmera fixo responsivo, retorno seguro ao item, foto ligada ao item, zoom com imagem íntegra; arquivar não deve deixar item ativo indevidamente.
- [ ] **D03 P1 — Histórico de checklist** — `Checklists.jsx`: usar padrão de HistoryList com data, responsável, status, evidência e filtros; histórico arquivado separado de hoje.
- [ ] **D04 P1 — Editor de checklists** — `ChecklistEditor.jsx`: itens em cards compactos, foto requerida vs opcional, confirmação contextual, validações no próprio campo.
- [ ] **D05 P1 — Central de notificações** — `NotificationCenter.jsx`, `notifications.css`: já há recebidas/lixeira/ler/excluir/restaurar no código; testar todos os tipos e origem, ações, badge, scroll, histórico e estados de erro; não presumir ausência de recurso por print antigo.
- [ ] **D06 P1 — Dashboard/indicadores** — `Dashboard.jsx`, `styles.css`: reduzir cards e gráficos na primeira dobra; tabela de estoque baixo vira cards no mobile, legenda legível, estados de dados desatualizados.
- [ ] **D07 P1 — Histórico transversal** — `TriamicciHistory.jsx`, `HistoryPeriod.jsx`, `ConferenceHistory.jsx`: harmonizar tokens e UX sem alterar a fonte de dados de cada módulo; diferenciar “busca nos itens carregados” de busca global.

## Testes de aceite por item (não marcar como concluído sem evidência)
1. **Visual**: screenshots por módulo a 320/375/390/430/768/1024/1440px; comparar antes/depois; validar notch + teclado no Safari e no PWA instalado em dispositivo real.
2. **Interação**: clicar cada botão/aba/card/menu, pesquisar, filtrar, criar, editar, arquivar, cancelar, salvar, reabrir e lidar com loading/erro/offline; checar scroll e foco.
3. **Acessibilidade**: texto com zoom 200%, contraste, tamanho mínimo de alvo, leitura por screen reader, foco em modais, confirmação nativa eliminada onde necessário.
4. **Permissões**: administrador, gerente, subgerente, cozinheiro e auxiliar; acesso à unidade distinta bloqueado; informação pessoal restrita.
5. **Regressão**: `npm run build`, `npm run test:rules` e suítes Node/Playwright/Emulator pertinentes; não alegar sucesso sem realmente executá-las.
6. **Dados**: não criar contagens fictícias em produção; preservar audit trail, divisão Giro/Reserva, qualidade do saldo, histórico e idempotência.
7. **Homologação**: link da preview, prints e lista de evidências; merge apenas depois de revisar checks, corrigir quebras e receber autorização.

## Estratégia de entrega
- **Fase 1 (P0 fundação):** A01–A03; criar tokens e modais reutilizáveis; congelar interfaces de APIs.
- **Fase 2 (P0 operacional):** B07, B08, B11, B14, C03, C10; testar mobile e dados.
- **Fase 3 (P1 históricos e operação):** B06, B09, B12, B13, C01, D03, D05, D07.
- **Fase 4 (P1 demais):** revisar B01–B03, B10, B15–B16, C04–C06, C08–C12, D02, D04, D06.
- **Fase 5 (P2/refino e QA):** restantes + comparação tela a tela e aceite do gerente.
- Cada fase em PR próprio, sem misturar uma reforma visual global com modificações críticas de regras.
- Marcar checkboxes apenas após implementação + evidência; não declarar 100% sem homologação real.

## Evidência de partida
- 07/11/2026: revisão estática dos arquivos acima e dos testes existentes.
- Histórico da conferência: **PR #157 integrado** e Vercel READY; visual em dispositivo real **não aprovado**.
- Testes existentes incluem `tests/v4-mobile.test.mjs`, `tests/stock-conference-mobile.test.mjs`, `tests/checklists-mobile.test.mjs`, `tests/access-mobile.test.mjs`, `tests/preparation-mobile.test.mjs`. Eles cobrem cenários específicos e não substituem a matriz completa.
- Documentos históricos: `docs/auditoria-botoes-mobile-2026-10-29.md`, `docs/padrao-ux-feedback-mobile.md`, `docs/fechamento-prints-30-outubro-2026.md`.

## Instrução para continuação por outro chat/engenheiro
Abrir **este PR draft** e `docs/mobile-first-ux-audit-backlog-2026-11-07.md`. Ler `src/App.jsx`, estilos globais e testes antes de mudar telas. Verificar a `main` atual (pode ter avançado); realizar uma fase por vez; executar testes; registrar arquivos modificados, capturas, problemas, checks, resultado de CI/preview e pendências no PR. **Não dar merge no PR de planejamento como se fosse implementação.** O pedido original é deixar o plano rastreável no GitHub para retomada posterior.
