import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {mkdirSync, mkdtempSync} from 'node:fs';
import {resolve} from 'node:path';
import React from 'react';
import {parseHTML} from 'linkedom';

mkdirSync('.qa-tools', {recursive: true});
const outfile = resolve(mkdtempSync(resolve('.qa-tools', 'youtube-ui-')), 'ui.cjs');
await build({stdin: {contents: `export {ActivityYouTubeEditor,ActivityYouTubeVideos} from './components/kit/features/training/ActivityYouTube';`, resolveDir: process.cwd(), loader: 'tsx'}, jsx: 'automatic', bundle: true, platform: 'node', packages: 'external', format: 'cjs', outfile, loader: {'.css': 'empty'}});
const {ActivityYouTubeEditor, ActivityYouTubeVideos} = createRequire(import.meta.url)(outfile);
const {window} = parseHTML('<html><body><div id="root"></div></body></html>');
Object.assign(globalThis, {window, document: window.document, HTMLElement: window.HTMLElement, Element: window.Element, Node: window.Node, Event: window.Event, IS_REACT_ACT_ENVIRONMENT: true});
window.HTMLElement.prototype.setCustomValidity = function(message) {this.validationMessage = message;};
let focused;
window.HTMLElement.prototype.focus = function() {focused = this.id;};
const {createRoot} = await import('react-dom/client');
const root = createRoot(document.getElementById('root'));
const props = element => element[Object.keys(element).find(key => key.startsWith('__reactProps$'))];
const input = label => {
  const fieldLabel = [...document.querySelectorAll('label')].find(item => item.textContent === label);
  assert(fieldLabel, 'Visible label: ' + label);
  return document.getElementById(fieldLabel.getAttribute('for'));
};
const type = async (label, value) => React.act(async () => {
  const field = input(label); field.value = value;
  props(field).onChange({target: field, currentTarget: field});
});
const button = label => [...document.querySelectorAll('button')].find(item => item.textContent === label || item.getAttribute('aria-label') === label);
const click = async label => React.act(async () => {const item = button(label); assert(item && !item.disabled, label); item.click();});
let videos = [], disabled = false, changes = 0, setVideos, setDisabled;
function Harness() {
  const [value, update] = React.useState(videos), [busy, updateBusy] = React.useState(disabled);
  setVideos = next => {videos = next; update(next);};
  setDisabled = next => {disabled = next; updateBusy(next);};
  return React.createElement(ActivityYouTubeEditor, {videos: value, disabled: busy, onChange: next => {changes++; setVideos(next);}});
}

