import {activityResponsePrompts} from '../../lib/activity-responses';
import type {ActivityResponse, Course} from '../../lib/training-types';
import {preparationLevel} from '../../data/school-training';

export function CourseResponseReview({enrollments, level}: {enrollments: any[]; level: 'bachillerato' | 'universidad'}) {
  const items = enrollments.filter(enrollment => preparationLevel(enrollment.snapshot?.careerIds, enrollment.snapshot?.educationLevel) === level && Object.keys(enrollment.responses || {}).length);
  if (!items.length) return null;
  return <details className="card stack"><summary>Respuestas de las actividades · {items.length} estudiantes y cursos</summary>
    <div className="stack">{items.map(enrollment => <details key={enrollment.id}>
      <summary>{enrollment.name || 'Estudiante'} · {enrollment.snapshot.title}</summary>
      {(enrollment.snapshot as Course).activities.filter(activity => enrollment.responses[activity.id]).map(activity => {
        const response = enrollment.responses[activity.id] as ActivityResponse;
        return <section className="training-module stack" key={activity.id}><h3>{activity.title}</h3>
          <p className="small muted">{response.submittedAt ? 'Entregada' : 'Borrador del estudiante'} · Último guardado: {new Intl.DateTimeFormat('es-EC', {dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Guayaquil'}).format(new Date(response.updatedAt))}</p>
          {activityResponsePrompts(activity).map(question => <div key={question.id}><strong>{question.prompt}</strong><p className="training-lesson">{response.answers[question.id] || 'Sin respuesta'}</p></div>)}
        </section>;
      })}
    </details>)}</div>
  </details>;
}
