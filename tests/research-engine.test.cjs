// Run: node --test tests/research-engine.test.cjs
// Real engine + planner run in isolated VMs; SDK and HTTP are fail-closed mocks.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const FAKE_KEY = 'offline-fixture-credential-not-a-real-key';
const COMPANY = 'https://regional-builder.example/';
const SERVICES = COMPANY + 'services';
const UNREAD = COMPANY + 'unread-claim';
const DEADLINE = new Date(Date.now() + 45 * 86400000).toISOString();
const NEXT_DEADLINE = new Date(Date.now() + 46 * 86400000).toISOString();
const PAST_DEADLINE = new Date(Date.now() - 45 * 86400000).toISOString();
const COMPANY_TEXT = 'We execute road construction and asphalt surfacing contracts in Lombardia, Italy. Our registered headquarters are in Milano, Lombardia, Italy. '.repeat(5);
function response(body, status = 200) { return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }); }
function notice(id, overrides = {}) {
  return { 'publication-number': id, 'notice-title': { eng: 'Road construction notice ' + id }, 'description-proc': { eng: 'Road construction and asphalt surfacing works' }, 'buyer-name': { eng: 'Municipal authority' }, 'buyer-country': 'ITA', 'place-of-performance-country-lot': ['ITA'], 'place-of-performance-subdiv-lot': ['ITC4C'], 'place-of-performance-city-lot': ['Milano'], 'classification-cpv': ['45233100'], 'deadline-receipt-tender-date-lot': DEADLINE, ...overrides };
}
function noticeUrl(id) { return `https://ted.europa.eu/en/notice/${id}/html`; }
function compileFile(file, suffix = '') {
  return ts.transpileModule(fs.readFileSync(file, 'utf8') + suffix, { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true, target: ts.ScriptTarget.ES2022 }, fileName: file }).outputText;
}
function harness(options = {}) {
  const requests = [], sdkCalls = [], modules = new Map();
  const rows = options.rows ?? [notice('open')];
  const knownIds = new Set([...rows.map((row) => row['publication-number']), ...(options.extraIds ?? [])]);
  const companyProfile = {
    company_name: 'Regional Builder', summary: 'A regional contractor. Unsupported bridge construction claim in summary.',
    headquarters: { country: 'IT', region: 'Lombardia', city: 'Milano', source_url: COMPANY, evidence: 'Registered headquarters Milano, Lombardia, Italy.' },
    capabilities: [
      { value: options.capability ?? 'Road construction and asphalt surfacing', source_url: SERVICES, evidence: COMPANY_TEXT.slice(0, 140) },
      { value: 'Bridge construction', source_url: UNREAD, evidence: 'This unsupported page could not be read.' },
    ],
    service_regions: [{ value: 'Italy', source_url: SERVICES, evidence: 'We execute works in Lombardia, Italy.' }],
    certifications: [], project_references: [], equipment_and_resources: [], quality_and_safety: [], sustainability: [],
  };
  Object.assign(companyProfile, options.profile ?? {});
  const companyText = options.companyText ?? COMPANY_TEXT;
  function tenderAnswer(id) {
    const url = noticeUrl(id);
    const answer = { title: 'Road construction notice ' + id, authority: 'Municipal authority', authority_source_url: url, notice_status: 'open', scope_match: 'direct', scope_reason: 'The lot calls for the verified road construction trade.', location: 'Milano, Lombardia, Italy', location_source_url: url, deadline: DEADLINE, deadline_source_url: url, estimated_value: '1000000 EUR', estimated_value_source_url: url, procurement_type: 'Works', procurement_type_source_url: url, summary: 'Road construction works in Lombardia.', conflicts: [], requirements: [{ criterion: 'Road construction capability', category: 'Technical', mandatory: true, status: 'supported', tender_evidence: 'Road construction works are required.', tender_source_url: url, supplier_evidence: 'Road construction works are offered.', supplier_source_url: SERVICES }] };
    return options.answer ? options.answer(id, answer) : answer;
  }
  class ContextMock {
    constructor() {
      this.web = {
        webCrawlMd: async (args) => { sdkCalls.push({ method: 'crawl', args }); return { results: [{ metadata: { title: 'Regional Builder', finalUrl: COMPANY, success: true }, markdown: companyText }] }; },
        webScrapeSitemap: async (args) => { sdkCalls.push({ method: 'sitemap', args }); return { urls: [COMPANY, SERVICES] }; },
        search: async (args) => { sdkCalls.push({ method: 'search', args }); return { results: [] }; },
        webScrapeMd: async (args) => {
          sdkCalls.push({ method: 'scrape', args });
          if (options.supplierPages?.[args.url]) return { url: args.url, metadata: { title: 'Official company page', finalUrl: args.url }, success: true, ...options.supplierPages[args.url] };
          if (args.url === SERVICES) return { url: SERVICES, metadata: { title: 'Construction services', finalUrl: SERVICES }, markdown: companyText, success: true };
          if (args.url === UNREAD) return { url: UNREAD, metadata: { title: 'Unavailable', finalUrl: UNREAD }, markdown: '', success: false };
          if (args.url.endsWith('/specification.pdf')) return { url: args.url, metadata: { title: 'Official specification', finalUrl: args.url }, markdown: 'Road construction technical specifications. '.repeat(8), success: true };
          const match = args.url.match(/^https:\/\/ted\.europa\.eu\/en\/notice\/([^/]+)\/html$/);
          assert.ok(match && knownIds.has(match[1]), 'Unrecognized scrape blocked: ' + args.url);
          const attachment = options.attachments?.includes(match[1]) ? `\n[Specification](${args.url}/specification.pdf)` : '';
          return { url: args.url, metadata: { title: 'Official road construction notice', finalUrl: args.url }, markdown: 'Official road construction works invitation. Bids must be submitted by the stated future deadline. The contracting authority is the municipality. '.repeat(5) + attachment, success: true };
        },
      };
      this.brand = { retrieve: async (args) => { sdkCalls.push({ method: 'brand', args }); return { brand: { name: 'Regional Builder', description: 'Regional construction services' } }; } };
    }
  }
  async function fetchMock(input, init) {
    const url = String(input), body = init?.body ? JSON.parse(init.body) : undefined;
    requests.push({ url, body });
    if (url === 'https://api.context.dev/v1/news/search') return response({ data: [] });
    if (url === 'https://api.ted.europa.eu/v3/notices/search') {
      if (options.ted) return response(options.ted(body));
      return response({ notices: rows, totalNoticeCount: rows.length });
    }
    if (url === 'https://api.context.dev/v1/web/answers') {
      assert.ok(Buffer.byteLength(body.task, 'utf8') <= 1800, 'Bounded evidence task');
      if (body.task.startsWith('Build a source-grounded supplier profile')) return response({ json_content: JSON.stringify(companyProfile) });
      if (body.task.startsWith('Find the construction contractor')) return response({ json_content: JSON.stringify(options.headquartersRecovery ?? { headquarters: {} }) });
      if (body.task.startsWith(`Read ${COMPANY} and these official pages.`)) {
        assert.equal(typeof options.retryProfile, 'function', 'Unexpected profile retry must be explicitly mocked');
        return response({ json_content: JSON.stringify(options.retryProfile(companyProfile, body.task)) });
      }
      const url = body.task.match(/Notice: ([^\n]+)/)?.[1];
      const id = url?.match(/\/notice\/([^/]+)\/html/)?.[1];
      assert.ok(knownIds.has(id), 'Unrecognized research answer blocked: ' + url);
      return response({ json_content: JSON.stringify(tenderAnswer(id)) });
    }
    throw new Error('HTTP network guard: ' + url);
  }
  function load(relative) {
    const filename = path.resolve(root, relative);
    if (modules.has(filename)) return modules.get(filename);
    const exports = {}; modules.set(filename, exports);
    const sandbox = { exports, process: { env: { CONTEXT_DEV_API_KEY: FAKE_KEY } }, fetch: fetchMock, Error, URL, Buffer, AbortSignal, Response, Request, ReadableStream, TextEncoder, setInterval, clearInterval, console, require(id) {
      if (id === 'context.dev') return ContextMock;
      if (id === 'node:crypto') return crypto;
      if (id.startsWith('@/')) return load('src/' + id.slice(2) + '.ts');
      if (id.startsWith('.')) return load(path.relative(root, path.resolve(path.dirname(filename), id + '.ts')));
      throw new Error('Module/network guard: ' + id);
    } };
    const expose = relative.endsWith('/context.ts') ? '\nexport const __test = { encodeCursor, decodeCursor };\n' : '';
    vm.runInNewContext(compileFile(filename, expose), sandbox, { filename });
    return exports;
  }
  return { engine: load('src/lib/context.ts'), load, requests, sdkCalls, companyProfile };
}

