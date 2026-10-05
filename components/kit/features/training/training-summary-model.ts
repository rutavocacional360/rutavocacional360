import { preparationLevel, schoolModalityTarget, schoolTarget, trainingTargetMatches, type EducationLevel } from "../../data/school-training";
import type { Activity, ActivityResponse, Course } from "../../lib/training-types";

type SummaryEnrollment = {
  id: string;
  course_id: string;
  snapshot: Course;
  completed?: string[];
  next?: Activity | null;
  responses?: Record<string, ActivityResponse>;
};

export function courseActivityHref(courseId: string, activityId?: string) {
  return "/mi-ruta/cursos?curso=" + encodeURIComponent(courseId) +
    (activityId ? "&actividad=" + encodeURIComponent(activityId) : "");
}

export function courseMaterials(activities: Activity[]) {
  const counts = { video: 0, image: 0, audio: 0, document: 0, link: 0 };
  const seen = new Set<string>();
  for (const activity of activities) {
    if (activity.kind === "link") counts.link++;
    for (const attachment of activity.attachments || []) {
      if (seen.has(attachment.id)) continue;
      seen.add(attachment.id);
      const mime = attachment.mimeType.toLowerCase();
      counts[mime.startsWith("video/") ? "video" : mime.startsWith("image/") ? "image" : mime.startsWith("audio/") ? "audio" : "document"]++;
    }
  }
  return [
    { key: "video", count: counts.video, label: counts.video === 1 ? "video" : "videos" },
    { key: "image", count: counts.image, label: counts.image === 1 ? "imagen" : "imágenes" },
    { key: "audio", count: counts.audio, label: counts.audio === 1 ? "audio" : "audios" },
    { key: "document", count: counts.document, label: counts.document === 1 ? "documento" : "documentos" },
    { key: "link", count: counts.link, label: counts.link === 1 ? "enlace" : "enlaces" },
  ].filter(material => material.count > 0);
}

/** Derive the dashboard from the same visible catalog and enrolled versions as the reader. */
export function trainingSummaryModel(data: any, level: EducationLevel) {
  const access = data.readiness?.[level];
  const ready = access?.ready === true;
  const enrollments: SummaryEnrollment[] = data.enrollments || [];
  const catalog = new Map<string, Course>((ready ? data.courses || [] : []).map((course: Course) => [course.id, course]));
  // Authorized enrolled snapshots stay available after an archive or a change
  // to the latest publication. Internal direct-practice enrollments are not courses.
  if (ready) for (const enrollment of enrollments) {
    if (!enrollment.course_id.startsWith("direct:") && enrollment.snapshot && !catalog.has(enrollment.course_id)) {
      catalog.set(enrollment.course_id, { ...enrollment.snapshot, id: enrollment.course_id });
    }
  }
  const courses = [...catalog.values()]
    .map(published => {
      const enrollment = enrollments.find(item => item.course_id === published.id);
      const course = enrollment?.snapshot || published;
      const completedIds = new Set(enrollment?.completed || []);
      const completed = course.activities.filter(activity => completedIds.has(activity.id)).length;
      const pending = course.activities.filter(activity => !completedIds.has(activity.id));
      const savedNext = pending.find(activity => activity.id === enrollment?.next?.id);
      const next = savedNext || pending.find(activity => activity.required) || pending[0];
      const draft = next && enrollment?.responses?.[next.id];
      const hasDraft = !!draft && Object.values(draft.answers || {}).some(answer => answer.trim());
      return {
        course, enrollment, completed, next, hasDraft,
        pending: pending.length,
        materials: courseMaterials(course.activities),
        href: courseActivityHref(published.id, enrollment ? next?.id : undefined),
        priority: enrollment ? (pending.length ? 0 : 2) : 1,
      };
    })
    .filter(item => preparationLevel(item.course.careerIds, item.course.educationLevel) === level)
    .sort((a, b) => a.priority - b.priority);
  const enrolled = courses.filter(item => item.enrollment);
  const recommendations = (ready ? data.recommendations || [] : []).filter((item: any) =>
    schoolTarget(item.careerId) === (level === "bachillerato") && !schoolModalityTarget(item.careerId));
  const simulators = (ready ? data.simulators || [] : []).filter((simulator: any) =>
    preparationLevel(simulator.careerIds, simulator.educationLevel) === level &&
    recommendations.some((item: any) => trainingTargetMatches(simulator.careerIds, item.careerId)));
  // Practicing inside a course must not mark separate preparation as completed.
  const directIds = new Set(enrollments.filter(item => item.course_id.startsWith("direct:")).map(item => item.id));
  const attempts = (data.attempts || []).filter((attempt: any) => directIds.has(attempt.enrollment_id));
  const active = attempts.find((attempt: any) => ["in_progress", "recoverable"].includes(attempt.state) &&
    simulators.some((simulator: any) => simulator.id === attempt.simulator?.id));
  const simulatorCompleted = simulators.filter((simulator: any) => attempts.some((attempt: any) =>
    attempt.simulator?.id === simulator.id && attempt.state === "graded")).length;
  const nextSimulator = simulators.find((simulator: any) => simulator.id === active?.simulator?.id) || simulators[0];
  const career = (data.careers || []).find((item: any) =>
    recommendations.some((recommendation: any) => recommendation.careerId === item.id) &&
    trainingTargetMatches(nextSimulator?.careerIds, item.id));
  return {
    access, ready, courses, enrolled: enrolled.length,
    completed: enrolled.reduce((total, item) => total + item.completed, 0),
    pending: enrolled.reduce((total, item) => total + item.pending, 0),
    simulators, simulatorCompleted, active,
    simulatorHref: career ? "/mi-ruta/cursos?carrera=" + encodeURIComponent(career.id) : "/mi-ruta/cursos",
  };
}
