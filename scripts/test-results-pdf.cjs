const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const {build} = require('esbuild');
let playwright;
try { playwright = require('playwright'); }
catch { playwright = require('../.qa-tools/node_modules/playwright'); }

// Exercise the report generator and viewer together. Only the signed-in session
// is substituted; all report UI, PDF generation, and rendering are production code.
const profile = {stage:'Estoy en 10.º de EGB y pasaré a 1.º de BGU',baccalaureate:'ciencias',specialty:'',learningPreference:'investigar'};
const questions = Array.from({length:16}, (_, index) => ({id:'question-'+index,type:'open',text:'Experiencia escolar '+(index+1)+': ¿qué actividades te gustaría explorar?',required:true}));
const report = {
  id:'pdf-preview-results-qa',version:1,createdAt:'2026-10-03T12:00:00Z',
  student:{id:'preview-student',name:'Estudiante de prueba'},profile,educationLevel:'bachillerato',partial:false,
  progress:{submitted:1,total:1},readiness:{bachillerato:{ready:true,total:1,completed:1,pending:[]}},
  rulesVersion:'qa-1',mappingVersion:'qa-1',catalog:[],offers:{},
  instruments:[{id:'qa-submission',instrumentId:'school-experiences',version:'1',createdAt:'2026-10-03T12:00:00Z',
    instrument:{id:'school-experiences',version:'1',title:'Mis experiencias escolares',educationLevel:'bachillerato',questions,options:[],dimensions:[]},
    answers:Object.fromEntries(questions.map((question,index) => [question.id,'Respuesta guardada '+(index+1)+': Me interesa investigar problemas, experimentar y compartir los resultados de proyectos escolares.'])),scores:[]}],
  analysis:{summary:'Tus respuestas permiten explorar proyectos científicos y comparar las opciones de bachillerato.',highlightedDimensions:['I'],recommendations:[],nextSteps:['Compara asignaturas y proyectos con tu orientador.'],limitations:[],
    pathway:{profile,suggested:'ciencias',reason:'Tus experiencias muestran interés por investigar y explicar cómo funcionan las cosas.',
      science:[{id:'ciencias-exactas',name:'Ciencias experimentales',reason:'Te interesa resolver preguntas mediante experimentos.',subjects:'Biología, química y física.',activity:'Prepara un experimento y registra lo que observas.',evidence:[]}],technical:[],nextSteps:['Compara asignaturas y proyectos con tu orientador.'],notes:[],sources:[]}}
};