test('full discovery uses trade-specific CPV, home-region NUTS, country targeting and verified supplier pages', async () => {
  const h = harness();
  const scan = await h.engine.runTenderScan(COMPANY);
  assert.equal(scan.tenders.length, 1);
  assert.equal(scan.company.headquarters.country, 'IT');
  assert.ok(scan.company.capabilities.includes('Road construction and asphalt surfacing'));
  assert.ok(!scan.company.capabilities.includes('Bridge construction'));
  assert.ok(h.sdkCalls.some((call) => call.method === 'scrape' && call.args.url === SERVICES), 'The exact cited service page must be read');
  assert.ok(h.sdkCalls.some((call) => call.method === 'scrape' && call.args.url === UNREAD), 'Failed citation is attempted rather than trusted');
  const ted = h.requests.filter((request) => request.url.includes('api.ted.europa.eu'));
  assert.ok(ted.some(({ body }) => body.query.includes('place-of-performance-subdiv-lot=ITC4*')), 'Home-region search must precede country-wide discovery');
  assert.ok(ted.some(({ body }) => body.query.includes('place-of-performance-country-lot=ITA')), 'National execution country must be targeted');
  assert.ok(ted.every(({ body }) => body.query.includes('classification-cpv=452331*')));
  assert.ok(ted.every(({ body }) => !body.query.includes('classification-cpv=45*') && !body.query.includes('classification-cpv=45221*')), 'Neither generic construction nor unsupported summary-only bridge scope may leak into discovery');
  assert.ok(ted.every(({ body }) => body.fields.includes('place-of-performance-subdiv-lot') && !body.fields.includes('place-of-performance-subdivision-lot')));
  assert.ok(ted.every(({ body }) => /deadline-receipt-tender-date-lot >= \d{8}/.test(body.query) && body.scope === 'ACTIVE'));
  assert.match(scan.tenders[0].relevanceReason, /home_region/);
  const specialist = harness({ capability: 'Electrical installation works' });
  await specialist.engine.runTenderScan(COMPANY);
  const specialistQueries = specialist.requests.filter((request) => request.url.includes('api.ted.europa.eu')).map(({ body }) => body.query);
  assert.ok(specialistQueries.every((query) => query.includes('classification-cpv=4531*') && !query.includes('classification-cpv=452331*')), 'Different contractor trades require different discovery sectors');
});

