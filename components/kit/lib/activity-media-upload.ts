import {refreshAdminAccess, renewAdminSession} from './admin-session';
import type {ActivityAttachment} from './training-types';

type UploadOptions = {onProgress: (percent: number | null) => void; signal?: AbortSignal};
class UploadError extends Error {
  constructor(message: string, public status = 0) { super(message); }
}

/** XHR reports transmitted bytes; a successful response confirms storage. */
function send(file: File, {onProgress, signal}: UploadOptions): Promise<ActivityAttachment> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new DOMException('Carga cancelada.', 'AbortError')); return; }
    const xhr = new XMLHttpRequest();
    const abort = () => xhr.abort();
    const finish = (error?: Error, result?: ActivityAttachment) => {
      signal?.removeEventListener('abort', abort);
      if (error) reject(error); else resolve(result!);
    };
    xhr.open('POST', '/api/training/media');
    xhr.timeout = 10 * 60 * 1000;
    xhr.upload.onprogress = event => onProgress(event.lengthComputable ? Math.min(100, Math.round(event.loaded / event.total * 100)) : null);
    xhr.onload = () => {
      let data: any;
      try { data = JSON.parse(xhr.responseText); } catch { /* Proxies can return HTML errors. */ }
      if (xhr.status < 200 || xhr.status >= 300) {
        const fallback = xhr.status === 413 ? 'El servidor rechazó el tamaño del archivo. Usa un archivo más pequeño.'
          : xhr.status === 401 ? 'Tu sesión ha caducado. Inicia sesión y reintenta este archivo.'
          : 'No se pudo guardar el archivo. Revisa tu conexión y reintenta.';
        finish(new UploadError(typeof data?.error === 'string' ? data.error : fallback, xhr.status));
      } else if (typeof data?.id !== 'string' || typeof data?.name !== 'string' || typeof data?.mimeType !== 'string' || typeof data?.size !== 'number') {
        finish(new UploadError('El servidor devolvió una respuesta incompleta. Reintenta este archivo.'));
      } else finish(undefined, data);
    };
    xhr.onerror = () => finish(new UploadError('Se interrumpió la conexión. Reintenta este archivo; los demás se conservan.'));
    xhr.ontimeout = () => finish(new UploadError('La carga tardó demasiado. Revisa tu conexión y reintenta este archivo.'));
    xhr.onabort = () => finish(new DOMException('Carga cancelada.', 'AbortError'));
    signal?.addEventListener('abort', abort, {once: true});
    const body = new FormData(); body.set('file', file);
    xhr.send(body);
  });
}

export async function uploadActivityMedia(file: File, options: UploadOptions) {
  options.onProgress(0);
  try { return await send(file, options); }
  catch (error) {
    if (!(error instanceof UploadError) || error.status !== 401) throw error;
    if (!await refreshAdminAccess()) await renewAdminSession();
    options.signal?.throwIfAborted();
    options.onProgress(0);
    return send(file, options);
  }
}
