import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdirSync,mkdtempSync} from 'node:fs';
import {resolve} from 'node:path';
import {createRequire} from 'node:module';
mkdirSync('.qa-tools',{recursive:true});
const folder=mkdtempSync(resolve('.qa-tools','test-autofill-'));
process.env.DB_DRIVER='sqlite';process.env.DATABASE_PATH=resolve(folder,'qa.sqlite');
const outfile=resolve(folder,'api.cjs');
await build({stdin:{contents:`export * from './lib/server/test-autofill';export {db,put,document} from './lib/server/store';export * from './components/kit/lib/test-draft-completion';export {completeTestDraft} from './components/kit/lib/test-autofill';`,resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'cjs',packages:'external',outfile,plugins:[{name:'server-marker',setup(b){b.onResolve({filter:/^server-only$/},()=>({path:'server-only',namespace:'empty'}));b.onLoad({filter:/.*/,namespace:'empty'},()=>({contents:''}));}}]});
const {completeAssessmentDraft,validateCompletionDraft,db,put,document,completeTestDraft}=createRequire(import.meta.url)(outfile);
const env={GEMINI_API_KEY:'synthetic-fixture',GEMINI_MODEL:'fixture-model'},user={id:'admin-qa',role:'admin',institutionId:'org-qa'},owner='institution:org-qa';
const options=[{id:'o1',value:1,label:'Poco'},{id:'o2',value:5,label:'Mucho'}];
const draft=()=>({id:'test-autofill-qa',version:'1',status:'Borrador',educationLevel:'universidad',title:'Preferencias al estudiar',purpose:'Explorar actividades académicas que interesan a estudiantes que elegirán una carrera.',description:'',source:'',schemaVersion:2,scoring:'manual',aggregation:'sum',options:structuredClone(options),questions:Array.from({length:10},(_,i)=>({id:'q'+(i+1),text:'',type:'likert'})),audience:'selected',studentIds:['PRIVATE_STUDENT_ID'],group:'PRIVATE_GROUP',due:'2027-12-10',durationMinutes:23,maxAttempts:2});
const response=value=>new Response(JSON.stringify({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(value)}]}}]}));
const proposal=input=>({title:'Título propuesto',purpose:'Explorar actividades de estudio.',instructions:'Lee cada actividad y señala cuánto te interesa realizarla.',presentation:{title:'Actividades académicas',summary:'Explora qué actividades de estudio te interesan.'},questions:input.questions.map((q,index)=>({id:q.id,text:'Me interesa la actividad académica '+(index+1)+'.',issue:''}))});
let calls=0;
const provider=(adapt=(value)=>value)=>async(_url,request)=>{calls++;const payload=JSON.parse(request.body),input=JSON.parse(payload.contents[0].parts[0].text);assert(!request.body.includes('PRIVATE_STUDENT_ID')&&!request.body.includes('PRIVATE_GROUP'));return response(await adapt(proposal(input),input));};
const run=(instrument,request=provider(),extra={})=>completeAssessmentDraft(user,{instrument,...extra},env,request);
try{
 await db.migrate();
 const initial=draft(),saved=structuredClone(initial);
 const result=await run(initial);assert(result.complete);assert.equal(result.instrument.questions.length,10);assert(result.instrument.questions.every(q=>q.text.trim()));assert.deepEqual(initial,saved);
 for(const key of ['id','version','status','educationLevel','title','purpose','scoring','aggregation','audience','studentIds','group','due','durationMinutes','maxAttempts','options'])assert.deepEqual(result.instrument[key],initial[key],key+' must remain unchanged');
 assert.match(result.instrument.source,/Borrador generado con IA/);assert(result.completed.includes('Instrucciones'));assert(result.completed.includes('Pregunta 10'));assert.equal((await document(owner,'rv360:custom-tests',[])).length,0,'Generation never stores or publishes a draft');
 const manual=draft();manual.description='Instrucciones manuales que siempre deben conservarse.';manual.presentation={title:'Manual',summary:'Introducción escrita por el administrador.'};manual.questions[0]={id:'q1',text:'Texto manual intacto.',type:'single',policy:'objective',options:[{value:1,label:'Sí'},{value:2,label:'No'}],correctValues:[2],weight:7};
 const preserved=await run(manual);assert.deepEqual(preserved.instrument.questions[0],manual.questions[0]);assert.equal(preserved.instrument.description,manual.description);assert.deepEqual(preserved.instrument.presentation,manual.presentation);
 const sharedLabels={...draft(),options:[{id:'low',value:1,label:'Poco',points:8},{id:'high',value:5,label:'',points:9}]};
 const labelsCompleted=await run(sharedLabels,provider(value=>({...value,questions:value.questions.map(q=>({...q,options:[{value:1,label:'No debe reemplazar Poco'},{value:5,label:'Mucho'}]}))})));
 assert(labelsCompleted.complete);assert.deepEqual(labelsCompleted.instrument.options,sharedLabels.options,'The common manual scale is preserved');
 for(const q of labelsCompleted.instrument.questions){assert.deepEqual(q.options,[{id:'low',value:1,label:'Poco',points:8},{id:'high',value:5,label:'Mucho',points:9}],'Missing inherited labels are completed per question without changing values, IDs or points');}
 const math={...draft(),options:[],questions:[{id:'math-q',text:'',type:'single',options:[]}]};
 const inequalities=await run(math,provider(value=>({...value,instructions:'Compara los valores usando < y >.',questions:[{id:'math-q',text:'Si x < 5 y x > 2, elige el intervalo.',options:[{value:1,label:'2 < x < 5'},{value:2,label:'x > 5'}],issue:''}]})));
 assert(inequalities.complete);assert.equal(inequalities.instrument.questions[0].text,'Si x < 5 y x > 2, elige el intervalo.');assert.equal(inequalities.instrument.questions[0].options[0].label,'2 < x < 5');assert.equal(inequalities.instrument.description,'Compara los valores usando < y >.');
 const markup=await run(math,provider(value=>({...value,questions:[{id:'math-q',text:'<script>alert(1)</script>',options:[{value:1,label:'<img src=x onerror=alert(1)>'},{value:2,label:'Texto correcto'}],issue:''}]})));
 assert(!markup.complete);assert.equal(markup.instrument.questions[0].text,'');assert.equal(markup.instrument.questions[0].options[0].label,'','HTML is not accepted as question content');
 const placeholder={...draft(),description:'Instrumento importado. Revisa su contenido antes de publicar.'};assert((await run(placeholder)).complete);assert.notEqual((await run(placeholder)).instrument.description,placeholder.description);
 const before=calls;await assert.rejects(run({...draft(),purpose:'',description:placeholder.description}),e=>e.status===422);assert.equal(calls,before,'Importer boilerplate is not authorization to invent a test topic');
 await assert.rejects(run({...draft(),status:'Publicado'}),e=>e.status===400);
 await assert.rejects(completeAssessmentDraft({...user,role:'student'},{instrument:draft()},env,provider()),e=>e.status===403);
 for(const invalid of [{...draft(),questions:[{id:'bad',text:'',options:{}}]},{...draft(),questions:[{id:'x',text:''},{id:'x',text:''}]},{...draft(),educationLevel:'ambos'},JSON.parse(JSON.stringify(draft()).replace('"version":"1"','"version":"1","__proto__":{"polluted":true}'))])assert.throws(()=>validateCompletionDraft(invalid),e=>e.status===400);
 await assert.rejects(run(draft(),provider(value=>({...value,questions:value.questions.slice(1)}))),e=>e.status===502);
 await assert.rejects(run(draft(),provider(value=>({...value,questions:value.questions.map(q=>({...q,id:'same'}))}))),e=>e.status===502);
 await assert.rejects(run(draft(),provider(value=>({...value,questions:value.questions.map(q=>({...q,correctValues:[5]}))}))),e=>e.status===502,'The provider cannot invent keys');
 const partial=await run(draft(),provider(value=>({...value,questions:value.questions.map((q,index)=>index? q:{...q,text:'',issue:'Falta contexto para esta pregunta.'})})));assert(!partial.complete);assert(partial.issues.some(issue=>issue.questionId==='q1'));assert.equal(partial.instrument.questions[0].text,'');
 const objective={...draft(),scoring:'objective',source:'Fuente QA',questions:[{id:'q1',text:'¿Cuánto es dos más dos?',type:'single',options:[{value:1,label:'Cuatro'},{value:2,label:'Cinco'}]}]};
 const noKey=await run(objective);assert(!noKey.complete);assert(noKey.issues.some(issue=>/clave correcta/.test(issue.message)));assert.equal(noKey.instrument.questions[0].correctValues,undefined,'Missing keys require documentary evidence, never an AI guess');

 // Recover the exact ten missing questions from an institution-owned import.
 const imported={...draft(),sourceId:'source-qa',source:'original.docx',scoring:'objective',options:[],questions:Array.from({length:10},(_,i)=>({id:'q'+(i+1),text:'',type:'single',options:[]}))};
 const source={...imported,purpose:'Propósito documentado de la evaluación.',description:'Selecciona la respuesta correcta según el documento.',questions:imported.questions.map((q,index)=>({...q,text:'Pregunta original '+(index+1)+' del documento.',options:[{value:1,label:'Respuesta documentada'},{value:2,label:'Alternativa documentada'}],correctValues:[1]}))};
 const record={id:'source-qa',status:'Completado',educationLevel:'universidad',name:'original.docx',text:source.questions.map(q=>q.text+' Respuesta documentada Alternativa documentada').join('\n'),tests:[source]};
 await put(owner,'rv360:imports',[record]);
 const recovered=await run(imported,provider((value,input)=>{assert.equal(input.mode,'recover-source');assert.equal(input.questions.length,0,'Known source questions are restored deterministically without model invention');return value;}));
 assert(recovered.complete);assert.equal(recovered.instrument.description,source.description);for(const [index,q] of recovered.instrument.questions.entries()){assert.equal(q.text,source.questions[index].text);assert.deepEqual(q.correctValues,[1]);assert.equal(q.id,imported.questions[index].id);}
 const editedSource={...structuredClone(imported),questions:imported.questions.map((q,index)=>index?q:{...q,text:'Enunciado reescrito por el administrador.'})};
 const editedRecovery=await run(editedSource);assert(!editedRecovery.complete);assert.equal(editedRecovery.instrument.questions[0].text,editedSource.questions[0].text);assert.equal(editedRecovery.instrument.questions[0].correctValues,undefined,'A stable ID cannot transfer an old key onto a rewritten enunciado');
 const editedOption={...structuredClone(imported),questions:imported.questions.map((q,index)=>index?q:{...q,options:[{value:1,label:'Respuesta diferente redactada manualmente'},{value:2,label:'Alternativa documentada'}]})};
 const editedOptionRecovery=await run(editedOption);assert(!editedOptionRecovery.complete);assert.equal(editedOptionRecovery.instrument.questions[0].correctValues,undefined,'Changed option meanings invalidate missing source rules');
 const sourcePolicies={...record,tests:[{...source,questions:source.questions.map(q=>({...q,policy:'objective'}))}]};
 await put(owner,'rv360:imports',[sourcePolicies]);
 const manualPolicy=await run({...structuredClone(imported),scoring:'manual'});assert(manualPolicy.complete);assert(manualPolicy.instrument.questions.every(q=>q.policy===undefined),'Recovery cannot override an explicit manual global policy');
 await put(owner,'rv360:imports',[record]);
 await assert.rejects(completeAssessmentDraft({...user,institutionId:'other-org'},{instrument:imported},env,provider()),e=>e.status===422);
 await put(owner,'rv360:imports',[{...record,educationLevel:'bachillerato'}]);await assert.rejects(run(imported),e=>e.status===422);
 await put(owner,'rv360:imports',[{...record,tests:[]}]);
 const fabricated=await run(imported);assert(!fabricated.complete);assert(fabricated.instrument.questions.every(q=>!q.text.trim()));assert(fabricated.issues.length>=10,'Unsubstantiated generated text is never presented as imported content');
 const transcribed=await run({...imported,scoring:'manual'},provider((value,input)=>({...value,questions:input.questions.map((q,index)=>({id:q.id,text:source.questions[index].text,options:source.questions[index].options,issue:''}))})));assert(transcribed.complete);assert(transcribed.instrument.questions.every((q,index)=>q.text===source.questions[index].text));
 await put(owner,'rv360:imports',[record]);
 await put(owner,'rv360:custom-tests',[imported]);
 await assert.rejects(run({...imported,version:'2'}),e=>e.status===409);
 await assert.rejects(run(imported,provider(async(value)=>{await put(owner,'rv360:custom-tests',[{...imported,title:'Edición concurrente'}]);return value;})),e=>e.status===409,'Concurrent saved edits invalidate the response');
 await put(owner,'rv360:custom-tests',[]);
 await assert.rejects(completeAssessmentDraft(user,{instrument:draft()},{}),e=>e.code==='AI_CONFIG');
 await assert.rejects(run(draft(),async()=>new Response('{}',{status:429})),e=>e.code==='AI_LIMIT');
 await assert.rejects(run(draft(),async()=>new Response('broken')),e=>e.status===502);

 // Browser helper independently rejects a response that overwrites manual data.
 const previousFetch=globalThis.fetch;
 try{
  globalThis.fetch=async()=>new Response(JSON.stringify(result),{headers:{'Content-Type':'application/json'}});
  assert((await completeTestDraft(initial)).complete);
  globalThis.fetch=async()=>new Response(JSON.stringify({...result,instrument:{...result.instrument,status:'Publicado'}}),{headers:{'Content-Type':'application/json'}});
  await assert.rejects(completeTestDraft(initial),/cambiar datos existentes/);
  globalThis.fetch=async()=>new Response(JSON.stringify({...result,instrument:{...result.instrument,questions:result.instrument.questions.map((q,index)=>index?q:{...q,id:'other'})}}),{headers:{'Content-Type':'application/json'}});
  await assert.rejects(completeTestDraft(initial),/cambiar datos existentes/);
 }finally{globalThis.fetch=previousFetch;}
 console.log('PASS full test draft AI: ten blank questions, preserved manual fields/IDs/settings, literal source recovery and keys, no invention, incomplete/malformed responses, authorization, route/source boundaries, concurrent edits, no automatic persistence/publication and client response validation.');
}finally{await db.close();}
