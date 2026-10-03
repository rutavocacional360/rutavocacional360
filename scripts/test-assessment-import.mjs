import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdirSync,mkdtempSync,writeFileSync,readdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {createRequire} from 'node:module';

mkdirSync('.qa-tools',{recursive:true});
const folder=mkdtempSync(resolve('.qa-tools','assessment-import-'));
process.env.DB_DRIVER='sqlite';process.env.DATABASE_PATH=resolve(folder,'imports.sqlite');
process.env.IMPORT_PATH=resolve(folder,'files');mkdirSync(process.env.IMPORT_PATH);
const outfile=resolve(folder,'server.cjs');
await build({stdin:{contents:`export {db,put,document} from './lib/server/store';export {assignJob,startJob,cancelJob} from './lib/server/import-jobs';export * from './lib/server/assessment-import';export {POST as uploadDocument} from './app/api/admin/import/route';`,resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'cjs',packages:'external',outfile,plugins:[{name:'server-only',setup(b){b.onResolve({filter:/^server-only$/},()=>({path:'empty',namespace:'empty'}));b.onLoad({filter:/.*/,namespace:'empty'},()=>({contents:''}));b.onResolve({filter:/^@\/lib\/server\/store$/},()=>({path:'route-auth',namespace:'test-auth'}));b.onLoad({filter:/.*/,namespace:'test-auth'},()=>({contents:`export * from ${JSON.stringify(resolve('lib/server/store.ts').replaceAll('\\','/'))};export async function requireUser(){return globalThis.importTestAdmin;}`,resolveDir:process.cwd()}));}}]});
await build({entryPoints:['scripts/import-worker.mjs'],outfile:'.runtime/import-worker.cjs',bundle:true,platform:'node',target:'node24',format:'cjs',packages:'external'});
const {db,put,document,assignJob,startJob,cancelJob,assessmentImportLevel,scopeImportedTests,uploadDocument}=createRequire(import.meta.url)(outfile);
const owner='institution:import-qa';
globalThis.importTestAdmin={id:'import-admin',name:'Import QA',institutionId:'import-qa',role:'admin'};
process.env.APP_URL='https://import.example.test';
const metadata={title:'Documento con metadatos de otra ruta',educationLevel:'ambos',publishedAt:'2026-01-01',publishedBy:'old-admin',status:'Publicado',careerLinks:[{careerId:'bachillerato:ciencias'},{careerId:'university-fixture'}],questions:[{id:'q1',text:'Mi interés',type:'single',options:[{value:1,label:'Sí'},{value:2,label:'No'}]}]};
const html='<script type="application/json">'+JSON.stringify(metadata)+'</script><h1>Test vocacional</h1>';
async function completed(id){
 for(let i=0;i<120;i++){
  const job=(await document(owner,'rv360:imports',[])).find(j=>j.id===id);
  if(job.status==='Completado')return job;
  assert.notEqual(job.status,'Error',job.error);await new Promise(r=>setTimeout(r,50));
 }
 assert.fail('The isolated import worker did not finish');
}
try{
 await db.migrate();
 for(const bad of [undefined,'','ambos','invalid',{}])assert.throws(()=>assessmentImportLevel(bad),e=>e.status===400);
 const malformed={...metadata,careerLinks:[null,123,{}, {careerId:''},...metadata.careerLinks]};
 assert.equal(scopeImportedTests([malformed],'universidad')[0].careerLinks.length,1);
 for(const level of ['bachillerato','universidad']){
  const scoped=scopeImportedTests([metadata],level)[0];assert.equal(scoped.educationLevel,level);assert.equal(scoped.careerLinks.length,1);assert.equal(scoped.careerLinks[0].careerId.startsWith('bachillerato:'),level==='bachillerato');
  const id='job-'+level;writeFileSync(resolve(process.env.IMPORT_PATH,id),html);
  await put(owner,'rv360:imports',[...await document(owner,'rv360:imports',[]),{id,name:'fixture.html',educationLevel:level,status:'Pendiente'}]);
  await assert.rejects(startJob(owner,id,level==='bachillerato'?'universidad':'bachillerato'),e=>e.status===409);
  await startJob(owner,id);const job=await completed(id);
  assert.equal(job.educationLevel,level);assert(job.tests.length);assert(job.tests.every(t=>t.educationLevel===level));assert.equal(job.tests[0].careerLinks.length,1);assert.equal(job.tests[0].status,'Borrador');assert.equal(job.tests[0].publishedAt,undefined);assert.equal(job.tests[0].publishedBy,undefined);
  await assert.rejects(assignJob(owner,id,level==='bachillerato'?'universidad':'bachillerato'),e=>e.status===409);
 }
 await put(owner,'rv360:imports',[...await document(owner,'rv360:imports',[]),{id:'legacy-complete',name:'old.html',status:'Completado',tests:[metadata]},{id:'legacy-error',name:'old.html',status:'Error'}]);
 await assignJob(owner,'legacy-complete','universidad');const classified=(await document(owner,'rv360:imports')).find(j=>j.id==='legacy-complete');assert.equal(classified.educationLevel,'universidad');assert.equal(classified.tests[0].educationLevel,'universidad');
 await assert.rejects(assignJob('institution:other','legacy-complete','bachillerato'),e=>e.status===404);
 writeFileSync(resolve(process.env.IMPORT_PATH,'legacy-error'),html);
 await assert.rejects(startJob(owner,'legacy-error'),e=>e.status===400);
 await startJob(owner,'legacy-error','bachillerato');assert.equal((await completed('legacy-error')).tests[0].educationLevel,'bachillerato');
 const transientId='retry-save-error';writeFileSync(resolve(process.env.IMPORT_PATH,transientId),html);
 await put(owner,'rv360:imports',[...await document(owner,'rv360:imports',[]),{id:transientId,name:'fault.html',educationLevel:'universidad',status:'Pendiente'}]);
 const realTransaction=db.transaction;db.transaction=async()=>{throw Error('isolated-write-fault');};
 try{await assert.rejects(startJob(owner,transientId),/isolated-write-fault/);}finally{db.transaction=realTransaction;}
 await startJob(owner,transientId);assert.equal((await completed(transientId)).educationLevel,'universidad');
 // A retry or cancellation during the initial database write must not launch another worker.
 for(const cancel of [false,true]){
  const id=cancel?'race-cancel':'race-retry';writeFileSync(resolve(process.env.IMPORT_PATH,id),html);
  await put(owner,'rv360:imports',[...await document(owner,'rv360:imports',[]),{id,name:'race.html',educationLevel:'bachillerato',status:'Pendiente'}]);
  const realTransaction=db.transaction;let unblock,entered;const blocked=new Promise(resolve=>{entered=resolve;});const release=new Promise(resolve=>{unblock=resolve;});let next=true;
  db.transaction=async fn=>{if(next){next=false;entered();await release;}return realTransaction(fn);};
  try{
   const started=startJob(owner,id);await blocked;
   if(cancel)await cancelJob(owner,id);else await startJob(owner,id);
   unblock();await started;
   if(cancel){await new Promise(r=>setTimeout(r,100));assert.equal((await document(owner,'rv360:imports')).find(j=>j.id===id).status,'Cancelado');}
   else assert.equal((await completed(id)).educationLevel,'bachillerato');
  }finally{db.transaction=realTransaction;unblock();}
 }
 // Exercise the real upload handler and storage with an isolated administrative identity.
 const upload=async(source,reuse=false)=>{
  const form=new FormData();form.set('file',new File([source],'simulator.html',{type:'text/html'}));form.set('educationLevel','universidad');if(reuse)form.set('reuse','1');
  const response=await uploadDocument(new Request(process.env.APP_URL+'/api/admin/import',{method:'POST',headers:{Origin:process.env.APP_URL},body:form}));
  return {httpStatus:response.status,...await response.json()};
 };
 const capacitySource=html+'<p>Capacity recovery fixture.</p>',beforeJobs=await document(owner,'rv360:imports',[]),beforeFiles=readdirSync(process.env.IMPORT_PATH).sort();
 globalThis.rutaJobs.set('occupied-1',{});globalThis.rutaJobs.set('occupied-2',{});
 try{
  assert.equal((await upload(capacitySource,true)).httpStatus,429);
  assert.deepEqual(await document(owner,'rv360:imports',[]),beforeJobs,'A rejected upload must not leave a duplicate-blocking import record');
  assert.deepEqual(readdirSync(process.env.IMPORT_PATH).sort(),beforeFiles,'A rejected upload must not leave an orphaned source file');
 }finally{globalThis.rutaJobs.delete('occupied-1');globalThis.rutaJobs.delete('occupied-2');}
 const resumed=await upload(capacitySource,true);assert.equal(resumed.httpStatus,202);await completed(resumed.id);
 const duplicate=await upload(capacitySource);assert.equal(duplicate.httpStatus,400,'Tests retain explicit duplicate rejection');
 const reused=await upload(capacitySource,true);assert.equal(reused.id,resumed.id);assert.equal(reused.reused,true);
 const count=(await document(owner,'rv360:imports',[])).length;
 for(const status of ['Error','Cancelado']){
  await put(owner,'rv360:imports',(await document(owner,'rv360:imports',[])).map(job=>job.id===resumed.id?{...job,status,error:'Interrupted fixture'}:job));
  assert.equal((await upload(capacitySource,true)).id,resumed.id);await completed(resumed.id);
  assert.equal((await document(owner,'rv360:imports',[])).length,count,'Retry recovers the same scoped import, without duplicating its history');
 }
 const concurrent=await Promise.all([upload(html+'<p>Concurrent reuse fixture.</p>',true),upload(html+'<p>Concurrent reuse fixture.</p>',true)]);
 assert(concurrent.every(value=>value.httpStatus===202));assert.equal(concurrent[0].id,concurrent[1].id);await completed(concurrent[0].id);
 console.log('PASS imports: real isolated worker preserves selected route, ignores conflicting document metadata, filters linked careers, rejects reclassification and classifies legacy retries and serializes cancellation/retry races.');
 console.log('PASS upload recovery: completed sources reused explicitly, failed/cancelled sources retried, concurrent uploads deduplicated and capacity failures leave no records or files.');
}finally{delete globalThis.importTestAdmin;await db.close();}
