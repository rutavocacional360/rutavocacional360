const fs=require('fs'),ts=require('typescript'),assert=require('node:assert/strict');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,f);
const {summarizeInstrument,validatePresentation}=require('../lib/server/import-presentation.ts');
const {proposeTests}=require('../components/kit/lib/import-content.ts');
const {instrumentPresentation,readableText}=require('../components/kit/lib/instrument-presentation.ts');
(async()=>{
const source={title:'IV.4.1. Cuestionario de intereses',description:'Instrucciones completas. '.repeat(30)};
let called=false;const result=await summarizeInstrument(source,{GEMINI_API_KEY:'fixture',GEMINI_MODEL:'fixture'},async(url,request)=>{called=true;const body=JSON.parse(request.body);assert.deepEqual(JSON.parse(body.contents[0].parts[0].text),source);assert.equal(body.generationConfig.responseMimeType,'application/json');return new Response(JSON.stringify({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify({title:'Intereses',summary:'Explora tus intereses.'})}]}}]}));});
assert(called);assert.equal(result.summary,'Explora tus intereses.');assert.throws(()=>validatePresentation({title:{bad:true},summary:'x'}));assert.throws(()=>validatePresentation({title:'x',summary:'x'.repeat(281)}));
const view=instrumentPresentation(source);assert.equal(view.title,'Cuestionario de intereses');assert(view.summary.length<=280);assert.equal(view.details,source.description.trim());assert.equal(readableText('Otro: ........................'), 'Otro:');
const input='Título de la investigación: Intereses\nSección A. Preferencias\n1. ¿Sobre qué temas\nnecesitas orientación? Selecciona hasta tres opciones.\na) Materias, actividades\ny exigencias de cada carrera\nb) Costos y becas\n2. Elige cuatro\na) Tres\nb) Cuatro\nRespuesta correcta: B';
const t=proposeTests(input,[],'intereses.pdf')[0];assert.equal(t.questions.length,2);assert(t.questions[0].text.includes('temas necesitas'));assert.equal(t.questions[0].options[0].label,'Materias, actividades y exigencias de cada carrera');assert.equal(t.questions[0].maxSelections,3);assert.equal(t.questions[0].section,'Sección A. Preferencias');assert.deepEqual(t.questions[1].correctValues,[2]);assert(t.description.includes('Intereses'));
console.log('PASS AI schema and input isolation; original instructions retained; PDF wrapped questions/options, sections, multi-select limits and answer key.');
})().catch(e=>{console.error(e);process.exitCode=1});
