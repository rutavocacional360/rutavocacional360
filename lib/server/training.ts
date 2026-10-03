import { randomUUID, randomInt, createHash } from "node:crypto";
import { db, fail, document, put, resultIsReleased, publicUser } from "./store";
import {
  ecuadorCareers,
  careerOffers,
  catalogSource,
  previewCatalog,
  applyCatalog,
} from "./ecuador-catalog";
import { degreeOffer } from "./academic-content.mjs";
import {schoolCatalogSource} from '@/components/kit/data/baccalaureate';
import {studentEducationLevel} from './assessment-route';
import { ensureGuidance } from "./guidance";
import { assessmentReadiness, requireCompletedAssessments } from "./assessment-readiness";
import {
  academicResult,
  academicInstrument,
  selectQuestions,
  simulatorProblems,
  courseProgress,
  principalGrade,
} from "@/components/kit/lib/training-engine";
import { answerProblem, absent } from "@/components/kit/lib/test-engine";
import {
  matchesCourseProfile,
  courseUniversityProblem,
} from "@/components/kit/lib/course-links";
import type {
  Course,
  Simulator,
  AdmissionProfile,
  TrainingGoal,
} from "@/components/kit/lib/training-types";
import { asyncSome } from "@/lib/server/async-collections";
import { simulatorCareerIds } from "@/components/kit/lib/simulator-careers";
import {schoolTrainingTargets,schoolPreparationRecommendations,schoolTarget,preparationLevel,trainingTargetMatches} from '@/components/kit/data/school-training';

// Additive migration. Published content and enrolled itineraries are immutable snapshots.
type User = {
  id: string;
  role: string;
  institutionId?: string | null;
  name?: string;
};
const now = () => new Date().toISOString();
async function tx<T>(fn: () => T | Promise<T>): Promise<T> {
  return db.transaction(async () => await fn());
}

async function audit(
  u: User,
  action: string,
  entity: string,
  detail: any = {},
) {
  await db
    .prepare("INSERT INTO training_audit VALUES(?,?,?,?,?,?,?)")
    .run(
      randomUUID(),
      u.institutionId || "",
      u.id,
      action,
      entity,
      JSON.stringify(detail),
      now(),
    );
}
function admin(u: User) {
  if (u.role !== "admin")
    fail("Solo administración puede gestionar preparación.", 403);
}
function student(u: User) {
  if (u.role !== "student")
    fail("Solo estudiantes pueden realizar esta operación.", 403);
}
async function rows(u: User, kind: string) {
  return (
    (await db
      .prepare(
        "SELECT * FROM training_entities WHERE org=? AND kind=? ORDER BY version DESC",
      )
      .all(u.institutionId || "", kind)) as any[]
  ).map((r) => JSON.parse(r.content));
}
async function entity(u: User, kind: string, id: string, version?: number) {
  const r = (await db
    .prepare(
      "SELECT * FROM training_entities WHERE org=? AND kind=? AND id=? " +
        (version ? "AND version=? " : "") +
        "ORDER BY version DESC LIMIT 1",
    )
    .get(
      ...[u.institutionId || "", kind, id, ...(version ? [version] : [])],
    )) as any;
  if (!r) fail("Contenido no disponible.", 404);
  return JSON.parse(r.content);
}
async function published(u: User, kind: string, id: string, version: number) {
  const e = await entity(u, kind, id, version);
  if (e.status !== "published") fail("La dependencia debe estar publicada.");
  return e;
}
const unique = <T extends { id: string }>(items: T[]) =>
  items.filter((c, i) => items.findIndex((x) => x.id === c.id) === i);
