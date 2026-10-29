import {sendQuotaError} from '../../server/quota-error.js';
import {signalUnitChange} from '../../server/live-signal.js';
import {staffSeed,reconcileStaff,normalizeStaffName,defaultStaffAvailability} from '../../server/team/master-registry.js';
import schedulesWorkflow from '../../server/workflows/schedules.js';
import attendanceWorkflow from '../../server/workflows/attendance-v31.js';
import muralWorkflow from '../../server/workflows/mural.js';
import labelsWorkflow from '../../server/workflows/labels.js';
import {createHash,randomUUID} from 'node:crypto';
import {validateRosterEntry} from '../../server/team/roster-rules.js';
import {validatePersonalProfile,earnedRecognition} from '../../server/team/personal-rules.js';
import {profileChanges,professionalNotice} from '../../server/team/ux-rules.js';
import {validateProfessionalProfile,canManageProfessionalProfile,invalidNewSectorSkills,eligibleSkills} from '../../server/team/profile-rules.js';
import { getDb, getAuth, authenticate, membership, roles, checkRequest, send } from '../../server/_lib.js';

const statuses = ['active','inactive'];
const cleanMember = (doc) => {
  const data = doc.data();
  return {
    uid:doc.id,
    email:typeof data.email === 'string' ? data.email : '',
    name:typeof data.name === 'string' ? data.name : '',
    unitId:data.unitId,
    role:data.role,
    status:data.status,
    createdAt:data.createdAt?.toDate?.()?.toISOString?.() || null
  };
};

