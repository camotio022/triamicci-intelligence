import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {chromium} from 'playwright';

test('V3.1: layouts reais cabem em telas mobile sem overflow', {timeout:100000}, async()=>{
 const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','4178','--strictPort'],{stdio:'pipe'});
 let output='';server.stdout.on('data',c=>output+=c.toString());server.stderr.on('data',c=>output+=c.toString());
 let browser;
 try{
  let ready=false;
  for(let i=0;i<80;i++){
   if(server.exitCode!==null)throw Error('Vite saiu: '+output);
   try{const r=await fetch('http://127.0.0.1:4178/qa/v31-mobile.html');if(r.ok){ready=true;break}}catch{}
   await new Promise(resolve=>setTimeout(resolve,200));
  }
  if(!ready)throw Error('Vite indisponível: '+output);
  browser=await chromium.launch({headless:true});
  for(const width of [320,375,430,768,1280]){
   const page=await browser.newPage({viewport:{width,height:900},deviceScaleFactor:1});
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto('http://127.0.0.1:4178/qa/v31-mobile.html',{waitUntil:'domcontentloaded'});
   await page.getByText('Escala de folgas').waitFor();
   await page.getByRole('button',{name:'Enviar conferência'}).waitFor();
   await page.getByText('Perdas, avarias e vencimentos').waitFor();
   const dimensions=await page.evaluate(()=>({viewport:window.innerWidth,document:document.documentElement.scrollWidth,body:document.body.scrollWidth}));
   assert.ok(dimensions.document<=dimensions.viewport+1,'Horizontal overflow '+width+': '+JSON.stringify(dimensions));
   assert.ok(dimensions.body<=dimensions.viewport+1,'Body horizontal overflow '+width+': '+JSON.stringify(dimensions));
   assert.deepEqual(errors,[],'Browser error '+width);
   await page.screenshot({path:'/tmp/v31-mobile-'+width+'.png',fullPage:true});
   await page.close();
  }
 }finally{
  if(browser)await browser.close();
  server.kill('SIGTERM');
 }
});
