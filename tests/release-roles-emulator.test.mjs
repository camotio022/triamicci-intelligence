import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,randomUUID} from 'node:crypto';

test('entrega: rotina e fronteiras dos cinco perfis, folgas, cobertura e revogação',{timeout:120000},async()=>{
 const project='demo-triamicci-v31',unitId='release-'+randomUUID();
 const {privateKey}=generateKeyPairSync('rsa',{modulusLength:2048});
 Object.assign(process.env,{APP_ENV:'staging',PUBLIC_APP_URL:'https://triamicci-e2e.test',FIREBASE_EXPECTED_PROJECT_ID:project,FIRESTORE_EMULATOR_HOST:'127.0.0.1:8080',FIREBASE_AUTH_EMULATOR_HOST:'127.0.0.1:9099',FIREBASE_SERVICE_ACCOUNT_JSON:JSON.stringify({project_id:project,client_email:'release@'+project+'.iam.gserviceaccount.com',private_key:privateKey.export({type:'pkcs8',format:'pem'}).toString()})});
 const [{getDb,getAuth},{default:members},{default:attendance},{default:mural},{default:schedules},{default:coverage},{default:kitchen},{default:shipments}]=await Promise.all([import('../server/_lib.js'),import('../api/members/manage.js'),import('../server/workflows/attendance-v31.js'),import('../server/workflows/mural.js'),import('../server/workflows/schedules.js'),import('../api/coverage/manage.js'),import('../server/operations/v3-service.js'),import('../server/operations/shipments.js')]);
 const db=getDb(),unit=db.collection('units').doc(unitId),people={};
 const signup=async(role,tenant=unitId)=>{
  const response=await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=local',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:randomUUID()+'@release.test',password:'test-only-password',returnSecureToken:true})});
  const data=await response.json();assert.equal(response.status,200);
  await db.doc('memberships/'+data.localId).set({unitId:tenant,role,status:'active',name:role});
  await db.collection('units').doc(tenant).collection('staffRegistry').doc(data.localId).set({accountUid:data.localId,name:role,status:'active',sector:'cozinha',jobTitle:role==='cook'?'Cozinheiro':'Auxiliar',availability:[],skills:[],certifications:[]});
  return {uid:data.localId,token:data.idToken};
 };
 for(const role of ['admin','manager','submanager','cook','auxiliar'])people[role]=await signup(role);
 const foreign=await signup('manager','foreign-'+unitId);
 const call=async(handler,person,action,payload={})=>{
  const req={method:'POST',headers:{origin:'https://triamicci-e2e.test','content-type':'application/json',authorization:'Bearer '+person.token},body:{action,...payload}};
  const res={code:200,setHeader(){},status(code){this.code=code;return this},json(body){this.body=body;return this}};
  await handler(req,res);return {code:res.code,...res.body};
 };
 const expect=async(handler,person,action,payload,code)=>{const result=await call(handler,person,action,payload);assert.equal(result.code,code,JSON.stringify({action,expected:code,result}));return result};
 const day=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo'}).format(new Date());
 const future=new Date(Date.parse(day+'T12:00:00Z')+3*86400000).toISOString().slice(0,10);
 const manager=people.manager,sub=people.submanager;
 const draft=await expect(mural,manager,'saveDraft',{item:{kind:'notice',title:'TESTE entrega',body:'Comunicado fictício de homologação',priority:'important'}},200);
 await expect(mural,manager,'publish',{id:draft.id},200);
 for(const [role,person] of Object.entries(people)){
  const manages=['admin','manager','submanager'].includes(role);
  await expect(members,person,'myProfile',{},200);
  await expect(members,person,'list',{},manages?200:403);
  await expect(kitchen,person,'v3Dashboard',{},200);
  const notices=await expect(mural,person,'publicNotices',{},200);assert.equal(notices.items.some(n=>n.id===draft.id),true);
  await expect(mural,person,'noticeRead',{id:draft.id},200);
  const read=await expect(mural,person,'publicNotices',{},200);assert.equal(read.items.find(n=>n.id===draft.id).read,true);
  await expect(attendance,person,'teamDirectory',{},200);
  const entryId=randomUUID();await expect(attendance,person,'clock_in',{requestId:entryId},200);
  const repeated=await expect(attendance,person,'clock_in',{requestId:entryId},200);assert.equal(repeated.duplicate,true);
  for(const action of ['break_start','break_end','clock_out'])await expect(attendance,person,action,{requestId:randomUUID()},200);
  assert.equal((await expect(attendance,person,'today',{},200)).record.status,'finished');
  const leave=await expect(schedules,person,'leaveRequest',{date:future,reason:'TESTE entrega: solicitação fictícia de folga.'},201);
  await expect(schedules,person,'leaveRequest',{date:future,reason:'TESTE duplicado de solicitação fictícia.'},409);
  if(!manages){
   await expect(schedules,person,'leaveDecision',{id:leave.id,decision:'approved',note:'TESTE decisão não permitida'},403);
   await expect(mural,person,'saveDraft',{item:{kind:'notice',title:'Sem autorização',body:'Não deve salvar'}},403);
   await expect(kitchen,person,'v3OrderCreate',{requestId:randomUUID()},403);
  }
  const approver=person.uid===manager.uid?sub:manager;
  await expect(schedules,approver,'leaveDecision',{id:leave.id,decision:'approved',note:'TESTE autorização de folga fictícia'},200);
  const myLeaves=await expect(schedules,person,'leaveList',{},200);
  assert.equal(myLeaves.requests.some(r=>r.id===leave.id&&r.status==='approved'),true);
  if(!manages)assert.equal(myLeaves.requests.every(r=>r.uid===person.uid),true,'Motivos pessoais ficam no próprio perfil');
  const notifications=await expect(members,person,'notifications',{},200);assert.ok(notifications.notifications?.length||notifications.items?.length,'Decisão gera notificação pessoal');
  await expect(coverage,person,'requestChange',{kind:'coverage',date:future,reason:'TESTE necessidade fictícia de cobertura.'},201);
 }
 assert.equal((await expect(mural,foreign,'publicNotices',{},200)).items.length,0);
 await expect(mural,foreign,'noticeRead',{id:draft.id},409);
 assert.equal((await expect(schedules,foreign,'leaveList',{},200)).requests.length,0);
 for(const role of Object.keys(people)){
  const outsider=await signup(role,'isolated-'+role+'-'+unitId);
  assert.equal((await expect(mural,outsider,'publicNotices',{unitId},200)).items.length,0);
  assert.equal((await expect(kitchen,outsider,'v3Dashboard',{unitId},200)).products.length,0);
  await expect(mural,outsider,'noticeRead',{id:draft.id,unitId},409);
  const leaveId=people.auxiliar.uid+'_'+future;
  await expect(schedules,outsider,'leaveDecision',{id:leaveId,decision:'approved',note:'TESTE acesso cruzado não permitido',unitId},['admin','manager','submanager'].includes(role)?409:403);
 }

 // Convites por link usam apenas contas e e-mails fictícios; nenhum e-mail é enviado.
 const [{default:createInvite},{default:acceptInvite},{default:revokeInvite}]=await Promise.all([import('../api/invitations/create.js'),import('../api/invitations/accept.js'),import('../api/invitations/revoke.js')]);
 const recipient=async()=>{
  const email=randomUUID()+'@release.test',password='test-only-password';
  const created=await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=local',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email,password,returnSecureToken:true})});
  const user=await created.json();assert.equal(created.status,200);await getAuth().updateUser(user.localId,{emailVerified:true});
  const login=await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=local',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email,password,returnSecureToken:true})});
  const session=await login.json();assert.equal(login.status,200);return {uid:user.localId,email,token:session.idToken};
 };
 const invited=await recipient(),wrong=await recipient();
 const invitePayload={unitId,role:'auxiliar',email:invited.email,deliveryMethod:'link'};
 await expect(createInvite,people.cook,'create',invitePayload,403);
 await expect(createInvite,manager,'create',{...invitePayload,role:'admin'},403);
 const invitation=await expect(createInvite,sub,'create',invitePayload,201);
 const invite=decodeURIComponent(new URL(invitation.inviteUrl).hash.slice('#invite='.length));
 await expect(acceptInvite,wrong,'accept',{invite},400);
 await expect(acceptInvite,invited,'accept',{invite},200);
 assert.equal((await db.doc('memberships/'+invited.uid).get()).data().unitId,unitId);
 assert.equal((await db.doc('memberships/'+invited.uid).get()).data().role,'auxiliar');
 await expect(acceptInvite,invited,'accept',{invite},400);
 const revokedRecipient=await recipient();
 const revocable=await expect(createInvite,people.admin,'create',{...invitePayload,email:revokedRecipient.email},201);
 const revokeToken=decodeURIComponent(new URL(revocable.inviteUrl).hash.slice('#invite='.length));
 const invitationId=revokeToken.split('.')[1];
 await expect(revokeInvite,foreign,'revoke',{unitId,invitationId},400);
 await expect(revokeInvite,people.admin,'revoke',{unitId,invitationId},200);
 await expect(acceptInvite,revokedRecipient,'accept',{invite:revokeToken},400);
 assert.equal((await db.doc('memberships/'+revokedRecipient.uid).get()).exists,false);
 const proposal={staffId:people.auxiliar.uid,date:future,first:{start:'08:00',end:'12:00'},second:{start:'13:00',end:'17:00'},external:false,rateRole:'other',reason:'TESTE proposta de cobertura fictícia'};
 await expect(coverage,manager,'propose',{...proposal,date:'2020-01-01'},400);
 const proposed=await expect(coverage,manager,'propose',proposal,201);
 await expect(coverage,people.cook,'respond',{id:proposed.id,decision:'accepted'},403);
 await expect(coverage,people.auxiliar,'respond',{id:proposed.id,decision:'accepted'},200);
 const decision={id:proposed.id,decision:'approved',note:'TESTE revisão independente confirmada',legalChecked:true,consentVerified:true,consentEvidence:'Aceite fictício registrado no teste isolado'};
 await expect(coverage,manager,'decide',decision,403);
 await expect(coverage,sub,'decide',decision,200);
 const expiredId=randomUUID();await unit.collection('coverageProposals').doc(expiredId).set({staffId:people.auxiliar.uid,date:'2020-01-01',status:'pending_acceptance',createdBy:manager.uid});
 await expect(coverage,people.auxiliar,'respond',{id:expiredId,decision:'accepted'},409);
 // Pendência antiga continua visível mesmo fora da primeira página do histórico.
 const bulk=db.batch();for(let i=0;i<25;i++)bulk.set(unit.collection('receiptShipments').doc(randomUUID()),{status:'approved',createdAt:new Date(Date.now()+i),lines:[],supplier:'TESTE histórico'});
 const pendingId=randomUUID();bulk.set(unit.collection('receiptShipments').doc(pendingId),{status:'pending',createdAt:new Date('2020-01-01'),lines:[],supplier:'TESTE pendência antiga'});await bulk.commit();
 const pending=await expect(shipments,manager,'shipmentsList',{},200);assert.equal(pending.pendingShipments.some(s=>s.id===pendingId),true);assert.equal(pending.pendingComplete,true);
 await db.doc('memberships/'+people.cook.uid).update({status:'inactive'});
 for(const [handler,action] of [[members,'myProfile'],[mural,'publicNotices'],[kitchen,'v3Dashboard'],[attendance,'today']])await expect(handler,people.cook,action,{},403);
});
