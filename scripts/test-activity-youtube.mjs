import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {mkdirSync,mkdtempSync} from 'node:fs';
import {resolve} from 'node:path';

mkdirSync('.qa-tools', {recursive: true});
const folder = mkdtempSync(resolve('.qa-tools', 'youtube-'));
process.env.DB_DRIVER = 'sqlite'; process.env.DATABASE_PATH = resolve(folder, 'test.sqlite');
process.env.ACADEMIC_CONTENT_PATH = resolve(folder, 'academic.json');
const outfile = resolve(folder, 'youtube.cjs');
await build({stdin: {contents: `export * from './components/kit/lib/activity-youtube';export {db} from './lib/server/store';export {saveTraining,trainingState} from './lib/server/training';`, resolveDir: process.cwd(), loader: 'ts'}, bundle: true, platform: 'node', format: 'cjs', packages: 'external', outfile, plugins: [{name: 'server-marker', setup(b) {
  b.onResolve({filter: /^server-only$/}, () => ({path: 'server-only', namespace: 'empty'}));
  b.onLoad({filter: /.*/, namespace: 'empty'}, () => ({contents: ''}));
}}]});
const {parseYouTubeUrl, youtubeWatchUrl, youtubeEmbedUrl, validateYouTubeVideos, YOUTUBE_VIDEO_LIMIT, db, saveTraining, trainingState} = createRequire(import.meta.url)(outfile);
const id = 'dQw4w9WgXcQ', secondId = 'aqz-KE-bpKQ';
const expected = {videoId: id};
for (const url of [
  `https://youtube.com/watch?v=${id}`, `https://www.youtube.com/watch?v=${id}&si=tracking`,
  `http://m.youtube.com/watch?v=${id}`, `https://music.youtube.com/watch?v=${id}&list=ignored`,
  `https://youtu.be/${id}`, `https://www.youtube.com/shorts/${id}`, `https://www.youtube.com/live/${id}`,
  `https://youtube.com/embed/${id}`, `https://www.youtube-nocookie.com/embed/${id}`,
  `https://youtube-nocookie.com/embed/${id}`, ` www.youtube.com/watch?v=${id} `,
]) assert.deepEqual(parseYouTubeUrl(url), expected, url);
for (const [suffix, startSeconds] of [['?t=90',90],['?t=1m30s',90],['?t=1h2m3s',3723],['?start=86400',86400],['#t=90s',90],['?t=90&start=90',90]])
  assert.deepEqual(parseYouTubeUrl(`https://youtu.be/${id}${suffix}`), {videoId:id,startSeconds}, suffix);
assert.deepEqual(parseYouTubeUrl(`https://youtu.be/${id}?t=0`), expected);
for (const url of [
  '', id, null, {}, `<iframe src="https://www.youtube.com/embed/${id}"></iframe>`,
  `javascript:alert(1)`, `https://youtube.com.evil.test/watch?v=${id}`, `https://evil.test/watch?v=${id}`,
  `https://youtube.com@evil.test/watch?v=${id}`, `https://attacker@youtube.com/watch?v=${id}`,
  `https://youtube.com:443/watch?v=${id}`, `http://youtube.com:80/watch?v=${id}`, `https://youtube.com:444/watch?v=${id}`,
  `ftp://youtube.com/watch?v=${id}`, `https://youtu.be/${id}/unexpected`, `https://youtube.com/playlist?list=${id}`,
  `https://youtube-nocookie.com/watch?v=${id}`, `https://youtube.com/watch?v=short`,
  `https://youtube.com/watch?v=${id}&v=${secondId}`, `https://youtu.be/${id}?t=-1`,
  `https://youtu.be/${id}?t=1.5`, `https://youtu.be/${id}?t=24h1s`, `https://youtu.be/${id}?start=86401`,
  `https://youtu.be/${id}?start=1m30s`, `https://youtu.be/${id}?t=90&start=91`,
  `https://youtu.be/${id}?t=90&t=90`, `https://youtu.be/${id}?t=`,
  `https://youtube.com\t.evil.test/watch?v=${id}`, `https://youtu.be/${id}?t=999999999999999999999`,
]) assert.equal(parseYouTubeUrl(url), null, String(url));
assert.equal(youtubeWatchUrl({videoId:id,startSeconds:90}), `https://www.youtube.com/watch?v=${id}&t=90s`);
assert.equal(youtubeEmbedUrl({videoId:id,startSeconds:90}), `https://www.youtube-nocookie.com/embed/${id}?rel=0&playsinline=1&start=90`);
assert(!youtubeEmbedUrl({videoId:id}).includes('autoplay'));
assert.deepEqual(parseYouTubeUrl(youtubeWatchUrl({videoId:id,startSeconds:90})), {videoId:id,startSeconds:90});
assert.throws(() => youtubeEmbedUrl({videoId:'../evil.test'}), /video válido/);
assert.equal(YOUTUBE_VIDEO_LIMIT,12); assert.equal(validateYouTubeVideos(undefined),undefined);
assert.deepEqual(validateYouTubeVideos([{videoId:id,title:'  Lección breve  ',startSeconds:0,src:'https://evil.test',html:'<iframe/>'}]), [{videoId:id,title:'Lección breve'}]);
assert.deepEqual(validateYouTubeVideos([{videoId:id,title:'  '}]), [{videoId:id,title:'Video de YouTube'}]);
const invalid = [null,{},'iframe',[null],[{videoId:'invalid'}],[{videoId:id,title:'x'.repeat(181)}],[{videoId:id,title:{}}],[{videoId:id,startSeconds:'90'}],[{videoId:id,startSeconds:-1}],[{videoId:id,startSeconds:1.5}],[{videoId:id,startSeconds:86401}],[{videoId:id},{videoId:id}],Array(13).fill({videoId:id})];
for (const input of invalid) assert.throws(() => validateYouTubeVideos(input));
assert.equal(validateYouTubeVideos(Array.from({length:12},(_,n)=>({videoId:'abcdefghij'+n.toString(16)}))).length,12);

