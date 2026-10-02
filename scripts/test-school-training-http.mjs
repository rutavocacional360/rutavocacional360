import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';

export async function runSchoolTrainingHttp({base,password,adminCookie,schoolOrientationTemplate,schoolPracticeTemplate}){
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
 assert.equal(before.readiness.bachillerato.ready,false);
 const blank={id:'',version:0,revision:0,status:'published',title:'',instrument:{id:'qa',version:'1',title:'',description:'',options:[],questions:[]},purpose:'general',modes:['practice','exam'],durationMinutes:30,maxAttempts:2,gradePolicy:'last',feedback:'finish',selection:'fixed',quotas:[],areaWeights:[],questions:[],shuffleOptions:false,questionOrderFixedIds:[]};
 const lockedSimulator=await admin('training/entity',{kind:'simulator',entity:schoolPracticeTemplate(blank,'ciencias')});
 await student('training/simulator/start',{simulatorId:lockedSimulator.id,mode:'practice'},'POST',409);
 assert.equal((await student('training')).simulators.length,0);
 for(const test of registration.value.values['rv360:battery'].instruments){
  await student('assessments/start',{instrumentId:test.id});
  const answers=Object.fromEntries(test.questions.map(q=>[q.id,q.dimension&&['R','I'].includes(q.dimension)?5:(q.options||test.options)[0].value]));
  await student('state',{key:'rv360:answers:'+test.id+':'+test.version,value:answers,revision:0},'PUT');
  await student('assessments/submit',{instrumentId:test.id});
 }
 assert((await student('training')).readiness.bachillerato.ready);
 const universityRecommendations=(await student('training')).recommendations.filter(r=>!r.careerId.startsWith('bachillerato:')).map(r=>r.careerId);

 await admin('training/delete-simulator',{kind:'simulator',id:lockedSimulator.id,version:lockedSimulator.version,revision:lockedSimulator.revision});
 const created=[];
 for(const kind of ['ciencias','tecnico']){
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
 const report=(await student('reports/guidance')).items[0];assert.equal(report.analysis.pathway.suggested,'tecnico');assert.deepEqual(report.analysis.recommendations.map(r=>r.careerId),universityRecommendations);
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
 console.log('PASS HTTP admin CRUD: stale restore rejected, restore/delete persisted, test soft deletion and recovery, student visibility and retained grades.');
 console.log('PASS HTTP school workflow: EGB registration, undecided profile, admin drafts/publication, invalid levels/targets, hidden keys, practice/resume/grades, scoped orientation and archived history.');
 return {cookie,created};
}
