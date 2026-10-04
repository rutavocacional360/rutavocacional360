import { preparationLevel } from '../data/school-training';
import { courseTitleKey } from './course-catalog';
import type { Course, Simulator } from './training-types';

function omit(value: object, keys: string[]) {
  return Object.fromEntries(Object.entries(value).filter(([key]) => !keys.includes(key)));
}

// JSON field order and regenerated editor IDs do not change learning content.
// Keep every other field, including answer keys, feedback and access settings.
function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, stable(item)]),
  );
  return value;
}

const identityFields = ['id', 'version', 'revision', 'status', 'sourceImportId'];
const sorted = (items: string[] | undefined) => [...new Set(items || [])].sort();

export function courseContentKey(value: Course) {
  return JSON.stringify(stable({
    ...omit(value, identityFields),
    educationLevel: preparationLevel(value.careerIds, value.educationLevel),
    title: courseTitleKey(value.title),
    careerIds: sorted(value.careerIds), fields: sorted(value.fields),
    institutions: sorted(value.institutions), studentIds: sorted(value.studentIds),
    availableFrom: value.availableFrom || '', availableUntil: value.availableUntil || '',
    profileId: value.profileId || '', profileVersion: value.profileVersion || 0,
    activities: value.activities?.map(activity => ({
      ...omit(activity, ['id']), simulatorId: activity.simulatorId || '',
      simulatorVersion: activity.simulatorVersion || 0, target: activity.target ?? null,
    })),
  }));
}

export function simulatorContentKey(value: Simulator) {
  const questionIds = new Map(value.questions.map((question, index) => [question.id, index]));
  const reference = (id: string) => questionIds.has(id) ? questionIds.get(id) : id;
  const options = (items: Simulator['instrument']['options']) => items?.map(option => omit(option, ['id']));
  return JSON.stringify(stable({
    ...omit(value, identityFields),
    educationLevel: preparationLevel(value.careerIds, value.educationLevel),
    title: courseTitleKey(value.title), careerIds: sorted(value.careerIds),
    modes: sorted(value.modes), practiceDurationMinutes: value.practiceDurationMinutes || 0,
    profileId: value.profileId || '', profileVersion: value.profileVersion || 0,
    // These instrument fields are replaced by academicInstrument at execution.
    instrument: {
      ...omit(value.instrument, ['id', 'version', 'stableId', 'sourceId', 'title', 'educationLevel', 'questions']),
      options: options(value.instrument.options),
    },
    questions: value.questions.map(question => ({
      ...omit(question, ['id', 'bankId', 'bankVersion', 'reviewed', 'aiSuggested', 'aiIssue']),
      options: options(question.options || value.instrument.options),
      visibleWhen: question.visibleWhen ? {
        ...question.visibleWhen, questionId: reference(question.visibleWhen.questionId),
      } : undefined,
    })),
    questionOrderFixedIds: value.questionOrderFixedIds?.map(reference),
  }));
}
