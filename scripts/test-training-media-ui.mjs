import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {mkdirSync, mkdtempSync} from 'node:fs';
import {resolve} from 'node:path';
import React from 'react';
import {parseHTML} from 'linkedom';

mkdirSync('.qa-tools', {recursive: true});
const outfile = resolve(mkdtempSync(resolve('.qa-tools', 'media-ui-')), 'ui.cjs');
await build({stdin: {contents: `export {CourseEditor,blankCourse} from './components/kit/features/training/TrainingEditors';export {ActivityAttachments,ActivityMediaEditor} from './components/kit/features/training/ActivityMedia';export {uploadActivityMedia} from './components/kit/lib/activity-media-upload';`, resolveDir: process.cwd(), loader: 'tsx'}, jsx: 'automatic', bundle: true, platform: 'node', packages: 'external', format: 'cjs', outfile, loader: {'.css': 'empty'}, plugins: [{name: 'shared-fixture', setup(b) {
  b.onResolve({filter: /^\.\/shared$/}, () => ({path: 'shared', namespace: 'fixture'}));
  b.onLoad({filter: /.*/, namespace: 'fixture'}, () => ({contents: 'export function ChoiceList(){return null;}export function trainingApi(){throw Error("Unexpected API call");}'}));
}}]});
const {CourseEditor, blankCourse, ActivityAttachments, ActivityMediaEditor, uploadActivityMedia} = createRequire(import.meta.url)(outfile);
const {window} = parseHTML('<html><body><div id="root"></div></body></html>');
Object.assign(globalThis, {window, document: window.document, HTMLElement: window.HTMLElement, Element: window.Element, Node: window.Node, Event: window.Event, IS_REACT_ACT_ENVIRONMENT: true});
window.HTMLElement.prototype.setCustomValidity = function(message) {this.validationMessage = message;};
const {createRoot} = await import('react-dom/client');
const root = createRoot(document.getElementById('root'));
const requests = [];
globalThis.XMLHttpRequest = class {
  upload = {};
  open(method, url) {assert.equal(method, 'POST'); assert.equal(url, '/api/training/media');}
  send(body) {this.file = body.get('file'); requests.push(this);}
  abort() {this.onabort?.();}
  respond(status, data) {this.status = status; this.responseText = typeof data === 'string' ? data : JSON.stringify(data); this.onload();}
  progress(percent) {this.upload.onprogress({lengthComputable: true, loaded: percent, total: 100});}
};
const props = element => element[Object.keys(element).find(key => key.startsWith('__reactProps$'))];
const click = async (text, container = document) => React.act(async () => {
  const button = [...container.querySelectorAll('button')].find(button => button.textContent === text);
  assert(button && !button.disabled, text); button.click();
});
const select = async (files, container = document) => React.act(async () => props(container.querySelector('input[type=file]')).onChange({target: {files, value: 'selected'}}));
const file = (id, name, mimeType = 'image/png') => ({id, name, mimeType, size: 2048});
let course = {...blankCourse(), title: 'Curso inicial', activities: [{id: 'first', title: 'Primera', module: 'Módulo 1', kind: 'text', content: 'Instrucciones iniciales', completion: 'read', required: true, attachments: [file('doc-old', 'guía.pdf', 'application/pdf')]}, {id: 'second', title: 'Segunda', module: 'Módulo 1', kind: 'text', content: '', completion: 'read', required: true}]};
let setCourse, busy = false;
function Harness() {
  const [value, setValue] = React.useState(course);
  setCourse = next => {course = next; setValue(next);};
  return React.createElement(CourseEditor, {value, onChange: setCourse, onBusyChange: value => {busy = value;}, data: {educationLevel: 'bachillerato', careers: [], simulators: [], users: []}});
}

