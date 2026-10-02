import nextEnv from '@next/env';
import nodemailer from 'nodemailer';
import { mailConfig } from '../lib/server/mail-config.mjs';
import { smtpDiagnostic } from '../lib/server/mail-error.mjs';

nextEnv.loadEnvConfig(process.cwd());
const config = mailConfig();
if (config.errors.length) {
  console.error(config.errors.join('\n'));
  process.exitCode = 1;
} else {
  const transport = nodemailer.createTransport(config.transport);
  try {
    await transport.verify();
    console.log('SMTP: conexión, TLS y autenticación correctos. No se envió ningún correo. Prueba después /recuperar con una cuenta tuya.');
  } catch (error) {
    console.error(smtpDiagnostic(error));
    process.exitCode = 1;
  } finally { transport.close(); }
}
