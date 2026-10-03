import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {mkdirSync,mkdtempSync} from 'node:fs';
import {resolve} from 'node:path';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
mkdirSync('.qa-tools',{recursive:true});
const folder=mkdtempSync(resolve('.qa-tools','training-ui-')),outfile=resolve(folder,'ui.cjs'),primitives=resolve('components/kit/components/ui/primitives.tsx').replaceAll('\\','/');
await build({stdin:{contents:`export {StudentCourses} from './components/kit/features/training/StudentCourses';export {AdminCourses} from './components/kit/features/training/AdminCourses';export {StudyOptionSuggestions} from './components/kit/features/admin/StudyOptionSuggestions';`,resolveDir:process.cwd(),loader:'tsx'},jsx:'automatic',bundle:true,platform:'node',packages:'external',format:'cjs',outfile,loader:{'.css':'empty'},plugins:[{name:'fixtures',setup(b){
 b.onResolve({filter:/\/lib\/session$/},()=>({path:'session',namespace:'fixture'}));
 b.onResolve({filter:/\/components\/ui\/primitives$/},()=>({path:'primitives',namespace:'fixture'}));
 b.onResolve({filter:/^next\/navigation$/},()=>({path:'navigation',namespace:'fixture'}));
 b.onResolve({filter:/^\.\/shared$/},()=>({path:'training',namespace:'fixture'}));
 b.onResolve({filter:/^\.\/SimulatorRun$/},()=>({path:'simulator',namespace:'fixture'}));
 b.onLoad({filter:/.*/,namespace:'fixture'},args=>({resolveDir:process.cwd(),contents:args.path==='primitives'?`import React from 'react';import {Button as ActualButton} from '${primitives}';export * from '${primitives}';export function Button(props){(globalThis.__trainingButtons||=[]).push(props);return React.createElement(ActualButton,props)}`:args.path==='navigation'?`export const useSearchParams=()=>new URLSearchParams(globalThis.__trainingQuery||'');export const useRouter=()=>({push(url){globalThis.__trainingNavigations.push(url)}});`:args.path==='session'?`export const previewAction=async()=>({careers:[]});export const useSession=()=>({values:{'rv360:profile':globalThis.__trainingProfile}});`:args.path==='training'?`export const useTraining=()=>({data:globalThis.__trainingFixture,error:'',busy:false,refresh(){},run(){}});export function TrainingError(){return null;}export async function trainingApi(){};export const decimal=String;export function ChoiceList(){return null;}`:`export function SimulatorRun(){return null;}export function TrainingResult(){return null;}`}));
}}]});
const {StudentCourses,AdminCourses,StudyOptionSuggestions}=createRequire(import.meta.url)(outfile);
const readiness=ready=>({ready,total:3,completed:ready?3:1,pending:ready?[]:[{id:'pending',title:'Test pendiente QA',state:'awaiting_results'}]});
try{
 for(const level of ['bachillerato','universidad']){
  globalThis.__trainingQuery='';globalThis.__trainingNavigations=[];globalThis.__trainingButtons=[];
  globalThis.__trainingProfile={stage:level==='bachillerato'?'Estoy en 10.º de EGB y pasaré a 1.º de BGU':'Me gradué del colegio'};
  globalThis.__trainingFixture={careers:[{id:'bachillerato:ciencias',name:'Opción escolar QA',area:'Ciencias',educationLevel:'bachillerato'},{id:'uni-qa',name:'Opción universitaria QA',area:'Tecnología',educationLevel:'universidad'}],recommendations:[{careerId:'bachillerato:ciencias',reason:'Evidencia QA'},{careerId:'uni-qa',reason:'Evidencia QA'}],attempts:[],simulators:[],readiness:{bachillerato:readiness(false),universidad:readiness(false)}};
  const locked=renderToStaticMarkup(React.createElement(StudentCourses));
  assert(locked.includes('Completa tus tests para acceder a los cursos'));assert(locked.includes('Test pendiente QA'));assert(locked.includes('/mi-ruta/evaluaciones'));
  assert(!locked.includes('Opción escolar QA')&&!locked.includes('Opción universitaria QA'),'Stale recommendations must not leak through a locked screen');
  assert(!locked.includes('Autopreparación'));
  globalThis.__trainingFixture.readiness[level]=readiness(true);
  const ready=renderToStaticMarkup(React.createElement(StudentCourses));
  assert(ready.includes(level==='bachillerato'?'Opción escolar QA':'Opción universitaria QA'));assert(ready.includes('Autopreparación'));
  assert(!ready.includes(level==='bachillerato'?'Opción universitaria QA':'Opción escolar QA'),'Unlocked route must still hide opposite-route courses');
  assert(!locked.includes('aria-label="Nivel de preparación"')&&!ready.includes('aria-label="Nivel de preparación"'),'Students cannot switch to a route inconsistent with their registered stage');
 }
 globalThis.__trainingProfile={stage:'Estoy en 10.º de EGB y pasaré a 1.º de BGU'};
 globalThis.__trainingFixture={careers:[{id:'bachillerato:ciencias-exactas',name:'Ciencias exactas y tecnología',area:'Ciencias',educationLevel:'bachillerato'},{id:'uni-qa',name:'Universidad ajena QA',area:'Tecnología',educationLevel:'universidad'}],recommendations:[{careerId:'bachillerato:ciencias-exactas',reason:'Investigación y aplicación de tus resultados'},{careerId:'uni-qa',reason:'Universidad QA'}],attempts:[],readiness:{bachillerato:readiness(true),universidad:readiness(false)},simulators:[
  {id:'general',title:'Preparación general de Ciencias QA',careerIds:['bachillerato:ciencias'],version:1,modes:['practice'],durationMinutes:20,maxAttempts:3,questionCount:4},
  {id:'specific',title:'Preparación exactas QA',careerIds:['bachillerato:ciencias-exactas'],version:1,modes:['practice'],durationMinutes:20,maxAttempts:3,questionCount:4},
  {id:'unrelated',title:'Otra especialidad QA',careerIds:['bachillerato:ciencias-naturales'],version:1,modes:['practice'],durationMinutes:20,maxAttempts:3,questionCount:4},
  {id:'university',title:'Simulador universidad ajena QA',careerIds:['uni-qa'],version:1,modes:['practice'],durationMinutes:20,maxAttempts:3,questionCount:4},
 ].map(simulator=>({...simulator,instrument:{id:simulator.id,title:simulator.title,description:'Preparación QA',options:[],questions:[]}}))};
 globalThis.__trainingQuery='carrera=bachillerato%3Aciencias-exactas';
 const specialty=renderToStaticMarkup(React.createElement(StudentCourses));
 assert(specialty.includes('Autopreparación para Ciencias exactas y tecnología'));
 assert(specialty.includes('Preparación general de Ciencias QA')&&specialty.includes('Preparación exactas QA'));
 assert(!specialty.includes('Otra especialidad QA')&&!specialty.includes('Simulador universidad ajena QA'));
 assert(specialty.includes('Investigación y aplicación de tus resultados'));
 assert(specialty.includes('href="/mi-ruta/resultados"'));
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
 assert(markup.includes('Simulador '+level));assert(!markup.includes('Simulador '+(level==='bachillerato'?'universidad':'bachillerato')));
 const other=level==='bachillerato'?'Universidad':'Bachillerato';globalThis.__trainingButtons.find(b=>b.children===other).onClick();assert.equal(globalThis.__trainingNavigations.at(-1),'/admin/cursos?nivel='+other.toLowerCase());
}
const optionMarkup=renderToStaticMarkup(React.createElement(StudyOptionSuggestions,{test:{id:'qa',educationLevel:'bachillerato',title:'Bachillerato en Ciencias',description:'Documento de ciencias',options:[],questions:[]},careers:[{id:'bachillerato:ciencias',name:'Bachillerato en Ciencias'}],onSelect(){}}));
assert(optionMarkup.includes('Opciones detectadas en el contenido'));assert(optionMarkup.includes('Detectar opciones con IA'));
console.log('PASS admin category routes, scoped simulator lists and automatic document option suggestions.');
for(const key of ['__trainingFixture','__trainingQuery','__trainingNavigations','__trainingButtons'])delete globalThis[key];
