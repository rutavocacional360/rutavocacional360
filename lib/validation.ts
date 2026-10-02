// Shared client/server rules. Passwords are never trimmed or normalized.
export const normalizeName = (value: string) => value.normalize('NFC').trim().replace(/ +/g, ' ');
// Editing rule: allow partial names while typing; full validation still runs on save.
export const filterNameInput = (value: string) => value.normalize('NFC').replace(/\s/g, ' ').replace(/[^\p{L}\p{M} '\u2019.\-]/gu, '');
export function nameProblem(value: unknown, max = 140): string {
  if (typeof value !== 'string') return 'Escribe un nombre válido.';
  const name = normalizeName(value);
  if (name.length < 2 || name.length > max) return `Usa entre 2 y ${max} caracteres.`;
  if (!/^\p{L}[\p{L}\p{M}]*(?:['\u2019.\-]\p{L}[\p{L}\p{M}]*)*\.?(?: +\p{L}[\p{L}\p{M}]*(?:['\u2019.\-]\p{L}[\p{L}\p{M}]*)*\.?)*$/u.test(name))
    return 'Usa solo letras, espacios, apóstrofes o guiones.';
  return '';
}
export function emailProblem(value: unknown): string {
  if (typeof value !== 'string') return 'Escribe un correo electrónico válido.';
  const email = value.trim();
  if (email.length > 254 || !/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+$/.test(email))
    return 'Escribe un correo electrónico válido.';
  const local = email.split('@')[0];
  if (local.length > 64 || local.startsWith('.') || local.endsWith('.') || local.includes('..') || email.split('@')[1].split('.').some(part => part.length > 63))
    return 'Escribe un correo electrónico válido.';
  return '';
}
export function passwordProblem(value: unknown): string {
  return typeof value !== 'string' || value.length < 15 || value.length > 128 || !value.trim() || /[\u0000-\u001f\u007f]/.test(value)
    ? 'Usa entre 15 y 128 caracteres; no solo espacios ni caracteres de control.' : '';
}
export function textProblem(value: unknown, max: number, required = false): string {
  return typeof value !== 'string' || value.length > max || (required && !value.trim()) || /[\u0000-\u001f\u007f<>]/.test(value)
    ? `Escribe un texto válido de hasta ${max} caracteres.` : '';
}
export function settingsProblem(value: unknown): string {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return 'Configuración no válida.';
  const data = value as Record<string, unknown>;
  if (textProblem(data.name, 191, true)) return 'Revisa el nombre de la plataforma (máximo 191 caracteres).';
  if (emailProblem(data.email)) return 'Revisa el correo de orientación.';
  if (typeof data.year !== 'string' || data.year.length > 11 || !/^\d{4}\s*[-–]\s*\d{4}$/.test(data.year)) return 'Escribe el periodo como 2026–2027.';
  const years = data.year.split(/[-–]/).map(Number);
  if (years[0] < 2000 || years[1] !== years[0] + 1) return 'El periodo debe abarcar dos años consecutivos.';
  if (typeof data.timezone !== 'string' || !['America/Guayaquil', 'Pacific/Galapagos'].includes(data.timezone)) return 'Selecciona una zona horaria válida.';
  if (typeof data.selfRegistration !== 'string' || typeof data.reviewRequired !== 'string' || !['yes', 'no'].includes(data.selfRegistration) || !['yes', 'no'].includes(data.reviewRequired)) return 'Revisa las preferencias de la plataforma.';
  return '';
}
export function studentDocumentProblem(key: string, value: unknown): string {
  const bad = 'Revisa los datos y la longitud de los campos antes de guardar.';
  if (key === 'rv360:tasks') {
    if (!Array.isArray(value) || value.length > 200) return bad;
    const ids = new Set();
    for (const task of value) {
      if (!task || textProblem(task.id, 100, true) || ids.has(task.id) || textProblem(task.title, 300, true) || typeof task.done !== 'boolean' || typeof task.date !== 'string') return bad;
      ids.add(task.id);
      if (task.date && (!/^\d{4}-\d{2}-\d{2}$/.test(task.date) || !Number.isFinite(Date.parse(task.date)) || new Date(task.date).toISOString().slice(0, 10) !== task.date)) return 'Selecciona una fecha válida.';
    }
  }
  if (['rv360:course-notes', 'rv360:reflections'].includes(key)) {
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length > 100) return bad;
    if (Object.entries(value).some(([id, note]) => id.length > 100 || typeof note !== 'string' || note.length > 10000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(note))) return bad;
  }
  if (['rv360:saved-careers', 'rv360:saved-resources', 'rv360:course-done', 'rv360:venture-steps'].includes(key)) {
    if (!Array.isArray(value) || value.length > 1000 || new Set(value).size !== value.length || value.some(item => textProblem(item, 200, true))) return bad;
    if (key === 'rv360:course-done' && value.some(item => !/^[0-7]$/.test(item))) return bad;
  }
  return '';
}