test('public scan excludes closed, expired and unverified/conflicting deadlines while preserving source uncertainty', async () => {
  const ids = ['open', 'closed', 'expired', 'unverified-deadline', 'conflict', 'unverified-fields'];
  const h = harness({ rows: ids.map((id) => notice(id)), attachments: ['conflict'], answer(id, value) {
    if (id === 'closed') value.notice_status = 'closed';
    if (id === 'expired') value.deadline = PAST_DEADLINE;
    if (id === 'unverified-deadline') value.deadline_source_url = 'https://unread.example/deadline';
    if (id === 'conflict') value.conflicts = [{ field: 'deadline', values: [{ value: DEADLINE, source_url: noticeUrl(id) }, { value: NEXT_DEADLINE, source_url: noticeUrl(id) + '/specification.pdf' }] }];
    if (id === 'unverified-fields') {
      value.location_source_url = 'https://unread.example/location';
      value.estimated_value_source_url = 'https://unread.example/value';
      value.requirements[0].supplier_source_url = UNREAD;
    }
    return value;
  } });
  const scan = await h.engine.runTenderScan(COMPANY);
  assert.deepEqual(Array.from(scan.tenders, (item) => item.url).sort(), [noticeUrl('open'), noticeUrl('unverified-fields')].sort());
  assert.equal(scan.unresearchedTenders.length, 4);
  assert.ok(scan.unresearchedTenders.some((item) => /closed/.test(item.reason)));
  assert.ok(scan.unresearchedTenders.some((item) => /expired/.test(item.reason)));
  assert.ok(scan.unresearchedTenders.filter((item) => /deadline could not be verified/.test(item.reason)).length >= 2);
  const uncertain = scan.tenders.find((item) => item.url === noticeUrl('unverified-fields'));
  assert.equal(uncertain.status, 'needs_review');
  assert.equal(uncertain.researchFields.location.status, 'source_unavailable');
  assert.equal(uncertain.researchFields.location.value, null);
  assert.equal(uncertain.researchFields.estimatedValue.value, null);
  assert.equal(uncertain.requirements[0].status, 'unclear');
  assert.equal(uncertain.requirements[0].supplierSource, null);
  assert.ok(scan.tenders.every((item) => item.researchFields.deadline.status === 'found' && Date.parse(item.deadline) > Date.now()));
});

