import {spawnSync} from 'node:child_process';

// No production database, mailbox or AI API is contacted by this suite.
const tests = [
  'test-admin-crud.mjs', 'test-course-crud.mjs', 'test-admin-crud-session.cjs', 'test-assessment-admin-routes.mjs', 'test-admin-tests-ui.mjs',
  'test-admin-current-route.mjs',
  'test-training-readiness.mjs',
  'test-training-ui.mjs', 'test-simulator-workflows.mjs', 'test-admin-course-navigation.mjs', 'test-admin-ai-ui.mjs',
  'test-ai-flows.mjs', 'test-test-autofill.mjs', 'test-student-guidance-ai.mjs',
  'test-validation.mjs',
  'test-user-management.mjs',
  'test-name-input.mjs',
  'test-security-boundaries.mjs', 'test-production-config.mjs', 'test-database-config.mjs',
  'test-deployment.cjs', 'test-deployment-readiness.mjs',
  'test-mail-config.mjs', 'test-account-mail.mjs',
  'test-test-engine.cjs', 'test-training-engine.cjs', 'test-training-report.cjs', 'test-report-routes.mjs',
  'test-school-training.cjs', 'test-simulator-import.cjs',
  'test-simulator-clock.cjs', 'test-simulator-autofill.cjs',
  'test-import-presentation.cjs', 'test-import-guidance.cjs',
  'test-document-import.mjs', 'test-course-document-import.cjs', 'test-assessment-import.mjs', 'test-import-runtime.mjs', 'test-import-worker-exit.mjs', 'test-document-ocr.mjs', 'test-local-guidance.cjs', 'test-guidance-normalization.cjs', 'test-guidance-normalization-server.mjs',
  'test-school-guidance.cjs', 'test-guidance-ui.mjs',
  'test-admin-session-renewal.cjs', 'test-guidance-server.mjs',
  'test-session-races.cjs',
  'test-schools.mjs',
  'test-schools-ui.mjs',
];
let failures = 0;
for (const test of tests) {
  console.log('\nTEST '+test);
  const result = spawnSync(process.execPath, ['scripts/'+test], {
    stdio:'inherit', windowsHide:true, timeout:120_000,
    env:{...process.env,GUIDANCE_DB_DRIVER:'sqlite'},
  });
  if (result.error || result.status !== 0) {
    failures++;
    console.error('FAIL '+test+(result.error ? ': '+result.error.message : ''));
  }
}
console.log(`\n${tests.length-failures}/${tests.length} suites passed.`);
process.exitCode = failures ? 1 : 0;
