import {randomUUID} from 'node:crypto';
import {getDb,authenticate,membership,checkRequest,send} from '../../server/_lib.js';
import {evaluateCoverage,paymentFor,rateRoleFor,checkDoubleShift,DEFAULT_RATES} from '../../server/coverage/engine.js';
import {validDate} from '../../server/schedules/rules.js';
const idOk=s=>typeof s==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(s);
const roles=new Set(['admin','manager']);
const validTime=s=>typeof s==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(s);
const clean=d=>({id:d.id,...d.data(),createdAt:d.data().createdAt?.toDate?.()?.toISOString?.()||null,updatedAt:d.data().updatedAt?.toDate?.()?.toISOString?.()||null});
const rateKeys=Object.keys(DEFAULT_RATES);
export default async function handler(req,res){
 if(!checkRequest(req,res))return;
 res.setHeader('Cache-Control','no-store');
 try{
  const actor=await authenticate(req),member=await membership(actor.uid);
  if(!member)return send(res,403,'Sem vínculo ativo.');
  const db=getDb(),unit=db.collection('units').doc(member.unitId),manager=roles.has(member.role),action=req.body?.action;
  const proposals=unit.collection('coverageProposals'),settings=unit.collection('configuration').doc('coverageRates'),policyRef=unit.collection('configuration').doc('coverageRequirements');
  if(action==='dashboard'){
   if(!manager)return send(res,403,'Apenas gerência.');
   const [peopleSnap,plansSnap,rateSnap,proposalSnap,policySnap]=await Promise.all([
    unit.collection('staffRegistry').limit(200).get(),unit.collection('schedules').limit(120).get(),settings.get(),proposals.limit(100).get(),policyRef.get()
   ]);
   const people=peopleSnap.docs.map(d=>({uid:d.id,...d.data(),professional:{sector:d.data().sector,jobTitle:d.data().jobTitle,shift:d.data().shift,skills:d.data().skills||[],certifications:d.data().certifications||[]}}));
   const plans=plansSnap.docs.map(d=>({id:d.id,...d.data()}));
   return send(res,200,'Painel de cobertura carregado.',{people,plans:plans.map(p=>({id:p.id,title:p.title,period:p.period,status:p.status,entries:p.entries||[]})),
    rates:{...DEFAULT_RATES,...(rateSnap.data()?.rates||{})},requirements:policySnap.data()?.requirements||[],
    proposals:proposalSnap.docs.map(clean).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt))),
    note:'Simulação não substitui validação de jornada e folha.'});
  }
  if(action==='myProposals'){
   const snap=await proposals.limit(100).get();
   const linked=await unit.collection('staffRegistry').where('accountUid','==',actor.uid).limit(1).get();
   const ids=new Set([actor.uid,...linked.docs.map(d=>d.id)]);
   return send(res,200,'Propostas consultadas.',{proposals:snap.docs.filter(d=>ids.has(d.data().staffId)).map(clean)});
  }
  if(action==='respond'){
   const {id,decision}=req.body||{};
   if(!idOk(id)||!['accepted','declined'].includes(decision))return send(res,400,'Resposta inválida.');
   const ref=proposals.doc(id),now=new Date();
   await db.runTransaction(async tx=>{
    const [m,p]=await Promise.all([tx.get(db.collection('memberships').doc(actor.uid)),tx.get(ref)]);
    if(!m.exists||m.data().status!=='active'||m.data().unitId!==member.unitId||!p.exists||p.data().status!=='pending_acceptance')throw Error('CONFLICT');
    const person=await tx.get(unit.collection('staffRegistry').doc(p.data().staffId));
    if(!person.exists||person.data().status!=='active'||person.data().accountUid!==actor.uid)throw Error('FORBIDDEN');
    tx.update(ref,{status:decision==='accepted'?'pending_approval':'declined',...(decision==='accepted'?{acceptedAt:now}:{declinedAt:now}),updatedAt:now,respondedBy:actor.uid});
    tx.create(db.collection('auditLogs').doc(),{event:'coverage.'+decision,proposalId:id,unitId:member.unitId,actorUid:actor.uid,at:now});
   });
   return send(res,200,'Resposta registrada. A escala publicada não foi alterada.');
  }
  if(!manager)return send(res,403,'Somente gerência.');
  if(action==='requirementsSet'){
   if(member.role!=='admin')return send(res,403,'Somente administradores configuram mínimos de cobertura.');
   const requirements=req.body?.requirements;
   const valid=r=>r&&['cozinha','frente','caixa','apoio','gestao'].includes(r.sector)&&Number.isInteger(r.weekday)&&r.weekday>=0&&r.weekday<=6&&validTime(r.start)&&validTime(r.end)&&r.start<r.end&&Number.isInteger(r.minimum)&&r.minimum>=1&&r.minimum<=30&&typeof r.skill==='string'&&r.skill.length<=40;
   if(!Array.isArray(requirements)||requirements.length>84||!requirements.every(valid))return send(res,400,'Regras de cobertura inválidas.');
   const clean=requirements.map(r=>({sector:r.sector,weekday:r.weekday,start:r.start,end:r.end,minimum:r.minimum,skill:r.skill.trim().toLowerCase()}));
   const now=new Date();
   await db.runTransaction(async tx=>{
    const m=await tx.get(db.collection('memberships').doc(actor.uid));
    if(!m.exists||m.data().status!=='active'||m.data().unitId!==member.unitId||m.data().role!=='admin')throw Error('FORBIDDEN');
    tx.set(policyRef,{requirements:clean,updatedAt:now,updatedBy:actor.uid});
    tx.create(db.collection('auditLogs').doc(),{event:'coverage.requirements_updated',actorUid:actor.uid,unitId:member.unitId,count:clean.length,at:now});
   });
   return send(res,200,'Regras de cobertura salvas. Escalas publicadas preservadas.');
  }
  if(action==='rates'){
   if(member.role!=='admin')return send(res,403,'Somente administradores alteram valores.');
   const rates=req.body?.rates;
   if(!rates||rateKeys.some(k=>!Number.isInteger(rates[k])||rates[k]<0||rates[k]>10000))return send(res,400,'Valores inválidos.');
   const updated=Object.fromEntries(rateKeys.map(k=>[k,rates[k]]));const now=new Date();
   await db.runTransaction(async tx=>{
    const m=await tx.get(db.collection('memberships').doc(actor.uid));
    if(!m.exists||m.data().status!=='active'||m.data().role!=='admin'||m.data().unitId!==member.unitId)throw Error('FORBIDDEN');
    tx.set(settings,{rates:updated,updatedAt:now,updatedBy:actor.uid});
    tx.create(db.collection('auditLogs').doc(),{event:'coverage.rates_updated',unitId:member.unitId,actorUid:actor.uid,rates:updated,at:now});
   });
   return send(res,200,'Tabela operacional atualizada; históricos preservados.');
  }
  if(action==='simulate'){
   const {planId,date,sector,requiredSkill,required,windowStart='',windowEnd=''}=req.body||{};
   if(!idOk(planId)||!validDate(date)||typeof sector!=='string'||!['cozinha','frente','caixa','apoio','gestao'].includes(sector)||typeof requiredSkill!=='string'||requiredSkill.length>40||!Number.isInteger(required)||required<1||required>30||!validTime(windowStart)||!validTime(windowEnd)||windowEnd<=windowStart)return send(res,400,'Parâmetros ou faixa de horário inválidos.');
   const [plan,peopleSnap,rateSnap]=await Promise.all([unit.collection('schedules').doc(planId).get(),unit.collection('staffRegistry').limit(200).get(),settings.get()]);
   if(!plan.exists||!date.startsWith(plan.data().period))return send(res,404,'Escala não encontrada para esta data.');
   const people=peopleSnap.docs.map(d=>({uid:d.id,...d.data(),professional:{sector:d.data().sector,availability:d.data().availability||[],certifications:d.data().certifications||[]}}));
   const result=evaluateCoverage({people,entries:plan.data().entries||[],date,sector,requiredSkill,required,windowStart,windowEnd});
   const rates={...DEFAULT_RATES,...(rateSnap.data()?.rates||{})};
   result.candidates=result.candidates.map(p=>{const person=people.find(x=>x.uid===p.uid);return {...p,estimatedPracticePayment:paymentFor({paymentRole:rateRoleFor(person)},rates)}});
   return send(res,200,'Simulação produzida sem alterar a escala.',{simulation:result});
  }
  if(action==='propose'){
   const {staffId,date,first,second,external=false,reason,rateRole}=req.body||{};
   if(!idOk(staffId)||!validDate(date)||typeof reason!=='string'||reason.trim().length<10||reason.length>500||typeof external!=='boolean'||!rateKeys.includes(rateRole)||!first||!second||![first.start,first.end,second.start,second.end].every(validTime))return send(res,400,'Proposta incompleta.');
   const review=checkDoubleShift({first,second});
   if(review.state==='blocked')return send(res,409,'A proposta contém restrições impeditivas de jornada.',{issues:review.reasons});
   const ref=unit.collection('staffRegistry').doc(staffId),person=await ref.get();
   if(!person.exists||person.data().status!=='active')return send(res,404,'Colaborador inativo ou não encontrado.');
   if(external&&rateRole!=='external'||!external&&rateRole==='external')return send(res,400,'Categoria externa inconsistente.');
   if(!external&&rateRole!==rateRoleFor(person.data()))return send(res,409,'Categoria divergente do cargo cadastrado. Atualize a ficha do colaborador antes de calcular a dobra.');
   const ratesSnap=await settings.get(),rates={...DEFAULT_RATES,...(ratesSnap.data()?.rates||{})};
   const payment=paymentFor({paymentRole:rateRole,external},rates);
   const now=new Date(),id=randomUUID(),proposal=proposals.doc(id);
   await db.runTransaction(async tx=>{
    const m=await tx.get(db.collection('memberships').doc(actor.uid));
    if(!m.exists||m.data().status!=='active'||m.data().unitId!==member.unitId||!roles.has(m.data().role))throw Error('FORBIDDEN');
    tx.create(proposal,{staffId,name:person.data().name||'',date,first,second,external,rateRole,reason:reason.trim(),practicePayment:payment,
      legalEstimate:null,legalValidated:false,reviewReasons:review.reasons,status:person.data().accountUid?'pending_acceptance':'pending_approval',consentPending:!person.data().accountUid,
      createdAt:now,updatedAt:now,createdBy:actor.uid,unitId:member.unitId});
    tx.create(db.collection('auditLogs').doc(),{event:'coverage.proposed',unitId:member.unitId,proposalId:id,actorUid:actor.uid,at:now,practicePayment:payment});
   });
   return send(res,201,'Proposta registrada; depende de aceite, verificação trabalhista e aprovação.',{id});
  }
  if(action==='decide'){
   const {id,decision,note,legalChecked,consentVerified}=req.body||{};
   if(!idOk(id)||!['approved','rejected','cancelled'].includes(decision)||typeof note!=='string'||note.trim().length<10||note.length>500)return send(res,400,'Decisão e justificativa obrigatórias.');
   if(decision==='approved'&&(legalChecked!==true||consentVerified!==true))return send(res,409,'Confirme validação trabalhista e consentimento antes de aprovar.');
   const ref=proposals.doc(id),now=new Date();
   await db.runTransaction(async tx=>{
    const [m,p]=await Promise.all([tx.get(db.collection('memberships').doc(actor.uid)),tx.get(ref)]);
    if(!m.exists||m.data().status!=='active'||m.data().unitId!==member.unitId||!roles.has(m.data().role))throw Error('FORBIDDEN');
    if(!p.exists||!['pending_approval','pending_acceptance'].includes(p.data().status)||decision==='approved'&&p.data().status!=='pending_approval')throw Error('CONFLICT');
    if(decision==='approved'&&p.data().createdBy===actor.uid)throw Error('SELF_APPROVAL');
    if(decision==='approved'&&p.data().consentPending!==true&&!p.data().acceptedAt)throw Error('CONSENT_REQUIRED');
    if(decision==='approved'){
     const currentPerson=await tx.get(unit.collection('staffRegistry').doc(p.data().staffId));
     if(!currentPerson.exists||currentPerson.data().status!=='active')throw Error('CONFLICT');
    }
    tx.update(ref,{status:decision,decisionNote:note.trim(),legalValidated:false,legalReviewConfirmed:decision==='approved',consentVerified:decision==='approved',decidedBy:actor.uid,decidedAt:now,updatedAt:now});
    tx.create(db.collection('auditLogs').doc(),{event:'coverage.'+decision,unitId:member.unitId,proposalId:id,actorUid:actor.uid,at:now,note:note.trim()});
   });
   return send(res,200,'Decisão registrada. Aprovação não altera automaticamente a escala oficial.');
  }
  return send(res,400,'Ação desconhecida.');
 }catch(e){
  if(e.message==='UNAUTHENTICATED')return send(res,401,'Faça login novamente.');
  if(e.message==='FORBIDDEN')return send(res,403,'Operação não autorizada.');
  if(e.message==='CONFLICT')return send(res,409,'A proposta foi alterada ou está indisponível.');
  if(e.message==='SELF_APPROVAL')return send(res,403,'Quem criou a proposta não pode aprová-la.');
  if(e.message==='CONSENT_REQUIRED')return send(res,409,'A proposta exige aceite registrado pelo colaborador.');
  console.error('Coverage workflow:',e.message);return send(res,500,'Não foi possível concluir a operação.');
 }
}
