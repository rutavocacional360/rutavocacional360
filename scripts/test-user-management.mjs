import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdirSync,mkdtempSync} from 'node:fs';
import {resolve} from 'node:path';
import {createRequire} from 'node:module';

mkdirSync('.qa-tools',{recursive:true});
const folder=mkdtempSync(resolve('.qa-tools','users-'));
process.env.DB_DRIVER='sqlite';process.env.DATABASE_PATH=resolve(folder,'users.sqlite');
process.env.ACADEMIC_CONTENT_PATH=resolve(folder,'academic.json');
const outfile=resolve(folder,'server.cjs');
await build({stdin:{contents:`export {db,put} from './lib/server/store'; export {manageUser} from './lib/server/admin-management'; export {startTest} from './lib/server/test-attempts';`,resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'cjs',packages:'external',outfile,
  plugins:[{name:'server-marker',setup(b){b.onResolve({filter:/^server-only$/},()=>({path:'server-only',namespace:'empty'}));b.onLoad({filter:/.*/,namespace:'empty'},()=>({contents:''}));}}]});
const {db,put,manageUser,startTest}=createRequire(import.meta.url)(outfile);
const admin={id:'admin',name:'Administrador QA',role:'admin',institutionId:'org'};
async function user(id) {
  const student={id,name:'Estudiante de prueba',role:'student',institutionId:'org'};
  await db.prepare('INSERT INTO users VALUES(?,?,?,?,?,?,?,?)').run(id,student.name,id+'@example.test','no-login','student','org','','Activo');
  await put(id,'rv360:profile',{stage:'Estoy eligiendo mi bachillerato'});
  return student;
}
async function trainingDraft(student,state='in_progress') {
  const enrollment='enrollment-'+student.id,attempt='attempt-'+student.id,now=new Date().toISOString();
  await db.prepare('INSERT INTO training_enrollments VALUES(?,?,?,?,?,?,?)').run(enrollment,student.id,'simulator-course',1,'{}','direct',now);
  await db.prepare('INSERT INTO training_attempts VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(attempt,student.id,enrollment,'simulator','practice','{}','{}','[]',0,state,now,null,null,null);
  return {enrollment,attempt,now};
}
try {
  await db.migrate();await db.prepare('INSERT INTO institutions VALUES(?,?,?)').run('org','QA','QA');
  await db.prepare('INSERT INTO users VALUES(?,?,?,?,?,?,?,?)').run(admin.id,admin.name,'admin@example.test','no-login','admin','org','','Activo');
  const student=await user('draft-user');
  const started=await db.context(()=>startTest(student,'intereses'));
  assert(started.id);assert.equal(await db.prepare('SELECT id FROM submissions WHERE user_id=?').get(student.id),undefined);
  await put(student.id,'rv360:answers:intereses:demo-1',{'I-1':5});
  await db.prepare('INSERT INTO sessions VALUES(?,?,?)').run('draft-session',student.id,Date.now()+60000);
  await db.prepare('INSERT INTO resets VALUES(?,?,?)').run('draft-reset',student.id,Date.now()+60000);
  const draft=await trainingDraft(student);
  await db.prepare('INSERT INTO training_feedback VALUES(?,?,?,?,?)').run(draft.attempt,'q1',1,'1',draft.now);
  await db.context(()=>manageUser(admin,{action:'delete',id:student.id}));
  for(const [table,column] of [['users','id'],['assessment_attempts','user_id'],['training_attempts','user_id'],['training_enrollments','user_id'],['documents','owner'],['sessions','userId'],['resets','userId']])
    assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM '+table+' WHERE '+column+'=?').get(student.id)).n,0,table+' must not retain deleted account drafts');
  assert.equal(await db.prepare('SELECT attempt_id FROM training_feedback WHERE attempt_id=?').get(draft.attempt),undefined);
  const graded=await user('graded-user'),gradedDraft=await trainingDraft(graded,'graded');
  await db.prepare('INSERT INTO training_results VALUES(?,?,?,?,?,?,?)').run(gradedDraft.attempt,1,'{"percent":100}','{}','',gradedDraft.now,null);
  await assert.rejects(db.context(()=>manageUser(admin,{action:'delete',id:graded.id})),e=>e.status===409);
  assert(await db.prepare('SELECT id FROM users WHERE id=?').get(graded.id));
  assert.equal((await db.prepare('SELECT result FROM training_results WHERE attempt_id=?').get(gradedDraft.attempt)).result,'{"percent":100}');
  const completed=await user('course-user'),course=await trainingDraft(completed);
  await db.prepare('INSERT INTO training_completions VALUES(?,?,?,?)').run(course.enrollment,'activity','{"text":"Entrega guardada"}',course.now);
  await assert.rejects(db.context(()=>manageUser(admin,{action:'delete',id:completed.id})),e=>e.status===409);
  assert(await db.prepare('SELECT id FROM users WHERE id=?').get(completed.id));
  const submitted=await user('submitted-user');
  await db.prepare('INSERT INTO submissions VALUES(?,?,?,?,?,?,?,?)').run('submission',submitted.id,'intereses','1','{}','[]','{}',course.now);
  await assert.rejects(db.context(()=>manageUser(admin,{action:'delete',id:submitted.id})),e=>e.status===409);
  assert(await db.prepare('SELECT id FROM submissions WHERE user_id=?').get(submitted.id));
  await assert.rejects(db.context(()=>manageUser({...admin,institutionId:'other-org'},{action:'delete',id:submitted.id})),e=>e.status===404);
  console.log('PASS users: unfinished test/training drafts delete cleanly; submitted evaluations, simulator grades and course evidence retain accounts and history; cross-institution deletion denied.');
} finally {await db.close();}
