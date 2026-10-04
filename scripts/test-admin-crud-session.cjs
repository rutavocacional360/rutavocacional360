const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

// Exercise the real session and training transports without a database or browser.
const window = new EventTarget();
let role = 'admin', expired = false, prompts = 0, mutations = [];
const values = {}, revisions = {};
const fetch = async (url, options = {}) => {
  if (url === '/api/session') return Response.json({
    user: expired ? null : {id:'qa',role}, values:{...values}, revisions:{...revisions},
  });
  mutations.push({url, body:options.body, expired});
  if (expired) return Response.json({error:'Sesión vencida'}, {status:401});
  const body = JSON.parse(options.body);
  if (url === '/api/state') {
    values[body.key] = body.value;
    revisions[body.key] = (revisions[body.key] || 0) + 1;
    return Response.json({revision:revisions[body.key]});
  }
  return Response.json({id:body.id, saved:true});
};
function load(path, imports) {
  const exports = {};
  const source = ts.transpileModule(fs.readFileSync(path,'utf8'), {
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX},
  }).outputText;
  vm.runInNewContext(source, {exports,fetch,window,AbortSignal,CustomEvent,Response,
    sessionStorage:{},localStorage:{},
    require:name => {if (!(name in imports)) throw Error('Unexpected import: '+name); return imports[name];},
  });
  return exports;
}
const response = load('components/kit/lib/api-response.ts', {});
const access = load('components/kit/lib/admin-session.ts', {'./api-response':response});
const session = load('components/kit/lib/session.ts', {
  react:{}, './api-response':response, './admin-session':access,
  '../data/instruments':{configureInstruments(){}}, '../lib/catalog':{}, './catalog':{configureCatalog(){}},
});
const training = load('components/kit/features/training/shared.tsx', {
  react:{}, 'react/jsx-runtime':{}, '../../lib/api-response':response,
  '../../lib/admin-session':access, '../../lib/session':session, '../../components/ui/primitives':{},
});
window.addEventListener('rv360:admin-reauthenticate', event => {
  event.preventDefault(); prompts++; expired = false; event.detail.resolve();
});
(async () => {
  await session.refreshSession();
  expired = true;
  await session.refreshSession();
  assert.equal(prompts, 1, 'An expired session read (HTTP 200) renews access before unmounting the editor');
  assert.equal(session.getSession().user.role, 'admin');
  expired = true;
  await session.saveValue('rv360:custom-tests', [{id:'draft', title:'Contenido intacto'}]);
  await session.flush();
  assert.equal(prompts, 2);
  assert.equal(mutations.length, 2);
  assert.equal(mutations[0].body, mutations[1].body, 'Session renewal preserves the complete draft');
  assert.equal(session.getSession().revisions['rv360:custom-tests'], 1);
  expired = true;
  const result = await training.trainingApi('/delete-course', {id:'duplicate',version:1,revision:2});
  assert.equal(result.saved, true);
  assert.equal(prompts, 3);
  assert.equal(mutations[2].body, mutations[3].body, 'Training operations use the same bounded session recovery');
  role = 'student'; await session.refreshSession(); expired = true;
  await assert.rejects(training.trainingApi('/simulator/save', {id:'attempt'}), /Sesión vencida/);
  assert.equal(prompts, 3, 'Student requests never ask for administrator credentials');
  console.log('PASS CRUD session: expired admin saves/deletions recover with unchanged bodies; student access stays separate.');
})().catch(error => {console.error(error);process.exitCode=1;});
