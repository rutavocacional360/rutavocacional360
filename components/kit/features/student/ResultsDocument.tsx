import {reportLimitations} from '../../lib/report-limitations';
import {reportEducationLevel,reportNextSteps} from './report-route';
import {BaccalaureateReference,BaccalaureateResult} from './BaccalaureateResult';
import {PdfViewer} from '../../components/ui/PdfViewer';
import {useSession} from '../../lib/session';
import {EcuadorExplorer} from './EcuadorExplorer';
import {careerStudyDetails} from './career-description';
import {defaultPreparationLevel,preparationHref} from '../../data/school-training';
import {useEffect,useState} from 'react';
import {ArrowDownToLine,ArrowUpRight,CheckCircle2,FileText} from 'lucide-react';
import {professionalReport} from '../../lib/professional-report';
import {dimensions} from '../../data/instruments';
import {answerText} from '../../lib/test-answer-text';
import {visibleQuestions} from '../../lib/test-engine';
import {Button,Notice} from '../../components/ui/primitives';
import {Dialog} from '../../components/ui/Dialog';
import {CareerOfferList,CatalogContext} from './ReportContext';
import './results-document.css';

const dimensionName=(code:string)=>dimensions.find(d=>d.code===code)?.name||code;
const date=(value:string)=>new Date(value).toLocaleDateString('es-EC',{day:'numeric',month:'short',year:'numeric'});
export function ResultScores({item}:{item:any}){
 return <div className="rd-scores">{item.scores.map((score:any)=>{
  const interest=item.instrumentId==='intereses',self=item.instrumentId==='autoconocimiento';
  const raw=score.displayRaw??score.raw;
  const value=interest?raw:self?score.percent:item.instrument.aggregation==='sum'?raw:score.value;
  const min=interest?5:self?20:score.min,max=interest?25:self?100:score.max;
  const ranged=Number.isFinite(min)&&Number.isFinite(max)&&max>min;
  return <div key={score.dimension}><div><span>{dimensionName(score.dimension)}</span><strong>{Number(Number(value).toFixed(2))}{(interest||self)&&<small> / {max}</small>}</strong></div>{interest&&<small className="rd-score-explanation">{dimensions.find(d=>d.code===score.dimension)?.description} Promedio: {(raw/(score.answered||5)).toLocaleString('es-EC',{maximumFractionDigits:1})} / 5</small>}{ranged&&<meter min={min} max={max} value={interest||self?value:score.value} aria-label={dimensionName(score.dimension)}/>}</div>;
 })}</div>;
}
export function ResultAnswers({item}:{item:any}){
 return <dl className="rd-answers">{visibleQuestions(item.instrument,item.answers).filter(question=>question.type!=='info').map(question=><div key={question.id}><dt>{question.text}</dt><dd>{answerText(item.instrument,question,item.answers[question.id])}</dd></div>)}</dl>;
}

