# Triamicci Intelligence — Plano Mestre V4

> **Documento de continuidade — 22/10/2026.** Fonte detalhada: [Issue #76](https://github.com/camotio022/triamicci-intelligence/issues/76). Este arquivo é um **resumo operacional**, não substitui a especificação completa e não confirma implementação. Qualquer novo agente/chat deve ler **este documento + a Issue #76 + o estado atual do código/PRs** antes de alterar arquivos.

## Regras para continuar o projeto

1. **Não confundir conversa e código**: requisito discutido não está necessariamente implementado. Conferir branch, PRs, backend, Firestore Rules, índices e migrations antes de afirmar funcionalidade existente.
2. **Sem merge na `main` ou deploy de produção sem aprovação explícita do responsável.** Fluxo preferido: branch → commits pequenos → verificações → PR → teste funcional do usuário → autorização para merge. Cuidar da quota de deploys Vercel.
3. **Não perder dados nem romper isolamento entre unidades.** Nada de migração/limpeza/backfill sem plano, testes e autorização específicos. Priorizar transações idempotentes, trilha de auditoria, permissões no backend/Rules.
4. **Mobile-first real**, minimalismo profissional, linguagem operacional, informação importante sem rolagem excessiva, detalhes em modais/rotas contextuais e retorno preservando filtros, aba e posição. Nenhum botão decorativo/falso fluxo funcional.
5. **Triamicci visual**: vermelho institucional (marca/ações), vermelho de criticidade (problema confirmado), âmbar (atenção/suspeita), verde (confirmado/resolvido), neutro/azul (informativo/indeterminado); não comunicar status só por cor. Indicadores devem filtrar listas ao toque.
6. **“Ao vivo” só com conexão atual e confiável**, atualizações silenciosas sem flicker, distinguir informação de escala prevista e presença verificada. Respeitar fuso da unidade (Brasil/Curitiba: America/Sao_Paulo, enquanto aplicável).

## Visão do produto

Plataforma operacional de restaurante com dados por unidade, inventário, estoque físico, recebimento, produção/pré-preparo, mural, escala, pessoas, alertas, auditoria e gestão. A **matriz** pode ter configurações e relatórios globais sob controle de acesso; dados operacionais de Barigui, Palladium e outras unidades não devem se misturar.

**Arquitetura atual conhecida:** React/Vite, Firebase/Firestore, APIs backend, Vercel; repositório `camotio022/triamicci-intelligence`. Antes de declarar segurança multi-tenant, auditar todas as coleções, `unitId`, Rules, memberships, serviços, listeners, relatórios e logs globais. Dados na raiz não são automaticamente inseguros se houver particionamento e autorização corretos.

## Módulos e decisões V4

### Mural Vivo — UX-32–38, 61, 68–73, 92–102
- Painel útil ao momento: equipe agora/próximos/encerrados sem cartões vazios duplicados e sem fingir presença, escala mensal oficial acessível com destaque e folgas.
- **Comunicados com cara de mensagem**: título, prévia, autoria, data, prioridade, novo/não lido, histórico; urgentes em destaque; confirmação explícita de leitura de mensagens importantes **ainda pendente de aprovação**.
- **Lista de produção do dia** compartilhada com Produção (mesma fonte): cozinheiro responsável planeja preparações, quantidade-alvo opcional, equipe autorizada acompanha tarefas, concluídas e pendentes. Papéis para criar/editar/atribuir e regras de conclusão ainda exigem decisão final.
- Concluir checklist **com quantidade real confirmada** pode gerar produção e entrada na reserva; somente marcar sem confirmação quantitativa **não movimenta estoque**. Evitar dupla contagem.

### Produção e fichas técnicas — UX-62–73, 103–107
- **Produção é pré-preparo para reserva**, não registro de pratos vendidos: parmegiana de frango/alcatra, medalhão, tilápia, isca de tilápia, legumes à manteiga etc.
- Funcionário informa **o que fez e quanto fez**. Não precisa preencher ingredientes por produção. Modo de preparo objetivo e composição na **ficha técnica**, opcional ao consultar. Cadastro/edição de fichas para autorizados.
- Ficha técnica referencia IDs de matéria-prima/preparações intermediárias e produto resultante, com rendimentos e unidades reais (kg/L/un/porções), sem conversão presumida.
- **Transformação de estoque**: quando produzir 30 parmegianas de frango, a ficha pode especificar frango grelhado já estocado na reserva. Confirmada a execução: debitar quantidade apropriada do frango na origem e creditar **+30 un parmegiana na reserva**, numa operação única, auditável e idempotente. Razão (ex.: 1:1) somente se a ficha validada declarar. Outras matérias-primas também consideradas. Não consumir componentes de novo se já foram transformados em um insumo intermediário.
- Produção parcial e meta opcional; fluxo claro, listagem “Produção de hoje” primeiro, concluídas recentes e histórico. Transferência reserva → giro é movimento separado. Rever texto e regra antiga de “baixa só no giro”.

### Estoque, recebimento e cozinha — UX-01–13, 44–60
- Estoque Físico: resumo por dia, indicadores clicáveis, listas compactas, detalhes/histórico em modal, sem duplicação com página de operação.
- Estoque e Insumos: **Hoje / Operações / Consultas** como agrupamento de navegação proposto, em lugar de muitas abas escondidas horizontalmente. Central de atenção: sinalizados, atrasos, faltas suspeitas, pendências, próximos recebimentos. Produto não verificado ≠ falta confirmada; saldo estimado ≠ contagem física.
- Recebimento: entrega prevista com fornecedor/itens/quantidades de pedido carregados, conferir físico real em fluxo guiado; entrega não prevista com justificativa e autorização; múltiplos itens em uma conferência **proposta**; divergência, lote e validade quando aplicáveis; lista histórica compacta; sem lançamentos inventados.
- Operação da Cozinha mantém atalhos essenciais, resume histórico de produções e contagens conforme hierarquia; navegação unificada para não ter duas telas divergentes para a mesma ação.

### Inventário Inteligente — UX-74–85, 87–91
- Não é contagem manual. Investiga **diferenças entre duas contagens**, considerando entradas e baixas do período. Não presume venda, furto ou desperdício.
- **Produtos com contagem física hoje aparecem automaticamente** no inventário com estados “Investigar / Histórico insuficiente / Sem divergência identificada / Análise indisponível”; clicáveis, prioritários e com investigação detalhada. Buscar outros produtos permanece possível.
- Código atual conhecido: `src/DailyInventory.jsx`, `server/operations/daily-report.js`, `server/operations/daily-inventory.js`, `server/operations/inventory-closure.js`. Endpoint calcula **um produto por vez** e limita consultas históricas: necessário projetar resumo escalável, paginação, cache/invalidação e processamento incremental seguro.
- **Investigação de divergências**: alocar quantidades parciais/totais a motivos como descarte, perda/avaria, refeição de funcionários, produção, venda declarada, transferência, cortesia, erro de contagem, outro/não identificado. Distinguir alegação de evento comprovado e motivos de saída dos de sobra positiva. Anotar quem/quando/evidências. **Justificação não é aprovação; investigação não movimenta estoque**. Papéis para justificar e aprovar ainda pendentes.
- Fechamentos gerenciais auditados, sem alteração automática de saldo; índices, unidade e dados consistentes. A produção transformacional V4 precisa entrar corretamente na conciliação sem duplicar baixas.

### Pessoas, escala e gestão — UX-14–43
- Minha Ficha: foto/identidade primeiro, um único cartão **Minha Jornada + Minha Escala de hoje** (decisão aprovada); próximos turnos, trocas/coberturas, dados, habilidades, pendências; presença declarada ≠ presença validada.
- Folgas: pedidos orientados ao planejamento de mês futuro antes de escala oficial; gestão resolve pedidos pendentes antes de publicar. Regra discutida: publicação oficial só dentro de 20 dias do início do mês.
- Escala inteligente: proposta mensal respeitando folgas autorizadas, mínimo por setor/turno e habilidades; destaque especial aos **domingos** e equilíbrio; planejamento editável, sem publicar sozinho.
- Coberturas/dobras: competências cruzadas, turno inteiro quando necessário, pausas previstas e regras legais verificadas; não assumir que aprovação é automática.
- Mural mantém calendário/escala em área visualmente importante.
- Gestão de Pessoas: diretório compacto pesquisável, detalhes modais, reconciliação de contas separada de lista; associação e permissões confiáveis.

### Arquitetura matriz/unidades — UX-86
- Unidade selecionada deve contextualizar **todas** as consultas, relatórios, funcionários, estoque, produção e histórico; mudança cancela listeners anteriores, limpa estado sensível e reautoriza no backend.
- Matriz guarda dados corporativos apropriados e pode acessar indicadores interunidades com autorização. Há alternativas: subcoleções de unidade, registros globais com `unitId` e regras fortes, ou híbrido. **Auditar antes de escolher/migrar**.

## Plano de entrega proposto — sujeito a revisão após auditoria

**Gate 0 (agora):** plano mestre + mapa do repositório e do backend, decisões abertas, segurança/Rules, testes disponíveis, PRs/branches/deploy. Não iniciar alterações críticas antes disso.
1. **PR 1 — Fundação visual:** componentes/design system, navegação mobile, layouts e fluxos coerentes, Mural, Estoque, Minha Ficha, Pessoas, Recebimento; preservar funcionalidades reais, sem botões fictícios.
2. **PR 2 — Inteligência operacional:** checklist unificado, produção e transformação de estoque, fichas técnicas, recebimentos, inventário automático e investigação, com testes transacionais/idempotência.
3. **PR 3 — Gestão e integração:** escalas/folgas/dobras, notificações, permissões, desempenho e integração transversal; auditoria multiunidade e plano de migração SE necessário (migração em PR específica só mediante autorização).

Divisão em 3 PRs é **intenção inicial**, não compromisso rígido: se o Gate 0 mostrar dependências cruzadas perigosas, quebrar as PRs em etapas menores e preferir segurança. Testar antes de cada merge, agrupar previews Vercel.

## Decisões em aberto que não podem ser inventadas

- Escala: detalhes das regras de publicação futura, horários de domingo, papéis e folgas excepcionais.
- Produção: quem cria/edita lista, quem conclui, atribuição opcional, destino quando diferente da reserva, produção sem ficha válida e correções posteriores.
- Recebimento: recebimentos parciais/multilinha, permissões e destinos reais.
- Mural: confirmação obrigatória de leitura para mensagens prioritárias.
- Inventário: quem justifica/aprova, limites de divergência, trilha de evidências.
- Infra: layout real de dados no Firestore, compatibilidade de regras e plano multi-tenant, índices, backup, automação de CI/deploy.

## Como retomar em qualquer novo chat

> Continuar o Triamicci Intelligence V4 no GitHub `camotio022/triamicci-intelligence`. Primeiro leia `docs/TRIAMICCI_V4_MASTER_PLAN.md` e a Issue #76 inteira (inclusive atualizações), depois confira o estado real da `main`, branches, PRs, CI, API, Firestore Rules e Vercel. Não assuma que propostas já estão implementadas. Trabalhe mobile-first com a identidade Triamicci e comportamento operacional real; priorize proteção de dados, transações e atualização ao vivo honesta. Estamos no **Gate 0** do plano de implementação em 3 etapas. Proponha ou inicie o próximo passo autorizado, **sem merge nem deploy sem autorização explícita**, e reporte exatamente o que foi feito, o que falta e o que não foi verificado.

**Fonte de verdade para detalhes e sequência histórica:** [Issue #76](https://github.com/camotio022/triamicci-intelligence/issues/76). Atualizar este plano após decisões estruturais, mudanças de fase e merges; não apagar requisitos sem aprovação.