try {
  await React.act(async () => root.render(React.createElement(Harness)));
  assert.equal(document.querySelectorAll('iframe').length, 0);
  await type('Enlace de YouTube', 'https://example.test/watch?v=dQw4w9WgXcQ');
  assert.equal(document.querySelectorAll('iframe').length, 0, 'Typing a URL never loads a third-party preview');
  await click('Añadir video de YouTube');
  assert.equal(changes, 0, 'An unrelated URL cannot enter activity metadata');
  assert.equal(input('Enlace de YouTube').getAttribute('aria-invalid'), 'true');
  assert.equal(focused, input('Enlace de YouTube').id, 'An invalid link receives focus');
  assert(document.body.textContent.includes('Introduce un enlace válido de YouTube (youtube.com o youtu.be).'));

  await type('Enlace de YouTube', 'https://youtu.be/dQw4w9WgXcQ?t=1m30s');
  await type('Título del video (opcional)', '  Descubre tus intereses  ');
  assert.equal(document.querySelectorAll('iframe').length, 0, 'A valid link still waits for the explicit add action');
  await click('Añadir video de YouTube');
  assert.deepEqual(videos, [{videoId: 'dQw4w9WgXcQ', title: 'Descubre tus intereses', startSeconds: 90}]);
  assert.equal(input('Enlace de YouTube').value, '');
  assert.equal(input('Título del video (opcional)').value, '');
  assert(document.body.textContent.includes('Video añadido. Guarda el borrador para conservarlo o publica el curso para compartirlo.'));
  let player = document.querySelector('iframe');
  assert.equal(player.getAttribute('src'), 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0&playsinline=1&start=90');
  assert.equal(player.getAttribute('title'), 'Descubre tus intereses');
  assert.equal(player.getAttribute('referrerPolicy') || player.getAttribute('referrerpolicy'), 'strict-origin-when-cross-origin');
  assert.equal(player.getAttribute('loading'), 'lazy');
  assert.equal(props(player).allowFullScreen, true);
  assert(!player.getAttribute('allow').includes('autoplay') && !player.getAttribute('src').includes('autoplay'), 'Playback starts only when the student chooses it');
  let fallback = document.querySelector('.rv-youtube-actions a');
  assert.equal(fallback.getAttribute('href'), 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=90s');
  assert.equal(fallback.getAttribute('target'), '_blank');
  assert.equal(fallback.getAttribute('rel'), 'noopener noreferrer');

  await type('Enlace de YouTube', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  await click('Añadir video de YouTube');
  assert.equal(videos.length, 1, 'A second URL or timestamp cannot duplicate the same video');
  assert(document.body.textContent.includes('Este video ya está añadido a la actividad.'));
  await type('Enlace de YouTube', 'https://www.youtube.com/shorts/aqz-KE-bpKQ');
  let prevented = false;
  await React.act(async () => props(input('Enlace de YouTube')).onKeyDown({key: 'Enter', nativeEvent: {isComposing: false}, preventDefault() {prevented = true;}}));
  assert(prevented, 'Enter adds the video without submitting the surrounding course form');
  assert.deepEqual(videos[1], {videoId: 'aqz-KE-bpKQ', title: 'Video de YouTube'});
  await click('Quitar video de YouTube: Descubre tus intereses');
  assert.deepEqual(videos.map(video => video.videoId), ['aqz-KE-bpKQ']);
  assert(document.body.textContent.includes('Video quitado de la actividad. Guarda el curso para conservar el cambio.'));

  await type('Enlace de YouTube', 'https://youtu.be/9bZkp7q19f0');
  await React.act(async () => setVideos([...videos, {videoId: 'jNQXAC9IVRw', title: 'Actualización del curso'}]));
  await click('Añadir video de YouTube');
  assert.deepEqual(videos.map(video => video.videoId), ['aqz-KE-bpKQ', 'jNQXAC9IVRw', '9bZkp7q19f0'], 'Adding uses the latest parent metadata and keeps an update received while typing');

  await React.act(async () => setDisabled(true));
  assert([...document.querySelectorAll('input')].every(field => field.disabled));
  assert([...document.querySelectorAll('button')].every(item => item.disabled), 'Saving the parent course blocks add and remove controls');
  const beforeDisabled = changes;
  await React.act(async () => props(button('Añadir video de YouTube')).onClick());
  await React.act(async () => props(button('Quitar video de YouTube: Actualización del curso')).onClick());
  assert.equal(changes, beforeDisabled, 'Even delayed event handlers honor the current disabled state');

  await React.act(async () => {setDisabled(false); setVideos(Array.from({length: 12}, (_, index) => ({videoId: 'video' + String(index).padStart(6, '0'), title: 'Video ' + index})));});
  assert(button('Añadir video de YouTube').disabled);
  assert(document.body.textContent.includes('Has añadido los 12 videos permitidos. Quita uno para añadir otro.'));
  const beforeFull = changes;
  await React.act(async () => props(button('Añadir video de YouTube')).onClick());
  assert.equal(changes, beforeFull, 'The add handler also enforces the attachment limit');
  await click('Quitar video de YouTube: Video 0');
  assert.equal(videos.length, 11); assert(!button('Añadir video de YouTube').disabled, 'Removing at the limit makes room for another video');

  await React.act(async () => root.render(React.createElement(ActivityYouTubeVideos, {videos: [videos[0]]})));
  assert.equal(document.querySelectorAll('button,input').length, 0, 'The student renderer exposes no editing controls');
  assert.equal(document.querySelectorAll('iframe').length, 1);
  assert(document.querySelector('.rv-youtube-actions a'), 'The external YouTube link is always present even when an embed is blocked');
  await React.act(async () => root.render(React.createElement(ActivityYouTubeVideos)));
  assert.equal(document.querySelectorAll('.rv-youtube-videos').length, 0, 'Activities without videos do not render an empty resource panel');
  console.log('PASS YouTube UI: explicit add, invalid/duplicate links, keyboard submission, privacy embed/referrer/fallback, timestamps, latest metadata, disabled editing, limit/removal and student presentation.');
} finally {await React.act(async () => root.unmount());}
