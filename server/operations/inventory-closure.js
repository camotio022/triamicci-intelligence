import {getDb,authenticate,membership,checkRequest,send} from '../_lib.js';
const productPattern=/^[a-f0-9]{40}$/;
const requestPattern=/^[a-f0-9-]{36}$/i;
const toIso=v=>v?.toDate?.()?.toISOString?.()||null;
const localDay=d=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(d);
const fail=(res,e)=>{
 const m={UNAUTHENTICATED:[401,'Faça login.'],FORBIDDEN:[403,'Acesso gerencial necessário.'],INVALID:[400,'Dados inválidos.'],NOT_FOUND:[404,'Registro não encontrado.'],CONFLICT:[409,'Contagem ou saldo mudou; atualize e solicite novamente.'],ALREADY_CLOSED:[409,'Fechamento deste dia já aprovado.']};
 if(m[e.message])return send(res,...m[e.message]);
 console.error('Inventory closure:',e.message);return send(res,500,'Não foi possível processar o fechamento.');
};
export default async function inventoryClosure(req,res) {
 if(!checkRequest(req,res))return;
 res.setHeader('Cache-Control','no-store');
 try {
  const actor=await authenticate(req);
  const membershipData=await membership(actor.uid);
  if(!membershipData?.unitId)throw Error('FORBIDDEN');
  const {action,productId,requestId,reason=''}=req.body||{};
  if(!['closeSubmit','closeApprove','closeReject','closeList'].includes(action))throw Error('INVALID');
  const db=getDb(),unit=db.collection('units').doc(membershipData.unitId);
  if(action==='closeList'){
   if(!['admin','manager'].includes(membershipData.role))throw Error('FORBIDDEN');
   const snap=await unit.collection('inventoryClosures').orderBy('submittedAt','desc').limit(40).get();
   return send(res,200,'Fechamentos consultados.',{closures:snap.docs.map(d=>{
    const x=d.data();return {...x,id:d.id,submittedAt:toIso(x.submittedAt),decidedAt:toIso(x.decidedAt)};
   }),hasMore:snap.size===40});
  }
  if(!productPattern.test(productId||'')||!requestPattern.test(requestId||''))throw Error('INVALID');
  if(typeof reason!=='string'||reason.length>240)throw Error('INVALID');
  if(action==='closeReject'&&!reason.trim())throw Error('INVALID');
  const productRef=unit.collection('products').doc(productId);
  const balanceRef=unit.collection('physicalBalances').doc(productId);
  const actorRef=db.collection('memberships').doc(actor.uid);
  const countRef=unit.collection('physicalCounts').doc(requestId);
  const now=new Date();
  let result;
  if(action==='closeSubmit') {
   await db.runTransaction(async tx=>{
    const [actorSnap,p,b,count]=await Promise.all([
     tx.get(actorRef),tx.get(productRef),tx.get(balanceRef),tx.get(countRef)]);
    const role=actorSnap.data();
    if(role?.status!=='active'||role.unitId!==membershipData.unitId)throw Error('FORBIDDEN');
    if(!p.exists||!count.exists||count.data().productId!==productId)throw Error('NOT_FOUND');
    if(!b.exists||b.data().countId!==requestId)throw Error('CONFLICT');
    const countAt=count.data().at?.toDate?.();
    if(!(countAt instanceof Date)||Number.isNaN(countAt.getTime()))throw Error('INVALID');
    const day=localDay(countAt);
    const ref=unit.collection('inventoryClosures').doc(productId+'_'+day);
    const existing=await tx.get(ref);
    if(existing.exists){
     const old=existing.data();
     if(old.countId===requestId&&old.status==='pending'){result={id:ref.id,status:'pending',duplicate:true};return;}
     if(old.status==='approved')throw Error('ALREADY_CLOSED');
     throw Error('CONFLICT');
    }
    const data={unitId:membershipData.unitId,productId,productName:p.data().name,
      day,countId:requestId,unit:count.data().unit,
      countedReserve:count.data().reserve,countedRotation:count.data().rotation,
      countedTotal:count.data().reserve+count.data().rotation,
      balanceTotalAtRequest:b.data().total,
      balanceMovementAt:toIso(b.data().lastMovementAt)||toIso(b.data().at),
      status:'pending',submittedBy:actor.uid,submittedAt:now};
    tx.create(ref,data);
    tx.create(db.collection('auditLogs').doc(),{event:'inventory.close_requested',unitId:membershipData.unitId,
      productId,countId:requestId,actorUid:actor.uid,at:now,details:{day}});
    result={id:ref.id,status:'pending',duplicate:false};
   });
  } else {
   if(!['admin','manager'].includes(membershipData.role))throw Error('FORBIDDEN');
   // O identificador de uma contagem determina a data e impede aprovar um fechamento de outro produto.
   const count=await countRef.get();
   if(!count.exists||count.data().productId!==productId)throw Error('NOT_FOUND');
   const countAt=count.data().at?.toDate?.();
   if(!countAt)throw Error('INVALID');
   const ref=unit.collection('inventoryClosures').doc(productId+'_'+localDay(countAt));
   await db.runTransaction(async tx=>{
    const [actorSnap,snap,b]=await Promise.all([tx.get(actorRef),tx.get(ref),tx.get(balanceRef)]);
    const a=actorSnap.data();
    if(a?.status!=='active'||a.unitId!==membershipData.unitId||!['admin','manager'].includes(a.role))throw Error('FORBIDDEN');
    if(!snap.exists||snap.data().countId!==requestId)throw Error('NOT_FOUND');
    const current=snap.data();
    const next=action==='closeApprove'?'approved':'rejected';
    if(current.status===next&&current.decidedBy===actor.uid&&current.reason===reason.trim()){
     result={id:ref.id,status:next,duplicate:true};return;
    }
    if(current.status!=='pending')throw Error('CONFLICT');
    if(action==='closeApprove'){
     // Só aprovar a contagem que ainda é a referência física atual, e sem novas movimentações.
     if(!b.exists||b.data().countId!==requestId||
        b.data().total!==current.balanceTotalAtRequest||
        (toIso(b.data().lastMovementAt)||toIso(b.data().at))!==current.balanceMovementAt)
       throw Error('CONFLICT');
    }
    tx.update(ref,{status:next,decidedBy:actor.uid,decidedAt:now,reason:reason.trim()});
    tx.create(db.collection('auditLogs').doc(),{event:next==='approved'?'inventory.close_approved':'inventory.close_rejected',
      unitId:membershipData.unitId,productId,countId:requestId,actorUid:actor.uid,at:now,
      details:{day:current.day,reason:reason.trim()}});
    result={id:ref.id,status:next,duplicate:false};
   });
  }
  return send(res,200,'Decisão registrada sem alterar estoque.',{closure:result});
 }catch(e){return fail(res,e);}
}
