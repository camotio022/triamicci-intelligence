import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
test('56 produtos: ativação, conciliação, pedido, aprovação, giro, produção e contagem usam os mesmos IDs',{timeout:120000},async()=>{
 const project='demo-triamicci-v31',unitId='catalog-56-'+randomUUID();
 const {privateKey}=generateKeyPairSync('rsa',{modulusLength:2048});
 Object.assign(process.env,{APP_ENV:'staging',PUBLIC_APP_URL:'https://triamicci-e2e.test',FIREBASE_EXPECTED_PROJECT_ID:project,FIRESTORE_EMULATOR_HOST:'127.0.0.1:8080',FIREBASE_AUTH_EMULATOR_HOST:'127.0.0.1:9099',FIREBASE_SERVICE_ACCOUNT_JSON:JSON.stringify({project_id:project,client_email:'catalog@'+project+'.iam.gserviceaccount.com',private_key:privateKey.export({type:'pkcs8',format:'pem'}).toString()})});
 const [{getDb},{default:activate},{default:products},{default:kitchen},{default:shipments},{default:production},{default:stock}]=await Promise.all([import('../server/_lib.js'),import('../api/catalog/manage.js'),import('../api/products/manage.js'),import('../server/operations/v3-service.js'),import('../server/operations/shipments.js'),import('../api/production/manage.js'),import('../api/operations/stock.js')]);
 const db=getDb(),root=db.collection('units').doc(unitId),manifest=JSON.parse(readFileSync(new URL('../data/triamicci-product-catalog-56.staging.json',import.meta.url))).products;
 const signup=async(role,tenant=unitId)=>{
  const r=await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=local',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:randomUUID()+'@catalog.test',password:'test-password-56',returnSecureToken:true})});const u=await r.json();assert.equal(r.status,200);
  await db.doc('memberships/'+u.localId).set({unitId:tenant,status:'active',role});return {uid:u.localId,token:u.idToken};
 };
 const manager=await signup('manager'),aux=await signup('auxiliar'),foreign=await signup('manager','other-unit-'+randomUUID());
 const call=async(handler,actor,action,extra={})=>{
  const res={code:200,setHeader(){},status(c){this.code=c;return this},json(data){this.data=data;return this}};
  await handler({method:'POST',headers:{origin:'https://triamicci-e2e.test','content-type':'application/json',authorization:'Bearer '+actor.token},body:{...(handler===activate?{module:'operationalCatalog'}:{}),action,...extra}},res);return {code:res.code,...res.data};
 };
 const approved=p=>({...p,...(p.id==='bacon'?{stockUnit:'kg',receivingUnit:'kg',operationalUnit:'un'}:{}),minStock:0,countFrequency:'daily',critical:false,reviewConfirmed:true});
 assert.equal((await call(activate,aux,'activate',approved(manifest[0]))).code,403);
 const oldId='a'.repeat(40),old={name:' FEIJAO ',unit:'kg',status:'active',trackExpiry:true,quantity:12};
 await root.collection('products').doc(oldId).set(old);
 await root.collection('physicalBalances').doc(oldId).set({unit:'kg',reserve:12,rotation:0,total:12});
 await root.collection('physicalCounts').doc('previous').set({productId:oldId,total:12,unit:'kg',at:new Date()});
 const beans=manifest.find(p=>p.id==='feijao');
 assert.equal((await call(activate,manager,'activate',approved(beans))).code,409,'Não duplicar nome equivalente');
 const status=await call(activate,manager,'status');assert.equal(status.code,200,JSON.stringify(status));assert.equal(status.items.find(p=>p.id==='feijao').needsReconciliation,true);
 const invalid=await call(activate,manager,'activate',{...approved(beans),existingProductId:oldId,stockUnit:'un',operationalUnit:'un',receivingUnit:'un'});assert.equal(invalid.code,409);
 const reconciled=await call(activate,manager,'activate',{...approved(beans),existingProductId:oldId});assert.equal(reconciled.code,200,JSON.stringify(reconciled));assert.equal(reconciled.productId,oldId);
 assert.equal((await root.collection('physicalBalances').doc(oldId).get()).data().total,12);
 assert.equal((await root.collection('physicalCounts').doc('previous').get()).data().productId,oldId);
 const ids=new Map([['feijao',oldId]]);
 for(const p of manifest.filter(p=>p.id!=='feijao')){
  const result=await call(activate,manager,'activate',approved(p));assert.equal(result.code,200,JSON.stringify({product:p.id,result}));ids.set(p.id,result.productId);
  const profile=(await root.collection('operationalProfiles').doc(result.productId).get()).data();assert.equal(profile.countUnit,approved(p).operationalUnit);assert.equal(profile.origin,p.source);
 }
 assert.equal((await call(products,aux,'list')).products.length,56);
 assert.equal((await call(kitchen,aux,'v3Dashboard')).products.length,56);
 assert.equal((await call(activate,foreign,'status')).items.some(p=>p.active),false);
 assert.equal((await call(activate,manager,'activate',approved(manifest[0]))).code,409);
 assert.equal((await root.collection('products').get()).size,56);
 // Peso comercial e contagem em peças são medições distintas, nunca conversão automática.
 const bacon=ids.get('bacon'),measuredShipment={requestId:randomUUID(),supplier:'Fornecedor fictício',notes:'TESTE peso comercial e peças aferidas',lines:[{productId:bacon,commercialQuantity:2.5,commercialUnit:'kg',stockQuantity:10,location:'reserva',lot:'TESTE-PECAS',expiryDate:'2099-12-31'}]};
 assert.equal((await call(shipments,aux,'shipmentInspect',{...measuredShipment,requestId:randomUUID(),lines:measuredShipment.lines.map(l=>({...l,stockQuantity:0}))})).code,409,'Peso não substitui contagem de peças');
 assert.equal((await call(shipments,aux,'shipmentInspect',measuredShipment)).code,200);
 assert.equal((await root.collection('physicalBalances').doc(bacon).get()).data().total,0);
 assert.equal((await call(shipments,manager,'shipmentApprove',{requestId:measuredShipment.requestId})).code,200);
 const measuredBalance=(await root.collection('physicalBalances').doc(bacon).get()).data();assert.equal(measuredBalance.unit,'un');assert.equal(measuredBalance.total,10);
 assert.equal((await call(products,aux,'list')).products.find(p=>p.id===bacon).physicalUnit,'un');
 const bife=ids.get('bife-de-alcatra'),raw=ids.get('peito-de-frango'),out=ids.get('strogonoff-de-frango');
 const orderId=randomUUID();
 const order=await call(kitchen,manager,'v3OrderCreate',{requestId:orderId,etaDate:'2099-12-01',supplier:'Fornecedor fictício',items:[{productId:bife,quantity:10,unit:'un'},{productId:raw,quantity:3,unit:'kg'}],notes:'Teste isolado'});assert.equal(order.code,200,JSON.stringify(order));
 const shipment={requestId:randomUUID(),orderId,supplier:'Fornecedor fictício',notes:'Teste isolado',lines:[{productId:bife,commercialQuantity:10,commercialUnit:'un',stockQuantity:10,location:'reserva',lot:'TESTE-LOTE',expiryDate:'2099-12-31'},{productId:raw,commercialQuantity:3,commercialUnit:'kg',stockQuantity:3,location:'reserva',lot:'TESTE-LOTE',expiryDate:'2099-12-31'}]};
 // Reproduz um cadastro já ativado antes da correção, sem a flag de lotes.
 await root.collection('products').doc(raw).update({lotTrackingMode:(await import('firebase-admin/firestore')).FieldValue.delete()});
 const invalidShipment={...shipment,requestId:randomUUID(),lines:shipment.lines.map(l=>({...l,lot:'',expiryDate:''}))};
 assert.equal((await call(shipments,aux,'shipmentInspect',invalidShipment)).code,409,'Validade exige lote mesmo sem flag antiga');
 assert.equal((await call(shipments,aux,'shipmentInspect',shipment)).code,200);
 assert.equal((await root.collection('physicalLots').doc(raw).collection('lots').get()).size,0,'Conferência não cria saldo nem lote');
 assert.equal((await root.collection('physicalBalances').doc(bife).get()).data().total,0);
 assert.equal((await call(shipments,aux,'shipmentApprove',{requestId:shipment.requestId})).code,403);
 assert.equal((await call(shipments,manager,'shipmentApprove',{requestId:shipment.requestId})).code,200);
 assert.equal((await call(shipments,manager,'shipmentApprove',{requestId:shipment.requestId})).duplicate,true);
 assert.equal((await root.collection('physicalBalances').doc(bife).get()).data().total,10);
 assert.equal((await call(kitchen,aux,'v3Transfer',{requestId:randomUUID(),productId:raw,from:'reserva',to:'giro',quantity:1.5,notes:'Teste'})).code,200);
 assert.equal((await root.collection('physicalBalances').doc(raw).get()).data().total,3);
 const lots=await call(kitchen,aux,'v3Lots',{productId:raw});assert.equal(lots.code,200);assert.equal(lots.lots.length,1);
 assert.equal(lots.lots[0].reserva,1.5);assert.equal(lots.lots[0].giro,1.5);assert.equal(lots.lots[0].availableQuantity,3);
 const sessionId=randomUUID();
 for(const location of ['reserva','giro']){
  const counted=await call(kitchen,manager,'v3Count',{productId:raw,requestId:randomUUID(),sessionId,location,quantity:1.5,lotCounts:[{id:lots.lots[0].id,quantity:1.5}],notes:'TESTE mesma rodada'});
  assert.equal(counted.code,200,JSON.stringify(counted));
 }
 const confirmed=(await root.collection('physicalBalances').doc(raw).get()).data();
 assert.equal(confirmed.countSessions.reserva,sessionId);assert.equal(confirmed.countSessions.giro,sessionId);assert.equal(confirmed.quality,'PHYSICAL_COUNT');
 assert.equal(confirmed.countedTotal,3);
 const recipe={id:'catalog-test-preparo',name:'Ficha fictícia de homologação',yieldQuantity:1,outputProductId:out,lines:[{productId:raw,quantity:1,location:'giro',substitutes:[]}]};
 assert.equal((await call(production,manager,'saveRecipe',recipe)).code,200);
 const run={recipeId:recipe.id,requestId:randomUUID(),portions:1,items:[{productId:raw,quantity:1}],notes:'TESTE ISOLADO',outputLot:'TESTE-PRODUCAO',expiryDate:'2099-12-31'};
 assert.equal((await call(production,aux,'finish',run)).code,200);
 assert.equal((await call(production,aux,'finish',run)).duplicate,true);
 const balance=(await root.collection('physicalBalances').doc(raw).get()).data();assert.equal(balance.reserve,1.5);assert.equal(balance.rotation,0.5);assert.equal(balance.total,2);
 assert.equal((await root.collection('physicalBalances').doc(out).get()).data().total,1);
 const count={productId:raw,requestId:randomUUID(),reserve:1.5,rotation:0.5,notes:'TESTE'};
 assert.equal((await call(stock,aux,'count',count)).code,403);
 assert.equal((await call(stock,manager,'count',count)).code,200);
 assert.equal((await call(products,aux,'list')).products.find(p=>p.id===raw).physicalBalance.total,2);
 const legacy='b'.repeat(40);await root.collection('products').doc(legacy).set({name:'Experimento',status:'active',unit:'un'});await root.collection('operationalProfiles').doc(legacy).set({origin:'supplier',controlMode:'quantitative',countUnit:'un',locations:['reserva','giro']});
 assert.equal((await call(products,aux,'list')).products.some(p=>p.id===legacy),false);
 assert.equal((await call(kitchen,aux,'v3Dashboard')).products.some(p=>p.id===legacy),false);
 assert.notEqual((await call(kitchen,manager,'v3OrderCreate',{...order,requestId:randomUUID(),etaDate:'2099-12-01',supplier:'Teste',items:[{productId:legacy,quantity:1,unit:'un'}]})).code,200);
 assert.notEqual((await call(stock,manager,'count',{...count,requestId:randomUUID(),productId:legacy})).code,200);
 assert.equal((await root.collection('physicalBalances').doc(legacy).get()).exists,false);
});
