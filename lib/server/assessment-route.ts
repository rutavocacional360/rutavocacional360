import {defaultPreparationLevel,type EducationLevel} from '@/components/kit/data/school-training';
import {db,document} from './store';
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
