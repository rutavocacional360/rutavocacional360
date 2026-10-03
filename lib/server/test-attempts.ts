import { randomUUID } from "node:crypto";
import { db, document, put, fail, assigned } from "./store";
import { instrumentFor } from "./battery";
import {studentEducationLevel,testMatchesLevel,submissionRoutes} from "./assessment-route";
import { answerKey } from "@/components/kit/data/instruments";
import { calculateTest, Reviews } from "@/components/kit/lib/test-engine";
export async function startTest(user: any, id: string) {
  await db.exec("BEGIN IMMEDIATE");
  try {
    const result = await startTestInner(user, id);
    await db.exec("COMMIT");
    return result;
  } catch (e) {
    await db.exec("ROLLBACK");
    throw e;
  }
}
async function startTestInner(user: any, id: string) {
  if (user.role !== "student")
    fail("Solo estudiantes pueden iniciar un intento.", 403);
  const open = (await db
    .prepare(
      "SELECT * FROM assessment_attempts WHERE user_id=? AND instrument_id=? AND state='in_progress'",
    )
    .get(user.id, id)) as any;
  if (open) {
    const old = JSON.parse(open.snapshot);
    if(!testMatchesLevel(old,await studentEducationLevel(user)))fail("Este intento pertenece a otra ruta educativa. Revisa tu etapa en Mi perfil.",409);
    if (
      !old.durationMinutes ||
      Date.now() <= Date.parse(open.started_at) + old.durationMinutes * 60000
    )
      return open;
    await db
      .prepare("UPDATE assessment_attempts SET state='expired' WHERE id=?")
      .run(open.id);
  }
  const t = await instrumentFor(user, id);
  if (!t) fail("Test no disponible.", 403);
  const catalog = await document(
      "institution:" + user.institutionId,
      "rv360:custom-tests",
      [],
    ),
    entry = catalog.find((x: any) => x.id === id);
  if (entry && !(await assigned(entry, user)))
    fail("No se permiten nuevos intentos de este test.", 403);
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Guayaquil",
  }).format(new Date());
  if ((t.availableFrom && today < t.availableFrom) || (t.due && today > t.due))
    fail("El test está fuera de su plazo de disponibilidad.", 409);
  const stable = t.stableId || id;
  const routeOf=await submissionRoutes(user,await studentEducationLevel(user));
  const count = (await db.prepare('SELECT snapshot,submission_id FROM assessment_attempts WHERE user_id=? AND stable_id=?').all(user.id,stable) as any[]).filter(a=>routeOf({id:a.submission_id,snapshot:a.snapshot})===t.educationLevel).length;
  const historic = (
    (await db
      .prepare(
        "SELECT id,snapshot FROM submissions s WHERE user_id=? AND NOT EXISTS (SELECT 1 FROM assessment_attempts a WHERE a.submission_id=s.id)",
      )
      .all(user.id)) as any[]
  ).filter((s) => {
    const x = JSON.parse(s.snapshot);
    return (x.stableId || x.id) === stable&&routeOf(s)===t.educationLevel;
  }).length;
  if (t.maxAttempts && count + historic >= t.maxAttempts)
    fail("Alcanzaste el límite de intentos de este test.", 409);
  const attempt = {
    id: randomUUID(),
    user_id: user.id,
    instrument_id: id,
    stable_id: stable,
    snapshot: JSON.stringify(t),
    started_at: new Date().toISOString(),
    state: "in_progress",
  };
  await db
    .prepare(
      "INSERT INTO assessment_attempts(id,user_id,instrument_id,stable_id,snapshot,started_at,state) VALUES(?,?,?,?,?,?,?)",
    )
    .run(...Object.values(attempt));
  if (count || historic) await put(user.id, answerKey(t), {});
  return attempt;
}
export async function reviewTest(user: any, body: any) {
  if (user.role !== "admin")
    fail("Solo administración puede revisar rúbricas.", 403);
  const row = (await db
    .prepare(
      "SELECT s.* FROM submissions s JOIN users u ON u.id=s.user_id WHERE s.id=? AND u.institutionId=?",
    )
    .get(String(body.id), user.institutionId)) as any;
  if (!row) fail("Entrega no disponible.", 404);
  if (
    !body.reason?.trim() ||
    !body.reviews ||
    typeof body.reviews !== "object" ||
    Array.isArray(body.reviews)
  )
    fail("Indica el motivo y completa la rúbrica.");
  const t = JSON.parse(row.snapshot),
    answers = JSON.parse(row.answers),
    reviews = body.reviews as Reviews;
  for (const [id, criteria] of Object.entries(reviews)) {
    const q = t.questions.find((q: any) => q.id === id);
    if (!q?.rubric || typeof criteria !== "object" || Array.isArray(criteria))
      fail("Revisión no válida.");
    for (const [criterion, level] of Object.entries(criteria)) {
      if (
        !q.rubric.some(
          (r: any) =>
            r.id === criterion && r.levels.some((l: any) => l.id === level),
        )
      )
        fail("Nivel de rúbrica no válido.");
    }
  }
  const result = calculateTest(t, answers, reviews);
  if (result.state === "pending-review")
    fail("Completa todos los criterios de las respuestas aplicables.");
  await db.exec("BEGIN IMMEDIATE");
  try {
    const previous = (await db
      .prepare(
        "SELECT MAX(revision) n FROM assessment_results WHERE submission_id=?",
      )
      .get(row.id)) as any;
    await db
      .prepare("INSERT INTO assessment_results VALUES(?,?,?,?,?,?)")
      .run(
        row.id,
        (previous.n || 0) + 1,
        JSON.stringify(result),
        JSON.stringify(reviews),
        user.id,
        new Date().toISOString(),
      );
    await db
      .prepare("UPDATE submissions SET scores=? WHERE id=?")
      .run(JSON.stringify(result.scores), row.id);
    await db
      .prepare("DELETE FROM released_results WHERE submission_id=?")
      .run(row.id);
    await put("institution:" + user.institutionId, "rv360:audit", [
      {
        name: user.name,
        action: "Revisión de rúbrica",
        entity: row.id,
        reason: body.reason,
        created_at: new Date().toISOString(),
      },
      ...(await document(
        "institution:" + user.institutionId,
        "rv360:audit",
        [],
      )),
    ]);
    await db.exec("COMMIT");
  } catch (e) {
    await db.exec("ROLLBACK");
    throw e;
  }
  return result;
}
