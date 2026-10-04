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
await build({stdin:{contents:`export {CompleteTestDraft} from './components/kit/features/admin/CompleteTestDraft';export {testEditorIssues} from './components/kit/features/admin/test-editor-issues';export {StudyOptionSuggestions} from './components/kit/features/admin/StudyOptionSuggestions';export {PresentationEditor} from './components/kit/components/domain/PresentationEditor';export {SimulatorEditor,blankSimulator} from './components/kit/features/training/TrainingEditors';`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,platform:'node',format:'cjs',packages:'external',jsx:'automatic',outfile,loader:{'.css':'empty'},plugins:[{name:'controlled-browser',setup(b){
 for(const [filter,path] of [[/\/ui\/primitives$/,'primitives'],[/\/lib\/session$/,'session'],[/admin-session$/,'requests'],[/^\.\/shared$/,'shared']])b.onResolve({filter},()=>({path,namespace:'fixture'}));
 b.onLoad({filter:/.*/,namespace:'fixture'},({path})=>({contents:fixtures[path],loader:'jsx',resolveDir:process.cwd()}));
}}]});
const {CompleteTestDraft,testEditorIssues,StudyOptionSuggestions,PresentationEditor,SimulatorEditor,blankSimulator}=createRequire(import.meta.url)(outfile);
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
 await render(React.createElement(PresentationEditor,{instrument:test,onChange(){},allowGenerate:false}));
 assert(!button('Preparar introducción con IA'),'The test editor does not offer a second, introduction-only AI action');

 await remount();let completedChanges=0,completedValue=null;const completionBusy=[],reviewTargets=[];
 const draft={...test,status:'Borrador',schemaVersion:2,scoring:'manual',purpose:'Explorar intereses escolares',source:'Fuente manual conservada',questions:Array.from({length:10},(_,index)=>({id:'draft-q'+(index+1),type:'likert',text:''})),options:[{value:1,label:'Poco'},{value:2,label:'Mucho'}]};
 const completed={...draft,presentation:{title:'Explora tus intereses',summary:'Responde según tus preferencias.'},questions:draft.questions.map((question,index)=>({...question,text:'Me interesa la actividad '+(index+1)}))};
 const completionResponse=value=>({instrument:value,completed:['10 enunciados','Presentación para estudiantes'],review:['Revisa las preguntas antes de publicar.'],issues:[],complete:true});
 const completer=(value=draft)=>React.createElement(CompleteTestDraft,{instrument:value,onChange(next){completedChanges++;completedValue=next;},onBusyChange(value){completionBusy.push(value);},onReview(issue){reviewTargets.push(issue);}});
 const numbered=testEditorIssues(draft).filter(issue=>issue.questionId);
 assert.deepEqual(numbered.map(issue=>issue.label),Array.from({length:10},(_,index)=>'Pregunta '+(index+1)+': Escribe el enunciado.'),'Blank questions have distinct, numbered review links');
 await render(completer());await click('Completar test con IA');const completeRequest=requests.at(-1);
 assert.equal(completeRequest.body.operation,'test-draft');assert.equal(completeRequest.body.instrument.questions.length,10);assert.equal(completeRequest.body.instrument.source,'Fuente manual conservada');
 assert.equal(completionBusy.at(-1),true);assert(button('Completando test').disabled,'Repeated completion clicks are blocked');
 await finish(completeRequest,completionResponse(completed));assert.equal(completedChanges,1);assert.equal(completedValue.questions.filter(question=>question.text).length,10);assert.equal(completionBusy.at(-1),false);
 await render(completer(completed));assert(document.body.textContent.includes('Borrador completado. Revisa antes de publicar.'));assert(document.body.textContent.includes('10 enunciados'));
 await click('Revisar test completo');assert.equal(reviewTargets.at(-1),undefined);

 await render(completer(draft));await click('Completar test con IA');const partialRequest=requests.at(-1);
 const partial={...completed,questions:completed.questions.map((question,index)=>index===9?{...question,text:''}:question)};
 await finish(partialRequest,{...completionResponse(partial),complete:false,issues:[{questionId:'draft-q10',step:1,message:'Escribe el enunciado.'}],completed:['9 enunciados']});
 await render(completer(partial));assert(!document.body.textContent.includes('Borrador completado. Revisa antes de publicar.'));await click('Pregunta 10: Escribe el enunciado.');assert.equal(reviewTargets.at(-1).questionId,'draft-q10');assert.equal(reviewTargets.at(-1).step,1);

 await render(completer(draft));await click('Completar test con IA');const sourceRequest=requests.at(-1);
 const sourceIssue={questionId:'draft-q7',step:1,message:'Contrasta esta pregunta con el documento original.'};
 await finish(sourceRequest,{...completionResponse(completed),complete:false,issues:[sourceIssue,sourceIssue]});
 await render(completer(completed));assert.equal([...document.querySelectorAll('button')].filter(node=>node.textContent==='Pregunta 7: '+sourceIssue.message).length,1,'Backend source issues are visible and deduplicated');
 await render(completer({...completed,title:'Otro nombre manual'}));assert(button('Pregunta 7: '+sourceIssue.message),'Unrelated manual changes retain source-specific issues');
 await render(completer({...completed,questions:completed.questions.map((question,index)=>index===6?{...question,text:'Pregunta corregida manualmente'}:question)}));assert(!button('Pregunta 7: '+sourceIssue.message),'A source issue clears when the relevant question changes');

 await render(completer(draft));await click('Completar test con IA');const staleCompletion=requests.at(-1),changesBeforeStale=completedChanges;
 await render(completer({...draft,purpose:'Propósito editado durante la espera'}));await finish(staleCompletion,completionResponse(completed));assert.equal(completedChanges,changesBeforeStale,'A delayed complete-draft response cannot replace manual edits');assert(document.body.textContent.includes('Se conservaron tus cambios'));
 await click('Completar test con IA');const closedCompletion=requests.at(-1);await remount();assert.equal(completionBusy.at(-1),false);await finish(closedCompletion,completionResponse(completed));assert.equal(completedChanges,changesBeforeStale,'Closing the test editor invalidates pending AI work');

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
