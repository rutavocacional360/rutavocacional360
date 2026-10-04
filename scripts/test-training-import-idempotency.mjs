import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';

mkdirSync('.qa-tools', { recursive: true });
const folder = mkdtempSync(resolve('.qa-tools', 'training-import-idempotency-'));
process.env.DB_DRIVER = 'sqlite';
process.env.DATABASE_PATH = resolve(folder, 'imports.sqlite');
process.env.ACADEMIC_CONTENT_PATH = resolve(folder, 'academic.json');
const outfile = resolve(folder, 'server.cjs');
await build({ stdin: { contents: `export {db} from './lib/server/store';export * from './lib/server/training';export * from './components/kit/lib/training-content';`, resolveDir: process.cwd(), loader: 'ts' }, bundle: true, platform: 'node', format: 'cjs', packages: 'external', outfile,
  plugins: [{ name: 'server-marker', setup(b) { b.onResolve({ filter: /^server-only$/ }, () => ({ path: 'server-only', namespace: 'empty' })); b.onLoad({ filter: /.*/, namespace: 'empty' }, () => ({ contents: '' })); } }] });
const { db, saveTraining, trainingAction, courseContentKey, simulatorContentKey } = createRequire(import.meta.url)(outfile);
const admin = { id: 'import-admin', role: 'admin', institutionId: 'import-org' };
const colleague = { ...admin, id: 'import-colleague' };
const foreign = { ...admin, id: 'foreign-admin', institutionId: 'foreign-org' };
const common = { id: '', version: 0, revision: 0, status: 'draft', title: 'Documento compartido', careerIds: [] };
const fixtures = {
  course: { ...common, description: 'Actividades', objectives: 'Explorar intereses', level: 'Introductorio', type: 'general', fields: [], studentIds: [], access: 'all', activities: [{ id: 'a', module: 'Conócete', title: 'Actividad', kind: 'text', content: 'Escribe tus intereses.', required: true, completion: 'read' }] },
  simulator: { ...common, instrument: { id: 'draft', version: '1', title: '', description: 'Instrucciones', options: [], questions: [] }, purpose: 'general', modes: ['practice', 'exam'], durationMinutes: 30, maxAttempts: 3, gradePolicy: 'last', feedback: 'finish', selection: 'fixed', quotas: [], areaWeights: [], shuffleOptions: false, questionOrderFixedIds: [], questions: [{ id: 'q', text: 'Dos más dos', type: 'single', options: [{ id: 'o1', value: 1, label: 'Cuatro' }, { id: 'o2', value: 2, label: 'Cinco' }], correctValues: [1], weight: 1, reviewed: true, explanation: 'La suma es cuatro.', source: 'Documento' }] },
};
const recreate = (kind, input) => ({ ...structuredClone(input), id: '', version: 0, revision: 0, status: 'draft',
  ...(kind === 'course' ? { activities: input.activities.map(activity => ({ ...activity, id: randomUUID() })) } : { questions: input.questions.map(question => ({ ...question, id: randomUUID(), bankId: randomUUID(), bankVersion: 42, options: question.options.map(option => ({ ...option, id: randomUUID() })) })) }),
});
const keyFor = kind => kind === 'course' ? courseContentKey : simulatorContentKey;
fixtures.simulator.instrument.source = 'Documento de prueba con clave objetiva';
const count = async (kind, id) => (await db.prepare('SELECT COUNT(*) n FROM training_entities WHERE kind=? AND id=?').get(kind, id)).n;
try {
  await db.migrate();
  for (const org of [admin.institutionId, foreign.institutionId]) await db.prepare('INSERT INTO institutions VALUES(?,?,?)').run(org, org, org);
  for (const user of [admin, colleague, foreign]) await db.prepare('INSERT INTO users VALUES(?,?,?,?,?,?,?,?)').run(user.id, user.id, user.id + '@example.test', 'no-login', user.role, user.institutionId, '', 'Activo');
  for (const kind of ['course', 'simulator']) {
    const input = { ...fixtures[kind], sourceImportId: 'source-' + kind, educationLevel: 'universidad' };
    const copies = await Promise.all(Array.from({ length: 3 }, () => saveTraining(admin, kind, recreate(kind, input))));
    assert(copies.every(copy => copy.id === copies[0].id), 'Concurrent imports with regenerated IDs create one entity');
    const created = copies[0];
    const edited = await saveTraining(admin, kind, { ...created, title: 'Editado por administración' });
    assert.deepEqual(await saveTraining(colleague, kind, input), edited, 'Reimport preserves later edits and revisions, across administrators');
    assert.equal(await count(kind, created.id), 1);
    const otherLevel = await saveTraining(admin, kind, { ...input, educationLevel: 'bachillerato' });
    assert.notEqual(otherLevel.id, created.id, 'Imports remain independent across educational routes');
    const otherOrg = await saveTraining(foreign, kind, input);
    assert.notEqual(otherOrg.id, created.id, 'Source IDs never cross institutions');
    const published = await saveTraining(admin, kind, { ...edited, status: 'published' });
    assert.deepEqual(await saveTraining(admin, kind, input), published, 'Reimport returns a publication without rewriting it');
    const draft = await saveTraining(admin, kind, { ...published, version: 0, revision: 0, status: 'draft', title: 'Nueva versión' });
    assert.deepEqual(await saveTraining(admin, kind, input), draft, 'Reimport resumes the newest family draft');
    assert.equal(await count(kind, created.id), 2, 'Legitimate versions retain their identity');

    const legacyInput = { ...fixtures[kind], educationLevel: 'universidad', title: 'Contenido histórico' };
    const legacy = await saveTraining(admin, kind, legacyInput);
    const repeated = recreate(kind, legacyInput);
    assert.equal(keyFor(kind)(legacy), keyFor(kind)(repeated), 'Generated IDs and bank revisions do not define content');
    await assert.rejects(saveTraining(admin, kind, repeated), error => error.status === 409, 'Manual exact copies require an explicit edit');
    const historicalImport = { ...repeated, sourceImportId: 'legacy-' + kind };
    assert.deepEqual(await saveTraining(admin, kind, historicalImport), legacy, 'Import resumes identical historical content');
    const revisedLegacy = await saveTraining(admin, kind, { ...legacy, title: 'Historia revisada' });
    assert.deepEqual(await saveTraining(admin, kind, historicalImport), revisedLegacy, 'Historical provenance aliases survive later edits');

    const different = recreate(kind, legacyInput);
    if (kind === 'course') different.activities[0].content = 'Una actividad diferente.';
    else different.questions[0].correctValues = [2];
    assert.notEqual(keyFor(kind)(different), keyFor(kind)(legacyInput), 'Content and answer changes are meaningful');
    const independent = await saveTraining(admin, kind, different);
    assert.notEqual(independent.id, legacy.id, 'The same title can describe different content');
    const changedSettings = { ...legacyInput, ...(kind === 'course' ? { access: 'selected', studentIds: ['student'] } : { durationMinutes: 60 }) };
    assert.notEqual(keyFor(kind)(changedSettings), keyFor(kind)(legacyInput), 'Audience and exam settings are meaningful');

    await trainingAction(admin, 'training/delete-' + kind, 'POST', { kind, id: draft.id, version: draft.version, revision: draft.revision }, new URLSearchParams());
    const reimported = await saveTraining(admin, kind, recreate(kind, input));
    assert.notEqual(reimported.id, created.id, 'Deleted content can be imported again without following a stale alias');
    console.log('PASS ' + kind + ' imports: concurrency, source recovery, edits, versions, scopes, historical aliases and semantic duplicates.');
  }
} finally { await db.close(); }
