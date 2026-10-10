import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SRC = new URL('../src/', import.meta.url);
const SUFFIXES = ['', '.ts', '.json', '/index.ts'];

function locate(base) {
  for (const suffix of SUFFIXES) {
    const url = new URL(base.href + suffix);
    if (existsSync(fileURLToPath(url)) && !fileURLToPath(url).endsWith('/')) {
      try {
        readFileSync(fileURLToPath(url));
        return url;
      } catch {
        // a directory: try the next suffix
      }
    }
  }
  return undefined;
}

export async function resolve(specifier, context, next) {
  let base;
  if (specifier.startsWith('@/')) base = new URL(specifier.slice(2), SRC);
  else if (specifier.startsWith('.') && context.parentURL?.startsWith('file:')) base = new URL(specifier, context.parentURL);
  const url = base && locate(base);
  return url ? next(url.href, context) : next(specifier, context);
}

export async function load(url, context, next) {
  if (url.endsWith('.json') && url.startsWith('file:')) {
    const source = `export default ${readFileSync(fileURLToPath(url), 'utf8')};`;
    return { format: 'module', source, shortCircuit: true };
  }
  return next(url, context);
}
