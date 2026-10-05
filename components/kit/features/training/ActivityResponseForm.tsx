"use client";
import { useEffect, useId, useRef, useState } from 'react';
import { Check, CircleCheck, CloudCheck, CloudUpload, LoaderCircle, Save } from 'lucide-react';
import { activityResponsePrompts } from '../../lib/activity-responses';
import type { Activity, ActivityResponse } from '../../lib/training-types';
import { Button, Notice } from '../../components/ui/primitives';
import { trainingApi } from './shared';
import './activity-responses.css';

const isResponseConflict = (message: string) => /respuestas más recientes|ya fue entregada/i.test(message);

export function ActivityResponseForm({ activity, enrollmentId, userId, courseId, saved, parentBusy, run, onPendingChange }: {
  activity: Activity; enrollmentId: string; userId: string; courseId: string; saved?: ActivityResponse;
  parentBusy: boolean;
  run: (task: () => Promise<any>) => Promise<any>; onPendingChange: (pending: boolean) => void;
}) {
  const prompts = activityResponsePrompts(activity);
  const formId = useId();
  const fields = useRef<Record<string, HTMLTextAreaElement | null>>({});
  const [showValidation, setShowValidation] = useState(false);
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
  useEffect(() => {
    for (const field of Object.values(fields.current)) {
      if (!field) continue;
      field.style.height = 'auto';
      field.style.height = Math.min(280, Math.max(104, field.scrollHeight + 2)) + 'px';
    }
  }, [answers]);
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
    if (complete) {
      const missing = prompts.find(prompt => prompt.required && !latest.current[prompt.id]?.trim());
      if (missing) {
        setShowValidation(true);
        fields.current[missing.id]?.focus();
        return;
      }
    }
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
  const answered = prompts.filter(prompt => answers[prompt.id]?.trim()).length;
  const conflict = isResponseConflict(error);
  const StatusIcon = busy ? LoaderCircle : error || dirty ? CloudUpload : updatedAt || delivered ? CloudCheck : Save;
  const saveStatus = busy ? 'Guardando…' : error ? 'No se pudo guardar' : dirty ? 'Cambios pendientes de guardar' : updatedAt ? 'Guardado en tu cuenta' : 'Guardado automático al escribir';
  return <section className="activity-response-form" aria-labelledby={formId + '-heading'}>
    <header className="activity-response-heading">
      <div><h4 id={formId + '-heading'}>{delivered ? 'Tus respuestas' : 'Escribe tu reflexión'}</h4>
        <p>{delivered ? 'Actividad completada. Puedes consultar tus respuestas aquí.' : 'Responde con tus palabras. Puedes continuar más tarde.'}</p>
      </div>
      <span className={'activity-response-count' + (delivered ? ' is-complete' : '')}>
        {delivered ? <><CircleCheck size={16} aria-hidden="true"/>Completada</> : `${answered} de ${prompts.length} respondidas`}
      </span>
    </header>
    <div className="activity-response-fields">
      {prompts.map((prompt, index) => {
        const value = answers[prompt.id] || '';
        const invalid = !delivered && showValidation && prompt.required && !value.trim();
        const fieldId = formId + '-' + prompt.id;
        return <div key={prompt.id} className={'activity-response-question' + (invalid ? ' has-error' : '')}>
          <label htmlFor={fieldId}>
            <span className={'activity-response-number' + (value.trim() ? ' is-answered' : '')} aria-hidden="true">{delivered ? <Check size={16}/> : index + 1}</span>
            <span>{prompt.prompt}{!prompt.required && <small>Opcional</small>}</span>
          </label>
          <textarea id={fieldId} ref={field => { fields.current[prompt.id] = field; }}
            rows={3} maxLength={10000} value={value} readOnly={delivered || submitting}
            placeholder={delivered ? 'Sin respuesta' : 'Escribe tu respuesta aquí…'}
            aria-required={prompt.required || undefined} aria-invalid={invalid || undefined}
            aria-describedby={invalid ? fieldId + '-error' : value.length > 9000 ? fieldId + '-count' : undefined}
            onChange={event => { const next = { ...latest.current, [prompt.id]: event.target.value }; latest.current = next; remember(next); setAnswers(next); setDirty(true); setError(current => isResponseConflict(current) ? current : ''); }}/>
          {invalid && <small id={fieldId + '-error'} className="activity-response-field-error">Escribe tu respuesta para completar esta actividad.</small>}
          {value.length > 9000 && <small id={fieldId + '-count'} className="activity-response-characters">{value.length.toLocaleString('es-EC')} / 10.000 caracteres</small>}
        </div>;
      })}
    </div>
    {error && <Notice tone="danger">{error}{conflict ? <Button variant="ghost" disabled={busy || parentBusy} onClick={async () => {
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
    }}>Recuperar guardado y descartar estos cambios</Button> : <Button variant="secondary" disabled={busy || parentBusy} onClick={() => void save(false)}>Reintentar guardado</Button>}</Notice>}
    <footer className="activity-response-footer">
      <div className="activity-response-save-state" role="status" aria-live="polite" data-saved={!!updatedAt && !dirty && !busy && !error}>
        <StatusIcon size={17} aria-hidden="true" className={busy ? 'spin' : undefined}/><span>{saveStatus}</span>
      </div>
      {!delivered && <div className="activity-response-actions">
        <Button variant="secondary" icon={<Save size={17} aria-hidden="true"/>} disabled={busy || parentBusy || !dirty || conflict} onClick={() => void save(false)}>Guardar respuestas</Button>
        <Button icon={<CircleCheck size={17} aria-hidden="true"/>} loading={submitting} disabled={busy || parentBusy || conflict} onClick={() => void save(true)}>Completar actividad</Button>
      </div>}
      {!delivered && <p className="activity-response-hint">{pending > 0 ? `Te ${pending === 1 ? 'falta 1 respuesta' : `faltan ${pending} respuestas`} para completar la actividad.` : 'Todo listo. Completa la actividad para registrar tu avance.'}</p>}
      <p className="activity-response-privacy">Reflexión sin calificación automática. Tu institución puede revisar tus respuestas.</p>
    </footer>
  </section>;
}
