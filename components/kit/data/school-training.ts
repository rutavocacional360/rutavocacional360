import {scienceOptions,technicalOptions,isChoosingBaccalaureate} from './baccalaureate';
export type EducationLevel='bachillerato'|'universidad';
export const schoolTarget=(id:unknown):id is string=>typeof id==='string'&&id.startsWith('bachillerato:');
/** Modalities are publishing scopes, never individual study options for students. */
export const schoolModalityTarget=(id:unknown)=>id==='bachillerato:ciencias'||id==='bachillerato:tecnico';
export const preparationHref=(careerId='')=>'/mi-ruta/cursos'+(careerId?'?carrera='+encodeURIComponent(careerId):'');
/** General preparation belongs to a related specialty, without opening other specialties. */
export function trainingTargetMatches(resourceIds:readonly string[]|undefined,careerId:string){
 if(resourceIds?.includes(careerId))return true;
 if(!schoolTarget(careerId))return false;
 const parent=scienceOptions.some(o=>'bachillerato:'+o.id===careerId)?'bachillerato:ciencias':
  technicalOptions.some(o=>'bachillerato:'+o.id===careerId)?'bachillerato:tecnico':undefined;
 return !!parent&&!!resourceIds?.includes(parent);
}
// Keep the administrator's destination stable even when reviewing inconsistent legacy links.
export const preparationLevel=(ids:string[]=[],explicit?:string):EducationLevel=>explicit==='bachillerato'||explicit==='universidad'?explicit:ids.some(schoolTarget)?'bachillerato':'universidad';
export const schoolTrainingTargets=[
 {id:'bachillerato:ciencias',name:'Bachillerato en Ciencias',area:'Ciencias · formación general',description:'Compara asignaturas y actividades del tronco común.',educationLevel:'bachillerato',offers:[]},
 {id:'bachillerato:tecnico',name:'Bachillerato Técnico',area:'Técnico · formación general',description:'Explora proyectos, talleres y figuras profesionales.',educationLevel:'bachillerato',offers:[]},
 ...scienceOptions.map(o=>({id:'bachillerato:'+o.id,name:o.name,area:'Ciencias · áreas de exploración',description:o.subjects,educationLevel:'bachillerato',offers:[]})),
 ...technicalOptions.map(o=>({id:'bachillerato:'+o.id,name:o.name,area:'Técnico · '+(o.family||'figuras profesionales'),description:o.subjects,educationLevel:'bachillerato',offers:[]})),
];
export function schoolPreparationRecommendations(report:any){
 const p=report?.analysis?.pathway;
 if(!p||p.suggested==='pendiente'||report.readiness?.bachillerato?.ready!==true||report.educationLevel&&report.educationLevel!=='bachillerato')return [];
 const options=p.suggested==='tecnico'?[...(p.technical||[]),...(p.science||[])]:[...(p.science||[]),...(p.technical||[])];
 const ids=options.map(o=>'bachillerato:'+o.id);
 return [...new Set<string>(ids)].flatMap(id=>{
  const target=schoolTrainingTargets.find(t=>t.id===id&&!schoolModalityTarget(t.id));
  return target?[{careerId:id,educationLevel:'bachillerato',reason:options.find(o=>'bachillerato:'+o.id===id)?.reason||p.reason,suggested:true}]:[];
 });
}
export const defaultPreparationLevel=(profile:any):EducationLevel=>isChoosingBaccalaureate(profile?.stage)?'bachillerato':'universidad';
