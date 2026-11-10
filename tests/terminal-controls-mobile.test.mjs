import test from 'node:test';import assert from 'node:assert/strict';import {createServer} from 'vite';import {chromium} from './helpers/browser.mjs';
test('terminal controls remain clickable beside the fixed sidebar and fit phone widths',{timeout:60000},async()=>{
 const server=await createServer({root:new URL('../',import.meta.url).pathname,configFile:false,server:{host:'127.0.0.1',port:0},plugins:[{name:'terminal-layout-fixture',enforce:'pre',
  configureServer(s){s.middlewares.use((req,res,next)=>{if(req.url!=='/terminal-layout.html')return next();res.setHeader('content-type','text/html');res.end('<meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module" src="/@terminal-layout"></script>')})},
  resolveId(id){if(id==='/@terminal-layout')return '\0terminal-layout';if(id==='./firebase.js')return '\0terminal-firebase'},
  load(id){if(id==='\0terminal-firebase')return 'export const auth={currentUser:{uid:"fixture",getIdToken:async()=>"fixture-token"}};export const sessionAuth=auth;export const db={};export const isIndependentSession=false;';if(id==='\0terminal-layout')return `import React from 'react';import {createRoot} from 'react-dom/client';import {TerminalManagement} from '/src/TerminalAccess.jsx';import '/src/styles.css';import '/src/sidebar-premium.css';const h=React.createElement;createRoot(document.getElementById('root')).render(h(React.Fragment,null,h(TerminalManagement,{membership:{unitId:'fixture',role:'manager'},onRegistered:()=>{}}),h('aside',{className:'sidebar ti-sidebar-premium','aria-hidden':true},'Menu lateral'),h('div',{className:'ti-terminal-banner'},h('strong',null,'Pessoa gerente'),h('span',null,'Caixa 01'),h('button',null,'Bloquear / trocar operador')),h('button',{className:'ti-terminal-escape'},'Desvincular este navegador')));`}
 }]});let browser;
 try{await server.listen();browser=await chromium.launch({headless:true});const port=server.httpServer.address().port;
  for(const width of [320,390,900,1024,1280]){
   const page=await browser.newPage({viewport:{width,height:900}}),errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error(e.message)});
   await page.route('**/*',route=>{const url=new URL(route.request().url());if(url.hostname!=='127.0.0.1')return route.abort();if(url.pathname.startsWith('/api/'))return route.fulfill({json:{sessions:[],terminals:[]}});return route.continue()});
   await page.goto('http://127.0.0.1:'+port+'/terminal-layout.html');const control=page.getByRole('button',{name:'Terminais e minhas sessões'});await control.waitFor();
   for(const name of ['Terminais e minhas sessões','Bloquear / trocar operador','Desvincular este navegador']){
    const button=page.getByRole('button',{name,exact:true});const box=await button.boundingBox();assert.ok(box.x>=0&&box.x+box.width<=width+1);assert.equal(await button.evaluate(el=>{const r=el.getBoundingClientRect();return el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))}),true,name+' at '+width);
   }
   await control.click();await page.getByLabel('Nome do terminal').fill('Caixa teste');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,'no horizontal overflow at '+width);assert.deepEqual(errors,[]);await page.close();
  }
 }finally{await browser?.close();await server.close()}
});
