import { crc32, inflateRawSync } from 'node:zlib';
import { DOMParser } from 'linkedom';

const MAX_EXPANDED_BYTES = 50_000_000;

/** Inspect the archive before any decompression, without writing uploaded paths. */
export function documentArchive(bytes: Buffer, format: string) {
  const invalid = () => new Error('La estructura del documento ' + format + ' no es válida.');
  if (bytes.length < 22 || bytes.readUInt32LE(0) !== 0x04034b50) throw invalid();
  let end = -1;
  for (let offset = bytes.length - 22; offset >= Math.max(0, bytes.length - 65_557); offset--) {
    if (bytes.readUInt32LE(offset) === 0x06054b50 && offset + 22 + bytes.readUInt16LE(offset + 20) === bytes.length) { end = offset; break; }
  }
  if (end < 0) throw invalid();
  const count = bytes.readUInt16LE(end + 10);
  if (count > 1000) throw Error('El documento contiene demasiados archivos internos.');
  if (bytes.readUInt16LE(end + 4) || bytes.readUInt16LE(end + 6) || bytes.readUInt16LE(end + 8) !== count) throw invalid();
  let cursor = bytes.readUInt32LE(end + 16), expanded = 0;
  const directoryEnd = cursor + bytes.readUInt32LE(end + 12);
  if (directoryEnd !== end) throw invalid();
  const entries = new Map<string, { size: number; compressed: number; offset: number; method: number; checksum: number; flags: number }>();
  for (let i = 0; i < count; i++) {
    if (cursor + 46 > end || bytes.readUInt32LE(cursor) !== 0x02014b50) throw invalid();
    const flags = bytes.readUInt16LE(cursor + 8), method = bytes.readUInt16LE(cursor + 10);
    const compressed = bytes.readUInt32LE(cursor + 20), size = bytes.readUInt32LE(cursor + 24);
    const nameLength = bytes.readUInt16LE(cursor + 28), extra = bytes.readUInt16LE(cursor + 30), comment = bytes.readUInt16LE(cursor + 32);
    const offset = bytes.readUInt32LE(cursor + 42), checksum = bytes.readUInt32LE(cursor + 16);
    if (flags & 1) throw Error('El documento está cifrado. Sube una copia sin contraseña.');
    if (![0, 8].includes(method) || cursor + 46 + nameLength + extra + comment > end) throw invalid();
    expanded += size;
    if (expanded > MAX_EXPANDED_BYTES) throw Error('El documento descomprimido excede el límite permitido.');
    const name = bytes.subarray(cursor + 46, cursor + 46 + nameLength).toString('utf8');
    if (entries.has(name)) throw invalid();
    entries.set(name, { size, compressed, offset, method, checksum, flags });
    cursor += 46 + nameLength + extra + comment;
  }
  if (cursor !== directoryEnd) throw invalid();
  return {
    has: (name: string) => entries.has(name),
    read(name: string) {
      const entry = entries.get(name);
      if (!entry) throw invalid();
      const { offset, compressed, size, method, checksum, flags } = entry;
      if (offset + 30 > end || bytes.readUInt32LE(offset) !== 0x04034b50) throw invalid();
      const nameLength = bytes.readUInt16LE(offset + 26);
      const dataStart = offset + 30 + nameLength + bytes.readUInt16LE(offset + 28);
      if (dataStart + compressed > bytes.readUInt32LE(end + 16)) throw invalid();
      if (bytes.readUInt16LE(offset + 6) !== flags || bytes.readUInt16LE(offset + 8) !== method || bytes.subarray(offset + 30, offset + 30 + nameLength).toString('utf8') !== name) throw invalid();
      if (!(flags & 8) && (bytes.readUInt32LE(offset + 14) !== checksum || bytes.readUInt32LE(offset + 18) !== compressed || bytes.readUInt32LE(offset + 22) !== size)) throw invalid();
      const data = bytes.subarray(dataStart, dataStart + compressed);
      const result = method === 0 ? data : inflateRawSync(data, { maxOutputLength: Math.max(1, size) });
      if (result.length !== size || crc32(result) !== checksum) throw invalid();
      return result;
    },
  };
}

