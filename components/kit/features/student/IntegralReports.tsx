import {useEffect,useState} from 'react';
import {Download} from 'lucide-react';
import Link from 'next/link';
import {Button,Card,Notice,SectionTitle} from '../../components/ui/primitives';
import {Dialog} from '../../components/ui/Dialog';
import {previewAction,useSession} from '../../lib/session';
import {downloadIntegralReport} from '../../lib/reports';
import type {IntegralReport,IntegralSummary} from '../../lib/integral-report';

/** Existing copies remain readable; current reports and PDF use the results page. */
export function IntegralReports({studentId}:{studentId?:string}){
 const student=useSession().user?.role==='student';
 const[items,setItems]=useState<IntegralSummary[]>([]),[report,setReport]=useState<IntegralReport|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{let active=true;setItems([]);setReport(null);setError('');previewAction('reports/integral'+(studentId?'?studentId='+encodeURIComponent(studentId):'')).then(result=>{if(active)setItems(result.items||[]);}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[studentId]);
 const open=async(id:string)=>{setBusy(true);setError('');try{setReport(await previewAction('reports/integral/detail?id='+encodeURIComponent(id)));}catch(e){setError((e as Error).message);}finally{setBusy(false);}};
 return <><Card className="stack integral-reports"><SectionTitle title={student?'Copias históricas de mi orientación':'Informes integrales compartidos'}/><p className="muted">Consulta las copias guardadas anteriormente. Cada una conserva los resultados y la información de la fecha en que se creó.</p>{student&&<Link className="button button--secondary" href="/mi-ruta/resultados">Consultar mis resultados actuales y descargar el PDF</Link>}{!items.length&&<p className="small muted">{student?'No tienes copias históricas guardadas.':'Este estudiante no tiene copias históricas compartidas con su institución.'}</p>}{items.map(item=><div className="integral-history row between" key={item.id}><div><b>{new Date(item.createdAt).toLocaleString('es-EC')}</b><p className="small muted">{item.shared?'Compartido con la institución':'Solo para mí'} · {item.engineVersion}</p></div><Button size="sm" variant="secondary" disabled={busy} onClick={()=>void open(item.id)}>Ver copia guardada</Button></div>)}{error&&<Notice tone="danger">{error}</Notice>}</Card>
 <Dialog open={!!report} title="Copia histórica de orientación" onClose={()=>setReport(null)} wide>{report&&<article className="stack integral-document"><header><h2>{report.student.name}</h2><p>{new Date(report.createdAt).toLocaleString('es-EC')}</p><p className="small muted">Copia {report.id.slice(0,8)} · Reglas {report.engineVersion}</p><Button variant="secondary" icon={<Download size={17}/>} onClick={()=>downloadIntegralReport(report)}>Descargar copia histórica PDF</Button></header>{report.sections.map((section,i)=><section key={i}><h3>{section.title}</h3>{section.lines.map((line,j)=><p key={j}>{line}</p>)}</section>)}</article>}</Dialog></>;
}
