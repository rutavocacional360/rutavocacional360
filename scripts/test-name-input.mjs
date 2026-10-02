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
const {Field}=createRequire(import.meta.url)(outfile);
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
  console.log('PASS name field DOM: typing/pasted values filtered, Unicode/apostrophes preserved, cursor and composition handled, controlled state updated, deletion allowed.');
} finally { await React.act(async()=>root.unmount()); }
