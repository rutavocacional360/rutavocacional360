import type {ActivityYouTubeVideo} from './training-types';

export const YOUTUBE_VIDEO_LIMIT = 12;
const VIDEO_ID = /^[a-zA-Z0-9_-]{11}$/;
const MAX_START = 86400;
const ordinaryHosts = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com']);
const privateHosts = new Set(['youtube-nocookie.com', 'www.youtube-nocookie.com']);
type YouTubeLocation = Pick<ActivityYouTubeVideo, 'videoId' | 'startSeconds'>;

function timestamp(value: string, compound: boolean): number | null {
  let seconds: number;
  if (/^\d+$/.test(value)) seconds = Number(value);
  else {
    if (!compound) return null;
    const match = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/i.exec(value);
    if (!match || !match.slice(1).some(Boolean)) return null;
    seconds = Number(match[1] || 0) * 3600 + Number(match[2] || 0) * 60 + Number(match[3] || 0);
  }
  return Number.isSafeInteger(seconds) && seconds >= 0 && seconds <= MAX_START ? seconds : null;
}

/** Accept only known YouTube links; never retain an arbitrary URL or iframe. */
export function parseYouTubeUrl(input: unknown): YouTubeLocation | null {
  if (typeof input !== 'string') return null;
  const text = input.trim();
  if (!text || /[\u0000-\u0020\u007f\\<>]/.test(text)) return null;
  const source = /^https?:\/\//i.test(text) ? text : /^[a-z0-9.-]+\//i.test(text) ? 'https://' + text : '';
  if (!source) return null;
  // URL removes default ports and normalizes encoded hosts; reject these before parsing.
  const authority = /^https?:\/\/([^/?#]+)/i.exec(source)?.[1];
  if (!authority || /[:@%]/.test(authority)) return null;
  let url: URL;
  try { url = new URL(source); } catch { return null; }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.port) return null;
  const host = url.hostname.toLowerCase();
  let videoId: string | undefined;
  if (host === 'youtu.be') videoId = /^\/([a-zA-Z0-9_-]{11})\/?$/.exec(url.pathname)?.[1];
  else if (ordinaryHosts.has(host)) {
    if (/^\/watch\/?$/.test(url.pathname)) {
      const values = url.searchParams.getAll('v');
      if (values.length !== 1) return null;
      videoId = values[0];
    } else videoId = /^\/(?:shorts|live|embed)\/([a-zA-Z0-9_-]{11})\/?$/.exec(url.pathname)?.[1];
  } else if (privateHosts.has(host)) videoId = /^\/embed\/([a-zA-Z0-9_-]{11})\/?$/.exec(url.pathname)?.[1];
  if (!videoId || !VIDEO_ID.test(videoId)) return null;
  const starts: number[] = [];
  const sources = [url.searchParams];
  if (/^#(?:t|start)=/.test(url.hash)) sources.push(new URLSearchParams(url.hash.slice(1)));
  for (const params of sources) for (const key of ['t', 'start']) {
    const values = params.getAll(key);
    if (values.length > 1) return null;
    if (values.length) {
      const seconds = timestamp(values[0], key === 't');
      if (seconds === null) return null;
      starts.push(seconds);
    }
  }
  if (new Set(starts).size > 1) return null;
  const startSeconds = starts[0] || 0;
  return {videoId, ...(startSeconds ? {startSeconds} : {})};
}

function canonicalVideo(input: unknown): ActivityYouTubeVideo {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw Error('Revisa los videos de YouTube de la actividad.');
  const value = input as Record<string, unknown>;
  if (typeof value.videoId !== 'string' || !VIDEO_ID.test(value.videoId)) throw Error('El enlace de YouTube no corresponde a un video válido.');
  if (value.title !== undefined && typeof value.title !== 'string') throw Error('Escribe un título válido para el video de YouTube.');
  const title = (value.title as string | undefined)?.trim() || 'Video de YouTube';
  if (title.length > 180) throw Error('El título del video de YouTube admite hasta 180 caracteres.');
  if (value.startSeconds !== undefined && (typeof value.startSeconds !== 'number' || !Number.isInteger(value.startSeconds) || value.startSeconds < 0 || value.startSeconds > MAX_START))
    throw Error('El inicio del video de YouTube debe estar entre 0 y 86.400 segundos enteros.');
  return {videoId: value.videoId, title, ...(value.startSeconds ? {startSeconds: value.startSeconds as number} : {})};
}

export function validateYouTubeVideos(input: unknown): ActivityYouTubeVideo[] | undefined {
  if (input === undefined) return undefined;
  if (!Array.isArray(input)) throw Error('Revisa los videos de YouTube de la actividad.');
  if (input.length > YOUTUBE_VIDEO_LIMIT) throw Error(`Cada actividad admite hasta ${YOUTUBE_VIDEO_LIMIT} videos de YouTube.`);
  const seen = new Set<string>();
  return input.map(item => {
    const video = canonicalVideo(item);
    if (seen.has(video.videoId)) throw Error('Este video de YouTube ya está añadido a la actividad.');
    seen.add(video.videoId);
    return video;
  });
}

export function youtubeWatchUrl(video: YouTubeLocation) {
  const safe = canonicalVideo(video);
  return 'https://www.youtube.com/watch?v=' + safe.videoId + (safe.startSeconds ? '&t=' + safe.startSeconds + 's' : '');
}

export function youtubeEmbedUrl(video: YouTubeLocation) {
  const safe = canonicalVideo(video);
  return 'https://www.youtube-nocookie.com/embed/' + safe.videoId + '?rel=0&playsinline=1' + (safe.startSeconds ? '&start=' + safe.startSeconds : '');
}
