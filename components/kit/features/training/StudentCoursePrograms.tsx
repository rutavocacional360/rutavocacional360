"use client";
import {useEffect,useRef,useState} from 'react';
import {ArrowLeft,ArrowRight,BookOpen,Check,ChevronRight,FileText,Link as LinkIcon,Paperclip,PlayCircle} from 'lucide-react';
import {preparationLevel,trainingTargetMatches} from '../../data/school-training';
import type {Course} from '../../lib/training-types';
import {activityInstructionText} from '../../lib/activity-responses';
import {Button,Card,Notice,SelectField} from '../../components/ui/primitives';
import {trainingApi} from './shared';
import {ActivityResponseForm} from './ActivityResponseForm';
import {ActivityAttachments} from './ActivityMedia';
import './course-reader.css';

/** Activities and answers always belong to the enrolled version. */
export function StudentCoursePrograms({data,level,career,busy,run,onStartSimulator,requestedCourseId='',requestedActivityId='',onNavigate,onReadingChange}:{
 data:any;level:'bachillerato'|'universidad';career:string;busy:boolean;
 run:(task:()=>Promise<any>)=>Promise<any>;onStartSimulator:(attempt:any)=>void;
 requestedCourseId?:string;requestedActivityId?:string;
 onNavigate?:(courseId:string,activityId:string)=>void;onReadingChange?:(reading:boolean)=>void;
}){
 const [activeId,setActiveId]=useState(requestedCourseId),[activityId,setActivityId]=useState(requestedActivityId);
 const [responsePending,setResponsePending]=useState(false),[openedEnrollment,setOpenedEnrollment]=useState<any>(null);
 const heading=useRef<HTMLHeadingElement>(null),focusActivity=useRef(false);
 const enrollmentFor=(id:string)=>(data.enrollments||[]).find((e:any)=>e.course_id===id)||(openedEnrollment?.course_id===id?openedEnrollment:null);
 // Retain authorized historical enrollments even after their publication is archived.
 const available=new Map<string,Course>((data.courses||[]).map((course:Course)=>[course.id,course]));
 for(const saved of data.enrollments||[]){if(saved.snapshot&&!saved.course_id.startsWith('direct:')&&!available.has(saved.course_id))available.set(saved.course_id,saved.snapshot);}
 const courses=[...available.values()].filter(course=>{
  const snapshot:Course=enrollmentFor(course.id)?.snapshot||course;
  return preparationLevel(snapshot.careerIds,snapshot.educationLevel)===level&&(!career||(snapshot.type==='general'&&snapshot.educationLevel===level&&!snapshot.careerIds.length&&!snapshot.fields?.length)||trainingTargetMatches(snapshot.careerIds,career)||snapshot.fields?.includes(data.careers?.find((c:any)=>c.id===career)?.area));
 });
 const listed=courses.find(course=>course.id===activeId),enrollment=listed?enrollmentFor(listed.id):null;
 const active:Course|undefined=listed&&enrollment?(enrollment.snapshot||listed):undefined;
 const completed:string[]=enrollment?.completed||[];
 const activity=active?.activities.find(a=>a.id===activityId)||active?.activities.find(a=>a.id===enrollment?.next?.id)||active?.activities.find(a=>!completed.includes(a.id))||active?.activities[0];
 const preview=listed&&!enrollment&&requestedCourseId===activeId;
 const simulator=(data.simulators||[]).find((s:any)=>s.id===activity?.simulatorId&&s.version===activity?.simulatorVersion);
 const availableModes:string[]=(activity&&enrollment?.activityModes?.[activity.id])||simulator?.modes||[];
 const mode=availableModes.includes('practice')?'practice':availableModes[0];
 useEffect(()=>{setActiveId(requestedCourseId);setActivityId(requestedActivityId);},[requestedCourseId,requestedActivityId]);
 useEffect(()=>{onReadingChange?.(!!active&&!!activity||!!preview);},[!!active,!!activity,!!preview,onReadingChange]);
 useEffect(()=>{if(focusActivity.current&&activity){heading.current?.focus({preventScroll:true});heading.current?.scrollIntoView?.({block:'start',behavior:'instant'});focusActivity.current=false;}},[active?.id,activity?.id]);
 const go=(courseId:string,nextId:string)=>{focusActivity.current=!!courseId;setActiveId(courseId);setActivityId(nextId);onNavigate?.(courseId,nextId);};
 const open=(course:Course)=>{void (async()=>{const saved=await run(()=>trainingApi('/enroll',{courseId:course.id}));if(!saved)return;setOpenedEnrollment(saved);go(course.id,saved.next?.id||saved.snapshot.activities.find((a:any)=>!saved.completed?.includes(a.id))?.id||saved.snapshot.activities[0]?.id||'');})().catch(()=>{});};
 if(active&&activity){
  const done=active.activities.filter(a=>completed.includes(a.id)).length,index=active.activities.indexOf(activity);
  const instructions=activityInstructionText(activity),isComplete=completed.includes(activity.id),modules=[...new Set(active.activities.map(a=>a.module||'Actividades'))];
  return <section className="course-programs course-reader" aria-label="Curso en progreso">
   <div className="course-reader-top"><Button variant="ghost" icon={<ArrowLeft size={18} aria-hidden="true"/>} disabled={busy||responsePending} onClick={()=>go('','')}>Volver a mis cursos</Button><span>Tu aprendizaje</span></div>
   <header className="course-reader-header"><div><p className="eyebrow">MI CURSO</p><h1>{active.title}</h1>{active.description&&<details className="course-description"><summary>Acerca de este curso</summary><p>{active.description}</p>{active.objectives&&<p><strong>Objetivos: </strong>{active.objectives}</p>}</details>}</div><div className="course-reader-progress"><strong>{Math.round(done/Math.max(1,active.activities.length)*100)}%</strong><span role="status">{done} de {active.activities.length} actividades completadas</span><progress aria-label="Progreso del curso" max={Math.max(1,active.activities.length)} value={done}/></div></header>
   <div className="course-workspace">
    <aside className="course-outline"><h2>Contenido del curso</h2><p>Elige una actividad para continuar.</p><nav aria-label="Actividades del curso">{modules.map(module=><div className="course-outline-module" key={module}><h4>{module}</h4><ol>{active.activities.filter(a=>(a.module||'Actividades')===module).map(a=>{const done=completed.includes(a.id);return <li key={a.id}><button type="button" aria-current={a.id===activity.id?'step':undefined} disabled={busy||responsePending} onClick={()=>go(active.id,a.id)}><span className="course-step-number">{done?<Check size={15} aria-hidden="true"/>:active.activities.indexOf(a)+1}</span><span>{a.title}<small>{done?'Completada':enrollment.responses?.[a.id]?.updatedAt?'Borrador guardado':a.kind==='simulator'?'Simulador':a.attachments?.length?'Lectura y materiales':'Actividad'}</small></span></button></li>;})}</ol></div>)}</nav>{responsePending&&<p className="course-save-hint" role="status">Guarda tus cambios antes de cambiar de actividad.</p>}</aside>
    <div className="course-reader-main">
     <div className="course-mobile-navigation"><SelectField label="Actividad del curso" value={activity.id} disabled={busy||responsePending} onChange={e=>go(active.id,e.target.value)}>{active.activities.map((a,i)=><option key={a.id} value={a.id}>{i+1}. {a.title}{completed.includes(a.id)?' · Completada':''}</option>)}</SelectField></div>
     <Card className="course-activity"><header className="course-activity-header"><div className="course-activity-meta"><span>{activity.module||'Actividad'}</span><span>{index+1} / {active.activities.length}</span></div><h2 ref={heading} tabIndex={-1}>{activity.title}</h2><span className={'course-activity-state'+(isComplete?' is-complete':'')}>{isComplete?<Check size={15} aria-hidden="true"/>:<FileText size={15} aria-hidden="true"/>}{isComplete?'Completada':activity.required?'Actividad obligatoria':'Actividad opcional'}</span></header>
      {activity.kind==='link'?<a className="course-resource-link" href={/^https:\/\//.test(activity.content)?activity.content:undefined} target="_blank" rel="noopener noreferrer"><LinkIcon size={20} aria-hidden="true"/><span>Abrir material de la actividad<small>Se abre en una pestaña nueva</small></span><ArrowRight size={18} aria-hidden="true"/></a>:instructions&&<div className="training-lesson course-instructions">{instructions}</div>}
      <ActivityAttachments attachments={activity.attachments}/>
      {isComplete&&<Notice tone="success">Actividad completada. Tu progreso está guardado.</Notice>}
      {activity.kind==='simulator'?!isComplete&&<div className="course-simulator-start">{!mode&&<Notice>El simulador de esta actividad no está disponible. Consulta con tu orientador.</Notice>}<p>{mode==='exam'?'Esta actividad inicia un examen con el tiempo establecido por el curso. El reloj continúa aunque salgas de la página.':'Practica a tu ritmo y consulta tu resultado al terminar.'}</p><Button icon={<PlayCircle size={18} aria-hidden="true"/>} disabled={busy||!mode} onClick={()=>void run(async()=>onStartSimulator(await trainingApi('/start',{enrollmentId:enrollment.id,activityId:activity.id,mode}))).catch(()=>{})}>{mode==='exam'?'Iniciar examen de la actividad':'Iniciar práctica de la actividad'}</Button></div>:<ActivityResponseForm key={enrollment.id+':'+activity.id} activity={activity} enrollmentId={enrollment.id} userId={enrollment.user_id} courseId={active.id} saved={enrollment.responses?.[activity.id]} parentBusy={busy} run={run} onPendingChange={setResponsePending}/>}
      <footer className="course-activity-navigation"><Button variant="ghost" icon={<ArrowLeft size={17} aria-hidden="true"/>} disabled={busy||responsePending||index===0} onClick={()=>go(active.id,active.activities[index-1].id)}>Actividad anterior</Button><Button variant={isComplete?'primary':'secondary'} disabled={busy||responsePending||index===active.activities.length-1} onClick={()=>go(active.id,active.activities[index+1].id)}>Siguiente actividad<ArrowRight size={17} aria-hidden="true"/></Button></footer>
     </Card>
     {done===active.activities.length&&<div className="course-complete-message"><Check size={24} aria-hidden="true"/><div><strong>¡Curso completado!</strong><p>Puedes volver a tus actividades y consultar tus respuestas cuando lo necesites.</p></div><Button variant="secondary" onClick={()=>go('','')}>Ver mis cursos</Button></div>}
    </div>
   </div>
  </section>;
 }
 if(preview&&listed)return <section className="course-programs course-preview" aria-label="Vista previa del curso">
  <Button variant="ghost" icon={<ArrowLeft size={18} aria-hidden="true"/>} disabled={busy} onClick={()=>go('','')}>Volver a mis cursos</Button>
  <Card className="course-preview-card"><p className="eyebrow">TU PRÓXIMO CURSO</p><h1>{listed.title}</h1><p>{listed.description}</p>{listed.objectives&&<div><h2>Qué vas a aprender</h2><p>{listed.objectives}</p></div>}
   <div><h2>Actividades del curso</h2><ol>{listed.activities.map(a=><li key={a.id}><span>{a.title}</span><small>{a.kind==='simulator'?'Simulador':a.attachments?.length?`${a.attachments.length} materiales`:'Lectura y reflexión'}</small></li>)}</ol></div>
   <p className="muted">Al comenzar podrás abrir los materiales, responder las actividades y guardar tu progreso.</p><Button disabled={busy||!listed.activities.length} onClick={()=>open(listed)}>Comenzar curso<ArrowRight size={18} aria-hidden="true"/></Button>
  </Card></section>;
 if(!courses.length)return requestedCourseId?<Notice>Este curso no está disponible para tu ruta actual. Vuelve a tus cursos para elegir otra actividad.</Notice>:null;
 return <section className="course-programs course-catalog" aria-label="Cursos y actividades"><header className="course-catalog-heading"><span className="course-catalog-icon"><BookOpen size={23} aria-hidden="true"/></span><div><h2>Cursos y actividades</h2><p>Aprende, responde y continúa desde donde te quedaste.</p></div></header>{requestedCourseId&&!listed&&<Notice>El curso solicitado no está disponible. Elige uno de tus cursos.</Notice>}<div className="training-grid">{courses.map(course=>{
  const saved=enrollmentFor(course.id),snapshot:Course=saved?.snapshot||course,done=snapshot.activities.filter(a=>saved?.completed?.includes(a.id)).length,materials=snapshot.activities.reduce((count,a)=>count+(a.attachments?.length||0),0),finished=done===snapshot.activities.length&&!!snapshot.activities.length;
  return <Card className="course-catalog-card" key={course.id}><span className={'course-card-status'+(finished?' is-complete':'')}>{finished?'Completado':saved?'En curso':'Disponible para ti'}</span><h3>{snapshot.title}</h3><p className="course-card-description">{snapshot.description}</p><div className="course-card-facts"><span><BookOpen size={16} aria-hidden="true"/>{snapshot.activities.length} actividades</span>{materials>0&&<span><Paperclip size={16} aria-hidden="true"/>{materials} materiales</span>}</div><div className="course-card-progress"><span>{done} de {snapshot.activities.length} actividades completadas</span><progress aria-label={'Progreso de '+snapshot.title} max={Math.max(1,snapshot.activities.length)} value={done}/></div>{saved?.next&&<p className="course-next"><small>Siguiente actividad</small>{saved.next.title}</p>}<Button disabled={busy||!snapshot.activities.length} onClick={()=>open(course)}>{saved?'Continuar curso':'Comenzar curso'}<ChevronRight size={17} aria-hidden="true"/></Button></Card>;
 })}</div></section>;
}