export function GuidanceDocument({report}:{report:any}){
 const session=useSession();
 const profile=session.values['rv360:profile'];
 const level=reportEducationLevel(report,profile),school=level==='bachillerato';
 const ready=!report.partial&&report.readiness?.[level]?.ready!==false;
 const preparation=session.user?.role==='student'&&!report.historical&&ready&&(!profile||level===defaultPreparationLevel(profile));
 const [tab,setTab]=useState('resumen'),[career,setCareer]=useState<any>(null),[pdf,setPdf]=useState(''),[error,setError]=useState(''),[retry,setRetry]=useState(0);
 useEffect(()=>{let active=true,url='';setPdf('');setError('');void professionalReport(report).then(doc=>{if(!active)return;url=URL.createObjectURL(doc.output('blob'));setPdf(url);}).catch(()=>{if(active)setError('No pudimos preparar el documento. Tus resultados siguen guardados.');});return()=>{active=false;if(url)URL.revokeObjectURL(url);};},[report,retry]);
 useEffect(()=>{setTab('resumen');setCareer(null);},[level]);
 const recommendations=school||!ready?[]:report.analysis?.recommendations||[];
 const schoolReadiness=school?{total:report.progress?.total||report.instruments.length,completed:report.instruments.length,pending:[],...report.readiness?.bachillerato,ready}:undefined;
 const highlighted=(report.analysis?.highlightedDimensions||[]).map(dimensionName);
 const nextSteps=ready?reportNextSteps(report,profile):[];
 const answerCount=report.instruments.reduce((count:number,item:any)=>count+visibleQuestions(item.instrument,item.answers).filter(question=>question.type!=='info'&&item.answers[question.id]!==undefined).length,0);
 const pdfName='informe-ruta-'+report.id.slice(0,8)+'.pdf';
 const viewer=<section className="rd-document" aria-labelledby="rd-pdf-title"><header><span className="rd-icon"><FileText size={20}/></span><div><h3 id="rd-pdf-title">Tu informe en PDF</h3><p>Resultados completos y respuestas guardadas, listos para compartir.</p></div></header><div className="rd-pdf-actions">{pdf&&<><a className="button button--primary button--md" href={pdf} download={pdfName}><ArrowDownToLine size={16}/>Descargar PDF</a><a className="button button--secondary button--md" href={pdf} target="_blank" rel="noreferrer"><ArrowUpRight size={16}/>Abrir e imprimir</a></>}</div>{error?<div className="rd-pdf-state"><Notice tone="danger">{error}</Notice><Button onClick={()=>setRetry(value=>value+1)}>Reintentar PDF</Button></div>:<div className="rd-frame"><PdfViewer title="Vista previa de tu informe PDF" src={pdf||undefined}/></div>}<footer>Cambia de página o amplía el documento con los controles del visor.</footer></section>;
 return <article className="rd-root">
  {report.historical&&<Notice>Estás consultando una versión histórica. Sus recomendaciones corresponden al perfil y a los resultados de esa fecha. Actualiza el reporte para consultar la orientación actual.</Notice>}
  <header className="rd-heading"><div><p>{report.student.name} <span>· {date(report.createdAt)}</span></p><span className="rd-report-meta">{report.instruments.length} tests · {answerCount} respuestas guardadas</span></div><div className="rd-heading-actions"><span className={'rd-status '+(!ready?'rd-status-partial':'')}><CheckCircle2 size={16}/>{ready?'Informe completo':'Resultados iniciales'}</span>{pdf?<a className="button button--primary button--md" href={pdf} download={pdfName}><ArrowDownToLine size={18}/>Descargar PDF</a>:<Button variant="primary" disabled={!error} onClick={()=>setTab('pdf')} icon={<ArrowDownToLine size={18}/>}>Descargar PDF</Button>}</div></header>
  {report.partial&&<div className="rd-progress"><div><strong>{report.progress?.submitted||report.instruments.length} de {report.progress?.total||report.instruments.length} tests disponibles en tu informe</strong><p>Completa los tests pendientes para recibir la orientación de tu etapa.</p></div><a href="/mi-ruta/evaluaciones">Continuar mis tests <ArrowUpRight size={16}/></a></div>}
  <nav className="rd-tabs" aria-label="Secciones de tus resultados">{[['resumen','Mi orientación'],['tests','Resultados por test'],['pdf','Informe PDF']].map(([id,label])=><button type="button" key={id} aria-pressed={tab===id} onClick={()=>setTab(id)}>{label}</button>)}</nav>
  <div className={tab==='pdf'?'rd-pdf-full':'rd-content-full'}>
   {tab==='pdf'?viewer:<div className="rd-main">
    {tab==='resumen'?<>
     {school?(report.analysis?.pathway?<BaccalaureateResult readiness={schoolReadiness} pathway={report.analysis.pathway} summary={report.analysis.summary} interests={highlighted} showNextSteps={false} showReference={false} allowPreparation={preparation}/>:<Notice>Actualiza el reporte para consultar tu orientación de bachillerato.</Notice>):!ready?<Notice>Completa todos los tests de Universidad y espera la publicación de sus resultados para recibir tus carreras recomendadas.</Notice>:<>
      <section className="rd-panel rd-intro"><span className="rd-eyebrow">TU ORIENTACIÓN UNIVERSITARIA</span><h2>{recommendations.length?'Opciones afines a tus intereses':'Tu elección de carrera sigue abierta'}</h2>{!!highlighted.length&&<div className="rd-interest-tags" aria-label="Intereses destacados"><span>Intereses destacados</span>{highlighted.map((name:string)=><strong key={name}>{name}</strong>)}</div>}<p>Explora las carreras relacionadas con tus respuestas y elige una para conocerla mejor.</p>{report.analysis?.summary&&<details className="rd-rationale"><summary>Ver explicación de mi resultado</summary><p>{report.analysis.summary}</p></details>}</section>
      <EcuadorExplorer report={{...report,analysis:{...report.analysis,recommendations}}} onOpen={setCareer} allowPreparation={preparation}/>
     </>}
    </>:<><div className="rd-section-title"><h3>Puntuaciones y respuestas por test</h3><span>{report.instruments.length} tests</span></div>{report.instruments.map((item:any)=><section className="rd-panel" key={item.id}><h3>{item.instrument.title}</h3><p className="rd-caption">Entregado el {date(item.createdAt)}</p>{item.scores.length?<><ResultScores item={item}/><p className="rd-caption">{item.instrumentId==='autoconocimiento'?'Frecuencias declaradas, de 20 a 100. No son porcentajes de aptitud.':item.instrumentId==='intereses'?'Suma de tus respuestas: de 5 a 25 por área. Un valor más alto indica mayor interés declarado.':'Puntuación calculada según las reglas y la escala de este test.'}</p><details className="rd-test-answers"><summary>Consultar mis respuestas</summary><ResultAnswers item={item}/></details></>:<ResultAnswers item={item}/>}</section>)}</>}
   </div>}
  </div>
  <details className="rd-footnotes rd-disclosure"><summary>Detalles y próximos pasos</summary><div className="rd-details-content">
   {!!nextSteps.length&&<section className="rd-next"><h3>Recomendaciones para avanzar</h3><ol>{nextSteps.map(step=><li key={step}>{step}</li>)}</ol></section>}
   {!!report.analysis?.selfReported?.length&&<section><h3>Lo que valoras al elegir</h3>{report.analysis.selfReported.map((value:any,index:number)=><p key={index}>{value.text}</p>)}</section>}
   {school&&report.analysis?.pathway&&<BaccalaureateReference pathway={report.analysis.pathway}/>}
   <section><h3>Cómo interpretar este informe</h3><p>Los tests orientan tus intereses y preferencias; no certifican aptitud ni garantizan el éxito en una carrera.</p>{!school&&<p>Los números identifican las opciones; no son una nota ni un porcentaje de aptitud.</p>}{reportLimitations(report.analysis?.limitations).map((limitation:string)=><p key={limitation}>{limitation}</p>)}</section>
   {!school&&<CatalogContext report={report}/>}
   <section><h3>Información del informe guardado</h3><p>Versión {report.version} · {date(report.createdAt)} · Referencia {report.id}</p></section>
  </div></details>
  {!school&&<Dialog wide open={!!career} title={(report.catalog||[]).find((candidate:any)=>candidate.id===career?.careerId)?.name||'Explorar carrera'} onClose={()=>setCareer(null)}>{career&&<div className="rd-career-detail"><h3>Por qué conviene explorarla</h3><p>{career.reason}</p><h3>Qué estudiar y comparar</h3>{careerStudyDetails(career).map(text=><p key={text}>{text}</p>)}{preparation&&<a className="button button--primary button--md" href={preparationHref(career.careerId)}>Autopreparación</a>}<CareerOfferList offers={career.filteredOffers||report.offers?.[career.careerId]||(report.catalog||[]).find((candidate:any)=>candidate.id===career.careerId)?.offers||[]}/></div>}</Dialog>}
 </article>;
}
