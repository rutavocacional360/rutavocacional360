import { db, resultIsReleased, fail } from './store';
import { currentAssessments } from './battery';
import { calculateTest, absent } from '@/components/kit/lib/test-engine';
import type { EducationLevel } from '@/components/kit/data/school-training';

export const READINESS_VERSION = 'completed-published-current-tests-1';
export async function assessmentReadiness(user: any) {
  const tests = await currentAssessments(user);
  const submissions: any[] = await db.prepare('SELECT * FROM submissions WHERE user_id=? ORDER BY created_at DESC,id DESC').all(user.id);
  const attempts: any[] = await db.prepare("SELECT instrument_id,started_at FROM assessment_attempts WHERE user_id=? AND state='in_progress'").all(user.id);
  const checks = await Promise.all(tests.map(async test => {
    const submission = submissions.find(s => s.instrument_id === test.id && String(s.version) === String(test.version));
    let state = 'not_started';
    if (attempts.some(a => a.instrument_id === test.id && (!submission || a.started_at > submission.created_at))) state = 'in_progress';
    else if (submission) {
      if (!await resultIsReleased(submission)) state = 'awaiting_results';
      else {
        const result: any = await db.prepare('SELECT result FROM assessment_results WHERE submission_id=? ORDER BY revision DESC LIMIT 1').get(submission.id);
        try {
          const snapshot = JSON.parse(submission.snapshot), answers = JSON.parse(submission.answers);
          const evaluation = result ? JSON.parse(result.result) : calculateTest(snapshot, answers);
          state = evaluation.state === 'complete' && Object.values(answers).some(v => !absent(v)) ? 'complete' : 'insufficient';
        } catch { state = 'insufficient'; }
      }
    }
    return { id: test.id, version: test.version, title: test.title, educationLevel: test.educationLevel || 'ambos', state };
  }));
  const level = (educationLevel: EducationLevel) => {
    const required = checks.filter(t => t.educationLevel === 'ambos' || t.educationLevel === educationLevel);
    const pending = required.filter(t => t.state !== 'complete');
    return { ready: required.length > 0 && pending.length === 0, total: required.length, completed: required.length - pending.length, pending };
  };
  return { version: READINESS_VERSION, bachillerato: level('bachillerato'), universidad: level('universidad') };
}

export async function requireCompletedAssessments(user: any, level: EducationLevel) {
  const readiness = await assessmentReadiness(user);
  if (!readiness[level].ready) fail('Completa todos los tests de esta ruta y espera la publicación de sus resultados antes de acceder a los cursos.', 409);
  return readiness;
}
