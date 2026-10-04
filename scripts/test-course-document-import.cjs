const fs = require('node:fs'), assert = require('node:assert/strict'), ts = require('typescript');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: {module: 1, target: 9, esModuleInterop: true},
}).outputText, filename);
const {parseHTML} = require('linkedom');
const {readDocumentMarkup, proposeTests} = require('../components/kit/lib/import-content.ts');
const {parseInstructionalCourse} = require('../components/kit/lib/import-course.ts');
const {extractFile} = require('../lib/server/importer.ts');
const JSZip = require('jszip');
const parse = markup => readDocumentMarkup(parseHTML('<html><body>' + markup + '</body></html>').document);

const activity = (number, title) => `<p><strong>Actividad ${number}. ${title}</strong></p>
<p>Objetivo: Reconocer intereses y tomar decisiones informadas.</p><p>Materiales: Papel y lápiz.</p>
<p>Inicio (15 minutos)</p><ul><li>El docente invita a reflexionar.</li></ul>
<p>¿Qué disfruto aprender?</p><p>……………………………………………</p>
<p>Desarrollo (40 minutos)</p><ol><li>Comparte tus ideas con un compañero.<ul>${Array.from({length: 75}, (_, i) => `<li>Ejemplo pedagógico ${i + 1} de la actividad ${number}.</li>`).join('')}</ul></li><li>Escribe una meta personal.</li></ol>
<p>Cierre (15 minutos)</p><ul><li>Reflexiona sobre tu futuro.</li></ul>
<p>¿Qué apoyo necesito?</p><p>Reto: Conversar con una persona de confianza.</p><p>Evidencia: Reflexión escrita.</p>`;
const programme = '<p><strong>Programa de orientación</strong></p><p>Explora tus intereses.</p><p><strong>Eje 1. Autoconocimiento</strong></p>' +
  activity(1, 'Mi historia') + '<p><strong>Eje 2. Mi futuro</strong></p>' + activity(2, 'Mis metas') +
  '<p><strong>Evaluación general de las dinámicas</strong></p><table><tr><th>Criterio</th><th>Indicador</th></tr><tr><td>Autoconocimiento</td><td>Reconoce sus fortalezas.</td></tr></table>' +
  '<p>Bibliografía</p><ol><li>Autor. (2025). Guía de orientación.</li></ol>';
const parsed = parse(programme);
assert.equal(parsed.course.title, 'Programa de orientación');
assert.equal(parsed.course.description, 'Explora tus intereses.');
assert.equal(parsed.course.sections.length, 2);
assert.deepEqual(parsed.course.sections.map(section => section.durationMinutes), [70, 70]);
assert.deepEqual(parsed.course.sections.map(section => section.module), ['Eje 1. Autoconocimiento', 'Eje 2. Mi futuro']);
assert(parsed.course.sections.every(section => section.content.includes('¿Qué apoyo necesito?') && section.content.includes('Evidencia: Reflexión escrita.')));
assert(parsed.course.sections.every(section => !section.content.includes('…………')));
assert(parsed.course.sections[0].content.includes('Ejemplo pedagógico 75 de la actividad 1.'));
assert(!parsed.course.sections[0].content.includes('actividad 2.'));
assert.match(parsed.course.notes, /Autoconocimiento \| Reconoce sus fortalezas/);
assert.match(parsed.course.notes, /Autor\. \(2025\)/);
assert.deepEqual(parsed.embedded, [], 'Teaching instructions and bibliography must never become questions or answer options');
assert.deepEqual(proposeTests(parsed.text, parsed.embedded, 'programa.html'), []);
assert.deepEqual(parseInstructionalCourse(parsed.text), parsed.course, 'Plain text uses the same conservative classification');
assert.equal(parseInstructionalCourse('Actividad 1. Pregunta\nObjetivo: Evaluar.\n1. ¿Cuánto es dos más dos?'), undefined);
assert.equal(parseInstructionalCourse(parsed.text.replaceAll('Cierre (15 minutos)', 'Inicio (15 minutos)')), undefined, 'All three distinct teaching phases are required');

const quizMarkup = '<h1>Cuestionario</h1><ol><li>Primera pregunta</li></ol><ul><li>Sí</li><li>No</li></ul>' +
  '<p>Recursos complementarios para el docente.</p><ul><li>Guía docente</li><li>Material de consulta</li></ul>' +
  '<p><strong>Bibliografía</strong></p><ol><li>Primera referencia.</li><li>Segunda referencia.</li></ol>' +
  '<h4>Sección B</h4><p>2. Segunda pregunta</p><p>a) Verdadero</p><p>b) Falso</p><p>Clave: A</p>';