test('unread opposing deadline claims cannot suppress the single verified official deadline', async () => {
  const h = harness({ answer(id, value) {
    value.conflicts = [{ field: 'deadline', values: [{ value: DEADLINE, source_url: noticeUrl(id) }, { value: PAST_DEADLINE, source_url: 'https://unread.example/opposing-deadline' }] }];
    return value;
  } });
  const scan = await h.engine.runTenderScan(COMPANY);
  assert.equal(scan.tenders.length, 1);
  assert.equal(scan.tenders[0].researchFields.deadline.status, 'found');
  assert.equal(scan.tenders[0].deadline, DEADLINE);
});

test('public continuation follows a nonempty token past a completely filtered TED page', async () => {
  const h = harness({ rows: [], extraIds: ['later'], ted(body) {
    if (!body.iterationNextToken) return { notices: [], totalNoticeCount: 2, iterationNextToken: 'first-page-token' };
    if (body.iterationNextToken === 'first-page-token') return { notices: [notice('irrelevant', { 'notice-title': { eng: 'Laboratory microscopes' }, 'description-proc': { eng: 'Supply of research laboratory microscopes' }, 'classification-cpv': ['38510000'] })], totalNoticeCount: 2, iterationNextToken: 'second-page-token' };
    assert.equal(body.iterationNextToken, 'second-page-token');
    return { notices: [notice('later')], totalNoticeCount: 2 };
  } });
  const initial = await h.engine.runTenderScan(COMPANY);
  assert.equal(initial.tenders.length, 0);
  assert.equal(initial.pagination.hasMore, true);
  assert.equal(h.engine.__test.decodeCursor(initial.pagination.nextCursor).version, 2);
  const page = await h.engine.continueTenderScan(initial.pagination.nextCursor);
  assert.equal(page.tenders.length, 1);
  assert.equal(page.tenders[0].url, noticeUrl('later'));
  assert.equal(page.pagination.hasMore, false);
  assert.equal(page.pagination.nextCursor, null);
  const fetchedTokens = h.requests.filter((request) => request.url.includes('api.ted.europa.eu') && request.body.iterationNextToken).map((request) => request.body.iterationNextToken);
  assert.deepEqual(fetchedTokens, ['first-page-token', 'second-page-token']);
});

test('JSON and event-stream transports redact the actual configured credential from external failures', async () => {
  for (const stream of [false, true]) {
    const h = harness();
    h.engine.runTenderScan = async (_url, options) => {
      options.onProgress?.({ type: 'source', stage: 'discovery', message: 'External request failed using ' + FAKE_KEY });
      throw new Error('External provider echoed credential=' + FAKE_KEY);
    };
    const http = h.load('src/lib/research-http.ts');
    const request = new Request('https://local.example/api/search', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(stream ? { Accept: 'text/event-stream' } : {}) }, body: JSON.stringify({ companyUrl: COMPANY }) });
    const response = await http.handleInitialResearch(request);
    const text = await response.text();
    assert.ok(!text.includes(FAKE_KEY), 'Configured credential must never reach response transport');
    assert.match(text, /\[redacted\]/);
    if (stream) { assert.match(text, /event: error/); assert.match(text, /event: source/); }
    else assert.equal(response.status, 502);
    assert.equal(h.requests.length, 0, 'Transport test must not access any external provider');
  }
});

