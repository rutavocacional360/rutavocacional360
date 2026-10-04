import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdirSync,mkdtempSync} from 'node:fs';
import {resolve} from 'node:path';
import {createRequire} from 'node:module';
import {parseHTML} from 'linkedom';
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';

mkdirSync('.qa-tools',{recursive:true});
const outfile=resolve(mkdtempSync(resolve('.qa-tools','course-navigation-')),'ui.cjs');
const fixtures={
 navigation:`export const useSearchParams=()=>new URLSearchParams(globalThis.__courseQuery);export const useRouter=()=>globalThis.__courseRouter;`,
 shared:`export const useTraining=()=>({data:globalThis.__courseData,error:'',busy:false,refresh:async()=>{},run:async fn=>fn()});export const trainingApi=async(_path,{entity})=>({...entity,revision:entity.revision+1});export function TrainingError(){return null;}export function ChoiceList(){return null;}export const decimal=String;`,
 editors:`import React from 'react';export function CourseEditor({value,onChange}){return <div data-editor={value.id}><span data-title>{value.title}</span><button onClick={()=>onChange({...value,title:'Edición conservada'})}>Editar título QA</button></div>;}export function SimulatorEditor(){return null;}export const blankCourse=()=>({id:'',version:0,revision:0,status:'draft',title:'',description:'',objectives:'',activities:[],careerIds:[],fields:[],studentIds:[],access:'all',type:'general'});export const blankSimulator=()=>({});`,
 primitives:`import React from 'react';export function Button({variant,size,loading,icon,...props}){return <button {...props}/>;}export function Field({label,...props}){return <label>{label}<input {...props}/></label>;}export function SelectField({label,...props}){return <label>{label}<select {...props}/></label>;}export function TextareaField({label,...props}){return <label>{label}<textarea {...props}/></label>;}export function Notice({tone,...props}){return <div {...props}/>;}export const Card=Notice,Badge=Notice;export function PageHeader({title,description,actions}){return <header><h1>{title}</h1><p>{description}</p>{actions}</header>;}`,
 dialog:`import React from 'react';export function Dialog({open,children}){return open?<div>{children}</div>:null;}`,
 simulator:`export function TrainingResult(){return null;}`,
};
await build({stdin:{contents:`export {AdminCourses} from './components/kit/features/training/AdminCourses';export {AdminCoursePrograms} from './components/kit/features/training/AdminCoursePrograms';`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,platform:'node',format:'cjs',packages:'external',jsx:'automatic',outfile,loader:{'.css':'empty'},plugins:[{name:'course-navigation-fixtures',setup(b){
 for(const [filter,path] of [[/^next\/navigation$/,'navigation'],[/^\.\/shared$/,'shared'],[/^\.\/TrainingEditors$/,'editors'],[/\/ui\/primitives$/,'primitives'],[/\/ui\/Dialog$/,'dialog'],[/^\.\/SimulatorRun$/,'simulator']])b.onResolve({filter},()=>({path,namespace:'fixture'}));
 b.onLoad({filter:/.*/,namespace:'fixture'},({path})=>({contents:fixtures[path],loader:'jsx',resolveDir:process.cwd()}));
}}]});
const {AdminCourses,AdminCoursePrograms}=createRequire(import.meta.url)(outfile);
const {window}=parseHTML('<html><body><div id="root"></div></body></html>');
const old=Object.fromEntries(['window','document','HTMLElement','Event','IS_REACT_ACT_ENVIRONMENT'].map(key=>[key,globalThis[key]]));
Object.assign(globalThis,{window,document:window.document,HTMLElement:window.HTMLElement,Event:window.Event,IS_REACT_ACT_ENVIRONMENT:true});
const draft=id=>({id,version:1,revision:1,status:'draft',educationLevel:'bachillerato',title:'Curso '+id,description:'Programa',objectives:'Explorar',activities:[],careerIds:[],fields:[],studentIds:[],access:'all',type:'general'});
globalThis.__courseData={courses:[draft('a'),draft('b')],careers:[],simulators:[],attempts:[],users:[]};
const navigations=[];globalThis.__courseRouter={push:href=>navigations.push(href),replace:href=>navigations.push(href)};
const catalog='nivel=bachillerato&tipo=curso',route=id=>catalog+'&editar='+id+'&version=1';
globalThis.__courseQuery=route('a');
let root=createRoot(document.getElementById('root')),element=React.createElement(AdminCourses);
const render=()=>act(async()=>root.render(React.cloneElement(element)));
const visit=async query=>{globalThis.__courseQuery=query;await render();};
const title=()=>document.querySelector('[data-title]')?.textContent;
const click=label=>act(async()=>{const button=[...document.querySelectorAll('button')].find(node=>node.textContent===label);assert(button,'Missing '+label);button.dispatchEvent(new window.Event('click',{bubbles:true}));});
try{
 await render();assert.equal(title(),'Curso a');
 await visit(catalog);assert.equal(title(),undefined,'Back closes an unchanged editor');
 await visit(route('a'));assert.equal(title(),'Curso a','Forward reopens the draft');
 await visit(route('b'));assert.equal(title(),'Curso b','History can select a different clean draft');
 await click('Editar título QA');assert.equal(title(),'Edición conservada');
 globalThis.__courseData={...globalThis.__courseData,courses:[draft('a'),{...draft('b'),title:'Respuesta antigua del servidor'}]};
 await render();assert.equal(title(),'Edición conservada','Refreshing the catalog cannot overwrite local changes');
 await visit(catalog);assert.equal(title(),'Edición conservada');assert.equal(navigations.at(-1),'/admin/cursos?'+route('b'),'Unsaved history navigation restores the matching route');
 await visit(route('b'));await visit('nivel=bachillerato');assert.equal(title(),'Edición conservada','Switching to simulators cannot unmount a dirty course');assert.equal(navigations.at(-1),'/admin/cursos?'+route('b'));
 await visit(route('b'));await click('Guardar borrador');assert(document.body.textContent.includes('Borrador guardado'));assert(!document.body.textContent.includes('Cambios pendientes de guardar'));
 await visit(catalog);assert.equal(title(),undefined);await visit('nivel=bachillerato');assert(document.body.textContent.includes('Simuladores y preguntas'),'A clean course can leave to simulators');
 await act(async()=>root.unmount());root=createRoot(document.getElementById('root'));
 const imported={course:draft('a'),message:'Importado'};globalThis.__courseQuery='nivel=bachillerato';element=React.createElement(AdminCoursePrograms,{imported,onSimulators(){}});
 await render();assert.equal(title(),'Curso a','An imported draft survives the pending router transition');await visit(route('a'));assert(document.body.textContent.includes('Borrador guardado'));assert(!document.body.textContent.includes('Cambios pendientes de guardar'));
 element=React.createElement(AdminCoursePrograms,{imported:{course:draft('b'),message:'Segundo importado'},onSimulators(){}});await render();await visit(route('b'));assert.equal(title(),'Curso b');assert(!document.body.textContent.includes('Cambios pendientes de guardar'),'An already saved import establishes its own snapshot');
 console.log('PASS course navigation: back/forward, clean draft changes, dirty route protection, refresh preservation, saved import snapshots and pending transitions.');
}finally{await act(async()=>root.unmount());Object.assign(globalThis,old);for(const key of ['__courseQuery','__courseData','__courseRouter'])delete globalThis[key];}
