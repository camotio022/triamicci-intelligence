import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,randomUUID} from 'node:crypto';

test('Firebase V3.1: inspeção pendente, aprovação auditada, perda e presença', {timeout:90000}, async()=>{
 const project='demo-triamicci-v31';
 const {privateKey}=generateKeyPairSync('rsa',{modulusLength:2048});
 process.env.APP_ENV='staging';
 process.env.PUBLIC_APP_URL='https://triamicci-e2e.test';
 process.env.FIREBASE_EXPECTED_PROJECT_ID=project;
 process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8080';
 process.env.FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:9099';
 process.env.FIREBASE_SERVICE_ACCOUNT_JSON=JSON.stringify({
  project_id:project,client_email:'integration@'+project+'.iam.gserviceaccount.com',
  private_key:privateKey.export({type:'pkcs8',format:'pem'}).toString()
 });
 const [{getDb},{default:v3Ledger},{default:attendanceHandler}]=await Promise.all([
  import('../server/_lib.js'),
  import('../server/operations/v3-ledger.js'),
  import('../server/workflows/attendance-v31.js')
 ]);
 const db=getDb(),unitId='unit-e2e-v31',unit=db.collection('units').doc(unitId);
 const signup=async(kind)=>{
  const response=await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=local',{
   method:'POST',headers:{'content-type':'application/json'},
   body:JSON.stringify({email:kind+'-'+randomUUID()+'@e2e.test',password:'local-pass-123456',returnSecureToken:true})
  });
  const data=await response.json();assert.equal(response.status,200,JSON.stringify(data));
  return {uid:data.localId,token:data.idToken};
 };
 const worker=await signup('cook'),manager=await signup('manager'),submanager=await signup('submanager');
 await Promise.all([
  db.doc('memberships/'+worker.uid).set({unitId,status:'active',role:'cook'}),
  db.doc('memberships/'+manager.uid).set({unitId,status:'active',role:'manager'}),
  db.doc('memberships/'+submanager.uid).set({unitId,status:'active',role:'submanager'})
 ]);
 const productId='a'.repeat(40);
 await Promise.all([
  unit.collection('products').doc(productId).set({name:'Insumo de homologação',status:'active',trackExpiry:false}),
  unit.collection('operationalProfiles').doc(productId).set({controlMode:'quantitative',countUnit:'un',locations:['reserva','giro'],origin:'supplier'})
 ]);
 const call=async(handler,person,action,payload={})=>{
  const req={method:'POST',headers:{origin:'https://triamicci-e2e.test','content-type':'application/json',authorization:'Bearer '+person.token},body:{action,...payload}};
  const res={statusCode:200,body:null,setHeader(){},status(code){this.statusCode=code;return this},json(data){this.body=data;return this}};
  await handler(req,res);return {httpStatus:res.statusCode,...res.body};
 };
 const internalId='b'.repeat(40);
 await Promise.all([
  unit.collection('products').doc(internalId).set({name:'Preparo interno',status:'active',trackExpiry:false}),
  unit.collection('operationalProfiles').doc(internalId).set({controlMode:'quantitative',countUnit:'un',locations:['reserva'],origin:'internal'})
 ]);
 const internalReceipt=await call(v3Ledger,worker,'v3InspectReceive',{requestId:randomUUID(),productId:internalId,commercialQuantity:1,commercialUnit:'un',stockQuantity:1,location:'reserva',supplier:'Fornecedor',notes:'Conferido'});
 assert.equal(internalReceipt.httpStatus,409,'Produção interna não entra como compra');
 const unplannedWithoutReason=await call(v3Ledger,worker,'v3InspectReceive',{requestId:randomUUID(),productId,commercialQuantity:1,commercialUnit:'un',stockQuantity:1,location:'reserva',supplier:'Fornecedor',notes:''});
 assert.equal(unplannedWithoutReason.httpStatus,409,'Entrega não prevista precisa de justificativa');
 const inspectionId=randomUUID();
 const inspected=await call(v3Ledger,worker,'v3InspectReceive',{requestId:inspectionId,productId,commercialQuantity:3,commercialUnit:'un',stockQuantity:3,location:'reserva',supplier:'Fornecedor local',lot:'',expiryDate:'',orderId:null,notes:'Conferido'});
 assert.equal(inspected.httpStatus,200,JSON.stringify(inspected));
 assert.equal((await unit.collection('physicalBalances').doc(productId).get()).exists,false,'Conferência não pode criar saldo');
 const unauthorized=await call(v3Ledger,worker,'v3ApproveReceipt',{inspectionId});
 assert.equal(unauthorized.httpStatus,403);
 const approved=await call(v3Ledger,submanager,'v3ApproveReceipt',{inspectionId});
 assert.equal(approved.httpStatus,200,JSON.stringify(approved));
 assert.equal((await unit.collection('physicalBalances').doc(productId).get()).data().total,3);
 const repeated=await call(v3Ledger,submanager,'v3ApproveReceipt',{inspectionId});
 assert.equal(repeated.httpStatus,200);
 assert.equal((await unit.collection('physicalBalances').doc(productId).get()).data().total,3,'Repetir aprovação não pode somar duas vezes');
 const countDenied=await call(v3Ledger,worker,'v3Count',{requestId:randomUUID(),sessionId:randomUUID(),productId,location:'reserva',quantity:3});
 assert.equal(countDenied.httpStatus,403,'Contagem oficial é exclusiva da gestão');
 const lossId=randomUUID();
 const loss=await call(v3Ledger,worker,'v3LossReport',{requestId:lossId,productId,location:'reserva',quantity:1,reason:'Avaria verificada na embalagem'});
 assert.equal(loss.httpStatus,200,JSON.stringify(loss));
 assert.equal((await unit.collection('physicalBalances').doc(productId).get()).data().total,3);
 const lossDenied=await call(v3Ledger,worker,'v3LossApprove',{reportId:lossId});
 assert.equal(lossDenied.httpStatus,403);
 const lossApproved=await call(v3Ledger,manager,'v3LossApprove',{reportId:lossId});
 assert.equal(lossApproved.httpStatus,200,JSON.stringify(lossApproved));
 assert.equal((await unit.collection('physicalBalances').doc(productId).get()).data().total,2);
 const repeatLoss=await call(v3Ledger,manager,'v3LossApprove',{reportId:lossId});
 assert.equal(repeatLoss.httpStatus,200);
 assert.equal((await unit.collection('physicalBalances').doc(productId).get()).data().total,2);
 const clockIn=await call(attendanceHandler,worker,'clock_in',{requestId:randomUUID()});
 assert.equal(clockIn.httpStatus,200,JSON.stringify(clockIn));
 assert.equal(clockIn.httpStatus,200);
 const brk=await call(attendanceHandler,worker,'break_start',{requestId:randomUUID()});
 assert.equal(brk.httpStatus,200,JSON.stringify(brk));
 const team=await call(attendanceHandler,manager,'teamToday');
 assert.equal(team.httpStatus,200,JSON.stringify(team));
 assert.equal(team.presence.find(x=>x.uid===worker.uid)?.status,'on_break');
 const corrected=await call(attendanceHandler,manager,'correct',{targetUid:worker.uid,workDay:team.day,status:'finished',reason:'Saída confirmada pela supervisão',requestId:randomUUID()});
 assert.equal(corrected.httpStatus,200,JSON.stringify(corrected));
 const audit=await db.collection('auditLogs').where('unitId','==',unitId).limit(100).get();
 assert.ok(audit.size>=5,'Operações devem gerar eventos auditáveis');
});

test('Operação Viva: previsão automática nunca vira presença confirmada',async()=>{
 const {liveShiftState}=await import('../server/schedules/restaurant-today.js');
 const employee={availability:[{day:'qua',start:'08:00',end:'16:20'}]};
 const before=liveShiftState({day:'2026-10-21',clock:'07:50',employee});
 assert.equal(before.source,'system');assert.equal(before.upcoming,true);
 const due=liveShiftState({day:'2026-10-21',clock:'08:05',employee});
 assert.equal(due.label,'Início previsto pelo sistema');assert.equal(due.declared,false);
 const declared=liveShiftState({day:'2026-10-21',clock:'08:05',employee,attendance:{status:'working',lastAction:'clock_in'}});
 assert.equal(declared.source,'employee');assert.equal(declared.label,'Confirmado pelo funcionário');
 const finish=liveShiftState({day:'2026-10-21',clock:'17:00',employee});
 assert.equal(finish.label,'Jornada prevista encerrada');assert.equal(finish.declared,false);
});
