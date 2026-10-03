import { fork, type ChildProcess } from "node:child_process";
import { resolve } from "node:path";
import { readFile } from "node:fs/promises";
import { db, document, put, fail } from "./store";
import { assessmentImportLevel, scopeImportedTests } from "./assessment-import";
const globalJobs = globalThis as unknown as {
  rutaJobs?: Map<string, ChildProcess>;
};
const jobs = globalJobs.rutaJobs || (globalJobs.rutaJobs = new Map());
const pending = new Map<string, symbol>();
export const importFolder = () =>
  resolve(
    /*turbopackIgnore: true*/ process.env.IMPORT_PATH || "storage/imports",
  );
export async function updateJob(owner: string, id: string, patch: any, active: () => boolean = () => true) {
  return db.transaction(async () => {
    const items = await document(owner, "rv360:imports", []);
    if (!active()) return;
    await put(
      owner,
      "rv360:imports",
      items.map((job: any) => (job.id === id ? { ...job, ...patch } : job)),
    );
  });
}

export async function cancelJob(owner: string, id: string) {
  const record = (await document(owner, "rv360:imports", [])).find(
    (r: any) => r.id === id,
  );
  if (!record) fail("Importación no encontrada.", 404);
  if (record.status === "Completado")
    fail("El documento ya se extrajo. Revisa sus instrumentos.", 409);
  pending.delete(id);
  const child = jobs.get(id);
  jobs.delete(id);
  child?.kill();
  await updateJob(owner, id, {
    status: "Cancelado",
    error: "Importación cancelada. Puedes reintentar.",
    tests: undefined,
    text: undefined,
    warnings: undefined,
  });
}
export async function assignJob(owner: string, id: string, requestedLevel: unknown) {
  const educationLevel = assessmentImportLevel(requestedLevel);
  return db.transaction(async () => {
    const items = await document(owner, "rv360:imports", []);
    const record = items.find((r: any) => r.id === id);
    if (!record) fail("Importación no encontrada.", 404);
    if (['bachillerato','universidad'].includes(record.educationLevel) && record.educationLevel !== educationLevel)
      fail("La importación pertenece a otra categoría. Sube el documento en la categoría correspondiente.", 409);
    if (record.hash && items.some((item: any) => item.id !== id && item.hash === record.hash && item.educationLevel === educationLevel))
      fail("Este documento ya tiene una importación en esa categoría. Revisa su historial.", 409);
    if (record.status === "Procesando" || pending.has(id) || jobs.has(id))
      fail("Espera a que termine la importación para asignar su categoría.", 409);
    if (!['bachillerato','universidad'].includes(record.educationLevel))
      await put(owner, "rv360:imports", items.map((job: any) => job.id === id ? { ...job, educationLevel, ...(Array.isArray(record.tests) ? {tests:scopeImportedTests(record.tests,educationLevel)} : {}) } : job));
    return educationLevel;
  });
}
export async function startJob(owner: string, id: string, requestedLevel?: unknown) {
  const record = (await document(owner, "rv360:imports", [])).find(
    (r: any) => r.id === id,
  );
  if (!record) fail("Importación no encontrada.", 404);
  if (record.status === "Completado")
    fail("El documento ya se extrajo. Revisa sus instrumentos.", 409);
  const educationLevel = assessmentImportLevel(['bachillerato','universidad'].includes(record.educationLevel) ? record.educationLevel : requestedLevel);
  if (requestedLevel !== undefined && assessmentImportLevel(requestedLevel) !== educationLevel)
    fail("La importación pertenece a otra categoría.", 409);
  if (jobs.has(id) || pending.has(id)) return;
  if (jobs.size + pending.size >= 2)
    fail(
      "Hay dos documentos procesándose. Espera un momento y reintenta.",
      429,
    );
  const token = Symbol(id);
  pending.set(id, token);
  let bytes: Buffer;
  try {
    bytes = await readFile(resolve(importFolder(), id));
  } catch (error) {
    if (pending.get(id) === token) pending.delete(id);
    throw error;
  }
  if (pending.get(id) !== token) return;
  try {
  await updateJob(owner, id, {
    status: "Procesando",
    educationLevel,
    progress: 10,
    error: "",
    tests: undefined,
    text: undefined,
    warnings: undefined,
  }, () => pending.get(id) === token);
  } catch(error) {
    if (pending.get(id) === token) pending.delete(id);
    throw error;
  }
  if (pending.get(id) !== token) return;
  const child = fork(
    resolve(/*turbopackIgnore: true*/ ".runtime/import-worker.cjs"),
    [],
    {
      stdio: ["ignore", "ignore", "ignore", "ipc"],
      execArgv: ["--max-old-space-size=512"],
      env: {
        NODE_ENV: process.env.NODE_ENV || "production",
        PATH: process.env.PATH,
        SystemRoot: process.env.SystemRoot,
        TEMP: process.env.TEMP,
        TMP: process.env.TMP,
      },
      windowsHide: true,
    },
  );
  jobs.set(id, child);
  pending.delete(id);
  const active = () => jobs.get(id) === child;
  const finish = async (patch: any) => {
    if (!active()) return;
    clearTimeout(timeout);
    await updateJob(owner, id, patch, active);
    if (active()) jobs.delete(id);
  };
  let updates = Promise.resolve();
  const enqueue = (task: () => Promise<void>) => {
    updates = updates.then(task).catch(async () => {
      if (!active()) return;
      clearTimeout(timeout);
      child.kill();
      await updateJob(owner, id, {status:"Error", error:"No se pudo guardar la extracción. Reintenta la importación."}, active).catch(() => {});
      if (active()) jobs.delete(id);
      console.error("import-job-save-failed");
    });
  };
  const timeout = setTimeout(
    () =>
      enqueue(async () => {
        if (!active()) return;
        await finish({
          status: "Error",
          error:
            "Se agotó el tiempo de extracción. Divide el documento o reintenta.",
        });
        child.kill();
      }),
    300000,
  );
  child.on("message", (message: any) =>
    enqueue(async () => {
      if (!active()) return;
      if (message.progress)
        await updateJob(owner, id, { progress: message.progress }, active);
      if (message.result)
        await finish({
          status: "Completado",
          progress: 100,
          ...message.result,
          educationLevel,
          tests: scopeImportedTests(message.result.tests || [], educationLevel),
        });
      if (message.error)
        await finish({ status: "Error", error: message.error });
    }),
  );
  child.on("error", () =>
    enqueue(() =>
      finish({
        status: "Error",
        error: "No se pudo iniciar el proceso de extracción.",
      }),
    ),
  );
  child.on("exit", () =>
    enqueue(() =>
      finish({
        status: "Error",
        error: "La extracción se interrumpió. Puedes reintentar.",
      }),
    ),
  );
  child.send({ data: bytes.toString("base64"), name: record.name, educationLevel });
}
