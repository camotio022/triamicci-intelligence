// Apenas identidade de trabalho e horários; nunca inclui dados pessoais, avaliações ou permissões.
export function muralDirectoryEntry(id,data){
 return {id,name:data.name||'',accountUid:data.accountUid||null,sector:data.sector||'',shift:data.shift||'',
  availability:(Array.isArray(data.availability)?data.availability:[]).map(slot=>({day:slot.day,start:slot.start||null,end:slot.end||null}))};
}
