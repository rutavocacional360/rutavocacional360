/** Shared by upload controls, the API and the extraction worker. */
export const DOCUMENT_MAX_BYTES = 10_000_000;
export const DOCUMENT_EXTENSIONS = ['pdf', 'docx', 'html', 'htm', 'txt', 'md', 'rtf', 'odt'] as const;
export const DOCUMENT_ACCEPT = DOCUMENT_EXTENSIONS.map(extension => '.' + extension).join(',');
export const DOCUMENT_FORMAT_LABEL = 'PDF, Word (.docx), HTML (.html o .htm), texto (.txt), Markdown (.md), RTF y OpenDocument (.odt)';
export const DOCUMENT_FORMAT_HELP = 'Hasta 10 MB. Los PDF escaneados necesitan reconocimiento de texto (OCR). Convierte los archivos Word antiguos (.doc) a .docx.';

export function documentExtension(name: string) {
  return name.split('.').pop()?.toLowerCase() || '';
}

export function documentFileError(name: string, size: number): string | undefined {
  if (!size) return 'El archivo está vacío. Selecciona un documento con preguntas.';
  if (size > DOCUMENT_MAX_BYTES) return 'El límite por archivo es 10 MB.';
  const extension = documentExtension(name);
  if (extension === 'doc') return 'Word antiguo (.doc) no es compatible. Ábrelo en Word o LibreOffice y guárdalo como .docx, .odt o PDF.';
  if (!(DOCUMENT_EXTENSIONS as readonly string[]).includes(extension))
    return 'Formato no compatible. Selecciona ' + DOCUMENT_FORMAT_LABEL + '.';
}
