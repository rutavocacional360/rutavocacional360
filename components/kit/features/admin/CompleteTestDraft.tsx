import {useEffect,useRef,useState} from 'react';
import {Sparkles} from 'lucide-react';
import {completeTestDraft} from '../../lib/test-autofill';
import {testDraftIssues,type TestDraft,type DraftIssue} from '../../lib/test-draft-completion';
import {Button,Notice,TextareaField} from '../../components/ui/primitives';
import {testEditorIssues,type TestEditorIssue} from './test-editor-issues';

type Completion={completed:string[];review:string[];complete:boolean;issues:DraftIssue[];instrument:TestDraft};
function issueContext(instrument:TestDraft,issue:DraftIssue){
 const question=issue.questionId?instrument.questions.find(item=>item.id===issue.questionId):undefined;
 if(question)return JSON.stringify([question,question.options||instrument.options,instrument.scoring,instrument.dimensions,instrument.source,instrument.sourceId]);
 const fields=issue.step===0?['title','purpose','source','description','presentation','sourceId']:issue.step===3?['educationLevel','audience','studentIds','availableFrom','due','durationMinutes','resultPublication','releaseAt']:['questions','options','scoring','aggregation','dimensions','ranges','careerLinks','source','sourceId'];
 return JSON.stringify(fields.map(field=>instrument[field]));
}
export function CompleteTestDraft({instrument,onChange,onBusyChange,onReview,disabled=false}:{instrument:TestDraft;onChange:(instrument:TestDraft)=>void;onBusyChange?:(busy:boolean)=>void;onReview:(issue?:TestEditorIssue)=>void;disabled?:boolean}){
 const [context,setContext]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[result,setResult]=useState<Completion|null>(null);
 const identity=JSON.stringify(instrument),current=useRef(identity),latestChange=useRef(onChange),mounted=useRef(true),requestId=useRef(0),pending=useRef(false);
 current.current=identity;latestChange.current=onChange;
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;requestId.current++;};},[]);
 useEffect(()=>{if(pending.current){requestId.current++;pending.current=false;setBusy(false);setError('El borrador cambió durante la generación. Se conservaron tus cambios; vuelve a completar el test.');}},[identity]);
 useEffect(()=>{setContext('');setResult(null);setError('');},[instrument.id]);
 useEffect(()=>{onBusyChange?.(busy);return()=>onBusyChange?.(false);},[busy,onBusyChange]);
 const currentIssues=[...testDraftIssues(instrument),...(result?.issues||[]).filter(issue=>issueContext(instrument,issue)===issueContext(result!.instrument,issue))];
 const issues=testEditorIssues(instrument,currentIssues.filter((issue,index)=>currentIssues.findIndex(other=>other.questionId===issue.questionId&&other.step===issue.step&&other.message===issue.message)===index));
 const prepare=async()=>{
  if(disabled||pending.current)return;
  const request=++requestId.current,isCurrent=()=>mounted.current&&current.current===identity&&requestId.current===request;
  pending.current=true;setBusy(true);setError('');setResult(null);
  try{
   const proposal=await completeTestDraft(instrument,context);
   if(!isCurrent())return;
   pending.current=false;setBusy(false);
   setResult({completed:proposal.completed,review:proposal.review,complete:proposal.complete,issues:proposal.issues,instrument:structuredClone(proposal.instrument)});
   latestChange.current(proposal.instrument);
  }catch(error){if(isCurrent())setError(error instanceof Error?error.message:'No se pudo completar el test. Conservamos tu borrador para reintentar.');}
  finally{if(isCurrent()){pending.current=false;setBusy(false);}}
 };
 return <section className="te-ai-complete" aria-label="Completar borrador con IA" aria-busy={busy}>
  <div className="te-ai-heading"><div><h2>Completa el contenido del test</h2><p>La IA completa los campos vacíos y las preguntas. Tus textos y la configuración existente se conservan.</p></div><Button icon={<Sparkles size={18}/>} disabled={disabled||(!instrument.title.trim()&&!context.trim()&&!instrument.sourceId)} loading={busy} onClick={()=>void prepare()}>{busy?'Completando test…':'Completar test con IA'}</Button></div>
  <details className="te-ai-context" open={!instrument.title.trim()&&!instrument.sourceId}><summary>Tema e indicaciones para la IA</summary><TextareaField label="Qué debe explorar o evaluar el test" value={context} disabled={busy||disabled} maxLength={2000} onChange={event=>setContext(event.target.value)} placeholder="Ejemplo: explorar intereses en tecnología mediante 10 preguntas de escala, con lenguaje claro para estudiantes de bachillerato."/><p className="small muted">Puedes precisar el tema o aportar criterios. Revisa las preguntas y las reglas antes de publicar.</p></details>
  {busy&&<p className="te-ai-progress" role="status">Completando información, instrucciones, preguntas y opciones. Espera sin cerrar el editor.</p>}
  {error&&<Notice tone="danger"><p>{error}</p></Notice>}
  {result&&<div className="te-ai-result" aria-live="polite"><Notice tone={result.complete&&!issues.length?'success':'warning'}><strong>{result.complete&&!issues.length?'Borrador completado. Revisa antes de publicar.':'El borrador todavía necesita revisión.'}</strong>{!!result.completed.length&&<p>Completado: {result.completed.join(' · ')}.</p>}{!!issues.length&&<p>Quedan {issues.length} {issues.length===1?'campo por completar':'campos por completar'}.</p>}</Notice>{!!issues.length&&<ul className="te-ai-issues">{issues.map((issue,index)=><li key={index}><Button variant="ghost" onClick={()=>onReview(issue)}>{issue.label}</Button></li>)}</ul>}{!!result.review.length&&<details><summary>Aspectos por revisar ({result.review.length})</summary><ul>{result.review.map((message,index)=><li key={index}>{message}</li>)}</ul></details>}<div className="row"><Button variant="secondary" onClick={()=>onReview()}>Revisar test completo</Button></div></div>}
 </section>;
}
