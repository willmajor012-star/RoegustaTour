import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import ts from 'typescript';

const require = createRequire(import.meta.url);
export function loadTs(path, overrides = {}) {
  const cache = new Map();
  function load(file) {
    file = resolve(file);
    if (cache.has(file)) return cache.get(file).exports;
    const module = { exports: {} };
    cache.set(file, module);
    const source = overrides[file] ?? readFileSync(file, 'utf8');
    const { outputText } = ts.transpileModule(source, {
      fileName: file,
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    });
    new Function('exports', 'require', 'module', outputText)(module.exports, (name) => {
      if (!name.startsWith('.')) return require(name);
      const base = resolve(dirname(file), name);
      const next = [base, `${base}.ts`, `${base}.tsx`].find(existsSync);
      if (!next) throw new Error(`Cannot resolve ${name} from ${file}`);
      return load(next);
    }, module);
    return module.exports;
  }
  return load(path);
}
