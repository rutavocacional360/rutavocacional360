import {importedInstrument} from './import-rules';
import {parseInstructionalCourse} from './import-course';
﻿import {parse} from 'acorn';
const clean=(node:any)=>String(node?.textContent||'').replace(/\s+/g,' ').trim();
function directText(node:any){const copy=node.cloneNode(true);for(const n of copy.querySelectorAll('ol,ul,table'))n.remove();return clean(copy);}
function literal(n:any):any{if(n.type==='Literal')return n.value;if(n.type==='ArrayExpression')return n.elements.map(literal);if(n.type==='ObjectExpression')return Object.fromEntries(n.properties.filter((p:any)=>p.type==='Property'&&!p.computed).map((p:any)=>[p.key.name||p.key.value,literal(p.value)]));throw Error('Solo datos literales');}
export function readDocumentMarkup(document:any){
 const embedded:any[]=[];for(const script of document.querySelectorAll('script')){if(script.getAttribute('type')==='application/json'){try{const value=JSON.parse(script.textContent||'');const list=Array.isArray(value)?value:value.instruments||[value];for(const t of list)if(Array.isArray(t.questions))embedded.push({name:t.title||'Instrumento importado',items:t.questions,data:t});}catch{}script.remove();continue;}try{const ast:any=parse(script.textContent||'',{ecmaVersion:'latest'});for(const n of ast.body){if(n.type!=='VariableDeclaration')continue;for(const d of n.declarations){try{const v=literal(d.init);if(Array.isArray(v)&&v.length&&v.every(x=>x&&typeof(x.q||x.text)==='string'))embedded.push({name:d.id.name,items:v});else if(Array.isArray(v)&&v.length&&/ria/i.test(d.id.name)&&v.every(x=>Array.isArray(x)&&x.length===2&&x.every(y=>typeof y==='string')))embedded.push({name:d.id.name,items:v.map((x,i)=>({id:'q'+i,q:x[1],dim:x[0]}))});}catch{}}}}catch{}script.remove();}
 for(const n of document.querySelectorAll('style,iframe,object,embed,link,meta'))n.remove();
 const tests:any[]=[];let title='',section='',description='',questions:any[]=[],current:any=null,scale:any[]=[],references=false;const lines:string[]=[];
 const referenceHeading=(text:string)=>/^(?:\d+[.)]\s*)?(?:bibliografía|referencias(?:\s+bibliográficas)?|fuentes(?:\s+de\s+(?:consulta|información))?)(?:\s*:|\s*$)/i.test(text);
 const add=(text:string,type='open',options:any[]=[])=>{const q:any={id:'q'+(questions.length+1),text:text.replace(/^\d{1,3}[.)]\s*/,''),type,options,section,source:'Documento · '+(section||title||'pregunta '+(questions.length+1))};const multiple=text.match(/(?:hasta|máximo)\s+(tres|dos|cuatro|cinco|\d+)\s+opciones/i);if(multiple){q.type='multiple';q.maxSelections=Number(multiple[1])||({tres:3,dos:2,cuatro:4,cinco:5} as any)[multiple[1].toLowerCase()];}questions.push(q);current=q;return q;};
 const finish=()=>{if(questions.length)tests.push({name:title||'Instrumento importado',description,items:questions});questions=[];current=null;description='';};
 const paragraph=(text:string)=>{lines.push(text);if(referenceHeading(text)){references=true;current=null;return;}if(/^secci[oó]n\s/i.test(text)){section=text;current=null;references=false;return;}if(references)return;if(/^(instrucciones|propósito|dirigido a|título de la investigación|nota para la aplicación)\s*:/i.test(text)){description+=(description?'\n':'')+text;current=null;return;}
 const numbered=text.match(/^(?:pregunta\s*)?\d{1,3}[.)\-:]\s+(.+)/i);if(numbered){add(numbered[1]);return;}const option=text.match(/^(?:[a-h][.)\-:]|[○◯□☐])\s*(.+)/i);if(option&&current){current.options.push({value:current.options.length+1,label:option[1]});if(current.type==='open')current.type='single';return;}
 const correct=text.match(/^(?:respuesta correcta|clave)\s*:\s*([a-h])/i);if(correct&&current){current.correctValues=[correct[1].toLowerCase().charCodeAt(0)-96];return;}
 if(/^curso y paralelo\b/i.test(text)){add(text,'short');return;}
 // A new prose block ends the option list. Unrelated later lists must never be
 // attached to the last question across an entire document.
 if(!/^[\s.…_·-]{4,}$/.test(text))current=null;
 return;};
 const visit=(node:any)=>{if(node.nodeType!==1)return;const tag=node.tagName.toLowerCase(),text=clean(node);if(!text)return;
 if(/^h[1-6]$/.test(tag)){lines.push(text);current=null;if(referenceHeading(text)){references=true;return;}references=false;if(/cuestionario|entrevista|^test\b|^instrumento\b/i.test(text)){finish();title=text;section='';}else section=text;return;}
 if(tag==='table'){
  const rows=Array.from(node.querySelectorAll('tr')).map((r:any)=>Array.from(r.children).map(clean));lines.push(...rows.map(r=>r.join(' | ')));
  current=null;if(references)return;
  if(rows.length>=3&&/valor/i.test(rows[0][0])&&rows.slice(1).every(r=>/^\d+$/.test(r[0])&&r[1])){scale=rows.slice(1).map(r=>({value:Number(r[0]),label:r[1]}));return;}
  const header=rows[0]||[];if(header.length>=2&&/enunciado|pregunta|ítem/i.test(header[1])){for(const r of rows.slice(1)){if(!r[1]||!/^\d+$/.test(r[0]))continue;const options=header.slice(2).filter(x=>/^\d+$/.test(x)).map(x=>scale.find(s=>s.value===Number(x))||{value:Number(x),label:x});const q=add(r[1],options.length>=2?'likert':'open',options);q.source+=' · ítem '+r[0];}current=null;return;}
  return;
 }
 if(tag==='fieldset'){const legend=node.querySelector('legend');if(legend){const labels=Array.from(node.querySelectorAll('label')).map((l:any,i)=>({value:i+1,label:clean(l)}));const q=add(clean(legend),node.querySelector('input[type=checkbox]')?'multiple':'single',labels);if(!labels.length)q.type='open';lines.push(text);return;}}
 if(tag==='li'){const own=directText(node);if(own){lines.push(own);if(!references){if(node.parentElement?.tagName.toLowerCase()==='ol')add(own);else if(current){current.options.push({value:current.options.length+1,label:own});if(current.type==='open')current.type='single';}}}for(const child of node.children)if(['ol','ul'].includes(child.tagName.toLowerCase()))visit(child);return;}
 if(tag==='p'||tag==='pre'||(['div','section','article','main','span'].includes(tag)&&!node.querySelector('p,div,section,article,fieldset,ol,ul,table,h1,h2,h3'))){
  const copy=node.cloneNode(true);for(const br of copy.querySelectorAll('br'))br.replaceWith(document.createTextNode('\n'));
  for(const line of String(copy.textContent||'').split(/\r?\n/)){const value=line.replace(/\s+/g,' ').trim();if(value)paragraph(value);}
  return;
 }
 // Text and inline elements can sit directly inside body/div between block elements.
 // Accumulate those runs so <br> remains a question/option boundary.
 let inline='';const flushInline=()=>{for(const line of inline.split(/\r?\n/)){const value=line.replace(/\s+/g,' ').trim();if(value)paragraph(value);}inline='';};
 const blocks='p,pre,div,section,article,main,fieldset,ol,ul,li,table,h1,h2,h3,h4,h5,h6';
 for(const child of node.childNodes||[]){if(child.nodeType===3){inline+=child.textContent||'';continue;}if(child.nodeType!==1)continue;const childTag=child.tagName.toLowerCase();if(childTag==='br'){inline+='\n';continue;}if(child.matches(blocks)||child.querySelector(blocks)){flushInline();visit(child);}else{const copy=child.cloneNode(true);for(const br of copy.querySelectorAll('br'))br.replaceWith(document.createTextNode('\n'));inline+=copy.textContent||'';}}
 flushInline();
 };visit(document.body||document.documentElement);finish();
 const text=lines.length?lines.join('\n'):String((document.body||document.documentElement).textContent||'');
 const course=embedded.length?undefined:parseInstructionalCourse(text);
 return {text,course,embedded:embedded.length?embedded:course?[]:tests,warnings:tests.some(t=>/bachillerato|representante legal/i.test(t.description))?['El documento menciona Bachillerato. Comprueba que corresponda al nivel elegido antes de publicarlo.']:[]};
}
export function proposeTests(text:string,embedded:any[],name:string){
 const base=(title:string)=>({schemaVersion:2,id:'test-'+globalThis.crypto.randomUUID(),version:'1',title,description:'Instrumento importado. Revisa su contenido antes de publicar.',source:name,status:'Borrador',group:'Todos los estudiantes',due:'',scoring:'manual',aggregation:'sum',resultRelease:'immediate',options:[],questions:[] as any[]});
 if(embedded.some(e=>!Array.isArray(e.items)||e.items.length>500))throw Error('El límite es de 500 preguntas por instrumento.');
 if(embedded.length)return embedded.map(e=>importedInstrument(e,base(e.name),name));
 if(parseInstructionalCourse(text))return [];
 const items:any[]=[];let q:any,lastOption:any,section='',references=false;const intro:string[]=[];
 for(const raw of text.split(/\r?\n/)){
  const line=raw.trim();if(!line)continue;
  if(/^(?:\d+[.)]\s*)?(?:bibliografía|referencias(?:\s+bibliográficas)?|fuentes(?:\s+de\s+(?:consulta|información))?)(?:\s*:|\s*$)/i.test(line)){references=true;q=null;lastOption=null;continue;}
  if(/^secci[oó]n\s/i.test(line)){section=line;q=null;lastOption=null;references=false;continue;}
  if(references)continue;
  if(/^(instrucciones|propósito|dirigido a|título de la investigación)\s*:/i.test(line)){intro.push(line);q=null;lastOption=null;continue;}
  const question=line.match(/^(?:pregunta\s*)?\d{1,3}[.)\-:]\s+(.+)/i),option=line.match(/^(?:[a-z][.)\-:]|[○◯□☐])\s*(.+)/i);
  if(question){q={text:question[1],options:[],section};items.push(q);lastOption=null;}
  else if(option&&q){lastOption={label:option[1],value:q.options.length+1};q.options.push(lastOption);}
  else if(q&&/^(respuesta correcta|clave)\s*:/i.test(line)){const match=line.match(/:\s*([a-z])/i);if(match)q.correctValues=[match[1].toLowerCase().charCodeAt(0)-96];lastOption=null;}
  else if(!/^(?:\[página\s+\d+\]|(?:página\s*)?\d+\s*(?:de\s*\d+)?)$/i.test(line)){
   if(lastOption)lastOption.label+=' '+line;
   else if(q&&!q.correctValues)q.text+=' '+line;
   else if(!q)intro.push(line);
  }
 }
 for(const item of items){const limit=item.text.match(/(?:hasta|máximo)\s+(tres|dos|cuatro|cinco|\d+)\s+opciones/i);if(limit){item.type='multiple';item.maxSelections=Number(limit[1])||({tres:3,dos:2,cuatro:4,cinco:5} as any)[limit[1].toLowerCase()];}}
 if(!items.length)throw Error('No se detectaron preguntas. Usa listas numeradas, tablas con columnas N.° y Enunciado, o campos HTML con legend y label.');return proposeTests('',[{name:name.replace(/\.[^.]+$/,''),description:intro.join('\n'),items}],name);
}
