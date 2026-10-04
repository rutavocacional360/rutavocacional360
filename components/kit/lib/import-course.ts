/** A teaching programme contains activities and instructions, not answer keys. */
export type ImportedCourse = {
  title: string;
  description: string;
  sections: {title: string; content: string; objective: string; durationMinutes: number; module: string}[];
  notes: string;
};

const activityHeading = /^(?:actividad|dinámica|sesión)\s+\d{1,3}\s*[.:–—-]\s*\S.+$/i;
const moduleHeading = /^(?:eje|módulo|unidad)\s+\d{1,3}\s*[.:–—-]\s*\S.+$/i;
const programmeNotes = /^(?:evaluación general|rúbrica general|recomendaciones generales|bibliografía|referencias(?: bibliográficas)?|fuentes de consulta)\b/i;
const phaseHeading = /^(?:inicio|desarrollo|cierre)\s*(?:\(|:|$)/i;

export function parseInstructionalCourse(text: string): ImportedCourse | undefined {
  const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const sections: ImportedCourse['sections'] = [];
  const introduction: string[] = [], notes: string[] = [];
  let module = '', current: ImportedCourse['sections'][number] | undefined, inNotes = false;
  for (const line of lines) {
    // Printed writing guides carry no content and make the online lesson unreadable.
    if (/^[\s.…_·-]{4,}$/.test(line)) continue;
    if (activityHeading.test(line)) {
      current = {title: line, content: '', objective: '', durationMinutes: 0, module};
      sections.push(current);
      inNotes = false;
      continue;
    }
    if (moduleHeading.test(line)) { module = line; current = undefined; inNotes = false; continue; }
    if (sections.length && programmeNotes.test(line)) { inNotes = true; current = undefined; }
    if (inNotes) { notes.push(line); continue; }
    if (!current) { introduction.push(line); continue; }
    current.content += (current.content ? '\n\n' : '') + line;
    const objective = line.match(/^objetivo(?:s)?\s*:\s*(.+)/i);
    if (objective) current.objective = objective[1];
    const duration = phaseHeading.test(line) && line.match(/\b(\d{1,3})\s*minutos?\b/i);
    if (duration) current.durationMinutes += Number(duration[1]);
  }
  // Multiple activity headings plus objectives and the three teaching phases are
  // required. A questionnaire that merely mentions an activity stays a test.
  if (sections.length < 2 || sections.some(section => !section.objective ||
    new Set(section.content.split(/\n/).filter(line => phaseHeading.test(line))
      .map(line => line.match(/^(inicio|desarrollo|cierre)/i)![1].toLowerCase())).size < 3)) return;
  const title = introduction.shift() || 'Programa de actividades';
  return {title, description: introduction.join('\n\n'), sections, notes: notes.join('\n\n')};
}