const quiz = parse(quizMarkup), questions = proposeTests(quiz.text, quiz.embedded, 'quiz.html')[0].questions;
assert.equal(quiz.course, undefined);
assert.equal(questions.length, 2);
assert.deepEqual(questions[0].options.map(option => option.label), ['Sí', 'No']);
assert.deepEqual(questions[1].correctValues, [1]);
assert.equal(questions[1].section, 'Sección B');
const plainQuiz = proposeTests('1. Pregunta\na) Uno\nb) Dos\nClave: B\nReferencias bibliográficas\n1. Referencia uno\n2. Referencia dos', [], 'quiz.txt')[0];
assert.equal(plainQuiz.questions.length, 1);
assert.deepEqual(plainQuiz.questions[0].correctValues, [2]);
const explicit = parse(programme + '<script type="application/json">{"title":"Prueba explícita","questions":[{"text":"Dos más dos","options":["Tres","Cuatro"]}]}</script>');
assert.equal(explicit.course, undefined, 'Explicit instrument data takes precedence over incidental teaching prose');
assert.equal(explicit.embedded.length, 1);

// A standalone teaching activity uses the same course flow as a full programme.
// Word authors commonly put the objective label and its text in separate paragraphs.
const singleActivity = '<p><strong>Actividad 1. Mis intereses</strong></p>' +
  '<p><strong>Eje:</strong> Autoconocimiento<br><strong>Edad:</strong> 14 a 20 años<br><strong>Duración:</strong> 45 minutos<br><strong>Propósito:</strong> Reconocer intereses personales.</p>' +
  '<p><strong>Objetivo</strong></p><p>Relacionar mis habilidades con mis metas.</p>' +
  '<p><strong>INICIO</strong></p><ol><li>¿Qué disfruto aprender?</li><li>¿Qué cualidades tengo?</li></ol>' +
  '<p><strong>DESARROLLO</strong></p><p>Dibuja tus intereses.</p><ul><li>Raíces: valores.</li><li>Ramas: metas.</li></ul><ol><li>¿Qué habilidades quiero desarrollar?</li><li>¿Qué ocupaciones me interesan?</li></ol>' +
  '<p><strong>CIERRE</strong></p><ol><li>¿Qué descubrí sobre mí?</li><li>¿Qué opción quiero explorar?</li></ol>' +
  '<p><strong>RETO</strong></p><p>Investiga una profesión.</p><p><strong>EVIDENCIA</strong></p><p>Dibujo y reflexión personal.</p>';
const single = parse(singleActivity);
assert.equal(single.course.title, 'Actividad 1. Mis intereses');
assert.equal(single.course.description, 'Reconocer intereses personales.');
assert.equal(single.course.sections.length, 1);
assert.equal(single.course.sections[0].module, 'Autoconocimiento');
assert.equal(single.course.sections[0].objective, 'Relacionar mis habilidades con mis metas.');
assert.equal(single.course.sections[0].durationMinutes, 45);
assert.equal((single.course.sections[0].content.match(/¿/g) || []).length, 6);
assert(single.course.sections[0].content.includes('Raíces: valores.') && single.course.sections[0].content.includes('Dibujo y reflexión personal.'));
assert.deepEqual(single.embedded, [], 'Personal reflections must never be converted into a graded simulator');
assert.deepEqual(proposeTests(single.text, single.embedded, 'actividad.docx'), []);
assert.equal(parseInstructionalCourse(single.text.replace('Objetivo\n', 'Objetivo:\n')).sections[0].objective, single.course.sections[0].objective);
assert.equal(parseInstructionalCourse(single.text.replace('Objetivo\nRelacionar mis habilidades con mis metas.\n', '')), undefined, 'The teaching objective is required even for a single activity');
assert.equal(parseInstructionalCourse(single.text.replace('Relacionar mis habilidades con mis metas.\n', '')), undefined, 'A following phase heading cannot stand in for the missing objective');
assert.equal(parseInstructionalCourse(single.text.replace('CIERRE', 'INICIO')), undefined, 'A standalone activity still needs all three distinct phases');