test('multiple TED publications for one procedure research only the latest revision and extended deadline', async () => {
  const shared = 'ad243619-73ae-469e-b005-daa57cd7a002';
  const old = notice('old-revision', { 'procedure-identifier': shared, 'notice-identifier': 'ad243619-73ae-469e-b005-daa57cd7a003', 'notice-version': '01', 'publication-date': '2026-10-27+01:00', 'deadline-receipt-tender-date-lot': DEADLINE });
  const latest = notice('latest-revision', { 'procedure-identifier': shared, 'notice-identifier': 'ad243619-73ae-469e-b005-daa57cd7a004', 'notice-version': '02', 'publication-date': '2026-11-11+01:00', 'change-notice-version-identifier': 'old-revision', 'deadline-receipt-tender-date-lot': NEXT_DEADLINE });
  const h = harness({ rows: [old, latest], answer(id, value) { value.deadline = id === 'latest-revision' ? NEXT_DEADLINE : DEADLINE; return value; } });
  const scan = await h.engine.runTenderScan(COMPANY);
  assert.equal(scan.tenders.length, 1, 'Versions are one opportunity, irrespective of discovery order');
  assert.equal(scan.tenders[0].url, noticeUrl('latest-revision'));
  assert.equal(scan.tenders[0].deadline, NEXT_DEADLINE);
  assert.equal(scan.pagination.totalFound, 1);
  assert.ok(!h.sdkCalls.some((call) => call.method === 'scrape' && call.args.url === noticeUrl('old-revision')), 'Superseded publication must be removed before paid research');
  assert.ok(h.requests.filter((request) => request.url.includes('api.ted.europa.eu')).every(({ body }) => body.fields.includes('procedure-identifier') && body.fields.includes('notice-version') && body.fields.includes('publication-date')));
  const previous = await harness({ rows: [old] }).engine.runTenderScan(COMPANY);
  const changes = h.engine.compareSnapshots(previous, scan);
  assert.equal(scan.tenders[0].id, previous.tenders[0].id, 'Updating the official publication must preserve opportunity identity');
  assert.equal(changes.filter((change) => change.kind === 'changed').length, 1);
  assert.equal(changes.filter((change) => change.kind === 'new' || change.kind === 'removed').length, 0, 'A deadline extension is an update, not a removed and newly discovered opportunity');
});

test('continuation never reintroduces an older publication of a procedure already returned', async () => {
  const shared = 'ad243619-73ae-469e-b005-daa57cd7a005';
  const old = notice('prior-publication', { 'procedure-identifier': shared, 'notice-version': '1', 'publication-date': '2026-10-27+01:00' });
  const latest = notice('current-publication', { 'procedure-identifier': shared, 'notice-version': '2', 'publication-date': '2026-11-11+01:00' });
  const different = notice('different-procedure', { 'procedure-identifier': 'ad243619-73ae-469e-b005-daa57cd7a006', 'notice-version': '1', 'publication-date': '2026-11-10+01:00' });
  const h = harness({ rows: [latest], extraIds: ['prior-publication', 'different-procedure'], ted(body) {
    if (!body.iterationNextToken) return { notices: [latest], totalNoticeCount: 3, iterationNextToken: 'older-procedure-page' };
    if (body.iterationNextToken === 'older-procedure-page') return { notices: [old], totalNoticeCount: 3, iterationNextToken: 'different-procedure-page' };
    assert.equal(body.iterationNextToken, 'different-procedure-page');
    return { notices: [different], totalNoticeCount: 3 };
  } });
  const initial = await h.engine.runTenderScan(COMPANY);
  assert.equal(initial.tenders.length, 1);
  assert.equal(initial.tenders[0].url, noticeUrl('current-publication'));
  assert.equal(initial.pagination.hasMore, true);
  const page = await h.engine.continueTenderScan(initial.pagination.nextCursor);
  assert.deepEqual(Array.from(page.tenders, (item) => item.url), [noticeUrl('different-procedure')]);
  assert.equal(page.pagination.totalFound, 2);
  assert.equal(page.pagination.hasMore, false);
  assert.ok(!h.sdkCalls.some((call) => call.method === 'scrape' && call.args.url === noticeUrl('prior-publication')));
});

