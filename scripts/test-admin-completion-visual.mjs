import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {writeFileSync} from 'node:fs';

// Real browser and persistence, isolated accounts/database. Only AI provider
// responses are controlled; backend/provider contracts have separate tests.
export async function runAdminCompletionVisual({base,password,folder}){
 const require=createRequire(import.meta.url);
 let playwright;try{playwright=require('playwright');}catch{playwright=require('../.qa-tools/node_modules/playwright');}
 const browser=await playwright.chromium.launch({headless:true,...(process.platform==='win32'?{executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'}:{})});
 const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();
 const checks=[],failures=[];
 page.setDefaultTimeout(20000);
 page.on('pageerror',error=>failures.push({name:'JavaScript',message:error.message}));
 const session=async()=>{const response=await page.request.get(base+'/api/session');assert.equal(response.status(),200);return response.json();};
 const step=name=>page.getByRole('navigation',{name:'Pasos de creación'}).getByRole('button',{name:new RegExp(name+'$')});
 async function evidence(name){
  assert(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)<=2,name+': no horizontal overflow');
  await page.screenshot({path:resolve(folder,name+'.png'),fullPage:true});
 }
 async function saved(id){return (await session()).values['rv360:custom-tests'].find(test=>test.id===id);}
 try{
  await page.goto(base+'/admin/login');
  await page.getByLabel('Correo electrónico',{exact:true}).fill('admin@example.test');
  await page.getByLabel('Contraseña',{exact:true}).fill(password);
  await page.getByRole('button',{name:'Ingresar al panel',exact:true}).click();await page.waitForURL('**/admin');
  for(const level of ['bachillerato','universidad']){
   const id='qa-completion-'+level+'-'+Date.now(),title='Exploración de intereses '+level;
   const original={id,version:'1',schemaVersion:2,educationLevel:level,title,purpose:'Explorar los intereses del estudiante.',description:'',source:'',scoring:'manual',aggregation:'sum',status:'Borrador',group:'Todos los estudiantes',due:'',maxAttempts:3,durationMinutes:25,resultPublication:'review',audience:'all',options:[{value:1,label:'Poco'},{value:2,label:'Mucho'}],questions:Array.from({length:10},(_,index)=>({id:'qa-question-'+(index+1),text:'',type:'likert'}))};
   const current=await session(),key='rv360:custom-tests';
   const seed=await page.request.put(base+'/api/state',{headers:{Origin:base},data:{key,value:[...(current.values[key]||[]),original],revision:current.revisions[key]||0}});
   assert.equal(seed.status(),200,await seed.text());
   await page.goto(base+'/admin/evaluaciones?nivel='+level+'&editar='+id);
   await page.getByRole('button',{name:'Completar test con IA',exact:true}).waitFor();
   assert.equal(await page.getByRole('button',{name:'Preparar introducción con IA',exact:true}).count(),0,'Only one AI completion action');
   await step('Revisar y publicar').click();
   for(let n=1;n<=10;n++)await page.getByRole('button',{name:'Pregunta '+n+': Escribe el enunciado.',exact:true}).waitFor();
   const issueTarget=await page.getByRole('button',{name:'Pregunta 1: Escribe el enunciado.',exact:true}).boundingBox();
   assert(issueTarget&&issueTarget.height>=44,'Validation links have an accessible touch target');
   await evidence('admin-completion-'+level+'-numbered-errors');
   await page.getByRole('button',{name:'Pregunta 10: Escribe el enunciado.',exact:true}).click();
   assert.equal(await page.getByRole('button',{name:'Editar pregunta 10',exact:true}).getAttribute('aria-current'),'true');
   const manual='Me interesa organizar actividades con otras personas.';
   await page.getByLabel('Enunciado',{exact:true}).fill(manual);
   await step('Información').click();
   let attempts=0,release;
   const paused=new Promise(resolve=>{release=resolve;});
   const handler=async route=>{
    const request=route.request().postDataJSON();
    if(request.operation!=='test-draft')return route.continue();
    attempts++;
    if(attempts===1)return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'La IA no respondió a tiempo. Conservamos el borrador para reintentar.'})});
    assert.equal(request.instrument.educationLevel,level);
    assert.equal(request.instrument.questions[9].text,manual);
    await paused;
    const instrument=structuredClone(request.instrument);
    instrument.description='Lee cada afirmación y elige cuánto se parece a tus intereses. No hay respuestas correctas o incorrectas.';
    instrument.presentation={title:'Explora tus intereses',summary:'Descubre qué actividades te llaman la atención con diez preguntas breves.'};
    instrument.source='Borrador de preguntas generado con IA; requiere revisión del administrador.';
    instrument.questions=instrument.questions.map((question,index)=>({...question,text:question.text||'Me interesa explorar la actividad número '+(index+1)+'.'}));
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({instrument,completed:['Instrucciones','Introducción','9 enunciados'],review:['Revisa las preguntas antes de publicar.'],issues:[],complete:true})});
   };
   await page.route('**/api/import-presentation',handler);
   await page.getByRole('button',{name:'Completar test con IA',exact:true}).click();
   await page.getByRole('alert').filter({hasText:'La IA no respondió a tiempo.'}).waitFor();
   assert.equal(await page.getByLabel('Nombre del test',{exact:true}).inputValue(),title);
   const requestSeen=page.waitForRequest(request=>request.url().endsWith('/api/import-presentation')&&request.method()==='POST'&&request.postDataJSON()?.operation==='test-draft');
   await page.getByRole('button',{name:'Completar test con IA',exact:true}).click();await requestSeen;
   await page.locator('.manager-editor-fields[disabled]').waitFor();
   assert(await page.getByLabel('Nombre del test',{exact:true}).isDisabled(),'Editing is locked during completion');
   assert(await page.getByRole('button',{name:'Guardar borrador',exact:true}).isDisabled(),'Saving is locked during completion');
   await page.setViewportSize({width:390,height:844});await evidence('admin-completion-'+level+'-busy-mobile');
   release();
   await page.getByText('Borrador completado. Revisa antes de publicar.',{exact:true}).waitFor();
   await evidence('admin-completion-'+level+'-complete-mobile');
   await page.setViewportSize({width:1440,height:1000});
   assert.equal(await page.getByLabel('Nombre del test',{exact:true}).inputValue(),title);
   assert.match(await page.getByLabel('Instrucciones',{exact:true}).inputValue(),/Lee cada afirmación/);
   await page.getByRole('button',{name:'Revisar test completo',exact:true}).click();
   await page.getByRole('button',{name:'Publicar test',exact:true}).waitFor();
   assert.equal(await page.getByRole('button',{name:/Pregunta \d+: Escribe el enunciado/}).count(),0);
   await evidence('admin-completion-'+level+'-review');
   assert.equal(await page.getByRole('button',{name:'Guardar borrador',exact:true}).count(),1,'The review step has a single draft save action');
   await page.getByRole('button',{name:'Guardar borrador',exact:true}).click();
   await page.getByRole('button',{name:'Volver a tests',exact:true}).click();
   await page.waitForURL(url=>url.pathname==='/admin/evaluaciones'&&!url.searchParams.has('editar'));
   const draft=await saved(id);
   assert.equal(draft.status,'Borrador','AI completion must never publish automatically');
   assert.equal(draft.title,title,'The administrative title is preserved alongside the generated student presentation');
   assert.equal(draft.questions.length,10);assert(draft.questions.every(question=>question.text.trim()));
   assert.equal(draft.questions[9].text,manual);assert.deepEqual(draft.options,original.options);
   for(const key of ['educationLevel','maxAttempts','durationMinutes','resultPublication','audience','scoring'])assert.equal(draft[key],original[key],key+' must be preserved');
   await page.goto(base+'/admin/evaluaciones?nivel='+level+'&editar='+id);
   await page.getByLabel('Instrucciones',{exact:true}).waitFor();
   assert.match(await page.getByLabel('Instrucciones',{exact:true}).inputValue(),/Lee cada afirmación/);
   await step('Preguntas').click();await page.getByRole('button',{name:'Editar pregunta 10',exact:true}).click();
   assert.equal(await page.getByLabel('Enunciado',{exact:true}).inputValue(),manual);
   await step('Revisar y publicar').click();await page.getByRole('button',{name:'Publicar test',exact:true}).click();
   await page.waitForURL(url=>url.pathname==='/admin/evaluaciones'&&!url.searchParams.has('editar'));
   assert.equal((await saved(id)).status,'Publicado');
   await page.reload();await page.getByRole('heading',{name:'Explora tus intereses',exact:true}).waitFor();
   assert.equal(attempts,2);await page.unroute('**/api/import-presentation',handler);
   checks.push({level,passed:'10 numbered validation links; exact question navigation; AI failure and retry; busy locks; full completion with manual content/settings preserved; mobile layout; draft save/reload and explicit publication'});
  }
  assert.equal(failures.length,0,JSON.stringify(failures));
  console.log('PASS admin AI completion browser: both categories, numbered issues, retry, full draft, preservation, save/reload, publication and mobile screenshots.');
 }catch(error){failures.push({message:error.message});await page.screenshot({path:resolve(folder,'admin-completion-failure.png'),fullPage:true}).catch(()=>{});throw error;}
 finally{writeFileSync(resolve(folder,'admin-completion-visual-results.json'),JSON.stringify({checks,failures},null,2));await browser.close();}
}
