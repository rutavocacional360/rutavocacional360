/** Shared limits keep the editor and upload endpoint in agreement. */
export const ACTIVITY_ATTACHMENT_LIMIT = 12;
export const ACTIVITY_MEDIA_MAX_BYTES = 100 * 1024 * 1024;
export const ACTIVITY_MEDIA_ACCEPT = '.jpg,.jpeg,.png,.webp,.gif,.mp4,.webm,.mp3,.wav,.ogg,.m4a,.pdf,.docx,.pptx,.xlsx,.txt,.csv';
export function activityFileError(name: string, size: number) {
  const extension = name.split('.').pop()?.toLowerCase() || '';
  if (!ACTIVITY_MEDIA_ACCEPT.split(',').includes('.' + extension))
    return 'Usa una imagen JPG, PNG, WebP o GIF; video MP4 o WebM; audio MP3, WAV, OGG o M4A; documento PDF, DOCX, PPTX, XLSX, TXT o CSV.';
  const limit = /^(mp4|webm|mp3|wav|ogg|m4a)$/.test(extension) ? ACTIVITY_MEDIA_MAX_BYTES : 20 * 1024 * 1024;
  if (!size || size > limit) return `El archivo debe tener contenido y no superar ${limit / 1024 / 1024} MB.`;
  return '';
}
export const activityMediaUrl = (id: string, download = false) => '/api/training/media/' + encodeURIComponent(id) + (download ? '?download=1' : '');
