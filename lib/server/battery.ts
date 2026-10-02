import { answerProblem } from "@/components/kit/lib/test-engine";
import { randomUUID } from "node:crypto";
import { instruments, answerKey } from "@/components/kit/data/instruments";
import { db, document, put, assigned, studentInstrument, fail } from "./store";
import { asyncFind, asyncFilter } from "@/lib/server/async-collections";

export async function availableOriginals(user: any) {
  const owner = "institution:" + user.institutionId;
  const statuses = await document(owner, "rv360:admin-original-status", {});
  const custom = await asyncFilter(await document(owner, "rv360:custom-tests", []), async (t: any) => await assigned(t, user));
  return instruments.filter(t => (!statuses[t.id] || statuses[t.id] === "Original") && !custom.some((c: any) => c.stableId === t.id));
}

export async function currentAssessments(user: any) {
  const custom = await asyncFilter(await document("institution:" + user.institutionId, "rv360:custom-tests", []), async (t: any) => await assigned(t, user));
  return [...await availableOriginals(user), ...custom];
}

export async function battery(user: any, freeze = false) {
  if (user.role !== "student") return null;
  let run = await document(user.id, "rv360:battery");
  if (!run) {
    const custom = await asyncFilter(
      await document(
        "institution:" + user.institutionId,
        "rv360:custom-tests",
        [],
      ),
      async (t: any) => await assigned(t, user),
    );
    run = {
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      frozen: freeze,
      instruments: [...await availableOriginals(user), ...custom],
    };
    if (freeze) await put(user.id, "rv360:battery", run);
  }
  return run;
}
export async function batteryForClient(user: any) {
  const run = await battery(user);
  const originals = run ? await availableOriginals(user) : [];
  return run
    ? {
        ...run,
        instruments: [...run.instruments, ...originals.filter(t => !run.instruments.some((saved: any) => saved.id === t.id))].map((t: any) => studentInstrument(t)),
      }
    : null;
}
export async function batterySubmissions(user: any) {
  const run = await battery(user);
  if (!run) fail("Esta operación corresponde al estudiante.", 403);
  const rows = await Promise.all(
    run.instruments.map(
      async (t: any) =>
        await db
          .prepare(
            "SELECT * FROM submissions WHERE user_id=? AND instrument_id=? AND version=? ORDER BY created_at DESC LIMIT 1",
          )
          .get(user.id, t.id, t.version),
    ),
  );
  return { run, rows, complete: rows.every(Boolean) };
}
export async function instrumentFor(user: any, id: string) {
  const open = (await db
    .prepare(
      "SELECT snapshot FROM assessment_attempts WHERE user_id=? AND instrument_id=? AND state='in_progress'",
    )
    .get(user.id, id)) as any;
  if (open) return JSON.parse(open.snapshot);
  const originals = await availableOriginals(user);
  if (instruments.some(t => t.id === id) && !originals.some(t => t.id === id)) return undefined;
  const current = (await document("institution:" + user.institutionId, "rv360:custom-tests", [])).find((t: any) => t.id === id);
  if (current && !(await assigned(current, user))) return undefined;
  return (
    (await battery(user))?.instruments.find((t: any) => t.id === id) ||
    originals.find(t => t.id === id) ||
    (await asyncFind(
      await document(
        "institution:" + user.institutionId,
        "rv360:custom-tests",
        [],
      ),
      async (t: any) => t.id === id && (await assigned(t, user)),
    ))
  );
}
export async function validateDraft(user: any, key: string, value: any) {
  const run = await battery(user, true);
  const t =
    run?.instruments.find((t: any) => answerKey(t) === key) ||
    (await asyncFind(
      await document(
        "institution:" + user.institutionId,
        "rv360:custom-tests",
        [],
      ),
      async (t: any) => (await assigned(t, user)) && answerKey(t) === key,
    ));
  if (!t || !value || typeof value !== "object" || Array.isArray(value))
    fail("Borrador no válido para esta asignación.");
  if (
    t.schemaVersion === 2 &&
    !(await db
      .prepare(
        "SELECT id FROM assessment_attempts WHERE user_id=? AND instrument_id=? AND state='in_progress'",
      )
      .get(user.id, t.id))
  )
    fail("Inicia un intento antes de guardar respuestas.", 409);
  for (const [id, answer] of Object.entries(value)) {
    const q = t.questions.find((q: any) => q.id === id);
    if (!q) fail("Pregunta no válida.");
    const problem = answerProblem(t, q, answer, true);
    if (problem) fail(problem);
  }
}
