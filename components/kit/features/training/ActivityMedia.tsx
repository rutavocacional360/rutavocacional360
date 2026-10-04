"use client";
import {useRef, useState} from 'react';
import {Button, Notice} from '../../components/ui/primitives';
import type {ActivityAttachment} from '../../lib/training-types';
import {ACTIVITY_ATTACHMENT_LIMIT, ACTIVITY_MEDIA_ACCEPT, activityFileError, activityMediaUrl} from '../../lib/activity-media';
import {adminFetch} from '../../lib/admin-session';

export function ActivityAttachments({attachments, onRemove}: {attachments?: ActivityAttachment[]; onRemove?: (id: string) => void}) {
  if (!attachments?.length) return null;
  return <div className="activity-attachments" aria-label="Materiales de la actividad">{attachments.map(file => {
    const url = activityMediaUrl(file.id);
    return <figure className="activity-attachment" key={file.id}>
      {file.mimeType.startsWith('image/') && <a href={url} target="_blank" rel="noopener noreferrer"><img src={url} alt={file.name} loading="lazy"/></a>}
      {file.mimeType.startsWith('video/') && <video controls preload="metadata" playsInline aria-label={file.name} src={url}>Tu navegador no puede reproducir este video. Usa el enlace de descarga.</video>}
      {file.mimeType.startsWith('audio/') && <audio controls preload="metadata" aria-label={file.name} src={url}>Tu navegador no puede reproducir este audio. Usa el enlace de descarga.</audio>}
      <figcaption><span>{file.name} <small>({file.size >= 1024 * 1024 ? (file.size / 1024 / 1024).toFixed(1) + ' MB' : Math.max(1, Math.round(file.size / 1024)) + ' KB'})</small></span><a href={activityMediaUrl(file.id, true)} download={file.name}>Descargar</a>{onRemove && <Button size="sm" variant="ghost" aria-label={'Quitar ' + file.name} onClick={() => onRemove(file.id)}>Quitar archivo</Button>}</figcaption>
    </figure>;
  })}</div>;
}

export function ActivityMediaEditor({attachments = [], onChange, onBusyChange}: {
  attachments?: ActivityAttachment[]; onChange: (files: ActivityAttachment[]) => void; onBusyChange?: (busy: boolean) => void;
}) {
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [progress, setProgress] = useState('');
  const uploading = useRef(false);
  async function upload(files: File[]) {
    if (uploading.current || !files.length) return;
    if (attachments.length + files.length > ACTIVITY_ATTACHMENT_LIMIT) {setError(`Cada actividad admite hasta ${ACTIVITY_ATTACHMENT_LIMIT} archivos.`); return;}
    const problem = files.map(file => activityFileError(file.name, file.size)).find(Boolean);
    if (problem) {setError(problem); return;}
    uploading.current = true; setBusy(true); onBusyChange?.(true); setError('');
    const added: ActivityAttachment[] = [];
    try {
      for (let index = 0; index < files.length; index++) {
        setProgress(`Subiendo ${index + 1} de ${files.length}: ${files[index].name}`);
        const form = new FormData(); form.set('file', files[index]);
        const response = await adminFetch('/api/training/media', {method: 'POST', body: form}, 10 * 60 * 1000);
        const value = await response.json().catch(() => ({}));
        if (!response.ok) throw Error(value.error || 'No se pudo subir el archivo. Reintenta.');
        added.push(value);
      }
      setProgress(`${added.length === 1 ? 'Archivo cargado' : added.length + ' archivos cargados'}. Guarda el curso para conservar los cambios.`);
    } catch (error) { setError((error as Error).name === 'TimeoutError' ? 'La carga tardó demasiado. Revisa tu conexión y vuelve a seleccionar los archivos pendientes.' : (error as Error).message); setProgress(''); }
    finally {
      if (added.length) onChange([...attachments, ...added]);
      uploading.current = false; setBusy(false); onBusyChange?.(false);
    }
  }
  return <div className="stack activity-media-editor" aria-busy={busy}>
    <label>Imágenes, videos, audio y documentos
      <input type="file" accept={ACTIVITY_MEDIA_ACCEPT} multiple disabled={busy || attachments.length >= ACTIVITY_ATTACHMENT_LIMIT} onChange={event => {const files = Array.from(event.target.files || []); event.target.value = ''; void upload(files);}}/>
    </label>
    <p className="small muted">Hasta 12 archivos por actividad. Imágenes y documentos: 20 MB por archivo. Video y audio: 100 MB. Videos MP4 o WebM; documentos PDF, Word, PowerPoint, Excel, TXT o CSV.</p>
    {progress && <p role="status">{progress}</p>}
    {error && <Notice tone="danger">{error}</Notice>}
    <ActivityAttachments attachments={attachments} onRemove={id => {if (!busy) onChange(attachments.filter(file => file.id !== id));}}/>
  </div>;
}
