import { nameProblem, emailProblem, passwordProblem, textProblem, normalizeName } from "../validation";
import { randomUUID } from "node:crypto";
import { db, document, put, fail, passwordHash } from "./store";
import { instruments } from "@/components/kit/data/instruments";
import { listGuidance } from "./guidance";
export async function manageUser(admin: any, body: any) {
  if (body.action !== undefined && !['delete','reset-password'].includes(body.action)) fail('Operación de usuario no válida.');
  for (const key of ['group','stage','institution']) {
    if (body[key] !== undefined && textProblem(body[key], key === 'institution' ? 180 : 100)) fail('Revisa grupo, etapa y centro educativo.');
  }
  for(const key of ['id','name','email','group','stage','institution']){
    if(body[key]!==undefined&&(typeof body[key]!=='string'||body[key].length>(key==='email'?254:key==='institution'?180:key==='name'?140:100)))fail('Revisa los datos del usuario.');
  }
  if (admin.role !== "admin")
    fail("Solo administración puede gestionar usuarios.", 403);
  const existing = body.id
    ? ((await db
        .prepare("SELECT * FROM users WHERE id=?")
        .get(String(body.id))) as any)
    : null;
  if (
    body.id &&
    (!existing ||
      existing.institutionId !== admin.institutionId ||
      existing.role === "admin")
  )
    fail("Usuario no disponible.", 404);
  if (body.action === "reset-password") {
    if (!existing) fail("Usuario no disponible.", 404);
    if (
      passwordProblem(body.password)
    )
      fail("Usa una contraseña de 15 a 128 caracteres.");
    if (body.password !== body.confirmPassword)
      fail("Las contraseñas no coinciden.");
    const hashed = passwordHash(body.password);
    await db.exec("BEGIN IMMEDIATE");
    try {
      await db
        .prepare("UPDATE users SET password=? WHERE id=?")
        .run(hashed, existing.id);
      await db.prepare("DELETE FROM sessions WHERE userId=?").run(existing.id);
      await db.prepare("DELETE FROM resets WHERE userId=?").run(existing.id);
      await put(
        "institution:" + admin.institutionId,
        "rv360:audit",
        [
          {
            name: admin.name,
            action: "Restablecer contraseña de usuario",
            entity: existing.id,
            created_at: new Date().toISOString(),
          },
          ...(await document(
            "institution:" + admin.institutionId,
            "rv360:audit",
            [],
          )),
        ].slice(0, 1000),
      );
      await db.exec("COMMIT");
    } catch (e) {
      await db.exec("ROLLBACK");
      throw e;
    }
    return { ok: true };
  }
  if (body.action === "delete") {
    if (!existing) fail("Usuario no disponible.", 404);
    if (
      await db
        .prepare("SELECT id FROM submissions WHERE user_id=? LIMIT 1")
        .get(existing.id)
    )
      fail(
        "Este usuario tiene evaluaciones guardadas. Suspende su acceso para conservar sus resultados.",
        409,
      );
    await db.exec("BEGIN IMMEDIATE");
    try {
      for (const table of ["sessions", "resets"])
        await db
          .prepare("DELETE FROM " + table + " WHERE userId=?")
          .run(existing.id);
      await db.prepare("DELETE FROM documents WHERE owner=?").run(existing.id);
      await db.prepare("DELETE FROM users WHERE id=?").run(existing.id);
      await db.exec("COMMIT");
    } catch (e) {
      await db.exec("ROLLBACK");
      throw e;
    }
  } else {
    const name = normalizeName(String(body.name || "")),
      email = String(body.email || "")
        .trim()
        .toLowerCase(),
      group = String(body.group || "").trim(),
      role =
        body.role === "Orientador"
          ? "orientador"
          : body.role === "Estudiante"
            ? "student"
            : "";
    if (
      nameProblem(name) ||
      emailProblem(email) ||
      !role ||
      group.length > 100 ||
      !["Activo", "Suspendido", "Invitación pendiente"].includes(body.status)
    )
      fail("Revisa nombre, correo, rol y estado.");
    const duplicate = (await db
      .prepare("SELECT id FROM users WHERE email=?")
      .get(email)) as any;
    if (duplicate && duplicate.id !== existing?.id)
      fail("Ese correo ya pertenece a otra cuenta.", 409);
    if (
      !existing &&
      passwordProblem(body.password)
    )
      fail("Define una contraseña inicial de al menos 15 caracteres.");
    await db.exec("BEGIN IMMEDIATE");
    try {
      const id = existing?.id || randomUUID();
      if (existing) {
        await db
          .prepare(
            "UPDATE users SET name=?,email=?,role=?,groupName=?,status=? WHERE id=?",
          )
          .run(name, email, role, group, body.status, id);
        if (
          existing.email !== email ||
          existing.role !== role ||
          body.status !== "Activo"
        ) {
          await db.prepare("DELETE FROM sessions WHERE userId=?").run(id);
          await db.prepare("DELETE FROM resets WHERE userId=?").run(id);
        }
      } else
        await db
          .prepare("INSERT INTO users VALUES(?,?,?,?,?,?,?,?)")
          .run(
            id,
            name,
            email,
            passwordHash(body.password),
            role,
            admin.institutionId,
            group,
            body.status,
          );
      const profile = await document(id, "rv360:profile", {});
      if (existing?.name !== name) {
        delete profile.firstName;
        delete profile.lastName;
      }
      await put(id, "rv360:profile", {
        ...profile,
        name,
        email,
        stage:
          typeof body.stage === "string"
            ? body.stage.slice(0, 100)
            : profile.stage || "",
        institution:
          typeof body.institution === "string"
            ? body.institution.slice(0, 120)
            : profile.institution || "",
      });
      await db.exec("COMMIT");
    } catch (e) {
      await db.exec("ROLLBACK");
      throw e;
    }
  }
  await put(
    "institution:" + admin.institutionId,
    "rv360:audit",
    [
      {
        name: admin.name,
        action:
          body.action === "delete"
            ? "Eliminar cuenta sin entregas"
            : existing
              ? "Editar usuario"
              : "Crear usuario",
        entity: existing?.id || String(body.email),
        created_at: new Date().toISOString(),
      },
      ...(await document(
        "institution:" + admin.institutionId,
        "rv360:audit",
        [],
      )),
    ].slice(0, 1000),
  );
  return { ok: true };
}
export async function adminAnalytics(user: any) {
  if (user.role === "student")
    fail("No tienes acceso al seguimiento institucional.", 403);
  const students = (await db
    .prepare(
      "SELECT id,name,groupName,status FROM users WHERE institutionId IS ? AND role=?" +
        (user.role === "orientador" ? " AND groupName=?" : ""),
    )
    .all(
      ...(user.role === "orientador"
        ? [user.institutionId, "student", user.group]
        : [user.institutionId, "student"]),
    )) as any[];
  const ids = new Set(students.map((s) => s.id)),
    submissions = (
      (await db
        .prepare(
          "SELECT s.* FROM submissions s JOIN users u ON u.id=s.user_id WHERE u.institutionId IS ? ORDER BY s.created_at DESC",
        )
        .all(user.institutionId)) as any[]
    ).filter((s) => ids.has(s.user_id)),
    reports = await listGuidance(user),
    reportStudents = new Set(
      reports.filter((r) => r.status === "available").map((r) => r.student.id),
    ),
    completed = new Set<string>(),
    started = new Set<string>();
  for (const student of students) {
    const own = submissions.filter((s) => s.user_id === student.id),
      expected =
        (await document(student.id, "rv360:battery"))?.instruments ||
        instruments;
    if (
      expected.length &&
      expected.every((t: any) =>
        own.some((s) => s.instrument_id === t.id && s.version === t.version),
      )
    )
      completed.add(student.id);
    const drafts = (await db
      .prepare(
        "SELECT value FROM documents WHERE owner=? AND key LIKE 'rv360:answers:%'",
      )
      .all(student.id)) as any[];
    if (
      own.length ||
      drafts.some((d) => Object.keys(JSON.parse(d.value) || {}).length)
    )
      started.add(student.id);
  }
  return {
    studentProgress: students.map((s) => ({
      id: s.id,
      name: s.name,
      group: s.groupName || "Sin grupo",
      status: s.status,
      started: started.has(s.id),
      completed: completed.has(s.id),
      report: reportStudents.has(s.id),
    })),
    events: submissions.map((s) => ({
      id: s.id,
      studentId: s.user_id,
      testId: s.instrument_id + ":" + s.version,
      title: JSON.parse(s.snapshot).title + " · v" + s.version,
      date: s.created_at,
    })),
    source: "server" as const,
    generatedAt: new Date().toISOString(),
  };
}
