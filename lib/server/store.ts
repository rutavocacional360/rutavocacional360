import { mailConfigured } from "./mail-config.mjs";
import { instrumentProblems } from "@/components/kit/lib/test-engine";
import { batteryForClient, availableOriginals } from "./battery";
import { testProblem } from "./test-validation";
import "server-only";
import {
  randomBytes,
  scryptSync,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import { cookies } from "next/headers";
import { db } from "./database";
import { asyncFilter } from "@/lib/server/async-collections";

export { db } from "./database";
export const hash = (s: string) => createHash("sha256").update(s).digest("hex");
export function passwordHash(password: string) {
  const salt = randomBytes(16).toString("hex");
  return salt + ":" + scryptSync(password, salt, 64).toString("hex");
}
export function passwordMatches(password: string, stored: string) {
  const [salt, digest] = stored.split(":");
  if (!salt || !digest) return false;
  const expected = Buffer.from(digest, "hex");
  const actual = scryptSync(password, salt, 64);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
export function fail(message: string, status = 400): never {
  throw Object.assign(new Error(message), { status });
}
export function publicUser(row: any) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    institutionId: row.institutionId,
    group: row.groupName,
  };
}
export async function currentUser() {
  const token = (await cookies()).get("rv360_session")?.value;
  if (!token) return null;
  const row = await db
    .prepare(
      "SELECT u.* FROM sessions s JOIN users u ON u.id=s.userId WHERE s.token=? AND s.expires>? AND u.status=?",
    )
    .get(hash(token), Date.now(), "Activo");
  return row ? publicUser(row) : null;
}
export async function requireUser(admin = false) {
  const user = await currentUser();
  if (!user) fail("Inicia sesión para continuar.", 401);
  if (admin && user.role !== "admin")
    fail("No tienes permiso para esta operación.", 403);
  return user;
}
export async function createSession(id: string) {
  const previous = (await cookies()).get("rv360_session")?.value;
  if (previous) await db.prepare("DELETE FROM sessions WHERE token=?").run(hash(previous));
  await db.prepare("DELETE FROM sessions WHERE expires<=?").run(Date.now());
  const token = randomBytes(32).toString("hex");
  await db
    .prepare("INSERT INTO sessions VALUES(?,?,?)")
    .run(hash(token), id, Date.now() + 86400000);
  (await cookies()).set("rv360_session", token, {
    httpOnly: true,
    sameSite: "lax",
    secure:
      process.env.COOKIE_SECURE === "true" ||
      process.env.APP_URL?.startsWith("https://") ||
      false,
    path: "/",
    maxAge: 86400,
  });
}
export async function closeSession() {
  const jar = await cookies();
  const token = jar.get("rv360_session")?.value;
  if (token)
    await db.prepare("DELETE FROM sessions WHERE token=?").run(hash(token));
  jar.delete("rv360_session");
}
export async function rateLimit(key: string) {
  return db.transaction(async () => {
    const row = (await db
      .prepare("SELECT * FROM attempts WHERE key=?")
      .get(key)) as any;
    const now = Date.now();
    if (row && row.until > now && row.count >= 12)
      fail("Demasiados intentos. Inténtalo en 15 minutos.", 429);
    await db
      .prepare("INSERT OR REPLACE INTO attempts VALUES(?,?,?)")
      .run(
        key,
        row && row.until > now ? row.count + 1 : 1,
        row && row.until > now ? row.until : now + 900000,
      );
  });
}

export async function document(
  owner: string,
  key: string,
  fallback: any = null,
) {
  const row = (await db
    .prepare("SELECT value FROM documents WHERE owner=? AND key=?")
    .get(owner, key)) as any;
  return row ? JSON.parse(row.value) : fallback;
}
export async function put(owner: string, key: string, value: any) {
  await db
    .prepare(
      "INSERT INTO documents(owner,key,value) VALUES(?,?,?) ON CONFLICT(owner,key) DO UPDATE SET value=excluded.value,revision=revision+1",
    )
    .run(owner, key, JSON.stringify(value));
}
export const shared = (key: string) =>
  key.startsWith("rv360:admin-") ||
  [
    "rv360:custom-tests",
    "rv360:versions",
    "rv360:published-content",
    "rv360:audit",
  ].includes(key);
