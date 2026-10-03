import { db, fail, hash, document, publicUser, visibleSubmission } from './store';
import { batterySubmissions,currentAssessments } from './battery';
import {submissionRoutes} from './assessment-route';
import { ecuadorCareers, catalogSource, careerOffers } from './ecuador-catalog';
import { areaFor, areas, degreeOffer, readAcademic, ACADEMIC_VERSION } from './academic-content.mjs';
import { localGuidance, GUIDANCE_RULES_VERSION } from '@/components/kit/lib/local-guidance';
import { pathwayVersion,schoolCatalogSource } from '@/components/kit/data/baccalaureate';
import { calculateTest } from '@/components/kit/lib/test-engine';
import { assessmentReadiness } from './assessment-readiness';
import { schoolGuidance } from '@/components/kit/lib/school-guidance';
import {analyzeStudentGuidance,studentAIConfigSignature} from './student-guidance-ai';

export const PROMPT_VERSION = ACADEMIC_VERSION;
export const configured = () => true;
function scope(user:any) {
  return user.role === 'student' ? {sql:'r.user_id=?',args:[user.id]} : {
    sql:'u.institutionId IS ?'+(user.role==='orientador'?' AND u.groupName=?':''),
    args:user.role==='orientador'?[user.institutionId,user.group]:[user.institutionId],
  };
}
const asReport=(row:any)=>({...JSON.parse(row.content),status:row.status,attempts:row.attempts});
export async function listGuidance(user:any) {
  const s=scope(user);
  return (await db.prepare('SELECT r.* FROM guidance_reports r JOIN users u ON u.id=r.user_id WHERE '+s.sql+' ORDER BY r.created_at DESC, r.version DESC').all(...s.args)).map(asReport);
}
export async function readGuidance(user:any,id:string) {
  const r=(await listGuidance(user)).find((r:any)=>r.id===id);
  if(!r)fail('Reporte no disponible para esta cuenta.',404);
  return r;
}
export async function ensureGuidance(user:any,_regenerate=false) {
  const readiness=await assessmentReadiness(user);
  const {run}=await batterySubmissions(user);
  const educationLevel=readiness.educationLevel,routeOf=await submissionRoutes(user,educationLevel),current=await currentAssessments(user);
  const stored=(await db.prepare('SELECT * FROM submissions WHERE user_id=? ORDER BY created_at DESC, id DESC').all(user.id)) as any[];
  // Select the newest attempt before checking publication; never substitute an older one.
  const scoped=stored.filter(r=>routeOf(r)===educationLevel&&current.some(t=>t.id===r.instrument_id&&String(t.version)===String(r.version)));
  const latest=scoped.filter((r,i)=>scoped.findIndex(x=>x.instrument_id===r.instrument_id)===i);
  const visible=await Promise.all(latest.map(r=>visibleSubmission(r,user)));
  const rows=visible.filter(r=>r.resultReleased);
  if(!rows.length)fail('Entrega un test y espera su publicación para consultar resultados.',409);
  for(const row of rows) {
    if(row.evaluation)continue;
    // Legacy scores derive from the saved instrument, not its current editable definition.
    const instrument=JSON.parse(latest.find(r=>r.id===row.id)!.snapshot);
    try {
      row.evaluation=calculateTest({...instrument,scoring:instrument.scoring||(row.instrument_id==='valores'?'manual':'dimensions'),aggregation:instrument.aggregation||'sum'},JSON.parse(row.answers));
    } catch { row.evaluation={state:'insufficient',scores:[],careers:[]}; }
  }
  const profile=await document(user.id,'rv360:profile',{}),content=readAcademic();
  const mappingVersion=educationLevel==='bachillerato'?pathwayVersion:ACADEMIC_VERSION;
  const digest=hash(JSON.stringify({
    educationLevel, aiConfig:studentAIConfigSignature(), attempts:rows.map(r=>({id:r.id,evaluation:r.evaluation})),readiness,
    assigned:run.instruments.map((t:any)=>t.id), profile, name:user.name,
    catalog:catalogSource.version,content:content.id,rulesVersion:GUIDANCE_RULES_VERSION,mapping:mappingVersion,
  }));
  const prior=await db.prepare('SELECT * FROM guidance_reports WHERE user_id=? AND digest=? ORDER BY version DESC LIMIT 1').get(user.id,digest);
  if(prior){const saved=asReport(prior);if(saved.ai?.status!=='error'||Date.parse(saved.ai.retryAt)>Date.now())return saved;}
  const offers=careerOffers(ecuadorCareers.map(c=>c.id));
  const catalog={source:catalogSource,careers:ecuadorCareers.map(c=>{
    const area=areaFor(c.name);
    return {...c,areaId:area?.id||'',interests:area?.dimensions||[],offers:(offers[c.id]||[]).map(o=>({...o,level:o.level||(degreeOffer(o)?'Grado universitario':'Otra oferta')}))};
  })};
  const report=localGuidance(user,rows,run.instruments.map((t:any)=>t.id),{
    educationLevel,profile,content:{...content,areas},catalog:catalog as any,
  });
  if(!report)fail('No hay resultados publicados para generar orientación.',409);
  report.mappingVersion=mappingVersion;
  const routeReadiness=readiness[educationLevel];
  report.partial=!routeReadiness.ready;
  report.progress={submitted:routeReadiness.completed,total:routeReadiness.total};
  if(!readiness.universidad.ready)report.analysis.recommendations=[];
  if(!readiness.bachillerato.ready)report.analysis.pathway={...schoolGuidance([],[],profile),reason:'Completa todos los tests de Bachillerato y espera la publicación de sus resultados para recibir orientación.'};
  if(!readiness.universidad.ready&&!readiness.bachillerato.ready){
    report.analysis.summary='Tus respuestas están guardadas. Completa los tests pendientes para recibir recomendaciones vocacionales y acceder a los cursos.';
    report.analysis.nextSteps=['Completa tus tests pendientes en Mis tests.','Si tus resultados están en revisión, espera su publicación por administración.'];
  }
  (report as any).educationLevel=educationLevel;
  (report as any).schoolProfile=profile;
  if(educationLevel==='bachillerato'){
    report.analysis.recommendations=[]; report.catalog=[]; report.offers={}; report.catalogSource=schoolCatalogSource as any;
    const p=report.analysis.pathway;
    p.science=p.science.map(o=>({...o,careers:[]})); p.technical=p.technical.map(o=>({...o,careers:[]}));
    p.context='Compara Bachillerato en Ciencias y Técnico, sus asignaturas y actividades, según tus intereses.';
    p.bridge='Consulta la oferta de tu colegio y conversa con tu orientador antes de elegir modalidad.';
    p.nextSteps=['Revisa tu afinidad con Ciencias y Técnico.', 'Compara las asignaturas y actividades de las opciones relacionadas.', 'Consulta con tu colegio qué figuras profesionales ofrece.', 'Conversa con tu orientador y practica los simuladores de Bachillerato.'];
    p.notes=p.notes.filter(n=>!/univers|CES/i.test(n));
    report.analysis.summary=routeReadiness.ready?p.title+'. '+p.reason:report.analysis.summary;
    report.analysis.nextSteps=routeReadiness.ready?p.nextSteps:report.analysis.nextSteps;
  }else{
    delete (report.analysis as any).pathway;
    report.analysis.nextSteps=routeReadiness.ready?['Compara las carreras relacionadas con tus resultados.', 'Verifica malla, sede, modalidad, costos y admisión con cada universidad.', 'Conversa con tu orientador y practica la preparación universitaria.']:report.analysis.nextSteps;
  }
  report.analysis.limitations=report.analysis.limitations.filter(n=>educationLevel==='universidad'?!/bachillerato|modalidad|figura técnica/i.test(n):!/CES|univers|carrera.interés|La IA generó/i.test(n));
  const ai=await analyzeStudentGuidance(report,{educationLevel,ready:routeReadiness.ready,regenerate:_regenerate});
  (report as any).ai=ai;
  report.contentSource=ai.status==='available'?'gemini':'local';
  report.provider=report.contentSource;
  report.model=ai.status==='available'?ai.model||null:null;
  report.analysis.limitations=report.analysis.limitations.filter(n=>!/La IA generó/i.test(n));
  if(ai.status==='available'){
    report.analysis.summary=ai.summary!; report.analysis.nextSteps=ai.nextSteps!;
    if(educationLevel==='bachillerato'){
      report.analysis.pathway.reason=ai.reasons?.find(r=>r.candidateId==='modalidad:'+report.analysis.pathway.suggested)?.reason||report.analysis.pathway.reason;
      report.analysis.pathway.nextSteps=ai.nextSteps!;
      for(const option of [...report.analysis.pathway.science,...report.analysis.pathway.technical])option.reason=ai.reasons?.find(r=>r.candidateId===option.id)?.reason||option.reason;
    }else for(const option of report.analysis.recommendations)option.reason=ai.reasons?.find(r=>r.candidateId===option.careerId)?.reason||option.reason;
    report.analysis.limitations.push('La IA interpreta puntuaciones agregadas y opciones verificadas de esta ruta. La recomendación requiere contrastarse con asignaturas, experiencias y orientación docente.');
  }
  const version=Number(((await db.prepare('SELECT MAX(version) AS v FROM guidance_reports WHERE user_id=?').get(user.id)) as any)?.v||0)+1;
  // Concurrent dashboard/course/result requests must reuse the same snapshot.
  const now=new Date().toISOString(),id=hash('guidance:'+user.id+':'+digest+(prior?':retry:'+prior.id:''));
  const r={...report!,readiness,id,createdAt:now,version,batteryId:run.id,promptVersion:PROMPT_VERSION};
  await db.prepare('INSERT INTO guidance_reports VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING').run(id,user.id,user.institutionId,digest,version,'available',now,now,0,JSON.stringify(r));
  return asReport(await db.prepare('SELECT * FROM guidance_reports WHERE id=? AND user_id=?').get(id,user.id));
}
export async function analyzeGuidance(user:any,body:any) {
  if(user.role==='student')return ensureGuidance(user,true);
  if(!['admin','orientador'].includes(user.role)||typeof body.studentId!=='string')fail('Selecciona un estudiante de tu alcance.',403);
  const student:any=await db.prepare("SELECT * FROM users WHERE id=? AND role='student' AND institutionId IS ?").get(body.studentId,user.institutionId);
  if(!student||(user.role==='orientador'&&student.groupName!==user.group))fail('Estudiante no disponible para esta cuenta.',403);
  return ensureGuidance(publicUser(student),true);
}
