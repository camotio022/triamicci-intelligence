import assert from 'node:assert/strict';
import test from 'node:test';
import {createServer} from 'vite';
import {chromium} from './helpers/browser.mjs';

const fixture=`<!doctype html><html lang="pt-BR"><meta name="viewport" content="width=device-width,initial-scale=1">
<div id="root"></div><script type="module">
import React from 'react';
import {createRoot} from 'react-dom/client';
import '/src/coverage.css';
import OperationalCoverage from '/src/OperationalCoverage.jsx';

const plan={id:'nov',period:'2026-11',status:'published'};
const days=[1,8,15,22,29,30].map(day=>{
 const confirmedDeficit=day===22||day===29;
 return {date:'2026-11-'+String(day).padStart(2,'0'),sunday:day!==30,recurring:[],shifts:[{
  sector:'cozinha',shift:'noite',attention:true,confirmedDeficit,uncertain:!confirmedDeficit,
  headcountGap:1,roleGap:0,skillGap:0,intervalGap:0,extra:confirmedDeficit?1:0
 }]};
});
const row={sector:'cozinha',shift:'noite',window:{start:'12:00',end:'20:20'},
 minimum:4,count:2,headcountGap:2,roleGap:0,skill:'montagem',skillGap:1,skillCount:2,people:[],candidates:[]};
const interval={sector:'cozinha',skill:'montagem',start:'18:00',end:'19:00',covered:2,minimum:3,deficit:1,uids:['a','b']};
const request=async action=>action==='assessMonth'?{month:{days,extra:1}}:{
 evaluation:{shifts:[row],recurring:[],intervals:[interval]},context:{production:{pending:1}}
};
createRoot(document.getElementById('root')).render(React.createElement(OperationalCoverage,{
 data:{plans:[plan],alerts:[],proposals:[]},request,preferenceKey:'coverage-test'
}));
</script></html>`;

test('monthly coverage remains navigable by touch and distinguishes confirmed gaps', {timeout:45000}, async()=>{
 const route='/__coverage_interface';
 const vite=await createServer({server:{host:'127.0.0.1',port:0},plugins:[{
  name:'coverage-interface-test',
  configureServer(server){
   server.middlewares.use(route,async (_req,res,next)=>{
    try{
     res.setHeader('Content-Type','text/html');
     res.end(await server.transformIndexHtml(route,fixture));
    }catch(error){next(error);}
   });
  }
 }]});
 let browser;
 try{
  await vite.listen();
  const base=vite.resolvedUrls.local[0];
  browser=await chromium.launch({headless:true});
  for(const width of [360,390,720,1440]){
   const mobile=width<=720;
   const page=await browser.newPage({viewport:{width,height:850},isMobile:mobile,hasTouch:mobile});
   page.setDefaultTimeout(6000);
   const errors=[];
   page.on('pageerror',error=>errors.push(error.message));
   await page.clock.setFixedTime(new Date('2026-11-25T15:00:00Z'));
   await page.goto(new URL(route,base).href);
   const cards=page.locator('.ti-cov-month-dates .day:visible');
   await cards.first().waitFor();
   assert.equal(await cards.count(),5,'Sunday cards at '+width+' px');
   const filters=page.getByRole('navigation',{name:'Dias do mês'});
   await filters.getByRole('button',{name:'Falta confirmada'}).click();
   assert.deepEqual(await cards.getByRole('button').allTextContents(),['Dom. 29/11Falta confirmada']);
   await filters.getByRole('button',{name:'A conferir'}).click();
   assert.deepEqual(await cards.getByRole('button').allTextContents(),['30/11A conferir']);
   await filters.getByRole('button',{name:'Todos os dias'}).click();
   assert.equal(await cards.count(),6);
   await filters.getByRole('button',{name:'Domingos'}).click();
   const sunday=cards.getByRole('button',{name:/29\/11/});
   if(mobile)await sunday.tap();
   else await sunday.click();
   await page.getByRole('heading',{name:/Turnos de 29\/11/}).waitFor();
   if(mobile)await page.waitForFunction(()=>document.activeElement?.textContent.includes('Turnos de 29/11'));
   await page.getByRole('button',{name:'Ver opções'}).click().catch(async error=>{
    throw new Error(await page.locator('body').innerText(),{cause:error});
   });
   const drawer=page.getByRole('dialog');
   const explanation=await drawer.getByText(/O turno tem/).innerText();
   assert.match(explanation,/2 de 4/);
   assert.match(explanation,/2 de 3 conseguem ficar na montagem/);
   assert.match(explanation,/18:00 às 19:00/);
   await drawer.getByText('Há produção pendente no dia. Alguma tarefa coincide com este turno?').waitFor();
   await page.keyboard.press('Escape');
   await drawer.waitFor({state:'hidden'});
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   assert.deepEqual(errors,[]);
   await page.close();
  }
 }finally{
  await browser?.close();
  await vite.close();
 }
});
