import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,randomUUID} from 'node:crypto';
import {checklistPhotoBase64} from './fixtures/checklist-photo.js';
test('auditoria produção: unidades, dependências, transformação medida, lotes, idempotência, concorrência e isolamento',{timeout:90000},async()=>{
 const project='demo-triamicci-v31',{privateKey}=generateKeyPairSync('rsa',{modulusLength:2048});
 Object.assign(process.env,{APP_ENV:'staging',PUBLIC_APP_URL:'https://triamicci-e2e.test',FIREBASE_EXPECTED_PROJECT_ID:project,FIRESTORE_EMULATOR_HOST:'127.0.0.1:8080',FIREBASE_AUTH_EMULATOR_HOST:'127.0.0.1:9099',FIREBASE_SERVICE_ACCOUNT_JSON:JSON.stringify({project_id:project,client_email:'audit@'+project+'.iam.gserviceaccount.com',private_key:privateKey.export({type:'pkcs8',format:'pem'}).toString()})});
 const [{getDb},{default:handler},{default:stockHandler}]=await Promise.all([import('../server/_lib.js'),import('../api/production/manage.js'),import('../api/operations/stock.js')]);
 const db=getDb(),unitId='audit-'+randomUUID(),unit=db.collection('units').doc(unitId);
 const user=async(role,tenant=unitId)=>{const r=await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=local',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:randomUUID()+'@audit.test',password:'only-test-password',returnSecureToken:true})});const u=await r.json();assert.equal(r.status,200);await db.doc('memberships/'+u.localId).set({unitId:tenant,role,status:'active',displayName:role+' auditoria'});return {uid:u.localId,token:u.idToken}};
 const manager=await user('manager'),aux=await user('auxiliar'),foreign=await user('manager','other-'+unitId);
 const call=async(actor,action,payload={},route=handler)=>{const res={code:200,setHeader(){},status(n){this.code=n;return this},json(body){this.body=body;return this}};await route({method:'POST',headers:{origin:'https://triamicci-e2e.test','content-type':'application/json',authorization:'Bearer '+actor.token},body:{action,...payload}},res);return {http:res.code,...res.body}};
 const a='a'.repeat(40),b='b'.repeat(40),c='c'.repeat(40);
 const product=(name,unit)=>({name,unit,status:'active',operationalCatalogVersion:'56-v1'});
 await unit.collection('products').doc(a).set({...product('Tilápia','kg'),lotTrackingMode:'per_lot'});
 await unit.collection('products').doc(b).set({...product('Iscas','un'),lotTrackingMode:'per_lot'});
 await unit.collection('products').doc(c).set(product('Molho','g'));
 const source=unit.collection('physicalBalances').doc(a),target=unit.collection('physicalBalances').doc(b);
 await source.set({unit:'kg',reserve:10,rotation:0,total:10});
 await unit.collection('physicalLots').doc(a).collection('lots').doc('raw').set({unit:'kg',lot:'RECEBIDO',expiryDate:'2099-12-31',reserva:10,giro:0,availableQuantity:10});
 const config={type:'transform',name:'Isca de tilápia',sourceProductId:a,outputProductId:b,portionWeight:330,weightUnit:'g',resultUnit:'porcao',batchYield:1,method:'',location:'reserva',outputPerBatch:null,ingredients:[]};
 const id='isca-audit';assert.equal((await call(manager,'savePreparation',{id,configuration:config,activate:true})).http,200);
 const saved=(await unit.collection('productionRecipes').doc(id).get()).data();assert.equal(saved.stockEffect,'measured_transformation');assert.equal(saved.lines[0].quantity,null);assert.equal((await source.get()).data().total,10);assert.equal((await target.get()).exists,false);
 assert.equal((await call(aux,'list')).recipes.some(r=>r.id===id),true);
 const planned=await call(aux,'dayAdd',{recipeId:id,plannedQuantity:5});assert.equal(planned.http,200,'Auxiliar pode planejar na própria unidade');
 assert.equal((await call(foreign,'dayAdd',{recipeId:id})).http,404,'Planejamento não atravessa unidades');
 assert.equal((await call(aux,'dayAdd',{recipeId:id,plannedQuantity:1.5})).http,400,'Meta de porções exige inteiro');
 const photoId=randomUUID(),photoPayload={requestId:photoId,items:[{recipeId:id,plannedQuantity:12}]};
 const stockBefore=(await source.get()).data().total;
 const image=checklistPhotoBase64;
 const originalFetch=globalThis.fetch;
 const originalKey=process.env.PRODUCTION_VISION_API_KEY;
 let providerCalls=0;
 try{
  process.env.PRODUCTION_VISION_API_KEY='test-key';
  globalThis.fetch=(url,options)=>{
   if(url!=='https://vision.googleapis.com/v1/images:annotate')return originalFetch(url,options);
   providerCalls++;
   return Promise.resolve(Response.json({responses:[{}]}));
  };
  const cashier=await user('cashier');
  assert.equal((await call({token:'invalid'},'photoRecognize',{image})).http,401);
  assert.equal((await call(cashier,'photoRecognize',{image})).http,403);
  assert.equal((await call(aux,'photoRecognize',{image:'not a JPEG'})).http,400);
  const empty=await call(aux,'photoRecognize',{image,unitId:'other-'+unitId});
  assert.equal(empty.http,200);
  assert.deepEqual(empty.lines,[]);
  assert.equal(providerCalls,1);
  assert.equal((await unit.collection('operationalLimits').doc('production-photo-ocr').get()).data().count,1);
  assert.equal((await call(aux,'dayList')).tasks.length,1,'Reconhecer não cria tarefas');
  assert.equal((await source.get()).data().total,stockBefore);
 }finally{
  globalThis.fetch=originalFetch;
  if(originalKey===undefined)delete process.env.PRODUCTION_VISION_API_KEY;
  else process.env.PRODUCTION_VISION_API_KEY=originalKey;
 }
 const imported=await call(aux,'dayImport',photoPayload);
 assert.equal(imported.http,200,JSON.stringify(imported));
 assert.equal(imported.taskIds.length,1);
 assert.equal((await unit.collection('productionDays').doc(new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo'}).format(new Date())).collection('tasks').doc(imported.taskIds[0]).get()).exists,true);
 const replayPhoto=await call(aux,'dayImport',photoPayload);
 assert.equal(replayPhoto.http,200);assert.equal(replayPhoto.already,true);
 assert.deepEqual(replayPhoto.taskIds,imported.taskIds);
 assert.equal((await call(aux,'dayImport',{requestId:photoId,items:[{recipeId:id,plannedQuantity:13}]})).http,409,'Reenvio modificado não pode sobrescrever tarefas anteriores');
 assert.equal((await call(aux,'dayImport',{requestId:randomUUID(),items:[{recipeId:id,plannedQuantity:1.5}]})).http,400);
 assert.equal((await call(foreign,'dayImport',photoPayload)).http,404);
 assert.equal((await source.get()).data().total,stockBefore,'Importar foto não movimenta estoque');
 const runId=randomUUID(),payload={recipeId:id,requestId:runId,portions:5,items:[{productId:a,quantity:2}],outputLot:'ISCA-1',expiryDate:'2099-12-30'};
 assert.equal((await call(foreign,'finish',payload)).http,404,'Nenhum acesso ao estoque da outra unidade');
 assert.equal((await call(aux,'savePreparation',{id:'aux-block',configuration:config,activate:true})).http,403);
 assert.equal((await call(aux,'finish',{...payload,outputLot:''})).http,409);
 assert.equal((await call(aux,'finish',{...payload,items:[{productId:a,quantity:11}]})).http,409);
 assert.equal((await call(aux,'finish',{...payload,items:[{productId:c,quantity:1}]})).http,409);
 assert.equal((await call(aux,'finish',{...payload,portions:1.5})).http,409);
 const result=await call(aux,'finish',payload);assert.equal(result.http,200,JSON.stringify(result));
 assert.equal((await source.get()).data().total,8,'Consumo medido de 2 kg, não 5 × 330 g');assert.equal((await target.get()).data().total,5);
 assert.equal((await unit.collection('physicalLots').doc(a).collection('lots').doc('raw').get()).data().reserva,8);
 const replay=await call(aux,'finish',payload);assert.equal(replay.duplicate,true);assert.equal((await target.get()).data().total,5);
 assert.equal((await call(aux,'finish',{...payload,portions:6})).http,409);
 const run=(await unit.collection('productionRuns').doc(runId).get()).data();assert.equal(run.items[0].quantity,2);assert.equal(run.items[0].lots[0].lot,'RECEBIDO');assert.equal(run.actorName,'auxiliar auditoria');
 // Duas execuções disputam a mesma matéria-prima: só uma pode consumir 5 kg.
 const race=await Promise.all([aux,manager].map(actor=>call(actor,'finish',{...payload,requestId:randomUUID(),items:[{productId:a,quantity:5}],portions:10})));
 assert.deepEqual(race.map(r=>r.http).sort(),[200,409]);assert.equal((await source.get()).data().total,3);assert.equal((await target.get()).data().total,15);
 // Cadastro permite ativar a ficha com saldo físico divergente; a execução continua impedida até conciliar.
 const molho=unit.collection('physicalBalances').doc(c);await molho.set({unit:'kg',reserve:0,rotation:0,total:0});
 const recipe={...config,type:'recipe',name:'Molho audit',sourceProductId:'',outputProductId:c,resultUnit:'balde',outputPerBatch:900,ingredients:[{name:'Ingrediente',amount:'100',unit:'g',tracked:true,productId:a}]};
 const invalid=await call(manager,'savePreparation',{id:'molho-audit',configuration:recipe,activate:true});assert.equal(invalid.http,200,JSON.stringify(invalid));assert.equal((await molho.get()).data().unit,'kg');assert.equal((await unit.collection('productionRecipes').doc('molho-audit').get()).exists,true);
 // Cadastro ainda ativo, mas dependência inativa: mesmo diagnóstico nas duas listas.
 await unit.collection('products').doc(a).update({status:'inactive'});
 const list=await call(aux,'list');assert.equal(list.recipes.some(r=>r.id===id),false);assert.match(list.blockedRecipes.find(r=>r.id===id).errors.join(' '),/Tilápia/);
 const setups=await call(manager,'preparationList');const isca=setups.configurations.find(r=>r.id===id);assert.equal(isca.active,true);assert.equal(isca.available,false);
 assert.equal((await call(manager,'dayAdd',{recipeId:id})).http,404);
 // Dados antigos ganham nomes na leitura; snapshots e documentos originais permanecem.
 await unit.collection('physicalCounts').doc('legacy').set({productId:a,actorUid:manager.uid,at:new Date(),reserve:3,rotation:0,total:3,unit:'kg'});
 await unit.collection('physicalTransfers').doc('foreign-person').set({productId:a,actorUid:foreign.uid,at:new Date(),quantity:1,unit:'kg'});
 const history=await call(manager,'list',{},stockHandler);assert.equal(history.counts[0].productName,'Tilápia');assert.equal(history.counts[0].actorName,'manager auditoria');assert.equal(history.transfers[0].actorName,undefined);assert.equal((await unit.collection('physicalCounts').doc('legacy').get()).data().productName,undefined);
 // Prorrogação é uma declaração explícita, auditada e idempotente; não fabrica saída.
 const {default:attendance}=await import('../server/workflows/attendance-v31.js');
 const {restaurantDay}=await import('../server/schedules/restaurant-today.js');
 assert.equal((await call(aux,'continue_work',{requestId:randomUUID()},attendance)).http,409,'Não abre jornada por prorrogação');
 const entry=await call(aux,'clock_in',{requestId:randomUUID()},attendance);assert.equal(entry.http,200);
 const extensionId=randomUUID();assert.equal((await call(aux,'continue_work',{requestId:extensionId},attendance)).http,200);
 const attendanceRef=unit.collection('attendanceV31').doc(entry.day+'_'+aux.uid),declared=(await attendanceRef.get()).data();
 assert.equal(declared.status,'working');assert.equal(declared.events.some(e=>e.action==='clock_out'),false);assert.equal(declared.events.at(-1).action,'continue_work');assert.ok(declared.extendedUntil.toMillis()>Date.now());
 assert.equal((await call(aux,'continue_work',{requestId:extensionId},attendance)).duplicate,true);assert.equal((await attendanceRef.get()).data().extendedUntil.toMillis(),declared.extendedUntil.toMillis());
 const team=await call(aux,'teamToday',{},attendance);assert.equal(team.presence.find(p=>p.uid===aux.uid).day,declared.day);assert.ok(team.presence.find(p=>p.uid===aux.uid).extendedUntil);
 assert.equal((await call(aux,'clock_out',{requestId:randomUUID()},attendance)).http,200);assert.equal((await call(aux,'continue_work',{requestId:randomUUID()},attendance)).http,409,'Não reabre jornada encerrada');

});
