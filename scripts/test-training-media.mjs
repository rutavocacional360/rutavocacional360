import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdirSync, mkdtempSync, readFileSync, unlinkSync} from 'node:fs';
import {resolve} from 'node:path';
import {createRequire} from 'node:module';
import sharp from 'sharp';

mkdirSync('.qa-tools', {recursive: true});
const folder = mkdtempSync(resolve('.qa-tools', 'training-media-'));
process.env.DB_DRIVER = 'sqlite'; process.env.DATABASE_PATH = resolve(folder, 'test.sqlite');
process.env.TRAINING_MEDIA_PATH = resolve(folder, 'private-media');
const outfile = resolve(folder, 'server.cjs');
await build({stdin: {contents: `export {db,put} from './lib/server/store';export * from './lib/server/training-media';export {saveTraining} from './lib/server/training';export {readBoundedBody} from './lib/server/request-body';`, resolveDir: process.cwd(), loader: 'ts'}, bundle: true, platform: 'node', format: 'cjs', packages: 'external', outfile,
  plugins: [{name: 'server-marker', setup(b) {b.onResolve({filter: /^server-only$/}, () => ({path: 'server-only', namespace: 'empty'})); b.onLoad({filter: /.*/, namespace: 'empty'}, () => ({contents: ''}));}}]});