export function trainingCatalog() {
  const offers = careerOffers(ecuadorCareers.map((c) => c.id));
  const careers = ecuadorCareers
    .map((c) => ({ ...c, offers: (offers[c.id] || []).filter(degreeOffer) }))
    .filter((c) => c.offers.length);
  return {
    careers: [...careers,...schoolTrainingTargets],
    source: {
      ...catalogSource,
      careerCount: careers.length,
      offerCount: careers.reduce((n, c) => n + c.offers.length, 0),
    },
    institutions: [
      ...new Set(careers.flatMap((c) => c.offers.map((o) => o.institution))),
    ].sort(),
  };
}
function canRead(c: Course, u: User) {
  return (
    c.status === "published" &&
    (c.access === "all" || c.studentIds.includes(u.id)) &&
    (!c.availableFrom || Date.now() >= Date.parse(c.availableFrom)) &&
    (!c.availableUntil || Date.now() <= Date.parse(c.availableUntil))
  );
}
async function validate(u: User, kind: string, e: any) {
  if (
    !e ||
    !["course", "simulator", "profile"].includes(kind) ||
    typeof e.title !== "string" ||
    e.title.length > 300 ||
    JSON.stringify(e).length > 1500000
  )
    fail("Contenido inválido.");
  if (!["draft", "published", "archived"].includes(e.status))
    fail("Estado inválido.");
  if (e.careerIds !== undefined && !Array.isArray(e.careerIds)) fail('Revisa las opciones de estudio.');
  if (e.educationLevel !== undefined && !['bachillerato','universidad'].includes(e.educationLevel)) fail('Revisa el nivel de preparación.');
  if (e.careerIds?.some(schoolTarget) && e.careerIds.some((id: string) => !schoolTarget(id)))
    fail('Separa las opciones de Bachillerato y Universidad.');
  if (e.educationLevel && e.careerIds?.some((id: string) => schoolTarget(id) !== (e.educationLevel === 'bachillerato')))
    fail('El nivel debe coincidir con las opciones de estudio asignadas.');
  if (
    kind === "simulator" &&
    (!Array.isArray(e.questions) ||
      !e.instrument ||
      !Array.isArray(e.instrument.options) ||
      !Array.isArray(e.modes) ||
      !Array.isArray(e.quotas) ||
      !Array.isArray(e.areaWeights))
  )
    fail("Estructura del simulador inválida.");
  if (
    kind === "course" &&
    (!Array.isArray(e.activities) ||
      !Array.isArray(e.careerIds) ||
      !Array.isArray(e.fields) ||
      !Array.isArray(e.studentIds))
  )
    fail("Estructura del curso inválida.");
  if (
    kind === "profile" &&
    (!Array.isArray(e.areas) || !Array.isArray(e.careerIds))
  )
    fail("Estructura del perfil inválida.");
  if (e.status !== "published") return;
  if (e.careerIds !== undefined && !Array.isArray(e.careerIds)) fail('Revisa las opciones de estudio.');
  if (e.educationLevel !== undefined && !['bachillerato','universidad'].includes(e.educationLevel)) fail('Revisa el nivel de preparación.');
  if((kind==='profile'||e.purpose==='admission'||e.type==='admission')&&e.careerIds?.some(schoolTarget))fail('Los perfiles de admisión universitaria no se aplican al ingreso a BGU.');
  if (!e.title.trim()) fail("Escribe un título.");
  const catalog = trainingCatalog();
  if (kind === "simulator") {
    if (e.careerIds !== undefined && (!Array.isArray(e.careerIds) ||
      e.careerIds.some((id: string) => !catalog.careers.some((c) => c.id === id))))
      fail("Selecciona opciones válidas de Bachillerato o Universidad.");
    const errors = simulatorProblems(e);
    if (errors.length) fail(errors.join(" "));
    if (e.purpose === "admission") {
      const p = (await published(
        u,
        "profile",
        e.profileId,
        e.profileVersion,
      )) as AdmissionProfile;
      if (
        e.durationMinutes !== p.durationMinutes ||
        p.areas.some((a) => {
          const count =
            e.selection === "random"
              ? e.quotas.find((q: any) => q.topic === a.name)?.count
              : e.questions.filter(
                  (q: any) => (q.topic || q.section || "General") === a.name,
                ).length;
          return (
            count !== a.count ||
            e.areaWeights.find((w: any) => w.area === a.name)?.weight !==
              a.weight
          );
        }) ||
        e.areaWeights.length !== p.areas.length
      )
        fail(
          "Las áreas, cuotas, pesos y duración deben coincidir con el perfil de admisión publicado.",
        );
    }
    return;
  }
  if (
    !Array.isArray(e.careerIds) ||
    e.careerIds.some((id: string) => !catalog.careers.some((c) => c.id === id))
  )
    fail("Selecciona carreras reales del catálogo de grado.");
  if (kind === "profile") {
    if (
      !e.careerIds.length ||
      e.careerIds.some(
        (id: string) =>
          !catalog.careers
            .find((c) => c.id === id)
            ?.offers.some((o) => o.institution === e.institution),
      ) ||
      new Set(e.areas?.map((a: any) => a.name)).size !== e.areas?.length ||
      !catalog.institutions.includes(e.institution) ||
      !e.period?.trim() ||
      !["grado", "tercer nivel de grado"].includes(
        e.level?.trim().toLowerCase(),
      ) ||
      !e.scope?.trim() ||
      !e.rules?.trim() ||
      !e.internalRules?.trim() ||
      !/^https:\/\//.test(e.sourceUrl) ||
      !Number.isFinite(Date.parse(e.reviewedAt)) ||
      Date.parse(e.reviewedAt) > Date.now() ||
      !e.areas?.length ||
      e.areas.some(
        (a: any) =>
          !a.name ||
          !Number.isInteger(a.count) ||
          a.count < 1 ||
          !Number.isFinite(a.weight) ||
          a.weight <= 0,
      ) ||
      Math.abs(e.areas.reduce((n: number, a: any) => n + a.weight, 0) - 100) >
        1e-8 ||
      !Number.isInteger(e.durationMinutes) ||
      e.durationMinutes < 1 ||
      e.durationMinutes > 480
    )
      fail(
        "Completa fuente oficial revisada, institución, período, alcance, reglas y áreas con pesos que sumen 100.",
      );
    return;
  }
  const c = e as Course;
  if (
    !c.description?.trim() ||
    !c.objectives?.trim() ||
    !["general", "field", "admission"].includes(c.type) ||
    !["all", "selected"].includes(c.access) ||
    !Array.isArray(c.studentIds) ||
    (c.access === "selected" && !c.studentIds.length) ||
    !Array.isArray(c.fields) ||
    c.fields.some((f) => !catalog.careers.some((x) => x.area === f))
  )
    fail("Completa objetivos, destinatarios y relaciones del curso.");
  const universityProblem = courseUniversityProblem(
    c.institutions,
    c.careerIds,
    catalog.careers,
  );
  if (universityProblem) fail(universityProblem);
  if (
    await asyncSome(
      c.studentIds,
      async (id) =>
        !(await db
          .prepare(
            "SELECT id FROM users WHERE id=? AND institutionId=? AND role='student'",
          )
          .get(id, u.institutionId || "")),
    )
  )
    fail("Un destinatario no pertenece a esta plataforma.");
  if (
    [c.availableFrom, c.availableUntil].some(
      (d) => d && !Number.isFinite(Date.parse(d)),
    ) ||
    (c.availableFrom && c.availableUntil && c.availableFrom > c.availableUntil)
  )
    fail("Revisa las fechas.");
  if (c.type === "admission") {
    const p = (await published(
      u,
      "profile",
      c.profileId!,
      c.profileVersion!,
    )) as AdmissionProfile;
    if (
      !c.careerIds.length ||
      c.careerIds.some((id) => !p.careerIds.includes(id))
    )
      fail(
        "Relaciona el curso con carreras incluidas en el perfil de admisión.",
      );
    if (c.institutions?.some((i) => i !== p.institution))
      fail(
        "La universidad del curso debe coincidir con la convocatoria de admisión.",
      );
  }
  if (
    !c.activities?.length ||
    !c.activities.some((a) => a.required) ||
    new Set(c.activities.map((a) => a.id)).size !== c.activities.length
  )
    fail("Añade actividades y al menos una requerida.");
  for (const a of c.activities) {
    if (
      !a.id ||
      !a.title?.trim() ||
      !["text", "link", "simulator"].includes(a.kind)
    )
      fail("Revisa las actividades.");
    if (a.kind === "simulator") {
      const s = await published(
        u,
        "simulator",
        a.simulatorId!,
        a.simulatorVersion!,
      );
      if (
        !["submit", "score"].includes(a.completion) ||
        (a.completion === "score" &&
          (!Number.isFinite(a.target) || a.target! < 0 || a.target! > 100))
      )
        fail("Define cómo se completa el simulador.");
      if (
        c.type === "admission" &&
        (s.purpose !== "admission" ||
          s.profileId !== c.profileId ||
          s.profileVersion !== c.profileVersion)
      )
        fail("El simulador debe corresponder a la misma convocatoria.");
    } else if (
      a.completion !== "read" ||
      !a.content?.trim() ||
      (a.kind === "link" && !/^https:\/\//.test(a.content))
    )
      fail("Completa la lectura o un enlace HTTPS y confirmación de lectura.");
  }
}
export async function saveTraining(u: User, kind: string, input: any) {
  admin(u);
  return await tx(async () => {
    if (!input || typeof input !== "object") fail("Contenido inválido.");
    const mutationId = createHash("sha256")
      .update(JSON.stringify([u.id, kind, input]))
      .digest("hex");
    const replay = (await db
      .prepare("SELECT result FROM training_mutations WHERE id=?")
      .get(mutationId)) as any;
    if (replay) {
      const saved = JSON.parse(replay.result);
      const current = (await rows(u, kind)).find(x => x.id === saved.id && x.version === saved.version);
      if (current && current.revision === saved.revision && current.status === saved.status) return current;
      fail("Este contenido cambió después del guardado. Recarga antes de continuar.", 409);
    }
    const old = input.id
      ? (await rows(u, kind)).find(
          (x) => x.id === input.id && x.version === input.version,
        )
      : null;
    if (input.id && input.version > 0 && !old)
      fail("Esta versión ya no está disponible. Recarga el catálogo.", 409);
    if (old && old.revision !== input.revision)
      fail("Otra sesión cambió este contenido. Recarga antes de guardar.", 409);
    if (old?.status === "published" || old?.status === "archived")
      fail("Crea una nueva versión para modificar contenido publicado.", 409);
    const max = input.id
      ? (
          (await db
            .prepare("SELECT MAX(version) n FROM training_entities WHERE id=?")
            .get(input.id)) as any
        ).n || 0
      : 0;
    const e = {
      ...input,
      id: old?.id || input.id || randomUUID(),
      version: old?.version || max + 1,
      revision: (old?.revision || 0) + 1,
    };
    if (
      input.id &&
      !old &&
      max &&
      !(await rows(u, kind)).some((x) => x.id === input.id)
    )
      fail("Contenido no disponible.", 403);
    await validate(u, kind, e);
    if (kind === "simulator")
      e.questions = e.questions.map((q: any) => ({
        ...q,
        bankId: q.bankId || q.id,
        bankVersion: q.bankVersion || e.version,
      }));
    await validate(u, kind, e);
    if (kind === "simulator" && e.status === "published") {
      if ((await rows(u, kind)).some(x => x.id === e.id && x.version > e.version && x.status !== "draft"))
        fail("Hay una versión más reciente. Crea una nueva versión antes de publicar.", 409);
      for (const previous of (await rows(u, kind)).filter(x => x.id === e.id && x.version !== e.version && x.status === "published")) {
        previous.status = "archived";
        previous.revision++;
        await db.prepare("UPDATE training_entities SET status=?,content=?,revision=? WHERE id=? AND version=?")
          .run(previous.status, JSON.stringify(previous), previous.revision, previous.id, previous.version);
      }
    }
    await db
      .prepare(
        "INSERT INTO training_entities VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(id,version) DO UPDATE SET status=excluded.status,revision=excluded.revision,content=excluded.content",
      )
      .run(
        e.id,
        e.version,
        u.institutionId || "",
        kind,
        e.status,
        e.revision,
        JSON.stringify(e),
        now(),
      );
    await audit(u, "Guardar " + kind, e.id, {
      version: e.version,
      status: e.status,
    });
    await db
      .prepare("INSERT INTO training_mutations VALUES(?,?)")
      .run(mutationId, JSON.stringify(e));
    return e;
  });
}
async function enrollment(u: User, id: string) {
  const r = (await db
    .prepare(
      "SELECT e.*,u.institutionId FROM training_enrollments e JOIN users u ON u.id=e.user_id WHERE e.id=?",
    )
    .get(id)) as any;
  if (
    !r ||
    (u.role === "student" && r.user_id !== u.id) ||
    (u.role !== "student" &&
      (u.role !== "admin" || r.institutionId !== u.institutionId))
  )
    fail("Inscripción no disponible.", 404);
  return r;
}
async function progress(e: any) {
  const course = JSON.parse(e.snapshot) as Course,
    done = (
      (await db
        .prepare(
          "SELECT activity_id FROM training_completions WHERE enrollment_id=?",
        )
        .all(e.id)) as any[]
    ).map((x) => x.activity_id);
  const attempts = (await db
    .prepare(
      "SELECT * FROM training_attempts WHERE enrollment_id=? AND state='graded' ORDER BY started_at,id",
    )
    .all(e.id)) as any[];
  const groups = new Map<string, any>();
  let latestResult: any = null;
  for (const a of attempts) {
    const r = await resultFor(a.id),
      sim = JSON.parse(a.snapshot) as Simulator;
    if (!r || r.percent == null) continue;
    latestResult = { percent: r.percent, mode: a.mode, attemptId: a.id };
    const key = [a.activity_id, a.mode, sim.id, sim.version].join(":");
    const g = groups.get(key) || {
      activityId: a.activity_id,
      mode: a.mode,
      version: sim.version,
      policy: sim.gradePolicy,
      values: [],
    };
    g.values.push(r.percent);
    groups.set(key, g);
  }
  const grades = [...groups.values()].map((g) => ({
    ...g,
    count: g.values.length,
    percent: principalGrade(g.values, g.policy),
  }));
  return {
    ...e,
    snapshot: course,
    origin: JSON.parse(e.origin),
    progress: courseProgress(course.activities, done),
    completed: done,
    next:
      course.activities.find((a) => a.required && !done.includes(a.id)) || null,
    grades,
    latestResult,
  };
}
async function recommendations(u: User) {
  if (u.role !== "student") return [];
  let report: any;
  try { report = await ensureGuidance(u); }
  catch (error: any) { if (error.status === 409) return []; throw error; }
  const recs = [
    ...(report.readiness?.universidad?.ready ? report.analysis?.recommendations || [] : []),
    ...schoolPreparationRecommendations(report),
  ].map((r: any) => ({...r, resultId: report.id,
    testVersions: report.instruments.map((i: any) => ({id: i.instrumentId, version: i.version})),
    mappingVersion: report.mappingVersion, reportVersion: report.version}));
  return recs.filter((r: any, i: number) => recs.findIndex((x: any) => x.careerId === r.careerId) === i);
}
function matchesRecommendations(course: Course, recs: any[]) {
  return recs.some(r => trainingTargetMatches(course.careerIds,r.careerId)) ||
    trainingCatalog().careers.some(c => course.fields.includes(c.area) && recs.some(r => r.careerId === c.id));
}
export async function trainingState(u: User) {
  await expireTraining();
  const catalog = trainingCatalog();
  if (u.role === "admin")
    return {
      courses: await rows(u, "course"),
      simulators: await rows(u, "simulator"),
      profiles: await rows(u, "profile"),
      ...catalog,
      enrollments: await Promise.all(
        (
          (await db
            .prepare(
              "SELECT e.*,u.name FROM training_enrollments e JOIN users u ON u.id=e.user_id WHERE u.institutionId=?",
            )
            .all(u.institutionId || "")) as any[]
        ).map(progress),
      ),
      attempts: await Promise.all(
        (
          (await db
            .prepare(
              "SELECT a.*,u.name FROM training_attempts a JOIN users u ON u.id=a.user_id WHERE u.institutionId=? ORDER BY a.started_at DESC",
            )
            .all(u.institutionId || "")) as any[]
        ).map(async (a) => await attemptView(u, a)),
      ),
      users: await db
        .prepare(
          "SELECT id,name FROM users WHERE institutionId=? AND role='student' AND status='Activo'",
        )
        .all(u.institutionId || ""),
      audit: await db
        .prepare(
          "SELECT * FROM training_audit WHERE org=? ORDER BY created_at DESC LIMIT 100",
        )
        .all(u.institutionId || ""),
    };
  student(u);
  const readiness = await assessmentReadiness(u);
  const educationLevel=await studentEducationLevel(u);
  const recs = await recommendations(u),
    goal = (await document(u.id, "training:goal", {
      careerIds: [],
      fields: [],
    })) as TrainingGoal,
    courses = unique((await rows(u, "course")).filter((c) => canRead(c, u) && readiness[preparationLevel(c.careerIds,c.educationLevel)].ready && matchesRecommendations(c,recs))),
    enrollments = await Promise.all(
      (
        (await db
          .prepare("SELECT * FROM training_enrollments WHERE user_id=?")
          .all(u.id)) as any[]
      ).map(progress),
    );
  return {
    ...catalog,
    educationLevel,
    source:educationLevel==='bachillerato'?schoolCatalogSource:catalog.source,
    institutions:educationLevel==='bachillerato'?[]:catalog.institutions,
    careers:catalog.careers.filter(c=>preparationLevel([c.id])===educationLevel),
    simulators: unique((await rows(u, "simulator")).filter((s) => s.status !== "draft"))
      .filter(
        (s: Simulator) =>
          s.status === "published" && recs.some(r=>trainingTargetMatches(simulatorCareerIds(s,courses),r.careerId)),
      )
      .map((s: Simulator) => ({
        id: s.id,
        version: s.version,
        title: s.title,
        careerIds: simulatorCareerIds(s, courses),
        instrument: { id: s.id, version: String(s.version), title: s.title,
          description: s.instrument.description, source: s.instrument.source,
          presentation: s.instrument.presentation,
          options: [], questions: [] },
        modes: s.modes,
        durationMinutes: s.durationMinutes,
        practiceDurationMinutes: s.practiceDurationMinutes ?? s.durationMinutes,
        maxAttempts: s.maxAttempts,
        gradePolicy: s.gradePolicy,
        feedback: s.feedback,
        questionCount:
          s.selection === "random"
            ? s.quotas.reduce((n, q) => n + q.count, 0)
            : s.questions.length,
      })),
    profiles: (await rows(u, "profile")).filter(
      (p) => p.status === "published" && readiness.universidad.ready && p.careerIds.some((id: string) => recs.some((r: any) => r.careerId === id)),
    ),
    recommendations: recs,
    readiness,
    goal,
    enrollments,
    courses: courses
      .map((c) => {
        const direct = c.careerIds.filter((id: string) =>
            recs.some((r) => r.careerId === id),
          ),
          chosen = c.careerIds.filter((id: string) =>
            goal.careerIds.includes(id),
          ),
          field = c.fields.some(
            (f: string) =>
              goal.fields.includes(f) ||
              catalog.careers.some(
                (career) =>
                  career.area === f &&
                  (goal.careerIds.includes(career.id) ||
                    recs.some((r) => r.careerId === career.id)),
              ),
          );
        const exact = matchesCourseProfile(c, goal);
        const reasons = [
          ...chosen.map(
            (id: string) =>
              "Relacionado con tu objetivo: " +
              catalog.careers.find((x) => x.id === id)?.name,
          ),
          ...direct.map(
            (id: string) =>
              "Relacionado con " +
              catalog.careers.find((x) => x.id === id)?.name +
              ", una carrera de tu informe",
          ),
          ...(field
            ? [
                "Preparación del área relacionada con tus objetivos o tu informe",
              ]
            : []),
        ];
        return {
          ...c,
          reasons: exact ? reasons : [],
          recommended: exact && reasons.length > 0,
          rank:
            (enrollments.some((e) => e.course_id === c.id) ? 100 : 0) +
            chosen.length * 10 +
            (exact && c.type === "admission" ? 5 : 0) +
            direct.length * 2 +
            (field ? 1 : 0),
        };
      })
      .sort((a, b) => b.rank - a.rank),
    attempts: await Promise.all(
      (
        (await db
          .prepare(
            "SELECT * FROM training_attempts WHERE user_id=? ORDER BY started_at DESC",
          )
          .all(u.id)) as any[]
      ).map(async (a) => await attemptView(u, a)),
    ),
  };
}
export async function enroll(u: User, id: string, studentId?: string) {
  return await tx(async () => {
    let target = u;
    if (studentId) {
      admin(u);
      const row = (await db
        .prepare(
          "SELECT * FROM users WHERE id=? AND institutionId=? AND role='student'",
        )
        .get(studentId, u.institutionId || "")) as any;
      if (!row) fail("Estudiante no disponible.", 404);
      target = publicUser(row);
    } else student(u);
    const prior = (await db
      .prepare(
        "SELECT * FROM training_enrollments WHERE user_id=? AND course_id=?",
      )
      .get(target.id, id)) as any;
    if (prior) {
      const saved = JSON.parse(prior.snapshot);
      await requireCompletedAssessments(target, preparationLevel(saved.careerIds,saved.educationLevel));
      return await progress(prior);
    }
    const c = (await rows(u, "course")).find(
      (x) => x.id === id && canRead(x, target),
    );
    if (!c) fail("Curso no disponible para esta cuenta.", 403);
    await requireCompletedAssessments(target, preparationLevel(c.careerIds,c.educationLevel));
    if (!matchesRecommendations(c,await recommendations(target))) fail("El curso no corresponde a los resultados vocacionales publicados.",403);
    const origin = {
      assignedBy: studentId ? u.id : null,
      recommendations: (await recommendations(target)).filter((r) =>
        c.careerIds.includes(r.careerId),
      ),
      goal: await document(target.id, "training:goal", null),
    };
    const e = {
      id: randomUUID(),
      user_id: target.id,
      course_id: c.id,
      course_version: c.version,
      snapshot: JSON.stringify(c),
      origin: JSON.stringify(origin),
      created_at: now(),
    };
    await db
      .prepare("INSERT INTO training_enrollments VALUES(?,?,?,?,?,?,?)")
      .run(...Object.values(e));
    await audit(u, "Inscribir", e.id, { studentId: target.id });
    return await progress(e);
  });
}
export async function attempt(u: User, id: string) {
  const r = (await db
    .prepare(
      "SELECT a.*,u.institutionId FROM training_attempts a JOIN users u ON u.id=a.user_id WHERE a.id=?",
    )
    .get(id)) as any;
  if (
    !r ||
    (u.role === "student" && r.user_id !== u.id) ||
    (u.role !== "student" &&
      (u.role !== "admin" || r.institutionId !== u.institutionId))
  )
    fail("Intento no disponible.", 404);
  return r;
}
async function resultFor(id: string) {
  const r = (await db
    .prepare(
      "SELECT * FROM training_results WHERE attempt_id=? ORDER BY revision DESC LIMIT 1",
    )
    .get(id)) as any;
  return r ? { ...JSON.parse(r.result), revision: r.revision } : null;
}
export async function attemptView(u: User, a: any) {
  const s = JSON.parse(a.snapshot) as Simulator;
  const safe = academicInstrument(s);
  safe.options = safe.options.map(({ points, contributions, ...o }) => o);
  safe.questions = safe.questions.map((q) => {
    const {
      correctValues,
      acceptedTexts,
      numericKey,
      rubric,
      explanation,
      partialCredit,
      incorrectPenalty,
      rankingPoints,
      ...rest
    } = q;
    return {
      ...rest,
      options: q.options?.map(({ points, contributions, ...o }) => o),
    };
  });
  return {
    id: a.id,
    user_id: a.user_id,
    name:
      a.name ||
      (await db.prepare("SELECT name FROM users WHERE id=?").get(a.user_id))
        ?.name,
    enrollment_id: a.enrollment_id,
    activity_id: a.activity_id,
    mode: a.mode,
    state: a.state,
    started_at: a.started_at,
    expires_at: a.expires_at,
    closed_at: a.closed_at,
    finished_at: a.closed_at,
    simulator: { id: s.id, version: s.version, title: s.title, educationLevel:preparationLevel(s.careerIds,s.educationLevel) },
    serverTime: now(),
    revision: a.revision,
    instrument: safe,
    answers: JSON.parse(a.answers),
    flags: JSON.parse(a.flags),
    result: await resultFor(a.id),
    resultHistory: await db
      .prepare(
        "SELECT revision,reason,created_at FROM training_results WHERE attempt_id=? ORDER BY revision DESC",
      )
      .all(a.id),
    feedback: s.feedback,
    gradePolicy: s.gradePolicy,
    error: a.error,
    ...(u.role === "admin" ? { privateQuestions: s.questions } : {}),
    explanations:
      a.state === "graded"
        ? s.questions.map((q) => ({ id: q.id, text: q.explanation }))
        : [],
  };
}
export async function startTraining(
  u: User,
  eid: string,
  aid: string,
  mode: string,
) {
  student(u);
  await expireTraining();
  return await tx(async () => {
    const e = await enrollment(u, eid),
      c = JSON.parse(e.snapshot) as Course,
      a = c.activities.find((a) => a.id === aid);
    if (!a || a.kind !== "simulator") fail("Actividad no disponible.");
    await requireCompletedAssessments(u, preparationLevel(c.careerIds,(c as any).educationLevel));
    const existing = (await db
      .prepare(
        "SELECT * FROM training_attempts WHERE user_id=? AND enrollment_id=? AND activity_id=? AND mode=? AND state IN ('in_progress','recoverable')",
      )
      .get(u.id, eid, aid, mode)) as any;
    if (existing) return await attemptView(u, existing);
    const s = (await entity(
      u,
      "simulator",
      a.simulatorId!,
      a.simulatorVersion!,
    )) as Simulator;
    if (!s.modes.includes(mode as any)) fail("Modo no habilitado.");
    const count = (
      (await db
        .prepare(
          "SELECT COUNT(*) n FROM training_attempts WHERE user_id=? AND enrollment_id=? AND activity_id=? AND mode=?",
        )
        .get(u.id, eid, aid, mode)) as any
    ).n;
    if (count >= s.maxAttempts) fail("Alcanzaste el máximo de intentos.", 409);
    return await createTrainingAttempt(u, eid, aid, mode, s);
  });
}
async function createTrainingAttempt(u: User, eid: string, aid: string, mode: string, s: Simulator) {
    const chosen = {
      ...s,
      questions: selectQuestions(s, () => randomInt(0, 1000000) / 1000000),
    };
    const duration =
      mode === "practice"
        ? (s.practiceDurationMinutes ?? s.durationMinutes)
        : s.durationMinutes;
    const row = {
      id: randomUUID(),
      user_id: u.id,
      enrollment_id: eid,
      activity_id: aid,
      mode,
      snapshot: JSON.stringify(chosen),
      answers: "{}",
      flags: "[]",
      revision: 0,
      state: "in_progress",
      started_at: now(),
      expires_at: duration
        ? new Date(Date.now() + duration * 60000).toISOString()
        : null,
      closed_at: null,
      error: null,
    };
    await db
      .prepare(
        "INSERT INTO training_attempts VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
      )
      .run(...Object.values(row));
    return await attemptView(u, row);
}
/** Direct simulators use an internal enrollment to retain relational integrity.
 * Attempt snapshots stay immutable when an administrator publishes a new version. */
export async function startDirectSimulator(u: User, simulatorId: string, mode: string) {
  student(u);
  await expireTraining();
  return await tx(async () => {
    const s = (await rows(u, "simulator")).find((s) => s.id === simulatorId && s.status !== "draft") as Simulator | undefined;
    if (!s || s.status !== "published" || !s.modes.includes(mode as any))
      fail("Simulador no disponible.", 404);
    const currentLevel=await studentEducationLevel(u);
    const courses = (await rows(u, "course")).filter((c) => canRead(c,u)&&preparationLevel(c.careerIds,c.educationLevel)===currentLevel);
    const careerIds=simulatorCareerIds(s,courses);
    await requireCompletedAssessments(u, preparationLevel(careerIds,s.educationLevel));
    const recs = await recommendations(u);
    if (!recs.some(r=>trainingTargetMatches(careerIds,r.careerId)))
      fail("Este simulador no corresponde a tus carreras recomendadas.", 403);
    const problems = simulatorProblems(s);
    if (problems.length) fail("El simulador necesita revisión: " + problems[0], 409);
    const courseId = "direct:" + s.id;
    let e = await db.prepare("SELECT * FROM training_enrollments WHERE user_id=? AND course_id=?").get(u.id, courseId);
    if (!e) {
      const snapshot = {id: courseId, version: 1, revision: 0, status: "published", title: s.title,
        description: s.instrument.description, objectives: "Autopreparación", level: "General", type: "general",
        careerIds, fields: [], studentIds: [u.id], access: "selected",
        activities: [{id: s.id, module: "Preparación", title: s.title, kind: "simulator", content: "",
          required: true, completion: "submit", simulatorId: s.id, simulatorVersion: s.version}]};
      e = {id: randomUUID(), user_id: u.id, course_id: courseId, course_version: 1,
        snapshot: JSON.stringify(snapshot), origin: JSON.stringify({kind: "direct-simulator"}), created_at: now()};
      await db.prepare("INSERT INTO training_enrollments VALUES(?,?,?,?,?,?,?)").run(...Object.values(e));
    }
    const existing = await db.prepare("SELECT * FROM training_attempts WHERE user_id=? AND enrollment_id=? AND activity_id=? AND mode=? AND state IN ('in_progress','recoverable')").get(u.id, e.id, s.id, mode);
    if (existing) return await attemptView(u, existing);
    const count = await db.prepare("SELECT COUNT(*) n FROM training_attempts WHERE user_id=? AND enrollment_id=? AND activity_id=? AND mode=?").get(u.id, e.id, s.id, mode);
    if (count.n >= s.maxAttempts) fail("Alcanzaste el máximo de intentos.", 409);
    return await createTrainingAttempt(u, e.id, s.id, mode, s);
  });
}
export async function saveTrainingAnswers(u: User, b: any) {
  student(u);
  await expireTraining();
  return await tx(async () => {
    const a = await attempt(u, String(b.id));
    if (a.state !== "in_progress")
      fail("El intento ya no acepta cambios.", 409);
    if (a.revision !== b.revision)
      fail("Hay respuestas más recientes. Recarga el intento.", 409);
    if (
      !b.answers ||
      typeof b.answers !== "object" ||
      Array.isArray(b.answers) ||
      !Array.isArray(b.flags)
    )
      fail("Respuestas inválidas.");
    const s = JSON.parse(a.snapshot) as Simulator,
      t = academicInstrument(s);
    for (const [id, v] of Object.entries(b.answers)) {
      const q = t.questions.find((q) => q.id === id);
      if (!q) fail("Pregunta desconocida.");
      const error = answerProblem(t, q, v, true);
      if (error) fail(error);
    }
    if (b.flags.some((id: string) => !t.questions.some((q) => q.id === id)))
      fail("Marcado no válido.");
    await db
      .prepare(
        "UPDATE training_attempts SET answers=?,flags=?,revision=revision+1 WHERE id=?",
      )
      .run(JSON.stringify(b.answers), JSON.stringify(b.flags), a.id);
    return await attemptView(u, await attempt(u, a.id));
  });
}
async function completeActivity(eid: string, aid: string, evidence: any) {
  await db
    .prepare(
      "INSERT INTO training_completions VALUES(?,?,?,?) ON CONFLICT(enrollment_id,activity_id) DO NOTHING",
    )
    .run(eid, aid, JSON.stringify(evidence), now());
}
async function applyProgress(a: any, r: any) {
  const e = (await db
      .prepare("SELECT * FROM training_enrollments WHERE id=?")
      .get(a.enrollment_id)) as any,
    c = JSON.parse(e.snapshot) as Course,
    activity = c.activities.find((x) => x.id === a.activity_id)!;
  const candidates = (await db
    .prepare(
      "SELECT id FROM training_attempts WHERE enrollment_id=? AND activity_id=? AND state IN ('graded','pending-review')",
    )
    .all(e.id, activity.id)) as any[];
  const passed = await asyncSome(candidates, async (x) => {
    const v = await resultFor(x.id);
    return (
      v &&
      (activity.completion === "submit" ||
        (v.state === "complete" && v.percent >= activity.target!))
    );
  });
  if (passed)
    await completeActivity(e.id, activity.id, {
      attemptId: a.id,
      resultRevision: r.revision || 1,
    });
  else
    await db
      .prepare(
        "DELETE FROM training_completions WHERE enrollment_id=? AND activity_id=?",
      )
      .run(e.id, activity.id);
}
async function closeInner(a: any) {
  const prior = await resultFor(a.id);
  if (prior) return prior;
  const s = JSON.parse(a.snapshot) as Simulator,
    answers = JSON.parse(a.answers);
  if (a.mode === "practice" && s.feedback === "question") {
    const first = (await db
      .prepare(
        "SELECT * FROM training_feedback WHERE attempt_id=? AND sequence=1",
      )
      .all(a.id)) as any[];
    for (const f of first) answers[f.question_id] = JSON.parse(f.answer);
  }
  const result = {
    ...academicResult(s, answers),
    mode: a.mode,
    answers,
    simulatorId: s.id,
    simulatorVersion: s.version,
    gradeBasis:
      a.mode === "practice" && s.feedback === "question"
        ? "first-confirmed-answer"
        : "submitted-answers",
  };
  await db
    .prepare("INSERT INTO training_results VALUES(?,?,?,?,?,?,?)")
    .run(a.id, 1, JSON.stringify(result), "{}", "Entrega", now(), null);
  await db
    .prepare(
      "UPDATE training_attempts SET state=?,closed_at=?,error=NULL WHERE id=?",
    )
    .run(
      result.state === "pending-review" ? "pending-review" : "graded",
      now(),
      a.id,
    );
  await applyProgress(a, result);
  return result;
}
export async function expireTraining() {
  const expired = (await db
    .prepare(
      "SELECT * FROM training_attempts WHERE state='in_progress' AND expires_at IS NOT NULL AND expires_at<=?",
    )
    .all(now())) as any[];
  for (const a of expired) {
    try {
      await tx(async () => await closeInner(a));
    } catch {
      await db
        .prepare(
          "UPDATE training_attempts SET state='recoverable',error=? WHERE id=?",
        )
        .run(
          "No se pudo calcular. Las respuestas están conservadas; reintenta la entrega.",
          a.id,
        );
    }
  }
}
export async function finishTraining(u: User, id: string) {
  student(u);
  await expireTraining();
  return await tx(async () => {
    const a = await attempt(u, id);
    if (
      !["in_progress", "recoverable", "graded", "pending-review"].includes(
        a.state,
      )
    )
      fail("Intento no válido.");
    await closeInner(a);
    return await attemptView(u, await attempt(u, id));
  });
}
export async function trainingFeedback(u: User, b: any) {
  student(u);
  await expireTraining();
  return await tx(async () => {
    const a = await attempt(u, String(b.id)),
      s = JSON.parse(a.snapshot) as Simulator;
    if (
      a.state !== "in_progress" ||
      a.mode !== "practice" ||
      s.feedback !== "question"
    )
      fail("La solución aún no está disponible.", 403);
    const q = s.questions.find((q) => q.id === b.questionId);
    if (!q) fail("Pregunta no disponible.");
    const v = JSON.parse(a.answers)[q.id];
    if (absent(v))
      fail("Guarda una respuesta antes de consultar la explicación.");
    const sequence =
      (
        (await db
          .prepare(
            "SELECT MAX(sequence) n FROM training_feedback WHERE attempt_id=? AND question_id=?",
          )
          .get(a.id, q.id)) as any
      ).n || 0;
    await db
      .prepare("INSERT INTO training_feedback VALUES(?,?,?,?,?)")
      .run(a.id, q.id, sequence + 1, JSON.stringify(v), now());
    return {
      explanation: q.explanation,
      sequence: sequence + 1,
      note: "La calificación usa la primera respuesta confirmada.",
    };
  });
}
export async function trainingReview(u: User, b: any) {
  admin(u);
  return await tx(async () => {
    const a = await attempt(u, String(b.id));
    if (
      !["graded", "pending-review", "annulled"].includes(a.state) ||
      !b.reason?.trim()
    )
      fail("Selecciona un intento entregado y documenta el motivo.");
    const previousRow = (await db
        .prepare(
          "SELECT * FROM training_results WHERE attempt_id=? ORDER BY revision DESC LIMIT 1",
        )
        .get(a.id)) as any,
      previous = await resultFor(a.id);
    if (b.revision !== previous.revision)
      fail(
        "Otro administrador revisó el resultado. Recarga antes de modificarlo.",
        409,
      );
    const original = JSON.parse(a.snapshot) as Simulator,
      reviews = b.reviews ?? JSON.parse(previousRow.reviews),
      annulled = b.annulled ?? previous.annulled ?? [];
    if (
      !Array.isArray(annulled) ||
      annulled.some(
        (id: string) => !original.questions.some((q) => q.id === id),
      )
    )
      fail("Preguntas anuladas no válidas.");
    for (const [qid, rs] of Object.entries(reviews)) {
      const q = original.questions.find((q) => q.id === qid);
      for (const [rid, lid] of Object.entries(rs as any)) {
        if (
          !q?.rubric?.some(
            (r) => r.id === rid && r.levels.some((l) => l.id === lid),
          )
        )
          fail("Nivel de rúbrica inválido.");
      }
    }
    const filtered = {
      ...original,
      questions: original.questions.filter((q) => !annulled.includes(q.id)),
    };
    // Exclude annulled questions from their area denominator. An empty weighted area cannot be silently reweighted.
    const impossible =
      !filtered.questions.length ||
      original.areaWeights.some(
        (w) =>
          !filtered.questions.some(
            (q) => (q.topic || q.section || "General") === w.area,
          ),
      );
    const calculated = impossible
      ? {
          ...previous,
          state: "annulled",
          percent: null,
          raw: 0,
          max: 0,
          areas: [],
          note: "Intento anulado: no queda un máximo evaluable en todas las áreas. No interviene en la nota principal.",
        }
      : academicResult(filtered, previous.answers, reviews);
    const result = {
      ...calculated,
      mode: a.mode,
      answers: previous.answers,
      simulatorId: original.id,
      simulatorVersion: original.version,
      gradeBasis: previous.gradeBasis,
      annulled,
      annulmentPolicy:
        "Excluir preguntas anuladas del máximo de su área; si un área queda vacía, anular el intento completo.",
      reviews,
    };
    await db
      .prepare("INSERT INTO training_results VALUES(?,?,?,?,?,?,?)")
      .run(
        a.id,
        previous.revision + 1,
        JSON.stringify(result),
        JSON.stringify(reviews),
        b.reason,
        now(),
        u.id,
      );
    await db
      .prepare("UPDATE training_attempts SET state=? WHERE id=?")
      .run(
        result.state === "annulled"
          ? "annulled"
          : result.state === "pending-review"
            ? "pending-review"
            : "graded",
        a.id,
      );
    await applyProgress(a, { ...result, revision: previous.revision + 1 });
    await audit(u, "Revisar resultado", a.id, {
      reason: b.reason,
      revision: previous.revision + 1,
      annulled,
    });
    return await attemptView(u, await attempt(u, a.id));
  });
}
export async function trainingAction(
  u: User,
  path: string,
  method: string,
  b: any,
  query: URLSearchParams,
): Promise<any> {
  if (path === "training/catalog/preview" && method === "POST") {
    admin(u);
    const diff = previewCatalog(b.input),
      id = randomUUID();
    await put(u.id, "training:catalog:" + id, {
      input: b.input,
      baseVersion: diff.baseVersion,
    });
    return { ...diff, id };
  }
  if (path === "training/catalog/apply" && method === "POST") {
    admin(u);
    const staged = (await document(
      u.id,
      "training:catalog:" + String(b.id),
      null,
    )) as any;
    if (!staged) fail("Genera primero una vista previa.", 404);
    const result = await applyCatalog(staged.input, staged.baseVersion, u.id);
    await audit(u, "Actualizar catálogo CES", result.version, {
      added: result.added.length,
      changed: result.changed.length,
    });
    await put(u.id, "training:catalog:" + String(b.id), null);
    return result;
  }
  if (path === "training" && method === "GET") return await trainingState(u);
  if (path === "training/entity" && method === "POST")
    return await saveTraining(u, b.kind, b.entity);
  if (path === "training/delete-simulator" && method === "POST") {
    admin(u);
    return await tx(async () => {
      const e = await entity(u, "simulator", b.id, b.version);
      if (e.revision !== b.revision)
        fail("El simulador cambió. Actualiza el catálogo.", 409);
      await db
        .prepare(
          "DELETE FROM training_entities WHERE id=? AND kind='simulator'",
        )
        .run(e.id);
      await db
        .prepare(
          "DELETE FROM training_mutations WHERE json_extract(result,'$.id')=?",
        )
        .run(e.id);
      await audit(u, "Eliminar simulador", e.id, { version: e.version });
      return { ok: true };
    });
  }
  if (path === "training/delete-draft" && method === "POST") {
    admin(u);
    return await tx(async () => {
      const e = await entity(u, b.kind, b.id, b.version);
      if (e.status !== "draft" || e.revision !== b.revision)
        fail(
          "Solo se puede descartar un borrador sin cambios de otra sesión.",
          409,
        );
      await db
        .prepare("DELETE FROM training_entities WHERE id=? AND version=?")
        .run(e.id, e.version);
      await db
        .prepare(
          "DELETE FROM training_mutations WHERE json_extract(result,'$.id')=? AND json_extract(result,'$.version')=?",
        )
        .run(e.id, e.version);
      await audit(u, "Descartar borrador", e.id, { version: e.version });
      return { ok: true };
    });
  }
  if (["training/archive", "training/restore"].includes(path) && method === "POST") {
    admin(u);
    return await tx(async () => {
      const e = await entity(u, b.kind, b.id, b.version);
      if (e.revision !== b.revision)
        fail("El contenido cambió. Actualiza el catálogo antes de continuar.", 409);
      const restoring = path === "training/restore";
      if (restoring) {
        if (e.status !== "archived") fail("Solo se puede restaurar contenido archivado.", 409);
        if ((await rows(u, b.kind)).some(x => x.id === e.id && x.version > e.version && x.status !== "draft"))
          fail("Hay una versión más reciente. Edítala o crea una nueva versión.", 409);
        await validate(u, b.kind, { ...e, status: "published" });
      } else if (e.status !== "published") {
        fail("Solo se puede archivar contenido publicado.", 409);
      }
      e.status = restoring ? "published" : "archived";
      e.revision++;
      await db
        .prepare(
          "UPDATE training_entities SET status=?,content=?,revision=? WHERE id=? AND version=?",
        )
        .run(e.status, JSON.stringify(e), e.revision, e.id, e.version);
      await audit(u, restoring ? "Restaurar" : "Archivar", e.id, { version: e.version });
      return e;
    });
  }
  if (path === "training/enroll" && method === "POST")
    return await enroll(u, String(b.courseId), b.studentId);
  if (path === "training/goal" && method === "PUT") {
    student(u);
    const cat = trainingCatalog(),level=await studentEducationLevel(u);
    cat.careers=cat.careers.filter(c=>preparationLevel([c.id])===level);
    if (
      !Array.isArray(b.careerIds) ||
      b.careerIds.some((id: string) => !cat.careers.some((c) => c.id === id)) ||
      !Array.isArray(b.fields) ||
      b.fields.some((f: string) => !cat.careers.some((c) => c.area === f))
    )
      fail("Objetivo inválido.");
    if (b.profileId)
      await published(u, "profile", b.profileId, b.profileVersion);
    await put(u.id, "training:goal", b);
    return { ok: true };
  }
  if (path === "training/read" && method === "POST") {
    student(u);
    const e = await enrollment(u, b.enrollmentId),
      a = (JSON.parse(e.snapshot) as Course).activities.find(
        (a) => a.id === b.activityId,
      );
    if (!a || a.kind === "simulator") fail("Actividad no válida.");
    await completeActivity(e.id, a.id, { kind: "confirmed-reading" });
    return await progress(e);
  }
  if (path === "training/simulator/start" && method === "POST")
    return await startDirectSimulator(u, String(b.simulatorId), b.mode);
  if (path === "training/start" && method === "POST")
    return await startTraining(u, b.enrollmentId, b.activityId, b.mode);
  if (path === "training/answers" && method === "PUT")
    return await saveTrainingAnswers(u, b);
  if (path === "training/finish" && method === "POST")
    return await finishTraining(u, b.id);
  if (path === "training/feedback" && method === "POST")
    return await trainingFeedback(u, b);
  if (path === "training/review" && method === "POST")
    return await trainingReview(u, b);
  if (path === "training/attempt" && method === "GET") {
    await expireTraining();
    return await attemptView(u, await attempt(u, query.get("id") || ""));
  }
  if (path === "training/preview/select" && method === "POST") {
    admin(u);
    await validate(u, "simulator", { ...b.simulator, status: "published" });
    return {
      ...b.simulator,
      selection: "fixed",
      questions: selectQuestions(
        b.simulator,
        () => randomInt(0, 1000000) / 1000000,
      ),
    };
  }
  if (path === "training/preview" && method === "POST") {
    admin(u);
    const errors = simulatorProblems(b.simulator);
    if (errors.length) fail(errors.join(" "));
    return {
      ...academicResult(b.simulator, b.answers || {}),
      persisted: false,
    };
  }
  fail("Operación de cursos no encontrada.", 404);
}

// A persistent Node deployment expires attempts even when all browser tabs are closed.
const timerGlobal = globalThis as typeof globalThis & {
  trainingExpiryTimer?: ReturnType<typeof setInterval>;
};
if (
  process.env.NEXT_PHASE !== "phase-production-build" &&
  !timerGlobal.trainingExpiryTimer
) {
  timerGlobal.trainingExpiryTimer = setInterval(async () => {
    try {
      await expireTraining();
    } catch {}
  }, 5000);
  timerGlobal.trainingExpiryTimer.unref();
}
