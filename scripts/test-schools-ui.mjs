import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdirSync,mkdtempSync} from 'node:fs';
import {resolve} from 'node:path';
import {createRequire} from 'node:module';
import {parseHTML} from 'linkedom';
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
mkdirSync('.qa-tools',{recursive:true});const folder=mkdtempSync(resolve('.qa-tools','schools-ui-')),outfile=resolve(folder,'ui.cjs');
const fixtures={
 primitives:`import React from 'react';export function Button({loading,variant,icon,...p}){return <button {...p} disabled={p.disabled||loading}>{p.children}</button>}export function Card(p){return <div {...p}/>}export function Notice({tone,...p}){return <div role="status" {...p}/>}export function Badge({tone,...p}){return <span {...p}/>}export function Field({label,hint,...p}){return <label>{label}<input {...p}/></label>}export function SelectField({label,...p}){return <label>{label}<select {...p}/></label>}export function PageHeader({title,description,actions}){return <header><h1>{title}</h1><p>{description}</p>{actions}</header>}`,
 dialog:`import React from 'react';export function Dialog({open,title,children}){return open?<section role="dialog" aria-label={title}>{children}</section>:null}`,
 toast:`export function useToast(){return ()=>{}}`,
 request:`export const adminFetch=(...args)=>globalThis.__schoolsRequest(...args);`,
};
await build({entryPoints:['components/kit/features/admin/Schools.tsx'],bundle:true,platform:'node',format:'cjs',packages:'external',jsx:'automatic',outfile,loader:{'.css':'empty'},plugins:[{name:'browser',setup(b){for(const [filter,path]of [[/\/ui\/primitives$/,'primitives'],[/\/ui\/Dialog$/,'dialog'],[/\/ui\/Toast$/,'toast'],[/admin-session$/,'request']])b.onResolve({filter},()=>({path,namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},({path})=>({contents:fixtures[path],loader:'jsx',resolveDir:process.cwd()}));}}]});
const {Schools}=createRequire(import.meta.url)(outfile),{window}=parseHTML('<html><body><div id="root"></div></body></html>');
Object.assign(globalThis,{window,document:window.document,HTMLElement:window.HTMLElement,Event:window.Event,IS_REACT_ACT_ENVIRONMENT:true});
let school={id:'school',revision:1,name:'Escuela QA',code:'QA',city:'Quito',contact:'',email:'',status:'Activa',students:1,counselors:0};
let member={id:'user',name:'Estudiante QA',email:'qa@example.test',role:'student',status:'Activo',schoolId:'school'};
const requests=[];let failure=false;
globalThis.__schoolsRequest=async(url,options={})=>{
 requests.push({url,options});
 if(failure)return Response.json({error:'Error de prueba'},{status:503});
 if(options.method==='POST'){
  const body=JSON.parse(options.body);
  if(url.endsWith('/assign'))member={...member,schoolId:body.schoolId};else if(body.action==='delete')school=null;else school={...body,revision:school.revision+1};
  return Response.json({ok:true,school});
 }
 return Response.json(url.includes('/members')?{school,items:[member],total:1,pages:1}:{items:school?[school]:[],total:school?1:0,pages:1});
};
const root=createRoot(document.getElementById('root'));
const click=async(text)=>act(async()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent===text);assert(b,'Missing '+text);b.dispatchEvent(new window.Event('click',{bubbles:true}));});
try{
 await act(async()=>root.render(React.createElement(Schools)));
 assert(document.body.textContent.includes('Escuela QA'));
 await click('Editar escuela');assert(document.querySelector('[role="dialog"]'));
 await act(async()=>document.querySelector('[role="dialog"] form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true})));
 assert.equal(JSON.parse(requests.find(r=>r.options.method==='POST').options.body).revision,1);
 assert(!document.querySelector('[role="dialog"]'));
 await click('Ver usuarios');assert(document.body.textContent.includes('Estudiante QA'));
 await click('Retirar asignación');assert(document.querySelector('[role="dialog"]'));
 assert(!requests.some(r=>r.url.endsWith('/assign')),'Assignment waits for confirmation');
 await click('Confirmar');const change=JSON.parse(requests.find(r=>r.url.endsWith('/assign')).options.body);
 assert.equal(change.previousSchoolId,'school');assert.equal(change.schoolId,null);
 assert(!document.querySelector('[role="dialog"]'));
 failure=true;await click('Volver a escuelas');assert(document.body.textContent.includes('Error de prueba'));
 failure=false;await click('Reintentar');assert(document.body.textContent.includes('Escuela QA'));
 await click('Crear escuela');assert(document.querySelector('[role="dialog"] input[required]'));
 await click('Cancelar');assert(!document.querySelector('[role="dialog"]'));
 const deletionRequests=()=>requests.filter(r=>r.options.body&&JSON.parse(r.options.body).action==='delete');
 await click('Eliminar');assert(document.querySelector('[role="dialog"][aria-label="Eliminar escuela"]'));
 assert.equal(deletionRequests().length,0,'Opening confirmation must not delete');
 await click('Cancelar');assert(!document.querySelector('[role="dialog"]'));
 assert.equal(deletionRequests().length,0,'Cancellation must not delete');
 await click('Eliminar');failure=true;
 await click('Confirmar eliminación');assert(document.querySelector('[role="dialog"]'),'Failure keeps confirmation available to retry');
 assert(document.querySelector('[role="dialog"]').textContent.includes('Error de prueba'));
 failure=false;await click('Confirmar eliminación');
 assert(!document.querySelector('[role="dialog"]'));
 assert(document.body.textContent.includes('No hay escuelas en esta lista'));
 assert.deepEqual(JSON.parse(deletionRequests().at(-1).options.body),{action:'delete',id:'school',revision:2});
 console.log('PASS schools UI: directory, edit/revision, members, assignment confirmation, error recovery, create/cancel and confirmed deletion with retry.');
}finally{await act(async()=>root.unmount());}
