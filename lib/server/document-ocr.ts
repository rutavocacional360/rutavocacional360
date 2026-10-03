import type { Worker } from 'tesseract.js';

const unavailable = () => new Error(
  'No se pudo preparar la lectura del PDF escaneado. Comprueba el acceso del servidor a los idiomas OCR o sube una versión PDF con texto, Word o HTML.',
);

export async function createDocumentOcr(): Promise<Worker> {
  const {createWorker, OEM} = await import('tesseract.js');
  return new Promise((resolve, reject) => {
    let failed = false;
    const onError = () => {
      failed = true;
      reject(unavailable());
    };
    // Tesseract reports loadLanguage/initialize errors through errorHandler,
    // while its createWorker promise can remain pending. Reject our own promise
    // so extraction can report a useful error and the isolated process can exit.
    try {
      void createWorker('spa+eng', OEM.LSTM_ONLY, {errorHandler: onError})
        .then(worker => {
          if (failed) void worker.terminate().catch(() => {});
          else resolve(worker);
        }, onError);
    } catch {
      onError();
    }
  });
}
