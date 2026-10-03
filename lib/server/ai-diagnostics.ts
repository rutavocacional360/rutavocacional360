import {analyzeStudentGuidance, type StudentGuidanceAI} from './student-guidance-ai';
import {document, put, db} from './store';

/** Synthetic examples exercise the same prompts, schema and validators as student reports. */
export function diagnosticReport(educationLevel: 'bachillerato' | 'universidad') {
  const evidence = ['diagnostic-interest:dimension:I'];
  return {
    instruments: [{instrumentId: 'diagnostic-interest', instrument: {educationLevel}, scores: [{dimension: 'I', value: 20, min: 5, max: 25}]}],
    catalog: [{id: 'diagnostic-software', name: 'Ingeniería de Software'}],
    analysis: educationLevel === 'bachillerato'
      ? {pathway: {suggested: 'tecnico', science: [], technical: [{id: 'diagnostic-informatica', name: 'Informática', evidence}]}}
      : {recommendations: [{careerId: 'diagnostic-software', evidence}]},
  };
}

export async function checkStudentAI(educationLevel: 'bachillerato' | 'universidad') {
  const result: StudentGuidanceAI = await analyzeStudentGuidance(diagnosticReport(educationLevel), {
    educationLevel, ready: true,
    // Separate diagnostic status from actual student successes. Cache checks for
    // five minutes and enforce a shared daily cap even across server processes.
    cache: {
      read: async key => {
        const saved = await document('system', 'ai-diagnostic:' + key, null);
        return saved?.expiresAt > Date.now() ? saved.value : null;
      },
      write: async (key, value) => {await put('system', 'ai-diagnostic:' + key, {expiresAt: Date.now() + 300000, value});},
      reserve: async day => {
        const key = 'ai-diagnostic-budget:' + day;
        await db.prepare('INSERT INTO documents(owner,key,value) VALUES(?,?,?) ON CONFLICT(owner,key) DO NOTHING').run('system', key, '0');
        const integer = db.driver === 'mysql' ? 'SIGNED' : 'INTEGER';
        const saved = await db.prepare('UPDATE documents SET value=CAST(value AS ' + integer + ')+1,revision=revision+1 WHERE owner=? AND key=? AND CAST(value AS ' + integer + ') < ?').run('system', key, 20);
        return saved.changes === 1;
      },
    },
  });
  return {educationLevel, ok: result.status === 'available', status: result.status, model: result.model || null, generatedAt: result.generatedAt || null, reused: !!result.reused, error: result.error || null};
}
