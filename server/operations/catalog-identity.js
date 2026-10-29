// A mesma elegibilidade é usada nas consultas e nas novas movimentações.
export const OPERATIONAL_CATALOG_VERSION='56-v1';
export const belongsToOperationalCatalog=p=>p?.operationalCatalogVersion===OPERATIONAL_CATALOG_VERSION;
export const isOperationalProduct=p=>belongsToOperationalCatalog(p)&&p.status==='active';
export const normalizeProductName=name=>String(name||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().replace(/\s+/g,' ').toLocaleLowerCase('pt-BR');
// Correspondências conhecidas são candidatos à revisão, nunca migrações automáticas.
const aliases={ 'batata-noisette':['Noisettes'], 'bife-de-alcatra':['Bife de alcatra fatiado'] };
export function matchesCatalogProduct(row,candidate){
 const names=[candidate.name,...(candidate.aliases||[]),...(aliases[candidate.id]||[])].map(normalizeProductName);
 return row.catalogId===candidate.id||[row.name,...(row.aliases||[]),row.profile?.displayName,...(row.profile?.aliases||[])].filter(Boolean).some(n=>names.includes(normalizeProductName(n)));
}
export function operationalProfileFor({name,source,operationalUnit,receivingUnit},actorUid,at){
 return {displayName:name,aliases:[],controlMode:'quantitative',origin:source,countUnit:operationalUnit,
  locations:['reserva','giro'],receivingPresentation:receivingUnit||null,sourceProductIds:[],alternativeProductIds:[],
  version:1,updatedAt:at,updatedBy:actorUid};
}
