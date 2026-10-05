"use client";
import {useEffect, useId, useRef, useState} from 'react';
import {AudioLines, CheckCircle2, Download, FileText, ImageIcon, RefreshCw, UploadCloud, Video, X} from 'lucide-react';
import {Button} from '../../components/ui/primitives';
import type {ActivityAttachment} from '../../lib/training-types';
import {ACTIVITY_ATTACHMENT_LIMIT, ACTIVITY_MEDIA_ACCEPT, activityFileError, activityMediaUrl} from '../../lib/activity-media';
import {uploadActivityMedia} from '../../lib/activity-media-upload';
import './activity-media.css';

const sizeLabel = (size: number) => size >= 1024 * 1024 ? (size / 1024 / 1024).toFixed(1) + ' MB' : Math.max(1, Math.round(size / 1024)) + ' KB';
const fileKind = (mime: string) => mime.startsWith('image/') ? 'Imagen' : mime.startsWith('video/') ? 'Video' : mime.startsWith('audio/') ? 'Audio' : 'Documento';

function AttachmentCard({file, onRemove}: {file: ActivityAttachment; onRemove?: (id: string) => void}) {
  const [failed, setFailed] = useState(false);
  const kind = fileKind(file.mimeType), url = activityMediaUrl(file.id);
  const Icon = kind === 'Imagen' ? ImageIcon : kind === 'Video' ? Video : kind === 'Audio' ? AudioLines : FileText;
  return <figure className={'rv-media-card rv-media-card--' + kind.toLowerCase()}>
    {kind !== 'Documento' && <div className="rv-media-preview">
      {!failed && kind === 'Imagen' && <a href={url} target="_blank" rel="noopener noreferrer" aria-label={'Abrir imagen completa: ' + file.name}><img src={url} alt={file.name} loading="lazy" onError={() => setFailed(true)}/></a>}
      {!failed && kind === 'Video' && <video controls preload="metadata" playsInline aria-label={file.name} src={url} onError={() => setFailed(true)}>Tu navegador no puede reproducir este video. Usa el enlace de descarga.</video>}
      {!failed && kind === 'Audio' && <audio controls preload="metadata" aria-label={file.name} src={url} onError={() => setFailed(true)}>Tu navegador no puede reproducir este audio. Usa el enlace de descarga.</audio>}
      {failed && <div className="rv-media-fallback"><Icon size={28} aria-hidden="true"/><p>No se pudo mostrar la vista previa. Puedes descargar el archivo o intentar abrirlo de nuevo.</p><Button variant="secondary" size="sm" onClick={() => setFailed(false)}>Reintentar vista previa</Button></div>}
    </div>}
    <figcaption className="rv-media-caption">
      <span className="rv-media-file-icon"><Icon size={21} aria-hidden="true"/></span>
      <span className="rv-media-file-info"><strong>{file.name}</strong><small>{kind} · {sizeLabel(file.size)}{kind === 'Imagen' ? ' · Pulsa la imagen para ampliarla' : ''}</small></span>
      <div className="rv-media-file-actions"><a className="rv-media-download" href={activityMediaUrl(file.id, true)} download={file.name} aria-label={'Descargar ' + file.name}><Download size={17} aria-hidden="true"/>Descargar</a>{onRemove && <Button size="sm" variant="ghost" aria-label={'Quitar ' + file.name} onClick={() => onRemove(file.id)} icon={<X size={17} aria-hidden="true"/>}>Quitar</Button>}</div>
    </figcaption>
  </figure>;
}

export function ActivityAttachments({attachments, onRemove}: {attachments?: ActivityAttachment[]; onRemove?: (id: string) => void}) {
  if (!attachments?.length) return null;
  return <div className="rv-media-materials" aria-label="Materiales de la actividad">{attachments.map(file => <AttachmentCard key={file.id} file={file} onRemove={onRemove}/>)}</div>;
}

