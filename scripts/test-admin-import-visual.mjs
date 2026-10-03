import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {writeFileSync} from 'node:fs';

// Invoked only by the isolated HTTP harness. This browser never uses a real
// administrator account, the production database, or a configured AI provider.
export async function runAdminImportVisual({base,password,folder}) {
 const require=createRequire(import.meta.url);
 let playwright;try{playwright=require('playwright');}catch{playwright=require('../.qa-tools/node_modules/playwright');}
 const browser=await playwright.chromium.launch({headless:true,...(process.platform==='win32'?{executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'}:{})});
 const context=await browser.newContext({viewport:{width:1440,height:1000}});
 const page=await context.newPage(),checks=[],failures=[];
 page.setDefaultTimeout(20000);
 page.on('pageerror',error=>failures.push({name:'JavaScript',message:error.message}));
 const levelName=level=>level==='bachillerato'?'Bachillerato':'Universidad';
 const otherLevel=level=>level==='bachillerato'?'universidad':'bachillerato';
 const api=async path=>{const response=await page.request.get(base+'/api/'+path);assert.equal(response.status(),200);return response.json();};
 const waitCatalog=async(path,level)=>{
  await page.waitForURL(url=>url.pathname==='/admin/'+path&&url.searchParams.get('nivel')===level&&!url.searchParams.has('editar'));
  await page.getByRole('heading',{name:path==='cursos'?'Simuladores y preguntas':'Tests y evaluaciones',exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:levelName(level),exact:true}).getAttribute('aria-pressed'),'true');
 };
 const card=title=>page.locator('.test-manager-card').filter({has:page.getByRole('heading',{name:title,exact:true})});
 async function evidence(name){
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);
  assert(overflow<=2,name+': horizontal overflow '+overflow);
  await page.screenshot({path:resolve(folder,name+'.png'),fullPage:true});
 }
 async function verifyCatalog(path,level,title){
  await waitCatalog(path,level);await card(title).waitFor();
  await page.reload();await waitCatalog(path,level);await card(title).waitFor();
  await page.getByRole('button',{name:levelName(otherLevel(level)),exact:true}).click();
  await waitCatalog(path,otherLevel(level));assert.equal(await card(title).count(),0,'Published content cannot leak into the other category');
  await page.getByRole('button',{name:levelName(level),exact:true}).click();await waitCatalog(path,level);await card(title).waitFor();
  await evidence('admin-import-'+path+'-'+level);
  await page.setViewportSize({width:390,height:844});await evidence('admin-import-'+path+'-'+level+'-mobile');
  await page.setViewportSize({width:1440,height:1000});
 }
 function documentHtml(title,careerIds,missingExplanation=false){
  const metadata={title,description:'Lee la pregunta y selecciona la respuesta correcta.',presentation:{title,summary:'Resuelve la pregunta de práctica.'},educationLevel:'ambos',schemaVersion:2,scoring:'objective',aggregation:'sum',source:'Documento de prueba local',
   careerLinks:careerIds.map((careerId,index)=>({id:'relation-'+index,careerId,dimensionId:'General',min:0,max:1,reason:'Explorar esta opción a partir del contenido de práctica.',source:'Criterio de prueba local'})),
   questions:[{id:'fixture-q1',text:'¿Cuánto es 2 + 2?',type:'single',policy:'objective',weight:1,correctValues:[1],explanation:'Sumar dos unidades y otras dos da cuatro unidades.',source:'Aritmética elemental',options:[{value:1,label:'4'},{value:2,label:'5'}]}]};
  if(missingExplanation)delete metadata.questions[0].explanation;
  return '<!doctype html><html lang="es"><head><meta charset="utf-8"></head><body><h1>'+title+'</h1><script type="application/json">'+JSON.stringify(metadata)+'</script></body></html>';
 }
 try{
  await page.goto(base+'/admin/login');
  await page.getByLabel('Correo electrónico',{exact:true}).fill('admin@example.test');
  await page.getByLabel('Contraseña',{exact:true}).fill(password);
  await page.getByRole('button',{name:'Ingresar al panel',exact:true}).click();await page.waitForURL('**/admin');
  const catalog=await api('training');
  const school=catalog.careers.find(c=>c.id==='bachillerato:ciencias');
  const university=catalog.careers.find(c=>!c.id.startsWith('bachillerato:')&&c.offers?.length);
  assert(school&&university,'Both categories and actual university offers must exist in the catalog');
  const targets={bachillerato:school,universidad:university};
  for(const level of ['bachillerato','universidad']){
   const target=targets[level],wrong=targets[otherLevel(level)];
   const title='QA test '+level+' '+Date.now();
   await page.goto(base+'/admin/evaluaciones?nivel='+level);await waitCatalog('evaluaciones',level);
   await page.getByRole('button',{name:'Importar documento',exact:true}).click();
   const dialog=page.getByRole('dialog'),html=documentHtml(title,[target.id,wrong.id]);
   if(level==='bachillerato'){
    await dialog.getByRole('button',{name:'Pegar código HTML',exact:true}).click();
    await dialog.getByLabel('Código HTML del test',{exact:true}).fill(html);
    await dialog.getByRole('button',{name:'Extraer preguntas del HTML',exact:true}).click();
   }else{
    await dialog.locator('input[type="file"]').setInputFiles({name:'test-universidad.html',mimeType:'text/html',buffer:Buffer.from(html)});
   }
   await dialog.getByRole('button',{name:'Guardar todos como borradores',exact:true}).click({timeout:60000});
   await waitCatalog('evaluaciones',level);await card(title).waitFor();
   await card(title).locator('summary').click();await card(title).getByRole('button',{name:'Editar borrador',exact:true}).click();
   await page.getByRole('navigation',{name:'Pasos de creación'}).getByRole('button',{name:/Resultados$/}).click();
   await page.locator('summary').filter({hasText:level==='bachillerato'?'Relaciones con modalidades':'Relaciones con carreras'}).click();
   const careerSelect=page.getByRole('combobox',{name:level==='bachillerato'?'Modalidad o figura de Bachillerato':'Carrera',exact:true});
   await careerSelect.click();await page.getByRole('option',{name:target.name,exact:true}).waitFor();
   assert.equal(await page.getByRole('option',{name:wrong.name,exact:true}).count(),0,'The editor must offer careers only from its own category');
   await page.getByRole('option',{name:target.name,exact:true}).click();
   await page.getByRole('button',{name:'Guardar borrador',exact:true}).click();
   await page.getByRole('button',{name:'Volver a tests',exact:true}).click();await waitCatalog('evaluaciones',level);
   await page.reload();await waitCatalog('evaluaciones',level);await card(title).waitFor();
   await card(title).locator('summary').click();await card(title).getByRole('button',{name:'Editar borrador',exact:true}).click();
   await page.getByLabel('Nombre del test',{exact:true}).waitFor();
   await page.goBack();await waitCatalog('evaluaciones',level);await card(title).waitFor();
   await page.goForward();await page.getByLabel('Nombre del test',{exact:true}).waitFor();
   assert.equal(await page.getByLabel('Nombre del test',{exact:true}).inputValue(),title,'Forward history must reopen the correct saved test');
   await page.getByRole('navigation',{name:'Pasos de creación'}).getByRole('button',{name:/Revisar y publicar$/}).click();
   await page.getByRole('button',{name:'Publicar test',exact:true}).click();
   await verifyCatalog('evaluaciones',level,title);
   const test=(await api('session')).values['rv360:custom-tests'].find(test=>test.title===title);
   assert.equal(test.status,'Publicado');assert.equal(test.educationLevel,level);assert.deepEqual(test.careerLinks.map(link=>link.careerId),[target.id]);
   checks.push({kind:'test',level,passed:'HTML import, category-only careers, draft persistence, back/forward history, publication, reload, category navigation and mobile layout'});
  }
  for(const level of ['bachillerato','universidad']){
   const target=targets[level],wrong=targets[otherLevel(level)];
   const title='QA simulador '+level+' '+Date.now();
   await page.goto(base+'/admin/cursos?nivel='+level);await waitCatalog('cursos',level);
   await page.getByRole('button',{name:'Importar documento',exact:true}).click();
   const dialog=page.getByRole('dialog'),missingAI=level==='bachillerato'&&process.env.DB_DRIVER!=='mysql';
   const html=documentHtml(title,[target.id,wrong.id],missingAI);
   const aiUnavailable=missingAI?page.waitForResponse(response=>response.url().includes('/api/import-presentation')&&response.request().method()==='POST'&&(response.status()<300||response.status()>=400)):null;
   if(level==='bachillerato'){
    await dialog.getByRole('button',{name:'Pegar código HTML',exact:true}).click();
    await dialog.getByLabel('Código HTML del simulador',{exact:true}).fill(html);
    await dialog.getByRole('button',{name:'Importar HTML',exact:true}).click();
   }else{
    await dialog.getByLabel('Seleccionar documento del simulador',{exact:true}).setInputFiles({name:'simulador-universidad.html',mimeType:'text/html',buffer:Buffer.from(html)});
   }
   await page.getByLabel('Nombre del simulador',{exact:true}).waitFor({timeout:60000});
   const choices=page.getByRole('group',{name:level==='bachillerato'?'Áreas y figuras de bachillerato':'Carreras del simulador',exact:true});
   assert.equal(await choices.getByRole('checkbox',{name:target.name,exact:true}).isChecked(),true,'The document career must be preselected automatically');
   assert.equal(await choices.getByRole('checkbox',{name:wrong.name,exact:true}).count(),0);
   if(level==='universidad'){
    await page.getByText('Universidades que ofrecen las carreras seleccionadas',{exact:true}).click();
    await page.getByText(university.offers[0].institution,{exact:true}).first().waitFor();
   }
   if(missingAI){
    const response=await aiUnavailable;assert.equal(response.status(),503);assert.equal((await response.json()).code,'AI_CONFIG');
    await page.getByText(/El servicio de IA necesita configuración\./).waitFor();
    await page.getByRole('navigation',{name:'Editor de simulador'}).getByRole('button',{name:/Puntuación$/}).click();
    await page.getByLabel('Explicación al estudiante',{exact:true}).fill('Sumar dos unidades y otras dos da cuatro unidades.');
    checks.push({kind:'AI fallback',level,passed:'Missing provider configuration remains actionable; imported questions can be completed manually and saved'});
   }
   await page.getByRole('button',{name:'Guardar borrador',exact:true}).click();
   await page.getByText('Borrador guardado correctamente.',{exact:true}).waitFor();
   await page.reload();await page.getByLabel('Nombre del simulador',{exact:true}).waitFor();
   assert.equal(await page.getByLabel('Nombre del simulador',{exact:true}).inputValue(),title,'Saved editor URL must recover the draft after reload');
   await page.getByRole('button',{name:'Guardar y volver',exact:true}).click();await waitCatalog('cursos',level);await card(title).waitFor();
   await card(title).locator('summary').click();await card(title).getByRole('button',{name:'Editar borrador',exact:true}).click();
   await page.getByLabel('Nombre del simulador',{exact:true}).waitFor();
   await page.goBack();await waitCatalog('cursos',level);await card(title).waitFor();
   await page.goForward();await page.getByLabel('Nombre del simulador',{exact:true}).waitFor();
   assert.equal(await page.getByLabel('Nombre del simulador',{exact:true}).inputValue(),title,'Forward history must reopen the correct saved simulator');
   await page.getByRole('navigation',{name:'Editor de simulador'}).getByRole('button',{name:/Revisar y publicar$/}).click();
   await page.getByRole('checkbox',{name:'He revisado las claves, explicaciones y procedencia de todas las preguntas.',exact:true}).check();
   await page.getByRole('button',{name:'Preparar vista previa',exact:true}).click();
   await page.getByRole('radio',{name:'4',exact:true}).check();
   await page.getByRole('button',{name:'Calcular con el servidor',exact:true}).click();
   await page.getByText(/100 \/ 100 · 1 de 1 puntos/).waitFor();
   await page.getByRole('button',{name:'Publicar simulador',exact:true}).click();
   await verifyCatalog('cursos',level,title);
   const simulator=(await api('training')).simulators.find(simulator=>simulator.title===title);
   assert.equal(simulator.status,'published');assert.equal(simulator.educationLevel,level);assert.deepEqual(simulator.careerIds,[target.id]);assert.equal(simulator.questions[0].reviewed,true);
   checks.push({kind:'simulator',level,passed:'HTML import, automatically assigned category-only careers, university offers, draft URL recovery, back/forward history, server grading, review, publication, reload and mobile layout'});
  }
  assert.equal(failures.length,0,JSON.stringify(failures));
 }catch(error){
  failures.push({name:'Workflow',message:error.message,url:page.url()});await page.screenshot({path:resolve(folder,'admin-import-failure.png'),fullPage:true}).catch(()=>{});
  writeFileSync(resolve(folder,'admin-import-failure.txt'),await page.locator('body').innerText().catch(()=>''));throw error;
 }finally{
  writeFileSync(resolve(folder,'admin-import-visual-results.json'),JSON.stringify({checks,failures},null,2));await browser.close();
 }
 console.log('PASS admin browser imports: both categories, tests and simulators, draft recovery, publication, redirects, university offers and desktop/mobile layouts. Evidence: '+folder);
}
