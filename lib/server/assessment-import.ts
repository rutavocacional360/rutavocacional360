import { fail } from './store';
import { schoolTarget, type EducationLevel } from '@/components/kit/data/school-training';

export function assessmentImportLevel(value: unknown): EducationLevel {
  if (value !== 'bachillerato' && value !== 'universidad')
    fail('Selecciona Bachillerato o Universidad para importar el test.', 400);
  return value as EducationLevel;
}

/** The administrator chooses the route; document metadata cannot change it. */
export function scopeImportedTests(tests: any[], educationLevel: EducationLevel) {
  return tests.map(test => ({
    ...test, educationLevel, publishedAt:undefined, publishedBy:undefined,
    careerLinks: (Array.isArray(test.careerLinks) ? test.careerLinks : []).filter((link: any) =>
      link && typeof link === 'object' && typeof link.careerId === 'string' && link.careerId.trim() &&
      schoolTarget(link.careerId) === (educationLevel === 'bachillerato')),
  }));
}
