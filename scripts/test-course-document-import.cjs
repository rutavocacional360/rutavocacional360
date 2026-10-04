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
  if (process.argv[2]) {
    const real = await extractFile(fs.readFileSync(process.argv[2]), process.argv[2]);
    assert.equal(real.course.sections.length, 12);
    assert.equal(new Set(real.course.sections.map(section => section.module)).size, 4);
    assert(real.course.sections.every(section => section.durationMinutes === 70));
    assert.equal(real.course.sections[0].title, 'Actividad 1. El árbol que cuenta mi historia');
    assert.equal(real.course.sections[11].title, 'Actividad 12. Mi proyecto de vida: feria de sueños y oportunidades');
    assert.match(real.course.notes, /Rúbrica orientativa/);
    assert.deepEqual(real.embedded, []);
    console.log('PASS supplied DOCX: all 12 activities, 4 axes, original timing, reflections and general rubric preserved.');
  }
  console.log('PASS course import: teaching programmes, real DOCX, complete content, bibliography boundaries and existing quiz keys.');
})().catch(error => {console.error(error); process.exitCode = 1;});
