import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {chromium} from 'playwright';

test('checklist completo: navegador → API real → Firestore/Storage → outra sessão',{timeout:90000},async()=>{
 const project='demo-triamicci-v31',unitId='fullstack-'+randomUUID(),{privateKey}=generateKeyPairSync('rsa',{modulusLength:2048});
 Object.assign(process.env,{APP_ENV:'staging',PUBLIC_APP_URL:'https://triamicci-e2e.test',FIREBASE_EXPECTED_PROJECT_ID:project,FIRESTORE_EMULATOR_HOST:'127.0.0.1:8080',FIREBASE_AUTH_EMULATOR_HOST:'127.0.0.1:9099',FIREBASE_STORAGE_EMULATOR_HOST:'127.0.0.1:9199',CHECKLIST_STORAGE_BUCKET:project+'.appspot.com',FIREBASE_SERVICE_ACCOUNT_JSON:JSON.stringify({project_id:project,client_email:'fullstack@'+project+'.iam.gserviceaccount.com',private_key:privateKey.export({type:'pkcs8',format:'pem'}).toString()})});
 const [{getDb},{default:handler},{photoBucket}]=await Promise.all([import('../server/_lib.js'),import('../api/members/manage.js'),import('../server/checklists/photos.js')]);
 const db=getDb(),unit=db.collection('units').doc(unitId);
 const api=createServer(async(req,res)=>{
  if(req.url!=='/api/members/manage'){res.writeHead(404);res.end();return;}
  let body='';for await(const chunk of req){body+=chunk;if(body.length>1000000){res.writeHead(413);res.end();return;}}
  try{req.body=JSON.parse(body);res.status=code=>{res.statusCode=code;return res;};res.json=data=>{res.setHeader('content-type','application/json');res.end(JSON.stringify(data));return res;};await handler(req,res);}catch(e){res.writeHead(500);res.end(JSON.stringify({message:e.message}));}
 });
 await new Promise(resolve=>api.listen(4189,'127.0.0.1',resolve));
 const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--config','qa/checklists-vite.config.mjs','--host','127.0.0.1','--port','4186','--strictPort'],{stdio:'pipe'});let browser;
 try{
  for(let n=0;n<80;n++){try{if((await fetch('http://127.0.0.1:4186/qa/checklists.html')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
  browser=await chromium.launch({headless:true,args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream']});
  const manager=await browser.newPage({viewport:{width:390,height:844}}),aux=await browser.newPage({viewport:{width:390,height:844}}),errors=[];
  for(const page of [manager,aux])page.on('pageerror',e=>errors.push(e.message));
  await manager.goto('http://127.0.0.1:4186/qa/checklists.html?role=manager&unit='+unitId);
  await manager.getByRole('button',{name:'Gestão',exact:true}).click();
  await manager.getByText('Fotos privadas e armazenamento',{exact:true}).click();
   await manager.getByRole('button',{name:'Verificar armazenamento',exact:true}).click();
  await manager.getByText(/Bucket acessível e protegido/).waitFor();
  await manager.getByRole('button',{name:'Criar checklist',exact:true}).click();
  await manager.getByLabel('Nome do checklist',{exact:true}).fill('Checklist integrado de teste');
  await manager.getByLabel('Horário limite',{exact:true}).fill('22:20');
  await manager.getByLabel('O que conferir',{exact:true}).fill('Conferência integrada com foto');
  await manager.getByRole('checkbox',{name:'Crítico',exact:true}).check();
  await manager.getByRole('checkbox',{name:'Foto na hora',exact:true}).check();
  await manager.getByRole('button',{name:'Adicionar item',exact:true}).click();
  await manager.getByRole('region',{name:'Item 2',exact:true}).getByLabel('O que conferir',{exact:true}).fill('Item sem foto definido pela unidade');
  await manager.getByRole('button',{name:'Adicionar item',exact:true}).click();
  await manager.getByRole('region',{name:'Item 3',exact:true}).getByLabel('O que conferir',{exact:true}).fill('Item que a unidade decidiu excluir');
  await manager.getByRole('button',{name:'Excluir item 3',exact:true}).click();
  await manager.getByRole('button',{name:'Salvar rascunho',exact:true}).click();
  await manager.getByRole('button',{name:'Publicar checklist',exact:true}).click();
  await manager.getByRole('heading',{name:'Modelos da unidade',exact:true}).waitFor();
  const models=await unit.collection('checklistTemplates').get();assert.equal(models.size,1);assert.equal(models.docs[0].data().published.name,'Checklist integrado de teste');assert.deepEqual(models.docs[0].data().published.items.map(i=>i.photoRequired),[true,false]);
  await manager.getByRole('button',{name:'Hoje',exact:true}).click();
  await aux.goto('http://127.0.0.1:4186/qa/checklists.html?role=auxiliar&unit='+unitId);
  assert.equal(await aux.getByRole('button',{name:'Gestão',exact:true}).count(),0);
  await aux.getByRole('button',{name:'Iniciar conferência',exact:true}).click();
  assert.equal(await aux.getByRole('button',{name:'Confirmar e continuar',exact:true}).isEnabled(),false);
  await aux.getByRole('button',{name:'Adicionar foto',exact:true}).click();
  await aux.getByRole('dialog',{name:'Capturar evidência'}).waitFor();
  await aux.waitForFunction(()=>document.querySelector('video')?.videoWidth>0);
  await aux.getByRole('button',{name:'Tirar foto',exact:true}).click();
  await aux.getByRole('button',{name:'Usar foto',exact:true}).click();
  await aux.getByText('Foto enviada e vinculada a este item.',{exact:true}).waitFor();
  assert.equal(await aux.getByRole('dialog',{name:'Capturar evidência'}).count(),0);
  await aux.getByRole('radio',{name:'Conferido',exact:true}).check();
  await aux.getByRole('button',{name:'Confirmar e continuar',exact:true}).click();
  await aux.getByRole('heading',{name:'Item sem foto definido pela unidade',exact:true}).waitFor();
  await aux.getByText('A unidade não exige foto para este item. Você pode concluir sem fotografar.',{exact:true}).waitFor();
  await aux.getByRole('radio',{name:'Conferido',exact:true}).check();
  await aux.getByRole('button',{name:'Confirmar e continuar',exact:true}).click();
  await aux.getByText('Conferência concluída e enviada.',{exact:true}).waitFor();
  const runs=await unit.collection('checklistRuns').get();assert.equal(runs.size,1);assert.equal(Object.values(runs.docs[0].data().answers).length,2);const answer=Object.values(runs.docs[0].data().answers).find(a=>a.photoId);assert.equal(answer.status,'checked');
  const member=await db.doc('memberships/'+answer.uid).get();assert.equal(member.data().role,'auxiliar');assert.equal(member.data().unitId,unitId);
  const photos=await unit.collection('checklistPhotos').get();assert.equal(photos.size,1);const photo=photos.docs[0].data();assert.equal(photo.attached,true);assert.equal(photo.status,'ready');assert.equal((await photoBucket().file(photo.path).exists())[0],true);
  await manager.getByRole('button',{name:'Ver conferência',exact:true}).waitFor();
  await manager.getByRole('button',{name:'Ver conferência',exact:true}).click();
  await manager.getByRole('button',{name:'Item 1: Conferência integrada com foto',exact:true}).click();
  await manager.getByRole('button',{name:'Ampliar evidência da conferência'}).click();
  await manager.getByRole('dialog',{name:'Visualizar evidência'}).waitFor();
  await manager.getByRole('button',{name:'Aumentar zoom'}).click();
  await manager.getByText('125%',{exact:true}).waitFor();
  assert.deepEqual(errors,[]);
 }finally{if(browser)await browser.close();server.kill('SIGTERM');api.closeAllConnections();await new Promise(resolve=>api.close(resolve));}
});
