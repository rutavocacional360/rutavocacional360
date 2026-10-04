import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {readFileSync,writeFileSync} from 'node:fs';

export async function runGuidanceVisual({base,password,folder,schoolPracticeTemplate}){
 const require=createRequire(import.meta.url);
 let playwright;try{playwright=require('playwright');}catch{playwright=require('../.qa-tools/node_modules/playwright');}
 const browser=await playwright.chromium.launch({headless:true,...(process.platform==='win32'?{executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'}:{})});
 const failures=[],checks=[];
 const schoolHeading='Modalidad recomendada: Bachillerato en Ciencias';
 async function choose(page,label,option){await page.getByRole('combobox',{name:label,exact:true}).click();await page.getByRole('option',{name:option,exact:true}).click();}
 async function shot(page,name){await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:resolve(folder,name+'.png'),fullPage:true});await page.screenshot({path:resolve(folder,name+'-viewport.png')});}
 async function overflow(page,name){
  const data=await page.evaluate(()=>({width:innerWidth,overflow:document.documentElement.scrollWidth-innerWidth,culprits:[...document.querySelectorAll('main *')].filter(e=>{const r=e.getBoundingClientRect();return r.width&&r.right>innerWidth+2&&getComputedStyle(e).position!=='fixed';}).slice(0,8).map(e=>({tag:e.tagName,class:e.className,width:e.getBoundingClientRect().width}))}));
  checks.push({name,...data});if(data.overflow>2)failures.push({name,...data});
 }
 async function numberedOptions(region,expected,name){
  const cards=region.locator('.rd-recommended');
  assert.equal(await cards.count(),expected,name+': every recommendation remains available');
  const labels=await cards.locator('.rd-option-number').allTextContents();
  assert.deepEqual(labels.map(value=>Number(value.trim())),Array.from({length:expected},(_,index)=>index+1),name+': options are numbered continuously from 1 to N');
  for(let index=0;index<expected;index++){
   assert(await cards.nth(index).isVisible(),name+': option '+(index+1)+' is visible without expanding another group');
   assert.equal(await cards.nth(index).locator('.rd-option-number').getAttribute('aria-label'),'Opción '+(index+1));
  }
  assert.equal(await cards.locator('.rd-offer-details').count(),0,name+': extended information opens in the option dialog');
  checks.push({name,options:expected,numbering:'1..'+expected});
 }
 async function singleSchoolModality(page,modality,expected,name){
  const region=page.getByRole('region',{name:'Orientación de bachillerato',exact:true});
  await numberedOptions(region,expected,name);
  assert.equal(await region.locator('.bp-group').count(),modality?1:0,name+': only the selected modality has an option group');
  assert.equal(await region.locator('.bp-group-heading h3').filter({hasText:/Bachillerato/}).count(),0,name+': the top modality heading is not repeated');
  if(modality){
   assert.equal(await region.getByRole('button',{name:modality==='ciencias'?/Conocer la figura/:/Conocer el área/}).count(),0,name+': no alternative modality cards');
  }else{
   await region.getByRole('heading',{name:'Modalidad por definir',exact:true}).waitFor();
   assert.equal(await region.locator('a[href*="/mi-ruta/cursos?"]').count(),0,name+': a tie never chooses preparation');
  }
 }
 async function schoolVariants(context,report){
  for(const suggested of ['tecnico','ambas']){
   const variant=structuredClone(report);variant.analysis.pathway.suggested=suggested;
   variant.analysis.pathway.reason=suggested==='tecnico'?'Las respuestas de esta prueba visual priorizan actividades técnicas.':'La evidencia de esta prueba visual no prioriza una sola modalidad.';
   variant.analysis.summary=variant.analysis.pathway.reason;
   variant.analysis.pathway.nextSteps=[suggested==='tecnico'?'Compara las figuras recomendadas y visita sus talleres con tu orientador.':'Revisa los resultados con tu orientador para definir tu siguiente paso.'];
   variant.analysis.nextSteps=variant.analysis.pathway.nextSteps;
   const variantPage=await context.newPage();
   variantPage.on('pageerror',error=>failures.push({name:'Variante escolar '+suggested,message:error.message}));
   // Isolated response fixtures exercise old reports with both raw arrays; stored results are unchanged.
   await variantPage.route('**/api/reports/guidance',route=>route.fulfill({json:{items:[variant],configured:false}}));
   try{
    for(const width of [1440,375]){
     await variantPage.setViewportSize({width,height:900});await variantPage.goto(base+'/mi-ruta/resultados');
     await variantPage.getByRole('heading',{name:suggested==='tecnico'?'Modalidad recomendada: Bachillerato Técnico':'Modalidad por definir',exact:true}).waitFor();
     await singleSchoolModality(variantPage,suggested==='tecnico'?'tecnico':null,suggested==='tecnico'?variant.analysis.pathway.technical.length:0,suggested+' '+width);
     await shot(variantPage,'resultados-'+suggested+'-'+width);await overflow(variantPage,'resultados-'+suggested+'-'+width);
    }
    if(suggested==='tecnico'){
     await variantPage.getByRole('button',{name:/Conocer la figura/}).first().click();
     await variantPage.getByRole('dialog').getByRole('heading',{name:'Una actividad para probar',exact:true}).waitFor();
     await shot(variantPage,'figura-dialogo-movil');await overflow(variantPage,'figura-dialogo-movil');await variantPage.keyboard.press('Escape');
    }
    await reportPdf(variantPage,'pdf-bachillerato-'+suggested);
   }finally{await variantPage.close();}
  }
 }
 async function reportPdf(page,name,downloadFile=true){
  await page.getByRole('button',{name:'Informe PDF',exact:true}).click();
  const viewer=page.locator('.rd-document'),downloadLink=viewer.getByRole('link',{name:'Descargar PDF',exact:true});
  await downloadLink.waitFor();
  await viewer.locator('.pdf-viewer-viewport[aria-busy="false"]').waitFor({timeout:60000});
  assert(await viewer.locator('canvas').isVisible(),name+': the PDF page is visible');
  assert(await viewer.locator('canvas').evaluate(canvas=>{
   const pixels=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
   let ink=0;for(let index=0;index<pixels.length;index+=4)if(pixels[index+3]&&pixels[index]<150)ink++;
   return ink>1000;
  }),name+': the PDF contains rendered text and graphics');
  await shot(page,name);await overflow(page,name);
  if(downloadFile){
   await viewer.getByRole('button',{name:'Página siguiente del PDF'}).click();
   await viewer.getByText('Página 2 de',{exact:false}).waitFor();
   await viewer.locator('.pdf-viewer-viewport[aria-busy="false"]').waitFor();
   const url=await downloadLink.getAttribute('href');assert(url.startsWith('blob:'));
   const printLink=viewer.getByRole('link',{name:'Abrir e imprimir',exact:true});
   assert.equal(await printLink.getAttribute('href'),url,name+': preview, download and print share the same report');
   assert.equal(await printLink.getAttribute('target'),'_blank');
   const downloadPromise=page.waitForEvent('download');await downloadLink.click();const download=await downloadPromise;
   const target=resolve(folder,name+'.pdf');await download.saveAs(target);
   const bytes=readFileSync(target);assert.equal(bytes.subarray(0,5).toString(),'%PDF-');assert(bytes.length>10000);
  }
  await page.getByRole('button',{name:'Mi orientación',exact:true}).click();
 }
 async function reportHistory(page,level){
  const history=page.locator('.results-history');
  assert.equal(await history.count(),1,level+': there is a single report-history footer');
  assert.equal(await history.getAttribute('open'),null,level+': report history starts collapsed');
  const session=await (await page.request.get(base+'/api/session')).json();
  const submissions=(session.values['rv360:submissions']||[]).filter(submission=>{
   const snapshot=typeof submission.snapshot==='string'?JSON.parse(submission.snapshot):submission.snapshot;
   return !snapshot?.educationLevel||snapshot.educationLevel==='ambos'||snapshot.educationLevel===level;
  });
  const rows=history.locator('.compact-history > details');
  assert.equal(await rows.count(),submissions.length,level+': every submission occurs once in the history');
  assert(submissions.length>0);
  const releasedIndex=submissions.findIndex(submission=>submission.resultReleased!==false);
  assert(releasedIndex>=0,level+': the fixture contains a published submission to consult');
  const row=rows.nth(releasedIndex);
  await history.locator('summary').first().click();
  await row.locator('summary').first().click();
  const answers=row.locator('summary').filter({hasText:/^(?:Consultar|Revisar) respuestas$/});
  await answers.click();
  assert(await row.locator('.preview-question, .rd-answers dd').first().isVisible(),level+': the historical submission still exposes its saved answers');
  await shot(page,'historial-'+level);await overflow(page,'historial-'+level);
  await history.locator('summary').first().click();
  checks.push({name:'Historial '+level,submissions:submissions.length,collapsed:true,answersAccessible:true});
 }
 async function magnifiedReport(level,expected){
  // A 960 CSS-pixel viewport at 1.5 device scale reproduces the layout and
  // physical screenshot dimensions of a 1440-pixel desktop viewed at 150%.
  const zoomContext=await browser.newContext({viewport:{width:960,height:667},deviceScaleFactor:1.5});
  const zoomPage=await zoomContext.newPage();
  zoomPage.on('pageerror',error=>failures.push({name:'Zoom '+level,message:error.message}));
  try{
   await login(zoomPage);await zoomPage.goto(base+'/mi-ruta/resultados');
   const region=zoomPage.getByRole('region',{name:level==='bachillerato'?'Orientación de bachillerato':'Carreras recomendadas',exact:true});
   await region.waitFor();await numberedOptions(region,expected,level+' escala 150%');
   await shot(zoomPage,'resultados-'+level+'-escala150');await overflow(zoomPage,level+' escala 150%');
  }finally{await zoomContext.close();}
 }
 async function conciseCareerDialog(page,recommendation,name){
  const normalize=value=>String(value||'').replace(/\s+/g,' ').trim();
  const comparison=normalize(recommendation.comparison),exploration=normalize(recommendation.explore);
  if(comparison&&exploration.includes(comparison)){
   const text=normalize(await page.getByRole('dialog').innerText());
   assert.equal(text.split(comparison).length-1,1,name+': the career comparison is presented once when the exploration already includes it');
   checks.push({name,comparisonOccurrences:1});
  }
 }
 async function login(page,admin=false){
  await page.goto(base+(admin?'/admin/login':'/ingresar'));
  await page.getByLabel('Correo electrónico',{exact:true}).fill(admin?'admin@example.test':'test@example.test');
  await page.getByLabel('Contraseña',{exact:true}).fill(password);
  await page.getByRole('button',{name:admin?'Ingresar al panel':'Ingresar',exact:true}).click();
  await page.waitForURL(admin?'**/admin':'**/mi-ruta');
 }
 try{
  const registrationContext=await browser.newContext({viewport:{width:1366,height:900}}),registration=await registrationContext.newPage();
  registration.on('pageerror',error=>failures.push({name:'Registration JavaScript',message:error.message}));
  await registration.goto(base+'/registro');
  await registration.getByRole('button',{name:'Continuar',exact:true}).click();
  await registration.getByText('Revisa los campos indicados para continuar.',{exact:true}).waitFor();
  await registration.getByLabel('Nombres',{exact:true}).fill('Estudiante');await registration.getByLabel('Apellidos',{exact:true}).fill('Explorando');
  await registration.getByLabel('Correo electrónico',{exact:true}).fill('visual-'+Date.now()+'@example.test');await registration.getByLabel('Contraseña',{exact:true}).fill(password);
  await registration.getByRole('button',{name:'Continuar',exact:true}).click();
  await choose(registration,'¿En qué etapa estás?','Estoy en 10.º de EGB y pasaré a 1.º de BGU');
  assert.equal(await registration.getByRole('combobox',{name:'Bachillerato que cursas, cursaste o has elegido',exact:true}).count(),0);
  assert.equal(await registration.getByRole('combobox',{name:'¿Qué te gustaría priorizar al aprender?',exact:true}).count(),0);
  await shot(registration,'registro-sin-eleccion');await overflow(registration,'registro-sin-eleccion');
  await registration.getByRole('button',{name:'Continuar',exact:true}).click();
  await registration.getByRole('checkbox').check();await registration.getByRole('button',{name:'Crear mi cuenta',exact:true}).click();await registration.waitForURL('**/mi-ruta');
  await registration.getByRole('heading',{name:'¿Qué bachillerato puedo elegir?',exact:true}).waitFor();
  const registered=await registration.request.get(base+'/api/session');const data=await registered.json();assert.equal(data.values['rv360:profile'].baccalaureate,'por-definir');
  await registration.reload();await registration.getByRole('heading',{name:'¿Qué bachillerato puedo elegir?',exact:true}).waitFor();await shot(registration,'inicio-sin-eleccion');
  await registration.setViewportSize({width:390,height:844});await overflow(registration,'inicio-sin-eleccion-movil');await shot(registration,'inicio-sin-eleccion-movil');
  await registrationContext.close();
  const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();
  page.on('pageerror',error=>failures.push({name:'JavaScript',message:error.message}));
  page.on('console',message=>{if(message.type()==='error')failures.push({name:'Browser console',message:message.text(),location:message.location(),page:page.url()});});
  await login(page);
  await page.goto(base+'/mi-ruta/perfil');
  await choose(page,'Etapa educativa','Estoy eligiendo mi bachillerato');
  await choose(page,'Bachillerato que cursas, cursaste o has elegido','Bachillerato Técnico');
  await page.getByRole('combobox',{name:'Especialidad o figura profesional',exact:true}).fill('Informática');
  await page.getByRole('combobox',{name:'Especialidad o figura profesional',exact:true}).press('Tab');
  await choose(page,'¿Qué te gustaría priorizar al aprender?','Aprender un oficio o especialidad mediante proyectos y práctica');
  await page.getByRole('button',{name:'Guardar cambios',exact:true}).click();
  await page.getByText('Tus datos se guardaron.',{exact:true}).waitFor();
  await shot(page,'perfil-escritorio');await overflow(page,'perfil-escritorio');
  await page.reload();assert.equal(await page.getByRole('combobox',{name:'Especialidad o figura profesional',exact:true}).inputValue(),'Informática');
  await page.goto(base+'/mi-ruta/resultados');
  await page.getByRole('heading',{name:schoolHeading,exact:true}).waitFor();
  const schoolRegion=page.getByRole('region',{name:'Orientación de bachillerato',exact:true});
  const schoolReport=(await (await page.request.get(base+'/api/reports/guidance')).json()).items.find(r=>!r.historical&&r.educationLevel==='bachillerato');
  assert(schoolReport?.analysis.pathway);
  const schoolCount=schoolReport.analysis.pathway.science.length;
  assert(schoolCount&&schoolReport.analysis.pathway.technical.length,'The raw fixture retains both modalities to verify only the recorded recommendation is shown');
  await singleSchoolModality(page,'ciencias',schoolCount,'Bachillerato escritorio');
  await schoolVariants(context,schoolReport);
  assert.equal(await page.locator('.rd-next[open]').count(),0,'Long next-step guidance starts collapsed');
  await reportHistory(page,'bachillerato');
  await magnifiedReport('bachillerato',schoolCount);
  await shot(page,'resultados-escritorio');await overflow(page,'resultados-escritorio');
  await page.getByRole('region',{name:'Orientación de bachillerato'}).screenshot({path:resolve(folder,'bachillerato-detalle.png')});
  await reportPdf(page,'pdf-bachillerato-escritorio');
  assert.equal(await page.getByRole('region',{name:'Carreras recomendadas',exact:true}).count(),0,'School reports must not show university careers');
  await page.getByRole('button',{name:/Conocer el área/}).first().click();await page.getByRole('dialog').waitFor();
  await page.getByRole('dialog').getByRole('heading',{name:'Qué estudiar y reforzar',exact:true}).waitFor();
  assert((await page.getByRole('dialog').innerText()).includes(schoolReport.analysis.pathway.science[0].subjects),'The area dialog preserves its study subjects');
  await shot(page,'area-dialogo');await page.keyboard.press('Escape');
  for(const width of [375,390,768,1280]){
   await page.setViewportSize({width,height:900});
   await page.goto(base+'/mi-ruta/resultados');await page.getByRole('heading',{name:schoolHeading,exact:true}).waitFor();
   await singleSchoolModality(page,'ciencias',schoolCount,'Bachillerato '+width);
   await shot(page,'resultados-'+width);await overflow(page,'resultados-'+width);
   if(width===390){
    await page.getByRole('button',{name:/Conocer el área/}).first().click();await page.getByRole('dialog').waitFor();
    await shot(page,'area-dialogo-movil');await overflow(page,'area-dialogo-movil');await page.keyboard.press('Escape');
    await reportPdf(page,'pdf-bachillerato-movil',false);
   }
   await page.goto(base+'/mi-ruta/perfil');await page.getByRole('combobox',{name:'Especialidad o figura profesional',exact:true}).waitFor();await shot(page,'perfil-'+width);await overflow(page,'perfil-'+width);
  }
  await choose(page,'Bachillerato que cursas, cursaste o has elegido','Bachillerato en Ciencias');
  assert.equal(await page.getByRole('combobox',{name:'Especialidad o figura profesional',exact:true}).count(),0);
  await choose(page,'¿Qué te gustaría priorizar al aprender?','Profundizar en asignaturas, investigar y argumentar');
  await page.getByRole('button',{name:'Guardar cambios',exact:true}).click();await page.getByText('Tus datos se guardaron.',{exact:true}).waitFor();
  await page.goto(base+'/mi-ruta/resultados');await page.getByRole('heading',{name:schoolHeading,exact:true}).waitFor();await shot(page,'ciencias-1280');
  // Changing stage activates the university evidence already seeded by the server fixture.
  await page.goto(base+'/mi-ruta/perfil');
  await choose(page,'Etapa educativa','Me gradué del colegio');
  await page.getByRole('button',{name:'Guardar cambios',exact:true}).click();await page.getByText('Tus datos se guardaron.',{exact:true}).waitFor();
  await page.goto(base+'/mi-ruta/resultados');
  const universityRegion=page.getByRole('region',{name:'Carreras recomendadas',exact:true});await universityRegion.waitFor();
  assert.equal(await page.getByRole('region',{name:'Orientación de bachillerato',exact:true}).count(),0);
  const universityReport=(await (await page.request.get(base+'/api/reports/guidance')).json()).items.find(r=>!r.historical&&r.educationLevel==='universidad');
  assert(universityReport?.analysis.recommendations.length>0);
  await page.setViewportSize({width:1440,height:1000});
  await numberedOptions(universityRegion,universityReport.analysis.recommendations.length,'Universidad escritorio');
  await reportHistory(page,'universidad');
  await magnifiedReport('universidad',universityReport.analysis.recommendations.length);
  await shot(page,'universidad-escritorio');await overflow(page,'universidad-escritorio');
  await universityRegion.getByRole('button',{name:/^Conocer la carrera:/}).first().click();await page.getByRole('dialog').waitFor();
  await page.getByRole('dialog').getByRole('heading',{name:'Qué estudiar y comparar',exact:true}).waitFor();
  await page.getByRole('dialog').locator('.career-offers').waitFor();
  await conciseCareerDialog(page,universityReport.analysis.recommendations[0],'Detalle de carrera estudiante');
  await shot(page,'carrera-dialogo');await overflow(page,'carrera-dialogo');await page.keyboard.press('Escape');
  await reportPdf(page,'pdf-universidad-escritorio');
  await page.setViewportSize({width:390,height:844});
  await numberedOptions(universityRegion,universityReport.analysis.recommendations.length,'Universidad móvil');
  await shot(page,'universidad-movil');await overflow(page,'universidad-movil');
  await universityRegion.getByRole('button',{name:/^Conocer la carrera:/}).first().click();await page.getByRole('dialog').waitFor();
  await conciseCareerDialog(page,universityReport.analysis.recommendations[0],'Detalle de carrera móvil');
  await shot(page,'carrera-dialogo-movil');await overflow(page,'carrera-dialogo-movil');await page.keyboard.press('Escape');
  await reportPdf(page,'pdf-universidad-movil',false);
  await page.setViewportSize({width:375,height:844});
  await numberedOptions(universityRegion,universityReport.analysis.recommendations.length,'Universidad 375');
  await shot(page,'universidad-375');await overflow(page,'universidad-375');
  await page.goto(base+'/mi-ruta/cursos');
  await page.locator('.preparation-careers').waitFor();
  assert.equal(await page.getByRole('heading',{name:/^Bachillerato (?:en Ciencias|Técnico)$/}).count(),0);
  await shot(page,'cursos-universidad-movil');await overflow(page,'cursos-universidad-movil');
  await page.setViewportSize({width:1440,height:1000});await shot(page,'cursos-universidad-escritorio');await overflow(page,'cursos-universidad-escritorio');
  const admin=await browser.newContext({viewport:{width:1440,height:1000}}),ap=await admin.newPage();ap.on('pageerror',error=>failures.push({name:'Admin JavaScript',message:error.message}));
  await login(ap,true);await ap.goto(base+'/admin/resultados');
  await ap.getByLabel('Buscar estudiante',{exact:true}).fill('test@example.test');
  await ap.getByRole('button',{name:'Ver ficha de Estudiante Prueba'}).click();
  const refreshed=ap.waitForResponse(r=>r.url().includes('/api/reports/guidance')&&r.request().method()==='POST');
  await ap.getByRole('button',{name:'Actualizar orientación de universidad',exact:true}).click();assert.equal((await refreshed).status(),200);
  await ap.getByRole('button',{name:'Universidad',exact:true}).click();
  await ap.getByRole('region',{name:'Carreras recomendadas',exact:true}).waitFor();
  await numberedOptions(ap.getByRole('region',{name:'Carreras recomendadas',exact:true}),universityReport.analysis.recommendations.length,'Universidad administración');
  assert.equal(await ap.getByRole('link',{name:/Autopreparación/}).count(),0);
  await ap.getByRole('button',{name:/^Conocer la carrera:/}).first().click();await ap.getByRole('dialog').waitFor();
  await conciseCareerDialog(ap,universityReport.analysis.recommendations[0],'Detalle de carrera administración');
  await shot(ap,'admin-carrera-dialogo');await ap.keyboard.press('Escape');
  await shot(ap,'admin-universidad');await overflow(ap,'admin-universidad');
  await ap.setViewportSize({width:390,height:844});await shot(ap,'admin-universidad-movil');await overflow(ap,'admin-universidad-movil');
  await page.goto(base+'/mi-ruta/perfil');await choose(page,'Etapa educativa','Estoy eligiendo mi bachillerato');
  await page.getByRole('button',{name:'Guardar cambios',exact:true}).click();await page.getByText('Tus datos se guardaron.',{exact:true}).waitFor();
  await page.goto(base+'/mi-ruta/resultados');await page.getByRole('heading',{name:schoolHeading,exact:true}).waitFor();
  await ap.setViewportSize({width:1440,height:1000});await ap.reload();
  await ap.getByLabel('Buscar estudiante',{exact:true}).fill('test@example.test');await ap.getByRole('button',{name:'Ver ficha de Estudiante Prueba'}).click();
  await ap.getByRole('heading',{name:schoolHeading,exact:true}).waitFor();
  await singleSchoolModality(ap,'ciencias',schoolCount,'Admin resumen Bachillerato');
  await shot(ap,'admin-resumen-bachillerato');await overflow(ap,'admin-resumen-bachillerato');
  await ap.getByRole('button',{name:'Bachillerato',exact:true}).click();await ap.getByRole('heading',{name:schoolHeading,exact:true}).waitFor();
  await singleSchoolModality(ap,'ciencias',schoolCount,'Admin Bachillerato');
  assert.equal(await ap.getByRole('button',{name:'Universidad',exact:true}).count(),0);
  await shot(ap,'admin-escritorio');await overflow(ap,'admin-escritorio');
  await ap.setViewportSize({width:390,height:844});await shot(ap,'admin-movil');await overflow(ap,'admin-movil');
  await ap.getByRole('button',{name:'Recomendaciones',exact:true}).click();await ap.getByRole('heading',{name:'Recomendaciones para el estudiante',exact:true}).waitFor();
  await ap.getByRole('button',{name:'Informes y PDF',exact:true}).click();
  await choose(ap,'Versión del informe','Informe '+universityReport.version+' · '+new Date(universityReport.createdAt).toLocaleDateString('es-EC',{day:'numeric',month:'short',year:'numeric'}));
  await ap.getByRole('heading',{name:'Documento del estudiante',exact:true}).waitFor();
  assert.equal(await ap.getByRole('button',{name:'Informes y PDF',exact:true}).getAttribute('aria-current'),'page','Selecting a historical report must keep the PDF tab open');
  await ap.locator('.pdf-viewer-viewport[aria-busy="false"]').waitFor({timeout:60000});
  await shot(ap,'admin-pdf-historico');
  await ap.setViewportSize({width:1440,height:1000});await ap.goto(base+'/admin/cursos');
  await ap.getByRole('button',{name:'Bachillerato',exact:true}).click();
  assert.equal(await ap.getByRole('button',{name:/Plantilla de/}).count(),0);
  assert(await ap.getByRole('button',{name:'Crear simulador',exact:true}).isVisible());
  assert(await ap.getByRole('button',{name:'Importar documento',exact:true}).isVisible());
  const blank={id:'',version:0,revision:0,status:'draft',title:'',instrument:{id:'qa',version:'1',title:'',description:'',options:[],questions:[]},purpose:'general',modes:['practice','exam'],durationMinutes:30,maxAttempts:2,gradePolicy:'last',feedback:'finish',selection:'fixed',quotas:[],areaWeights:[],questions:[],shuffleOptions:false,questionOrderFixedIds:[]};
  const prepared=await ap.request.post(base+'/api/training/entity',{headers:{Origin:base},data:{kind:'simulator',entity:{...schoolPracticeTemplate(blank,'ciencias'),title:'Preparación Ciencias QA '+Date.now()}}});assert.equal(prepared.status(),200);
  const draft=await prepared.json();await ap.reload();await ap.getByRole('button',{name:'Bachillerato',exact:true}).click();
  const card=ap.locator('.test-manager-card').filter({has:ap.getByRole('heading',{name:draft.title,exact:true})});
  await card.locator('summary').click();await card.getByRole('button',{name:'Editar borrador',exact:true}).click();
  const visualTitle='Exploración Ciencias visual '+Date.now();
  await ap.getByLabel('Nombre del simulador',{exact:true}).fill(visualTitle);
  assert.equal(await ap.getByRole('checkbox',{name:'Bachillerato en Ciencias',exact:true}).isChecked(),true);
  await ap.getByRole('navigation',{name:'Editor de simulador'}).getByRole('button',{name:/Revisar y publicar$/}).click();
  await ap.getByRole('checkbox',{name:'He revisado las claves, explicaciones y procedencia de todas las preguntas.',exact:true}).check();
  await shot(ap,'admin-plantilla-ciencias');await overflow(ap,'admin-plantilla-ciencias');
  const publication=ap.waitForResponse(r=>r.url().includes('/api/training/entity')&&r.request().method()==='POST');
  await ap.getByRole('button',{name:'Publicar simulador',exact:true}).click();assert.equal((await publication).status(),200);
  await ap.getByRole('heading',{name:visualTitle,exact:true}).waitFor();
  await ap.setViewportSize({width:390,height:844});await shot(ap,'admin-preparacion-bachillerato-movil');await overflow(ap,'admin-preparacion-bachillerato-movil');
  await page.setViewportSize({width:1440,height:1000});await page.goto(base+'/mi-ruta/cursos');
  await page.locator('.preparation-careers').waitFor();
  const schoolTraining=await (await page.request.get(base+'/api/training')).json();
  const modalityIds=['bachillerato:ciencias','bachillerato:tecnico'];
  assert(schoolTraining.recommendations.length>0);
  assert(schoolTraining.recommendations.every(item=>!modalityIds.includes(item.careerId)),'Courses recommend specific areas and technical figures only');
  assert.deepEqual(schoolTraining.recommendations.map(item=>item.careerId),schoolReport.analysis.pathway.science.map(option=>'bachillerato:'+option.id),'Course options match only the selected school modality');
  assert(schoolTraining.careers.every(item=>!modalityIds.includes(item.id)),'Student course catalog omits general modalities');
  for(const name of ['Bachillerato en Ciencias','Bachillerato Técnico'])assert.equal(await page.getByRole('heading',{name,exact:true}).count(),0,'No general modality card: '+name);
  await shot(page,'estudiante-opciones-bachillerato');await overflow(page,'estudiante-opciones-bachillerato');
  await page.setViewportSize({width:390,height:844});await shot(page,'cursos-bachillerato-movil');await overflow(page,'cursos-bachillerato-movil');
  // Existing links to a broad modality guide the student back to concrete options.
  await page.goto(base+'/mi-ruta/cursos?carrera='+encodeURIComponent('bachillerato:ciencias'));
  await page.locator('.preparation-careers').waitFor();
  assert.equal(await page.getByRole('heading',{name:'Autopreparación para Bachillerato en Ciencias',exact:true}).count(),0);
  await shot(page,'cursos-modalidad-anterior-movil');await overflow(page,'cursos-modalidad-anterior-movil');
  await page.goto(base+'/mi-ruta/cursos');await page.locator('.preparation-careers').waitFor();
  const recommendedScience=schoolTraining.recommendations.find(item=>schoolReport.analysis.pathway.science.some(option=>'bachillerato:'+option.id===item.careerId));
  assert(recommendedScience,'The science template remains reachable through a recommended area');
  const scienceArea=schoolTraining.careers.find(item=>item.id===recommendedScience.careerId);
  await page.getByLabel('Buscar opción de estudio',{exact:true}).fill(scienceArea.name);
  await page.locator('.preparation-careers > *').filter({has:page.getByRole('heading',{name:scienceArea.name,exact:true})}).getByRole('button',{name:'Autopreparación',exact:true}).click();
  await page.getByRole('heading',{name:'Autopreparación para '+scienceArea.name,exact:true}).waitFor();
  await shot(page,'cursos-area-ciencias-movil');await overflow(page,'cursos-area-ciencias-movil');
  const simulation=page.locator('.training-grid > *').filter({has:page.getByRole('heading',{name:visualTitle,exact:true})});
  await simulation.getByRole('button',{name:'Practicar',exact:true}).click();await page.getByRole('button',{name:'Comenzar práctica',exact:true}).click();
  await page.getByRole('radio',{name:'Dos plantas iguales con distinta luz y la misma cantidad de agua',exact:true}).check();
  await page.getByRole('button',{name:'Siguiente',exact:true}).click();await page.getByRole('radio',{name:'14',exact:true}).check();
  await page.getByRole('button',{name:'Siguiente',exact:true}).click();await page.getByRole('radio',{name:'Buscar evidencias y considerar otras explicaciones',exact:true}).check();
  await page.getByRole('button',{name:'Revisar y entregar',exact:true}).click();await page.getByRole('button',{name:'Confirmar entrega y ver nota',exact:true}).click();
  await page.getByText('Nota calculada automáticamente',{exact:true}).waitFor();await shot(page,'estudiante-practica-ciencias-nota');
  await page.setViewportSize({width:390,height:844});await shot(page,'estudiante-practica-ciencias-nota-movil');await overflow(page,'estudiante-practica-ciencias-nota-movil');
  await page.goto(base+'/mi-ruta/evaluaciones');
  assert.equal(await page.getByRole('button',{name:'Universidad',exact:true}).count(),0);
  await shot(page,'estudiante-tests-egb-movil');await overflow(page,'estudiante-tests-egb-movil');
  checks.push({name:'Rutas separadas',passed:'Cambio de etapa desde el perfil, carreras universitarias y ficha administrativa coherentes, retorno a Bachillerato e historial conservado.'});
  checks.push({name:'Preparación Bachillerato',passed:'Sin tarjetas ni IDs de modalidades generales, enlaces antiguos recuperados, plantilla general accesible desde un área específica y práctica completa por estudiante.'});
  checks.push({name:'Resultados simplificados',passed:'Opciones completas numeradas 1..N en ambas etapas, detalles bajo demanda, escritorio/móvil y PDF descargable de cada etapa.'});
  checks.push({name:'Flujo',passed:'Acceso por formularios, perfil persistido, orientación independiente de la modalidad declarada, conexión de carrera, descarga PDF y actualización administrativa.'});
 }catch(error){
  failures.push({name:'Workflow',message:error.message});
  for(const [i,context] of browser.contexts().entries())for(const [j,page] of context.pages().entries())await shot(page,'failure-'+i+'-'+j).catch(()=>{});
  throw error;
 }finally{
  writeFileSync(resolve(folder,'visual-results.json'),JSON.stringify({checks,failures},null,2));
  await browser.close();
 }
 console.log('Visual evidence: '+folder);
 assert.equal(failures.length,0,JSON.stringify(failures));
 console.log('PASS visual workflow: desktop/mobile layouts, forms, persistence, sequential school/university options, detail dialogs, both PDF downloads, courses without general modalities, complete practice and admin.');
}
