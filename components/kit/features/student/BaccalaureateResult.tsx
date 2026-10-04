import {SchoolCatalog} from './SchoolCatalog';
import {useState} from 'react';
import {Dialog} from '../../components/ui/Dialog';
import {RecommendationCard} from './RecommendationCard';
import {useSession} from '../../lib/session';
import {preparationHref} from '../../data/school-training';
import {dimensions} from '../../data/instruments';
import type {SchoolGuidance} from '../../lib/school-guidance';
import './baccalaureate-result.css';

type Readiness={ready:boolean;total:number;completed:number;pending:{id:string;title:string;state:string}[]};
type SchoolRecommendation=SchoolGuidance['science'][number];
const dimensionName=(code:string)=>dimensions.find(d=>d.code===code)?.name||code;
function SchoolOptionCard({option,technical,preparation,index,onOpen}:{option:SchoolRecommendation;technical:boolean;preparation:boolean;index:number;onOpen:()=>void}){
 return <RecommendationCard className="bp-option-card" titleClassName="bp-option-title" index={index} title={option.name} description={option.subjects} href={preparation?preparationHref('bachillerato:'+option.id):undefined} onOpen={onOpen} openLabel={technical?'Conocer la figura':'Conocer el área'}/>;
}
export function BaccalaureateReference({pathway}:{pathway:SchoolGuidance}){
 const student=useSession().user?.role==='student';
 return <div className="bp-reference-content"><section><h3>Cómo se ordenan las opciones</h3><p>Los números identifican las opciones; no son una nota ni un porcentaje de aptitud.</p>{pathway.rankingNote&&<p>{pathway.rankingNote}</p>}</section><section><h3>Perfil escolar usado</h3><dl className="bp-profile"><div><dt>Etapa</dt><dd>{pathway.profile.stage}</dd></div><div><dt>Bachillerato declarado</dt><dd>{pathway.profile.baccalaureate}{pathway.profile.specialty&&' · '+pathway.profile.specialty}</dd></div><div><dt>Preferencia de aprendizaje</dt><dd>{pathway.profile.learningPreference}</dd></div></dl>{student&&<a className="text-link" href="/mi-ruta/perfil">Actualizar mi perfil escolar</a>}</section><SchoolCatalog/><details className="rd-disclosure"><summary>Alcance y fuentes del bachillerato</summary>{pathway.notes.map(note=><p key={note}>{note}</p>)}{pathway.sources.map(source=><p key={source.url}><a href={source.url} target="_blank" rel="noreferrer">{source.title}</a></p>)}</details></div>;
}
export function BaccalaureateResult({pathway,readiness,summary,interests,showNextSteps=true,showReference=true,allowPreparation}:{pathway:SchoolGuidance;readiness?:Readiness;summary?:string;interests?:string[];showNextSteps?:boolean;showReference?:boolean;allowPreparation?:boolean}){
 const student=useSession().user?.role==='student';
 const [selected,setSelected]=useState<SchoolRecommendation|null>(null);
 const preparation=student&&readiness?.ready===true&&allowPreparation!==false;
 const nextSteps=pathway.nextSteps.filter(step=>!/universidad|universitari|educación superior/i.test(step));
 const completedReview=readiness?.ready===true&&pathway.suggested==='pendiente';
 const highlighted=interests||(pathway as SchoolGuidance&{highlightedDimensions?:string[]}).highlightedDimensions?.map(dimensionName)||[];
 if(readiness?.ready===false||pathway.suggested==='pendiente')return <section className="bp-root" aria-label="Orientación de bachillerato"><header className="bp-intro bp-pending"><span className="rd-eyebrow">RESULTADO DE BACHILLERATO</span><h2>{completedReview?'Tests completos: orientación por revisar':'Resultado pendiente: Técnico o Ciencias'}</h2><p>{readiness&&!readiness.ready?`Hay ${readiness.completed} de ${readiness.total} tests completos con resultados publicados. La modalidad recomendada aparecerá al completar todos los tests de Bachillerato.`:completedReview?'Tus tests están completos, pero sus criterios no permiten relacionar tus respuestas con una modalidad concreta. Consulta el resultado de cada test y revísalo con tu orientador.':pathway.reason}</p>{readiness?.pending?.length?<ul>{readiness.pending.map(test=><li key={test.id}><strong>{test.title}</strong> · {test.state==='awaiting_results'?'Pendiente de publicación de resultados':test.state==='in_progress'?'En curso':test.state==='insufficient'?'Respuestas insuficientes; requiere revisión':'Pendiente de completar'}</li>)}</ul>:null}{student&&!completedReview&&<a className="button button--primary button--md" href="/mi-ruta/evaluaciones">Continuar mis tests</a>}<p className="bp-caption">{completedReview?'Las modalidades siguen abiertas. Consulta el catálogo para comparar sus asignaturas y actividades.':'El resultado orientará tu elección entre Técnico y Ciencias según tus respuestas.'}</p></header><SchoolCatalog/></section>;
 const groups=[
  {id:'ciencias',title:'Bachillerato en Ciencias',subtitle:'Áreas para explorar dentro de esta modalidad.',options:pathway.science},
  {id:'tecnico',title:'Bachillerato Técnico',subtitle:'Figuras profesionales para explorar dentro de esta modalidad.',options:pathway.technical},
 ].sort((a,b)=>pathway.suggested==='tecnico'?Number(b.id==='tecnico')-Number(a.id==='tecnico'):0);
 return <section className="bp-root" aria-label="Orientación de bachillerato">
  <header className="rd-panel rd-intro bp-intro" aria-label="Modalidad recomendada"><span className="rd-eyebrow">TU RESULTADO DE BACHILLERATO</span><h2>{pathway.suggested==='tecnico'?'Modalidad recomendada: Bachillerato Técnico':pathway.suggested==='ciencias'?'Modalidad recomendada: Bachillerato en Ciencias':'Afinidad con ambas modalidades: Técnico y Ciencias'}</h2>
   {!!highlighted.length&&<div className="rd-interest-tags" aria-label="Intereses destacados"><span>Intereses destacados</span>{highlighted.map(name=><strong key={name}>{name}</strong>)}</div>}
   <p>Explora las áreas y figuras relacionadas con tus intereses. Conoce sus actividades y elige cuál probar.</p>
   <details className="bp-rationale"><summary>Ver explicación de mi resultado</summary><p>{summary||pathway.reason}</p>{summary&&summary!==pathway.reason&&<p>{pathway.reason}</p>}</details>
  </header>
  <div className="bp-options">{groups.map((group,groupIndex)=><section key={group.id} className={'bp-group '+(pathway.suggested===group.id?'bp-preferred':'')} aria-label={group.title}>
   <header className="rd-options-heading bp-group-heading"><div><h3>{group.title}</h3><p>{group.subtitle}</p></div></header>
   {group.options.length?<div className="rd-career-grid bp-option-grid">{group.options.map((option,index)=><SchoolOptionCard key={option.id} option={option} index={index+groups.slice(0,groupIndex).reduce((count,previous)=>count+previous.options.length,0)} onOpen={()=>setSelected(option)} technical={group.id==='tecnico'} preparation={preparation}/>)}</div>:<p className="bp-empty">Tus respuestas no dan prioridad a {group.id==='tecnico'?'una figura técnica':'un área de Ciencias'} concreta. Consulta el catálogo para comparar sus opciones con tu orientador.</p>}
  </section>)}</div>
  {(showNextSteps||showReference)&&<details className="rd-disclosure bp-reference"><summary>Detalles y próximos pasos</summary>{showNextSteps&&!!nextSteps.length&&<section className="rd-next bp-next"><h3>Recomendaciones para avanzar</h3><ol>{nextSteps.map(step=><li key={step}>{step}</li>)}</ol></section>}{showReference&&<BaccalaureateReference pathway={pathway}/>}</details>}
  <Dialog wide open={!!selected} title={selected?.name||'Explorar opción'} onClose={()=>setSelected(null)}>{selected&&<div className="rd-career-detail"><section><h3>Por qué conviene explorarla</h3><p>{selected.reason}</p></section><section><h3>Qué estudiar y reforzar</h3><p>{selected.subjects}</p></section><section><h3>Una actividad para probar</h3><p>{selected.activity}</p></section>{selected.family&&<p><strong>Familia profesional: </strong>{selected.family}</p>}<p>Compara estas actividades con tus intereses y consulta la oferta de tu colegio con tu orientador.</p>{preparation&&<a className="button button--primary button--md" href={preparationHref('bachillerato:'+selected.id)}>Autopreparación</a>}</div>}</Dialog>
 </section>;
}
