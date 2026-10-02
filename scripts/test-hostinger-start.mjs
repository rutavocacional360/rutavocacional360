import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:net';
import {assertTestDatabase} from './test-database-target.mjs';
import {verifyDeployment} from './verify-deployment.mjs';
import {createRuntimePackage} from './test-runtime-package.mjs';

assertTestDatabase(process.env,{local:true});
const runtime = await createRuntimePackage();
const privateDir=mkdtempSync(join(tmpdir(),'rv360-start-'));
const listener=createServer();
await new Promise((resolve,reject)=>{listener.once('error',reject);listener.listen(0,'127.0.0.1',resolve);});
const port=listener.address().port;
await new Promise(resolve=>listener.close(resolve));
const base='http://127.0.0.1:'+port;
const env={...process.env,NODE_ENV:'production',APP_URL:base,COOKIE_SECURE:'false',
  IMPORT_PATH:join(privateDir,'imports'),PROFILE_PHOTO_PATH:join(privateDir,'photos'),ACADEMIC_CONTENT_PATH:join(privateDir,'academic.json'),
  GEMINI_API_KEY:'synthetic-not-used',ADMIN_EMAIL:'bootstrap@example.test',ADMIN_NAME:'Bootstrap QA',
  ADMIN_PASSWORD:randomBytes(24).toString('hex'),INSTITUTION_NAME:'Bootstrap QA',INSTITUTION_CODE:'BOOTSTRAP',
  API_ORIGIN:'',VERCEL:'',NEXT_PUBLIC_DESIGN_PREVIEW:'',SMTP_HOST:'',SMTP_PORT:'',SMTP_USER:'',SMTP_PASSWORD:'',SMTP_FROM:'',SMTP_SECURE:''};
// Test CLI port forwarding: PORT deliberately differs from the requested port.
env.PORT='1';
let initialUser;
for(const [direct,restart] of [[true,false],[false,true],[true,true]]){
  const command=direct ? ['node_modules/next/dist/bin/next','start','-H','127.0.0.1'] : ['scripts/start-hostinger.mjs'];
  const child=spawn(process.execPath,[...command,'-p',String(port)],{
    cwd:direct ? runtime : process.cwd(),
    env:{...env,...(restart?{ADMIN_PASSWORD:''}:{})},stdio:'pipe',windowsHide:true});
  const stopped=new Promise(resolve=>{child.once('exit',resolve);child.once('error',resolve);});
  let output='';
  const capture=chunk=>{output=(output+chunk.toString()).slice(-8000);};
  child.stdout.on('data',capture);child.stderr.on('data',capture);
  const diagnostic=()=>Object.entries(env).reduce((log,[key,value])=>
    /PASSWORD|SECRET|TOKEN|KEY/i.test(key)&&value ? log.split(value).join('[redacted]') : log,output);
  try{
    let ready=false;
    for(let n=0;n<100;n++){
      if(child.exitCode!==null)throw Error('Hostinger startup exited before becoming ready\n'+diagnostic());
      try{await verifyDeployment(base);ready=true;break;}catch{}
      await new Promise(resolve=>setTimeout(resolve,200));
    }
    assert(ready,'Hostinger startup must expose a healthy MySQL backend\n'+diagnostic());
    const response=await fetch(base+'/api/auth/login',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify({email:env.ADMIN_EMAIL,password:env.ADMIN_PASSWORD,admin:true})});
    assert.equal(response.status,200,'Initial password must survive a restart');
    const {user}=await response.json();
    assert.equal(user.role,'admin');
    if(restart)assert.equal(user.id,initialUser);else initialUser=user.id;
  }finally{
    // Terminate the entire child tree on Windows; killing its wrapper alone leaves Next running.
    if(process.platform==='win32'&&child.exitCode===null){
      await new Promise(resolve=>{const kill=spawn('taskkill',['/pid',String(child.pid),'/t','/f'],{stdio:'ignore',windowsHide:true});kill.once('exit',resolve);kill.once('error',resolve);});
    }else child.kill('SIGTERM');
    await stopped;
  }
}
console.log('PASS Hostinger runtime package without scripts/source/env: first bootstrap, wrapper restart, packaged restart, traced SQL, port, MySQL health and unchanged administrator credentials.');
