import test from 'node:test';import assert from 'node:assert/strict';import {spawn} from 'node:child_process';import {chromium} from './helpers/browser.mjs';
test('Acessos mobile: fotos, busca, filtros, histórico e convite em modal',{timeout:90000},async()=>{
 const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','4187','--strictPort'],{stdio:'pipe'});let browser;
 const photo='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1cAAAAASUVORK5CYII=';
 try{for(let i=0;i<60;i++){try{if((await fetch('http://127.0.0.1:4187/qa/v4-mobile.html')).ok)break}catch{}await new Promise(r=>setTimeout(r,100));}browser=await chromium.launch({headless:true});
 for(const width of [320,390,768,1280]){
  const page=await browser.newPage({viewport:{width,height:900}}),errors=[],sent=[],updates=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/**',async route=>{const b=route.request().postDataJSON()||{},path=new URL(route.request().url()).pathname;let response={message:'Consulta de teste',members:[{uid:'person-a',name:'Pessoa com foto',email:'pessoa.foto@example.test',role:'cook',status:'active',avatar:photo},{uid:'person-b',name:'Pessoa sem foto',email:'nome.muito.longo.para.testar@example.test',role:'auxiliar',status:'active',avatar:null},{uid:'person-c',name:'Pessoa desativada',email:'inativa@example.test',role:'cook',status:'inactive'}],invitations:[{id:'pending',email:'pendente@example.test',status:'pending',role:'auxiliar',deliveryMethod:'link',expiresAt:'2099-01-01T00:00:00Z'},{id:'accepted',email:'aceito@example.test',status:'accepted',role:'cook',deliveryMethod:'email'},{id:'revoked',email:'revogado@example.test',status:'revoked',role:'auxiliar',deliveryMethod:'link'},{id:'expired',email:'expirado@example.test',status:'pending',expiresAt:'2020-01-01',role:'auxiliar'}],schedules:[],items:[],registry:[],presence:[],tasks:[],notices:[],products:[]};
   if(path==='/api/invitations/create'){sent.push(b);response={message:'Convite de teste criado.',inviteUrl:'https://example.invalid/invite?token=ficticio'};}
   if(path==='/api/members/manage'&&b.action==='update'){updates.push(b);response={message:'Acesso atualizado no teste.'};}
   await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(response)});
  });
  await page.goto('http://127.0.0.1:4187/qa/v4-mobile.html');await page.getByRole('navigation',{name:'Telas de teste'}).getByRole('button',{name:'Convites',exact:true}).click();
  await page.getByRole('heading',{name:'Acessos da unidade'}).waitFor();await page.getByRole('img',{name:'Foto de Pessoa com foto',exact:true}).waitFor();assert.equal(await page.getByRole('img',{name:'Foto de Pessoa com foto'}).getAttribute('src'),photo);
  assert.equal(await page.getByText('Pessoa desativada',{exact:true}).count(),0);
  await page.getByLabel('Buscar pessoa',{exact:true}).fill('sem foto');assert.equal(await page.getByText('Pessoa com foto',{exact:true}).count(),0);await page.getByLabel('Buscar pessoa',{exact:true}).fill('');
  await page.getByRole('navigation',{name:'Situação dos acessos'}).getByRole('button',{name:/Desativados/}).click();await page.getByText('Pessoa desativada',{exact:true}).waitFor();
  await page.getByRole('navigation',{name:'Situação dos acessos'}).getByRole('button',{name:/Pendentes/}).click();await page.getByText('pendente@example.test',{exact:true}).waitFor();assert.equal(await page.getByText('aceito@example.test',{exact:true}).isVisible(),false);assert.equal(await page.getByText('expirado@example.test',{exact:true}).isVisible(),false);
  await page.locator('.access-history>summary').click();await page.getByText('aceito@example.test',{exact:true}).waitFor();assert.match(await page.locator('.access-history').innerText(),/Aceito/);assert.match(await page.locator('.access-history').innerText(),/Revogado/);assert.match(await page.locator('.access-history').innerText(),/Expirado/);
  await page.getByRole('navigation',{name:'Situação dos acessos'}).getByRole('button',{name:/Ativos/}).click();
  const invite=page.getByRole('button',{name:'+ Convidar pessoa',exact:true});await invite.click();const dialog=page.getByRole('dialog',{name:'Convidar pessoa',exact:true});await dialog.waitFor();assert.equal(await dialog.getByRole('button',{name:'Gerar convite',exact:true}).isEnabled(),false);await dialog.getByLabel('E-mail da pessoa').fill('novo@example.test');await dialog.getByLabel('Função na unidade').selectOption('cook');assert.equal(await dialog.getByRole('button',{name:'E-mail',exact:true}).count(),1);assert.equal(await dialog.getByText('Resend',{exact:false}).count(),0);
  if(width===390)await page.screenshot({path:'/tmp/triamicci-access-invite-390.png',fullPage:false});
  await dialog.getByRole('button',{name:'Gerar convite',exact:true}).click();await dialog.getByRole('region',{name:'Convite gerado'}).waitFor();assert.equal(sent.length,1);assert.equal(sent[0].role,'cook');assert.equal(sent[0].unitId,'qa-unit');assert.equal(sent[0].deliveryMethod,'link');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,'Modal sem overflow '+width);await page.keyboard.press('Escape');assert.equal(await page.getByRole('dialog').count(),0);assert.equal(await invite.evaluate(e=>e===document.activeElement),true,'Foco retorna ao convite');
  await page.getByRole('button',{name:'Gerir acesso de Pessoa com foto',exact:true}).click();const edit=page.getByRole('dialog',{name:'Gerir acesso',exact:true});await edit.getByRole('img',{name:'Foto de Pessoa com foto'}).waitFor();
  await edit.getByLabel('Função',{exact:true}).selectOption('auxiliar');
  await edit.getByRole('button',{name:'Revisar alteração'}).click();
  await edit.getByText('Conferir antes de salvar').waitFor();
  assert.equal(updates.length,0,'Revisão não envia alterações antes de confirmar');
  await edit.getByRole('button',{name:'Voltar à edição'}).click();
  assert.equal(await edit.getByText('Conferir antes de salvar').count(),0,'Voltar não modifica permissões');
  await edit.getByRole('button',{name:'Revisar alteração'}).click();
  await edit.getByRole('button',{name:'Confirmar alteração'}).click();
  await page.locator('.team-directory .team-notice').getByText('Acesso atualizado no teste.',{exact:true}).waitFor();
  assert.equal(updates.length,1,'A alteração é enviada uma única vez após confirmar');
  assert.equal(updates[0].uid,'person-a');
  assert.equal(updates[0].role,'auxiliar');
  assert.equal(updates[0].status,'active');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,'Página sem overflow '+width);assert.equal(await page.locator('.team-member').first().evaluate(e=>getComputedStyle(e).flexDirection),'row','Cartão horizontal compacto');assert.ok(await page.locator('.team-member').first().evaluate(e=>e.getBoundingClientRect().height)<180,'Cartão compacto');if(width===390)await page.screenshot({path:'/tmp/triamicci-access-list-390.png',fullPage:true});assert.deepEqual(errors,[]);await page.close();
 }
 }finally{await browser?.close();server.kill('SIGTERM');}
});
