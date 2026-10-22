import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,randomUUID} from 'node:crypto';

test('V4 transactions: production race, retry, tenancy, live rules, leave locks and investigation', {timeout:90000}, async()=>{
 const project='demo-triamicci-v31',unitId='unit-v4-'+randomUUID();
 const {privateKey}=generateKeyPairSync('rsa',{modulusLength:2048});
 Object.assign(process.env,{APP_ENV:'staging',PUBLIC_APP_URL:'https://triamicci-e2e.test',FIREBASE_EXPECTED_PROJECT_ID:project,FIRESTORE_EMULATOR_HOST:'127.0.0.1:8080',FIREBASE_AUTH_EMULATOR_HOST:'127.0.0.1:9099',FIREBASE_SERVICE_ACCOUNT_JSON:JSON.stringify({project_id:project,client_email:'v4@'+project+'.iam.gserviceaccount.com',private_key:privateKey.export({type:'pkcs8',format:'pem'}).toString()})});
 const [{getDb},{default:production},{default:dayList},{default:schedules},{default:investigation}]=await Promise.all([import('../server/_lib.js'),import('../api/production/manage.js'),import('../server/production/day-list.js'),import('../server/workflows/schedules.js'),import('../server/operations/investigation.js')]);
 const db=getDb(),unit=db.collection('units').doc(unitId);
 const signup=async(role,tenant=unitId)=>{
  const response=await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=local',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:randomUUID()+'@v4.test',password:'test-password-v4',returnSecureToken:true})});
  const data=await response.json();assert.equal(response.status,200);
  await db.doc('memberships/'+data.localId).set({unitId:tenant,role,status:'active'});
  return {uid:data.localId,token:data.idToken};
 };
 const cook=await signup('cook'),manager=await signup('manager'),otherManager=await signup('submanager'),outsider=await signup('cook','foreign-unit');
 const call=async(handler,person,action,payload={})=>{
  const req={method:'POST',headers:{origin:'https://triamicci-e2e.test','content-type':'application/json',authorization:'Bearer '+person.token},body:{action,...payload}};
  const res={code:200,data:null,setHeader(){},status(code){this.code=code;return this},json(data){this.data=data;return this}};
  await handler(req,res);return {code:res.code,...res.data};
 };
 const input='c'.repeat(40),output='d'.repeat(40);
 for(const [id,total] of [[input,50],[output,0]]){
  await unit.collection('products').doc(id).set({name:id===input?'Frango grelhado':'Parmegiana',status:'active',unit:'un',trackExpiry:false});
  await unit.collection('physicalBalances').doc(id).set({reserve:total,rotation:0,total,unit:'un'});
 }
 const recipe={id:'parmegiana-v4',name:'Parmegiana de frango',yieldQuantity:1,outputProductId:output,lines:[{productId:input,quantity:1,substitutes:[]}]};
 assert.equal((await call(production,cook,'saveRecipe',recipe)).code,403);
 assert.equal((await call(production,manager,'saveRecipe',recipe)).code,200);
 const task=await call(dayList,cook,'dayAdd',{recipeId:recipe.id,plannedQuantity:30});assert.equal(task.code,200);
 const payload={recipeId:recipe.id,requestId:randomUUID(),portions:30,items:[{productId:input,quantity:30}],taskId:task.taskId};
 assert.equal((await call(production,outsider,'finish',payload)).code>=400,true);
 const results=await Promise.all([call(production,cook,'finish',payload),call(production,cook,'finish',{...payload,requestId:randomUUID()})]);
 assert.equal(results.filter(r=>r.code===200).length,1,JSON.stringify(results));
 assert.equal((await unit.collection('physicalBalances').doc(input).get()).data().reserve,20);
 assert.equal((await unit.collection('physicalBalances').doc(output).get()).data().reserve,30);
 const winningRequest=results[0].code===200?payload.requestId:(await unit.collection('productionRuns').get()).docs[0].id;
 const repeat=await call(production,cook,'finish',{...payload,requestId:winningRequest});assert.equal(repeat.code,200);assert.equal(repeat.duplicate,true);
 assert.equal((await unit.collection('physicalBalances').doc(output).get()).data().reserve,30);
 assert.equal((await unit.collection('live').doc('attendance').get()).exists,true);
 const ruleGet=async(person,tenant)=>fetch(`http://127.0.0.1:8080/v1/projects/${project}/databases/(default)/documents/units/${tenant}/live/attendance`,{headers:{Authorization:'Bearer '+person.token}});
 assert.equal((await ruleGet(cook,unitId)).status,200,'Same-unit listener may read invalidation');
 assert.equal((await ruleGet(outsider,unitId)).status,403,'Foreign unit cannot listen');
 const unauthorizedWrite=await fetch(`http://127.0.0.1:8080/v1/projects/${project}/databases/(default)/documents/units/${unitId}/live/attendance`,{method:'PATCH',headers:{Authorization:'Bearer '+cook.token,'Content-Type':'application/json'},body:JSON.stringify({fields:{revision:{stringValue:'forged'}}})});
 assert.equal(unauthorizedWrite.status,403,'Client cannot forge invalidations');
 const future='2099-01-20';
 const leaves=await Promise.all([call(schedules,cook,'leaveRequest',{date:future,reason:'Necessidade pessoal justificada'}),call(schedules,cook,'leaveRequest',{date:future,reason:'Necessidade pessoal justificada'})]);
 assert.deepEqual(leaves.map(x=>x.code).sort(),[201,409]);
 await unit.collection('schedulePublicationState').doc('2099-02').set({activeId:'official-test'});
 assert.equal((await call(schedules,cook,'leaveRequest',{date:'2099-02-20',reason:'Necessidade pessoal justificada'})).code,409);
 // New count explains an inventory shortage, with independent manager review.
 const previousAt=new Date(Date.now()-120000),currentAt=new Date(Date.now()-60000),countId=randomUUID();
 await unit.collection('physicalCounts').doc(randomUUID()).set({productId:input,reserve:50,rotation:0,unit:'un',at:previousAt});
 await unit.collection('physicalCounts').doc(countId).set({productId:input,reserve:40,rotation:0,unit:'un',at:currentAt});
 const claim={productId:input,expectedVersion:0,allocations:[{reason:'staff_meal',quantity:4,notes:'Consumo relatado pela equipe'}]};
 const before=(await unit.collection('physicalBalances').doc(input).get()).data();
 assert.equal((await call(investigation,cook,'investigationSave',claim)).code,200);
 assert.equal((await call(investigation,cook,'investigationApprove',{productId:input,note:'Revisão pela própria pessoa'})).code,400);
 assert.equal((await call(investigation,manager,'investigationApprove',{productId:input,note:'Conferência gerencial documentada'})).code,200);
 assert.deepEqual((await unit.collection('physicalBalances').doc(input).get()).data(),before,'Investigation must never move inventory');
 assert.equal((await call(investigation,outsider,'investigationGet',{productId:input})).investigations.length,0);
 const forbidden=await call(investigation,otherManager,'investigationSave',{...claim,allocations:[{reason:'loss',quantity:11,notes:'Quantidade acima do permitido'}]});assert.equal(forbidden.code,400);
});
