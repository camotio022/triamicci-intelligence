import {alertStaff,writeCoverageAlerts} from '../coverage/alerts.js';
import {queuePush,tryDrainPush} from '../push/delivery.js';
import {MANAGEMENT_ROLES,isManagement} from '../permissions/v31-policy.js';
import {sendQuotaError} from '../quota-error.js';
import {coverageTimeline} from '../schedules/coverage-timeline.js';
import {unitDay,publicationWindow} from '../schedules/temporal-policy.js';
import {signalUnitChange} from '../live-signal.js';
import {getDb,getAuth,authenticate,membership,checkRequest,send} from '../_lib.js';
import {validDate,validateRosterSchedule} from '../schedules/rules.js';
import {fiveTwoBoundaryConflict,fiveTwoEntries,fiveTwoWeeks,shiftScheduleDate,validateFiveTwoRoster} from '../schedules/five-two.js';
const idOk=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(x);
const yyyyMm=x=>typeof x==='string'&&/^\d{4}-(0[1-9]|1[0-2])$/.test(x);
const iso=x=>x?.toDate?.()?.toISOString?.()||null;
const clean=d=>({id:d.id,...d.data(),createdAt:iso(d.data().createdAt),updatedAt:iso(d.data().updatedAt),publishedAt:iso(d.data().publishedAt),archivedAt:iso(d.data().archivedAt)});
const outsidePlanner=({roster,...schedule})=>schedule;
function planningIssues(plan,members,enforceCoverage){
 if(plan.roster) return validateFiveTwoRoster({period:plan.period,roster:plan.roster,members,complete:true});
 return validateRosterSchedule({entries:plan.entries||[],members,period:plan.period,complete:true,enforceCoverage});
}

function leavesForPeriod(unit,period){
 return unit.collection('leaveRequests').where('date','>=',period+'-01').where('date','<=',period+'-31').limit(501);
}

async function checkPublishedBoundaries(tx,unit,plan,members){
 const weeks=fiveTwoWeeks(plan.period);
 const adjacent=new Map([[weeks[0],weeks[0].slice(0,7)],[weeks.at(-1),shiftScheduleDate(weeks.at(-1),6).slice(0,7)]]);
 for(const [week,period] of adjacent){
  if(period===plan.period)continue;
  const lock=await tx.get(unit.collection('schedulePublicationState').doc(period));
  const official=lock.data()?.activeId;
  if(!official)continue;
  const other=(await tx.get(unit.collection('schedules').doc(official))).data();
  if(fiveTwoBoundaryConflict({roster:plan.roster,otherRoster:other?.roster,week,members}))throw Error('ROSTER_BOUNDARY');
 }
}

