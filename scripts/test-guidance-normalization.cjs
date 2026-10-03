const fs=require('node:fs'),ts=require('typescript'),assert=require('node:assert/strict');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,f);
const {localGuidance,GUIDANCE_RULES_VERSION}=require('../components/kit/lib/local-guidance.ts');
const {guidanceScores}=require('../components/kit/lib/guidance-scores.ts');
const {schoolGuidance,schoolReportSections}=require('../components/kit/lib/school-guidance.ts');
const {calculateTest}=require('../components/kit/lib/test-engine.ts');
const {instruments}=require('../components/kit/data/instruments.ts');
const catalog=require('../components/kit/data/design-careers.json');
const codes=['R','I','A','S','E','C'],user={id:'normalization-qa',name:'Synthetic student'};
const original=instruments.find(t=>t.id==='intereses');
const near=(actual,expected)=>assert(Math.abs(actual-expected)<1e-8,`${actual} must equal ${expected}`);
function submission(instrument,profile,id=instrument.id){
  const answers=Object.fromEntries(instrument.questions.map(q=>[q.id,profile[q.dimension]??1]));
  const evaluation=calculateTest(instrument,answers);
  return {id,instrument_id:instrument.id,version:instrument.version,created_at:'2026-10-02T12:00:00Z',snapshot:JSON.stringify(instrument),answers:JSON.stringify(answers),scores:JSON.stringify(evaluation.scores),evaluation};
}
const core=(aggregation,educationLevel)=>({...original,scoring:'dimensions',aggregation,educationLevel});
const report=(rows,educationLevel='bachillerato')=>localGuidance(user,rows,rows.map(r=>r.instrument_id),{educationLevel});
const shape=r=>({suggested:r.analysis.pathway.suggested,science:r.analysis.pathway.science.map(o=>o.id),technical:r.analysis.pathway.technical.map(o=>o.id),highlighted:r.analysis.highlightedDimensions,recommendations:r.analysis.recommendations.map(o=>o.careerId)});
const scienceProfile={I:5,R:1,C:4};
const sum=submission(core('sum','bachillerato'),scienceProfile),mean=submission(core('mean','bachillerato'),scienceProfile);
assert.deepEqual(shape(report([sum])),shape(report([mean])),'Original sum and mean results must produce identical guidance');
assert.equal(report([sum]).analysis.pathway.suggested,'ciencias');
assert(report([sum]).analysis.pathway.science.length>0);
assert(report([sum]).analysis.pathway.technical.length>0);
assert(report([sum]).analysis.pathway.technical.length<=8);
assert.deepEqual(report([sum]).analysis.highlightedDimensions,['I','C']);
for(const row of [sum,mean])for(const s of report([row]).instruments[0].scores)near((s.value-s.min)/(s.max-s.min),(scienceProfile[s.dimension]??1)/4-0.25);

// Weighted contributions use different numeric ranges in each item. Their scale position still agrees.
const weighted={...core('sum','bachillerato'),id:'weighted-profile',schemaVersion:2,source:'Internal exploration rules for synthetic test.',dimensions:codes.map(id=>({id,name:id})),options:[],questions:codes.flatMap(dimension=>[1,2].map(index=>({id:dimension+index,text:'Synthetic '+dimension+index,type:'single',dimension,weight:index,options:[1,2,3,4,5].map(value=>({value,label:String(value),contributions:{[dimension]:index===1?value*2:(value-1)*3}}))})))};
const weightedSum=submission(weighted,scienceProfile),weightedMean=submission({...weighted,aggregation:'mean'},scienceProfile);
assert.deepEqual(shape(report([weightedSum])),shape(report([weightedMean])),'Custom weighted sum and mean must agree');
assert.deepEqual(shape(report([weightedSum])),shape(report([sum])),'Unequal item ranges and counts must not change identical relative interests');
for(const score of report([weightedMean]).instruments[0].scores)near((score.value-score.min)/(score.max-score.min),((scienceProfile[score.dimension]??1)-1)/4);

