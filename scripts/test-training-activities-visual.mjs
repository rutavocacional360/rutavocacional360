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
  const studentContext = await browser.newContext({viewport: {width: 375, height: 812}});
  const admin = await adminContext.newPage(), student = await studentContext.newPage(), errors = [], externalVideoIssues = [];
  const youtubeRequests = new Map([[admin, []], [student, []]]);
  let youtubePlayback = {attempted:false,playbackVerified:false,status:'not-attempted'};
  let active = admin;
  const externalVideoHost = value => {try {return /(^|\.)(youtube(?:-nocookie)?\.com|googlevideo\.com|ytimg\.com)$/.test(new URL(value).hostname);} catch {return false;}};
  for (const page of [admin, student]) {
    page.setDefaultTimeout(25000);
    page.on('pageerror', error => {
      if (/https:\/\/(?:[^/]+\.)?(?:youtube(?:-nocookie)?\.com|googlevideo\.com|ytimg\.com)\//.test(error.stack || '')) externalVideoIssues.push({type:'script',message:error.message});
      else errors.push(error.message);
    });
    page.on('requestfailed', request => {if (externalVideoHost(request.url())) externalVideoIssues.push({type:'network',url:request.url(),error:request.failure()?.errorText});});
    page.on('response', response => {if (externalVideoHost(response.url()) && response.status() >= 400) externalVideoIssues.push({type:'http',url:response.url(),status:response.status()});});
    page.on('request', request => {
      const url = new URL(request.url());
      if (url.hostname === 'www.youtube-nocookie.com' && url.pathname.startsWith('/embed/')) {
        youtubeRequests.get(page).push(request.allHeaders().then(headers => ({url:request.url(),referer:headers.referer})).catch(error => ({url:request.url(),error:error.message})));
      }
    });
  }
  const title = 'Actividad multimedia y respuestas ' + Date.now();
  const youtubeId = 'M7lc1UVf-VE', youtubeTitle = 'Video de orientación en YouTube QA';
  const prompt = '¿Qué actividad te gustaría explorar y por qué?';
  const answer = 'Me gustaría explorar la ciencia y la tecnología para aprender cómo resolver problemas de mi comunidad.';
  const worksheetTitle = 'Dinámica: ¿Quién soy?';
  const worksheetInstruction = 'Piensa en tres características que te representen y responde con tus propias palabras.';
  const worksheetPrompts = ['¿Qué actividad disfruto hacer y me gustaría aprender mejor?', '¿Qué cualidad personal considero que me ayuda a alcanzar mis metas?'];
  const worksheetAnswers = ['Disfruto dibujar y quiero aprender a comunicar mis ideas con ilustraciones.', 'Mi curiosidad y mi constancia me ayudan a practicar incluso cuando algo cuesta.'];
  const worksheet = worksheetInstruction + '\n\n' + worksheetPrompts.map((question, index) => `${index + 1}. ${question}\n${'.'.repeat(110)}\n${'.'.repeat(110)}`).join('\n\n');
  const shot = async (page, name) => {
    for (const preview of await page.locator('.rv-media-preview img,.rv-media-preview video').all()) {
      await preview.scrollIntoViewIfNeeded();
      await preview.evaluate(element => new Promise((resolveReady, reject) => {
        const ready = () => element.tagName === 'IMG' ? element.complete && element.naturalWidth > 0 : element.readyState >= 1;
        if (ready()) return resolveReady(true);
        const timer = setTimeout(() => reject(new Error('Material preview did not finish loading')), 15000);
        element.addEventListener(element.tagName === 'IMG' ? 'load' : 'loadedmetadata', () => {clearTimeout(timer); resolveReady(true);}, {once:true});
      }));
    }
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
  const checkYouTube = async (scope, message, page) => {
    const frame = scope.locator('.rv-youtube-card iframe');
    assert.equal(await frame.count(), 1, message + ': exactly one embedded video');
    assert.equal(await frame.getAttribute('title'), youtubeTitle);
    const source = new URL(await frame.getAttribute('src'));
    assert.equal(source.protocol, 'https:'); assert.equal(source.hostname, 'www.youtube-nocookie.com');
    assert.equal(source.pathname, '/embed/' + youtubeId);
    assert.equal(await frame.getAttribute('referrerpolicy'), 'strict-origin-when-cross-origin');
    await frame.scrollIntoViewIfNeeded();
    const until = Date.now() + 15000;
    while (!youtubeRequests.get(page).length && Date.now() < until) await new Promise(resolve => setTimeout(resolve, 50));
    const requests = await Promise.all(youtubeRequests.get(page));
    assert(requests.length > 0, message + ': CSP permits the embedded YouTube request');
    assert(requests.some(request => request.referer === new URL(base).origin + '/'), message + ': iframe referrer policy overrides the global no-referrer header');
    const link = scope.getByRole('link', {name: 'Abrir en YouTube: ' + youtubeTitle, exact: true});
    const destination = new URL(await link.getAttribute('href'));
    assert.equal(destination.hostname, 'www.youtube.com'); assert.equal(destination.searchParams.get('v'), youtubeId);
    assert.equal(await link.getAttribute('target'), '_blank');
    assert((await link.getAttribute('rel')).includes('noopener'));
  };
  const probeYouTubePlayback = async page => {
    const started = Date.now(), until = started + 30000;
    const remaining = () => Math.max(1, until - Date.now());
    const iframe = page.locator('.rv-youtube-card iframe');
    let playerFrame;
    youtubePlayback = {attempted:true,playbackVerified:false,status:'loading',timeLimitMs:30000};
    const inspect = async () => {
      if (!playerFrame) return;
      const observed = await playerFrame.evaluate(() => {
        const video = document.querySelector('video'), player = document.getElementById('movie_player');
        const providerError = [...document.querySelectorAll('.ytp-error-content-wrap,.ytp-error')].find(element => element.getClientRects().length && getComputedStyle(element).visibility !== 'hidden' && element.textContent?.trim());
        let playerState = null;
        try {if (typeof player?.getPlayerState === 'function') playerState = player.getPlayerState();} catch {}
        return {
          frameUrl:location.href,readyState:document.readyState,
          bodyText:(document.body?.innerText || '').slice(0,4000),
          playerError:(providerError?.textContent || '').trim().slice(0,2000),
          playerState,
          video:video ? {currentTime:video.currentTime,paused:video.paused,readyState:video.readyState,networkState:video.networkState,error:video.error ? {code:video.error.code,message:video.error.message} : null} : null,
          buttons:[...document.querySelectorAll('button')].map(button => button.getAttribute('aria-label') || button.title || button.textContent?.trim()).filter(Boolean).slice(0,20),
        };
      }).catch(error => ({inspectionError:error.message}));
      Object.assign(youtubePlayback, observed);
    };
    try {
      await iframe.scrollIntoViewIfNeeded({timeout:remaining()});
      playerFrame = await (await iframe.elementHandle({timeout:remaining()})).contentFrame();
      assert(playerFrame, 'The YouTube iframe exposes a browser frame');
      await playerFrame.waitForFunction(() => location.hostname.endsWith('youtube-nocookie.com') && !!document.body &&
        (document.body.innerText.trim().length > 0 || !!document.querySelector('video,#movie_player')), null, {timeout:remaining()});
      await playerFrame.locator('body').waitFor({state:'visible',timeout:remaining()});
      youtubePlayback.status = 'player-loaded';
      await inspect();
      if (youtubePlayback.playerError) {
        youtubePlayback.status = 'provider-error';
      } else {
        const controls = playerFrame.locator('.ytp-large-play-button,.ytp-play-button,button[aria-label="Play"],button[aria-label="Reproducir"]');
        let played = false;
        for (const control of await controls.all()) {
          if (await control.isVisible()) {
            await control.click({timeout:remaining()});
            played = true; youtubePlayback.playClicked = true; break;
          }
        }
        if (!played) {
          await playerFrame.getByRole('button', {name:/^(?:Play|Reproducir)(?:$| video|\s*\()/i}).first().click({timeout:remaining()});
          youtubePlayback.playClicked = true;
        }
        await playerFrame.waitForFunction(() => {
          const video = document.querySelector('video');
          return !!video && video.currentTime > 0.1 && !video.paused || [...document.querySelectorAll('.ytp-error-content-wrap,.ytp-error')].some(element => element.getClientRects().length && getComputedStyle(element).visibility !== 'hidden' && element.textContent?.trim());
        }, null, {timeout:remaining()});
        await inspect();
        youtubePlayback.playbackVerified = !!youtubePlayback.video && youtubePlayback.video.currentTime > 0.1 && !youtubePlayback.video.paused;
        youtubePlayback.status = youtubePlayback.playbackVerified ? 'playing' : youtubePlayback.playerError ? 'provider-error' : 'playback-unverified';
      }
    } catch (error) {
      youtubePlayback.status = 'playback-unverified';
      youtubePlayback.error = error.message;
      await inspect();
      if (youtubePlayback.playerError) youtubePlayback.status = 'provider-error';
    } finally {
      youtubePlayback.elapsedMs = Date.now() - started;
      await iframe.screenshot({path:resolve(folder,'activities-youtube-player.png'),timeout:2000}).catch(error => {youtubePlayback.screenshotError=error.message;});
      if (playerFrame) await playerFrame.evaluate(() => {document.querySelector('video')?.pause();}).catch(() => {});
      console.log((youtubePlayback.playbackVerified ? 'PASS' : 'UNVERIFIED') + ' YouTube playback: ' + JSON.stringify(youtubePlayback));
      writeFileSync(resolve(folder,'activities-youtube-playback.json'),JSON.stringify(youtubePlayback,null,2));
    }
  };
  const reader = student.getByRole('region', {name: 'Curso en progreso', exact: true});
  const focusedReader = async () => {
    await reader.waitFor();
    await student.getByLabel('Buscar opción de estudio', {exact: true}).waitFor({state: 'hidden'});
    await student.locator('.simulator-history').waitFor({state: 'hidden'});
    assert.equal(await student.locator('.preparation-filters').count(), 0, 'The reader keeps unrelated career searches outside the activity');
    assert.equal(await student.locator('.simulator-history').count(), 0, 'The reader keeps the simulator grade history outside the activity');
  };
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
    await admin.getByLabel('Explica qué debe hacer el estudiante', {exact: true}).fill('Observa la imagen y reproduce el video antes de responder.');
    await admin.getByLabel('Pregunta o consigna de reflexión (opcional)', {exact: true}).fill(prompt);
    await admin.getByLabel('Seleccionar materiales de la actividad', {exact: true}).setInputFiles([
      resolve('public/media/brain-book-icon.png'), resolve('public/media/vocational-background-mobile.mp4'),
    ]);
    await admin.getByText('Material cargado. Guarda el borrador para conservarlo o publica el curso para compartirlo.', {exact: true}).waitFor();
    assert.equal(await admin.getByText('Archivo cargado', {exact: true}).count(), 2);
    assert.equal(await admin.locator('.rv-media-card').count(), 2);
    await admin.waitForFunction(() => document.querySelector('.rv-media-preview img')?.naturalWidth > 0);
    await admin.waitForFunction(() => Number.isFinite(document.querySelector('.rv-media-preview video')?.duration) && document.querySelector('.rv-media-preview video').duration > 0);
    const youtubeInput = admin.getByLabel('Enlace de YouTube', {exact: true});
    const addYouTube = admin.getByRole('button', {name: 'Añadir video de YouTube', exact: true});
    await youtubeInput.fill('https://example.test/watch?v=' + youtubeId);
    await addYouTube.click();
    await admin.getByText('Introduce un enlace válido de YouTube (youtube.com o youtu.be).', {exact: true}).waitFor();
    assert.equal(await admin.locator('.rv-youtube-card iframe').count(), 0, 'An invalid external address never becomes an iframe');
    await youtubeInput.fill('https://youtu.be/' + youtubeId);
    await admin.getByLabel('Título del video (opcional)', {exact: true}).fill(youtubeTitle);
    await addYouTube.click();
    await admin.getByText('Video añadido. Guarda el borrador para conservarlo o publica el curso para compartirlo.', {exact: true}).waitFor();
    await checkYouTube(admin, 'Administrator preview', admin);
    await probeYouTubePlayback(admin);
    await youtubeInput.fill('https://www.youtube.com/watch?v=' + youtubeId);
    await addYouTube.click();
    await admin.getByText('Este video ya está añadido a la actividad.', {exact: true}).waitFor();
    assert.equal(await admin.locator('.rv-youtube-card iframe').count(), 1, 'Different YouTube URL formats do not duplicate the same video');
    await admin.getByRole('button', {name: 'Añadir actividad', exact: true}).click();
    await admin.locator('.training-module').last().locator('summary').click();
    await admin.getByLabel('Título de actividad', {exact: true}).last().fill(worksheetTitle);
    await admin.getByLabel('Explica qué debe hacer el estudiante', {exact: true}).last().fill(worksheet);
    assert.equal(await admin.getByLabel('Pregunta o consigna de reflexión (opcional)', {exact: true}).last().inputValue(), '', 'Imported worksheet questions derive separate answer fields without an explicit override');
    await admin.getByRole('button', {name: 'Guardar borrador', exact: true}).click();
    await admin.getByText('Borrador del curso guardado correctamente.', {exact: true}).waitFor();
    await admin.waitForURL(url => !!url.searchParams.get('editar') && url.searchParams.get('version') === '1');
    await admin.reload(); await admin.getByLabel('Nombre del curso', {exact: true}).waitFor();
    assert.equal(await admin.getByLabel('Pregunta o consigna de reflexión (opcional)', {exact: true}).first().inputValue(), prompt);
    assert.equal(await admin.getByLabel('Explica qué debe hacer el estudiante', {exact: true}).last().inputValue(), worksheet, 'Imported source content is preserved when saving and reloading');
    assert.equal(await admin.locator('.rv-media-card').count(), 2, 'Uploaded materials survive saving and reloading the administrator editor');
    await checkYouTube(admin, 'Saved administrator course', admin);
    await shot(admin, 'activities-admin-materials');
    await admin.setViewportSize({width: 375, height: 812}); await shot(admin, 'activities-admin-materials-mobile');
    await admin.setViewportSize({width: 1440, height: 1000});
    await admin.getByRole('button', {name: 'Revisar y publicar curso', exact: true}).click();
    await admin.getByText('Ver contenido', {exact: true}).first().click();
    await checkYouTube(admin, 'Review before publication', admin);
    await shot(admin, 'activities-admin-publication-review');
    await admin.getByRole('button', {name: 'Publicar curso', exact: true}).click();
    await admin.getByText('Curso publicado correctamente. Sus actividades ya están disponibles para los estudiantes de esta ruta.', {exact: true}).waitFor();
    await admin.getByRole('button', {name: 'Publicar curso', exact: true}).waitFor({state: 'hidden'});
    await admin.getByRole('heading', {name: title, exact: true}).waitFor();
    const course = (await state(adminContext)).courses.find(course => course.title === title);
    assert.equal(course.status, 'published'); assert.equal(course.activities[0].attachments.length, 2); assert.equal(course.activities.length, 2);
    assert.deepEqual(course.activities[0].youtubeVideos, [{videoId: youtubeId, title: youtubeTitle}], 'The published course retains the validated video ID and custom title');

    active = student;
    await student.goto(base + '/mi-ruta/cursos?curso=' + course.id);
    const preview = student.getByRole('region', {name: 'Vista previa del curso', exact: true});
    await preview.getByRole('heading', {name: title, exact: true}).waitFor();
    assert(!(await state(studentContext)).enrollments.some(item => item.course_id === course.id), 'Previewing a new course does not enroll silently');
    assert.equal(await student.locator('.preparation-filters,.simulator-history').count(), 0, 'The course preview is focused');
    await preview.getByRole('button', {name: 'Volver a mis cursos', exact: true}).click();
    await student.goto(base + '/mi-ruta/cursos');
    const courseCard = student.getByRole('region', {name: 'Cursos y actividades', exact: true}).locator('.card').filter({has: student.getByRole('heading', {name: title, exact: true})});
    await courseCard.getByRole('button', {name: 'Comenzar curso', exact: true}).click();
    await focusedReader();
    await student.waitForURL(url => url.searchParams.get('curso') === course.id && url.searchParams.get('actividad') === course.activities[0].id);
    await checkYouTube(reader, 'Student enrolled activity', student);
    const response = student.getByRole('textbox', {name: prompt, exact: true});
    await response.waitFor();
    await student.getByRole('button', {name: 'Completar actividad', exact: true}).click();
    assert.equal(await response.getAttribute('aria-invalid'), 'true', 'Empty completion explains the missing answer inline');
    assert(await response.evaluate(element => document.activeElement === element), 'The empty answer receives focus');
    assert.equal((await state(studentContext)).enrollments.find(item => item.course_id === course.id).completed.length, 0, 'Empty completion cannot advance course progress');
    await student.waitForFunction(() => document.querySelector('.rv-media-preview img')?.naturalWidth > 0);
    await student.waitForFunction(() => Number.isFinite(document.querySelector('.rv-media-preview video')?.duration) && document.querySelector('.rv-media-preview video').duration > 0);
    const video = student.locator('.rv-media-preview video');
    await video.evaluate(async element => {element.muted = true; await element.play();});
    await student.waitForFunction(() => document.querySelector('.rv-media-preview video')?.currentTime > 0);
    await video.evaluate(element => element.pause());
    await response.fill(answer);
    await student.getByText('Guardado en tu cuenta', {exact: true}).waitFor();
    await shot(student, 'activities-student-draft-mobile');
    await student.reload();
    await focusedReader();
    await response.waitFor(); assert.equal(await response.inputValue(), answer, 'Draft response survives a full browser reload');
    await checkYouTube(reader, 'Student reload', student);
    await student.getByRole('button', {name: 'Completar actividad', exact: true}).click();
    await student.getByText('Actividad completada. Tu progreso está guardado.', {exact: true}).waitFor();
    await student.reload();
    await focusedReader();
    await reader.getByText('1 de 2 actividades completadas', {exact: true}).waitFor();
    assert.equal(await response.inputValue(), answer);
    assert(await response.evaluate(element => element.readOnly), 'Delivered responses remain visible after completion');
    const enrollment = (await state(studentContext)).enrollments.find(enrollment => enrollment.course_id === course.id);
    assert(enrollment.completed.includes(course.activities[0].id));
    assert.equal(enrollment.responses[course.activities[0].id].answers.response, answer);
    assert(enrollment.responses[course.activities[0].id].submittedAt);
    await shot(student, 'activities-student-completed-mobile');
    await student.setViewportSize({width: 1440, height: 1000}); await shot(student, 'activities-student-completed-desktop');

    await student.goto(base + '/mi-ruta');
    const dashboardCourse = student.locator('.learning-summary-course').filter({has: student.getByRole('heading', {name: title, exact: true})});
    const continueActivity = dashboardCourse.getByRole('link', {name: 'Continuar actividad: ' + worksheetTitle, exact: true});
    await continueActivity.waitFor();
    assert.equal(new URL(await continueActivity.getAttribute('href'), base).searchParams.get('actividad'), course.activities[1].id, 'The dashboard points to the pending activity');
    assert((await dashboardCourse.innerText()).includes('2 videos') && (await dashboardCourse.innerText()).includes('1 imagen'), 'The dashboard counts both the uploaded video and the YouTube video');
    await shot(student, 'activities-dashboard-pending-desktop');
    await student.setViewportSize({width: 375, height: 812}); await shot(student, 'activities-dashboard-pending-mobile');
    await student.setViewportSize({width: 1440, height: 1000});
    await continueActivity.click(); await focusedReader();
    await student.waitForURL(url => url.searchParams.get('curso') === course.id && url.searchParams.get('actividad') === course.activities[1].id);
    await reader.getByRole('heading', {name: worksheetTitle, exact: true}).waitFor();
    assert.equal(await reader.locator('.course-instructions').innerText(), worksheetInstruction, 'Reader instructions omit printable answer lines and repeated questions');
    for (const question of worksheetPrompts) {
      assert.equal(await reader.getByRole('textbox', {name: question, exact: true}).count(), 1, 'Each imported question has exactly one answer field');
      assert.equal((await reader.innerText()).split(question).length - 1, 1, 'Each imported question is displayed only once');
    }
    assert(!/\.{4,}/.test(await reader.locator('.course-instructions').innerText()), 'No dotted writing lines remain in the digital activity');
    await shot(student, 'activities-worksheet-empty-desktop');
    await student.setViewportSize({width: 812, height: 375});
    await reader.locator('.course-outline').waitFor({state: 'hidden'});
    await reader.locator('.course-mobile-navigation').waitFor();
    await shot(student, 'activities-worksheet-landscape');
    await student.setViewportSize({width: 375, height: 812});
    await student.getByRole('button', {name: 'Completar actividad', exact: true}).click();
    assert.equal(await reader.locator('textarea[aria-invalid="true"]').count(), 2, 'Both empty imported questions explain what is required');
    for (let index = 0; index < worksheetPrompts.length; index++) await reader.getByRole('textbox', {name: worksheetPrompts[index], exact: true}).fill(worksheetAnswers[index]);
    await student.getByText('Guardado en tu cuenta', {exact: true}).waitFor();
    await shot(student, 'activities-worksheet-draft-mobile');
    await student.reload(); await focusedReader();
    for (let index = 0; index < worksheetPrompts.length; index++) assert.equal(await reader.getByRole('textbox', {name: worksheetPrompts[index], exact: true}).inputValue(), worksheetAnswers[index], 'Every imported answer survives a reload at the same activity URL');
    await student.getByRole('button', {name: 'Completar actividad', exact: true}).click();
    await reader.getByText('2 de 2 actividades completadas', {exact: true}).waitFor();
    await reader.getByText('¡Curso completado!', {exact: true}).waitFor();
    await student.reload(); await focusedReader();
    await reader.getByText('2 de 2 actividades completadas', {exact: true}).waitFor();
    for (const question of worksheetPrompts) assert(await reader.getByRole('textbox', {name: question, exact: true}).evaluate(element => element.readOnly), 'Submitted imported answers remain visible and protected');
    const finished = (await state(studentContext)).enrollments.find(item => item.course_id === course.id);
    assert.equal(finished.completed.length, 2); assert(finished.responses[course.activities[1].id].submittedAt);
    assert.deepEqual(finished.responses[course.activities[1].id].answers, {'question-1': worksheetAnswers[0], 'question-2': worksheetAnswers[1]});
    await shot(student, 'activities-worksheet-completed-mobile');
    await student.setViewportSize({width: 1440, height: 1000}); await shot(student, 'activities-worksheet-completed-desktop');

    active = admin;
    await admin.reload(); await admin.getByRole('heading', {name: title, exact: true}).waitFor();
    const summary = admin.locator('summary').filter({hasText: /^Respuestas de las actividades/});
    await summary.click();
    const review = admin.locator('details').filter({has: admin.locator('summary').filter({hasText: title})}).last();
    await review.locator('summary').first().click();
    await review.getByText(answer, {exact: true}).waitFor();
    for (const text of worksheetAnswers) await review.getByText(text, {exact: true}).waitFor();
    assert((await review.innerText()).includes('Entregada'));
    await shot(admin, 'activities-admin-response-review');
    await admin.setViewportSize({width: 375, height: 812}); await shot(admin, 'activities-admin-response-review-mobile');
    assert.deepEqual(errors, [], 'No client JavaScript errors across the administrator/student flow');
    console.log('PASS browser activities: image/video upload and local playback, YouTube URL validation/deduplication, persisted secure embeds in review and student reader, publication, dashboard deep links and material counts, focused reader, unique imported questions, inline validation, autosave/reload, protected delivery, full course progress and administrator review at 375px/1440px.');
    console.log('YouTube playback: ' + (youtubePlayback.playbackVerified ? 'verified by a running video with currentTime > 0.1 inside the real embedded player' : 'UNVERIFIED — ' + youtubePlayback.status + '; see activities-youtube-playback.json and activities-youtube-player.png') + '. External video diagnostics: ' + externalVideoIssues.length + '.');
  } catch (error) {
    await active.screenshot({path: resolve(folder, 'activities-failure.png'), fullPage: true}).catch(() => {});
    writeFileSync(resolve(folder, 'activities-failure.txt'), await active.locator('body').innerText().catch(() => ''));
    throw error;
  } finally {writeFileSync(resolve(folder, 'activities-youtube-diagnostics.json'), JSON.stringify({playbackVerified:youtubePlayback.playbackVerified,playback:youtubePlayback,issues:externalVideoIssues}, null, 2)); await browser.close();}
}
