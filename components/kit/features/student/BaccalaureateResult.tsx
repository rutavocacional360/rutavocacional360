import { useSession } from '../../lib/session';
import type { SchoolGuidance } from '../../lib/school-guidance';
import './baccalaureate-result.css';

type Readiness={ready:boolean;total:number;completed:number;pending:{id:string;title:string;state:string}[]};
export function BaccalaureateResult({pathway,onCareer,readiness}:{pathway:SchoolGuidance;onCareer?:(id:string)=>void;readiness?:Readiness}) {
  const student=useSession().user?.role==='student';
  if(readiness?.ready===false||pathway.suggested==='pendiente')return <section className="bp-root" aria-label="Orientación de bachillerato"><header className="bp-intro"><span className="rd-eyebrow">RESULTADO DE BACHILLERATO</span><h3>Resultado pendiente: Técnico o Ciencias</h3><p>{readiness&&!readiness.ready?`Hay ${readiness.completed} de ${readiness.total} tests completos con resultados publicados. La modalidad recomendada aparecerá al completar todos los tests de Bachillerato.`:pathway.reason}</p>{readiness?.pending.length? <ul>{readiness.pending.map(test=><li key={test.id}><strong>{test.title}</strong> · {test.state==='awaiting_results'?'Pendiente de publicación de resultados':test.state==='in_progress'?'En curso':test.state==='insufficient'?'Respuestas insuficientes; requiere revisión':'Pendiente de completar'}</li>)}</ul>:null}{student&&<a className="button button--primary" href="/mi-ruta/evaluaciones">Continuar mis tests</a>}<p>El resultado indicará afinidad con Bachillerato Técnico, Bachillerato en Ciencias o ambas modalidades según tus respuestas. Estos tests orientan tus intereses; no certifican aptitud.</p></header></section>;
  return <section className="bp-root" aria-label="Orientación de bachillerato">
    <section className="bp-intro" aria-label="Modalidad recomendada"><span className="rd-eyebrow">RESULTADO DE BACHILLERATO</span><h2>{pathway.suggested==='tecnico'?'Modalidad recomendada: Bachillerato Técnico':pathway.suggested==='ciencias'?'Modalidad recomendada: Bachillerato en Ciencias':'Afinidad con ambas modalidades: Técnico y Ciencias'}</h2><p>{pathway.suggested==='ambas'?'Tus respuestas no muestran una preferencia suficiente para recomendar una sola modalidad. Compara ambas con tu orientador.':'Esta es la modalidad que más se relaciona con los intereses reflejados en tus tests.'}</p></section>
    <header className="bp-intro"><span className="rd-eyebrow">1 · TU PERFIL DE BACHILLERATO</span><h3>{pathway.title}</h3><p>{pathway.reason}</p><p>{pathway.context}</p>
      <dl className="bp-profile"><div><dt>Etapa</dt><dd>{pathway.profile.stage}</dd></div><div><dt>Bachillerato declarado</dt><dd>{pathway.profile.baccalaureate}{pathway.profile.specialty&&' · '+pathway.profile.specialty}</dd></div><div><dt>Preferencia de aprendizaje</dt><dd>{pathway.profile.learningPreference}</dd></div></dl>
      {student&&<a className="text-link" href="/mi-ruta/perfil">Completar o actualizar mi perfil escolar</a>}
      <p className="small">La afinidad orienta tu exploración; no es un certificado de aptitud ni una decisión definitiva.</p>
    </header>
    <aside className="bp-bridge" aria-label="Recomendaciones de bachillerato"><span className="rd-eyebrow">TUS RECOMENDACIONES</span><h3>Qué hacer con tu orientación</h3><ol>{pathway.nextSteps.slice(1,3).map(step=><li key={step}>{step}</li>)}</ol><p>Abajo encontrarás las áreas de Ciencias y las figuras técnicas relacionadas con tus intereses, con sus asignaturas, actividades y conexiones universitarias.</p></aside>
    <div className="bp-options">{([
      {id:'ciencias',title:'Bachillerato en Ciencias',subtitle:'Áreas de exploración dentro de la formación general',options:pathway.science},
      {id:'tecnico',title:'Bachillerato Técnico',subtitle:'Ejemplos de figuras profesionales para comparar',options:pathway.technical},
    ]).map(group=><section key={group.id} className={'bp-option '+(pathway.suggested===group.id?'bp-preferred':'')}>
      <span className="rd-eyebrow">2 · {pathway.suggested===group.id?'PRIMERA OPCIÓN PARA EXPLORAR':'OTRA RUTA ABIERTA'}</span><h3>{group.title}</h3><p>{group.subtitle}</p>
      {!group.options.length&&<p>Sin áreas priorizadas todavía. Completa tus intereses y prueba actividades; esta modalidad sigue abierta para ti.</p>}
      {group.options.map((o,i)=><details key={o.id} open={i===0}><summary>{o.name}</summary><p>{o.reason}</p><p><strong>Qué estudiar o reforzar: </strong>{o.subjects}.</p><p><strong>Prueba esta actividad: </strong>{o.activity}</p>
        <p><strong>Después, en la universidad:</strong></p>{o.careers.length?<ul>{o.careers.map(c=><li key={c.id}>{onCareer?<button type="button" className="text-link" onClick={()=>onCareer(c.id)}>{c.name}</button>:c.name}</li>)}</ul>:<p>Explora el catálogo universitario y compara programas de esta área. No hay una carrera priorizada con la evidencia actual.</p>}
      </details>)}
    </section>)}</div>
    <section className="bp-bridge"><span className="rd-eyebrow">3 · TU PASO A LA UNIVERSIDAD</span><h3>Una ruta que puedes seguir construyendo</h3><p>{pathway.bridge}</p><h4>Recomendaciones para avanzar</h4><ol>{pathway.nextSteps.map(step=><li key={step}>{step}</li>)}</ol></section>
    <details className="rd-disclosure"><summary>Alcance y fuentes del bachillerato</summary>{pathway.notes.map(n=><p key={n}>{n}</p>)}{pathway.sources.map(s=><p key={s.url}><a href={s.url} target="_blank" rel="noreferrer">{s.title}</a></p>)}</details>
  </section>;
}
