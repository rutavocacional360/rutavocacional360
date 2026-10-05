import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {writeFileSync} from 'node:fs';
import {resolve} from 'node:path';

export async function runAdminCourseCrudVisual({base,password,folder}) {
  assert.equal(new URL(base).hostname,'127.0.0.1','Only the isolated local fixture may be mutated');
  const require=createRequire(import.meta.url);
  let playwright;try{playwright=require('playwright');}catch{playwright=require('../.qa-tools/node_modules/playwright');}
  const browser=await playwright.chromium.launch({headless:true,...(process.platform==='win32'?{executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'}:{})});
  const context=await browser.newContext({viewport:{width:1440,height:1000}});
  const page=await context.newPage(),errors=[];
  page.setDefaultTimeout(20000);
  page.on('pageerror',error=>errors.push(error.message));
  const catalog=async()=>{const r=await context.request.get(base+'/api/training');assert.equal(r.status(),200);return r.json();};
  const choose=async(label,value)=>{
    const field=page.getByRole('combobox',{name:label,exact:true});
    if(await field.evaluate(el=>el.tagName==='SELECT'))await field.selectOption({label:value});
    else{await field.click();await page.getByRole('option',{name:value,exact:true}).click();}
  };
  const shot=async(name)=>{
    assert(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)<=2,'No horizontal overflow: '+name);
    await page.screenshot({path:resolve(folder,name+'.png'),fullPage:true});
  };
  try {
    await page.goto(base+'/admin/login');
    await page.getByLabel('Correo electrónico',{exact:true}).fill('admin@example.test');
    await page.getByLabel('Contraseña',{exact:true}).fill(password);
    await page.getByRole('button',{name:'Ingresar al panel',exact:true}).click();
    await page.waitForURL('**/admin');
    for(const level of ['bachillerato','universidad']) {
      const title='Curso CRUD visual '+level;
      await page.goto(base+'/admin/cursos?nivel='+level+'&tipo=curso');
      await page.getByRole('button',{name:'Crear curso',exact:true}).click();
      await page.getByLabel('Nombre del curso',{exact:true}).fill(title);
      await page.getByLabel('Descripción',{exact:true}).fill('Curso para comprobar guardado y actividades.');
      await page.getByLabel('Objetivos de aprendizaje',{exact:true}).fill('Reconocer intereses y registrar una reflexión.');
      await page.getByRole('button',{name:'Añadir actividad',exact:true}).click();
      await page.getByLabel('Título de actividad',{exact:true}).fill('Reflexión inicial');
      await page.getByLabel('Explica qué debe hacer el estudiante',{exact:true}).fill('Describe un interés personal y una actividad para explorarlo.');
      await page.getByRole('button',{name:'Guardar borrador',exact:true}).click();
      await page.getByText('Borrador del curso guardado correctamente.',{exact:true}).waitFor();
      await page.waitForURL(url=>!!url.searchParams.get('editar')&&url.searchParams.get('version')==='1');
      await page.reload();await page.getByLabel('Nombre del curso',{exact:true}).waitFor();
      assert.equal(await page.getByLabel('Nombre del curso',{exact:true}).inputValue(),title);
      assert.equal(await page.getByLabel('Título de actividad',{exact:true}).inputValue(),'Reflexión inicial');
      await page.getByRole('button',{name:'Revisar y publicar curso',exact:true}).click();
      await page.getByRole('button',{name:'Publicar curso',exact:true}).click();
      await page.getByRole('heading',{name:title,exact:true}).waitFor();
      const course=(await catalog()).courses.find(c=>c.title===title);assert.equal(course.status,'published');assert.equal(course.educationLevel,level);
      const card=page.locator('.test-manager-card').filter({has:page.getByRole('heading',{name:title,exact:true})});
      await card.getByRole('button',{name:'Editar curso',exact:true}).click();
      await page.getByLabel('Explica qué debe hacer el estudiante',{exact:true}).fill('Contenido revisado que debe persistir sin crear tarjetas repetidas.');
      await page.getByRole('button',{name:'Guardar borrador',exact:true}).click();
      await page.getByText('Borrador del curso guardado correctamente.',{exact:true}).waitFor();
      await page.getByRole('button',{name:'Salir sin guardar',exact:true}).click();
      await page.getByRole('heading',{name:title,exact:true}).waitFor();
      assert.equal(await card.count(),1,'A publication and its draft appear in one card');
      assert.equal((await catalog()).courses.filter(c=>c.id===course.id).length,2);
      await card.getByRole('button',{name:'Editar borrador',exact:true}).click();
      await page.getByRole('button',{name:'Guardar borrador',exact:true}).click();
      await page.getByText('Borrador del curso guardado correctamente.',{exact:true}).waitFor();
      assert.equal((await catalog()).courses.filter(c=>c.id===course.id).length,2,'Reopening the draft never creates a third version');
      await page.getByRole('button',{name:'Revisar y publicar curso',exact:true}).click();
      await page.getByRole('button',{name:'Publicar curso',exact:true}).click();
      await page.getByRole('heading',{name:title,exact:true}).waitFor();
      const versions=(await catalog()).courses.filter(c=>c.id===course.id);
      assert.equal(versions.filter(c=>c.status==='published').length,1);
      assert.equal(versions.find(c=>c.version===1).status,'archived');
      await card.getByRole('button',{name:'Archivar',exact:true}).click();
      await card.getByRole('button',{name:'Restaurar publicación',exact:true}).waitFor();
      await choose('Estado','Archivados');
      await card.getByRole('button',{name:'Restaurar publicación',exact:true}).click();
      await choose('Estado','Todos los estados');
      await card.getByRole('button',{name:'Archivar',exact:true}).waitFor();
      await page.setViewportSize({width:375,height:812});await shot('crud-course-'+level+'-mobile');
      await page.setViewportSize({width:1440,height:1000});
      await card.getByRole('button',{name:'Eliminar curso',exact:true}).click();
      await page.getByRole('dialog').getByRole('button',{name:'Cancelar',exact:true}).click();
      assert((await catalog()).courses.some(c=>c.id===course.id),'Cancelling deletion preserves the course');
      await card.getByRole('button',{name:'Eliminar curso',exact:true}).click();
      await page.getByRole('dialog').getByRole('button',{name:'Confirmar eliminación del curso',exact:true}).click();
      await page.getByRole('heading',{name:title,exact:true}).waitFor({state:'hidden'});
      await page.reload();await page.getByRole('button',{name:'Crear curso',exact:true}).waitFor();
      assert(!(await catalog()).courses.some(c=>c.id===course.id),'All deleted versions stay deleted after reload');
      console.log('PASS browser course '+level+': create, activity, save/reload, publish, edit/reuse draft, archive, restore, cancel/delete, mobile.');
    }
    assert.deepEqual(errors,[],'No client JavaScript errors');
  } catch(error) {
    await page.screenshot({path:resolve(folder,'crud-course-failure.png'),fullPage:true}).catch(()=>{});
    writeFileSync(resolve(folder,'crud-course-failure.txt'),await page.locator('body').innerText().catch(()=>''));
    throw error;
  } finally {await browser.close();}
}