export default async function handler(req,res){
 if(!checkRequest(req,res))return;
 res.setHeader('Cache-Control','no-store');
 try{
  const actor=await authenticate(req),m=await membership(actor.uid);
  if(!m)return send(res,403,'Acesso não autorizado.');
  const db=getDb(),unit=db.collection('units').doc(m.unitId),schedules=unit.collection('schedules');
  const config=await unit.collection('configuration').doc('staffRegistry').get();const masterActive=config.data()?.active===true;
  const action=req.body?.action;
  if(action==='fixedOffList'){
   if(!MANAGEMENT_ROLES.includes(m.role))return send(res,403,'Apenas a gerência consulta o planejamento de folgas.');
   const snap=await unit.collection('fixedOffDays').limit(200).get();
   return send(res,200,'Folgas habituais carregadas.',{fixedOffDays:Object.fromEntries(snap.docs.map(d=>[d.id,d.data().weekday]))});
  }
  if(action==='fixedOffSet'){
   if(!MANAGEMENT_ROLES.includes(m.role))return send(res,403,'Apenas a gerência altera folgas habituais.');
   const {uid,weekday}=req.body||{};
   if(!idOk(uid)||!Number.isInteger(weekday)||weekday<1||weekday>4)return send(res,400,'Selecione um dia entre segunda e quinta.');
   const ref=unit.collection('fixedOffDays').doc(uid),now=new Date();
   await db.runTransaction(async tx=>{
    const [actorSnap,target,prior]=await Promise.all([tx.get(db.doc('memberships/'+actor.uid)),tx.get(db.doc('memberships/'+uid)),tx.get(ref)]);
    if(!actorSnap.exists||actorSnap.data().status!=='active'||actorSnap.data().unitId!==m.unitId||!MANAGEMENT_ROLES.includes(actorSnap.data().role))throw Error('FORBIDDEN');
    if(!target.exists||target.data().unitId!==m.unitId||target.data().status!=='active')throw Error('FORBIDDEN');
    tx.set(ref,{weekday,unitId:m.unitId,updatedAt:now,updatedBy:actor.uid});
    signalUnitChange(tx,db,m.unitId,['schedules', 'coverage', 'notifications']);
    tx.create(db.collection('auditLogs').doc(),{event:'schedule.fixed_off_changed',unitId:m.unitId,actorUid:actor.uid,targetUid:uid,previousWeekday:prior.exists?prior.data().weekday:null,weekday,at:now});
   });
   return send(res,200,'Folga habitual atualizada. Escalas publicadas não foram alteradas.');
  }
  if(action==='list'){
   const snap=await schedules.limit(120).get();
   const manager=MANAGEMENT_ROLES.includes(m.role);
   const records=snap.docs.filter(x=>manager||x.data().status==='published').map(d=>manager?clean(d):outsidePlanner(clean(d))).sort((a,b)=>String(b.period).localeCompare(String(a.period)));
   const assigned=[...new Set(records.flatMap(r=>(r.entries||[]).map(e=>e.uid)))].slice(0,200);
   const memberships=assigned.length?await db.getAll(...assigned.map(uid=>db.collection('memberships').doc(uid))):[];
   const byId=new Map(memberships.filter(x=>x.exists&&x.data().unitId===m.unitId).map(x=>[x.id,x.data().name||'']));
   const missing=assigned.filter(uid=>!byId.get(uid));
   for(let i=0;i<missing.length;i+=100){
    const batch=await getAuth().getUsers(missing.slice(i,i+100).map(uid=>({uid})));
    for(const user of batch.users)if(!byId.has(user.uid)||!byId.get(user.uid))byId.set(user.uid,user.displayName||'Colaborador da unidade');
   }
   const registry=await unit.collection('staffRegistry').limit(200).get();
   for(const doc of registry.docs)byId.set(doc.id,doc.data().name||'Colaborador');
   return send(res,200,'Escalas carregadas.',{schedules:records.map(r=>({...r,entries:r.entries.map(e=>({...e,name:byId.get(e.uid)||'Colaborador da unidade'}))}))});
  }
  if(action==='mine'){
   const snap=await schedules.where('status','==','published').limit(100).get();
   const linked=masterActive?await unit.collection('staffRegistry').where('accountUid','==',actor.uid).limit(1).get():null;
   const myIds=new Set([actor.uid,...(linked?.docs.map(d=>d.id)||[])]);
   return send(res,200,'Minha escala publicada.',{schedules:snap.docs.map(clean).map(({roster,...s})=>({...s,entries:(s.entries||[]).filter(e=>myIds.has(e.uid))})).filter(s=>s.entries.length)});
  }
  if(action==='leaveContext'){
   const {date}=req.body||{};if(!validDate(date))return send(res,400,'Data inválida.');
   const [lock,plans,linked,requests]=await Promise.all([
    unit.collection('schedulePublicationState').doc(date.slice(0,7)).get(),
    schedules.where('status','==','published').limit(100).get(),
    unit.collection('staffRegistry').where('accountUid','==',actor.uid).limit(2).get(),
    unit.collection('leaveRequests').where('uid','==',actor.uid).limit(200).get()
   ]);
   const ids=new Set([actor.uid,...linked.docs.map(d=>d.id)]);
   const official=plans.docs.map(d=>d.data()).filter(p=>p.period===date.slice(0,7));
   const all=plans.docs.flatMap(d=>d.data().entries||[]).filter(e=>ids.has(e.uid));
   const entry=all.find(e=>e.date===date)||null;
   const nextOff=all.filter(e=>e.date>=unitDay()&&['off','leave','monthly_sunday'].includes(e.type)).sort((a,b)=>a.date.localeCompare(b.date))[0]?.date||null;
   const pending=requests.docs.some(d=>d.data().date===date&&d.data().status==='pending');
   return send(res,200,'Contexto da escala.',{entry,nextOff,pending,official:!!lock.data()?.activeId||official.length>0,publication:publicationWindow(date.slice(0,7))});
  }
  if(action==='leaveRequest'){
   const {date,reason}=req.body||{};
   if(!validDate(date)||typeof reason!=='string'||reason.trim().length<10||reason.length>400)return send(res,400,'Informe data e justificativa entre 10 e 400 caracteres.');
   if(date<new Date().toLocaleDateString('en-CA',{timeZone:'America/Sao_Paulo'}))return send(res,400,'Não é possível solicitar folga em data anterior.');
   const ref=unit.collection('leaveRequests').doc(actor.uid+'_'+date),now=new Date();
   const lockRef=unit.collection('schedulePublicationState').doc(date.slice(0,7));
   await db.runTransaction(async tx=>{
    const [current,lock,prior,official]=await Promise.all([tx.get(db.doc('memberships/'+actor.uid)),tx.get(lockRef),tx.get(ref),tx.get(schedules.where('period','==',date.slice(0,7)).limit(120))]);
    if(lock.data()?.activeId||official.docs.some(d=>d.data().status==='published'))throw Error('MONTH_PUBLISHED');
    const legacy=await tx.get(unit.collection('leaveRequests').where('uid','==',actor.uid).limit(201));
    if(legacy.size>200)throw Error('HISTORY_LIMIT');
    if(prior.exists&&prior.data().status==='pending'||legacy.docs.some(d=>d.data().date===date&&d.data().status==='pending'))throw Error('DUPLICATE_LEAVE');
    if(!current.exists||current.data().status!=='active'||current.data().unitId!==m.unitId)throw Error('FORBIDDEN');
    tx.set(ref,{uid:actor.uid,date,reason:reason.trim(),status:'pending',createdAt:now,unitId:m.unitId});
    queuePush(tx,db,m.unitId,'leave_request_'+ref.id+'_'+now.getTime(),{audience:'managers',title:'Nova solicitação de folga',page:'leave-requests'});
    tx.set(lockRef,{requestsUpdatedAt:now},{merge:true});
    signalUnitChange(tx,db,m.unitId,['schedules', 'coverage', 'notifications']);
    tx.create(db.collection('auditLogs').doc(),{event:'leave.requested',actorUid:actor.uid,unitId:m.unitId,requestId:ref.id,at:now});
   });
   await tryDrainPush(m.unitId);
   return send(res,201,'Solicitação enviada. A folga depende de aprovação.',{id:ref.id});
  }
  if(action==='leaveList'){
   const manager=MANAGEMENT_ROLES.includes(m.role),snap=await unit.collection('leaveRequests').orderBy('createdAt','desc').limit(100).get();
   return send(res,200,'Solicitações carregadas.',{requests:snap.docs.filter(d=>manager||d.data().uid===actor.uid).map(d=>({id:d.id,...d.data(),createdAt:iso(d.data().createdAt),decidedAt:iso(d.data().decidedAt)}))});
  }
  if(action==='leaveDecision'){
   if(!MANAGEMENT_ROLES.includes(m.role))return send(res,403,'Somente gerência decide solicitações.');
   const {id,decision,note}=req.body||{};
   if(!idOk(id)||!['approved','rejected'].includes(decision)||typeof note!=='string'||note.trim().length<8||note.length>400)return send(res,400,'Decisão e justificativa obrigatórias.');
   const ref=unit.collection('leaveRequests').doc(id),now=new Date();
   await db.runTransaction(async tx=>{
    const [current,old]=await Promise.all([tx.get(db.doc('memberships/'+actor.uid)),tx.get(ref)]);
    if(!current.exists||current.data().status!=='active'||current.data().unitId!==m.unitId||!MANAGEMENT_ROLES.includes(current.data().role))throw Error('FORBIDDEN');
    if(!old.exists||old.data().status!=='pending'||old.data().uid===actor.uid)throw Error('CONFLICT');
    if(decision==='approved'&&old.data().date<unitDay())throw Error('PAST_LEAVE');
    tx.update(ref,{status:decision,note:note.trim(),decidedAt:now,decidedBy:actor.uid});
    queuePush(tx,db,m.unitId,'leave_decision_'+id+'_'+now.getTime(),{uid:old.data().uid,title:'Sua solicitação de folga foi analisada',page:'leave-requests'});
    tx.create(unit.collection('memberNotifications').doc(old.data().uid).collection('items').doc('leave_decision_'+id+'_'+now.getTime()),{title:'Solicitação de folga analisada',message:old.data().date+' · '+(decision==='approved'?'Aprovada':'Recusada')+'. Consulte a escala oficial para confirmar a programação.',recipientUid:old.data().uid,unitId:m.unitId,actorUid:actor.uid,at:now,read:false});
    signalUnitChange(tx,db,m.unitId,['schedules', 'coverage', 'notifications']);
    tx.create(db.collection('auditLogs').doc(),{event:'leave.'+decision,actorUid:actor.uid,targetUid:old.data().uid,requestId:id,unitId:m.unitId,at:now,note:note.trim()});
   });
   await tryDrainPush(m.unitId);
   return send(res,200,'Decisão registrada. A escala oficial precisa ser atualizada e publicada separadamente.');
  }
  if(!MANAGEMENT_ROLES.includes(m.role))return send(res,403,'Somente gerência pode administrar escalas.');
  if(action==='recordPublishedAbsence'){
   const {planId,date,staffId,reason}=req.body||{};
   if(!isManagement(m.role))return send(res,403,'Apenas a gestão registra indisponibilidade.');
   if(!idOk(planId)||!idOk(staffId)||!validDate(date)||date<unitDay()||typeof reason!=='string'||reason.trim().length<8||reason.length>400)
    return send(res,400,'Informe uma data válida e um motivo de pelo menos 8 caracteres.');
   const now=new Date();
   const eventId=await db.runTransaction(async tx=>{
    const requests=unit.collection('leaveRequests');
    const [member,plan,person,staff,policy,leaves,prior,proposals]=await Promise.all([
     tx.get(db.doc('memberships/'+actor.uid)),tx.get(schedules.doc(planId)),tx.get(unit.collection('staffRegistry').doc(staffId)),
     tx.get(unit.collection('staffRegistry').limit(201)),tx.get(unit.collection('configuration').doc('coverageRequirements')),
     tx.get(requests.where('date','==',date).limit(201)),tx.get(unit.collection('coverageAlerts').where('planId','==',planId)),
     tx.get(unit.collection('coverageProposals').where('date','==',date).limit(201))
    ]);
    if(member.data()?.status!=='active'||member.data()?.unitId!==m.unitId||!isManagement(member.data()?.role))throw Error('FORBIDDEN');
    if(plan.data()?.status!=='published'||plan.data().archivedAt||plan.data().period!==date.slice(0,7)||person.data()?.status!=='active')throw Error('CONFLICT');
    if(staff.size>200||leaves.size>200||proposals.size>200)throw Error('HISTORY_LIMIT');
    const ids=new Set([staffId,person.data().accountUid].filter(Boolean));
    if(!plan.data().entries.some(e=>e.date===date&&e.type==='work'&&ids.has(e.uid)))throw Error('CONFLICT');
    if(leaves.docs.some(doc=>doc.data().status==='approved'&&ids.has(doc.data().uid)))return null;
    const uid=person.data().accountUid||staffId;
    const id='absence_'+staffId+'_'+date;
    tx.create(requests.doc(id),{uid,date,status:'approved',source:'published_absence',reason:reason.trim(),createdAt:now,decidedAt:now,decidedBy:actor.uid,unitId:m.unitId});
    tx.create(db.collection('auditLogs').doc(),{event:'schedule.absence_recorded',actorUid:actor.uid,unitId:m.unitId,planId,staffId,date,at:now});
    const entries=[...plan.data().entries,...leaves.docs.filter(doc=>doc.data().status==='approved').map(doc=>({uid:doc.data().uid,date,type:'leave'})),{uid,date,type:'leave'}];
    const event=writeCoverageAlerts({tx,db,unit,unitId:m.unitId,planId,dates:[date],entries,people:staff.docs.map(alertStaff),
     requirements:policy.data()?.requirements||[],policy:policy.data()?.operationalPolicy||{},prior,proposals:proposals.docs.map(doc=>doc.data()),now,reference:id,
     affected:['manha','noite'].includes(person.data().shift)?{shift:person.data().shift,sector:person.data().sector==='cozinha'?'cozinha':'frente'}:null});
    signalUnitChange(tx,db,m.unitId,['schedules','coverage','notifications']);
    return event;
   });
   if(eventId)await tryDrainPush(m.unitId,eventId);
   return send(res,200,'Indisponibilidade registrada e turno reavaliado.');
  }
  if(action==='withdrawPublication'){
   const {id,reason}=req.body||{};
   if(!isManagement(m.role))return send(res,403,'Apenas a gestão retira a publicação.');
   if(!idOk(id)||typeof reason!=='string'||reason.trim().length<8||reason.length>400)return send(res,400,'Informe o motivo da retirada (mínimo de 8 caracteres).');
   await db.runTransaction(async tx=>{
    const ref=schedules.doc(id);
    const [member,plan]=await Promise.all([tx.get(db.doc('memberships/'+actor.uid)),tx.get(ref)]);
    if(!member.exists||member.data().status!=='active'||member.data().unitId!==m.unitId||!isManagement(member.data().role))throw Error('FORBIDDEN');
    if(!plan.exists||plan.data().status!=='published'||plan.data().archivedAt)throw Error('CONFLICT');
    const {period}=plan.data(),now=new Date();
    const lockRef=unit.collection('schedulePublicationState').doc(period),lock=await tx.get(lockRef);
    const openAlerts=await tx.get(unit.collection('coverageAlerts').where('planId','==',id));
    if(lock.data()?.activeId===id)tx.set(lockRef,{activeId:null,updatedAt:now},{merge:true});
    tx.update(ref,{status:'withdrawn',withdrawnAt:now,withdrawnBy:actor.uid,withdrawalReason:reason.trim(),updatedAt:now});
    for(const alert of openAlerts.docs.filter(item=>item.data().status==='open'))tx.update(alert.ref,{status:'resolved',updatedAt:now});
    signalUnitChange(tx,db,m.unitId,['schedules','coverage','notifications']);
    tx.create(db.collection('auditLogs').doc(),{event:'schedule.withdrawn',actorUid:actor.uid,unitId:m.unitId,scheduleId:id,at:now,note:reason.trim()});
   });
   return send(res,200,'Escala retirada do Mural. Histórico preservado.');
  }
  if(action==='scheduleArchive'||action==='scheduleRestore'){
   const id=req.body?.id;if(!idOk(id))return send(res,400,'Identificador de escala inválido.');
   const ref=schedules.doc(id),now=new Date();
   let changed=false,found=false;
   await db.runTransaction(async tx=>{
    const [actorDoc,plan]=await Promise.all([tx.get(db.doc('memberships/'+actor.uid)),tx.get(ref)]);
    if(!actorDoc.exists||actorDoc.data().status!=='active'||actorDoc.data().unitId!==m.unitId||!isManagement(actorDoc.data().role))throw Error('FORBIDDEN');
    if(!plan.exists)return;found=true;
    const old=plan.data(),archived=!!old.archivedAt;
    if(action==='scheduleArchive'){
     if(archived)return;
     // An official current-month schedule is never moved to the recycle bin.
     if(old.status==='published'&&old.period>=unitDay().slice(0,7))throw Error('ACTIVE_SCHEDULE');
     const lock=await tx.get(unit.collection('schedulePublicationState').doc(old.period));
     if(lock.data()?.activeId===id)throw Error('ACTIVE_SCHEDULE');
     tx.update(ref,{archivedAt:now,archivedBy:actor.uid});
    }else{
     if(!archived)return;
     tx.update(ref,{archivedAt:null,restoredAt:now,restoredBy:actor.uid});
    }
    changed=true;signalUnitChange(tx,db,m.unitId,['schedules']);
    tx.create(db.collection('auditLogs').doc(),{event:action==='scheduleArchive'?'schedule.archived':'schedule.restored',unitId:m.unitId,actorUid:actor.uid,scheduleId:id,at:now});
   });
   if(!found)return send(res,404,'Escala não encontrada.');
   if(!changed)return send(res,409,'A escala já está nesse estado.');
   return send(res,200,action==='scheduleArchive'?'Escala movida para a lixeira.':'Escala restaurada.');
  }
  if(action==='saveDraft'){
   const {period,entries,title,id,expectedRevision,roster}=req.body||{};
   if(!yyyyMm(period)||!Array.isArray(entries)||entries.length>1000||typeof title!=='string'||title.trim().length<3||title.length>100||id&&!idOk(id))
    return send(res,400,'Período, título ou escala inválidos.');
   if(!entries.every(e=>e&&idOk(e.uid)&&validDate(e.date)&&e.date.startsWith(period)&&['work','off','leave','monthly_sunday'].includes(e.type)))
    return send(res,400,'Escala contém datas, colaboradores ou ocorrências inválidos.');
   const ref=id?schedules.doc(id):schedules.doc();
   const membersSnap=await db.collection('memberships').where('unitId','==',m.unitId).limit(201).get();
   if(membersSnap.size>200)return send(res,409,'Equipe acima do limite de planejamento.');
   const staffSnap=await unit.collection('staffRegistry').limit(200).get();
   const activeMembers=(masterActive?staffSnap:membersSnap).docs.filter(d=>d.data().status==='active').map(d=>({
    uid:d.id,name:d.data().name,accountUid:d.data().accountUid,
   }));
   const active=new Set(activeMembers.map(member=>member.uid));
   if(roster!==undefined){
    const issues=validateFiveTwoRoster({period,roster,members:activeMembers});
    if(issues.length)return send(res,400,'Quadro 5×2 inválido.',{issues});
    if(fiveTwoEntries({period,members:activeMembers,roster}).length>1000)return send(res,409,'Escala excede o limite de 1000 registros.');
   }
   if(entries.some(e=>!active.has(e.uid)))return send(res,400,'A escala contém colaborador não ativo na unidade.');
   const now=new Date();let revision;
   await db.runTransaction(async tx=>{
    const [actorSnap,old]=await Promise.all([tx.get(db.doc('memberships/'+actor.uid)),tx.get(ref)]);
    if(!actorSnap.exists||actorSnap.data().unitId!==m.unitId||actorSnap.data().status!=='active'||!MANAGEMENT_ROLES.includes(actorSnap.data().role))throw Error('FORBIDDEN');
    if(old.exists&&(old.data().status!=='draft'||old.data().archivedAt))throw Error('LOCKED');
    if(old.exists&&old.data().revision!==expectedRevision)throw Error('CONFLICT');
    if(old.exists&&Boolean(old.data().roster)!==Boolean(roster))throw Error('ROSTER_FORMAT');
    let storedEntries=entries.map(e=>({date:e.date,uid:e.uid,type:e.type}));
    if(roster){
     const requests=await tx.get(leavesForPeriod(unit,period));
     if(requests.size>500)throw Error('HISTORY_LIMIT');
     const approvedLeaves=requests.docs.map(doc=>doc.data()).filter(request=>request.status==='approved');
     storedEntries=fiveTwoEntries({period,members:activeMembers,roster,approvedLeaves});
    }
    revision=(old.data()?.revision||0)+1;
    tx.set(ref,{title:title.trim(),period,entries:storedEntries,...(roster?{roster}:{}),status:'draft',revision,createdAt:old.data()?.createdAt||now,createdBy:old.data()?.createdBy||actor.uid,updatedAt:now,updatedBy:actor.uid,unitId:m.unitId});
    signalUnitChange(tx,db,m.unitId,['schedules', 'coverage', 'notifications']);
    tx.create(db.collection('auditLogs').doc(),{event:'schedule.draft_saved',unitId:m.unitId,actorUid:actor.uid,scheduleId:ref.id,at:now});
   });
   return send(res,200,'Rascunho salvo. Ainda não está visível no Mural.',{id:ref.id,revision});
  }
  if(['submit','approve','publish'].includes(action)){
   const id=req.body?.id;
   if(!idOk(id))return send(res,400,'Escala inválida.');
   const ref=schedules.doc(id);const snap=await ref.get();
   if(!snap.exists)return send(res,404,'Escala não encontrada.');
   if(snap.data().archivedAt)return send(res,409,'Restaure a escala antes de continuar.');
   if(action==='submit'&&snap.data().status!=='draft'||action==='approve'&&snap.data().status!=='in_review'||action==='publish'&&snap.data().status!=='approved')return send(res,409,'Estado atual não permite essa transição.');
   if(['approve','publish'].includes(action)&&!isManagement(m.role))return send(res,403,'Aprovação e publicação exigem gestão da unidade.');
   if(action==='approve'&&snap.data().createdBy===actor.uid)return send(res,409,'Outro integrante da gestão deve aprovar a escala.');
   const memberSnap=await db.collection('memberships').where('unitId','==',m.unitId).limit(201).get();
   if(memberSnap.size>200)return send(res,409,'Equipe acima do limite.');
   const memberList=memberSnap.docs.filter(x=>x.data().status==='active').map(x=>({uid:x.id,...x.data()}));
   const registrySnap=await unit.collection('staffRegistry').limit(200).get();
   const registryList=registrySnap.docs.filter(d=>d.data().status==='active').map(d=>({uid:d.id,role:d.data().jobTitle==='Cozinheiro'?'cook':d.data().jobTitle==='Auxiliar de cozinha'?'auxiliar':'staff',status:'active',name:d.data().name,accountUid:d.data().accountUid||null,professional:{sector:d.data().sector,shift:d.data().shift,availability:d.data().availability||[],jobTitle:d.data().jobTitle,skills:d.data().skills||[],certifications:d.data().certifications||[]}}));
   const profileRefs=memberList.map(x=>unit.collection('staffProfiles').doc(x.uid));
   const profiles=profileRefs.length?await db.getAll(...profileRefs):[];
   const members=memberList.map((x,i)=>({...x,professional:profiles[i]?.data()?.profile||null}));
   const issues=planningIssues(snap.data(),masterActive?registryList:members,!masterActive);
   if(issues.length)return send(res,409,'A escala contém conflitos de cobertura ou folgas.',{issues});
   const coveragePolicy=await unit.collection('configuration').doc('coverageRequirements').get();
   const requirements=coveragePolicy.data()?.requirements||[];
   if(action==='publish'&&!requirements.length)return send(res,409,'Configure mínimos por setor, horário e competência em Coberturas antes de publicar.');
   const coverageIssues=[...new Set((snap.data().entries||[]).map(e=>e.date))].flatMap(date=>coverageTimeline({date,entries:snap.data().entries||[],people:masterActive?registryList:members,requirements})).filter(r=>r.deficit>0);
   if(coverageIssues.length)return send(res,409,'Há intervalos sem cobertura mínima.',{issues:coverageIssues.slice(0,20).map(r=>r.date+' · '+r.sector+' · '+r.start+'–'+r.end+' · déficit '+r.deficit+(r.skill?' em '+r.skill:''))});
   const states={submit:'in_review',approve:'approved',publish:'published'},now=new Date();
   const publicationNoticeId='schedule_'+id+'_'+now.getTime();
   const lockRef=unit.collection('schedulePublicationState').doc(snap.data().period);
   let coverageEvent=null;
   await db.runTransaction(async tx=>{
    const [member,current,lock]=await Promise.all([tx.get(db.doc('memberships/'+actor.uid)),tx.get(ref),action==='publish'?tx.get(lockRef):Promise.resolve(null)]);
    const previousId=action==='publish'?lock?.data()?.activeId:null;
    const previousRef=previousId&&previousId!==id?schedules.doc(previousId):null;
    const previous=previousRef?await tx.get(previousRef):null;
    const priorAlerts=action==='publish'?await tx.get(unit.collection('coverageAlerts').where('planId','==',id)):null;
    const previousAlerts=previousRef?await tx.get(unit.collection('coverageAlerts').where('planId','==',previousId)):null;
    const latestPolicy=await tx.get(coveragePolicy.ref);if(JSON.stringify(latestPolicy.data()?.requirements||[])!==JSON.stringify(requirements))throw Error('CONFLICT');
    const livePeople=masterActive?await tx.get(unit.collection('staffRegistry').limit(201)):await tx.get(unit.collection('staffProfiles').limit(201));
    if(livePeople.size>200)throw Error('CONFLICT');
    const latestRegistryConfig=await tx.get(config.ref);if((latestRegistryConfig.data()?.active===true)!==masterActive)throw Error('CONFLICT');
    const currentPeople=masterActive?livePeople.docs.map(d=>({uid:d.id,...d.data(),professional:{sector:d.data().sector,availability:d.data().availability||[],certifications:d.data().certifications||[]}})):members.map(p=>({...p,professional:livePeople.docs.find(d=>d.id===p.uid)?.data()?.profile||null}));
    if(planningIssues(current.data()||{},currentPeople.filter(p=>p.status==='active'),!masterActive).length)throw Error('CONFLICT');
    if([...new Set((current.data()?.entries||[]).map(e=>e.date))].some(date=>coverageTimeline({date,entries:current.data()?.entries||[],people:currentPeople,requirements}).some(r=>r.deficit>0)))throw Error('CONFLICT');
    if(!member.exists||member.data().status!=='active'||member.data().unitId!==m.unitId||!MANAGEMENT_ROLES.includes(member.data().role))throw Error('FORBIDDEN');
    if(['approve','publish'].includes(action)&&!isManagement(member.data().role))throw Error('FORBIDDEN');
    const expected={submit:'draft',approve:'in_review',publish:'approved'}[action];
    if(!current.exists||current.data().status!==expected||current.data().revision!==snap.data().revision)throw Error('CONFLICT');
    if(action==='approve'&&current.data().createdBy===actor.uid)throw Error('CONFLICT');
    if(action==='publish'){
     if(!publicationWindow(current.data().period).open)throw Error('PUBLICATION_WINDOW');
     if(current.data().roster)await checkPublishedBoundaries(tx,unit,current.data(),currentPeople.filter(p=>p.status==='active'));
     const requests=await tx.get(leavesForPeriod(unit,current.data().period));
     if(requests.size>500)throw Error('HISTORY_LIMIT');
     if(requests.docs.some(d=>d.data().status==='pending'))throw Error('PENDING_LEAVE');
     for(const request of requests.docs.filter(d=>d.data().status==='approved')){const r=request.data();const uid=masterActive?registryList.find(x=>x.accountUid===r.uid||x.uid===r.uid)?.uid:r.uid;if(!uid||!(current.data().entries||[]).some(e=>e.uid===uid&&e.date===r.date&&['off','leave','monthly_sunday'].includes(e.type)))throw Error('APPROVED_LEAVE_CONFLICT');}
     coverageEvent=writeCoverageAlerts({tx,db,unit,unitId:m.unitId,planId:id,
      dates:[...new Set(current.data().entries.map(entry=>entry.date))].filter(date=>date>=unitDay()),
      entries:current.data().entries,people:masterActive?livePeople.docs.map(alertStaff):currentPeople,
      requirements,policy:latestPolicy.data()?.operationalPolicy||{},prior:priorAlerts,now,reference:publicationNoticeId});
     for(const alert of previousAlerts?.docs||[])if(alert.data().status==='open')tx.update(alert.ref,{status:'resolved',updatedAt:now});
     if(previous?.exists&&previous.data().status==='published')tx.update(previousRef,{status:'superseded',supersededAt:now,supersededBy:id});
     tx.set(lockRef,{activeId:id,unitId:m.unitId,period:current.data().period,updatedAt:now});
     queuePush(tx,db,m.unitId,publicationNoticeId,{audience:'unit',title:'Nova escala publicada',page:'mural'});
     for(const worker of memberList){
      const noticeRef=unit.collection('memberNotifications').doc(worker.accountUid||worker.uid).collection('items').doc(publicationNoticeId);
      tx.create(noticeRef,{title:'Nova escala publicada',message:current.data().title+' · '+current.data().period,unitId:m.unitId,recipientUid:worker.accountUid||worker.uid,actorUid:actor.uid,read:false,at:now});
     }
    }
    tx.update(ref,{status:states[action],updatedAt:now,updatedBy:actor.uid,...(action==='publish'?{publishedAt:now,publishedBy:actor.uid}:{})});
    signalUnitChange(tx,db,m.unitId,['schedules', 'coverage', 'notifications']);
    tx.create(db.collection('auditLogs').doc(),{event:'schedule.'+action,unitId:m.unitId,actorUid:actor.uid,scheduleId:id,at:now,revision:current.data().revision});
   });
   if(action==='publish'){await tryDrainPush(m.unitId,publicationNoticeId);if(coverageEvent)await tryDrainPush(m.unitId,coverageEvent);}
   return send(res,200,action==='publish'?'Escala publicada no Mural.':'Escala encaminhada para próxima etapa.');
  }
  return send(res,400,'Ação inválida.');
 }catch(e){
  const policyErrors={ROSTER_BOUNDARY:'O par de folgas da semana na virada do mês precisa coincidir com a escala vizinha já publicada.',ROSTER_FORMAT:'Crie um novo rascunho para trocar o modelo de escala.',PAST_LEAVE:'A data solicitada já passou. Encerre o pedido sem aprovação e registre a justificativa.',APPROVED_LEAVE_CONFLICT:'A proposta deve respeitar as folgas aprovadas antes de publicar.',MONTH_PUBLISHED:'A escala deste mês já é oficial. Use troca, cobertura ou solicite revisão gerencial.',DUPLICATE_LEAVE:'Já existe um pedido em análise nesta data.',PUBLICATION_WINDOW:'A publicação abre vinte dias antes do início do mês. Meses encerrados não podem ser publicados.',ACTIVE_SCHEDULE:'A escala oficial em vigor está protegida e não pode ir para a lixeira.',PENDING_LEAVE:'Analise os pedidos de folga pendentes antes de publicar.',HISTORY_LIMIT:'Histórico acima do limite seguro. Refine a consulta.'};
  if(policyErrors[e.message])return send(res,409,policyErrors[e.message]);
  if(e.message==='UNAUTHENTICATED')return send(res,401,'Faça login.');
  if(e.message==='FORBIDDEN')return send(res,403,'Permissão negada.');
  if(['CONFLICT','LOCKED'].includes(e.message))return send(res,409,'A escala mudou de estado. Atualize a página.');
  if(e.code===10||e.code==='ABORTED'||e.code===3&&/Transaction is invalid or closed/i.test(e.message))return send(res,409,'Houve uma alteração simultânea. Consulte o estado atual antes de tentar novamente.');
  if(sendQuotaError(res,e))return;console.error('Schedules:',e.message);return send(res,500,'Não foi possível concluir a operação de escala.');
 }
}
