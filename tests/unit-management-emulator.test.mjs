import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,randomUUID} from 'node:crypto';

// All writes are confined to Firebase emulators and randomly named test units.
test('gestão completa da própria unidade sem conceder acesso à equipe ou a outra unidade',{timeout:120000},async()=>{
 const project='demo-triamicci-v31',unitId='management-'+randomUUID();
 const {privateKey}=generateKeyPairSync('rsa',{modulusLength:2048});
 Object.assign(process.env,{APP_ENV:'staging',PUBLIC_APP_URL:'https://triamicci-e2e.test',FIREBASE_EXPECTED_PROJECT_ID:project,FIRESTORE_EMULATOR_HOST:'127.0.0.1:8080',FIREBASE_AUTH_EMULATOR_HOST:'127.0.0.1:9099',ENABLE_PACKAGE_BALANCE_APPLY:'true',FIREBASE_SERVICE_ACCOUNT_JSON:JSON.stringify({project_id:project,client_email:'management@'+project+'.iam.gserviceaccount.com',private_key:privateKey.export({type:'pkcs8',format:'pem'}).toString()})});
 const [{getDb},{default:coverage},{default:products},{default:labels},{default:schedules},{default:mural},{default:reconcile},{default:reviewPackages},{default:applyPackages},{default:catalog}]=await Promise.all([import('../server/_lib.js'),import('../api/coverage/manage.js'),import('../api/products/manage.js'),import('../server/workflows/labels.js'),import('../server/workflows/schedules.js'),import('../server/workflows/mural.js'),import('../server/operations/reconcile-lots.js'),import('../server/operations/handlers/package-review.js'),import('../server/operations/handlers/package-apply.js'),import('../api/catalog/manage.js')]);
 const db=getDb(),unit=db.collection('units').doc(unitId),people={};
 const signup=async(role,tenant=unitId)=>{
  const r=await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=local',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:randomUUID()+'@management.test',password:'test-only-password',returnSecureToken:true})});
  const u=await r.json();assert.equal(r.status,200);
  await db.doc('memberships/'+u.localId).set({unitId:tenant,role,status:'active'});
  return {uid:u.localId,token:u.idToken};
 };
 for(const role of ['admin','manager','submanager','cook','auxiliar'])people[role]=await signup(role);
 const foreign=await signup('submanager','other-'+unitId);
 const call=async(handler,person,action,payload={},code=200)=>{
  const res={code:200,setHeader(){},status(c){this.code=c;return this},json(body){this.body=body;return this}};
  await handler({method:'POST',headers:{origin:'https://triamicci-e2e.test','content-type':'application/json',authorization:'Bearer '+person.token},body:{action,...payload}},res);
  assert.equal(res.code,code,JSON.stringify({action,expected:code,actual:res.code,body:res.body}));return res.body;
 };
 const {manager,submanager,cook,auxiliar}=people;
 const productId='b'.repeat(40),lotProduct='c'.repeat(40);
 const baseProduct={name:'Produto de teste',status:'active',unit:'kg',trackExpiry:false};
 await unit.collection('products').doc(productId).set(baseProduct);
 await unit.collection('products').doc(lotProduct).set({...baseProduct,trackExpiry:true});
 await unit.collection('physicalBalances').doc(lotProduct).set({unit:'kg',reserve:2,rotation:1,total:3});
 const correction={productId,operationalUnit:'kg',receivingUnit:'kg',reason:'Conferência física de teste',confirm:'RECONTAR_UNIDADE'};
 const configuration={productId,packages:[{presentation:'pacote',fixed:true,validated:true,contentQuantity:2,contentUnit:'kg',evidence:'Pesagem de homologação'}],countingMethod:{kind:'packages',presentation:'pacote',trackOpen:false}};
 const requirements=[{sector:'cozinha',weekday:5,start:'08:00',end:'09:00',minimum:1,skill:''}];
 const rates={manager:150,submanager:120,head_cook:150,cook:120,other:100,external:100};
 let version=0;
 for(const person of [manager,submanager]){
  await call(coverage,person,'requirementsSet',{requirements});
  await call(coverage,person,'rates',{rates});
  await call(products,person,'correctUnits',correction);
  await call(products,person,'measurementSave',{...configuration,expectedVersion:version++});
  await call(labels,person,'classifyProduct',{productId,category:'carnes',reason:'Classificação de teste verificada'});
  await call(reconcile,person,'reconcile',{productId:lotProduct,requestId:randomUUID(),lots:[{lot:'TESTE',expiryDate:'2099-01-01',reserva:2,giro:1}]});
  // A caller-supplied unit never redirects a unit-scoped write.
  await call(coverage,person,'rates',{rates,unitId:'other-'+unitId});
  await call(catalog,person,'approve',{catalogId:'frango'},403);
 }
 for(const person of [cook,auxiliar]){
  await call(coverage,person,'requirementsSet',{requirements},403);
  await call(coverage,person,'rates',{rates},403);
  await call(products,person,'correctUnits',correction,403);
  await call(products,person,'measurementSave',{...configuration,expectedVersion:version},403);
  await call(labels,person,'classifyProduct',{productId,category:'carnes',reason:'Classificação de teste verificada'},403);
  await call(labels,person,'policyDraft',{},403);
  await call(labels,person,'policyApprove',{id:'carnes_reserva'},403);
  await call(reconcile,person,'reconcile',{},403);
  await call(reviewPackages,person,'preview',{},403);
  await call(applyPackages,person,'apply',{},403);
 }
 assert.equal((await db.collection('units').doc('other-'+unitId).collection('configuration').doc('coverageRates').get()).exists,false);
 await call(products,foreign,'correctUnits',{...correction,unitId},404);
 await call(products,foreign,'measurementSave',{...configuration,expectedVersion:0,unitId},404);
 await call(reconcile,foreign,'reconcile',{productId:lotProduct,requestId:randomUUID(),unitId,lots:[{lot:'TESTE',expiryDate:'2099-01-01',reserva:2,giro:1}]},400);

 const policy={category:'carnes',zone:'reserva',days:3,reference:'POP de teste',conditions:'Condições de homologação'};
 await call(labels,manager,'policyDraft',policy);
 await call(labels,manager,'policyApprove',{id:'carnes_reserva'},409);
 await call(labels,foreign,'policyApprove',{id:'carnes_reserva',unitId},409);
 await call(labels,submanager,'policyApprove',{id:'carnes_reserva'});
 await call(labels,submanager,'policyDraft',{...policy,zone:'giro'});
 await call(labels,manager,'policyApprove',{id:'carnes_giro'});
 for(const [author,approver] of [[manager,submanager],[submanager,manager]]){
  const draft=await call(mural,author,'saveDraft',{item:{kind:'preparation',title:'Receita de teste',body:'Instruções de teste',ingredients:[{name:'Teste',amount:1,unit:'kg'}],yieldText:'Um lote',allergens:[]}});
  await call(mural,author,'publish',{id:draft.id},409);
  await call(mural,approver,'publish',{id:draft.id});
 }

 // Actual package adjustment: preserve optimistic concurrency and block duplicates/stale references.
 const balanceTime=new Date(1234),conferenceId=randomUUID();
 await unit.collection('physicalBalances').doc(productId).set({unit:'kg',reserve:2,rotation:3,total:5,countId:'count-test',lastMovementAt:balanceTime});
 await unit.collection('packageConferences').doc(conferenceId).set({unitId,productId,area:'giro',closed:2,opened:0,profileVersion:version,presentation:'pacote'});
 const preview=await call(reviewPackages,submanager,'preview',{productId,conferenceId});assert.equal(preview.review.quantity,4);
 const expected={area:'giro',quantity:4,profileVersion:version,balanceCountId:'count-test',balanceMovementMillis:1234};
 const requestId=randomUUID();
 await call(applyPackages,submanager,'apply',{productId,conferenceId,requestId,expected});
 const after=(await unit.collection('physicalBalances').doc(productId).get()).data();assert.equal(after.total,6);assert.equal(after.rotation,4);
 await call(applyPackages,submanager,'apply',{productId,conferenceId,requestId,expected});
 assert.equal((await unit.collection('physicalBalances').doc(productId).get()).data().total,6);
 await call(applyPackages,manager,'apply',{productId,conferenceId,requestId:randomUUID(),expected},409);
 await call(reviewPackages,foreign,'preview',{productId,conferenceId,unitId},404);

 // Real schedule approval and publication, with a different reviewer and valid coverage.
 const {monthDates}=await import('../server/schedules/rules.js');
 const {unitDay}=await import('../server/schedules/temporal-policy.js');
 const period=unitDay().slice(0,7),dates=monthDates(period),sunday=dates.find(d=>new Date(d+'T12:00:00Z').getUTCDay()===0);
 await unit.collection('configuration').doc('staffRegistry').set({active:true});
 const staffId='test-worker';
 await unit.collection('staffRegistry').doc(staffId).set({name:'Colaborador fictício',status:'active',sector:'cozinha',jobTitle:'Auxiliar',skills:[],certifications:[],availability:['seg','ter','qua','qui','sex','sab','dom'].map(day=>({day,start:'08:00',end:'16:00',breakStart:'12:00',breakEnd:'13:00'}))});
 const entries=dates.map(date=>({uid:staffId,date,type:date===sunday?'monthly_sunday':new Date(date+'T12:00:00Z').getUTCDay()===1?'off':'work'}));
 for(const [author,approver] of [[manager,submanager],[submanager,manager]]){
  const id=randomUUID();await unit.collection('schedules').doc(id).set({title:'Escala de teste',period,entries,status:'in_review',revision:1,createdBy:author.uid});
  await call(schedules,author,'approve',{id},409);
  await call(schedules,cook,'approve',{id},403);
  await call(schedules,foreign,'approve',{id,unitId},404);
  await call(schedules,approver,'approve',{id});
  await call(schedules,author,'publish',{id});
  assert.equal((await unit.collection('schedules').doc(id).get()).data().status,'published');
 }
 // Inactive membership still denies operations after the role was initially allowed.
 await db.doc('memberships/'+submanager.uid).update({status:'inactive'});
 await call(coverage,submanager,'rates',{rates},403);
});
