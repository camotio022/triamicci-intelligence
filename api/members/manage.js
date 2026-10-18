import {staffSeed,reconcileStaff,normalizeStaffName} from '../../server/team/master-registry.js';
import schedulesWorkflow from '../../server/workflows/schedules.js';
import muralWorkflow from '../../server/workflows/mural.js';
import labelsWorkflow from '../../server/workflows/labels.js';
import {createHash,randomUUID} from 'node:crypto';
import {validateRosterEntry} from '../../server/team/roster-rules.js';
import {validatePersonalProfile,earnedRecognition} from '../../server/team/personal-rules.js';
import {profileChanges,professionalNotice} from '../../server/team/ux-rules.js';
import {validateProfessionalProfile,canManageProfessionalProfile,invalidNewSectorSkills} from '../../server/team/profile-rules.js';
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
    if(action==='masterRegistryPreview'||action==='masterRegistryImport'){
      if(!['admin','manager'].includes(actingMember.role))return send(res,403,'Apenas gerência pode revisar colaboradores.');
      const unit=db.collection('units').doc(actingMember.unitId),registryRef=unit.collection('staffRegistry');
      const [staff,accounts]=await Promise.all([registryRef.limit(200).get(),db.collection('memberships').where('unitId','==',actingMember.unitId).limit(201).get()]);
      if(staff.size>=200||accounts.size>200)return send(res,409,'Limite de conferência atingido; importação bloqueada.');
      const registry=staff.docs.map(d=>({id:d.id,...d.data()}));
      const existingAccounts=accounts.docs.map(d=>({uid:d.id,name:d.data().name||'',status:d.data().status||''}));
      const preview=reconcileStaff(staffSeed,registry,existingAccounts);
      if(action==='masterRegistryPreview')return send(res,200,'Prévia carregada; nenhuma conta será vinculada automaticamente.',{people:preview,registry,accounts:existingAccounts});
      if(req.body?.confirm!==true)return send(res,400,'Confirme a importação após revisar a prévia.');
      const selected=req.body?.names;
      if(!Array.isArray(selected)||selected.length<1||selected.length>12||new Set(selected).size!==selected.length||selected.some(x=>typeof x!=='string'))return send(res,400,'Selecione nomes válidos na prévia.');
      const chosen=preview.filter(p=>selected.includes(p.name));
      if(chosen.length!==selected.length||chosen.some(p=>p.state!=='new'))return send(res,409,'Uma ficha já existe ou pode corresponder a conta atual. Atualize a prévia e revise o vínculo antes de importar.',{people:preview});
      const now=new Date();
      const batch=db.batch();
      for(const p of chosen){
        const ref=registryRef.doc();
        batch.create(ref,{name:p.name,normalizedName:normalizeStaffName(p.name),jobTitle:p.jobTitle,sector:p.sector,shift:p.shift,fixedWeekday:p.fixedWeekday,status:'active',accountUid:null,skills:[],createdBy:actor.uid,createdAt:now,updatedAt:now,source:'levantamento_escala_2026'});
      }
      await batch.commit();
      return send(res,201,'Fichas criadas sem contas de acesso. Nenhum perfil anterior foi modificado.',{created:chosen.length});
    }
    if(action==='rosterList'){
      if(!['admin','manager'].includes(actingMember.role))return send(res,403,'Sem permissão.');
      const snap=await db.collection('units').doc(actingMember.unitId).collection('rosterEntries').limit(200).get();
      const active=await db.collection('memberships').where('unitId','==',actingMember.unitId).limit(201).get();
      const connected=new Set(active.docs.filter(d=>d.data().status==='active').map(d=>String(d.data().email||'').trim().toLowerCase()));
      return send(res,200,'Pré-cadastros consultados.',{entries:snap.docs.map(d=>({
       id:d.id,...d.data(),status:connected.has(d.data().email)?'linked':'pending_invite',
       createdAt:d.data().createdAt?.toDate?.()?.toISOString?.()||null
      }))});
    }
    if(action==='rosterCreate'){
      if(!['admin','manager'].includes(actingMember.role))return send(res,403,'Sem permissão.');
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
      await ref.set({avatar,avatarUpdatedAt:new Date()},{merge:true});
      return send(res,200,'Foto atualizada com sucesso.');
    }
    if(action==='avatarRemove'){
      const ref=db.collection('units').doc(actingMember.unitId).collection('memberPersonal').doc(actor.uid);
      await ref.set({avatar:null,avatarUpdatedAt:new Date()},{merge:true});
      return send(res,200,'Foto removida.');
    }
    if(action==='myProfile'){
      const ref=db.collection('units').doc(actingMember.unitId).collection('staffProfiles').doc(actor.uid);
      const snap=await ref.get();
      const personalRef=db.collection('units').doc(actingMember.unitId).collection('memberPersonal').doc(actor.uid);
      const personalSnap=await personalRef.get();
      const professional=snap.exists?snap.data().profile:null;
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
      await ref.update({read:true,readAt:new Date()});
      return send(res,200,'Aviso marcado como lido.');
    }
    if(!['admin','manager'].includes(actingMember.role))
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
          !['admin','manager'].includes(currentActor.role) ||
          currentActor.unitId !== actingMember.unitId)
        throw new Error('FORBIDDEN');
      if (!target || target.unitId !== currentActor.unitId) throw new Error('NOT_FOUND');
      if (!roles.includes(target.role) || !statuses.includes(target.status)) throw new Error('INVALID_STATE');

      // Gerentes só podem administrar auxiliares e cozinheiros, inclusive o cargo de destino.
      if (currentActor.role === 'manager' &&
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
    console.error('Member management:',error.message);
    return send(res,500,'Não foi possível concluir a operação.');
  }
}
