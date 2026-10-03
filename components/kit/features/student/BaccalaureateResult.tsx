import {SchoolCatalog} from './SchoolCatalog';
import {useSession} from '../../lib/session';
import {preparationHref} from '../../data/school-training';
import {dimensions} from '../../data/instruments';
import type {SchoolGuidance} from '../../lib/school-guidance';
import './baccalaureate-result.css';

type Readiness={ready:boolean;total:number;completed:number;pending:{id:string;title:string;state:string}[]};
type SchoolRecommendation=SchoolGuidance['science'][number];
const dimensionName=(code:string)=>dimensions.find(d=>d.code===code)?.name||code;
function SchoolOptionCard({option,technical,preparation}:{option:SchoolRecommendation;technical:boolean;preparation:boolean}){
 return <article className="bp-option-card">
  <span className="rd-eyebrow">{technical?'FIGURA PROFESIONAL':'ÁREA DE EXPLORACIÓN'}</span>
  <h4>{preparation?<a className="bp-option-title" href={preparationHref('bachillerato:'+option.id)}>{option.name}</a>:option.name}</h4>
  {technical&&option.family&&<span className="bp-family">{option.family}</span>}
  <p>{option.reason}</p>
  <details><summary>Asignaturas y actividad para probar</summary><p><strong>Qué estudiar o reforzar: </strong>{option.subjects}.</p><p><strong>Prueba esta actividad: </strong>{option.activity}</p></details>
  {preparation&&<a className="button button--primary button--md" href={preparationHref('bachillerato:'+option.id)} aria-label={'Autopreparación: '+option.name}>Autopreparación</a>}
 </article>;
}
export function BaccalaureateResult({pathway,readiness,summary,interests,showNextSteps=true,allowPreparation}:{pathway:SchoolGuidance;readiness?:Readiness;summary?:string;interests?:string[];showNextSteps?:boolean;allowPreparation?:boolean}){
 const student=useSession().user?.role==='student';
 const preparation=student&&readiness?.ready===true&&allowPreparation!==false;
 const nextSteps=pathway.nextSteps.filter(step=>!/universidad|universitari|educación superior/i.test(step));
 const rankingNote=(pathway as SchoolGuidance&{rankingNote?:string}).rankingNote;
 const completedReview=readiness?.ready===true&&pathway.suggested==='pendiente';
 const highlighted=interests||(pathway as SchoolGuidance&{highlightedDimensions?:string[]}).highlightedDimensions?.map(dimensionName)||[];
 if(readiness?.ready===false||pathway.suggested==='pendiente')return <section className="bp-root" aria-label="Orientación de bachillerato"><header className="bp-intro bp-pending"><span className="rd-eyebrow">RESULTADO DE BACHILLERATO</span><h2>{completedReview?'Tests completos: orientación por revisar':'Resultado pendiente: Técnico o Ciencias'}</h2><p>{readiness&&!readiness.ready?`Hay ${readiness.completed} de ${readiness.total} tests completos con resultados publicados. La modalidad recomendada aparecerá al completar todos los tests de Bachillerato.`:completedReview?'Tus tests están completos, pero sus criterios no permiten relacionar tus respuestas con una modalidad concreta. Consulta el resultado de cada test y revísalo con tu orientador.':pathway.reason}</p>{readiness?.pending?.length?<ul>{readiness.pending.map(test=><li key={test.id}><strong>{test.title}</strong> · {test.state==='awaiting_results'?'Pendiente de publicación de resultados':test.state==='in_progress'?'En curso':test.state==='insufficient'?'Respuestas insuficientes; requiere revisión':'Pendiente de completar'}</li>)}</ul>:null}{student&&!completedReview&&<a className="button button--primary button--md" href="/mi-ruta/evaluaciones">Continuar mis tests</a>}<p className="bp-caption">{completedReview?'Las modalidades siguen abiertas. Consulta el catálogo para comparar sus asignaturas y actividades.':'El resultado orientará tu elección entre Técnico y Ciencias según tus respuestas.'}</p></header><SchoolCatalog/></section>;
 const groups=[
  {id:'ciencias',title:'Bachillerato en Ciencias',subtitle:'Áreas de exploración de la formación general; no son especialidades del título.',options:pathway.science},
  {id:'tecnico',title:'Bachillerato Técnico',subtitle:'Figuras profesionales del catálogo oficial. Confirma su disponibilidad con tu colegio.',options:pathway.technical},
 ].sort((a,b)=>pathway.suggested==='tecnico'?Number(b.id==='tecnico')-Number(a.id==='tecnico'):0);
 return <section className="bp-root" aria-label="Orientación de bachillerato">
  <header className="bp-intro" aria-label="Modalidad recomendada"><span className="rd-eyebrow">TU RESULTADO DE BACHILLERATO</span><h2>{pathway.suggested==='tecnico'?'Modalidad recomendada: Bachillerato Técnico':pathway.suggested==='ciencias'?'Modalidad recomendada: Bachillerato en Ciencias':'Afinidad con ambas modalidades: Técnico y Ciencias'}</h2>
   {!!highlighted.length&&<div className="rd-interest-tags" aria-label="Intereses destacados"><span>Intereses destacados</span>{highlighted.map(name=><strong key={name}>{name}</strong>)}</div>}
   <p>{summary||pathway.reason}</p>
   {summary&&summary!==pathway.reason&&<details className="bp-rationale"><summary>Por qué aparece esta modalidad</summary><p>{pathway.reason}</p></details>}
  </header>
  <div className="bp-options">{groups.map(group=><section key={group.id} className={'bp-group '+(pathway.suggested===group.id?'bp-preferred':'')} aria-label={group.title}>
   <header className="bp-group-heading"><div><h3>{group.title}</h3><p>{group.subtitle}</p></div>{preparation&&(pathway.suggested===group.id||pathway.suggested==='ambas')&&<a className="button button--secondary button--md" href={preparationHref('bachillerato:'+group.id)} aria-label={'Autopreparación general: '+group.title}>Autopreparación general</a>}</header>
   {group.options.length?<><div className="bp-option-grid">{group.options.slice(0,3).map(option=><SchoolOptionCard key={option.id} option={option} technical={group.id==='tecnico'} preparation={preparation}/>)}</div>{group.options.length>3&&<details className="bp-more"><summary>Ver {group.options.length-3} {group.id==='tecnico'?'figuras':'áreas'} relacionadas más</summary><div className="bp-option-grid">{group.options.slice(3).map(option=><SchoolOptionCard key={option.id} option={option} technical={group.id==='tecnico'} preparation={preparation}/>)}</div></details>}</>:<p className="bp-empty">Tus respuestas no dan prioridad a {group.id==='tecnico'?'una figura técnica':'un área de Ciencias'} concreta. Puedes comparar esta modalidad y consultar el catálogo oficial para explorar sus opciones.</p>}
  </section>)}</div>
  {rankingNote&&<p className="bp-caption">{rankingNote}</p>}
  {showNextSteps&&!!nextSteps.length&&<details className="rd-disclosure bp-next"><summary>Recomendaciones para avanzar</summary><ol>{nextSteps.map(step=><li key={step}>{step}</li>)}</ol></details>}
  <details className="rd-disclosure bp-profile-details"><summary>Perfil escolar usado en este resultado</summary><dl className="bp-profile"><div><dt>Etapa</dt><dd>{pathway.profile.stage}</dd></div><div><dt>Bachillerato declarado</dt><dd>{pathway.profile.baccalaureate}{pathway.profile.specialty&&' · '+pathway.profile.specialty}</dd></div><div><dt>Preferencia de aprendizaje</dt><dd>{pathway.profile.learningPreference}</dd></div></dl>{student&&<a className="text-link" href="/mi-ruta/perfil">Actualizar mi perfil escolar</a>}</details>
  <SchoolCatalog/>
  <details className="rd-disclosure"><summary>Alcance y fuentes del bachillerato</summary>{pathway.notes.map(note=><p key={note}>{note}</p>)}{pathway.sources.map(source=><p key={source.url}><a href={source.url} target="_blank" rel="noreferrer">{source.title}</a></p>)}</details>
 </section>;
}
