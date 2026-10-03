import {defaultPreparationLevel,type EducationLevel} from '@/components/kit/data/school-training';
import {db,document,put} from './store';
export async function studentEducationLevel(user:any):Promise<EducationLevel>{return defaultPreparationLevel(await document(user.id,'rv360:profile',{}));}
export const testMatchesLevel=(test:any,level:EducationLevel)=>!test.educationLevel||test.educationLevel==='ambos'||test.educationLevel===level;
export const routeTest=(test:any,level:EducationLevel)=>({...test,educationLevel:level,careerLinks:(test.careerLinks||[]).filter((c:any)=>String(c.careerId).startsWith('bachillerato:')===(level==='bachillerato'))});
// Locate the original route of legacy shared results in saved reports.
export async function submissionRoutes(user:any,level:EducationLevel){
 const reports:any[]=await db.prepare('SELECT content FROM guidance_reports WHERE user_id=? ORDER BY created_at ASC').all(user.id);
 const origins=new Map<string,EducationLevel>(Object.entries(await document(user.id,'rv360:assessment-route-origins',{})) as [string,EducationLevel][]);
 for(const row of reports){try{const r=JSON.parse(row.content),stage=r.analysis?.pathway?.profile?.stage;
  const route=r.educationLevel||(stage&&stage!=='Sin registrar'?defaultPreparationLevel({stage}):undefined);
  if(route)for(const i of r.instruments||[])if(!origins.has(i.id))origins.set(i.id,route);
 }catch{}}
 return (submission:any)=>{try{const t=JSON.parse(submission.snapshot);return t.educationLevel&&t.educationLevel!=='ambos'?t.educationLevel:origins.get(submission.id)||level;}catch{return null;}};
}
// Call inside the profile update transaction, before saving the new stage.
export async function transitionStudentRoute(userId:string,previousProfile:any,nextProfile:any){
 const oldLevel=defaultPreparationLevel(previousProfile),nextLevel=defaultPreparationLevel(nextProfile);
 if(oldLevel===nextLevel)return false;
 const origins=await document(userId,'rv360:assessment-route-origins',{});
 const routeOf=await submissionRoutes({id:userId},oldLevel);
 for(const row of await db.prepare('SELECT id,snapshot FROM submissions WHERE user_id=?').all(userId) as any[]){
  const test=JSON.parse(row.snapshot);
  if(!test.educationLevel||test.educationLevel==='ambos')origins[row.id] ||= routeOf(row)||oldLevel;
 }
 await put(userId,'rv360:assessment-route-origins',origins);
 await db.prepare("UPDATE assessment_attempts SET state='expired' WHERE user_id=? AND state='in_progress'").run(userId);
 await db.prepare("DELETE FROM documents WHERE owner=? AND key LIKE 'rv360:answers:%'").run(userId);
 return true;
}
