import {configuredProduct} from '../operations/configured-product.js';
import {getDb,authenticate,membership,checkRequest,send} from '../_lib.js';
import {sendQuotaError} from '../quota-error.js';
import {isOperationalProduct} from '../operations/catalog-identity.js';
import {signalUnitChange} from '../live-signal.js';
import {countUnit} from '../operations/logic.js';
import {hasRecipeCycle} from './recipe-graph.js';
import {preparationPlan,validatePreparation} from './preparation-config.js';
import {recipeAvailability,recipeProducts} from './readiness.js';
const management=m=>m?.status==='active'&&['admin','manager','submanager'].includes(m.role);
export default async function preparationHandler(req,res){
 if(!checkRequest(req,res))return;res.setHeader('Cache-Control','no-store');
 let plan;
 try{
  const actor=await authenticate(req),m=await membership(actor.uid);if(!management(m)||!m.unitId)return send(res,403,'Somente gestão pode configurar preparações.');
  const db=getDb(),root=db.collection('units').doc(m.unitId),recipes=root.collection('productionRecipes');
  if(req.body.action==='preparationList'){
   const snap=await recipes.orderBy('name').limit(101).get();if(snap.size>100)return send(res,409,'Limite de cem preparações atingido.');
   const catalog=await root.collection('products').limit(201).get();if(catalog.size>200)return send(res,409,'Catálogo acima do limite desta consulta.');
   const products=await recipeProducts(db,root,snap.docs.map(d=>d.data()),catalog.docs);
   return send(res,200,'Configurações carregadas.',{configurations:snap.docs.filter(d=>!d.data().archivedAt).map(d=>({id:d.id,name:d.data().name,active:d.data().active===true,...recipeAvailability(d.data(),products),version:d.data().version||0,draftVersion:d.data().draftVersion||0,configuration:d.data().configurationDraft||d.data().preparationConfig||null}))});
  }
  const {id,configuration,expectedDraftVersion=0,expectedVersion=0,activate=false}=req.body;
  if(!/^[a-z0-9-]{3,64}$/.test(id||'')||!Number.isInteger(expectedDraftVersion)||!Number.isInteger(expectedVersion)||typeof activate!=='boolean')return send(res,400,'Identificador ou versão inválida.');
  const invalid=validatePreparation(configuration);if(invalid)return send(res,400,invalid);
  const c={type:configuration.type,name:configuration.name.trim(),sourceProductId:configuration.type==='recipe'?'':configuration.sourceProductId,outputProductId:configuration.outputProductId,resultUnit:configuration.resultUnit,batchYield:configuration.batchYield,portionWeight:configuration.type==='recipe'?null:configuration.portionWeight,weightUnit:configuration.weightUnit,method:configuration.method,location:configuration.location,outputPerBatch:configuration.outputPerBatch,ingredients:configuration.ingredients.map(i=>({name:i.name.trim(),amount:i.amount.trim(),unit:i.unit,productId:i.productId||'',tracked:i.tracked}))};
  const ref=recipes.doc(id);
  await db.runTransaction(async tx=>{
   const [a,old,catalog,graph,profiles]=await Promise.all([tx.get(db.doc('memberships/'+actor.uid)),tx.get(ref),tx.get(root.collection('products').limit(201)),tx.get(recipes.limit(101)),tx.get(root.collection('operationalProfiles').limit(201))]);
   if(!management(a.data())||a.data().unitId!==m.unitId)throw Error('FORBIDDEN');
   if((old.data()?.draftVersion||0)!==expectedDraftVersion||(old.data()?.version||0)!==expectedVersion)throw Error('CONFLICT');
   if(catalog.size>200||profiles.size>200||graph.size>100)throw Error('LIMIT');
   const operational=catalog.docs.filter(d=>isOperationalProduct(d.data()));
   const central=await Promise.all(operational.map(d=>d.data().catalogId?tx.get(db.collection('productCatalog').doc(d.data().catalogId)):Promise.resolve(null)));
   const profileMap=new Map(profiles.docs.map(d=>[d.id,d.data()]));
   const products=operational.map((d,i)=>{const p=configuredProduct(d.data(),profileMap.get(d.id));return {id:d.id,...p,physicalUnit:countUnit(p,central[i]?.data())};});
   const ids=[c.outputProductId,...(c.sourceProductId?[c.sourceProductId]:[]),...c.ingredients.filter(i=>i.tracked).map(i=>i.productId)];
   if(ids.some(id=>!products.some(p=>p.id===id)))throw Error('PRODUCT');
   const balanceIds=[...new Set(ids)],balances=await Promise.all(balanceIds.map(id=>tx.get(root.collection('physicalBalances').doc(id))));
   const balanceMap=new Map(balances.map((b,i)=>[balanceIds[i],b.data()||null]));
   plan=preparationPlan(c,products.map(p=>({...p,physicalBalance:balanceMap.get(p.id)})));
   if(activate&&!plan.ready)throw Error('NOT_READY');
   if(activate&&!plan.sameProduct&&hasRecipeCycle([...graph.docs.filter(d=>d.id!==id&&d.data().active===true).map(d=>d.data()),{outputProductId:c.outputProductId,lines:plan.lines}]))throw Error('CYCLE');
   const now=new Date();
   const data={configurationDraft:c,draftVersion:expectedDraftVersion+1,draftUpdatedAt:now,draftUpdatedBy:actor.uid};
   if(!old.exists)Object.assign(data,{name:c.name,active:false,version:0});
   if(activate)Object.assign(data,{name:c.name,active:true,version:expectedVersion+1,preparationConfig:c,stockEffect:plan.sameProduct?'portion_same_product':plan.measured?'measured_transformation':'transformation',portionSize:plan.portionSize||null,stockUnit:plan.stockUnit||null,method:c.method,outputProductId:c.outputProductId,outputUnit:plan.outputUnit,yieldQuantity:plan.yieldQuantity,lines:plan.lines,updatedAt:now,updatedBy:actor.uid});
   tx.set(ref,data,{merge:true});signalUnitChange(tx,db,m.unitId,['production','stock']);
   tx.create(db.collection('auditLogs').doc(),{event:activate?'production.configuration_activated':'production.configuration_draft_saved',unitId:m.unitId,recipeId:id,actorUid:actor.uid,at:now,draftVersion:expectedDraftVersion+1});
  });
  return send(res,200,activate?'Preparação ativada.':'Configuração salva para revisão. Nenhum saldo foi alterado.',{plan});
 }catch(e){const errors={UNAUTHENTICATED:[401,'Faça login.'],FORBIDDEN:[403,'Sem permissão.'],CONFLICT:[409,'A configuração mudou. Recarregue antes de salvar.'],PRODUCT:[409,'Selecione produtos ativos do catálogo desta unidade.'],NOT_READY:[409,'Há pendências na movimentação de estoque. Salve para revisão.'],CYCLE:[409,'Esta configuração criaria um ciclo entre preparações.'],LIMIT:[409,'Limite de consulta atingido.']};if(e.message==='NOT_READY')return send(res,409,plan?.errors?.join(' ')||errors.NOT_READY[1],{plan});if(errors[e.message])return send(res,...errors[e.message]);if(sendQuotaError(res,e))return;console.error('Preparation configuration:',e.message);return send(res,500,'Não foi possível salvar a configuração.');}
}
