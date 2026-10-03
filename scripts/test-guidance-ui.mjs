import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {mkdirSync,mkdtempSync,readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';

mkdirSync('.qa-tools',{recursive:true});
const folder=mkdtempSync(resolve('.qa-tools','guidance-ui-'));
await build({stdin:{contents:`export {BaccalaureateResult} from './components/kit/features/student/BaccalaureateResult';export {BaccalaureateFields} from './components/kit/components/domain/BaccalaureateFields';export {schoolGuidance} from './components/kit/lib/school-guidance';export {technicalOptions} from './components/kit/data/baccalaureate';export {TestResult} from './components/kit/features/student/TestResult';export {GuidanceDocument,ResultScores,ResultAnswers} from './components/kit/features/student/ResultsDocument';export {CompactTests} from './components/kit/features/student/CompactDashboard';export {SchoolRouteStart} from './components/kit/features/student/SchoolRouteStart';export {reportEducationLevel,reportNextSteps} from './components/kit/features/student/report-route';`,resolveDir:process.cwd(),loader:'tsx'},jsx:'automatic',bundle:true,platform:'node',packages:'external',format:'cjs',outfile:resolve(folder,'ui.cjs'),loader:{'.css':'empty'},plugins:[{name:'fixture-session',setup(build){
 build.onResolve({filter:/\/lib\/session$/},()=>({path:'session',namespace:'fixture'}));
 build.onResolve({filter:/\/lib\/professional-report$/},()=>({path:'pdf',namespace:'fixture'}));
 build.onResolve({filter:/\/ui\/PdfViewer$/},()=>({path:'viewer',namespace:'fixture'}));
 build.onResolve({filter:/\/training\/shared$/},()=>({path:'training',namespace:'fixture'}));
 build.onResolve({filter:/\/training\/TrainingSummary$/},()=>({path:'summary',namespace:'fixture'}));
 build.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:args.path==='session'?`export function useSession(){return {user:{role:globalThis.__guidanceTestRole},values:globalThis.__guidanceTestValues||{}}}export async function previewAction(){return {items:[]}};export async function refreshSession(){}`:args.path==='pdf'?`export async function professionalReport(){return {output(){return new Blob()}}}`:args.path==='viewer'?`export function PdfViewer(){return null}`:args.path==='training'?`export async function trainingApi(){}`:`export function TrainingSummary(){return null}`}));
}}]});
const {BaccalaureateResult,BaccalaureateFields,schoolGuidance,GuidanceDocument,ResultScores,ResultAnswers,CompactTests,SchoolRouteStart,reportEducationLevel,reportNextSteps,technicalOptions,TestResult}=createRequire(import.meta.url)(resolve(folder,'ui.cjs'));
const schoolProfile={stage:'Estoy en 10.º de EGB y pasaré a 1.º de BGU',baccalaureate:'tecnico',specialty:'Informática',learningPreference:'aplicar'};
const pathway=schoolGuidance(['R','I','A','S','E','C'].map(d=>({dimension:d,raw:d==='R'?25:d==='I'?20:10})),[],schoolProfile,[{id:'software',name:'Ingeniería de Software',areaId:'tecnologia'}]);
const render=(Component,props={})=>renderToStaticMarkup(React.createElement(Component,props));
try{
 globalThis.__guidanceTestRole='student';
 globalThis.__guidanceTestValues={'rv360:profile':schoolProfile};
 const ready={ready:true,total:3,completed:3,pending:[]};
 const html=render(BaccalaureateResult,{pathway,readiness:ready});
 for(const label of ['Modalidad recomendada: Bachillerato Técnico','Bachillerato en Ciencias','Informática','Recomendaciones para avanzar','/mi-ruta/perfil'])assert(html.includes(label),label);
 assert(!/universidad|universitari/i.test(html),'School guidance must not render university bridges, programs or careers');
 assert(!html.includes('NaN'));
 assert(html.includes('Modalidad recomendada: Bachillerato Técnico'));
 const renderPath=(p,readiness=ready)=>render(BaccalaureateResult,{pathway:p,readiness});
 assert(renderPath({...pathway,suggested:'ciencias'}).includes('Modalidad recomendada: Bachillerato en Ciencias'));
 assert(renderPath({...pathway,suggested:'ambas'}).includes('Afinidad con ambas modalidades'));
 const pending=renderPath(pathway,{ready:false,total:3,completed:1,pending:[{id:'a',title:'Intereses pendientes',state:'not_started'},{id:'b',title:'Resultados por publicar',state:'awaiting_results'}]});
 for(const label of ['Resultado pendiente: Técnico o Ciencias','1 de 3','Intereses pendientes','Pendiente de publicación','Continuar mis tests'])assert(pending.includes(label),label);
 assert(!pending.includes('Modalidad recomendada:'));
 assert(pending.includes('34 figuras en 11 familias'),'The full official catalog is available separately from recommendations');
 assert(pending.includes('Bachillerato Complementario en Artes'));
 assert(!pending.includes('/mi-ruta/cursos?carrera='),'Incomplete tests must not link to personalized preparation');
 const preparationHref=id=>'/mi-ruta/cursos?carrera='+encodeURIComponent(id);
 for(const option of [...pathway.science,...pathway.technical]){
  const href=preparationHref('bachillerato:'+option.id);
  assert(html.includes('<a class="bp-option-title" href="'+href+'">'+option.name+'</a>'),option.name+' title opens its preparation');
  assert.equal(html.split('href="'+href+'"').length-1,2,option.name+' title and CTA share the same preparation target');
 }
 assert(html.indexOf('aria-label="Bachillerato Técnico"')<html.indexOf('aria-label="Bachillerato en Ciencias"'),'Recommended technical modality appears first');
 assert(html.includes(preparationHref('bachillerato:tecnico')));
 const open=renderPath({...pathway,suggested:'ambas',science:[],technical:[]});
 assert(!/Sin áreas priorizadas|Completa tus intereses/.test(open),'Complete open profiles do not ask students to repeat completed tests');
 assert(open.includes('Tus respuestas no dan prioridad'));
 assert(open.includes(preparationHref('bachillerato:ciencias'))&&open.includes(preparationHref('bachillerato:tecnico')),'Open complete profiles may prepare general modalities');
 const review=renderPath({...pathway,suggested:'pendiente',science:[],technical:[]});
 assert(review.includes('Tests completos: orientación por revisar'));
 assert(!review.includes('Resultado pendiente:')&&!review.includes('Continuar mis tests')&&!review.includes('/mi-ruta/cursos?carrera='),'Unmapped complete tests need review, not false incompletion or preparation unlock');
 for(const figure of technicalOptions)assert(pending.includes(figure.name),figure.name+' missing from the reference catalog');
 globalThis.__guidanceTestRole='admin';
 assert(!render(BaccalaureateResult,{pathway}).includes('/mi-ruta/perfil'));
 const value={province:'',canton:'',parish:'',schoolId:'',institution:'',...schoolProfile};
 const form=render(BaccalaureateFields,{value,onChange:()=>{}});
 assert(form.includes('Especialidad o figura profesional'));assert(form.includes('value="Informática"'));
 assert(!form.includes('<datalist'),'Specialties must use the styled search control');
 assert(form.includes('role="combobox"'),'Specialties must remain keyboard accessible');
 const science=render(BaccalaureateFields,{value:{...value,baccalaureate:'ciencias'},onChange:()=>{}});
 assert(!science.includes('Especialidad o figura profesional'));

 const customSubmission={id:'custom-result-qa',version:'1',created_at:'2026-10-02T12:00:00Z',snapshot:JSON.stringify({id:'custom-test',version:'1',title:'Resultado QA',educationLevel:'bachillerato',questions:[],options:[]}),answers:'{}',resultReleased:true,evaluation:{state:'complete',scores:[],trace:[],coverage:{applicable:0,responded:0},careers:[{id:'school-link',careerId:'bachillerato:tecnico',careerName:'Figura escolar exclusiva QA',reason:'Intereses escolares QA',evidence:10,min:5,max:15},{id:'university-link',careerId:'software',careerName:'Carrera universitaria filtrada QA',reason:'Relación antigua incorrecta QA',evidence:10,min:5,max:15}]}};
 const individual=render(TestResult,{submission:customSubmission});
 assert(individual.includes('Figura escolar exclusiva QA'));assert(!individual.includes('Carrera universitaria filtrada QA'));
 assert(!render(TestResult,{submission:customSubmission,showGuidance:false}).includes('Figura escolar exclusiva QA'),'Detailed score panel honors showGuidance=false');
 const report={id:'report-qa',version:1,createdAt:'2026-10-02T12:00:00Z',student:{id:'qa-student',name:'Estudiante QA'},profile:schoolProfile,educationLevel:'bachillerato',partial:false,instruments:[],readiness:{bachillerato:{ready:true}},analysis:{pathway,summary:'Análisis escolar QA',highlightedDimensions:['R'],recommendations:[{careerId:'software',reason:'Evidencia universitaria que no debe filtrarse',explore:'Programa universitario QA'}],nextSteps:['Explora universidades QA'],limitations:[]},catalog:[{id:'software',name:'Ingeniería universitaria QA'}],offers:{software:[]},catalogSource:{date:'2026-10-02',source:'CES',sourceUrl:'https://appcmi.ces.gob.ec/oferta_vigente/'},ai:{status:'available'}};
 globalThis.__guidanceTestRole='student';
 const schoolDocument=render(GuidanceDocument,{report});
 assert(schoolDocument.includes('Modalidad recomendada: Bachillerato Técnico'));
 assert(schoolDocument.includes('Análisis escolar QA'));
 assert.equal(schoolDocument.split('Análisis escolar QA').length-1,1,'Show the personalized analysis once');
 assert(schoolDocument.includes('Mi orientación'));
 assert(schoolDocument.includes('Descargar PDF'),'PDF is a prominent action');
 assert(!schoolDocument.includes('LO QUE MUESTRAN TUS RESPUESTAS')&&!schoolDocument.includes('Ver mis recomendaciones'),'Remove duplicated profile and recommendation panels');
 assert(!render(GuidanceDocument,{report:{...report,historical:true}}).includes('/mi-ruta/cursos?carrera='),'Historical guidance never opens current personalized preparation');
 const incompleteDocument=render(GuidanceDocument,{report:{...report,partial:true,progress:{submitted:1,total:3},readiness:{bachillerato:{ready:false,total:3,completed:1,pending:[]}}}});
 assert(!incompleteDocument.includes('bp-option-title')&&!incompleteDocument.includes('/mi-ruta/cursos?carrera='),'The partial document does not recommend or link areas');
 assert(schoolDocument.includes('Análisis de tus resultados asistido por IA'));
 assert(!/universidad|universitari/i.test(schoolDocument),'School document must hide university tabs, sources, recommendations, dialogs and bridges even with legacy mixed data');
 assert(schoolDocument.includes('Informe PDF'),'Keep PDF access for the school route');
 assert.deepEqual(reportNextSteps(report),pathway.nextSteps.filter(s=>!/universidad|universitari|educación superior/i.test(s)));
 const failed=render(GuidanceDocument,{report:{...report,ai:{status:'error',error:{message:'Servicio de IA no disponible QA'}}}});
 assert(failed.includes('Análisis con IA pendiente'));assert(failed.includes('Servicio de IA no disponible QA'));
 assert(!failed.includes('Análisis de tus resultados asistido por IA'));
 const university={...report,educationLevel:'universidad',profile:{stage:'Me gradué del colegio'},readiness:{universidad:{ready:true}},analysis:{...report.analysis,pathway:null,summary:'Análisis universitario QA'}};
 globalThis.__guidanceTestValues={'rv360:profile':university.profile};
 const universityDocument=render(GuidanceDocument,{report:university});
 assert(universityDocument.includes('Ingeniería universitaria QA'));assert(universityDocument.includes('Fuente de las universidades recomendadas'));
 assert(universityDocument.includes(preparationHref('software')),'University careers have direct preparation links');
 assert(universityDocument.includes('<a class="rd-career-title" href="'+preparationHref('software')+'">'),'Career titles open their preparation');
 const specialId='ingeniería / software & datos';
 const encodedDocument=render(GuidanceDocument,{report:{...university,analysis:{...university.analysis,recommendations:[{careerId:specialId,reason:'Criterio QA',explore:'Actividad QA'}]},catalog:[{id:specialId,name:'Carrera con identificador complejo QA'}],offers:{}}});
 assert(encodedDocument.includes(preparationHref(specialId)),'Career identifiers in preparation links are safely URL encoded');
 assert(!render(GuidanceDocument,{report:{...university,historical:true}}).includes('/mi-ruta/cursos?carrera='),'Historical university reports have no preparation action');
 globalThis.__guidanceTestValues={'rv360:profile':university.profile};
 assert(!render(GuidanceDocument,{report}).includes('/mi-ruta/cursos?carrera='),'Graduates cannot unlock school preparation from an older school report');
 globalThis.__guidanceTestValues={'rv360:profile':schoolProfile};
 assert(!universityDocument.includes('Bachillerato Técnico'));assert(!universityDocument.includes('Comparar Ciencias y Técnico'));
 assert.equal(reportEducationLevel({...report,educationLevel:undefined},university.profile),'bachillerato','Historical school profile takes precedence over today\'s university stage');
 assert.equal(reportEducationLevel({...university,educationLevel:undefined},schoolProfile),'universidad');
 assert.equal(reportEducationLevel({analysis:{pathway:{profile:{stage:schoolProfile.stage}}}},university.profile),'bachillerato');

 for(const stage of [schoolProfile.stage,'Estudiante de EGB Superior (8.º o 9.º)','Estoy eligiendo mi bachillerato','Estudiante de bachillerato','Me gradué del colegio','Busco mi primera carrera universitaria']){
  const school=/EGB|eligiendo/.test(stage);
  globalThis.__guidanceTestValues={'rv360:profile':{stage},'rv360:battery':{instruments:[{id:'school-only',stableId:'school-only',version:'1',educationLevel:'bachillerato',title:'Test escolar exclusivo QA',description:'Test escolar',questions:[]},{id:'university-only',stableId:'university-only',version:'1',educationLevel:'universidad',title:'Test universitario exclusivo QA',description:'Test universitario',questions:[]}]},'rv360:available-originals':['school-only','university-only']};
  const tests=render(CompactTests);
  assert(tests.includes(school?'Test escolar exclusivo QA':'Test universitario exclusivo QA'),stage);
  assert(!tests.includes(school?'Test universitario exclusivo QA':'Test escolar exclusivo QA'),stage+' opposite-route test leak');
  assert(tests.includes('<strong>1</strong>Tests asignados'),stage+' route-specific counters');
  assert(!tests.includes('aria-label="Ruta de los tests"'),'There is no cross-route selector');
  const start=render(SchoolRouteStart);
  assert(start.includes(school?'¿Qué bachillerato puedo elegir?':'¿Qué carrera universitaria puedo seguir?'),stage);
  if(school)assert(!/universidad|universitari/i.test(start),stage+' school onboarding university leak');
  else assert(!start.includes('Bachillerato en Ciencias')&&!start.includes('Bachillerato Técnico'),stage+' graduate choosing bachillerato leak');
 }
 const typedAnswers=render(ResultAnswers,{item:{instrument:{options:[{value:'a',label:'Opción A'},{value:'b',label:'Opción B'}],questions:[
  {id:'number',text:'Número de proyectos',type:'number'},
  {id:'short',text:'Fortaleza breve',type:'short'},
  {id:'open',text:'Experiencia personal',type:'open'},
  {id:'multiple',text:'Actividades elegidas',type:'multiple'},
  {id:'matrix',text:'Experiencias por área',type:'matrix',rows:[{id:'r1',label:'Taller'},{id:'r2',label:'Laboratorio'}]},
  {id:'ranking',text:'Orden de preferencias',type:'ranking'},
  {id:'gate',text:'Pregunta de control',type:'single',options:[{value:'yes',label:'Sí'},{value:'no',label:'No'}]},
  {id:'hidden',text:'Respuesta de pregunta oculta QA',type:'number',visibleWhen:{questionId:'gate',operator:'equals',value:'yes'}},
  {id:'info',text:'Información sin respuesta QA',type:'info'},
 ]},answers:{number:0,short:'Organizar mi tiempo QA',open:'Construí un proyecto QA',multiple:['a','b'],matrix:{r1:'a',r2:['b','a']},ranking:['b','a'],gate:'no',hidden:99,info:'Texto de información QA'}}});
 for(const answer of ['<dd>0</dd>','Organizar mi tiempo QA','Construí un proyecto QA','Opción A, Opción B','Taller: Opción A; Laboratorio: Opción B, Opción A','<dd>Opción B, Opción A</dd>'])assert(typedAnswers.includes(answer),answer+' is rendered accurately');
 assert(!typedAnswers.includes('Sin respuesta'),'Answered numeric, short, matrix and ranked questions do not appear unanswered');
 assert(!typedAnswers.includes('Respuesta de pregunta oculta QA')&&!typedAnswers.includes('Información sin respuesta QA'),'Only applicable response questions are shown');
 const reviewedScores=render(ResultScores,{item:{instrumentId:'intereses',instrument:{aggregation:'sum'},scores:[{dimension:'I',raw:25,displayRaw:5,value:5,min:5,max:25,answered:5}]}});
 assert(reviewedScores.includes('<strong>5<small> / 25</small>'),'Approved review score replaces stale historical raw in visible scores');
 assert(reviewedScores.includes('value="5"'),'Interest meter uses the approved review score');
 assert(reviewedScores.includes('Promedio: 1 / 5'),'The displayed mean follows the approved score');
 const customScores=render(ResultScores,{item:{instrumentId:'custom-weighted',instrument:{aggregation:'mean'},scores:[{dimension:'criterio',raw:60,value:3,min:1,max:5}]}});
 assert(customScores.includes('min="1" max="5" value="3"'),'Custom score meters respect the configured weighted mean bounds');
 const styles=readFileSync('components/kit/features/student/results-document.css','utf8')+readFileSync('components/kit/features/student/baccalaureate-result.css','utf8');
 assert(styles.includes('min-height:44px'),'Preparation, tabs and disclosures meet touch target minimum');
 assert(styles.includes('@media(max-width:640px)')&&styles.includes('.bp-option-grid{grid-template-columns:1fr}')&&styles.includes('.rd-career-grid{grid-template-columns:1fr}'),'School options and university careers become one column on mobile');
 assert(!styles.includes('.rd-career button{'),'Career buttons preserve their visible button styling');
 console.log('PASS rendered guidance UI: each educational stage has only its own tests, results, recommendations and preparation; school histories remain scoped; AI errors are visible.');
}finally{delete globalThis.__guidanceTestRole;delete globalThis.__guidanceTestValues;}
