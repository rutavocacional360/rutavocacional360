"use client";
import {preparationLevel} from '../../data/school-training';
import {useEffect,useRef,useState} from 'react';
import {useRouter,useSearchParams} from 'next/navigation';
import {Upload,Plus} from 'lucide-react';
import {instrumentPresentation} from '../../lib/instrument-presentation';
import {importSimulatorDocument} from '../../lib/import-simulator';
import {PagedList} from '../../components/ui/PagedList';
import {Button,Card,Field,PageHeader,SelectField,Notice,TextareaField,Badge} from '../../components/ui/primitives';
import {Dialog} from '../../components/ui/Dialog';
import {useTraining,trainingApi,TrainingError,decimal} from './shared';
import {SimulatorEditor,blankSimulator} from './TrainingEditors';
import {TrainingResult} from './SimulatorRun';
import './training.css';
const managerHref=(level:string,id?:string,version?:number)=>{
 const query=new URLSearchParams({nivel:level});
 if(id&&version){query.set('editar',id);query.set('version',String(version));}
 return '/admin/cursos?'+query.toString();
};
export function AdminCourses(){
 const {data:d,error,busy,refresh,run}=useTraining();
 const router=useRouter(),params=useSearchParams();
 const [editing,setEditing]=useState<any>(null),[query,setQuery]=useState(''),[status,setStatus]=useState(''),[career,setCareer]=useState(''),[deleting,setDeleting]=useState<any>(null);
 const [editorBusy,setEditorBusy]=useState(false);
 const [importProgress,setImportProgress]=useState('');
 const closing=useRef('');
 const pendingRoute=useRef<string|null>(null);
 const navigate=(href:string,replace=false)=>{pendingRoute.current=href.split('?')[1]||'';if(replace)router.replace(href);else router.push(href);};
 const level: 'bachillerato'|'universidad'=editing?.educationLevel||(params.get('nivel')==='bachillerato'?'bachillerato':'universidad');
 const setLevel=(value:string)=>{navigate(managerHref(value));setQuery('');setStatus('');setSuccess('');};
 const scopedSimulators=(d?.simulators||[]).filter((s:any)=>preparationLevel(s.careerIds,s.educationLevel)===level);
 const scopedCareers=(d?.careers||[]).filter((c:any)=>(c.educationLevel||'universidad')===level);
 const [importOpen,setImportOpen]=useState(false),[importBusy,setImportBusy]=useState(false),[importError,setImportError]=useState(''),[importNotice,setImportNotice]=useState(''),[importMode,setImportMode]=useState<'file'|'html'>('file'),[html,setHtml]=useState('');
 const importDocument=async(file:File)=>{
  if(!d||importBusy)return;
  const category=level;
  setImportBusy(true);setImportError('');setImportProgress('Preparando el documento…');
  try{
   const result=await importSimulatorDocument(file,{...blankSimulator(),educationLevel:category},scopedCareers,setImportProgress);
   const draft={...result.simulator,educationLevel:category,status:'draft'};
   setEditing(draft);setSavedSnapshot('');setSuccess('');setImportNotice(result.message);setImportOpen(false);setHtml('');
   try{
    const saved=await trainingApi('/entity',{kind:'simulator',entity:draft});
    setEditing(saved);setSavedSnapshot(JSON.stringify(saved));setSuccess('Documento importado y guardado como borrador.');
    navigate(managerHref(category,saved.id,saved.version),true);await refresh();
   }catch(e){setImportNotice(result.message+' No se pudo guardar el borrador: '+(e as Error).message+' Usa Guardar borrador para reintentar.');}
  }catch(e){setImportError((e as Error).message);}finally{setImportBusy(false);setImportProgress('');}
 };
 const perform=(fn:()=>Promise<any>)=>run(fn).catch(()=>{});
 const [success,setSuccess]=useState(''),[savedSnapshot,setSavedSnapshot]=useState(''),[discarding,setDiscarding]=useState(false);
 const scopedAttempts=(d?.attempts||[]).filter((a:any)=>a.simulator?.educationLevel===level);
 const dirty=!!editing&&JSON.stringify(editing)!==savedSnapshot;
 useEffect(()=>{if(!dirty)return;const warn=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue='';};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[dirty]);
 useEffect(()=>{
  if(pendingRoute.current!==null){if(pendingRoute.current!==params.toString())return;pendingRoute.current=null;}
  const id=params.get('editar'),version=Number(params.get('version'));
  if(editing){
   const sameDocument=editing.id&&editing.version?id===editing.id&&version===editing.version:!id;
   const sameLevel=(params.get('nivel')==='bachillerato'?'bachillerato':'universidad')===editing.educationLevel;
   if(sameDocument&&sameLevel)return;
   if(dirty||busy||editorBusy||importBusy){setImportNotice('Guarda los cambios o sal del editor antes de cambiar de apartado.');navigate(managerHref(level,editing.id,editing.version),true);return;}
   closing.current='';setEditing(null);setSavedSnapshot('');setImportNotice('');return;
  }
  if(!id){closing.current='';return;}
  if(!d||closing.current===id+':'+version)return;
  const item=d.simulators.find((s:any)=>s.id===id&&s.version===version&&s.status==='draft');
  if(item){const value={...structuredClone(item),educationLevel:preparationLevel(item.careerIds,item.educationLevel)};setSavedSnapshot(JSON.stringify(value));setEditing(value);if(params.get('nivel')!==value.educationLevel)navigate(managerHref(value.educationLevel,item.id,item.version),true);}
  else{setSuccess('Este borrador ya no está disponible. Revisa el catálogo de simuladores.');navigate(managerHref(level),true);}
 },[params,d,editing,level,router,dirty,busy,editorBusy,importBusy]);
 const openEditor=(value:any)=>{value={...value,educationLevel:preparationLevel(value.careerIds,value.educationLevel)};closing.current='';setSuccess('');setImportNotice('');setSavedSnapshot(value.id&&value.version?JSON.stringify(value):'');setEditing(value);navigate(managerHref(value.educationLevel,value.id,value.version));};
 const closeEditor=()=>{closing.current=(editing?.id||'')+':'+editing?.version;setEditing(null);navigate(managerHref(level),true);};
 const save=(publish=false,close=false)=>perform(async()=>{
  if(editorBusy||importBusy)return;
  const e=await trainingApi('/entity',{kind:'simulator',entity:{...editing,status:publish?'published':'draft'}});
  setSavedSnapshot(JSON.stringify(e));setSuccess(publish?'Simulador publicado correctamente.':'Borrador guardado correctamente.');
  if(publish||close){setQuery('');setStatus('');setCareer('');closeEditor();}
  else{setEditing(e);navigate(managerHref(level,e.id,e.version),true);}
 });
 const changeStatus=(simulator:any,restore=false)=>perform(async()=>{
  await trainingApi(restore?'/restore':'/archive',{kind:'simulator',id:simulator.id,version:simulator.version,revision:simulator.revision});
  setSuccess(restore?'Simulador restaurado y disponible.':'Simulador archivado. Los resultados anteriores se conservan.');
 });
 const list=(d?.simulators||[]).filter((s:any)=>preparationLevel(s.careerIds,s.educationLevel)===level&&s.title.toLocaleLowerCase().includes(query.toLocaleLowerCase())&&(!status||s.status===status)&&(!career||s.careerIds?.includes(career)));
 const editorLocked=busy||editorBusy||importBusy;
 if(editing&&d)return <div className="training simulator-manager"><PageHeader title={editing.title||'Crear simulador'} description="Importa o crea preguntas, revisa sus claves y elige las opciones de estudio que recibirán la preparación." actions={<Button variant="secondary" disabled={editorLocked} onClick={()=>save(false,true)}>Guardar y volver</Button>}/><TrainingError error={error} retry={refresh}/>{importNotice&&<Notice>{importNotice}</Notice>}<p role="status" aria-live="polite">{busy?'Guardando…':dirty?'Cambios pendientes de guardar':success||'Sin cambios pendientes'}</p><fieldset className="manager-editor-fields" disabled={editorLocked}><SimulatorEditor value={editing} onChange={value=>{setEditing(value);setImportNotice('');}} data={{...d,careers:scopedCareers,educationLevel:level}} saving={busy||importBusy} onBusyChange={setEditorBusy} onSave={()=>save()} onPublish={()=>save(true)}/></fieldset><Button variant="ghost" disabled={editorLocked} onClick={()=>dirty?setDiscarding(true):closeEditor()}>Salir sin guardar</Button><Dialog open={discarding} title="Descartar cambios sin guardar" onClose={()=>setDiscarding(false)}><p>Los cambios desde el último guardado se perderán.</p><div className="row"><Button variant="secondary" onClick={()=>setDiscarding(false)}>Seguir editando</Button><Button variant="danger" onClick={()=>{setDiscarding(false);closeEditor();setSuccess('');}}>Descartar cambios</Button></div></Dialog></div>;
 return <div className="training simulator-manager"><PageHeader title="Simuladores y preguntas" description="Crea, importa y publica preparación para Bachillerato o Universidad." actions={<div className="row"><Button variant="secondary" icon={<Upload size={17}/>} disabled={!d||busy} onClick={()=>{setImportOpen(true);setImportError('');}}>Importar documento</Button><Button icon={<Plus size={18}/>} disabled={!d||busy} onClick={()=>{setImportNotice('');openEditor({...blankSimulator(),educationLevel:level as 'bachillerato'|'universidad'});}}>Crear simulador</Button></div>}/>{success&&<div role="status"><Notice tone="success">{success}</Notice></div>}<nav className="ar-tabs" aria-label="Nivel de preparación"><Button variant={level==='bachillerato'?'primary':'secondary'} aria-pressed={level==='bachillerato'} disabled={busy} onClick={()=>{setLevel('bachillerato');setCareer('');}}>Bachillerato</Button><Button variant={level==='universidad'?'primary':'secondary'} aria-pressed={level==='universidad'} disabled={busy} onClick={()=>{setLevel('universidad');setCareer('');}}>Universidad</Button></nav><p className="muted">{level==='bachillerato'?'Para estudiantes de EGB Superior que pasarán a BGU: Ciencias, áreas de exploración y figuras técnicas.':'Para estudiantes de BGU que preparan su paso a educación superior.'}</p><TrainingError error={error} retry={refresh}/>{!d&&!error&&<p role="status">Cargando simuladores…</p>}{d&&<>
 <div className="manager-summary"><div><b>{scopedSimulators.length}</b><span>Simuladores</span></div><div><b>{scopedSimulators.filter((s:any)=>s.status==='published').length}</b><span>Disponibles</span></div><div><b>{scopedSimulators.filter((s:any)=>s.status==='draft').length}</b><span>Borradores</span></div><Badge>Catálogo de simuladores</Badge></div>
 <div className="te-filters simulator-filters"><Field label="Buscar simulador" type="search" value={query} onChange={e=>setQuery(e.target.value)}/><SelectField label="Estado" value={status} onChange={e=>setStatus(e.target.value)}><option value="">Todos los estados</option><option value="draft">Borradores</option><option value="published">Publicados</option><option value="archived">Archivados</option></SelectField><SelectField label="Opción de estudio" value={career} onChange={e=>setCareer(e.target.value)}><option value="">Todas las opciones asignadas</option>{scopedCareers.filter((c:any)=>d.simulators.some((s:any)=>s.careerIds?.includes(c.id))).map((c:any)=><option key={c.id} value={c.id}>{c.name}</option>)}</SelectField></div>
 {!scopedSimulators.length&&<div className="training-empty"><h2>Prepara tu primer simulador</h2><p>Importa PDF con texto, Word o HTML, o escribe las preguntas. Revisa las claves y asigna las áreas o figuras de Bachillerato, o las carreras universitarias.</p></div>}
 <PagedList className="test-manager-list" label="simuladores" resetKey={JSON.stringify([level,query,status,career])}>{list.map((s:any)=><Card className="test-manager-card" key={s.id+':'+s.version}><div className="row between"><Badge tone={s.status==='published'?'success':'neutral'}>{s.status==='published'?'Publicado':s.status==='draft'?'Borrador':'Archivado'}</Badge></div><h2>{instrumentPresentation({...s.instrument,title:s.title}).title}</h2><p className="muted small">{instrumentPresentation({...s.instrument,title:s.title}).summary||'Preparación con preguntas y calificación automática.'}</p><dl className="test-facts"><div><dt>Preguntas</dt><dd>{s.questionCount??s.questions.length}</dd></div><div><dt>Tiempo de examen</dt><dd>{s.durationMinutes} minutos</dd></div><div><dt>Versión</dt><dd>{s.version}</dd></div><div><dt>Opciones de estudio</dt><dd>{s.careerIds?.length||0}</dd></div></dl><details className="test-actions"><summary>Gestionar simulador</summary><p className="small muted">{(s.careerIds||[]).map((id:string)=>d.careers.find((c:any)=>c.id===id)?.name).filter(Boolean).join(' · ')||'Selecciona carreras antes de publicar'}</p><fieldset disabled={busy} className="test-action-buttons manager-editor-fields">{s.status==='draft'?<><Button size="sm" variant="secondary" onClick={()=>{setImportNotice('');openEditor(structuredClone(s));}}>Editar borrador</Button><Button size="sm" variant="danger" onClick={()=>setDeleting(s)}>Eliminar borrador</Button></>:<><Button size="sm" variant="secondary" onClick={()=>{setImportNotice('');openEditor({...structuredClone(s),version:0,revision:0,status:'draft'});}}>Editar simulador</Button>{s.status==='published'&&<Button size="sm" variant="ghost" onClick={()=>changeStatus(s)}>Archivar</Button>}{s.status==='archived'&&!d.simulators.some((other:any)=>other.id===s.id&&other.version>s.version&&other.status!=='draft')&&<Button size="sm" variant="secondary" onClick={()=>changeStatus(s,true)}>Restaurar publicación</Button>}<Button size="sm" variant="danger" onClick={()=>setDeleting(s)}>Eliminar simulador</Button></>}<Button size="sm" variant="ghost" onClick={()=>{setImportNotice('');openEditor({...structuredClone(s),id:'',title:s.title+' (copia)',version:0,revision:0,status:'draft'});}}>Duplicar</Button></fieldset></details></Card>)}</PagedList>
 <details className="simulator-history"><summary>Progreso y notas de estudiantes · {scopedAttempts.length} intentos</summary><PagedList className="stack" label="intentos">{scopedAttempts.map((a:any)=><details key={a.id}><summary>{a.name} · {a.instrument.title} · {a.result?.percent!=null?decimal(a.result.percent)+' / 100':'En progreso'}</summary>{a.result?<TrainingResult attempt={a}/>:<p>El estudiante continúa su preparación.</p>}</details>)}</PagedList></details>
 </>}<Dialog open={importOpen} title="Importar simulador desde un documento" onClose={()=>{if(!importBusy)setImportOpen(false);}} wide><div className="stack"><p className="muted">Carga Word (.docx), PDF con texto o HTML, hasta 10 MB. Después revisa preguntas, claves, puntajes, tiempo y opciones de estudio antes de publicar.</p><div className="row"><Button variant={importMode==='file'?'primary':'secondary'} disabled={importBusy} onClick={()=>setImportMode('file')}>Subir archivo</Button><Button variant={importMode==='html'?'primary':'secondary'} disabled={importBusy} onClick={()=>setImportMode('html')}>Pegar código HTML</Button></div>{importMode==='file'?<label className="simulator-import-file">Selecciona tu documento<span className="button button--secondary">Seleccionar archivo</span><input className="sr-only" aria-label="Seleccionar documento del simulador" type="file" accept=".docx,.pdf,.html,.htm" disabled={importBusy} onChange={e=>{const file=e.target.files?.[0];if(file)void importDocument(file);e.target.value='';}}/></label>:<><TextareaField label="Código HTML del simulador" rows={8} value={html} disabled={importBusy} onChange={e=>setHtml(e.target.value)}/><Button loading={importBusy} disabled={!html.trim()} onClick={()=>void importDocument(new File([html],'simulador.html',{type:'text/html'}))}>Importar HTML</Button></>}{importBusy&&<p role="status">{importProgress}</p>}{importError&&<Notice tone="danger">{importError}</Notice>}</div></Dialog><Dialog open={!!deleting} title={deleting?.status==='draft'?'Eliminar borrador':'Eliminar simulador'} onClose={()=>{if(!busy)setDeleting(null);}}><p>Se eliminará {deleting?.title}{deleting?.status!=='draft'?' y todas sus versiones del catálogo. No estará disponible para nuevos intentos.':'.'} Los resultados e intentos anteriores se conservan.</p>{error&&<Notice tone="danger">{error}</Notice>}<div className="row"><Button variant="secondary" disabled={busy} onClick={()=>setDeleting(null)}>Cancelar</Button><Button variant="danger" loading={busy} onClick={()=>perform(async()=>{await trainingApi(deleting.status==='draft'?'/delete-draft':'/delete-simulator',{kind:'simulator',id:deleting.id,version:deleting.version,revision:deleting.revision});setDeleting(null);setSuccess('Eliminado correctamente. Los resultados anteriores se conservan.');})}>Confirmar eliminación</Button></div></Dialog></div>;
}
