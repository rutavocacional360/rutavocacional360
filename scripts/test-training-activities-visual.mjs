import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {writeFileSync} from 'node:fs';
import {resolve} from 'node:path';

/** Exercise the same published activity in separate administrator/student browsers. */
export async function runTrainingActivitiesVisual({base, password, folder}) {
  assert.equal(new URL(base).hostname, '127.0.0.1', 'Only the isolated local fixture may be mutated');
  const require = createRequire(import.meta.url);
  let playwright; try {playwright = require('playwright');} catch {playwright = require('../.qa-tools/node_modules/playwright');}
  const browser = await playwright.chromium.launch({headless: true, ...(process.platform === 'win32' ? {executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe'} : {})});
  const adminContext = await browser.newContext({viewport: {width: 1440, height: 1000}});
  const studentContext = await browser.newContext({viewport: {width: 390, height: 844}});
  const admin = await adminContext.newPage(), student = await studentContext.newPage(), errors = [];
  let active = admin;
  for (const page of [admin, student]) {page.setDefaultTimeout(25000); page.on('pageerror', error => errors.push(error.message));}
  const title = 'Actividad multimedia y respuestas ' + Date.now();
  const prompt = '¿Qué actividad te gustaría explorar y por qué?';
  const answer = 'Me gustaría explorar la ciencia y la tecnología para aprender cómo resolver problemas de mi comunidad.';
  const shot = async (page, name) => {
    assert(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth) <= 2, 'No horizontal overflow: ' + name);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({path: resolve(folder, name + '.png'), fullPage: true});
  };
  const login = async (page, isAdmin) => {
    await page.goto(base + (isAdmin ? '/admin/login' : '/ingresar'));
    await page.getByLabel('Correo electrónico', {exact: true}).fill(isAdmin ? 'admin@example.test' : 'test@example.test');
    await page.getByLabel('Contraseña', {exact: true}).fill(password);
    await page.getByRole('button', {name: isAdmin ? 'Ingresar al panel' : 'Ingresar', exact: true}).click();
    await page.waitForURL(isAdmin ? '**/admin' : '**/mi-ruta');
  };
  const state = async context => {const response = await context.request.get(base + '/api/training'); assert.equal(response.status(), 200); return response.json();};
  try {
    await login(admin, true); await login(student, false);
    const initial = await state(studentContext), level = initial.educationLevel;
    assert(initial.readiness[level].ready, 'Visual fixture requires the real student assessments completed');
    await admin.goto(base + '/admin/cursos?nivel=' + level + '&tipo=curso');
    await admin.getByRole('button', {name: 'Crear curso', exact: true}).click();
    await admin.getByLabel('Nombre del curso', {exact: true}).fill(title);
    await admin.getByLabel('Descripción', {exact: true}).fill('Mira los materiales, responde y conserva tu progreso.');
    await admin.getByLabel('Objetivos de aprendizaje', {exact: true}).fill('Explorar intereses y expresar una reflexión personal.');
    await admin.getByRole('button', {name: 'Añadir actividad', exact: true}).click();
    await admin.getByLabel('Título de actividad', {exact: true}).fill('Exploro mis intereses con imágenes y video');
    await admin.getByLabel('Contenido de la lección', {exact: true}).fill('Observa la imagen y reproduce el video antes de responder.');
    await admin.getByLabel('Pregunta o reflexión para responder (opcional)', {exact: true}).fill(prompt);
    await admin.getByLabel('Imágenes, videos, audio y documentos', {exact: true}).setInputFiles([
      resolve('public/media/brain-book-icon.png'), resolve('public/media/vocational-background-mobile.mp4'),
    ]);
    await admin.getByText('2 archivos cargados. Guarda el curso para conservar los cambios.', {exact: true}).waitFor();
    assert.equal(await admin.locator('.activity-attachment').count(), 2);
    await admin.waitForFunction(() => document.querySelector('.activity-attachment img')?.naturalWidth > 0);
    await admin.waitForFunction(() => Number.isFinite(document.querySelector('.activity-attachment video')?.duration) && document.querySelector('.activity-attachment video').duration > 0);
    await admin.getByRole('button', {name: 'Guardar borrador', exact: true}).click();
    await admin.getByText('Borrador del curso guardado correctamente.', {exact: true}).waitFor();
    await admin.waitForURL(url => !!url.searchParams.get('editar') && url.searchParams.get('version') === '1');
    await admin.reload(); await admin.getByLabel('Nombre del curso', {exact: true}).waitFor();
    assert.equal(await admin.getByLabel('Pregunta o reflexión para responder (opcional)', {exact: true}).inputValue(), prompt);
    assert.equal(await admin.locator('.activity-attachment').count(), 2, 'Uploaded materials survive saving and reloading the administrator editor');
    await shot(admin, 'activities-admin-materials');
    await admin.getByRole('button', {name: 'Revisar y publicar curso', exact: true}).click();
    await admin.getByRole('button', {name: 'Publicar curso', exact: true}).click();
    await admin.getByText('Curso publicado correctamente. Sus actividades ya están disponibles para los estudiantes de esta ruta.', {exact: true}).waitFor();
    await admin.getByRole('button', {name: 'Publicar curso', exact: true}).waitFor({state: 'hidden'});
    await admin.getByRole('heading', {name: title, exact: true}).waitFor();
    const course = (await state(adminContext)).courses.find(course => course.title === title);
    assert.equal(course.status, 'published'); assert.equal(course.activities[0].attachments.length, 2);

    active = student;
    await student.goto(base + '/mi-ruta/cursos');
    const courseCard = student.getByRole('region', {name: 'Cursos y actividades', exact: true}).locator('.card').filter({has: student.getByRole('heading', {name: title, exact: true})});
    await courseCard.getByRole('button', {name: 'Comenzar curso', exact: true}).click();
    await student.getByRole('region', {name: 'Curso en progreso', exact: true}).waitFor();
    const response = student.getByLabel(prompt, {exact: true});
    await response.waitFor();
    assert(await student.getByRole('button', {name: 'Guardar y completar actividad', exact: true}).isDisabled(), 'Required response prevents empty completion');
    await student.waitForFunction(() => document.querySelector('.activity-attachment img')?.naturalWidth > 0);
    await student.waitForFunction(() => Number.isFinite(document.querySelector('.activity-attachment video')?.duration) && document.querySelector('.activity-attachment video').duration > 0);
    const video = student.locator('.activity-attachment video');
    await video.evaluate(async element => {element.muted = true; await element.play();});
    await student.waitForFunction(() => document.querySelector('.activity-attachment video')?.currentTime > 0);
    await video.evaluate(element => element.pause());
    await response.fill(answer);
    await student.getByText('Tus respuestas están guardadas.', {exact: true}).waitFor();
    await shot(student, 'activities-student-draft-mobile');
    await student.reload();
    await courseCard.getByRole('button', {name: 'Continuar curso', exact: true}).click();
    await response.waitFor(); assert.equal(await response.inputValue(), answer, 'Draft response survives a full browser reload');
    await student.getByRole('button', {name: 'Guardar y completar actividad', exact: true}).click();
    await student.getByText('Actividad completada. Tu progreso está guardado.', {exact: true}).waitFor();
    await student.reload();
    await courseCard.getByRole('button', {name: 'Continuar curso', exact: true}).click();
    await student.getByRole('region', {name: 'Curso en progreso', exact: true}).getByText('1 de 1 actividades completadas', {exact: true}).waitFor();
    assert.equal(await response.inputValue(), answer);
    assert(await response.evaluate(element => element.readOnly), 'Delivered responses remain visible after completion');
    const enrollment = (await state(studentContext)).enrollments.find(enrollment => enrollment.course_id === course.id);
    assert(enrollment.completed.includes(course.activities[0].id));
    assert.equal(enrollment.responses[course.activities[0].id].answers.response, answer);
    assert(enrollment.responses[course.activities[0].id].submittedAt);
    await shot(student, 'activities-student-completed-mobile');
    await student.setViewportSize({width: 1440, height: 1000}); await shot(student, 'activities-student-completed-desktop');

    active = admin;
    await admin.reload(); await admin.getByRole('heading', {name: title, exact: true}).waitFor();
    const summary = admin.locator('summary').filter({hasText: /^Respuestas de las actividades/});
    await summary.click();
    const review = admin.locator('details').filter({has: admin.locator('summary').filter({hasText: title})}).last();
    await review.locator('summary').first().click();
    await review.getByText(answer, {exact: true}).waitFor();
    assert((await review.innerText()).includes('Entregada'));
    await shot(admin, 'activities-admin-response-review');
    await admin.setViewportSize({width: 390, height: 844}); await shot(admin, 'activities-admin-response-review-mobile');
    assert.deepEqual(errors, [], 'No client JavaScript errors across the administrator/student flow');
    console.log('PASS browser activities: real image/video upload and playback, save/reload/publish, mobile/desktop student answers, draft persistence, delivery, progress and administrator review.');
  } catch (error) {
    await active.screenshot({path: resolve(folder, 'activities-failure.png'), fullPage: true}).catch(() => {});
    writeFileSync(resolve(folder, 'activities-failure.txt'), await active.locator('body').innerText().catch(() => ''));
    throw error;
  } finally {await browser.close();}
}
