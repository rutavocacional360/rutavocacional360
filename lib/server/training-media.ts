import { randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, writeFile, unlink, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { Readable } from 'node:stream';
import sharp from 'sharp';
import { db, document, put, fail } from './store';
import { activityFileError, ACTIVITY_ATTACHMENT_LIMIT } from '@/components/kit/lib/activity-media';
import type { Activity, ActivityAttachment, Course } from '@/components/kit/lib/training-types';
import { documentArchive, plainDocumentText } from './document-text';

type User = {id: string; role: string; institutionId?: string | null};
type StoredAttachment = ActivityAttachment & {uploadedBy: string; createdAt: string};
const owner = (user: User) => 'institution:' + (user.institutionId || '');
const key = (id: string) => 'rv360:training-media:' + id;
const validId = (id: unknown): id is string => typeof id === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(id);
export const trainingMediaFolder = () => resolve(/* turbopackIgnore: true */ process.env.TRAINING_MEDIA_PATH || resolve(dirname(process.env.IMPORT_PATH || 'storage/imports'), 'training-media'));
const reference = ({id, name, mimeType, size}: ActivityAttachment): ActivityAttachment => ({id, name, mimeType, size});

async function inspectFile(name: string, bytes: Buffer): Promise<string> {
  const ext = name.split('.').pop()!.toLowerCase();
  const ascii = (start: number, end: number) => bytes.toString('ascii', start, end);
  const matches = (signature: number[]) => signature.every((value, index) => bytes[index] === value);
  if (['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext)) {
    const metadata = await sharp(bytes, {limitInputPixels: 40_000_000}).metadata().catch(() => null);
    const expected = ext === 'jpg' ? 'jpeg' : ext;
    if (metadata?.format === expected && metadata.width && metadata.height) return 'image/' + expected;
  } else if (ext === 'mp4' || ext === 'm4a') {
    if (bytes.length >= 24 && ascii(4, 8) === 'ftyp' && bytes.readUInt32BE(0) >= 16 && bytes.readUInt32BE(0) <= bytes.length) {
      const brands = ascii(8, Math.min(bytes.readUInt32BE(0), 128));
      if (/(isom|iso[2-9]|mp4[12]|avc1|M4V |M4A |dash)/.test(brands)) return ext === 'mp4' ? 'video/mp4' : 'audio/mp4';
    }
  } else if (ext === 'webm' && matches([0x1a, 0x45, 0xdf, 0xa3]) && bytes.subarray(0, 4096).includes(Buffer.from('webm'))) return 'video/webm';
  else if (ext === 'mp3' && (ascii(0, 3) === 'ID3' || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0))) return 'audio/mpeg';
  else if (ext === 'wav' && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WAVE') return 'audio/wav';
  else if (ext === 'ogg' && ascii(0, 4) === 'OggS') return 'audio/ogg';
  else if (ext === 'pdf' && ascii(0, 5) === '%PDF-') return 'application/pdf';
  else if (['docx', 'pptx', 'xlsx'].includes(ext)) {
    const archive = documentArchive(bytes, ext.toUpperCase());
    const entry = {docx: 'word/document.xml', pptx: 'ppt/presentation.xml', xlsx: 'xl/workbook.xml'}[ext]!;
    if (archive.has('[Content_Types].xml') && archive.has(entry)) {
      archive.read('[Content_Types].xml'); archive.read(entry);
      return 'application/vnd.openxmlformats-officedocument.' + {docx: 'wordprocessingml.document', pptx: 'presentationml.presentation', xlsx: 'spreadsheetml.sheet'}[ext];
    }
  } else if (ext === 'txt' || ext === 'csv') {
    plainDocumentText(bytes);
    return ext === 'csv' ? 'text/csv' : 'text/plain';
  }
  fail('El contenido del archivo no coincide con su formato. Revisa el archivo original.', 415);
}

export async function storeActivityFile(user: User, file: File): Promise<ActivityAttachment> {
  if (user.role !== 'admin') fail('Solo administración puede subir materiales.', 403);
  const error = activityFileError(file.name, file.size);
  if (error) fail(error, file.size > 20 * 1024 * 1024 ? 413 : 400);
  const bytes = Buffer.from(await file.arrayBuffer());
  const mimeType = await inspectFile(file.name, bytes).catch(error => {
    if (error.status) throw error;
    fail('No se pudo leer el archivo. Revisa su formato y contenido.', 415);
  });
  const name = file.name.split(/[\\/]/).pop()!.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 180) || 'Material';
  const attachment: StoredAttachment = {id: randomUUID(), name, mimeType, size: bytes.length, uploadedBy: user.id, createdAt: new Date().toISOString()};
  await mkdir(trainingMediaFolder(), {recursive: true});
  const path = resolve(trainingMediaFolder(), attachment.id);
  await writeFile(path, bytes, {flag: 'wx', mode: 0o600});
  try { await put(owner(user), key(attachment.id), attachment); }
  catch (error) { await unlink(path).catch(() => {}); throw error; }
  return reference(attachment);
}

/** Canonicalize references from the database before drafts or publications persist. */
export async function validateActivityAttachments(user: User, activities: Activity[]) {
  for (const activity of activities) {
    if (!activity || typeof activity !== 'object') fail('Revisa las actividades.');
    if (activity.attachments === undefined) continue;
    if (!Array.isArray(activity.attachments) || activity.attachments.length > ACTIVITY_ATTACHMENT_LIMIT)
      fail(`Cada actividad admite hasta ${ACTIVITY_ATTACHMENT_LIMIT} archivos.`);
    const seen = new Set<string>();
    const attachments: ActivityAttachment[] = [];
    for (const value of activity.attachments) {
      if (!value || !validId(value.id) || seen.has(value.id)) fail('Revisa los archivos de la actividad.');
      seen.add(value.id);
      const stored = await document(owner(user), key(value.id)) as StoredAttachment | null;
      if (!stored) fail('Un archivo de la actividad no está disponible en esta institución. Vuelve a subirlo.');
      try { await stat(resolve(trainingMediaFolder(), stored.id)); }
      catch { fail('Un archivo de la actividad ya no está en el almacenamiento. Vuelve a subirlo.'); }
      attachments.push(reference(stored));
    }
    activity.attachments = attachments;
  }
}

const contains = (course: Course, id: string) => course.activities?.some(activity => activity.attachments?.some(file => file.id === id));
export async function readableActivityFile(user: User, id: string): Promise<ActivityAttachment> {
  if (!validId(id)) fail('Material no disponible.', 404);
  const stored = await document(owner(user), key(id)) as StoredAttachment | null;
  if (!stored) fail('Material no disponible.', 404);
  if (user.role === 'admin') return reference(stored);
  if (user.role !== 'student') fail('Material no disponible.', 404);
  // Enrolled snapshots preserve access when a newer course version replaces them.
  const enrollments = await db.prepare('SELECT snapshot FROM training_enrollments WHERE user_id=?').all(user.id) as {snapshot: string}[];
  if (enrollments.some(row => contains(JSON.parse(row.snapshot), id))) return reference(stored);
  fail('Material no disponible.', 404);
}

export async function activityFileResponse(user: User, id: string, request: Request) {
  const file = await readableActivityFile(user, id);
  const path = resolve(trainingMediaFolder(), id);
  let size: number;
  try { size = (await stat(path)).size; }
  catch { fail('El archivo no está disponible. Solicita al administrador que lo vuelva a subir.', 404); }
  const inline = /^(image|video|audio)\//.test(file.mimeType) && new URL(request.url).searchParams.get('download') !== '1';
  const headers = new Headers({
    'Content-Type': file.mimeType, 'Accept-Ranges': 'bytes', 'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff', 'Cross-Origin-Resource-Policy': 'same-origin',
    'Content-Security-Policy': "default-src 'none'; sandbox",
    'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="material"; filename*=UTF-8''${encodeURIComponent(file.name).replace(/['()*]/g, value => '%' + value.charCodeAt(0).toString(16))}`,
  });
  let start = 0, end = size! - 1, status = 200;
  const range = request.method === 'HEAD' ? null : request.headers.get('range');
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!match || (!match[1] && !match[2])) return new Response(null, {status: 416, headers: {...Object.fromEntries(headers), 'Content-Range': `bytes */${size!}`}});
    if (!match[1]) start = Math.max(0, size! - Number(match[2]));
    else { start = Number(match[1]); if (match[2]) end = Math.min(end, Number(match[2])); }
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start > end || start >= size!)
      return new Response(null, {status: 416, headers: {...Object.fromEntries(headers), 'Content-Range': `bytes */${size!}`}});
    status = 206; headers.set('Content-Range', `bytes ${start}-${end}/${size!}`);
  }
  headers.set('Content-Length', String(end - start + 1));
  return new Response(request.method === 'HEAD' ? null : Readable.toWeb(createReadStream(path, {start, end})) as ReadableStream<Uint8Array>, {status, headers});
}