async function main() {
  const workerName = 'pdfjs-'+require('pdfjs-dist/package.json').version+'.worker.js';
  const workerPath = path.resolve('public/vendor',workerName);
  assert(fs.existsSync(workerPath),'Generate the PDF worker with node scripts/prepare-browser-assets.mjs before running this test.');
  const result = await build({
    stdin:{contents:`import {createRoot} from 'react-dom/client';import {StrictMode} from 'react';import {GuidanceDocument} from './components/kit/features/student/ResultsDocument';const report=${JSON.stringify(report)};createRoot(document.getElementById('root')).render(<StrictMode><GuidanceDocument report={report}/></StrictMode>);`,resolveDir:process.cwd(),loader:'tsx'},
    bundle:true,write:false,outdir:'out',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},
    plugins:[{name:'results-session-fixture',setup(builder){
      builder.onResolve({filter:/\/lib\/session$/},()=>({path:'session',namespace:'results-fixture'}));
      builder.onLoad({filter:/.*/,namespace:'results-fixture'},()=>({contents:`export function useSession(){return {ready:true,user:{id:'preview-student',role:'student'},values:{'rv360:profile':${JSON.stringify(profile)}}};}export async function previewAction(){return {items:[]};}export async function refreshSession(){}`}));
    }}]
  });
  const workerRequests = [];
  const server = http.createServer((req,res) => {
    const url = new URL(req.url,'http://localhost').pathname;
    res.setHeader('X-Content-Type-Options','nosniff');
    if (url === '/') {
      res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'nonce-results-pdf-qa'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' blob:; worker-src 'self' blob:; object-src 'none'; base-uri 'self'");
      res.setHeader('Content-Type','text/html; charset=utf-8');
      res.end('<!doctype html><html lang="es"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Resultados PDF: prueba local</title><link rel="stylesheet" href="/stdin.css"><style>body{margin:0;padding:16px;background:#f5f6fb;font-family:Arial,sans-serif}.button{display:inline-flex;align-items:center;justify-content:center;padding:10px 16px;border-radius:8px}.button--primary{background:#6c51cf;color:white}.button--secondary{border:1px solid #dce1ec;color:#20304b}</style><div id="root"></div><script nonce="results-pdf-qa" src="/stdin.js"></script></html>');
    } else if (url === '/vendor/'+workerName) {
      workerRequests.push(url);
      res.setHeader('Content-Type','text/javascript');
      res.end(fs.readFileSync(workerPath));
    } else if (url === '/media/brain-book-icon.png') {
      res.setHeader('Content-Type','image/png');
      res.end(fs.readFileSync('public/media/brain-book-icon.png'));
    } else {
      const file = result.outputFiles.find(output => '/'+path.basename(output.path) === url);
      if (file) {
        res.setHeader('Content-Type',url.endsWith('.css')?'text/css':'text/javascript');
        res.end(file.contents);
      } else {res.statusCode=404;res.end('Not found');}
    }
  });
  let browser;
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  try {
    browser = await playwright.chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:process.platform==='win32'?{executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'}:{})});
    const page = await browser.newPage({viewport:{width:1280,height:900},acceptDownloads:true});
    const errors = [];
    page.on('pageerror',error => errors.push(error.message));
    await page.addInitScript(() => {window.__cspViolations=[];document.addEventListener('securitypolicyviolation',event=>window.__cspViolations.push(event.violatedDirective+': '+event.blockedURI));});
    await page.goto('http://127.0.0.1:'+server.address().port);
    await page.getByRole('button',{name:'Informe PDF',exact:true}).click();
    const viewer = page.getByRole('region',{name:'Vista previa de tu informe PDF',exact:true});
    const ready = () => page.waitForFunction(() => {
      const viewport = document.querySelector('.pdf-viewer-viewport');
      const canvas = viewport?.querySelector('canvas');
      if (viewport?.getAttribute('aria-busy')!=='false' || !canvas?.width || getComputedStyle(canvas).visibility!=='visible' || document.querySelector('.pdf-viewer [role="alert"]')) return false;
      const pixels=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
      let ink=0;for(let index=0;index<pixels.length;index+=4)if(pixels[index+3]&&pixels[index]<150)ink++;
      return ink>1000;
    });
    const hasInk = () => viewer.locator('canvas').evaluate(canvas => {
      const pixels=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
      let ink=0;for(let index=0;index<pixels.length;index+=4)if(pixels[index+3]&&pixels[index]<150)ink++;
      return ink>1000;
    });
    await ready();
    assert(await hasInk(),'The first report page contains painted text and graphics.');
    await viewer.locator('.pdf-viewer-text p').filter({hasText:'Estudiante de prueba'}).waitFor({state:'attached'});
    const pageLabel = await viewer.locator('[aria-live="polite"]').innerText();
    const totalPages = Number(pageLabel.match(/de (\d+)/)?.[1]);
    assert(totalPages>1,'The real report contains several pages.');
    await viewer.getByRole('button',{name:'Página siguiente del PDF'}).click();
    await ready();
    assert.equal(await viewer.locator('[aria-live="polite"]').innerText(),'Página 2 de '+totalPages);
    assert(await hasInk(),'The next report page contains rendered content.');
    await viewer.getByRole('button',{name:'Página anterior del PDF'}).click();
    await ready();

    const downloadLink = page.locator('.rd-pdf-actions').getByRole('link',{name:'Descargar PDF',exact:true});
    const openLink = page.getByRole('link',{name:'Abrir e imprimir',exact:true});
    const reportUrl = await downloadLink.getAttribute('href');
    assert.match(reportUrl,/^blob:/,'The viewer and report actions use a generated local PDF.');
    assert.equal(await openLink.getAttribute('href'),reportUrl,'Opening and downloading address the same report.');
    assert.equal(await openLink.getAttribute('target'),'_blank');
    const [download] = await Promise.all([page.waitForEvent('download'),downloadLink.click()]);
    assert.equal(download.suggestedFilename(),'informe-ruta-pdf-prev.pdf');
    const downloaded = fs.readFileSync(await download.path());
    assert.equal(downloaded.subarray(0,5).toString(),'%PDF-');
    assert(downloaded.length>10000,'The downloaded PDF includes the report and logo.');
    const blobBytes = await page.evaluate(async url => Array.from(new Uint8Array(await (await fetch(url)).arrayBuffer())),reportUrl);
    assert.deepEqual(downloaded,Buffer.from(blobBytes),'The downloaded bytes match the PDF offered for opening.');
    const [popup] = await Promise.all([page.waitForEvent('popup'),openLink.click()]);
    await popup.waitForURL(reportUrl);
    await popup.close();

    await page.getByRole('button',{name:'Resultados por test',exact:true}).click();
    await page.getByRole('heading',{name:'Mis experiencias escolares',exact:true}).waitFor();
    assert.equal(await page.locator('.pdf-viewer').count(),0,'Leaving the PDF tab unmounts the viewer.');
    await page.getByRole('button',{name:'Informe PDF',exact:true}).click();
    await ready();
    assert(await hasInk(),'Returning to the PDF tab renders the report again.');
    assert.equal(await downloadLink.getAttribute('href'),reportUrl,'Switching tabs preserves the live PDF blob.');
    assert.equal(await viewer.locator('[aria-live="polite"]').innerText(),'Página 1 de '+totalPages);

    fs.mkdirSync('evidencia/resultados',{recursive:true});
    await page.screenshot({path:'evidencia/resultados/pdf-results-desktop.png',fullPage:true});
    const resize = async width => {
      const previousWidth = await viewer.locator('canvas').evaluate(canvas=>canvas.width);
      await page.setViewportSize({width,height:850});
      await page.waitForFunction(previous=>document.querySelector('.pdf-viewer canvas')?.width!==previous,previousWidth);
      await ready();
    };
    for (const width of [320,390,768]) {
      await resize(width);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'Results PDF fits viewport '+width);
      assert(await hasInk(),'PDF still renders at width '+width);
    }
    await resize(390);
    await page.screenshot({path:'evidencia/resultados/pdf-results-mobile.png',fullPage:true});
    assert(workerRequests.length>0,'The real versioned worker was requested.');
    assert.deepEqual(await page.evaluate(()=>window.__cspViolations),[],'The report works under a nonce-based Content Security Policy.');
    assert.deepEqual(errors,[],'The complete report flow has no browser exceptions.');
    console.log('PASS real ResultsDocument + professionalReport + PdfViewer: '+totalPages+' pages, canvas, pagination, valid PDF download, open same blob, tab remount, desktop/mobile, versioned worker with nosniff, strict CSP, no JS errors');
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}
main().catch(error => {console.error(error);process.exitCode=1;});
