import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {writeFileSync} from 'node:fs';

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
  await shot(page,'resultados-escritorio');await overflow(page,'resultados-escritorio');
  await page.getByRole('region',{name:'Orientación de bachillerato'}).screenshot({path:resolve(folder,'bachillerato-detalle.png')});
  await page.getByRole('button',{name:'Informe PDF',exact:true}).click();
  await page.locator('.rd-document').getByRole('link',{name:'Descargar PDF',exact:true}).waitFor();
  await page.locator('.pdf-viewer-viewport[aria-busy="false"]').waitFor({timeout:60000});
  assert(await page.locator('.pdf-viewer canvas').isVisible());
  await shot(page,'pdf-escritorio');
  await page.getByRole('button',{name:'Página siguiente del PDF'}).click();
  await page.getByText('Página 2 de',{exact:false}).waitFor();
  await page.locator('.pdf-viewer-viewport[aria-busy="false"]').waitFor();
  const pdf=await page.locator('.rd-document').getByRole('link',{name:'Descargar PDF',exact:true}).getAttribute('href');assert(pdf.startsWith('blob:'));
  const downloadPromise=page.waitForEvent('download');await page.locator('.rd-document').getByRole('link',{name:'Descargar PDF',exact:true}).click();const download=await downloadPromise;await download.saveAs(resolve(folder,'informe-descargado.pdf'));
  await page.getByRole('button',{name:'Mi orientación',exact:true}).click();
  assert.equal(await page.getByRole('region',{name:'Carreras recomendadas',exact:true}).count(),0,'School reports must not show university careers');
  await page.getByRole('button',{name:/Conocer el área/}).first().click();await page.getByRole('dialog').waitFor();await shot(page,'area-dialogo');await page.keyboard.press('Escape');
  for(const width of [390,768,1280]){
   await page.setViewportSize({width,height:900});
   await page.goto(base+'/mi-ruta/resultados');await page.getByRole('heading',{name:schoolHeading,exact:true}).waitFor();
   await shot(page,'resultados-'+width);await overflow(page,'resultados-'+width);
   if(width===390){
    await page.getByRole('button',{name:'Informe PDF',exact:true}).click();
    await page.locator('.pdf-viewer canvas').waitFor({state:'visible',timeout:60000});
    await overflow(page,'pdf-movil');await shot(page,'pdf-movil');
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
  assert.equal(await universityRegion.locator('.rd-recommended').count(),universityReport.analysis.recommendations.length);
  await universityRegion.getByRole('button',{name:/^Conocer la carrera:/}).first().click();await page.getByRole('dialog').waitFor();await shot(page,'carrera-dialogo');await page.keyboard.press('Escape');
  await page.locator('.rd-offer-details summary').first().click();await page.locator('.career-offers').first().waitFor();await shot(page,'universidades');await overflow(page,'universidades');
  await page.setViewportSize({width:390,height:844});await shot(page,'universidad-movil');await overflow(page,'universidad-movil');
  const admin=await browser.newContext({viewport:{width:1440,height:1000}}),ap=await admin.newPage();ap.on('pageerror',error=>failures.push({name:'Admin JavaScript',message:error.message}));
  await login(ap,true);await ap.goto(base+'/admin/resultados');
  await ap.getByLabel('Buscar estudiante',{exact:true}).fill('test@example.test');
  await ap.getByRole('button',{name:'Ver ficha de Estudiante Prueba'}).click();
  const refreshed=ap.waitForResponse(r=>r.url().includes('/api/reports/guidance')&&r.request().method()==='POST');
  await ap.getByRole('button',{name:'Actualizar orientación de universidad',exact:true}).click();assert.equal((await refreshed).status(),200);
  await ap.getByRole('button',{name:'Universidad',exact:true}).click();
  await ap.getByRole('region',{name:'Carreras recomendadas',exact:true}).waitFor();
  assert.equal(await ap.locator('.rd-recommended').count(),universityReport.analysis.recommendations.length);
  assert.equal(await ap.getByRole('link',{name:/Autopreparación/}).count(),0);
  await ap.getByRole('button',{name:/^Conocer la carrera:/}).first().click();await ap.getByRole('dialog').waitFor();await ap.keyboard.press('Escape');
  await shot(ap,'admin-universidad');await overflow(ap,'admin-universidad');
  await ap.setViewportSize({width:390,height:844});await shot(ap,'admin-universidad-movil');await overflow(ap,'admin-universidad-movil');
  await page.goto(base+'/mi-ruta/perfil');await choose(page,'Etapa educativa','Estoy eligiendo mi bachillerato');
  await page.getByRole('button',{name:'Guardar cambios',exact:true}).click();await page.getByText('Tus datos se guardaron.',{exact:true}).waitFor();
  await page.goto(base+'/mi-ruta/resultados');await page.getByRole('heading',{name:schoolHeading,exact:true}).waitFor();
  await ap.setViewportSize({width:1440,height:1000});await ap.reload();
  await ap.getByLabel('Buscar estudiante',{exact:true}).fill('test@example.test');await ap.getByRole('button',{name:'Ver ficha de Estudiante Prueba'}).click();
  await ap.getByRole('button',{name:'Bachillerato',exact:true}).click();await ap.getByRole('heading',{name:schoolHeading,exact:true}).waitFor();
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
  await page.getByRole('heading',{name:'Bachillerato en Ciencias',exact:true}).waitFor();
  await shot(page,'estudiante-opciones-bachillerato');await overflow(page,'estudiante-opciones-bachillerato');
  await page.locator('.preparation-careers > *').filter({has:page.getByRole('heading',{name:'Bachillerato en Ciencias',exact:true})}).getByRole('button',{name:'Autopreparación',exact:true}).click();
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
  checks.push({name:'Preparación Bachillerato',passed:'Plantilla publicada por administrador, selección de Ciencias y práctica completa por estudiante.'});
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
 console.log('PASS visual workflow: desktop/mobile layouts, forms, persistence, recommendations, career dialog, PDF download and admin.');
}
