import v3Ledger from './v3-ledger.js';
import {createHash} from 'node:crypto';
import {getDb,authenticate,membership,checkRequest,send} from '../_lib.js';
import {validateOperationalProfile,reportShortage,transitionOrder} from './v3-catalog-policy.js';
const idOk=x=>typeof x==='string'&&/^[a-f0-9]{40}$/.test(x);
const requestOk=x=>typeof x==='string'&&/^[a-f0-9-]{36}$/i.test(x);
import {MANAGEMENT_ROLES,TEAM_ROLES} from '../permissions/v31-policy.js';
import {redactFinancial} from '../permissions/v31-redaction.js';
import {restaurantDay} from '../schedules/restaurant-today.js';
const roles=MANAGEMENT_ROLES;
const locations=['reserva','giro'];
const unitNames=['kg','g','L','mL','un','porcao','pacote','duzia'];
const iso=x=>x?.toDate?.()?.toISOString?.()||null;
const obj=s=>({id:s.id,...s.data()});
const now=()=>new Date();
const dateOk=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&!Number.isNaN(Date.parse(x+'T12:00:00Z'))&&new Date(x+'T12:00:00Z').toISOString().slice(0,10)===x;
const quantity=(v,unit,zero=false)=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&(zero||v>0)&&v<=100000&&(!['un','porcao','pacote','duzia'].includes(unit)||Number.isInteger(v))&&Math.abs(Math.round(v*1000)-v*1000)<1e-7;
const newAudit=(tx,db,event,unitId,actorUid,details)=>tx.create(db.collection('auditLogs').doc(),{event,unitId,actorUid,details,at:now()});
const verify=(a,unitId,allowed)=>a.exists&&a.data().status==='active'&&a.data().unitId===unitId&&allowed.includes(a.data().role);
const productPath=(unit,id)=>unit.collection('products').doc(id);
const limitText=(x,max=240)=>typeof x==='string'&&x.length<=max;
const round=x=>Math.round(x*1000)/1000;
export default async function kitchenV3(req,res){
 if(['v3LossReport','v3LossPending','v3LossApprove','v3LossReject','v3InspectReceive','v3PendingReceipts','v3ApproveReceipt','v3RejectReceipt','v3Receive','v3Count','v3Transfer','v3Produce','v3Lots','v3LedgerHistory'].includes(req.body?.action))return v3Ledger(req,res);
 if(!checkRequest(req,res))return;
 res.setHeader('Cache-Control','no-store');
 try{
  const user=await authenticate(req),member=await membership(user.uid);
  if(!member?.unitId)return send(res,403,'Usuário sem unidade ativa.');
  const db=getDb(),unitId=member.unitId,unit=db.collection('units').doc(unitId);
  const products=unit.collection('products'),profiles=unit.collection('operationalProfiles'),issues=unit.collection('stockSignals'),orders=unit.collection('purchaseOrdersV3'),balances=unit.collection('v3PhysicalBalances');
  const actorRef=db.doc('memberships/'+user.uid),action=req.body?.action;
  if(action==='v3Alerts'){
   const [s,o]=await Promise.all([issues.limit(201).get(),orders.limit(201).get()]);
   if(s.size>200||o.size>200)return send(res,409,'Há muitos avisos. Paginação necessária.');
   const today=new Date().toISOString().slice(0,10);
   return send(res,200,'Alertas operacionais carregados.',{signals:s.docs.map(obj).filter(x=>x.status!=='resolved'),
    deliveries:o.docs.map(obj).filter(x=>!['received','cancelled'].includes(x.status)).sort((a,b)=>a.etaDate.localeCompare(b.etaDate)),today});
  }
  if(action==='v3Dashboard'){
   const [a,b,c,d,e]=await Promise.all([products.limit(201).get(),profiles.limit(201).get(),issues.limit(201).get(),orders.limit(201).get(),balances.limit(201).get()]);
   if([a,b,c,d,e].some(s=>s.size>200))return send(res,409,'Limite de consulta atingido. Paginação necessária.');
   const pm=new Map(b.docs.map(obj).map(p=>[p.id,p]));
   const bm=new Map(e.docs.map(obj).map(p=>[p.id,p]));
   return send(res,200,'Painel operacional carregado.',{
    products:a.docs.map(s=>{const data={...obj(s),profile:pm.get(s.id)||null,v3Balance:bm.get(s.id)||null};return roles.includes(member.role)?data:redactFinancial(data)}).sort((x,y)=>x.name.localeCompare(y.name,'pt-BR')),
    signals:c.docs.map(obj).filter(s=>s.status!=='resolved'),
    orders:d.docs.map(obj).filter(o=>o.status!=='cancelled').map(x=>roles.includes(member.role)?x:redactFinancial(x)).sort((x,y)=>(x.etaDate||'').localeCompare(y.etaDate||'')),
   });
  }
  if(action==='v3ProfileSave'){
   if(!roles.includes(member.role))return send(res,403,'Somente gerência configura insumos.');
   const {productId,profile,expectedVersion=null}=req.body||{};
   if(!idOk(productId)||!validateOperationalProfile(profile).ok||!Number.isInteger(expectedVersion)&&expectedVersion!==null)return send(res,400,'Revise a configuração operacional.');
   const ref=profiles.doc(productId),pref=products.doc(productId);
   let version=0;
   await db.runTransaction(async tx=>{
    const [actor,p,prior,balance,allProfiles,allProducts]=await Promise.all([tx.get(actorRef),tx.get(pref),tx.get(ref),tx.get(balances.doc(productId)),tx.get(profiles.limit(201)),tx.get(products.limit(201))]);
    if(!verify(actor,unitId,roles))throw Error('FORBIDDEN');
    if(!p.exists)throw Error('NOT_FOUND');
    if(allProfiles.size>200||allProducts.size>200)throw Error('TOO_MANY');
    const candidateNames=[profile.displayName,...(profile.aliases||[])].map(x=>x.trim().toLocaleLowerCase('pt-BR'));
    if(allProfiles.docs.some(d=>d.id!==productId&&[d.data().displayName,...(d.data().aliases||[])].some(x=>candidateNames.includes((x||'').trim().toLocaleLowerCase('pt-BR'))))||
       allProducts.docs.some(d=>d.id!==productId&&!allProfiles.docs.find(p=>p.id===d.id)&&candidateNames.includes((d.data().name||'').trim().toLocaleLowerCase('pt-BR'))))throw Error('DUPLICATE_NAME');
    const sourceIds=[...(profile.sourceProductIds||[]),...(profile.alternativeProductIds||[])];
    if(sourceIds.includes(productId))throw Error('INVALID_SOURCE');
    if(sourceIds.length){const sourceDocs=await Promise.all(sourceIds.map(id=>tx.get(products.doc(id))));if(sourceDocs.some(d=>!d.exists||d.data().status!=='active'))throw Error('INVALID_SOURCE');}
    if(prior.exists&&prior.data().version!==expectedVersion||!prior.exists&&expectedVersion!==null)throw Error('STALE');
    if(p.data().status!=='active')throw Error('INACTIVE');
    if(balance.exists&&balance.data().total>0&&prior.exists&&prior.data().countUnit!==profile.countUnit)throw Error('UNIT_LOCKED');
    // A configuração NÃO altera saldo legado nem unidades de movimentos já gravados.
    const next={displayName:profile.displayName.trim(),aliases:(profile.aliases||[]).map(x=>x.trim()),controlMode:profile.controlMode,origin:profile.origin,
      countUnit:profile.countUnit||null,locations:profile.locations,receivingPresentation:profile.receivingPresentation||null,
      sourceProductIds:profile.sourceProductIds||[],alternativeProductIds:profile.alternativeProductIds||[],
      trackingNote:(profile.trackingNote||'').slice(0,240),version:(prior.data()?.version||0)+1,updatedAt:now(),updatedBy:user.uid};
    version=next.version;tx.set(ref,next);
    newAudit(tx,db,'v3.profile_saved',unitId,user.uid,{productId,before:prior.data()||null,after:next});
   });
   return send(res,200,'Configuração operacional salva.',{version});
  }
  if(action==='v3ArchiveProduct'){
   if(!roles.includes(member.role))return send(res,403,'Somente gerência administra o catálogo.');
   const {productId,active:restore}=req.body||{};
   if(!idOk(productId)||typeof restore!=='boolean')return send(res,400,'Selecione produto e ação.');
   const pref=products.doc(productId),physical=unit.collection('physicalBalances').doc(productId),v3=balances.doc(productId);
   await db.runTransaction(async tx=>{
    const [a,p,oldPhysical,newPhysical,pendingOrders,openSignals]=await Promise.all([
     tx.get(actorRef),tx.get(pref),tx.get(physical),tx.get(v3),tx.get(orders.limit(201)),tx.get(issues.limit(201))]);
    if(!verify(a,unitId,roles))throw Error('FORBIDDEN');
    if(!p.exists)throw Error('NOT_FOUND');
    if(!restore){
     if(pendingOrders.size>200||openSignals.size>200)throw Error('TOO_MANY');
     if((p.data().quantity||0)>0||(oldPhysical.data()?.total||0)>0||(newPhysical.data()?.total||0)>0)throw Error('PRODUCT_HAS_STOCK');
     if(pendingOrders.docs.some(d=>!['received','cancelled'].includes(d.data().status)&&d.data().items?.some(i=>i.productId===productId))||
       openSignals.docs.some(d=>d.data().productId===productId&&d.data().status!=='resolved'))throw Error('PRODUCT_HAS_PENDING');
    }
    tx.update(pref,{status:restore?'active':'inactive',updatedAt:now(),updatedBy:user.uid});
    newAudit(tx,db,restore?'v3.product_restored':'v3.product_archived',unitId,user.uid,{productId});
   });
   return send(res,200,restore?'Insumo reativado.':'Insumo arquivado sem apagar o histórico.');
  }
  if(action==='v3Signal'){
   const {productId,location,observation='missing',note=''}=req.body||{};
   if(!idOk(productId)||!['missing','low','available'].includes(observation)||!reportShortage({productId,location,reporterUid:user.uid,note}).ok)return send(res,400,'Revise produto, local e observação.');
   const ref=issues.doc(createHash('sha256').update(productId+':'+location).digest('hex'));
   await db.runTransaction(async tx=>{
    const [actor,p,old]=await Promise.all([tx.get(actorRef),tx.get(productPath(unit,productId)),tx.get(ref)]);
    if(!verify(actor,unitId,TEAM_ROLES))throw Error('FORBIDDEN');
    if(!p.exists||p.data().status!=='active')throw Error('NOT_FOUND');
    const previous=old.data()||{},reports=Array.isArray(previous.reports)?previous.reports.slice(-19):[];
    if(previous.status!=='resolved'&&reports.some(r=>r.actorUid===user.uid&&r.observation===observation))throw Error('ALREADY_REPORTED');
    reports.push({actorUid:user.uid,at:now(),observation,note:note.trim()});
    tx.set(ref,{productId,productName:p.data().name,location,status:'reported',observation,
      reports,updatedAt:now(),resolution:null,version:(previous.version||0)+1});
    newAudit(tx,db,'v3.stock_signal',unitId,user.uid,{productId,location,observation});
   });
   return send(res,200,'Aviso enviado à equipe.');
  }
  if(action==='v3ResolveSignal'){
   if(!roles.includes(member.role))return send(res,403,'Somente gerência resolve avisos.');
   const {productId,location,resolution}=req.body||{};
   if(!idOk(productId)||!locations.includes(location)||!limitText(resolution)||!resolution.trim())return send(res,400,'Informe a decisão.');
   const ref=issues.doc(createHash('sha256').update(productId+':'+location).digest('hex'));
   await db.runTransaction(async tx=>{
    const [actor,old]=await Promise.all([tx.get(actorRef),tx.get(ref)]);
    if(!verify(actor,unitId,roles))throw Error('FORBIDDEN');
    if(!old.exists||old.data().status==='resolved')throw Error('NOT_FOUND');
    tx.update(ref,{status:'resolved',resolution:resolution.trim(),resolvedBy:user.uid,resolvedAt:now()});
    newAudit(tx,db,'v3.stock_signal_resolved',unitId,user.uid,{productId,location,resolution});
   });
   return send(res,200,'Pendência resolvida sem alterar quantidades.');
  }
  if(action==='v3OrderCreate'){
   if(!roles.includes(member.role))return send(res,403,'Somente gerência cadastra pedidos.');
   const {requestId,etaDate,supplier,items,notes=''}=req.body||{};
   if(!requestOk(requestId)||!dateOk(etaDate)||!limitText(supplier,100)||!supplier.trim()||!limitText(notes)||
      !Array.isArray(items)||!items.length||items.length>40||items.some(x=>!idOk(x?.productId)||!unitNames.includes(x.unit)||!quantity(x.quantity,x.unit)))return send(res,400,'Informe fornecedor, data prevista e itens válidos.');
   const ref=orders.doc(requestId);
   let duplicate=false;
   const fingerprint=createHash('sha256').update(JSON.stringify({etaDate,supplier,items,notes})).digest('hex');
   await db.runTransaction(async tx=>{
    const [actor,old,...ps]=await Promise.all([tx.get(actorRef),tx.get(ref),...items.map(x=>tx.get(productPath(unit,x.productId)))]);
    if(!verify(actor,unitId,roles))throw Error('FORBIDDEN');
    if(old.exists){if(old.data().fingerprint!==fingerprint||old.data().createdBy!==user.uid)throw Error('CONFLICT');duplicate=true;return;}
    if(ps.some(p=>!p.exists||p.data().status!=='active'))throw Error('NOT_FOUND');
    tx.create(ref,{etaDate,supplier:supplier.trim(),notes,items:items.map((x,i)=>({...x,name:ps[i].data().name})),status:'requested',
      channel:'whatsapp',createdAt:now(),createdBy:user.uid,fingerprint,delivered:[],updatedAt:now()});
    newAudit(tx,db,'v3.order_created',unitId,user.uid,{orderId:requestId,etaDate,items});
   });
   return send(res,200,duplicate?'Pedido já registrado.':'Pedido registrado na agenda.',{id:requestId,duplicate});
  }
  if(action==='v3OrderStatus'){
   if(!roles.includes(member.role))return send(res,403,'Somente gerência altera pedidos.');
   const {orderId,status,etaDate=null}=req.body||{};
   if(!requestOk(orderId)||!['confirmed','overdue','cancelled'].includes(status)||etaDate!==null&&!dateOk(etaDate))return send(res,400,'Pedido ou situação inválida.');
   const ref=orders.doc(orderId);
   await db.runTransaction(async tx=>{
    const [actor,p]=await Promise.all([tx.get(actorRef),tx.get(ref)]);
    if(!verify(actor,unitId,roles))throw Error('FORBIDDEN');
    if(!p.exists)throw Error('NOT_FOUND');
    const old=p.data();if(!transitionOrder(old,status).ok)throw Error('INVALID_TRANSITION');
    tx.update(ref,{status,etaDate:etaDate||old.etaDate,updatedAt:now(),updatedBy:user.uid});
    newAudit(tx,db,'v3.order_status',unitId,user.uid,{orderId,before:old.status,after:status});
   });
   return send(res,200,'Situação da entrega atualizada.');
  }
  return send(res,400,'Ação desconhecida.');
 }catch(e){
  const errors={UNAUTHENTICATED:[401,'Faça login.'],FORBIDDEN:[403,'Sem autorização.'],NOT_FOUND:[404,'Insumo ou pedido inexistente.'],
   STALE:[409,'Configuração alterada por outra pessoa. Recarregue antes de salvar.'],INACTIVE:[409,'Insumo arquivado.'],UNIT_LOCKED:[409,'Existe saldo no novo controle. Recontagem e migração supervisionada são necessárias antes de trocar unidade.'],INVALID_SOURCE:[409,'Origem de preparação inválida ou indisponível.'],
   TOO_MANY:[409,'Há muitos registros para validar a operação.'],DUPLICATE_NAME:[409,'Esse nome ou sinônimo já identifica outro insumo. Revise para evitar duplicidade.'],PRODUCT_HAS_STOCK:[409,'Insumo com estoque registrado: reconcilie antes de arquivar.'],PRODUCT_HAS_PENDING:[409,'Há faltas ou pedidos em aberto para esse insumo. Resolva antes de arquivar.'],
   ALREADY_REPORTED:[409,'Sua sinalização já está aberta para este produto e local.'],CONFLICT:[409,'Identificador do pedido já utilizado.'],
   INVALID_TRANSITION:[409,'Transição de pedido incompatível com a situação atual.']};
  if(errors[e.message])return send(res,...errors[e.message]);
  console.error('V3 operation:',e.message);
  return send(res,500,'Não foi possível completar a operação.');
 }
}
