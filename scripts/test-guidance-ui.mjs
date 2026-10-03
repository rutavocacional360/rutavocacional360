import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {mkdirSync,mkdtempSync} from 'node:fs';
import {resolve} from 'node:path';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';

mkdirSync('.qa-tools',{recursive:true});
const folder=mkdtempSync(resolve('.qa-tools','guidance-ui-'));
await build({stdin:{contents:`export {BaccalaureateResult} from './components/kit/features/student/BaccalaureateResult';export {BaccalaureateFields} from './components/kit/components/domain/BaccalaureateFields';export {schoolGuidance} from './components/kit/lib/school-guidance';`,resolveDir:process.cwd(),loader:'tsx'},jsx:'automatic',bundle:true,platform:'node',packages:'external',format:'cjs',outfile:resolve(folder,'ui.cjs'),loader:{'.css':'empty'},plugins:[{name:'fixture-session',setup(build){build.onResolve({filter:/\/lib\/session$/},()=>({path:'session',namespace:'fixture'}));build.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export function useSession(){return {user:{role:globalThis.__guidanceTestRole}}}'}));}}]});
const {BaccalaureateResult,BaccalaureateFields,schoolGuidance}=createRequire(import.meta.url)(resolve(folder,'ui.cjs'));
const pathway=schoolGuidance(['R','I','A','S','E','C'].map(d=>({dimension:d,raw:d==='R'?25:d==='I'?20:10})),[],{baccalaureate:'tecnico',specialty:'Informática',learningPreference:'aplicar'},[{id:'software',name:'Ingeniería de Software',areaId:'tecnologia'}]);
try{
 globalThis.__guidanceTestRole='student';
 const html=renderToStaticMarkup(React.createElement(BaccalaureateResult,{pathway,onCareer:()=>{}}));
 for(const label of ['Tu perfil muestra afinidad con Bachillerato Técnico','Bachillerato en Ciencias','Informática','Ingeniería de Software','Recomendaciones para avanzar','/mi-ruta/perfil'])assert(html.includes(label),label);
 assert(html.indexOf('TU PERFIL DE BACHILLERATO')<html.indexOf('TU PASO A LA UNIVERSIDAD'));
 assert(!html.includes('NaN'));
 assert(html.includes('Modalidad recomendada: Bachillerato Técnico'));
 const renderPath=(p,readiness)=>renderToStaticMarkup(React.createElement(BaccalaureateResult,{pathway:p,readiness}));
 assert(renderPath({...pathway,suggested:'ciencias'}).includes('Modalidad recomendada: Bachillerato en Ciencias'));
 assert(renderPath({...pathway,suggested:'ambas'}).includes('Afinidad con ambas modalidades'));
 const pending=renderPath(pathway,{ready:false,total:3,completed:1,pending:[{id:'a',title:'Intereses pendientes',state:'not_started'},{id:'b',title:'Resultados por publicar',state:'awaiting_results'}]});
 for(const label of ['Resultado pendiente: Técnico o Ciencias','1 de 3','Intereses pendientes','Pendiente de publicación','Continuar mis tests'])assert(pending.includes(label),label);
 assert(!pending.includes('Modalidad recomendada:'));
 assert(!pending.includes('TU PASO A LA UNIVERSIDAD'));
 globalThis.__guidanceTestRole='admin';
 assert(!renderToStaticMarkup(React.createElement(BaccalaureateResult,{pathway})).includes('/mi-ruta/perfil'));
 const value={province:'',canton:'',parish:'',schoolId:'',institution:'',baccalaureate:'tecnico',specialty:'Informática',learningPreference:'aplicar'};
 const form=renderToStaticMarkup(React.createElement(BaccalaureateFields,{value,onChange:()=>{}}));
 assert(form.includes('Especialidad o figura profesional'));assert(form.includes('value="Informática"'));
 assert(!form.includes('<datalist'),'Specialties must use the styled search control');
 assert(form.includes('role="combobox"'),'Specialties must remain keyboard accessible');
 const science=renderToStaticMarkup(React.createElement(BaccalaureateFields,{value:{...value,baccalaureate:'ciencias'},onChange:()=>{}}));
 assert(!science.includes('Especialidad o figura profesional'));
 console.log('PASS rendered UI: ordered pathway, school-to-university links, visible recommendations, role-specific controls and persisted profile values.');
}finally{delete globalThis.__guidanceTestRole;}
