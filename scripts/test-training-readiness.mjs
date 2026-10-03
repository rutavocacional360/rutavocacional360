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
 export {currentAssessments,battery} from './lib/server/battery';
 export {ensureGuidance} from './lib/server/guidance';
 export * from './lib/server/training';
 export {instruments} from './components/kit/data/instruments';
 export {calculateTest} from './components/kit/lib/test-engine';
 export {schoolPracticeTemplate,schoolOrientationTemplate} from './components/kit/data/school-templates';
`,resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'cjs',packages:'external',outfile,
 plugins:[{name:'server-marker',setup(b){b.onResolve({filter:/^server-only$/},()=>({path:'server-only',namespace:'empty'}));b.onLoad({filter:/.*/,namespace:'empty'},()=>({contents:''}));}}]});
const api=createRequire(import.meta.url)(outfile),{db,put,trainingState,saveTraining,assessmentReadiness,instruments,calculateTest}=api;
const user={id:'student',name:'QA',role:'student',institutionId:'org'},admin={id:'admin',name:'QA admin',role:'admin',institutionId:'org'};
const complete=(instrument,extra={})=>completeAssessment({db,calculateTest,userId:user.id,instrument:{...instrument,educationLevel:'bachillerato'},...extra});
try {
 await db.migrate();await db.prepare('INSERT INTO institutions VALUES(?,?,?)').run('org','QA','QA');
 for(const u of [user,admin])await db.prepare('INSERT INTO users VALUES(?,?,?,?,?,?,?,?)').run(u.id,u.name,u.id+'@example.test','unused',u.role,'org','','Activo');
 await put(user.id,'rv360:profile',{stage:'Estoy eligiendo mi bachillerato',baccalaureate:'por-definir',learningPreference:'investigar'});
 assert((await api.currentAssessments(user)).every(t=>t.educationLevel==='bachillerato'));
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
 await assert.rejects(api.saveDocument(user,'rv360:assessment-route-origins',{forged:'universidad'},0),e=>e.status===403);
 await locked();
 await put(user.id,'training:goal',{careerIds:['bachillerato:ciencias'],fields:[]});
 await put(user.id,'rv360:answers:intereses:demo-1',{'I-1':5});await locked();
 await complete(instruments[0]);await locked();
 const partial=await api.ensureGuidance(user);assert.equal(partial.analysis.recommendations.length,0);assert.equal(partial.analysis.pathway.suggested,'pendiente');
 await complete(instruments[1]);await locked();
 const withheld=await complete(instruments[2],{publication:'review'});await locked();
 await api.releaseResult(admin,withheld.id);
 const ready=await trainingState(user);assert(ready.readiness.bachillerato.ready);assert.equal(ready.educationLevel,'bachillerato');assert.equal(ready.readiness.universidad.ready,false);assert.equal(ready.readiness.universidad.total,0);assert(ready.recommendations.length>0);assert(ready.recommendations.every(r=>r.careerId.startsWith('bachillerato:')));assert(ready.careers.every(c=>c.id.startsWith('bachillerato:')));
 assert(ready.recommendations.filter(r=>r.careerId.startsWith('bachillerato:')).length<40,'Only result-related school targets are offered');
 assert(ready.simulators.some(s=>s.id===simulator.id));
 // The exact specialty in a report must lead to published matching preparation.
 const specialty=ready.recommendations.find(r=>!['bachillerato:ciencias','bachillerato:tecnico'].includes(r.careerId));
 assert(specialty,'A complete differentiated school profile has a concrete preparation target');
 const exactSimulator=await saveTraining(admin,'simulator',{...api.schoolPracticeTemplate(blank,'ciencias'),title:'Simulador de la especialidad QA',careerIds:[specialty.careerId]});
 const otherCareer=ready.careers.find(c=>!ready.recommendations.some(r=>r.careerId===c.id)&&!['bachillerato:ciencias','bachillerato:tecnico'].includes(c.id));
 assert(otherCareer,'There are unrelated specialties outside the recommendation');
 const unrelatedSimulator=await saveTraining(admin,'simulator',{...api.schoolPracticeTemplate(blank,'tecnico'),title:'Especialidad ajena QA',careerIds:[otherCareer.id]});
 const connected=await trainingState(user);
 assert(connected.simulators.some(s=>s.id===exactSimulator.id));
 assert(!connected.simulators.some(s=>s.id===unrelatedSimulator.id));
 assert((await api.startDirectSimulator(user,exactSimulator.id,'practice')).id);
 await assert.rejects(api.startDirectSimulator(user,unrelatedSimulator.id,'practice'),e=>e.status===403,'An unrecommended specialty cannot be opened via its direct simulator URL');

 // Legacy simulators without direct targets inherit only the matching current-route course.
 const inheritedTemplate={...api.schoolPracticeTemplate(blank,'ciencias'),title:'Simulador heredado del curso QA',careerIds:[],educationLevel:undefined};
 const inheritedSimulator=await saveTraining(admin,'simulator',inheritedTemplate);
 const inheritedCourse=await saveTraining(admin,'course',{...course,id:'',version:0,revision:0,title:'Curso vinculado a la especialidad QA',careerIds:[specialty.careerId],activities:[{...course.activities[0],simulatorId:inheritedSimulator.id,simulatorVersion:inheritedSimulator.version}]});
 assert((await trainingState(user)).simulators.some(s=>s.id===inheritedSimulator.id));
 assert((await api.startDirectSimulator(user,inheritedSimulator.id,'practice')).id,'A simulator inheriting a school specialty uses school prerequisites');
 const started=await api.startDirectSimulator(user,simulator.id,'practice');assert(started.id);
 const enrollment=await api.enroll(user,course.id);assert(enrollment.id);
 const schoolTest={...api.schoolOrientationTemplate(),id:'school-extra',version:'1',status:'Publicado',group:'Todos los estudiantes',due:''};
 await api.saveDocument(admin,'rv360:custom-tests',[schoolTest],0);
 const added=await trainingState(user);assert.equal(added.readiness.bachillerato.ready,false);assert.equal(added.readiness.universidad.ready,false);assert.equal(added.readiness.universidad.total,0);
 assert.deepEqual(added.recommendations,[],'New school assignments must lock all recommendations in the current school route');
 await assert.rejects(api.startDirectSimulator(user,simulator.id,'practice'),e=>e.status===409);
 await assert.rejects(api.startTraining(user,enrollment.id,'activity','practice'),e=>e.status===409);
 const report=await api.ensureGuidance(user);assert.equal(report.analysis.pathway.suggested,'pendiente');assert.notEqual(report.id,partial.id);
 await complete(schoolTest);assert((await assessmentReadiness(user)).bachillerato.ready);
 // A published university-only assignment cannot block the school route.
 const universityOnly={...schoolTest,id:'university-extra',educationLevel:'universidad'};
 await api.saveDocument(admin,'rv360:custom-tests',[schoolTest,universityOnly],1);
 const schoolStillReady=await trainingState(user);assert(schoolStillReady.readiness.bachillerato.ready);assert.equal(schoolStillReady.readiness.universidad.total,0);assert(schoolStillReady.recommendations.every(r=>r.careerId.startsWith('bachillerato:')));
 // Changing stage excludes every school result, even the shared core test ids.
 await put(user.id,'rv360:profile',{stage:'Me gradu\u00e9 del colegio',baccalaureate:'tecnico',learningPreference:'aplicar'});
 const universityLocked=await trainingState(user);assert.equal(universityLocked.educationLevel,'universidad');assert.equal(universityLocked.readiness.bachillerato.total,0);assert.equal(universityLocked.readiness.bachillerato.ready,false);assert.equal(universityLocked.readiness.universidad.completed,0);assert.equal(universityLocked.readiness.universidad.ready,false);assert.deepEqual(universityLocked.recommendations,[]);assert(universityLocked.careers.every(c=>!c.id.startsWith('bachillerato:')));
 await assert.rejects(api.startDirectSimulator(user,simulator.id,'practice'),e=>e.status===409);await assert.rejects(api.startTraining(user,enrollment.id,'activity','practice'),e=>e.status===409);
 await assert.rejects(api.ensureGuidance(user),e=>e.status===409,'Graduates need new university results');
 const universityAssigned=await api.currentAssessments(user);assert(universityAssigned.some(t=>t.id===universityOnly.id));assert(!universityAssigned.some(t=>t.id===schoolTest.id));assert((await api.battery(user)).instruments.every(t=>t.educationLevel==='universidad'));
 for(const instrument of universityAssigned)await completeAssessment({db,calculateTest,userId:user.id,instrument});
 const universityReady=await trainingState(user);assert(universityReady.readiness.universidad.ready);assert.equal(universityReady.readiness.bachillerato.total,0);assert(universityReady.recommendations.length);assert(universityReady.recommendations.every(r=>!r.careerId.startsWith('bachillerato:')));assert(!universityReady.simulators.some(s=>s.id===simulator.id));assert(!universityReady.courses.some(c=>c.id===course.id));assert(universityReady.enrollments.some(e=>e.id===enrollment.id),'School enrollment history is retained after graduation');
 const universityReport=await api.ensureGuidance(user);assert.equal(universityReport.analysis.pathway,undefined);assert(universityReport.instruments.every(i=>i.instrument.educationLevel==='universidad'));
 await put(user.id,'rv360:profile',{stage:'Estoy eligiendo mi bachillerato',baccalaureate:'por-definir',learningPreference:'investigar'});
 // Newest withheld attempt must invalidate the earlier, published result.
 await complete(instruments[0],{publication:'review',at:'2099-01-01T00:00:00Z'});await locked();
 // No active tests must never unlock courses by vacuous completion.
 await put('institution:org','rv360:custom-tests',[]);
 await put('institution:org','rv360:admin-original-status',Object.fromEntries(instruments.map(t=>[t.id,'Archivado'])));
 const empty=await locked();assert.equal(empty.readiness.bachillerato.total,0);assert.equal(empty.readiness.universidad.total,0);
 console.log('PASS readiness: no tests, drafts, partial submissions, withheld results, completed routes, level scoping, new assignments, stale reports, direct URLs and empty assignments.');
} finally { await db.close(); }
