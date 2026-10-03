import { readJsonObject, readBoundedBody } from "@/lib/server/request-body";
import { trustedMutationOrigin } from "@/lib/server/request-origin";
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile, readFile, unlink } from "node:fs/promises";
import { resolve } from "node:path";
import {
  requireUser,
  db,
  fail,
  hash,
  document,
  put,
  rateLimit,
} from "@/lib/server/store";
import { startJob, cancelJob, assignJob, importFolder } from "@/lib/server/import-jobs";
import { assessmentImportLevel } from "@/lib/server/assessment-import";
import { documentFileError } from "@/components/kit/lib/document-formats";
export const runtime = "nodejs";
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser(true);
    if (!trustedMutationOrigin(req)) fail("Origen no autorizado.", 403);
    const owner = "institution:" + user.institutionId;
    if (req.headers.get("content-type")?.includes("application/json")) {
      const body = await readJsonObject(req, 10000);
      if (body.action === "cancel") await cancelJob(owner, body.id);
      else if (body.action === "retry") await startJob(owner, body.id, body.educationLevel);
      else if (body.action === "assign") await assignJob(owner, body.id, body.educationLevel);
      else fail("Operación no válida.");
      return NextResponse.json({ ok: true });
    }
    await rateLimit("import:" + user.id);
    if (Number(req.headers.get("content-length") || 0) > 11000000)
      fail("El límite por archivo es 10 MB.", 413);
    const bytesBody = await readBoundedBody(req, 11000000);
    const form = await new Response(new Uint8Array(bytesBody), {headers:{"Content-Type": req.headers.get("content-type") || ""}}).formData(),
      file = form.get("file");
    const educationLevel = assessmentImportLevel(form.get("educationLevel"));
    const reuse = form.get("reuse") === "1";
    if (!(file instanceof File)) fail("Selecciona un documento para importar.");
    const fileError = documentFileError(file.name, file.size);
    if (fileError) fail(fileError);
    const bytes = Buffer.from(await file.arrayBuffer()),
      digest = hash(bytes.toString("base64"));
    const previous = await document(owner, "rv360:imports", []);
    const existing = previous.find((f: any) => f.hash === digest && f.educationLevel === educationLevel);
    const resume = async (record: any) => {
      if (record.status !== "Completado") await startJob(owner, record.id, educationLevel);
      return NextResponse.json({id:record.id, status:record.status === "Completado" ? "Completado" : "Procesando", educationLevel, reused:true}, {status:202});
    };
    if (existing && reuse) return await resume(existing);
    if (existing)
      fail(
        "Este documento ya fue importado. Revisa su estado en el historial de importaciones.",
      );
    const id = randomUUID(),
      folder = importFolder();
    await mkdir(folder, { recursive: true });
    await writeFile(resolve(folder, id), bytes, { flag: "wx" });
    let concurrent: any;
    try {
      await db.transaction(async () => {
        const current = await document(owner, "rv360:imports", []);
        const duplicate = current.find((f: any) => f.hash === digest && f.educationLevel === educationLevel);
        if (duplicate && reuse) { concurrent = duplicate; return; }
        if (duplicate)
          fail("Este documento ya fue importado. Revisa su estado en el historial de importaciones.");
        await put(owner, "rv360:imports", [...current, {
          id, name:file.name.slice(0, 180), hash:digest, educationLevel,
          author:user.name, created_at:new Date().toISOString(), status:"Pendiente", progress:0,
        }]);
      });
    } catch (error) {
      await unlink(resolve(folder, id)).catch(() => {});
      throw error;
    }
    if (concurrent) {
      await unlink(resolve(folder, id)).catch(() => {});
      return await resume(concurrent);
    }
    try {
      await startJob(owner, id);
    } catch (error: any) {
      // Capacity rejection happens before a worker starts. Do not leave a duplicate
      // record that blocks a later upload of this same source.
      if (error.status === 429) {
        await db.transaction(async () => {
          const current = await document(owner, "rv360:imports", []);
          await put(owner, "rv360:imports", current.filter((job: any) => job.id !== id));
        });
        await unlink(resolve(folder, id)).catch(() => {});
      }
      throw error;
    }
    return NextResponse.json({ id, status: "Procesando", educationLevel }, { status: 202 });
  } catch (e: any) {
    return NextResponse.json(
      { error: e.status ? e.message : "No se pudo iniciar la importación." },
      { status: e.status || 422 },
    );
  }
}
export async function GET(req: NextRequest) {
  try {
    const user = await requireUser(true),
      id = req.nextUrl.searchParams.get("id");
    const record = (
      await document("institution:" + user.institutionId, "rv360:imports", [])
    ).find((r: any) => r.id === id);
    if (!record) fail("Documento no encontrado.", 404);
    if (req.nextUrl.searchParams.has("status"))
      return NextResponse.json(
        {
          ...record,
          tests: record.tests?.map((t: any) => ({ ...t, sourceId: record.id })),
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    const file = await readFile(
      /*turbopackIgnore: true*/ resolve(importFolder(), record.id),
    );
    return new NextResponse(file, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition":
          "attachment; filename*=UTF-8''" + encodeURIComponent(record.name),
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "no-store",
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.status ? e.message : "No se pudo consultar el documento." }, { status: e.status || 500 });
  }
}
