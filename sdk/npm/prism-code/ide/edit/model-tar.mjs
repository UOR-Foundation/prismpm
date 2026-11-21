// A model as one file a reader can take out of the browser: a tar archive that unpacks into a LexLean project.
//
// The archive is written the same way every time: paths in order, no dates, no owners, one mode. So the same model
// gives the same bytes, and the archive has one UOR content address, the BLAKE3 label prism-code's blake3.mjs gives.
// Two people who download the same model hold the same label; a model changed by one character has another.
//
// The format is ustar (POSIX.1-1988), which every tar reads. Nothing is compressed.

import { kappa } from './prism-code/blake3.mjs';

const enc = new TextEncoder();
const BLOCK = 512;

function field(block, at, length, text) {
  const bytes = enc.encode(text);
  if (bytes.length > length) throw new Error(`"${text}" does not fit a tar field of ${length} bytes`);
  block.set(bytes, at);
}

/** Split a path into ustar's prefix and name, at a slash, or throw when it fits neither. */
function splitPath(path) {
  if (enc.encode(path).length <= 100) return { prefix: '', name: path };
  for (let at = path.indexOf('/'); at !== -1; at = path.indexOf('/', at + 1)) {
    const prefix = path.slice(0, at);
    const name = path.slice(at + 1);
    if (enc.encode(prefix).length <= 155 && enc.encode(name).length <= 100 && name.length > 0) return { prefix, name };
  }
  throw new Error(`${path} is too long for a tar archive`);
}

function header(path, size) {
  const block = new Uint8Array(BLOCK);
  const { prefix, name } = splitPath(path);
  field(block, 0, 100, name);
  field(block, 100, 8, '0000644\0');
  field(block, 108, 8, '0000000\0');
  field(block, 116, 8, '0000000\0');
  field(block, 124, 12, size.toString(8).padStart(11, '0') + '\0');
  field(block, 136, 12, '00000000000\0');
  block.fill(0x20, 148, 156); // the checksum is taken with its own field as spaces
  block[156] = 0x30; // a regular file
  field(block, 257, 6, 'ustar\0');
  field(block, 263, 2, '00');
  field(block, 345, 155, prefix);
  const sum = block.reduce((total, byte) => total + byte, 0);
  field(block, 148, 8, sum.toString(8).padStart(6, '0') + '\0 ');
  return block;
}

/**
 * The archive of a model: `files` is `{ path: text }`, each path relative to the model's folder, with or without a
 * leading slash. Every file is placed under `folder/`. Resolves nothing asynchronously: returns `{ bytes, label }`.
 */
export function modelTar(files, { folder = 'model' } = {}) {
  if (!/^[A-Za-z0-9._-]+$/.test(folder)) throw new Error('the folder name may hold letters, digits, dots, dashes and underscores only');
  const entries = Object.entries(files).map(([path, text]) => [path.replace(/^\/+/, ''), text]).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const parts = [];
  for (const [path, text] of entries) {
    // A path that could leave the folder it is unpacked into is refused, whoever wrote the listing.
    if (path === '' || path.split('/').some((part) => part === '' || part === '.' || part === '..') || path.includes('\\') || path.includes('\0')) throw new Error(`${JSON.stringify(path)} is not a path inside the model`);
    const body = enc.encode(text);
    parts.push(header(`${folder}/${path}`, body.length), body, new Uint8Array((BLOCK - (body.length % BLOCK)) % BLOCK));
  }
  parts.push(new Uint8Array(2 * BLOCK)); // the end of the archive
  const bytes = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let at = 0;
  for (const part of parts) { bytes.set(part, at); at += part.length; }
  return { bytes, label: kappa(bytes) };
}
