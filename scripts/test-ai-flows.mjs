import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdirSync,mkdtempSync} from 'node:fs';
import {resolve} from 'node:path';
import {createRequire} from 'node:module';
mkdirSync('.qa-tools',{recursive:true});
const folder=mkdtempSync(resolve('.qa-tools','ai-flows-')),outfile=resolve(folder,'ai.cjs');
await build({stdin:{contents:`export {suggestSimulatorFields} from './lib/server/simulator-autofill';export {summarizeInstrument} from './lib/server/import-presentation';export {generateAnalyticsInsights} from './lib/server/analytics-insights';export {readAIResponse} from './lib/server/ai-response';export * from './lib/server/academic-content.mjs';`,resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'cjs',packages:'external',outfile});
const api=createRequire(import.meta.url)(outfile),env={GEMINI_API_KEY:'synthetic-fixture',GEMINI_MODEL:'fixture-model'};
const response=(value,reason='STOP')=>new Response(JSON.stringify({candidates:[{finishReason:reason,content:{parts:[{thought:true,text:'not-json-reasoning'},{text:JSON.stringify(value)}]}}]}));
await assert.rejects(api.suggestSimulatorFields({},{}),e=>e.status===503);
await assert.rejects(api.summarizeInstrument({title:'QA',description:'QA'},{}),e=>e.status===503);
for(const [status,expected] of [[401,503],[403,503],[429,429],[503,503]])await assert.rejects(api.readAIResponse(new Response('{}',{status})),e=>e.status===expected);
await assert.rejects(api.readAIResponse(response({},'MAX_TOKENS')),e=>e.status===502);
await assert.rejects(api.readAIResponse(new Response('invalid JSON')),e=>e.status===502);
const input={title:'Práctica QA',questions:[{id:'q1',text:'Dos más dos',options:[{value:1,label:'Cuatro'}],correctValues:[1]}],careers:[]};
const original=structuredClone(input);
const suggestion=await api.suggestSimulatorFields(input,env,async(_url,request)=>{
 const payload=JSON.parse(request.body);assert.deepEqual(JSON.parse(payload.contents[0].parts[0].text),input);
 return response({title:'Práctica',careerIds:[],questions:[{id:'q1',explanation:'La suma es cuatro.',issue:'',correctValues:[1]}]});
});
assert.equal(suggestion.questions[0].id,'q1');assert.deepEqual(input,original,'AI cannot mutate supplied questions');
const summary=await api.summarizeInstrument({title:'Intereses',description:'Explora tus preferencias.'},env,async()=>response({title:'Intereses',summary:'Explora tus preferencias.'}));assert.equal(summary.title,'Intereses');
const metrics={students:0,active:0,started:0,completed:0,reports:0,pendingReports:0,days:14,current:0,previous:0};
await assert.rejects(api.generateAnalyticsInsights(metrics,{}),e=>e.status===503);
const insight=await api.generateAnalyticsInsights(metrics,env,async(_url,request)=>{
 const payload=JSON.parse(request.body);assert.deepEqual(JSON.parse(payload.contents[0].parts[0].text),metrics);
 return response({summary:'Todavía no hay estudiantes.',actions:[{title:'Preparar el acceso',evidence:'Hay cero estudiantes.',action:'Revisar las invitaciones.',priority:'alta'}]});
});assert.equal(insight.source,'gemini');
const previousFetch=globalThis.fetch,previousKey=process.env.GEMINI_API_KEY,previousModel=process.env.GEMINI_MODEL,previousPath=process.env.ACADEMIC_CONTENT_PATH;
try {
 process.env.GEMINI_API_KEY=env.GEMINI_API_KEY;delete process.env.GEMINI_MODEL;process.env.ACADEMIC_CONTENT_PATH=resolve(folder,'academic.json');
 let calls=0;
 globalThis.fetch=async(url,request)=>{
  calls++;assert(String(url).includes('gemini-3.1-flash-lite'));
  if(!String(url).endsWith(':generateContent'))return new Response(JSON.stringify({supportedGenerationMethods:['generateContent']}));
  const payload=JSON.parse(request.body),data=JSON.parse(payload.contents[0].parts[0].text);
  assert.deepEqual(Object.keys(data).sort(),['catalogSource','categories','version']);
  assert(!JSON.stringify(data).includes('studentId'));assert(!JSON.stringify(data).includes('answers'));
  return response({categories:api.areas.map(a=>({id:a.id,explanation:'Explora asignaturas y actividades de esta área.',questions:['¿Qué actividades te gustaría conocer?','¿Qué asignaturas te interesa comparar?']}))});
 };
 const academic=await api.refreshAcademicContent();assert.equal(academic.source,'gemini');assert.equal(academic.categories.length,api.areas.length);
 assert.equal(api.readAcademic().source,'gemini','Student reports consume the generated shared content');
 assert((await api.refreshAcademicContent()).reused);assert.equal(calls,2,'Reuses validated content rather than charging for every student');
 process.env.ACADEMIC_CONTENT_PATH=resolve(folder,'not-configured.json');delete process.env.GEMINI_API_KEY;
 await assert.rejects(api.refreshAcademicContent(),/GEMINI_CONFIGURATION/);
 assert.equal(api.readAcademic().source,'local','Fallback accurately identifies local content');
} finally {
 globalThis.fetch=previousFetch;
 for(const [key,value] of [['GEMINI_API_KEY',previousKey],['GEMINI_MODEL',previousModel],['ACADEMIC_CONTENT_PATH',previousPath]])if(value===undefined)delete process.env[key];else process.env[key]=value;
}
console.log('PASS AI integration with controlled provider: admin analytics, simulator suggestions, summaries, student academic content, cache, missing credentials, quota, incomplete JSON and truthful fallback.');
