"use client";
import {useEffect,useRef,useState} from 'react';
import {useRouter,useSearchParams} from 'next/navigation';
import {preparationLevel} from '../../data/school-training';
import {importSimulatorDocument} from '../../lib/import-simulator';
import {DOCUMENT_ACCEPT,DOCUMENT_FORMAT_LABEL,documentFileError} from '../../lib/document-formats';
import type {Course} from '../../lib/training-types';
import {courseFamilies} from '../../lib/course-catalog';
import {courseContentKey} from '../../lib/training-content';
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
 const importedDraft=imported?.course.status==='draft'?imported.course:null;
 const [editing,setEditing]=useState<Course|null>(importedDraft),[snapshot,setSnapshot]=useState(importedDraft?.version?JSON.stringify(importedDraft):''),[message,setMessage]=useState(imported?.message||'');
 const [query,setQuery]=useState(''),[status,setStatus]=useState(''),[review,setReview]=useState(false),[importBusy,setImportBusy]=useState(false),[importError,setImportError]=useState(''),[progress,setProgress]=useState(''),[discard,setDiscard]=useState(false);
 const [deleting,setDeleting]=useState<{course:Course;draftOnly:boolean}|null>(null);
 const handledImport=useRef(imported),closed=useRef(''),saving=useRef(false),importing=useRef(false);
 const pendingRoute=useRef<string|null>(imported?courseManagerHref(imported.course.educationLevel||'universidad',importedDraft?.id,importedDraft?.version).split('?')[1]:null);
 const navigate=(href:string,replace=false)=>{pendingRoute.current=href.split('?')[1]||'';if(replace)router.replace(href);else router.push(href);};
 const level=editing?.educationLevel||(params.get('nivel')==='bachillerato'?'bachillerato':'universidad');
 const dirty=!!editing&&JSON.stringify(editing)!==snapshot;
 const locked=busy||importBusy;
 const careers=(d?.careers||[]).filter((c:any)=>(c.educationLevel||'universidad')===level);
 const courses=(d?.courses||[]).filter((c:Course)=>preparationLevel(c.careerIds,c.educationLevel)===level);
 const families=courseFamilies<Course>(courses);
 const contentKeys=new Map(families.map(family=>[family.current,courseContentKey(family.current)]));
 const visible=families.filter(family=>family.versions.some(course=>course.title.toLocaleLowerCase().includes(query.toLocaleLowerCase()))&&(!status||(status==='published'?!!family.published:status==='draft'?!!family.draft:!family.published&&!family.draft)));
 const editingHref=editing?courseManagerHref(level,editing.id,editing.version):'';
 useEffect(()=>{onNavigationGuardChange?.(editing?{href:editingHref,dirty,busy:locked}:null);},[!!editing,editingHref,dirty,locked,onNavigationGuardChange]);
 useEffect(()=>()=>onNavigationGuardChange?.(null),[onNavigationGuardChange]);
 useEffect(()=>{if(!dirty)return;const warn=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue='';};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[dirty]);
 useEffect(()=>{
  if(imported&&handledImport.current!==imported){const draft=imported.course.status==='draft'?imported.course:null;handledImport.current=imported;setEditing(draft);setSnapshot(draft?.version?JSON.stringify(draft):'');setMessage(imported.message);setReview(false);navigate(courseManagerHref(imported.course.educationLevel||'universidad',draft?.id,draft?.version),true);}
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
 const open=(course:Course)=>{closed.current='';const existing=course.id?courses.find((item:Course)=>item.id===course.id&&item.status==='draft'):undefined;const source=course.status==='draft'?course:existing||course;const draft={...structuredClone(source),educationLevel:preparationLevel(source.careerIds,source.educationLevel),...(source.status==='draft'?{}:{status:'draft' as const,version:0,revision:0})};setEditing(draft);setSnapshot(draft.version?JSON.stringify(draft):'');setReview(false);setMessage('');navigate(courseManagerHref(level,draft.id,draft.version));};
 const changeStatus=(course:Course,restore=false)=>void run(async()=>{await trainingApi(restore?'/restore':'/archive',{kind:'course',id:course.id,version:course.version,revision:course.revision});setMessage(restore?'Curso restaurado y disponible.':'Curso archivado. Se conservan los avances anteriores.');}).catch(()=>{});
 const remove=()=>{if(!deleting||locked)return;const {course,draftOnly}=deleting;void run(async()=>{await trainingApi(draftOnly?'/delete-draft':'/delete-course',{kind:'course',id:course.id,version:course.version,revision:course.revision});setDeleting(null);setMessage(draftOnly?'Borrador eliminado.':'Curso eliminado del catálogo. Se conservan los avances e informes anteriores.');}).catch(()=>{});};
 const upload=async(file:File)=>{
  if(locked||importing.current||!d)return;
  const problem=documentFileError(file.name,file.size);if(problem){setImportError(problem);return;}
  importing.current=true;setImportBusy(true);setImportError('');setProgress('Preparando el documento…');
  try{
   const result=await importSimulatorDocument(file,{...blankSimulator(),educationLevel:level},careers,setProgress);
   if(result.kind!=='course')throw Error('Este documento contiene preguntas de evaluación. Impórtalo desde Simuladores para revisar sus claves.');
   setEditing(result.course);setSnapshot('');setMessage(result.message);setReview(false);
   try{const saved=await trainingApi('/entity',{kind:'course',entity:result.course});
    if(saved.status==='draft'){setEditing(saved);setSnapshot(JSON.stringify(saved));navigate(courseManagerHref(level,saved.id,saved.version),true);}
    else{setEditing(null);setSnapshot('');navigate(courseManagerHref(level),true);}
    if(courses.some((course:Course)=>course.id===saved.id))setMessage('Este documento ya tiene un curso en esta ruta. Se recuperó el contenido guardado, con sus cambios.');
    await refresh();}
   catch(e){setMessage(result.message+' No se pudo guardar el borrador: '+(e as Error).message+'. Puedes reintentar con Guardar borrador.');}
  }catch(e){setImportError((e as Error).message);}finally{importing.current=false;setImportBusy(false);setProgress('');}
 };
 const missing=editing?[
  ...(!editing.title.trim()?['Escribe el nombre del curso.']:[]),...(!editing.description.trim()?['Escribe una descripción.']:[]),...(!editing.objectives.trim()?['Completa los objetivos de aprendizaje.']:[]),
  ...(!editing.activities.length?['Añade al menos una actividad.']:[]),...editing.activities.flatMap((a,i)=>!a.title.trim()||!a.module.trim()||a.kind!=='simulator'&&!a.content.trim()?['Completa el título, módulo y contenido de la actividad '+(i+1)+'.']:[]),
  ...(editing.activities.length&&!editing.activities.some(a=>a.required)?['Marca al menos una actividad como obligatoria.']:[]),
  ...editing.activities.flatMap((a,i)=>a.kind==='simulator'&&!d?.simulators.some((s:any)=>s.id===a.simulatorId&&s.version===a.simulatorVersion&&s.status==='published'&&preparationLevel(s.careerIds,s.educationLevel)===level)?['Selecciona un simulador publicado de esta ruta para la actividad '+(i+1)+'.']:[]),
  ...(editing.access==='selected'&&!editing.studentIds.length?['Selecciona los estudiantes destinatarios.']:[]),
 ]:[];
 if(editing&&d)return <div className="training course-manager"><PageHeader title={editing.title||'Crear curso'} description="Conserva las actividades, preguntas de reflexión y orientaciones del programa." actions={<Button variant="secondary" disabled={locked} onClick={()=>save(false,true)}>Guardar y volver</Button>}/><TrainingError error={error} retry={refresh}/>{message&&<Notice>{message}</Notice>}<p role="status">{locked?'Guardando…':dirty?'Cambios pendientes de guardar':'Borrador guardado'}</p><fieldset disabled={locked} className="manager-editor-fields stack">{review?<Card className="stack"><h2>Revisar y publicar curso</h2><p><strong>{editing.activities.length} actividades</strong> organizadas en {[...new Set(editing.activities.map(a=>a.module))].length} módulos.</p><p>Las lecciones se completan cuando el estudiante confirma su lectura y realización. Las reflexiones personales no tienen una clave correcta ni una nota automática.</p><p>{editing.access==='all'?'Disponible para todos los estudiantes de esta ruta.':'Disponible para los estudiantes seleccionados.'}</p><ol>{editing.activities.map(a=><li key={a.id}><strong>{a.title}</strong> · {a.module}<details><summary>Ver contenido</summary><div className="course-lesson-text">{a.content}</div></details></li>)}</ol>{missing.length>0&&<Notice tone="warning"><ul>{missing.map(problem=><li key={problem}>{problem}</li>)}</ul></Notice>}<div className="row"><Button variant="secondary" onClick={()=>setReview(false)}>Volver a editar</Button><Button disabled={missing.length>0} onClick={()=>save(true)}>Publicar curso</Button></div></Card>:<><CourseEditor value={editing} onChange={setEditing} data={{...d,careers,educationLevel:level}}/><Button onClick={()=>{setReview(true);window.scrollTo({top:0,behavior:'smooth'});}}>Revisar y publicar curso</Button></>}<Button variant="secondary" onClick={()=>save()}>Guardar borrador</Button></fieldset><Button variant="ghost" disabled={locked} onClick={()=>dirty?setDiscard(true):close()}>Salir sin guardar</Button><Dialog open={discard} title="Descartar cambios sin guardar" onClose={()=>setDiscard(false)}><p>Los cambios desde el último guardado se perderán.</p><div className="row"><Button variant="secondary" onClick={()=>setDiscard(false)}>Seguir editando</Button><Button variant="danger" onClick={()=>{setDiscard(false);close();}}>Descartar cambios</Button></div></Dialog></div>;
 return <div className="training course-manager">
  <PageHeader title="Cursos y actividades" description="Publica programas con lecciones y reflexiones, organizados por módulos." actions={<Button disabled={locked||!d} onClick={()=>open({...blankCourse(),educationLevel:level})}>Crear curso</Button>}/>
  <div className="row"><Button variant="secondary" disabled={locked} onClick={()=>onSimulators(level)}>Simuladores</Button><Button aria-pressed="true">Cursos y actividades</Button></div>
  <nav className="ar-tabs" aria-label="Nivel de preparación">{(['bachillerato','universidad'] as const).map(value=><Button key={value} variant={value===level?'primary':'secondary'} aria-pressed={value===level} disabled={locked} onClick={()=>{setQuery('');setStatus('');setMessage('');router.push(courseManagerHref(value));}}>{value==='bachillerato'?'Bachillerato':'Universidad'}</Button>)}</nav>
  <TrainingError error={error} retry={refresh}/>{message&&<Notice tone="success">{message}</Notice>}
  <Card className="stack"><h2>Importar un programa de actividades</h2><p>{DOCUMENT_FORMAT_LABEL}. Las dinámicas se conservan como lecciones, junto con sus instrucciones y reflexiones.</p><label className="simulator-import-file"><strong>Seleccionar documento del curso</strong><input type="file" accept={DOCUMENT_ACCEPT} disabled={locked||!d} onChange={e=>{const file=e.target.files?.[0];e.target.value='';if(file)void upload(file);}}/></label>{progress&&<p role="status">{progress}</p>}{importError&&<Notice tone="danger">{importError}</Notice>}</Card>
  <div className="te-filters"><Field label="Buscar curso" type="search" value={query} onChange={e=>setQuery(e.target.value)}/><SelectField label="Estado" value={status} onChange={e=>setStatus(e.target.value)}><option value="">Todos los estados</option><option value="draft">Borradores</option><option value="published">Publicados</option><option value="archived">Archivados</option></SelectField></div>
  {!d&&!error&&<p role="status">Cargando cursos…</p>}{d&&!courses.length&&<Notice>Aún no hay cursos en esta ruta. Importa un programa o crea sus actividades.</Notice>}{d&&courses.length>0&&!visible.length&&<Notice>No hay cursos que coincidan con estos filtros.</Notice>}
  <div className="training-grid">{visible.map(({current:course,draft,published,versions})=>{
   const duplicate=families.some(family=>family.current.id!==course.id&&contentKeys.get(family.current)===contentKeys.get(course));
   const archived=versions.filter(version=>version.status==='archived');
   return <Card className="test-manager-card" key={course.id}>
    <small>{published?'Publicado':draft?'Borrador':'Archivado'} · Versión {course.version}{published&&draft?' · Cambios en borrador v'+draft.version:''}</small>
    <h2>{course.title||'Curso sin título'}</h2><p>{course.activities.length} actividades · {[...new Set(course.activities.map(a=>a.module))].length} módulos</p><p>{course.description.slice(0,240)}</p>
    {duplicate&&<details><summary>Revisar contenido repetido</summary><p>Hay otra ficha con las mismas actividades y configuración. Puedes revisar ambas antes de eliminar una copia.</p></details>}
    <div className="row"><Button variant="secondary" disabled={locked} onClick={()=>open(draft||course)}>{draft?'Editar borrador':'Editar curso'}</Button>{published&&<Button variant="ghost" disabled={locked} onClick={()=>changeStatus(published)}>Archivar</Button>}{course.status==='archived'&&<Button variant="secondary" disabled={locked} onClick={()=>changeStatus(course,true)}>Restaurar publicación</Button>}<Button variant="danger" disabled={locked} onClick={()=>setDeleting({course:versions[0],draftOnly:false})}>Eliminar curso</Button></div>
    {(draft||archived.length>0)&&<details><summary>Gestionar versiones ({versions.length})</summary><div className="stack">{versions.map(version=><div key={version.version}><p><strong>Versión {version.version}</strong> · {version.status==='draft'?'Borrador':version.status==='published'?'Publicada':'Archivada'}{version.title!==course.title?' · '+version.title:''}</p>{version.status==='draft'&&<div className="row"><Button size="sm" variant="secondary" disabled={locked} onClick={()=>open(version)}>Editar borrador v{version.version}</Button><Button size="sm" variant="danger" disabled={locked} onClick={()=>setDeleting({course:version,draftOnly:true})}>Eliminar borrador v{version.version}</Button></div>}{version.status==='archived'&&!published&&!versions.some(other=>other.version>version.version&&other.status!=='draft')&&<Button size="sm" variant="secondary" disabled={locked} onClick={()=>changeStatus(version,true)}>Restaurar versión {version.version}</Button>}</div>)}</div></details>}
   </Card>;
  })}</div>
  <Dialog open={!!deleting} title={deleting?.draftOnly?'Eliminar borrador':'Eliminar curso'} onClose={()=>{if(!locked)setDeleting(null);}}><p>{deleting?.draftOnly?'Se eliminará únicamente el borrador seleccionado.':'Se eliminarán todas las versiones de este curso del catálogo.'} <strong>{deleting?.course.title}</strong></p><p>Los avances y resultados anteriores de los estudiantes se conservan. Esta acción no se puede deshacer.</p>{error&&<Notice tone="danger">{error}</Notice>}<div className="row"><Button variant="secondary" disabled={locked} onClick={()=>setDeleting(null)}>Cancelar</Button><Button variant="danger" disabled={locked} onClick={remove}>{locked?'Eliminando…':deleting?.draftOnly?'Confirmar eliminación del borrador':'Confirmar eliminación del curso'}</Button></div></Dialog>
 </div>;
}
