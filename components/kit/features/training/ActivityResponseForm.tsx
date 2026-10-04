"use client";
import { useEffect, useRef, useState } from 'react';
import { activityResponsePrompts } from '../../lib/activity-responses';
import type { Activity, ActivityResponse } from '../../lib/training-types';
import { Button, Notice, TextareaField } from '../../components/ui/primitives';
import { trainingApi } from './shared';

export function ActivityResponseForm({ activity, enrollmentId, userId, courseId, saved, parentBusy, run, onPendingChange }: {
  activity: Activity; enrollmentId: string; userId: string; courseId: string; saved?: ActivityResponse;
  parentBusy: boolean;
  run: (task: () => Promise<any>) => Promise<any>; onPendingChange: (pending: boolean) => void;
}) {
  const prompts = activityResponsePrompts(activity);
  const draftKey = 'rv360:activity-draft:' + userId + ':' + enrollmentId + ':' + activity.id;
  const [draft] = useState(() => {
    if (saved?.submittedAt || typeof window === 'undefined') return null;
    try {
      const value = JSON.parse(window.sessionStorage.getItem(draftKey) || 'null');
      return value && Number.isInteger(value.revision) && value.answers && typeof value.answers === 'object' && !Array.isArray(value.answers)
        && Object.entries(value.answers).every(([id, text]) => prompts.some(prompt => prompt.id === id) && typeof text === 'string' && text.length <= 10000)
        ? value as {revision: number; answers: Record<string, string>} : null;
    } catch { return null; }
  });
  const [answers, setAnswers] = useState<Record<string, string>>(draft?.answers || saved?.answers || {});
  const [dirty, setDirty] = useState(!!draft), [busy, setBusy] = useState(false);
  const [error, setError] = useState(draft && draft.revision !== (saved?.revision || 0) ? 'Hay un borrador de este dispositivo y respuestas más recientes en tu cuenta. Conserva el texto que necesites antes de recuperar lo guardado.' : '');
  const [updatedAt, setUpdatedAt] = useState(saved?.updatedAt || '');
  const [delivered, setDelivered] = useState(!!saved?.submittedAt), [submitting, setSubmitting] = useState(false);
  const revision = useRef(draft?.revision ?? saved?.revision ?? 0), latest = useRef(answers);
  const saving = useRef<Promise<any> | null>(null), operations = useRef(0);
  latest.current = answers;
  function remember(value: Record<string, string> | null) {
    try {
      if (value) window.sessionStorage.setItem(draftKey, JSON.stringify({revision: revision.current, answers: value}));
      else window.sessionStorage.removeItem(draftKey);
    } catch { /* The server autosave and beforeunload warning still work when browser storage is unavailable. */ }
  }
  useEffect(() => {
    // Focus and periodic refresh can receive work saved from another session.
    // A clean form follows that revision; local typing always stays recoverable.
    if (!saved || saved.revision <= revision.current || busy || parentBusy) return;
    if (dirty) {
      setError('Hay respuestas más recientes en otra sesión. Conserva el texto que necesites antes de recuperar lo guardado.');
      return;
    }
    revision.current = saved.revision;
    latest.current = saved.answers;
    setAnswers(saved.answers); setUpdatedAt(saved.updatedAt);
    setDelivered(!!saved.submittedAt); setError('');
  }, [saved, dirty, busy, parentBusy]);
  useEffect(() => { onPendingChange(dirty || busy); }, [dirty, busy, onPendingChange]);
  useEffect(() => () => onPendingChange(false), [onPendingChange]);
  useEffect(() => {
    if (!dirty || delivered || busy || parentBusy || error) return;
    const timer = setTimeout(() => { void save(false); }, 800);
    return () => clearTimeout(timer);
  }, [answers, dirty, delivered, busy, parentBusy, error]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (dirty) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  async function save(complete: boolean) {
    if (parentBusy) return;
    const previous = saving.current;
    operations.current++; setBusy(true); setError('');
    if (complete) setSubmitting(true);
    const request = (async () => {
      if (previous) await previous.catch(() => undefined);
      const payload = latest.current;
      const sentRevision = revision.current;
      const result = await run(() => trainingApi('/activity-response', {
        enrollmentId, activityId: activity.id, revision: sentRevision, answers: payload, complete,
      }, 'PUT'));
      if (!result) throw new Error('Espera a que termine el guardado y vuelve a intentarlo.');
      revision.current = result.response.revision;
      setUpdatedAt(result.response.updatedAt);
      const changed = JSON.stringify(payload) !== JSON.stringify(latest.current);
      setDirty(changed);
      // An older mounted form can finish saving after navigation and re-entry.
      // Acknowledge only the sent revision; never erase a newer local draft.
      try {
        const cached = JSON.parse(window.sessionStorage.getItem(draftKey) || 'null');
        if (cached?.revision === sentRevision) {
          if (JSON.stringify(cached.answers) === JSON.stringify(payload)) window.sessionStorage.removeItem(draftKey);
          else window.sessionStorage.setItem(draftKey, JSON.stringify({...cached, revision: result.response.revision}));
        }
      } catch { /* Keep the server result even if tab storage is unavailable. */ }
      if (complete) setDelivered(true);
    })();
    saving.current = request;
    try { await request; } catch (failure) { setError((failure as Error).message); }
    finally {
      operations.current--; setBusy(operations.current > 0);
      if (complete) setSubmitting(false);
      if (saving.current === request) saving.current = null;
    }
  }
  const pending = prompts.filter(prompt => prompt.required && !answers[prompt.id]?.trim()).length;
  return <div className="stack activity-response-form">
    <h4>{delivered ? 'Tus respuestas' : 'Responde la actividad'}</h4>
    <p className="muted small">Tus reflexiones se guardan en tu cuenta y la administración de tu institución puede revisarlas. No tienen una calificación automática.</p>
    {prompts.map(prompt => <TextareaField key={prompt.id} label={prompt.prompt + (prompt.required ? '' : ' (opcional)')}
      rows={4} maxLength={10000} value={answers[prompt.id] || ''} readOnly={delivered || submitting}
      onChange={event => { const next = { ...latest.current, [prompt.id]: event.target.value }; latest.current = next; remember(next); setAnswers(next); setDirty(true); setError(''); }}/>) }
    {error && <Notice tone="danger">{error}<Button variant="ghost" disabled={busy || parentBusy} onClick={async () => {
      setBusy(true);
      try {
        const enrollment = await run(() => trainingApi('/enroll', { courseId }));
        if (!enrollment) return;
        const current = enrollment.responses?.[activity.id];
        revision.current = current?.revision || 0;
        setAnswers(current?.answers || {}); setUpdatedAt(current?.updatedAt || '');
        setDelivered(!!current?.submittedAt); setDirty(false); setError(''); remember(null);
      } catch (failure) { setError((failure as Error).message); }
      finally { setBusy(false); }
    }}>Recuperar guardado y descartar estos cambios</Button></Notice>}
    <p role="status">{busy ? 'Guardando tus respuestas…' : dirty ? 'Hay respuestas pendientes de guardar.' : updatedAt ? 'Tus respuestas están guardadas.' : 'Puedes escribir y continuar más tarde.'}</p>
    {!delivered && <div className="row">
      <Button variant="secondary" disabled={busy || parentBusy || !dirty} onClick={() => void save(false)}>Guardar respuestas</Button>
      <Button disabled={busy || parentBusy || pending > 0} onClick={() => void save(true)}>Guardar y completar actividad</Button>
    </div>}
    {!delivered && pending > 0 && <p className="muted small">Responde {pending === 1 ? 'la pregunta pendiente' : `las ${pending} preguntas pendientes`} para completar la actividad.</p>}
  </div>;
}
