const fs=require('node:fs'),ts=require('typescript'),assert=require('node:assert/strict');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,f);
const {technicalOptions,educationStages,schoolCatalogSource,baccalaureateModalities,complementaryArtsOffer}=require('../components/kit/data/baccalaureate.ts');
const {schoolTrainingTargets,schoolPreparationRecommendations,schoolModalityTarget,defaultPreparationLevel,preparationLevel,schoolTarget,preparationHref,trainingTargetMatches}=require('../components/kit/data/school-training.ts');
const {schoolOrientationTemplate,schoolPracticeTemplate}=require('../components/kit/data/school-templates.ts');
const {calculateTest,instrumentProblems}=require('../components/kit/lib/test-engine.ts');
const {academicResult,simulatorProblems}=require('../components/kit/lib/training-engine.ts');
const {localGuidance}=require('../components/kit/lib/local-guidance.ts');
assert.equal(technicalOptions.length,34);assert.equal(new Set(technicalOptions.map(o=>o.id)).size,34);assert.equal(new Set(technicalOptions.map(o=>o.family)).size,11);
// Official 2025 reform: stable persisted targets with corrected nomenclature and families.
const byId=Object.fromEntries(technicalOptions.map(o=>[o.id,o]));
for(const [id,name,family] of [
 ['contabilidad','Gestión financiera y contable','Administrativa y financiera'],
 ['datos','Ciencia de datos','Tecnologías'],
 ['artes-plasticas','Artes plásticas y gestión cultural','Artes'],
 ['artes-escenicas','Artes escénicas y gestión cultural','Artes'],
 ['musica','Música y gestión cultural','Artes'],
 ['mecanizado','Mecánica industrial','Industrial'],
 ['electricidad','Instalaciones eléctricas y automatización','Industrial'],
 ['climatizacion','Climatización','Industrial'],
]){assert.equal(byId[id]?.name,name);assert.equal(byId[id]?.family,family);}
assert.equal(technicalOptions.filter(o=>o.family==='Industrial').length,10);
assert.deepEqual(technicalOptions.filter(o=>o.family==='Construcción sostenible').map(o=>o.id),['obra-civil']);
assert.deepEqual(baccalaureateModalities.map(o=>o.id),['ciencias','tecnico']);
assert.deepEqual(complementaryArtsOffer.specialties,['Música','Danza','Artes Plásticas']);
assert.equal(schoolCatalogSource.educationLevel,'bachillerato');
assert.equal(schoolCatalogSource.careerCount,34);assert.equal(schoolCatalogSource.offerCount,0);
assert.match(schoolCatalogSource.sourceUrl,/educacion\.gob\.ec.+MINEDEC-MINEDEC-2025-00051-A/);
assert.match(schoolCatalogSource.version,/2025-00051/);
assert.equal(schoolTrainingTargets.length,40);assert(schoolTrainingTargets.every(t=>t.offers.length===0));
for(const stage of educationStages.filter(s=>/EGB/.test(s)))assert.equal(defaultPreparationLevel({stage}),'bachillerato');
assert.equal(defaultPreparationLevel({stage:'Me gradué del colegio'}),'universidad');assert.equal(schoolTarget(null),false);assert.equal(schoolTarget(1),false);
assert.equal(preparationLevel([],'bachillerato'),'bachillerato');
assert.equal(preparationLevel(['bachillerato:ciencias'],'universidad'),'universidad','Explicit administrator destination wins over inconsistent legacy options');
assert.equal(preparationLevel(['university-career'],'bachillerato'),'bachillerato');
assert.equal(preparationHref('bachillerato:contabilidad'),'/mi-ruta/cursos?carrera=bachillerato%3Acontabilidad');
assert(trainingTargetMatches(['bachillerato:tecnico'],'bachillerato:contabilidad'),'A specialty can use the general preparation of its own modality');
assert(trainingTargetMatches(['bachillerato:ciencias'],'bachillerato:ciencias-exactas'));
assert(!trainingTargetMatches(['bachillerato:contabilidad'],'bachillerato:tecnico'),'A modality cannot open every unrecommended specialty');
assert(!trainingTargetMatches(['bachillerato:ciencias'],'bachillerato:contabilidad'));
assert(!trainingTargetMatches(['bachillerato:informatica'],'bachillerato:contabilidad'));
assert(!trainingTargetMatches(['bachillerato:tecnico'],'university-career'));
assert(!trainingTargetMatches(['bachillerato:tecnico'],'bachillerato:inexistente'));
assert(trainingTargetMatches(['university-career'],'university-career'));
// Keep broad publishing scopes, but never offer a modality as a student's career.
const schoolReport={educationLevel:'bachillerato',readiness:{bachillerato:{ready:true}},analysis:{pathway:{suggested:'ambas',science:[{id:'ciencias-exactas',reason:'Ciencias QA'}],technical:[{id:'contabilidad',reason:'Técnica QA'}]}}};
assert.deepEqual(schoolPreparationRecommendations(schoolReport),[],'Ties do not unlock either modality');
for(const [suggested,ids] of [['ciencias',['bachillerato:ciencias-exactas']],['tecnico',['bachillerato:contabilidad']],['pendiente',[]]])assert.deepEqual(schoolPreparationRecommendations({...schoolReport,analysis:{pathway:{...schoolReport.analysis.pathway,suggested}}}).map(r=>r.careerId),ids,'Only the recorded modality unlocks matching preparation');
assert.equal(schoolTrainingTargets.filter(t=>!schoolModalityTarget(t.id)).length,38,'All 34 technical figures and four science areas stay available');
const legacyReport={...schoolReport,analysis:{pathway:{...schoolReport.analysis.pathway,suggested:'ciencias',science:[{id:'ciencias'},{id:'ciencias-exactas'}],technical:[{id:'tecnico'},{id:'contabilidad'}]}}};
assert.deepEqual(schoolPreparationRecommendations(legacyReport).map(r=>r.careerId),['bachillerato:ciencias-exactas'],'Legacy pathway data cannot revive modality cards or options of the other modality');

