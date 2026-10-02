import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {build} from 'esbuild';
import {mkdtempSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {createRequire} from 'node:module';

// Component-level DOM test; no production browser, credentials or data involved.
const {window}=parseHTML('<html><body><div id="root"></div></body></html>');
Object.assign(globalThis,{window,document:window.document,HTMLElement:window.HTMLElement,HTMLInputElement:window.HTMLInputElement,IS_REACT_ACT_ENVIRONMENT:true});
document.oninput=null;
window.CompositionEvent=class extends window.Event {};
window.HTMLInputElement.prototype.setCustomValidity=function(message){this.validationMessage=message;};
window.HTMLInputElement.prototype.setSelectionRange=function(start,end){this.selectionStart=start;this.selectionEnd=end;};
const React=await import('react');
const {createRoot}=await import('react-dom/client');
mkdirSync('.qa-tools',{recursive:true});
const folder=mkdtempSync(resolve('.qa-tools','name-input-'));
const outfile=resolve(folder,'field.cjs');
await build({entryPoints:['components/kit/components/ui/primitives.tsx'],bundle:true,platform:'node',format:'cjs',packages:'external',outfile});
const {Field,PasswordInput,Notice}=createRequire(import.meta.url)(outfile);
let current='';
function Form(){const[value,setValue]=React.useState('');return React.createElement(Field,{label:'Nombres',personName:true,value,onChange:e=>{current=e.target.value;setValue(current);}});}
const root=createRoot(document.getElementById('root'));
await React.act(async()=>root.render(React.createElement(Form)));
const input=document.querySelector('input');
const nativeValue=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;
async function enter(value,cursor=value.length){await React.act(async()=>{nativeValue.call(input,value);input.selectionStart=cursor;input.dispatchEvent(new window.Event('input',{bubbles:true}));});}
try {
  await enter('79799');assert.equal(input.value,'','Numeric input must be removed');assert.equal(current,'');
  await enter('Ana123');assert.equal(input.value,'Ana');assert.equal(current,'Ana');
  await enter('María José');assert.equal(input.value,'María José');assert.equal(current,'María José');
  await enter("D'Ávila");assert.equal(current,"D'Ávila");
  await enter('Ana1 Pérez',4);assert.equal(current,'Ana Pérez');assert.equal(input.selectionStart,3,'Preserve cursor after removing a digit in the middle');
  await React.act(async()=>input.dispatchEvent(new window.CompositionEvent('compositionstart',{bubbles:true})));
  await enter('にほん1');assert.equal(current,'にほん1','Do not interrupt composition');
  await React.act(async()=>input.dispatchEvent(new window.CompositionEvent('compositionend',{bubbles:true})));
  assert.equal(current,'にほん','Filter when composition completes');
  await enter('');assert.equal(current,'');
  await React.act(async()=>root.render(React.createElement('form',null,
    React.createElement(PasswordInput,{label:'New password',value:'synthetic-password',onChange:()=>{}}),
    React.createElement(PasswordInput,{label:'Confirm password',value:'synthetic-password',onChange:()=>{}}),
    React.createElement(Notice,{tone:'danger'},'Test error'))));
  const passwords=[...document.querySelectorAll('input')];
  const toggles=[...document.querySelectorAll('.field-visibility-toggle')];
  assert.equal(toggles.length,2);
  assert(passwords.every(p=>p.type==='password'));
  await React.act(async()=>toggles[0].click());
  assert.equal(passwords[0].type,'text');assert.equal(passwords[1].type,'password');
  assert.equal(toggles[0].getAttribute('aria-pressed'),'true');
  assert.equal(toggles[0].getAttribute('type'),'button');
  assert.equal(toggles[0].getAttribute('aria-controls'),passwords[0].id);
  await React.act(async()=>toggles[0].click());assert.equal(passwords[0].type,'password');
  assert(document.querySelector('.notice[role="alert"]'));
  Object.defineProperty(passwords[0],'validity',{value:{valid:false,valueMissing:true},configurable:true});
  const invalid=new window.Event('invalid',{cancelable:true});
  await React.act(async()=>passwords[0].dispatchEvent(invalid));
  assert(invalid.defaultPrevented,'Suppress native validation tooltip');
  assert.equal(passwords[0].getAttribute('aria-invalid'),'true');
  assert(document.getElementById(passwords[0].getAttribute('aria-describedby')).textContent.includes('Completa'));
  const toastFile=resolve(folder,'toast.cjs');
  await build({entryPoints:['components/kit/components/ui/Toast.tsx'],bundle:true,platform:'node',format:'cjs',packages:'external',outfile:toastFile});
  const {ToastProvider}=createRequire(import.meta.url)(toastFile);
  await React.act(async()=>root.render(React.createElement(ToastProvider,null,React.createElement('form',null,React.createElement('input',{type:'email',required:true})))));
  const rawField=document.querySelector('input');
  Object.defineProperty(rawField,'validity',{value:{valid:false,typeMismatch:true},configurable:true});
  const rawInvalid=new window.Event('invalid',{bubbles:true,cancelable:true});
  await React.act(async()=>rawField.dispatchEvent(rawInvalid));
  assert(rawInvalid.defaultPrevented);
  assert(document.querySelector('.toast--danger').textContent.includes('correo'));
  await React.act(async()=>document.querySelector('.toast button').click());
  assert.equal(document.querySelector('.toast'),null);
  console.log('PASS global form feedback: raw controls use branded error notification, native tooltip prevented, dismiss works.');
  console.log('PASS password controls: independent visibility, accessible buttons, inline validation without native tooltip and error announcement.');
  console.log('PASS name field DOM: typing/pasted values filtered, Unicode/apostrophes preserved, cursor and composition handled, controlled state updated, deletion allowed.');
} finally { await React.act(async()=>root.unmount()); }
