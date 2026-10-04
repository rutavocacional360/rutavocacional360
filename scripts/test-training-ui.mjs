import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {mkdirSync,mkdtempSync} from 'node:fs';
import {resolve} from 'node:path';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {parseHTML} from 'linkedom';
mkdirSync('.qa-tools',{recursive:true});
const folder=mkdtempSync(resolve('.qa-tools','training-ui-')),outfile=resolve(folder,'ui.cjs'),primitives=resolve('components/kit/components/ui/primitives.tsx').replaceAll('\\','/');
await build({stdin:{contents:`export {StudentCourses} from './components/kit/features/training/StudentCourses';export {StudentCoursePrograms} from './components/kit/features/training/StudentCoursePrograms';export {AdminCourses} from './components/kit/features/training/AdminCourses';export {StudyOptionSuggestions} from './components/kit/features/admin/StudyOptionSuggestions';`,resolveDir:process.cwd(),loader:'tsx'},jsx:'automatic',bundle:true,platform:'node',packages:'external',format:'cjs',outfile,loader:{'.css':'empty'},plugins:[{name:'fixtures',setup(b){
 b.onResolve({filter:/\/lib\/session$/},()=>({path:'session',namespace:'fixture'}));
 b.onResolve({filter:/\/components\/ui\/primitives$/},()=>({path:'primitives',namespace:'fixture'}));
 b.onResolve({filter:/^next\/navigation$/},()=>({path:'navigation',namespace:'fixture'}));
 b.onResolve({filter:/^\.\/shared$/},()=>({path:'training',namespace:'fixture'}));
 b.onResolve({filter:/^\.\/SimulatorRun$/},()=>({path:'simulator',namespace:'fixture'}));
 b.onLoad({filter:/.*/,namespace:'fixture'},args=>({resolveDir:process.cwd(),contents:args.path==='primitives'?`import React from 'react';import {Button as ActualButton} from '${primitives}';export * from '${primitives}';export function Button(props){(globalThis.__trainingButtons||=[]).push(props);return React.createElement(ActualButton,props)}`:args.path==='navigation'?`export const useSearchParams=()=>new URLSearchParams(globalThis.__trainingQuery||'');export const useRouter=()=>({push(url){globalThis.__trainingNavigations.push(url)}});`:args.path==='session'?`export const previewAction=async()=>({careers:[]});export const useSession=()=>({values:{'rv360:profile':globalThis.__trainingProfile}});`:args.path==='training'?`export const useTraining=()=>({data:globalThis.__trainingFixture,error:'',busy:false,refresh(){},run(){}});export function TrainingError(){return null;}export async function trainingApi(...args){return globalThis.__trainingApi?.(...args)};export const decimal=String;export function ChoiceList(){return null;}`:`export function SimulatorRun(){return null;}export function TrainingResult(){return null;}`}));
}}]});
const {StudentCourses,StudentCoursePrograms,AdminCourses,StudyOptionSuggestions}=createRequire(import.meta.url)(outfile);
const readiness=ready=>({ready,total:3,completed:ready?3:1,pending:ready?[]:[{id:'pending',title:'Test pendiente QA',state:'awaiting_results'}]});
const courseFixture=(educationLevel,overrides={})=>({id:'course-'+educationLevel,educationLevel,title:'Programa '+educationLevel,description:'Lecturas y reflexiones QA',version:2,status:'published',type:'general',careerIds:[],fields:[],activities:[{id:'new-version-activity',title:'Actividad nueva',module:'Programa',kind:'text',content:'Contenido de la nueva versión',required:true,completion:'read'}],...overrides});
try{
 for(const level of ['bachillerato','universidad']){
  globalThis.__trainingQuery='';globalThis.__trainingNavigations=[];globalThis.__trainingButtons=[];
  globalThis.__trainingProfile={stage:level==='bachillerato'?'Estoy en 10.º de EGB y pasaré a 1.º de BGU':'Me gradué del colegio'};
  globalThis.__trainingFixture={careers:[{id:'bachillerato:ciencias-exactas',name:'Opción escolar QA',area:'Ciencias',educationLevel:'bachillerato'},{id:'bachillerato:ciencias',name:'Bachillerato en Ciencias',area:'Modalidad general QA',educationLevel:'bachillerato'},{id:'bachillerato:tecnico',name:'Bachillerato Técnico',area:'Modalidad general QA',educationLevel:'bachillerato'},{id:'uni-qa',name:'Opción universitaria QA',area:'Tecnología',educationLevel:'universidad'}],recommendations:[{careerId:'bachillerato:ciencias-exactas',reason:'Evidencia QA'},{careerId:'bachillerato:ciencias',reason:'Modalidad antigua QA'},{careerId:'bachillerato:tecnico',reason:'Modalidad antigua QA'},{careerId:'uni-qa',reason:'Evidencia QA'}],attempts:[],simulators:[],readiness:{bachillerato:readiness(false),universidad:readiness(false)}};
  globalThis.__trainingFixture.courses=['bachillerato','universidad'].map(educationLevel=>courseFixture(educationLevel));
  const locked=renderToStaticMarkup(React.createElement(StudentCourses));
  assert(locked.includes('Completa tus tests para acceder a los cursos'));assert(locked.includes('Test pendiente QA'));assert(locked.includes('/mi-ruta/evaluaciones'));
  assert(!locked.includes('Opción escolar QA')&&!locked.includes('Opción universitaria QA'),'Stale recommendations must not leak through a locked screen');
  assert(!locked.includes('Autopreparación'));
  assert(!locked.includes('Cursos y actividades')&&!locked.includes('Programa '+level),'Reading programs share the assessment readiness gate');
  globalThis.__trainingFixture.readiness[level]=readiness(true);
  const ready=renderToStaticMarkup(React.createElement(StudentCourses));
  assert(ready.includes(level==='bachillerato'?'Opción escolar QA':'Opción universitaria QA'));assert(ready.includes('Autopreparación'));
  assert(!ready.includes('Bachillerato en Ciencias')&&!ready.includes('Bachillerato Técnico')&&!ready.includes('Modalidad general QA'),'Legacy modality data is excluded from both cards and area filters');
  assert(!ready.includes(level==='bachillerato'?'Opción universitaria QA':'Opción escolar QA'),'Unlocked route must still hide opposite-route courses');
  assert(ready.includes('Programa '+level)&&ready.includes('Comenzar curso'),'Published reading programs are visible alongside preparation');
  assert(!ready.includes('Programa '+(level==='bachillerato'?'universidad':'bachillerato')),'Reading programs retain their educational category');
  assert(!locked.includes('aria-label="Nivel de preparación"')&&!ready.includes('aria-label="Nivel de preparación"'),'Students cannot switch to a route inconsistent with their registered stage');
 }
 globalThis.__trainingProfile={stage:'Estoy en 10.º de EGB y pasaré a 1.º de BGU'};
 globalThis.__trainingFixture={careers:[{id:'bachillerato:ciencias-exactas',name:'Ciencias exactas y tecnología',area:'Ciencias',educationLevel:'bachillerato'},{id:'uni-qa',name:'Universidad ajena QA',area:'Tecnología',educationLevel:'universidad'}],recommendations:[{careerId:'bachillerato:ciencias-exactas',reason:'Investigación y aplicación de tus resultados'},{careerId:'uni-qa',reason:'Universidad QA'}],attempts:[],readiness:{bachillerato:readiness(true),universidad:readiness(false)},simulators:[
  {id:'general',title:'Preparación general de Ciencias QA',careerIds:['bachillerato:ciencias'],version:1,modes:['practice'],durationMinutes:20,maxAttempts:3,questionCount:4},
  {id:'specific',title:'Preparación exactas QA',careerIds:['bachillerato:ciencias-exactas'],version:1,modes:['practice'],durationMinutes:20,maxAttempts:3,questionCount:4},
  {id:'unrelated',title:'Otra especialidad QA',careerIds:['bachillerato:ciencias-naturales'],version:1,modes:['practice'],durationMinutes:20,maxAttempts:3,questionCount:4},
  {id:'university',title:'Simulador universidad ajena QA',careerIds:['uni-qa'],version:1,modes:['practice'],durationMinutes:20,maxAttempts:3,questionCount:4},
 ].map(simulator=>({...simulator,instrument:{id:simulator.id,title:simulator.title,description:'Preparación QA',options:[],questions:[]}}))};
 globalThis.__trainingFixture.courses=[
  courseFixture('bachillerato',{id:'general-reading',title:'Programa general escolar QA'}),
  courseFixture('bachillerato',{id:'exact-reading',title:'Programa exactas QA',careerIds:['bachillerato:ciencias-exactas']}),
  courseFixture('bachillerato',{id:'field-reading',title:'Programa área QA',type:'field',fields:['Ciencias']}),
  courseFixture('bachillerato',{id:'other-reading',title:'Programa especialidad ajena QA',careerIds:['bachillerato:ciencias-naturales']}),
  courseFixture('universidad',{title:'Programa universitario ajeno QA'}),
 ];
 globalThis.__trainingQuery='carrera=bachillerato%3Aciencias-exactas';
 const specialty=renderToStaticMarkup(React.createElement(StudentCourses));
 assert(specialty.includes('Autopreparación para Ciencias exactas y tecnología'));
 assert(specialty.includes('Preparación general de Ciencias QA')&&specialty.includes('Preparación exactas QA'));
 assert(!specialty.includes('Otra especialidad QA')&&!specialty.includes('Simulador universidad ajena QA'));
 assert(specialty.includes('Programa general escolar QA')&&specialty.includes('Programa exactas QA')&&specialty.includes('Programa área QA'),'A selected specialty retains its general, directly linked and field programs');
 assert(!specialty.includes('Programa especialidad ajena QA')&&!specialty.includes('Programa universitario ajeno QA'));
 assert(specialty.includes('<strong>2</strong><p>Simuladores disponibles'),'Adding reading programs does not change simulator filtering/counts');
 assert(specialty.includes('Investigación y aplicación de tus resultados'));
 assert(specialty.includes('href="/mi-ruta/resultados"'));
 // A simulator used inside a course has an independent direct-practice quota.
 const attemptFixture={id:'course-attempt',enrollment_id:'course-enrollment',simulator:{id:'general',educationLevel:'bachillerato'},instrument:{title:'Resultado curso QA'},mode:'practice',state:'graded',finished_at:'2026-10-01T00:00:00Z',result:{percent:80}};
 globalThis.__trainingFixture.simulators[0].maxAttempts=1;
 globalThis.__trainingFixture.enrollments=[{id:'course-enrollment',course_id:'general-reading',snapshot:globalThis.__trainingFixture.courses[0],completed:[]}];
 globalThis.__trainingFixture.attempts=[attemptFixture];
 globalThis.__trainingButtons=[];
 const separateQuota=renderToStaticMarkup(React.createElement(StudentCourses));
 assert(!separateQuota.includes('1 / 1 intentos'),'A course attempt must not consume direct practice attempts');
 assert(globalThis.__trainingButtons.filter(button=>button.children==='Practicar').every(button=>!button.disabled),'Course activity history must not block independent practice');
 assert(separateQuota.includes('Resultado curso QA'),'Course results remain available in the overall history');
 globalThis.__trainingFixture.enrollments.push({id:'direct-enrollment',course_id:'direct:general',snapshot:{id:'direct:general',careerIds:['bachillerato:ciencias'],activities:[]},completed:[]});
 globalThis.__trainingFixture.attempts.push({...attemptFixture,id:'direct-attempt',enrollment_id:'direct-enrollment',state:'recoverable',result:null});
 globalThis.__trainingButtons=[];
 const recoverable=renderToStaticMarkup(React.createElement(StudentCourses));
 assert(recoverable.includes('1 / 1 intentos'),'Only direct attempts count toward the direct quota');
 assert.equal(globalThis.__trainingButtons.find(button=>button.children==='Continuar')?.disabled,false,'A recoverable submission remains available even when its quota is exhausted');
 globalThis.__trainingFixture.attempts=[{...attemptFixture,id:'recent',enrollment_id:'direct-enrollment',started_at:'2026-10-03T00:00:00Z',result:{percent:90}},{...attemptFixture,id:'earlier',enrollment_id:'direct-enrollment',started_at:'2026-10-01T00:00:00Z',result:{percent:30}}];
 globalThis.__trainingFixture.simulators[0].gradePolicy='last';
 assert(renderToStaticMarkup(React.createElement(StudentCourses)).includes('Nota: 90 / 100'),'Last-attempt grading uses chronological order even when the API returns newest first');
 globalThis.__trainingFixture.simulators[0].gradePolicy='first';
 assert(renderToStaticMarkup(React.createElement(StudentCourses)).includes('Nota: 30 / 100'),'First-attempt grading uses the earliest actual attempt');
 globalThis.__trainingFixture.enrollments=[];globalThis.__trainingFixture.attempts=[];

 globalThis.__trainingQuery='carrera=bachillerato%3Aciencias';
 const legacyModality=renderToStaticMarkup(React.createElement(StudentCourses));
 assert(legacyModality.includes('Elige un área o figura profesional para ver sus simuladores.'));
 assert(!legacyModality.includes('Autopreparación para Bachillerato')&&legacyModality.includes('Ciencias exactas y tecnología'),'Old modality URLs return valid recommended choices without a phantom career');
 globalThis.__trainingQuery='carrera=uni-qa';
 const foreign=renderToStaticMarkup(React.createElement(StudentCourses));
 assert(foreign.includes('Esta opción no pertenece a tu orientación actual'));
 assert(!foreign.includes('Universidad ajena QA')&&!foreign.includes('Autopreparación para'));
 globalThis.__trainingQuery='';globalThis.__trainingFixture.simulators=[];
 globalThis.__trainingButtons=[];
 const empty=renderToStaticMarkup(React.createElement(StudentCourses));assert(empty.includes('Autopreparación'));
 globalThis.__trainingButtons.find(button=>button.children==='Autopreparación').onClick();
 assert.equal(globalThis.__trainingNavigations.at(-1),'/mi-ruta/cursos?carrera=bachillerato%3Aciencias-exactas','The actual Autopreparación action opens the exact specialty');
 globalThis.__trainingQuery='carrera=bachillerato%3Aciencias-exactas';
 assert(renderToStaticMarkup(React.createElement(StudentCourses)).includes('aún no tiene simuladores publicados'));
 console.log('PASS specialization links: encoded route query, general preparation plus exact simulators, unrelated specialties hidden, foreign routes rejected, and honest unavailable content.');
 console.log('PASS rendered courses UI: both routes show pending tests, hide stale recommendations, and unlock relevant preparation only after completion.');
}finally{delete globalThis.__trainingProfile;delete globalThis.__trainingFixture;delete globalThis.__trainingQuery;delete globalThis.__trainingNavigations;delete globalThis.__trainingButtons;}

