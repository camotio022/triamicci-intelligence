import {sendQuotaError} from '../quota-error.js';
import {signalUnitChange} from '../live-signal.js';
import {getDb,authenticate,membership,checkRequest,send} from '../_lib.js';
const idOk=s=>typeof s==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(s);
const txt=(v,max)=>typeof v==='string'&&v.trim().length>0&&v.trim().length<=max;
const serialize=d=>({id:d.id,...d.data(),createdAt:d.data().createdAt?.toDate?.()?.toISOString?.()||null,updatedAt:d.data().updatedAt?.toDate?.()?.toISOString?.()||null,publishedAt:d.data().publishedAt?.toDate?.()?.toISOString?.()||null});
const allowedKinds=['preparation','notice'];
function normalize(v){
 if(!v||!allowedKinds.includes(v.kind)||!txt(v.title,100)||!txt(v.body,3000))return null;
 const ingredients=v.kind==='preparation'?v.ingredients:null;
 if(v.kind==='preparation'&&(!Array.isArray(ingredients)||ingredients.length<1||ingredients.length>40||
   !ingredients.every(x=>x&&txt(x.name,90)&&typeof x.amount==='number'&&x.amount>0&&x.amount<=100000&&['g','kg','ml','L','un'].includes(x.unit))))return null;
 if(v.kind==='preparation'&&(!txt(v.yieldText,100)||!Array.isArray(v.allergens)||v.allergens.length>15||!v.allergens.every(x=>txt(x,80))))return null;
 if(v.priority!==undefined&&!['normal','important','urgent'].includes(v.priority))return null;
 return {priority:v.priority||'normal',kind:v.kind,title:v.title.trim(),body:v.body.trim(),ingredients:ingredients?.map(x=>({name:x.name.trim(),amount:x.amount,unit:x.unit}))||[],yieldText:v.kind==='preparation'?v.yieldText.trim():'',allergens:v.kind==='preparation'?v.allergens.map(x=>x.trim()):[]};
}
export default async function handler(req,res){
 if(!checkRequest(req,res))return;res.setHeader('Cache-Control','no-store');
 try{
  const actor=await authenticate(req),m=await membership(actor.uid);
  if(!m)return send(res,403,'Acesso não autorizado.');
  const db=getDb(),unit=db.collection('units').doc(m.unitId),items=unit.collection('muralItems'),action=req.body?.action;
  if(action==='publicNotices'){
   const before=req.body?.before;if(before!==undefined&&!idOk(before))return send(res,400,'Cursor inválido.');
   let query=items.orderBy('publishedAt','desc').orderBy('__name__','desc');
   if(before){const cursor=await items.doc(before).get();if(!cursor.exists)return send(res,400,'Comunicado indisponível.');query=query.startAfter(cursor);}
   const eligible=[];let cursor=null;
   while(eligible.length<21){const page=await (cursor?query.startAfter(cursor):query).limit(100).get();for(const d of page.docs)if(d.data().kind==='notice'&&d.data().status==='published'){eligible.push(d);if(eligible.length===21)break;}if(page.size<100||eligible.length===21)break;cursor=page.docs.at(-1);}
   const published=eligible.slice(0,20).map(serialize);
   const reads=published.length?await db.getAll(...published.map(p=>unit.collection('muralReads').doc(actor.uid).collection('items').doc(p.id))):[];
   return send(res,200,'Comunicados da unidade.',{items:published.map((p,i)=>({...p,read:reads[i]?.data()?.version===p.version})),hasMore:eligible.length>20,nextCursor:eligible.length>20?eligible[19].id:null});
  }
  if(action==='noticeRead'){
   const id=req.body?.id;if(!idOk(id))return send(res,400,'Comunicado inválido.');
   await db.runTransaction(async tx=>{const [account,item]=await Promise.all([tx.get(db.doc('memberships/'+actor.uid)),tx.get(items.doc(id))]);if(!account.exists||account.data().status!=='active'||account.data().unitId!==m.unitId)throw Error('FORBIDDEN');if(!item.exists||item.data().kind!=='notice'||item.data().status!=='published')throw Error('LOCKED');tx.set(unit.collection('muralReads').doc(actor.uid).collection('items').doc(id),{version:item.data().version,readAt:new Date(),uid:actor.uid});signalUnitChange(tx,db,m.unitId,['mural']);});
   return send(res,200,'Leitura registrada.');
  }
  if(action==='list'){
   const docs=await items.limit(150).get();
   const manager=['admin','manager','submanager'].includes(m.role);
   return send(res,200,'Mural consultado.',{items:docs.docs.filter(d=>manager||d.data().status==='published').map(serialize).sort((a,b)=>a.title.localeCompare(b.title,'pt-BR'))});
  }
  if(!['admin','manager','submanager'].includes(m.role))return send(res,403,'Sem permissão para administrar publicações.');
  if(action==='saveDraft'){
   const normalized=normalize(req.body?.item),id=req.body?.id,supersedesId=req.body?.supersedesId||null;
   if(!normalized||id&&!idOk(id)||supersedesId&&!idOk(supersedesId))return send(res,400,'Confira título, conteúdo, ingredientes, rendimento e alergênicos.');
   const ref=id?items.doc(id):items.doc(),now=new Date();
   await db.runTransaction(async tx=>{
    const priorRef=supersedesId?items.doc(supersedesId):null;
    const [member,old,prior]=await Promise.all([tx.get(db.doc('memberships/'+actor.uid)),tx.get(ref),priorRef?tx.get(priorRef):Promise.resolve(null)]);
    if(!member.exists||member.data().status!=='active'||member.data().unitId!==m.unitId||!['admin','manager','submanager'].includes(member.data().role))throw Error('FORBIDDEN');
    if(old.exists&&old.data().status!=='draft')throw Error('LOCKED');
    if(supersedesId&&(!prior?.exists||prior.data().status!=='published'||prior.data().kind!==normalized.kind))throw Error('LOCKED');
    tx.set(ref,{...normalized,supersedesId:supersedesId||old.data()?.supersedesId||null,status:'draft',version:(old.data()?.version||0)+1,createdAt:old.data()?.createdAt||now,createdBy:old.data()?.createdBy||actor.uid,updatedAt:now,updatedBy:actor.uid,unitId:m.unitId});
    signalUnitChange(tx,db,m.unitId,['mural']);
    tx.create(db.collection('auditLogs').doc(),{event:'mural.draft_saved',actorUid:actor.uid,unitId:m.unitId,at:now,itemId:ref.id});
   });
   return send(res,200,'Rascunho salvo sem publicação.',{id:ref.id});
  }
  if(action==='publish'){
   const id=req.body?.id;if(!idOk(id))return send(res,400,'Publicação inválida.');
   const ref=items.doc(id),now=new Date();
   await db.runTransaction(async tx=>{
    const [member,old]=await Promise.all([tx.get(db.doc('memberships/'+actor.uid)),tx.get(ref)]);
    if(!member.exists||member.data().status!=='active'||member.data().unitId!==m.unitId||!['admin','manager','submanager'].includes(member.data().role))throw Error('FORBIDDEN');
    if(!old.exists||old.data().status!=='draft')throw Error('LOCKED');
    const priorRef=old.data().supersedesId?items.doc(old.data().supersedesId):null;
    const prior=priorRef?await tx.get(priorRef):null;
    if(priorRef&&(!prior?.exists||prior.data().status!=='published'))throw Error('LOCKED');
    if(old.data().kind==='preparation'&&member.data().role!=='admin')throw Error('FORBIDDEN');
    if(old.data().kind==='preparation'&&old.data().createdBy===actor.uid)throw Error('SELF_APPROVAL');
    if(priorRef)tx.update(priorRef,{status:'superseded',supersededAt:now,supersededBy:id});
    tx.update(ref,{status:'published',publishedAt:now,publishedBy:actor.uid,publishedByName:actor.name||'Gestão da unidade',version:prior?prior.data().version+1:old.data().version});
    signalUnitChange(tx,db,m.unitId,['mural']);
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
  if(sendQuotaError(res,e))return;console.error('Mural:',e.message);return send(res,500,'Falha na operação do Mural.');
 }
}
