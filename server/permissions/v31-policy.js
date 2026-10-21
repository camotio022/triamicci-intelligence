// Contrato V3.1: permissões por capacidade, sempre verificadas novamente no backend.
export const MANAGEMENT_ROLES=Object.freeze(['admin','manager','submanager']);
export const TEAM_ROLES=Object.freeze([...MANAGEMENT_ROLES,'cook','auxiliar']);
const management=new Set(MANAGEMENT_ROLES),team=new Set(TEAM_ROLES);
export function can(role,capability){
 if(!team.has(role))return false;
 const managementOnly=new Set(['stock.count.official','stock.discrepancy.approve','stock.loss.approve','stock.cost.view','receiving.approve','orders.create','production.substitution.approve','attendance.correct','coverage.approve','mural.publish','reports.financial.view']);
 const teamWide=new Set(['stock.view','stock.transfer','stock.loss.report','production.record','receiving.inspect','receiving.discrepancy.report','orders.view','schedule.view','attendance.self','coverage.request','absence.status.view','history.operational.view','reports.operational.view']);
 if(managementOnly.has(capability))return management.has(role);
 if(teamWide.has(capability))return true;
 return false; // fail closed: concessões por unidade são validadas separadamente
}
export const isManagement=role=>management.has(role);
