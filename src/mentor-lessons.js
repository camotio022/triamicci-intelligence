export const LESSONS=[
 {id:'first-access',title:'Primeiros passos',roles:['admin','manager','submanager','cook','auxiliar'],description:'Conheça a navegação sem alterar dados reais.',steps:[
  {title:'Conheça o painel',body:'A Operação da cozinha reúne os atalhos principais. Abra essa área para conhecer as informações disponíveis.',page:'kitchen',target:'mentor-kitchen'},
  {title:'Encontre sua ficha',body:'Na Minha ficha profissional, consulte seu cargo, jornada e competências. Consulte primeiro: não é preciso fazer nenhuma alteração.',page:'my-profile',target:'mentor-profile'},
  {title:'Veja o mural',body:'O Mural da equipe exibe comunicados e informações publicadas. Consulte as informações da sua unidade.',page:'mural',target:'mentor-mural'}]},
 {id:'manage-people',title:'Conhecendo a equipe',roles:['admin','manager','submanager'],description:'Cadastros, habilidades e escalas em um único lugar.',steps:[
  {title:'Entre em Gestão de Pessoas',body:'Clique em Gestão de pessoas no menu lateral. O mentor destacará o botão correspondente.',page:'people',target:'mentor-people'},
  {title:'Entenda as áreas',body:'Em Colaboradores ficam as fichas reais. Em Habilidades você consulta competências; em Jornadas, turnos e intervalos.',page:'people',target:'mentor-people-tabs'},
  {title:'Encontre as escalas',body:'Abra a opção Escalas dentro de Gestão de Pessoas. Antes de publicar, revise os registros e as folgas.',page:'people',target:'mentor-people-tabs'}]},
 {id:'double-shifts',title:'Cobertura e dobras',roles:['admin','manager','submanager'],description:'Aprenda a simular reforços sem modificar a escala oficial.',steps:[
  {title:'Localize Cobertura',body:'Abra Gestão de Pessoas e selecione Cobertura. É aqui que você simula faltas e propostas de dobra.',page:'people',target:'mentor-people-tabs'},
  {title:'Faça uma simulação segura',body:'Selecione uma escala, uma data, um setor, uma faixa de horário e o mínimo de pessoas. Use Analisar cobertura, que não altera a escala.',page:'people',target:'mentor-people-tabs'},
  {title:'Entenda valores e aprovações',body:'Os valores de R$ 100, R$ 120 e R$ 150 são pagamentos atualmente praticados, não cálculo trabalhista. Propostas exigem conferência humana, aceite e aprovação.',page:'people',target:'mentor-people-tabs'}]},
 {id:'stock',title:'Estoque e recebimento',roles:['admin','manager','submanager','cook','auxiliar'],description:'Veja onde consultar estoque e registrar recebimentos.',steps:[
  {title:'Encontre o estoque',body:'Clique em Estoque para consultar produtos da sua unidade e as informações disponíveis.',page:'inventory',target:'mentor-inventory'},
  {title:'Conheça o recebimento',body:'Em Recebimento, entradas precisam ser conferidas com os produtos efetivamente recebidos.',page:'receiving',target:'mentor-receiving'},
  {title:'Consulte o histórico',body:'Use Histórico para consultar lançamentos existentes. O treinamento não altera estoque nem cria registros.',page:'history',target:'mentor-history'}]},
 {id:'daily-stock',title:'Contagem e inventário',roles:['admin','manager','submanager','cook','auxiliar'],description:'Entenda a diferença entre conferir o estoque e registrar movimentações.',steps:[
  {title:'Abra a contagem',body:'A contagem registra o que foi encontrado nas áreas de reserva e giro. Confira a unidade antes de salvar: kg e un não são equivalentes.',page:'count',target:'mentor-count'},
  {title:'Consulte o inventário',body:'O Inventário inteligente auxilia a conferência. Não presuma que o último valor contado é o saldo em tempo real.',page:'daily-inventory',target:'mentor-daily-inventory'},
  {title:'Verifique movimentações',body:'No Histórico você confere recebimentos, contagens, transferências e saídas que foram efetivamente registradas.',page:'history',target:'mentor-history'}]},
 {id:'production',title:'Produção e cozinha',roles:['admin','manager','submanager','cook','auxiliar'],description:'Conheça produção, consulta de insumos e registros seguros.',steps:[
  {title:'Conheça a operação',body:'A Operação da cozinha reúne as tarefas de rotina da equipe.',page:'kitchen',target:'mentor-kitchen'},
  {title:'Explore produção',body:'Consulte os produtos e a área de produção. Registrar uma produção real pode afetar dados operacionais: não confirme operações durante o treinamento.',page:'production',target:'mentor-production'},
  {title:'Consulte as informações do estoque',body:'Verifique o histórico e as quantidades registradas antes de tomar decisões.',page:'inventory',target:'mentor-inventory'}]},
 {id:'people-schedule',title:'Escalas, folgas e jornada',roles:['admin','manager','submanager'],description:'Entenda planejamento, publicação e solicitações de folga.',steps:[
  {title:'Gestão de pessoas',body:'Acesse Gestão de pessoas para consultar perfis e áreas administrativas conforme sua permissão.',page:'people',target:'mentor-people'},
  {title:'Escalas e planejamento',body:'A publicação de escalas é uma operação real. Confira datas e funcionários antes de confirmar.',page:'schedule-planning',target:'mentor-schedule'},
  {title:'Solicitações de folga',body:'Consulte pedidos de folga e o fluxo de aprovação. O Mentor não aprova nem altera solicitações.',page:'leave-requests',target:'mentor-leave'}]},
 {id:'admin-guide',title:'Visão geral do administrador',roles:['admin'],description:'Mapa dos módulos, permissões e efeitos de cada operação.',steps:[
  {title:'Administração do catálogo',body:'Revise produtos, embalagens e aprovações por áreas. Ações em lote podem disponibilizar itens: leia a confirmação antes de executar.',page:'catalog',target:'mentor-catalog'},
  {title:'Pessoas e permissões',body:'Gestão de pessoas controla funções e acessos. Uma alteração de permissão pode modificar o que a equipe consegue visualizar ou executar.',page:'people',target:'mentor-people'},
  {title:'Estoque e rastreabilidade',body:'O estoque distingue contagens, recebimentos e movimentações. Histórico e lotes devem ser consultados antes de uma correção.',page:'inventory',target:'mentor-inventory'},
  {title:'Escalas e publicação',body:'Planejamento de escalas e publicação são processos distintos. Verifique os dados antes de tornar mudanças oficiais.',page:'schedule-planning',target:'mentor-schedule'}]}

];
export function lessonsForRole(role){return LESSONS.filter(l=>l.roles.includes(role));}
export function isLessonAllowed(id,role){return lessonsForRole(role).some(l=>l.id===id);}
export function progressKey(unitId,uid){return 'triamicci-mentor-v1:'+encodeURIComponent(unitId||'')+':'+encodeURIComponent(uid||'');}
