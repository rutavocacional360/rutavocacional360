import { nameProblem, emailProblem, textProblem, settingsProblem, studentDocumentProblem } from "../validation";
import { ecuadorCareers, careerOffers, catalogSource } from "./ecuador-catalog";
import { calculateTest } from "@/components/kit/lib/test-engine";
import { validateDraft, instrumentFor, battery } from "./battery";
import { contentProblem } from "@/components/kit/lib/content-fields";
import { labSettingsProblem } from "@/components/kit/data/lab-settings";
import { randomUUID, randomBytes } from "node:crypto";
import {
  instruments,
  dimensionScores,
  answerKey,
} from "@/components/kit/data/instruments";
import {
  db,
  fail,
  document,
  put,
  shared,
  assigned,
  validateTest,
  passwordHash,
} from "./store";
import { asyncSome } from "@/lib/server/async-collections";

export async function saveDocument(
  user: any,
  key: string,
  value: any,
  revision?: number,
) {
  return db.transaction(() => saveDocumentInner(user, key, value, revision));
}

async function saveDocumentInner(
  user: any,
  key: string,
  value: any,
  revision?: number,
) {
  if (
    typeof key !== "string" ||
    !key.startsWith("rv360:") ||
    key.length > 160 ||
    value === undefined ||
    JSON.stringify(value).length > 1500000
  )
    fail("Datos no válidos.");
  if (
    [
      "rv360:adult",
      "rv360:submissions",
      "rv360:versions",
      "rv360:audit",
      "rv360:published-content",
      "rv360:imports",
      "rv360:battery",
      "rv360:email-change",
      "rv360:profile",
    ].includes(key)
  )
    fail(
      "Este registro solo puede modificarse mediante su operación autorizada.",
      403,
    );
  if (key.startsWith("rv360:answers:")) {
    if (user.role !== "student")
      fail("Solo estudiantes pueden responder.", 403);
    await validateDraft(user, key, value);
  }
  const isShared = shared(key);
  if (isShared && user.role !== "admin")
    fail("Solo administración puede modificar este apartado.", 403);
  const studentProblem = studentDocumentProblem(key, value);
  if (studentProblem) fail(studentProblem);
  const owner = isShared ? "institution:" + user.institutionId : user.id;
  const old = (await db
    .prepare("SELECT revision FROM documents WHERE owner=? AND key=?")
    .get(owner, key)) as any;
  if (revision !== undefined && (old?.revision || 0) !== revision)
    fail(
      "Este apartado cambió en otra sesión. Recarga para revisar la versión actual.",
      409,
    );
  if (key === "rv360:admin-content") {
    const problem = contentProblem(value);
    if (problem) fail(problem);
  }
  if (key === "rv360:admin-lab-settings") {
    const problem = labSettingsProblem(value);
    if (problem) fail(problem);
  }
  if (key === "rv360:custom-tests") {
    if (!Number.isInteger(revision))
      fail("Recarga el catálogo antes de guardar.", 409);
    if (
      !Array.isArray(value) ||
      new Set(value.map((t) => t?.id)).size !== value.length
    )
      fail("Catálogo no válido: revisa los identificadores únicos.");
    const previous = await document(owner, key, []);
    if (
      previous.some(
        (p: any) =>
          (p.publishedAt || p.status === "Publicado") &&
          !value.some((t: any) => t.id === p.id),
      )
    )
      fail("Archiva las versiones publicadas; no se pueden eliminar.");
    for (const t of value) {
      validateTest(t);
      if (
        t.studentIds &&
        (!Array.isArray(t.studentIds) ||
          (await asyncSome(
            t.studentIds,
            async (id: any) =>
              !(await db
                .prepare(
                  "SELECT id FROM users WHERE id=? AND institutionId=? AND role='student' AND status='Activo'",
                )
                .get(String(id), user.institutionId)),
          )))
      )
        fail("Revisa los estudiantes seleccionados.");
      if (
        t.status === "Publicado" &&
        t.studentId &&
        !(await db
          .prepare(
            "SELECT id FROM users WHERE id=? AND institutionId=? AND role='student' AND status='Activo'",
          )
          .get(t.studentId, user.institutionId))
      )
        fail("El estudiante seleccionado no está disponible.");
      const prior = previous.find((p: any) => p.id === t.id);
      if (prior?.publishedAt && t.status === "Borrador")
        fail(
          "Una publicación no puede volver a borrador. Crea una nueva versión.",
        );
      if (
        (prior?.status === "Publicado" || prior?.publishedAt) &&
        JSON.stringify({
          ...prior,
          status: "",
          publishedAt: "",
          publishedBy: "",
        }) !==
          JSON.stringify({ ...t, status: "", publishedAt: "", publishedBy: "" })
      )
        fail(
          "Una versión publicada es inmutable. Duplícala para crear una nueva versión.",
        );
      if (prior?.publishedAt) {
        t.publishedAt = prior.publishedAt;
        t.publishedBy = prior.publishedBy;
      }
      if (t.status === "Publicado" && !t.publishedAt) {
        t.publishedAt = new Date().toISOString();
        t.publishedBy = user.id;
        if (t.careerLinks?.length)
          t.careerLinks = t.careerLinks.map((link: any) => {
            const career = ecuadorCareers.find((c) => c.id === link.careerId);
            if (!career)
              fail("Selecciona una carrera válida del catálogo CES.");
            return {
              ...link,
              careerName: career.name,
              sourceUrl: catalogSource.sourceUrl,
              offers: careerOffers([career.id])[career.id],
            };
          });
        if (t.stableId)
          for (const other of value)
            if (
              other.id !== t.id &&
              (other.stableId || other.id) === t.stableId &&
              other.status === "Publicado"
            )
              other.status = "Archivado";
      }
    }
  }
  if (key === "rv360:admin-groups")
    fail("La gestión de grupos fue retirada.", 410);
  if (key === "rv360:admin-users") {
    if (!Array.isArray(value)) fail("Usuarios no válidos.");
    try {
      for (const u of value) {
        if (
          !u || typeof u !== 'object' ||
          nameProblem(u.name) || emailProblem(u.email) || textProblem(u.id,100,true) || textProblem(u.group,100) ||
          !["Estudiante", "Orientador"].includes(u.role) ||
          !["Activo", "Suspendido", "Invitación pendiente"].includes(u.status)
        )
          fail("Revisa los campos del usuario.");
        const existing = (await db
          .prepare("SELECT * FROM users WHERE id=?")
          .get(u.id)) as any;
        if (existing) {
          if (
            existing.institutionId !== user.institutionId ||
            existing.role === "admin"
          )
            fail("No puedes modificar esta cuenta.", 403);
          await db
            .prepare(
              "UPDATE users SET name=?,role=?,groupName=?,status=? WHERE id=?",
            )
            .run(
              u.name,
              u.role === "Estudiante" ? "student" : "orientador",
              u.group,
              u.status,
              u.id,
            );
        } else {
          if (
            await db
              .prepare("SELECT id FROM users WHERE email=?")
              .get(u.email.toLowerCase())
          )
            fail("Ese correo ya está registrado.");
          await db
            .prepare("INSERT INTO users VALUES(?,?,?,?,?,?,?,?)")
            .run(
              u.id,
              u.name,
              u.email.toLowerCase(),
              passwordHash(randomBytes(32).toString("hex")),
              u.role === "Estudiante" ? "student" : "orientador",
              user.institutionId,
              u.group,
              "Invitación pendiente",
            );
        }
      }
    } catch (e) {
      throw e;
    }
  }
  if (key === "rv360:profile") {
    if (typeof value.name !== "string" || value.name.trim().length < 3)
      fail("Escribe tu nombre completo.");
    value.email = user.email;
    await db
      .prepare("UPDATE users SET name=? WHERE id=?")
      .run(value.name.trim(), user.id);
  }
  if (key === "rv360:admin-settings") {
    const problem = settingsProblem(value);
    if (problem) fail(problem);
    const org = (await db
      .prepare("SELECT code FROM institutions WHERE id=?")
      .get(user.institutionId)) as any;
    value.code = org?.code || "";
    if (!value.name?.trim()) fail("Escribe el nombre de la plataforma.");
    await db
      .prepare("UPDATE institutions SET name=? WHERE id=?")
      .run(value.name, user.institutionId);
  }
  await put(owner, key, value);
  if (key.startsWith("rv360:answers:")) {
    const active = (await db
      .prepare(
        "SELECT id,snapshot FROM assessment_attempts WHERE user_id=? AND state='in_progress'",
      )
      .all(user.id)) as any[];
    for (const a of active)
      if (answerKey(JSON.parse(a.snapshot)) === key)
        await db
          .prepare("UPDATE assessment_attempts SET answers=? WHERE id=?")
          .run(JSON.stringify(value), a.id);
  }
  if (isShared)
    await put(
      owner,
      "rv360:audit",
      [
        {
          name: user.name,
          action: "Actualizar",
          entity: key,
          created_at: new Date().toISOString(),
        },
        ...(await document(owner, "rv360:audit", [])),
      ].slice(0, 1000),
    );
  return (
    (await db
      .prepare("SELECT revision FROM documents WHERE owner=? AND key=?")
      .get(owner, key)) as any
  ).revision;
}
export async function submitAssessment(user: any, id: string) {
  await db.exec("BEGIN IMMEDIATE");
  try {
    const result = await submitAssessmentInner(user, id);
    await db.exec("COMMIT");
    return result;
  } catch (e) {
    await db.exec("ROLLBACK");
    throw e;
  }
}
async function submitAssessmentInner(user: any, id: string) {
  if (user.role !== "student")
    fail("Esta operación corresponde a estudiantes.", 403);
  const custom = await document(
    "institution:" + user.institutionId,
    "rv360:custom-tests",
    [],
  );
  const instrument: any = await instrumentFor(user, id);
  if (!instrument) fail("La evaluación no está asignada a tu cuenta.", 403);
  if (
    instrument.availableFrom &&
    new Intl.DateTimeFormat("en-CA", {
      timeZone:
        (
          await document(
            "institution:" + user.institutionId,
            "rv360:admin-settings",
            {},
          )
        ).timezone || "America/Guayaquil",
    }).format(new Date()) < instrument.availableFrom
  )
    fail("Esta evaluación aún no está disponible.");
  if (
    instrument.due &&
    new Intl.DateTimeFormat("en-CA", {
      timeZone:
        (
          await document(
            "institution:" + user.institutionId,
            "rv360:admin-settings",
            {},
          )
        ).timezone || "America/Guayaquil",
    }).format(new Date()) > instrument.due
  )
    fail("El plazo de esta evaluación terminó.");
  const openAttempt = (await db
    .prepare(
      "SELECT * FROM assessment_attempts WHERE user_id=? AND instrument_id=? AND state='in_progress'",
    )
    .get(user.id, id)) as any;
  if (
    openAttempt &&
    instrument.durationMinutes &&
    Date.now() >
      Date.parse(openAttempt.started_at) + instrument.durationMinutes * 60000
  )
    fail("El tiempo de este intento ha terminado.", 409);
  const answers = await document(user.id, answerKey(instrument), {});
  const serialized = JSON.stringify(answers);
  const prior = await db
    .prepare(
      "SELECT id FROM submissions WHERE user_id=? AND instrument_id=? AND version=? AND answers=?",
    )
    .get(user.id, id, instrument.version, serialized);
  if (prior && !openAttempt) return prior;
  const count = (
    (await db
      .prepare(
        "SELECT COUNT(*) n FROM submissions WHERE user_id=? AND instrument_id=? AND version=?",
      )
      .get(user.id, id, instrument.version)) as any
  ).n;
  if (instrument.maxAttempts && count >= instrument.maxAttempts)
    fail("Alcanzaste el número de intentos permitidos.");
  const attempt = (await db
    .prepare(
      "SELECT * FROM assessment_attempts WHERE user_id=? AND instrument_id=? ORDER BY started_at DESC LIMIT 1",
    )
    .get(user.id, id)) as any;
  if (attempt?.state === "submitted") return { id: attempt.submission_id };
  if (instrument.schemaVersion === 2 && !attempt)
    fail("Confirma el inicio del intento antes de responder.");
  const scores = evaluateInstrument(instrument, answers);
  const record = {
    id: randomUUID(),
    user_id: user.id,
    instrument_id: id,
    version: instrument.version,
    answers: serialized,
    scores: JSON.stringify(scores),
    snapshot: JSON.stringify(instrument),
    created_at: new Date().toISOString(),
  };
  await db
    .prepare("INSERT INTO submissions VALUES(?,?,?,?,?,?,?,?)")
    .run(...Object.values(record));
  if (!instruments.some((i) => i.id === instrument.id)) {
    const calculated = calculateTest(instrument, answers);
    await db
      .prepare(
        "INSERT INTO assessment_results(submission_id,revision,result,created_at) VALUES(?,1,?,?)",
      )
      .run(record.id, JSON.stringify(calculated), record.created_at);
  }
  if (attempt)
    await db
      .prepare(
        "UPDATE assessment_attempts SET state='submitted',submission_id=? WHERE id=?",
      )
      .run(record.id, attempt.id);
  return { id: record.id };
}

export function evaluateInstrument(
  instrument: any,
  answers: Record<string, any>,
) {
  if (instruments.some((i) => i.id === instrument.id)) {
    const result = calculateTest(
      { ...instrument, scoring: "dimensions" },
      answers,
    );
    return dimensionScores(instrument, answers).map((s) => ({
      ...s,
      raw: instrument.questions
        .filter((q: any) => q.dimension === s.dimension)
        .reduce((n: number, q: any) => n + answers[q.id], 0),
      percent:
        instrument.id === "autoconocimiento"
          ? Math.round(s.value * 20)
          : undefined,
    }));
  }
  return calculateTest(instrument, answers).scores;
}
