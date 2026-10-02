import assert from 'node:assert/strict';
import {randomBytes,createHash} from 'node:crypto';
export async function runValidationHttp({request,cookie,adminCookie,password,db}) {
  // This fixture runs after the separate throttling suite on an isolated database.
  await db.prepare("DELETE FROM attempts WHERE key LIKE 'register:%'").run();
  let checks=0;
  for(const patch of [{name:'5546565'},{name:'Ana123'},{name:{text:'Ana'}},{email:'a@@example.test'},{password:' '.repeat(20)}]) {
    const response=await request('auth/register',{name:'Ana Pérez',email:'invalid-validation@example.test',password,...patch});
    assert.equal(response.status,400,JSON.stringify(patch));checks++;
  }
  assert.equal(await db.prepare('SELECT id FROM users WHERE email=?').get('invalid-validation@example.test'),undefined);
  for(const patch of [{firstName:'5546565'},{lastName:'Pérez22'},{firstName:'<b>Ana</b>'}]) {
    assert.equal((await request('account/profile',{firstName:'Ana',lastName:'Pérez',...patch},cookie,'PUT')).status,400);checks++;
  }
  for(const patch of [{name:'123456'},{email:'a@@example.test'},{role:'admin'},{status:'Invalid'},{password:'short'},{institution:[]},{action:'unknown'}]) {
    assert.equal((await request('admin/users',{name:'Ana Pérez',email:'managed-validation@example.test',password,role:'Estudiante',status:'Activo',group:'',...patch},adminCookie)).status,400);checks++;
  }
  assert.equal(await db.prepare('SELECT id FROM users WHERE email=?').get('managed-validation@example.test'),undefined);
  for(const [key,value] of [['rv360:admin-settings',null],['rv360:admin-settings',{name:123}],['rv360:admin-users',[{name:123}]],['rv360:tasks',[{id:'test',title:' ',date:'2026-02-30',done:false}]],['rv360:reflections',{a:{}}],['rv360:course-done',['8']]]) {
    const userCookie=key.startsWith('rv360:admin')?adminCookie:cookie;
    assert.equal((await request('state',{key,value},userCookie,'PUT')).status,400,key);checks++;
  }
  assert.equal((await request('auth/login',{email:'a@@example.test',password})).status,401);checks++;
  assert.equal((await request('auth/login',{email:'test@example.test',password,admin:'false'})).status,401);checks++;
  assert.equal((await request('auth/reset-confirm',{token:'bad',password:' '.repeat(20)})).status,400);checks++;
  const valid=await request('admin/users',{name:'Ana María O’Connor',email:'managed-validation@example.test',password,role:'Estudiante',status:'Activo',group:''},adminCookie);
  assert.equal(valid.status,200);
  const created=await db.prepare('SELECT id,name FROM users WHERE email=?').get('managed-validation@example.test');
  assert.equal(created.name,'Ana María O’Connor');
  const signIn=await request('auth/login',{email:'managed-validation@example.test',password});
  assert.equal(signIn.status,200);
  const userCookie=signIn.headers.get('set-cookie').split(';')[0];
  const nextPassword=randomBytes(24).toString('base64url');
  assert.equal((await request('account/password',{currentPassword:password,password:'short',confirm:'short'},userCookie)).status,400);
  assert.equal((await request('account/password',{currentPassword:password,password:nextPassword,confirm:'not-matching'},userCookie)).status,400);
  const changed=await request('account/password',{currentPassword:password,password:nextPassword,confirm:nextPassword},userCookie);
  assert.equal(changed.status,200);
  assert.equal((await (await request('session',null,userCookie)).json()).user,null);
  assert.equal((await request('auth/login',{email:'managed-validation@example.test',password})).status,401);
  assert.equal((await request('auth/login',{email:'managed-validation@example.test',password:nextPassword})).status,200);
  // A synthetic one-use token verifies reset independently of the external mail service.
  const token=randomBytes(32).toString('hex'),digest=createHash('sha256').update(token).digest('hex');
  await db.prepare('INSERT INTO resets VALUES(?,?,?)').run(digest,created.id,Date.now()+60000);
  const recovered=await request('auth/reset-confirm',{token,password});
  assert.equal(recovered.status,200);
  assert.equal((await request('auth/reset-confirm',{token,password})).status,400);
  assert.equal((await request('auth/login',{email:'managed-validation@example.test',password})).status,200);
  assert.equal((await request('admin/users',{action:'delete',id:created.id},adminCookie)).status,200);
  console.log(`PASS HTTP validation: ${checks} invalid requests rejected without persistence; Unicode CRUD, password change, session revocation, reset and token reuse denied.`);
}
