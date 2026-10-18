import {getDb,authenticate,membership,checkRequest,send} from '../../server/_lib.js';
import {validDate,validateRosterSchedule} from '../../server/schedules/rules.js';
const idOk=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(x);
const yyyyMm=x=>typeof x==='string'&&/^\d{4}-(0[1-9]|1[0-2])$/.test(x);
const iso=x=>x?.toDate?.()?.toISOString?.()||null;
const clean=d=>({id:d.id,...d.data(),createdAt:iso(d.data().createdAt),updatedAt:iso(d.data().updatedAt),publishedAt:iso(d.data().publishedAt)});
export default async function handler(req,res){
 if(!checkRequest(req,res))return;
 res.setHeader('Cache-Control','no-store');
 try{
  const actor=await authenticate(req),m=await membership(actor.uid);
  if(!m)return send(res,403,'Acesso não autorizado.');
  const db=getDb(),unit=db.collection('units').doc(m.unitId),schedules=unit.collection('schedules');
  const action=req.body?.action;
  if(action==='list'){
   const snap=await schedules.limit(120).get();
   const manager=['admin','manager'].includes(m.role);
   return send(res,200,'Escalas carregadas.',{schedules:snap.docs.filter(x=>manager||x.data().status==='published').map(clean).sort((a,b)=>String(b.period).localeCompare(String(a.period)))});
  }
  if(action==='mine'){
   const snap=await schedules.where('status','==','published').limit(100).get();
   return send(res,200,'Minha escala publicada.',{schedules:snap.docs.map(clean).map(s=>({...s,entries:(s.entries||[]).filter(e=>e.uid===actor.uid)})).filter(s=>s.entries.length)});
  }
  if(!['admin','manager'].includes(m.role))return send(res,403,'Somente gerência pode administrar escalas.');
  if(action==='saveDraft'){
   const {period,entries,title,id}=req.body||{};
   if(!yyyyMm(period)||!Array.isArray(entries)||entries.length>1000||typeof title!=='string'||title.trim().length<3||title.length>100||id&&!idOk(id))
    return send(res,400,'Período, título ou escala inválidos.');
   if(!entries.every(e=>e&&idOk(e.uid)&&validDate(e.date)&&e.date.startsWith(period)&&['work','off','leave','monthly_sunday'].includes(e.type)))
    return send(res,400,'Escala contém datas, colaboradores ou ocorrências inválidos.');
   const ref=id?schedules.doc(id):schedules.doc();
   const membersSnap=await db.collection('memberships').where('unitId','==',m.unitId).limit(201).get();
   if(membersSnap.size>200)return send(res,409,'Equipe acima do limite de planejamento.');
   const active=new Set(membersSnap.docs.filter(d=>d.data().status==='active').map(d=>d.id));
   if(entries.some(e=>!active.has(e.uid)))return send(res,400,'A escala contém colaborador não ativo na unidade.');
   const now=new Date();
   await db.runTransaction(async tx=>{
    const [actorSnap,old]=await Promise.all([tx.get(db.doc('memberships/'+actor.uid)),tx.get(ref)]);
    if(!actorSnap.exists||actorSnap.data().unitId!==m.unitId||actorSnap.data().status!=='active'||!['admin','manager'].includes(actorSnap.data().role))throw Error('FORBIDDEN');
    if(old.exists&&old.data().status!=='draft')throw Error('LOCKED');
    tx.set(ref,{title:title.trim(),period,entries:entries.map(e=>({date:e.date,uid:e.uid,type:e.type})),status:'draft',revision:(old.data()?.revision||0)+1,createdAt:old.data()?.createdAt||now,createdBy:old.data()?.createdBy||actor.uid,updatedAt:now,updatedBy:actor.uid,unitId:m.unitId});
    tx.create(db.collection('auditLogs').doc(),{event:'schedule.draft_saved',unitId:m.unitId,actorUid:actor.uid,scheduleId:ref.id,at:now});
   });
   return send(res,200,'Rascunho salvo. Ainda não está visível no Mural.',{id:ref.id});
  }
  if(['submit','approve','publish'].includes(action)){
   const id=req.body?.id;
   if(!idOk(id))return send(res,400,'Escala inválida.');
   const ref=schedules.doc(id);const snap=await ref.get();
   if(!snap.exists)return send(res,404,'Escala não encontrada.');
   if(action==='submit'&&snap.data().status!=='draft'||action==='approve'&&snap.data().status!=='in_review'||action==='publish'&&snap.data().status!=='approved')return send(res,409,'Estado atual não permite essa transição.');
   if(['approve','publish'].includes(action)&&m.role!=='admin')return send(res,403,'Aprovação e publicação exigem administrador.');
   if(action==='approve'&&snap.data().createdBy===actor.uid)return send(res,409,'Outro administrador deve aprovar a escala.');
   const memberSnap=await db.collection('memberships').where('unitId','==',m.unitId).limit(201).get();
   if(memberSnap.size>200)return send(res,409,'Equipe acima do limite.');
   const memberList=memberSnap.docs.filter(x=>x.data().status==='active').map(x=>({uid:x.id,...x.data()}));
   const profileRefs=memberList.map(x=>unit.collection('staffProfiles').doc(x.uid));
   const profiles=profileRefs.length?await db.getAll(...profileRefs):[];
   const members=memberList.map((x,i)=>({...x,professional:profiles[i]?.data()?.profile||null}));
   const issues=validateRosterSchedule({entries:snap.data().entries||[],members,period:snap.data().period,complete:true});
   if(issues.length)return send(res,409,'A escala contém conflitos de cobertura ou folgas.',{issues});
   const states={submit:'in_review',approve:'approved',publish:'published'},now=new Date();
   await db.runTransaction(async tx=>{
    const [member,current]=await Promise.all([tx.get(db.doc('memberships/'+actor.uid)),tx.get(ref)]);
    if(!member.exists||member.data().status!=='active'||member.data().unitId!==m.unitId||!['admin','manager'].includes(member.data().role))throw Error('FORBIDDEN');
    if(['approve','publish'].includes(action)&&member.data().role!=='admin')throw Error('FORBIDDEN');
    const expected={submit:'draft',approve:'in_review',publish:'approved'}[action];
    if(!current.exists||current.data().status!==expected||current.data().revision!==snap.data().revision)throw Error('CONFLICT');
    if(action==='approve'&&current.data().createdBy===actor.uid)throw Error('CONFLICT');
    tx.update(ref,{status:states[action],updatedAt:now,updatedBy:actor.uid,...(action==='publish'?{publishedAt:now,publishedBy:actor.uid}:{})});
    tx.create(db.collection('auditLogs').doc(),{event:'schedule.'+action,unitId:m.unitId,actorUid:actor.uid,scheduleId:id,at:now,revision:current.data().revision});
   });
   return send(res,200,action==='publish'?'Escala publicada no Mural.':'Escala encaminhada para próxima etapa.');
  }
  return send(res,400,'Ação inválida.');
 }catch(e){
  if(e.message==='UNAUTHENTICATED')return send(res,401,'Faça login.');
  if(e.message==='FORBIDDEN')return send(res,403,'Permissão negada.');
  if(['CONFLICT','LOCKED'].includes(e.message))return send(res,409,'A escala mudou de estado. Atualize a página.');
  console.error('Schedules:',e.message);return send(res,500,'Não foi possível concluir a operação de escala.');
 }
}
