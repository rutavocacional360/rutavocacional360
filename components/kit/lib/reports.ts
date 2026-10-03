import {professionalReport} from './professional-report';
import {readApiResponse} from './api-response';
import {defaultPreparationLevel} from '../data/school-training';
import { versionLabel } from './version';
import { jsPDF } from 'jspdf';
import { dimensions, instruments } from '../data/instruments';
import { getSession } from './session';
import type { IntegralReport } from './integral-report';
export type Submission={resultReleased?:boolean;id:string;instrument_id:string;version:string;answers:string;scores:string;created_at:string;snapshot?:string};
export function integralReportPdf(report:IntegralReport,title?:string){
 title=title||(report.educationLevel==='bachillerato'?'Informe integral de Bachillerato':report.educationLevel==='universidad'?'Informe integral de Universidad':'Informe integral de orientación');
 const pdf=new jsPDF({unit:'mm',format:'a4'});let y=25;
 const write=(text:string,size=10,bold=false)=>{pdf.setFont('helvetica',bold?'bold':'normal');pdf.setFontSize(size);const lines=pdf.splitTextToSize(text.replaceAll('→','->').replaceAll('–','-').replaceAll('—','-'),170);for(const line of lines){if(y>272){pdf.addPage();y=24;}pdf.text(line,20,y);y+=size*.45+2;}y+=3;};
 pdf.setTextColor(23,42,74);write('RUTA VOCACIONAL 360°',20,true);write(title,15,true);write(report.student.name,13,true);write('Copia guardada: '+report.createdAt);write('Identificador: '+report.id,9);write('Reglas: '+report.engineVersion,9);write(report.shared?'Compartido con el equipo institucional autorizado.':'Copia privada del estudiante.',9);
 for(const section of report.sections){if(y>248){pdf.addPage();y=24;}y+=5;write(section.title,13,true);section.lines.forEach(line=>write(line));}
 const total=pdf.getNumberOfPages();for(let page=1;page<=total;page++){pdf.setPage(page);pdf.setFontSize(8);pdf.setTextColor(95,109,130);pdf.text(`Ruta Vocacional 360° · Copia ${report.id.slice(0,8)} · ${page} / ${total}`,20,287);}
 return pdf;
}
export function downloadIntegralReport(report:IntegralReport,title?:string){integralReportPdf(report,title).save('informe-integral-'+report.id.slice(0,8)+'.pdf');}
export async function downloadReport(items:Submission[],studentName?:string){
 const first=items[0];if(!first)return;
 if(items.length===1){const response=await fetch('/api/assessments/pdf?id='+encodeURIComponent(first.id),{cache:'no-store'});if(!response.ok){await readApiResponse(response);throw new Error('No se pudo descargar el resultado.');}if(!response.headers.get('content-type')?.includes('application/pdf'))throw new Error('El servidor no devolvió un informe PDF.');const url=URL.createObjectURL(await response.blob()),link=document.createElement('a');link.href=url;link.download='entrega-'+first.id.slice(0,8)+'.pdf';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);return;}
 const session=getSession(),origins=session.values['rv360:assessment-route-origins']||{};const levelOf=(item:Submission)=>{const snapshot=item.snapshot?JSON.parse(item.snapshot):null;return snapshot?.educationLevel&&snapshot.educationLevel!=='ambos'?snapshot.educationLevel:origins[item.id]||defaultPreparationLevel(session.values['rv360:profile']);};const educationLevel=levelOf(first);
 if(items.some(item=>levelOf(item)!==educationLevel))throw new Error('Descarga los resultados de Bachillerato y Universidad por separado.');
 const report={educationLevel,id:first.id,createdAt:first.created_at,version:1,student:{name:studentName||getSession().user?.name||'Mi informe'},rulesVersion:'original-scoring-1',mappingVersion:'No aplica: resumen de entregas',contentId:'local-submission-summary',contentSource:'local',model:null,catalog:[],offers:{},catalogSource:{source:'Instrumentos y entregas guardados en el servidor',date:first.created_at.slice(0,10),sourceUrl:'https://www.onetcenter.org/IP.html'},instruments:items.map(s=>({id:s.id,instrumentId:s.instrument_id,version:s.version,createdAt:s.created_at,instrument:s.snapshot?JSON.parse(s.snapshot):instruments.find(i=>i.id===s.instrument_id),answers:JSON.parse(s.answers),scores:s.resultReleased===false?[]:JSON.parse(s.scores)})),analysis:{summary:'Resultados de las entregas seleccionadas. Consulta Mis resultados para el informe de orientación y las opciones académicas.',selfReported:[],recommendations:[],nextSteps:['Revisa tu informe de orientación en Mis resultados.','Contrasta tus preferencias con experiencias y mallas oficiales.'],limitations:['Las puntuaciones conservan las reglas de cada test. Intereses autodeclarados no equivalen a aptitudes medidas.','Los resultados pendientes de publicación no se incluyen.']}};const pdf=await professionalReport(report);pdf.save('entrega-'+first.id.slice(0,8)+'.pdf');
}
