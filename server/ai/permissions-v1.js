import {MANAGEMENT_ROLES,can} from '../permissions/v31-policy.js';

// AI-Permissions 1.0. Capabilities below authorize READ or DRAFT only.
// Runtime authorization is enforced server side, never by the LLM prompt.
export const AI_CAPABILITIES=Object.freeze({
 stock:'stock.view',production:'production.record',schedules:'schedule.view',
 attendance:'attendance.self',sessions:null,team:'schedule.view',
 receiving:'receiving.inspect',history:'history.operational.view',checklists:'history.operational.view',
 purchaseSuggestion:'stock.view',productionPriority:'production.record',
 coverageSuggestion:'schedule.view',scheduleSuggestion:'schedule.view',
 wasteSuggestion:'stock.view',photoAnalysis:null,alerts:'reports.operational.view',
 recipeDraft:null,planDraft:null,coverageDraft:null,productionDraft:null,
 notificationDraft:null,scheduleDraft:null
});
export const AI_READS=Object.freeze(['stock','production','schedules','attendance','sessions','team','receiving','history','checklists']);
export const AI_ANALYSES=Object.freeze(['purchaseSuggestion','productionPriority','coverageSuggestion','scheduleSuggestion','wasteSuggestion','photoAnalysis','alerts']);
export const AI_DRAFTS=Object.freeze(['recipeDraft','planDraft','coverageDraft','productionDraft','notificationDraft','scheduleDraft']);
export const AI_WRITES=Object.freeze([]); // No operational side effects in Phase 1
export const AI_ENABLED=()=>process.env.AI_PERMISSIONS_V1_ENABLED==='true';
export function aiAllowed(role,capability){
 if(!MANAGEMENT_ROLES.includes(role)||!Object.hasOwn(AI_CAPABILITIES,capability))return false;
 const required=AI_CAPABILITIES[capability];
 return required===null||can(role,required);
}
export function requireAiAccess(member,capability){
 return !!member?.unitId&&member.status==='active'&&aiAllowed(member.role,capability);
}
export function aiDraftType(type){return AI_DRAFTS.includes(type);}
export function aiScope(member){return member?{unitId:member.unitId,role:member.role}:null;}
