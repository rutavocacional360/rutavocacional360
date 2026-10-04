import {defaultPreparationLevel} from '../../data/school-training';
import {reportEducationLevel,reportNextSteps} from './report-route';
import {SchoolRouteStart} from './SchoolRouteStart';
import {schoolReportSections} from '../../lib/school-guidance';
import {TestResult} from './TestResult';
import {GuidanceDocument,ResultAnswers} from './ResultsDocument';
export {GuidanceDocument} from './ResultsDocument';
import {versionLabel} from '../../lib/version';
import {useEffect,useState,useCallback} from 'react';
import {FileText} from 'lucide-react';
import Link from 'next/link';
import {useSession,previewAction,refreshSession} from '../../lib/session';
import {dimensions} from '../../data/instruments';
import {Button,Card,Notice,PageHeader,SelectField} from '../../components/ui/primitives';
import {ReleaseResult} from '../admin/ReleaseResult';
import {downloadReport} from '../../lib/reports';
const dimensionName=(code:string)=>dimensions.find(d=>d.code===code)?.name||code;
function evidenceLabel(report:any,ref:string){const [instrumentId,kind,value]=ref.split(':');const item=report.instruments.find((s:any)=>s.instrumentId===instrumentId);if(kind==='dimension')return (item?.instrument.title||instrumentId)+': '+dimensionName(value);const q=item?.instrument.questions.find((q:any)=>q.id===kind);return q?(item.instrument.title+': '+q.text):ref;}
function SubmissionAnswers({submission}:{submission:any}){const instrument=JSON.parse(submission.snapshot),answers=JSON.parse(submission.answers);return <details><summary>Revisar respuestas</summary><ResultAnswers item={{instrument,answers}}/></details>;}
export function reportSections(r:any){const sections=r.instruments.map((s:any)=>({title:s.instrument.title,lines:[`Entrega ${s.id} · Versión ${versionLabel(s.version)} · ${s.createdAt}`,...(s.scores.length?s.scores.map((v:any)=>`${dimensionName(v.dimension)}: ${s.instrumentId==='intereses'?(v.displayRaw??v.raw)+' / 25':s.instrumentId==='autoconocimiento'?v.percent+' / 100':(v.displayRaw??v.raw)+' (suma) · '+v.value+' (promedio)'}`):s.instrument.questions.map((q:any)=>q.text+': '+(q.options||s.instrument.options).filter((o:any)=>s.answers[q.id]===o.value).map((o:any)=>o.label).join(', ')))]}));if(r.analysis){if(reportEducationLevel(r)==='bachillerato'&&r.analysis.pathway)sections.unshift(...schoolReportSections(r.analysis.pathway).filter((section:any)=>!section.title.includes('universidad')).map((section:any)=>({...section,lines:section.lines.filter((line:string)=>!/universidad|universitari|educación superior/i.test(line))}))); sections.push({title:'Interpretación de orientación',lines:[r.analysis.summary,...r.analysis.selfReported.map((s:any)=>s.text)]});if(reportEducationLevel(r)==='universidad')sections.push({title:'Carreras sugeridas',lines:r.analysis.recommendations.map((c:any)=>(r.catalog.find((x:any)=>x.id===c.careerId)?.name||c.careerId)+': '+c.reason+' Qué explorar: '+c.explore+' Evidencia: '+c.evidence.map((ref:string)=>evidenceLabel(r,ref)).join('; '))});sections.push({title:'Próximos pasos',lines:reportNextSteps(r)},{title:'Límites de interpretación',lines:r.analysis.limitations});}else sections.push({title:'Estado del informe de orientación',lines:['Informe de orientación todavía no disponible. Este documento contiene únicamente el resumen calculado de los tests entregados.']});sections.push({title:'Cómo interpretar las escalas',lines:['RIASEC: suma de cinco respuestas por dimensión, de cinco a veinticinco. Autoconocimiento: frecuencia autoinformada transformada a escala de veinte a cien; no es porcentaje de aptitud.','No se dispone de validación psicométrica ecuatoriana del instrumento local. El marco de intereses RIASEC está documentado en https://www.onetcenter.org/IP.html']});if(reportEducationLevel(r)==='universidad'&&r.catalogSource)sections.push({title:'Catálogo oficial consultado',lines:[r.catalogSource.source+' · '+r.catalogSource.date+' · '+r.catalogSource.careerCount+' denominaciones · '+r.catalogSource.offerCount+' ofertas',r.catalogSource.sourceUrl,'La oferta puede cambiar. Verifica admisión, malla y disponibilidad directamente.']});return sections;}
export function GuidanceResults({admin=false}:{admin?:boolean}){
 const session=useSession();
 const [items,setItems]=useState<any[]>([]),[loading,setLoading]=useState(true),[configured,setConfigured]=useState(false);
 const [selected,setSelected]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[query,setQuery]=useState('');
 const load=useCallback(async()=>{
  try{const data=await previewAction('reports/guidance');setItems(data.items);setConfigured(data.configured);}
  catch(e){setError((e as Error).message);}finally{setLoading(false);}
 },[]);
 useEffect(()=>{void load();},[load,session.values['rv360:submissions'],session.values['rv360:profile']]);
 useEffect(()=>{
  if(!items.some(r=>r.status==='processing'))return;
  const timer=setInterval(()=>void load(),2500);return()=>clearInterval(timer);
 },[items,load]);
 const level=defaultPreparationLevel(session.values['rv360:profile']),school=level==='bachillerato';
 const filtered=items.filter(r=>admin?r.student.name.toLowerCase().includes(query.toLowerCase()):reportEducationLevel(r,session.values['rv360:profile'])===level);
 const report=filtered.find(r=>r.id===selected)||filtered[0];
 const submissions=(session.values['rv360:submissions']||[]).filter((submission:any)=>{
  if(admin)return !query||(session.values['rv360:admin-users']||[]).find((u:any)=>u.id===submission.user_id)?.name?.toLowerCase().includes(query.toLowerCase());
  const snapshot=typeof submission.snapshot==='string'?JSON.parse(submission.snapshot):submission.snapshot;
  return !snapshot?.educationLevel||snapshot.educationLevel==='ambos'||snapshot.educationLevel===level;
 });
 const canUpdate=!admin&&report&&!report.partial&&!report.historical&&report.status==='available';
 async function analyze(regenerate=false){
  setBusy(true);setError('');
  try{const r=await previewAction('reports/guidance',{method:'POST',body:JSON.stringify(regenerate?{regenerate:true}:{id:report?.id})});setSelected(r.id);}
  catch(e){setError((e as Error).message);}finally{await load();setBusy(false);}
 }
 return <div className="results-page">
  <PageHeader title={admin?'Resultados de estudiantes':'Mis resultados'} description={admin?'Informes y entregas de tus estudiantes.':school?'Tus opciones de bachillerato según tus respuestas.':'Las carreras que más se relacionan con tus respuestas.'} actions={filtered.length>1&&<div className="results-toolbar"><SelectField label="Consultar otro informe" value={report?.id||''} onChange={e=>setSelected(e.target.value)}>{filtered.map(r=><option value={r.id} key={r.id}>{admin?r.student.name+' · ':''}{new Date(r.createdAt).toLocaleDateString('es-EC',{day:'numeric',month:'short',year:'numeric'})} · Informe {r.version}</option>)}</SelectField></div>}/>
  {admin&&<div className="field"><label htmlFor="report-student">Buscar estudiante</label><input id="report-student" type="search" value={query} onChange={e=>{setQuery(e.target.value);setSelected('');}}/></div>}
  {error&&<Notice tone="danger">{error}</Notice>}
  {!admin&&!loading&&!report&&<SchoolRouteStart/>}
  {report?<>
   {!admin&&configured&&report.status!=='available'&&<div className="analysis-action"><p>{report.status==='processing'?'Analizando tus respuestas…':report.status==='error'?'El análisis no se completó. Puedes volver a intentarlo.':'Tus tests están completos. Ya puedes solicitar tu informe de orientación.'}</p><Button loading={busy||report.status==='processing'} disabled={(!report.partial&&report.attempts>=3)||report.partial} onClick={()=>void analyze()}>{report.status==='error'?'Reintentar análisis':'Generar mi reporte'}</Button></div>}
   <GuidanceDocument key={report.id} report={report}/>
  </>:loading?<Card><p role="status">Cargando tu reporte guardado…</p></Card>:<Card className="compact-empty"><FileText size={30}/><h2>{admin?'Todavía no hay reportes':'Tu reporte empieza con tus respuestas'}</h2><p>{admin?'Las baterías completas aparecerán aquí.':'Completa y entrega tus tests de '+(school?'Bachillerato':'Universidad')+'. Tu orientación aparecerá cuando se publiquen sus resultados.'}</p>{!admin&&<Link className="button button--primary button--md" href="/mi-ruta/evaluaciones">Ir a mis tests</Link>}</Card>}
  {(submissions.length>0||canUpdate)&&<details className="results-history">
   <summary>Historial y opciones del informe</summary>
   {canUpdate&&<Button variant="secondary" loading={busy} onClick={()=>void analyze(true)}>Actualizar reporte</Button>}
   <div className="compact-history">{submissions.map((submission:any)=>{
    const instrument=JSON.parse(submission.snapshot);
    const studentName=admin?(session.values['rv360:admin-users']||[]).find((u:any)=>u.id===submission.user_id)?.name||'Estudiante':session.user?.name;
    return <details key={submission.id}>
     <summary>{instrument.title} <span>{new Date(submission.created_at).toLocaleDateString('es-EC')} · {admin?studentName:submission.resultReleased===false?'Pendiente de publicación':'Entregado'}</span></summary>
     {submission.evaluation?<TestResult key={submission.id+':'+submission.evaluation.revision} submission={submission} admin={admin} showGuidance={false}/>:<div className="stack">
      <p className="small muted">Versión {versionLabel(submission.version)}</p>
      {submission.resultReleased===false?<>{admin?<ReleaseResult id={submission.id} released={false} onReleased={()=>void refreshSession()}/>:<Notice>Tu entrega está guardada. El resultado está pendiente de publicación.</Notice>}</>:<>
       {JSON.parse(submission.scores).map((score:any)=><div className="test-score" key={score.dimension}><h3>{dimensionName(score.dimension)}</h3><strong>{submission.instrument_id==='intereses'?(score.displayRaw??score.raw)+' / 25':submission.instrument_id==='autoconocimiento'?score.percent+' / 100':instrument.aggregation==='sum'?(score.displayRaw??score.raw)+' · suma':score.value.toLocaleString('es-EC',{maximumFractionDigits:2})+' · promedio'}</strong></div>)}
       <SubmissionAnswers submission={submission}/>
       <Button variant="secondary" onClick={()=>downloadReport([submission],studentName)}>Descargar resultado PDF</Button>
      </>}
     </div>}
    </details>;
   })}</div>
  </details>}
 </div>;
}
