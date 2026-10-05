"use client";
import {useId, useRef, useState} from 'react';
import type {KeyboardEvent} from 'react';
import {CheckCircle2, ExternalLink, Plus, Video, X} from 'lucide-react';
import {Button, Field} from '../../components/ui/primitives';
import type {ActivityYouTubeVideo} from '../../lib/training-types';
import {YOUTUBE_VIDEO_LIMIT, parseYouTubeUrl, youtubeEmbedUrl, youtubeWatchUrl} from '../../lib/activity-youtube';
import './activity-youtube.css';

export function ActivityYouTubeVideos({videos = [], onRemove, disabled = false}: {
  videos?: ActivityYouTubeVideo[];
  onRemove?: (videoId: string) => void;
  disabled?: boolean;
}) {
  if (!videos.length) return null;
  return <div className="rv-youtube-videos" aria-label="Videos de YouTube de la actividad">
    {videos.map(video => {
      const title = video.title.trim() || 'Video de YouTube';
      return <figure className="rv-youtube-card" key={video.videoId}>
        <div className="rv-youtube-frame"><iframe
          src={youtubeEmbedUrl(video)} title={title} loading="lazy"
          referrerPolicy="strict-origin-when-cross-origin"
          allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
        /></div>
        <figcaption className="rv-youtube-caption">
          <span className="rv-youtube-icon"><Video size={20} aria-hidden="true"/></span>
          <div className="rv-youtube-info"><strong>{title}</strong><small>Video de YouTube</small></div>
          <div className="rv-youtube-actions">
            <a href={youtubeWatchUrl(video)} target="_blank" rel="noopener noreferrer" aria-label={'Abrir en YouTube: ' + title}>
              Abrir en YouTube<ExternalLink size={15} aria-hidden="true"/>
            </a>
            {onRemove && <Button variant="ghost" size="sm" disabled={disabled} icon={<X size={16} aria-hidden="true"/>}
              aria-label={'Quitar video de YouTube: ' + title} onClick={() => {if (!disabled) onRemove(video.videoId);}}>Quitar</Button>}
          </div>
          <p className="rv-youtube-fallback">Si el video no se reproduce aquí, ábrelo en YouTube.</p>
        </figcaption>
      </figure>;
    })}
  </div>;
}

export function ActivityYouTubeEditor({videos = [], onChange, disabled = false}: {
  videos?: ActivityYouTubeVideo[];
  onChange: (videos: ActivityYouTubeVideo[]) => void;
  disabled?: boolean;
}) {
  const id = useId();
  const [url, setUrl] = useState(''), [title, setTitle] = useState('');
  const [error, setError] = useState(''), [message, setMessage] = useState('');
  const current = useRef({videos, onChange, disabled});
  current.current = {videos, onChange, disabled};
  const full = videos.length >= YOUTUBE_VIDEO_LIMIT;
  function update(next: ActivityYouTubeVideo[]) {
    current.current.videos = next;
    current.current.onChange(next);
  }
  function add() {
    if (current.current.disabled) return;
    setMessage('');
    if (current.current.videos.length >= YOUTUBE_VIDEO_LIMIT) {
      setError(`Puedes añadir hasta ${YOUTUBE_VIDEO_LIMIT} videos de YouTube por actividad. Quita uno para añadir otro.`);
      return;
    }
    const parsed = parseYouTubeUrl(url);
    if (!parsed) {
      setError('Introduce un enlace válido de YouTube (youtube.com o youtu.be).');
      document.getElementById(id + '-url')?.focus();
      return;
    }
    if (current.current.videos.some(video => video.videoId === parsed.videoId)) {
      setError('Este video ya está añadido a la actividad.');
      document.getElementById(id + '-url')?.focus();
      return;
    }
    update([...current.current.videos, {...parsed, title: title.trim() || 'Video de YouTube'}]);
    setUrl(''); setTitle(''); setError('');
    setMessage('Video añadido. Guarda el borrador para conservarlo o publica el curso para compartirlo.');
  }
  function enter(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
    event.preventDefault();
    add();
  }
  function remove(videoId: string) {
    if (current.current.disabled) return;
    update(current.current.videos.filter(video => video.videoId !== videoId));
    setError('');
    setMessage('Video quitado de la actividad. Guarda el curso para conservar el cambio.');
  }
  return <section className="rv-youtube-editor" aria-labelledby={id + '-heading'}>
    <header className="rv-youtube-heading"><div><h4 id={id + '-heading'}>Videos de YouTube</h4><p>Añade un enlace para que tus estudiantes vean el video dentro de la actividad.</p></div><span>{videos.length}/{YOUTUBE_VIDEO_LIMIT} videos</span></header>
    <div className="rv-youtube-fields">
      <Field id={id + '-url'} label="Enlace de YouTube" type="url" inputMode="url" autoComplete="off" autoCapitalize="none" spellCheck={false}
        placeholder="https://www.youtube.com/watch?v=…" value={url} disabled={disabled || full} error={error}
        hint="Acepta enlaces de youtube.com y youtu.be, incluidos Shorts."
        onChange={event => {setUrl(event.target.value); setError(''); setMessage('');}} onKeyDown={enter}/>
      <Field id={id + '-title'} label="Título del video (opcional)" maxLength={180} placeholder="Ejemplo: descubre tus intereses" value={title} disabled={disabled || full}
        onChange={event => {setTitle(event.target.value); setMessage('');}} onKeyDown={enter}/>
    </div>
    <Button variant="secondary" disabled={disabled || full} icon={<Plus size={18} aria-hidden="true"/>} onClick={add}>Añadir video de YouTube</Button>
    {full && <p className="rv-youtube-limit" role="status">Has añadido los {YOUTUBE_VIDEO_LIMIT} videos permitidos. Quita uno para añadir otro.</p>}
    {message && <p className="rv-youtube-message" role="status"><CheckCircle2 size={18} aria-hidden="true"/>{message}</p>}
    <ActivityYouTubeVideos videos={videos} onRemove={remove} disabled={disabled}/>
  </section>;
}
