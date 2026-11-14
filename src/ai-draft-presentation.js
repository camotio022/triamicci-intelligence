// AI-Permissions 1.0: nomes previsíveis por categoria, sem reutilizar prompts enormes.
// Utilizado tanto em rascunhos antigos quanto nos novos.
export const AI_DRAFT_TITLES=Object.freeze({
 recipeDraft:'Ficha técnica',
 planDraft:'Planejamento de produção',
 coverageDraft:'Solicitação de cobertura',
 productionDraft:'Registro de produção proposto',
 notificationDraft:'Notificação para revisão',
 scheduleDraft:'Proposta de escala'
});
export function draftDisplayTitle(type,title=''){
 return AI_DRAFT_TITLES[type]||String(title||'Rascunho privado').replace(/\s+/g,' ').trim().slice(0,65);
}
export function draftPromptGuidance(type){
 const label=draftDisplayTitle(type);
 return [
  'O usuário solicitou um '+label+'. Responda como um documento de RASCUNHO, sem alegar que foi publicado ou executado.',
  'Use Markdown legível e organizado nas seções: ## Objetivo, ## Itens planejados, ## Pendências, ## Revisão necessária.',
  'Na seção Itens planejados apresente somente os itens, quantidades, datas ou pessoas fornecidos ou realmente consultados, sem completar lacunas por suposição.',
  'Na seção Pendências cite apenas validações relevantes ao pedido; em Revisão necessária, destaque a necessidade de confirmação humana.',
  'Não repita a pergunta como título, não exponha nomes de coleções técnicas e não invente confirmação de aprovação.'
 ].join(' ');
}
