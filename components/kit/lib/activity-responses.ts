import type { Activity } from './training-types';

/** Reading programmes contain personal reflections, not graded exam questions.
 * Derive stable fields from the immutable enrolled activity so existing imports
 * become answerable without republishing or replacing a student's progress. */
export function activityResponsePrompts(activity: Activity) {
  if (activity.kind === 'simulator') return [];
  const explicit = activity.responsePrompt?.trim();
  if (explicit) return [{ id: 'response', prompt: explicit, required: true }];
  const questions = activity.kind === 'text'
    ? [...activity.content.matchAll(/¿[^¿?]+\?/g)].map(match => match[0].replace(/\s+/g, ' ').trim())
    : [];
  if (questions.length) return questions.map((prompt, index) => ({
    id: 'question-' + (index + 1), prompt, required: true,
  }));
  return [{ id: 'response', prompt: 'Tu respuesta o reflexión sobre la actividad', required: false }];
}

/** Display imported worksheets as instructions plus answer fields, rather than
 * showing their questions and printable answer lines a second time. This is a
 * presentation-only transformation: response IDs and enrolled content stay intact. */
export function activityInstructionText(activity: Activity) {
  if (activity.kind !== 'text') return activity.content;
  const explicit = activity.responsePrompt?.trim();
  let content = activity.content;
  if (!explicit) content = content.replace(/¿[^¿?]+\?/g, '');
  else content = content.replaceAll(explicit, '');
  const lines = content
    .replace(/(?:[.\u2026_·][\t ]*){4,}/g, '')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line && !/^(?:\d+\s*[.)\-:]|[a-z]\s*[.)]|[•\-–—_\s]+)$/i.test(line));
  const section = /^(?:inicio|desarrollo|cierre|preguntas|responde(?: las siguientes preguntas)?|actividad)\s*:?$/i;
  return lines.filter((line, index) => !section.test(line) || (index + 1 < lines.length && !section.test(lines[index + 1]))).join('\n').trim();
}

export function activityResponseProblem(activity: Activity, answers: unknown, complete = false) {
  if (!answers || typeof answers !== 'object' || Array.isArray(answers)) return 'Respuestas de la actividad inválidas.';
  const prompts = activityResponsePrompts(activity);
  for (const [id, value] of Object.entries(answers)) {
    if (!prompts.some(prompt => prompt.id === id)) return 'La respuesta no corresponde a una pregunta de esta actividad.';
    if (typeof value !== 'string' || value.length > 10000) return 'Cada respuesta admite hasta 10.000 caracteres.';
  }
  if (complete && prompts.some(prompt => prompt.required && !(answers as Record<string, string>)[prompt.id]?.trim())) {
    return 'Responde las preguntas de la actividad antes de completarla.';
  }
  return null;
}