test('headquarters recovery verifies the contact page and prioritizes home Belgium before operating France', async () => {
  const contact = COMPANY + 'contact';
  const h = harness({
    companyText: 'Regional Builder executes road construction projects and operates in France. '.repeat(4) + `\n[Contact](${contact})`,
    profile: { headquarters: undefined, service_regions: [{ value: 'France', source_url: SERVICES, evidence: 'Road construction operations in France.' }] },
    headquartersRecovery: { headquarters: { country: 'Belgium', region: '', city: 'Brussels', source_url: contact, evidence: 'Registered office: Brussels, Belgium.' } },
    supplierPages: { [contact]: { markdown: 'Regional Builder registered headquarters: Brussels, Belgium. This is the registered office, rather than a French project office. '.repeat(3) } },
    rows: [notice('belgian-project', { 'buyer-country': 'BEL', 'place-of-performance-country-lot': ['BEL'], 'place-of-performance-subdiv-lot': ['BE100'], 'place-of-performance-city-lot': ['Brussels'] })],
    answer(_id, value) { value.location = 'Brussels, Belgium'; return value; },
  });
  const scan = await h.engine.runTenderScan(COMPANY);
  assert.equal(scan.company.headquarters.country, 'BE');
  assert.equal(scan.company.headquarters.source.url, contact);
  assert.ok(h.sdkCalls.some((call) => call.method === 'scrape' && call.args.url === contact), 'Recovered address must be read, not trusted from an Answers claim alone');
  const recovery = h.requests.find((request) => request.url.endsWith('/answers') && request.body.task.startsWith('Find the construction contractor'));
  assert.ok(recovery && recovery.body.task.includes(contact), 'Headquarters recovery receives the actual linked contact URL');
  const queries = h.requests.filter((request) => request.url.includes('api.ted.europa.eu')).map((request) => request.body.query);
  const homeIndex = queries.findIndex((query) => query.includes('place-of-performance-country-lot=BEL'));
  const operatingIndex = queries.findIndex((query) => query.includes('place-of-performance-country-lot=FRA'));
  assert.ok(homeIndex >= 0 && operatingIndex > homeIndex, 'Verified registered country precedes the first service country');
  assert.equal(scan.tenders.length, 1);
  assert.match(scan.tenders[0].relevanceReason, /domestic/);
});

test('an unverified headquarters never turns the first service country into domestic or home-region geography', async () => {
  const h = harness({
    companyText: 'Regional Builder executes road construction work in France. Its registered headquarters are not stated on reviewed pages. '.repeat(4),
    profile: { headquarters: undefined, service_regions: [{ value: 'France', source_url: SERVICES, evidence: 'Operating construction services in France.' }] },
    headquartersRecovery: { headquarters: { country: 'Belgium', region: 'Brussels', city: 'Brussels', source_url: UNREAD, evidence: 'Claimed address on a page that is unavailable.' } },
    rows: [notice('french-project', { 'buyer-country': 'FRA', 'place-of-performance-country-lot': ['FRA'], 'place-of-performance-subdiv-lot': ['FR101'], 'place-of-performance-city-lot': ['Paris'] })],
    answer(_id, value) { value.location = 'Paris, France'; return value; },
  });
  const scan = await h.engine.runTenderScan(COMPANY);
  assert.equal(scan.company.headquarters, undefined);
  assert.equal(scan.tenders.length, 1);
  assert.match(scan.tenders[0].relevanceReason, /operating/);
  assert.doesNotMatch(scan.tenders[0].relevanceReason, /domestic|home_region/);
  const queries = h.requests.filter((request) => request.url.includes('api.ted.europa.eu')).map((request) => request.body.query);
  assert.ok(queries.every((query) => !query.includes('place-of-performance-subdiv-lot=')), 'Missing headquarters cannot manufacture a home-region query or priority');
});

