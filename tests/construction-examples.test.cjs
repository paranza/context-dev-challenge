const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const vm = require('node:vm');

test('public suggestions contain 10–15 independently reviewed cases and withhold rejected companies', () => {
  const root = path.resolve(__dirname, '..');
  const code = ts.transpileModule(fs.readFileSync(path.join(root, 'src/lib/construction-examples.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const mod = { exports: {} };
  vm.runInNewContext(code, { exports: mod.exports, module: mod });
  const examples = mod.exports.testedConstructionExamples();
  const report = JSON.parse(fs.readFileSync(path.join(root, 'docs/construction-evaluation.json'), 'utf8'));
  assert.ok(examples.length >= 10 && examples.length <= 15);
  assert.equal(new Set(examples.map((item) => new URL(item.url).hostname.replace(/^www\./, ''))).size, examples.length);
  for (const example of examples) {
    const review = report.companies.find((item) => item.id === example.id);
    assert.equal(review?.approved, true, `${example.name} needs a passing review`);
    assert.ok(review.example?.url?.startsWith('https://ted.europa.eu/'), `${example.name} needs its checked official notice`);
    assert.equal(example.verifiedAt, report.checkedAt);
  }
  for (const excluded of report.companies.filter((item) => !item.approved)) {
    assert.equal(examples.some((item) => item.id === excluded.id), false, `${excluded.name} must stay out of the picker`);
  }
});
