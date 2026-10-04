// Bump when extraction changes invalidate already stored document proposals.
// Published tests and simulators are independent snapshots and are never rebuilt.
export const DOCUMENT_EXTRACTION_VERSION = 3;

export function currentDocumentExtraction(record: {
  status?: unknown;
  extractionVersion?: unknown;
}) {
  return record.status === "Completado" &&
    record.extractionVersion === DOCUMENT_EXTRACTION_VERSION;
}