export function decodeDocumentText(bytes: Buffer) {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes);
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes);
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { return new TextDecoder('windows-1252').decode(bytes); }
}

export function plainDocumentText(bytes: Buffer, markdown = false) {
  let text = decodeDocumentText(bytes).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  if (/[\x00-\x08\x0E-\x1F]/.test(text)) throw Error('El archivo no contiene texto legible. Exporta el documento como TXT, DOCX o PDF.');
  if (markdown) text = text.replace(/^\s*```[^\n]*$/gm, '').replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/\*\*([^\n]+?)\*\*/g, '$1').replace(/__([^\n]+?)__/g, '$1')
    .replace(/^\s*[-*+]\s+(?=[a-h][.)])/gim, '').replace(/\[([^\]\n]+)\]\([^\n)]*\)/g, '$1');
  return text;
}

/** Read RTF text and Unicode controls; never execute fields or embedded objects. */
export function rtfDocumentText(bytes: Buffer) {
  const raw = bytes.toString('latin1');
  if (!/^\s*\{\\rtf1\b/.test(raw)) throw Error('El archivo no es un documento RTF válido.');
  type State = { skip: boolean; uc: number; encoding: string };
  let state: State = { skip: false, uc: 1, encoding: 'windows-1252' }, fallback = 0;
  const stack: State[] = [], parts: string[] = [], pending: number[] = [];
  let decoder: TextDecoder | undefined, closed = false;
  const hidden = new Set(['fonttbl', 'colortbl', 'stylesheet', 'info', 'pict', 'object', 'objdata', 'fldinst', 'header', 'headerl', 'headerr', 'footer', 'footerl', 'footerr', 'listtable', 'listoverridetable', 'xmlnstbl', 'datastore', 'themedata', 'generator', 'nonshppict']);
  const flush = (final = true) => {
    if (pending.length || decoder) {
      decoder ||= new TextDecoder(state.encoding, { fatal: true });
      try { parts.push(decoder.decode(Uint8Array.from(pending), { stream: !final })); }
      catch { throw Error('El RTF contiene texto con codificación no válida. Guárdalo como DOCX o TXT UTF-8.'); }
      pending.length = 0;
    }
    if (final) decoder = undefined;
  };
  const emitByte = (value: number) => { if (fallback > 0) { fallback--; return; } if (!state.skip) { pending.push(value); if (pending.length >= 65_536) flush(false); } };
  const emit = (value: string) => { flush(); if (fallback > 0) { fallback--; return; } if (!state.skip) parts.push(value); };
  for (let i = 0; i < raw.length;) {
    const char = raw[i++];
    if (closed) { if (!/\s/.test(char)) throw Error('El documento RTF está incompleto o contiene datos fuera del documento.'); continue; }
    if (char === '{') { flush(); if (stack.length > 100) throw Error('El RTF contiene demasiados niveles de formato.'); stack.push({ ...state }); continue; }
    if (char === '}') { flush(); if (!stack.length) throw Error('El documento RTF está incompleto.'); state = stack.pop()!; if (!stack.length) closed = true; continue; }
    if (char === '\r' || char === '\n') continue;
    if (char !== '\\') { emitByte(char.charCodeAt(0)); continue; }
    if (raw[i] === "'") {
      const hex = raw.slice(i + 1, i + 3);
      if (!/^[\da-f]{2}$/i.test(hex)) throw Error('El RTF contiene un carácter codificado no válido.');
      i += 3; emitByte(parseInt(hex, 16)); continue;
    }
    if (raw[i] === '*') { flush(); state.skip = true; i++; continue; }
    if ('\\{}'.includes(raw[i] || '\0')) { emitByte(raw.charCodeAt(i++)); continue; }
    if (raw[i] === '~') { i++; emit(' '); continue; }
    if (raw[i] === '_') { i++; emit('-'); continue; }
    const control = raw.slice(i).match(/^([a-z]+)(-?\d+)? ?/i);
    if (!control) { i++; continue; }
    i += control[0].length;
    flush();
    const word = control[1], number = Number(control[2]);
    if (hidden.has(word)) state.skip = true;
    if (word === 'bin') { if (!Number.isInteger(number) || number < 0 || i + number > raw.length) throw Error('El RTF contiene datos incompletos.'); i += number; }
    else if (word === 'uc') state.uc = Math.min(16, Math.max(0, number || 0));
    else if (word === 'u') { if (!state.skip) parts.push(String.fromCharCode(number & 0xffff)); fallback = state.uc; }
    else if (word === 'ansicpg') {
      const encoding = number === 65001 ? 'utf-8' : 'windows-' + number;
      try { new TextDecoder(encoding); state.encoding = encoding; } catch { throw Error('La codificación del RTF no es compatible. Guárdalo como DOCX o TXT UTF-8.'); }
    } else if (['par', 'line', 'row'].includes(word)) { fallback = 0; if (!state.skip) parts.push('\n'); }
    else if (['tab', 'cell'].includes(word)) emit(' ');
    else if (word === 'emdash') emit('—');
    else if (word === 'endash') emit('–');
    else if (word === 'bullet') emit('•');
  }
  flush();
  if (stack.length) throw Error('El documento RTF está incompleto.');
  return parts.join('');
}

/** Preserve ODT paragraph/list/table semantics for the shared question parser. */
export function odtDocumentMarkup(bytes: Buffer) {
  const archive = documentArchive(bytes, 'ODT');
  if (archive.read('mimetype').toString().trim() !== 'application/vnd.oasis.opendocument.text')
    throw Error('El archivo no es un documento de texto OpenDocument (.odt).');
  const xml = archive.read('content.xml').toString('utf8');
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw Error('El ODT contiene declaraciones XML no admitidas.');
  const document = new DOMParser().parseFromString(xml, 'text/xml');
  const body = document.getElementsByTagName('office:text')[0];
  if (!body) throw Error('No se encontró contenido de texto en el ODT.');
  const escape = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const listStyles = new Map<string, Map<number, boolean>>();
  for (const style of Array.from(document.getElementsByTagName('text:list-style'))) {
    listStyles.set(style.getAttribute('style:name') || '', new Map(Array.from(style.children).map((level: any) => [Number(level.getAttribute('text:level') || 1), level.tagName === 'text:list-level-style-number' && level.getAttribute('style:num-format') === '1'])));
  }
  const render = (node: any, depth = 0, listStyle = ''): string => {
    if (depth > 100) throw Error('El ODT contiene demasiados niveles de formato.');
    if (node.nodeType === 3) return escape(node.textContent || '');
    if (node.nodeType !== 1) return '';
    const tag = node.tagName;
    if (['office:annotation', 'text:note', 'text:tracked-changes', 'draw:frame', 'text:script'].includes(tag)) return '';
    if (tag === 'text:line-break') return '<br>';
    if (tag === 'text:tab') return ' ';
    if (tag === 'text:s') return ' '.repeat(Math.min(100, Number(node.getAttribute('text:c')) || 1));
    const style = tag === 'text:list' ? node.getAttribute('text:style-name') || listStyle : listStyle;
    const children = Array.from(node.childNodes).map(child => render(child, depth + 1, style)).join('');
    if (tag === 'text:list') {
      let level = 1, parent = node.parentElement;
      while (parent) { if (parent.tagName === 'text:list') level++; parent = parent.parentElement; }
      const htmlTag = listStyles.get(style)?.get(level) ? 'ol' : 'ul';
      return '<' + htmlTag + '>' + children + '</' + htmlTag + '>';
    }
    const htmlTag = ({ 'text:p': 'p', 'text:h': 'h2', 'text:list-item': 'li', 'table:table': 'table', 'table:table-row': 'tr', 'table:table-cell': 'td' } as Record<string, string>)[tag];
    return htmlTag ? '<' + htmlTag + '>' + children + '</' + htmlTag + '>' : children;
  };
  return render(body);
}
