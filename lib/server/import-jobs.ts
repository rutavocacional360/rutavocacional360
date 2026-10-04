import { fork, type ChildProcess } from "node:child_process";
import { resolve } from "node:path";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { db, document, put, fail } from "./store";
import { assessmentImportLevel, scopeImportedTests } from "./assessment-import";
import { currentDocumentExtraction, DOCUMENT_EXTRACTION_VERSION } from "./import-version";
const globalJobs = globalThis as unknown as {
  rutaJobs?: Map<string, ChildProcess>;
  rutaPendingJobs?: Map<string, symbol>;
};
const jobs = globalJobs.rutaJobs || (globalJobs.rutaJobs = new Map());
const pending = globalJobs.rutaPendingJobs || (globalJobs.rutaPendingJobs = new Map());
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
    course: undefined,
    text: undefined,
    warnings: undefined,
    images: undefined,
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
export async function startJob(owner: string, id: string, requestedLevel?: unknown,
  options: { sourceBytes?: Buffer; reuseCompleted?: boolean } = {}) {
  const record = (await document(owner, "rv360:imports", [])).find(
    (r: any) => r.id === id,
  );
  if (!record) fail("Importación no encontrada.", 404);
  const educationLevel = assessmentImportLevel(['bachillerato','universidad'].includes(record.educationLevel) ? record.educationLevel : requestedLevel);
  if (requestedLevel !== undefined && assessmentImportLevel(requestedLevel) !== educationLevel)
    fail("La importación pertenece a otra categoría.", 409);
  if (currentDocumentExtraction(record)) {
    if (options.reuseCompleted) return "Completado";
    fail("El documento ya se extrajo. Revisa sus instrumentos.", 409);
  }
  if (jobs.has(id) || pending.has(id)) return "Procesando";
  if (jobs.size + pending.size >= 2)
    fail(
      "Hay dos documentos procesándose. Espera un momento y reintenta.",
      429,
    );
  const token = Symbol(id);
  pending.set(id, token);
  const workerFile = resolve(/*turbopackIgnore: true*/ ".runtime/import-worker.cjs");
  let bytes: Buffer;
  try {
    try {
      await access(workerFile);
    } catch {
      const error = "El servicio de importación no está preparado. Compila y despliega de nuevo la aplicación para reintentar.";
      await updateJob(owner, id, { status: "Error", error, errorCode: "IMPORT_WORKER_MISSING" }, () => pending.get(id) === token);
      fail(error, 503);
    }
    if (options.sourceBytes) {
      // Reserve the job before restoring the source: two simultaneous uploads
      // must neither start two workers nor read a partially restored file.
      await mkdir(importFolder(), { recursive: true });
      await writeFile(resolve(importFolder(), id), options.sourceBytes, { flag: "wx" })
        .catch((error: NodeJS.ErrnoException) => { if (error.code !== "EEXIST") throw error; });
      bytes = options.sourceBytes;
    } else {
      try {
        bytes = await readFile(resolve(importFolder(), id));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        const message = "El archivo original ya no está disponible. Vuelve a subir el mismo documento para recuperar esta importación.";
        await updateJob(owner, id, {
          status: "Error", error: message, errorCode: "IMPORT_SOURCE_MISSING",
        }, () => pending.get(id) === token);
        fail(message, 409);
      }
    }
  } catch (error) {
    if (pending.get(id) === token) pending.delete(id);
    throw error;
  }
  if (pending.get(id) !== token) return "Procesando";
  try {
  await updateJob(owner, id, {
    status: "Procesando",
    educationLevel,
    progress: 10,
    error: "",
    errorCode: undefined,
    extractionVersion: undefined,
    tests: undefined,
    course: undefined,
    text: undefined,
    warnings: undefined,
    images: undefined,
  }, () => pending.get(id) === token);
  } catch(error) {
    if (pending.get(id) === token) pending.delete(id);
    throw error;
  }
  if (pending.get(id) !== token) return "Procesando";
  let child: ChildProcess;
  try {
    child = fork(
    workerFile,
    [],
    {
      stdio: ["ignore", "ignore", "pipe", "ipc"],
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
  } catch {
    try {
      await updateJob(owner, id, {
        status: "Error", error: "No se pudo iniciar el proceso de extracción. Reintenta la importación.",
      }, () => pending.get(id) === token);
    } finally {
      if (pending.get(id) === token) pending.delete(id);
    }
    fail("No se pudo iniciar el proceso de extracción. Reintenta la importación.", 503);
  }
  jobs.set(id, child);
  pending.delete(id);
  // Keep only a bounded diagnostic tail. Never expose document text or internal
  // paths from stderr in API responses or application logs.
  let diagnostic = "";
  child.stderr?.setEncoding("utf8");
  child.stderr?.on("data", (chunk: string) => {
    diagnostic = (diagnostic + chunk).slice(-8192);
  });
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
          errorCode: "IMPORT_TIMEOUT",
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
          extractionVersion: DOCUMENT_EXTRACTION_VERSION,
          educationLevel,
          tests: scopeImportedTests(message.result.tests || [], educationLevel),
        });
      if (message.error)
        await finish({ status: "Error", error: message.error, errorCode: message.code });
    }),
  );
  child.on("error", () =>
    enqueue(() =>
      finish({
        status: "Error",
        error: "No se pudo iniciar el proceso de extracción.",
        errorCode: "IMPORT_WORKER_START_FAILED",
      }),
    ),
  );
  // `close` follows exit and drains the child's channels. A final result already
  // queued above must win over a process exit, including for large documents.
  child.on("close", (code, signal) =>
    enqueue(async () => {
      if (!active()) return;
      let errorCode = "IMPORT_WORKER_INTERRUPTED";
      let error = "El proceso de extracción se cerró antes de terminar. Reintenta con el mismo documento; si vuelve a ocurrir, divídelo en archivos más pequeños.";
      if (/heap out of memory|allocation failed|ENOMEM/i.test(diagnostic)) {
        errorCode = "IMPORT_WORKER_MEMORY_LIMIT";
        error = "El documento superó la memoria disponible para la extracción. Divídelo en archivos más pequeños o reduce la resolución de las páginas escaneadas y vuelve a importarlo.";
      } else if (/MODULE_NOT_FOUND|ERR_MODULE_NOT_FOUND|ERR_DLOPEN_FAILED|Cannot find native binding/i.test(diagnostic)) {
        errorCode = "IMPORT_DEPENDENCY_MISSING";
        error = "El servidor no tiene todos los componentes de importación. Actualiza el despliegue y reintenta.";
      }
      console.error("import-worker-closed", { id, code, signal, errorCode });
      await finish({ status: "Error", error, errorCode });
    }),
  );
  // Sending a 10 MB source can fail asynchronously if the worker exits during
  // startup. Handle IPC errors so retries never remain stuck in Procesando.
  const sendFailed = () => enqueue(async () => {
    await finish({ status: "Error", error: "No se pudo enviar el documento al proceso de extracción. Reintenta la importación." });
    child.kill();
  });
  try {
    child.send({ data: bytes.toString("base64"), name: record.name, educationLevel }, error => {
      if (error) sendFailed();
    });
  } catch {
    sendFailed();
  }
  return "Procesando";
}
