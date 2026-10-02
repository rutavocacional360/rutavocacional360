const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const { mkdtempSync, mkdirSync } = require('node:fs');
const { resolve } = require('node:path');

(async () => {
  const { assertTestDatabase } = await import('./test-database-target.mjs');
  assert.throws(() => assertTestDatabase({DB_NAME:'safe_test',DATABASE_URL:'mysql://qa:fixture@localhost/production'}));
  assert.throws(() => assertTestDatabase({DB_NAME:'safe_test',DB_HOST:'remote.example'},{local:true}));
  assert.equal(assertTestDatabase({DB_NAME:'ignored',DATABASE_URL:'mysql://qa:fixture@localhost/safe_test'},{local:true}).name,'safe_test');

  const checkConfig = overrides => spawnSync(process.execPath, ['--input-type=module','-e',
    "const {default:c}=await import('./next.config.mjs'); console.log(JSON.stringify({output:c.output||'server',headers:await c.headers()}));"],
    {env:{...process.env,API_ORIGIN:'',NEXT_PUBLIC_DESIGN_PREVIEW:'',...overrides},encoding:'utf8',windowsHide:true});
  const central = checkConfig({APP_URL:'https://ruta.example'});
  assert.equal(central.status,0,central.stderr);
  const config = JSON.parse(central.stdout.trim());
  assert.equal(config.output,'server');
  assert(config.headers[0].headers.some(h=>h.key==='Strict-Transport-Security'));
  for(const invalid of [{API_ORIGIN:'https://other.example'},{NEXT_PUBLIC_DESIGN_PREVIEW:'true'},{NEXT_PUBLIC_GEMINI_API_KEY:'synthetic-only'}])
    assert.notEqual(checkConfig(invalid).status,0);

  mkdirSync('.qa-tools',{recursive:true});
  const folder = mkdtempSync(resolve('.qa-tools','deployment-'));
  const env = {...process.env,DB_DRIVER:'sqlite',DATABASE_URL:'',DATABASE_PATH:resolve(folder,'bootstrap_test.sqlite'),
    ADMIN_EMAIL:'qa-bootstrap@example.test',ADMIN_PASSWORD:randomBytes(24).toString('hex'),ADMIN_NAME:'QA Bootstrap',
    INSTITUTION_NAME:'QA Platform',INSTITUTION_CODE:'QA'};
  const bootstrap = () => spawnSync(process.execPath,['scripts/create-admin.mjs'],{env,encoding:'utf8',windowsHide:true});
  assert.equal(bootstrap().status,0,'Initial administrator bootstrap must succeed');
  const {createDatabase} = await import('../lib/server/database.ts');
  const db = createDatabase(env);
  try {
    const user = await db.prepare('SELECT id,institutionId,password FROM users').get();
    const platform = JSON.parse((await db.prepare("SELECT value FROM documents WHERE owner='system' AND key='rv360:platform'").get()).value);
    assert.equal(platform.institutionId,user.institutionId);
    assert.notEqual(bootstrap().status,0,'A repeated bootstrap cannot replace the account');
    assert.equal((await db.prepare('SELECT COUNT(*) n FROM users').get()).n,1);
    assert.equal((await db.prepare('SELECT password FROM users').get()).password,user.password);
  } finally { await db.close(); }
  console.log('PASS deployment: central backend, security headers, invalid preview/secrets rejected, actual QA database target and non-destructive administrator bootstrap.');
})().catch(error=>{console.error(error);process.exitCode=1;});
