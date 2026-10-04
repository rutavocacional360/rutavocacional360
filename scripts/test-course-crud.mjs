import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';

mkdirSync('.qa-tools', { recursive: true });
const folder = mkdtempSync(resolve('.qa-tools', 'course-crud-'));
process.env.DB_DRIVER = 'sqlite';
process.env.DATABASE_PATH = resolve(folder, 'courses.sqlite');
process.env.ACADEMIC_CONTENT_PATH = resolve(folder, 'academic.json');
const outfile = resolve(folder, 'server.cjs');
await build({ stdin: { contents: `export {db} from './lib/server/store';export * from './lib/server/training';export {courseFamilies} from './components/kit/lib/course-catalog';`, resolveDir: process.cwd(), loader: 'ts' }, bundle: true, platform: 'node', format: 'cjs', packages: 'external', outfile,
  plugins: [{ name: 'server-marker', setup(b) { b.onResolve({ filter: /^server-only$/ }, () => ({ path: 'server-only', namespace: 'empty' })); b.onLoad({ filter: /.*/, namespace: 'empty' }, () => ({ contents: '' })); } }] });
const { db, saveTraining, trainingAction, trainingState, courseFamilies } = createRequire(import.meta.url)(outfile);
const admin = { id: 'course-admin', role: 'admin', institutionId: 'course-org' };
const foreign = { ...admin, id: 'foreign-admin', institutionId: 'foreign-org' };
const student = { id: 'course-student', role: 'student', institutionId: admin.institutionId };
const action = (path, course, user = admin) => trainingAction(user, 'training/' + path, 'POST', { kind: 'course', id: course.id, version: course.version, revision: course.revision }, new URLSearchParams());
const blank = level => ({ id: '', version: 0, revision: 0, status: 'draft', educationLevel: level, title: 'Programa ' + level, description: 'Reflexión y orientación', objectives: 'Reconocer intereses', level: 'Introductorio', type: 'general', careerIds: [], institutions: [], fields: [], access: 'all', studentIds: [], activities: [{ id: 'activity-a', module: 'Conócete', title: 'Mis intereses', kind: 'text', content: 'Escribe tus intereses y conversa sobre ellos.', required: true, completion: 'read' }] });
try {
  await db.migrate();
  await db.prepare('INSERT INTO institutions VALUES(?,?,?)').run(admin.institutionId, 'Cursos QA', 'QA');
  for (const user of [admin, student]) await db.prepare('INSERT INTO users VALUES(?,?,?,?,?,?,?,?)').run(user.id, user.id, user.id + '@example.test', 'no-login', user.role, user.institutionId, '', 'Activo');
  for (const level of ['bachillerato', 'universidad']) {
    const input = blank(level);
    const created = await saveTraining(admin, 'course', input);
    assert.equal((await saveTraining(admin, 'course', input)).id, created.id, 'Retry reuses the same creation');
    await assert.rejects(saveTraining(student, 'course', input), e => e.status === 403);
    const edited = await saveTraining(admin, 'course', { ...created, description: 'Descripción revisada' });
    await assert.rejects(saveTraining(admin, 'course', { ...created, title: 'Obsoleto' }), e => e.status === 409);
    await assert.rejects(saveTraining(admin, 'course', { ...edited, educationLevel: level === 'bachillerato' ? 'universidad' : 'bachillerato' }), /categoría.*inmutable/);
    await assert.rejects(saveTraining(admin, 'course', { ...edited, status: 'published', activities: [{ ...edited.activities[0], module: '' }] }), /actividades/);
    const published = await saveTraining(admin, 'course', { ...edited, status: 'published' });
    await assert.rejects(saveTraining(admin, 'course', { ...published, title: 'Mutación' }), e => e.status === 409);
    const importedAgain = { ...published, id: '', version: 0, revision: 0, status: 'draft', activities: published.activities.map(a => ({ ...a, id: 'new-import-id' })) };
    await assert.rejects(saveTraining(admin, 'course', importedAgain), /ya existe/, 'Reimporting identical content cannot create a separate course');
    const draft = await saveTraining(admin, 'course', { ...published, version: 0, revision: 0, status: 'draft', title: 'Actualizado ' + level });
    await assert.rejects(saveTraining(admin, 'course', { ...published, version: 0, revision: 0, status: 'draft', title: 'Otro borrador' }), /Ya existe un borrador/);
    let versions = (await trainingState(admin)).courses.filter(course => course.id === created.id);
    assert.equal(courseFamilies(versions).length, 1, 'Published and draft versions form one catalog card');
    assert.equal(courseFamilies(versions)[0].draft.version, 2);
    const enrollmentId = 'enrollment-' + level;
    await db.prepare('INSERT INTO training_enrollments VALUES(?,?,?,?,?,?,?)').run(enrollmentId, student.id, published.id, published.version, JSON.stringify(published), '{}', new Date().toISOString());
    await db.prepare('INSERT INTO training_completions VALUES(?,?,?,?)').run(enrollmentId, published.activities[0].id, '{}', new Date().toISOString());
    const second = await saveTraining(admin, 'course', { ...draft, status: 'published' });
    versions = (await trainingState(admin)).courses.filter(course => course.id === created.id);
    assert.equal(versions.filter(course => course.status === 'published').length, 1);
    const old = versions.find(course => course.version === 1);
    assert.equal(old.status, 'archived', 'Publishing a course archives the preceding version');
    await assert.rejects(action('restore', old), e => e.status === 409);
    await assert.rejects(action('archive', { ...second, revision: second.revision - 1 }), e => e.status === 409);
    const archived = await action('archive', second);
    const restored = await action('restore', archived);
    assert.equal(restored.status, 'published');
    await assert.rejects(action('delete-course', restored, foreign), e => e.status === 404);
    await assert.rejects(action('delete-course', restored, student), e => e.status === 403);
    const disposable = await saveTraining(admin, 'course', { ...restored, version: 0, revision: 0, status: 'draft' });
    await action('delete-draft', disposable);
    assert.equal((await trainingState(admin)).courses.filter(course => course.id === created.id).length, 2, 'Discarding a draft preserves published/history versions');
    await action('delete-course', restored);
    const state = await trainingState(admin);
    assert(!state.courses.some(course => course.id === created.id));
    assert.equal(state.enrollments.find(enrollment => enrollment.id === enrollmentId).progress.percent, 100, 'Deleting a catalog course retains enrolled snapshots and completed activities');
    await assert.rejects(saveTraining(admin, 'course', { ...draft, title: 'No resucitar' }), e => e.status === 409);
    await assert.rejects(saveTraining(admin, 'course', { ...restored, version: 0, revision: 0, status: 'draft' }), e => e.status === 409, 'An unsaved version-zero editor cannot resurrect a deleted course');
    console.log('PASS course CRUD ' + level + ': create, replay, edit, conflicts, import duplicate, version grouping, publication, archive, restore, delete draft, delete course and history');
  }
} finally { await db.close(); }
