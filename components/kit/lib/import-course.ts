/** A teaching programme contains activities and instructions, not answer keys. */
export type ImportedCourse = {
  title: string;
  description: string;
  sections: {title: string; content: string; objective: string; durationMinutes: number; module: string}[];
  notes: string;
};

const activityHeading = /^(?:actividad|dinámica|sesión)\s+\d{1,3}\s*[.:–—-]\s*\S.+$/i;
const moduleHeading = /^(?:eje|módulo|unidad)\s+\d{1,3}\s*[.:–—-]\s*\S.+$/i;
const moduleLabel = /^(?:eje|módulo|unidad)\s*:\s*(.+)/i;
const programmeNotes = /^(?:evaluación general|rúbrica general|recomendaciones generales|bibliografía|referencias(?: bibliográficas)?|fuentes de consulta)\b/i;
const phaseHeading = /^(?:inicio|desarrollo|cierre)\s*(?:\(|:|$)/i;

export function parseInstructionalCourse(text: string): ImportedCourse | undefined {
  const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const sections: ImportedCourse['sections'] = [];
  const introduction: string[] = [], notes: string[] = [];
  let module = '', current: ImportedCourse['sections'][number] | undefined, inNotes = false;
  let awaitingObjective = false;
  const explicitDuration = new Map<ImportedCourse['sections'][number], number>();
  for (const line of lines) {
    // Extraction markers describe pagination, never the programme or its objective.
    if (/^\[página\s+\d+\]$/i.test(line)) continue;
    // Printed writing guides carry no content and make the online lesson unreadable.
    if (/^[\s.…_·-]{4,}$/.test(line)) continue;
    if (activityHeading.test(line)) {
      current = {title: line, content: '', objective: '', durationMinutes: 0, module};
      sections.push(current);
      inNotes = false;
      awaitingObjective = false;
      continue;
    }
    if (moduleHeading.test(line)) { module = line; current = undefined; inNotes = false; awaitingObjective = false; continue; }
    if (sections.length && programmeNotes.test(line)) { inNotes = true; current = undefined; }
    if (inNotes) { notes.push(line); continue; }
    if (!current) { introduction.push(line); continue; }
    current.content += (current.content ? '\n\n' : '') + line;
    const moduleMatch = line.match(moduleLabel);
    if (moduleMatch) current.module = moduleMatch[1].trim();
    const objective = line.match(/^objetivo(?:s)?\s*(?::\s*(.*))?$/i);
    if (objective) {
      current.objective = objective[1]?.trim() || '';
      awaitingObjective = !current.objective;
    } else if (awaitingObjective) {
      // Word often puts a bold "Objetivo" heading in its own paragraph. Only
      // consume prose; a following phase/metadata label is not the objective.
      if (!phaseHeading.test(line) && !/^[\p{L}\s]+\s*:/u.test(line) && !/^(?:materiales|recursos|reto|evidencia)$/i.test(line)) current.objective = line;
      awaitingObjective = false;
    }
    const durationLabel = line.match(/^duración\s*:\s*(\d{1,3})\s*minutos?\b/i);
    if (durationLabel) explicitDuration.set(current, Number(durationLabel[1]));
    const duration = phaseHeading.test(line) && line.match(/\b(\d{1,3})\s*minutos?\b/i);
    if (duration) current.durationMinutes += Number(duration[1]);
  }
  // One complete lesson is already a course. Require its objective and all
  // three teaching phases so an incidental activity in a quiz stays a test.
  if (!sections.length || sections.some(section => !section.objective ||
    new Set(section.content.split(/\n/).filter(line => phaseHeading.test(line))
      .map(line => line.match(/^(inicio|desarrollo|cierre)/i)![1].toLowerCase())).size < 3)) return;
  for (const section of sections) if (explicitDuration.has(section)) section.durationMinutes = explicitDuration.get(section)!;
  const title = introduction.shift() || sections[0].title;
  const description = introduction.join('\n\n') || sections[0].content.match(/^propósito\s*:\s*(.+)$/im)?.[1] || '';
  return {title, description, sections, notes: notes.join('\n\n')};
}
