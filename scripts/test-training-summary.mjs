import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {mkdirSync,mkdtempSync} from 'node:fs';
import {resolve} from 'node:path';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {parseHTML} from 'linkedom';

mkdirSync('.qa-tools',{recursive:true});
const outfile=resolve(mkdtempSync(resolve('.qa-tools','training-summary-')),'summary.cjs');
await build({stdin:{contents:`export {TrainingSummary} from './components/kit/features/training/TrainingSummary';export * from './components/kit/features/training/training-summary-model';`,resolveDir:process.cwd(),loader:'tsx'},jsx:'automatic',bundle:true,platform:'node',packages:'external',format:'cjs',outfile,loader:{'.css':'empty'},plugins:[{name:'summary-fixtures',setup(b){
  b.onResolve({filter:/\/lib\/session$/},()=>({path:'session',namespace:'fixture'}));
  b.onResolve({filter:/^\.\/shared$/},()=>({path:'training',namespace:'fixture'}));
  b.onLoad({filter:/.*/,namespace:'fixture'},args=>({resolveDir:process.cwd(),contents:args.path==='session'?`export const useSession=()=>({values:{'rv360:profile':globalThis.__summaryProfile}});`:`import React from 'react';export const useTraining=()=>({data:globalThis.__summaryData,error:globalThis.__summaryError||'',refresh(){}});export const TrainingError=({error})=>error?React.createElement('div',{role:'alert'},error):null;`}));
}}]});
const {TrainingSummary,trainingSummaryModel,courseActivityHref,courseMaterials}=createRequire(import.meta.url)(outfile);
const activity=(id,overrides={})=>({id,title:'Actividad '+id,module:'Unidad 1',kind:'text',content:'Contenido',required:true,completion:'read',...overrides});
const course=(id,educationLevel,overrides={})=>({id,title:'Curso '+id,educationLevel,description:'Descripción '+id,status:'published',version:1,type:'general',careerIds:[],fields:[],activities:[activity('uno'),activity('dos')],...overrides});
const media=(id,mimeType)=>({id,mimeType,name:id,size:1024});
const render=()=>parseHTML('<html><body>'+renderToStaticMarkup(React.createElement(TrainingSummary))+'</body></html>').document.body;
const base={readiness:{universidad:{ready:true,total:3,completed:3},bachillerato:{ready:true,total:3,completed:3}},courses:[],enrollments:[],simulators:[],recommendations:[],attempts:[],careers:[]};
try {
  globalThis.__summaryProfile={stage:'Me gradué del colegio'};
  globalThis.__summaryData=null;
  assert.match(render().textContent,/Cargando tus cursos y avances/);
  globalThis.__summaryError='La conexión se interrumpió';
  assert.equal(render().querySelector('[role="alert"]').textContent,'La conexión se interrumpió');
  globalThis.__summaryError='';

  const initial=course('curso & importante','universidad');
  const next=activity('reflexión / guardada',{title:'Mi reflexión pendiente',attachments:[media('video','video/mp4'),media('imagen','image/png'),media('audio','audio/mpeg'),media('pdf','application/pdf')]});
  const snapshot={...initial,title:'Mi curso matriculado',activities:[activity('primera'),next,activity('extra',{required:false,kind:'link',content:'https://example.test'}),activity('imagen extra',{required:false,attachments:[media('imagen','image/png')]})]};
  const enrollment={id:'enrolled',course_id:initial.id,snapshot,completed:['primera','id-histórico-inexistente'],next,responses:{[next.id]:{answers:{reflection:'Mi respuesta personal'},revision:1}}};
  globalThis.__summaryData={...base,courses:[{...initial,title:'Título versión nueva',version:2,activities:[activity('nueva')]},course('otro nivel','bachillerato')],enrollments:[enrollment]};
  let model=trainingSummaryModel(globalThis.__summaryData,'universidad');
  assert.equal(model.completed,1,'Only saved activity IDs still in the enrolled snapshot count');
  assert.equal(model.pending,3,'Optional activities remain available after required work');
  assert.equal(model.courses[0].next.id,next.id);
  assert.equal(model.courses[0].hasDraft,true);
  assert.equal(model.courses[0].href,courseActivityHref(initial.id,next.id));
  assert.deepEqual(courseMaterials(snapshot.activities).map(({key,count})=>[key,count]),[['video',1],['image',1],['audio',1],['document',1],['link',1]],'Repeated attachment references are counted once');
  let document=render();
  assert(document.textContent.includes('Mi curso matriculado'));
  assert(!document.textContent.includes('Título versión nueva')&&!document.textContent.includes('otro nivel'));
  assert(document.textContent.includes('Respuesta guardada')&&document.textContent.includes('Mi reflexión pendiente'));
  assert(!document.textContent.includes('Mi respuesta personal'),'The dashboard never displays private answer text');
  assert.equal(document.querySelector('progress').getAttribute('value'),'1');
  assert.equal(document.querySelector('progress').getAttribute('max'),'4');
  const continueLink=document.querySelector('a[aria-label^="Continuar actividad"]');
  assert.equal(continueLink.getAttribute('href'),'/mi-ruta/cursos?curso=curso%20%26%20importante&actividad=reflexi%C3%B3n%20%2F%20guardada');
  assert(document.textContent.includes('1 video')&&document.textContent.includes('1 imagen')&&document.textContent.includes('1 documento'));

  globalThis.__summaryData={...globalThis.__summaryData,readiness:{...base.readiness,universidad:{ready:false,total:3,completed:1}}};
  document=render();
  assert(document.textContent.includes('1 de 3 tests completos'));
  assert(!document.textContent.includes('Mi curso matriculado')&&!document.querySelector('progress'),'The same route readiness gate applies to cached course data');
  assert(document.querySelector('a[href="/mi-ruta/evaluaciones"]'));

  const archived=course('archivado','universidad',{status:'archived',title:'Curso histórico accesible'});
  const foreignSnapshot=course('curso antes escolar','bachillerato');
  globalThis.__summaryData={...base,courses:[{...initial,educationLevel:'bachillerato'},{...foreignSnapshot,educationLevel:'universidad'}],enrollments:[enrollment,{id:'archived-enrollment',course_id:archived.id,snapshot:archived,completed:['uno'],next:archived.activities[1]},{id:'foreign-enrollment',course_id:foreignSnapshot.id,snapshot:foreignSnapshot},{id:'direct-enrollment',course_id:'direct:internal',snapshot:course('direct:internal','universidad')}]};
  model=trainingSummaryModel(globalThis.__summaryData,'universidad');
  assert.deepEqual(model.courses.map(item=>item.course.id),[initial.id,archived.id],'Historical enrollments survive archival and use their original education level');
  assert.equal(model.completed,2);
  document=render();
  assert(document.textContent.includes('Curso histórico accesible')&&document.textContent.includes('Mi curso matriculado'));
  assert(!document.textContent.includes('curso antes escolar')&&!document.textContent.includes('direct:internal'));
  assert.equal(document.querySelector('a[aria-label="Continuar actividad: Actividad dos"]').getAttribute('href'),'/mi-ruta/cursos?curso=archivado&actividad=dos');
  assert.equal(trainingSummaryModel({...globalThis.__summaryData,readiness:{universidad:{ready:false}}},'universidad').courses.length,0,'Historical enrollments also respect readiness');

  const completedCourse=course('completado','universidad');
  const completedEnrollment={id:'done',course_id:'completado',snapshot:completedCourse,completed:['uno','dos'],next:null};
  globalThis.__summaryData={...base,courses:[completedCourse,course('nuevo','universidad'),initial,course('cuarto','universidad')],enrollments:[completedEnrollment,enrollment]};
  model=trainingSummaryModel(globalThis.__summaryData,'universidad');
  assert.deepEqual(model.courses.map(item=>item.course.id),[initial.id,'nuevo','cuarto','completado'],'Unfinished enrolled courses appear before new or completed courses');
  document=render();
  assert.equal(document.querySelectorAll('.learning-summary-course').length,3,'The dashboard keeps the course list concise');
  assert(document.textContent.includes('Mostrando 3 de 4 cursos'));
  globalThis.__summaryData={...base,courses:[completedCourse],enrollments:[completedEnrollment]};
  document=render();
  assert(document.querySelector('a[aria-label="Revisar curso: Curso completado"]'));
  assert(!document.querySelector('a[aria-label^="Continuar actividad"]'));

  globalThis.__summaryProfile={stage:'Estoy en 10.º de EGB y pasaré a 1.º de BGU'};
  const specialty='bachillerato:ciencias-exactas';
  const simulator={id:'general',educationLevel:'bachillerato',careerIds:['bachillerato:ciencias'],title:'Práctica general'};
  globalThis.__summaryData={...base,courses:[course('escolar','bachillerato'),initial],simulators:[simulator],recommendations:[{careerId:specialty}],careers:[{id:specialty}],enrollments:[{id:'course-sim',course_id:'escolar',snapshot:course('escolar','bachillerato')},{id:'direct-sim',course_id:'direct:general'}],attempts:[{id:'course-attempt',enrollment_id:'course-sim',state:'graded',simulator}]};
  model=trainingSummaryModel(globalThis.__summaryData,'bachillerato');
  assert.equal(model.simulators.length,1,'General school preparation matches the exact recommended specialty');
  assert.equal(model.simulatorCompleted,0,'Course attempts do not complete direct practice');
  globalThis.__summaryData.attempts.push({id:'recoverable',enrollment_id:'direct-sim',state:'recoverable',simulator});
  model=trainingSummaryModel(globalThis.__summaryData,'bachillerato');
  assert.equal(model.active.id,'recoverable');
  document=render();
  assert(document.textContent.includes('Curso escolar')&&!document.textContent.includes(initial.title));
  assert(document.textContent.includes('Tienes una práctica por continuar'));
  assert(document.querySelector('a[href="/mi-ruta/cursos?carrera=bachillerato%3Aciencias-exactas"]'));

  globalThis.__summaryData={...base};
  assert(render().textContent.includes('Tus próximos cursos aparecerán aquí'));
  console.log('PASS training dashboard: readiness and education route, enrolled snapshots, exact continuation links, saved drafts, real materials, bounded cards and independent simulator progress.');
} finally {
  delete globalThis.__summaryData;delete globalThis.__summaryProfile;delete globalThis.__summaryError;
}
