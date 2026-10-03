// Opt-in check: sends synthetic educational examples, never student records.
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdirSync,mkdtempSync} from 'node:fs';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import nextEnv from '@next/env';

nextEnv.loadEnvConfig(process.cwd(),true,{info(){},error(){}});
if(!process.env.GEMINI_API_KEY?.trim()||process.env.GEMINI_API_KEY==='REEMPLAZAR'){
 console.error('Falta GEMINI_API_KEY. Configúrala en .env.local o en el entorno privado y ejecuta npm run test:ai:live. No se envió ninguna solicitud.');
 process.exit(1);
}
mkdirSync('.qa-tools',{recursive:true});
const folder=mkdtempSync(resolve('.qa-tools','ai-live-')),outfile=resolve(folder,'check.cjs');
await build({stdin:{contents:`export {suggestStudyOptions,suggestSimulatorFields} from './lib/server/simulator-autofill';export {schoolTrainingTargets} from './components/kit/data/school-training';export {analyzeStudentGuidance} from './lib/server/student-guidance-ai';export {diagnosticReport} from './lib/server/ai-diagnostics';`,resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'cjs',packages:'external',outfile,
 plugins:[{name:'server-marker',setup(b){b.onResolve({filter:/^server-only$/},()=>({path:'server-only',namespace:'empty'}));b.onLoad({filter:/.*/,namespace:'empty'},()=>({contents:''}));}}]});
const require=createRequire(import.meta.url),api=require(outfile),catalog=require('../lib/server/data/ecuador-offer.json');
try{
 for(const educationLevel of ['bachillerato','universidad']){
  const result=await api.analyzeStudentGuidance(api.diagnosticReport(educationLevel),{educationLevel,ready:true,cache:{read:async()=>null,write:async()=>{}}});
  assert.equal(result.status,'available','Orientación '+educationLevel+': '+(result.error?.message||result.status));
  console.log('PASS IA real: orientación validada de '+educationLevel+'.');
 }
 const school=api.schoolTrainingTargets.find(c=>/informática/i.test(c.name));
 const university=catalog.careers.find(c=>/^software$/i.test(c.name));
 assert(school&&university,'El catálogo necesita las opciones de prueba.');
 for(const [educationLevel,target,careers] of [['bachillerato',school,api.schoolTrainingTargets],['universidad',university,catalog.careers]]){
  const input={educationLevel,title:target.name,description:`Documento sintético para explorar exclusivamente ${target.name}. Actividades de programación y desarrollo de software.`,careers:careers.map(({id,name})=>({id,name}))};
  const ids=await api.suggestStudyOptions(input);
  assert(ids.includes(target.id),'La IA debe reconocer la opción explícita del documento.');
  assert(ids.every(id=>careers.some(c=>c.id===id)),'La IA debe conservar el catálogo de la ruta.');
  console.log('PASS IA real: detección de opciones de '+educationLevel+'.');
 }
 const result=await api.suggestSimulatorFields({educationLevel:'bachillerato',title:'Práctica de aritmética',description:'Ejemplo sintético, calcula dos más dos.',careers:[{id:school.id,name:school.name}],questions:[{id:'q1',text:'¿Cuánto es 2 + 2?',type:'single',options:[{value:10,label:'4'},{value:20,label:'5'}]}]});
 const question=result.questions.find(q=>q.id==='q1');
 assert.deepEqual(question?.correctValues,[10]);assert(question.explanation?.trim());
 console.log('PASS IA real: clave objetiva y explicación con valores de opción originales.');
}catch(error){
 console.error('No se completó la prueba de IA: '+(error.status?error.message:error instanceof assert.AssertionError?error.message:'Revisa la conexión y la configuración del proveedor.'));
 process.exitCode=1;
}
