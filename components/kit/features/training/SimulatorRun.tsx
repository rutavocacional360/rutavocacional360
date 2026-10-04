"use client";
import {
  Clock3,
  CheckCircle2,
  Flag,
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  Save,
} from "lucide-react";
import "./simulator-run.css";
import { PdfViewer } from "../../components/ui/PdfViewer";

import { simulatorClock, clockLabel } from "../../lib/simulator-clock";
import { Dialog } from "../../components/ui/Dialog";
import { absent } from "../../lib/test-engine";
import { answerText } from "../../lib/test-answer-text";
import { useEffect, useState, useRef } from "react";
import { trainingApi, decimal } from "./shared";
import { Button, Card, Notice } from "../../components/ui/primitives";
import { TestQuestion } from "../../components/domain/TestQuestion";
export function SimulatorRun({
  initial,
  onClose,
}: {
  initial: any;
  onClose: () => void;
}) {
  const [a, setA] = useState(initial),
    [answers, setAnswers] = useState(initial.answers),
    [flags, setFlags] = useState<string[]>(initial.flags),
    [index, setIndex] = useState(0),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [dirty, setDirty] = useState(false),
    [confirmFinish, setConfirmFinish] = useState(false),
    [mapOpen, setMapOpen] = useState(false),
    [feedback, setFeedback] = useState(""),
    [clock, setClock] = useState(Date.now()),
    [offset] = useState(Date.parse(initial.serverTime) - Date.now());
  const latest = useRef({ answers, flags });
  latest.current = { answers, flags };
  const revision = useRef(initial.revision),
    saving = useRef<Promise<any> | null>(null);
  const operations = useRef(0);
  useEffect(() => {
    if (!dirty || a.state !== "in_progress") return;
    const timer = setTimeout(
      () =>
        void act(async () => {
          await save();
        }),
      600,
    );
    return () => clearTimeout(timer);
  }, [answers, flags, dirty, a.state]);
  const questionHeading = useRef<HTMLHeadingElement>(null),
    priorIndex = useRef(index);
  useEffect(() => {
    if (priorIndex.current !== index) {
      priorIndex.current = index;
      questionHeading.current?.focus({ preventScroll: true });
      questionHeading.current?.scrollIntoView({ block: "start" });
    }
  }, [index]);
  const q = a.instrument.questions[index];
  const answered = a.instrument.questions.filter(
    (q: any) => !absent(answers[q.id]),
  ).length;
  const { remaining, elapsed } = simulatorClock(
    a.started_at,
    a.expires_at,
    clock,
    offset,
  );
  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 1000);
    const sync = () => setClock(Date.now());
    window.addEventListener("focus", sync);
    document.addEventListener("visibilitychange", sync);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", sync);
      document.removeEventListener("visibilitychange", sync);
    };
  }, []);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  useEffect(() => {
    if (remaining !== 0 || a.state !== "in_progress") return;
    trainingApi("/attempt?id=" + a.id)
      .then((r) => {
        revision.current = r.revision;
        setA(r);
        setAnswers(r.answers);
        setDirty(false);
      })
      .catch((e) => setError(e.message));
  }, [remaining, a.id, a.state]);
  async function act(fn: () => Promise<void>) {
    operations.current++;
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      operations.current--;
      setBusy(operations.current > 0);
    }
  }
  async function save() {
    const previous = saving.current;
    // Register the whole operation before awaiting the prior save. Multiple
    // queued changes must read the revision returned by their own predecessor.
    const request = (async () => {
      if (previous) await previous.catch(() => undefined);
      const payload = latest.current;
      const r = await trainingApi(
        "/answers",
        { id: a.id, revision: revision.current, ...payload },
        "PUT",
      );
      revision.current = r.revision;
      setA(r);
      setDirty(JSON.stringify(payload) !== JSON.stringify(latest.current));
      return r;
    })();
    saving.current = request;
    try {
      return await request;
    } finally {
      if (saving.current === request) saving.current = null;
    }
  }
  if (a.result)
    return (
      <div className="training-runner">
        <TrainingResult attempt={a} />
        <Button onClick={onClose}>Volver a mis simuladores</Button>
      </div>
    );
  if (a.state === "recoverable")
    return (
      <div className="training-runner">
        <Card className="stack">
          <h2>{a.instrument.title}</h2>
          <Notice tone="warning">{a.error || "Tus respuestas están guardadas. Reintenta la entrega para calcular el resultado."}</Notice>
          {error && <Notice tone="danger">{error}</Notice>}
          <Button loading={busy} onClick={() => act(async () => {
            setA(await trainingApi("/finish", { id: a.id }));
          })}>Reintentar entrega</Button>
          <Button variant="secondary" disabled={busy} onClick={onClose}>Volver a mis simuladores</Button>
        </Card>
      </div>
    );
  return (
    <div className="training-runner simulator-workspace">
      <header className="simulator-heading">
        <div className="simulator-heading-copy">
          <span className="simulator-mode-tag">
            {a.mode === "exam" ? "Simulación de examen" : "Modo práctica"}
          </span>
          <h2>{a.instrument.title}</h2>
          <p>{remaining === null ? 'Responde a tu ritmo y revisa tus respuestas antes de entregar.' : 'El tiempo está en marcha. Revisa tus respuestas antes de entregar.'}</p>
        </div>
        <Button
          variant="secondary"
          disabled={busy}
          icon={<Save size={17} />}
          onClick={() =>
            act(async () => {
              if (dirty) await save();
              onClose();
            })
          }
        >
          Guardar y salir
        </Button>
      </header>
      <section className="exam-statusbar" aria-label="Resumen del simulador">
        <div
          className="exam-time"
          data-urgent={remaining !== null && remaining <= 60}
        >
          <span className="simulator-stat-icon">
            <Clock3 size={20} />
          </span>
          <div>
            <small>
              {remaining === null ? "Tiempo transcurrido" : "Tiempo restante"}
            </small>
            <strong
              role="timer"
              aria-label={
                remaining === null ? "Tiempo transcurrido" : "Tiempo restante"
              }
            >
              {clockLabel(remaining ?? elapsed)}
            </strong>
          </div>
        </div>
        <div>
          <span className="simulator-stat-icon">
            <CheckCircle2 size={20} />
          </span>
          <div>
            <small>Respondidas</small>
            <strong>
              {answered}
              <span> / {a.instrument.questions.length}</span>
            </strong>
          </div>
        </div>
        <div>
          <span className="simulator-stat-icon">
            <Flag size={20} />
          </span>
          <div>
            <small>Para revisar</small>
            <strong>
              {flags.length}
              <span>{flags.length === 1 ? ' marcada' : ' marcadas'}</span>
            </strong>
          </div>
        </div>
      </section>
      <p className="simulator-instructions">
        {a.instrument.questions.length - answered} preguntas pendientes. Las
        preguntas sin responder cuentan como cero.
        {a.mode === "practice" && a.feedback === "question"
          ? " En práctica, se califica tu primera respuesta confirmada."
          : ""}
      </p>
      {error && (
        <Notice tone="danger">
          {error}
          <Button
            variant="ghost"
            onClick={() =>
              act(async () => {
                const r = await trainingApi("/attempt?id=" + a.id);
                revision.current = r.revision;
                setA(r);
                setAnswers(r.answers);
                setFlags(r.flags);
                setDirty(false);
              })
            }
          >
            Recuperar lo guardado
          </Button>
        </Notice>
      )}
      <div className="exam-workspace">
        <aside className="exam-sidebar" data-expanded={mapOpen}>
          <div className="simulator-map-heading">
            <h3>Tu recorrido</h3>
            <button
              type="button"
              className="question-map-toggle"
              aria-expanded={mapOpen}
              aria-controls="simulator-question-map"
              onClick={() => setMapOpen(!mapOpen)}
              aria-label={
                mapOpen
                  ? "Ocultar mapa de preguntas"
                  : "Mostrar mapa de preguntas"
              }
            >
              <ChevronDown size={20} />
            </button>
          </div>
          <p>
            {answered} de {a.instrument.questions.length} respondidas
          </p>
          <progress
            max={a.instrument.questions.length}
            value={answered}
            aria-label="Progreso de respuestas"
          />
          <nav
            id="simulator-question-map"
            className="training-question-nav"
            aria-label="Preguntas del simulador"
          >
            {a.instrument.questions.map((x: any, i: number) => (
              <button
                className={!absent(answers[x.id]) ? "is-answered" : ""}
                aria-label={
                  "Pregunta " +
                  (i + 1) +
                  (!absent(answers[x.id])
                    ? ", respondida"
                    : ", sin responder") +
                  (flags.includes(x.id) ? ", marcada" : "")
                }
                aria-current={i === index ? "step" : undefined}
                key={x.id}
                onClick={() => {
                  setIndex(i);
                  setMapOpen(false);
                  setFeedback("");
                }}
              >
                {i + 1}
                {!absent(answers[x.id]) ? " ✓" : ""}
                {flags.includes(x.id) ? " ★" : ""}
              </button>
            ))}
          </nav>
          <p className="small">✓ Respondida · ★ Marcada para volver</p>
          <p className="small">
            Puedes cambiar tus respuestas antes de entregar.
          </p>
        </aside>
        <Card className="exam-question" id="simulator-question">
          <p className="eyebrow">
            Pregunta {index + 1} de {a.instrument.questions.length}
          </p>
          <h3 ref={questionHeading} tabIndex={-1}>
            {q.text}
          </h3>
          <TestQuestion
            instrument={a.instrument}
            question={q}
            value={answers[q.id]}
            onChange={(v) => {
              setAnswers({ ...answers, [q.id]: v });
              setDirty(true);
              setFeedback("");
            }}
          />
          <label className="simulator-flag">
            <input
              type="checkbox"
              checked={flags.includes(q.id)}
              onChange={(e) => {
                setFlags(
                  e.target.checked
                    ? [...flags, q.id]
                    : flags.filter((f) => f !== q.id),
                );
                setDirty(true);
              }}
            />{" "}
            Marcar para revisar
          </label>
          {a.mode === "practice" && a.feedback === "question" && (
            <Button
              disabled={busy}
              variant="secondary"
              onClick={() =>
                act(async () => {
                  await save();
                  const r = await trainingApi("/feedback", {
                    id: a.id,
                    questionId: q.id,
                  });
                  setFeedback(r.explanation + " " + r.note);
                })
              }
            >
              Confirmar y ver explicación
            </Button>
          )}
          {feedback && <Notice>{feedback}</Notice>}
          <div className="exam-page-actions">
            <Button
              variant="secondary"
              disabled={index === 0 || busy}
              icon={<ArrowLeft size={17} />}
              onClick={() => {
                setIndex(index - 1);
                setFeedback("");
              }}
            >
              Anterior
            </Button>
            <Button
              disabled={index === a.instrument.questions.length - 1 || busy}
              icon={<ArrowRight size={17} />}
              onClick={() => {
                setIndex(index + 1);
                setFeedback("");
              }}
            >
              Siguiente
            </Button>
          </div>
        </Card>
      </div>
      <footer className="simulator-footer">
        <div className="simulator-save-state" aria-live="polite">
          <CheckCircle2 size={18} />
          <div>
            <strong>
              {error
                ? "No se pudo guardar"
                : dirty
                  ? "Guardando tus respuestas…"
                  : "Tu avance está guardado"}
            </strong>
            <p>
              {error
                ? "Reintenta antes de salir."
                : "Sincronizado con tu cuenta."}
            </p>
          </div>
        </div>
        <div className="simulator-footer-actions">
          {(dirty || error) && (
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() =>
                act(async () => {
                  await save();
                })
              }
            >
              Reintentar guardado
            </Button>
          )}
          <Button disabled={busy} onClick={() => setConfirmFinish(true)}>
            Revisar y entregar <ArrowRight size={17} />
          </Button>
        </div>
      </footer>
      <Dialog
        open={confirmFinish}
        title="Revisa antes de entregar"
        onClose={() => {
          if (!busy) setConfirmFinish(false);
        }}
      >
        <div className="stack">
          <p>
            {answered} de {a.instrument.questions.length} preguntas respondidas.
          </p>
          <p>
            {a.instrument.questions.length - answered} sin responder ·{" "}
            {flags.length} marcadas para revisar.
          </p>
          <Notice>
            Al confirmar recibirás tu nota automáticamente. Las preguntas sin
            responder cuentan como cero.
          </Notice>
          {error && <Notice tone="danger">{error}</Notice>}
          <Button
            disabled={busy}
            onClick={() =>
              act(async () => {
                if (dirty) await save();
                setA(await trainingApi("/finish", { id: a.id }));
                setConfirmFinish(false);
              })
            }
          >
            Confirmar entrega y ver nota
          </Button>
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => setConfirmFinish(false)}
          >
            Volver a las preguntas
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
export function TrainingResult({ attempt: a }: { attempt: any }) {
  const r = a.result,
    [pdf, setPdf] = useState(false);


  const pdfSource =
    "/api/training/pdf?id=" + a.id;
  return (
    <Card className="training-result">
      <small>
        {a.mode === "exam" ? "Simulación de examen" : "Práctica"} · Versión{" "}
        {a.instrument.version} · Revisión {r.revision}
      </small>
      <h2>{a.instrument.title}</h2>
      <div className="training-summary">
        <div>
          <strong>
            {r.state === "annulled" ? "Anulado" : decimal(r.percent)}
            {r.percent != null ? " / 100" : ""}
          </strong>
          <p>Nota calculada automáticamente</p>
        </div>
        <div>
          <strong>
            {decimal(r.raw)} / {decimal(r.max)}
          </strong>
          <p>
            Puntos{" "}
            {r.state === "pending-review" ? "provisionales" : "obtenidos"}
          </p>
        </div>
        <div>
          <strong>{r.coverage.omitted}</strong>
          <p>Preguntas omitidas</p>
        </div>
      </div>
      <Notice>
        {r.note}{" "}
        {r.annulled?.length
          ? `${r.annulled.length} preguntas anuladas. ${r.annulmentPolicy}`
          : ""}{" "}
        {r.state === "pending-review"
          ? "Hay respuestas pendientes de revisión."
          : ""}
      </Notice>
      {r.areas.map((x: any) => (
        <div key={x.area}>
          <b>{x.area}</b>
          <p>
            {decimal(x.raw)} de {decimal(x.max)} · {decimal(x.percent)} %
            {x.weight ? " · Peso " + x.weight + " %" : ""}
          </p>
          <progress max={100} value={x.percent} />
        </div>
      ))}
      <details>
        <summary>Historial de revisiones</summary>
        {a.resultHistory?.map((h: any) => (
          <p key={h.revision}>
            Revisión {h.revision} ·{" "}
            {new Date(h.created_at).toLocaleString("es-EC", {
              timeZone: "America/Guayaquil",
            })}{" "}
            · {h.reason}
          </p>
        ))}
      </details>
      <details>
        <summary>Respuestas y explicaciones</summary>
        {a.instrument.questions.map((q: any) => (
          <section key={q.id}>
            <h3>{q.text}</h3>
            {r.annulled?.includes(q.id) && (
              <p>Pregunta anulada; excluida del cálculo.</p>
            )}
            <p>{answerText(a.instrument, q, r.answers[q.id])}</p>
            <p>{a.explanations?.find((e: any) => e.id === q.id)?.text}</p>
          </section>
        ))}
      </details>
      <div className="training-actions">
        <a
          className="button button--primary"
          href={pdfSource || undefined}
          download={"resultado-simulador-" + a.id + ".pdf"}
        >
          Descargar PDF
        </a>
        <Button variant="secondary" onClick={() => setPdf(!pdf)}>
          {pdf ? "Cerrar PDF" : "Vista previa del PDF"}
        </Button>
        <a
          className="button button--secondary"
          href={pdfSource || undefined}
          target="_blank"
          rel="noreferrer"
        >
          Abrir o imprimir PDF
        </a>
      </div>
      {pdf && (
        <PdfViewer
          title={"Resultado de " + a.instrument.title}
          src={pdfSource || undefined}
        />
      )}
    </Card>
  );
}