export async function platformInstitution() {
  const config = await document("system", "rv360:platform");
  const org = config?.institutionId
    ? ((await db
        .prepare("SELECT * FROM institutions WHERE id=?")
        .get(config.institutionId)) as any)
    : null;
  if (!org)
    fail(
      "La plataforma aún no tiene configurado el registro de usuarios.",
      503,
    );
  return org;
}
export async function assigned(test: any, user: any) {
  if(user.role==='student'){const {studentEducationLevel,testMatchesLevel}=await import('./assessment-route');if(!testMatchesLevel(test,await studentEducationLevel(user)))return false;}
  const platform = await document("system", "rv360:platform");
  return (
    test.status === "Publicado" &&
    (!test.studentId || test.studentId === user.id) &&
    ((test.audience !== "selected" && !test.studentIds?.length) ||
      test.studentIds?.includes(user.id)) &&
    (user.institutionId === platform?.institutionId ||
      test.group === "Todos los estudiantes" ||
      test.group === user.group)
  );
}
export async function workspace(user: any) {
  if (!user)
    return {
      user: user || null,
      values: {},
      revisions: {},
      mailConfigured: mailConfigured(),
    };
  const values: Record<string, any> = {},
    revisions: Record<string, number> = {};
  for (const row of (await db
    .prepare("SELECT * FROM documents WHERE owner=? OR owner=?")
    .all(user.id, "institution:" + user.institutionId)) as any[]) {
    if (
      row.owner !== user.id &&
      user.role !== "admin" &&
      ![
        "rv360:custom-tests",
        "rv360:published-content",
        "rv360:admin-lab-settings",
      ].includes(row.key)
    )
      continue;
    if (
      ["rv360:email-change", "rv360:battery", "rv360:adult"].includes(row.key)
    )
      continue;
    values[row.key] = JSON.parse(row.value);
    revisions[row.key] = row.revision;
  }
  if (user.role === "student") {
    values["rv360:available-originals"] = (await availableOriginals(user)).map(t => t.id);
    const open = (await db
      .prepare(
        "SELECT snapshot FROM assessment_attempts WHERE user_id=? AND state='in_progress'",
      )
      .all(user.id)) as any[];
    for (const row of open) {
      const snapshot = JSON.parse(row.snapshot);
      values["rv360:custom-tests"] = [
        ...(values["rv360:custom-tests"] || []).filter(
          (t: any) => t.id !== snapshot.id,
        ),
        { ...snapshot, continuing: true, status: "Publicado" },
      ];
    }
  }
  if (user.role !== "admin")
    values["rv360:custom-tests"] = await Promise.all(
      (
        await asyncFilter(
          values["rv360:custom-tests"] || [],
          async (t: any) => await assigned(t, user),
        )
      ).map(async (t: any) => {
        const today = new Intl.DateTimeFormat("en-CA", {
          timeZone:
            (
              await document(
                "institution:" + user.institutionId,
                "rv360:admin-settings",
                {},
              )
            ).timezone || "America/Guayaquil",
        }).format(new Date());
        return {
          ...studentInstrument(t),
          availability:
            t.availableFrom && today < t.availableFrom
              ? "future"
              : t.due && today > t.due
                ? "closed"
                : "open",
        };
      }),
    );
  values["rv360:profile"] = {
    name: user.name,
    email: user.email,
    stage: "",
    institution: "",
    reminders: "no",
    ...values["rv360:profile"],
  };
  if (user.role === "admin") {
    const institution = (await db
      .prepare("SELECT * FROM institutions WHERE id=?")
      .get(user.institutionId)) as any;
    values["rv360:admin-settings"] = {
      name: institution?.name || "",
      code: institution?.code || "",
      email: user.email,
      year: String(new Date().getFullYear()),
      timezone: "America/Guayaquil",
      selfRegistration: "yes",
      reviewRequired: "yes",
      ...values["rv360:admin-settings"],
    };
  }
  const people =
    user.role === "student"
      ? []
      : (
          await db
            .prepare("SELECT * FROM users WHERE institutionId=? AND role!=?")
            .all(user.institutionId, "admin")
        ).filter(
          (u: any) => user.role === "admin" || u.groupName === user.group,
        );
  values["rv360:admin-users"] = await Promise.all(
    people.map(async (u: any) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role === "student" ? "Estudiante" : "Orientador",
      group: u.groupName,
      status: u.status,
      stage: (await document(u.id, "rv360:profile", {})).stage || "",
      institution:
        (await document(u.id, "rv360:profile", {})).institution || "",
    })),
  );
  values["rv360:submissions"] = await db
    .prepare(
      "SELECT s.* FROM submissions s JOIN users u ON s.user_id=u.id WHERE " +
        (user.role === "student"
          ? "u.id=?"
          : "u.institutionId=?" +
            (user.role === "orientador" ? " AND u.groupName=?" : "")) +
        " ORDER BY s.created_at DESC",
    )
    .all(
      ...(user.role === "student"
        ? [user.id]
        : user.role === "orientador"
          ? [user.institutionId, user.group]
          : [user.institutionId]),
    );
  values["rv360:submissions"] = await Promise.all(
    values["rv360:submissions"].map(
      async (row: any) => await visibleSubmission(row, user),
    ),
  );
  values["rv360:attempts"] = await db
    .prepare(
      "SELECT id,instrument_id,started_at,state,submission_id FROM assessment_attempts WHERE user_id=?",
    )
    .all(user.id);
  values["rv360:battery"] = await batteryForClient(user);
  return { user, values, revisions, mailConfigured: mailConfigured() };
}
export function validateTest(t: any) {
  if (
    !t ||
    typeof t.id !== "string" ||
    typeof t.title !== "string" ||
    typeof t.version !== "string" ||
    !Array.isArray(t.questions) ||
    t.questions.length > 500 ||
    JSON.stringify(t).length > 1000000
  )
    fail("Borrador no válido.");
  if (!["Borrador", "Publicado", "Archivado", "Eliminado"].includes(t.status))
    fail("Estado no válido.");
  if (t.educationLevel !== undefined && !["bachillerato", "universidad", "ambos"].includes(t.educationLevel))
    fail("Selecciona una ruta de orientación válida.");
  if (t.status === "Borrador" || t.status === "Eliminado") return;
  const errors = instrumentProblems(t);
  if (errors.length) fail(errors.map((e) => e.message).join(" "));
  if (
    t.maxAttempts !== undefined &&
    (!Number.isInteger(t.maxAttempts) ||
      t.maxAttempts < 0 ||
      t.maxAttempts > 100)
  )
    fail("Revisa el número máximo de intentos.");
  for (const date of [t.availableFrom, t.due])
    if (
      date &&
      (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)))
    )
      fail("Revisa las fechas de disponibilidad.");
}

