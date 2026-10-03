import {instrumentPresentation} from '../../lib/instrument-presentation';
import {InstrumentIntroduction} from './InstrumentIntroduction';
import {TestResult} from '../../features/student/TestResult';
import {visibleQuestions} from '../../lib/test-engine';
import {TestQuestion,answerText} from './TestQuestion';
import { previewAction, flush, useSession } from "../../lib/session";
import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  CloudCheck,
  RotateCcw,
} from "lucide-react";
import type { Instrument, Navigate, Option } from "../../types";
import { answerKey, completion, validAnswer } from "../../data/instruments";
import { isNumberRecord, useLocalState } from "../../lib/storage";
import { Badge, Button, Card, Notice, Progress, TextareaField,Stepper } from "../ui/primitives";
import { Dialog } from "../ui/Dialog";
export function AnswerOptions({
  options,
  value,
  onChange,
  name,
  vertical = false,
}: {
  options: Option[];
  value?: number;
  onChange: (value: number) => void;
  name: string;
  vertical?: boolean;
}) {
  return (
    <div className={vertical ? "answer-list" : "likert-options"}>
      {options.map((option) => (
        <label className="likert-option" key={option.value}>
          <input
            type="radio"
            name={name}
            value={option.value}
            checked={value === option.value}
            onChange={() => onChange(option.value)}
          />
          <span className="radio-dot">{option.value}</span>
          <span>{option.label}</span>
        </label>
      ))}
    </div>
  );
}
export function Questionnaire({
  instrument,
  navigate,
}: {
  instrument: Instrument;
  navigate: Navigate;
}) {
  const [answers, setAnswers, saved] = useLocalState<Record<string, any>>(
    answerKey(instrument),
    {},
    (v):v is Record<string,any>=>!!v&&typeof v==='object'&&!Array.isArray(v),
  );
  const activeQuestions=visibleQuestions(instrument,answers);
  const [index, setIndex] = useState(() => {
    const first = activeQuestions.findIndex(
      (q) => !validAnswer(instrument, q.id, answers[q.id]),
    );
    return first < 0 ? 0 : first;
  });
  const session=useSession();
  const attempt=(session.values['rv360:attempts']||[]).find((a:any)=>a.instrument_id===instrument.id&&a.state==='in_progress');
  const[starting,setStarting]=useState(false);
  const [finished, setFinished] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [reset, setReset] = useState(false);
  const [review,setReview]=useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const answered = completion(instrument, answers);
  const total = activeQuestions.length;
  const ready=activeQuestions.every(q=>q.required===false||validAnswer(instrument,q.id,answers[q.id]));
  const q = activeQuestions[Math.min(index,activeQuestions.length-1)];
  const options = q?.options || instrument.options;
  useEffect(() => {
    heading.current?.focus({preventScroll:true});
    const rect=heading.current?.getBoundingClientRect();
    const headerBottom=Math.max(0,document.querySelector('.compact-header')?.getBoundingClientRect().bottom||0);
    if(rect&&(rect.top<headerBottom+16||rect.bottom>window.innerHeight-40))window.scrollBy({top:rect.top-headerBottom-20,behavior:'instant'});
  }, [index, finished]);
  const expired=!!(attempt&&instrument.durationMinutes&&Date.now()>Date.parse(attempt.started_at)+instrument.durationMinutes*60000);
  if(instrument.schemaVersion===2&&(!attempt||expired)&&!finished)return <Card className="stack"><InstrumentIntroduction instrument={instrument} heading/><p>{instrument.questions.filter(q=>q.type!=='info').length} preguntas · {instrument.maxAttempts?'Máximo '+instrument.maxAttempts+' intentos':'Sin límite de intentos'}</p><Notice>{expired?'El tiempo del intento anterior terminó. Puedes iniciar otro si quedan intentos disponibles.':'El intento comienza al confirmar. Puedes guardar y continuar con esta versión del test.'}</Notice>{submitError&&<Notice tone="danger">{submitError}</Notice>}<Button loading={starting} onClick={async()=>{setStarting(true);setSubmitError('');try{await previewAction('assessments/start',{method:'POST',body:JSON.stringify({instrumentId:instrument.id})});}catch(e){setSubmitError((e as Error).message);}finally{setStarting(false);}}}>Confirmar e iniciar intento</Button></Card>;
  const submitted=(session.values['rv360:submissions']||[]).find((s:any)=>s.instrument_id===instrument.id&&s.version===instrument.version);
  if(!q)return <Notice>Este test no contiene preguntas disponibles. Solicita al administrador que revise su publicación.</Notice>;
  if (finished)
    return (
      <><Card className="empty-state">
        <span className="icon-tile teal">
          <CheckCircle2 />
        </span>
        <Badge tone="success">Evaluación completada</Badge>
        <h1 ref={heading} tabIndex={-1}>
          Un paso más en tu ruta
        </h1>
        <p className="muted">
          Has entregado tu evaluación de{" "}
          {instrument.title.toLowerCase()}. Puedes revisar tus respuestas cuando
          quieras.
        </p>
        <p className="muted">
          En Mis resultados encontrarás la orientación de tu etapa educativa.
          Abre Mi orientación para consultar tus opciones y los siguientes pasos,
          Resultados por test para revisar tus respuestas e Informe PDF para descargar el documento.
        </p>
        <div className="row">
          <Button onClick={() => navigate("resultados")}>
            Ver mis resultados
          </Button>
          <Button variant="secondary" onClick={() => navigate("evaluaciones")}>
            Mis evaluaciones
          </Button>
        </div>
      </Card>{submitted?.evaluation&&<TestResult submission={submitted}/>}</>
    );
  return (
    <>
      <div className="row between">
        <div>
          <p className="eyebrow">CONÓCETE A TU RITMO</p>
          <h2>{instrumentPresentation(instrument).title}</h2>
        </div>
        <Badge tone="primary">
          {index + 1} de {total}
        </Badge>
      </div>
      <InstrumentIntroduction instrument={instrument}/>
      <Progress
        value={answered}
        total={total}
        label="Avance de la evaluación"
      />
      {instrument.id==='valores'&&<Stepper labels={['Ambiente','Motivación','Valores']} current={index}/>}
      <Card className="question-card">
        <p className="eyebrow center">Pregunta {index + 1}{q.required===false?' · Opcional':''}</p>
        <h1 ref={heading} tabIndex={-1} className="center">
          {q.text}
        </h1>
        {q.image&&<img className="assessment-image" src={q.image} alt={q.imageAlt||''}/>}<fieldset style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="sr-only">{q.text}</legend>
          <TestQuestion instrument={instrument} question={q} value={answers[q.id]} onChange={value=>void setAnswers(prev=>({...prev,[q.id]:value}))}/>
        </fieldset>
        {q.required===false&&<Button variant="ghost" size="sm" onClick={()=>setAnswers(prev=>{const next={...prev};delete next[q.id];return next;})}>Dejar esta pregunta sin respuesta</Button>}<div className="question-footer">
          <Button
            variant="secondary"
            disabled={index === 0}
            onClick={() => setIndex(Math.max(0,index - 1))}
            icon={<ArrowLeft size={17} />}
          >
            Anterior
          </Button>
          <span className="question-status">
            <CloudCheck size={16} />
            {saved
              ? ("Avance guardado en tu cuenta")
              : "Guardando respuestas…"}
          </span>
          <Button
            disabled={q.required!==false&&!validAnswer(instrument, q.id, answers[q.id])}
            loading={submitting}
            onClick={async () => {
              if (index < total - 1) setIndex(Math.min(total-1,index + 1));
              else if (ready) {
                setReview(true);
              }
              else
                setIndex(
                  activeQuestions.findIndex(
                    (item) =>
                      item.required!==false&&!validAnswer(instrument, item.id, answers[item.id]),
                  ),
                );
            }}
            icon={<ArrowRight size={17} />}
          >
            {index === total - 1
              ? ready
                ? "Revisar y finalizar"
                : "Revisar pendientes"
              : "Siguiente"}
          </Button>
        </div>
      </Card>
      <Card className="stack">
        <h2>Consulta la orientación de tu etapa</h2>
        <p className="muted">Al entregar tus tests, abre Mis resultados y consulta Mi orientación para comparar las opciones de tu etapa y organizar tus siguientes pasos. Si falta información, el informe te indicará qué completar.</p>
        <Button variant="secondary" loading={submitting} onClick={async()=>{
          setSubmitting(true);setSubmitError('');
          try{await flush();navigate('resultados');}
          catch(e){setSubmitError((e as Error).message);}
          finally{setSubmitting(false);}
        }}>Guardar avance y ver mis resultados <ArrowRight size={16}/></Button>
      </Card>
      {submitError && <Notice tone="danger">{submitError}</Notice>}
      <Dialog open={review} onClose={()=>setReview(false)} title="Revisa tus respuestas" wide><div className="stack">{activeQuestions.map((item,i)=><div className="row between" key={item.id}><div><b>{i+1}. {item.text}</b><p className="muted">{answerText(instrument,item,answers[item.id])}</p></div><Button size="sm" variant="ghost" onClick={()=>{setIndex(i);setReview(false);}}>Editar</Button></div>)}{submitError&&<Notice tone="danger">{submitError}</Notice>}<Button loading={submitting} onClick={async()=>{setSubmitting(true);setSubmitError('');try{await flush();await previewAction('assessments/submit',{method:'POST',body:JSON.stringify({instrumentId:instrument.id})});setReview(false);setFinished(true);}catch(e){setSubmitError((e as Error).message);}finally{setSubmitting(false);}}}>Confirmar entrega</Button></div></Dialog>
      <div className="row between">
        <div className="question-jump" aria-label="Ir a una pregunta">
          {activeQuestions.map((item, i) => (
            <button
              key={item.id}
              onClick={() => setIndex(i)}
              className={
                (validAnswer(instrument, item.id, answers[item.id])
                  ? "answered "
                  : "") + (index === i ? "active" : "")
              }
              aria-label={
                "Pregunta " +
                (i + 1) +
                (validAnswer(instrument, item.id, answers[item.id])
                  ? ", respondida"
                  : ", pendiente")
              }
              aria-current={index === i ? "step" : undefined}
            >
              {i + 1}
            </button>
          ))}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setReset(true)}
          icon={<RotateCcw size={14} />}
        >
          Reiniciar
        </Button>
      </div>
      <p className="muted small" style={{ marginTop: 24 }}>
        {instrument.scoring==='objective'?'Prueba de conocimientos con la clave configurada por tu institución.':instrument.scoring==='manual'?'Las respuestas se conservan para reflexión o revisión por el equipo autorizado.':'Cuestionario orientativo. Contrasta tus resultados con experiencias e información sobre las opciones que te interesan.'}
      </p>
      <Dialog
        open={reset}
        onClose={() => setReset(false)}
        title="¿Reiniciar esta evaluación?"
      >
        <div className="stack">
          <p className="muted">
            Se borrarán únicamente las respuestas de{" "}
            {instrument.title.toLowerCase()} en tu borrador. Las entregas del historial se conservan.
          </p>
          <div className="row">
            <Button
              variant="danger"
              onClick={() => {
                setAnswers({});
                setIndex(0);
                setReset(false);
              }}
            >
              Reiniciar respuestas
            </Button>
            <Button variant="secondary" onClick={() => setReset(false)}>
              Cancelar
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
