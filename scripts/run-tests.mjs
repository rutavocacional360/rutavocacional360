import {spawnSync} from 'node:child_process';

// No production database, mailbox or AI API is contacted by this suite.
const tests = [
  'test-security-boundaries.mjs', 'test-production-config.mjs', 'test-database-config.mjs',
  'test-deployment.cjs', 'test-deployment-readiness.mjs',
  'test-mail-config.mjs', 'test-account-mail.mjs',
  'test-test-engine.cjs', 'test-training-engine.cjs', 'test-training-report.cjs',
  'test-school-training.cjs', 'test-simulator-import.cjs',
  'test-simulator-clock.cjs', 'test-simulator-autofill.cjs',
  'test-import-presentation.cjs', 'test-import-guidance.cjs',
  'test-document-import.mjs', 'test-local-guidance.cjs',
  'test-school-guidance.cjs', 'test-guidance-ui.mjs',
  'test-admin-session-renewal.cjs', 'test-guidance-server.mjs',
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