for(const level of ['bachillerato','universidad']){
 globalThis.__trainingQuery='nivel='+level;globalThis.__trainingNavigations=[];globalThis.__trainingButtons=[];
 globalThis.__trainingFixture={careers:[],simulators:['bachillerato','universidad'].map(educationLevel=>({instrument:{description:'Preparación QA'},id:educationLevel,title:'Simulador '+educationLevel,educationLevel,status:'draft',version:1,durationMinutes:30,careerIds:[],questions:[]})),attempts:[]};
 const markup=renderToStaticMarkup(React.createElement(AdminCourses));
 assert(markup.indexOf('Editar con IA')<markup.indexOf('Gestionar simulador'));
 globalThis.__trainingButtons.find(b=>b.children==='Editar con IA').onClick();assert(globalThis.__trainingNavigations.at(-1).includes('editar='+level),'AI action opens the selected draft');
 assert(markup.includes('Simulador '+level));assert(!markup.includes('Simulador '+(level==='bachillerato'?'universidad':'bachillerato')));
 const other=level==='bachillerato'?'Universidad':'Bachillerato';globalThis.__trainingButtons.find(b=>b.children===other).onClick();assert.equal(globalThis.__trainingNavigations.at(-1),'/admin/cursos?nivel='+other.toLowerCase());
}
// Published simulators and their draft versions share one card and editing resumes the saved draft.
globalThis.__trainingQuery='nivel=universidad';globalThis.__trainingNavigations=[];globalThis.__trainingButtons=[];
const familySimulator={id:'sim-family',title:'Familia simulador QA',educationLevel:'universidad',instrument:{description:'Familia QA'},durationMinutes:30,careerIds:[],questions:[]};
globalThis.__trainingFixture={careers:[],attempts:[],simulators:[{...familySimulator,version:1,status:'archived'},{...familySimulator,version:2,status:'published'},{...familySimulator,version:3,status:'draft'}]};
const familyMarkup=renderToStaticMarkup(React.createElement(AdminCourses));
assert.equal((familyMarkup.match(/<h2>Familia simulador QA<\/h2>/g)||[]).length,1,'Versions are grouped into one simulator card');
assert(familyMarkup.includes('pendiente de publicar')&&familyMarkup.includes('Eliminar borrador v'),'The existing draft is explained and can be deleted independently');
assert(familyMarkup.includes('La versión 2 está publicada.')&&familyMarkup.includes('borrador de la versión 3'),'Version labels retain readable Spanish accents');
globalThis.__trainingButtons.find(button=>button.children==='Editar con IA').onClick();
assert.equal(globalThis.__trainingNavigations.at(-1),'/admin/cursos?nivel=universidad&editar=sim-family&version=3','Editing an existing publication resumes its draft instead of creating duplicates');
const optionMarkup=renderToStaticMarkup(React.createElement(StudyOptionSuggestions,{test:{id:'qa',educationLevel:'bachillerato',title:'Bachillerato en Ciencias',description:'Documento de ciencias',options:[],questions:[]},careers:[{id:'bachillerato:ciencias',name:'Bachillerato en Ciencias'}],onSelect(){}}));
assert(optionMarkup.includes('Opciones detectadas en el contenido'));assert(optionMarkup.includes('Detectar opciones con IA'));
console.log('PASS admin category routes, scoped simulator lists and automatic document option suggestions.');
for(const key of ['__trainingFixture','__trainingQuery','__trainingNavigations','__trainingButtons'])delete globalThis[key];

