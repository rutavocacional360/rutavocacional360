import { nameProblem, emailProblem, passwordProblem, normalizeName } from "@/lib/validation";
import { mailConfigured, mailConfig } from "@/lib/server/mail-config.mjs";
import { sendAccountMail } from "@/lib/server/mail";
import { readJsonObject } from "@/lib/server/request-body";
import { generateAnalyticsInsights } from "@/lib/server/analytics-insights";
import {
  summarizeAnalytics,
  analyticsBrief,
} from "@/components/kit/lib/admin-analytics";
import { trustedMutationOrigin } from "@/lib/server/request-origin";
import { trainingAction } from "@/lib/server/training";
import { trainingPdf } from "@/lib/server/training-pdf";
import {
  ecuadorCareers,
  catalogSource,
  loadStoredCatalog,
} from "@/lib/server/ecuador-catalog";
import { testPdf } from "@/lib/server/test-results";
import { startTest, reviewTest } from "@/lib/server/test-attempts";
import { calculateTest } from "@/components/kit/lib/test-engine";
import { educationProfile } from "@/lib/server/education";
import { manageUser, adminAnalytics } from "@/lib/server/admin-management";
import { refreshAcademicContent, readAcademic } from "@/lib/server/academic-content.mjs";
import {readStudentGuidanceAIStatus} from '@/lib/server/student-guidance-ai';
import { providerReady } from "@/lib/server/ai-provider";
import {
  updateProfile,
  changePassword,
  requestEmail,
  confirmEmail,
} from "@/lib/server/account";
import {
  ensureGuidance,
  listGuidance,
  readGuidance,
  analyzeGuidance,
  configured,
} from "@/lib/server/guidance";
import {
  battery,
  batteryForClient,
  batterySubmissions,
} from "@/lib/server/battery";
import { instruments } from "@/components/kit/data/instruments";
import { NextRequest, NextResponse, after } from "next/server";
import { randomBytes, randomUUID } from "node:crypto";
import {
  platformInstitution,
  publicUser,
  releaseResult,
  db,
  fail,
  hash,
  passwordHash,
  passwordMatches,
  currentUser,
  requireUser,
  createSession,
  closeSession,
  rateLimit,
  workspace,
  document,
  put,
  validateTest,
} from "@/lib/server/store";
import {
  saveDocument,
  submitAssessment,
  evaluateInstrument,
} from "@/lib/server/operations";
import { renameGroup } from "@/lib/server/groups";
import {
  createIntegralReport,
  listIntegralReports,
  readIntegralReport,
} from "@/lib/server/integral-reports";
export const runtime = "nodejs";
async function handle(
  req: NextRequest,
  { params }: { params: Promise<{ action: string[] }> },
) {
  try {
    const action = (await params).action.join("/");
    if (req.method !== "GET") {
      if (!trustedMutationOrigin(req)) fail("Origen no autorizado.", 403);
      if (Number(req.headers.get("content-length") || 0) > 2000000)
        fail("Solicitud demasiado grande.", 413);
    }
    await loadStoredCatalog();
    const body = req.method === "GET" ? {} : await readJsonObject(req);
    let result: any;
    if (action === "session") result = await workspace(await currentUser());
    else if (action === "auth/register" && req.method === "POST") {
      await rateLimit(
        "register:" + hash(req.headers.get("x-forwarded-for") || "local"),
      );
      const { name, email, password, institution } = body;
      const problem = nameProblem(name) || emailProblem(email) || passwordProblem(password);
      if (problem) fail(problem);
      if (body.firstName !== undefined || body.lastName !== undefined) {
        const nameError = nameProblem(body.firstName, 60) || nameProblem(body.lastName, 79);
        if (nameError) fail(nameError);
        if (normalizeName(body.firstName + ' ' + body.lastName) !== normalizeName(name)) fail('Revisa nombres y apellidos.');
      }
      if (
        await db
          .prepare("SELECT id FROM users WHERE email=?")
          .get(email.trim().toLowerCase())
      )
        fail("No se pudo crear la cuenta con este correo.");
      const org = await platformInstitution();
      if (
        (await document("institution:" + org.id, "rv360:admin-settings", {}))
          .selfRegistration === "no"
      )
        fail("El registro está cerrado temporalmente. Contacta con soporte.");
      const education = educationProfile(body);
      const id = randomUUID();
      try {
        await db.transaction(async () => {
          await db.prepare("INSERT INTO users VALUES(?,?,?,?,?,?,?,?)").run(
            id, normalizeName(name), email.trim().toLowerCase(), passwordHash(password),
            "student", org.id, "", "Activo",
          );
          await put(id, "rv360:profile", {
            name: normalizeName(name), ...(body.firstName !== undefined ? {firstName: normalizeName(body.firstName), lastName: normalizeName(body.lastName)} : {}), email: email.trim().toLowerCase(),
            ...education, reminders: "no",
          });
        });
      } catch (error: any) {
        if (error.code === "ER_DUP_ENTRY" || error.code === "SQLITE_CONSTRAINT_UNIQUE")
          fail("No se pudo crear la cuenta con este correo.", 409);
        throw error;
      }
      await createSession(id);
      result = await workspace(await currentUser());
    } else if (action === "auth/login" && req.method === "POST") {
      if (
        !!emailProblem(body.email) ||
        (body.admin !== undefined && typeof body.admin !== "boolean") ||
        typeof body.password !== "string" ||
        body.password.length === 0 || body.password.length > 128
      )
        fail("Credenciales no válidas.", 401);
      await rateLimit("login:" + hash(body.email.trim().toLowerCase()));
      const row = (await db
        .prepare("SELECT * FROM users WHERE email=?")
        .get(body.email.trim().toLowerCase())) as any;
      const verified = passwordMatches(
        body.password,
        row?.password || passwordHash("invalid-password"),
      );
      if (
        !row ||
        !verified ||
        row.status !== "Activo" ||
        (body.admin ? row.role === "student" : row.role !== "student")
      )
        fail("Correo o contraseña incorrectos para este acceso.", 401);
      await createSession(row.id);
      result = await workspace(await currentUser());
    } else if (action === "auth/logout" && req.method === "POST") {
      await closeSession();
      result = { ok: true };
    } else if (action === "auth/password-reset" && req.method === "POST") {
      if (!mailConfigured())
        fail(
          "El envío de correos aún no está configurado. Contacta con soporte para recuperar el acceso.",
          503,
        );
      if (emailProblem(body.email)) fail("Correo no válido.");
      await rateLimit("reset:" + hash(body.email.trim().toLowerCase()));
      const row = (await db
        .prepare("SELECT id,email FROM users WHERE email=? AND status='Activo'")
        .get(body.email.trim().toLowerCase())) as any;
      if (row) {
        const token = randomBytes(32).toString("hex");
        await db
          .prepare("INSERT INTO resets VALUES(?,?,?)")
          .run(hash(token), row.id, Date.now() + 1800000);
        try {
          await sendAccountMail(
            row.email,
            "Recupera tu acceso a Ruta Vocacional 360°",
            "Restablece tu contraseña en " + mailConfig().origin +
              "/restablecer?token=" + token +
              "\nEl enlace vence en 30 minutos y solo puede usarse una vez. Si no lo solicitaste, ignora este correo.",
          );
        } catch (error) {
          await db.prepare("DELETE FROM resets WHERE token=?").run(hash(token));
          throw error;
        }
      }
      result = { ok: true };
    } else if (action === "auth/reset-confirm" && req.method === "POST") {
      if (
        passwordProblem(body.password)
      )
        fail("Usa una contraseña de 15 a 128 caracteres.");
      await rateLimit("reset-confirm:" + hash(String(body.token).slice(0, 128)));
      if (typeof body.token !== "string" || !/^[a-f0-9]{64}$/.test(body.token)) fail("Enlace no válido.");
      result = await db.transaction(async () => {
      const reset = (await db
        .prepare("SELECT * FROM resets WHERE token=? AND expires>?")
        .get(hash(String(body.token)), Date.now())) as any;
      if (!reset) fail("El enlace no es válido o ha vencido.");
      await db
        .prepare("UPDATE users SET password=? WHERE id=?")
        .run(passwordHash(body.password), reset.userId);
      await db.prepare("DELETE FROM resets WHERE userId=?").run(reset.userId);
      await db.prepare("DELETE FROM sessions WHERE userId=?").run(reset.userId);
      const account = (await db
        .prepare("SELECT role FROM users WHERE id=?")
        .get(reset.userId)) as any;
      return {
        ok: true,
        loginPath: account.role === "student" ? "/ingresar" : "/admin/login",
      };
      });
    } else if (action === "account/adult" && req.method === "POST") {
      fail(
        "Este formulario ya no está disponible. Continúa en tu espacio.",
        410,
      );
    } else {
      const user = await requireUser();
      if (action === "state" && req.method === "PUT") {
        const revision = await saveDocument(
          user,
          body.key,
          body.value,
          body.revision,
        );
        result = { revision };
      } else if (action === "training/pdf" && req.method === "GET")
        return new NextResponse(
          new Uint8Array(
            await trainingPdf(user, req.nextUrl.searchParams.get("id") || ""),
          ),
          {
            headers: {
              "Content-Type": "application/pdf",
              "Cache-Control": "private, no-store",
              "Content-Disposition": "inline; filename=resultado-simulador.pdf",
            },
          },
        );
      else if (action.startsWith("training"))
        result = await trainingAction(
          user,
          action,
          req.method,
          body,
          req.nextUrl.searchParams,
        );
      else if (action === "admin/users" && req.method === "POST")
        result = await manageUser(user, body);
      else if (action === "admin/analytics" && req.method === "GET")
        result = await adminAnalytics(user);
      else if (action === "admin/insights" && req.method === "POST") {
        await requireUser(true);
        await rateLimit("insights:" + user.id);
        if (
          ![7, 14, 30].includes(body.days) ||
          typeof body.group !== "string" ||
          body.group.length > 100
        )
          fail("Filtros no válidos.");
        result = await generateAnalyticsInsights(
          analyticsBrief(
            summarizeAnalytics(
              await adminAnalytics(user),
              body.group,
              body.days,
            ),
          ),
        );
      } else if (action === "admin/orientation-content" && req.method === "GET") {
        await requireUser(true);
        const content = readAcademic();
        result = { configured: providerReady(), source: content.source, model: content.model, contentId: content.id, studentAnalysis:await readStudentGuidanceAIStatus() };
      } else if (
        action === "admin/orientation-content" &&
        req.method === "POST"
      ) {
        await requireUser(true);
        try {
          const shared = await refreshAcademicContent();
          result = {
            source: shared.source,
            model: shared.model,
            contentId: shared.id,
            reused: !!shared.reused,
          };
        } catch (e: any) {
          if(e.message === 'GEMINI_CONFIGURATION')fail('Configura GEMINI_API_KEY en el entorno privado del servidor para activar la IA.',503);
          if(e.message === 'PROVIDER_AUTH')fail('La credencial de IA no es válida o no tiene acceso al modelo configurado.',503);
          fail(
            e.message === "PROVIDER_QUOTA"
              ? "Cuota de Gemini agotada. Se conserva el contenido disponible."
              : e.message === "LOCAL_DAILY_LIMIT"
                ? "Límite diario local alcanzado."
                : "No se pudo actualizar el contenido académico.",
            e.message === "PROVIDER_QUOTA" || e.message === "LOCAL_DAILY_LIMIT"
              ? 429
              : 502,
          );
        }
      } else if (action === "assessments/pdf" && req.method === "GET") {
        const pdf = await testPdf(
          user,
          req.nextUrl.searchParams.get("id") || "",
        );
        return new NextResponse(new Uint8Array(pdf), {
          headers: {
            "Content-Type": "application/pdf",
            "Cache-Control": "private, no-store",
            "Content-Disposition": "inline; filename=resultado-vocacional.pdf",
          },
        });
      } else if (action === "assessments/start" && req.method === "POST") {
        result = await startTest(user, String(body.instrumentId));
      } else if (action === "admin/tests/careers" && req.method === "GET") {
        await requireUser(true);
        result = {
          careers: ecuadorCareers.map((c) => ({ id: c.id, name: c.name })),
          source: catalogSource,
        };
      } else if (action === "admin/tests/review" && req.method === "POST") {
        result = await reviewTest(user, body);
      } else if (action === "admin/tests/preview" && req.method === "POST") {
        await requireUser(true);
        validateTest({ ...body.instrument, status: "Publicado" });
        if (
          !body.answers ||
          typeof body.answers !== "object" ||
          Array.isArray(body.answers)
        )
          fail("Respuestas de prueba no válidas.");
        result = {
          ...calculateTest(
            instruments.some((t) => t.id === body.instrument.id)
              ? { ...body.instrument, scoring: "dimensions" }
              : body.instrument,
            body.answers,
          ),
          persisted: false,
        };
      } else if (action === "account/profile" && req.method === "PUT")
        result = await updateProfile(user, body);
      else if (action === "account/password" && req.method === "POST")
        result = await changePassword(user, body);
      else if (action === "account/email" && req.method === "POST")
        result = await requestEmail(user, body);
      else if (action === "account/email/confirm" && req.method === "POST")
        result = await confirmEmail(user, body);
      else if (action === "battery/start" && req.method === "POST") {
        await battery(user, true);
        result = await batteryForClient(user);
      } else if (action === "reports/guidance" && req.method === "GET") {
        let currentId: string | null = null;
        if (user.role === "student") {
          try {
            currentId = (await ensureGuidance(user)).id;
          } catch (e: any) {
            if (e.status !== 409) throw e;
          }
        }
        const items = await listGuidance(user);
        result = { items: user.role === "student" ? items.map((r:any)=>({...r,historical:r.id!==currentId})).sort((a:any,b:any)=>Number(a.historical)-Number(b.historical)) : items, configured: configured() };
      } else if (action === "reports/guidance/detail" && req.method === "GET")
        result = await readGuidance(
          user,
          req.nextUrl.searchParams.get("id") || "",
        );
      else if (action === "reports/guidance" && req.method === "POST")
        result = await analyzeGuidance(user, body);
      else if (action === "assessments/submit" && req.method === "POST") {
        result = await submitAssessment(user, body.instrumentId);
        try {
          await ensureGuidance(user);
        } catch {
          result = { ...result, guidancePending: true };
        }
      } else if (action === "reports/integral" && req.method === "POST")
        fail(
          "La generación de informes anteriores fue retirada. Consulta Mis resultados.",
          410,
        );
      else if (action === "reports/integral" && req.method === "GET")
        result = {
          items: await listIntegralReports(
            user,
            req.nextUrl.searchParams.get("studentId"),
          ),
        };
      else if (action === "reports/integral/detail" && req.method === "GET")
        result = await readIntegralReport(
          user,
          req.nextUrl.searchParams.get("id") || "",
        );
      else if (action === "admin/groups/rename" && req.method === "POST")
        fail("La gestión de grupos fue retirada.", 410);
      else if (action === "admin/results/release" && req.method === "POST") {
        result = await releaseResult(user, body.id);
        const student = await db
          .prepare(
            "SELECT u.* FROM users u JOIN submissions s ON s.user_id=u.id WHERE s.id=?",
          )
          .get(String(body.id));
        if (student) await ensureGuidance(publicUser(student));
      } else if (action === "assessments/history")
        result = { items: (await workspace(user)).values["rv360:submissions"] };
      else if (action === "me/export")
        result = {
          ...(await workspace(user)),
          guidanceReports: await listGuidance(user),
          integralReports: await Promise.all(
            (await listIntegralReports(user)).map(
              async (report) => await readIntegralReport(user, report.id),
            ),
          ),
        };
      else if (action === "admin/audit") {
        await requireUser(true);
        result = {
          items: await document(
            "institution:" + user.institutionId,
            "rv360:audit",
            [],
          ),
        };
      } else if (action === "admin/versions") {
        await requireUser(true);
        const owner = "institution:" + user.institutionId;
        let items = await document(owner, "rv360:versions", []);
        if (req.method === "POST") {
          const id = randomUUID();
          const content = await document(
            owner,
            body.kind === "instrument"
              ? "rv360:admin-draft:" + body.itemId
              : "rv360:admin-content",
            {},
          );
          items = [
            {
              id,
              kind: body.kind,
              item_id: body.itemId,
              version:
                items.filter((v: any) => v.item_id === body.itemId).length + 1,
              status: "En revisión",
              content,
              created_at: new Date().toISOString(),
            },
            ...items,
          ];
          await put(owner, "rv360:versions", items);
          result = { id };
        } else if (req.method === "PATCH") {
          if (
            !["Publicado", "Archivado", "En revisión", "Revisado"].includes(
              body.status,
            )
          )
            fail("Estado no válido.");
          const version = items.find((v: any) => v.id === body.id);
          if (!version) fail("Versión no encontrada.", 404);
          if (version.status === "Publicado" && body.status === "En revisión")
            fail("La versión publicada es inmutable.");
          if (version.kind === "instrument" && body.status === "Publicado") {
            const original = instruments.find((i) => i.id === version.item_id);
            if (!original) fail("Instrumento no encontrado.");
            const draft = version.content || {};
            const test = {
              ...original,
              id: "revision-" + version.id,
              version: String(version.version),
              status: "Publicado",
              publishedAt: new Date().toISOString(),
              group: "Todos los estudiantes",
              due: "",
              questions: [
                ...original.questions.map((q) => ({
                  ...q,
                  text: draft[q.id] || q.text,
                  dimension: draft[q.id + ":dimension"] || q.dimension,
                })),
                ...Object.keys(draft)
                  .filter(
                    (k) => k.startsWith("NEW-") && !k.endsWith(":dimension"),
                  )
                  .map((id) => ({
                    id,
                    text: draft[id],
                    dimension: draft[id + ":dimension"],
                  })),
              ],
            };
            await put(owner, "rv360:custom-tests", [
              ...(await document(owner, "rv360:custom-tests", [])).filter(
                (t: any) => t.id !== test.id,
              ),
              test,
            ]);
          }
          if (version.kind === "instrument" && body.status === "Archivado")
            await put(
              owner,
              "rv360:custom-tests",
              (await document(owner, "rv360:custom-tests", [])).map((t: any) =>
                t.id === "revision-" + version.id
                  ? { ...t, status: "Archivado" }
                  : t,
              ),
            );
          if (version.kind === "content") {
            const rows = (
              await document(owner, "rv360:published-content", [])
            ).filter((r: any) => r.versionId !== version.id);
            const content = Array.isArray(version.content)
              ? version.content.find((c: any) => c.id === version.item_id)
              : null;
            if (body.status === "Publicado" && content)
              rows.push({
                versionId: version.id,
                content: JSON.stringify(content),
              });
            await put(owner, "rv360:published-content", rows);
          }
          await put(owner, "rv360:audit", [
            {
              name: user.name,
              action: body.status,
              entity: version.item_id,
              created_at: new Date().toISOString(),
            },
            ...(await document(owner, "rv360:audit", [])),
          ]);
          items = items.map((v: any) =>
            v.id === body.id ? { ...v, status: body.status } : v,
          );
          await put(owner, "rv360:versions", items);
          result = { ok: true };
        } else result = { items };
      } else fail("Operación no encontrada.", 404);
    }
    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        error: error.status
          ? error.message
          : "No se pudo completar la operación. Revisa los datos o el registro del servidor.",
      },
      { status: error.status || 500, headers: { "Cache-Control": "private, no-store" } },
    );
  }
}
const scopedHandle = (...args: Parameters<typeof handle>) =>
  db.context(() => handle(...args));
export const GET = scopedHandle;
export const POST = scopedHandle;
export const PUT = scopedHandle;
export const PATCH = scopedHandle;
