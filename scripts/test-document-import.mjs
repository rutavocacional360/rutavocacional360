import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {readFileSync} from 'node:fs';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {deflateRawSync} from 'node:zlib';
const bundled = await build({stdin:{contents:"export {readDocumentMarkup,proposeTests} from './components/kit/lib/import-content'; export {extractFile} from './lib/server/importer';",resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,platform:'node',format:'cjs',packages:'external'});
const bundledModule = {exports:{}};
new Function('require','module','exports',bundled.outputFiles[0].text)(createRequire(import.meta.url),bundledModule,bundledModule.exports);
const {readDocumentMarkup,proposeTests,extractFile} = bundledModule.exports;
const markup='<h1>Cuestionario de prueba</h1><p>Sección A. Datos</p><ol><li>Primera pregunta</li></ol><ul><li>Opción uno</li><li>Opción dos<ol><li>Elige hasta tres opciones.</li></ol></li><li>A</li><li>B</li><li>C</li></ul><p>Sección B. Escala</p><table><tr><td>Valor</td><td>Respuesta</td></tr><tr><td>1</td><td>Nunca</td></tr><tr><td>2</td><td>Siempre</td></tr></table><table><tr><td>N.°</td><td>Enunciado</td><td>1</td><td>2</td></tr><tr><td>3</td><td>Me gusta aprender.</td><td></td><td></td></tr></table><p>Nota para la aplicación: revisar con especialistas.</p><script>globalThis.__importExecuted=true;</script>';
const parsed=readDocumentMarkup(parseHTML('<html><body>'+markup+'</body></html>').document),tests=proposeTests(parsed.text,parsed.embedded,'fixture.html'),t=tests[0];assert.equal(t.questions.length,3);assert.equal(t.questions[0].options.length,2);assert.equal(t.questions[1].type,'multiple');assert.equal(t.questions[1].maxSelections,3);assert.equal(t.questions[2].type,'likert');assert.equal(t.questions[2].options[1].label,'Siempre');assert.equal(t.scoring,'manual');assert.equal(globalThis.__importExecuted,undefined);assert(!t.questions.some(q=>q.text.includes('Nota para')));
const html=await extractFile(Buffer.from('<fieldset><legend>Mi pregunta</legend><label><input type="radio">Sí</label><label><input type="radio">No</label></fieldset>'),'form.html');assert.equal(proposeTests(html.text,html.embedded,'form.html')[0].questions[0].options.length,2);

const sourceLines=['1. ¿Qué palabra lleva tilde?','a) Árbol','b) Mesa','Clave: A','2. ¿Cuánto es 2 + 2?','a) Tres','b) Cuatro','Respuesta correcta: B'];
const sourceText=sourceLines.join('\n');
async function questionsFrom(name,bytes){
 const extracted=await extractFile(Buffer.isBuffer(bytes)?bytes:Buffer.from(bytes),name);
 const tests=proposeTests(extracted.text,extracted.embedded,name);
 assert.equal(tests.length,1,name);assert.equal(tests[0].questions.length,2,name);
 assert.equal(tests[0].questions[0].text,'¿Qué palabra lleva tilde?',name);
 assert.deepEqual(tests[0].questions[0].options.map(option=>option.label),['Árbol','Mesa'],name);
 assert.equal(tests[0].questions[1].text,'¿Cuánto es 2 + 2?',name);
 assert.deepEqual(tests[0].questions[1].options.map(option=>option.label),['Tres','Cuatro'],name);
 assert.deepEqual(tests[0].questions.map(question=>question.correctValues),[[1],[2]],name);
 assert.equal(tests[0].scoring,'objective',name);assert.equal(tests[0].status,'Borrador',name);
 return extracted;
}

await questionsFrom('acentos.TXT',sourceText.replaceAll('\n','\r\n'));
await questionsFrom('utf8-bom.txt',Buffer.concat([Buffer.from([0xef,0xbb,0xbf]),Buffer.from(sourceText)]));
await questionsFrom('utf16-le.txt',Buffer.concat([Buffer.from([0xff,0xfe]),Buffer.from(sourceText,'utf16le')]));
await questionsFrom('utf16-be.txt',Buffer.concat([Buffer.from([0xfe,0xff]),Buffer.from(sourceText,'utf16le').swap16()]));
await questionsFrom('windows1252.txt',Buffer.from(sourceText,'latin1'));
await questionsFrom('preguntas.md','# Cuestionario de práctica\n'+sourceText.replace('palabra','**palabra**').replace('Árbol','[Árbol](https://example.test/definicion)').replace(/^([ab]\))/gm,'- $1'));

