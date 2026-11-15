// Run with: node --test tests/tender-monitor.test.cjs
// Transpile TSX in memory; the suite never starts Next or calls a live API.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const root = path.resolve(__dirname, '..');
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (name, ...args) {
  let resolved = name.startsWith('@/') ? path.join(root, 'src', name.slice(2)) : name;
  // Node's custom extension order differs from Next's .tsx-before-.css resolution.
  if (resolved === './tender-monitor') resolved += '.tsx';
  return originalResolve.call(this, resolved, ...args);
};
require.extensions['.css'] = () => {};
for (const ext of ['.ts', '.tsx']) {
  require.extensions[ext] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true, target: ts.ScriptTarget.ES2022 },
  }).outputText, filename);
}
const { normalizeMonitor, monitorUrl, canMonitorTender, monitorEndTime, localMonitorDate, TenderMonitor } = require('../src/components/tender-monitor.tsx');
const { TenderWorkspace } = require('../src/components/tender-workspace.tsx');
const { DEMO_SCAN } = require('../src/lib/demo.ts');
const tender = { ...DEMO_SCAN.tenders[0], id: 'notice-1', url: 'https://ted.europa.eu/en/notice/123', documentsRead: 1, sources: [{ label: 'Original', url: 'https://ted.europa.eu/en/notice/123' }] };
const saved = { token: 'public_payload.public_signature', tenderId: tender.id, tenderTitle: tender.title, tenderUrl: tender.url, endsAt: new Date(Date.now() + 7 * 86400000).toISOString(), frequencyHours: 24, status: 'active', webhookConnected: false, changes: [] };
function store(monitor = normalizeMonitor(saved)) { return { monitors: { [tender.url]: monitor }, pending: {}, errors: {}, ready: true, storageError: '', start() { throw Error('Unexpected create'); }, pause() { throw Error('Unexpected pause'); } }; }
function panel(value, isDemo = false) { return renderToStaticMarkup(React.createElement(TenderMonitor, { tender, isDemo, store: value })); }

test('only registered HTTPS source URLs can be monitored or linked', () => {
  for (const url of ['javascript:alert(1)', 'https://ted.europa.eu.evil.test/a', 'https://user:pass@ted.europa.eu/a', 'http://ted.europa.eu/a']) assert.equal(monitorUrl(url), '');
  assert.equal(monitorUrl(tender.url + '#docs'), tender.url);
  assert.equal(canMonitorTender(tender), true);
  assert.equal(canMonitorTender({ ...tender, documentsRead: 0 }), false);
  assert.equal(canMonitorTender({ ...tender, sources: [], authoritySource: null, researchFields: undefined, requirements: [] }), false);
});

test('corrupt saved monitors are rejected and public views contain only normalized fields', () => {
  for (const value of [null, [], 'bad', { ...saved, token: 'broken' }, { ...saved, frequencyHours: 12 }, { ...saved, endsAt: 'bad' }, { ...saved, tenderUrl: 'https://example.com/' }]) assert.equal(normalizeMonitor(value), null);
  const value = normalizeMonitor({ ...saved, ignoredSecret: 'discard', changes: [null, { id: 'c1', detectedAt: '2026-11-15T12:00:00Z', title: 'Deadline amended', url: 'javascript:alert(1)' }] });
  assert.equal('ignoredSecret' in value, false);
  assert.equal(value.changes.length, 1);
  assert.equal(value.changes[0].url, tender.url);
});

test('end dates are valid local dates within the server monitoring window', () => {
  for (const value of ['', '2026-02-31', localMonitorDate(0), localMonitorDate(181)]) assert.equal(monitorEndTime(value), null);
  assert.ok(monitorEndTime(localMonitorDate(7)));
});

test('active, paused and demo states show accurate actions without exposing tokens', () => {
  const changed = normalizeMonitor({ ...saved, changes: [{ id: 'c1', detectedAt: '2026-11-15T12:00:00Z', title: 'Deadline amended', summary: 'Check the source', url: tender.url }] });
  const active = panel(store(changed));
  assert.match(active, /Pause monitoring/);
  assert.match(active, /Without a public webhook/);
  assert.match(active, /Deadline amended/);
  assert.doesNotMatch(active, /public_payload|public_signature/);
  const paused = panel(store({ ...changed, status: 'paused' }));
  assert.match(paused, /Set up new monitor/);
  assert.doesNotMatch(paused, /Pause monitoring|Without a public webhook/);
  const demo = panel(store(changed), true);
  assert.match(demo, /after a live scan/);
  assert.doesNotMatch(demo, /Start monitoring|Pause monitoring|Choose end date/);
});

test('workspace keeps evidence, source and pagination content with clear headings', () => {
  const scan = { ...DEMO_SCAN, tenders: [{ ...tender, authoritySource: tender.sources[0] }], pagination: { hasMore: true, nextCursor: 'example', totalFound: 30, totalResearched: DEMO_SCAN.tenders.length } };
  const html = renderToStaticMarkup(React.createElement(TenderWorkspace, { scan, comparisonAvailable: true, busy: false, isDemo: true, onRefresh() {} }));
  assert.match(html, />Requirements<\/h3>/);
  assert.match(html, />Evidence<\/span>/);
  assert.match(html, /Notice facts/);
  assert.match(html, /30 discovered/);
  assert.doesNotMatch(html, /Both sides of the story|The fit,|Why this notice surfaced/);
});
