import {reportLimitations} from './report-limitations';
import {schoolCatalogSource} from '../data/baccalaureate';
import {defaultPreparationLevel,schoolTrainingTargets} from '../data/school-training';
import {answerText} from './test-answer-text';
import {visibleQuestions} from './test-engine';
import {versionLabel} from './version';
import {jsPDF} from 'jspdf';
import {dimensions} from '../data/instruments';

const dimensionName=(code:string)=>dimensions.find(d=>d.code===code)?.name||code;
const preparationUrl=(id:string)=>'https://rutavocacional360.com/mi-ruta/cursos?carrera='+encodeURIComponent(id);
const clean=(value:unknown)=>String(value??'').replace(/[→↗]/g,'>').replace(/[—–‑]/g,'-').replace(/…/g,'...');

export async function professionalReport(r:any){
 const recordedLevels=[...new Set<string>((r.instruments||[]).map((item:any)=>item.instrument?.educationLevel).filter((level:any)=>['bachillerato','universidad'].includes(level)))];
 const educationLevel=r.educationLevel||(recordedLevels.length===1?recordedLevels[0]:defaultPreparationLevel(r.schoolProfile||r.analysis?.pathway?.profile||{}));
 const school=educationLevel==='bachillerato',source=school?schoolCatalogSource:r.catalogSource;
 const items:any[]=(r.instruments||[]).filter((item:any)=>!item.instrument?.educationLevel||item.instrument.educationLevel==='ambos'||item.instrument.educationLevel===educationLevel);
 const pathway=school?r.analysis?.pathway:undefined;
 const ready=r.readiness?.[educationLevel]?.ready??r.partial!==true;
 const recommendations:any[]=school?[]:(r.analysis?.recommendations||[]).filter((rec:any)=>!String(rec.careerId).startsWith('bachillerato:'));
 const science:any[]=ready?pathway?.science||[]:[],technical:any[]=ready?pathway?.technical||[]:[];
 const questionsOf=(item:any)=>visibleQuestions(item.instrument,item.answers||{}).filter(q=>q.type!=='info');
 const answerCount=items.reduce((n,item)=>n+questionsOf(item).filter(q=>item.answers?.[q.id]!==undefined&&item.answers[q.id]!==null&&item.answers[q.id]!=='').length,0);
 const pdf=new jsPDF({unit:'mm',format:'a4'});let y=40;
 const ink:[number,number,number]=[26,42,74],muted:[number,number,number]=[79,94,116],purple:[number,number,number]=[92,66,204];
 let logo:string|undefined;try{const response=await fetch('/media/brain-book-icon.png');if(response.ok){const blob=await response.blob();logo=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=reject;reader.readAsDataURL(blob);});}}catch{}
 const font=(size:number,bold=false,color=ink)=>{pdf.setFont('helvetica',bold?'bold':'normal');pdf.setFontSize(size);pdf.setTextColor(...color);};
 const wrap=(value:unknown,size=10,width=174,bold=false)=>{font(size,bold);return pdf.splitTextToSize(clean(value),width) as string[];};
 function header(){pdf.setFillColor(245,246,253);pdf.rect(0,0,210,30,'F');if(logo)pdf.addImage(logo,'PNG',16,6,18,18);font(13,true);pdf.text('Ruta Vocacional 360°',logo?39:18,14);font(9,false,muted);pdf.text(school?'ORIENTACIÓN DE BACHILLERATO':'ORIENTACIÓN UNIVERSITARIA',logo?39:18,21);}
 const page=()=>{pdf.addPage();header();y=40;};
 const reserve=(height:number)=>{if(y+height>276)page();};
 const write=(value:unknown,size=10,bold=false,color=ink,gap=2)=>{const lines=wrap(value,size,174,bold),step=size*.43+1.3;for(const line of lines){reserve(step+1);font(size,bold,color);pdf.text(line,18,y);y+=step;}y+=gap;};
 const section=(title:string)=>{reserve(24);y+=5;pdf.setDrawColor(224,227,239);pdf.line(18,y-4,192,y-4);write(title,14,true,ink,4);};
 const link=(label:string,url:string)=>{reserve(12);pdf.setFillColor(241,238,255);pdf.roundedRect(18,y-3,174,10,2,2,'F');font(9.5,true,purple);pdf.text(clean(label),23,y+3);pdf.link(18,y-3,174,10,{url});y+=13;};
 const preparation=(id:string,label='Abrir autopreparación de esta opción')=>{if(!ready||r.historical)return;if(school&&!schoolTrainingTargets.some(target=>target.id===id))return;link(label,preparationUrl(id));};
 const evidence=(codes:string[]=[])=>{const groups=new Map<string,string[]>();for(const code of codes){const match=code.match(/^(.+):dimension:(.+)$/);if(!match)continue;const item=items.find(item=>item.instrumentId===match[1]),label=item?.instrument?.dimensions?.find((d:any)=>d.id===match[2])?.name||dimensionName(match[2]);if(!item)continue;const labels=groups.get(item.instrument.title)||[];if(!labels.includes(label))labels.push(label);groups.set(item.instrument.title,labels);}return [...groups].map(([title,labels])=>title+': '+labels.join(', ')).join('; ');};
 const panel=(title:string,body:string)=>{const titles=wrap(title,17,162,true),lines=wrap(body,10,162),height=15+titles.length*7+lines.length*5.6;if(height>150){section(title);write(body);return;}reserve(height+6);pdf.setFillColor(241,238,255);pdf.roundedRect(18,y-5,174,height,3,3,'F');font(8.5,true,purple);pdf.text(school?'TU MODALIDAD DE BACHILLERATO':'TU ORIENTACIÓN UNIVERSITARIA',24,y+2);let position=y+12;font(17,true);for(const line of titles){pdf.text(line,24,position);position+=7;}position+=2;font(10);for(const line of lines){pdf.text(line,24,position);position+=5.6;}y+=height+2;};
 const currentSteps=(ready?r.analysis?.nextSteps||[]:['Completa tus tests pendientes en Mis tests.','Espera la publicación de sus resultados antes de acceder a la autopreparación.']).filter((text:string)=>!school||!/univers|educación superior/i.test(text));
 const completeText=(text:unknown)=>ready&&/complet(?:a|ar).{0,45}(?:tests?|intereses|evaluaciones)|entreg(?:a|ar).{0,35}(?:tests?|intereses)|tests pendientes/i.test(String(text))?'Tus tests están completos. Contrasta tus intereses con asignaturas, proyectos y orientación docente para decidir.':clean(text);

 header();write(school?'Tu orientación de Bachillerato':'Tu orientación universitaria',21,true);write(r.student?.name||'Mi informe',12,true);write(new Date(r.createdAt).toLocaleString('es-EC')+' · Informe '+r.version,8.5,false,muted,3);
 write((r.historical?(ready?'Informe histórico completo':'Informe histórico parcial'):ready?'Informe completo':'Resultados parciales')+' · '+(r.progress?.submitted??items.length)+' de '+(r.progress?.total??items.length)+' tests con resultados publicados',9,true,purple,4);
 if(school&&pathway){
  const suggested=ready?pathway.suggested:'pendiente';
  const title=suggested==='ciencias'?'Bachillerato en Ciencias':suggested==='tecnico'?'Bachillerato Técnico':suggested==='ambas'?'Ciencias y Técnico: ambas modalidades':'pendiente'===suggested&&ready?'Tests completos: orientación por revisar':'Resultado en preparación';
  const reason=!ready?'Entrega los tests pendientes y espera la publicación de sus resultados para recibir tu orientación.':suggested==='pendiente'?'Tus tests están completos, pero los resultados publicados no permiten priorizar una modalidad. Compara las experiencias de Ciencias y Técnico con tu orientador.':completeText(pathway.reason);
  panel(title,reason);
  write('Esta orientación describe tu afinidad según tus respuestas; no certifica aptitud ni determina tu elección.',9,false,muted,4);
 }else panel(ready?(recommendations.length?'Carreras relacionadas con tus resultados':'Explora tus opciones con tu orientador'):'Resultado en preparación',ready?clean(r.analysis?.summary||'Los resultados publicados no priorizan una carrera todavía. Compara actividades y planes de estudio con tu orientador.'):'Completa los tests pendientes y espera la publicación de sus resultados para recibir orientación.');
 reserve(20);const stats=[['TESTS',items.length],['RESPUESTAS',answerCount],['OPCIONES RELACIONADAS',school?science.length+technical.length:recommendations.length]];for(let i=0;i<stats.length;i++){const x=18+i*59;pdf.setFillColor(248,249,253);pdf.roundedRect(x,y,55,17,2,2,'F');font(7.5,false,muted);pdf.text(String(stats[i][0]),x+4,y+5);font(12,true);pdf.text(String(stats[i][1]),x+4,y+12);}y+=24;
 const summary=clean(r.analysis?.summary);if(school&&summary&&!/univers|educación superior/i.test(summary)&&summary!==clean(pathway?.reason)&&summary!==clean(pathway?.title)&&summary!==clean(pathway?.title+'. '+pathway?.reason))write(summary);
 if(r.historical){write('Esta copia conserva los resultados de su fecha. Consulta tu orientación actual antes de elegir cursos o autopreparación.',9,false,muted);link('Ver mi orientación actual','https://rutavocacional360.com/mi-ruta/resultados');}
 const top=(school?pathway?.highlightedDimensions||r.analysis?.highlightedDimensions||[]:r.analysis?.highlightedDimensions||[]).map(dimensionName);if(ready&&top.length)write('Intereses destacados en tu orientación: '+top.join(', ')+'.',10,true);
 if(ready&&school&&['ciencias','ambas'].includes(pathway?.suggested))preparation('bachillerato:ciencias','Ver autopreparación de Bachillerato en Ciencias');
 if(ready&&school&&['tecnico','ambas'].includes(pathway?.suggested))preparation('bachillerato:tecnico','Ver autopreparación de Bachillerato Técnico');

 if(school&&pathway){
  if(ready&&pathway.rankingNote)write(pathway.rankingNote,9,false,muted,4);
  const textHeight=(text:string,size:number,bold=false,gap=2)=>wrap(text,size,174,bold).length*(size*.43+1.3)+gap;
  const cardHeight=(option:any)=>{const support=evidence(option.evidence);return textHeight(option.name,12,true)+(option.family?textHeight('Familia: '+option.family,8.5):0)+textHeight('Por qué aparece: '+completeText(option.reason),9.5)+(option.subjects?textHeight('Contenidos para comparar: '+option.subjects,9.5):0)+(option.activity?textHeight('Prueba esta actividad: '+option.activity,9.5):0)+(support?textHeight('Respaldo de tus tests: '+support,8.5):0)+(!r.historical?13:0)+3;};
  const groups=[{title:'Áreas de Ciencias relacionadas',options:science,description:'Son áreas para explorar dentro de Ciencias; no son especializaciones oficiales del título.'},{title:'Figuras de Bachillerato Técnico relacionadas',options:technical,description:'Figuras del catálogo oficial. Confirma con tu colegio su oferta, talleres y requisitos.'}];
  if(pathway.suggested==='tecnico')groups.reverse();
  for(const group of groups){
   if(group.options.length)reserve(Math.min(230,5+textHeight(group.title,14,true,4)+textHeight(group.description,9,false,4)+cardHeight(group.options[0])));
   section(group.title);write(group.description,9,false,muted,4);
   if(!group.options.length)write(ready?'Tus tests están completos. No hay opciones priorizadas en este grupo; compara las modalidades con tu orientador.':'Las opciones relacionadas aparecerán al completar los tests y publicarse sus resultados.');
   for(const option of group.options){
    const support=evidence(option.evidence);reserve(Math.min(230,cardHeight(option)));
    write(option.name,12,true);if(option.family)write('Familia: '+option.family,8.5,false,muted);
    write('Por qué aparece: '+completeText(option.reason),9.5);
    if(option.subjects)write('Contenidos para comparar: '+option.subjects,9.5);
    if(option.activity)write('Prueba esta actividad: '+option.activity,9.5);
    if(support)write('Respaldo de tus tests: '+support,8.5,false,muted);
    preparation(String(option.id).startsWith('bachillerato:')?option.id:'bachillerato:'+option.id);y+=3;
   }
  }
 }else if(ready){
  section('Carreras relacionadas y cómo explorarlas');
  if(!recommendations.length)write('Tus tests están completos. Las respuestas todavía no permiten priorizar una carrera; contrasta tus intereses con experiencias y orientación docente.');
  for(const rec of recommendations){
   reserve(65);write(r.catalog?.find((career:any)=>career.id===rec.careerId)?.name||rec.careerId,13,true);
   write('Por qué aparece: '+rec.reason,10);const support=evidence(rec.evidence);if(support)write('Respaldo de tus tests: '+support,8.5,false,muted);
   if(rec.comparison)write('Qué comparar: '+rec.comparison,9.5);if(rec.explore)write('Prueba esta actividad: '+rec.explore,9.5);
   const offers=r.offers?.[rec.careerId]||[];if(offers.length){write('Dónde investigar · '+offers.length+' ofertas en la consulta CES',10,true);for(const offer of offers.slice(0,3))write(offer.institution+' · '+offer.title+' · '+offer.location+' · '+offer.modality,9,false,muted);if(offers.length>3)write('Puedes consultar las demás ofertas en el informe digital y en el CES.',8.5,false,muted);}
   preparation(rec.careerId,'Abrir cursos y autopreparación de esta carrera');y+=4;
  }
 }
 section('Tus próximos pasos');if(currentSteps.length)currentSteps.forEach((text:string,index:number)=>write((index+1)+'. '+completeText(text),10));else write('Compara las opciones relacionadas, prueba una actividad y conversa con tu orientador.');
 if(ready&&!r.historical)write('Los enlaces de autopreparación abren las opciones de esta ruta. Los cursos y simuladores aparecen cuando tu institución ha publicado contenido relacionado.',9,false,muted);

 page();section('Resultados por test y respuestas guardadas');write('Cada test conserva su versión y sus reglas. Las respuestas se muestran una sola vez, con sus puntuaciones cuando corresponde.',9,false,muted,4);
 for(const item of items){
  reserve(30);write(item.instrument.title,13,true);write('Versión '+versionLabel(item.version)+' · Entrega '+new Date(item.createdAt).toLocaleDateString('es-EC'),8.5,false,muted,4);
  if(item.scores?.length){
   for(const score of item.scores){
    const originalInterest=item.instrumentId==='intereses',self=item.instrumentId==='autoconocimiento',candidate=originalInterest?(score.displayRaw??score.raw):self?score.percent:item.instrument.aggregation==='sum'?(score.displayRaw??score.raw):score.value;
    const value=Number.isFinite(candidate)?candidate:Number.isFinite(score.value)?score.value:undefined;
    const label=item.instrument.dimensions?.find((dimension:any)=>dimension.id===score.dimension)?.name||dimensionName(score.dimension);
    if(value===undefined){write(label+': sin puntuación disponible',9.5);continue;}
    const max=originalInterest?25:self&&Number.isFinite(score.percent)?100:undefined;reserve(max?14:9);
    write(label+': '+Number(value.toFixed(2))+(max?' / '+max:item.instrument.aggregation==='sum'?' · suma':' · puntuación'),9.5,true,ink,2);
    if(max){pdf.setFillColor(233,234,244);pdf.roundedRect(18,y-1,174,2.5,1,1,'F');const width=174*Math.max(0,Math.min(1,(value-(originalInterest?5:20))/(max-(originalInterest?5:20))));if(width>0){pdf.setFillColor(...purple);pdf.roundedRect(18,y-1,width,2.5,1,1,'F');}y+=7;}
    else if(Number.isFinite(score.min)&&Number.isFinite(score.max))write('Recorrido de esta escala: '+score.min+' a '+score.max+(score.band?' · '+score.band:''),8.5,false,muted);
   }
   write(item.instrumentId==='intereses'?'Interés declarado: suma de cinco respuestas por dimensión, de 5 a 25.':item.instrumentId==='autoconocimiento'?'Frecuencia autoinformada de 20 a 100. No es un porcentaje de aptitud.':'Puntuación según las reglas guardadas de esta versión del test.',8.5,false,muted,4);
  }else write('Este test conserva información descriptiva; no asigna una puntuación de aptitud.',9,false,muted,4);
  write('Respuestas guardadas',10,true,ink,3);
  for(const question of questionsOf(item)){const answer=answerText(item.instrument,question,item.answers?.[question.id]);reserve(Math.min(45,wrap(question.text,9.5,174,true).length*5.4+wrap(answer,9.5).length*5.4+4));write(question.text,9.5,true,ink,1);write(answer,9.5,false,muted,3);}
  y+=6;
 }
 section('Cómo interpretar tu informe');const limits=reportLimitations(r.analysis?.limitations).filter((text:string)=>!school||!/CES|univers|educación superior/i.test(text));for(const text of limits)write(text,9,false,muted);if(!limits.length)write('Esta orientación se basa en tus respuestas. Contrasta los intereses declarados con experiencias y orientación docente.',9,false,muted);
 section('Fuentes y registro del informe');write('Catálogo: '+(source?.source||'Instrumentos guardados')+' · Consulta '+(source?.date||r.createdAt),9,false,muted);if(source?.sourceUrl)link(school?'Consultar el catálogo oficial de Bachillerato':'Consultar la oferta oficial del CES',source.sourceUrl);link('Consultar el marco de intereses RIASEC','https://www.onetcenter.org/IP.html');write('El marco teórico no acredita la validez del cuestionario local.',8.5,false,muted);write('Reglas: '+r.rulesVersion+' · Relaciones: '+r.mappingVersion,8,false,muted);write('Informe guardado: '+r.id,8,false,muted);
 const total=pdf.getNumberOfPages();for(let number=1;number<=total;number++){pdf.setPage(number);header();pdf.setDrawColor(220,225,235);pdf.line(18,282,192,282);font(8,false,muted);pdf.text('Copia personal · '+String(r.id).slice(0,8),18,288);pdf.text(number+' / '+total,192,288,{align:'right'});}return pdf;
}
