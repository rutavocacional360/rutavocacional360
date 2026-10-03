import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdirSync,mkdtempSync} from 'node:fs';
import {resolve} from 'node:path';
import {createRequire} from 'node:module';

mkdirSync('.qa-tools',{recursive:true});
const folder=mkdtempSync(resolve('.qa-tools','student-ai-'));
process.env.DB_DRIVER='sqlite';
process.env.DATABASE_PATH=resolve(folder,'private-cache.sqlite');
const outfile=resolve(folder,'student-ai.cjs');
await build({stdin:{contents:`export * from './lib/server/student-guidance-ai'; export {db,document} from './lib/server/store';`,resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'cjs',packages:'external',outfile,
 plugins:[{name:'server-marker',setup(b){b.onResolve({filter:/^server-only$/},()=>({path:'server-only',namespace:'empty'}));b.onLoad({filter:/.*/,namespace:'empty'},()=>({contents:''}));}}]});
const api=createRequire(import.meta.url)(outfile);
const env={GEMINI_API_KEY:'synthetic-guidance-key',GEMINI_MODEL:'mock-model'};
const codes=['R','I','A','S','E','C'];
const instrument=(id,level,values)=>({instrumentId:id,instrument:{educationLevel:level,title:'Private title must stay local'},answers:{secret:'Never send raw answers'},scores:codes.map((dimension,index)=>({dimension,value:values[index],min:5,max:25}))});
const report={student:{id:'private-id',name:'Private Student',email:'private@example.test'},instruments:[instrument('school-interest','bachillerato',[24,10,14,13,12,11]),instrument('university-interest','universidad',[9,23,14,14,10,9])],
 catalog:[{id:'software',name:'Ingeniería de Software'},{id:'medicina',name:'Medicina'}],
 analysis:{pathway:{suggested:'tecnico',profile:{stage:'Private raw stage'},science:[{id:'ciencias-exactas',name:'Ciencias exactas',evidence:['school-interest:dimension:I']}],technical:[{id:'informatica',name:'Informática',evidence:['school-interest:dimension:R']}]},recommendations:[{careerId:'software',evidence:['university-interest:dimension:I']}]}};
const original=structuredClone(report);
const response=(value,finishReason='STOP')=>new Response(JSON.stringify({modelVersion:'mock-model-version',candidates:[{finishReason,content:{parts:[{thought:true,text:'private reasoning must be ignored'},{text:JSON.stringify(value)}]}}]}));
const schoolResult={summary:'Tus intereses prácticos invitan a explorar Bachillerato Técnico y contrastarlo con actividades concretas.',modality:'tecnico',reasons:[{candidateId:'modalidad:tecnico',reason:'Tus resultados muestran interés en trabajar con proyectos y herramientas.',evidence:['school-interest:dimension:R']},{candidateId:'informatica',reason:'Puedes explorar Informática mediante actividades prácticas y proyectos escolares.',evidence:['school-interest:dimension:R']}],nextSteps:['Visita un taller escolar y conversa con el docente.','Compara las asignaturas y realiza una actividad práctica.']};
const universityResult={summary:'Tus intereses de investigación se relacionan con las actividades de Ingeniería de Software.',modality:'no-aplica',reasons:[{candidateId:'software',reason:'Tu interés por investigar invita a explorar el análisis y construcción de sistemas.',evidence:['university-interest:dimension:I']}],nextSteps:['Compara las asignaturas de los programas oficiales.','Prueba una actividad de programación y conversa con un orientador.']};
const newCache=()=>{const values=new Map();return {values,read:async key=>structuredClone(values.get(key)),write:async(key,value)=>{values.set(key,structuredClone(value));}};};
const run=(value,options={})=>api.analyzeStudentGuidance(report,{educationLevel:'bachillerato',ready:true,env,cache:newCache(),request:async()=>response(value),...options});

try {
 let calls=0;
 const noCall=async()=>{calls++;throw Error('A locked or unconfigured route must not call a provider.');};
 assert.equal((await run(null,{ready:false,request:noCall})).status,'pending');
 assert.equal((await run(null,{env:{},request:noCall})).status,'not_configured');
 assert.equal((await run(null,{env:{GEMINI_API_KEY:'isolated-ci-not-a-provider-key'},request:noCall})).status,'not_configured');
 assert.equal((await run(null,{env:{...env,GUIDANCE_AI_ENABLED:'false'},request:noCall})).status,'not_configured');
 assert.equal(calls,0);
 assert.notEqual(api.studentAIConfigSignature({}),api.studentAIConfigSignature(env));
 assert.notEqual(api.studentAIConfigSignature(env),api.studentAIConfigSignature({...env,GEMINI_API_KEY:'rotated-fixture-key'}));
 const sharedCache=newCache();
 const options={educationLevel:'bachillerato',ready:true,env,cache:sharedCache,request:async(url,request)=>{
  calls++;assert(String(url).endsWith('mock-model:generateContent'));
  const payload=JSON.parse(request.body),input=JSON.parse(payload.contents[0].parts[0].text),serialized=JSON.stringify(input);
  for(const forbidden of ['private-id','Private Student','private@example.test','answers','secret','Private title','Private raw stage','software','university-interest'])assert(!serialized.includes(forbidden),forbidden+' must remain private or in its own route');
  assert.deepEqual(input.instruments.map(item=>item.id),['school-interest']);
  assert(payload.generationConfig.responseJsonSchema.properties.reasons.items.properties.candidateId.enum.includes('modalidad:tecnico'));
  assert(!payload.generationConfig.responseJsonSchema.properties.reasons.items.properties.candidateId.enum.includes('software'));
  assert.equal(request.headers['x-goog-api-key'],env.GEMINI_API_KEY);
  return response(schoolResult);
 }};
 const [first,concurrent]=await Promise.all([api.analyzeStudentGuidance(report,options),api.analyzeStudentGuidance(report,options)]);
 assert.equal(first.status,'available');assert.equal(first.source,'gemini');assert.equal(first.model,'mock-model-version');assert.deepEqual(first.reasons,schoolResult.reasons);assert.deepEqual(first,concurrent);assert.equal(calls,1,'Concurrent requests deduplicate provider calls');
 assert((await api.analyzeStudentGuidance(report,{...options,regenerate:true})).reused);assert.equal(calls,1,'Refreshing an unchanged report does not charge again');
 const changedOtherRoute=structuredClone(report);changedOtherRoute.instruments[1].scores[0].value=25;
 assert((await api.analyzeStudentGuidance(changedOtherRoute,options)).reused);assert.equal(calls,1,'The other route must not affect this input hash');
 const changedSchool=structuredClone(report);changedSchool.instruments[0].scores[0].value=23;
 await api.analyzeStudentGuidance(changedSchool,options);assert.equal(calls,2,'New scores invalidate the analysis');
 assert.deepEqual(report,original,'AI cannot mutate the report or its evidence');
 const university=await run(universityResult,{educationLevel:'universidad',request:async(_url,request)=>{
  const input=JSON.parse(JSON.parse(request.body).contents[0].parts[0].text);
  assert.equal(input.modality,null);assert.deepEqual(input.instruments.map(item=>item.id),['university-interest']);assert.deepEqual(input.candidates.map(item=>item.id),['software']);
  assert(!JSON.stringify(input).includes('informatica'));return response(universityResult);
 }});assert.equal(university.status,'available');
 const empty=structuredClone(report);empty.analysis.pathway={suggested:'pendiente',science:[],technical:[]};
 assert.equal((await api.analyzeStudentGuidance(empty,{...options,cache:newCache(),request:noCall})).status,'pending');
 const tampered=[
  {...schoolResult,modality:'ciencias'},
  {...schoolResult,reasons:[{...schoolResult.reasons[0],candidateId:'software'}]},
  {...schoolResult,reasons:[{...schoolResult.reasons[0],evidence:['university-interest:dimension:I']}]},
  {...schoolResult,reasons:[schoolResult.reasons[1]]},
  {...schoolResult,summary:'Eres apto para una especialidad y tienes éxito garantizado.'},
  {...schoolResult,summary:'Explora Universidad y carreras universitarias recomendadas.'},
  {...schoolResult,summary:'Tus respuestas indican una afinidad del 99% con la especialidad.'},
  {...schoolResult,extra:'must not exist'},
  {...schoolResult,nextSteps:['Una sola acción no completa el informe.']},
 ];
 for(const value of tampered){const invalid=await run(value);assert.equal(invalid.status,'error');assert.equal(invalid.source,'local');assert.equal(invalid.error.code,'AI_VALIDATION');assert(!invalid.summary,'An invalid provider response must not appear as a student result');}
 assert.equal((await run({...universityResult,summary:'Primero elige Bachillerato Técnico como especialidad.'},{educationLevel:'universidad'})).error.code,'AI_VALIDATION');
 assert.equal((await run({...schoolResult,summary:'Esta orientación describe tus intereses y no certifica aptitud ni garantiza éxito.'})).status,'available','Honest caveats must not invalidate a provider answer');
 for(const [status,code] of [[401,'AI_CONFIG'],[403,'AI_CONFIG'],[429,'AI_LIMIT'],[503,'AI_PROVIDER']]){
  let attempts=0;const failed=await run(null,{request:async()=>{attempts++;return new Response('{}',{status});}});
  assert.equal(failed.status,'error');assert.equal(failed.error.code,code);assert.equal(attempts,status===503?2:1,'Retries are bounded and do not retry quota or bad keys');
 }
 assert.equal((await run(null,{request:async()=>response(schoolResult,'MAX_TOKENS')})).error.code,'AI_RESPONSE');
 assert.equal((await run(null,{request:async()=>new Response('invalid-json')})).error.code,'AI_RESPONSE');
 assert.equal((await run(null,{request:async()=>{throw Object.assign(Error('Private network detail'),{name:'TimeoutError'});}})).error.code,'AI_TIMEOUT');
 const unsafeError=await run(null,{request:async()=>{throw Error('Secret transport configuration');}});assert(!unsafeError.error.message.includes('Secret'));
 const errorCache=newCache();let errorCalls=0;
 const errorOptions={...options,cache:errorCache,request:async()=>{errorCalls++;return new Response('{}',{status:429});}};
 await api.analyzeStudentGuidance(report,errorOptions);
 assert((await api.analyzeStudentGuidance(report,errorOptions)).reused);assert.equal(errorCalls,1,'Cooldown prevents repeated charges/errors');
 let retryCalls=0;assert.equal((await run(schoolResult,{request:async()=>++retryCalls===1?new Response('{}',{status:503}):response(schoolResult)})).status,'available');assert.equal(retryCalls,2);

 // Verify real private SQLite persistence and atomic daily budgeting, with a mocked provider.
 await api.db.migrate();
 let persistedCalls=0;
 const persistentOptions={educationLevel:'bachillerato',ready:true,env:{...env,AI_GUIDANCE_DAILY_REQUEST_LIMIT:'1'},request:async()=>{persistedCalls++;return response(schoolResult);}};
 assert.equal((await api.analyzeStudentGuidance(report,persistentOptions)).status,'available');
 assert((await api.analyzeStudentGuidance(report,persistentOptions)).reused);assert.equal(persistedCalls,1);
 const operational=await api.readStudentGuidanceAIStatus(env);assert(operational.configured&&operational.lastSuccessAt);assert(!JSON.stringify(operational).includes(env.GEMINI_API_KEY));
 const quota=await api.analyzeStudentGuidance(changedSchool,persistentOptions);assert.equal(quota.status,'error');assert.equal(quota.error.code,'AI_DAILY_LIMIT');assert.equal(persistedCalls,1);
 const privateState=await api.document('system','guidance-ai:status');assert(!JSON.stringify(privateState).includes('private-id'));assert(!JSON.stringify(privateState).includes('Private Student'));
 const nestedReport=structuredClone(report);nestedReport.instruments[0].scores[0].value=22;
 const nested=await api.db.transaction(()=>api.analyzeStudentGuidance(nestedReport,{...persistentOptions,env:{...env,AI_GUIDANCE_DAILY_REQUEST_LIMIT:'2'}}));
 assert.equal(nested.status,'available','Budget reservation must support callers already inside an enrollment transaction');assert.equal(persistedCalls,2);
 console.log('PASS student AI: route isolation, aggregate privacy, candidate/evidence validation, current configuration, truthful errors, timeout, bounded retries, concurrency dedupe, private persistence and daily budget.');
} finally {await api.db.close();}