// Legacy mean values paired with sum bounds must be repaired from the saved trace or snapshot bounds.
const legacyScores=sum.evaluation.scores.map(s=>({...s,value:s.raw/5}));
for(const withTrace of [true,false]){
  const evaluation={...sum.evaluation,engineVersion:undefined,trace:withTrace?sum.evaluation.trace:undefined,scores:legacyScores};
  const legacy={...sum,evaluation,scores:JSON.stringify(legacyScores)};
  assert.deepEqual(shape(report([legacy])),shape(report([sum])),'Legacy mixed units must not suppress valid interests');
  for(const score of report([legacy]).instruments[0].scores){assert.equal(score.min,1);assert.equal(score.max,5);assert.equal(score.value,legacyScores.find(s=>s.dimension===score.dimension).value);}
}
const noBounds=mean.evaluation.scores.map(({min,max,...s})=>s);
assert.deepEqual(shape(report([{...mean,evaluation:{state:'complete',aggregation:'mean',scores:noBounds}}])),shape(report([mean])),'Mean-only original legacy results recover bounds without changing values');

// A reviewer can change value while raw and saved answers remain unchanged. Never recompute that value.
const reviewScores=sum.evaluation.scores.map(s=>({...s,value:s.dimension==='R'?25:s.dimension==='I'?5:s.value}));
const reviewed={...sum,evaluation:{...sum.evaluation,scores:reviewScores}};
const reviewedReport=report([reviewed]);
assert.equal(reviewedReport.analysis.pathway.suggested,'tecnico');
assert.equal(reviewedReport.instruments[0].scores.find(s=>s.dimension==='I').value,5);
assert.equal(reviewedReport.instruments[0].scores.find(s=>s.dimension==='I').raw,25);
assert.equal(reviewedReport.instruments[0].scores.find(s=>s.dimension==='I').displayRaw,5,'Display the reviewed score without replacing its historical raw sum');
assert.equal(reviewedReport.instruments[0].scores.find(s=>s.dimension==='R').displayRaw,25);
const ambiguous=guidanceScores(core('sum','bachillerato'),JSON.parse(sum.answers),sum.evaluation,sum.evaluation.scores.map(s=>({...s,value:2,min:-90,max:90})));
assert(ambiguous.every(s=>s.guidanceScaleValid===false),'Unverifiable edited bounds must not become a fabricated normalized profile');

// Equal instrument weighting is independent of question count, item weights and sum/mean aggregation.
const social=submission({...weighted,id:'social-profile'}, {S:5,A:4});
const blended=report([sum,social]);
assert.deepEqual(blended.analysis.highlightedDimensions,['I','S']);
assert.equal(blended.analysis.pathway.suggested,'ciencias');
assert(blended.analysis.pathway.science.every(o=>o.evidence.some(e=>e.startsWith('intereses:'))&&o.evidence.some(e=>e.startsWith('social-profile:'))));
assert.deepEqual(shape(blended),shape(report([social,sum])));

const directScores=profile=>codes.map(dimension=>({dimension,raw:profile[dimension]??5}));
for(const [profile,expected] of [[{R:25,I:5},'tecnico'],[{I:25,R:5},'ciencias'],[{I:25,R:25},'ambas']]){
  const path=schoolGuidance(directScores(profile),codes.map(d=>'test:dimension:'+d));
  assert.equal(path.suggested,expected);assert(path.science.length>0);assert(path.technical.length>0);assert(path.technical.length<=8);
  assert([...path.science,...path.technical].every(o=>o.supportDimensions.length&&o.evidence.length));
}
// A single high C with low remaining dimensions used to be discarded by the option-average >=15 rule.
const conventional=schoolGuidance(directScores({C:21}),['test:dimension:C']);
assert(conventional.science.some(o=>o.id==='ciencias-economia'&&o.score<15));
assert(conventional.technical.some(o=>o.id==='contabilidad'&&o.score<15));
assert(conventional.technical.every(o=>o.reason.includes('orden y procedimientos')));
for(const level of [5,15,25]){
  const path=schoolGuidance(codes.map(dimension=>({dimension,raw:level})),codes.map(d=>'test:dimension:'+d));
  assert.equal(path.suggested,'ambas');assert.equal(path.orientationState,'open');assert.equal(path.science.length+path.technical.length,0);
  assert(!schoolReportSections(path).flatMap(s=>s.lines).some(line=>/Completa tus intereses/.test(line)));
}

