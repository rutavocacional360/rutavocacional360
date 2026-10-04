import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {randomBytes} from 'node:crypto';

// Called only by the isolated HTTP fixture; never point this at production.
export async function runAdminUsersVisual({base,password,folder}) {
  assert.equal(new URL(base).hostname,'127.0.0.1','User mutations require an isolated local fixture');
  const require=createRequire(import.meta.url);
  let playwright;try{playwright=require('playwright');}catch{playwright=require('../.qa-tools/node_modules/playwright');}
  const browser=await playwright.chromium.launch({headless:true,...(process.platform==='win32'?{executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'}:{})});
  const failures=[],checks=[];
  const email='users-visual-'+Date.now()+'@example.test';
  const initialName='María Prueba Visual',editedName='María Cuenta Revisada';
  const nextPassword=randomBytes(24).toString('base64url');
  const admin=await browser.newContext({viewport:{width:1440,height:1000}}),page=await admin.newPage();
  const student=await browser.newContext({viewport:{width:1440,height:1000}}),sp=await student.newPage();
  for(const p of [page,sp])p.on('pageerror',error=>failures.push({name:'JavaScript',url:p.url(),message:error.message}));
  async function shot(p,name) {
    await p.evaluate(()=>window.scrollTo(0,0));
    await p.screenshot({path:resolve(folder,name+'.png'),fullPage:true});
    const size=await p.evaluate(()=>({width:innerWidth,overflow:document.documentElement.scrollWidth-innerWidth}));
    checks.push({name,...size});
    if(size.overflow>2)failures.push({name,...size});
  }
  async function choose(p,label,value) {
    const input=p.getByRole('combobox',{name:label,exact:true});
    if(await input.evaluate(el=>el.tagName==='SELECT'))await input.selectOption({label:value});
    else {await input.click();await input.page().getByRole('option',{name:value,exact:true}).click();}
  }
  async function login(p,accountEmail,accountPassword,isAdmin=false) {
    await p.goto(base+(isAdmin?'/admin/login':'/ingresar'));
    await p.getByLabel('Correo electrónico',{exact:true}).fill(accountEmail);
    await p.getByLabel('Contraseña',{exact:true}).fill(accountPassword);
    await p.getByRole('button',{name:isAdmin?'Ingresar al panel':'Ingresar',exact:true}).click();
    await p.waitForURL(isAdmin?'**/admin':'**/mi-ruta');
  }
  async function saveUser(expected=200) {
    const response=page.waitForResponse(r=>r.url().endsWith('/api/admin/users')&&r.request().method()==='POST');
    await page.getByRole('button',{name:'Guardar usuario',exact:true}).click();
    assert.equal((await response).status(),expected);
    if(expected===200)await page.getByRole('dialog',{name:/^(Crear|Editar) usuario$/}).waitFor({state:'hidden'});
  }
  async function editUser(name=editedName) {
    await page.getByRole('button',{name:'Editar '+name,exact:true}).click();
    return page.getByRole('dialog',{name:'Editar usuario',exact:true});
  }
  async function apiLogin(p,accountPassword) {
    return p.request.post(base+'/api/auth/login',{headers:{Origin:base},data:{email,password:accountPassword}});
  }
  async function smoke(p,routes,role) {
    for(const width of [1440,390]) {
      await p.setViewportSize({width,height:width===390?844:1000});
      for(const [path,name] of routes) {
        const response=await p.goto(base+path);assert.equal(response.status(),200,path);
        await p.locator('main h1').first().waitFor();
        await p.waitForLoadState('networkidle');
        assert(!await p.getByText('Application error: a client-side exception has occurred',{exact:false}).count(),path);
        await shot(p,role+'-'+name+'-'+width);
      }
    }
  }
  try {
    await login(page,'admin@example.test',password,true);
    await page.getByRole('heading',{name:'Resumen general',exact:true}).waitFor();
    await page.locator('.intel-kpis').waitFor();
    const analytics=await page.request.get(base+'/api/admin/analytics');assert.equal(analytics.status(),200);
    const data=await analytics.json();assert.equal(data.source,'server');
    assert.equal(Number(await page.locator('.intel-kpis article').first().locator('strong').textContent()),data.studentProgress.length);
    await page.getByLabel('Buscar estudiante',{exact:true}).fill('Estudiante Prueba');
    assert.equal(await page.locator('#seguimiento tbody tr').count(),1);
    await page.getByRole('button',{name:'7 días',exact:true}).click();
    assert.equal(await page.getByRole('button',{name:'7 días',exact:true}).getAttribute('aria-pressed'),'true');
    const csvPromise=page.waitForEvent('download');
    await page.getByRole('button',{name:'Exportar seguimiento',exact:true}).click();
    const csv=await csvPromise,csvPath=resolve(folder,'seguimiento-filtrado.csv');await csv.saveAs(csvPath);
    assert(readFileSync(csvPath,'utf8').includes('Estudiante Prueba'));
    await shot(page,'admin-resumen-filtrado');
    await page.getByLabel('Buscar estudiante',{exact:true}).fill('');
    await page.goto(base+'/admin/usuarios');
    await page.getByRole('button',{name:'Añadir usuario',exact:true}).click();
    await page.getByLabel('Nombre y apellido',{exact:true}).fill(initialName);
    await page.getByLabel('Correo electrónico',{exact:true}).fill(email);
    await page.getByLabel('Contraseña inicial',{exact:true}).fill(password);
    await choose(page,'Etapa educativa','Estoy eligiendo mi bachillerato');
    await saveUser();
    await page.getByLabel('Buscar usuario',{exact:true}).fill(email);
    await page.getByRole('button',{name:'Editar '+initialName,exact:true}).waitFor();
    await page.reload();await page.getByLabel('Buscar usuario',{exact:true}).fill(email);
    await editUser(initialName);
    await page.getByLabel('Nombre y apellido',{exact:true}).fill(editedName);
    await page.getByLabel('Centro educativo de procedencia',{exact:true}).fill('Colegio de pruebas visuales');
    await saveUser();
    await page.getByRole('button',{name:'Editar '+editedName,exact:true}).waitFor();
    await shot(page,'usuarios-cuenta-creada');
    await login(sp,email,password);
    const session=await (await sp.request.get(base+'/api/session')).json();
    assert.equal(session.user.name,editedName);
    assert.equal(session.values['rv360:profile'].institution,'Colegio de pruebas visuales');
    await sp.getByRole('heading',{name:'¿Qué bachillerato puedo elegir?',exact:true}).waitFor();
    await shot(sp,'estudiante-dashboard-cuenta-nueva');
    await sp.setViewportSize({width:390,height:844});await shot(sp,'estudiante-dashboard-cuenta-nueva-movil');
    await page.getByRole('button',{name:'Añadir usuario',exact:true}).click();
    await page.getByLabel('Nombre y apellido',{exact:true}).fill('Cuenta Duplicada');
    await page.getByLabel('Correo electrónico',{exact:true}).fill(email);
    await page.getByLabel('Contraseña inicial',{exact:true}).fill(password);
    await saveUser(409);
    await page.getByText('Ese correo ya pertenece a otra cuenta.',{exact:true}).waitFor();
    await page.getByRole('dialog',{name:'Crear usuario',exact:true}).getByRole('button',{name:'Cancelar',exact:true}).click();
    await editUser();
    await page.getByRole('button',{name:'Restablecer contraseña',exact:true}).click();
    const reset=page.getByRole('dialog',{name:'Restablecer contraseña',exact:true});
    await reset.getByLabel('Nueva contraseña',{exact:true}).fill(nextPassword);
    await reset.getByLabel('Confirmar nueva contraseña',{exact:true}).fill('mismatch-password-example');
    await reset.getByRole('button',{name:'Confirmar nueva contraseña',exact:true}).click();
    await reset.getByText('Las contraseñas no coinciden.',{exact:true}).waitFor();
    await reset.getByLabel('Confirmar nueva contraseña',{exact:true}).fill(nextPassword);
    const resetResponse=page.waitForResponse(r=>r.url().endsWith('/api/admin/users')&&r.request().method()==='POST');
    await reset.getByRole('button',{name:'Confirmar nueva contraseña',exact:true}).click();assert.equal((await resetResponse).status(),200);
    await reset.waitFor({state:'hidden'});
    assert.equal((await (await sp.request.get(base+'/api/session')).json()).user,null,'Password reset must revoke existing sessions');
    assert.equal((await apiLogin(sp,password)).status(),401,'Previous password cannot log in');
    assert.equal((await apiLogin(sp,nextPassword)).status(),200,'New password logs in');
    await choose(page.getByRole('dialog',{name:'Editar usuario',exact:true}),'Estado','Suspendido');
    await saveUser();
    assert.equal((await (await sp.request.get(base+'/api/session')).json()).user,null,'Suspension must revoke existing sessions');
    assert.equal((await apiLogin(sp,nextPassword)).status(),401,'Suspended account cannot log in');
    await choose(page,'Estado','Suspendido');
    assert.equal(await page.locator('.ad-users-table tbody tr').count(),1);
    await page.setViewportSize({width:390,height:844});await shot(page,'usuarios-suspendido-movil');
    await editUser();await shot(page,'usuarios-editar-movil');
    await choose(page.getByRole('dialog',{name:'Editar usuario',exact:true}),'Estado','Activo');
    await saveUser();
    await page.getByRole('button',{name:'Limpiar filtros',exact:true}).click();
    await page.getByLabel('Buscar usuario',{exact:true}).fill(email);
    assert.equal((await apiLogin(sp,nextPassword)).status(),200,'Reactivated account logs in');
    const usersExport=page.waitForEvent('download');await page.getByRole('button',{name:'Exportar',exact:true}).click();
    const usersCsv=await usersExport,usersPath=resolve(folder,'usuarios-filtrados.csv');await usersCsv.saveAs(usersPath);
    const exported=readFileSync(usersPath,'utf8');assert(exported.includes(email));assert(exported.includes(editedName));assert(!exported.includes('admin@example.test'));
    await editUser();
    await page.getByText('Eliminar cuenta sin evaluaciones',{exact:true}).click();
    await page.getByRole('button',{name:'Eliminar cuenta',exact:true}).click();
    const deletion=page.waitForResponse(r=>r.url().endsWith('/api/admin/users')&&r.request().method()==='POST');
    await page.getByRole('button',{name:'Confirmar eliminación',exact:true}).click();assert.equal((await deletion).status(),200);
    await page.getByText('Cuenta sin entregas eliminada.',{exact:true}).waitFor();
    await page.getByText('No hay usuarios con estos filtros.',{exact:true}).waitFor();
    assert.equal((await apiLogin(sp,nextPassword)).status(),401,'Deleted account cannot log in');
    checks.push({name:'Usuarios',passed:'Create, persistence, edit, duplicate rejection, reset, session revocation, suspension, activation, filtering, CSV and delete.'});
    await smoke(page,[['/admin','resumen'],['/admin/usuarios','usuarios'],['/admin/escuelas','escuelas'],['/admin/resultados','resultados'],['/admin/evaluaciones','tests'],['/admin/cursos','cursos'],['/admin/configuracion','configuracion']],'admin');
    await login(sp,'test@example.test',password);
    await smoke(sp,[['/mi-ruta','inicio'],['/mi-ruta/perfil','perfil'],['/mi-ruta/evaluaciones','tests'],['/mi-ruta/cursos','cursos'],['/mi-ruta/resultados','resultados']],'estudiante');
    checks.push({name:'Navegación',passed:'Seven administrator modules and five student modules render in desktop/mobile without page errors or page overflow.'});
  } catch(error) {
    failures.push({name:'Workflow',message:error.message});
    await shot(page,'usuarios-failure-admin').catch(()=>{});await shot(sp,'usuarios-failure-estudiante').catch(()=>{});
    throw error;
  } finally {
    writeFileSync(resolve(folder,'admin-users-visual-results.json'),JSON.stringify({checks,failures},null,2));
    await browser.close();
  }
  assert.equal(failures.length,0,JSON.stringify(failures));
  console.log('PASS visual users/dashboard: full account lifecycle, sessions, CSV, indicators and 12 modules on desktop/mobile. Evidence: '+folder);
}
