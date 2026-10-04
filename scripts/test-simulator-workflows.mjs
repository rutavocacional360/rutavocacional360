import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { resolve } from 'node:path';
import React from 'react';
import { parseHTML } from 'linkedom';

mkdirSync('.qa-tools', { recursive: true });
const folder = mkdtempSync(resolve('.qa-tools', 'simulator-workflows-'));
const outfile = resolve(folder, 'ui.cjs');
await build({
  stdin: { contents: "export {SimulatorRun} from './components/kit/features/training/SimulatorRun';", resolveDir: process.cwd(), loader: 'tsx' },
  jsx: 'automatic', bundle: true, platform: 'node', packages: 'external', format: 'cjs', outfile, loader: { '.css': 'empty' },
  plugins: [{ name: 'fixtures', setup(b) {
    b.onResolve({ filter: /^\.\/shared$/ }, () => ({ path: 'training', namespace: 'fixture' }));
    b.onResolve({ filter: /\/domain\/TestQuestion$/ }, () => ({ path: 'question', namespace: 'fixture' }));
    b.onResolve({ filter: /\/ui\/PdfViewer$/ }, () => ({ path: 'pdf', namespace: 'fixture' }));
    b.onResolve({ filter: /\/ui\/Dialog$/ }, () => ({ path: 'dialog', namespace: 'fixture' }));
    b.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents:
      args.path === 'training' ? 'export const trainingApi=(...args)=>globalThis.__simulatorApi(...args);export const decimal=String;' :
      args.path === 'question' ? 'export function TestQuestion(props){globalThis.__simulatorChange=props.onChange;return null;}' :
      args.path === 'dialog' ? 'export function Dialog({open,children}){return open?children:null;}' : 'export function PdfViewer(){return null;}'
    }));
  } }],
});
const { SimulatorRun } = createRequire(import.meta.url)(outfile);
const { window } = parseHTML('<html><body><div id="runner"></div></body></html>');
Object.assign(globalThis, { window, document: window.document, HTMLElement: window.HTMLElement, Element: window.Element, Node: window.Node, Event: window.Event, IS_REACT_ACT_ENVIRONMENT: true });
const { createRoot } = await import('react-dom/client');
const root = createRoot(document.getElementById('runner'));
const originalTimeout = globalThis.setTimeout, originalClearTimeout = globalThis.clearTimeout;
const timers = new Map(); let timerId = 0;
globalThis.setTimeout = (callback, delay, ...args) => delay === 600 ? (timers.set(++timerId, callback), { autosave: timerId }) : originalTimeout(callback, delay, ...args);
globalThis.clearTimeout = timer => timer?.autosave ? timers.delete(timer.autosave) : originalClearTimeout(timer);
const initial = { id: 'attempt-qa', state: 'in_progress', revision: 0, serverTime: new Date().toISOString(), started_at: new Date().toISOString(), expires_at: null, mode: 'practice', feedback: 'finish', answers: {}, flags: [], instrument: { title: 'Simulador QA', version: '1', options: [], questions: [{ id: 'q', text: 'Pregunta QA', type: 'single' }] } };
const requests = [], releases = [];
let stored = structuredClone(initial), closed = false;
globalThis.__simulatorApi = (path, body) => {
  assert.equal(path, '/answers');
  requests.push(structuredClone(body));
  return new Promise(resolve => releases.push(() => {
    assert.equal(body.revision, stored.revision, 'Each save uses the revision produced by the preceding request');
    stored = { ...stored, answers: body.answers, flags: body.flags, revision: stored.revision + 1 };
    resolve(structuredClone(stored));
  }));
};
const changeAndAutosave = async value => {
  await React.act(async () => globalThis.__simulatorChange(value));
  assert.equal(timers.size, 1);
  const callback = [...timers.values()][0]; timers.clear();
  await React.act(async () => callback());
};
try {
  await React.act(async () => root.render(React.createElement(SimulatorRun, { initial, onClose: () => { closed = true; } })));
  await changeAndAutosave(1);
  await changeAndAutosave(2);
  await changeAndAutosave(3);
  assert.equal(requests.length, 1, 'Autosaves queue while the first request is pending');
  await React.act(async () => releases.shift()());
  assert.equal(requests.length, 2, 'Only the next queued save starts when the first completes');
  assert.equal(requests[1].answers.q, 3, 'Queued saves read the most recent answer');
  await React.act(async () => releases.shift()());
  assert.equal(requests.length, 3);
  await React.act(async () => releases.shift()());
  assert.deepEqual(requests.map(request => request.revision), [0, 1, 2]);
  assert.equal(stored.answers.q, 3);
  assert(document.body.textContent.includes('Tu avance está guardado'));
  const exit = [...document.querySelectorAll('button')].find(button => button.textContent.includes('Guardar y salir'));
  assert(!exit.disabled);
  await React.act(async () => exit.dispatchEvent(new window.Event('click', { bubbles: true })));
  assert(closed);

  const recoveryRequests = [];
  globalThis.__simulatorApi = async (path, body) => { recoveryRequests.push({ path, body }); throw new Error('Reintento QA'); };
  await React.act(async () => root.render(React.createElement(SimulatorRun, { key: 'recovery', initial: { ...initial, state: 'recoverable', error: 'Las respuestas están conservadas.' }, onClose() {} })));
  assert(document.body.textContent.includes('Las respuestas están conservadas.'));
  assert(!document.body.textContent.includes('Guardar y salir'), 'Recoverable submissions cannot edit locked answers');
  const retry = [...document.querySelectorAll('button')].find(button => button.textContent.includes('Reintentar entrega'));
  await React.act(async () => retry.dispatchEvent(new window.Event('click', { bubbles: true })));
  assert.deepEqual(recoveryRequests, [{ path: '/finish', body: { id: initial.id } }]);
  assert(document.body.textContent.includes('Reintento QA'), 'Recovery failures remain visible and retryable');
  console.log('PASS simulator workflows: serialized autosaves retain latest answers and revisions; recoverable deliveries have a dedicated retry without answer writes.');
} finally {
  await React.act(async () => root.unmount());
  globalThis.setTimeout = originalTimeout; globalThis.clearTimeout = originalClearTimeout;
  delete globalThis.__simulatorApi; delete globalThis.__simulatorChange;
}