// Explicit school criteria work without a RIASEC profile and retain their actual score and evidence.
const mapped={id:'school-configured',version:'1',title:'Organización y presupuesto',schemaVersion:2,educationLevel:'bachillerato',source:'Synthetic documented criterion.',scoring:'dimensions',aggregation:'sum',dimensions:[{id:'organizacion',name:'Organización'}],options:[1,2,3].map(value=>({value,label:String(value),contributions:{organizacion:value}})),questions:[{id:'organiza',text:'Organiza un proyecto.',type:'single',dimension:'organizacion'}],careerLinks:[{id:'relation-accounting',careerId:'bachillerato:contabilidad',dimensionId:'organizacion',min:2,max:3,reason:'El criterio invita a explorar gestión contable.',source:'Internal author criterion.'}]};
const mappedRow=submission(mapped,{organizacion:3});
const mappedReport=report([mappedRow]),mappedPath=mappedReport.analysis.pathway;
assert.equal(mappedReport.partial,false);assert.equal(mappedPath.suggested,'tecnico');assert.equal(mappedPath.orientationState,'criteria');assert.equal(mappedPath.basis,'configured_criteria');
assert.equal(mappedPath.technical.length,1);assert.equal(mappedPath.technical[0].id,'contabilidad');
assert.deepEqual(mappedPath.technical[0].evidence,['school-configured:dimension:organizacion']);
assert.equal(mappedPath.technical[0].criteria[0].value,3);assert(mappedPath.technical[0].reason.includes('2 a 3'));
assert.equal(mappedReport.analysis.recommendations.length,0,'School criteria must not become university recommendations');
assert.equal(report([{...mappedRow,evaluation:{...mappedRow.evaluation,state:'pending-review'}}]).analysis.pathway.suggested,'pendiente','Pending review must not unlock criteria');
assert.equal(report([{...mappedRow,resultReleased:false}]),null,'Unpublished results remain unavailable');
assert.equal(report([submission(mapped,{organizacion:1})]).analysis.pathway.technical.length,0,'Scores outside author criteria must not fabricate a match');
const uniCareer=catalog.careers.find(c=>c.offers.some(o=>o.level==='Grado universitario'));
const uniMapped={...mapped,id:'university-configured',educationLevel:'universidad',careerLinks:[{...mapped.careerLinks[0],careerId:uniCareer.id}]};
const uniRow=submission(uniMapped,{organizacion:3}),uniReport=report([uniRow],'universidad');
assert.equal(uniReport.analysis.recommendations.length,1);assert.equal(uniReport.analysis.recommendations[0].careerId,uniCareer.id);assert.equal(uniReport.analysis.pathway.technical.length,0);
assert.equal(report([uniRow]).analysis.pathway.technical.length,0,'University mappings never infer a school modality');
const uniOnly=report([submission(core('sum','universidad'),{I:5})],'universidad');
assert.deepEqual(uniOnly.analysis.highlightedDimensions,['I'],'Low tied dimensions must not be labeled as leading interests');
assert(uniOnly.analysis.recommendations.length>0);assert(uniOnly.analysis.recommendations.every(r=>r.evidence.every(e=>e==='intereses:dimension:I')));
assert(uniOnly.analysis.recommendations.every(r=>catalog.careers.find(c=>c.id===r.careerId).interests.includes('I')));
assert.equal(GUIDANCE_RULES_VERSION,'school-university-guidance-6','Stored report digests must invalidate old rankings');
console.log('PASS guidance normalization: original/custom sum/mean, weighted contributions, legacy bounds, reviewed values, mixed profiles, concrete school options, honest open profiles, explicit school criteria, university evidence and pending-result isolation.');
