import { db, fail, hash, document, publicUser, visibleSubmission } from './store';
import { batterySubmissions } from './battery';
import { ecuadorCareers, catalogSource, careerOffers } from './ecuador-catalog';
import { areaFor, areas, degreeOffer, readAcademic, ACADEMIC_VERSION } from './academic-content.mjs';
import { localGuidance, GUIDANCE_RULES_VERSION } from '@/components/kit/lib/local-guidance';
import { pathwayVersion } from '@/components/kit/data/baccalaureate';
import { calculateTest } from '@/components/kit/lib/test-engine';
import { assessmentReadiness } from './assessment-readiness';
import { schoolGuidance } from '@/components/kit/lib/school-guidance';
import { defaultPreparationLevel } from '@/components/kit/data/school-training';

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
  const stored=(await db.prepare('SELECT * FROM submissions WHERE user_id=? ORDER BY created_at DESC, id DESC').all(user.id)) as any[];
  // Select the newest attempt before checking publication; never substitute an older one.
  const latest=stored.filter((r,i)=>stored.findIndex(x=>x.instrument_id===r.instrument_id)===i);
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
  const digest=hash(JSON.stringify({
    attempts:rows.map(r=>({id:r.id,evaluation:r.evaluation})),readiness,
    assigned:run.instruments.map((t:any)=>t.id), profile, name:user.name,
    catalog:catalogSource.version,content:content.id,rulesVersion:GUIDANCE_RULES_VERSION,mapping:pathwayVersion,
  }));
  const prior=await db.prepare('SELECT * FROM guidance_reports WHERE user_id=? AND digest=? ORDER BY version DESC LIMIT 1').get(user.id,digest);
  if(prior)return asReport(prior);
  const offers=careerOffers(ecuadorCareers.map(c=>c.id));
  const catalog={source:catalogSource,careers:ecuadorCareers.map(c=>{
    const area=areaFor(c.name);
    return {...c,areaId:area?.id||'',interests:area?.dimensions||[],offers:(offers[c.id]||[]).map(o=>({...o,level:o.level||(degreeOffer(o)?'Grado universitario':'Otra oferta')}))};
  })};
  const report=localGuidance(user,rows,run.instruments.map((t:any)=>t.id),{
    profile,content:{...content,areas},catalog:catalog as any,
  });
  if(!report)fail('No hay resultados publicados para generar orientación.',409);
  const routeReadiness=readiness[defaultPreparationLevel(profile)];
  report.partial=!routeReadiness.ready;
  report.progress={submitted:routeReadiness.completed,total:routeReadiness.total};
  if(!readiness.universidad.ready)report.analysis.recommendations=[];
  if(!readiness.bachillerato.ready)report.analysis.pathway={...schoolGuidance([],[],profile),reason:'Completa todos los tests de Bachillerato y espera la publicación de sus resultados para recibir orientación.'};
  if(!readiness.universidad.ready&&!readiness.bachillerato.ready){
    report.analysis.summary='Tus respuestas están guardadas. Completa los tests pendientes para recibir recomendaciones vocacionales y acceder a los cursos.';
    report.analysis.nextSteps=['Completa tus tests pendientes en Mis tests.','Si tus resultados están en revisión, espera su publicación por administración.'];
  }
  const version=Number(((await db.prepare('SELECT MAX(version) AS v FROM guidance_reports WHERE user_id=?').get(user.id)) as any)?.v||0)+1;
  // Concurrent dashboard/course/result requests must reuse the same snapshot.
  const now=new Date().toISOString(),id=hash('guidance:'+user.id+':'+digest);
  const r={...report!,readiness,id,createdAt:now,version,batteryId:run.id,promptVersion:PROMPT_VERSION};
  await db.prepare('INSERT INTO guidance_reports VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING').run(id,user.id,user.institutionId,digest,version,'available',now,now,0,JSON.stringify(r));
  return asReport(await db.prepare('SELECT * FROM guidance_reports WHERE id=? AND user_id=?').get(id,user.id));
}
export async function analyzeGuidance(user:any,body:any) {
  if(user.role==='student')return ensureGuidance(user);
  if(!['admin','orientador'].includes(user.role)||typeof body.studentId!=='string')fail('Selecciona un estudiante de tu alcance.',403);
  const student:any=await db.prepare("SELECT * FROM users WHERE id=? AND role='student' AND institutionId IS ?").get(body.studentId,user.institutionId);
  if(!student||(user.role==='orientador'&&student.groupName!==user.group))fail('Estudiante no disponible para esta cuenta.',403);
  return ensureGuidance(publicUser(student));
}
