import 'server-only';
import nodemailer from 'nodemailer';
import { mailConfig } from './mail-config.mjs';
import { smtpDiagnostic } from './mail-error.mjs';

export async function sendAccountMail(to: string, subject: string, text: string) {
  const config = mailConfig();
  if (config.errors.length) throw Object.assign(new Error('El correo de recuperación no está configurado. Contacta con soporte.'), { status: 503 });
  const transport = nodemailer.createTransport(config.transport);
  try {
    const info = await transport.sendMail({ from: config.from, to, subject, text });
    if (!info.accepted?.length) throw Object.assign(new Error('Recipient rejected'), {code:'EENVELOPE'});
  } catch (error) {
    console.error(smtpDiagnostic(error));
    // Never expose SMTP credentials, recipient addresses or reset links in errors.
    throw Object.assign(new Error('No pudimos enviar el correo en este momento. Inténtalo más tarde o contacta con soporte.'), { status: 503 });
  } finally {
    transport.close();
  }
}
