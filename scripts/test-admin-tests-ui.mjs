import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {mkdirSync,mkdtempSync,readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
mkdirSync('.qa-tools',{recursive:true});
const folder=mkdtempSync(resolve('.qa-tools','admin-tests-ui-')),primitives=resolve('components/kit/components/ui/primitives.tsx').replaceAll('\\','/');
await build({stdin:{contents:`export {IntegralReports} from './components/kit/features/student/IntegralReports';export {TestManager} from './components/kit/features/admin/TestManager';export {AudienceSettings} from './components/kit/features/admin/UniversalSettings';export * from './components/kit/features/admin/test-manager-level';`,resolveDir:process.cwd(),loader:'tsx'},jsx:'automatic',bundle:true,platform:'node',packages:'external',format:'cjs',outfile:resolve(folder,'ui.cjs'),loader:{'.css':'empty'},plugins:[{name:'admin-fixtures',setup(b){
 b.onResolve({filter:/^react$/},args=>args.importer.endsWith('TestManager.tsx')?{path:'manager-react',namespace:'fixture'}:undefined);
 b.onResolve({filter:/^react\/jsx-runtime$/},args=>args.importer.endsWith('TestManager.tsx')?{path:'manager-jsx',namespace:'fixture'}:undefined);
 b.onResolve({filter:/^next\/navigation$/},()=>({path:'navigation',namespace:'fixture'}));
 b.onResolve({filter:/\/lib\/reports$/},()=>({path:'reports',namespace:'fixture'}));
 b.onResolve({filter:/\/lib\/session$/},()=>({path:'session',namespace:'fixture'}));
 b.onResolve({filter:/\/lib\/storage$/},()=>({path:'storage',namespace:'fixture'}));
 b.onResolve({filter:/\/lib\/useUsers$/},()=>({path:'users',namespace:'fixture'}));
 b.onResolve({filter:/\/components\/ui\/primitives$/},()=>({path:'primitives',namespace:'fixture'}));
 b.onResolve({filter:/^\.\/TestPreview$/},()=>({path:'preview',namespace:'fixture'}));
 b.onLoad({filter:/.*/,namespace:'fixture'},args=>({resolveDir:process.cwd(),contents:{
  'manager-react':`import * as React from 'react';export const useEffect=React.useEffect,useRef=React.useRef;export function useState(initial){const [value,set]=React.useState(initial);return [value,next=>{if(next&&typeof next==='object'&&Array.isArray(next.questions))globalThis.__adminEdited.push(next);if(Array.isArray(next)&&next.every(item=>Array.isArray(item?.questions)))globalThis.__adminProposals.push(next);set(next)}]}`,
  'manager-jsx':`import {jsx as actualJsx,jsxs as actualJsxs,Fragment} from 'react/jsx-runtime';export {Fragment};function capture(type,props){if(type==='input'&&props.type==='file')globalThis.__adminFileInput=props;}export function jsx(type,props,key){capture(type,props);return actualJsx(type,props,key)}export function jsxs(type,props,key){capture(type,props);return actualJsxs(type,props,key)}`,
  navigation:`export function useSearchParams(){return new URLSearchParams(globalThis.__adminQuery)}export function useRouter(){return {push(url){globalThis.__adminNavigations.push(url)},replace(url){globalThis.__adminNavigations.push(url)}}}`,
  session:`export function useSession(){return {user:{role:globalThis.__adminRole||'admin'},values:globalThis.__adminValues}}export function getSession(){return {values:{...globalThis.__adminValues,'rv360:custom-tests':globalThis.__adminCustom}}}export async function refreshSession(){}export async function flush(){}export async function saveValue(key,value){globalThis.__adminSavedValues.push({key,value})}export async function previewAction(){return {careers:[]}}`,
  storage:`export function useLocalState(){return [globalThis.__adminCustom,async update=>{globalThis.__adminCustom=typeof update==='function'?update(globalThis.__adminCustom):update;globalThis.__adminCustomSnapshots.push(structuredClone(globalThis.__adminCustom))}]}`,
  users:`export function useUsers(){return [globalThis.__adminUsers]}`,
  primitives:`import React from 'react';import {Button as ActualButton} from '${primitives}';export * from '${primitives}';export function Button(props){globalThis.__adminButtons.push(props);return React.createElement(ActualButton,props)}`,
  reports:`export function downloadIntegralReport(){}`,
  preview:`export function TestPreview(){return null}`,
 }[args.path]}));
}}]});
const {IntegralReports,TestManager,AudienceSettings,adminTestLevel,exactTestLevel,testManagerHref,nextTestVersion,testsImportedForLevel,testImportForm}=createRequire(import.meta.url)(resolve(folder,'ui.cjs'));
const text=value=>typeof value==='string'||typeof value==='number'?String(value):Array.isArray(value)?value.map(text).join(''):React.isValidElement(value)?text(value.props.children):'';
const instrument=(id,educationLevel,status='Borrador',patch={})=>({id,educationLevel,status,schemaVersion:2,aggregation:'sum',version:'1',stableId:'shared-family',title:id,description:'Instrumento QA',questions:[],options:[],scoring:'manual',group:'Todos los estudiantes',due:'',...patch});
const originalFetch=globalThis.fetch,originalWindow=globalThis.window;
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
async function waitFor(predicate){for(let i=0;i<15&&!predicate();i++)await tick();assert(predicate(),'Async UI action did not finish');}
function initialize(level){
 globalThis.__adminQuery='nivel='+level;globalThis.__adminEdited=[];globalThis.__adminProposals=[];globalThis.__adminButtons=[];globalThis.__adminNavigations=[];globalThis.__adminSavedValues=[];globalThis.__adminCustomSnapshots=[];
 globalThis.__adminUsers=[{id:'school-user',name:'Estudiante EGB QA',role:'Estudiante',stage:'Estoy en 10.º de EGB y pasaré a 1.º de BGU'},{id:'uni-user',name:'Estudiante graduado QA',role:'Estudiante',stage:'Me gradué del colegio'}];
 globalThis.__adminCustom=[instrument('Escolar exclusivo QA','bachillerato','Borrador',{version:'2'}),instrument('Universitario exclusivo QA','universidad','Borrador',{version:'8'}),instrument('Publicado escolar QA','bachillerato','Publicado',{version:'1'}),instrument('Publicado universitario QA','universidad','Publicado',{version:'7'}),instrument('Test antiguo compartido QA','ambos','Publicado',{studentIds:['school-user','uni-user'],audience:'selected',careerLinks:[{id:'school-link',careerId:'bachillerato:ciencias',dimensionId:'General',min:0,max:10,reason:'Criterio escolar QA',source:'Ministerio'},{id:'uni-link',careerId:'uni-career',dimensionId:'General',min:0,max:10,reason:'Criterio universitario QA',source:'CES'}]})];
 globalThis.__adminValues={'rv360:imports':[{id:'school-import',name:'Importación escolar QA',educationLevel:'bachillerato',status:'Error'},{id:'uni-import',name:'Importación universitaria QA',educationLevel:'universidad',status:'Error'},{id:'legacy-import',name:'Importación antigua QA',status:'Completado'}]};
 globalThis.window={scrollTo(){}};
 globalThis.__adminNetwork=[];
 globalThis.fetch=async(url,options={})=>{globalThis.__adminNetwork.push({url,options});return new Response(JSON.stringify(options.method==='POST'?{id:'uploaded-job'}:{educationLevel:level,status:'Completado',text:'Documento QA',warnings:[],tests:[instrument('Propuesta QA',level==='bachillerato'?'universidad':'bachillerato')]}),{status:200,headers:{'Content-Type':'application/json'}})};
}
const click=label=>{const props=globalThis.__adminButtons.find(props=>text(props.children)===label);assert(props,'Missing button '+label);assert(props.onClick,'Missing action '+label);return props.onClick()};
try{
 assert.equal(adminTestLevel(null),'bachillerato');assert.equal(exactTestLevel('ambos'),undefined);assert.equal(testManagerHref('universidad','id con espacio'),'/admin/evaluaciones?nivel=universidad&editar=id+con+espacio');
 for(const level of ['bachillerato','universidad']){
  initialize(level);
  const html=renderToStaticMarkup(React.createElement(TestManager));
  const main=html.slice(0,html.indexOf('<dialog'));
  assert(main.includes('aria-label="Categoría de las evaluaciones"'));
  assert(main.includes(level==='bachillerato'?'Escolar exclusivo QA':'Universitario exclusivo QA'));
  assert(!main.includes(level==='bachillerato'?'Universitario exclusivo QA':'Escolar exclusivo QA'),'Opposite-route test cards leak');
  assert(main.includes(level==='bachillerato'?'Importación escolar QA':'Importación universitaria QA'));
  assert(!main.includes(level==='bachillerato'?'Importación universitaria QA':'Importación escolar QA'),'Opposite-route import history leaks');
  assert(!html.includes('Todas las rutas')&&!html.includes('value="ambos"'));
  assert(!main.includes('Usar plantilla de Bachillerato'));
  assert(main.indexOf('Editar con IA')<main.indexOf('Gestionar test'),'AI editor action must be visible outside collapsed actions');
  click('Editar con IA');const aiDraft=globalThis.__adminEdited.at(-1);assert.equal(aiDraft.educationLevel,level);assert.equal(aiDraft.status,'Borrador');assert.notEqual(aiDraft.id,'intereses');
  click('Crear test');assert.equal(globalThis.__adminEdited.at(-1).educationLevel,level);assert(globalThis.__adminNavigations.at(-1).includes('nivel='+level));
  click('Crear copia para '+(level==='bachillerato'?'Bachillerato':'Universidad'));
  const legacyCopy=globalThis.__adminEdited.at(-1);assert.equal(legacyCopy.educationLevel,level);assert.deepEqual(legacyCopy.studentIds,[level==='bachillerato'?'school-user':'uni-user']);assert.equal(legacyCopy.careerLinks.length,1);assert.equal(legacyCopy.careerLinks[0].careerId.startsWith('bachillerato:'),level==='bachillerato');
  assert.equal(nextTestVersion(globalThis.__adminCustom,instrument('candidate',level,'Borrador',{version:level==='bachillerato'?'2':'8'}),level),level==='bachillerato'?3:9,'Version increment includes only the selected category');
  click('Publicar y asignar');await waitFor(()=>globalThis.__adminCustomSnapshots.length>0);
  const published=globalThis.__adminCustomSnapshots.at(-1);assert.equal(published.find(item=>item.id===(level==='bachillerato'?'Publicado escolar QA':'Publicado universitario QA')).status,'Archivado');assert.equal(published.find(item=>item.id===(level==='bachillerato'?'Publicado universitario QA':'Publicado escolar QA')).status,'Publicado','Publishing cannot archive another category');
  click('Archivar');await waitFor(()=>globalThis.__adminSavedValues.length>0);
  assert.deepEqual(Object.keys(globalThis.__adminSavedValues.at(-1).value),[level+':intereses'],'Original state belongs only to the active category');
  click('Importar documento');
  for(const extension of ['.pdf','.docx','.html','.htm','.txt','.md','.rtf','.odt'])assert(globalThis.__adminFileInput.accept.split(',').includes(extension));
  for(const rejected of [new File(['Word antiguo'],'legacy.doc'),new File([],'empty.html')]){
   const event={target:{files:[rejected],value:'selected-file'}};
   const before=globalThis.__adminNetwork.length;globalThis.__adminFileInput.onChange(event);
   assert.equal(globalThis.__adminNetwork.length,before,'Invalid documents must be rejected before upload');
   assert.equal(event.target.value,'','The file input must allow selecting the same document again');
  }
  globalThis.__adminFileInput.onChange({target:{files:[new File(['<h1>QA</h1>'],'qa.html',{type:'text/html'})]}});await waitFor(()=>globalThis.__adminNetwork.length>=2);
  const uploaded=globalThis.__adminNetwork.find(call=>call.options.body instanceof FormData);assert.equal(uploaded.options.body.get('educationLevel'),level);await waitFor(()=>globalThis.__adminProposals.some(proposals=>proposals.length));assert(globalThis.__adminProposals.at(-1).every(test=>test.educationLevel===level),'Document metadata cannot change the selected category');
  globalThis.__adminFileInput.onChange({target:{files:[new File(['No compatible'],'unsupported.doc')],value:'selected-file'}});
  assert.deepEqual(globalThis.__adminProposals.at(-1),[],'An invalid replacement file must clear prior extraction results');
  globalThis.__adminNetwork=[];click('Reintentar');await waitFor(()=>globalThis.__adminNetwork.length>=2);const retry=JSON.parse(globalThis.__adminNetwork[0].options.body);assert.equal(retry.action,'retry');assert.equal(retry.educationLevel,level);
  globalThis.__adminNetwork=[];click('Asignar a '+(level==='bachillerato'?'Bachillerato':'Universidad'));await waitFor(()=>globalThis.__adminNetwork.length>=2);const assign=JSON.parse(globalThis.__adminNetwork[0].options.body);assert.equal(assign.action,'assign');assert.equal(assign.educationLevel,level);
  const audience=renderToStaticMarkup(React.createElement(AudienceSettings,{test:instrument('audience',level,'Borrador',{audience:'selected',studentIds:[]}),users:globalThis.__adminUsers,onChange(){}}));assert(audience.includes('Categoría: '+(level==='bachillerato'?'Bachillerato':'Universidad')));assert(!audience.includes('Bachillerato y Universidad')&&!audience.includes('value="ambos"'));assert(audience.includes(level==='bachillerato'?'Estudiante EGB QA':'Estudiante graduado QA'));assert(!audience.includes(level==='bachillerato'?'Estudiante graduado QA':'Estudiante EGB QA'));
  const payload=testImportForm(new File(['contenido'],'fixture.html'),level);assert.equal(payload.get('educationLevel'),level);assert.equal(testsImportedForLevel([instrument('metadata','ambos')],level)[0].educationLevel,level);
 }
 globalThis.__adminRole='student';const historical=renderToStaticMarkup(React.createElement(IntegralReports));assert(historical.includes('/mi-ruta/resultados'));assert(historical.includes('Copias históricas'));assert(!historical.includes('Generar informe integral')&&!historical.includes('al menos una evaluación'));
 const css=readFileSync('components/kit/features/admin/test-manager.css','utf8');assert(css.includes('min-height: 44px'));assert(css.includes('@media (max-width: 640px)'));assert(css.includes('flex-wrap: wrap'));
 console.log('PASS admin evaluations UI: independent tabs, scoped create/copy/publish/archive, preserved upload/retry categories, fixed editor category, and responsive controls.');
}finally{globalThis.fetch=originalFetch;globalThis.window=originalWindow;for(const key of Object.keys(globalThis).filter(key=>key.startsWith('__admin')))delete globalThis[key];}
