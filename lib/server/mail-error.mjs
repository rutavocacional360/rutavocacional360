// Never log the original SMTP response: it may contain recipients or credentials.
export function smtpDiagnostic(error) {
  const hints = {
    EAUTH: 'Hostinger rechazó la autenticación. Revisa SMTP_USER y la contraseña del buzón o de aplicación en SMTP_PASSWORD.',
    ENOAUTH: 'Faltan credenciales SMTP. Revisa SMTP_USER y SMTP_PASSWORD.',
    ECONNECTION: 'No se pudo conectar al correo. Revisa SMTP_HOST, SMTP_PORT y el acceso saliente del alojamiento.',
    ETIMEDOUT: 'El servidor de correo no respondió a tiempo. Revisa conectividad, puerto y disponibilidad SMTP.',
    ESOCKET: 'Falló la conexión SMTP. Revisa el puerto, SMTP_SECURE y los certificados del servidor.',
    EDNS: 'No se pudo resolver SMTP_HOST. Revisa el nombre del servidor de correo.',
    ETLS: 'Falló el cifrado SMTP. Revisa la combinación de puerto y SMTP_SECURE; no desactives la verificación del certificado.',
    EENVELOPE: 'El servidor rechazó el remitente o destinatario. Revisa SMTP_FROM, el estado del buzón y la conexión del dominio.',
    EMESSAGE: 'El servidor rechazó el mensaje. Revisa los límites y registros de entrega del proveedor de correo.',
    EPROTOCOL: 'Respuesta SMTP no válida. Revisa host, puerto y cifrado.',
  };
  const code = Object.hasOwn(hints, error?.code) ? error.code : 'SMTP_ERROR';
  const status = Number.isInteger(error?.responseCode) && error.responseCode >= 400 && error.responseCode <= 599
    ? ' status='+error.responseCode : '';
  const command = ['CONN','EHLO','HELO','STARTTLS','AUTH','AUTH LOGIN','AUTH PLAIN','MAIL FROM','RCPT TO','DATA'].includes(error?.command)
    ? ' command='+error.command : '';
  return '[SMTP] code='+code+status+command+'. '+(hints[code] || 'Falló el envío de correo. Revisa la configuración SMTP y los registros de entrega del proveedor.');
}
