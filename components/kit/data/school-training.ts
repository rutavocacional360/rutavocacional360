import {scienceOptions,technicalOptions,isChoosingBaccalaureate} from './baccalaureate';
export type EducationLevel='bachillerato'|'universidad';
export const schoolTarget=(id:unknown):id is string=>typeof id==='string'&&id.startsWith('bachillerato:');
export const preparationLevel=(ids:string[]=[],explicit?:string)=>ids.length?(ids.some(schoolTarget)?'bachillerato':'universidad'):explicit==='bachillerato'?'bachillerato':'universidad';
export const schoolTrainingTargets=[
 {id:'bachillerato:ciencias',name:'Bachillerato en Ciencias',area:'Ciencias · formación general',description:'Compara asignaturas y actividades del tronco común.',educationLevel:'bachillerato',offers:[]},
 {id:'bachillerato:tecnico',name:'Bachillerato Técnico',area:'Técnico · formación general',description:'Explora proyectos, talleres y figuras profesionales.',educationLevel:'bachillerato',offers:[]},
 ...scienceOptions.map(o=>({id:'bachillerato:'+o.id,name:o.name,area:'Ciencias · áreas de exploración',description:o.subjects,educationLevel:'bachillerato',offers:[]})),
 ...technicalOptions.map(o=>({id:'bachillerato:'+o.id,name:o.name,area:'Técnico · '+(o.family||'figuras profesionales'),description:o.subjects,educationLevel:'bachillerato',offers:[]})),
];
export function schoolPreparationRecommendations(report:any){
 const p=report?.analysis?.pathway;
 if(!p||p.suggested==='pendiente'||report.readiness?.bachillerato?.ready!==true)return [];
 const related=new Set([...(p.science||[]),...(p.technical||[])].map(o=>'bachillerato:'+o.id));
 if(['ciencias','ambas'].includes(p.suggested))related.add('bachillerato:ciencias');
 if(['tecnico','ambas'].includes(p.suggested))related.add('bachillerato:tecnico');
 return schoolTrainingTargets.filter(t=>related.has(t.id)).map(t=>({careerId:t.id,educationLevel:'bachillerato',reason:
  [...(p?.science||[]),...(p?.technical||[])].find(o=>'bachillerato:'+o.id===t.id)?.reason||
  p.reason,
  suggested:true}));
}
export const defaultPreparationLevel=(profile:any):EducationLevel=>isChoosingBaccalaureate(profile?.stage)?'bachillerato':'universidad';