for(const [name,markup] of [
 ['div.html','<div>'+sourceLines.map(line=>'<div>'+line+'</div>').join('')+'</div>'],
 ['pre.html','<pre>'+sourceText+'</pre>'],
 ['saltos.htm','<section><div>'+sourceLines.join('<br>')+'</div></section>'],
 ['parrafos.html',sourceLines.map(line=>'<p>'+line+'</p>').join('')],
 ['body-saltos.html','<html><body>'+sourceLines.join('<br>')+'</body></html>'],
 ['body-inline.html','<html><body><h1>Cuestionario</h1>'+sourceLines.map(line=>'<span>'+line+'</span>').join('<br>')+'</body></html>'],
])await questionsFrom(name,markup);
const staticHtml='<div>'+sourceLines.join('<br>')+'</div><script>globalThis.__unsafeDocumentImport=true;fetch("https://example.test/never-requested");</script><iframe src="https://example.test/frame"></iframe><object data="file:///never-read"></object><style>body { color: red; }</style>';
const safeMarkup=await questionsFrom('sin-ejecucion.html',staticHtml);
assert.equal(globalThis.__unsafeDocumentImport,undefined);assert(!safeMarkup.text.includes('never-requested'));assert(!safeMarkup.text.includes('color: red'));
const literal=await extractFile(Buffer.from('<script>const preguntas=[{text:"Pregunta literal",options:["Sí","No"],correctValues:[1]}];globalThis.__unsafeDocumentImport=true;</script>'),'datos-literales.html');
assert.equal(proposeTests(literal.text,literal.embedded,'datos-literales.html')[0].questions[0].text,'Pregunta literal');assert.equal(globalThis.__unsafeDocumentImport,undefined);

const escapedRtf=sourceText.replace(/[\\{}]/g,'\\$&').replace(/[^\x00-\x7f]/g,char=>'\\u'+char.charCodeAt(0)+'?').replaceAll('\n','\\par\n');
const rtf=await questionsFrom('unicode.rtf','{\\rtf1\\ansi\\uc1 '+escapedRtf+'}');assert(rtf.warnings.some(w=>/RTF/.test(w)));
await questionsFrom('hex.rtf',Buffer.from('{\\rtf1\\ansi\\ansicpg1252 '+sourceText.replaceAll('Á',"\\'c1").replaceAll('\n','\\par\n')+'}','latin1'));
await questionsFrom('utf8.rtf',Buffer.from('{\\rtf1\\ansi\\ansicpg65001 '+sourceText.replaceAll('\n','\\par\n')+'}'));
const utf8Hex=Array.from(Buffer.from(sourceText)).map(byte=>byte===10?'\\par ':"\\'"+byte.toString(16).padStart(2,'0')).join('');
await questionsFrom('utf8-hex.rtf','{\\rtf1\\ansi\\ansicpg65001 '+utf8Hex+'}');
await questionsFrom('utf8-bloques.rtf',Buffer.from('{\\rtf1\\ansi\\ansicpg65001 '+'a'.repeat(65_535)+'é\\par '+sourceText.replaceAll('\n','\\par ')+'}'));
await questionsFrom('campos.rtf','{\\rtf1\\ansi{\\fonttbl{\\f0 Arial;}}{\\info{\\title Secreto}}{\\*\\generator Ignorar;}'+escapedRtf+'{\\field{\\*\\fldinst HYPERLINK "https://example.test/never-requested"}{\\fldrslt }}{\\object{\\*\\objdata 0000}}{\\pict PNG-IGNORAR}}');
const withEscapes=await extractFile(Buffer.from('{\\rtf1\\ansi\\uc1 1. Llaves \\{literal\\} y ruta C:\\\\datos\\par a) S\\u237?\\par b) No\\par Clave: A}'),'escapes.rtf');
assert(withEscapes.text.includes('{literal}'));assert(withEscapes.text.includes('C:\\datos'));assert(withEscapes.text.includes('Sí'));

