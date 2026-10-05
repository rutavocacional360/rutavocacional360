"use client";
import "./training.css";
import "./training-summary.css";
import Link from "next/link";
import { ArrowRight, BookOpen, CheckCircle2, FileText, Image, Link2, PlayCircle, Volume2 } from "lucide-react";
import { useSession } from "../../lib/session";
import { defaultPreparationLevel } from "../../data/school-training";
import { Badge, Card } from "../../components/ui/primitives";
import { useTraining, TrainingError } from "./shared";
import { trainingSummaryModel } from "./training-summary-model";

const materialIcons = { video: PlayCircle, image: Image, audio: Volume2, document: FileText, link: Link2 };

export function TrainingSummary() {
  const { data, error, refresh } = useTraining();
  const level = defaultPreparationLevel(useSession().values["rv360:profile"]);
  if (!data) return <Card className="training-home-summary learning-summary">
    <span className="eyebrow">TU APRENDIZAJE</span><h2>Mis cursos y actividades</h2>
    {error ? <TrainingError error={error} retry={refresh} /> : <p role="status">Cargando tus cursos y avances…</p>}
  </Card>;
  const summary = trainingSummaryModel(data, level);
  if (!summary.ready) return <Card className="training-home-summary learning-summary">
    <span className="eyebrow">TU APRENDIZAJE</span><h2>Prepárate para tu siguiente paso</h2>
    <p>Completa tus tests y espera la publicación de sus resultados para acceder a tus cursos y materiales.</p>
    <p className="small muted">{summary.access?.completed || 0} de {summary.access?.total || 0} tests completos con resultados publicados.</p>
    <TrainingError error={error} retry={refresh} />
    <Link className="button button--secondary" href="/mi-ruta/evaluaciones">Ver mis tests <ArrowRight size={17} aria-hidden="true" /></Link>
  </Card>;
  return <section className="training-home-summary learning-summary" aria-labelledby="learning-summary-title">
    <header className="learning-summary-heading">
      <div><span className="eyebrow">TU APRENDIZAJE</span><h2 id="learning-summary-title">Mis cursos y actividades</h2><p>Retoma tus respuestas y encuentra el material de cada curso.</p></div>
      <Link className="button button--secondary" href="/mi-ruta/cursos">Ver todos los cursos <ArrowRight size={17} aria-hidden="true" /></Link>
    </header>
    <TrainingError error={error} retry={refresh} />
    {summary.courses.length > 0 ? <>
      <dl className="learning-summary-stats">
        <div><dt>Cursos disponibles</dt><dd>{summary.courses.length}</dd></div>
        <div><dt>Actividades completadas</dt><dd>{summary.completed}</dd></div>
        <div><dt>Pendientes en mis cursos</dt><dd>{summary.pending}</dd></div>
      </dl>
      <div className="learning-summary-courses">
        {summary.courses.slice(0, 3).map(item => {
          const { course, enrollment, completed, pending, next, materials } = item;
          const done = !!enrollment && !pending;
          return <article className="learning-summary-course" key={course.id}>
            <div className="learning-summary-course-heading">
              <span className="learning-summary-icon">{done ? <CheckCircle2 size={22} aria-hidden="true" /> : <BookOpen size={22} aria-hidden="true" />}</span>
              <Badge tone={done ? "success" : enrollment ? "primary" : "neutral"}>{done ? "Completado" : enrollment ? "En curso" : "Sin comenzar"}</Badge>
            </div>
            <h3>{course.title}</h3>
            <p className="learning-summary-course-next">{enrollment && next ? <><strong>{item.hasDraft ? "Respuesta guardada" : "Siguiente actividad"}</strong><span>{next.title}</span></> : done ? "Puedes volver a consultar tus respuestas y materiales." : course.description || "Lee el material y responde las actividades a tu ritmo."}</p>
            <div className="learning-summary-course-progress"><span>{completed} de {course.activities.length} actividades completadas</span><progress aria-label={"Progreso de " + course.title} value={completed} max={Math.max(1, course.activities.length)} /></div>
            {materials.length > 0 && <ul className="learning-summary-materials" aria-label={"Materiales de " + course.title}>{materials.map(material => {
              const Icon = materialIcons[material.key as keyof typeof materialIcons];
              return <li key={material.key}><Icon size={15} aria-hidden="true" />{material.count} {material.label}</li>;
            })}</ul>}
            <Link className={"button button--" + (enrollment && !done ? "primary" : "secondary")} href={item.href} aria-label={(done ? "Revisar curso: " : enrollment ? "Continuar actividad: " : "Ver curso: ") + (enrollment && next ? next.title : course.title)}>{done ? "Revisar curso" : enrollment ? "Continuar actividad" : "Ver curso"}<ArrowRight size={17} aria-hidden="true" /></Link>
          </article>;
        })}
      </div>
      {summary.courses.length > 3 && <p className="learning-summary-more">Mostrando 3 de {summary.courses.length} cursos. Encontrarás los demás en <Link href="/mi-ruta/cursos">todos tus cursos</Link>.</p>}
    </> : <div className="learning-summary-empty"><BookOpen size={28} aria-hidden="true" /><div><h3>Tus próximos cursos aparecerán aquí</h3><p>Ya completaste tus tests. Cuando tu institución publique cursos para tu ruta, podrás ver el material y realizar las actividades desde este espacio.</p></div></div>}
    {summary.simulators.length > 0 && <div className="learning-summary-practice"><div><strong>{summary.active ? "Tienes una práctica por continuar" : "Tu autopreparación"}</strong><p>{summary.simulators.length} simuladores disponibles · {summary.simulatorCompleted} completados</p></div><Link className="button button--secondary" href={summary.simulatorHref}>{summary.active ? "Ir a mi práctica" : "Ver simuladores"}<ArrowRight size={17} aria-hidden="true" /></Link></div>}
  </section>;
}
