import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {mkdirSync,mkdtempSync} from 'node:fs';
import {resolve} from 'node:path';
import React from 'react';
import {parseHTML} from 'linkedom';
mkdirSync('.qa-tools',{recursive:true});
const folder=mkdtempSync(resolve('.qa-tools','activity-ui-')),outfile=resolve(folder,'ui.cjs');
await build({stdin:{contents:"export {ActivityResponseForm} from './components/kit/features/training/ActivityResponseForm';",resolveDir:process.cwd(),loader:'tsx'},jsx:'automatic',bundle:true,platform:'node',packages:'external',format:'cjs',outfile,plugins:[{name:'api-fixture',setup(b){b.onResolve({filter:/^\.\/shared$/},()=>({path:'training',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export const trainingApi=(...args)=>globalThis.__activityApi(...args);'}));}}]});
const {ActivityResponseForm}=createRequire(import.meta.url)(outfile);
const {window}=parseHTML('<html><body><div id="root"></div></body></html>');
Object.assign(globalThis,{window,document:window.document,HTMLElement:window.HTMLElement,Element:window.Element,Node:window.Node,Event:window.Event,IS_REACT_ACT_ENVIRONMENT:true});
const storage=new Map();window.sessionStorage={getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)};
const {createRoot}=await import('react-dom/client');const root=createRoot(document.getElementById('root'));
const originalTimeout=globalThis.setTimeout,originalClearTimeout=globalThis.clearTimeout;
const timers=new Map();let timerId=0;
globalThis.setTimeout=(callback,delay,...args)=>delay===800?(timers.set(++timerId,callback),{autosave:timerId}):originalTimeout(callback,delay,...args);
globalThis.clearTimeout=timer=>timer?.autosave?timers.delete(timer.autosave):originalClearTimeout(timer);
const activity={id:'activity',kind:'text',content:'INICIO\n¿Qué disfrutas?\nCIERRE\n¿Qué apoyo necesitas?',title:'Mi futuro',module:'Conócete',required:true,completion:'read'};
let saved,requests=[],failure=false,pending=false,parentBusy=false;
globalThis.__activityApi=async(path,body)=>{
 requests.push({path,body:structuredClone(body)});
 if(failure)throw Error('Sin conexión QA');
 if(path==='/enroll')return {responses:{activity:saved}};
 assert.equal(path,'/activity-response');assert.equal(body.revision,saved?.revision||0);
 saved={answers:body.answers,revision:body.revision+1,updatedAt:new Date().toISOString(),...(body.complete?{submittedAt:new Date().toISOString()}:{})};
 return {response:structuredClone(saved),enrollment:{}};
};
const props=()=>({activity,enrollmentId:'enrollment',userId:'student',courseId:'course',saved,parentBusy,run:task=>{assert(!parentBusy,'Never call a mutation while the parent is still opening or refreshing the course');return task();},onPendingChange:value=>{pending=value;}});
const mount=key=>React.act(async()=>root.render(React.createElement(ActivityResponseForm,{key,...props()})));
// Linkedom does not implement native text input events. Invoke the rendered
// textarea's React handler and verify the DOM, debounce, API and storage effects.
const type=async(index,value)=>React.act(async()=>{
 const field=document.querySelectorAll('textarea')[index];field.value=value;
 field[Object.keys(field).find(key=>key.startsWith('__reactProps$'))].onChange({target:field});
});
const renderedValue=index=>{const field=document.querySelectorAll('textarea')[index];return field[Object.keys(field).find(key=>key.startsWith('__reactProps$'))].value;};
const click=async text=>React.act(async()=>{const button=[...document.querySelectorAll('button')].find(b=>b.textContent===text);assert(button&&!button.disabled,text);button.click();});
const autosave=async()=>{assert.equal(timers.size,1);const fn=[...timers.values()][0];timers.clear();await React.act(async()=>fn());};
try {
 await mount('initial');assert.equal(document.querySelectorAll('textarea').length,2);
 await type(0,'Aprender ciencias');assert(pending);assert.equal(storage.size,1);
 // Navigating with Next unmounts without beforeunload; the tab-local draft survives.
 await mount('navigation');assert.equal(renderedValue(0),'Aprender ciencias');assert.equal(requests.length,0);
 await autosave();assert.equal(saved.answers['question-1'],'Aprender ciencias');assert.equal(storage.size,0);assert(!pending);
 await type(1,'Hablar con mi orientador');await autosave();assert.equal(saved.revision,2);
 await mount('reload');assert.equal(renderedValue(1),'Hablar con mi orientador');
 saved={...saved,revision:saved.revision+1,answers:{...saved.answers,'question-1':'Respuesta en otro dispositivo'}};
 await mount('reload');assert.equal(renderedValue(0),'Respuesta en otro dispositivo','A clean open form adopts newer server answers without requiring navigation');
 failure=true;await type(0,'Nuevo borrador');await autosave();
 assert(document.body.textContent.includes('Sin conexión QA'));assert.equal(timers.size,0,'Network failures never cause endless automatic retries');assert(storage.size);
 failure=false;await click('Guardar respuestas');assert.equal(saved.answers['question-1'],'Nuevo borrador');assert.equal(storage.size,0);
 await type(0,'Texto de pestaña antigua');saved={...saved,revision:saved.revision+1,answers:{...saved.answers,'question-1':'Cambio desde otra sesión'}};
 await mount('conflict');assert(document.body.textContent.includes('respuestas más recientes'));assert.equal(renderedValue(0),'Texto de pestaña antigua');
 assert.equal(timers.size,0,'A restored stale draft never overwrites a newer database revision');
 await click('Recuperar guardado y descartar estos cambios');assert.equal(renderedValue(0),'Cambio desde otra sesión');assert.equal(storage.size,0);
 await type(0,'Borrador local mientras llega una actualización');
 saved={...saved,revision:saved.revision+1,answers:{...saved.answers,'question-1':'Actualización remota mientras escribía'}};
 await mount('conflict');assert.equal(renderedValue(0),'Borrador local mientras llega una actualización');
 assert(document.body.textContent.includes('respuestas más recientes'),'An incoming revision surfaces the conflict without losing local text');
 assert.equal(timers.size,0,'A background refresh stops stale autosave before it is sent');
 await click('Recuperar guardado y descartar estos cambios');assert.equal(renderedValue(0),'Actualización remota mientras escribía');
 await click('Guardar y completar actividad');assert(saved.submittedAt);assert.equal(storage.size,0);
 assert([...document.querySelectorAll('textarea')].every(field=>field[Object.keys(field).find(key=>key.startsWith('__reactProps$'))].readOnly));
 assert(![...document.querySelectorAll('button')].some(button=>button.textContent==='Guardar y completar actividad'));
 // A request from a departed form must not clear the new form's local typing.
 saved=undefined;requests=[];
 const immediateApi=globalThis.__activityApi;let release;
 globalThis.__activityApi=async(...args)=>{await new Promise(resolve=>{release=resolve;});return immediateApi(...args);};
 await mount('race-old');await type(0,'Respuesta en viaje');await autosave();
 await mount('race-new');await type(0,'Texto nuevo tras volver');
 await React.act(async()=>release());
 assert.equal(JSON.parse([...storage.values()][0]).answers['question-1'],'Texto nuevo tras volver','An older request cannot erase the draft from a remounted form');
 globalThis.__activityApi=immediateApi;
 await mount('race-recovered');assert.equal(renderedValue(0),'Texto nuevo tras volver');await autosave();
 assert.equal(saved.answers['question-1'],'Texto nuevo tras volver');assert.equal(storage.size,0);
 saved={...saved,revision:saved.revision+1,submittedAt:new Date().toISOString()};
 await mount('race-recovered');
 assert([...document.querySelectorAll('textarea')].every(field=>field[Object.keys(field).find(key=>key.startsWith('__reactProps$'))].readOnly),'A submission from another session locks a clean form on refresh');
 saved={answers:{'question-1':'Respuesta recuperada'},revision:1,updatedAt:new Date().toISOString()};
 // Opening an enrollment renders the form before useTraining finishes refresh.
 parentBusy=true;await mount('opening-course');await type(1,'Respuesta durante la carga');
 assert.equal(renderedValue(1),'Respuesta durante la carga','Typing remains available while the course refreshes');
 assert([...document.querySelectorAll('textarea')].every(field=>!field[Object.keys(field).find(key=>key.startsWith('__reactProps$'))].readOnly));
 assert([...document.querySelectorAll('button')].filter(button=>button.textContent.startsWith('Guardar')).every(button=>button.disabled),'Save and submission wait for the enrollment mutation to finish');
 assert.equal(timers.size,0,'Autosave waits instead of calling the parent mutation while it is occupied');
 parentBusy=false;await mount('opening-course');assert.equal(timers.size,1,'Autosave resumes when the parent releases its mutation');
 await click('Guardar y completar actividad');assert(saved.submittedAt);assert.equal(saved.answers['question-2'],'Respuesta durante la carga');
 console.log('PASS activity response DOM: editable imported questions, autosave, reload/navigation drafts, explicit retry, stale revision protection, recovery and submitted answers.');
} finally {
 await React.act(async()=>root.unmount());globalThis.setTimeout=originalTimeout;globalThis.clearTimeout=originalClearTimeout;delete globalThis.__activityApi;
}
