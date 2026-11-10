import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'vite';
import {chromium} from './helpers/browser.mjs';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

test('real live hook preserves storage UI and reuses production navigation reads',{timeout:60000},async()=>{
 const root=new URL('../',import.meta.url).pathname;
 const cacheDir=await mkdtemp(join(tmpdir(),'ti-read-budget-'));
 const server=await createServer({root,configFile:false,cacheDir,server:{host:'127.0.0.1',port:0},plugins:[{
  name:'isolated-firestore-read-fixture',enforce:'pre',
  configureServer(server){server.middlewares.use((req,res,next)=>{if(req.url?.split('?')[0]!=='/read-fixture.html')return next();res.setHeader('Content-Type','text/html');res.end('<div id="root"></div><script type="module" src="/@read-fixture"></script>')})},
  resolveId(s){if(s==='/@read-fixture')return '\0read-fixture';if(s==='./firebase.js')return '\0read-firebase';if(s==='firebase/firestore')return '\0read-firestore'},
  load(id){
   if(id==='\0read-firebase')return 'export const auth={currentUser:{uid:"fixture-user",getIdToken:async()=>"fixture-token"}};export const sessionAuth=auth;export const db={};export const app={};export const isIndependentSession=false;';
   if(id==='\0read-firestore')return `export const doc=(...args)=>args;export function onSnapshot(_doc,_opts,next){const listener=data=>next({data:()=>data,metadata:{fromCache:false}});window.fixtureListeners??=new Set();window.fixtureListeners.add(listener);queueMicrotask(()=>listener(window.fixtureLive));return()=>window.fixtureListeners.delete(listener)}`;
   if(id==='\0read-fixture')return `
    import React,{useState} from 'react';import {createRoot} from 'react-dom/client';
    import StorageManager from '/src/StorageManager.jsx';import Production from '/src/Production.jsx';
    import {NotificationProvider} from '/src/NotificationCenter.jsx';import {FeedbackProvider} from '/src/FeedbackProvider.jsx';
    import {setApiScope} from '/src/api-fetch.js';
    window.fixtureLive={protocolVersion:2,revision:'initial',domains:{stock:'0',catalog:'0',production:'0',notifications:'0'}};
    window.fixtureEmit=changes=>{window.fixtureLive={...window.fixtureLive,revision:crypto.randomUUID(),domains:{...window.fixtureLive.domains,...changes}};for(const listener of window.fixtureListeners)listener(window.fixtureLive)};
    setApiScope('fixture-user:isolated:manager:active');
    function App(){const [page,setPage]=useState('storage');const membership={unitId:'isolated',role:'manager'};return React.createElement(FeedbackProvider,null,React.createElement(NotificationProvider,{unitId:'isolated'},React.createElement('button',{onClick:()=>setPage('storage')},'Storage fixture'),React.createElement('button',{onClick:()=>setPage('production')},'Production fixture'),React.createElement(page==='storage'?StorageManager:Production,{membership})))}
    createRoot(document.getElementById('root')).render(React.createElement(App));`;
  }
 }]});
 let browser;
 try{
  await server.listen();
  browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{})});
  const page=await browser.newPage({viewport:{width:390,height:844}}),calls=[],errors=[],external=[];
  page.on('pageerror',e=>{errors.push(e.message);console.error('Fixture page error:',e.message)});let failStorage=false;
  await page.route('**/*',async route=>{
   const request=route.request(),url=new URL(request.url());
   if(url.hostname!=='127.0.0.1'){external.push(request.url());return route.abort()}
   if(!url.pathname.startsWith('/api/'))return route.continue();
   const body=request.postDataJSON();calls.push({path:url.pathname,...body});
   if(body.action==='storageList')return route.fulfill({status:failStorage?503:200,json:failStorage?{code:'DATA_QUOTA_EXHAUSTED',message:'Quota fixture'}:{storages:[{id:'one',name:'Reserva',area:'reserva',frequency:'daily',countMode:'by_product'}],links:[],progress:[]}});
   if(body.action==='list'&&url.pathname==='/api/production/manage')return route.fulfill({json:{products:[],recipes:[],blockedRecipes:[],reviewRecipes:[],runs:[]}});
   if(body.action==='dayList')return route.fulfill({json:{tasks:[]}});
   if(body.action==='notifications')return route.fulfill({json:{notifications:[]}});
   if(body.action==='v3Alerts')return route.fulfill({json:{signals:[],deliveries:[]}});
   return route.fulfill({json:{products:[]}});
  });
  const address=server.httpServer.address();const url=`http://127.0.0.1:${address.port}/read-fixture.html`;
  // Keep the eight-hour shift inside one restaurant day, independent of CI time.
  await page.clock.install({time:new Date('2026-11-10T12:00:00Z')});
  await page.goto(url);await page.locator('.ti-storage-stats').waitFor();
  assert.equal(await page.locator('.ti-storage-stats strong').first().textContent(),'1');
  assert.equal(await page.evaluate(()=>window.fixtureListeners.size),1,'provider and page share one physical listener');
  for(let i=0;i<4;i++){
   await page.getByRole('button',{name:'Production fixture',exact:true}).click();await page.locator('.production-page').waitFor();
   await page.clock.fastForward(30000);
   await page.getByRole('button',{name:'Storage fixture',exact:true}).click();await page.locator('.ti-storage-stats').waitFor();
  }
  const count=(path,action)=>calls.filter(c=>c.path===path&&c.action===action).length;
  assert.equal(count('/api/production/manage','list'),1,'navigation retains the confirmed workspace revision');
  assert.equal(count('/api/production/manage','dayList'),1);
  assert.equal(count('/api/operations/stock','storageList'),1);
  assert.ok(calls.find(c=>c.path==='/api/production/manage'&&c.action==='list').includeProducts);
  await page.getByRole('button',{name:'Production fixture',exact:true}).click();
  const beforeIdle=calls.length;
  await page.clock.fastForward(8*60*60*1000);
  assert.equal(calls.length,beforeIdle,'eight virtual idle hours do not poll or refetch expired cache');
  assert.equal(await page.evaluate(()=>window.fixtureListeners.size),1);
  const stockRefresh=page.waitForResponse(r=>r.url().includes('/api/production/manage')&&r.request().postDataJSON()?.action==='list');
  await page.evaluate(()=>window.fixtureEmit({stock:'1'}));
  await stockRefresh;
  assert.equal(count('/api/production/manage','list'),2,'stock change still refreshes the mounted page');
  assert.equal(count('/api/production/manage','dayList'),1,'stock does not reread unchanged tasks');
  await page.getByRole('button',{name:'Storage fixture',exact:true}).click();await page.locator('.ti-storage-stats').waitFor();
  const before=count('/api/operations/stock','storageList');
  const storageRefresh=page.waitForResponse(r=>r.request().postDataJSON()?.action==='storageList');
  await page.evaluate(()=>window.fixtureEmit({stock:'2'}));await page.clock.fastForward(8000);
  await storageRefresh;
  assert.equal(count('/api/operations/stock','storageList'),before+1,'storage now refreshes from the shared live stream');
  failStorage=true;await page.reload();await page.getByRole('alert').filter({hasText:'Quota fixture'}).waitFor();
  assert.equal(await page.locator('.ti-storage-stats').count(),0);
  assert.equal(await page.getByText('Vamos organizar a loja').count(),0);
  assert.deepEqual(errors,[]);assert.deepEqual(external,[],'the fixture never contacts Firebase or another external service');
 }finally{await browser?.close();await server.close();await rm(cacheDir,{recursive:true,force:true})}
});
