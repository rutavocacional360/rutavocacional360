import {reportLimitations} from '@/components/kit/lib/report-limitations';
import {schoolSelection} from '@/components/kit/lib/school-selection';
import { ensureGuidance } from './guidance';
import { studentEducationLevel,submissionRoutes } from './assessment-route';
import { requireCompletedAssessments } from './assessment-readiness';
import { GUIDANCE_RULES_VERSION } from '@/components/kit/lib/local-guidance';
import { answerText } from '@/components/kit/lib/test-answer-text';
import { visibleQuestions } from '@/components/kit/lib/test-engine';
import { randomUUID } from "node:crypto";
import { db, document, fail, hash, resultIsReleased } from "./store";
import { dimensions } from "@/components/kit/data/instruments";
import { stations } from "@/components/kit/data/course";
import { versionLabel } from "@/components/kit/lib/version";
import type {
  IntegralReport,
  IntegralSection,
} from "@/components/kit/lib/integral-report";
import { asyncSome } from "@/lib/server/async-collections";

const ENGINE = 'route-integral-supported-options-'+GUIDANCE_RULES_VERSION;
const areaName = (code: string) =>
  dimensions.find((d) => d.code === code)?.name || code;
function ensureTables() {}
function scope(user: any) {
  return user.role === "student"
    ? { sql: "r.user_id=?", args: [user.id] }
    : {
        sql:
          "r.shared=1 AND r.institution_id=? AND u.institutionId=?" +
          (user.role === "orientador" ? " AND u.groupName=?" : ""),
        args:
          user.role === "orientador"
            ? [user.institutionId, user.institutionId, user.group]
            : [user.institutionId, user.institutionId],
      };
}
export async function listIntegralReports(
  user: any,
  studentId?: string | null,
) {
  ensureTables();
  const allowed = scope(user);
  const rows = (await db
    .prepare(
      "SELECT r.content FROM orientation_reports r JOIN users u ON u.id=r.user_id WHERE " +
        allowed.sql +
        (studentId ? " AND r.user_id=?" : "") +
        " ORDER BY r.created_at DESC",
    )
    .all(...allowed.args, ...(studentId ? [studentId] : []))) as any[];
  return rows.map((row) => {
    const r = JSON.parse(row.content) as IntegralReport;
    return {
      id: r.id,
      createdAt: r.createdAt,
      student: r.student,
      engineVersion: r.engineVersion,
      shared: r.shared,
      educationLevel:r.educationLevel,
    };
  });
}
export async function readIntegralReport(user: any, id: string) {
  ensureTables();
  const allowed = scope(user);
  const row = (await db
    .prepare(
      "SELECT r.content FROM orientation_reports r JOIN users u ON u.id=r.user_id WHERE r.id=? AND " +
        allowed.sql,
    )
    .get(id, ...allowed.args)) as any;
  if (!row) fail("Informe no disponible para esta cuenta.", 404);
  return JSON.parse(row.content) as IntegralReport;
}

