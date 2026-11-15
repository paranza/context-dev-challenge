// Run the TypeScript policy tests with the repository's existing compiler.
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
function load(file) {
  const output = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const mod = { exports: {} };
  const localRequire = (id) => id === './research-plan' ? load(path.join(path.dirname(file), 'research-plan.ts')) : require(id);
  new Function('require', 'module', 'exports', output)(localRequire, mod, mod.exports);
  return mod.exports;
}
load(path.resolve(__dirname, '../src/lib/research-plan.test.ts'));
