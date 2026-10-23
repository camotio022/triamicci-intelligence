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
 assert.equal((await call(investigation,cook,'investigationSave',{...claim,expectedVersion:1})).code,200);
 assert.equal((await call(investigation,cook,'investigationGet',{productId:input})).investigations[0].versions.length,2);
 assert.equal((await call(investigation,manager,'investigationApprove',{productId:input,expectedVersion:2,note:'Conferência gerencial documentada'})).code,200);
 assert.deepEqual((await unit.collection('physicalBalances').doc(input).get()).data(),before,'Investigation must never move inventory');
 assert.equal((await call(investigation,outsider,'investigationGet',{productId:input})).investigations.length,0);
 const forbidden=await call(investigation,otherManager,'investigationSave',{...claim,allocations:[{reason:'loss',quantity:11,notes:'Quantidade acima do permitido'}]});assert.equal(forbidden.code,400);
 const {default:ledger}=await import('../server/operations/v3-ledger.js');
 const {default:productsApi}=await import('../api/products/manage.js');
 await unit.collection('operationalProfiles').doc(input).set({controlMode:'quantitative',countUnit:'un',origin:'supplier',locations:['reserva','giro']});
 await unit.collection('v3PhysicalBalances').doc(input).set({unit:'un',reserva:900,giro:0,total:900});
 const inspectionId=randomUUID();
 assert.equal((await call(ledger,cook,'v3InspectReceive',{requestId:inspectionId,productId:input,commercialQuantity:5,commercialUnit:'un',stockQuantity:5,location:'reserva',supplier:'Fornecedor de teste',notes:'Entrega experimental conferida'})).code,200);
 assert.equal((await call(ledger,manager,'v3ApproveReceipt',{inspectionId})).code,200);
 assert.equal((await unit.collection('physicalBalances').doc(input).get()).data().reserve,25,'Receipt adds to the same balance consumed by recipe production');
 assert.equal((await unit.collection('v3PhysicalBalances').doc(input).get()).data().total,900,'Legacy experiment remains untouched and is never summed');
 const catalog=await call(productsApi,cook,'list');assert.equal(catalog.products.find(p=>p.id===input).physicalBalance.total,25,'Main stock view sees operational receipt');
 const round=randomUUID();
 const countBefore=(await unit.collection('physicalCounts').get()).size;
 assert.equal((await call(ledger,manager,'v3Count',{requestId:randomUUID(),sessionId:round,productId:input,location:'reserva',quantity:8})).code,200);
 assert.equal((await unit.collection('physicalCounts').get()).size,countBefore,'Single-area count cannot pretend to be a full physical count');
 assert.equal((await call(ledger,manager,'v3Count',{requestId:randomUUID(),sessionId:round,productId:input,location:'giro',quantity:2})).code,200);
 const counted=(await unit.collection('physicalBalances').doc(input).get()).data();
 assert.equal(counted.reserve,8);assert.equal(counted.rotation,2);assert.equal(counted.countedTotal,10);
 assert.equal((await unit.collection('physicalCounts').get()).size,countBefore+1);

 // One shipment can contain multiple ordered products and lots. Inspection never moves stock.
 const {default:shipments}=await import('../server/operations/shipments.js');
 const orderId=randomUUID();
 for(const id of [input,output])await unit.collection('operationalProfiles').doc(id).set({controlMode:'quantitative',countUnit:'un',origin:'supplier',locations:['reserva','giro']});
 await unit.collection('purchaseOrdersV3').doc(orderId).set({supplier:'Fornecedor único',status:'expected',items:[{productId:input,quantity:10,unit:'un'},{productId:output,quantity:6,unit:'un'}],received:{}});
 const shipmentId=randomUUID(),shipment={requestId:shipmentId,orderId,supplier:'Fornecedor único',notes:'Entrega parcial conferida',lines:[{productId:input,commercialQuantity:4,commercialUnit:'un',stockQuantity:4,location:'reserva',lot:'',expiryDate:''},{productId:output,commercialQuantity:3,commercialUnit:'un',stockQuantity:3,location:'giro',lot:'',expiryDate:''}]};
 assert.equal((await call(shipments,cook,'shipmentInspect',{...shipment,lines:[null]})).code,400);
 assert.equal((await call(shipments,cook,'shipmentInspect',shipment)).code,200);
 assert.equal((await call(shipments,cook,'shipmentInspect',shipment)).duplicate,true);
 assert.equal((await unit.collection('physicalBalances').doc(input).get()).data().total,10);
 assert.equal((await call(shipments,cook,'shipmentApprove',{requestId:shipmentId})).code,403);
 assert.equal((await call(shipments,outsider,'shipmentApprove',{requestId:shipmentId})).code,403);
 // Revalidation failure must leave ALL products and the purchase order untouched.
 await unit.collection('products').doc(output).update({status:'inactive'});
 assert.equal((await call(shipments,manager,'shipmentApprove',{requestId:shipmentId})).code,409);
 assert.equal((await unit.collection('physicalBalances').doc(input).get()).data().total,10);
 assert.deepEqual((await unit.collection('purchaseOrdersV3').doc(orderId).get()).data().received,{});
 await unit.collection('products').doc(output).update({status:'active'});
 const approvals=await Promise.all([call(shipments,manager,'shipmentApprove',{requestId:shipmentId}),call(shipments,otherManager,'shipmentApprove',{requestId:shipmentId})]);
 assert.deepEqual(approvals.map(r=>r.code),[200,200]);assert.equal(approvals.filter(r=>r.duplicate).length,1);
 assert.equal((await unit.collection('physicalBalances').doc(input).get()).data().total,14);
 assert.equal((await unit.collection('physicalBalances').doc(output).get()).data().rotation,3);
 assert.deepEqual((await unit.collection('purchaseOrdersV3').doc(orderId).get()).data().received,{[input]:4,[output]:3});
 const rejectedId=randomUUID();assert.equal((await call(shipments,cook,'shipmentInspect',{...shipment,requestId:rejectedId})).code,200);
 assert.equal((await call(shipments,manager,'shipmentReject',{requestId:rejectedId,reason:'Entrega recusada na conferência'})).code,200);
 assert.equal((await unit.collection('physicalBalances').doc(input).get()).data().total,14);
 // Decimal yields, per-ingredient source and a real output lot, without a prior output count.
 const raw='e'.repeat(40),prepared='f'.repeat(40);
 await unit.collection('products').doc(raw).set({name:'Molho base',unit:'kg',status:'active',trackExpiry:false});
 await unit.collection('products').doc(prepared).set({name:'Molho final',unit:'kg',status:'active',trackExpiry:true,lotTrackingMode:'per_lot'});
 await unit.collection('physicalBalances').doc(raw).set({unit:'kg',reserve:1,rotation:5,total:6});
 const decimalRecipe={id:'molho-decimal',name:'Molho final',outputProductId:prepared,yieldQuantity:2.5,lines:[{productId:raw,quantity:1.25,location:'giro'}],method:'Misturar e conferir o rendimento real.'};
 assert.equal((await call(production,manager,'saveRecipe',decimalRecipe)).code,200);
 assert.equal((await call(production,manager,'saveRecipe',decimalRecipe)).code,409,'A stale recipe must not overwrite a revision');
 assert.equal((await call(production,manager,'saveRecipe',{...decimalRecipe,expectedVersion:1})).code,200);
 const decimalRun={recipeId:decimalRecipe.id,requestId:randomUUID(),portions:1.5,items:[{productId:raw,quantity:0.75}],outputLot:'PREPARO-TESTE',expiryDate:'2099-12-31'};
 assert.equal((await call(production,cook,'finish',{...decimalRun,outputLot:''})).code,409);
 assert.equal((await call(production,cook,'finish',decimalRun)).code,200);
 assert.equal((await unit.collection('physicalBalances').doc(raw).get()).data().rotation,4.25);
 assert.equal((await unit.collection('physicalBalances').doc(raw).get()).data().reserve,1);
 assert.equal((await unit.collection('physicalBalances').doc(prepared).get()).data().reserve,1.5);
 assert.equal((await unit.collection('physicalLots').doc(prepared).collection('lots').get()).docs[0].data().reserva,1.5);
 assert.equal((await call(production,cook,'finish',decimalRun)).duplicate,true);
 // A product with expiry metadata but no per-lot policy uses aggregate stock.
 const aggregateRaw='h'.repeat(40),aggregateOutput='g'.repeat(40);
 await unit.collection('products').doc(aggregateRaw).set({name:'Ingrediente acumulado',unit:'kg',status:'active',trackExpiry:true});
 await unit.collection('products').doc(aggregateOutput).set({name:'Preparo acumulado',unit:'kg',status:'active',trackExpiry:true});
 await unit.collection('physicalBalances').doc(aggregateRaw).set({unit:'kg',reserve:0,rotation:3,total:3});
 const aggregateRecipe={id:'teste-saldo-acumulado',name:'Preparo sem lotes',outputProductId:aggregateOutput,yieldQuantity:1,lines:[{productId:aggregateRaw,quantity:1,location:'giro'}]};
 assert.equal((await call(production,manager,'saveRecipe',aggregateRecipe)).code,200);
 const aggregateRun={recipeId:aggregateRecipe.id,requestId:randomUUID(),portions:1,items:[{productId:aggregateRaw,quantity:1}]};
 assert.equal((await call(production,cook,'finish',aggregateRun)).code,200,'Produção acumulada não deve exigir lote');
 assert.equal((await unit.collection('physicalBalances').doc(aggregateRaw).get()).data().rotation,2);
 assert.equal((await unit.collection('physicalBalances').doc(aggregateOutput).get()).data().reserve,1);
 assert.equal((await unit.collection('physicalLots').doc(aggregateOutput).collection('lots').get()).size,0);

 // Summary counters close the next count interval using canonical movements, irrespective of legacy volume.
 const {default:reportApi}=await import('../server/operations/daily-report.js');
 const countedAgain=randomUUID();await new Promise(r=>setTimeout(r,10));
 assert.equal((await call(ledger,manager,'v3Count',{requestId:randomUUID(),sessionId:countedAgain,productId:input,location:'reserva',quantity:12})).code,200);
 assert.equal((await call(ledger,manager,'v3Count',{requestId:randomUUID(),sessionId:countedAgain,productId:input,location:'giro',quantity:2})).code,200);
 const summary=await call(reportApi,cook,'dailyReport',{productId:input});
 assert.equal(summary.code,200);assert.equal(summary.report.source,'transactional_summary');assert.equal(summary.report.entriesTotal,4);assert.equal(summary.report.divergence,null);
 const {default:todayApi}=await import('../server/operations/inventory-today.js');
 assert.equal((await call(todayApi,cook,'todayCounts')).products.find(p=>p.productId===input).state,'clear');
 // Notice pagination, personal read state and tenant isolation.
 const {default:mural}=await import('../server/workflows/mural.js');
 for(let i=0;i<23;i++)await unit.collection('muralItems').doc('notice-'+String(i).padStart(2,'0')).set({kind:'notice',title:'Aviso '+i,body:'Conteúdo experimental',status:'published',version:1,publishedAt:new Date(Date.now()+i)});
 const notices=await call(mural,cook,'publicNotices');assert.equal(notices.items.length,20);assert.ok(notices.nextCursor);
 assert.equal((await call(mural,cook,'publicNotices',{before:notices.nextCursor})).items.length,3);
 assert.equal((await call(mural,cook,'noticeRead',{id:notices.items[0].id})).code,200);
 assert.equal((await call(mural,cook,'publicNotices')).items[0].read,true);
 assert.equal((await call(mural,manager,'publicNotices')).items[0].read,false);
 assert.equal((await call(mural,outsider,'publicNotices')).items.length,0);
 // Draft edits require the revision the editor actually opened.
 const draft=await call(schedules,manager,'saveDraft',{period:'2099-03',title:'Rascunho de teste',entries:[]});assert.equal(draft.code,200);
 assert.equal((await call(schedules,manager,'saveDraft',{id:draft.id,period:'2099-03',title:'Edição atual',entries:[],expectedRevision:1})).code,200);
 assert.equal((await call(schedules,manager,'saveDraft',{id:draft.id,period:'2099-03',title:'Edição atrasada',entries:[],expectedRevision:1})).code,409);

 // Compatibility report traverses more than 500 legacy events without truncating the result.
 const legacyNow=new Date(Date.now()+2000),legacyBefore=new Date(Date.now()-60000);
 await unit.collection('physicalCounts').doc(randomUUID()).set({productId:raw,unit:'kg',reserve:10,rotation:0,at:legacyBefore});
 await unit.collection('physicalCounts').doc(randomUUID()).set({productId:raw,unit:'kg',reserve:9.851,rotation:0,at:legacyNow});
 for(let offset=0;offset<601;offset+=200){const batch=db.batch();for(let i=offset;i<Math.min(offset+200,601);i++)batch.set(unit.collection('physicalReceipts').doc('legacy-'+i),{productId:raw,unit:'kg',physicalQuantity:0.001,at:new Date()});await batch.commit();}
 const legacyReport=await call(reportApi,cook,'dailyReport',{productId:raw});assert.equal(legacyReport.complete,true);assert.equal(legacyReport.report.entriesTotal,.601);assert.equal(legacyReport.report.divergence,null);

 // Full draft -> independent approval -> publication, revalidating real Sunday pauses.
 const {generateMonthlyRoster}=await import('../server/schedules/generator.js');
 const {unitDay}=await import('../server/schedules/temporal-policy.js');
 const period=unitDay().slice(0,7),administrator=await signup('admin');
 const staff=[{uid:'staff-one',status:'active',name:'Equipe A'},{uid:'staff-two',status:'active',name:'Equipe B'}];
 await unit.collection('configuration').doc('staffRegistry').set({active:true});
 for(const p of staff)await unit.collection('staffRegistry').doc(p.uid).set({...p,jobTitle:'Cozinheiro',sector:'cozinha',availability:[{day:'dom',start:'09:00',end:'17:00',breakStart:'12:00',breakEnd:'13:00'}]});
 const policy=unit.collection('configuration').doc('coverageRequirements');
 const requirements=[{weekday:0,sector:'cozinha',start:'10:00',end:'11:00',minimum:1,skill:''}];await policy.set({requirements});
 const roster=generateMonthlyRoster({period,members:staff,fixedOffDays:{'staff-one':1,'staff-two':2},autoSunday:true});
 const planned=await call(schedules,manager,'saveDraft',{period,title:'Escala experimental completa',entries:roster});assert.equal(planned.code,200);
 assert.equal((await call(schedules,manager,'submit',{id:planned.id})).code,200);
 assert.equal((await call(schedules,administrator,'approve',{id:planned.id})).code,200);
 await policy.set({requirements:[{...requirements[0],start:'12:00',end:'13:00'}]});
 assert.equal((await call(schedules,administrator,'publish',{id:planned.id})).code,409,'A pause is not operational coverage');
 assert.equal((await unit.collection('schedules').doc(planned.id).get()).data().status,'approved');
 await policy.set({requirements});assert.equal((await call(schedules,administrator,'publish',{id:planned.id})).code,200);
 assert.equal((await unit.collection('schedulePublicationState').doc(period).get()).data().activeId,planned.id);

});