export async function createIntegralReport(
  user: any,
  attemptIds: unknown,
  shared: unknown,
) {
  ensureTables();
  if (user.role !== "student")
    fail("El informe integral lo genera el estudiante desde su cuenta.", 403);
  if (
    !Array.isArray(attemptIds) ||
    !attemptIds.length ||
    attemptIds.length > 100 ||
    attemptIds.some((id) => typeof id !== "string") ||
    new Set(attemptIds).size !== attemptIds.length
  )
    fail("Selecciona entre 1 y 100 entregas distintas.");
  if (typeof shared !== "boolean")
    fail("Indica si deseas compartir el informe.");
  const attempts = await Promise.all(
    attemptIds.map(
      async (id) =>
        (await db
          .prepare("SELECT * FROM submissions WHERE id=? AND user_id=?")
          .get(id, user.id)) as any,
    ),
  );
  if (attempts.some((row) => !row))
    fail("Una entrega no pertenece a tu cuenta.", 403);
  if (await asyncSome(attempts, async (a) => !(await resultIsReleased(a))))
    fail(
      "Espera a que se publiquen los resultados antes de incluirlos en el informe.",
      409,
    );
  if (
    new Set(attempts.map((row) => row.instrument_id)).size !== attempts.length
  )
    fail("Selecciona un solo intento por instrumento.");
  const educationLevel=await studentEducationLevel(user),school=educationLevel==='bachillerato';
  const routeOf=await submissionRoutes(user,educationLevel);
  if(attempts.some(row=>routeOf(row)!==educationLevel))fail('Selecciona solo resultados de tu ruta educativa actual.',409);
  await requireCompletedAssessments(user,educationLevel);
  const guidance=await ensureGuidance(user);
  const selected=new Set(attempts.map(row=>row.id));
  if(guidance.instruments.some((item:any)=>!selected.has(item.id))||attempts.some(row=>!guidance.instruments.some((item:any)=>item.id===row.id)))fail('Incluye los resultados actuales de todos los tests de esta ruta para generar el informe integral.',409);
  const order: Record<string, number> = {
    intereses: 0,
    valores: 1,
    autoconocimiento: 2,
  };
  attempts.sort(
    (a, b) =>
      (order[a.instrument_id] ?? 3) - (order[b.instrument_id] ?? 3) ||
      a.instrument_id.localeCompare(b.instrument_id),
  );
  const timezone =
    (
      await document(
        "institution:" + user.institutionId,
        "rv360:admin-settings",
        {},
      )
    ).timezone || "America/Guayaquil";
  const sections: IntegralSection[] = [
      {
        title: "Estado de mi ruta",
        lines: [
          "Ruta: "+(school?"Bachillerato":"Universidad"),
          "Esta copia incluye " + attempts.length + " instrumentos entregados.",
          ...(await Promise.all(
            (
              [
                ["intereses", "Intereses vocacionales"],
                ["valores", "Valores y preferencias"],
                ["autoconocimiento", "Autoconocimiento"],
              ] as const
            ).map(
              async ([id, title]) =>
                title +
                ": " +
                (attempts.some((a) => a.instrument_id === id)
                  ? "incluido"
                  : (await db
                        .prepare(
                          "SELECT id FROM submissions WHERE user_id=? AND instrument_id=? LIMIT 1",
                        )
                        .get(user.id, id))
                    ? "entregado, no seleccionado para esta copia"
                    : "pendiente de entrega"),
            ),
          )),
        ],
      },
    ],
    pref: Record<string, string> = {};
  for (const a of attempts) {
    const current=guidance.instruments.find((item:any)=>item.id===a.id);
    const instrument = current.instrument,
      scores = current.scores,
      answers = current.answers;
    const lines = [
      `Estado: entregado · ${instrument.questions.length} preguntas.`,
      `Intento: ${a.id.slice(0, 8)} · Versión: ${versionLabel(a.version)} · Entrega: ${new Date(a.created_at).toLocaleString("es-EC", { timeZone: timezone })} (${timezone})`,
    ];
    if (scores.length) {
      lines.push(
        a.instrument_id === "intereses"
          ? "Escala RIASEC: suma 5–25; promedio 1–5."
          : a.instrument_id === "autoconocimiento"
            ? "Escala autoinformada: promedio × 20, de 20 a 100; no es un percentil."
            : "Puntuaciones según las reglas conservadas en esta versión.",
      );
      scores.forEach((s: any) =>
        lines.push(
          `${areaName(s.dimension)}: ${(instrument.aggregation||(instrument.schemaVersion===2?'sum':'mean'))==='sum'?'suma '+s.raw:'promedio ponderado '+Number(s.value).toFixed(2)}${s.percent !== undefined ? `, índice ${s.percent} / 100` : ""}${s.band ? `, ${s.band}` : ""}.`,
        ),
      );
    }
    for (const q of visibleQuestions(instrument,answers).filter(q=>q.type!=='info')) {
      const value = answers[q.id];
      const text = answerText(instrument,q,value);
      if (a.instrument_id === "valores") pref[q.id] = text;
      lines.push(`${q.text} — ${text}`);
    }
    sections.push({ title: instrument.title, lines });
  }
  sections.push({title:school?'Orientación de Bachillerato':'Orientación de Universidad',lines:[
    guidance.analysis.summary,
    'Orientación elaborada a partir de tus respuestas guardadas.',
  ]});
  if(school){
    const pathway=guidance.analysis.pathway;
    const selection=schoolSelection(pathway);
    sections.push({title:selection.modality?'Modalidad de Bachillerato recomendada':selection.title,lines:[...(selection.modality?[selection.title]:[]),pathway.reason]});
    for(const group of selection.groups)sections.push({title:group.title,lines:group.options.length?group.options.flatMap(option=>[(selection.options.indexOf(option)+1)+'. '+option.name,option.reason,'Asignaturas: '+option.subjects,'Actividad: '+option.activity,'Evidencia: '+option.evidence.join(', ')]):['Sin opciones priorizadas dentro de esta modalidad. Revisa las asignaturas y actividades con tu orientador.']});
  }else sections.push({title:'Carreras universitarias relacionadas con tus resultados',lines:guidance.analysis.recommendations.length?guidance.analysis.recommendations.flatMap((option:any)=>[guidance.catalog.find((c:any)=>c.id===option.careerId)?.name||option.careerId,option.reason,'Qué explorar: '+option.explore,'Evidencia: '+option.evidence.join(', ')]):['Los resultados todavía no permiten priorizar una carrera. Contrasta tus intereses con experiencias y orientación docente.']});
  sections.push({title:'Recomendaciones para avanzar',lines:guidance.analysis.nextSteps});
  sections.push({title:'Fuentes de esta ruta',lines:[guidance.catalogSource.source,guidance.catalogSource.sourceUrl,'Consulta: '+guidance.catalogSource.date,'Reglas: '+guidance.rulesVersion]});
  const notes = await document(user.id, "rv360:course-notes", {}),
    done = await document(user.id, "rv360:course-done", []);
  sections.push({
    title: "Mi plan · ocho estaciones",
    lines: stations.map(
      (station, i) =>
        `${i + 1}. ${station.title} · ${done.includes(String(i)) ? "Completada" : "Pendiente"}. ${station.prompt} — ${notes[i] || "Sin reflexión registrada."}`,
    ),
  });
  const reflections = await document(user.id, "rv360:reflections", {});
  sections.push({
    title: "Reflexiones vocacionales",
    lines: [
      ["ref1", "Lo que disfrutas"],
      ["ref2", "Tu entorno"],
      ["ref3", "Lo que quieres aprender"],
      ["ref4", "Tu propia decisión"],
    ].map(([id, title]) => `${title}: ${reflections[id] || "Pendiente."}`),
  });
  const labs: Record<string, string> = {
      attention: "Atención",
      memory: "Memoria",
      flexibility: "Flexibilidad",
      control: "Control de respuesta",
      speed: "Tiempo de respuesta",
    },
    runs = await document(user.id, "rv360:lab-history", []),
    labNotes = await document(user.id, "rv360:lab-notes", {});
  sections.push({
    title: "Laboratorio de exploración",
    lines: [
      "Las actividades son contextuales; no participan en el orden de carreras ni miden una capacidad general.",
      ...Object.entries(labs).flatMap(([id, title]) => [
        `${title}: ${runs.some((run: any) => run.id === id) ? "Con registros" : "Pendiente"}. Reflexión: ${labNotes[id] || "Sin reflexión."}`,
        ...runs
          .filter((run: any) => run.id === id)
          .map(
            (run: any) =>
              `${run.created_at}: aciertos registrados ${run.score}; rondas ${run.round}${run.errors !== undefined ? `; errores ${run.errors}; omisiones ${run.omissions}` : ""}${run.engineVersion ? `; plantilla ${run.engineVersion}` : ""}${typeof run.time === "number" ? `; tiempo de respuesta ${run.time} ms` : ""}. ${run.feedback || ""}`,
          ),
      ]),
    ],
  });
  const venture = await document(user.id, "rv360:venture", {});
  sections.push({
    title: "Emprendimiento",
    lines: [
      ["problem", "Problema"],
      ["people", "Personas"],
      ["idea", "Solución"],
      ["value", "Valor"],
      ["test", "Prueba"],
      ["learn", "Indicador de aprendizaje"],
    ].map(([id, title]) => `${title}: ${venture[id] || "Pendiente."}`),
  });
  const ventureDone = await document(user.id, "rv360:venture-steps", []);
  sections.push({
    title: "Ruta de emprendimiento",
    lines: [
      "Observar",
      "Definir problema",
      "Idear",
      "Prototipar",
      "Validar",
      "Diseñar modelo",
      "Medir aprendizaje",
      "Escalar responsablemente",
    ].map(
      (title) =>
        title +
        ": " +
        (ventureDone.includes(title) ? "Completado" : "Pendiente"),
    ),
  });
  const tasks = await document(user.id, "rv360:tasks", []);
  sections.push({
    title: "Próximos pasos",
    lines: tasks.length
      ? tasks.map(
          (t: any) =>
            `${t.done ? "Completado" : "Pendiente"}: ${t.title}${t.date ? " · Fecha: " + t.date : ""}`,
        )
      : [
          school?'Compara dos opciones de Bachillerato, sus asignaturas y actividades; conversa con tu orientador.':'Compara dos carreras universitarias, sus planes de estudio y conversa con una persona del área.',
        ],
  });
  sections.push({
    title: "Alcance del informe",
    lines: [
      "Copia fechada de las entregas seleccionadas y del contexto personal disponible al generarla. Las ediciones posteriores no cambian esta copia.",
      "Intereses y preferencias orientan la exploración. Laboratorio, autoconocimiento, curso y reflexiones aportan contexto; no se mezclan en una puntuación de aptitud.",
      ...reportLimitations(guidance.analysis.limitations),
    ],
  });
  const payload = {
    student: { id: user.id, name: user.name },
    engineVersion: ENGINE,
    educationLevel,
    shared: shared && !!user.institutionId,
    attemptIds: attempts.map((a) => a.id),
    sections,
  };
  const digest = hash(
    JSON.stringify({ ...payload, institutionId: user.institutionId }),
  );
  const previous = (await db
    .prepare(
      "SELECT content FROM orientation_reports WHERE user_id=? AND digest=?",
    )
    .get(user.id, digest)) as any;
  if (previous) return JSON.parse(previous.content) as IntegralReport;
  const report: IntegralReport = {
    ...payload,
    id: randomUUID(),
    createdAt: new Date().toISOString(),
  };
  await db
    .prepare("INSERT INTO orientation_reports VALUES(?,?,?,?,?,?,?)")
    .run(
      report.id,
      user.id,
      user.institutionId,
      report.createdAt,
      Number(report.shared),
      digest,
      JSON.stringify(report),
    );
  return report;
}