test('a profile with no verified trades can recover capabilities from pages actually read', async () => {
  const h = harness({ profile: { capabilities: [] }, retryProfile(previous, task) {
    assert.ok(task.includes(COMPANY), 'Recovery must be grounded in read official pages');
    return { ...previous, capabilities: [{ value: 'Road construction', source_url: SERVICES, evidence: 'We execute road construction contracts.' }] };
  } });
  const scan = await h.engine.runTenderScan(COMPANY);
  assert.deepEqual(Array.from(scan.company.capabilities), ['Road construction']);
  assert.equal(scan.tenders.length, 1);
  assert.ok(h.requests.some((request) => request.url.endsWith('/answers') && request.body.task.startsWith(`Read ${COMPANY} and these official pages.`)));
  assert.ok(h.sdkCalls.some((call) => call.method === 'scrape' && call.args.url === SERVICES));
});

test('client validation accepts optional verified headquarters and rejects malformed saved head-office metadata', async () => {
  const h = harness();
  const scan = await h.engine.runTenderScan(COMPANY);
  const client = h.load('src/lib/client-scan.ts');
  assert.equal(client.isScanResult(scan), true);
  const without = { ...scan, company: { ...scan.company } };
  delete without.company.headquarters;
  assert.equal(client.isScanResult(without), true, 'Older saved scans without headquarters remain valid');
  for (const headquarters of [null, [], 'Belgium', { country: 'BE', region: {}, city: 'Brussels', source: scan.company.headquarters.source }, { country: 'BE', region: '', city: 'Brussels', source: { label: 'Address', url: 'javascript:alert(1)' } }]) {
    const malformed = { ...scan, company: { ...scan.company, headquarters } };
    assert.equal(client.isScanResult(malformed), false);
    assert.equal(client.normalizeScanResult(malformed), null);
  }
});


test('unresolved qualifications cannot become likely fit when incorrectly marked non-mandatory', async () => {
  const h = harness({ answer: (_id, answer) => ({ ...answer, eligibility_review: 'unresolved', requirements: [...answer.requirements, { criterion: 'Contractor capacity and formal qualifications', category: 'Qualification', mandatory: false, status: 'not_found', tender_evidence: 'Qualification criteria must be provided.', tender_source_url: answer.authority_source_url, supplier_evidence: '', supplier_source_url: '' }] }) });
  const result = await h.engine.runTenderScan(COMPANY);
  assert.equal(result.tenders.length, 1);
  assert.equal(result.tenders[0].status, 'needs_review');
});

test('routine bid checks do not veto a sourced opportunity and saved scans use the same policy', async () => {
  const h = harness({ answer: (_id, answer) => ({ ...answer, eligibility_review: 'unresolved', requirements: [...answer.requirements, { criterion: 'Selection criteria in procurement documents and electronic submission', category: 'Submission', role: 'bid_check', mandatory: true, status: 'not_found', tender_evidence: 'Selection criteria are in procurement documents.', tender_source_url: answer.authority_source_url, supplier_evidence: '', supplier_source_url: '' }] }) });
  const scan = await h.engine.runTenderScan(COMPANY);
  assert.equal(scan.tenders[0].status, 'likely_fit');
  assert.equal(scan.tenders[0].fitAssessment.eligibility, 'not_verified');
  assert.equal(scan.tenders[0].requirements[1].status, 'not_found', 'A positive recommendation must not fabricate qualification evidence');
  const saved = JSON.parse(JSON.stringify(scan));
  delete saved.tenders[0].fitAssessment;
  saved.tenders[0].status = 'needs_review';
  const restored = h.load('src/lib/client-scan.ts').normalizeScanResult(saved);
  assert.equal(restored.tenders[0].status, 'likely_fit');
  assert.equal(restored.tenders[0].fitAssessment.version, 2);
  assert.equal(restored.tenders[0].requirements[1].status, 'not_found');
});