const admin = {id:'youtube-admin',role:'admin',institutionId:'youtube-org'}, student = {...admin,id:'youtube-student',role:'student'};
const course = () => ({id:'',version:0,revision:0,status:'draft',educationLevel:'bachillerato',title:'Curso con YouTube',description:'Reflexiona sobre un video',objectives:'Aprender',level:'Inicial',type:'general',careerIds:[],institutions:[],fields:[],studentIds:[],access:'all',activities:[{id:'video-only',module:'Explorar',title:'Mira y reflexiona',kind:'text',content:'',youtubeVideos:[{videoId:id,title:'  Video sobre intereses  ',startSeconds:90,src:'https://evil.test'}],required:true,completion:'read'}]});
try {
  await db.migrate();
  await db.prepare('INSERT INTO institutions VALUES(?,?,?)').run(admin.institutionId,'YouTube QA','YT');
  for (const user of [admin,student]) await db.prepare('INSERT INTO users VALUES(?,?,?,?,?,?,?,?)').run(user.id,user.id,user.id+'@example.test','unused',user.role,user.institutionId,'','Activo');
  const draft = await saveTraining(admin,'course',course());
  assert.deepEqual(draft.activities[0].youtubeVideos,[{videoId:id,title:'Video sobre intereses',startSeconds:90}], 'Draft persistence canonicalizes instead of trusting arbitrary embed URLs');
  const published = await saveTraining(admin,'course',{...draft,status:'published'});
  assert.equal(published.activities[0].content,'', 'YouTube alone is sufficient material for a text lesson');
  assert.deepEqual((await trainingState(admin)).courses.find(c=>c.id===published.id).activities[0].youtubeVideos,published.activities[0].youtubeVideos);
  await db.prepare('INSERT INTO training_enrollments VALUES(?,?,?,?,?,?,?)').run('youtube-enrollment',student.id,published.id,published.version,JSON.stringify(published),'{}',new Date().toISOString());
  const replacement = await saveTraining(admin,'course',{...published,version:0,revision:0,status:'draft',activities:published.activities.map(a=>({...a,youtubeVideos:[{videoId:secondId,title:'Otro video'}]}))});
  await saveTraining(admin,'course',{...replacement,status:'published'});
  const stored = await db.prepare('SELECT snapshot FROM training_enrollments WHERE id=?').get('youtube-enrollment');
  assert.deepEqual(JSON.parse(stored.snapshot).activities[0].youtubeVideos,published.activities[0].youtubeVideos,'Republishing retains the enrolled YouTube content');
  for (const status of ['draft','published']) for (const videos of invalid) {
    const input=course(); input.title='Inválido '+status; input.status=status; input.activities[0].youtubeVideos=videos;
    await assert.rejects(saveTraining(admin,'course',input),error=>error.status===400,'Reject invalid YouTube content before persisting '+status);
  }
  const link=course();link.title='Enlace vacío';link.status='published';link.activities[0].kind='link';
  await assert.rejects(saveTraining(admin,'course',link),/enlace HTTPS/,'YouTube attachments do not bypass the required HTTPS URL of a link activity');
  await assert.rejects(saveTraining(student,'course',course()),error=>error.status===403);
  console.log('PASS YouTube: approved URLs/timestamps, fixed privacy embeds, no arbitrary origins/HTML/ports, limits/duplicates, draft validation, video-only publication and immutable enrollment snapshots.');
} finally {await db.close();}