export function studentInstrument(instrument: any, withExplanations = false) {
  return {
    ...instrument,
    questions: instrument.questions.map(
      ({
        correctValues,
        explanation,
        rubric,
        acceptedTexts,
        numericKey,
        rankingPoints,
        incorrectPenalty,
        ...q
      }: any) => ({ ...q, ...(withExplanations ? { explanation } : {}) }),
    ),
  };
}
export async function resultIsReleased(row: any) {
  const details = (await db
    .prepare(
      "SELECT result FROM assessment_results WHERE submission_id=? ORDER BY revision DESC LIMIT 1",
    )
    .get(row.id)) as any;
  if (details && JSON.parse(details.result).state === "pending-review")
    return false;
  const instrument = JSON.parse(row.snapshot);
  if (
    instrument.resultPublication === "date" &&
    (!instrument.releaseAt || Date.now() < Date.parse(instrument.releaseAt))
  )
    return false;
  return (
    instrument.resultPublication !== "review" ||
    !!(await db
      .prepare(
        "SELECT submission_id FROM released_results WHERE submission_id=?",
      )
      .get(row.id))
  );
}
export async function visibleSubmission(row: any, user: any) {
  const released = await resultIsReleased(row);
  const details = (await db
    .prepare(
      "SELECT result,revision FROM assessment_results WHERE submission_id=? ORDER BY revision DESC LIMIT 1",
    )
    .get(row.id)) as any;
  return {
    ...row,
    ...(details && (released || user.role !== "student")
      ? {
          evaluation: {
            ...JSON.parse(details.result),
            revision: details.revision,
          },
        }
      : {}),
    resultReleased: released,
    ...(user.role === "student"
      ? {
          scores: released ? row.scores : "[]",
          snapshot: JSON.stringify(
            studentInstrument(JSON.parse(row.snapshot), released),
          ),
        }
      : {}),
  };
}
export async function releaseResult(user: any, id: unknown) {
  const details = (await db
    .prepare(
      "SELECT result FROM assessment_results WHERE submission_id=? ORDER BY revision DESC LIMIT 1",
    )
    .get(String(id))) as any;
  if (details && JSON.parse(details.result).state === "pending-review")
    fail("Completa la revisión de la rúbrica antes de publicar.");
  if (user.role !== "admin")
    fail("Solo administración puede publicar resultados.", 403);
  const row = (await db
    .prepare(
      "SELECT s.* FROM submissions s JOIN users u ON s.user_id=u.id WHERE s.id=? AND u.institutionId=?",
    )
    .get(String(id), user.institutionId)) as any;
  if (!row) fail("Entrega no disponible.", 404);
  await db
    .prepare("INSERT OR IGNORE INTO released_results VALUES(?,?,?)")
    .run(row.id, user.id, new Date().toISOString());
  await put(
    "institution:" + user.institutionId,
    "rv360:audit",
    [
      {
        name: user.name,
        action: "Publicar resultado",
        entity: row.id,
        created_at: new Date().toISOString(),
      },
      ...(await document(
        "institution:" + user.institutionId,
        "rv360:audit",
        [],
      )),
    ].slice(0, 1000),
  );
  return { ok: true };
}
