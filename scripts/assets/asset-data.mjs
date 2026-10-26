/** Validation shared by the offline asset importers. */
import fs from 'node:fs';

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** @param {unknown} value @param {string} label */
export function assetRecord(value, label) {
  if (!isRecord(value)) throw new Error(`${label}: expected an object`);
  return value;
}

/** @param {string} file @returns {Map<string, string>} */
export function readPins(file) {
  if (!fs.existsSync(file)) return new Map();
  const record = assetRecord(JSON.parse(fs.readFileSync(file, 'utf8')), file);
  /** @type {Map<string, string>} */
  const pins = new Map();
  for (const [name, hash] of Object.entries(record)) {
    if (typeof hash !== 'string' || !/^[a-f0-9]{64}$/.test(hash))
      throw new Error(`${file}: invalid SHA-256 pin for ${name}`);
    pins.set(name, hash);
  }
  return pins;
}

/** @param {unknown} value @param {string} label @returns {string[]} */
export function gltfUris(value, label) {
  const document = assetRecord(value, label);
  const uris = [];
  for (const key of ['buffers', 'images']) {
    const list = document[key];
    if (list === undefined) continue;
    if (!Array.isArray(list)) throw new Error(`${label}: ${key} must be an array`);
    /** @type {unknown[]} */
    const entries = list;
    for (const entry of entries) {
      const uri = assetRecord(entry, `${label}: ${key} entry`)['uri'];
      if (uri === undefined) continue;
      if (typeof uri !== 'string') throw new Error(`${label}: URI must be a string`);
      if (uri) uris.push(uri);
    }
  }
  return uris;
}
