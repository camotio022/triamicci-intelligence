import test from 'node:test';import assert from 'node:assert/strict';import {randomBytes,randomUUID,generateKeyPairSync} from 'node:crypto';import {createServer} from 'node:http';import {chromium} from './helpers/browser.mjs';
const key=()=>randomBytes(32).toString('base64url');
test('terminal: two browsers, QR approval, permissions, revocation, replay, expiry and local escape',{timeout:150000},async()=>{
 const project='demo-triamicci-v31',{privateKey}=generateKeyPairSync('rsa',{modulusLength:2048});
 Object.assign(process.env,{APP_ENV:'staging',PUBLIC_APP_URL:'https://terminal-e2e.test',FIREBASE_EXPECTED_PROJECT_ID:project,FIRESTORE_EMULATOR_HOST:'127.0.0.1:8080',FIREBASE_AUTH_EMULATOR_HOST:'127.0.0.1:9099',FIREBASE_SERVICE_ACCOUNT_JSON:JSON.stringify({project_id:project,client_email:'terminal@'+project+'.iam.gserviceaccount.com',private_key:privateKey.export({type:'pkcs8',format:'pem'}).toString()})});
 const [{getDb},{default:members},{default:products},{default:push},{createServer:createVite}]=await Promise.all([import('../server/_lib.js'),import('../api/members/manage.js'),import('../api/products/manage.js'),import('../server/push/handler.js'),import('vite')]);
 const db=getDb(),unit='terminal-'+randomUUID();
 await db.doc('units/'+unit+'/live/attendance').set({protocolVersion:2,revision:'initial',domains:{stock:'0',catalog:'0',notifications:'0'}});
 const account=async(role,unitId=unit)=>{const email=randomUUID()+'@terminal.test';const res=await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=local',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email,password:'demo-terminal-password',returnSecureToken:true})});assert.equal(res.status,200);const a=await res.json();await db.doc('memberships/'+a.localId).set({role,unitId,status:'active',name:'Pessoa '+role,email});return {uid:a.localId,token:a.idToken,email}};
 const manager=await account('manager'),helper=await account('auxiliar'),foreign=await account('manager','other-'+unit);
 const call=async(action,payload={},token=manager.token,route=members)=>{const r={code:200,setHeader(){},status(c){this.code=c;return this},json(b){this.body=b;return this}};await route({method:'POST',url:'/api/members/manage',headers:{origin:'https://terminal-e2e.test','content-type':'application/json',...(token?{authorization:'Bearer '+token}:{})},body:{module:'terminals',action,...payload}},r);return {status:r.code,...r.body}};
 assert.equal((await call('register',{name:'No permission'},helper.token)).status,403);
 const registered=await call('register',{name:'Caixa backend'});assert.equal(registered.status,201);const device=registered.terminal;
 const start=async(d=device)=>{const p={terminalId:d.id,deviceSecret:d.secret,requestId:key(),browserSecret:key(),scanSecret:key()};const r=await call('pairStart',p,null);assert.equal(r.status,200,JSON.stringify(r));return {...p,code:r.code}};
 const p=await start();assert.equal((await call('pairDetails',p,foreign.token)).status,403);assert.equal((await call('pairApprove',{...p,confirm:true,code:'0000'},helper.token)).status,400);
 assert.equal((await call('pairApprove',{...p,confirm:true},helper.token)).status,200);
 assert.equal((await call('pairRedeem',{...p,browserSecret:key()},null)).status,403);
 const contenders=await Promise.all([call('pairRedeem',p,null),call('pairRedeem',p,null)]);assert.deepEqual(contenders.map(r=>r.status).sort(),[200,410]);const redeemed=contenders.find(r=>r.status===200);assert.equal(redeemed.membership.role,'auxiliar');assert.equal((await call('pairRedeem',p,null)).status,410);
 assert.equal((await call('sessionTouch',{},redeemed.credential)).status,200);
 assert.equal((await call('devices',{},redeemed.credential)).status,403,'terminal cannot administer devices');
 assert.equal((await call('list',{module:undefined},redeemed.credential)).status,403,'auxiliar cannot call managerial listing');
 assert.equal((await call('list',{module:undefined},redeemed.credential,products)).status,200);
 assert.equal((await call('pushConfiguration',{module:undefined},redeemed.credential,push)).status,403);
 const sid=redeemed.credential.split('.')[1];await db.doc('terminalSessions/'+sid).update({idleUntil:new Date(Date.now()-1)});assert.equal((await call('list',{module:undefined},redeemed.credential,products)).status,401);
 // Another pair on a fresh device tests role changes and terminal revocation.
 const d2=(await call('register',{name:'Caixa second'})).terminal,p2=await start(d2);await call('pairApprove',{...p2,confirm:true},manager.token);const s2=await call('pairRedeem',p2,null);
 assert.equal((await call('list',{module:undefined},s2.credential)).status,200,'manager keeps managerial permissions');
 assert.equal((await call('pairDetails',p2,s2.credential)).status,403,'delegated sessions cannot approve another device');
 await db.doc('memberships/'+manager.uid).update({role:'auxiliar'});assert.equal((await call('list',{module:undefined},s2.credential,products)).status,401);await db.doc('memberships/'+manager.uid).update({role:'manager'});
 assert.equal((await call('list',{module:undefined},s2.credential,products)).status,401,'restoring role cannot resurrect an ended session');
 assert.equal((await call('revokeDevice',{id:d2.id})).status,200);assert.equal((await call('list',{module:undefined},s2.credential,products)).status,401);
 const expired=(await call('register',{name:'Caixa expired'})).terminal,ep=await start(expired);await db.doc('terminalRequests/'+ep.requestId).update({expiresAt:new Date(Date.now()-1)});assert.equal((await call('pairApprove',{...ep,confirm:true},helper.token)).status,410);
 // Serve real handlers and real React flow against demo emulators only.
 const vite=await createVite({root:process.cwd(),server:{middlewareMode:true},appType:'mpa'});
 const server=createServer(async(req,res)=>{if(req.url.startsWith('/api/')){try{let body='';for await(const chunk of req)body+=chunk;req.body=JSON.parse(body);req.headers.origin='https://terminal-e2e.test';res.status=c=>{res.statusCode=c;return res};res.json=b=>{res.setHeader('content-type','application/json');res.end(JSON.stringify(b));return res};await (req.url.startsWith('/api/products/')?products:members)(req,res)}catch(e){res.statusCode=500;res.end(JSON.stringify({message:e.message}))}}else vite.middlewares(req,res)});
 await new Promise(r=>server.listen(4195,'127.0.0.1',r));let browser;
 try{
  browser=await chromium.launch({headless:true});const desktopContext=await browser.newContext(),phoneContext=await browser.newContext({viewport:{width:390,height:844}}),desktop=await desktopContext.newPage(),phone=await phoneContext.newPage(),errors=[];
  for(const page of [desktop,phone])page.on('pageerror',e=>errors.push(e.message));
  const base='http://127.0.0.1:4195/qa/terminal-access.html';
  await desktop.goto(base+'?email='+manager.email);await desktop.getByRole('button',{name:'Entrar conta demo'}).click();await desktop.getByRole('heading',{name:'Área operacional demo'}).waitFor();await desktop.getByRole('button',{name:'Terminais e minhas sessões'}).click();await desktop.getByLabel('Nome do terminal').fill('Caixa navegador');await desktop.getByRole('button',{name:'Cadastrar este navegador como caixa',exact:true}).click();await desktop.getByRole('heading',{name:'Caixa navegador',exact:true}).waitFor();
  await desktop.reload();await desktop.getByRole('button',{name:'Gerar QR Code para entrar'}).click();await desktop.getByAltText('QR Code de autorização do caixa').waitFor();const link=await desktop.getByLabel('Link de autorização').inputValue();assert.match(link,/#terminalApprove=/);
  await phone.goto(base+'?email='+helper.email+new URL(link).hash);await phone.getByRole('button',{name:'Entrar conta demo'}).click();await phone.getByRole('button',{name:'Autorizar entrada',exact:true}).waitFor();await phone.getByRole('button',{name:'Autorizar entrada',exact:true}).click();await phone.getByRole('heading',{name:'Entrada autorizada'}).waitFor();await desktop.getByRole('heading',{name:'Área operacional demo'}).waitFor();assert.match(await desktop.getByRole('status').innerText(),/auxiliar/);
  await desktop.getByRole('button',{name:'Consultar API real demo'}).click();await desktop.locator('#api-result').filter({hasText:'200'}).waitFor();
  await desktop.getByTestId('live-refreshes').filter({hasText:/^1$/}).waitFor();await db.doc('units/'+unit+'/live/attendance').update({'domains.stock':'1',revision:'stock-change'});await desktop.getByTestId('live-refreshes').filter({hasText:/^2$/}).waitFor();
  await phone.getByRole('button',{name:'Voltar ao meu aplicativo'}).click();await phone.getByRole('button',{name:'Terminais e minhas sessões'}).click();await phone.getByRole('button',{name:'Encerrar sessão',exact:true}).click();await desktop.getByRole('heading',{name:'Caixa navegador',exact:true}).waitFor();assert.equal(await desktop.getByRole('heading',{name:'Área operacional demo'}).count(),0);
  await desktop.getByRole('button',{name:'Sair do modo caixa e desvincular navegador'}).click();await desktop.getByRole('button',{name:'Entrar pelo caixa'}).waitFor();assert.equal(await desktop.evaluate(()=>localStorage.getItem('triamicci.terminal.v1')),null);
  // Reload an already-authorized terminal, then advance inactivity virtually.
  const idleDevice=(await call('register',{name:'Caixa inatividade'})).terminal,idlePair=await start(idleDevice);await call('pairApprove',{...idlePair,confirm:true},helper.token);const idleSession=await call('pairRedeem',idlePair,null);
  await desktop.evaluate(({d,s})=>{localStorage.setItem('triamicci.terminal.v1',JSON.stringify(d));sessionStorage.setItem('triamicci.terminal-session.v1',s)}, {d:idleDevice,s:idleSession.credential});await desktop.reload();await desktop.getByRole('heading',{name:'Área operacional demo'}).waitFor();
  await desktop.clock.install();await desktop.clock.fastForward(185000);await desktop.getByRole('heading',{name:'Caixa inatividade',exact:true}).waitFor();assert.equal(await desktop.getByRole('heading',{name:'Área operacional demo'}).count(),0);
  // Local escape must work even when every backend request fails.
  await desktop.route('**/api/**',route=>route.abort());await desktop.getByRole('button',{name:'Sair do modo caixa e desvincular navegador'}).click();await desktop.getByRole('button',{name:'Entrar pelo caixa'}).waitFor();
  assert.deepEqual(errors,[]);const audit=await db.collection('auditLogs').where('unitId','==',unit).get();assert.ok(audit.docs.some(d=>d.data().event==='terminal.request_authorized'&&d.data().actorUid===helper.uid));
 }finally{await browser?.close();await vite.close();await new Promise(r=>server.close(r))}
});
