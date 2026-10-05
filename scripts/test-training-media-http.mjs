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
  const youtubeInput = {id: '', version: 0, revision: 0, status: 'published', title: 'Curso solo YouTube HTTP', description: 'Mira y reflexiona', objectives: 'Explorar tus intereses', educationLevel: state.educationLevel, level: 'Inicial', type: 'general', careerIds: [], institutions: [], fields: [], access: 'all', studentIds: [], activities: [{id: 'youtube-activity', module: 'Explorar', title: 'Video sobre intereses', kind: 'text', content: '', youtubeVideos: [{videoId: 'dQw4w9WgXcQ', title: '  Mi video  ', startSeconds: 90, src: 'https://untrusted.example/embed'}], required: true, completion: 'read'}]};
  const expectedVideos = [{videoId: 'dQw4w9WgXcQ', title: 'Mi video', startSeconds: 90}];
  const youtubeCourse = await json('training/entity', {kind: 'course', entity: youtubeInput});
  assert.deepEqual(youtubeCourse.activities[0].youtubeVideos, expectedVideos, 'Only canonical video metadata is persisted; no arbitrary iframe URL');
  const youtubeEnrollment = await json('training/enroll', {courseId: youtubeCourse.id}, studentCookie);
  assert.deepEqual(youtubeEnrollment.snapshot.activities[0].youtubeVideos, expectedVideos, 'The student receives the published YouTube material without uploaded files or text');
  const attemptSave = (entity, cookie = adminCookie) => fetch(base + '/api/training/entity', {method: 'POST', headers: {Origin: base, Cookie: cookie, 'Content-Type': 'application/json'}, body: JSON.stringify({kind: 'course', entity})});
  for (const status of ['draft', 'published']) for (const videos of [
    '<iframe src="https://untrusted.example"></iframe>', [{videoId: 'https://untrusted.example'}],
    [{videoId: 'dQw4w9WgXcQ'}, {videoId: 'dQw4w9WgXcQ'}], [{videoId: 'dQw4w9WgXcQ', startSeconds: -1}],
    [{videoId: 'dQw4w9WgXcQ', startSeconds: 86401}], Array(13).fill({videoId: 'dQw4w9WgXcQ'}),
  ]) {
    const invalid = {...youtubeInput, title: 'YouTube inválido ' + status, status, activities: [{...youtubeInput.activities[0], youtubeVideos: videos}]};
    const rejected = await attemptSave(invalid);
    assert.equal(rejected.status, 400, 'Validate YouTube metadata on every ' + status + ' save'); await rejected.arrayBuffer();
  }
  const forbidden = await attemptSave({...youtubeInput, title: 'Edición del estudiante'}, studentCookie);
  assert.equal(forbidden.status, 403); await forbidden.arrayBuffer();
  await json('training/archive', {kind: 'course', id: youtubeCourse.id, version: youtubeCourse.version, revision: youtubeCourse.revision});
  const historical = await json('training/enroll', {courseId: youtubeCourse.id}, studentCookie);
  assert.deepEqual(historical.snapshot.activities[0].youtubeVideos, expectedVideos, 'Archived publications preserve enrolled video metadata');
  console.log('PASS HTTP course media: authenticated admin upload, CSRF/format rejection, publication, enrollment, image bytes, video Range/HEAD and archived snapshot access.');
  console.log('PASS HTTP YouTube: video-only publication, canonical metadata, student snapshot, invalid drafts/publications rejected, admin-only edits and archived enrollment continuity.');
}
