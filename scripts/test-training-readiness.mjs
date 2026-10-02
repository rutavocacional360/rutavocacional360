import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdirSync,mkdtempSync} from 'node:fs';
import {resolve} from 'node:path';
import {createRequire} from 'node:module';
import {completeAssessment} from './assessment-fixtures.mjs';
mkdirSync('.qa-tools',{recursive:true});
const folder=mkdtempSync(resolve('.qa-tools','readiness-'));
process.env.DB_DRIVER='sqlite';process.env.DATABASE_PATH=resolve(folder,'test.sqlite');process.env.ACADEMIC_CONTENT_PATH=resolve(folder,'academic.json');
const outfile=resolve(folder,'server.cjs');
await build({stdin:{contents:`
 export {db,put,document,releaseResult} from './lib/server/store';
 export {saveDocument} from './lib/server/operations';
 export {assessmentReadiness} from './lib/server/assessment-readiness';
 export {ensureGuidance} from './lib/server/guidance';
 export * from './lib/server/training';
 export {instruments} from './components/kit/data/instruments';
 export {calculateTest} from './components/kit/lib/test-engine';
 export {schoolPracticeTemplate,schoolOrientationTemplate} from './components/kit/data/school-templates';
`,resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'cjs',packages:'external',outfile,
 plugins:[{name:'server-marker',setup(b){b.onResolve({filter:/^server-only$/},()=>({path:'server-only',namespace:'empty'}));b.onLoad({filter:/.*/,namespace:'empty'},()=>({contents:''}));}}]});
const api=createRequire(import.meta.url)(outfile),{db,put,trainingState,saveTraining,assessmentReadiness,instruments,calculateTest}=api;
const user={id:'student',name:'QA',role:'student',institutionId:'org'},admin={id:'admin',name:'QA admin',role:'admin',institutionId:'org'};
const complete=(instrument,extra={})=>completeAssessment({db,calculateTest,userId:user.id,instrument,...extra});
try {
 await db.migrate();await db.prepare('INSERT INTO institutions VALUES(?,?,?)').run('org','QA','QA');
 for(const u of [user,admin])await db.prepare('INSERT INTO users VALUES(?,?,?,?,?,?,?,?)').run(u.id,u.name,u.id+'@example.test','unused',u.role,'org','','Activo');
 const blank={id:'',version:0,revision:0,status:'published',title:'',instrument:{id:'qa',version:'1',title:'',description:'',options:[],questions:[]},purpose:'general',modes:['practice','exam'],durationMinutes:30,maxAttempts:3,gradePolicy:'last',feedback:'finish',selection:'fixed',quotas:[],areaWeights:[],questions:[],shuffleOptions:false,questionOrderFixedIds:[]};
 const simulator=await saveTraining(admin,'simulator',api.schoolPracticeTemplate(blank,'ciencias'));
 const course=await saveTraining(admin,'course',{id:'',version:0,revision:0,status:'published',title:'Curso Ciencias QA',description:'Preparación',objectives:'Practicar',level:'Inicial',type:'general',careerIds:['bachillerato:ciencias'],fields:[],institutions:[],studentIds:[],access:'all',activities:[{id:'activity',module:'QA',title:'Práctica',kind:'simulator',content:'',required:true,completion:'submit',simulatorId:simulator.id,simulatorVersion:simulator.version}]});
 const locked=async()=>{
  const state=await trainingState(user);
  assert.equal(state.recommendations.length,0);assert.equal(state.simulators.length,0);assert.equal(state.courses.length,0);
  assert.equal(state.readiness.bachillerato.ready,false);assert.equal(state.readiness.universidad.ready,false);
  await assert.rejects(api.startDirectSimulator(user,simulator.id,'practice'),e=>e.status===409);
  await assert.rejects(api.enroll(user,course.id),e=>e.status===409);
  await assert.rejects(api.enroll(admin,course.id,user.id),e=>e.status===409,'Admin assignment cannot bypass prerequisites');
  return state;
 };
 await locked();
 await put(user.id,'training:goal',{careerIds:['bachillerato:ciencias'],fields:[]});
 await put(user.id,'rv360:answers:intereses:demo-1',{'I-1':5});await locked();
 await complete(instruments[0]);await locked();
 const partial=await api.ensureGuidance(user);assert.equal(partial.analysis.recommendations.length,0);assert.equal(partial.analysis.pathway.suggested,'pendiente');
 await complete(instruments[1]);await locked();
 const withheld=await complete(instruments[2],{publication:'review'});await locked();
 await api.releaseResult(admin,withheld.id);
 const ready=await trainingState(user);assert(ready.readiness.bachillerato.ready&&ready.readiness.universidad.ready);assert(ready.recommendations.length>0);
 assert(ready.recommendations.filter(r=>r.careerId.startsWith('bachillerato:')).length<40,'Only result-related school targets are offered');
 assert(ready.simulators.some(s=>s.id===simulator.id));
 const started=await api.startDirectSimulator(user,simulator.id,'practice');assert(started.id);
 const enrollment=await api.enroll(user,course.id);assert(enrollment.id);
 const schoolTest={...api.schoolOrientationTemplate(),id:'school-extra',version:'1',status:'Publicado',group:'Todos los estudiantes',due:''};
 await api.saveDocument(admin,'rv360:custom-tests',[schoolTest],0);
 const added=await trainingState(user);assert.equal(added.readiness.bachillerato.ready,false);assert.equal(added.readiness.universidad.ready,true);
 assert(!added.recommendations.some(r=>r.careerId.startsWith('bachillerato:')));assert(added.recommendations.some(r=>!r.careerId.startsWith('bachillerato:')));
 await assert.rejects(api.startDirectSimulator(user,simulator.id,'practice'),e=>e.status===409);
 await assert.rejects(api.startTraining(user,enrollment.id,'activity','practice'),e=>e.status===409);
 const report=await api.ensureGuidance(user);assert.equal(report.analysis.pathway.suggested,'pendiente');assert.notEqual(report.id,partial.id);
 await complete(schoolTest);assert((await assessmentReadiness(user)).bachillerato.ready);
 // Newest withheld attempt must invalidate the earlier, published result.
 await complete(instruments[0],{publication:'review',at:'2099-01-01T00:00:00Z'});await locked();
 // No active tests must never unlock courses by vacuous completion.
 await put('institution:org','rv360:custom-tests',[]);
 await put('institution:org','rv360:admin-original-status',Object.fromEntries(instruments.map(t=>[t.id,'Archivado'])));
 const empty=await locked();assert.equal(empty.readiness.universidad.total,0);
 console.log('PASS readiness: no tests, drafts, partial submissions, withheld results, completed routes, level scoping, new assignments, stale reports, direct URLs and empty assignments.');
} finally { await db.close(); }
