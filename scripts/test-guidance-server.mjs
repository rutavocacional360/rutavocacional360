import {completeAssessment} from './assessment-fixtures.mjs';
import {testSchoolsHttp} from './test-schools-http.mjs';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { randomBytes } from 'node:crypto';
import { assertTestDatabase } from './test-database-target.mjs';
import { createRuntimePackage } from './test-runtime-package.mjs';
mkdirSync('.qa-tools',{recursive:true});
const folder=mkdtempSync(resolve('.qa-tools','guidance-'));
process.env.DB_DRIVER=process.env.GUIDANCE_DB_DRIVER||'sqlite';
if(process.env.DB_DRIVER==='mysql')assertTestDatabase(process.env,{local:true});
process.env.DATABASE_PATH=resolve(folder,'guidance_test.sqlite');
process.env.ACADEMIC_CONTENT_PATH=resolve(folder,'academic_test.json');
const outfile=resolve(folder,'server.cjs');
await build({stdin:{contents:`export {schoolOrientationTemplate,schoolPracticeTemplate} from './components/kit/data/school-templates'; export * from './lib/server/guidance'; export {db,put,passwordHash} from './lib/server/store'; export {educationProfile} from './lib/server/education'; export {assessmentReadiness} from './lib/server/assessment-readiness'; export {currentAssessments,battery} from './lib/server/battery'; export {instruments} from './components/kit/data/instruments'; export {calculateTest} from './components/kit/lib/test-engine'; export {professionalReport} from './components/kit/lib/professional-report';`,resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'cjs',packages:'external',outfile,plugins:[{name:'server-marker',setup(build){build.onResolve({filter:/^server-only$/},()=>({path:'server-only',namespace:'empty'}));build.onLoad({filter:/.*/,namespace:'empty'},()=>({contents:''}));}}]});
const {schoolOrientationTemplate,schoolPracticeTemplate,db,put,passwordHash,ensureGuidance,analyzeGuidance,listGuidance,educationProfile,instruments,calculateTest,professionalReport,assessmentReadiness,currentAssessments,battery}=createRequire(import.meta.url)(outfile);
const user={id:'student_test',name:'Estudiante de prueba',role:'student',institutionId:'org_test',group:'A'};
const t={...instruments.find(t=>t.id==='intereses'),scoring:'dimensions',aggregation:'sum',educationLevel:'bachillerato'};
const answers=Object.fromEntries(t.questions.map(q=>[q.id,q.dimension==='I'?5:q.dimension==='R'?3:q.dimension==='S'?4:2]));
const evaluation=calculateTest(t,answers);
async function submit(id,instrument,result,at){
 await db.prepare('INSERT INTO submissions VALUES(?,?,?,?,?,?,?,?)').run(id,user.id,instrument.id,instrument.version,JSON.stringify(answers),JSON.stringify(result.scores),JSON.stringify(instrument),at);
 await db.prepare('INSERT INTO assessment_results VALUES(?,?,?,?,?,?)').run(id,1,JSON.stringify(result),'{}',null,at);
}
try{
 await db.migrate();
 await db.prepare('INSERT INTO institutions VALUES(?,?,?)').run(user.institutionId,'Institución de prueba','TEST');
 await put('system','rv360:platform',{institutionId:user.institutionId});
 await db.prepare('INSERT INTO users VALUES(?,?,?,?,?,?,?,?)').run(user.id,user.name,'test@example.test','not-a-login-hash',user.role,user.institutionId,user.group,'Activo');
 await assert.rejects(ensureGuidance(user),e=>e.status===409);
 const profile=educationProfile({baccalaureate:'por-definir',stage:'Estoy eligiendo mi bachillerato',learningPreference:'investigar'});
 assert.equal(profile.stage,'Estoy eligiendo mi bachillerato');
 await put(user.id,'rv360:profile',profile);
 for(const instrument of instruments.filter(t=>t.id!=='intereses'))await completeAssessment({db,calculateTest,userId:user.id,instrument:{...instrument,educationLevel:'bachillerato'},at:'2026-09-30T00:00:00Z'});
 await submit('science_test',t,evaluation,'2026-10-01T12:00:00Z');
 const first=await ensureGuidance(user);
 assert.equal(first.educationLevel,'bachillerato');assert.equal(first.analysis.pathway.suggested,'ciencias');assert.deepEqual(first.analysis.recommendations,[]);assert.deepEqual(first.catalog,[]);assert.deepEqual(first.offers,{});assert.equal(first.catalogSource.educationLevel,'bachillerato');
 assert(first.readiness.bachillerato.ready);assert.equal(first.readiness.universidad.ready,false);assert.equal(first.readiness.universidad.total,0);assert(first.instruments.every(i=>i.instrument.educationLevel==='bachillerato'));
 assert.equal((await ensureGuidance(user)).id,first.id);
 const studentView=(await listGuidance(user)).find(report=>report.id===first.id);
 const refreshedView=await analyzeGuidance(user,{});
 for(const view of [studentView,refreshedView]){
  for(const field of ['ai','provider','model','contentSource','promptVersion'])assert(!(field in view),'Student responses must omit '+field);
  assert.deepEqual(view.analysis,first.analysis,'Recommendations remain available without provider metadata');
 }
 assert(first.ai,'Internal reports retain provider status for operations');
 await put(user.id,'rv360:profile',{...profile,baccalaureate:'tecnico',specialty:'Informática',learningPreference:'aplicar'});
 const simultaneous=await Promise.all([ensureGuidance(user),ensureGuidance(user),ensureGuidance(user)]);
 const second=simultaneous[0];
 assert(simultaneous.every(r=>r.id===second.id));
 assert.equal((await listGuidance(user)).length,2,'Concurrent requests must not duplicate reports');
 assert.notEqual(first.id,second.id);assert.equal(second.analysis.pathway.suggested,'ciencias');
 assert.equal(second.analysis.pathway.profile.specialty,'Informática');
 assert.deepEqual(second.analysis.recommendations,first.analysis.recommendations,'Changing the declared school modality must retain a school-only report');
 const admin={id:'admin_test',role:'admin',institutionId:user.institutionId};
 assert.equal((await analyzeGuidance(admin,{studentId:user.id})).id,second.id);
 await assert.rejects(analyzeGuidance({...admin,institutionId:'other_test'},{studentId:user.id}),e=>e.status===403);
 await assert.rejects(analyzeGuidance({...admin,role:'orientador',group:'B'},{studentId:user.id}),e=>e.status===403);
 assert.equal((await listGuidance({...admin,institutionId:'other_test'})).length,0);
 assert((await listGuidance(admin)).some(r=>r.id===first.id),'Historical snapshots retained');
 assert((await listGuidance(admin)).find(r=>r.id===first.id).ai,'Administrators retain diagnostic access');
 const revisedAnswers=Object.fromEntries(t.questions.map(q=>[q.id,q.dimension==='R'?5:2]));
 const revision=calculateTest(t,revisedAnswers);
 await db.prepare('INSERT INTO assessment_results VALUES(?,?,?,?,?,?)').run('science_test',2,JSON.stringify(revision),'{}',null,'2026-10-01T12:05:00Z');
 const third=await ensureGuidance(user);
 assert.notEqual(third.id,second.id);assert.notDeepEqual(third.analysis.pathway,second.analysis.pathway,'Reviewing a result must update the school orientation');assert.deepEqual(third.analysis.recommendations,[]);
 await submit('pending_test',{...t,resultPublication:'review'},evaluation,'2026-10-01T12:10:00Z');
 const pending=await ensureGuidance(user);assert.equal(pending.analysis.pathway.suggested,'pendiente','Do not reuse an older attempt when the latest is withheld');assert.equal(pending.readiness.bachillerato.ready,false);assert.deepEqual(pending.analysis.recommendations,[]);
 await db.prepare('INSERT INTO submissions VALUES(?,?,?,?,?,?,?,?)').run('legacy_test',user.id,t.id,t.version,JSON.stringify(answers),'[]',JSON.stringify({...t,educationLevel:'ambos'}),'2026-10-01T12:15:00Z');
 const legacy=await ensureGuidance(user);
 assert.notEqual(legacy.analysis.pathway.suggested,'pendiente','Legacy attempts use their saved instrument and answers');assert(legacy.readiness.bachillerato.ready);assert.deepEqual(legacy.analysis.recommendations,[]);
 // Finishing school is a new route. Saved school answers cannot become university evidence.
 await put(user.id,'rv360:profile',{...profile,stage:'Me gradu\u00e9 del colegio',baccalaureate:'tecnico'});
 const graduated=await assessmentReadiness(user);assert.equal(graduated.educationLevel,'universidad');assert.equal(graduated.bachillerato.total,0);assert.equal(graduated.bachillerato.ready,false);assert.equal(graduated.universidad.ready,false);assert.equal(graduated.universidad.completed,0);
 const universityTests=await currentAssessments(user);assert(universityTests.length);assert(universityTests.every(i=>i.educationLevel==='universidad'));assert((await battery(user)).instruments.every(i=>i.educationLevel==='universidad'));
 await assert.rejects(ensureGuidance(user),e=>e.status===409,'School results must not be reused in the university route');
 for(const instrument of universityTests)await completeAssessment({db,calculateTest,userId:user.id,instrument,at:'2026-10-02T12:00:00Z'});
 const universityReport=await ensureGuidance(user);assert.equal(universityReport.educationLevel,'universidad');assert.equal(universityReport.analysis.pathway,undefined);assert(universityReport.analysis.recommendations.length>0);assert(universityReport.readiness.universidad.ready);assert.equal(universityReport.readiness.bachillerato.total,0);assert(universityReport.instruments.every(i=>i.instrument.educationLevel==='universidad'));
 assert((await listGuidance(admin)).some(r=>r.id===second.id),'School history remains accessible to authorized administration');
 await put(user.id,'rv360:profile',{...profile,baccalaureate:'tecnico',specialty:'Inform\u00e1tica',learningPreference:'aplicar'});
 assert.equal((await ensureGuidance(user)).educationLevel,'bachillerato');
 const pdf=await professionalReport(second);
 const pdfPath=resolve(folder,'bachillerato-universidad.pdf');
 writeFileSync(pdfPath,new Uint8Array(pdf.output('arraybuffer')));
 writeFileSync(resolve(folder,'report.json'),JSON.stringify(second));
 console.log('PASS server: separate school/university routes, graduation requires new university assessments, persisted profile, digest updates after review, authorized history and withheld results.');
 console.log('PDF fixture: '+pdfPath);
 if(process.argv.includes('--http')||process.argv.includes('--visual')||process.argv.includes('--admin-visual')||process.argv.includes('--users-visual')||process.argv.includes('--completion-visual')){
  await db.prepare('DELETE FROM assessment_results WHERE submission_id=?').run('pending_test');
  await db.prepare('DELETE FROM submissions WHERE id=?').run('pending_test');
  const password=randomBytes(24).toString('base64url');
  await db.prepare('UPDATE users SET password=? WHERE id=?').run(passwordHash(password),user.id);
  await db.prepare('INSERT INTO users VALUES(?,?,?,?,?,?,?,?)').run('admin_test','Admin de prueba','admin@example.test',passwordHash(password),'admin',user.institutionId,'','Activo');
  const listener=createServer();
  await new Promise((resolve,reject)=>{listener.once('error',reject);listener.listen(0,'127.0.0.1',resolve);});
  const port=listener.address().port;
  await new Promise(resolve=>listener.close(resolve));
  const base='http://127.0.0.1:'+port;
  // Serve a fixed compiled package: another build must not replace browser
  // chunks while the end-to-end import/retry workflow is running.
  const runtime=await createRuntimePackage();
  const privateDir=mkdtempSync(resolve(tmpdir(),'rv360-http-'));
  const child=spawn(process.execPath,['node_modules/next/dist/bin/next','start','-H','127.0.0.1','-p',String(port)],{cwd:runtime,env:{...process.env,NODE_ENV:'production',APP_URL:base,COOKIE_SECURE:'false',
    IMPORT_PATH:resolve(privateDir,'imports'),PROFILE_PHOTO_PATH:resolve(privateDir,'photos'),
    ACADEMIC_CONTENT_PATH:resolve(privateDir,'academic.json'),GEMINI_API_KEY:db.driver==='mysql'?'isolated-ci-not-a-provider-key':'',
    SMTP_HOST:'',SMTP_PORT:'',SMTP_USER:'',SMTP_PASSWORD:'',SMTP_FROM:'',SMTP_SECURE:'',
    API_ORIGIN:'',VERCEL:'',NEXT_PUBLIC_DESIGN_PREVIEW:''},stdio:'pipe',windowsHide:true});
  const stopped=new Promise(resolve=>{child.once('exit',resolve);child.once('error',resolve);});
  let startupError=false;child.on('error',()=>{startupError=true;});
  // Keep startup diagnostics bounded and redact inherited credentials on failure.
  let startupOutput='';
  const capture=chunk=>{startupOutput=(startupOutput+chunk.toString()).slice(-8000);};
  child.stdout.on('data',capture);child.stderr.on('data',capture);
  const diagnostic=()=>Object.entries({...process.env,password}).reduce((log,[key,value])=>
   /PASSWORD|SECRET|TOKEN|KEY/i.test(key)&&value ? log.split(value).join('[redacted]') : log,startupOutput);
  try{
   let ready=false;
   const startupDeadline=Date.now()+90000;
   while(Date.now()<startupDeadline){
    if(startupError||child.exitCode!==null)throw Error('The isolated HTTP server could not start.\n'+diagnostic());
    try{const r=await fetch(base+'/api/health',{signal:AbortSignal.timeout(1500)});if(r.ok){ready=true;break;}}catch{}
    await new Promise(r=>setTimeout(r,250));
   }
   assert(ready,'Server startup\n'+diagnostic());
   const request=(path,body,cookie='',method=body?'POST':'GET')=>fetch(base+'/api/'+path,{method,headers:{'Content-Type':'application/json',Origin:base,...(cookie?{Cookie:cookie}:{})},...(body?{body:JSON.stringify(body)}:{})});
   const login=await request('auth/login',{email:'test@example.test',password});assert.equal(login.status,200);
   const cookie=login.headers.get('set-cookie').split(';')[0];
   const profileUpdate=await request('account/profile',{firstName:'Estudiante',lastName:'Prueba',...profile,baccalaureate:'tecnico',specialty:'Informática',learningPreference:'aplicar'},cookie,'PUT');assert.equal(profileUpdate.status,200);
   const session=await (await request('session',null,cookie)).json();assert.equal(session.values['rv360:profile'].specialty,'Informática');
   const latest=await (await request('reports/guidance',null,cookie)).json();assert.equal(latest.items[0].historical,false);assert.equal(latest.items[0].analysis.pathway.suggested,'ciencias');
   const invalid=await request('account/profile',{firstName:'Estudiante',lastName:'Prueba',baccalaureate:'invalid'},cookie,'PUT');assert.equal(invalid.status,400);
   for(const patch of [{firstName:{}},{lastName:[]},{stage:{}},{stage:'x'.repeat(101)},{province:{}},{canton:123},{parish:[]},{schoolId:'missing-school'},{institution:'x'.repeat(181)},{specialty:'x'.repeat(141)},{learningPreference:'invalid'}]){
    const rejected=await request('account/profile',{firstName:'Estudiante',lastName:'Prueba',...profile,...patch},cookie,'PUT');assert.equal(rejected.status,400,JSON.stringify(patch));
   }
   const unchanged=await (await request('session',null,cookie)).json();assert.equal(unchanged.values['rv360:profile'].specialty,'Informática','Invalid updates cannot alter persisted profile');
   const adminLogin=await request('auth/login',{email:'admin@example.test',password,admin:true});assert.equal(adminLogin.status,200);
   const adminCookie=adminLogin.headers.get('set-cookie').split(';')[0];
   await testSchoolsHttp({request,adminCookie,cookie,userId:user.id,base});
   // MySQL production bootstrap requires a configured key. Never call a real provider
   // from integration tests; missing credentials are exercised by the SQLite run.
   const aiStatus=await request('admin/orientation-content',null,adminCookie);assert.equal(aiStatus.status,200);assert.equal((await aiStatus.json()).configured,db.driver==='mysql');
   if(db.driver!=='mysql')assert.equal((await request('admin/orientation-content',{},adminCookie)).status,503);
   assert.equal((await request('admin/orientation-content',null,cookie)).status,403);
   console.log('PASS HTTP AI: protected administrator status without provider calls.');
   const refreshed=await request('reports/guidance',{studentId:user.id},adminCookie);assert.equal(refreshed.status,200);assert.equal((await refreshed.json()).analysis.pathway.profile.specialty,'Informática');
   assert.equal((await fetch(base+'/mi-ruta/resultados',{headers:{Cookie:cookie}})).status,200);
   assert.equal((await fetch(base+'/admin/resultados',{headers:{Cookie:adminCookie}})).status,200);
   const registration=await request('auth/register',{name:'Nueva estudiante',email:'new@example.test',password,...profile,baccalaureate:'tecnico',specialty:'Contabilidad',learningPreference:'aplicar'});
   assert.equal(registration.status,200);
   const registered=await registration.json();
   assert.equal(registered.values['rv360:profile'].specialty,'Contabilidad');
   assert.equal(registered.values['rv360:profile'].stage,'Estoy eligiendo mi bachillerato');
   const undecided=await request('auth/register',{name:'Sin elección previa',email:'undecided@example.test',password,stage:'Estoy eligiendo mi bachillerato'});
   assert.equal(undecided.status,200);const undecidedData=await undecided.json();assert.equal(undecidedData.values['rv360:profile'].baccalaureate,'por-definir');assert.equal(undecidedData.values['rv360:profile'].learningPreference,'por-definir');
   const duplicate=await Promise.all([1,2].map(()=>request('auth/register',{name:'Registro simultáneo',email:'simultaneous@example.test',password,stage:'Estoy eligiendo mi bachillerato'})));
   assert.equal(duplicate.filter(r=>r.status===200).length,1);assert(duplicate.every(r=>[200,400,409].includes(r.status)));
   assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM users WHERE email=?').get('simultaneous@example.test')).n,1);
   if(process.env.DB_DRIVER==='mysql'){
    if(process.env.GUIDANCE_DB_FAULT_TEST==='true'){
    await db.exec("CREATE TRIGGER qa_profile_failure BEFORE INSERT ON documents FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='qa-registration-rollback'");
    try{
     const failed=await request('auth/register',{name:'Registro con fallo',email:'rollback@example.test',password,stage:'Estoy eligiendo mi bachillerato'});assert.equal(failed.status,500);
     assert.equal(await db.prepare('SELECT id FROM users WHERE email=?').get('rollback@example.test'),undefined,'Profile write failure must roll back the user account');
    }finally{await db.exec('DROP TRIGGER qa_profile_failure');}
    console.log('PASS MySQL registration: failed profile write rolls back the account.');
    }
    const {spawnSync}=await import('node:child_process');const security=spawnSync(process.execPath,['scripts/test-security-http.mjs'],{env:{...process.env,APP_URL:base},stdio:'inherit',windowsHide:true});assert.equal(security.status,0,'Real MySQL HTTP security validation');
   }
   const {runValidationHttp}=await import('./test-validation-http.mjs');
   await runValidationHttp({request,cookie,adminCookie,password,db});
   console.log('PASS HTTP: student/admin login, persisted profile, invalid values rejected, current report ordering and authorized admin regeneration.');
   const {runAssessmentImportHttp}=await import('./test-assessment-import-http.mjs');
   // Format scenarios and the later visual suite have separate upload windows.
   // This fixture-only reset never changes the application's throttle policy.
   await runAssessmentImportHttp({base,adminCookie,studentCookie:cookie,resetImportThrottle:()=>db.prepare('DELETE FROM attempts WHERE key=?').run('import:admin_test')});
   const {runSchoolTrainingHttp}=await import('./test-school-training-http.mjs');
   await runSchoolTrainingHttp({base,password,adminCookie,schoolOrientationTemplate,schoolPracticeTemplate,db});
   if(process.argv.includes('--visual')){
    const {runGuidanceVisual}=await import('./test-guidance-visual.mjs');
    await runGuidanceVisual({base,password,folder,schoolPracticeTemplate});
   }
   if(process.argv.includes('--completion-visual')){
    const {runAdminCompletionVisual}=await import('./test-admin-completion-visual.mjs');
    await runAdminCompletionVisual({base,password,folder});
   }
   if(process.argv.includes('--admin-visual')){
    const {runAdminImportVisual}=await import('./test-admin-import-visual.mjs');
    await runAdminImportVisual({base,password,folder});
   }
   if(process.argv.includes('--users-visual')){
    const {runAdminUsersVisual}=await import('./test-admin-users-visual.mjs');
    await runAdminUsersVisual({base,password,folder});
   }
  }finally{child.kill();await stopped;}
 }
}finally{await db.close();}
