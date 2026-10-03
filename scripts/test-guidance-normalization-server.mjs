import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdtempSync,mkdirSync,readFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {createRequire} from 'node:module';
import {completeAssessment} from './assessment-fixtures.mjs';

mkdirSync('.qa-tools',{recursive:true});
const folder=mkdtempSync(resolve('.qa-tools','guidance-normalization-'));
process.env.DB_DRIVER='sqlite';process.env.DATABASE_PATH=resolve(folder,'synthetic.sqlite');
process.env.ACADEMIC_CONTENT_PATH=resolve(folder,'academic.json');process.env.GUIDANCE_AI_ENABLED='false';
const marker={name:'server-marker',setup(builder){builder.onResolve({filter:/^server-only$/},()=>({path:'server-only',namespace:'empty'}));builder.onLoad({filter:/.*/,namespace:'empty'},()=>({contents:''}));}};
const oldRules={name:'prior-rules-fixture',setup(builder){builder.onLoad({filter:/[\\/]local-guidance\.ts$/},args=>({contents:readFileSync(args.path,'utf8').replace("'school-university-guidance-6'","'school-university-guidance-5'"),loader:'ts',resolveDir:dirname(args.path)}));}};
const contents="export {db,put} from './lib/server/store';export {ensureGuidance} from './lib/server/guidance';export {currentAssessments} from './lib/server/battery';export {calculateTest} from './components/kit/lib/test-engine';";
for(const prior of [true,false])await build({stdin:{contents,resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'cjs',packages:'external',outfile:resolve(folder,prior?'prior.cjs':'current.cjs'),plugins:prior?[marker,oldRules]:[marker]});
const require=createRequire(import.meta.url),prior=require(resolve(folder,'prior.cjs'));
const institutionId='normalization-org',base={name:'Synthetic student',role:'student',institutionId,group:'A'};
const descriptive={...base,id:'descriptive-school'},mapped={...base,id:'configured-school'};
let priorReport;
try{
  await prior.db.migrate();await prior.db.prepare('INSERT INTO institutions VALUES(?,?,?)').run(institutionId,'Synthetic school','NORM');await prior.put('system','rv360:platform',{institutionId});
  for(const user of [descriptive,mapped]){
    await prior.db.prepare('INSERT INTO users VALUES(?,?,?,?,?,?,?,?)').run(user.id,user.name,user.id+'@example.test','disabled-not-a-password',user.role,institutionId,user.group,'Activo');
    await prior.put(user.id,'rv360:profile',{stage:'Estoy eligiendo mi bachillerato',baccalaureate:'por-definir'});
    for(const test of await prior.currentAssessments(user))await completeAssessment({db:prior.db,calculateTest:prior.calculateTest,userId:user.id,instrument:{...test,scoring:'manual'},at:'2026-10-02T12:00:00Z'});
  }
  const test={id:'configured-school-criteria',stableId:'configured-school-criteria',version:'1',title:'Organización',schemaVersion:2,source:'Synthetic author criterion.',status:'Publicado',educationLevel:'bachillerato',audience:'selected',studentIds:[mapped.id],scoring:'dimensions',aggregation:'sum',dimensions:[{id:'organizacion',name:'Organización'}],options:[1,2,3].map(value=>({value,label:String(value),contributions:{organizacion:value}})),questions:[{id:'organization',text:'Organiza un proyecto.',type:'single',dimension:'organizacion'}],careerLinks:[{id:'school-accounting',careerId:'bachillerato:contabilidad',dimensionId:'organizacion',min:1,max:3,reason:'El criterio documentado invita a explorar gestión contable.',source:'Synthetic author criterion.'}]};
  await prior.put('institution:'+institutionId,'rv360:custom-tests',[test]);
  await completeAssessment({db:prior.db,calculateTest:prior.calculateTest,userId:mapped.id,instrument:test,at:'2026-10-02T12:01:00Z'});
  priorReport=await prior.ensureGuidance(mapped);assert.equal(priorReport.rulesVersion,'school-university-guidance-5');
}catch(error){await prior.db.close();throw error;}
const current=require(resolve(folder,'current.cjs'));
try{
  const report=await current.ensureGuidance(mapped);
  assert.equal(report.rulesVersion,'school-university-guidance-6');assert.notEqual(report.id,priorReport.id,'Changing the rules invalidates a persisted prior report with identical saved attempts');
  assert.equal(report.readiness.bachillerato.ready,true);assert.equal(report.partial,false);assert.equal(report.analysis.pathway.suggested,'tecnico');
  assert.equal(report.analysis.pathway.basis,'configured_criteria');assert.equal(report.analysis.pathway.orientationState,'criteria');
  assert.equal(report.analysis.pathway.technical.length,1);assert.equal(report.analysis.pathway.technical[0].id,'contabilidad');
  assert.deepEqual(report.analysis.pathway.technical[0].evidence,['configured-school-criteria:dimension:organizacion']);
  assert.deepEqual(report.analysis.pathway.technical[0].careers,[]);assert.deepEqual(report.analysis.recommendations,[]);assert.deepEqual(report.catalog,[]);
  assert.equal((await current.ensureGuidance(mapped)).id,report.id,'Repeated requests reuse the corrected report');
  const unresolved=await current.ensureGuidance(descriptive);
  assert.equal(unresolved.readiness.bachillerato.ready,true);assert.equal(unresolved.partial,false);assert.equal(unresolved.analysis.pathway.suggested,'pendiente');
  assert.equal(unresolved.analysis.pathway.orientationState,'pending');assert.equal(unresolved.analysis.pathway.science.length+unresolved.analysis.pathway.technical.length,0);
  assert.match(unresolved.analysis.pathway.title,/tests están completos/i);assert.match(unresolved.analysis.pathway.reason,/no incluyen un perfil de intereses/);
  assert.equal(unresolved.ai.status,'not_configured');
  console.log('PASS server normalization: persisted old-rule reports invalidate, complete school criteria produce sourced options, descriptive complete tests remain unresolved without fabricated modality, and corrected snapshots reuse their cache.');
}finally{await current.db.close();}