const t={...schoolOrientationTemplate(),id:'school',version:'1'};
assert.deepEqual(instrumentProblems(t),[]);
function submission(test,dimension){const answers=Object.fromEntries(test.questions.map(q=>[q.id,q.dimension===dimension?5:2]));const evaluation=calculateTest(test,answers);return {id:test.id,instrument_id:test.id,version:test.version,created_at:'2026-10-01T12:00:00Z',snapshot:JSON.stringify(test),answers:JSON.stringify(answers),scores:JSON.stringify(evaluation.scores),evaluation};}
const school=submission(t,'R'),uni=submission({...t,id:'uni',educationLevel:'universidad'},'I');
const single=localGuidance({id:'qa',name:'QA'},[school]);assert.equal(single.analysis.pathway.suggested,'tecnico');assert.equal(single.analysis.recommendations.length,0);
assert(single.analysis.pathway.technical.some(o=>o.careers.length),'School interests retain future university exploration links');
const both=localGuidance({id:'qa',name:'QA'},[school,uni]);assert.equal(both.analysis.pathway.suggested,'tecnico');assert(both.analysis.recommendations.length);
assert.deepEqual(both.analysis.recommendations,localGuidance({id:'qa',name:'QA'},[uni]).analysis.recommendations);
assert.equal(localGuidance({id:'qa',name:'QA'},[uni]).analysis.pathway.suggested,'pendiente');
const blank={id:'qa',version:1,revision:0,status:'published',title:'',instrument:{id:'qa',version:'1',title:'',description:'',options:[],questions:[]},purpose:'general',modes:['practice','exam'],durationMinutes:30,maxAttempts:3,gradePolicy:'last',feedback:'finish',selection:'fixed',quotas:[],areaWeights:[],questions:[],shuffleOptions:false,questionOrderFixedIds:[]};
for(const kind of ['ciencias','tecnico']){const s=schoolPracticeTemplate(blank,kind);assert.deepEqual(simulatorProblems(s),[]);assert.equal(academicResult(s,Object.fromEntries(s.questions.map(q=>[q.id,q.correctValues[0]]))).percent,100);assert.equal(academicResult(s,{}).percent,0);assert(simulatorProblems({...s,careerIds:[...s.careerIds,'university-career']}).length);assert(simulatorProblems({...s,purpose:'admission'}).length);assert(simulatorProblems({...s,educationLevel:'universidad'}).length);assert(simulatorProblems({...s,careerIds:{}}).length);}
console.log('PASS school training: 34 official figures, 11 families, EGB stages, scoped tests without cross-influence, future study links, both practice templates, grading and invalid publication.');
