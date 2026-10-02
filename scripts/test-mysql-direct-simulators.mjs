import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

// Integration test against a running, isolated local MySQL installation.
const base = process.env.QA_BASE_URL || 'http://127.0.0.1:3022';
if (!['127.0.0.1', 'localhost'].includes(new URL(base).hostname) ||
    !process.env.DB_NAME?.endsWith('_test'))
  throw Error('Usa un servidor local con una base aislada terminada en _test.');
if (!process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD)
  throw Error('Configura las credenciales administrativas de la instalación de prueba.');
function client() {
  let cookie = '';
  return async (path, body, method = body ? 'POST' : 'GET', status = 200) => {
    const response = await fetch(base + '/api/' + path, {method,
      headers: {Origin: base, Cookie: cookie, 'Content-Type': 'application/json'},
      ...(body ? {body: JSON.stringify(body)} : {})});
    if (response.headers.getSetCookie().length)
      cookie = response.headers.getSetCookie().map(c => c.split(';')[0]).join('; ');
    const value = await response.json();
    assert.equal(response.status, status, path + ': ' + (value.error || 'estado inesperado'));
    return value;
  };
}
const admin = client(), student = client(), denied = client();
const health = await admin('health');
assert.equal(health.database, 'mysql');
await admin('auth/login', {email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD, admin: true});
const session = await student('auth/register', {name: 'Regresión simulador MySQL', email: randomUUID()+'@example.test', password: randomUUID()});
await denied('auth/register', {name: 'Sin recomendaciones QA', email: randomUUID()+'@example.test', password: randomUUID()});
const test = session.values['rv360:battery'].instruments.find(t => t.id === 'intereses');
const answers = Object.fromEntries(test.questions.map(q => [q.id, q.dimension === test.questions[0].dimension ? 5 : 1]));
await student('state', {key: 'rv360:answers:'+test.id+':'+test.version, value: answers, revision: 0}, 'PUT');
await student('assessments/submit', {instrumentId: test.id});
for(const pending of session.values['rv360:battery'].instruments.filter(t=>t.id!==test.id)){
 await student('assessments/start',{instrumentId:pending.id});
 const values=Object.fromEntries(pending.questions.map(q=>[q.id,(q.options||pending.options)[0].value]));
 await student('state',{key:'rv360:answers:'+pending.id+':'+pending.version,value:values,revision:0},'PUT');
 await student('assessments/submit',{instrumentId:pending.id});
}
await student('reports/guidance');
const state = await student('training'), careerId = state.recommendations[0]?.careerId;
assert(careerId, 'Las respuestas diferenciadas deben generar recomendaciones.');
const questions = Array.from({length: 10}, (_, i) => ({id:'q'+i, text:'Dos más dos, pregunta '+(i+1), type:'single', policy:'objective', weight:1, reviewed:true, source:'QA', correctValues:[1], options:[{value:1,label:'Cuatro'},{value:2,label:'Cinco'}], explanation:'Dos más dos es cuatro.'}));
let sim = {id:'',version:0,revision:0,status:'published',title:'Regresión directa '+randomUUID(),careerIds:[careerId],instrument:{id:'qa',version:'1',title:'QA',description:'Preparación de prueba',source:'QA',options:[],questions:[]},purpose:'general',modes:['practice','exam'],durationMinutes:1,practiceDurationMinutes:0,maxAttempts:2,gradePolicy:'best',feedback:'finish',selection:'fixed',quotas:[],areaWeights:[],questions,shuffleOptions:false,questionOrderFixedIds:[]};
await admin('training/entity',{kind:'simulator',entity:{...sim,careerIds:['invalid-career']}},'POST',400);
sim = await admin('training/entity',{kind:'simulator',entity:sim});
await denied('training/simulator/start',{simulatorId:sim.id,mode:'practice'},'POST',409);
await admin('training/simulator/start',{simulatorId:sim.id,mode:'practice'},'POST',403);
const catalog = (await student('training')).simulators.find(s => s.id === sim.id);
assert.deepEqual(catalog.careerIds,[careerId]);assert.equal(catalog.instrument.description,sim.instrument.description);
assert(!JSON.stringify(catalog).includes('correctValues'));
const started = await Promise.all([1,2].map(() => student('training/simulator/start',{simulatorId:sim.id,mode:'practice'})));
assert.equal(started[0].id, started[1].id);assert.equal(started[0].expires_at,null);
assert.equal(started[0].simulator.id,sim.id);assert(!JSON.stringify(started[0]).includes('correctValues'));
await student('training/answers',{id:started[0].id,revision:0,answers:{q0:1,q1:1},flags:['q1']},'PUT');
const resumed = await student('training/simulator/start',{simulatorId:sim.id,mode:'practice'});
assert.deepEqual(resumed.answers,{q0:1,q1:1});assert.deepEqual(resumed.flags,['q1']);
const finished = await Promise.all([1,2].map(() => student('training/finish',{id:resumed.id})));
assert.equal(finished[0].result.percent,20);assert.equal(finished[0].result.revision,1);assert.equal(finished[1].result.revision,1);assert(finished[0].finished_at);
const draft = await admin('training/entity',{kind:'simulator',entity:{...sim,version:0,revision:0,status:'draft'}});
assert((await student('training')).simulators.some(s=>s.id===sim.id),'El borrador no debe ocultar la versión publicada.');
sim = await admin('training/entity',{kind:'simulator',entity:{...draft,status:'published',questions:sim.questions.map(q=>({...q,correctValues:[2]}))}});
assert.equal((await student('training')).simulators.filter(s=>s.id===sim.id).length,1);
const second = await student('training/simulator/start',{simulatorId:sim.id,mode:'practice'});
assert.equal(second.simulator.version,sim.version);
await student('training/finish',{id:second.id});
await student('training/simulator/start',{simulatorId:sim.id,mode:'practice'},'POST',409);
assert.equal((await student('training/attempt?id='+resumed.id)).result.percent,20);
const archived = await admin('training/archive',{kind:'simulator',id:sim.id,version:sim.version,revision:sim.revision});
assert(!(await student('training')).simulators.some(s=>s.id===sim.id));
await student('training/simulator/start',{simulatorId:sim.id,mode:'exam'},'POST',404);
await admin('training/delete-simulator',{id:sim.id,version:sim.version,revision:archived.revision});
assert.equal((await student('training/attempt?id='+resumed.id)).result.percent,20);
assert((await student('training')).attempts.some(a=>a.id===resumed.id));
console.log('PASS MySQL direct simulators: real recommendations, career permissions, private keys, concurrent start/finish, resume, grade, versions, attempt limits, archive/delete and preserved history.');
