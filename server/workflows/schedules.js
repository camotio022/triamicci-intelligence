import {coverageTimeline} from '../schedules/coverage-timeline.js';
import {unitDay,publicationWindow} from '../schedules/temporal-policy.js';
import {signalUnitChange} from '../live-signal.js';
import {getDb,getAuth,authenticate,membership,checkRequest,send} from '../_lib.js';
import {validDate,validateRosterSchedule} from '../schedules/rules.js';
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
  const config=await unit.collection('configuration').doc('staffRegistry').get();const masterActive=config.data()?.active===true;
  const action=req.body?.action;
  if(action==='fixedOffList'){
   if(!['admin','manager','submanager'].includes(m.role))return send(res,403,'Apenas a gerência consulta o planejamento de folgas.');
   const snap=await unit.collection('fixedOffDays').limit(200).get();
   return send(res,200,'Folgas habituais carregadas.',{fixedOffDays:Object.fromEntries(snap.docs.map(d=>[d.id,d.data().weekday]))});
  }
  if(action==='fixedOffSet'){
   if(!['admin','manager','submanager'].includes(m.role))return send(res,403,'Apenas a gerência altera folgas habituais.');
   const {uid,weekday}=req.body||{};
   if(!idOk(uid)||!Number.isInteger(weekday)||weekday<1||weekday>4)return send(res,400,'Selecione um dia entre segunda e quinta.');
   const ref=unit.collection('fixedOffDays').doc(uid),now=new Date();
   await db.runTransaction(async tx=>{
    const [actorSnap,target,prior]=await Promise.all([tx.get(db.doc('memberships/'+actor.uid)),tx.get(db.doc('memberships/'+uid)),tx.get(ref)]);
    if(!actorSnap.exists||actorSnap.data().status!=='active'||actorSnap.data().unitId!==m.unitId||!['admin','manager','submanager'].includes(actorSnap.data().role))throw Error('FORBIDDEN');
    if(!target.exists||target.data().unitId!==m.unitId||target.data().status!=='active')throw Error('FORBIDDEN');
    tx.set(ref,{weekday,unitId:m.unitId,updatedAt:now,updatedBy:actor.uid});
    signalUnitChange(tx,db,m.unitId);
    tx.create(db.collection('auditLogs').doc(),{event:'schedule.fixed_off_changed',unitId:m.unitId,actorUid:actor.uid,targetUid:uid,previousWeekday:prior.exists?prior.data().weekday:null,weekday,at:now});
   });
   return send(res,200,'Folga habitual atualizada. Escalas publicadas não foram alteradas.');
  }
  if(action==='list'){
   const snap=await schedules.limit(120).get();
   const manager=['admin','manager','submanager'].includes(m.role);
   const records=snap.docs.filter(x=>manager||x.data().status==='published').map(clean).sort((a,b)=>String(b.period).localeCompare(String(a.period)));
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
   return send(res,200,'Minha escala publicada.',{schedules:snap.docs.map(clean).map(s=>({...s,entries:(s.entries||[]).filter(e=>myIds.has(e.uid))})).filter(s=>s.entries.length)});
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
    tx.set(lockRef,{requestsUpdatedAt:now},{merge:true});
    signalUnitChange(tx,db,m.unitId);
    tx.create(db.collection('auditLogs').doc(),{event:'leave.requested',actorUid:actor.uid,unitId:m.unitId,requestId:ref.id,at:now});
   });
   return send(res,201,'Solicitação enviada. A folga depende de aprovação.',{id:ref.id});
  }
  if(action==='leaveList'){
   const manager=['admin','manager','submanager'].includes(m.role),snap=await unit.collection('leaveRequests').orderBy('createdAt','desc').limit(100).get();
   return send(res,200,'Solicitações carregadas.',{requests:snap.docs.filter(d=>manager||d.data().uid===actor.uid).map(d=>({id:d.id,...d.data(),createdAt:iso(d.data().createdAt),decidedAt:iso(d.data().decidedAt)}))});
  }
  if(action==='leaveDecision'){
   if(!['admin','manager','submanager'].includes(m.role))return send(res,403,'Somente gerência decide solicitações.');
   const {id,decision,note}=req.body||{};
   if(!idOk(id)||!['approved','rejected'].includes(decision)||typeof note!=='string'||note.trim().length<8||note.length>400)return send(res,400,'Decisão e justificativa obrigatórias.');
   const ref=unit.collection('leaveRequests').doc(id),now=new Date();
   await db.runTransaction(async tx=>{
    const [current,old]=await Promise.all([tx.get(db.doc('memberships/'+actor.uid)),tx.get(ref)]);
    if(!current.exists||current.data().status!=='active'||current.data().unitId!==m.unitId||!['admin','manager','submanager'].includes(current.data().role))throw Error('FORBIDDEN');
    if(!old.exists||old.data().status!=='pending'||old.data().uid===actor.uid)throw Error('CONFLICT');
    tx.update(ref,{status:decision,note:note.trim(),decidedAt:now,decidedBy:actor.uid});
    tx.create(unit.collection('memberNotifications').doc(old.data().uid).collection('items').doc(),{title:'Solicitação de folga analisada',message:old.data().date+' · '+(decision==='approved'?'Aprovada':'Recusada')+'. Consulte a escala oficial para confirmar a programação.',recipientUid:old.data().uid,unitId:m.unitId,actorUid:actor.uid,at:now,read:false});
    signalUnitChange(tx,db,m.unitId);
    tx.create(db.collection('auditLogs').doc(),{event:'leave.'+decision,actorUid:actor.uid,targetUid:old.data().uid,requestId:id,unitId:m.unitId,at:now,note:note.trim()});
   });
   return send(res,200,'Decisão registrada. A escala oficial precisa ser atualizada e publicada separadamente.');
  }
  if(!['admin','manager','submanager'].includes(m.role))return send(res,403,'Somente gerência pode administrar escalas.');
  if(action==='saveDraft'){
   const {period,entries,title,id,expectedRevision}=req.body||{};
   if(!yyyyMm(period)||!Array.isArray(entries)||entries.length>1000||typeof title!=='string'||title.trim().length<3||title.length>100||id&&!idOk(id))
    return send(res,400,'Período, título ou escala inválidos.');
   if(!entries.every(e=>e&&idOk(e.uid)&&validDate(e.date)&&e.date.startsWith(period)&&['work','off','leave','monthly_sunday'].includes(e.type)))
    return send(res,400,'Escala contém datas, colaboradores ou ocorrências inválidos.');
   const ref=id?schedules.doc(id):schedules.doc();
   const membersSnap=await db.collection('memberships').where('unitId','==',m.unitId).limit(201).get();
   if(membersSnap.size>200)return send(res,409,'Equipe acima do limite de planejamento.');
   const staffSnap=await unit.collection('staffRegistry').limit(200).get();
   const active=new Set(masterActive?staffSnap.docs.filter(d=>d.data().status==='active').map(d=>d.id):membersSnap.docs.filter(d=>d.data().status==='active').map(d=>d.id));
   if(entries.some(e=>!active.has(e.uid)))return send(res,400,'A escala contém colaborador não ativo na unidade.');
   const now=new Date();let revision;
   await db.runTransaction(async tx=>{
    const [actorSnap,old]=await Promise.all([tx.get(db.doc('memberships/'+actor.uid)),tx.get(ref)]);
    if(!actorSnap.exists||actorSnap.data().unitId!==m.unitId||actorSnap.data().status!=='active'||!['admin','manager','submanager'].includes(actorSnap.data().role))throw Error('FORBIDDEN');
    if(old.exists&&old.data().status!=='draft')throw Error('LOCKED');
    if(old.exists&&old.data().revision!==expectedRevision)throw Error('CONFLICT');
    revision=(old.data()?.revision||0)+1;
    tx.set(ref,{title:title.trim(),period,entries:entries.map(e=>({date:e.date,uid:e.uid,type:e.type})),status:'draft',revision:(old.data()?.revision||0)+1,createdAt:old.data()?.createdAt||now,createdBy:old.data()?.createdBy||actor.uid,updatedAt:now,updatedBy:actor.uid,unitId:m.unitId});
    signalUnitChange(tx,db,m.unitId);
    tx.create(db.collection('auditLogs').doc(),{event:'schedule.draft_saved',unitId:m.unitId,actorUid:actor.uid,scheduleId:ref.id,at:now});
   });
   return send(res,200,'Rascunho salvo. Ainda não está visível no Mural.',{id:ref.id,revision});
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
   const registrySnap=await unit.collection('staffRegistry').limit(200).get();
   const registryList=registrySnap.docs.filter(d=>d.data().status==='active').map(d=>({uid:d.id,role:d.data().jobTitle==='Cozinheiro'?'cook':d.data().jobTitle==='Auxiliar de cozinha'?'auxiliar':'staff',status:'active',name:d.data().name,accountUid:d.data().accountUid||null,professional:{sector:d.data().sector,shift:d.data().shift,availability:d.data().availability||[],jobTitle:d.data().jobTitle,skills:d.data().skills||[],certifications:d.data().certifications||[]}}));
   const profileRefs=memberList.map(x=>unit.collection('staffProfiles').doc(x.uid));
   const profiles=profileRefs.length?await db.getAll(...profileRefs):[];
   const members=memberList.map((x,i)=>({...x,professional:profiles[i]?.data()?.profile||null}));
   const issues=validateRosterSchedule({entries:snap.data().entries||[],members:masterActive?registryList:members,period:snap.data().period,complete:true,enforceCoverage:!masterActive});
   if(issues.length)return send(res,409,'A escala contém conflitos de cobertura ou folgas.',{issues});
   const coveragePolicy=await unit.collection('configuration').doc('coverageRequirements').get();
   const requirements=coveragePolicy.data()?.requirements||[];
   if(action==='publish'&&!requirements.length)return send(res,409,'Configure mínimos por setor, horário e competência em Coberturas antes de publicar.');
   const coverageIssues=[...new Set((snap.data().entries||[]).map(e=>e.date))].flatMap(date=>coverageTimeline({date,entries:snap.data().entries||[],people:masterActive?registryList:members,requirements})).filter(r=>r.deficit>0);
   if(coverageIssues.length)return send(res,409,'Há intervalos sem cobertura mínima.',{issues:coverageIssues.slice(0,20).map(r=>r.date+' · '+r.sector+' · '+r.start+'–'+r.end+' · déficit '+r.deficit+(r.skill?' em '+r.skill:''))});
   const states={submit:'in_review',approve:'approved',publish:'published'},now=new Date();
   const lockRef=unit.collection('schedulePublicationState').doc(snap.data().period);
   await db.runTransaction(async tx=>{
    const [member,current,lock]=await Promise.all([tx.get(db.doc('memberships/'+actor.uid)),tx.get(ref),action==='publish'?tx.get(lockRef):Promise.resolve(null)]);
    const previousId=action==='publish'?lock?.data()?.activeId:null;
    const previousRef=previousId&&previousId!==id?schedules.doc(previousId):null;
    const previous=previousRef?await tx.get(previousRef):null;
    const latestPolicy=await tx.get(coveragePolicy.ref);if(JSON.stringify(latestPolicy.data()?.requirements||[])!==JSON.stringify(requirements))throw Error('CONFLICT');
    const livePeople=masterActive?await tx.get(unit.collection('staffRegistry').limit(201)):await tx.get(unit.collection('staffProfiles').limit(201));
    if(livePeople.size>200)throw Error('CONFLICT');
    const latestRegistryConfig=await tx.get(config.ref);if((latestRegistryConfig.data()?.active===true)!==masterActive)throw Error('CONFLICT');
    const currentPeople=masterActive?livePeople.docs.map(d=>({uid:d.id,...d.data(),professional:{sector:d.data().sector,availability:d.data().availability||[],certifications:d.data().certifications||[]}})):members.map(p=>({...p,professional:livePeople.docs.find(d=>d.id===p.uid)?.data()?.profile||null}));
    if(validateRosterSchedule({entries:current.data()?.entries||[],members:currentPeople.filter(p=>p.status==='active'),period:current.data()?.period,complete:true,enforceCoverage:!masterActive}).length)throw Error('CONFLICT');
    if([...new Set((current.data()?.entries||[]).map(e=>e.date))].some(date=>coverageTimeline({date,entries:current.data()?.entries||[],people:currentPeople,requirements}).some(r=>r.deficit>0)))throw Error('CONFLICT');
    if(!member.exists||member.data().status!=='active'||member.data().unitId!==m.unitId||!['admin','manager','submanager'].includes(member.data().role))throw Error('FORBIDDEN');
    if(['approve','publish'].includes(action)&&member.data().role!=='admin')throw Error('FORBIDDEN');
    const expected={submit:'draft',approve:'in_review',publish:'approved'}[action];
    if(!current.exists||current.data().status!==expected||current.data().revision!==snap.data().revision)throw Error('CONFLICT');
    if(action==='approve'&&current.data().createdBy===actor.uid)throw Error('CONFLICT');
    if(action==='publish'){
     if(!publicationWindow(current.data().period).open)throw Error('PUBLICATION_WINDOW');
     const requests=await tx.get(unit.collection('leaveRequests').where('date','>=',current.data().period+'-01').where('date','<=',current.data().period+'-31').limit(501));
     if(requests.size>500)throw Error('HISTORY_LIMIT');
     if(requests.docs.some(d=>d.data().status==='pending'))throw Error('PENDING_LEAVE');
     for(const request of requests.docs.filter(d=>d.data().status==='approved')){const r=request.data();const uid=masterActive?registryList.find(x=>x.accountUid===r.uid||x.uid===r.uid)?.uid:r.uid;if(!uid||!(current.data().entries||[]).some(e=>e.uid===uid&&e.date===r.date&&['off','leave','monthly_sunday'].includes(e.type)))throw Error('APPROVED_LEAVE_CONFLICT');}
     if(previous?.exists&&previous.data().status==='published')tx.update(previousRef,{status:'superseded',supersededAt:now,supersededBy:id});
     tx.set(lockRef,{activeId:id,unitId:m.unitId,period:current.data().period,updatedAt:now});
     for(const worker of memberList){
      const noticeRef=unit.collection('memberNotifications').doc(worker.accountUid||worker.uid).collection('items').doc();
      tx.create(noticeRef,{title:'Nova escala publicada',message:current.data().title+' · '+current.data().period,unitId:m.unitId,recipientUid:worker.accountUid||worker.uid,actorUid:actor.uid,read:false,at:now});
     }
    }
    tx.update(ref,{status:states[action],updatedAt:now,updatedBy:actor.uid,...(action==='publish'?{publishedAt:now,publishedBy:actor.uid}:{})});
    signalUnitChange(tx,db,m.unitId);
    tx.create(db.collection('auditLogs').doc(),{event:'schedule.'+action,unitId:m.unitId,actorUid:actor.uid,scheduleId:id,at:now,revision:current.data().revision});
   });
   return send(res,200,action==='publish'?'Escala publicada no Mural.':'Escala encaminhada para próxima etapa.');
  }
  return send(res,400,'Ação inválida.');
 }catch(e){
  const policyErrors={APPROVED_LEAVE_CONFLICT:'A proposta deve respeitar as folgas aprovadas antes de publicar.',MONTH_PUBLISHED:'A escala deste mês já é oficial. Use troca, cobertura ou solicite revisão gerencial.',DUPLICATE_LEAVE:'Já existe um pedido em análise nesta data.',PUBLICATION_WINDOW:'A publicação abre vinte dias antes do início do mês. Meses encerrados não podem ser publicados.',PENDING_LEAVE:'Analise os pedidos de folga pendentes antes de publicar.',HISTORY_LIMIT:'Histórico acima do limite seguro. Refine a consulta.'};
  if(policyErrors[e.message])return send(res,409,policyErrors[e.message]);
  if(e.message==='UNAUTHENTICATED')return send(res,401,'Faça login.');
  if(e.message==='FORBIDDEN')return send(res,403,'Permissão negada.');
  if(['CONFLICT','LOCKED'].includes(e.message))return send(res,409,'A escala mudou de estado. Atualize a página.');
  console.error('Schedules:',e.message);return send(res,500,'Não foi possível concluir a operação de escala.');
 }
}
