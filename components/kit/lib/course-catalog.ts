import type { Versioned } from './training-types';

export function courseFamilies<T extends Versioned>(courses: T[]) {
  const families = new Map<string, T[]>();
  for (const course of courses) {
    const versions = families.get(course.id) || [];
    versions.push(course);
    families.set(course.id, versions);
  }
  return [...families.values()].map(versions => {
    versions.sort((a, b) => b.version - a.version);
    const draft = versions.find(course => course.status === 'draft');
    const published = versions.find(course => course.status === 'published');
    return { versions, draft, published, current: published || draft || versions[0] };
  });
}

export const courseTitleKey = (title: string) => title.trim().replace(/\s+/g, ' ').toLocaleLowerCase('es');
