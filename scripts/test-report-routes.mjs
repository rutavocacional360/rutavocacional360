import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdirSync,mkdtempSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createRequire} from 'node:module';
import {completeAssessment} from './assessment-fixtures.mjs';
import {getDocument} from 'pdfjs-dist/legacy/build/pdf.mjs';

// Only synthetic students and SQLite; no production database or AI provider is contacted.
mkdirSync('.qa-tools',{recursive:true});
const folder=mkdtempSync(resolve('.qa-tools','report-routes-'));
process.env.DB_DRIVER='sqlite';process.env.DATABASE_PATH=resolve(folder,'reports.sqlite');process.env.ACADEMIC_CONTENT_PATH=resolve(folder,'academic.json');
process.env.GEMINI_API_KEY='';process.env.GUIDANCE_AI_ENABLED='false';
const outfile=resolve(folder,'reports.cjs');
await build({stdin:{contents:`
 export {db,put,document} from './lib/server/store';
 export {currentAssessments} from './lib/server/battery';
 export {ensureGuidance} from './lib/server/guidance';
 export {testPdf} from './lib/server/test-results';
 export {createIntegralReport,readIntegralReport,listIntegralReports} from './lib/server/integral-reports';
 export {professionalReport} from './components/kit/lib/professional-report';
 export {integralReportPdf,downloadReport} from './components/kit/lib/reports';
 export {getSession} from './components/kit/lib/session';
 export {calculateTest} from './components/kit/lib/test-engine';
`,resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'cjs',packages:'external',outfile,
 plugins:[{name:'server-marker',setup(b){b.onResolve({filter:/^server-only$/},()=>({path:'server-only',namespace:'empty'}));b.onLoad({filter:/.*/,namespace:'empty'},()=>({contents:''}));}}]});
const api=createRequire(import.meta.url)(outfile),{db,put,currentAssessments,ensureGuidance,testPdf,createIntegralReport,readIntegralReport,listIntegralReports,professionalReport,integralReportPdf,calculateTest}=api;
const student={id:'pdf-student',name:'Estudiante PDF QA',role:'student',institutionId:'pdf-org',group:'A'};
const admin={id:'pdf-admin',name:'Administrador PDF QA',role:'admin',institutionId:student.institutionId};
const peer={id:'pdf-peer',name:'Otra cuenta QA',role:'student',institutionId:student.institutionId,group:'A'};
const otherAdmin={...admin,id:'other-admin',institutionId:'other-org'};
const textOf=async(bytes)=>{const task=getDocument({data:new Uint8Array(bytes).slice(),useSystemFonts:true,isEvalSupported:false});const pdf=await task.promise;let text='';for(let p=1;p<=pdf.numPages;p++){const page=await pdf.getPage(p);const content=await page.getTextContent();text+=content.items.map(item=>item.str||'').join(' ')+'\n';}await task.destroy();return text;};
const linksOf=async(bytes)=>{const task=getDocument({data:new Uint8Array(bytes).slice(),useSystemFonts:true,isEvalSupported:false});const pdf=await task.promise;const urls=[];for(let page=1;page<=pdf.numPages;page++)for(const annotation of await (await pdf.getPage(page)).getAnnotations())if(annotation.url)urls.push(annotation.url);await task.destroy();return urls;};
const assertPreparationContext=async(pdf,options,groups=[])=>{const task=getDocument({data:new Uint8Array(pdf.output('arraybuffer')).slice(),useSystemFonts:true,isEvalSupported:false});const doc=await task.promise,pages=[];for(let number=1;number<=doc.numPages;number++){const page=await doc.getPage(number),content=await page.getTextContent(),text=content.items.map(item=>item.str||'').join(' ');pages.push(text);for(const annotation of await page.getAnnotations()){if(!annotation.url?.includes('/mi-ruta/cursos?'))continue;const id=new URL(annotation.url).searchParams.get('carrera'),option=options.find(option=>option.id===id);if(option)assert(text.includes(option.name),'Autopreparation link stays on the same page as '+option.name);}}for(const group of groups)assert(pages.some(text=>text.includes(group.title)&&text.includes(group.first)),'The group heading and first option stay together: '+group.title);await task.destroy();};
const pdfText=async(pdf,filename)=>{const bytes=pdf.output('arraybuffer');writeFileSync(resolve(folder,filename),new Uint8Array(bytes));return textOf(bytes);};
const sectionText=report=>report.sections.flatMap(section=>[section.title,...section.lines]).join('\n');
const career=(id,name)=>({id:'link-'+id,careerId:id,careerName:name,dimensionId:'R',min:1,max:5,reason:'Criterio orientativo QA',source:'Fuente declarada QA',offers:[{institution:'UNIVERSITY_OFFER_QA',title:'Oferta QA',location:'Sede QA',modality:'Presencial'}]});
const makeFixture=(id,educationLevel)=>({id,educationLevel,title:'Resultado individual QA '+id,version:'1',description:'Fixture PDF',scoring:'dimensions',aggregation:'sum',source:'Cuestionario sintético QA',options:[{value:1,label:'Bajo interés QA'},{value:5,label:'Interés alto QA'}],dimensions:[{id:'R',name:'Interés práctico QA'}],questions:[
 {id:'pick',text:'Respuesta con escala completa QA',type:'single',dimension:'R'},
 {id:'short',text:'Respuesta breve completa QA',type:'short',policy:'none'},
 {id:'number',text:'Respuesta numérica completa QA',type:'number',min:0,max:100,policy:'none'},
 {id:'matrix',text:'Respuesta matriz completa QA',type:'matrix',policy:'none',rows:[{id:'row',label:'Fila completa QA'}]},
 {id:'hidden',text:'HIDDEN_QUESTION_QA',type:'short',policy:'none',required:false,visibleWhen:{questionId:'pick',operator:'equals',value:1}},
 ],careerLinks:[career('bachillerato:informatica','SCHOOL_FIGURE_QA'),career('uni-qa','CAREER_UNIVERSITY_QA')]});
const fixtureAnswers={pick:5,short:'RESPUESTA_BREVE_QA',number:37,matrix:{row:5}};
async function insertFixture(id,educationLevel,{saved=true,publication='immediate'}={}){const test={...makeFixture(id,educationLevel),resultPublication:publication};const result=calculateTest(test,fixtureAnswers);const at='2026-10-02T18:00:00Z';await db.prepare('INSERT INTO submissions VALUES(?,?,?,?,?,?,?,?)').run(id,student.id,id,test.version,JSON.stringify(fixtureAnswers),JSON.stringify(result.scores),JSON.stringify(test),at);if(saved)await db.prepare('INSERT INTO assessment_results VALUES(?,?,?,?,?,?)').run(id,1,JSON.stringify(result),'{}',null,at);return {test,result};}
try{
 await db.migrate();await db.prepare('INSERT INTO institutions VALUES(?,?,?)').run(student.institutionId,'Institución PDF QA','PDF');
 for(const u of [student,admin,peer])await db.prepare('INSERT INTO users VALUES(?,?,?,?,?,?,?,?)').run(u.id,u.name,u.id+'@example.test','unused',u.role,u.institutionId,u.group||'','Activo');
 await put(student.id,'rv360:profile',{stage:'Estoy eligiendo mi bachillerato',baccalaureate:'por-definir'});
 const schoolTests=await currentAssessments(student),schoolAttempts=[];
 schoolAttempts.push(await completeAssessment({db,calculateTest,userId:student.id,instrument:schoolTests[0]}));
 await assert.rejects(createIntegralReport(student,schoolAttempts.map(a=>a.id),false),e=>e.status===409,'Integral orientation needs the whole current-route battery');
 // A per-test PDF remains accessible before the rest of the battery is complete.
 const firstPdf=await testPdf(student,schoolAttempts[0].id);assert.match(await textOf(firstPdf),/RESULTADOS DE BACHILLERATO/);
 for(const test of schoolTests.slice(1))schoolAttempts.push(await completeAssessment({db,calculateTest,userId:student.id,instrument:test}));
 const schoolReport=await ensureGuidance(student);assert.equal(schoolReport.educationLevel,'bachillerato');assert(!schoolReport.partial);
 const schoolIntegral=await createIntegralReport(student,schoolAttempts.map(a=>a.id),false);assert.equal(schoolIntegral.educationLevel,'bachillerato');
 assert.match(sectionText(schoolIntegral),/Modalidad de Bachillerato recomendada/);assert.doesNotMatch(sectionText(schoolIntegral),/promedio 25\.00/,'Sum scores cannot be presented as means');assert.match(sectionText(schoolIntegral),/Bachillerato en Ciencias/);assert.doesNotMatch(sectionText(schoolIntegral),/Carreras universitarias|Conexión universitaria|Carreras sugeridas y razones/);
 await assert.rejects(createIntegralReport(student,[schoolAttempts[0].id],false),e=>e.status===409,'A selected subset cannot masquerade as an integral report');
 const interestAttempt=schoolAttempts.find(attempt=>attempt.test.id==='intereses');
 const revisedAnswers=Object.fromEntries(interestAttempt.test.questions.map(q=>[q.id,q.dimension==='R'?5:2]));
 const revisedResult=calculateTest(interestAttempt.test,revisedAnswers);
 await db.prepare('INSERT INTO assessment_results VALUES(?,?,?,?,?,?)').run(interestAttempt.id,2,JSON.stringify(revisedResult),'{}',null,'2026-10-02T18:10:00Z');
 const reviewedIntegral=await createIntegralReport(student,schoolAttempts.map(a=>a.id),false);
 assert.match(sectionText(reviewedIntegral),/Realista: suma 25/,'Integral scores use the latest reviewed result instead of the original submission scores');
 assert.match(sectionText(reviewedIntegral),/Bachillerato Técnico/);
 assert.match(sectionText(await readIntegralReport(student,schoolIntegral.id)),/Bachillerato en Ciencias/,'A saved historical copy is immutable after a reviewed result');

 await assert.rejects(readIntegralReport(peer,schoolIntegral.id),e=>e.status===404);await assert.rejects(readIntegralReport(admin,schoolIntegral.id),e=>e.status===404,'Private reports remain private');
 const shared=await createIntegralReport(student,schoolAttempts.map(a=>a.id),true);assert.equal((await readIntegralReport(admin,shared.id)).id,shared.id);await assert.rejects(readIntegralReport(otherAdmin,shared.id),e=>e.status===404);
 const counselor={id:'counselor',role:'orientador',institutionId:student.institutionId,group:'A'};assert.equal((await readIntegralReport(counselor,shared.id)).id,shared.id);await assert.rejects(readIntegralReport({...counselor,group:'B'},shared.id),e=>e.status===404);
 assert.equal((await listIntegralReports(admin)).length,1);assert.equal((await listIntegralReports(peer)).length,0);
 const poisonedSchool=structuredClone(schoolReport);poisonedSchool.analysis.summary='Universidad y educación superior LEGACY_SUMMARY_QA';poisonedSchool.analysis.recommendations=[{careerId:'uni-qa',reason:'UNIVERSITY_REASON_QA'}];poisonedSchool.catalog=[{id:'uni-qa',name:'CAREER_UNIVERSITY_QA'}];poisonedSchool.instruments.push({id:'other-route',instrumentId:'other-route',version:'1',createdAt:schoolReport.createdAt,instrument:{...makeFixture('other-route','universidad'),title:'OTHER_ROUTE_TEST_QA'},answers:fixtureAnswers,scores:[]});
 if(poisonedSchool.analysis.pathway.technical[0])poisonedSchool.analysis.pathway.technical[0].careers=[{id:'uni-qa',name:'CAREER_UNIVERSITY_QA'}];
 const schoolText=await pdfText(await professionalReport(poisonedSchool),'school-professional.pdf');assert.match(schoolText,/ORIENTACIÓN DE BACHILLERATO/);assert.match(schoolText,/Respuestas guardadas/);assert.match(schoolText,/Bachillerato en Ciencias/);assert.doesNotMatch(schoolText,/ORIENTACIÓN UNIVERSITARIA|OTHER_ROUTE_TEST_QA|CAREER_UNIVERSITY_QA|UNIVERSITY_REASON_QA|LEGACY_SUMMARY_QA|Conexión universitaria/);for(const test of schoolTests)assert(schoolText.includes(test.questions[0].text),'All current assessment answers are included');
 const schoolLinks=await linksOf((await professionalReport(schoolReport)).output('arraybuffer'));
 const schoolTargets=schoolLinks.filter(url=>url.includes('/mi-ruta/cursos?')).map(url=>new URL(url).searchParams.get('carrera'));
 assert(schoolTargets.length>0,'The PDF links each related option to autopreparation');assert(schoolTargets.every(id=>id.startsWith('bachillerato:')),'School PDF links never point to university careers');
 for(const option of [...schoolReport.analysis.pathway.science,...schoolReport.analysis.pathway.technical])assert(schoolTargets.includes('bachillerato:'+option.id),'Specific school option has a course link with the persisted target id');
 const firstQuestion=schoolTests[0].questions[0].text;assert.equal(schoolText.split(firstQuestion).length-1,1,'Each saved answer is printed once');assert.doesNotMatch(schoolText,/Completa (?:y entrega )?(?:tus )?Intereses|Completa tus tests pendientes/i,'Completed PDFs never request completed tests again');
 const emptySchool=structuredClone(schoolReport);emptySchool.analysis.pathway={...emptySchool.analysis.pathway,suggested:'pendiente',science:[],technical:[],reason:'Completa y entrega Intereses vocacionales para comparar Ciencias y Técnico.'};emptySchool.analysis.highlightedDimensions=[];
 const emptyText=await pdfText(await professionalReport(emptySchool),'school-complete-unprioritized.pdf');assert.match(emptyText,/Tus tests están completos/);assert.doesNotMatch(emptyText,/Completa (?:y entrega )?Intereses/);assert.equal((await linksOf((await professionalReport(emptySchool)).output('arraybuffer'))).filter(url=>url.includes('/mi-ruta/cursos?')).length,0,'Unprioritized evidence does not invent preparation recommendations');
 const partialSchool=structuredClone(schoolReport);partialSchool.partial=true;partialSchool.progress={submitted:2,total:3};partialSchool.readiness.bachillerato.ready=false;partialSchool.instruments=partialSchool.instruments.slice(0,2);
 const partialText=await pdfText(await professionalReport(partialSchool),'school-partial.pdf');assert.match(partialText,/Resultados parciales/);assert.match(partialText,/Resultado en preparación/);assert.equal((await linksOf((await professionalReport(partialSchool)).output('arraybuffer'))).filter(url=>url.includes('/mi-ruta/cursos?')).length,0,'Partial reports do not open preparation before prerequisites');
 const aiSchool=structuredClone(schoolReport);aiSchool.contentSource='gemini';aiSchool.model='gemini-synthetic-qa';aiSchool.ai={status:'available'};aiSchool.analysis.summary=aiSchool.analysis.pathway.reason+' AI_SUMMARY_QA: contrasta actividades y contenidos.';
 aiSchool.analysis.limitations.push('La IA interpreta puntuaciones agregadas.');
 const aiSchoolText=await pdfText(await professionalReport(aiSchool),'school-ai.pdf');assert.doesNotMatch(aiSchoolText,/\bIA\b|gemini|inteligencia artificial/i);assert.match(aiSchoolText,/AI_SUMMARY_QA/,'The complete explanation remains in the PDF even if it expands the modality reason');
 const failedSchool=structuredClone(schoolReport);failedSchool.ai={status:'error',error:{message:'INTERNAL_PROVIDER_ERROR_QA: revisa la credencial del servidor'}};
 const failedSchoolText=await pdfText(await professionalReport(failedSchool),'school-fallback.pdf');assert.doesNotMatch(failedSchoolText,/\bIA\b|INTERNAL_PROVIDER_ERROR_QA|credencial|servidor/i);assert.match(failedSchoolText,/Tus próximos pasos/);assert.match(failedSchoolText,/Bachillerato en Ciencias/);
 const historicalSchool={...structuredClone(schoolReport),historical:true};const historicalSchoolPdf=await professionalReport(historicalSchool);const historicalSchoolText=await pdfText(historicalSchoolPdf,'school-historical.pdf');assert.match(historicalSchoolText,/Informe histórico completo/);const historicalSchoolLinks=await linksOf(historicalSchoolPdf.output('arraybuffer'));assert.equal(historicalSchoolLinks.filter(url=>url.includes('/mi-ruta/cursos?')).length,0);assert(historicalSchoolLinks.includes('https://rutavocacional360.com/mi-ruta/resultados'),'Historical PDFs direct readers to the current orientation');
 const technicalReport=structuredClone(schoolReport);technicalReport.analysis.pathway.suggested='tecnico';technicalReport.analysis.pathway.reason='Tus respuestas priorizan actividades técnicas.';
 const technicalText=await pdfText(await professionalReport(technicalReport),'school-technical.pdf');assert(technicalText.indexOf('Figuras de Bachillerato Técnico relacionadas')<technicalText.indexOf('Áreas de Ciencias relacionadas'),'Technical affinity places technical figures first');
 const displayReport=structuredClone(schoolReport),displayInterest=displayReport.instruments.find(item=>item.instrumentId==='intereses');displayInterest.scores.find(score=>score.dimension==='R').displayRaw=24;
 const displayText=await pdfText(await professionalReport(displayReport),'school-reviewed-display.pdf');assert.match(displayText,/Realista: 24 \/ 25/,'Reviewed scores use canonical displayRaw instead of a stale historical raw sum');
 // A complete C/I profile must produce concrete school options and matching preparation, not an empty pending block.
 const ciAnswers=Object.fromEntries(interestAttempt.test.questions.map(q=>[q.id,q.dimension==='C'?5:q.dimension==='I'?4:1]));
 const ciResult=calculateTest(interestAttempt.test,ciAnswers),ciAt=new Date(Date.now()+1000).toISOString();
 await db.prepare('INSERT INTO submissions VALUES(?,?,?,?,?,?,?,?)').run('school-ci-attempt',student.id,interestAttempt.test.id,interestAttempt.test.version,JSON.stringify(ciAnswers),JSON.stringify(ciResult.scores),JSON.stringify(interestAttempt.test),ciAt);
 await db.prepare('INSERT INTO assessment_results VALUES(?,?,?,?,?,?)').run('school-ci-attempt',1,JSON.stringify(ciResult),'{}',null,ciAt);
 const ciReport=await ensureGuidance(student);assert(!ciReport.partial);assert(ciReport.analysis.pathway.science.length+ciReport.analysis.pathway.technical.length>0);assert(ciReport.analysis.pathway.technical.length<=8);
 const ciPdf=await professionalReport(ciReport),ciText=await pdfText(ciPdf,'school-ci-profile.pdf');assert.match(ciText,/Gestión financiera y contable/);assert.doesNotMatch(ciText,/Completa (?:y entrega )?Intereses/);assert((await linksOf(ciPdf.output('arraybuffer'))).some(url=>new URL(url).searchParams.get('carrera')==='bachillerato:contabilidad'));
 const schoolOptionNames=[...schoolReport.analysis.pathway.science,...schoolReport.analysis.pathway.technical].map(option=>({id:'bachillerato:'+option.id,name:option.name}));
 await assertPreparationContext(await professionalReport(schoolReport),schoolOptionNames);await assertPreparationContext(await professionalReport(technicalReport),schoolOptionNames,[{title:'Figuras de Bachillerato Técnico relacionadas',first:technicalReport.analysis.pathway.technical[0].name},{title:'Áreas de Ciencias relacionadas',first:technicalReport.analysis.pathway.science[0].name}]);await assertPreparationContext(ciPdf,[...ciReport.analysis.pathway.science,...ciReport.analysis.pathway.technical].map(option=>({id:'bachillerato:'+option.id,name:option.name})));
 const reviewedCustom=structuredClone(schoolReport);reviewedCustom.instruments.push({id:'custom-reviewed-sum',instrumentId:'custom-reviewed-sum',version:'1',createdAt:schoolReport.createdAt,instrument:{...makeFixture('custom-reviewed-sum','bachillerato'),title:'Custom score review QA'},answers:fixtureAnswers,scores:[{dimension:'R',raw:2,value:4.8,displayRaw:4.8,min:1,max:5}]});
 const reviewedCustomText=await pdfText(await professionalReport(reviewedCustom),'school-reviewed-custom-sum.pdf');assert.match(reviewedCustomText,/Interés práctico QA: 4\.8 \u00b7 suma/,'Custom sum PDF also uses the authoritative reviewed value instead of the historical raw sum');
 const integralSchoolText=await pdfText(integralReportPdf(schoolIntegral),'school-integral.pdf');assert.match(integralSchoolText,/Informe integral de Bachillerato/);assert.match(integralSchoolText,/Modalidad de Bachillerato recomendada/);assert.doesNotMatch(integralSchoolText,/Carreras universitarias|Carreras sugeridas y razones/);
 await insertFixture('individual-school','bachillerato');const individualSchool=await textOf(await testPdf(student,'individual-school'));assert.match(individualSchool,/SCHOOL_FIGURE_QA/);assert.doesNotMatch(individualSchool,/CAREER_UNIVERSITY_QA|UNIVERSITY_OFFER_QA|HIDDEN_QUESTION_QA/);assert.match(individualSchool,/RESPUESTA_BREVE_QA/);assert.match(individualSchool,/Fila completa QA: Interés alto QA/);assert.match(individualSchool,/37/);assert.match(individualSchool,/educacion.gob.ec/);
 assert.match(await textOf(await testPdf({...admin,role:'orientador',group:'A'},'individual-school')),/RESULTADOS DE BACHILLERATO/);await assert.rejects(testPdf({...admin,role:'orientador',group:'B'},'individual-school'),e=>e.status===403);
 await assert.rejects(testPdf(peer,'individual-school'),e=>e.status===403);await assert.rejects(testPdf(otherAdmin,'individual-school'),e=>e.status===403);assert.match(await textOf(await testPdf(admin,'individual-school')),/RESULTADOS DE BACHILLERATO/);
 await insertFixture('withheld-school','bachillerato',{publication:'review'});await assert.rejects(testPdf(student,'withheld-school'),e=>e.status===403);assert.match(await textOf(await testPdf(admin,'withheld-school')),/RESULTADOS DE BACHILLERATO/);
 await insertFixture('legacy-school','ambos',{saved:false});await put(student.id,'rv360:assessment-route-origins',{'legacy-school':'bachillerato'});
 await put(student.id,'rv360:profile',{stage:'Me gradué del colegio',baccalaureate:'tecnico'});
 const legacyPdf=await testPdf(student,'legacy-school');writeFileSync(resolve(folder,'legacy-individual-school.pdf'),new Uint8Array(legacyPdf));const legacyText=await textOf(legacyPdf);assert.match(legacyText,/RESULTADOS DE BACHILLERATO/);assert.match(legacyText,/SCHOOL_FIGURE_QA/);assert.doesNotMatch(legacyText,/CAREER_UNIVERSITY_QA|UNIVERSITY_OFFER_QA/);assert.equal(await db.prepare('SELECT submission_id FROM assessment_results WHERE submission_id=?').get('legacy-school'),undefined,'Historical PDF reconstruction does not rewrite saved results');
 await assert.rejects(createIntegralReport(student,schoolAttempts.map(a=>a.id),false),e=>e.status===409,'Graduation does not relabel school history as university evidence');
 const universityAttempts=[];for(const test of await currentAssessments(student))universityAttempts.push(await completeAssessment({db,calculateTest,userId:student.id,instrument:test}));
 await assert.rejects(createIntegralReport(student,[schoolAttempts[0].id,...universityAttempts.slice(1).map(a=>a.id)],false),e=>e.status===409,'Mixed routes cannot be selected together');
 const universityReport=await ensureGuidance(student),universityIntegral=await createIntegralReport(student,universityAttempts.map(a=>a.id),false);assert.equal(universityIntegral.educationLevel,'universidad');assert.equal(universityReport.analysis.pathway,undefined);assert(!universityReport.mappingVersion.includes('bachillerato'),'University mapping provenance cannot use the school catalog');assert.match(sectionText(universityIntegral),/Carreras universitarias relacionadas/);assert.doesNotMatch(sectionText(universityIntegral),/Modalidad de Bachillerato recomendada|Ciencias: áreas|Técnico: figuras/);
 const universityText=await pdfText(await professionalReport(universityReport),'university-professional.pdf');assert.match(universityText,/ORIENTACIÓN UNIVERSITARIA/);assert.doesNotMatch(universityText,/ORIENTACIÓN DE BACHILLERATO|figuras profesionales para explorar|Tu perfil de bachillerato/);for(const recommendation of universityReport.analysis.recommendations)assert(universityText.includes(universityReport.catalog.find(c=>c.id===recommendation.careerId).name));
 const universityLinks=await linksOf((await professionalReport(universityReport)).output('arraybuffer'));
 const universityTargets=universityLinks.filter(url=>url.includes('/mi-ruta/cursos?')).map(url=>new URL(url).searchParams.get('carrera'));
 assert(universityTargets.every(id=>!id.startsWith('bachillerato:')));for(const rec of universityReport.analysis.recommendations)assert(universityTargets.includes(rec.careerId),'University options link to their matching preparation');
 assert.equal(universityText.split(universityAttempts[0].test.questions[0].text).length-1,1,'University answers are also printed once');
 const historicalUniversity=await professionalReport({...structuredClone(universityReport),historical:true});assert.equal((await linksOf(historicalUniversity.output('arraybuffer'))).filter(url=>url.includes('/mi-ruta/cursos?')).length,0,'Historical university reports also require the current orientation before preparation');
 await assertPreparationContext(await professionalReport(universityReport),universityReport.catalog.map(career=>({id:career.id,name:career.name})));
 const universityIntegralText=await pdfText(integralReportPdf(universityIntegral),'university-integral.pdf');assert.match(universityIntegralText,/Informe integral de Universidad/);assert.doesNotMatch(universityIntegralText,/Modalidad de Bachillerato recomendada|Técnico: figuras/);
 await insertFixture('individual-university','universidad');const individualUniversity=await textOf(await testPdf(student,'individual-university'));assert.match(individualUniversity,/RESULTADOS DE UNIVERSIDAD/);assert.match(individualUniversity,/CAREER_UNIVERSITY_QA/);assert.match(individualUniversity,/UNIVERSITY_OFFER_QA/);assert.doesNotMatch(individualUniversity,/SCHOOL_FIGURE_QA/);
 const session=api.getSession();session.user=student;session.values={'rv360:profile':{stage:'Me gradué del colegio'},'rv360:assessment-route-origins':{'legacy-school':'bachillerato'}};
 const legacyRow=await db.prepare('SELECT * FROM submissions WHERE id=?').get('legacy-school'),uniRow=await db.prepare('SELECT * FROM submissions WHERE id=?').get('individual-university');await assert.rejects(api.downloadReport([legacyRow,uniRow]),/por separado/);
 assert.equal((await readIntegralReport(student,schoolIntegral.id)).educationLevel,'bachillerato','School history remains school after graduation');
 // All single-result download buttons use the protected server PDF, including legacy results viewed by an admin.
 const originalFetch=globalThis.fetch,originalDocument=globalThis.document,originalCreateUrl=URL.createObjectURL,originalRevokeUrl=URL.revokeObjectURL;
 const requests=[],links=[];let downloadedBlob;
 try{
  session.user=admin;session.values={};
  globalThis.fetch=async(path,options)=>{requests.push({path,options});return new Response(legacyPdf,{headers:{'content-type':'application/pdf'}});};
  globalThis.document={createElement:tag=>{assert.equal(tag,'a');const link={click(){links.push({href:this.href,download:this.download});}};return link;}};
  URL.createObjectURL=blob=>{downloadedBlob=blob;return 'blob:pdf-route-test';};URL.revokeObjectURL=()=>{};
  await api.downloadReport([legacyRow]);assert.equal(requests[0].path,'/api/assessments/pdf?id=legacy-school');assert.equal(requests[0].options.cache,'no-store');assert.equal(links.length,1);assert.equal(links[0].download,'entrega-legacy-s.pdf');assert.match(await textOf(await downloadedBlob.arrayBuffer()),/RESULTADOS DE BACHILLERATO/);
  globalThis.fetch=async()=>new Response(JSON.stringify({error:'El resultado aún no está publicado.'}),{status:403,headers:{'content-type':'application/json'}});
  await assert.rejects(api.downloadReport([legacyRow]),/aún no está publicado/);assert.equal(links.length,1,'A forbidden result cannot create a download');
  globalThis.fetch=async()=>new Response('<html>unavailable</html>',{headers:{'content-type':'text/html'}});
  await assert.rejects(api.downloadReport([legacyRow]),/informe PDF/);assert.equal(links.length,1);
 }finally{globalThis.fetch=originalFetch;globalThis.document=originalDocument;URL.createObjectURL=originalCreateUrl;URL.revokeObjectURL=originalRevokeUrl;}

 console.log('PASS report routes: professional, individual and integral PDFs; complete answers; legacy route inference; withheld results; no mixed-route orientation; graduation and authorized private/shared history.');
 console.log('PDF visual fixtures: '+folder);
}finally{await db.close();}
