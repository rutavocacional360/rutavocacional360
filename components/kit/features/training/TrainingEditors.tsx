"use client";
import {instrumentProblems} from '../../lib/test-engine';
import {schoolModalityTarget} from '../../data/school-training';
import {autofillSimulator} from '../../lib/simulator-autofill';
import {importSimulatorDocument} from '../../lib/import-simulator';
import {DOCUMENT_ACCEPT,DOCUMENT_FORMAT_LABEL,DOCUMENT_FORMAT_HELP,documentFileError} from '../../lib/document-formats';
import {PresentationEditor} from '../../components/domain/PresentationEditor';
import {suggestSimulatorCareers} from "../../lib/simulator-careers";
import { AcademicQuestionSettings } from "./AcademicQuestionSettings";
import { useState, useEffect, useRef } from "react";
import {
  Button,
  Field,
  SelectField,
  TextareaField,
  Notice,
} from "../../components/ui/primitives";
import { ChoiceList, trainingApi } from "./shared";
import { QuestionFormat } from "../admin/UniversalSettings";
import { QuestionSettings } from "../admin/InstrumentSettings";
import { TestQuestion } from "../../components/domain/TestQuestion";
import { academicInstrument, selectQuestions, simulatorProblems } from "../../lib/training-engine";
import type {
  Course,
  Simulator,
  AdmissionProfile,
} from "../../lib/training-types";
const identity = () => ({
  id: "",
  version: 0,
  revision: 0,
  status: "draft" as const,
  title: "",
});
export const blankCourse = (): Course => ({
  ...identity(),
  description: "",
  objectives: "",
  level: "Introductorio",
  type: "general",
  careerIds: [],
  institutions: [],
  fields: [],
  activities: [],
  studentIds: [],
  access: "all",
});
export const blankSimulator = (): Simulator => ({
  ...identity(),
  careerIds: [],
  instrument: {
    id: "draft",
    version: "1",
    title: "",
    description: "",
    options: [],
    questions: [],
    source: "",
  },
  purpose: "general",
  modes: ["practice", "exam"],
  durationMinutes: 30,
  practiceDurationMinutes: 0,
  maxAttempts: 3,
  gradePolicy: "last",
  feedback: "finish",
  selection: "fixed",
  quotas: [],
  areaWeights: [],
  questions: [],
  shuffleOptions: false,
  questionOrderFixedIds: [],
});
export const blankProfile = (): AdmissionProfile => ({
  ...identity(),
  institution: "",
  period: "",
  level: "Grado",
  careerIds: [],
  sourceUrl: "",
  reviewedAt: "",
  scope: "",
  rules: "",
  areas: [],
  durationMinutes: 60,
  internalRules: "",
});
export function CourseEditor({
  value: c,
  onChange: change,
  data: d,
}: {
  value: Course;
  onChange: (c: Course) => void;
  data: any;
}) {
  const patch = (v: Partial<Course>) => change({ ...c, ...v });
  return (
    <div className="training-editor">
      <Field
        label="Nombre del curso"
        value={c.title}
        onChange={(e) => patch({ title: e.target.value })}
      />
      <TextareaField
        label="Descripción"
        value={c.description}
        onChange={(e) => patch({ description: e.target.value })}
      />
      <TextareaField
        label="Objetivos de aprendizaje"
        value={c.objectives}
        onChange={(e) => patch({ objectives: e.target.value })}
      />
      <div className="training-split">
        <Field
          label="Nivel"
          value={c.level}
          onChange={(e) => patch({ level: e.target.value })}
        />
        <SelectField
          label="Tipo de preparación"
          value={c.type}
          onChange={(e) => patch({ type: e.target.value as any })}
        >
          <option value="general">Preparación general</option>
          <option value="field">Introducción a un campo</option>
          {d.educationLevel!=='bachillerato'&&<option value="admission">Convocatoria institucional</option>}
        </SelectField>
      </div>
      <ChoiceList
        label={d.educationLevel==='bachillerato'?'Opciones de bachillerato relacionadas':'Carreras relacionadas'}
        items={d.careers}
        value={c.careerIds}
        onChange={(careerIds) => patch({ careerIds, institutions: (c.institutions || []).filter(i => d.careers.some((career: any) => careerIds.includes(career.id) && career.offers?.some((o: any) => o.institution === i))) })}
      />
      {d.educationLevel!=='bachillerato'&&<><ChoiceList
        label="Universidades relacionadas"
        items={[...new Set<string>(d.careers.filter((career: any) => c.careerIds.includes(career.id)).flatMap((career: any) => (career.offers||[]).map((o: any) => o.institution)))].sort().map(name => ({ id: name, name }))}
        value={c.institutions || []}
        onChange={(institutions) => patch({ institutions })}
      />
      <small>Selecciona primero las carreras. Aparecen las universidades que las ofrecen en el catálogo de Ecuador. Para preparar un examen de una convocatoria concreta, elige su perfil de admisión.</small></>}
      <ChoiceList
        label="Relaciones por área revisadas"
        items={[...new Set<string>(d.careers.map((c: any) => c.area))].map(
          (a) => ({ id: a, name: a }),
        )}
        value={c.fields}
        onChange={(fields) => patch({ fields })}
      />
      {c.type === "admission" && (
        <ProfileSelect data={d} value={c} onChange={patch} />
      )}
      <h3>Módulos y actividades</h3>
      <Notice>
        Una lectura se completa al confirmarla. Un simulador conserva su propia
        calificación y versión.
      </Notice>
      {c.activities.map((a, i) => {
        const update = (v: any) =>
          patch({
            activities: c.activities.map((x, j) =>
              i === j ? { ...x, ...v } : x,
            ),
          });
        return (
          <details className="training-module" key={a.id} open={i===0}>
            <summary>{a.title||'Actividad '+(i+1)}</summary>
            <div className="training-actions">
              <b>Actividad {i + 1}</b>
              <Button
                size="sm"
                variant="ghost"
                disabled={!i}
                onClick={() => {
                  const x = [...c.activities];
                  [x[i - 1], x[i]] = [x[i], x[i - 1]];
                  patch({ activities: x });
                }}
              >
                Subir
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={i === c.activities.length - 1}
                onClick={() => {
                  const x = [...c.activities];
                  [x[i + 1], x[i]] = [x[i], x[i + 1]];
                  patch({ activities: x });
                }}
              >
                Bajar
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  patch({
                    activities: c.activities.filter((x) => x.id !== a.id),
                  })
                }
              >
                Quitar
              </Button>
            </div>
            <div className="training-split">
              <Field
                label="Módulo"
                value={a.module}
                onChange={(e) => update({ module: e.target.value })}
              />
              <Field
                label="Título de actividad"
                value={a.title}
                onChange={(e) => update({ title: e.target.value })}
              />
            </div>
            <SelectField
              label="Formato"
              value={a.kind}
              onChange={(e) =>
                update({
                  kind: e.target.value,
                  completion:
                    e.target.value === "simulator" ? "submit" : "read",
                })
              }
            >
              <option value="text">Lección de texto</option>
              <option value="link">Documento o enlace HTTPS</option>
              <option value="simulator">Simulador evaluable</option>
            </SelectField>
            {a.kind === "simulator" ? (
              <>
                <SelectField
                  label="Simulador publicado"
                  value={
                    a.simulatorId
                      ? a.simulatorId + ":" + a.simulatorVersion
                      : ""
                  }
                  onChange={(e) => {
                    const [simulatorId, v] = e.target.value.split(":");
                    update({ simulatorId, simulatorVersion: Number(v) });
                  }}
                >
                  <option value="">Selecciona un simulador</option>
                  {d.simulators
                    .filter((s: any) => s.status === "published")
                    .map((s: any) => (
                      <option
                        key={s.id + ":" + s.version}
                        value={s.id + ":" + s.version}
                      >
                        {s.title} · v{s.version}
                      </option>
                    ))}
                </SelectField>
                <SelectField
                  label="Criterio de finalización"
                  value={a.completion}
                  onChange={(e) =>
                    update({
                      completion: e.target.value,
                      target: a.target ?? 60,
                    })
                  }
                >
                  <option value="submit">Entregar un intento</option>
                  <option value="score">Alcanzar una nota interna</option>
                </SelectField>
                {a.completion === "score" && (
                  <Field
                    label="Nota interna mínima sobre 100"
                    type="number"
                    min={0}
                    max={100}
                    value={a.target ?? 60}
                    onChange={(e) => update({ target: Number(e.target.value) })}
                  />
                )}
              </>
            ) : (
              <TextareaField
                label={
                  a.kind === "text"
                    ? "Contenido de la lección"
                    : "URL HTTPS del recurso"
                }
                value={a.content}
                onChange={(e) => update({ content: e.target.value })}
              />
            )}
            <label>
              <input
                type="checkbox"
                checked={a.required}
                onChange={(e) => update({ required: e.target.checked })}
              />{" "}
              Actividad requerida para el avance
            </label>
          </details>
        );
      })}
      <Button
        variant="secondary"
        onClick={() =>
          patch({
            activities: [
              ...c.activities,
              {
                id: crypto.randomUUID(),
                module: "Módulo 1",
                title: "",
                kind: "text",
                content: "",
                required: true,
                completion: "read",
              },
            ],
          })
        }
      >
        Añadir actividad
      </Button>
      <SelectField
        label="Acceso al curso"
        value={c.access}
        onChange={(e) => patch({ access: e.target.value as any })}
      >
        <option value="all">Todos los estudiantes</option>
        <option value="selected">Estudiantes seleccionados</option>
      </SelectField>
      {c.access === "selected" && (
        <ChoiceList
          label="Destinatarios"
          items={d.users}
          value={c.studentIds}
          onChange={(studentIds) => patch({ studentIds })}
        />
      )}
      <div className="training-split">
        <Field
          label="Disponible desde (hora de Ecuador)"
          type="datetime-local"
          value={c.availableFrom?.slice(0, 16) || ""}
          onChange={(e) =>
            patch({
              availableFrom: e.target.value ? e.target.value + ":00-05:00" : "",
            })
          }
        />
        <Field
          label="Disponible hasta (hora de Ecuador)"
          type="datetime-local"
          value={c.availableUntil?.slice(0, 16) || ""}
          onChange={(e) =>
            patch({
              availableUntil: e.target.value
                ? e.target.value + ":00-05:00"
                : "",
            })
          }
        />
      </div>
    </div>
  );
}
export function ProfileSelect({
  data: d,
  value: v,
  onChange,
}: {
  data: any;
  value: any;
  onChange: (v: any) => void;
}) {
  return (
    <SelectField
      label="Perfil de admisión publicado"
      value={v.profileId ? v.profileId + ":" + v.profileVersion : ""}
      onChange={(e) => {
        const [profileId, n] = e.target.value.split(":");
        onChange({ profileId, profileVersion: Number(n) });
      }}
    >
      <option value="">Selecciona una convocatoria</option>
      {d.profiles
        .filter((p: any) => p.status === "published")
        .map((p: any) => (
          <option key={p.id + ":" + p.version} value={p.id + ":" + p.version}>
            {p.institution} · {p.period} · v{p.version}
          </option>
        ))}
    </SelectField>
  );
}
export function ProfileEditor({
  value: p,
  onChange: change,
  data: d,
}: {
  value: AdmissionProfile;
  onChange: (v: AdmissionProfile) => void;
  data: any;
}) {
  const patch = (v: Partial<AdmissionProfile>) => change({ ...p, ...v });
  return (
    <div className="training-editor">
      <Notice>
        Documenta la convocatoria concreta. Esta preparación es propia de la
        plataforma y no está certificada por la institución.
      </Notice>
      <Field
        label="Nombre del perfil"
        value={p.title}
        onChange={(e) => patch({ title: e.target.value })}
      />
      <SelectField
        label="Institución del catálogo CES"
        value={p.institution}
        onChange={(e) => patch({ institution: e.target.value })}
      >
        <option value="">Selecciona institución</option>
        {d.institutions.map((i: string) => (
          <option key={i}>{i}</option>
        ))}
      </SelectField>
      <div className="training-split">
        <Field
          label="Período o convocatoria"
          value={p.period}
          onChange={(e) => patch({ period: e.target.value })}
        />
        <Field
          label="Nivel"
          value={p.level}
          onChange={(e) => patch({ level: e.target.value })}
        />
        <Field
          label="Fuente oficial HTTPS"
          value={p.sourceUrl}
          onChange={(e) => patch({ sourceUrl: e.target.value })}
        />
        <Field
          label="Fecha de revisión de la fuente"
          type="date"
          value={p.reviewedAt}
          onChange={(e) => patch({ reviewedAt: e.target.value })}
        />
      </div>
      <ChoiceList
        label="Carreras incluidas en el alcance"
        items={d.careers}
        value={p.careerIds}
        onChange={(careerIds) => patch({ careerIds })}
      />
      <TextareaField
        label="Alcance y condiciones por grupo de carreras"
        value={p.scope}
        onChange={(e) => patch({ scope: e.target.value })}
      />
      <TextareaField
        label="Reglas documentadas por la institución"
        value={p.rules}
        onChange={(e) => patch({ rules: e.target.value })}
      />
      <TextareaField
        label="Configuración interna no indicada por la institución"
        value={p.internalRules}
        onChange={(e) => patch({ internalRules: e.target.value })}
      />
      <Field
        label="Duración en minutos"
        type="number"
        value={p.durationMinutes}
        onChange={(e) => patch({ durationMinutes: Number(e.target.value) })}
      />
      {p.areas.map((a, i) => (
        <div className="training-module" key={i}>
          <Field
            label="Área"
            value={a.name}
            onChange={(e) =>
              patch({
                areas: p.areas.map((x, j) =>
                  i === j ? { ...x, name: e.target.value } : x,
                ),
              })
            }
          />
          <Field
            label="Preguntas"
            type="number"
            value={a.count}
            onChange={(e) =>
              patch({
                areas: p.areas.map((x, j) =>
                  i === j ? { ...x, count: Number(e.target.value) } : x,
                ),
              })
            }
          />
          <Field
            label="Peso porcentual"
            type="number"
            value={a.weight}
            onChange={(e) =>
              patch({
                areas: p.areas.map((x, j) =>
                  i === j ? { ...x, weight: Number(e.target.value) } : x,
                ),
              })
            }
          />
          <Button
            variant="ghost"
            onClick={() => patch({ areas: p.areas.filter((_, j) => i !== j) })}
          >
            Quitar área
          </Button>
        </div>
      ))}
      <Button
        variant="secondary"
        onClick={() =>
          patch({ areas: [...p.areas, { name: "", count: 10, weight: 100 }] })
        }
      >
        Añadir área
      </Button>
    </div>
  );
}
export function SimulatorEditor({
  value: s,
  onChange: change,
  data: d,
  onSave,onPublish,saving=false,onBusyChange,onCourseImport,
}: {
  onSave?:()=>void;onPublish?:()=>void;saving?:boolean;onBusyChange?:(busy:boolean)=>void;
  onCourseImport?:(course:Course,message:string)=>void|Promise<void>;
  value: Simulator;
  onChange: (v: Simulator) => void;
  data: any;
}) {
  const [aiProgress,setAiProgress]=useState(""),
    [step, setStep] = useState(0),
    [qi, setQi] = useState(0),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [html, setHtml] = useState(""),
    [importFile, setImportFile] = useState<File | null>(null),
    [importError, setImportError] = useState(""),
    [importProgress, setImportProgress] = useState(""),
    [result, setResult] = useState<any>(null),
    [preview, setPreview] = useState<Simulator | null>(null),
    [answers, setAnswers] = useState<any>({});
  const mounted=useRef(true);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  useEffect(()=>{onBusyChange?.(busy);return()=>onBusyChange?.(false);},[busy,onBusyChange]);
  const patch = (v: Partial<Simulator>) => change({ ...s, ...v }),
    q = s.questions[qi],
    t = academicInstrument(s);
  const update = (v: any) =>
    patch({
      questions: s.questions.map((x, i) =>
        i === qi
          ? {
              ...x,
              ...v,
              bankId: undefined,
              bankVersion: undefined,
              reviewed: false,
            }
          : x,
      ),
    });
  const questionIssues=instrumentProblems(t);
  const pendingQuestions=s.questions.map((question,index)=>({question,index,messages:[...questionIssues.filter(p=>p.questionId===question.id).map(p=>p.message),...(!question.explanation?.trim()?['Falta explicación.']:[]),...(!question.source?.trim()?['Falta procedencia.']:[])]})).filter(item=>item.messages.length);
  async function completeWithAI(){
   setBusy(true);setError('');setAiProgress('Preparando el simulador…');
   try{const result=await autofillSimulator(s,d.careers,false,message=>{if(mounted.current)setAiProgress(message);});if(!mounted.current)return;change(result.simulator);setError(result.message);setStep(4);}finally{if(mounted.current){setBusy(false);setAiProgress('');}}
  }
  async function upload(file: File) {
    if (busy || saving) return;
    const fileError = documentFileError(file.name, file.size);
    setImportFile(fileError ? null : file);
    setImportError(fileError || "");
    if (fileError) return;
    setBusy(true);
    setError("");
    setImportProgress("Preparando el documento…");
    try {
      const result=await importSimulatorDocument(file,s,d.careers,message=>{if(mounted.current)setImportProgress(message);});
      if(!mounted.current)return;
      if(result.kind==='course'){
        if(!onCourseImport)throw Error('Este documento es un programa de actividades. Impórtalo desde Cursos y actividades para conservar sus lecciones.');
        await onCourseImport(result.course,result.message);return;
      }
      change(result.simulator);
      setError(result.message);
      setImportFile(null);
      setHtml("");
      setStep(0);
    } catch (e) {
      if(mounted.current)setImportError((e as Error).message);
    } finally {
      if(mounted.current){setBusy(false);setImportProgress("");}
    }
  }
  return (
    <div className="training-editor te-editor te-editor-page">
      <div className="card stack" aria-busy={busy}>
       <div><h3>Asistente del simulador</h3><p className="small muted">Completa los campos pendientes con IA y revisa el resultado en un solo lugar.</p></div>
       <Button disabled={busy||saving||!s.questions.length} onClick={completeWithAI}>{busy?'Preparando simulador…':'Autocompletar con IA'}</Button>
       {aiProgress&&<p role="status">{aiProgress}</p>}
       {error&&<Notice>{error}</Notice>}
      </div>
      <fieldset disabled={busy||saving} style={{border:0,padding:0,margin:0,minWidth:0}}>
      <nav className="te-steps" aria-label="Editor de simulador">
        {["Información", "Preguntas", "Puntuación", "Aplicación", "Revisar y publicar"].map(
          (label, i) => (
            <button
              key={label}
              aria-current={step === i ? "step" : undefined}
              onClick={() => setStep(i)}
            >
              <span>{i + 1}</span>{label}
            </button>
          ),
        )}
      </nav>
      <section className="te-body stack">

      {step === 0 && (
        <>
          <Field
            label="Nombre del simulador"
            value={s.title}
            onChange={(e) => patch({ title: e.target.value })}
          />
          {d.educationLevel==='bachillerato'?<>
            <ChoiceList label="Preparación general por modalidad" items={d.careers.filter((c:any)=>schoolModalityTarget(c.id))} value={(s.careerIds||[]).filter(schoolModalityTarget)} onChange={careerIds=>patch({careerIds:[...(s.careerIds||[]).filter(id=>!schoolModalityTarget(id)),...careerIds]})}/>
            <p className="small muted">Se mostrará dentro de las áreas o figuras recomendadas al estudiante. Las modalidades no aparecen como carreras.</p>
            <ChoiceList label="Áreas y figuras de bachillerato" items={d.careers.filter((c:any)=>!schoolModalityTarget(c.id))} value={(s.careerIds||[]).filter(id=>!schoolModalityTarget(id))} onChange={careerIds=>patch({careerIds:[...(s.careerIds||[]).filter(schoolModalityTarget),...careerIds]})}/>
          </>:<ChoiceList label="Carreras del simulador" items={d.careers} value={s.careerIds||[]} onChange={careerIds=>patch({careerIds})}/>}

          {d.educationLevel==='universidad'&&!!s.careerIds?.length&&<details><summary>Universidades que ofrecen las carreras seleccionadas</summary>{d.careers.filter((c:any)=>s.careerIds?.includes(c.id)).map((c:any)=><div key={c.id}><strong>{c.name}</strong><ul>{[...new Set<string>((c.offers||[]).map((o:any)=>o.institution))].map(name=><li key={name}>{name}</li>)}</ul>{!c.offers?.length&&<p>Sin oferta registrada en el catálogo.</p>}</div>)}</details>}
          <p className="small muted">Asigna el simulador a las opciones de esta ruta. La nota mide esta práctica de contenidos; no decide qué bachillerato o carrera debe elegir el estudiante.</p>
          <PresentationEditor instrument={{...s.instrument,title:s.title}} onChange={presentation=>patch({instrument:{...s.instrument,presentation}})} onBusyChange={setBusy}/>
          <TextareaField
            label="Instrucciones"
            value={s.instrument.description}
            onChange={(e) =>
              patch({
                instrument: { ...s.instrument, description: e.target.value },
              })
            }
          />
          <Field
            label="Fuente y método de evaluación"
            value={s.instrument.source || ""}
            onChange={(e) =>
              patch({ instrument: { ...s.instrument, source: e.target.value } })
            }
          />
          <SelectField
            label="Propósito"
            value={s.purpose}
            onChange={(e) => patch({ purpose: e.target.value as any })}
          >
            <option value="general">Práctica general</option>
            {d.educationLevel!=='bachillerato'&&<option value="admission">Preparación para admisión universitaria</option>}
          </SelectField>
          {s.purpose === "admission" && (
            <ProfileSelect data={d} value={s} onChange={patch} />
          )}
          <label>
            Añadir preguntas desde un documento
            <input
              type="file"
              accept={DOCUMENT_ACCEPT}
              disabled={busy || saving}
              onChange={(e) => {const file=e.target.files?.[0];e.target.value="";if(file)void upload(file);}}
            />
          </label>
          <p className="small muted">{DOCUMENT_FORMAT_LABEL}. {DOCUMENT_FORMAT_HELP} Máximo 60 páginas por PDF.</p>
          <TextareaField
            label="O pegar código HTML"
            value={html}
            onChange={(e) => setHtml(e.target.value)}
          />
          <Button
            disabled={busy || !html.trim()}
            variant="secondary"
            onClick={() =>
              upload(new File([html], "simulador.html", { type: "text/html" }))
            }
          >
            {busy ? "Extrayendo…" : "Extraer HTML"}
          </Button>
          <Notice>
            Las preguntas se añadirán a este simulador de {d.educationLevel==='bachillerato'?'Bachillerato':'Universidad'}.
            La importación crea preguntas sin revisar. Configura claves automáticas,
            explicaciones y procedencia antes de publicar; no se ejecuta el
            código del documento.
          </Notice>
          {importProgress&&<p role="status">{importProgress}</p>}
          {importError&&<Notice tone="danger"><p>{importError}</p>{importFile&&<><p className="small" style={{overflowWrap:'anywhere'}}>{importFile.name}</p><Button variant="secondary" disabled={busy||saving} onClick={()=>void upload(importFile)}>Reintentar extracción</Button></>}</Notice>}
        </>
      )}
      {step === 1 && (
        <>
          <details className="question-outline" open><summary>Lista de preguntas ({s.questions.length})</summary><div className="te-question-nav" aria-label="Preguntas del simulador">{s.questions.map((item,i)=><button type="button" key={item.id} aria-current={qi===i?'true':undefined} onClick={()=>setQi(i)}><b>{i+1}</b><span>{item.text||'Pregunta sin enunciado'}</span></button>)}</div></details>
          <details>
            <summary>Reutilizar preguntas de un simulador publicado</summary>
            <SelectField
              label="Banco publicado"
              value=""
              onChange={(e) => {
                const source = d.simulators.find(
                  (x: any) => x.id + ":" + x.version === e.target.value,
                );
                if (!source) return;
                patch({
                  questions: [
                    ...s.questions,
                    ...source.questions
                      .filter(
                        (x: any) =>
                          !s.questions.some(
                            (q) => (q.bankId || q.id) === (x.bankId || x.id),
                          ),
                      )
                      .map((x: any) => ({
                        ...x,
                        bankId: x.bankId || x.id,
                        bankVersion: x.bankVersion || source.version,
                      })),
                  ],
                });
              }}
            >
              <option value="">
                Selecciona un banco para incorporar sus preguntas
              </option>
              {d.simulators
                .filter((x: any) => x.status === "published")
                .map((x: any) => (
                  <option
                    key={x.id + ":" + x.version}
                    value={x.id + ":" + x.version}
                  >
                    {x.title} · v{x.version} · {x.questions.length} preguntas
                  </option>
                ))}
            </SelectField>
            <small>
              Se conserva la identidad y versión de origen. Al editar se crea
              una revisión propia; los intentos anteriores no cambian.
            </small>
          </details>
          <SelectField
            label="Pregunta"
            value={String(qi)}
            onChange={(e) => setQi(Number(e.target.value))}
          >
            {s.questions.map((q, i) => (
              <option key={q.id} value={i}>
                {i + 1}. {q.text.slice(0, 65) || "Nueva pregunta"}
              </option>
            ))}
          </SelectField>
          {q && (
            <>
              <SelectField
                label="Tipo de respuesta"
                value={q.type || "single"}
                onChange={(e) =>
                  update({
                    type: e.target.value,
                    policy: "objective",
                  })
                }
              >
                <option value="single">Selección única</option>
                <option value="multiple">Selección múltiple</option>
                <option value="number">Número</option>
                <option value="short">Texto breve con clave</option>

              </SelectField>
              <TextareaField
                label="Enunciado"
                value={q.text}
                onChange={(e) => update({ text: e.target.value })}
              />
              <QuestionFormat test={t} q={q} onChange={update} />
              {q.options?.map((o, i) => (
                <Field
                  key={o.value}
                  label={"Opción " + (i + 1)}
                  value={o.label}
                  onChange={(e) =>
                    update({
                      options: q.options!.map((x, j) =>
                        i === j ? { ...x, label: e.target.value } : x,
                      ),
                    })
                  }
                />
              ))}
              {["single", "multiple", "yesno"].includes(q.type || "") && (
                <Button
                  variant="secondary"
                  onClick={() =>
                    update({
                      options: [
                        ...(q.options || []),
                        {
                          value:
                            Math.max(
                              0,
                              ...(q.options || []).map((o) => o.value),
                            ) + 1,
                          label: "",
                        },
                      ],
                    })
                  }
                >
                  Añadir opción
                </Button>
              )}
              <Field
                label="Área o tema"
                value={q.topic || q.section || ""}
                onChange={(e) =>
                  update({ topic: e.target.value, section: e.target.value })
                }
              />
              <Field
                label="Procedencia de la pregunta"
                value={q.source || ""}
                onChange={(e) => update({ source: e.target.value })}
              />
              <SelectField
                label="Dificultad editorial estimada"
                value={q.difficulty || "introductory"}
                onChange={(e) => update({ difficulty: e.target.value })}
              >
                <option value="introductory">Introductoria</option>
                <option value="intermediate">Intermedia</option>
                <option value="advanced">Avanzada</option>
              </SelectField>
              <Button
                variant="ghost"
                onClick={() => {
                  patch({ questions: s.questions.filter((_, i) => i !== qi) });
                  setQi(0);
                }}
              >
                Quitar pregunta
              </Button>
            </>
          )}
          <Button
            variant="secondary"
            onClick={() => {
              patch({
                questions: [
                  ...s.questions,
                  {
                    id: crypto.randomUUID(),
                    text: "",
                    type: "single",
                    policy: "objective",
                    weight: 1,
                    source: s.instrument.source,
                    options: [
                      { value: 1, label: "Opción 1" },
                      { value: 2, label: "Opción 2" },
                    ],
                    reviewed: false,
                  },
                ],
              });
              setQi(s.questions.length);
            }}
          >
            Añadir pregunta
          </Button>
          <SelectField
            label="Selección al iniciar"
            value={s.selection}
            onChange={(e) => patch({ selection: e.target.value as any })}
          >
            <option value="fixed">Todas las preguntas, selección fija</option>
            <option value="random">Aleatoria por área o tema</option>
          </SelectField>
          {s.selection === "random" && (
            <>
              {[
                ...new Set(
                  s.questions.map((q) => q.topic || q.section || "General"),
                ),
              ].map((topic) => (
                <Field
                  key={topic}
                  label={"Cantidad de " + topic}
                  type="number"
                  min={0}
                  value={s.quotas.find((q) => q.topic === topic)?.count || 0}
                  onChange={(e) =>
                    patch({
                      quotas: [
                        ...s.quotas.filter((q) => q.topic !== topic),
                        ...(Number(e.target.value) > 0
                          ? [{ topic, count: Number(e.target.value) }]
                          : []),
                      ],
                    })
                  }
                />
              ))}
            </>
          )}
          <label>
            <input
              type="checkbox"
              checked={s.shuffleOptions}
              onChange={(e) => patch({ shuffleOptions: e.target.checked })}
            />{" "}
            Mezclar opciones al iniciar
          </label>
          {s.shuffleOptions && (
            <ChoiceList
              label="Preguntas con orden de opciones fijo"
              items={s.questions.map((q) => ({ id: q.id, name: q.text }))}
              value={s.questionOrderFixedIds}
              onChange={(questionOrderFixedIds) =>
                patch({ questionOrderFixedIds })
              }
            />
          )}
        </>
      )}
      {step === 2 && (
        <>
          <SelectField
            label="Pregunta para revisar"
            value={String(qi)}
            onChange={(e) => setQi(Number(e.target.value))}
          >
            {s.questions.map((q, i) => (
              <option key={q.id} value={i}>
                {i + 1}. {q.text.slice(0, 65)}
              </option>
            ))}
          </SelectField>
          {q && (
            <>
              <h3>{q.text}</h3>
              <SelectField
                label="Evaluación"
                value={q.policy || "objective"}
                onChange={(e) => update({ policy: e.target.value })}
              >
                <option value="objective">Clave objetiva</option>

              </SelectField>
              <QuestionSettings
                value={q}
                onChange={update}
                options={q.options || []}
                objective={
                  q.policy !== "rubric" &&
                  ["single", "multiple", "yesno"].includes(q.type || "")
                }
              />
              <AcademicQuestionSettings q={q} change={update} />
              <TextareaField
                label="Explicación al estudiante"
                value={q.explanation || ""}
                onChange={(e) => update({ explanation: e.target.value })}
              />
              <label>
                <input
                  type="checkbox"
                  checked={!!q.reviewed}
                  onChange={(e) =>
                    patch({
                      questions: s.questions.map((x, i) =>
                        i === qi ? { ...x, reviewed: e.target.checked } : x,
                      ),
                    })
                  }
                />{" "}
                He revisado la clave, explicación y procedencia
              </label>
            </>
          )}
          <Notice>
            El peso de cada pregunta representa sus puntos máximos en una clave
            objetiva. Omisiones y errores aportan cero. Al entregar, el sistema calcula la nota automáticamente usando las claves.
          </Notice>
          <label>
            <input
              type="checkbox"
              checked={s.areaWeights.length > 0}
              onChange={(e) =>
                patch({
                  areaWeights: e.target.checked
                    ? [
                        ...new Set(
                          s.questions.map(
                            (q) => q.topic || q.section || "General",
                          ),
                        ),
                      ].map((area) => ({ area, weight: 0 }))
                    : [],
                })
              }
            />{" "}
            Ponderar áreas (deben sumar 100)
          </label>
          {s.areaWeights.map((a) => (
            <Field
              key={a.area}
              label={"Peso de " + a.area + " (%)"}
              type="number"
              value={a.weight}
              onChange={(e) =>
                patch({
                  areaWeights: s.areaWeights.map((x) =>
                    x.area === a.area
                      ? { ...x, weight: Number(e.target.value) }
                      : x,
                  ),
                })
              }
            />
          ))}
        </>
      )}
      {step === 3 && (
        <>
          <label>
            <input
              type="checkbox"
              checked={s.modes.includes("practice")}
              onChange={(e) =>
                patch({
                  modes: e.target.checked
                    ? [...s.modes, "practice"]
                    : s.modes.filter((m) => m !== "practice"),
                })
              }
            />{" "}
            Práctica
          </label>
          <label>
            <input
              type="checkbox"
              checked={s.modes.includes("exam")}
              onChange={(e) =>
                patch({
                  modes: e.target.checked
                    ? [...s.modes, "exam"]
                    : s.modes.filter((m) => m !== "exam"),
                })
              }
            />{" "}
            Modo examen
          </label>
          <Field
            label="Tiempo del examen en minutos"
            type="number"
            value={s.durationMinutes}
            onChange={(e) => patch({ durationMinutes: Number(e.target.value) })}
          />
          <Field
            label="Tiempo de práctica en minutos (0 = sin límite)"
            type="number"
            min={0}
            max={480}
            value={s.practiceDurationMinutes ?? s.durationMinutes}
            onChange={(e) =>
              patch({ practiceDurationMinutes: Number(e.target.value) })
            }
          />
          <Field
            label="Máximo de intentos por actividad y modo"
            type="number"
            value={s.maxAttempts}
            onChange={(e) => patch({ maxAttempts: Number(e.target.value) })}
          />
          <SelectField
            label="Calificación principal"
            value={s.gradePolicy}
            onChange={(e) => patch({ gradePolicy: e.target.value as any })}
          >
            <option value="first">Primer intento</option>
            <option value="last">Último intento</option>
            <option value="best">Mejor intento</option>
            <option value="mean">Media de la misma versión y modo</option>
          </SelectField>
          <SelectField
            label="Explicaciones en práctica"
            value={s.feedback}
            onChange={(e) => patch({ feedback: e.target.value as any })}
          >
            <option value="finish">Al terminar</option>
            <option value="question">Tras confirmar cada respuesta</option>
          </SelectField>
          <Notice>
            En examen, las explicaciones aparecen después de entregar. El
            recorrido conserva el tiempo y las versiones.
          </Notice>
        </>
      )}
      {step === 4 && (
        <>
          <h3>Revisa antes de publicar</h3>

          {s.questions.some(q=>q.aiSuggested)&&<Notice>La IA propone claves y explicaciones. Confirma su contenido antes de publicar.</Notice>}
          {s.questions.some(q=>q.aiIssue)&&<Notice tone="warning"><ul>{s.questions.map((q,i)=>q.aiIssue&&<li key={q.id}>Pregunta {i+1}: {q.aiIssue}</li>)}</ul></Notice>}
          <label style={{display:"flex",alignItems:"flex-start",gap:12}}><input style={{flexShrink:0,marginTop:4}} type="checkbox" checked={s.questions.length>0&&s.questions.every(q=>q.reviewed)} disabled={!s.questions.length||busy} onChange={e=>patch({questions:s.questions.map(q=>({...q,reviewed:e.target.checked}))})}/><span>He revisado las claves, explicaciones y procedencia de todas las preguntas.</span></label>
          <p>{s.title||'Simulador sin nombre'} · {s.questions.length} preguntas · {s.durationMinutes} minutos de examen</p>
          <p>Práctica y examen según las modalidades elegidas. Nota sobre 100 puntos y publicación en las carreras asignadas.</p>
          {!s.careerIds?.length&&<Notice tone="warning">Selecciona al menos una opción de estudio en Información.</Notice>}
          <p><strong>{s.questions.length-pendingQuestions.length} de {s.questions.length}</strong> preguntas con clave, explicación y procedencia completas.</p>
          {pendingQuestions.length>0&&<Notice tone="warning"><b>Preguntas pendientes</b><ul>{pendingQuestions.map(({question,index,messages})=><li key={question.id}><button type="button" onClick={()=>{setQi(index);setStep(2);}}>Pregunta {index+1}: {messages.join(' ')} → Revisar</button></li>)}</ul></Notice>}
          {simulatorProblems(s).length>0&&<details><summary>Ver requisitos de publicación</summary><ul>{[...new Set(simulatorProblems(s))].map(message=><li key={message}>{message}</li>)}</ul></details>}
          {onPublish&&<Button disabled={saving||busy||simulatorProblems(s).length>0||!s.careerIds?.length} onClick={onPublish}>Publicar simulador</Button>}
          <Button
            variant="secondary"
            onClick={async () => {
              try {
                setPreview(
                  await trainingApi("/preview/select", { simulator: s }),
                );
                setAnswers({});
                setResult(null);
                setError("");
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            Preparar vista previa
          </Button>
          {preview && (
            <>
              {preview.questions.map((q) => (
                <section className="training-module" key={q.id}>
                  <h3>{q.text}</h3>
                  <TestQuestion
                    instrument={academicInstrument(preview)}
                    question={q}
                    value={answers[q.id]}
                    onChange={(v) => setAnswers({ ...answers, [q.id]: v })}
                  />
                </section>
              ))}
              <Button
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    setResult(
                      await trainingApi("/preview", {
                        simulator: preview,
                        answers,
                      }),
                    );
                    setError("");
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {"Calcular con el servidor"}
              </Button>
              {result && (
                <Notice>
                  {result.percent ?? "Pendiente"} / 100 · {result.raw} de{" "}
                  {result.max} puntos. No se ha creado un intento de estudiante.
                </Notice>
              )}
            </>
          )}
        </>
      )}
      </section>
      <div className="row te-footer"><Button variant="secondary" disabled={step===0||busy||saving} onClick={()=>setStep(step-1)}>Anterior</Button>{step<4&&<Button disabled={busy||saving} onClick={()=>setStep(step+1)}>Continuar</Button>}{onSave&&<Button variant="secondary" disabled={busy||saving} onClick={onSave}>Guardar borrador</Button>}<span className="small muted">Paso {step+1} de 5 · {s.questions.length} preguntas</span></div>
      </fieldset>
    </div>
  );
}
