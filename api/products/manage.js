import {sendQuotaError} from '../../server/quota-error.js';
import {isOperationalProduct,belongsToOperationalCatalog,usesPhysicalLots} from '../../server/operations/catalog-identity.js';
import {signalUnitChange} from '../../server/live-signal.js';
import measurementsHandler from '../../server/operations/handlers/measurements.js';
import { createHash } from 'node:crypto';
import { getDb, authenticate, membership, checkRequest, send } from '../../server/_lib.js';
import {countUnit} from '../../server/operations/logic.js';

const units = ['kg','g','L','ml','un'];
const normalize = value => typeof value === 'string' ? value.trim().replace(/\s+/g,' ') : '';
const validName = value => value.length >= 2 && value.length <= 100;
const validCategory = value => value.length >= 2 && value.length <= 60;
const validMin = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100000000;
const clean = snap => {
  const d = snap.data();
  return {id:snap.id,name:d.name,category:d.category,unit:d.unit,minStock:d.minStock,
    lotTrackingMode:usesPhysicalLots(d)?'per_lot':d.lotTrackingMode||null,trackExpiry:d.trackExpiry === true,status:d.status,quantity:d.quantity ?? 0,catalogId:d.catalogId||null,
    labelCategory:d.labelCategory||null,operationalUnitOverride:d.operationalUnitOverride||null,receivingUnitOverride:d.receivingUnitOverride||null,
    createdAt:d.createdAt?.toDate?.()?.toISOString?.() || null};
};
export default async function handler(req,res) {
 if(req.body?.action==='measurementGet'||req.body?.action==='measurementSave'){
  req.body.action=req.body.action==='measurementGet'?'get':'save';
  return measurementsHandler(req,res);
 }
  if (!checkRequest(req,res)) return;
  res.setHeader('Cache-Control','no-store');
  try {
    const actor = await authenticate(req);
    const m = await membership(actor.uid);
    if (!m?.unitId) return send(res,403,'Vínculo ativo necessário.');
    const {action} = req.body || {};
    const db = getDb();
    const products = db.collection('units').doc(m.unitId).collection('products');
    if (action === 'list') {
      const [snap,balanceSnap] = await Promise.all([products.limit(201).get(),db.collection('units').doc(m.unitId).collection('physicalBalances').limit(201).get()]);
      if (snap.size > 200) return send(res,409,'Catálogo acima do limite inicial de 200 itens. Paginação necessária.');
      const balances=new Map(balanceSnap.docs.map(doc=>[doc.id,doc.data()]));
      const visible=snap.docs.filter(doc=>belongsToOperationalCatalog(doc.data()));
      const catalogIds=[...new Set(visible.map(doc=>doc.data().catalogId).filter(Boolean))];
      const catalogDocs=catalogIds.length?await db.getAll(...catalogIds.map(id=>db.collection('productCatalog').doc(id))):[];
      const definitions=new Map(catalogDocs.map(doc=>[doc.id,doc.data()]));
      return send(res,200,'Catálogo carregado.',{products:visible.map(doc=>{
       const p=clean(doc),b=balances.get(doc.id);
       return {...p,physicalUnit:countUnit(p,definitions.get(p.catalogId)),physicalBalance:b?{reserve:b.reserve,rotation:b.rotation,total:b.total,
        unit:b.unit,quality:b.quality||null,countedTotal:b.countedTotal??null,entriesSinceCount:b.entriesSinceCount??null,exitsSinceCount:b.exitsSinceCount??null,lastMovementAt:b.lastMovementAt?.toDate?.()?.toISOString?.()||null,at:b.at?.toDate?.()?.toISOString?.()||null}:null};
      }).sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'))});
    }
    if(action==='correctUnits'){
      if(m.role!=='admin')return send(res,403,'Somente administrador pode corrigir unidades.');
      const {productId,operationalUnit,receivingUnit,reason,confirm}=req.body||{};
      if(confirm!=='RECONTAR_UNIDADE'||typeof productId!=='string'||!/^[a-f0-9]{40}$/.test(productId)||
         !units.includes(operationalUnit)||!units.includes(receivingUnit)||
         typeof reason!=='string'||reason.trim().length<8||reason.trim().length>240)
       return send(res,400,'Informe as unidades, justificativa e confirme a necessidade de nova contagem.');
      const productRef=products.doc(productId),memberRef=db.doc('memberships/'+actor.uid);
      const now=new Date();
      await db.runTransaction(async tx=>{
       const [member,product]=await Promise.all([tx.get(memberRef),tx.get(productRef)]);
       const current=member.data();
       if(!current||current.status!=='active'||current.role!=='admin'||current.unitId!==m.unitId)throw Error('FORBIDDEN');
       if(!product.exists)throw Error('NOT_FOUND');
       const old=product.data();
       tx.update(productRef,{operationalUnitOverride:operationalUnit,receivingUnitOverride:receivingUnit,
        unitCorrectionAt:now,unitCorrectionBy:actor.uid,updatedAt:now});
       signalUnitChange(tx,db,m.unitId,['stock', 'catalog']);
       tx.create(db.collection('auditLogs').doc(),{event:'product.units_corrected',
        unitId:m.unitId,productId,actorUid:actor.uid,at:now,
        before:{stockUnit:old.unit,operationalUnitOverride:old.operationalUnitOverride||null,
         receivingUnitOverride:old.receivingUnitOverride||null},
        after:{operationalUnitOverride:operationalUnit,receivingUnitOverride:receivingUnit},
        reason:reason.trim(),requiresNewCount:true});
      });
      return send(res,200,'Unidade operacional corrigida. Registre nova contagem física antes de movimentar.');
    }
    if (!['admin','manager','submanager'].includes(m.role)) return send(res,403,'Somente administração pode alterar o catálogo.');
    if (action !== 'create' && action !== 'update') return send(res,400,'Ação inválida.');
    const {name,category,unit,minStock,trackExpiry} = req.body || {};
    const safeName = normalize(name);
    const safeCategory = normalize(category);
    if (!validName(safeName) || !validCategory(safeCategory) || !units.includes(unit) ||
        !validMin(minStock) || typeof trackExpiry !== 'boolean')
      return send(res,400,'Preencha nome, categoria, unidade, estoque mínimo e validade corretamente.');
    const id = createHash('sha256').update(safeName.toLocaleLowerCase('pt-BR')).digest('hex').slice(0,40);
    const payload = {name:safeName,category:safeCategory,unit,minStock,trackExpiry};
    const actorRef = db.doc('memberships/'+actor.uid);
    const auditRef = db.collection('auditLogs').doc();
    const now = new Date();
    if (action === 'create') {
      const ref = products.doc(id);
      await db.runTransaction(async tx => {
        const [actorSnap, existing] = await Promise.all([tx.get(actorRef),tx.get(ref)]);
        const current = actorSnap.data();
        if (!current || current.status !== 'active' || current.unitId !== m.unitId || !['admin','manager','submanager'].includes(current.role))
          throw new Error('FORBIDDEN');
        if (existing.exists) throw new Error('DUPLICATE');
        tx.create(ref,{...payload,quantity:0,status:'inactive',countFrequency:'weekly',critical:false,reviewRequired:true,createdAt:now,createdBy:actor.uid,updatedAt:now});
        signalUnitChange(tx,db,m.unitId,['stock', 'catalog']);
        tx.create(auditRef,{event:'product.created',unitId:m.unitId,productId:id,actorUid:actor.uid,at:now,details:payload});
      });
      return send(res,201,'Cadastro criado como pendente de revisão; não integra o catálogo operacional de 56 até conciliação.',{id});
    }
    const {productId,status} = req.body || {};
    if (typeof productId !== 'string' || !/^[a-f0-9]{40}$/.test(productId) ||
        !['active','inactive'].includes(status))
      return send(res,400,'Insumo ou situação inválida.');
    const ref = products.doc(productId);
    await db.runTransaction(async tx => {
      const [actorSnap, productSnap] = await Promise.all([tx.get(actorRef),tx.get(ref)]);
      const current = actorSnap.data();
      if (!current || current.status !== 'active' || current.unitId !== m.unitId || !['admin','manager','submanager'].includes(current.role))
        throw new Error('FORBIDDEN');
      if (!productSnap.exists) throw new Error('NOT_FOUND');
      const previous = productSnap.data();
      if(status==='active'&&previous.operationalCatalogVersion!=='56-v1')throw new Error('REVIEW_REQUIRED');
      if (previous.catalogId && (safeName !== previous.name || safeCategory !== previous.category ||
          unit !== previous.unit || trackExpiry !== previous.trackExpiry))
        throw new Error('CATALOG_LOCKED');
      if (previous.unit !== unit && (previous.quantity || 0) !== 0)
        throw new Error('UNIT_LOCKED');
      if (trackExpiry && !previous.trackExpiry && (previous.quantity || 0) !== 0)
        throw new Error('EXPIRY_LOCKED');
      if (createHash('sha256').update(safeName.toLocaleLowerCase('pt-BR')).digest('hex').slice(0,40) !== productId)
        throw new Error('RENAME_NOT_SUPPORTED');
      tx.update(ref,{...payload,status,updatedAt:now,updatedBy:actor.uid});
      signalUnitChange(tx,db,m.unitId,['stock', 'catalog']);
      tx.create(auditRef,{event:'product.updated',unitId:m.unitId,productId,actorUid:actor.uid,at:now,
        before:{name:previous.name,category:previous.category,unit:previous.unit,minStock:previous.minStock,trackExpiry:previous.trackExpiry,status:previous.status},
        after:{...payload,status}});
    });
    return send(res,200,'Insumo atualizado.');
  } catch(e) {
    if (e.message === 'UNAUTHENTICATED') return send(res,401,'Faça login.');
    if (e.message === 'FORBIDDEN') return send(res,403,'Sem permissão.');
    if (e.message === 'DUPLICATE') return send(res,409,'Já existe um insumo com este nome na unidade.');
    if (e.message === 'REVIEW_REQUIRED') return send(res,409,'Cadastro pendente de conciliação; ative pela configuração dos 56 produtos após conferir vínculos e saldos.');
    if (e.message === 'NOT_FOUND') return send(res,404,'Insumo não encontrado.');
    if (e.message === 'EXPIRY_LOCKED') return send(res,409,'Não ative o controle de validade com saldo existente. Regularize o saldo antes de migrar para lotes.');
    if (e.message === 'CATALOG_LOCKED') return send(res,409,'Nome, categoria, unidade e validade pertencem ao catálogo central e não podem ser alterados na unidade.');
    if (e.message === 'UNIT_LOCKED') return send(res,409,'Não altere a unidade de medida de um insumo com saldo.');
    if (e.message === 'RENAME_NOT_SUPPORTED') return send(res,409,'Renomeação ainda não disponível nesta versão; mantenha o nome original.');
    if(sendQuotaError(res,e))return;console.error('Catalog:',e.message);
    return send(res,500,'Não foi possível concluir a operação.');
  }
}
