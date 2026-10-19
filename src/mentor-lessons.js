export const LESSONS=[
 {id:'first-access',title:'Primeiros passos',roles:['admin','manager','cook','auxiliar'],description:'Conheça a navegação sem alterar dados reais.',steps:[
  {title:'Conheça o painel',body:'A Operação da cozinha reúne os atalhos principais. Abra essa área para conhecer as informações disponíveis.',page:'kitchen',target:'mentor-kitchen'},
  {title:'Encontre sua ficha',body:'Na Minha ficha profissional, consulte seu cargo, jornada e competências. Consulte primeiro: não é preciso fazer nenhuma alteração.',page:'my-profile',target:'mentor-profile'},
  {title:'Veja o mural',body:'O Mural da equipe exibe comunicados e informações publicadas. Consulte as informações da sua unidade.',page:'mural',target:'mentor-mural'}]},
 {id:'manage-people',title:'Conhecendo a equipe',roles:['admin','manager'],description:'Cadastros, habilidades e escalas em um único lugar.',steps:[
  {title:'Entre em Gestão de Pessoas',body:'Clique em Gestão de pessoas no menu lateral. O mentor destacará o botão correspondente.',page:'people',target:'mentor-people'},
  {title:'Entenda as áreas',body:'Em Colaboradores ficam as fichas reais. Em Habilidades você consulta competências; em Jornadas, turnos e intervalos.',page:'people',target:'mentor-people-tabs'},
  {title:'Encontre as escalas',body:'Abra a opção Escalas dentro de Gestão de Pessoas. Antes de publicar, revise os registros e as folgas.',page:'people',target:'mentor-people-tabs'}]},
 {id:'double-shifts',title:'Cobertura e dobras',roles:['admin','manager'],description:'Aprenda a simular reforços sem modificar a escala oficial.',steps:[
  {title:'Localize Cobertura',body:'Abra Gestão de Pessoas e selecione Cobertura. É aqui que você simula faltas e propostas de dobra.',page:'people',target:'mentor-people-tabs'},
  {title:'Faça uma simulação segura',body:'Selecione uma escala, uma data, um setor, uma faixa de horário e o mínimo de pessoas. Use Analisar cobertura, que não altera a escala.',page:'people',target:'mentor-people-tabs'},
  {title:'Entenda valores e aprovações',body:'Os valores de R$ 100, R$ 120 e R$ 150 são pagamentos atualmente praticados, não cálculo trabalhista. Propostas exigem conferência humana, aceite e aprovação.',page:'people',target:'mentor-people-tabs'}]},
 {id:'stock',title:'Estoque e recebimento',roles:['admin','manager','cook','auxiliar'],description:'Veja onde consultar estoque e registrar recebimentos.',steps:[
  {title:'Encontre o estoque',body:'Clique em Estoque para consultar produtos da sua unidade e as informações disponíveis.',page:'inventory',target:'mentor-inventory'},
  {title:'Conheça o recebimento',body:'Em Recebimento, entradas precisam ser conferidas com os produtos efetivamente recebidos.',page:'receiving',target:'mentor-receiving'},
  {title:'Consulte o histórico',body:'Use Histórico para consultar lançamentos existentes. O treinamento não altera estoque nem cria registros.',page:'history',target:'mentor-history'}]}
];
export function lessonsForRole(role){return LESSONS.filter(l=>l.roles.includes(role));}
export function isLessonAllowed(id,role){return lessonsForRole(role).some(l=>l.id===id);}
export function progressKey(unitId,uid){return 'triamicci-mentor-v1:'+encodeURIComponent(unitId||'')+':'+encodeURIComponent(uid||'');}
