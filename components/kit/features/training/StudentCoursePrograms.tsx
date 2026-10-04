"use client";
import {useState} from 'react';
import {preparationLevel,trainingTargetMatches} from '../../data/school-training';
import type {Course} from '../../lib/training-types';
import {Button,Card,Notice,SelectField} from '../../components/ui/primitives';
import {trainingApi} from './shared';
import {ActivityResponseForm} from './ActivityResponseForm';
import {ActivityAttachments} from './ActivityMedia';

/** Courses retain their own reading/progress flow, independently of exam grades. */
export function StudentCoursePrograms({data,level,career,busy,run,onStartSimulator}:{
 data:any;level:'bachillerato'|'universidad';career:string;busy:boolean;
 run:(task:()=>Promise<any>)=>Promise<any>;onStartSimulator:(attempt:any)=>void;
}){
 const [activeId,setActiveId]=useState(''),[activityId,setActivityId]=useState('');
 const [responsePending,setResponsePending]=useState(false);
 const courses:Course[]=(data.courses||[]).filter((course:Course)=>
  preparationLevel(course.careerIds,course.educationLevel)===level&&
  (!career||(course.type==='general'&&course.educationLevel===level&&!course.careerIds.length&&!course.fields?.length)||trainingTargetMatches(course.careerIds,career)||course.fields?.includes(data.careers.find((c:any)=>c.id===career)?.area)));
 const enrollmentFor=(id:string)=>(data.enrollments||[]).find((e:any)=>e.course_id===id);
 const listed=courses.find(course=>course.id===activeId);
 const enrollment=listed?enrollmentFor(listed.id):null;
 // Read exactly the version the student enrolled in; later publications must
 // not replace the activity IDs associated with their recorded progress.
 const active:Course|undefined=listed?(enrollment?.snapshot||listed):undefined;
 const activity=active?.activities.find(a=>a.id===activityId)||active?.activities[0];
 const simulator=(data.simulators||[]).find((s:any)=>s.id===activity?.simulatorId&&s.version===activity?.simulatorVersion);
 const availableModes:string[]=(activity&&enrollment?.activityModes?.[activity.id])||simulator?.modes||[];
 const mode=availableModes.includes('practice')?'practice':availableModes[0];
 const completed:string[]=enrollment?.completed||[];
 const open=(course:Course)=>{void run(async()=>{
  const saved=await trainingApi('/enroll',{courseId:course.id});
  setActiveId(course.id);setActivityId(saved.next?.id||saved.snapshot.activities[0]?.id||'');
 }).catch(()=>{});};
 if(!courses.length)return null;
 if(active&&activity)return <section className="stack course-programs" aria-label="Curso en progreso">
  <Button variant="secondary" disabled={busy||responsePending} onClick={()=>setActiveId('')}>Volver a mis cursos</Button>
  <Card className="stack">
   <h2>{active.title}</h2><p>{active.description}</p>
   <p role="status">{active.activities.filter(a=>completed.includes(a.id)).length} de {active.activities.length} actividades completadas</p>
   <progress aria-label="Progreso del curso" max={active.activities.length} value={active.activities.filter(a=>completed.includes(a.id)).length}/>
   <SelectField label="Actividad del curso" value={activity.id} disabled={busy||responsePending} onChange={e=>setActivityId(e.target.value)}>
    {active.activities.map((a,index)=><option key={a.id} value={a.id}>{index+1}. {a.title}{completed.includes(a.id)?' · Completada':''}</option>)}
   </SelectField>
  </Card>
  <Card className="stack">
   <p className="eyebrow">{activity.module}</p><h3>{activity.title}</h3>
   {activity.kind==='link'?<a href={/^https:\/\//.test(activity.content)?activity.content:undefined} target="_blank" rel="noopener noreferrer">Abrir material de la actividad</a>:<div className="training-lesson">{activity.content}</div>}
   <ActivityAttachments attachments={activity.attachments}/>
   {completed.includes(activity.id)&&<Notice tone="success">Actividad completada. Tu progreso está guardado.</Notice>}
   {activity.kind==='simulator'?!completed.includes(activity.id)&&<>
    {!mode&&<Notice>El simulador de esta actividad no está disponible. Consulta con tu orientador.</Notice>}
    {mode==='exam'&&<p>Esta actividad inicia un examen con el tiempo establecido por el curso. El reloj continúa aunque salgas de la página.</p>}
    <Button disabled={busy||!enrollment||!mode} onClick={()=>void run(async()=>onStartSimulator(await trainingApi('/start',{enrollmentId:enrollment.id,activityId:activity.id,mode}))).catch(()=>{})}>{mode==='exam'?'Iniciar examen de la actividad':'Iniciar práctica de la actividad'}</Button>
   </>:enrollment&&<ActivityResponseForm key={enrollment.id+':'+activity.id} activity={activity} enrollmentId={enrollment.id} userId={enrollment.user_id} courseId={active.id}
    saved={enrollment.responses?.[activity.id]} parentBusy={busy} run={run} onPendingChange={setResponsePending}/>}
   <div className="row">
    <Button variant="secondary" disabled={busy||responsePending||active.activities.indexOf(activity)===0} onClick={()=>setActivityId(active.activities[active.activities.indexOf(activity)-1].id)}>Actividad anterior</Button>
    <Button variant="secondary" disabled={busy||responsePending||active.activities.indexOf(activity)===active.activities.length-1} onClick={()=>setActivityId(active.activities[active.activities.indexOf(activity)+1].id)}>Siguiente actividad</Button>
   </div>
  </Card>
 </section>;
 return <section className="stack course-programs" aria-label="Cursos y actividades">
  <h2>Cursos y actividades</h2><p>Explora el material, realiza las actividades y guarda tu progreso.</p>
  <div className="training-grid">{courses.map(course=>{
   const saved=enrollmentFor(course.id),snapshot:Course=saved?.snapshot||course;
   const done=snapshot.activities.filter(a=>saved?.completed?.includes(a.id)).length;
   return <Card key={course.id}><small>Curso · {snapshot.activities.length} actividades</small><h3>{course.title}</h3><p>{course.description}</p>
    <p>{done} de {snapshot.activities.length} actividades completadas</p>
    <progress aria-label={'Progreso de '+course.title} max={snapshot.activities.length} value={done}/>
    <Button disabled={busy} onClick={()=>open(course)}>{saved?'Continuar curso':'Comenzar curso'}</Button>
   </Card>;
  })}</div>
 </section>;
}
