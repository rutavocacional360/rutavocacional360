import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdirSync,mkdtempSync} from 'node:fs';
import {resolve} from 'node:path';
import {createRequire} from 'node:module';
mkdirSync('.qa-tools',{recursive:true});
const folder=mkdtempSync(resolve('.qa-tools','ai-flows-')),outfile=resolve(folder,'ai.cjs');
await build({stdin:{contents:`export {suggestSimulatorFields,suggestStudyOptions} from './lib/server/simulator-autofill';export {summarizeInstrument} from './lib/server/import-presentation';export {generateAnalyticsInsights} from './lib/server/analytics-insights';export {readAIResponse} from './lib/server/ai-response';export * from './lib/server/academic-content.mjs';`,resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'cjs',packages:'external',outfile});
const api=createRequire(import.meta.url)(outfile),env={GEMINI_API_KEY:'synthetic-fixture',GEMINI_MODEL:'fixture-model'};
const response=(value,reason='STOP')=>new Response(JSON.stringify({candidates:[{finishReason:reason,content:{parts:[{thought:true,text:'not-json-reasoning'},{text:JSON.stringify(value)}]}}]}));
await assert.rejects(api.suggestSimulatorFields({},{}),e=>e.status===503);
await assert.rejects(api.summarizeInstrument({title:'QA',description:'QA'},{}),e=>e.status===503);
for(const [status,expected] of [[401,503],[403,503],[429,429],[503,503]])await assert.rejects(api.readAIResponse(new Response('{}',{status})),e=>e.status===expected);
await assert.rejects(api.readAIResponse(new Response(JSON.stringify({error:{message:'Unsupported response schema PRIVATE_DETAIL'}}),{status:400})),e=>e.code==='AI_REQUEST'&&!e.message.includes('PRIVATE_DETAIL'));
await assert.rejects(api.readAIResponse(new Response(JSON.stringify({error:{details:[{reason:'API_KEY_INVALID'}]}}),{status:400})),e=>e.code==='AI_CONFIG');
await assert.rejects(api.readAIResponse(new Response('{}',{status:404})),e=>e.code==='AI_CONFIG');
await assert.rejects(api.readAIResponse(response({},'MAX_TOKENS')),e=>e.status===502);
await assert.rejects(api.readAIResponse(new Response('invalid JSON')),e=>e.status===502);
const input={title:'Práctica QA',questions:[{id:'q1',text:'Dos más dos',options:[{value:1,label:'Cuatro'}],correctValues:[1]}],careers:[]};
const original=structuredClone(input);
const suggestion=await api.suggestSimulatorFields(input,env,async(_url,request)=>{
 const payload=JSON.parse(request.body);assert.deepEqual(JSON.parse(payload.contents[0].parts[0].text),input);
 assert.equal(payload.generationConfig.responseJsonSchema.properties.instructions.type,'string','The provider schema must allow generating missing instructions');
 return response({title:'Práctica',careerIds:[],questions:[{id:'q1',explanation:'La suma es cuatro.',issue:'',correctValues:[1]}]});
});
assert.equal(suggestion.questions[0].id,'q1');assert.deepEqual(input,original,'AI cannot mutate supplied questions');
let retryCount=0;
await api.summarizeInstrument({title:'QA',description:'QA'},{GEMINI_API_KEY:'  synthetic-fixture  ',GEMINI_MODEL:' models/fixture-model '},async(url,request)=>{
 assert(String(url).endsWith('/fixture-model:generateContent'));assert.equal(request.headers['x-goog-api-key'],'synthetic-fixture');
 return ++retryCount===1?new Response('{}',{status:503}):response({title:'Prueba',summary:'Introducción de prueba.'});
});
assert.equal(retryCount,2,'Temporary upstream errors retry once with normalized configuration');
let quotaCount=0;
await assert.rejects(api.summarizeInstrument({title:'QA',description:'QA'},env,async()=>{quotaCount++;return new Response('{}',{status:429});}),e=>e.code==='AI_LIMIT');
assert.equal(quotaCount,1,'Quota failures must not generate more requests');
await assert.rejects(api.summarizeInstrument({title:'QA',description:'QA'},env,async()=>{throw Object.assign(Error('private host'),{name:'TimeoutError'});}),e=>e.code==='AI_TIMEOUT'&&!e.message.includes('private host'));
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

const studyInput={title:'Informática',description:'Documento QA',educationLevel:'bachillerato',careers:[{id:'bachillerato:informatica',name:'Informática'}]};
const detected=await api.suggestStudyOptions(studyInput,env,async(_url,request)=>{const body=JSON.parse(request.body);assert.deepEqual(JSON.parse(body.contents[0].parts[0].text),studyInput);return response({careerIds:['bachillerato:informatica','software','fake','bachillerato:informatica']});});
assert.deepEqual(detected,['bachillerato:informatica']);
await assert.rejects(api.suggestStudyOptions(studyInput,env,async()=>response({careerIds:'bad'})),e=>e.status===502);
await assert.rejects(api.suggestStudyOptions(studyInput,{}),e=>e.code==='AI_CONFIG');
console.log('PASS study option detection: authoritative IDs, deduplication, malformed responses and missing configuration.');