// Minimal real ZIP containers: local records, CRC32, central directory and EOCD.
function crc32(bytes){let crc=0xffffffff;for(const byte of bytes){crc^=byte;for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return (crc^0xffffffff)>>>0;}
function zip(entries){
 const local=[],central=[];let offset=0;
 for(const [name,value,method=8] of entries){
  const filename=Buffer.from(name),bytes=Buffer.isBuffer(value)?value:Buffer.from(value),compressed=method===0?bytes:deflateRawSync(bytes),crc=crc32(bytes);
  const head=Buffer.alloc(30);head.writeUInt32LE(0x04034b50,0);head.writeUInt16LE(20,4);head.writeUInt16LE(method,8);head.writeUInt32LE(crc,14);head.writeUInt32LE(compressed.length,18);head.writeUInt32LE(bytes.length,22);head.writeUInt16LE(filename.length,26);
  const record=Buffer.concat([head,filename,compressed]);local.push(record);
  const directory=Buffer.alloc(46);directory.writeUInt32LE(0x02014b50,0);directory.writeUInt16LE(20,4);directory.writeUInt16LE(20,6);directory.writeUInt16LE(method,10);directory.writeUInt32LE(crc,16);directory.writeUInt32LE(compressed.length,20);directory.writeUInt32LE(bytes.length,24);directory.writeUInt16LE(filename.length,28);directory.writeUInt32LE(offset,42);central.push(Buffer.concat([directory,filename]));offset+=record.length;
 }
 const directory=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(entries.length,8);end.writeUInt16LE(entries.length,10);end.writeUInt32LE(directory.length,12);end.writeUInt32LE(offset,16);
 return Buffer.concat([...local,directory,end]);
}
const xmlEscape=value=>value.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const odtXml=body=>'<?xml version="1.0" encoding="UTF-8"?><office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0"><office:body><office:text>'+body+'</office:text></office:body></office:document-content>';
const odt=(xml,mime='application/vnd.oasis.opendocument.text')=>zip([['mimetype',mime,0],['content.xml',xml]]);
const paragraphs=sourceLines.map(line=>'<text:p>'+xmlEscape(line)+'</text:p>').join('');
const odtParsed=await questionsFrom('preguntas.odt',odt(odtXml(paragraphs)));assert(odtParsed.warnings.some(w=>/ODT/.test(w)));
await questionsFrom('saltos.odt',odt(odtXml('<text:p>'+sourceLines.map(xmlEscape).join('<text:line-break/>')+'</text:p>')));
await questionsFrom('oculto.odt',odt(odtXml('<office:annotation><text:p>1. No importar comentario</text:p></office:annotation>'+paragraphs+'<text:script>globalThis.__unsafeDocumentImport=true;</text:script>')));
assert.equal(globalThis.__unsafeDocumentImport,undefined);
const odtLists=odtXml('<text:list-style style:name="Numeradas"><text:list-level-style-number text:level="1" style:num-format="1"/></text:list-style><text:list text:style-name="Numeradas"><text:list-item><text:p>Pregunta de lista</text:p><text:list><text:list-item><text:p>Sí</text:p></text:list-item><text:list-item><text:p>No</text:p></text:list-item></text:list></text:list-item></text:list>');
const listDoc=await extractFile(odt(odtLists),'listas.odt'),listTest=proposeTests(listDoc.text,listDoc.embedded,'listas.odt')[0];
assert.equal(listTest.questions.length,1);assert.equal(listTest.questions[0].text,'Pregunta de lista');assert.deepEqual(listTest.questions[0].options.map(o=>o.label),['Sí','No']);
const entityDoc=await extractFile(odt(odtXml('<text:p>1. ¿A &amp; B &lt; C?</text:p><text:p>a) Sí</text:p><text:p>b) No</text:p><text:p>Clave: A</text:p>')),'entidades.odt');
assert.equal(proposeTests(entityDoc.text,entityDoc.embedded,'entidades.odt')[0].questions[0].text,'¿A & B < C?');

for(const extension of ['txt','md','rtf','odt','html','htm'])await assert.rejects(extractFile(Buffer.alloc(0),'vacio.'+extension),/vacío/);
for(const [name,bytes,pattern] of [
 ['vacio.txt',' \r\n\t',/no contiene texto/],['vacio.md','#   \n```\n```',/no contiene texto/],['vacio.html','<html><body><script>globalThis.__unsafeDocumentImport=true;</script></body></html>',/no contiene texto/],['vacio.rtf','{\\rtf1\\ansi}',/no contiene texto/],['vacio.odt',odt(odtXml('<text:p> </text:p>')),/no contiene texto/],
 ['binario.txt',Buffer.from([0,1,2,3,4]),/texto legible/],['documento.doc','old binary',/Word antiguo/],['documento.exe','unsupported',/Formato no compatible/],['falso.html','No es HTML',/HTML reconocible/],
 ['falso.rtf','1. Esto no es RTF',/RTF válido/],['cortado.rtf','{\\rtf1 1. Pregunta',/incompleto/],['grupo.rtf','{\\rtf1 Pregunta}}',/incompleto/],['hex-corrupto.rtf',"{\\rtf1 \\'zz}",/carácter codificado/],['bin-corrupto.rtf','{\\rtf1 \\bin999 abc}',/datos incompletos/],['anidado.rtf','{\\rtf1 '+('{'.repeat(102))+'texto'+('}'.repeat(103)),/niveles/],
 ['utf8-corrupto.rtf',"{\\rtf1\\ansi\\ansicpg65001 \\'c3}",/codificación no válida/],['contenido-fuera.rtf','{\\rtf1 1. Pregunta}2. Contenido fuera del documento',/fuera del documento/],
 ['falso.odt',Buffer.from('PK\x03\x04no-es-zip'),/estructura/],['sin-content.odt',zip([['mimetype','application/vnd.oasis.opendocument.text',0]]),/estructura/],['tipo-erroneo.odt',odt(odtXml(paragraphs),'application/vnd.oasis.opendocument.spreadsheet'),/OpenDocument/],['sin-texto.odt',odt('<root/>'),/contenido de texto/],['duplicado.odt',zip([['mimetype','application/vnd.oasis.opendocument.text',0],['content.xml',odtXml(paragraphs)],['content.xml',odtXml(paragraphs)]]),/estructura/],
 ['entidad-externa.odt',odt('<!DOCTYPE office:document-content [<!ENTITY xxe SYSTEM "file:///never-read">]>'+odtXml('<text:p>&xxe;</text:p>')),/XML no admitidas/],
 ['grande.txt',Buffer.alloc(10_000_001,0x61),/10 MB/],['demasiado-texto.txt','a'.repeat(1_000_001),/demasiado texto/],
])await assert.rejects(extractFile(Buffer.isBuffer(bytes)?bytes:Buffer.from(bytes),name),pattern,name);
const expandedBomb=odt(odtXml(paragraphs)),directory=expandedBomb.readUInt32LE(expandedBomb.length-6);expandedBomb.writeUInt32LE(50_000_001,directory+24);
await assert.rejects(extractFile(expandedBomb,'expansion.odt'),/descomprimido excede/);
const encrypted=odt(odtXml(paragraphs)),encryptedDirectory=encrypted.readUInt32LE(encrypted.length-6);encrypted.writeUInt16LE(1,encryptedDirectory+8);
await assert.rejects(extractFile(encrypted,'cifrado.odt'),/cifrado/);
await assert.rejects(extractFile(odt(odtXml(paragraphs)).subarray(0,-3),'truncado.odt'),/estructura/);
const badCrc=odt(odtXml(paragraphs)),crcDirectory=badCrc.readUInt32LE(badCrc.length-6),wrongCrc=(badCrc.readUInt32LE(crcDirectory+16)^1)>>>0;
badCrc.writeUInt32LE(wrongCrc,crcDirectory+16);badCrc.writeUInt32LE(wrongCrc,14);
await assert.rejects(extractFile(badCrc,'crc-corrupto.odt'),/estructura/,'Stored ZIP entries must verify their actual CRC even if both headers agree');
const badName=odt(odtXml(paragraphs));badName[30]=0x78;
await assert.rejects(extractFile(badName,'nombre-local-corrupto.odt'),/estructura/);
const badMethod=odt(odtXml(paragraphs));badMethod.writeUInt16LE(8,8);
await assert.rejects(extractFile(badMethod,'metodo-local-corrupto.odt'),/estructura/);
assert.throws(()=>proposeTests(Array.from({length:501},(_,i)=>(i+1)+'. Pregunta '+i).join('\n'),[],'limite.txt'),/500 preguntas/);
console.log('PASS TXT/MD/RTF/ODT/HTML: real encodings, questions/options/keys, ZIP/XML, fields, static script data, no execution, corrupt and empty files, expansion and text limits.');
if(process.argv[2]){const name=process.argv[2];const r=await extractFile(readFileSync(name),name),test=proposeTests(r.text,r.embedded,name)[0];assert.equal(test.questions.length,53);assert.equal(test.questions.filter(q=>q.type==='likert').length,38);assert.equal(test.questions.filter(q=>q.type==='multiple').length,5);assert(test.questions.filter(q=>q.type==='multiple').every(q=>q.maxSelections===3));console.log('DOCX suministrado: 53 campos, 38 escalas, 5 selecciones múltiples; OK.');}
console.log('Listas anidadas, opciones, tablas, escalas, HTML seguro y separación de notas: OK.');
