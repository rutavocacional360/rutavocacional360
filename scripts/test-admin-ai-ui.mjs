import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdirSync,mkdtempSync} from 'node:fs';
import {resolve} from 'node:path';
import {createRequire} from 'node:module';
import {parseHTML} from 'linkedom';
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';

mkdirSync('.qa-tools',{recursive:true});
const folder=mkdtempSync(resolve('.qa-tools','admin-ai-ui-')),outfile=resolve(folder,'ui.cjs');
const fixtures={
 primitives:`import React from 'react';
 export function Button({variant,size,loading,icon,disabled,...props}){return React.createElement('button',{...props,disabled:disabled||loading})}
 export function Field({label,...props}){return React.createElement('label',null,label,React.createElement('input',props))}
 export function SelectField({label,...props}){return React.createElement('label',null,label,React.createElement('select',props))}
 export function TextareaField({label,...props}){return React.createElement('label',null,label,React.createElement('textarea',props))}
 export function Notice({tone,...props}){return React.createElement('div',props)}
 export const Card=Notice;`,
 session:`export const previewAction=async()=>({careers:[]});`,
 requests:`export const adminFetch=(...args)=>globalThis.__adminAIRequest(...args);`,
 shared:`export function ChoiceList(){return null;}export const trainingApi=async()=>({});`,
};
await build({stdin:{contents:`export {StudyOptionSuggestions} from './components/kit/features/admin/StudyOptionSuggestions';export {PresentationEditor} from './components/kit/components/domain/PresentationEditor';export {SimulatorEditor,blankSimulator} from './components/kit/features/training/TrainingEditors';`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,platform:'node',format:'cjs',packages:'external',jsx:'automatic',outfile,loader:{'.css':'empty'},plugins:[{name:'controlled-browser',setup(b){
 for(const [filter,path] of [[/\/ui\/primitives$/,'primitives'],[/\/lib\/session$/,'session'],[/admin-session$/,'requests'],[/^\.\/shared$/,'shared']])b.onResolve({filter},()=>({path,namespace:'fixture'}));
 b.onLoad({filter:/.*/,namespace:'fixture'},({path})=>({contents:fixtures[path],loader:'jsx',resolveDir:process.cwd()}));
}}]});
const {StudyOptionSuggestions,PresentationEditor,SimulatorEditor,blankSimulator}=createRequire(import.meta.url)(outfile);
const {window}=parseHTML('<html><body><div id="root"></div></body></html>');
const originals=Object.fromEntries(['window','document','HTMLElement','Event','IS_REACT_ACT_ENVIRONMENT'].map(key=>[key,globalThis[key]]));
Object.assign(globalThis,{window,document:window.document,HTMLElement:window.HTMLElement,Event:window.Event,IS_REACT_ACT_ENVIRONMENT:true});
let root=createRoot(document.getElementById('root'));
const requests=[];
globalThis.__adminAIRequest=(_url,options)=>new Promise(resolve=>requests.push({resolve,body:JSON.parse(options.body)}));
const render=element=>act(async()=>root.render(element));
const button=text=>[...document.querySelectorAll('button')].find(node=>node.textContent.includes(text));
const click=text=>act(async()=>{const target=button(text);assert(target,'Missing button '+text);target.dispatchEvent(new window.Event('click',{bubbles:true}));});
const finish=(request,value)=>act(async()=>request.resolve(new Response(JSON.stringify(value),{headers:{'Content-Type':'application/json'}})));
const remount=async()=>{await act(async()=>root.unmount());root=createRoot(document.getElementById('root'));};

try{
 const careers=[{id:'bachillerato:informatica',name:'Informática técnica QA'},{id:'bachillerato:ciencias',name:'Ciencias QA'},{id:'software',name:'Universidad ajena QA'}];
 const test={id:'test-qa',version:'1',educationLevel:'bachillerato',title:'Documento inicial',description:'Preferencias personales',options:[],questions:[]};
 const suggestions=value=>React.createElement(StudyOptionSuggestions,{test:value,careers,onSelect(){}});
 await render(suggestions(test));await click('Detectar opciones con IA');const initial=requests.at(-1);
 await render(suggestions({...test,title:'Documento modificado'}));
 await finish(initial,{careerIds:['bachillerato:informatica']});
 assert(!document.body.textContent.includes('Informática técnica QA'),'A stale document response must be discarded');
 await click('Detectar opciones con IA');const stale=requests.at(-1);
 await render(suggestions({...test,title:'Documento vigente'}));await click('Detectar opciones con IA');const current=requests.at(-1);
 await finish(stale,{careerIds:['bachillerato:informatica']});assert(button('Detectar opciones con IA').disabled,'An old request must not unlock the active request');
 await finish(current,{careerIds:['bachillerato:ciencias','software']});
 assert(document.body.textContent.includes('Ciencias QA'));assert(!document.body.textContent.includes('Universidad ajena QA'),'Foreign-route suggestions stay hidden');
 await click('Detectar opciones con IA');const unmounted=requests.at(-1);await remount();await finish(unmounted,{careerIds:['bachillerato:ciencias']});
 assert.equal(document.getElementById('root').textContent,'');

 let oldChanges=0,latestChanges=0;
 await render(React.createElement(PresentationEditor,{instrument:test,onChange(){oldChanges++;}}));await click('Preparar introducción con IA');const introduction=requests.at(-1);
 await render(React.createElement(PresentationEditor,{instrument:{...test,questions:[{id:'new',text:'Edición guardada durante la espera'}]},onChange(){latestChanges++;}}));
 await finish(introduction,{presentation:{title:'Presentación QA',summary:'Resumen QA'}});assert.equal(oldChanges,0);assert.equal(latestChanges,1,'AI must invoke the current callback so other manual edits survive: '+document.body.textContent);
 await click('Preparar introducción con IA');const replaced=requests.at(-1);
 await render(React.createElement(PresentationEditor,{instrument:{...test,presentation:{title:'Título manual',summary:'Resumen manual'}},onChange(){latestChanges++;}}));
 await finish(replaced,{presentation:{title:'Respuesta antigua',summary:'Respuesta antigua'}});assert.equal(latestChanges,1,'A manual presentation wins over an older AI response');

 await remount();let simulatorChanges=0;const busy=[];
 const simulator={...blankSimulator(),id:'simulator-qa',title:'Práctica QA',educationLevel:'bachillerato',careerIds:['bachillerato:ciencias'],questions:[{id:'q1',type:'single',text:'Dos más dos',options:[{value:1,label:'Cuatro'},{value:2,label:'Cinco'}],source:'Documento QA'}]};
 const editor=React.createElement(SimulatorEditor,{value:simulator,data:{educationLevel:'bachillerato',careers},onChange(){simulatorChanges++;},onSave(){},onBusyChange(value){busy.push(value);}});
 await render(editor);await click('Autocompletar con IA');const simulatorRequest=requests.at(-1);
 assert.equal(simulatorRequest.body.educationLevel,'bachillerato');
 assert(document.querySelector('.training-editor > fieldset').hasAttribute('disabled'),'The editor must lock manual fields while AI is preparing its snapshot');
 assert.equal(busy.at(-1),true,'The enclosing admin must block saving and route changes');
 await remount();assert.equal(busy.at(-1),false,'Unmount clears parent busy state');
 await finish(simulatorRequest,{suggestions:{title:'Práctica',summary:'Resumen',instructions:'Responde cada pregunta.',careerIds:['bachillerato:ciencias'],questions:[{id:'q1',correctValues:[1],explanation:'La suma es cuatro.',issue:''}]}});
 assert.equal(simulatorChanges,0,'A closed editor must not receive a delayed simulator snapshot');
 await render(editor);await click('Preparar introducción con IA');const nested=requests.at(-1);
 assert(document.querySelector('.training-editor > fieldset').hasAttribute('disabled'),'Presentation AI must also lock the simulator fields');assert.equal(busy.at(-1),true);
 await finish(nested,{presentation:{title:'Introducción',summary:'Resumen de la práctica'}});assert.equal(simulatorChanges,1);assert.equal(busy.at(-1),false);
 console.log('PASS mounted admin AI: stale document replies, request ordering, scoped options, current callbacks, manual presentation preservation, busy propagation and unmount protection.');
}finally{
 await act(async()=>root.unmount());delete globalThis.__adminAIRequest;
 for(const [key,value] of Object.entries(originals))if(value===undefined)delete globalThis[key];else globalThis[key]=value;
}
