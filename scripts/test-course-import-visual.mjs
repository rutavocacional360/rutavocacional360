import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {mkdtempSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {spawn} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {createServer} from 'node:net';
import {createRuntimePackage} from './test-runtime-package.mjs';
import {completeAssessment} from './assessment-fixtures.mjs';

// Opt-in visual regression with the supplied DOCX. All accounts, uploads and
// progress belong to a new disposable SQLite database; no real AI is called.
assert(process.env.QA_COURSE_DOCUMENT,'Set QA_COURSE_DOCUMENT to the programme DOCX');
const expectedActivities=Number(process.env.QA_COURSE_EXPECTED_ACTIVITIES||12);
mkdirSync('.qa-tools',{recursive:true});
const folder=mkdtempSync(resolve('.qa-tools','course-visual-'));
process.env.DB_DRIVER='sqlite';process.env.DATABASE_PATH=resolve(folder,'course_test.sqlite');
process.env.ACADEMIC_CONTENT_PATH=resolve(folder,'academic.json');
const outfile=resolve(folder,'fixture.cjs');
await build({stdin:{contents:`export {db,put,passwordHash} from './lib/server/store';export {calculateTest} from './components/kit/lib/test-engine';export {instruments} from './components/kit/data/instruments';`,resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'cjs',packages:'external',outfile,plugins:[{name:'server-marker',setup(b){b.onResolve({filter:/^server-only$/},()=>({path:'server-only',namespace:'empty'}));b.onLoad({filter:/.*/,namespace:'empty'},()=>({contents:''}));}}]});
const require=createRequire(import.meta.url),{db,put,passwordHash,calculateTest,instruments}=require(outfile);
const password=randomBytes(24).toString('base64url');
let child,browser,page;const checks=[],errors=[];
try{
 await db.migrate();await db.prepare('INSERT INTO institutions VALUES(?,?,?)').run('course_org','Curso QA','COURSE');
 await put('system','rv360:platform',{institutionId:'course_org'});
 for(const role of ['admin','student'])await db.prepare('INSERT INTO users VALUES(?,?,?,?,?,?,?,?)').run(role+'_course','Prueba '+role,role+'@example.test',passwordHash(password),role,'course_org','','Activo');
 await put('student_course','rv360:profile',{stage:'Estoy eligiendo mi bachillerato',baccalaureate:'por-definir',learningPreference:'investigar'});
 for(const instrument of instruments)await completeAssessment({db,calculateTest,userId:'student_course',instrument:{...instrument,educationLevel:'bachillerato'}});
 const runtime=await createRuntimePackage(),listener=createServer();
 await new Promise(r=>listener.listen(0,'127.0.0.1',r));const port=listener.address().port;await new Promise(r=>listener.close(r));
 const base='http://127.0.0.1:'+port;
 child=spawn(process.execPath,['node_modules/next/dist/bin/next','start','-H','127.0.0.1','-p',String(port)],{cwd:runtime,env:{...process.env,NODE_ENV:'production',APP_URL:base,COOKIE_SECURE:'false',IMPORT_PATH:resolve(folder,'imports'),PROFILE_PHOTO_PATH:resolve(folder,'photos'),GEMINI_API_KEY:'',SMTP_HOST:'',SMTP_USER:'',SMTP_PASSWORD:'',SMTP_FROM:'',API_ORIGIN:'',VERCEL:'',NEXT_PUBLIC_DESIGN_PREVIEW:''},stdio:'pipe',windowsHide:true});
 let log='';child.stdout.on('data',s=>log=(log+s).slice(-6000));child.stderr.on('data',s=>log=(log+s).slice(-6000));
 let ready=false;for(let i=0;i<120;i++){try{if((await fetch(base+'/api/health')).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,250));}assert(ready,'Server startup: '+log);
 let playwright;try{playwright=require('playwright');}catch{playwright=require('../.qa-tools/node_modules/playwright');}
 browser=await playwright.chromium.launch({headless:true,...(process.platform==='win32'?{executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'}:{})});
 const context=await browser.newContext({viewport:{width:1440,height:1000}});page=await context.newPage();page.setDefaultTimeout(20000);page.on('pageerror',e=>errors.push(e.message));
 const evidence=async name=>{assert(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)<=2,'Horizontal overflow: '+name);await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));await page.screenshot({path:resolve(folder,name+'.png'),fullPage:true});await page.screenshot({path:resolve(folder,name+'-viewport.png'),fullPage:false});};
 const catalog=async()=>{const r=await page.request.get(base+'/api/training');assert.equal(r.status(),200);return r.json();};
 await page.goto(base+'/admin/login');await page.getByLabel('Correo electrónico',{exact:true}).fill('admin@example.test');await page.getByLabel('Contraseña',{exact:true}).fill(password);await page.getByRole('button',{name:'Ingresar al panel',exact:true}).click();await page.waitForURL('**/admin');
 await page.goto(base+'/admin/cursos?nivel=bachillerato');await page.getByRole('button',{name:'Importar documento',exact:true}).click();
 await page.getByRole('dialog').locator('input[type=file]').setInputFiles(resolve(process.env.QA_COURSE_DOCUMENT));
 await page.getByLabel('Nombre del curso',{exact:true}).waitFor({timeout:60000});
 let title=await page.getByLabel('Nombre del curso',{exact:true}).inputValue();assert.match(title,expectedActivities===1?/El árbol que cuenta mi historia/i:/DESCUBRE/i);
 await page.getByRole('status').filter({hasText:'Borrador guardado'}).waitFor();
 let course=(await catalog()).courses.find(c=>c.title===title);assert(course);assert.equal(course.educationLevel,'bachillerato');assert.equal(course.activities.filter(a=>/^Actividad \d+\./.test(a.title)).length,expectedActivities);assert(course.activities.every(a=>a.kind==='text'&&a.completion==='read'));
 assert(course.activities[0].content.includes('¿Quién soy?'));assert(course.activities.at(-1).content.length>0);assert.equal((await catalog()).simulators.length,0);
 const courseId=course.id;
 await page.reload();await page.getByLabel('Nombre del curso',{exact:true}).waitFor();assert.equal(await page.getByLabel('Nombre del curso',{exact:true}).inputValue(),title);
 await evidence('course-admin-draft');
 title+=' (revisado)';await page.getByLabel('Nombre del curso',{exact:true}).fill(title);await page.getByRole('button',{name:'Guardar borrador',exact:true}).click();await page.getByRole('status').filter({hasText:'Borrador guardado'}).waitFor();
 const uploadAgain=async()=>{await page.goto(base+'/admin/cursos?nivel=bachillerato');await page.getByRole('button',{name:'Importar documento',exact:true}).click();await page.getByRole('dialog').locator('input[type=file]').setInputFiles(resolve(process.env.QA_COURSE_DOCUMENT));};
 await uploadAgain();await page.getByLabel('Nombre del curso',{exact:true}).waitFor({timeout:60000});await page.getByRole('status').filter({hasText:'Borrador guardado'}).waitFor();
 assert.equal(await page.getByLabel('Nombre del curso',{exact:true}).inputValue(),title,'Reimport preserves saved edits');assert.equal((await catalog()).courses.length,1);assert.equal((await catalog()).courses[0].id,courseId);
 await page.getByRole('button',{name:'Revisar y publicar curso',exact:true}).click();await evidence('course-admin-review');
 await page.setViewportSize({width:390,height:844});await evidence('course-admin-review-mobile');await page.setViewportSize({width:1440,height:1000});
 await page.getByRole('button',{name:'Publicar curso',exact:true}).click();
 await page.getByRole('heading',{name:'Cursos y actividades',exact:true}).waitFor();await page.getByRole('heading',{name:title,exact:true}).waitFor();
 await page.reload();await page.getByRole('heading',{name:title,exact:true}).waitFor();course=(await catalog()).courses.find(c=>c.title===title);assert.equal(course.status,'published');await evidence('course-published');
 await uploadAgain();await page.getByRole('heading',{name:'Cursos y actividades',exact:true}).waitFor({timeout:60000});await page.getByRole('heading',{name:title,exact:true}).waitFor();assert.equal((await catalog()).courses.length,1,'Reimport must not duplicate a published course');assert.equal(await page.getByLabel('Nombre del curso',{exact:true}).count(),0,'Published course stays out of the draft editor');
 await page.getByRole('button',{name:'Universidad',exact:true}).click();await page.getByRole('heading',{name:title,exact:true}).waitFor({state:'hidden'});
 checks.push('Real DOCX upload, '+expectedActivities+' activities retained, reimport preserves edited draft and published course, review, publish, reload and category isolation');
 const studentContext=await browser.newContext({viewport:{width:390,height:844}});page=await studentContext.newPage();page.setDefaultTimeout(20000);page.on('pageerror',e=>errors.push(e.message));
 const login=await studentContext.request.post(base+'/api/auth/login',{headers:{Origin:base},data:{email:'student@example.test',password}});assert.equal(login.status(),200);
 await page.goto(base+'/mi-ruta/cursos');await page.getByRole('region',{name:'Cursos y actividades',exact:true}).getByRole('heading',{name:title,exact:true}).waitFor();await evidence('course-student-catalog-mobile');
 await page.getByRole('button',{name:'Comenzar curso',exact:true}).click();await page.getByRole('region',{name:'Curso en progreso',exact:true}).waitFor();
 await page.getByText('¿Quién soy?',{exact:false}).waitFor();await evidence('course-student-activity-mobile');
 await page.getByRole('button',{name:'Marcar actividad como completada',exact:true}).click();await page.getByText('Actividad completada. Tu progreso está guardado.',{exact:true}).waitFor();
 await page.reload();await page.getByRole('button',{name:'Continuar curso',exact:true}).click();await page.getByRole('region',{name:'Curso en progreso',exact:true}).waitFor();await page.getByRole('status').filter({hasText:/1 de \d+ actividades completadas/}).waitFor();
 const state=await catalog(),enrollment=state.enrollments.find(e=>e.course_id===course.id);assert.equal(enrollment.completed.length,1);assert.equal(enrollment.snapshot.activities[0].title,course.activities[0].title);assert.equal(state.attempts.length,0,'Reading cannot create a graded exam attempt');
 await page.setViewportSize({width:1440,height:1000});await evidence('course-student-progress');
 checks.push('Student course access, mobile reading, completion persisted after reload, next activity, no fictitious exam grade');assert.deepEqual(errors,[]);
 console.log('PASS course DOCX visual workflow. Evidence: '+folder);
}catch(error){errors.push(error.message);if(page){await page.screenshot({path:resolve(folder,'failure.png'),fullPage:true}).catch(()=>{});writeFileSync(resolve(folder,'failure.txt'),await page.locator('body').innerText().catch(()=>''));}throw error;}
finally{writeFileSync(resolve(folder,'results.json'),JSON.stringify({checks,errors},null,2));await browser?.close();if(child){const stopped=new Promise(r=>child.once('exit',r));child.kill();await stopped;}await db.close();}
