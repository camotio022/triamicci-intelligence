import {sendQuotaError} from '../../quota-error.js';
import {signalUnitChange} from '../../live-signal.js';
// Aplicação transacional restrita. Revalida estado dentro da transação.
// Por segurança, somente produtos sem controle de lotes e sem embalagens abertas
// podem ser ajustados aqui. Casos complexos permanecem bloqueados.
import {createHash} from 'node:crypto';
import {getDb,authenticate,membership,checkRequest,send} from '../../_lib.js';
import {countUnit} from '../logic.js';
import {reconcilePackageCount} from '../package-reconciliation.js';
import {planPackageAdjustment} from '../package-adjustment-plan.js';
import {canCommitPackageAdjustment} from '../package-commit-guards.js';
const productPattern=/^[a-f0-9]{40}$/;
const requestPattern=/^[a-f0-9-]{36}$/i;
const stamp=x=>x?.toMillis?.()??null;
export default async function handler(req,res){
 if(!checkRequest(req,res))return;
 res.setHeader('Cache-Control','no-store');
 // Liberação exige homologação isolada e habilitação administrativa explícita.
 if(process.env.ENABLE_PACKAGE_BALANCE_APPLY!=='true')return send(res,503,'Aplicação de ajustes ainda não habilitada. Use apenas a prévia.');
 try{
  const user=await authenticate(req),m=await membership(user.uid);
  if(!m?.unitId||m.role!=='admin')return send(res,403,'Somente administrador pode aplicar ajustes.');
  const {action,productId,conferenceId,requestId,expected}=req.body||{};
  if(action!=='apply'||!productPattern.test(productId||'')||!requestPattern.test(conferenceId||'')||!requestPattern.test(requestId||'')||!expected||
    typeof expected!=='object'||Array.isArray(expected))return send(res,400,'Solicitação inválida.');
  const db=getDb(),unit=db.collection('units').doc(m.unitId);
  const actorRef=db.doc('memberships/'+user.uid),productRef=unit.collection('products').doc(productId);
  const conferenceRef=unit.collection('packageConferences').doc(conferenceId),profileRef=unit.collection('measurementProfiles').doc(productId);
  const balanceRef=unit.collection('physicalBalances').doc(productId),recordRef=unit.collection('packageAdjustments').doc(requestId);
  const payloadHash=createHash('sha256').update(JSON.stringify({productId,conferenceId,expected})).digest('hex');
  let duplicate=false,after;
  await db.runTransaction(async tx=>{
   const [actor,product,conference,profile,balance,existing]=await Promise.all([
    tx.get(actorRef),tx.get(productRef),tx.get(conferenceRef),tx.get(profileRef),tx.get(balanceRef),tx.get(recordRef)
   ]);
   if(existing.exists){
    if(existing.data().payloadHash!==payloadHash||existing.data().actorUid!==user.uid)throw Error('CONFLICT');
    duplicate=true;after=existing.data().after;return;
   }
   if(!actor.exists||actor.data().status!=='active'||actor.data().role!=='admin'||actor.data().unitId!==m.unitId)throw Error('FORBIDDEN');
   if(!product.exists||!conference.exists||!profile.exists||!balance.exists)throw Error('MISSING');
   const p=product.data(),conf=conference.data(),cfg=profile.data(),b=balance.data();
   // Não lançar ajustes por este fluxo quando há lotes ou pacotes abertos.
   if(p.status!=='active'||p.trackExpiry===true||conf.opened!==0||conf.closed<0)throw Error('UNSUPPORTED');
   const catalog=p.catalogId?await tx.get(db.collection('productCatalog').doc(p.catalogId)):null;
   const unitName=countUnit(p,catalog?.data()),rule=(cfg.packages||[]).find(x=>x.presentation===conf.presentation);
   const computed=reconcilePackageCount({closed:conf.closed,opened:conf.opened,presentation:conf.presentation,
    rule,profileVersion:cfg.version,stockUnit:unitName});
   if(!computed.ok)throw Error('UNVERIFIED');
   const guards=canCommitPackageAdjustment({actor:actor.data(),conference:{...conf,id:conferenceId},profile:cfg,balance:b,
    expected:{...expected,unitId:m.unitId,productId,conferenceId,unit:unitName,quantity:computed.quantity},
    lotStatus:'NOT_TRACKED',lotAllocationsValid:false});
   if(!guards.ok||expected.quantity!==computed.quantity||expected.area!==conf.area||
    expected.balanceCountId!==b.countId||expected.balanceMovementMillis!==stamp(b.lastMovementAt??b.at))throw Error('STALE');
   const plan=planPackageAdjustment({balance:b,area:conf.area,quantity:computed.quantity,unit:unitName});
   if(!plan.ok)throw Error('INVALID_PLAN');
   const now=new Date();
   tx.update(balanceRef,{reserve:plan.after.reserve,rotation:plan.after.rotation,total:plan.after.total,
    lastMovementAt:now,lastPackageAdjustmentId:requestId,
    // Uma contagem nova após um ajuste terá seu próprio countId; aqui preservamos o countId anterior.
    entriesSinceCount:null,exitsSinceCount:null});
   tx.create(recordRef,{productId,conferenceId,unitId:m.unitId,actorUid:user.uid,payloadHash,at:now,
    area:conf.area,unit:unitName,profileVersion:cfg.version,change:plan.change,before:plan.before,after:plan.after});
   signalUnitChange(tx,db,m.unitId,['stock', 'catalog']);
   tx.create(db.collection('auditLogs').doc(),{event:'physical.package_adjusted',productId,unitId:m.unitId,
    actorUid:user.uid,operationId:requestId,at:now,details:{conferenceId,area:conf.area,profileVersion:cfg.version,before:plan.before,after:plan.after}});
   after=plan.after;
  });
  return send(res,200,duplicate?'Ajuste já aplicado.':'Ajuste registrado com auditoria.',{duplicate,after});
 }catch(e){
  const errors={UNAUTHENTICATED:[401,'Faça login.'],FORBIDDEN:[403,'Acesso negado.'],MISSING:[404,'Conferência ou saldo não encontrado.'],
   UNSUPPORTED:[409,'Ajuste automático indisponível para lote, produto inativo ou embalagem aberta.'],
   UNVERIFIED:[409,'Embalagem não homologada.'],STALE:[409,'Saldo ou configuração mudou. Refaça a prévia.'],
   CONFLICT:[409,'Identificador já utilizado com outros dados.'],INVALID_PLAN:[409,'Plano de ajuste inválido.']};
  if(errors[e.message])return send(res,...errors[e.message]);
  if(sendQuotaError(res,e))return;console.error('Package adjustment:',e.message);return send(res,500,'Não foi possível aplicar o ajuste.');
 }
}
