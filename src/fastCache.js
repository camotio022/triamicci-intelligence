// V4.4 — cache de leitura de curta duração, isolado por usuário/unidade.
// Os componentes só consultam este cache após AuthGate validar o vínculo no servidor.
// Nunca armazenar credenciais, vínculos ou permissões aqui.
const PREFIX='ti-v44:';
export function readViewCache(uid,unitId,scope) {
 if(!uid||!unitId||!scope)return null;
 try {
  const raw=sessionStorage.getItem(PREFIX+uid+':'+unitId+':'+scope);
  if(!raw)return null;
  const item=JSON.parse(raw);
  if(!item||item.version!==1||Date.now()>item.expiresAt)return null;
  return item.value??null;
 }catch{return null}
}
export function writeViewCache(uid,unitId,scope,value,ttlMs=120000) {
 if(!uid||!unitId||!scope)return;
 try {
  sessionStorage.setItem(PREFIX+uid+':'+unitId+':'+scope,JSON.stringify({
   version:1,expiresAt:Date.now()+ttlMs,value
  }));
 }catch{/* Navegação continua sem cache quando armazenamento está indisponível. */}
}
export function clearViewCache(uid) {
 if(!uid)return;
 try {
  const prefix=PREFIX+uid+':';
  for(let i=sessionStorage.length-1;i>=0;i--){
   const key=sessionStorage.key(i);
   if(key?.startsWith(prefix))sessionStorage.removeItem(key);
  }
 }catch{}
}