// Mount the actual reader so continuation, saved activity IDs and escaped
// document content are verified through its interactive controls.
const {window}=parseHTML('<html><body><div id="course-reader-root"></div></body></html>');
Object.assign(globalThis,{window,document:window.document,HTMLElement:window.HTMLElement,Element:window.Element,Node:window.Node,Event:window.Event,IS_REACT_ACT_ENVIRONMENT:true});
const {createRoot}=await import('react-dom/client');
const root=createRoot(document.getElementById('course-reader-root'));
const hostile='<img src=x onerror="window.documentAttack=true"><script>window.documentAttack=true</script>\nReflexiona: 2 < 3 & 5 > 4.';
const published=courseFixture('universidad',{id:'snapshot-course',title:'Programa actualizado'});
const snapshot={...published,version:1,title:'Programa matriculado',activities:[
 {id:'saved-one',title:'Primera lectura',module:'Unidad uno',kind:'text',content:'Lectura inicial',required:true,completion:'read'},
 {id:'saved-two',title:'Reflexión guardada',module:'Unidad dos',kind:'text',content:hostile,required:true,completion:'read'},
 {id:'saved-link',title:'Material externo',module:'Unidad tres',kind:'link',content:'https://example.test/material',required:true,completion:'read'},
 {id:'saved-exam',title:'Evaluación del curso',module:'Unidad cuatro',kind:'simulator',content:'Evaluación',simulatorId:'exam-only',simulatorVersion:1,required:true,completion:'submit'},
]};
let saved={id:'enrollment-snapshot',course_id:published.id,snapshot,completed:['saved-one'],next:snapshot.activities[1],activityModes:{'saved-exam':['exam']}};
let fixture={courses:[published],careers:[],enrollments:[saved],simulators:[{id:'exam-only',version:2,modes:['practice']}]};
const requests=[];let simulatorStarted;
globalThis.__trainingApi=async(path,body)=>{
 requests.push({path,body});
 if(path==='/enroll'){assert.equal(body.courseId,published.id);return saved;}
 if(path==='/activity-response'){
  assert.equal(body.enrollmentId,saved.id);assert(snapshot.activities.some(a=>a.id===body.activityId),'Persist the enrolled activity ID, never the latest published replacement');
  saved={...saved,completed:[...new Set([...saved.completed,body.activityId])]};
  saved.next=snapshot.activities.find(a=>!saved.completed.includes(a.id))||null;
  const response={answers:body.answers,revision:body.revision+1,updatedAt:new Date().toISOString(),submittedAt:body.complete?new Date().toISOString():undefined};
  saved.responses={...saved.responses,[body.activityId]:response};
  return {response,enrollment:saved};
 }
 if(path==='/start')return {id:'course-exam-attempt',mode:body.mode};
 assert.fail('Unexpected course request '+path);
};
function Reader(){
 const [data,setData]=React.useState(fixture);
 const run=async task=>{const result=await task();fixture={...fixture,enrollments:[saved]};setData(fixture);return result;};
 return React.createElement(StudentCoursePrograms,{data,level:'universidad',career:'',busy:false,run,onStartSimulator:attempt=>{simulatorStarted=attempt;}});
}
const button=text=>[...document.querySelectorAll('button')].find(b=>b.textContent===text);
const click=async text=>React.act(async()=>{const target=button(text);assert(target,'Missing course control '+text);assert(!target.disabled,'Course control disabled: '+text);target.click();});
try{
 await React.act(async()=>root.render(React.createElement(Reader)));
 assert(document.body.textContent.includes('1 de 4 actividades completadas'),'The course card uses the enrolled snapshot, not the one-activity new version');
 await click('Continuar curso');
 assert.equal(requests[0].path,'/enroll');assert(document.body.textContent.includes('Programa matriculado'));
 assert.equal(document.querySelector('h3').textContent,'Reflexión guardada','Continuation opens the next unfinished saved activity');
 assert.equal(document.querySelector('.training-lesson').textContent,hostile,'The complete source is displayed as plain text');
 assert.equal(document.querySelector('.training-lesson img,.training-lesson script'),null,'Document markup must never execute as HTML');
 assert.equal(window.documentAttack,undefined);
 assert(!document.body.textContent.includes('Contenido de la nueva versión'));
 assert(document.querySelector('textarea'),'Reading activities expose a response field');
 await click('Guardar y completar actividad');
 assert.deepEqual(requests.at(-1),{path:'/activity-response',body:{enrollmentId:'enrollment-snapshot',activityId:'saved-two',answers:{},revision:0,complete:true}});
 assert(document.body.textContent.includes('2 de 4 actividades completadas'));assert(document.body.textContent.includes('Tu progreso está guardado'));
 assert.equal(document.querySelector('progress').getAttribute('value'),'2');assert.equal(document.querySelector('progress').getAttribute('max'),'4');
 await click('Siguiente actividad');
 const link=document.querySelector('a');assert.equal(link.getAttribute('href'),'https://example.test/material');assert.equal(link.getAttribute('rel'),'noopener noreferrer');
 await click('Siguiente actividad');
 assert.equal(button('Siguiente actividad').disabled,true,'The final activity has no next action');
 assert(!button('Guardar y completar actividad'),'Simulator activities cannot be completed as readings');
 await click('Iniciar examen de la actividad');
 assert.deepEqual(requests.at(-1),{path:'/start',body:{enrollmentId:'enrollment-snapshot',activityId:'saved-exam',mode:'exam'}},'A historical exam-only simulator uses the enrolled version modes, not its newer practice-only publication');
 assert.equal(simulatorStarted.id,'course-exam-attempt');
 await click('Volver a mis cursos');await click('Continuar curso');
 assert.equal(document.querySelector('h3').textContent,'Material externo','Reopening continues from the persisted next incomplete activity');
 saved={...saved,next:snapshot.activities[3],activityModes:{'saved-exam':[]}};
 fixture={...fixture,enrollments:[saved]};
 await React.act(async()=>root.render(React.createElement(Reader,{key:'unavailable-simulator'})));
 await click('Continuar curso');
 assert(document.body.textContent.includes('El simulador de esta actividad no está disponible'));
 assert.equal(button('Iniciar práctica de la actividad').disabled,true,'An unavailable historical simulator must not guess a mode from another version');
 console.log('PASS course reader DOM: snapshot continuation/progress, original activity IDs, full escaped source, external link safety, navigation and exam-only course simulator.');
}finally{
 await React.act(async()=>root.unmount());
 delete globalThis.__trainingApi;delete globalThis.__trainingButtons;
}
