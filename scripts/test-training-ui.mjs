import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {mkdirSync,mkdtempSync} from 'node:fs';
import {resolve} from 'node:path';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
mkdirSync('.qa-tools',{recursive:true});
const folder=mkdtempSync(resolve('.qa-tools','training-ui-')),outfile=resolve(folder,'ui.cjs');
await build({stdin:{contents:`export {StudentCourses} from './components/kit/features/training/StudentCourses';`,resolveDir:process.cwd(),loader:'tsx'},jsx:'automatic',bundle:true,platform:'node',packages:'external',format:'cjs',outfile,loader:{'.css':'empty'},plugins:[{name:'fixtures',setup(b){
 b.onResolve({filter:/\/lib\/session$/},()=>({path:'session',namespace:'fixture'}));
 b.onResolve({filter:/^\.\/shared$/},()=>({path:'training',namespace:'fixture'}));
 b.onResolve({filter:/^\.\/SimulatorRun$/},()=>({path:'simulator',namespace:'fixture'}));
 b.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:args.path==='session'?`export const useSession=()=>({values:{'rv360:profile':globalThis.__trainingProfile}});`:args.path==='training'?`export const useTraining=()=>({data:globalThis.__trainingFixture,error:'',busy:false,refresh(){},run(){}});export function TrainingError(){return null;}export async function trainingApi(){};export const decimal=String;`:`export function SimulatorRun(){return null;}export function TrainingResult(){return null;}`}));
}}]});
const {StudentCourses}=createRequire(import.meta.url)(outfile);
const readiness=ready=>({ready,total:3,completed:ready?3:1,pending:ready?[]:[{id:'pending',title:'Test pendiente QA',state:'awaiting_results'}]});
try{
 for(const level of ['bachillerato','universidad']){
  globalThis.__trainingProfile={stage:level==='bachillerato'?'Estoy en 10.º de EGB y pasaré a 1.º de BGU':'Me gradué del colegio'};
  globalThis.__trainingFixture={careers:[{id:'bachillerato:ciencias',name:'Opción escolar QA',area:'Ciencias',educationLevel:'bachillerato'},{id:'uni-qa',name:'Opción universitaria QA',area:'Tecnología',educationLevel:'universidad'}],recommendations:[{careerId:'bachillerato:ciencias',reason:'Evidencia QA'},{careerId:'uni-qa',reason:'Evidencia QA'}],attempts:[],simulators:[],readiness:{bachillerato:readiness(false),universidad:readiness(false)}};
  const locked=renderToStaticMarkup(React.createElement(StudentCourses));
  assert(locked.includes('Completa tus tests para acceder a los cursos'));assert(locked.includes('Test pendiente QA'));assert(locked.includes('/mi-ruta/evaluaciones'));
  assert(!locked.includes('Opción escolar QA')&&!locked.includes('Opción universitaria QA'),'Stale recommendations must not leak through a locked screen');
  assert(!locked.includes('Autopreparación'));
  globalThis.__trainingFixture.readiness[level]=readiness(true);
  const ready=renderToStaticMarkup(React.createElement(StudentCourses));
  assert(ready.includes(level==='bachillerato'?'Opción escolar QA':'Opción universitaria QA'));assert(ready.includes('Autopreparación'));
 }
 console.log('PASS rendered courses UI: both routes show pending tests, hide stale recommendations, and unlock relevant preparation only after completion.');
}finally{delete globalThis.__trainingProfile;delete globalThis.__trainingFixture;}
