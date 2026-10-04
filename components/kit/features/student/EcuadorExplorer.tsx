import {RecommendationCard} from './RecommendationCard';
import {preparationHref} from '../../data/school-training';
export function RecommendedCareerCard({report,rec,index,onFollow,onOpen,allowPreparation}:{report:any;rec:any;index:number;allowPreparation?:boolean;onFollow?:(id:string)=>void;onOpen:(rec:any)=>void}){
 const preparation=allowPreparation??!!onFollow;
 const career=(report.catalog||[]).find((candidate:any)=>candidate.id===rec.careerId);
 return <RecommendationCard index={index} title={career?.name||rec.careerId} description={rec.comparison||rec.explore||rec.reason} href={preparation?preparationHref(rec.careerId):undefined} onOpen={()=>onOpen(rec)} openLabel="Conocer la carrera"/>;
}
export function EcuadorExplorer({report,onOpen,onFollow,allowPreparation}:{report:any;onOpen:(value:any)=>void;allowPreparation?:boolean;onFollow?:(id:string)=>void}){
 const ready=!report.partial&&report.readiness?.universidad?.ready!==false;
 const recommendations=ready?report.analysis?.recommendations||[]:[];
 return <section className="ec-explorer" aria-label="Carreras recomendadas"><header className="rd-options-heading"><h3>Carreras para explorar{recommendations.length?' · '+recommendations.length:''}</h3><p>Conoce cada carrera, dónde estudiarla y cómo prepararte.</p></header><div className="rd-career-grid">{recommendations.map((rec:any,index:number)=><RecommendedCareerCard key={rec.careerId} {...{report,rec,index,onOpen}} onFollow={ready?onFollow:undefined} allowPreparation={ready&&(allowPreparation??!!onFollow)}/>)}</div>{!recommendations.length&&<p>{ready?'Tus respuestas no dan prioridad a una carrera concreta. Revisa tus intereses con tu orientador y compara experiencias antes de elegir.':'Completa todos los tests de Universidad y espera la publicación de sus resultados para recibir tus carreras recomendadas.'}</p>}</section>;
}
