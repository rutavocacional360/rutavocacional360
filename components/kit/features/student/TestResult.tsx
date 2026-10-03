import {defaultPreparationLevel,schoolTarget} from '../../data/school-training';
import {technicalCatalogSource} from '../../data/technical-figures';
import {useSession} from '../../lib/session';
import {PdfViewer} from '../../components/ui/PdfViewer';
import {versionLabel} from '../../lib/version';

import {dimensions} from '../../data/instruments';
import {responseDistribution} from '../../lib/response-distribution';
import {useState,useEffect} from 'react';
import type {Instrument} from '../../types';
import {Button,Card,Field,Notice,SelectField} from '../../components/ui/primitives';
import {previewAction,refreshSession} from '../../lib/session';
import {answerText} from '../../lib/test-answer-text';
import {ReleaseResult} from '../admin/ReleaseResult';
export function TestResult({submission:s,admin=false,showGuidance=true}:{submission:any;admin?:boolean;showGuidance?:boolean}){
 const t:Instrument=JSON.parse(s.snapshot),answers=JSON.parse(s.answers),r=s.evaluation;
 const profile=useSession().values['rv360:profile'];
 const level=t.educationLevel&&t.educationLevel!=='ambos'?t.educationLevel:defaultPreparationLevel(profile),school=level==='bachillerato';
 const careers=(r?.careers||[]).filter((career:any)=>schoolTarget(career.careerId)===school);
 const[pdf,setPdf]=useState(false),[reviews,setReviews]=useState<Record<string,Record<string,string>>>({}),[reason,setReason]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);


 const target='/api/assessments/pdf?id='+encodeURIComponent(s.id);
 const label=(id:string)=>t.dimensions?.find(d=>d.id===id)?.name||dimensions.find(d=>d.code===id)?.name||id;
 if(!r)return null;
 return <><Card className="stack test-result"><header><span className="eyebrow">RESULTADO DEL TEST</span><h2>{t.title}</h2><p className="small muted">Versión {versionLabel(s.version)} · {new Date(s.created_at).toLocaleDateString('es-EC')} · Revisión {r.revision}</p></header><Notice tone={r.state==='complete'?'success':'warning'}>{r.state==='pending-review'?'Pendiente de revisión de la rúbrica':r.state==='insufficient'?'No hay cobertura suficiente para una interpretación final':'Resultado guardado'} · {r.coverage.responded} de {r.coverage.applicable} respuestas aplicables</Notice>
 {r.scores.map((score:any)=><section className="test-score" key={score.dimension}><div><h3>{label(score.dimension)}</h3><strong>{score.value.toLocaleString('es-EC',{maximumFractionDigits:2})}</strong></div><p className="small muted">Recorrido aplicable: {score.min} a {score.max} · {r.aggregation==='mean'?'Media ponderada':'Suma ponderada'}</p>{score.max>score.min&&<meter min={score.min} max={score.max} value={score.value} aria-label={label(score.dimension)}/>} {score.normalized!==undefined&&<p>Posición en el recorrido: {score.normalized.toFixed(2)} / 100</p>}{score.band&&<p>{score.band}</p>}</section>)}
 {!r.scores.length&&<p>{r.state==='pending-review'?'Las respuestas pendientes no reciben una puntuación de cero.':'Este instrumento conserva respuestas descriptivas, sin puntuación numérica.'}</p>}
 {responseDistribution(t,answers,r.trace).length>0&&<details className="response-distribution"><summary>Distribución de tus respuestas por sección</summary><p className="small muted">Número de respuestas en cada opción. No es una medida de aptitud ni una puntuación de carrera.</p>{responseDistribution(t,answers,r.trace).map((g,i)=><section key={i}><h3>{g.title}</h3>{g.items.map(item=><div className="distribution-row" key={item.label}><span>{item.label}</span><meter min={0} max={g.answered} value={item.count} aria-label={item.label}/><b>{item.count} / {g.answered}</b></div>)}</section>)}</details>}
 <p className="small muted">{r.scores.length?'Estas puntuaciones describen las reglas del instrumento.':'El documento no incluye reglas de puntuación; puedes consultar todas tus respuestas y descargarlas.'} Las respuestas omitidas y ocultas se excluyen del cálculo. No son porcentajes de aptitud. {!t.careerLinks?.length&&!['intereses','valores','autoconocimiento'].includes(t.id)?'No se han configurado relaciones específicas con carreras para este test.':''}</p>

 {showGuidance&&careers.length>0&&<section className="stack"><h3>{school?'Figuras profesionales para explorar':'Carreras para explorar'}</h3>{careers.map((c:any)=><div className="preview-question" key={c.id}><h3>{c.careerName}</h3><p>{c.reason}</p><p className="small">Evidencia: {label(c.dimensionId)} = {c.evidence}. Criterio: {c.min} a {c.max}.</p><p className="small muted">Fuente del criterio: {c.source}</p>{!school&&<details><summary>Ofertas del catálogo consultado</summary>{c.offers?.map((o:any,i:number)=><p key={i}><b>{o.institution}</b><br/>{o.title} · {o.location} · {o.modality}</p>)}<a href={c.sourceUrl} target="_blank" rel="noreferrer">Consultar fuente oficial</a></details>}{school&&<a href={c.sourceUrl||technicalCatalogSource.url} target="_blank" rel="noreferrer">Consultar catálogo oficial de bachillerato</a>}</div>)}</section>}
 <details><summary>Consultar respuestas</summary><div className="stack-sm">{t.questions.filter(q=>r.trace.some((x:any)=>x.questionId===q.id)).map(q=><div className="preview-question" key={q.id}><b>{q.text}</b><p>{answerText(t,q,answers[q.id])}</p></div>)}</div></details>
 {admin&&r.state==='pending-review'&&<form className="stack" onSubmit={async e=>{e.preventDefault();setBusy(true);setError('');try{await previewAction('admin/tests/review',{method:'POST',body:JSON.stringify({id:s.id,reviews,reason})});await refreshSession();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}><h3>Revisar rúbrica</h3>{t.questions.filter(q=>r.trace.some((x:any)=>x.questionId===q.id&&x.state==='pending-review')).map(q=><fieldset className="preview-question stack" key={q.id}><legend>{q.text}</legend><p>{answerText(t,q,answers[q.id])}</p>{q.rubric?.map(c=><SelectField key={c.id} label={c.label} required value={reviews[q.id]?.[c.id]||''} onChange={e=>setReviews({...reviews,[q.id]:{...reviews[q.id],[c.id]:e.target.value}})}><option value="">Selecciona un nivel</option>{c.levels.map(l=><option key={l.id} value={l.id}>{l.label} · {l.points} puntos</option>)}</SelectField>)}</fieldset>)}<Field label="Observación de la revisión" required value={reason} onChange={e=>setReason(e.target.value)}/>{error&&<Notice tone="danger">{error}</Notice>}<Button type="submit" loading={busy}>Guardar evaluación de la rúbrica</Button></form>}
 {admin&&<details><summary>Reglas aplicadas · motor {r.engineVersion}</summary>{r.trace.map((x:any,i:number)=><p className="small" key={i}>{t.questions.find(q=>q.id===x.questionId)?.text}: {x.state||`${label(x.dimension)} · ${x.contribution} × ${x.weight} = ${x.subtotal}`}</p>)}</details>}
 {admin&&r.state!=='pending-review'&&s.resultReleased===false&&<ReleaseResult id={s.id} released={false} onReleased={()=>void refreshSession()}/>}
 {(admin||s.resultReleased!==false)&&<div className="row"><Button variant="secondary" onClick={()=>setPdf(!pdf)}>{pdf?'Cerrar vista previa':'Vista previa del PDF'}</Button><a className="button button--secondary" target="_blank" rel="noreferrer" href={target||undefined}>Abrir PDF</a></div>}{pdf&&target&&<PdfViewer title={"Informe PDF de "+t.title} src={target}/>}
 </Card></>;
}
