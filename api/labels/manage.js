import {getDb,authenticate,membership,checkRequest,send} from '../../server/_lib.js';
import {dateOk,cappedExpiry,canReplaceLabel} from '../../server/labels/rules.js';
const idOk=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(x);
const textOk=(x,max)=>typeof x==='string'&&x.trim().length>0&&x.length<=max;
const iso=x=>x?.toDate?.()?.toISOString?.()||null;
const categories=['massas','carnes','outros'],zones=['reserva','giro'];
const policyId=(category,zone)=>category+'_'+zone;
const safeDoc=d=>({id:d.id,...d.data(),createdAt:iso(d.data().createdAt),at:iso(d.data().at),updatedAt:iso(d.data().updatedAt)});
export default async function handler(req,res){
 if(!checkRequest(req,res))return;res.setHeader('Cache-Control','no-store');
 try{
  const actor=await authenticate(req),m=await membership(actor.uid);
  if(!m)return send(res,403,'Acesso negado.');
  const db=getDb(),unit=db.collection('units').doc(m.unitId),labels=unit.collection('labels'),policies=unit.collection('labelPolicies'),action=req.body?.action;
  if(action==='list'){
   const [list,policyList]=await Promise.all([labels.limit(150).get(),policies.limit(30).get()]);
   return send(res,200,'Etiquetas e políticas consultadas.',{labels:list.docs.map(safeDoc).sort((a,b)=>String(b.at||'').localeCompare(String(a.at||''))),policies:policyList.docs.map(safeDoc)});
  }
  if(action==='history'){
   const id=req.body?.id;if(!idOk(id))return send(res,400,'Identificador inválido.');
   const doc=await labels.doc(id).get();if(!doc.exists)return send(res,404,'Etiqueta não encontrada.');
   const snap=await labels.doc(id).collection('events').orderBy('at','desc').limit(100).get();
   return send(res,200,'Histórico da etiqueta.',{label:safeDoc(doc),events:snap.docs.map(safeDoc)});
  }
  if(action==='policyDraft'){
   if(m.role!=='admin')return send(res,403,'Apenas administradores configuram regras.');
   const {category,zone,days,reference,conditions}=req.body||{};
   if(!categories.includes(category)||!zones.includes(zone)||!Number.isInteger(days)||days<1||days>365||!textOk(reference,250)||!textOk(conditions,400))
    return send(res,400,'Informe regra, condições de conservação e referência sanitária verificável.');
   const ref=policies.doc(policyId(category,zone)),now=new Date();
   await db.runTransaction(async tx=>{
    const [u,old]=await Promise.all([tx.get(db.doc('memberships/'+actor.uid)),tx.get(ref)]);
    if(!u.exists||u.data().status!=='active'||u.data().unitId!==m.unitId||u.data().role!=='admin')throw Error('FORBIDDEN');
    tx.set(ref,{category,zone,days,reference:reference.trim(),conditions:conditions.trim(),status:'draft',revision:(old.data()?.revision||0)+1,createdBy:actor.uid,unitId:m.unitId,updatedAt:now});
    tx.create(db.collection('auditLogs').doc(),{event:'label.policy_draft',unitId:m.unitId,actorUid:actor.uid,policyId:ref.id,at:now});
   });
   return send(res,200,'Regra salva como rascunho. Não está ativa.');
  }
  if(action==='policyApprove'){
   if(m.role!=='admin')return send(res,403,'Aprovação restrita a administrador.');
   const id=req.body?.id;if(!/^(massas|carnes|outros)_(reserva|giro)$/.test(id||''))return send(res,400,'Política inválida.');
   const ref=policies.doc(id),now=new Date();
   await db.runTransaction(async tx=>{
    const [u,old]=await Promise.all([tx.get(db.doc('memberships/'+actor.uid)),tx.get(ref)]);
    if(!u.exists||u.data().status!=='active'||u.data().unitId!==m.unitId||u.data().role!=='admin')throw Error('FORBIDDEN');
    if(!old.exists||old.data().status!=='draft'||old.data().createdBy===actor.uid)throw Error('POLICY_STATE');
    tx.update(ref,{status:'approved',approvedBy:actor.uid,approvedAt:now});
    tx.create(db.collection('auditLogs').doc(),{event:'label.policy_approved',unitId:m.unitId,actorUid:actor.uid,policyId:id,at:now});
   });
   return send(res,200,'Regra aprovada para a unidade.');
  }
  if(action==='classifyProduct'){
   if(m.role!=='admin')return send(res,403,'Apenas administradores classificam produtos para validade.');
   const {productId,category,reason}=req.body||{};
   if(!idOk(productId)||!categories.includes(category)||!textOk(reason,240)||reason.trim().length<10)return send(res,400,'Produto, categoria ou justificativa inválidos.');
   const ref=unit.collection('products').doc(productId),now=new Date();
   await db.runTransaction(async tx=>{
    const [ms,p]=await Promise.all([tx.get(db.doc('memberships/'+actor.uid)),tx.get(ref)]);
    if(!ms.exists||ms.data().status!=='active'||ms.data().unitId!==m.unitId||ms.data().role!=='admin')throw Error('FORBIDDEN');
    if(!p.exists||p.data().status!=='active')throw Error('NOT_FOUND');
    tx.update(ref,{labelCategory:category,labelCategoryUpdatedAt:now,labelCategoryUpdatedBy:actor.uid});
    tx.create(db.collection('auditLogs').doc(),{event:'label.category_classified',unitId:m.unitId,actorUid:actor.uid,productId,category,previousCategory:p.data().labelCategory||null,reason:reason.trim(),at:now});
   });
   return send(res,200,'Categoria de etiquetagem definida com auditoria.');
  }
  if(action==='issue'){
   const {productId,category,zone,lot,quantity,unit:quantityUnit,startedOn,sourceExpiryDate,note}=req.body||{};
   if(!idOk(productId)||!categories.includes(category)||!zones.includes(zone)||!textOk(lot,80)||!textOk(note,240)||!dateOk(startedOn)||!dateOk(sourceExpiryDate)||
      !['un','kg','g','L','ml'].includes(quantityUnit)||typeof quantity!=='number'||!Number.isFinite(quantity)||quantity<=0||quantity>100000)
    return send(res,400,'Dados da etiqueta inválidos.');
   const product=await unit.collection('products').doc(productId).get();
   if(!product.exists||product.data().status!=='active')return send(res,404,'Produto ativo não localizado.');
   if(product.data().labelCategory!==category)return send(res,409,'Produto sem classificação de validade aprovada ou categoria diferente. Solicite classificação administrativa.');
   const p=await policies.doc(policyId(category,zone)).get();
   if(!p.exists||p.data().status!=='approved')return send(res,409,'Não há regra de validade aprovada para a categoria e o local.');
   const today=new Date().toLocaleDateString('en-CA',{timeZone:'America/Sao_Paulo'});
   const expiresOn=cappedExpiry({startDate:startedOn,sourceExpiryDate,policyDays:p.data().days,nowDate:today});
   if(!expiresOn)return send(res,409,'Produto vencido, prazo inválido ou validade sem segurança para emissão.');
   const member=db.doc('memberships/'+actor.uid),professional=unit.collection('staffProfiles').doc(actor.uid),ref=labels.doc(),event=ref.collection('events').doc(),now=new Date();
   await db.runTransaction(async tx=>{
    const [ms,ps,policy]=await Promise.all([tx.get(member),tx.get(professional),tx.get(policies.doc(p.id))]);
    if(!ms.exists||ms.data().status!=='active'||ms.data().unitId!==m.unitId)throw Error('FORBIDDEN');
    const trained=ps.data()?.profile?.certifications?.includes('etiquetagem');
    if(!['admin','manager'].includes(ms.data().role)&&!trained)throw Error('FORBIDDEN');
    if(!policy.exists||policy.data().status!=='approved'||policy.data().revision!==p.data().revision)throw Error('POLICY_STATE');
    const record={productId,productName:product.data().name,category,zone,lot:lot.trim(),quantity,quantityUnit,startedOn,originalExpiry:sourceExpiryDate,expiresOn,policyRevision:p.data().revision,status:'active',createdBy:actor.uid,createdAt:now,at:now,unitId:m.unitId};
    tx.create(ref,record);
    tx.create(event,{kind:'issue',actorUid:actor.uid,at:now,expiresOn,reason:note.trim(),zone});
    tx.create(db.collection('auditLogs').doc(),{event:'label.issued',unitId:m.unitId,actorUid:actor.uid,labelId:ref.id,at:now,expiresOn,productId});
   });
   return send(res,201,'Etiqueta criada com rastreabilidade.',{id:ref.id,expiresOn});
  }
  if(action==='replace'){
   const {id,zone,reason}=req.body||{};
   if(!idOk(id)||!zones.includes(zone)||!textOk(reason,240))return send(res,400,'Informe a etiqueta, novo local e motivo.');
   const ref=labels.doc(id),old=await ref.get();
   if(!old.exists)return send(res,404,'Etiqueta não encontrada.');
   if(old.data().status!=='active')return send(res,409,'Etiqueta não está ativa.');
   const p=await policies.doc(policyId(old.data().category,zone)).get();
   if(!p.exists||p.data().status!=='approved')return send(res,409,'Regra do destino não aprovada.');
   const today=new Date().toLocaleDateString('en-CA',{timeZone:'America/Sao_Paulo'});
   const limit=cappedExpiry({startDate:today,sourceExpiryDate:old.data().originalExpiry,policyDays:p.data().days,nowDate:today});
   const expiresOn=limit&&limit<old.data().expiresOn?limit:old.data().expiresOn;
   if(!limit||!canReplaceLabel({currentExpiry:old.data().expiresOn,originalExpiry:old.data().originalExpiry,proposedExpiry:expiresOn,today}))
    return send(res,409,'Não é permitido prolongar prazo nem trocar etiqueta vencida para consumo.');
   const now=new Date();
   await db.runTransaction(async tx=>{
    const [member,profile,current,policy]=await Promise.all([tx.get(db.doc('memberships/'+actor.uid)),tx.get(unit.collection('staffProfiles').doc(actor.uid)),tx.get(ref),tx.get(policies.doc(p.id))]);
    if(!member.exists||member.data().status!=='active'||member.data().unitId!==m.unitId)throw Error('FORBIDDEN');
    if(!['admin','manager'].includes(member.data().role)&&!profile.data()?.profile?.certifications?.includes('etiquetagem'))throw Error('FORBIDDEN');
    if(!current.exists||current.data().status!=='active'||current.data().expiresOn!==old.data().expiresOn||!policy.exists||policy.data().status!=='approved'||policy.data().revision!==p.data().revision)throw Error('POLICY_STATE');
    tx.update(ref,{zone,expiresOn,updatedAt:now,updatedBy:actor.uid,policyRevision:p.data().revision});
    tx.create(ref.collection('events').doc(),{kind:'replace',actorUid:actor.uid,at:now,reason:reason.trim(),fromZone:old.data().zone,toZone:zone,previousExpiry:old.data().expiresOn,expiresOn});
    tx.create(db.collection('auditLogs').doc(),{event:'label.replaced',unitId:m.unitId,actorUid:actor.uid,labelId:id,at:now,previousExpiry:old.data().expiresOn,expiresOn});
   });
   return send(res,200,'Troca registrada sem estender a validade.',{expiresOn});
  }
  return send(res,400,'Ação inválida.');
 }catch(e){
  if(e.message==='UNAUTHENTICATED')return send(res,401,'Faça login.');
  if(e.message==='FORBIDDEN')return send(res,403,'Essa operação exige permissão ou habilidade de etiquetagem confirmada.');
  if(e.message==='NOT_FOUND')return send(res,404,'Produto não encontrado.');
  if(e.message==='POLICY_STATE')return send(res,409,'Regra ou etiqueta alterada; recarregue antes de prosseguir.');
  console.error('Labels:',e.message);return send(res,500,'Não foi possível registrar etiqueta.');
 }
}
