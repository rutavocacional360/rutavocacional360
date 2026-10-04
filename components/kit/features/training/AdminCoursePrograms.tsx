"use client";
import {useEffect,useRef,useState} from 'react';
import {useRouter,useSearchParams} from 'next/navigation';
import {preparationLevel} from '../../data/school-training';
import {importSimulatorDocument} from '../../lib/import-simulator';
import {DOCUMENT_ACCEPT,DOCUMENT_FORMAT_LABEL,documentFileError} from '../../lib/document-formats';
import type {Course} from '../../lib/training-types';
import {Button,Card,Field,PageHeader,SelectField,Notice} from '../../components/ui/primitives';
import {Dialog} from '../../components/ui/Dialog';
import {CourseEditor,blankCourse,blankSimulator} from './TrainingEditors';
import {useTraining,trainingApi,TrainingError} from './shared';
import './training.css';

export const courseManagerHref=(level:string,id?:string,version?:number)=>{
 const query=new URLSearchParams({nivel:level,tipo:'curso'});
 if(id&&version){query.set('editar',id);query.set('version',String(version));}
 return '/admin/cursos?'+query;
};
export type CourseNavigationGuard={href:string;dirty:boolean;busy:boolean};
export function AdminCoursePrograms({imported,onSimulators,onNavigationGuardChange}:{imported?:{course:Course;message:string}|null;onSimulators:(level:string)=>void;onNavigationGuardChange?:(guard:CourseNavigationGuard|null)=>void}){
 const {data:d,error,busy,refresh,run}=useTraining(),router=useRouter(),params=useSearchParams();
 const [editing,setEditing]=useState<Course|null>(imported?.course||null),[snapshot,setSnapshot]=useState(imported?.course.version?JSON.stringify(imported.course):''),[message,setMessage]=useState(imported?.message||'');
 const [query,setQuery]=useState(''),[status,setStatus]=useState(''),[review,setReview]=useState(false),[importBusy,setImportBusy]=useState(false),[importError,setImportError]=useState(''),[progress,setProgress]=useState(''),[discard,setDiscard]=useState(false);
 const handledImport=useRef(imported),closed=useRef(''),saving=useRef(false);
 const pendingRoute=useRef<string|null>(imported?courseManagerHref(imported.course.educationLevel||'universidad',imported.course.id,imported.course.version).split('?')[1]:null);
 const navigate=(href:string,replace=false)=>{pendingRoute.current=href.split('?')[1]||'';if(replace)router.replace(href);else router.push(href);};
 const level=editing?.educationLevel||(params.get('nivel')==='bachillerato'?'bachillerato':'universidad');
 const dirty=!!editing&&JSON.stringify(editing)!==snapshot;
 const locked=busy||importBusy;
 const careers=(d?.careers||[]).filter((c:any)=>(c.educationLevel||'universidad')===level);
 const courses=(d?.courses||[]).filter((c:Course)=>preparationLevel(c.careerIds,c.educationLevel)===level);
 const editingHref=editing?courseManagerHref(level,editing.id,editing.version):'';
 useEffect(()=>{onNavigationGuardChange?.(editing?{href:editingHref,dirty,busy:locked}:null);},[!!editing,editingHref,dirty,locked,onNavigationGuardChange]);
 useEffect(()=>()=>onNavigationGuardChange?.(null),[onNavigationGuardChange]);
 useEffect(()=>{if(!dirty)return;const warn=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue='';};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[dirty]);
 useEffect(()=>{
  if(imported&&handledImport.current!==imported){handledImport.current=imported;setEditing(imported.course);setSnapshot(imported.course.version?JSON.stringify(imported.course):'');setMessage(imported.message);setReview(false);navigate(courseManagerHref(imported.course.educationLevel||'universidad',imported.course.id,imported.course.version),true);}
 },[imported]);
 useEffect(()=>{
  if(pendingRoute.current!==null){if(pendingRoute.current!==params.toString())return;pendingRoute.current=null;}
  if(!d)return;
  const id=params.get('editar'),version=Number(params.get('version'));
  if(editing){
   const sameDocument=editing.id&&editing.version?id===editing.id&&version===editing.version:!id;
   const routeLevel=params.get('nivel')==='bachillerato'?'bachillerato':'universidad';
   if(sameDocument&&routeLevel===level&&params.get('tipo')==='curso')return;
   if(dirty||locked){setMessage('Guarda los cambios o sal del editor antes de cambiar de apartado.');navigate(editingHref,true);return;}
   setEditing(null);setSnapshot('');setReview(false);setMessage('');
  }
  if(!id){closed.current='';return;}
  if(closed.current===id+':'+version)return;
  const value=d.courses?.find((c:Course)=>c.id===id&&c.version===version&&c.status==='draft');
  if(value){const draft={...structuredClone(value),educationLevel:preparationLevel(value.careerIds,value.educationLevel)};setEditing(draft);setSnapshot(JSON.stringify(draft));if(params.get('nivel')!==draft.educationLevel)navigate(courseManagerHref(draft.educationLevel,draft.id,draft.version),true);}
  else{setMessage('Este borrador ya no está disponible. Revisa el catálogo de cursos.');navigate(courseManagerHref(level),true);}
 },[d,params,editing,level,dirty,locked,editingHref]);
 const close=()=>{closed.current=(editing?.id||'')+':'+editing?.version;setEditing(null);setSnapshot('');setReview(false);navigate(courseManagerHref(level),true);};
 const save=(publish=false,exit=false)=>{
  if(!editing||locked||saving.current)return;
  saving.current=true;
  void run(async()=>{
   const saved=await trainingApi('/entity',{kind:'course',entity:{...editing,status:publish?'published':'draft'}});
   setEditing(saved);setSnapshot(JSON.stringify(saved));setMessage(publish?'Curso publicado correctamente. Sus actividades ya están disponibles para los estudiantes de esta ruta.':'Borrador del curso guardado correctamente.');
   if(publish||exit)close();else navigate(courseManagerHref(level,saved.id,saved.version),true);
  }).catch(()=>{}).finally(()=>{saving.current=false;});
 };
 const open=(course:Course)=>{closed.current='';const draft={...structuredClone(course),educationLevel:preparationLevel(course.careerIds,course.educationLevel),...(course.status==='draft'?{}:{status:'draft' as const,version:0,revision:0})};setEditing(draft);setSnapshot(draft.version?JSON.stringify(draft):'');setReview(false);setMessage('');navigate(courseManagerHref(level,draft.id,draft.version));};
 const upload=async(file:File)=>{
  if(locked||!d)return;
  const problem=documentFileError(file.name,file.size);if(problem){setImportError(problem);return;}
  setImportBusy(true);setImportError('');setProgress('Preparando el documento…');
  try{
   const result=await importSimulatorDocument(file,{...blankSimulator(),educationLevel:level},careers,setProgress);
   if(result.kind!=='course')throw Error('Este documento contiene preguntas de evaluación. Impórtalo desde Simuladores para revisar sus claves.');
   setEditing(result.course);setSnapshot('');setMessage(result.message);setReview(false);
   try{const saved=await trainingApi('/entity',{kind:'course',entity:result.course});setEditing(saved);setSnapshot(JSON.stringify(saved));navigate(courseManagerHref(level,saved.id,saved.version),true);await refresh();}
   catch(e){setMessage(result.message+' No se pudo guardar el borrador: '+(e as Error).message+'. Puedes reintentar con Guardar borrador.');}
  }catch(e){setImportError((e as Error).message);}finally{setImportBusy(false);setProgress('');}
 };
 const missing=editing?[
  ...(!editing.title.trim()?['Escribe el nombre del curso.']:[]),...(!editing.description.trim()?['Escribe una descripción.']:[]),...(!editing.objectives.trim()?['Completa los objetivos de aprendizaje.']:[]),
  ...(!editing.activities.length?['Añade al menos una actividad.']:[]),...editing.activities.flatMap((a,i)=>!a.title.trim()||!a.module.trim()||a.kind!=='simulator'&&!a.content.trim()?['Completa el título, módulo y contenido de la actividad '+(i+1)+'.']:[]),
  ...(editing.access==='selected'&&!editing.studentIds.length?['Selecciona los estudiantes destinatarios.']:[]),
 ]:[];
 if(editing&&d)return <div className="training course-manager"><PageHeader title={editing.title||'Crear curso'} description="Conserva las actividades, preguntas de reflexión y orientaciones del programa." actions={<Button variant="secondary" disabled={locked} onClick={()=>save(false,true)}>Guardar y volver</Button>}/><TrainingError error={error} retry={refresh}/>{message&&<Notice>{message}</Notice>}<p role="status">{locked?'Guardando…':dirty?'Cambios pendientes de guardar':'Borrador guardado'}</p><fieldset disabled={locked} className="manager-editor-fields stack">{review?<Card className="stack"><h2>Revisar y publicar curso</h2><p><strong>{editing.activities.length} actividades</strong> organizadas en {[...new Set(editing.activities.map(a=>a.module))].length} módulos.</p><p>Las lecciones se completan cuando el estudiante confirma su lectura y realización. Las reflexiones personales no tienen una clave correcta ni una nota automática.</p><p>{editing.access==='all'?'Disponible para todos los estudiantes de esta ruta.':'Disponible para los estudiantes seleccionados.'}</p><ol>{editing.activities.map(a=><li key={a.id}><strong>{a.title}</strong> · {a.module}<details><summary>Ver contenido</summary><div className="course-lesson-text">{a.content}</div></details></li>)}</ol>{missing.length>0&&<Notice tone="warning"><ul>{missing.map(problem=><li key={problem}>{problem}</li>)}</ul></Notice>}<div className="row"><Button variant="secondary" onClick={()=>setReview(false)}>Volver a editar</Button><Button disabled={missing.length>0} onClick={()=>save(true)}>Publicar curso</Button></div></Card>:<><CourseEditor value={editing} onChange={setEditing} data={{...d,careers,educationLevel:level}}/><Button onClick={()=>{setReview(true);window.scrollTo({top:0,behavior:'smooth'});}}>Revisar y publicar curso</Button></>}<Button variant="secondary" onClick={()=>save()}>Guardar borrador</Button></fieldset><Button variant="ghost" disabled={locked} onClick={()=>dirty?setDiscard(true):close()}>Salir sin guardar</Button><Dialog open={discard} title="Descartar cambios sin guardar" onClose={()=>setDiscard(false)}><p>Los cambios desde el último guardado se perderán.</p><div className="row"><Button variant="secondary" onClick={()=>setDiscard(false)}>Seguir editando</Button><Button variant="danger" onClick={()=>{setDiscard(false);close();}}>Descartar cambios</Button></div></Dialog></div>;
 return <div className="training course-manager"><PageHeader title="Cursos y actividades" description="Publica programas con lecciones y reflexiones, organizados por módulos." actions={<Button disabled={locked||!d} onClick={()=>open({...blankCourse(),educationLevel:level})}>Crear curso</Button>}/><div className="row"><Button variant="secondary" onClick={()=>onSimulators(level)}>Simuladores</Button><Button aria-pressed="true">Cursos y actividades</Button></div><nav className="ar-tabs" aria-label="Nivel de preparación">{(['bachillerato','universidad'] as const).map(value=><Button key={value} variant={value===level?'primary':'secondary'} aria-pressed={value===level} disabled={locked} onClick={()=>router.push(courseManagerHref(value))}>{value==='bachillerato'?'Bachillerato':'Universidad'}</Button>)}</nav><TrainingError error={error} retry={refresh}/>{message&&<Notice tone="success">{message}</Notice>}<Card className="stack"><h2>Importar un programa de actividades</h2><p>{DOCUMENT_FORMAT_LABEL}. Las dinámicas se conservan como lecciones, junto con sus instrucciones y reflexiones.</p><label className="simulator-import-file"><strong>Seleccionar documento del curso</strong><input type="file" accept={DOCUMENT_ACCEPT} disabled={locked||!d} onChange={e=>{const file=e.target.files?.[0];e.target.value='';if(file)void upload(file);}}/></label>{progress&&<p role="status">{progress}</p>}{importError&&<Notice tone="danger">{importError}</Notice>}</Card><div className="te-filters"><Field label="Buscar curso" type="search" value={query} onChange={e=>setQuery(e.target.value)}/><SelectField label="Estado" value={status} onChange={e=>setStatus(e.target.value)}><option value="">Todos los estados</option><option value="draft">Borradores</option><option value="published">Publicados</option><option value="archived">Archivados</option></SelectField></div>{!d&&!error&&<p role="status">Cargando cursos…</p>}{d&&!courses.length&&<Notice>Aún no hay cursos en esta ruta. Importa un programa o crea sus actividades.</Notice>}<div className="training-grid">{courses.filter((c:Course)=>c.title.toLocaleLowerCase().includes(query.toLocaleLowerCase())&&(!status||c.status===status)).map((course:Course)=><Card className="test-manager-card" key={course.id+':'+course.version}><small>{course.status==='published'?'Publicado':course.status==='draft'?'Borrador':'Archivado'} · Versión {course.version}</small><h2>{course.title}</h2><p>{course.activities.length} actividades · {[...new Set(course.activities.map(a=>a.module))].length} módulos</p><p>{course.description.slice(0,240)}</p><div className="row"><Button variant="secondary" disabled={locked} onClick={()=>open(course)}>{course.status==='draft'?'Editar borrador':'Editar curso'}</Button>{course.status==='published'&&<Button variant="ghost" disabled={locked} onClick={()=>void run(async()=>{await trainingApi('/archive',{kind:'course',id:course.id,version:course.version,revision:course.revision});setMessage('Curso archivado. Se conservan los avances anteriores.');}).catch(()=>{})}>Archivar</Button>}</div></Card>)}</div></div>;
}
