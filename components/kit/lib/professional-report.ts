import {schoolCatalogSource} from '../data/baccalaureate';
import {defaultPreparationLevel} from '../data/school-training';
import {schoolReportSections} from './school-guidance';
import {answerText} from './test-answer-text';
import {visibleQuestions} from './test-engine';
import {versionLabel} from './version';
import {jsPDF} from 'jspdf';
import {dimensions} from '../data/instruments';
const name=(code:string)=>dimensions.find(d=>d.code===code)?.name||code;
export async function professionalReport(r:any){
 const recordedLevels=[...new Set<string>((r.instruments||[]).map((item:any)=>item.instrument?.educationLevel).filter((level:any)=>['bachillerato','universidad'].includes(level)))];
 const educationLevel=r.educationLevel||(recordedLevels.length===1?recordedLevels[0]:defaultPreparationLevel(r.schoolProfile||r.analysis?.pathway?.profile||{}));
 const school=educationLevel==='bachillerato',source=school?schoolCatalogSource:r.catalogSource;
 const items=(r.instruments||[]).filter((item:any)=>!item.instrument?.educationLevel||item.instrument.educationLevel==='ambos'||item.instrument.educationLevel===educationLevel);
 const pdf=new jsPDF({unit:'mm',format:'a4'});let y=40;
 const clean=(s:unknown)=>String(s??'').replace(/[→↗]/g,'>').replace(/[—–]/g,'-').replace(/…/g,'...');
 let logo:string|undefined;try{const response=await fetch('/media/brain-book-icon.png');if(response.ok){const blob=await response.blob();logo=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=reject;reader.readAsDataURL(blob);});}}catch{}
 function header(){pdf.setFillColor(245,246,253);pdf.rect(0,0,210,30,'F');if(logo)pdf.addImage(logo,'PNG',16,6,18,18);pdf.setTextColor(26,42,74);pdf.setFont('helvetica','bold');pdf.setFontSize(13);pdf.text('Ruta Vocacional 360°',logo?39:18,14);pdf.setFont('helvetica','normal');pdf.setFontSize(9);pdf.text(school?'ORIENTACIÓN DE BACHILLERATO':'ORIENTACIÓN UNIVERSITARIA',logo?39:18,21);}
 const space=(height:number)=>{if(y+height>275){pdf.addPage();header();y=40;}};
 const write=(text:unknown,size=10,bold=false)=>{pdf.setFont('helvetica',bold?'bold':'normal');pdf.setFontSize(size);pdf.setTextColor(26,42,74);const lines=pdf.splitTextToSize(clean(text),174);space(Math.max(bold&&size===11?50:0,Math.min(220,lines.length*(size*.48+2)+3)));for(const line of lines){space(size*.48+2);pdf.setFont('helvetica',bold?'bold':'normal');pdf.setFontSize(size);pdf.setTextColor(26,42,74);pdf.text(line,18,y);y+=size*.48+2;}y+=3;};
 const section=(title:string)=>{space(28);y+=5;pdf.setDrawColor(224,227,239);pdf.line(18,y-4,192,y-4);write(title,14,true);};
 header();write('Tu informe de orientación',22,true);write(r.student.name,13,true);write(new Date(r.createdAt).toLocaleString('es-EC')+' · Versión '+r.version,9);write(r.contentSource==='gemini'?'Informe basado en tus respuestas, con análisis de resultados asistido por IA':'Informe basado en tus respuestas, con contenido de orientación local',10);
 if(r.partial)write(`Informe parcial: ${r.progress.submitted} de ${r.progress.total} tests con resultados publicados. Se actualizará al entregar los pendientes.`,10,true);
 if(r.ai?.error?.message)write(r.ai.error.message,9);
 const summary=r.analysis?.summary||'Resumen de resultados guardados.';
 write(school&&/universidad|universitari|educación superior/i.test(summary)?r.analysis?.pathway?.title||'Resumen de tus resultados de Bachillerato.':summary);
 space(24);const count=items.reduce((n:number,s:any)=>n+Object.keys(s.answers).length,0);const stats=[['TESTS',String(items.length)],['RESPUESTAS',String(count)],['OPCIONES',String(school?(r.analysis?.pathway?.suggested==='pendiente'?0:(r.analysis?.pathway?.science?.length||0)+(r.analysis?.pathway?.technical?.length||0)):r.analysis?.recommendations?.length||0)]];for(let i=0;i<3;i++){const x=18+i*59;pdf.setFillColor(241,238,255);pdf.roundedRect(x,y,55,22,3,3,'F');pdf.setTextColor(82,59,197);pdf.setFontSize(8);pdf.text(stats[i][0],x+5,y+7);pdf.setFontSize(17);pdf.text(stats[i][1],x+5,y+16);}y+=32;
 if(school&&r.analysis?.pathway){
  const pathway=r.analysis.pathway,sections=schoolReportSections(pathway);
  section(sections[0].title);for(const text of sections[0].lines)if(!school||!/univers|educación superior/i.test(text))write(text);
  for(const group of [{title:'2. Ciencias: áreas para explorar',options:pathway.science},{title:'2. Técnico: figuras profesionales para explorar',options:pathway.technical}]){
   space(90);section(group.title);
   if(!group.options.length)write('Sin áreas priorizadas todavía. Completa tus intereses y compara ambas modalidades.');
   for(const option of group.options){space(65);write(option.name,11,true);write(option.reason);write('Asignaturas y contenidos: '+option.subjects);write('Actividad: '+option.activity);if(option.evidence?.length)write('Evidencia: '+option.evidence.join(', '),9);}
  }
  if(!school){const bridge=sections[sections.length-1];section(bridge.title);for(const text of bridge.lines)write(text);}else{section('Recomendaciones para elegir Bachillerato');for(const text of pathway.nextSteps)write(text);}
 }
 for(const s of items){section(s.instrument.title);write('Versión '+versionLabel(s.version)+' · Entrega '+new Date(s.createdAt).toLocaleDateString('es-EC'),8);if(s.scores.length){for(const score of s.scores){const isInterest=s.instrumentId==='intereses',isSelf=s.instrumentId==='autoconocimiento';const candidate=isInterest?score.raw:isSelf?score.percent:s.instrument.aggregation==='sum'?score.raw:score.value,val=Number.isFinite(candidate)?candidate:Number.isFinite(score.value)?score.value:0,max=isInterest?25:isSelf?100:undefined;space(17);write(name(score.dimension)+': '+Number(val.toFixed(2))+(max?' / '+max:s.instrument.aggregation==='sum'?' · suma':' · promedio ponderado'),10,true);if(max){y-=5;pdf.setFillColor(233,234,244);pdf.roundedRect(18,y-1,174,3,1,1,'F');pdf.setFillColor(96,71,220);pdf.roundedRect(18,y-1,174*Math.max(0,Math.min(1,(val-(isInterest?5:0))/(max-(isInterest?5:0)))),3,1,1,'F');y+=10;}}write(s.instrumentId==='intereses'?'Interés declarado: suma de cinco respuestas por dimensión, de 5 a 25.':s.instrumentId==='autoconocimiento'?'Frecuencia autoinformada, escala de 20 a 100. No representa aptitud ni probabilidad de éxito.':'Puntuación según las reglas de esta versión del instrumento.',9);}else{for(const q of visibleQuestions(s.instrument,s.answers).filter(q=>q.type!=='info')){write(q.text,10,true);write(answerText(s.instrument,q,s.answers[q.id]));}}}
 for(const item of items.filter((item:any)=>item.scores?.length)){section('Respuestas guardadas: '+item.instrument.title);for(const q of visibleQuestions(item.instrument,item.answers).filter(q=>q.type!=='info')){write(q.text,10,true);write(answerText(item.instrument,q,item.answers[q.id]));}}
 if(r.analysis?.selfReported.length){section('Tus preferencias declaradas');r.analysis.selfReported.forEach((s:any)=>write(s.text));}
 for(const rec of school?[]:r.analysis?.recommendations||[]){pdf.addPage();header();y=40;section(r.catalog.find((c:any)=>c.id===rec.careerId)?.name||rec.careerId);write(rec.reason);write('Qué comparar',11,true);write(rec.comparison||rec.explore);write('Una actividad para explorar',11,true);write(rec.explore);const offers=r.offers?.[rec.careerId]||[];write('Ofertas en la consulta CES: '+offers.length,11,true);for(const o of offers.slice(0,3)){space(36);write(o.institution,10,true);write(o.title+' · '+o.location+' · '+o.modality,9);}if(offers.length>3)write('Consulta las demás ofertas en el reporte digital y en el CES.',9);}
 pdf.addPage();header();y=40;section('Próximos pasos');(r.analysis?.nextSteps||[]).filter((s:string)=>!school||!/univers|educación superior/i.test(s)).forEach((s:string,i:number)=>write((i+1)+'. '+s));section('Alcance y límites');(r.analysis?.limitations||[]).filter((s:string)=>!school||!/CES|univers|educación superior/i.test(s)).forEach((s:string)=>write(s,9));
 section('Fuentes y trazabilidad');write('Catálogo: '+(source?.source||'Instrumentos guardados')+' · Consulta '+(source?.date||r.createdAt),9);if(source?.sourceUrl)write(source.sourceUrl,9);write('Marco de intereses RIASEC: https://www.onetcenter.org/IP.html',9);write('El marco teórico no acredita la validez del cuestionario local.',9);write('Reglas: '+r.rulesVersion+' · Relaciones: '+r.mappingVersion,8);write('Contenido: '+r.contentId+' · '+(r.model||'local'),8);write('Informe guardado: '+r.id,8);
 const total=pdf.getNumberOfPages();for(let p=1;p<=total;p++){pdf.setPage(p);header();pdf.setDrawColor(220,225,235);pdf.line(18,282,192,282);pdf.setFont('helvetica','normal');pdf.setFontSize(8);pdf.setTextColor(100,112,134);pdf.text('Copia personal · '+r.id.slice(0,8),18,288);pdf.text(p+' / '+total,192,288,{align:'right'});}return pdf;
}
