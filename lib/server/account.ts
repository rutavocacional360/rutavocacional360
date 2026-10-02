import { nameProblem, emailProblem, passwordProblem, normalizeName } from "../validation";
import { mailConfigured, mailConfig } from "./mail-config.mjs";
import { sendAccountMail } from "./mail";
import { educationProfile } from "./education";
import { randomBytes } from "node:crypto";
import {
  db,
  document,
  put,
  fail,
  passwordMatches,
  passwordHash,
  createSession,
  hash,
  rateLimit,
} from "./store";
async function reauthenticate(user: any, password: unknown) {
  await rateLimit("reauth:" + user.id);
  const row = (await db
    .prepare("SELECT password FROM users WHERE id=?")
    .get(user.id)) as any;
  if (
    typeof password !== "string" ||
    password.length > 128 ||
    !passwordMatches(password, row.password)
  )
    fail("La contraseña actual no es correcta.", 403);
}
export async function updateProfile(user: any, body: any) {
  if(typeof body.firstName!=="string"||typeof body.lastName!=="string"||
    (body.stage!==undefined&&(typeof body.stage!=="string"||body.stage.length>100)))fail("Revisa nombres, apellidos y etapa educativa.");
  const firstName = normalizeName(body.firstName),
    lastName = normalizeName(body.lastName);
  if (nameProblem(firstName,60) || nameProblem(lastName,79))
    fail("Revisa nombres y apellidos.");
  const previous = await document(user.id, "rv360:profile", {});
  const profile = {
    ...previous,
    firstName,
    lastName,
    name: firstName + " " + lastName,
    email: user.email,
    stage: String(body.stage || "").slice(0, 100),
    ...(user.role === "student" ? educationProfile({...previous,...body}) : {}),
  };
  await db.exec("BEGIN IMMEDIATE");
  try {
    await db
      .prepare("UPDATE users SET name=? WHERE id=?")
      .run(profile.name, user.id);
    await put(user.id, "rv360:profile", profile);
    await db.exec("COMMIT");
  } catch (e) {
    await db.exec("ROLLBACK");
    throw e;
  }
  return { ok: true };
}
export async function changePassword(user: any, body: any) {
  await reauthenticate(user, body.currentPassword);
  if (
    passwordProblem(body.password) ||
    body.password !== body.confirm
  )
    fail(
      "La nueva contraseña debe coincidir y tener entre 15 y 128 caracteres.",
    );
  await db.transaction(async () => {
    await db
      .prepare("UPDATE users SET password=? WHERE id=?")
      .run(passwordHash(body.password), user.id);
    await db.prepare("DELETE FROM sessions WHERE userId=?").run(user.id);
    await db.prepare("DELETE FROM resets WHERE userId=?").run(user.id);
  });
  await createSession(user.id);
  return { ok: true };
}
export async function requestEmail(user: any, body: any) {
  await reauthenticate(user, body.currentPassword);
  if (!mailConfigured())
    fail(
      "El cambio de correo no está disponible en este momento. Tu correo actual se mantiene.",
      503,
    );
  if (emailProblem(body.email)) fail("Escribe un correo válido.");
  const email = String(body.email || "")
    .trim()
    .toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 254)
    fail("Escribe un correo válido.");
  if (await db.prepare("SELECT id FROM users WHERE email=?").get(email))
    fail("No se puede utilizar este correo.");
  const token = randomBytes(24).toString("hex");
  await put(user.id, "rv360:email-change", {
    email,
    token: hash(token),
    expires: Date.now() + 1800000,
  });
  await sendAccountMail(
    email,
    "Confirma tu nuevo correo · Ruta Vocacional 360°",
    "Con tu sesión abierta, confirma el cambio en " + mailConfig().origin +
      (user.role === "student" ? "/mi-ruta/perfil" : "/admin/cuenta") +
      "?confirmEmail=" + token + "\nEl enlace vence en 30 minutos.",
  );
  return { ok: true };
}
export async function confirmEmail(user: any, body: any) {
  const pending = await document(user.id, "rv360:email-change");
  if (
    !pending ||
    pending.expires < Date.now() ||
    pending.token !== hash(String(body.token))
  )
    fail("El enlace venció o no corresponde a esta cuenta.");
  if (await db.prepare("SELECT id FROM users WHERE email=?").get(pending.email))
    fail("No se puede utilizar este correo.");
  await db.exec("BEGIN IMMEDIATE");
  try {
    await db
      .prepare("UPDATE users SET email=? WHERE id=?")
      .run(pending.email, user.id);
    await put(user.id, "rv360:profile", {
      ...(await document(user.id, "rv360:profile", {})),
      email: pending.email,
    });
    await db
      .prepare("DELETE FROM documents WHERE owner=? AND key=?")
      .run(user.id, "rv360:email-change");
    await db.prepare("DELETE FROM sessions WHERE userId=?").run(user.id);
    await db.exec("COMMIT");
  } catch (e) {
    await db.exec("ROLLBACK");
    throw e;
  }
  await createSession(user.id);
  return { ok: true };
}
