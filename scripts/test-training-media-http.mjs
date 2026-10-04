import assert from 'node:assert/strict';
import sharp from 'sharp';

export async function runTrainingMediaHttp({base, adminCookie, studentCookie}) {
  const json = async (path, body, cookie = adminCookie) => {
    const response = await fetch(base + '/api/' + path, {method: body ? 'POST' : 'GET', headers: {Origin: base, Cookie: cookie, 'Content-Type': 'application/json'}, ...(body ? {body: JSON.stringify(body)} : {})});
    const value = await response.json(); assert.equal(response.status, 200, path + ': ' + (value.error || '')); return value;
  };
  const upload = async (bytes, name, cookie = adminCookie, origin = base) => {
    const body = new FormData(); body.append('file', new File([bytes], name));
    return fetch(base + '/api/training/media', {method: 'POST', headers: {Origin: origin, Cookie: cookie}, body});
  };
  const png = await sharp({create: {width: 12, height: 12, channels: 3, background: '#7562d4'}}).png().toBuffer();
  assert.equal((await upload(png, 'clase.png', '')).status, 401);
  assert.equal((await upload(png, 'clase.png', studentCookie)).status, 403);
  assert.equal((await upload(png, 'clase.png', adminCookie, 'https://foreign.example')).status, 403);
  assert.equal((await upload('<script>alert(1)</script>', 'clase.jpg')).status, 415);
  const uploaded = await upload(png, 'clase.png'); assert.equal(uploaded.status, 201); const file = await uploaded.json();
  const videoBytes = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypisom'), Buffer.alloc(4), Buffer.from('isommp42'), Buffer.alloc(80, 1)]);
  const uploadedVideo = await upload(videoBytes, 'clase.mp4'); assert.equal(uploadedVideo.status, 201); const video = await uploadedVideo.json();
  const url = id => base + '/api/training/media/' + id;
  assert.equal((await fetch(url(file.id))).status, 401);
  assert.equal((await fetch(url(file.id), {headers: {Cookie: studentCookie}})).status, 404);
  const state = await json('training', null, studentCookie);
  const course = await json('training/entity', {kind: 'course', entity: {id: '', version: 0, revision: 0, status: 'published', title: 'Material multimedia HTTP', description: 'Actividad con imagen y video', objectives: 'Explorar', educationLevel: state.educationLevel, level: 'Inicial', type: 'general', careerIds: [], institutions: [], fields: [], access: 'all', studentIds: [], activities: [{id: 'media-activity', module: 'Explorar', title: 'Video e imagen', kind: 'text', content: '', attachments: [file, video], required: true, completion: 'read'}]}});
  const enrollment = await json('training/enroll', {courseId: course.id}, studentCookie);
  assert.equal(enrollment.snapshot.activities[0].attachments[0].id, file.id);
  const viewed = await fetch(url(file.id), {headers: {Cookie: studentCookie}});
  assert.equal(viewed.status, 200); assert.equal(viewed.headers.get('content-type'), 'image/png');
  assert.deepEqual(Buffer.from(await viewed.arrayBuffer()), png);
  const ranged = await fetch(url(video.id), {headers: {Cookie: studentCookie, Range: 'bytes=0-23'}});
  assert.equal(ranged.status, 206); assert.equal(ranged.headers.get('content-range'), 'bytes 0-23/104');
  assert.deepEqual(Buffer.from(await ranged.arrayBuffer()), videoBytes.subarray(0, 24));
  const head = await fetch(url(video.id), {method: 'HEAD', headers: {Cookie: studentCookie}});
  assert.equal(head.status, 200); assert.equal(head.headers.get('content-length'), '104');
  await json('training/archive', {kind: 'course', id: course.id, version: course.version, revision: course.revision});
  const archived = await fetch(url(file.id), {headers: {Cookie: studentCookie}});
  assert.equal(archived.status, 200); await archived.arrayBuffer();
  console.log('PASS HTTP course media: authenticated admin upload, CSRF/format rejection, publication, enrollment, image bytes, video Range/HEAD and archived snapshot access.');
}
