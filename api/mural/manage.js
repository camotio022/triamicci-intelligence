import {getDb,authenticate,membership,checkRequest,send} from '../../server/_lib.js';
const idOk=s=>typeof s==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(s);
const txt=(v,max)=>typeof v==='string'&&v.trim().length>0&&v.trim().length<=max;
const serialize=d=>({id:d.id,...d.data(),createdAt:d.data().createdAt?.toDate?.()?.toISOString?.()||null,updatedAt:d.data().updatedAt?.toDate?.()?.toISOString?.()||null});
const allowedKinds=['preparation','notice'];
function normalize(v){
 if(!v||!allowedKinds.includes(v.kind)||!txt(v.title,100)||!txt(v.body,3000))return null;
 const ingredients=v.kind==='preparation'?v.ingredients:null;
 if(v.kind==='preparation'&&(!Array.isArray(ingredients)||ingredients.length<1||ingredients.length>40||
   !ingredients.every(x=>x&&txt(x.name,90)&&typeof x.amount==='number'&&x.amount>0&&x.amount<=100000&&['g','kg','ml','L','un'].includes(x.unit))))return null;
 if(v.kind==='preparation'&&(!txt(v.yieldText,100)||!Array.isArray(v.allergens)||v.allergens.length>15||!v.allergens.every(x=>txt(x,80))))return null;
 return {kind:v.kind,title:v.title.trim(),body:v.body.trim(),ingredients:ingredients?.map(x=>({name:x.name.trim(),amount:x.amount,unit:x.unit}))||[],yieldText:v.kind==='preparation'?v.yieldText.trim():'',allergens:v.kind==='preparation'?v.allergens.map(x=>x.trim()):[]};
}
export default async function handler(req,res){
 if(!checkRequest(req,res))return;res.setHeader('Cache-Control','no-store');
 try{
  const actor=await authenticate(req),m=await membership(actor.uid);
  if(!m)return send(res,403,'Acesso não autorizado.');
  const db=getDb(),unit=db.collection('units').doc(m.unitId),items=unit.collection('muralItems'),action=req.body?.action;
  if(action==='list'){
   const docs=await items.limit(150).get();
   const manager=['admin','manager'].includes(m.role);
   return send(res,200,'Mural consultado.',{items:docs.docs.filter(d=>manager||d.data().status==='published').map(serialize).sort((a,b)=>a.title.localeCompare(b.title,'pt-BR'))});
  }
  if(!['admin','manager'].includes(m.role))return send(res,403,'Sem permissão para administrar publicações.');
  if(action==='saveDraft'){
   const normalized=normalize(req.body?.item),id=req.body?.id;
   if(!normalized||id&&!idOk(id))return send(res,400,'Confira título, conteúdo, ingredientes, rendimento e alergênicos.');
   const ref=id?items.doc(id):items.doc(),now=new Date();
   await db.runTransaction(async tx=>{
    const [member,old]=await Promise.all([tx.get(db.doc('memberships/'+actor.uid)),tx.get(ref)]);
    if(!member.exists||member.data().status!=='active'||member.data().unitId!==m.unitId||!['admin','manager'].includes(member.data().role))throw Error('FORBIDDEN');
    if(old.exists&&old.data().status!=='draft')throw Error('LOCKED');
    tx.set(ref,{...normalized,status:'draft',version:(old.data()?.version||0)+1,createdAt:old.data()?.createdAt||now,createdBy:old.data()?.createdBy||actor.uid,updatedAt:now,updatedBy:actor.uid,unitId:m.unitId});
    tx.create(db.collection('auditLogs').doc(),{event:'mural.draft_saved',actorUid:actor.uid,unitId:m.unitId,at:now,itemId:ref.id});
   });
   return send(res,200,'Rascunho salvo sem publicação.',{id:ref.id});
  }
  if(action==='publish'){
   const id=req.body?.id;if(!idOk(id))return send(res,400,'Publicação inválida.');
   if(m.role!=='admin')return send(res,403,'Somente administrador pode publicar.');
   const ref=items.doc(id),now=new Date();
   await db.runTransaction(async tx=>{
    const [member,old]=await Promise.all([tx.get(db.doc('memberships/'+actor.uid)),tx.get(ref)]);
    if(!member.exists||member.data().status!=='active'||member.data().unitId!==m.unitId||member.data().role!=='admin')throw Error('FORBIDDEN');
    if(!old.exists||old.data().status!=='draft')throw Error('LOCKED');
    if(old.data().createdBy===actor.uid)throw Error('SELF_APPROVAL');
    tx.update(ref,{status:'published',publishedAt:now,publishedBy:actor.uid});
    tx.create(db.collection('auditLogs').doc(),{event:'mural.published',unitId:m.unitId,actorUid:actor.uid,itemId:id,version:old.data().version,at:now});
   });
   return send(res,200,'Conteúdo aprovado e publicado no Mural.');
  }
  return send(res,400,'Ação inválida.');
 }catch(e){
  if(e.message==='UNAUTHENTICATED')return send(res,401,'Faça login.');
  if(e.message==='FORBIDDEN')return send(res,403,'Sem permissão.');
  if(e.message==='SELF_APPROVAL')return send(res,409,'A publicação precisa ser aprovada por outro administrador.');
  if(e.message==='LOCKED')return send(res,409,'Item não encontrado ou não editável. Faça nova versão.');
  console.error('Mural:',e.message);return send(res,500,'Falha na operação do Mural.');
 }
}