type UploadItem = {id: string; file: File; status: 'waiting' | 'uploading' | 'done' | 'error'; percent: number | null; error?: string};
export function ActivityMediaEditor({attachments = [], onChange, onBusyChange}: {
  attachments?: ActivityAttachment[]; onChange: (files: ActivityAttachment[]) => void; onBusyChange?: (busy: boolean) => void;
}) {
  const [busy, setBusy] = useState(false), [dragging, setDragging] = useState(false), [queue, setQueue] = useState<UploadItem[]>([]);
  const inputId = useId(), input = useRef<HTMLInputElement>(null), uploading = useRef(false), active = useRef<AbortController | null>(null);
  const current = useRef({attachments, onChange, onBusyChange}); current.current = {attachments, onChange, onBusyChange};
  useEffect(() => () => {active.current?.abort(); if (uploading.current) current.current.onBusyChange?.(false);}, []);
  useEffect(() => {
    if (!busy) return;
    const warn = (event: BeforeUnloadEvent) => {event.preventDefault(); event.returnValue = '';};
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [busy]);
  const updateItem = (id: string, patch: Partial<UploadItem>) => setQueue(items => items.map(item => item.id === id ? {...item, ...patch} : item));

  async function upload(items: UploadItem[]) {
    if (uploading.current || !items.length) return;
    uploading.current = true; setBusy(true); current.current.onBusyChange?.(true);
    const controller = new AbortController(); active.current = controller;
    try {
      for (const item of items) {
        if (controller.signal.aborted) break;
        const problem = activityFileError(item.file.name, item.file.size) || (current.current.attachments.length >= ACTIVITY_ATTACHMENT_LIMIT ? `La actividad ya tiene ${ACTIVITY_ATTACHMENT_LIMIT} archivos. Quita uno antes de reintentar.` : '');
        if (problem) {updateItem(item.id, {status: 'error', error: problem}); continue;}
        updateItem(item.id, {status: 'uploading', percent: 0, error: ''});
        try {
          const file = await uploadActivityMedia(item.file, {signal: controller.signal, onProgress: percent => updateItem(item.id, {percent})});
          if (controller.signal.aborted) break;
          // Commit each success with the latest props, even when later files fail.
          const next = [...current.current.attachments, file];
          current.current.attachments = next; current.current.onChange(next);
          updateItem(item.id, {status: 'done', percent: 100});
        } catch (error) {
          if (controller.signal.aborted) break;
          updateItem(item.id, {status: 'error', error: (error as Error).message});
        }
      }
    } finally {
      if (!controller.signal.aborted) {uploading.current = false; active.current = null; setBusy(false); current.current.onBusyChange?.(false);}
    }
  }
  function select(files: File[]) {
    if (uploading.current || !files.length) return;
    let available = ACTIVITY_ATTACHMENT_LIMIT - current.current.attachments.length;
    const items: UploadItem[] = files.map(file => {
      const error = activityFileError(file.name, file.size) || (available <= 0 ? `La actividad admite ${ACTIVITY_ATTACHMENT_LIMIT} archivos. Quita uno antes de reintentar.` : '');
      if (!error) available--;
      return {id: crypto.randomUUID(), file, status: error ? 'error' : 'waiting', percent: 0, error};
    });
    setQueue(existing => [...existing.filter(item => item.status === 'error'), ...items]);
    void upload(items.filter(item => item.status !== 'error'));
  }
  const errors = queue.filter(item => item.status === 'error');
  const full = attachments.length >= ACTIVITY_ATTACHMENT_LIMIT;
  return <section className="rv-media-editor" aria-labelledby={inputId + '-title'}>
    <div className="rv-media-heading"><div><h4 id={inputId + '-title'}>Materiales de la actividad</h4><p>Sube archivos para que el estudiante los vea aquí y pueda descargarlos.</p></div><span>{attachments.length}/{ACTIVITY_ATTACHMENT_LIMIT} archivos</span></div>
    <div className={'rv-media-dropzone' + (dragging ? ' is-dragging' : '') + (busy || full ? ' is-disabled' : '')}
      onDragOver={event => {event.preventDefault(); if (!busy && !full) setDragging(true);}}
      onDragLeave={event => {if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false);}}
      onDrop={event => {event.preventDefault(); setDragging(false); if (!busy && !full) select(Array.from(event.dataTransfer.files));}}>
      <UploadCloud size={30} aria-hidden="true"/>
      <strong>{busy ? 'Subiendo tus materiales…' : full ? 'Has añadido los 12 archivos permitidos' : 'Arrastra tus archivos aquí'}</strong>
      <span>{busy ? 'Espera a que termine la carga antes de guardar el curso.' : 'Imágenes, videos, audio y documentos'}</span>
      <input ref={input} id={inputId} className="rv-media-input" type="file" accept={ACTIVITY_MEDIA_ACCEPT} multiple disabled={busy || full} aria-label="Seleccionar materiales de la actividad" aria-describedby={inputId + '-help'} onChange={event => {const files = Array.from(event.target.files || []); event.target.value = ''; select(files);}}/>
      <Button variant="secondary" disabled={busy || full} onClick={() => input.current?.click()} icon={<UploadCloud size={18} aria-hidden="true"/>}>Seleccionar archivos</Button>
    </div>
    <p className="rv-media-help" id={inputId + '-help'}>Imágenes y documentos: hasta 20 MB por archivo. Video y audio: hasta 100 MB. JPG, PNG, WebP, GIF, MP4, WebM, MP3, WAV, OGG, M4A, PDF, DOCX, PPTX, XLSX, TXT y CSV.</p>
    {queue.length > 0 && <div className="rv-media-upload-list" aria-label="Estado de las cargas">
      {queue.map(item => <div className={'rv-media-upload-row is-' + item.status} key={item.id}>
        <div className="rv-media-upload-name"><span>{item.file.name}</span><small>{sizeLabel(item.file.size)}</small></div>
        {item.status === 'uploading' && <><progress max={100} value={item.percent ?? undefined} aria-label={'Subiendo ' + item.file.name}/><span role="status">{item.percent === 100 ? 'Verificando y guardando en el servidor…' : item.percent === null ? 'Subiendo…' : `Subiendo… ${item.percent}%`}</span></>}
        {item.status === 'waiting' && <span>En espera</span>}
        {item.status === 'done' && <span className="rv-media-success"><CheckCircle2 size={16} aria-hidden="true"/>Archivo cargado</span>}
        {item.status === 'error' && <><p role="alert">{item.error}</p><div className="rv-media-file-actions"><Button variant="secondary" size="sm" disabled={busy} icon={<RefreshCw size={16} aria-hidden="true"/>} onClick={() => void upload([item])}>Reintentar</Button><Button variant="ghost" size="sm" disabled={busy} aria-label={'Descartar carga de ' + item.file.name} onClick={() => setQueue(items => items.filter(row => row.id !== item.id))}>Descartar</Button></div></>}
      </div>)}
      {!busy && errors.length > 1 && <Button variant="secondary" onClick={() => void upload(errors)}>Reintentar archivos pendientes</Button>}
      {!busy && queue.some(item => item.status === 'done') && <p className="rv-media-saved-hint" role="status"><CheckCircle2 size={18} aria-hidden="true"/>Material cargado. Guarda el borrador para conservarlo o publica el curso para compartirlo.</p>}
    </div>}
    <ActivityAttachments attachments={attachments} onRemove={id => {if (!uploading.current) current.current.onChange(current.current.attachments.filter(file => file.id !== id));}}/>
  </section>;
}
