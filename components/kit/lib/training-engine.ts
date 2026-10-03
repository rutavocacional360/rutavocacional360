import type { Simulator, BankQuestion } from "./training-types";
import {schoolTarget,preparationLevel} from '../data/school-training';
import {
  calculateTest,
  instrumentProblems,
  type AnswerMap,
  type Reviews,
} from "./test-engine";
export function academicInstrument(s: Simulator, questions = s.questions) {
  return {
    ...s.instrument,
    educationLevel: preparationLevel(s.careerIds, s.educationLevel),
    id: s.id,
    version: String(s.version),
    title: s.title,
    schemaVersion: 2,
    aggregation: "sum" as const,
    scoring: "mixed" as const,
    minimumCoverage: 0,
    careerLinks: [],
    questions: questions.map((q) => ({
      ...q,
      required: false,
      policy: q.policy || ("objective" as const),
    })),
  };
}
export function simulatorProblems(s: Simulator) {
  if (
    !s ||
    !Array.isArray(s.questions) ||
    !s.instrument ||
    !Array.isArray(s.instrument.options) ||
    !Array.isArray(s.modes) ||
    !Array.isArray(s.areaWeights) ||
    !Array.isArray(s.quotas)
  )
    return ["Estructura del simulador inválida."];
    if(s.careerIds!==undefined&&!Array.isArray(s.careerIds))return ['Revisa las opciones de estudio.'];
    const errors = instrumentProblems(academicInstrument(s)).map(
    (p) => p.message,
    );
    if(s.careerIds?.some(schoolTarget)&&s.careerIds.some(id=>!schoolTarget(id)))errors.push('Separa los simuladores de Bachillerato y Universidad.');
    if(s.educationLevel!==undefined&&!['bachillerato','universidad'].includes(s.educationLevel))errors.push('Revisa el nivel de preparación.');
    if(s.careerIds?.length&&s.educationLevel&&s.careerIds.some(id=>schoolTarget(id)!==(s.educationLevel==='bachillerato')))errors.push('El nivel debe coincidir con las opciones de estudio asignadas.');
    if(s.careerIds?.some(schoolTarget)&&s.purpose==='admission')errors.push('La exploración de bachillerato no es un examen de admisión universitaria.');
  if (
    s.practiceDurationMinutes !== undefined &&
    (!Number.isInteger(s.practiceDurationMinutes) ||
      s.practiceDurationMinutes < 0 ||
      s.practiceDurationMinutes > 480)
  )
    errors.push("La duración de práctica debe estar entre 0 y 480 minutos.");
  if (
    !["fixed", "random"].includes(s.selection) ||
    !["general", "admission"].includes(s.purpose)
  )
    errors.push("Propósito o selección inválidos.");
  if (
    !s.modes?.length ||
    s.modes.some((m) => !["practice", "exam"].includes(m))
  )
    errors.push("Selecciona práctica o examen.");
  if (
    !Number.isInteger(s.durationMinutes) ||
    s.durationMinutes < 0 ||
    s.durationMinutes > 480 ||
    (s.modes.includes("exam") && !s.durationMinutes)
  )
    errors.push("Configura de 1 a 480 minutos para examen.");
  if (
    !Number.isInteger(s.maxAttempts) ||
    s.maxAttempts < 1 ||
    s.maxAttempts > 100
  )
    errors.push("Configura de 1 a 100 intentos por modo y actividad.");
  if (
    !["first", "last", "best", "mean"].includes(s.gradePolicy) ||
    !["finish", "question"].includes(s.feedback)
  )
    errors.push("Revisa la política de calificación y retroalimentación.");
  for (const q of s.questions) {
    if(q.policy === "rubric" || !["single","multiple","yesno","number","short"].includes(q.type||"single"))errors.push("El simulador debe ser autocalificable: usa selección, número o texto breve con una clave correcta. Convierte las preguntas abiertas antes de publicar.");
    if (
      q.policy === "rubric" &&
      !(
        q.rubric?.reduce(
          (n, r) => n + Math.max(0, ...r.levels.map((l) => l.points)),
          0,
        )! > 0
      )
    )
      errors.push("La rúbrica necesita un máximo positivo.");
    if (!q.reviewed || !q.source?.trim() || !q.explanation?.trim())
      errors.push("Revisa procedencia y explicación de cada pregunta.");
    if (
      !["objective", "rubric", undefined].includes(q.policy) ||
      q.visibleWhen ||
      q.type === "info"
    )
      errors.push(
        "Los simuladores requieren preguntas objetivas o rúbrica, sin condiciones de visibilidad.",
      );
    if (!(Number.isFinite(q.weight ?? 1) && (q.weight ?? 1) > 0))
      errors.push("La puntuación máxima debe ser positiva.");
    if (
      q.rubric?.some(
        (r) =>
          r.levels.some((l) => l.points < 0) ||
          Math.min(...r.levels.map((l) => l.points)) !== 0,
      )
    )
      errors.push("Las rúbricas académicas deben comenzar en cero.");
  }
  if (s.areaWeights?.length) {
    if (
      s.areaWeights.some(
        (a) => !a.area || !Number.isFinite(a.weight) || a.weight <= 0,
      ) ||
      Math.abs(s.areaWeights.reduce((n, a) => n + a.weight, 0) - 100) > 1e-8 ||
      new Set(s.areaWeights.map((a) => a.area)).size !== s.areaWeights.length
    )
      errors.push("Los pesos de áreas deben ser positivos y sumar 100.");
    if (
      s.questions.some(
        (q) =>
          !s.areaWeights.some(
            (a) => a.area === (q.topic || q.section || "General"),
          ),
      )
    )
      errors.push("Cada pregunta necesita un área ponderada.");
  }
  if (s.selection === "random") {
    if (
      !s.quotas?.length ||
      new Set(s.quotas.map((q) => q.topic)).size !== s.quotas.length ||
      s.quotas.some(
        (q) =>
          !Number.isInteger(q.count) ||
          q.count < 1 ||
          s.questions.filter(
            (x) => (x.topic || x.section || "General") === q.topic,
          ).length < q.count,
      )
    )
      errors.push("Banco insuficiente o cuotas de selección inválidas.");
    if (s.areaWeights?.some((a) => !s.quotas.some((q) => q.topic === a.area)))
      errors.push("Incluye todas las áreas ponderadas en la selección.");
  }
  return [...new Set(errors)];
}
export function selectQuestions(
  s: Simulator,
  random: () => number = Math.random,
) {
  const shuffle = <T>(v: T[]) => {
    const a = [...v];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  const selected =
    s.selection === "random"
      ? s.quotas.flatMap((q) =>
          shuffle(
            s.questions.filter(
              (x) => (x.topic || x.section || "General") === q.topic,
            ),
          ).slice(0, q.count),
        )
      : s.questions;
  return selected.map((q) => ({
    ...q,
    options:
      s.shuffleOptions && !s.questionOrderFixedIds?.includes(q.id)
        ? shuffle(q.options || s.instrument.options)
        : q.options || s.instrument.options,
  }));
}
export function academicResult(
  s: Simulator,
  answers: AnswerMap,
  reviews: Reviews = {},
) {
  const instrument = academicInstrument(s),
    base = calculateTest(instrument, answers, reviews, {
      includeOmissions: true,
    });
  const score = base.scores[0];
  if (!score || score.max <= 0)
    throw Error("El simulador necesita un máximo positivo.");
  const areas = [
    ...new Set(s.questions.map((q) => q.topic || q.section || "General")),
  ].map((area) => {
    const ids = new Set(
        s.questions
          .filter((q) => (q.topic || q.section || "General") === area)
          .map((q) => q.id),
      ),
      trace = base.trace.filter((t) => ids.has(t.questionId)),
      max = trace.reduce((n, t) => n + t.max, 0),
      raw = trace.reduce((n, t) => n + t.subtotal, 0);
    return {
      area,
      raw,
      max,
      percent: max ? (100 * raw) / max : 0,
      weight: s.areaWeights.find((w) => w.area === area)?.weight,
    };
  });
  const percent = s.areaWeights.length
    ? areas.reduce((n, a) => n + (a.percent * (a.weight || 0)) / 100, 0)
    : (100 * score.raw) / score.max;
  return {
    ...base,
    raw: score.raw,
    max: score.max,
    percent: base.state === "pending-review" ? null : percent,
    areas,
    scale: 100,
    kind: "academic",
    academicPolicyVersion: "academic-1",
    note: "Preparación propia. No equivale al puntaje oficial ni mide vocación.",
  };
}
export function principalGrade(
  values: number[],
  policy: Simulator["gradePolicy"],
) {
  if (!values.length) return null;
  return policy === "first"
    ? values[0]
    : policy === "last"
      ? values.at(-1)!
      : policy === "best"
        ? Math.max(...values)
        : values.reduce((a, b) => a + b, 0) / values.length;
}
export function courseProgress(
  activities: { id: string; required: boolean }[],
  completed: string[],
) {
  const required = activities.filter((a) => a.required),
    done = required.filter((a) => completed.includes(a.id)).length;
  return {
    completed: done,
    total: required.length,
    percent: required.length ? (100 * done) / required.length : 0,
  };
}
