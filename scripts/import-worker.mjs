const send = message => new Promise((resolve, reject) => {
  if (!process.connected || !process.send) return reject(new Error('Import channel closed'));
  process.send(message, error => error ? reject(error) : resolve());
});

function isDependencyError(error) {
  const errors = [error], seen = new Set();
  // Native loaders wrap MODULE_NOT_FOUND/ERR_DLOPEN_FAILED in Error.cause;
  // inspect that chain without returning deployment paths to the client.
  for (let index = 0; index < errors.length && index < 32; index++) {
    const current = errors[index];
    if (!current || typeof current !== 'object' || seen.has(current)) continue;
    seen.add(current);
    if (['MODULE_NOT_FOUND', 'ERR_MODULE_NOT_FOUND', 'ERR_DLOPEN_FAILED'].includes(current.code)
      || /^(?:Cannot find native binding|Failed to load native binding)\b/i.test(current.message || ''))
      return true;
    if (current.cause) errors.push(current.cause);
    if (Array.isArray(current.errors)) errors.push(...current.errors.slice(0, 32));
  }
  return false;
}

process.once('message', async ({data, name, educationLevel}) => {
  try {
    if (!['bachillerato', 'universidad'].includes(educationLevel))
      throw new Error('Selecciona la categoría del documento.');
    // Load inside the guarded task: missing deployment dependencies must be
    // reported to the administrator instead of silently terminating the worker.
    const {extractFile, proposeTests} = await import('../lib/server/importer.ts');
    const extracted = await extractFile(Buffer.from(data, 'base64'), name,
      progress => { void send({progress}).catch(() => {}); });
    await send({result: {
      text: extracted.text, warnings: extracted.warnings, images: extracted.images,
      educationLevel,
      tests: proposeTests(extracted.text, extracted.embedded, name)
        .map(test => ({...test, educationLevel})),
    }});
  } catch (error) {
    const dependencyError = isDependencyError(error);
    await send({
      error: dependencyError
        ? 'El servidor no tiene todos los componentes de importación. Actualiza el despliegue y reintenta.'
        : error instanceof Error ? error.message : 'No se pudo extraer el documento.',
      ...(dependencyError ? {code: 'IMPORT_DEPENDENCY_MISSING'} : {}),
    }).catch(() => {});
  } finally {
    // Wait for the final IPC callback above before closing the channel.
    if (process.connected) process.disconnect();
    // A failed OCR initialization can leave an inaccessible worker thread alive.
    // This process handles exactly one document; exiting also terminates those
    // threads after its final result has been flushed to the parent.
    process.exit(0);
  }
});
