import {sendQuotaError} from '../quota-error.js';
import {createHash} from 'node:crypto';
import {getDb,authenticate,membership,checkRequest,send} from '../_lib.js';
import {signalUnitChange} from '../live-signal.js';
import dailyReport from './daily-report.js';
import {validateInvestigation} from './investigation-rules.js';
const manager=role=>['admin','manager','submanager'].includes(role);
const fingerprint=r=>createHash('sha256').update(JSON.stringify(r)).digest('hex');
export default async function investigation(req,res){
 if(!checkRequest(req,res))return;
 res.setHeader('Cache-Control','no-store');
 try{
  const actor=await authenticate(req),m=await membership(actor.uid);
  if(!m?.unitId)return send(res,403,'Vínculo ativo necessário.');
  const {productId,action,allocations,expectedVersion=0,note=''}=req.body||{};
  if(!/^[a-f0-9]{40}$/.test(productId||''))return send(res,400,'Produto inválido.');
  const db=getDb(),unit=db.collection('units').doc(m.unitId);
  if(action==='investigationGet'){
   const docs=await unit.collection('inventoryInvestigations').where('productId','==',productId).limit(100).get();
   const investigations=await Promise.all(docs.docs.map(async d=>{const versions=await d.ref.collection('versions').orderBy('version','desc').limit(20).get();return {id:d.id,...d.data(),at:d.data().at?.toDate?.()?.toISOString?.(),decidedAt:d.data().decidedAt?.toDate?.()?.toISOString?.()||null,versions:versions.docs.map(v=>({...v.data(),at:v.data().at?.toDate?.()?.toISOString?.()}))};}));
   return send(res,200,'Histórico de investigação.',{investigations:investigations.sort((a,b)=>String(b.at).localeCompare(String(a.at)))});
  }
  const signal=await unit.collection('live').doc('attendance').get();
  let result,status=200;
  await dailyReport(req,{setHeader(){},status(code){status=code;return this},json(data){result=data;return this}});
  if(status!==200||!result?.complete||!result.report?.divergence)return send(res,409,'Apuração completa com divergência é necessária para investigar.');
  const report=result.report,hash=fingerprint(report),ref=unit.collection('inventoryInvestigations').doc(productId+'_'+report.currentCountId);
  if(action==='investigationSave'&&(!validateInvestigation(report,allocations)||!Number.isInteger(expectedVersion)||expectedVersion<0))return send(res,400,'Revise motivos, quantidades e justificativas. O total não pode superar a divergência; sobras exigem motivos compatíveis.');
  if(action!=='investigationSave'&&(!['investigationApprove','investigationReject'].includes(action)||!manager(m.role)||typeof note!=='string'||note.trim().length<8||note.length>400))return send(res,400,'Decisão e justificativa gerencial obrigatórias.');
  await db.runTransaction(async tx=>{
   const [member,old,currentSignal]=await Promise.all([tx.get(db.doc('memberships/'+actor.uid)),tx.get(ref),tx.get(signal.ref)]);
   if(!member.exists||member.data().status!=='active'||member.data().unitId!==m.unitId)throw Error('FORBIDDEN');
   if(currentSignal.data()?.revision!==signal.data()?.revision)throw Error('CONFLICT');
   const now=new Date();
   if(action==='investigationSave'){
    if((old.data()?.version||0)!==expectedVersion||old.data()?.status==='approved')throw Error('CONFLICT');
    const normalized=allocations.map(a=>({reason:a.reason,quantity:a.quantity,notes:a.notes.trim()}));
    const explained=normalized.reduce((n,a)=>n+a.quantity,0);
    const revision={productId,countId:report.currentCountId,reportHash:hash,report,allocations:normalized,remaining:Math.round((Math.abs(report.divergence.quantity)-explained)*1000)/1000,status:'pending',version:expectedVersion+1,actorUid:actor.uid,unitId:m.unitId,at:now};
    tx.set(ref,revision);tx.create(ref.collection('versions').doc(String(expectedVersion+1)),revision);
   }else{
    if(!manager(member.data().role))throw Error('FORBIDDEN');
    if(!old.exists||old.data().status!=='pending'||old.data().actorUid===actor.uid||old.data().reportHash!==hash||old.data().version!==expectedVersion)throw Error('CONFLICT');
    tx.update(ref,{status:action==='investigationApprove'?'approved':'rejected',decidedBy:actor.uid,decidedAt:now,note:note.trim()});
   }
   signalUnitChange(tx,db,m.unitId,['stock', 'catalog']);
   tx.create(db.collection('auditLogs').doc(),{event:action,unitId:m.unitId,actorUid:actor.uid,investigationId:ref.id,version:action==='investigationSave'?expectedVersion+1:expectedVersion,note:action==='investigationSave'?null:note.trim(),at:now,informationalOnly:true});
  });
  return send(res,200,'Investigação registrada. Nenhum saldo foi alterado.');
 }catch(e){
  if(e.message==='UNAUTHENTICATED')return send(res,401,'Faça login.');
  if(e.message==='FORBIDDEN')return send(res,403,'Sem permissão.');
  if(e.message==='CONFLICT')return send(res,409,'Os dados mudaram ou esta investigação exige revisão por outro gestor. Atualize e revise.');
  if(sendQuotaError(res,e))return;console.error('Inventory investigation:',e.message);return send(res,500,'Não foi possível registrar a investigação.');
 }
}
