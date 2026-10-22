import {signalUnitChange} from '../../live-signal.js';
// Cadastro de apresentações por unidade. Não altera saldo, lote ou histórico.
import {getDb,authenticate,membership,checkRequest,send} from '../../_lib.js';
import {isPresentation,unitInfo} from '../unit-engine.js';
const productPattern=/^[a-f0-9]{40}$/;
const fixedRule=r=>r&&isPresentation(r.presentation)&&r.fixed===true&&r.validated===true&&
 typeof r.contentQuantity==='number'&&Number.isFinite(r.contentQuantity)&&r.contentQuantity>0&&r.contentQuantity<=1e6&&
 !!unitInfo(r.contentUnit)&&typeof r.evidence==='string'&&r.evidence.trim().length>=8&&r.evidence.length<=240;
export function validateCountingMethod(method,packages){
 if(!method||method.kind==='base')return {ok:true,method:{kind:'base'}};
 if(method.kind!=='packages'||!isPresentation(method.presentation)||!Array.isArray(packages)||!packages.some(p=>p.presentation===method.presentation))return {ok:false,reason:'INVALID_COUNTING_METHOD'};
 return {ok:true,method:{kind:'packages',presentation:method.presentation,trackOpen:method.trackOpen===true}};
}
const cleanText=s=>typeof s==='string'?s.trim():'';
export function validatePackageConfiguration(input){
 if(!input||!Array.isArray(input.packages)||input.packages.length>12)return {ok:false,reason:'INVALID_PACKAGES'};
 const codes=new Set();
 for(const p of input.packages){
  if(!p||!isPresentation(p.presentation)||codes.has(p.presentation))return {ok:false,reason:'DUPLICATE_OR_INVALID_PRESENTATION'};
  codes.add(p.presentation);
  if(typeof p.fixed!=='boolean'||typeof p.validated!=='boolean')return {ok:false,reason:'INVALID_FLAGS'};
  if(p.validated&&!fixedRule(p))return {ok:false,reason:'MISSING_EVIDENCE_OR_CONTENT'};
  if(!p.validated&&(p.contentQuantity!==null&&p.contentQuantity!==undefined||p.contentUnit!==null&&p.contentUnit!==undefined))return {ok:false,reason:'UNVERIFIED_CONTENT'};
  if(!p.validated&&p.fixed)return {ok:false,reason:'UNVERIFIED_FIXED'};
  if(p.evidence!==undefined&&p.evidence!==null&&(typeof p.evidence!=='string'||p.evidence.length>240))return {ok:false,reason:'INVALID_EVIDENCE'};
 }
 return {ok:true,packages:input.packages.map(p=>({presentation:p.presentation,fixed:p.fixed,validated:p.validated,contentQuantity:p.validated?p.contentQuantity:null,contentUnit:p.validated?p.contentUnit:null,evidence:p.validated?p.evidence.trim():null}))};
}
export default async function handler(req,res){
 if(!checkRequest(req,res))return;
 res.setHeader('Cache-Control','no-store');
 try{
  const actor=await authenticate(req),member=await membership(actor.uid);
  if(!member?.unitId)return send(res,403,'Vínculo ativo necessário.');
  const {action,productId}=req.body||{};
  if(!productPattern.test(productId||''))return send(res,400,'Produto inválido.');
  const db=getDb(),unit=db.collection('units').doc(member.unitId);
  const productRef=unit.collection('products').doc(productId),profileRef=unit.collection('measurementProfiles').doc(productId);
  if(action==='get'){
   const [product,profile]=await Promise.all([productRef.get(),profileRef.get()]);
   if(!product.exists)return send(res,404,'Produto não encontrado.');
   return send(res,200,'Apresentações consultadas.',{profile:profile.exists?{...profile.data(),updatedAt:profile.data().updatedAt?.toDate?.()?.toISOString?.()||null}:null});
  }
  if(action!=='save')return send(res,400,'Ação inválida.');
  if(!['admin','manager'].includes(member.role))return send(res,403,'Somente gerência pode configurar apresentações.');
  const validated=validatePackageConfiguration(req.body);
  if(!validated.ok)return send(res,400,'Confira apresentações e evidências: '+validated.reason);
  const countValidation=validateCountingMethod(req.body.countingMethod,validated.packages);
  if(!countValidation.ok)return send(res,400,'Método de contagem incompatível com as apresentações cadastradas.');
  const note=cleanText(req.body.note);
  if(note.length>240)return send(res,400,'Observação muito longa.');
  let version;
  await db.runTransaction(async tx=>{
   const [memberSnap,product,old]=await Promise.all([tx.get(db.doc('memberships/'+actor.uid)),tx.get(productRef),tx.get(profileRef)]);
   const active=memberSnap.data();
   if(!active||active.status!=='active'||active.unitId!==member.unitId||!['admin','manager'].includes(active.role))throw Error('FORBIDDEN');
   if(!product.exists||product.data().status!=='active')throw Error('PRODUCT_NOT_FOUND');
   const oldVersion=old.exists?(old.data().version||0):0;
   if(req.body.expectedVersion!==oldVersion)throw Error('CONFLICT');
   version=oldVersion+1;
   const now=new Date();
   const record={version,packages:validated.packages,countingMethod:countValidation.method,note,updatedAt:now,updatedBy:actor.uid,
    stockUnitAtReview:product.data().operationalUnitOverride||product.data().operationalUnit||product.data().unit};
   tx.set(profileRef,record);
   signalUnitChange(tx,db,member.unitId);
   tx.create(db.collection('auditLogs').doc(),{event:'product.measurement_profile_saved',unitId:member.unitId,productId,actorUid:actor.uid,at:now,
     before:old.exists?{version:oldVersion,packages:old.data().packages||[]}:null,after:{version,packages:validated.packages,countingMethod:countValidation.method},note});
  });
  return send(res,200,'Apresentações salvas sem alterar o estoque.',{version});
 }catch(e){
  if(e.message==='UNAUTHENTICATED')return send(res,401,'Faça login.');
  if(e.message==='FORBIDDEN')return send(res,403,'Sem permissão.');
  if(e.message==='PRODUCT_NOT_FOUND')return send(res,404,'Produto não encontrado ou inativo.');
  if(e.message==='CONFLICT')return send(res,409,'Outra pessoa atualizou as apresentações. Recarregue antes de salvar.');
  console.error('measurementProfiles:',e.message);return send(res,500,'Não foi possível salvar as apresentações.');
 }
}