export default async function handler(req,res) {
  if(req.body?.module==='schedules')return schedulesWorkflow(req,res);
  if(req.body?.module==='attendanceV31')return attendanceWorkflow(req,res);
  if(req.body?.module==='mural')return muralWorkflow(req,res);
  if(req.body?.module==='labels')return labelsWorkflow(req,res);
  if (!checkRequest(req,res)) return;
  res.setHeader('Cache-Control','no-store');
  try {
    const actor = await authenticate(req);
    const actingMember = await membership(actor.uid);
    if (!actingMember) return send(res,403,'Sem vínculo ativo.');

    const { action } = req.body || {};
    const db = getDb();
    const writePersonal=async(ref,data)=>db.runTransaction(async tx=>{const current=await tx.get(db.doc('memberships/'+actor.uid));if(!current.exists||current.data().status!=='active'||current.data().unitId!==actingMember.unitId)throw Error('FORBIDDEN');tx.set(ref,data,{merge:true});signalUnitChange(tx,db,actingMember.unitId,['team', 'profile', 'schedules', 'notifications'])});
    if(action==='masterRegistryActivate'){
      if(!['admin','manager','submanager'].includes(actingMember.role))return send(res,403,'Apenas gerência ativa o Cadastro Mestre.');
      if(req.body?.confirm!==true)return send(res,400,'Confirmação obrigatória.');
      const unit=db.collection('units').doc(actingMember.unitId),snap=await unit.collection('staffRegistry').limit(200).get();
      const active=snap.docs.filter(d=>d.data().status==='active');
      const missing=staffSeed.filter(seed=>active.filter(d=>normalizeStaffName(d.data().name)===normalizeStaffName(seed.name)).length!==1);
      if(missing.length)return send(res,409,'Fichas incompletas ou duplicadas. Resolva antes da ativação.',{missing:missing.map(p=>p.name)});
      const links=active.map(d=>d.data().accountUid).filter(Boolean);
      if(new Set(links).size!==links.length)return send(res,409,'Há contas associadas a mais de uma ficha.');
      const now=new Date(),ref=unit.collection('configuration').doc('staffRegistry');
      await db.runTransaction(async tx=>{
        const a=await tx.get(db.collection('memberships').doc(actor.uid));
        if(!a.exists||a.data().status!=='active'||a.data().unitId!==actingMember.unitId||!['admin','manager','submanager'].includes(a.data().role))throw Error('FORBIDDEN');
        tx.set(ref,{active:true,activatedAt:now,activatedBy:actor.uid,updatedAt:now});
        signalUnitChange(tx,db,actingMember.unitId,['team', 'profile', 'schedules', 'notifications']);
        tx.create(db.collection('auditLogs').doc(),{event:'staff.registry_activated',unitId:actingMember.unitId,actorUid:actor.uid,at:now,activeCount:active.length});
      });
      return send(res,200,'Cadastro Mestre ativado para novas escalas. Históricos preservados.');
    }
    if(action==='masterRegistryClaim'){
      const id=req.body?.id;
      if(typeof id!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(id))return send(res,400,'Ficha inválida.');
      const unit=db.collection('units').doc(actingMember.unitId),ref=unit.collection('staffRegistry').doc(id);
      const request=unit.collection('staffRegistryClaims').doc(id+'_'+actor.uid);
      const person=await ref.get();
      const seed=staffSeed.find(p=>'staff_'+createHash('sha256').update(normalizeStaffName(p.name)).digest('hex').slice(0,40)===id);
      if(person.exists&&(person.data().status!=='active'||person.data().accountUid)||!person.exists&&!seed)return send(res,409,'Ficha indisponível para solicitação.');
      await request.set({registryId:id,accountUid:actor.uid,status:'pending',createdAt:new Date(),requestedBy:actor.uid,unitId:actingMember.unitId});
      return send(res,200,'Solicitação enviada à gerência. O vínculo ainda não foi feito.');
    }
    if(action==='masterRegistryLink'){
      if(!['admin','manager','submanager'].includes(actingMember.role))return send(res,403,'Somente gerência confirma vínculos.');
      const {id,uid}=req.body||{};
      if(typeof id!=='string'||!(/^[A-Za-z0-9_-]{1,128}$/).test(id)||typeof uid!=='string'||!(/^[A-Za-z0-9_-]{1,128}$/).test(uid))return send(res,400,'Identificadores inválidos.');
      const unit=db.collection('units').doc(actingMember.unitId),ref=unit.collection('staffRegistry').doc(id),claim=unit.collection('staffRegistryClaims').doc(id+'_'+uid),account=db.collection('memberships').doc(uid);
      const other=await unit.collection('staffRegistry').where('accountUid','==',uid).limit(1).get();
      const linkLock=unit.collection('staffRegistryLinks').doc(uid);
      const seed=staffSeed.find(p=>'staff_'+createHash('sha256').update(normalizeStaffName(p.name)).digest('hex').slice(0,40)===id);
      if(!other.empty&&other.docs[0].id!==id)return send(res,409,'Conta já vinculada a outra ficha.');
      const now=new Date();
      await db.runTransaction(async tx=>{
        const [p,q,a,lock]=await Promise.all([tx.get(ref),tx.get(claim),tx.get(account),tx.get(linkLock)]);
        if(lock.exists&&lock.data().registryId!==id||(!p.exists&&!seed)||(p.exists&&(p.data().status!=='active'||p.data().accountUid))||!q.exists||q.data().status!=='pending'||q.data().accountUid!==uid||!a.exists||a.data().unitId!==actingMember.unitId||a.data().status!=='active')throw Error('CONFLICT');
        if(p.exists)tx.update(ref,{accountUid:uid,linkedAt:now,linkedBy:actor.uid,updatedAt:now});
        else tx.create(ref,{...seed,availability:defaultStaffAvailability(seed.shift,seed.fixedWeekday),normalizedName:normalizeStaffName(seed.name),status:'active',skills:[],certifications:[],accountUid:uid,linkedAt:now,linkedBy:actor.uid,createdAt:now,createdBy:actor.uid,updatedAt:now,source:'levantamento_escala_2026'});
        if(!lock.exists)tx.create(linkLock,{registryId:id,accountUid:uid,linkedAt:now,linkedBy:actor.uid});
        tx.update(claim,{status:'approved',reviewedAt:now,reviewedBy:actor.uid});
        signalUnitChange(tx,db,actingMember.unitId,['team', 'profile', 'schedules', 'notifications']);
        tx.create(db.collection('auditLogs').doc(),{event:'staff.registry_account_linked',unitId:actingMember.unitId,actorUid:actor.uid,targetUid:uid,registryId:id,at:now});
      });
      return send(res,200,'Vínculo confirmado sem alterar permissões de acesso.');
    }
    if(action==='masterRegistryClaims'){
      if(!['admin','manager','submanager'].includes(actingMember.role))return send(res,403,'Sem permissão.');
      const snap=await db.collection('units').doc(actingMember.unitId).collection('staffRegistryClaims').limit(200).get();
      return send(res,200,'Solicitações de vínculo carregadas.',{claims:snap.docs.filter(d=>d.data().status==='pending').map(d=>({id:d.id,...d.data(),createdAt:d.data().createdAt?.toDate?.()?.toISOString?.()||null}))});
    }
    if(action==='masterRegistryUpdate'){
      if(!['admin','manager','submanager'].includes(actingMember.role))return send(res,403,'Apenas gerência edita fichas.');
      const {id,changes}=req.body||{};
      if(typeof id!=='string'||!(/^[A-Za-z0-9_-]{1,128}$/).test(id)||!changes||typeof changes!=='object'||Array.isArray(changes))return send(res,400,'Dados inválidos.');
      const allowed=['jobTitle','sector','shift','fixedWeekday','status','skills','certifications','availability','notes'];
      if(!Object.keys(changes).length||Object.keys(changes).some(k=>!allowed.includes(k)))return send(res,400,'Somente cargo, setor, turno, folga e situação podem ser alterados.');
      if(changes.jobTitle!==undefined&&(typeof changes.jobTitle!=='string'||!changes.jobTitle.trim()||changes.jobTitle.length>80))return send(res,400,'Cargo inválido.');
      if(changes.sector!==undefined&&!['cozinha','frente','caixa','apoio','gestao'].includes(changes.sector))return send(res,400,'Setor inválido.');
      if(changes.shift!==undefined&&!['manha','noite','intermediario','variavel'].includes(changes.shift))return send(res,400,'Turno inválido.');
      if(changes.fixedWeekday!==undefined&&(!Number.isInteger(changes.fixedWeekday)||changes.fixedWeekday<1||changes.fixedWeekday>4))return send(res,400,'Folga inválida.');
      if(changes.status!==undefined&&!['active','inactive'].includes(changes.status))return send(res,400,'Situação inválida.');
      if(changes.skills!==undefined&&(!Array.isArray(changes.skills)||changes.skills.length>11||changes.skills.some(s=>!['preparo','montagem','chapa','vitrine','vendas','ifood','caixa','recebimento','estoque','lideranca','etiquetagem'].includes(s))||new Set(changes.skills).size!==changes.skills.length))return send(res,400,'Habilidades inválidas.');
      if(changes.certifications!==undefined&&(!Array.isArray(changes.certifications)||changes.certifications.length>11||changes.certifications.some(s=>!['preparo','montagem','chapa','vitrine','vendas','ifood','caixa','recebimento','estoque','lideranca','etiquetagem'].includes(s))||new Set(changes.certifications).size!==changes.certifications.length))return send(res,400,'Certificações inválidas.');
      if(changes.notes!==undefined&&(typeof changes.notes!=='string'||changes.notes.length>240))return send(res,400,'Observações inválidas.');
      if(changes.availability!==undefined&&(!Array.isArray(changes.availability)||changes.availability.length>7))return send(res,400,'Horários inválidos.');
      const ref=db.collection('units').doc(actingMember.unitId).collection('staffRegistry').doc(id),now=new Date();
      let found=false;
      await db.runTransaction(async tx=>{
        const snap=await tx.get(ref);
        if(!snap.exists)return;
        found=true;
        const before=snap.data();
        const sector=changes.sector||before.sector,skills=changes.skills||before.skills||[],certifications=changes.certifications||before.certifications||[];
        if(!skills.every(s=>eligibleSkills(sector).includes(s))||!certifications.every(s=>skills.includes(s)))throw Error('Habilidades incompatíveis com setor ou certificações.');
        if(changes.availability!==undefined&&!validateProfessionalProfile({sector,jobTitle:changes.jobTitle||before.jobTitle,skills,certifications,sectorExceptions:[],shift:changes.shift||before.shift,availability:changes.availability,notes:changes.notes||before.notes||''}))throw Error('Horários ou intervalos inválidos.');
        tx.update(ref,{...changes,...(changes.availability!==undefined?{}:changes.shift!==undefined||changes.fixedWeekday!==undefined?{availability:defaultStaffAvailability(changes.shift||before.shift,changes.fixedWeekday||before.fixedWeekday)}:{}),updatedBy:actor.uid,updatedAt:now});
        signalUnitChange(tx,db,actingMember.unitId,['team', 'profile', 'schedules', 'notifications']);
        tx.create(db.collection('auditLogs').doc(),{event:'staff.registry_updated',unitId:actingMember.unitId,actorUid:actor.uid,registryId:id,before:Object.fromEntries(Object.keys(changes).map(k=>[k,before[k]??null])),changes,at:now});
      });
      return found?send(res,200,'Ficha atualizada sem modificar conta de acesso.'):send(res,404,'Ficha não encontrada.');
    }
    if(action==='masterRegistryPreview'||action==='masterRegistryImport'){
      if(!['admin','manager','submanager'].includes(actingMember.role))return send(res,403,'Apenas gerência pode revisar colaboradores.');
      const unit=db.collection('units').doc(actingMember.unitId),registryRef=unit.collection('staffRegistry');
      const [staff,accounts]=await Promise.all([registryRef.limit(200).get(),db.collection('memberships').where('unitId','==',actingMember.unitId).limit(201).get()]);
      if(staff.size>=200||accounts.size>200)return send(res,409,'Limite de conferência atingido; importação bloqueada.');
      const registry=staff.docs.map(d=>({id:d.id,...d.data()}));
      const existingAccounts=accounts.docs.map(d=>({uid:d.id,name:d.data().name||'',status:d.data().status||''}));
      const config=await unit.collection('configuration').doc('staffRegistry').get();
      const preview=reconcileStaff(staffSeed,registry,existingAccounts).map(p=>({...p,seedId:'staff_'+createHash('sha256').update(normalizeStaffName(p.name)).digest('hex').slice(0,40)}));
      if(action==='masterRegistryPreview')return send(res,200,'Prévia carregada; nenhuma conta será vinculada automaticamente.',{people:preview,registry,accounts:existingAccounts,activated:config.data()?.active===true});
      if(req.body?.confirm!==true)return send(res,400,'Confirme a importação após revisar a prévia.');
      const selected=req.body?.names;
      if(!Array.isArray(selected)||selected.length<1||selected.length>12||new Set(selected).size!==selected.length||selected.some(x=>typeof x!=='string'))return send(res,400,'Selecione nomes válidos na prévia.');
      const chosen=preview.filter(p=>selected.includes(p.name));
      if(chosen.length!==selected.length||chosen.some(p=>p.state!=='new'))return send(res,409,'Uma ficha já existe ou pode corresponder a conta atual. Atualize a prévia e revise o vínculo antes de importar.',{people:preview});
      const now=new Date();
      const batch=db.batch();
      for(const p of chosen){
        const ref=registryRef.doc('staff_'+createHash('sha256').update(normalizeStaffName(p.name)).digest('hex').slice(0,40));
        batch.create(ref,{name:p.name,normalizedName:normalizeStaffName(p.name),jobTitle:p.jobTitle,sector:p.sector,shift:p.shift,fixedWeekday:p.fixedWeekday,availability:defaultStaffAvailability(p.shift,p.fixedWeekday),status:'active',accountUid:null,skills:[],createdBy:actor.uid,createdAt:now,updatedAt:now,source:'levantamento_escala_2026'});
      }
      await batch.commit();
      return send(res,201,'Fichas criadas sem contas de acesso. Nenhum perfil anterior foi modificado.',{created:chosen.length});
    }
    if(action==='rosterList'){
      if(!['admin','manager','submanager'].includes(actingMember.role))return send(res,403,'Sem permissão.');
      const snap=await db.collection('units').doc(actingMember.unitId).collection('rosterEntries').limit(200).get();
      const active=await db.collection('memberships').where('unitId','==',actingMember.unitId).limit(201).get();
      const connected=new Set(active.docs.filter(d=>d.data().status==='active').map(d=>String(d.data().email||'').trim().toLowerCase()));
      return send(res,200,'Pré-cadastros consultados.',{entries:snap.docs.map(d=>({
       id:d.id,...d.data(),status:connected.has(d.data().email)?'linked':'pending_invite',
       createdAt:d.data().createdAt?.toDate?.()?.toISOString?.()||null
      }))});
    }
    if(action==='rosterCreate'){
      if(!['admin','manager','submanager'].includes(actingMember.role))return send(res,403,'Sem permissão.');
      const entry=validateRosterEntry(req.body?.entry,actingMember.role);
      if(!entry)return send(res,400,'Confira nome, e-mail, cargo, setor e permissões.');
      if(!entry.email)return send(res,400,'Informe o e-mail para evitar cadastros duplicados e vincular o futuro convite.');
      const id=createHash('sha256').update(entry.email).digest('hex');
      const ref=db.collection('units').doc(actingMember.unitId).collection('rosterEntries').doc(id);
      const existing=await ref.get();
      if(existing.exists)return send(res,409,'Colaborador já pré-cadastrado com esse e-mail.');
      const memberships=await db.collection('memberships').where('unitId','==',actingMember.unitId).limit(201).get();
      if(memberships.size>200)return send(res,409,'Equipe acima do limite de consulta para pré-cadastro.');
      if(memberships.docs.some(m=>String(m.data().email||'').trim().toLowerCase()===entry.email))return send(res,409,'Esse e-mail já possui acesso nesta unidade. Use a ficha profissional existente.');
      await ref.create({...entry,status:'pending_invite',createdAt:new Date(),createdBy:actor.uid,unitId:actingMember.unitId});
      return send(res,201,'Colaborador pré-cadastrado. Envie o convite quando necessário.');
    }
    if(action==='avatarSave'){
      const avatar=req.body?.avatar;
      if(typeof avatar!=='string'||avatar.length>180000||!/^data:image\/(webp|png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(avatar))
        return send(res,400,'Foto inválida. Use JPEG, PNG ou WebP de até 130 KB.');
      const encoded=avatar.split(',')[1];const bytes=Buffer.from(encoded,'base64');
      if(bytes.length>130000||bytes.length<100)return send(res,400,'Tamanho de foto inválido.');
      const ref=db.collection('units').doc(actingMember.unitId).collection('memberPersonal').doc(actor.uid);
      await writePersonal(ref,{avatar,avatarUpdatedAt:new Date()});
      return send(res,200,'Foto atualizada com sucesso.');
    }
    if(action==='avatarRemove'){
      const ref=db.collection('units').doc(actingMember.unitId).collection('memberPersonal').doc(actor.uid);
      await writePersonal(ref,{avatar:null,avatarUpdatedAt:new Date()});
      return send(res,200,'Foto removida.');
    }
    if(action==='myProfile'){
      const ref=db.collection('units').doc(actingMember.unitId).collection('staffProfiles').doc(actor.uid);
      const snap=await ref.get();
      const personalRef=db.collection('units').doc(actingMember.unitId).collection('memberPersonal').doc(actor.uid);
      const personalSnap=await personalRef.get();
      const linked=await db.collection('units').doc(actingMember.unitId).collection('staffRegistry').where('accountUid','==',actor.uid).limit(1).get();
      const registered=linked.docs[0]?.data();
      const professional=registered?{sector:registered.sector,jobTitle:registered.jobTitle,shift:registered.shift,availability:registered.availability||[],skills:registered.skills||[],certifications:registered.certifications||[],notes:registered.notes||'',sectorExceptions:[]}:snap.exists?snap.data().profile:null;
      return send(res,200,'Perfil consultado.',{professional,personal:personalSnap.exists?personalSnap.data().fields:null,
       recognition:earnedRecognition(professional),avatar:personalSnap.exists?personalSnap.data().avatar||null:null});
    }
    if(action==='personalSave'){
      const fields=validatePersonalProfile(req.body?.fields);
      if(!fields)return send(res,400,'Dados pessoais inválidos. Confira os limites e o turno preferencial.');
      const ref=db.collection('units').doc(actingMember.unitId).collection('memberPersonal').doc(actor.uid);
      const before=await ref.get();
      if(JSON.stringify(before.data()?.fields||null)===JSON.stringify(fields))return send(res,200,'Seus dados já estão atualizados.');
      const now=new Date();
      await db.runTransaction(async tx=>{
       const [active,existing]=await Promise.all([tx.get(db.doc('memberships/'+actor.uid)),tx.get(ref)]);
       if(!active.exists||active.data().status!=='active'||active.data().unitId!==actingMember.unitId)throw Error('FORBIDDEN');
       tx.set(ref,{uid:actor.uid,unitId:actingMember.unitId,fields,updatedAt:now},{merge:true});
       signalUnitChange(tx,db,actingMember.unitId,['team', 'profile', 'schedules', 'notifications']);
       tx.create(db.collection('auditLogs').doc(),{event:'team.personal_updated',unitId:actingMember.unitId,
         actorUid:actor.uid,targetUid:actor.uid,at:now,changedFields:Object.keys(fields).filter(k=>fields[k]!==existing.data()?.fields?.[k])});
      });
      return send(res,200,'Suas preferências foram salvas.');
    }
    if(action==='skillReviewRequest'){
      const skill=req.body?.skill,reason=req.body?.reason;
      if(!['preparo','montagem','chapa','vitrine','vendas','ifood','caixa','recebimento','estoque','lideranca','etiquetagem'].includes(skill)
        ||typeof reason!=='string'||reason.trim().length<10||reason.length>400)
        return send(res,400,'Selecione uma habilidade e informe um motivo entre 10 e 400 caracteres.');
      const ref=db.collection('units').doc(actingMember.unitId).collection('skillReviewRequests').doc();
      await ref.create({uid:actor.uid,unitId:actingMember.unitId,skill,reason:reason.trim(),status:'pending',createdAt:new Date()});
      return send(res,200,'Solicitação registrada para avaliação da gerência.');
    }
    if(action==='notifications'){
      const snap=await db.collection('units').doc(actingMember.unitId).collection('memberNotifications').doc(actor.uid).collection('items').orderBy('at','desc').limit(50).get();
      return send(res,200,'Notificações carregadas.',{notifications:snap.docs.map(d=>({
       id:d.id,title:d.data().title||'Alteração profissional',message:d.data().message||'',read:!!d.data().read,
       at:d.data().at?.toDate?.()?.toISOString?.()||null
      }))});
    }
    if(action==='notificationRead'){
      const id=req.body?.id;
      if(typeof id!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(id))return send(res,400,'Aviso inválido.');
      const ref=db.collection('units').doc(actingMember.unitId).collection('memberNotifications').doc(actor.uid).collection('items').doc(id);
      const snap=await ref.get();
      if(!snap.exists)return send(res,404,'Aviso não encontrado.');
      await writePersonal(ref,{read:true,readAt:new Date()});
      return send(res,200,'Aviso marcado como lido.');
    }
    if(!['admin','manager','submanager'].includes(actingMember.role))
      return send(res,403,'Sem permissão para gerir colaboradores.');
    if(action==='skillReviewList'){
      const snap=await db.collection('units').doc(actingMember.unitId).collection('skillReviewRequests').orderBy('createdAt','desc').limit(60).get();
      return send(res,200,'Solicitações de habilidades consultadas.',{requests:snap.docs.map(d=>({
       id:d.id,uid:d.data().uid,skill:d.data().skill,reason:d.data().reason,status:d.data().status,
       createdAt:d.data().createdAt?.toDate?.()?.toISOString?.()||null
      }))});
    }
    if (action === 'profiles') {
      const snap=await db.collection('memberships').where('unitId','==',actingMember.unitId).limit(201).get();
      if(snap.size>200)return send(res,409,'Limite de equipe atingido.');
      const members=snap.docs.map(cleanMember);
      const refs=members.map(m=>db.collection('units').doc(actingMember.unitId).collection('staffProfiles').doc(m.uid));
      const profiles=refs.length?await db.getAll(...refs):[];
      const byId=new Map(profiles.filter(x=>x.exists).map(x=>[x.id,x.data()]));
      const names=new Map();
      for(let i=0;i<members.length;i+=100){
       const authBatch=await getAuth().getUsers(members.slice(i,i+100).map(m=>({uid:m.uid})));
       for(const u of authBatch.users)names.set(u.uid,u.displayName||u.email||'');
      }
      return send(res,200,'Perfis profissionais consultados.',{members:members.map(m=>({
       ...m,name:m.name||names.get(m.uid)||'',professional:byId.get(m.uid)?.profile||null,
       professionalUpdatedAt:byId.get(m.uid)?.updatedAt?.toDate?.()?.toISOString?.()||null
      }))});
    }
    if(action==='profileSave'){
      const {uid,profile}=req.body||{};
      if(typeof uid!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(uid))
       return send(res,400,'Colaborador inválido.');
      const normalized=validateProfessionalProfile(profile);
      if(!normalized)return send(res,400,'Perfil profissional ou horários inválidos.');
      const actorRef=db.collection('memberships').doc(actor.uid);
      const memberRef=db.collection('memberships').doc(uid);
      const profileRef=db.collection('units').doc(actingMember.unitId).collection('staffProfiles').doc(uid);
      await db.runTransaction(async tx=>{
       const [a,target,existing]=await Promise.all([tx.get(actorRef),tx.get(memberRef),tx.get(profileRef)]);
       if(!target.exists||target.data().unitId!==actingMember.unitId)throw Error('NOT_FOUND');
       if(!a.exists||!canManageProfessionalProfile(a.data(),target.data()))throw Error('FORBIDDEN');
       const previousExceptions=existing.data()?.profile?.sectorExceptions||[];
       if(JSON.stringify(previousExceptions)!==JSON.stringify(normalized.sectorExceptions)&&a.data().role!=='admin')throw Error('FORBIDDEN');
       const unauthorized=invalidNewSectorSkills(existing.data()?.profile,normalized);
       if(unauthorized.length)throw Error('SKILL_SECTOR');
       const now=new Date();
       const changes=profileChanges(existing.data()?.profile,normalized);
       if(!changes.length)throw Error('NO_CHANGES');
       const noticeRef=db.collection('units').doc(actingMember.unitId).collection('memberNotifications').doc(uid).collection('items').doc();
       tx.create(noticeRef,{title:'Ficha profissional atualizada',message:professionalNotice(changes),changes,
         unitId:actingMember.unitId,recipientUid:uid,actorUid:actor.uid,at:now,read:false});
       tx.set(profileRef,{uid,unitId:actingMember.unitId,profile:normalized,updatedAt:now,
         updatedBy:actor.uid,revision:(existing.data()?.revision||0)+1},{merge:true});
       signalUnitChange(tx,db,actingMember.unitId,['team', 'profile', 'schedules', 'notifications']);
       tx.create(db.collection('auditLogs').doc(),{event:'team.professional_updated',unitId:actingMember.unitId,
         actorUid:actor.uid,targetUid:uid,at:now,before:existing.data()?.profile||null,after:normalized});
      });
      return send(res,200,'Perfil profissional atualizado com auditoria.');
    }
    if (action === 'list') {
      const snap = await db.collection('memberships').where('unitId','==',actingMember.unitId).limit(201).get();
      if (snap.size > 200) return send(res,409,'A unidade excede o limite da listagem. Paginação necessária.');
      const members = snap.docs.map(cleanMember);
      // Nome vem do perfil Google/Firebase quando ainda não está gravado no vínculo.
      const profiles = new Map();
      for (let index = 0; index < members.length; index += 100) {
        const batch = members.slice(index,index+100);
        const result = await getAuth().getUsers(batch.map(item => ({uid:item.uid})));
        for (const profile of result.users) profiles.set(profile.uid,profile);
      }
      for (const item of members) {
        const profile = profiles.get(item.uid);
        if (!item.name) item.name = profile?.displayName || '';
        if (!item.email) item.email = profile?.email || '';
      }
      return send(res,200,'Colaboradores carregados.',{
        members:members.sort((a,b) => (a.name || a.email).localeCompare(b.name || b.email,'pt-BR'))
      });
    }

    if (action !== 'update') return send(res,400,'Ação inválida.');
    const { uid, role, status } = req.body || {};
    if (typeof uid !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(uid) ||
        !roles.includes(role) || !statuses.includes(status))
      return send(res,400,'Colaborador, cargo ou situação inválidos.');
    if (uid === actor.uid) return send(res,403,'Não podes alterar o teu próprio acesso.');

    const targetRef = db.doc('memberships/' + uid);
    const actorRef = db.doc('memberships/' + actor.uid);
    const auditRef = db.collection('auditLogs').doc();

    await db.runTransaction(async tx => {
      const [actorSnap,targetSnap] = await Promise.all([tx.get(actorRef),tx.get(targetRef)]);
      const currentActor = actorSnap.data();
      const target = targetSnap.data();
      if (!currentActor || currentActor.status !== 'active' ||
          !['admin','manager','submanager'].includes(currentActor.role) ||
          currentActor.unitId !== actingMember.unitId)
        throw new Error('FORBIDDEN');
      if (!target || target.unitId !== currentActor.unitId) throw new Error('NOT_FOUND');
      if (!roles.includes(target.role) || !statuses.includes(target.status)) throw new Error('INVALID_STATE');

      // Gerentes só podem administrar auxiliares e cozinheiros, inclusive o cargo de destino.
      if (['manager','submanager'].includes(currentActor.role) &&
          (!['auxiliar','cook'].includes(target.role) || !['auxiliar','cook'].includes(role)))
        throw new Error('FORBIDDEN');

      if (target.role === role && target.status === status) throw new Error('NO_CHANGES');

      // Nunca deixar a unidade sem um administrador ativo.
      if (target.role === 'admin' && target.status === 'active' &&
          (role !== 'admin' || status !== 'active')) {
        const unitMembers = await tx.get(db.collection('memberships')
          .where('unitId','==',currentActor.unitId).limit(201));
        if (unitMembers.size > 200) throw new Error('TOO_MANY_MEMBERS');
        const adminCount = unitMembers.docs.filter(doc =>
          doc.data().role === 'admin' && doc.data().status === 'active').length;
        if (adminCount <= 1) throw new Error('LAST_ADMIN');
      }

      const now = new Date();
      tx.update(targetRef,{role,status,updatedAt:now,updatedBy:actor.uid});
      const parts=[];
      if(target.role!==role)parts.push('Perfil de acesso: '+target.role+' → '+role);
      if(target.status!==status)parts.push('Situação: '+target.status+' → '+status);
      const noteRef=db.collection('units').doc(currentActor.unitId).collection('memberNotifications').doc(uid).collection('items').doc();
      tx.create(noteRef,{title:'Acesso atualizado',message:parts.join(' · '),changes:parts,read:false,
       recipientUid:uid,actorUid:actor.uid,unitId:currentActor.unitId,at:now});
      signalUnitChange(tx,db,actingMember.unitId,['team', 'profile', 'schedules', 'notifications']);
      tx.create(auditRef,{
        event:'member.updated',unitId:currentActor.unitId,actorUid:actor.uid,
        targetUid:uid,fromRole:target.role,toRole:role,fromStatus:target.status,toStatus:status,at:now
      });
    });
    return send(res,200,'Colaborador atualizado.');
  } catch(error) {
    if (error.message === 'UNAUTHENTICATED') return send(res,401,'Faça login.');
    if (error.message === 'FORBIDDEN') return send(res,403,'Sem permissão para esta alteração.');
    if (error.message === 'NOT_FOUND') return send(res,404,'Colaborador não encontrado nesta unidade.');
    if (error.message === 'TOO_MANY_MEMBERS') return send(res,409,'Unidade grande demais para esta operação; contacte o suporte.');
    if (error.message === 'LAST_ADMIN') return send(res,409,'Não é possível remover o último administrador ativo da unidade.');
    if (error.message === 'SKILL_SECTOR') return send(res,400,'Novas habilidades devem corresponder ao setor selecionado.');
    if (error.message === 'NO_CHANGES') return send(res,409,'Nenhuma alteração foi feita.');
    if (error.message === 'INVALID_STATE') return send(res,409,'O vínculo atual está inconsistente.');
    if(sendQuotaError(res,error))return;console.error('Member management:',error.message);
    return send(res,500,'Não foi possível concluir a operação.');
  }
}
