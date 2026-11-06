import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {chromium} from 'playwright';
import {runProgress} from '../server/checklists/rules.js';
import {checklistPhotoBase64} from './fixtures/checklist-photo.js';

test('checklists: cadastro, publicação e conferência com câmera no mobile',{timeout:120000},async()=>{
 const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','4187','--strictPort'],{stdio:'pipe'});let browser;
 try{
  for(let n=0;n<80;n++){try{if((await fetch('http://127.0.0.1:4187/qa/checklists.html')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
  browser=await chromium.launch({headless:true,args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream']});
  const day=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo'}).format(new Date());
  for(const [width,role] of [[320,'manager'],[390,'submanager'],[768,'manager'],[1280,'submanager'],[390,'cook'],[390,'auxiliar']]){
   const page=await browser.newPage({viewport:{width,height:900}}),errors=[],requests=[];page.on('pageerror',e=>errors.push(e.message));
   let template={id:'template-test',revision:2,version:1,hasDraft:false,archived:false,published:{name:'Conferência personalizada',moment:'other',frequency:'daily',dueTime:'22:20',roles:['cook','auxiliar'],weekdays:[],items:[{id:'custom-item',title:'Verificação personalizada',guidance:'Enquadramento definido pela gestão',critical:true,required:true,photoRequired:true,allowNA:false}]}};template.draft=structuredClone(template.published);let run=role==='auxiliar'?{id:'auto-run-0001',templateId:template.id,model:structuredClone(template.published),day,revision:0,answers:{}}:null,failAnswer=role==='auxiliar';
   await page.route('**/api/members/manage',async route=>{
    const b=route.request().postDataJSON(),action=b.action;requests.push(b);let result={message:'Operação de homologação'};
    if(action==='configuration')result={message:'Armazenamento verificado no teste',ready:true};
    if(action==='today')result={...result,day,photoEnabled:true,templates:[{id:template.id,version:template.version,model:template.published}],runs:run?[{...run,progress:runProgress(run)}]:[]};
    if(action==='templates')result.templates=[template];
    if(action==='saveTemplate')template={...template,id:b.id,draft:b.model,revision:b.expectedRevision+1,hasDraft:true};
    if(action==='publishTemplate')template={...template,published:structuredClone(template.draft),revision:b.expectedRevision+1,version:template.version+1,hasDraft:false};
    if(action==='start'){run={id:'run-00001',templateId:template.id,model:structuredClone(template.published),day,revision:0,answers:{}};result.runId=run.id;}
    if(action==='run')result.run={...run,progress:runProgress(run)};
    if(action==='captureStart')result.photoId='photo-00001';
    if(action==='photoUpload'){assert.ok(b.base64.length>100);assert.ok(b.base64.length<819200);result.photoId=b.photoId;}
    if(action==='answer'&&failAnswer){failAnswer=false;await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'Envio indisponível no teste'})});return;}
    if(action==='answer'){assert.equal(b.photoId,'photo-00001');run.answers[b.itemId]={status:b.status,note:b.note,photoId:b.photoId,name:'Pessoa de teste',at:new Date().toISOString()};run.revision++;}
    if(action==='photoRead')result.dataUrl='data:image/jpeg;base64,'+checklistPhotoBase64;
    if(action==='history'){result.runs=[];result.next=null;}
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(result)});
   });
   await page.goto('http://127.0.0.1:4187/qa/checklists.html?role='+role);
   await page.getByRole('heading',{name:'Checklists da unidade',exact:true}).waitFor();
   if(['manager','submanager'].includes(role)){
    await page.getByRole('button',{name:'Gestão',exact:true}).click();
    await page.getByRole('button',{name:'Verificar armazenamento',exact:true}).click();
    await page.getByText('Armazenamento verificado no teste',{exact:true}).waitFor();
    await page.getByRole('button',{name:'Criar checklist',exact:true}).click();
    await page.getByLabel('Nome do checklist',{exact:true}).fill('Minha rotina '+width);
    await page.getByLabel('Horário limite',{exact:true}).fill('22:20');
    await page.getByRole('button',{name:'Excluir item 1',exact:true}).click();
    await page.getByText(/Nenhum item no modelo/).waitFor();
    await page.getByRole('button',{name:'Desfazer exclusão do item',exact:true}).click();
    await page.getByRole('button',{name:'Excluir item 1',exact:true}).click();
    await page.getByRole('button',{name:'Salvar rascunho',exact:true}).click();
    await page.getByText(/Rascunho salvo/).waitFor();
    assert.equal(await page.getByRole('button',{name:'Publicar checklist',exact:true}).isEnabled(),false);
    await page.getByRole('button',{name:'Adicionar item',exact:true}).click();
    await page.getByLabel('O que conferir',{exact:true}).fill('Item criado pela gestão');
    await page.getByRole('checkbox',{name:'Crítico',exact:true}).check();
    await page.getByRole('checkbox',{name:'Foto na hora',exact:true}).check();
    assert.equal(await page.getByRole('checkbox',{name:'Obrigatório',exact:true}).isEnabled(),false);
    await page.getByRole('button',{name:'Salvar rascunho',exact:true}).click();
    await page.getByRole('button',{name:'Publicar checklist',exact:true}).click();
    await page.getByRole('heading',{name:'Modelos da unidade',exact:true}).waitFor();
   }else assert.equal(await page.getByRole('button',{name:'Gestão',exact:true}).count(),0);
   await page.getByRole('button',{name:'Hoje',exact:true}).click();
   if(role==='auxiliar')await page.getByText('Não iniciado',{exact:true}).waitFor();
   await page.getByRole('button',{name:/^Iniciar (checklist|conferência)$/}).click();
   await page.getByRole('button',{name:'Fotografar conferência',exact:true}).click();
   await page.getByLabel('Câmera ao vivo para conferir o item').waitFor();
   await page.waitForFunction(()=>document.querySelector('video')?.videoWidth>0);
   await page.getByRole('button',{name:'Tirar foto',exact:true}).click();
   await page.getByRole('button',{name:'Enviar foto',exact:true}).click();
   await page.getByText('Foto enviada para esta conferência.',{exact:true}).waitFor();
   await page.getByRole('radio',{name:'Conferido',exact:true}).check();
   await page.getByRole('button',{name:'Confirmar e continuar',exact:true}).click();
   if(role==='auxiliar'){await page.getByRole('alert').filter({hasText:'Envio indisponível no teste'}).waitFor();assert.equal(await page.getByText('Conferência concluída e enviada.',{exact:true}).count(),0);await page.getByRole('button',{name:'Confirmar e continuar',exact:true}).click();}
   await page.getByText('Conferência concluída e enviada.',{exact:true}).waitFor();
   await page.getByRole('button',{name:'Ver foto',exact:true}).click();
   await page.getByAltText('Evidência privada da conferência').waitFor();
   assert.equal(await page.locator('input[type=file]').count(),0,'No gallery chooser');
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,'No horizontal overflow '+width);
   if(width===320)await page.screenshot({path:'/tmp/checklists-mobile-320.png',fullPage:true});
   assert.deepEqual(errors,[]);assert.ok(requests.some(r=>r.action==='photoUpload'));await page.close();
  }
 }finally{if(browser)await browser.close();server.kill('SIGTERM');}
});
