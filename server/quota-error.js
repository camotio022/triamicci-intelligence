export function isQuotaError(error){
 return error?.code===8||error?.code==='resource-exhausted'||/RESOURCE_EXHAUSTED|Quota exceeded/i.test(String(error?.message||''));
}
export function sendQuotaError(res,error){
 if(!isQuotaError(error))return false;
 console.warn('Firestore quota exhausted; requests should pause before retrying.');
 res.setHeader('Retry-After','60');
 res.status(503).json({code:'DATA_QUOTA_EXHAUSTED',message:'Consulta temporariamente indisponível: o banco atingiu o limite de uso. Tente novamente mais tarde.'});
 return true;
}
