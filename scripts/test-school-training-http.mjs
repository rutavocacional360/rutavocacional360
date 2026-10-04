import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';

export async function runSchoolTrainingHttp({base,password,adminCookie,schoolOrientationTemplate,schoolPracticeTemplate,db}){
 const request=async(path,body,cookie,method=body?'POST':'GET',status=200)=>{
  const r=await fetch(base+'/api/'+path,{method,headers:{Origin:base,Cookie:cookie||'','Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
  const value=await r.json();assert.equal(r.status,status,path+': '+(value.error||''));return {value,cookie:r.headers.get('set-cookie')?.split(';')[0]};
 };
 const stage='Estoy en 10.º de EGB y pasaré a 1.º de BGU';
 const registration=await request('auth/register',{name:'Estudiante de décimo QA',email:randomUUID()+'@example.test',password,stage});
 const cookie=registration.cookie;
 assert.equal(registration.value.values['rv360:profile'].stage,stage);
 assert.equal(registration.value.values['rv360:profile'].baccalaureate,'por-definir');
 const admin=async(path,body,status)=> (await request(path,body,adminCookie,body?'POST':'GET',status)).value;
 const student=async(path,body,method,status)=> (await request(path,body,cookie,method,status)).value;
 const before=await student('training');assert.equal(before.recommendations.filter(r=>r.careerId.startsWith('bachillerato:')).length,0);
 assert.equal(before.educationLevel,'bachillerato');assert.equal(before.readiness.bachillerato.ready,false);assert.equal(before.readiness.universidad.total,0);assert(before.careers.every(c=>c.id.startsWith('bachillerato:')));assert(registration.value.values['rv360:battery'].instruments.every(t=>t.educationLevel==='bachillerato'));
 const blank={id:'',version:0,revision:0,status:'published',title:'',instrument:{id:'qa',version:'1',title:'',description:'',options:[],questions:[]},purpose:'general',modes:['practice','exam'],durationMinutes:30,maxAttempts:2,gradePolicy:'last',feedback:'finish',selection:'fixed',quotas:[],areaWeights:[],questions:[],shuffleOptions:false,questionOrderFixedIds:[]};
 const lockedSimulator=await admin('training/entity',{kind:'simulator',entity:schoolPracticeTemplate(blank,'ciencias')});
 await student('training/simulator/start',{simulatorId:lockedSimulator.id,mode:'practice'},'POST',409);
 assert.equal((await student('training')).simulators.length,0);
 for(const test of registration.value.values['rv360:battery'].instruments){
  const begun=await student('assessments/start',{instrumentId:test.id});assert.equal(JSON.parse(begun.snapshot).educationLevel,'bachillerato');
  const answers=Object.fromEntries(test.questions.map(q=>[q.id,q.dimension&&['R','I'].includes(q.dimension)?5:(q.options||test.options)[0].value]));
  await student('state',{key:'rv360:answers:'+test.id+':'+test.version,value:answers,revision:0},'PUT');
  await student('assessments/submit',{instrumentId:test.id});
 }
 assert((await student('training')).readiness.bachillerato.ready);
 const tiedReport=(await student('reports/guidance')).items.find(report=>!report.historical);
 assert.equal(tiedReport.analysis.pathway.suggested,'ambas','Equal R/I answers leave the modality unresolved');
 const tiedTraining=await student('training');
 assert.deepEqual(tiedTraining.recommendations,[],'A complete tied profile cannot unlock both school modalities');
 assert.equal(tiedTraining.simulators.length,0);
 await student('training/simulator/start',{simulatorId:lockedSimulator.id,mode:'practice'},'POST',403);
 const universityRecommendations=(await student('training')).recommendations.filter(r=>!r.careerId.startsWith('bachillerato:')).map(r=>r.careerId);assert.deepEqual(universityRecommendations,[]);

 await admin('training/delete-simulator',{kind:'simulator',id:lockedSimulator.id,version:lockedSimulator.version,revision:lockedSimulator.revision});
 const created=[];
 for(const kind of ['ciencias','tecnico']){
  // Retake the real interest test through HTTP so each modality is independently
  // supported by saved answers; no report or recommendation is fabricated.
  const interest=registration.value.values['rv360:battery'].instruments.find(test=>test.id==='intereses');
  assert(interest);
  await student('assessments/start',{instrumentId:interest.id});
  const active=await student('session'),key='rv360:answers:'+interest.id+':'+interest.version;
  const preferred=kind==='ciencias'?'I':'R';
  const answers=Object.fromEntries(interest.questions.map(q=>[q.id,q.dimension===preferred?5:2]));
  await student('state',{key,value:answers,revision:active.revisions[key]||0},'PUT');
  await student('assessments/submit',{instrumentId:interest.id});
  const currentReport=(await student('reports/guidance')).items.find(report=>!report.historical);
  assert.equal(currentReport.analysis.pathway.suggested,kind,'Saved interest answers select the modality under test');
  const selectedOptions=currentReport.analysis.pathway[kind==='ciencias'?'science':'technical'];
  const currentTraining=await student('training');
  assert.deepEqual(currentTraining.recommendations.map(item=>item.careerId),selectedOptions.map(option=>'bachillerato:'+option.id),'Preparation contains exactly the options of the selected modality');
  for(const previous of created){
   assert(!currentTraining.simulators.some(simulator=>simulator.id===previous.id),'Changing recommendation hides simulators of the previous modality');
   await student('training/simulator/start',{simulatorId:previous.id,mode:'practice'},'POST',403);
  }
  const template=schoolPracticeTemplate(blank,kind);
  await admin('training/entity',{kind:'simulator',entity:{...template,careerIds:['bachillerato:inexistente']}},400);
  const university=(await admin('training')).careers.find(c=>!c.id.startsWith('bachillerato:')).id;
  await admin('training/entity',{kind:'simulator',entity:{...template,careerIds:[...template.careerIds,university]}},400);
  await admin('training/entity',{kind:'simulator',entity:{...template,careerIds:{}}},400);
  const draft=await admin('training/entity',{kind:'simulator',entity:{...template,status:'draft'}});
  assert(!(await student('training')).simulators.some(s=>s.id===draft.id));
  const published=await admin('training/entity',{kind:'simulator',entity:{...draft,status:'published'}});created.push(published);
  const visible=(await student('training')).simulators.find(s=>s.id===published.id);assert(visible);assert(!JSON.stringify(visible).includes('correctValues'));
  const started=await student('training/simulator/start',{simulatorId:published.id,mode:'practice'});
  assert(!JSON.stringify(started).includes('correctValues'));
  await student('training/answers',{id:started.id,revision:0,answers:Object.fromEntries(template.questions.map(q=>[q.id,q.correctValues[0]])),flags:[]},'PUT');
  const resumed=await student('training/simulator/start',{simulatorId:published.id,mode:'practice'});assert.equal(resumed.id,started.id);
  const finished=await student('training/finish',{id:started.id});assert.equal(finished.result.percent,100);
  assert.equal((await student('training/attempt?id='+started.id)).result.percent,100);
  const exams=await Promise.all([1,2].map(()=>student('training/simulator/start',{simulatorId:published.id,mode:'exam'})));
  assert.equal(exams[0].id,exams[1].id,'Concurrent exam starts must share a single attempt');
  assert(Date.parse(exams[0].expires_at)>Date.now());
  assert(!JSON.stringify(exams[0]).includes('correctValues'));
  const examAnswers=Object.fromEntries(template.questions.map(q=>[q.id,q.correctValues[0]]));
  await student('training/answers',{id:exams[0].id,revision:0,answers:examAnswers,flags:[template.questions[0].id]},'PUT');
  const reopened=await student('training/simulator/start',{simulatorId:published.id,mode:'exam'});
  assert.equal(reopened.expires_at,exams[0].expires_at,'Reopening must not restart the clock');
  assert.deepEqual(reopened.answers,examAnswers);
  // Move only this synthetic attempt's deadline; no real-time sleep or real data.
  await db.prepare('UPDATE training_attempts SET expires_at=? WHERE id=?').run(new Date(Date.now()-1000).toISOString(),reopened.id);
  const expired=await student('training/attempt?id='+reopened.id);
  assert.equal(expired.state,'graded');assert.equal(expired.result.percent,100);
  const repeated=await Promise.all([1,2].map(()=>student('training/finish',{id:reopened.id})));
  assert(repeated.every(attempt=>attempt.result.revision===1),'Repeated finalization must not duplicate grades');
  const lastExam=await student('training/simulator/start',{simulatorId:published.id,mode:'exam'});
  await student('training/finish',{id:lastExam.id});
  await student('training/simulator/start',{simulatorId:published.id,mode:'exam'},'POST',409);
 }
 const t={...schoolOrientationTemplate(),id:'school-http-'+randomUUID(),version:'1',status:'Publicado',group:'Todos los estudiantes',due:''};
 const session=(await admin('session'));const custom=session.values['rv360:custom-tests']||[];
 await request('state',{key:'rv360:custom-tests',value:[...custom,t],revision:session.revisions?.['rv360:custom-tests']||0},adminCookie,'PUT');
 const answers=Object.fromEntries(t.questions.map(q=>[q.id,q.dimension==='R'?5:2]));
 const studentSession=await student('session');
 assert(studentSession.values['rv360:custom-tests'].some(c=>c.id===t.id));
 await student('assessments/start',{instrumentId:t.id});
 await student('state',{key:'rv360:answers:'+t.id+':'+t.version,value:answers,revision:0},'PUT');
 await student('assessments/submit',{instrumentId:t.id});
 const report=(await student('reports/guidance')).items[0];assert.equal(report.educationLevel,'bachillerato');assert.deepEqual(report.catalog,[]);assert.equal(report.readiness.universidad.total,0);assert.equal(report.analysis.pathway.suggested,'tecnico');assert.deepEqual(report.analysis.recommendations.map(r=>r.careerId),universityRecommendations);
 const archived=await admin('training/archive',{kind:'simulator',id:created[1].id,version:created[1].version,revision:created[1].revision});assert(archived);
 assert(!(await student('training')).simulators.some(s=>s.id===created[1].id));
 assert((await student('training')).attempts.some(a=>a.simulator.id===created[1].id&&a.result.percent===100));
 await admin('training/restore',{kind:'simulator',id:archived.id,version:archived.version,revision:created[1].revision},409);
 const restored=await admin('training/restore',{kind:'simulator',id:archived.id,version:archived.version,revision:archived.revision});
 assert((await student('training')).simulators.some(s=>s.id===restored.id));
 await admin('training/delete-simulator',{kind:'simulator',id:restored.id,version:restored.version,revision:restored.revision});
 assert(!(await student('training')).simulators.some(s=>s.id===restored.id));
 assert((await student('training')).attempts.some(a=>a.simulator.id===restored.id&&a.result.percent===100));
 let current=await admin('session');
 await request('state',{key:'rv360:custom-tests',value:current.values['rv360:custom-tests'].map(item=>item.id===t.id?{...item,status:'Eliminado'}:item),revision:current.revisions['rv360:custom-tests']},adminCookie,'PUT');
 assert(!(await student('session')).values['rv360:custom-tests'].some(item=>item.id===t.id));
 current=await admin('session');
 await request('state',{key:'rv360:custom-tests',value:current.values['rv360:custom-tests'].map(item=>item.id===t.id?{...item,status:'Archivado'}:item),revision:current.revisions['rv360:custom-tests']},adminCookie,'PUT');
 // Graduation switches the assigned tests and requires fresh university answers.
 await student('account/profile',{firstName:'Estudiante',lastName:'QA',stage:'Me gradu\u00e9 del colegio',baccalaureate:'tecnico',specialty:'Soporte inform\u00e1tico',learningPreference:'aplicar'},'PUT');
 const graduated=await student('session');assert(graduated.values['rv360:battery'].instruments.every(t=>t.educationLevel==='universidad'));assert(!graduated.values['rv360:custom-tests'].some(item=>item.educationLevel==='bachillerato'));
 assert(!Object.keys(graduated.values).some(key=>key.startsWith('rv360:answers:')),'Changing route clears only draft answer documents');
 await student('state',{key:'rv360:assessment-route-origins',value:Object.fromEntries(report.instruments.map(item=>[item.id,'universidad'])),revision:0},'PUT',403);
 const oldSubmissionIds=new Set((graduated.values['rv360:submissions']||[]).map(item=>item.id));
 await student('assessments/submit',{instrumentId:graduated.values['rv360:battery'].instruments[0].id},'POST',409);
 const withoutNewAttempt=await student('session');assert.deepEqual(new Set((withoutNewAttempt.values['rv360:submissions']||[]).map(item=>item.id)),oldSubmissionIds,'Submitting without new-route answers cannot create a new result');
 const universityLocked=await student('training');assert.equal(universityLocked.educationLevel,'universidad');assert.equal(universityLocked.readiness.bachillerato.total,0);assert.equal(universityLocked.readiness.universidad.ready,false);assert.equal(universityLocked.readiness.universidad.completed,0);assert.deepEqual(universityLocked.recommendations,[]);assert(universityLocked.careers.every(c=>!c.id.startsWith('bachillerato:')));
 await student('reports/guidance',{},'POST',409);
 for(const test of graduated.values['rv360:battery'].instruments){
  const begun=await student('assessments/start',{instrumentId:test.id});assert.equal(JSON.parse(begun.snapshot).educationLevel,'universidad');
  const active=await student('session'),key='rv360:answers:'+test.id+':'+test.version;
  const answers=Object.fromEntries(test.questions.filter(q=>q.type!=='info').map(q=>[q.id,q.dimension==='I'?5:q.dimension?2:(q.options||test.options)[0].value]));
  await student('state',{key,value:answers,revision:active.revisions[key]||0},'PUT');
  await student('assessments/submit',{instrumentId:test.id});
 }
 const universityReport=(await student('reports/guidance')).items.find(r=>!r.historical);assert(universityReport);assert.equal(universityReport.educationLevel,'universidad');assert.equal(universityReport.analysis.pathway,undefined);assert(universityReport.readiness.universidad.ready);assert(universityReport.analysis.recommendations.length);assert(universityReport.instruments.every(i=>i.instrument.educationLevel==='universidad'));
 const universityTraining=await student('training');assert(universityTraining.recommendations.every(r=>!r.careerId.startsWith('bachillerato:')));assert(!universityTraining.simulators.some(s=>created.some(old=>s.id===old.id)));assert(universityTraining.attempts.some(a=>a.simulator.id===created[1].id&&a.result.percent===100),'Existing school grades remain in history');
 console.log('PASS HTTP route change: explicit assessment snapshots, school-only catalog and recommendations, graduates see university-only tests, new university results and retained school history.');
 console.log('PASS HTTP admin CRUD: stale restore rejected, restore/delete persisted, test soft deletion and recovery, student visibility and retained grades.');
 console.log('PASS HTTP school workflow: EGB registration, undecided profile, admin drafts/publication, invalid levels/targets, hidden keys, practice/resume/grades, scoped orientation and archived history.');
 console.log('PASS HTTP exams: concurrent starts, saved answers, unchanged deadline after reopen, automatic expiry, idempotent grading and attempt limits.');
 return {cookie,created};
}
