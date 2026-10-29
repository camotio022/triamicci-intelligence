import operationalCatalog from '../../server/catalog/activate-draft.js';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {getDb,authenticate,membership,checkRequest,send} from '../../server/_lib.js';

const allowedUnits = new Set(['kg','L','un']);
const approvedNames=new Set(JSON.parse(readFileSync(new URL('../../data/triamicci-catalogo-operacional-56.revisao.json',import.meta.url),'utf8')).products.map(p=>p.name));
const genericIds = new Set(['queijos','massas','hortifruti','temperos']);
const normalizedName=name=>String(name||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLocaleLowerCase('pt-BR');
const approvedNormalized=new Set([...approvedNames].map(normalizedName));
const inRevisedCatalog=p=>approvedNormalized.has(normalizedName(p.name));
const eligible=p=>p.schemaVersion===2&&p.reviewRequired!==true&&p.ingredientsPending!==true&&
  ['supplier','internal'].includes(p.source)&&
  ['kg','L','un'].includes(p.operationalUnit)&&
  (p.source==='internal'||['kg','L','un'].includes(p.receivingUnit));
const hashId = name => createHash('sha256').update(name.trim().toLocaleLowerCase('pt-BR')).digest('hex').slice(0,40);

export default async function handler(req,res){
 if(req.body?.module==='operationalCatalog')return operationalCatalog(req,res);
  if(!checkRequest(req,res))return;
  res.setHeader('Cache-Control','no-store');
  try{
    const actor=await authenticate(req);
    const m=await membership(actor.uid);
    if(!m?.unitId)return send(res,403,'Vínculo ativo necessário.');
    const db=getDb(), catalog=db.collection('productCatalog');
    if(req.body?.action==='list'){
      const snap=await catalog.limit(201).get();
      if(snap.size>200)return send(res,409,'Catálogo acima do limite de 200 itens.');
      const items=snap.docs.map(doc=>{
        const p=doc.data();
        return {id:doc.id,name:p.name,category:p.category,stockUnit:p.stockUnit,
          type:p.type,trackExpiry:p.trackExpiry===true,relatedProducts:p.relatedProducts||[],
          producedFrom:p.producedFrom||[],notes:p.notes||'',active:p.active===true,
          reviewRequired:p.active!==true || genericIds.has(doc.id) || !inRevisedCatalog(p),
          approvalEligible:!genericIds.has(doc.id)&&inRevisedCatalog(p)&&eligible(p),schemaVersion:p.schemaVersion||1,
          receivingUnit:p.receivingUnit||null,operationalUnit:p.operationalUnit||null};
      }).sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'));
      return send(res,200,'Catálogo central carregado.',{catalog:items});
    }
    if(req.body?.action==='activateUnitCatalog')return send(res,409,'Ative e concilie individualmente em Configurar 56 produtos.');
    if(req.body?.action==='approveBatch'){
      if(m.role!=='admin')return send(res,403,'Aprovação restrita ao administrador.');
      const ids=req.body.catalogIds;
      if(!Array.isArray(ids)||ids.length<1||ids.length>30||new Set(ids).size!==ids.length||
        ids.some(id=>typeof id!=='string'||!/^[a-z0-9-]{2,80}$/.test(id)||genericIds.has(id)))
        return send(res,400,'Selecione somente IDs específicos válidos e sem duplicatas.');
      const refs=ids.map(id=>catalog.doc(id));
      const actorRef=db.doc('memberships/'+actor.uid),now=new Date();
      const outcome={approved:[],alreadyActive:[],rejected:[]};
      await db.runTransaction(async tx=>{
        const [memberSnap,...snaps]=await Promise.all([tx.get(actorRef),...refs.map(ref=>tx.get(ref))]);
        const current=memberSnap.data();
        if(!current||current.status!=='active'||current.unitId!==m.unitId||current.role!=='admin')throw new Error('FORBIDDEN');
        for(let i=0;i<snaps.length;i++){
          const doc=snaps[i],id=ids[i];const product=doc.data();
          if(!doc.exists||typeof product.name!=='string'||!allowedUnits.has(product.stockUnit)||
           typeof product.category!=='string'||typeof product.trackExpiry!=='boolean'||
           !eligible(product)||!inRevisedCatalog(product)){
             outcome.rejected.push(id);continue;
          }
          if(product.active===true){outcome.alreadyActive.push(id);continue;}
          tx.update(refs[i],{active:true,approvedAt:now,approvedBy:actor.uid});
          tx.create(db.collection('auditLogs').doc(),{event:'catalog.approved_batch',catalogId:id,
           actorUid:actor.uid,unitId:m.unitId,at:now});
          outcome.approved.push(id);
        }
      });
      return send(res,200,'Revisão em lote concluída.',outcome);
    }
    if(req.body?.action==='approve'){
      if(m.role!=='admin')return send(res,403,'Aprovação restrita ao administrador.');
      const {catalogId}=req.body;
      if(typeof catalogId!=='string'||!/^[a-z0-9-]{2,80}$/.test(catalogId))
        return send(res,400,'Identificador inválido.');
      if(genericIds.has(catalogId))return send(res,409,'Item genérico: defina o produto específico antes de aprovar.');
      const catalogRef=catalog.doc(catalogId),actorRef=db.doc('memberships/'+actor.uid),auditRef=db.collection('auditLogs').doc();
      const now=new Date();
      await db.runTransaction(async tx=>{
        const [memberSnap,catSnap]=await Promise.all([tx.get(actorRef),tx.get(catalogRef)]);
        const current=memberSnap.data();
        if(!current||current.status!=='active'||current.unitId!==m.unitId||current.role!=='admin')throw new Error('FORBIDDEN');
        if(!catSnap.exists)throw new Error('NOT_FOUND');
        const p=catSnap.data();
        if(typeof p.name!=='string'||!allowedUnits.has(p.stockUnit)||typeof p.category!=='string'||
          typeof p.trackExpiry!=='boolean'||!eligible(p)||!inRevisedCatalog(p))throw new Error('INVALID_CATALOG');
        if(p.active===true)return;
        tx.update(catalogRef,{active:true,approvedAt:now,approvedBy:actor.uid});
        tx.create(auditRef,{event:'catalog.approved',unitId:m.unitId,catalogId,actorUid:actor.uid,at:now});
      });
      return send(res,200,'Produto aprovado no catálogo central.');
    }
    if(req.body?.action!=='attach')return send(res,400,'Ação inválida.');
    if(!['admin','manager','submanager'].includes(m.role))return send(res,403,'Acesso restrito à gestão.');
    return send(res,409,'Vincule o produto em Configurar 56 produtos, com revisão de identidade e saldo.');
  }catch(e){
    if(e.message==='UNAUTHENTICATED')return send(res,401,'Faça login.');
    if(e.message==='FORBIDDEN')return send(res,403,'Sem permissão.');
    if(e.message==='NOT_FOUND')return send(res,404,'Produto não encontrado no catálogo central.');
    if(e.message==='NOT_APPROVED')return send(res,409,'Produto ainda não aprovado no catálogo central.');
    if(e.message==='INVALID_CATALOG')return send(res,409,'Produto central precisa de revisão técnica.');
    if(e.message==='CATALOG_CONFLICT')return send(res,409,'Existe conflito entre IDs e produtos existentes; nenhum dado foi modificado.');
    if(e.message==='DUPLICATE')return send(res,409,'Este produto já está cadastrado na unidade.');
    console.error('Catalog attach:',e.message);
    return send(res,500,'Falha ao consultar ou vincular catálogo.');
  }
}
