import {SchoolCatalog} from './SchoolCatalog';
import Link from 'next/link';
import {ArrowRight,BookOpen,GraduationCap,Wrench} from 'lucide-react';
import {baccalaureateTypes,learningPreferences,scienceOptions,technicalOptions,isChoosingBaccalaureate} from '../../data/baccalaureate';
import {useSession} from '../../lib/session';
import './school-route-start.css';

/** The registered profile is visible before the first assessment is submitted. */
export function SchoolRouteStart(){
 const profile=useSession().values['rv360:profile']||{};
 const school=isChoosingBaccalaureate(profile.stage);
 const declared=baccalaureateTypes.find(t=>t.id===profile.baccalaureate)?.name||'Todavía no lo he elegido';
 const preference=learningPreferences.find(p=>p.id===profile.learningPreference)?.name||'Aún estoy explorando';
 return <section className="school-start" aria-label="Tu ruta desde el registro">
  <header><span className="eyebrow">{school?'TU RUTA DE BACHILLERATO':'TU RUTA UNIVERSITARIA'}</span><h2>{school?'¿Qué bachillerato puedo elegir?':'¿Qué carrera universitaria puedo seguir?'}</h2><p>{school?'Completa tus tests para comparar Bachillerato en Ciencias y Técnico, sus áreas y figuras profesionales según tus intereses y habilidades.':'Completa tus tests de orientación universitaria. Tus respuestas ayudarán a identificar carreras relacionadas con tus intereses y habilidades y a comparar dónde estudiarlas.'}</p></header>
  <dl className="school-start-profile"><div><dt>Etapa educativa</dt><dd>{profile.stage||'Por completar'}</dd></div>{school&&<div><dt>Bachillerato registrado</dt><dd>{declared}{profile.specialty&&' · '+profile.specialty}</dd></div>}<div><dt>Cómo prefieres aprender</dt><dd>{preference}</dd></div></dl>
  <ol className="school-start-steps"><li><span>1</span><div><strong>Descubre tus intereses y fortalezas</strong><p>Completa los tests asignados a tu etapa educativa.</p></div></li><li><span>2</span><div><strong>{school?'Compara Ciencias y Técnico':'Consulta tus carreras recomendadas'}</strong><p>{school?'En Mis resultados verás tu modalidad, áreas y figuras profesionales recomendadas.':'En Mis resultados verás las carreras relacionadas con tus respuestas y la explicación de cada recomendación.'}</p></div></li><li><span>3</span><div><strong>{school?'Contrasta tus opciones con tu orientador':'Compara programas e instituciones'}</strong><p>{school?'Prueba actividades, consulta los colegios y revisa qué modalidad se relaciona con tus habilidades.':'Revisa las mallas, las ciudades y los requisitos de admisión de las instituciones.'}</p></div></li></ol>
  {school&&<div className="school-start-options">{[{title:'Bachillerato en Ciencias',Icon:BookOpen,copy:'Formación general: explora áreas y asignaturas para preparar tu siguiente etapa escolar.',options:scienceOptions},{title:'Bachillerato Técnico',Icon:Wrench,copy:'Formación con una figura profesional: compara especialidades, talleres y proyectos.',options:technicalOptions}].map(({title,Icon,copy,options})=><article key={title}><Icon size={23}/><h3>{title}</h3><p>{copy}</p><ul>{options.slice(0,3).map(o=><li key={o.id}>{o.name}</li>)}</ul><small>Ejemplos para conocer; tus recomendaciones aparecerán al completar los tests y publicar sus resultados.</small></article>)}</div>}
  {school&&<SchoolCatalog/>}
  <div className="school-start-actions"><Link className="button button--primary" href="/mi-ruta/evaluaciones"><GraduationCap size={18}/>Descubrir mi orientación<ArrowRight size={17}/></Link><Link className="button button--secondary" href="/mi-ruta/perfil">Revisar mi perfil escolar</Link></div>
 </section>;
}