const {db, storeActivityFile, readableActivityFile, activityFileResponse, validateActivityAttachments, saveTraining, readBoundedBody} = createRequire(import.meta.url)(outfile);
const admin = {id: 'admin', role: 'admin', institutionId: 'org'}, student = {id: 'student', role: 'student', institutionId: 'org'};
const second = {...student, id: 'second'}, foreign = {...admin, institutionId: 'other'};
const request = (id, headers = {}, method = 'GET', query = '') => new Request('http://localhost/api/training/media/' + id + query, {headers, method});
try {
  await db.migrate(); await db.prepare('INSERT INTO institutions VALUES(?,?,?)').run('org', 'QA', 'QA');
  for (const user of [admin, student, second]) await db.prepare('INSERT INTO users VALUES(?,?,?,?,?,?,?,?)').run(user.id, user.id, user.id + '@example.test', 'unused', user.role, user.institutionId, '', 'Activo');
  const png = await sharp({create: {width: 8, height: 8, channels: 3, background: '#7060df'}}).png().toBuffer();
  const image = await storeActivityFile(admin, new File([png], '../actividad.png', {type: 'text/html'}));
  assert.equal(image.mimeType, 'image/png', 'The detected bytes determine MIME, not the browser header');
  assert.equal(image.name, 'actividad.png');
  assert.deepEqual(readFileSync(resolve(process.env.TRAINING_MEDIA_PATH, image.id)), png, 'Bytes survive on private disk independently of course JSON');
  await assert.rejects(storeActivityFile(student, new File([png], 'image.png')), error => error.status === 403);
  for (const [name, data] of [['script.svg', '<svg/>'], ['fake.jpg', '<script>alert(1)</script>'], ['fake.mp4', 'not a movie'], ['archive.docx', 'not a zip']])
    await assert.rejects(storeActivityFile(admin, new File([data], name)), error => error.status === 400 || error.status === 415);
  const doc = await storeActivityFile(admin, new File(['%PDF-1.7\nexample\n%%EOF'], 'lección.pdf'));
  const videoBytes = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypisom'), Buffer.alloc(4), Buffer.from('isommp42'), Buffer.alloc(80, 1)]);
  const video = await storeActivityFile(admin, new File([videoBytes], 'actividad.mp4'));
  assert.equal(video.mimeType, 'video/mp4');
  await assert.rejects(readableActivityFile(foreign, image.id), error => error.status === 404);
  await assert.rejects(readableActivityFile(student, image.id), error => error.status === 404, 'An upload cannot be read before enrollment');
  await assert.rejects(readableActivityFile(admin, '../../etc/passwd'), error => error.status === 404);
  const activities = [{id: 'a', module: 'Materiales', title: 'Exploración', kind: 'text', content: '', required: true, completion: 'read', attachments: [image, video, doc]}];
  const forged = structuredClone(activities); forged[0].attachments[0].mimeType = 'text/html';
  await validateActivityAttachments(admin, forged);
  assert.equal(forged[0].attachments[0].mimeType, 'image/png', 'Course snapshots cannot forge stored media metadata');
  await assert.rejects(validateActivityAttachments(foreign, structuredClone(activities)), /institución/);
  await assert.rejects(validateActivityAttachments(admin, [{attachments: [image, image]}]), /archivos/);
  await assert.rejects(validateActivityAttachments(admin, [{attachments: Array(13).fill(image)}]), /12/);
  const course = await saveTraining(admin, 'course', {id: '', version: 0, revision: 0, status: 'published', title: 'Curso multimedia', description: 'Ver materiales', objectives: 'Explorar', educationLevel: 'bachillerato', level: 'Inicial', type: 'general', careerIds: [], institutions: [], fields: [], access: 'all', studentIds: [], activities});
  await assert.rejects(readableActivityFile(student, image.id), error => error.status === 404, 'Published media cannot bypass course enrollment prerequisites');
  await db.prepare('INSERT INTO training_enrollments VALUES(?,?,?,?,?,?,?)').run('enrollment', student.id, course.id, course.version, JSON.stringify(course), '{}', new Date().toISOString());
  assert.equal((await readableActivityFile(student, image.id)).id, image.id);
  await assert.rejects(readableActivityFile(second, image.id), error => error.status === 404);
  await db.prepare("UPDATE training_entities SET status='archived' WHERE id=?").run(course.id);
  assert.equal((await readableActivityFile(student, image.id)).id, image.id, 'Published replacements/archives retain enrolled materials');
  const full = await activityFileResponse(student, video.id, request(video.id));
  assert.equal(full.status, 200); assert.equal(full.headers.get('accept-ranges'), 'bytes');
  assert.equal(full.headers.get('cache-control'), 'private, no-store');
  assert.deepEqual(Buffer.from(await full.arrayBuffer()), videoBytes);
  for (const [range, expected, from, to] of [['bytes=0-9', videoBytes.subarray(0, 10), 0, 9], ['bytes=90-', videoBytes.subarray(90), 90, 103], ['bytes=-4', videoBytes.subarray(-4), 100, 103]]) {
    const partial = await activityFileResponse(student, video.id, request(video.id, {Range: range}));
    assert.equal(partial.status, 206); assert.equal(partial.headers.get('content-range'), `bytes ${from}-${to}/104`);
    assert.deepEqual(Buffer.from(await partial.arrayBuffer()), expected);
  }
  for (const range of ['bytes=999-', 'bytes=10-1', 'bytes=-0', 'bytes=0-1,3-4', 'bytes=-', 'bytes=9007199254740993-'])
    assert.equal((await activityFileResponse(student, video.id, request(video.id, {Range: range}))).status, 416);
  const head = await activityFileResponse(student, video.id, request(video.id, {}, 'HEAD'));
  assert.equal(head.headers.get('content-length'), '104'); assert.equal((await head.arrayBuffer()).byteLength, 0);
  const download = await activityFileResponse(student, doc.id, request(doc.id));
  assert.match(download.headers.get('content-disposition'), /^attachment;/); await download.arrayBuffer();
  const explicitDownload = await activityFileResponse(student, image.id, request(image.id, {}, 'GET', '?download=1'));
  assert.match(explicitDownload.headers.get('content-disposition'), /^attachment;/); await explicitDownload.arrayBuffer();
  const huge = new Request('http://localhost', {method: 'POST', body: new ReadableStream({start(controller) {controller.enqueue(new Uint8Array(1025)); controller.close();}}), duplex: 'half'});
  await assert.rejects(readBoundedBody(huge, 1024), error => error.status === 413, 'Chunked upload limits apply without Content-Length');
  unlinkSync(resolve(process.env.TRAINING_MEDIA_PATH, image.id));
  await assert.rejects(activityFileResponse(student, image.id, request(image.id)), error => error.status === 404);
  await assert.rejects(validateActivityAttachments(admin, structuredClone(activities)), /almacenamiento/);
  console.log('PASS course media: signature validation, private persistence, metadata normalization, enrollment/org authorization, archived snapshots, streaming ranges, downloads, byte limits and missing files.');
} finally {await db.close();}