try {
  await React.act(async () => root.render(React.createElement(Harness)));
  const image = new File(['png'], 'lección.png'), bad = new File(['svg'], 'inválido.svg'), video = new File(['mp4'], 'clase.mp4');
  await select([image, bad, video]);
  assert(busy); assert.equal(requests.length, 1);
  await React.act(async () => requests[0].progress(45));
  assert.equal(document.querySelector('progress').getAttribute('value'), '45');
  // The administrator or another UI action can change text/order during upload.
  await React.act(async () => setCourse({...course, title: 'Curso editado durante carga', activities: [course.activities[1], {...course.activities[0], content: 'Contenido actualizado'}]}));
  await React.act(async () => requests[0].respond(201, file('image-new', image.name)));
  assert.equal(course.title, 'Curso editado durante carga');
  assert.equal(course.activities[1].content, 'Contenido actualizado');
  assert.deepEqual(course.activities[1].attachments.map(a => a.id), ['doc-old', 'image-new']);
  assert(!course.activities[0].attachments, 'Reordering never moves the upload to the wrong activity');
  assert.equal(requests.length, 2, 'Invalid formats are rejected before any network call');
  assert.equal(requests[1].file.name, video.name);
  await React.act(async () => requests[1].onerror());
  assert(!busy); assert.equal(course.activities[1].attachments.length, 2, 'Successful uploads survive a later failure');
  const failedVideo = [...document.querySelectorAll('.rv-media-upload-row')].find(row => row.textContent.includes(video.name));
  assert(failedVideo.textContent.includes('Se interrumpió la conexión'));
  await click('Reintentar', failedVideo);
  assert.equal(requests.length, 3); assert.equal(requests[2].file, video, 'Retry preserves the original pending file');
  await React.act(async () => requests[2].respond(201, file('video-new', video.name, 'video/mp4')));
  assert.deepEqual(course.activities[1].attachments.map(a => a.id), ['doc-old', 'image-new', 'video-new'], 'Retry does not duplicate prior successes');
  assert(document.querySelector('video[controls]'));
  assert([...document.querySelectorAll('a')].some(a => a.getAttribute('href') === '/api/training/media/doc-old?download=1'));
  assert(document.body.textContent.includes('Guarda el borrador'));
  const preview = document.querySelector('.rv-media-preview img');
  await React.act(async () => props(preview).onError());
  assert(document.body.textContent.includes('No se pudo mostrar la vista previa'));
  await click('Reintentar vista previa'); assert(document.querySelector('.rv-media-preview img'));
  const saved = structuredClone(course.activities[1].attachments);
  await React.act(async () => root.render(React.createElement(ActivityAttachments, {attachments: saved})));
  assert.equal(document.querySelectorAll('.rv-media-card').length, 3, 'Persisted metadata restores every preview and download');
  await React.act(async () => root.render(React.createElement(ActivityMediaEditor, {attachments: Array.from({length: 12}, (_, i) => file('full-' + i, i + '.png')), onChange() {throw Error('No slot available');}})));
  const before = requests.length;
  await select([image]); assert.equal(requests.length, before); assert(document.body.textContent.includes('Quita uno antes de reintentar'));

  // Transport: real byte progress, bounded auth renewal, malformed proxy replies,
  // and cancellation. These use the actual helper with only the browser XHR mocked.
  let percentages = [], sessionReads = 0;
  globalThis.fetch = async url => {assert.equal(url, '/api/session'); sessionReads++; return Response.json({user: {role: 'admin'}});};
  const transfer = uploadActivityMedia(image, {onProgress: value => percentages.push(value)});
  let xhr = requests.at(-1); xhr.progress(52); xhr.respond(401, {error: 'Caducó'});
  await new Promise(resolve => setImmediate(resolve));
  xhr = requests.at(-1); assert.equal(xhr.file, image); xhr.respond(201, file('renewed', image.name));
  assert.equal((await transfer).id, 'renewed'); assert.equal(sessionReads, 1); assert.deepEqual(percentages, [0, 52, 0]);
  const denied = uploadActivityMedia(image, {onProgress() {}}); const deniedResult = assert.rejects(denied, /Caducó/);
  requests.at(-1).respond(401, {error: 'Caducó'}); await new Promise(resolve => setImmediate(resolve)); requests.at(-1).respond(401, {error: 'Caducó'}); await deniedResult;
  const tooLarge = uploadActivityMedia(image, {onProgress() {}}); const tooLargeResult = assert.rejects(tooLarge, /más pequeño/);
  requests.at(-1).respond(413, '<html>Request too large</html>'); await tooLargeResult;
  const controller = new AbortController();
  const cancelled = uploadActivityMedia(image, {signal: controller.signal, onProgress() {}}); const cancelledResult = assert.rejects(cancelled, error => error.name === 'AbortError');
  controller.abort(); await cancelledResult;
  console.log('PASS media UI: true progress, sequential uploads, client validation, partial success, retry without duplicates, current course edits/order preserved, preview recovery, downloads, limits, session renewal and cancellation.');
} finally {await React.act(async () => root.unmount());}