(async () => {
  const html = await extractFile(Buffer.from(programme), 'programa.html');
  assert.equal(html.course.sections.length, 2);
  const txt = await extractFile(Buffer.from(parsed.text), 'programa.txt');
  assert.equal(txt.course.sections.length, 2);
  // Real Word package exercises Mammoth and the server extractor, without a
  // private user document committed to the repository.
  const escape = text => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  const zip = new JSZip();
  zip.file('[Content_Types].xml', '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  zip.file('_rels/.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  zip.file('word/document.xml', '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' + parsed.text.split('\n').map(line => '<w:p><w:r><w:t>' + escape(line) + '</w:t></w:r></w:p>').join('') + '</w:body></w:document>');
  const docx = await extractFile(await zip.generateAsync({type: 'nodebuffer'}), 'programa.docx');
  assert.deepEqual(docx.course, parsed.course);
  assert.deepEqual(docx.embedded, []);
  const singleZip = zip.clone();
  singleZip.file('word/document.xml', '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' + single.text.split('\n').map(line => '<w:p><w:r><w:t>' + escape(line) + '</w:t></w:r></w:p>').join('') + '</w:body></w:document>');
  const singleOdt = new JSZip();
  singleOdt.file('mimetype', 'application/vnd.oasis.opendocument.text');
  singleOdt.file('content.xml', '<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"><office:body><office:text>' + single.text.split('\n').map(line => '<text:p>' + escape(line) + '</text:p>').join('') + '</office:text></office:body></office:document-content>');
  const singleRtf = '{\\rtf1\\ansi\\uc1 ' + [...single.text].map(char => char === '\n' ? '\\par ' : char.charCodeAt(0) > 127 ? '\\u' + char.charCodeAt(0) + '?' : char).join('') + '}';
  for (const [extension, bytes] of [
    ['docx', await singleZip.generateAsync({type:'nodebuffer'})], ['odt', await singleOdt.generateAsync({type:'nodebuffer'})],
    ['html', Buffer.from(singleActivity)], ['txt', Buffer.from(single.text)], ['md', Buffer.from(single.text)], ['rtf', Buffer.from(singleRtf)],
  ]) {
    const extracted = await extractFile(bytes, 'actividad.' + extension);
    assert.deepEqual(extracted.course, single.course, 'Complete standalone activity must survive ' + extension + ' extraction');
    assert.deepEqual(extracted.embedded, []);
    assert.deepEqual(proposeTests(extracted.text, extracted.embedded, 'actividad.' + extension), []);
  }
  const {jsPDF} = require('jspdf');
  const pdf = new jsPDF();
  pdf.setFontSize(10);
  // Exercise pagination inside a split objective as well as the first-page title.
  const objectiveBreak = single.text.indexOf('\nRelacionar');
  pdf.text(single.text.slice(0, objectiveBreak).split('\n'), 15, 20);
  pdf.addPage();
  pdf.text(single.text.slice(objectiveBreak + 1).split('\n'), 15, 20);
  const extractedPdf = await extractFile(Buffer.from(pdf.output('arraybuffer')), 'actividad.pdf');
  assert.deepEqual(extractedPdf.course, single.course, 'PDF page markers cannot replace the course title or a split objective');
  assert.deepEqual(proposeTests(extractedPdf.text, extractedPdf.embedded, 'actividad.pdf'), []);
  if (process.argv[2]) {
    const real = await extractFile(fs.readFileSync(process.argv[2]), process.argv[2]);
    if (process.argv.includes('--single-activity')) {
      assert.equal(real.course.sections.length, 1);
      assert.equal(real.course.title, 'Actividad 1. El árbol que cuenta mi historia');
      assert.equal(real.course.sections[0].module, 'Autoconocimiento');
      assert.equal(real.course.sections[0].durationMinutes, 45);
      assert.match(real.course.sections[0].objective, /^Identificar características personales/);
      for (const content of ['¿Qué actividad disfruto hacer', '¿Qué cualidad personal', '¿En qué actividades', '¿Qué profesión u ocupación', '¿Qué descubrí sobre mí', 'Por mis intereses actuales', 'RETO', 'EVIDENCIA', 'Árbol vocacional terminado']) assert(real.course.sections[0].content.includes(content), content);
      assert.deepEqual(real.embedded, []);
      assert.deepEqual(proposeTests(real.text, real.embedded, process.argv[2]), []);
      console.log('PASS supplied single-activity DOCX: original title, objective, module, 45 minutes, all six reflections, challenge and evidence; no fabricated quiz.');
    } else {
      assert.equal(real.course.sections.length, 12);
      assert.equal(new Set(real.course.sections.map(section => section.module)).size, 4);
      assert(real.course.sections.every(section => section.durationMinutes === 70));
      assert.equal(real.course.sections[0].title, 'Actividad 1. El árbol que cuenta mi historia');
      assert.equal(real.course.sections[11].title, 'Actividad 12. Mi proyecto de vida: feria de sueños y oportunidades');
      assert.match(real.course.notes, /Rúbrica orientativa/);
      assert.deepEqual(real.embedded, []);
      console.log('PASS supplied DOCX: all 12 activities, 4 axes, original timing, reflections and general rubric preserved.');
    }
  }
  console.log('PASS course import: standalone activities in DOCX/PDF/ODT/HTML/TXT/MD/RTF, teaching programmes, complete content, bibliography boundaries and existing quiz keys.');
})().catch(error => {console.error(error); process.exitCode = 1;});
