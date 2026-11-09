import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'vite';
import {chromium} from 'playwright';
const root=new URL('../',import.meta.url).pathname;
const baseItems=()=>[
 {id:'access-one',title:'Acesso atualizado',message:'Perfil de acesso: admin → auxiliar',at:new Date().toISOString(),read:false,source:'Equipe',page:'my-profile'},
 {id:'long-message',title:'Ficha profissional atualizada com informações de jornada e disponibilidade da equipe',message:'Sua jornada habitual foi atualizada. '+('Observação importante para a operação. '.repeat(12)),at:new Date().toISOString(),read:false,source:'Equipe'},
 {id:'old-trash',title:'Aviso anterior',message:'Registro na lixeira',at:new Date(Date.now()-86400000).toISOString(),read:true,deletedAt:new Date().toISOString()}
];
test('notification module: mobile density, independent route, lifecycle and collapsed device settings',{timeout:120000},async()=>{
 const server=await createServer({root,server:{host:'127.0.0.1',port:4181,strictPort:true},plugins:[{name:'notifications-isolated-fixture',enforce:'pre',resolveId(source){if(source==='./firebase.js')return '\0fixture-firebase';if(source==='./useUnitLive.js')return '\0fixture-live'},load(id){
  if(id==='\0fixture-firebase')return 'export const auth={currentUser:{uid:"fixture-user",getIdToken:async()=>"fixture-token"}};export const db={};export const app={};export const isIndependentSession=false;';
  if(id==='\0fixture-live')return 'import {useEffect,useRef} from "react";export function useUnitLive(unit,refresh){const latest=useRef(refresh);latest.current=refresh;useEffect(()=>{latest.current(true,null)},[unit]);return {status:"live"}}';
 }}]});
 await server.listen();let browser;
 try{
  browser=await chromium.launch({headless:true,...(process.env.NOTIFICATION_CHROMIUM_PATH?{executablePath:process.env.NOTIFICATION_CHROMIUM_PATH}:{})});
  for(const width of [320,390,430,768,1280]){
   const context=await browser.newContext({viewport:{width,height:844}}),page=await context.newPage(),errors=[],actions=[];let items=baseItems(),loads=0;
   page.on('pageerror',e=>errors.push(e.message));
   await page.addInitScript(()=>{
    let current=null;const sub={endpoint:'https://web.push.apple.com/fixture',keys:{p256dh:'a'.repeat(87),auth:'b'.repeat(22)}};
    const registration={pushManager:{getSubscription:async()=>current,subscribe:async()=>{current={toJSON:()=>sub,unsubscribe:async()=>{current=null;return true}};return current}}};
    Object.defineProperty(navigator,'serviceWorker',{value:{register:async()=>registration,getRegistration:async()=>registration,ready:Promise.resolve(registration)}});
    window.PushManager=function(){};window.Notification={permission:'default',requestPermission:async()=>{Notification.permission='granted';return 'granted'}};
   });
   await page.route('**/api/**',async route=>{
    const body=route.request().postDataJSON()||{};actions.push(body.action);
    if(body.action==='notifications'){loads++;return route.fulfill({json:{notifications:items}})}
    if(body.action==='v3Alerts')return route.fulfill({json:{signals:[{id:'cheddar',productName:'Cheddar',location:'giro'}],deliveries:[]}});
    if(body.action==='pushConfiguration')return route.fulfill({json:{configured:true,publicKey:'a'.repeat(87)}});
    const item=items.find(n=>n.id===body.id);
    if(item){if(body.action==='notificationOpen'){item.read=true;item.readAt=new Date().toISOString();item.openedAt=item.readAt}if(body.action==='notificationDelete')item.deletedAt=new Date().toISOString();if(body.action==='notificationRestore')item.deletedAt=null;}
    return route.fulfill({json:{message:'Operação concluída.'}});
   });
   await page.goto('http://127.0.0.1:4181/qa/notifications-module.html?page=notifications');
   await page.getByRole('heading',{name:'Notificações',exact:true}).waitFor();
   await page.getByRole('button',{name:/Acesso atualizado/}).waitFor();
   assert.equal(await page.locator('.ti-notification-panel').count(),0);
   assert.equal(await page.getByRole('button',{name:'Testar aviso',exact:true}).isVisible(),false);
   const dimensions=await page.evaluate(()=>({width:innerWidth,document:document.documentElement.scrollWidth,body:document.body.scrollWidth,row:document.querySelector('.ti-notify-row').getBoundingClientRect().height,device:document.querySelector('.ti-notify-device').getBoundingClientRect().height}));
   assert.ok(dimensions.document<=width+1&&dimensions.body<=width+1,JSON.stringify(dimensions));
   assert.ok(dimensions.row<=125,'Default notice row must stay compact: '+JSON.stringify(dimensions));assert.ok(dimensions.device<=80,'Device controls must stay collapsed.');
   const initialLoads=loads;await page.getByRole('button',{name:/Abrir notificações:/}).click();assert.ok(page.url().includes('page=notifications'));assert.equal(loads,initialLoads,'Bell navigation must reuse provider data');
   await page.getByRole('button',{name:'Não lidas',exact:true}).click();
   const access=page.locator('.ti-notify-row').filter({has:page.getByRole('button',{name:/Acesso atualizado/})});
   await access.locator('.ti-notify-summary').click();await access.getByRole('button',{name:'Excluir',exact:true}).waitFor();
   assert.equal(await access.locator('.ti-notify-summary').getAttribute('aria-expanded'),'true','Read-on-open must not hide the expanded unread notice');
   await access.getByRole('button',{name:'Excluir',exact:true}).click();await page.getByRole('button',{name:/Lixeira/}).click();
   const trash=page.locator('.ti-notify-row').filter({has:page.getByRole('button',{name:/Acesso atualizado/})});
   await trash.locator('.ti-notify-summary').click();await trash.getByRole('button',{name:'Restaurar',exact:true}).click();
   await page.getByRole('button',{name:/Recebidas/}).click();await page.getByRole('button',{name:/Acesso atualizado/}).waitFor();
   await page.locator('.ti-notify-device>summary').click();await page.getByRole('button',{name:'Ativar notificações',exact:true}).click();await page.getByRole('button',{name:'Testar aviso',exact:true}).click();await page.getByRole('button',{name:'Desativar aqui',exact:true}).click();await page.getByRole('button',{name:'Ativar notificações',exact:true}).waitFor();
   assert.ok(actions.includes('pushSubscribe')&&actions.includes('pushTest')&&actions.includes('pushUnsubscribe'));
   assert.deepEqual(errors,[],'Browser errors at '+width);
   await page.locator('.ti-notify-device>summary').click();await page.screenshot({path:'/tmp/triamicci-notifications-'+width+'.png',fullPage:true});
   await context.close();
  }
 }finally{if(browser)await browser.close();await server.close()}
});
