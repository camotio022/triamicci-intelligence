export const DEFAULT_DAY={start:'08:00',end:'16:20',breakStart:'14:00',breakEnd:'15:00'};
export const WORK_DAYS=['seg','ter','qua','qui','sex','sab'];
export const defaultAvailability=()=>WORK_DAYS.map(day=>({day,...DEFAULT_DAY}));
export function profileChanges(before,after){
 if(!after)return [];
 const labels={sector:'Setor',jobTitle:'Cargo operacional',skills:'Habilidades',sectorExceptions:'Exceções por setor',certifications:'Habilitações',shift:'Turno',availability:'Jornada habitual',notes:'Observações'};
 const old=before||{};
 return Object.keys(labels).filter(key=>JSON.stringify(old[key]??null)!==JSON.stringify(after[key]??null)).map(key=>labels[key]);
}
export function professionalNotice(changes){
 return changes.length?'Sua ficha profissional foi atualizada: '+changes.join(', ')+'.':'';
}
