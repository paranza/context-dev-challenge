const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const vm = require('node:vm');
function load(file) {
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const mod = { exports: {} };
  const localRequire = (id) => id.startsWith('./') ? load(path.resolve(path.dirname(file), `${id}.ts`)) : require(id);
  vm.runInNewContext(code, { require: localRequire, module: mod, exports: mod.exports, URL, Date });
  return mod.exports;
}
const { assessOpportunityFit } = load(path.resolve(__dirname, '../src/lib/opportunity-fit.ts'));
const source = (url = 'https://buyer.example/notice') => ({ label: 'Published evidence', url });
const supplierSource = source('https://contractor.example/work');
const company = (country = 'Italy') => ({ name: 'Contractor', domain: 'contractor.example', headquarters: { country, region: '', city: '', source: supplierSource }, summary: '', capabilities: ['Building construction and road construction'], certifications: [], serviceRegions: [], projectReferences: [], equipmentAndResources: [], qualityAndSafety: [], sustainability: [], sourceCount: 1, failedCount: 0, sitemapUrls: 0, sources: [supplierSource], news: [] });
const row = (overrides = {}) => ({ id: 'scope', criterion: 'Road construction and maintenance', category: 'scope', mandatory: true, status: 'supported', tenderEvidence: '"Road-maintenance works, CPV 45233141"', supplierEvidence: '"We construct roads and motorways"', tenderSource: source(), supplierSource, ...overrides });
const unknown = (overrides = {}) => row({ status: 'not_found', supplierEvidence: '', supplierSource: null, ...overrides });
const generic = () => unknown({ criterion: 'Meet selection criteria specified in the procurement documents', category: 'qualification and capacity', tenderEvidence: '"Selection criteria: Sources of selection criteria: Procurement Document"' });
const future = () => new Date(Date.now() + 30 * 86400000).toISOString();
const tender = (requirements = [row()], overrides = {}) => ({ id: 'notice', title: 'Road maintenance contract', authority: 'City', countryCode: 'IT', countryBasis: 'execution_location', location: 'Italy', deadline: future(), estimatedValue: 'Not stated', procurementType: 'Works', url: source().url, summary: '', status: 'needs_review', requirements, documentsRead: 1, documentsFailed: 0, sources: [source()], updatedAt: new Date().toISOString(), researchFields: { deadline: { value: future(), status: 'found', source: source() } }, ...overrides });
const assess = (requirements, overrides = {}, profile = company(), context = {}) => assessOpportunityFit(tender(requirements, overrides), profile, context);

test('Vitali-style road works fit despite unverified generic selection paperwork', () => {
  const result = assess([row(), generic()], {}, company(), { scopeMatch: 'direct', noticeOpen: true, eligibilityReview: 'incomplete' });
  assert.equal(result.status, 'likely_fit');
  assert.equal(result.eligibility, 'not_verified');
  assert.ok(result.checks.some((check) => check.includes('selection criteria')));
});
test('STRABAG-style building work fits despite electronic signatures, language and exclusion forms', () => {
  const rows = [row({ criterion: 'Carry out building-contractor works to construct Betriebswerkstätte', tenderEvidence: '"Baumeisterarbeiten; Hochbauleistungen zur Errichtung"', supplierEvidence: '"Building construction includes construction of buildings"' }), generic(), unknown({ criterion: 'Electronic signatures and submission in German', category: 'submission' }), unknown({ criterion: 'Meet exclusion grounds and ESPD forms', category: 'formal eligibility' })];
  assert.equal(assess(rows, { countryCode: 'AT' }, company('Austria')).status, 'likely_fit');
});
test('specific deep foundations override false mandatory and a mistaken bid_check role', () => {
  const result = assess([row(), unknown({ criterion: 'Tiefgründung/Spezialtiefbau and deep foundations', tenderEvidence: '"Tiefgründung mit Magerbetonplomben herstellen: 25 m³"', role: 'bid_check', mandatory: false })]);
  assert.equal(result.status, 'needs_review');
  assert.match(result.reason, /Tiefgründung/);
});
test('actual delivery rows override an incorrect bid_check tag', () => {
  assert.equal(assess([row(), unknown({ criterion: 'Electrical installation works included in the delivery scope', category: 'technical scope', role: 'bid_check', mandatory: false })]).status, 'needs_review');
});
test('hospital BIM and stated contract-scale capacity need verification', () => {
  for (const criterion of ['Delivery using BIM methods', 'Capacity to execute the stated EUR 91 million contract']) {
    assert.equal(assess([row(), unknown({ criterion, tenderEvidence: criterion, category: 'capacity', mandatory: false, role: 'bid_check' })]).status, 'needs_review');
  }
});
test('SOA class II versus required VII is a mismatch even with false mandatory', () => {
  const result = assess([row(), row({ criterion: 'SOA OG6 class VII required', category: 'qualification', mandatory: false, role: 'bid_check', status: 'potential_gap', tenderEvidence: '"SOA OG6 VII"', supplierEvidence: '"SOA OG6 II"' })]);
  assert.equal(result.status, 'potential_mismatch');
});
test('missing evidence is never a mismatch, including mislabeled potential_gap', () => {
  for (const override of [{ supplierSource: null }, { supplierEvidence: '' }, { supplierEvidence: 'No published evidence of SOA OG6 VII' }, { supplierEvidence: 'SOA OG6 VII not verified' }]) {
    const result = assess([row(), row({ criterion: 'SOA OG6 VII required', status: 'potential_gap', ...override })]);
    assert.equal(result.status, 'needs_review');
  }
});
test('foreign delivery requires evidence of operating coverage', () => {
  assert.equal(assess([row()], { countryCode: 'DE' }).status, 'needs_review');
  const profile = company(); profile.serviceRegions = ['Germany'];
  assert.equal(assess([row()], { countryCode: 'DE' }, profile).status, 'likely_fit');
  assert.equal(assess([row()], { countryCode: 'IT', countryBasis: 'buyer_country' }).status, 'needs_review');
});
test('scored warranty and key staff award criteria do not veto fit', () => {
  assert.equal(assess([row(), unknown({ criterion: 'Award criterion: extension of warranty, weight 3%', category: 'award', mandatory: false }), unknown({ criterion: 'Award criterion: professional qualifications of key staff, weight 7%', category: 'award', mandatory: false })]).status, 'likely_fit');
});
test('missing attachments add a check without a blanket veto', () => {
  const result = assess([row(), generic()], { documentsFailed: 2 });
  assert.equal(result.status, 'likely_fit');
  assert.ok(result.checks.some((check) => check.includes('could not be retrieved')));
});
test('absent or stale deadline and geography metadata are conservative', () => {
  for (const override of [{ researchFields: undefined }, { countryBasis: undefined }, { countryCode: undefined }, { researchFields: { deadline: { value: '2000-01-01', status: 'found', source: source() } } }, { researchFields: { deadline: { value: future(), status: 'found', source: null } } }]) {
    assert.equal(assess([row()], override).status, 'needs_review');
  }
});
test('missing-source or unverified supported rows cannot establish a positive trade match', () => {
  for (const override of [{ supplierSource: null }, { tenderSource: null }, { supplierEvidence: 'Source_missing' }, { supplierEvidence: 'Road capability not verified' }, { tenderEvidence: '' }]) {
    assert.equal(assess([row(override)], {}, company(), { scopeMatch: 'direct' }).status, 'needs_review');
  }
  assert.equal(assess([row({ criterion: 'General civil works', tenderEvidence: '"Main nature of contract: Works"' })]).status, 'needs_review');
});
test('adjacent scope stays in review; eligibility is tracked separately', () => {
  assert.equal(assess([row()], {}, company(), { scopeMatch: 'adjacent' }).status, 'needs_review');
  const formal = row({ criterion: 'SOA OG3 class VII required', category: 'qualification', tenderEvidence: '"SOA OG3 VII"', supplierEvidence: '"SOA OG3 VIII"' });
  assert.equal(assess([row(), formal], {}, company(), { eligibilityReview: 'incomplete' }).eligibility, 'partly_verified');
  assert.equal(assess([row(), formal], {}, company(), { eligibilityReview: 'complete' }).eligibility, 'verified');
});
test('checks and reasons remain bounded without numeric fit scores', () => {
  const result = assess([row(), ...Array.from({ length: 12 }, (_, i) => unknown({ criterion: `SOA category ${i} ${'details '.repeat(80)}`, category: 'qualification' }))]);
  assert.ok(result.checks.length <= 6);
  assert.ok(result.checks.every((check) => check.length <= 180));
  assert.ok(result.reason.length <= 260);
  assert.equal('score' in result, false);
});
test('legacy Dutch asphalt and road rows separate ordinary bank guarantees from qualifications', () => {
  const core = row({ criterion: 'Relevant scope capability: maintenance and construction work on bituminous pavements', category: 'technical capability', tenderEvidence: '“onderhouds- c.q. aanlegwerkzaamheden van bitumineuze verhardingen”', supplierEvidence: '“Construction, improvement and maintenance of road infrastructure”' });
  const bond = unknown({ criterion: 'Provide a bank guarantee equal to 5% of the contract sum', category: 'financial', tenderEvidence: '“Bankgarantie 5% van de aanneemsom”' });
  assert.equal(assess([core, bond], { countryCode: 'NL' }, company('Netherlands')).status, 'likely_fit');
  assert.equal(assess([core, unknown({ criterion: 'Contractor recognition D, class 8', category: 'qualification', tenderEvidence: '“Erkenning en registratie van aannemers: D (Bouwwerken), Klasse 8.”' })], { countryCode: 'NL' }, company('Netherlands')).status, 'needs_review');
});
test('legacy French sourced school all-trades works count as a specific core trade', () => {
  const core = row({ criterion: 'Perform general all-trades construction, rehabilitation and extension works for the school building and production kitchen', tenderEvidence: '« Entreprise générale TCE »; « Travaux de construction, de réhabilitation et de l’extension de bâtiment scolaire et cuisine de production »', supplierEvidence: '“Building construction and renovation for public facilities”' });
  const submission = unknown({ criterion: 'Soumettre l’offre par voie électronique, en français, avant la date et l’heure limites', category: 'soumission', tenderEvidence: 'La soumission électronique est requise; les offres peuvent être déposées en français.' });
  assert.equal(assess([core, submission, generic()], { countryCode: 'FR' }, company('France')).status, 'likely_fit');
});
test('legacy rail experience is core while unspecified Spanish financial categories remain bid checks', () => {
  const core = row({ criterion: 'Relevant rail/track construction or rehabilitation experience', category: 'experience', mandatory: false, tenderEvidence: 'Main classification (CPV): 45234116 Track construction works', supplierEvidence: '“In Spain, we have built over 400 km of high speed railway lines”' });
  const financial = unknown({ criterion: 'Other economic or financial requirements (the notice does not state detailed requirements)', category: 'economic_or_financial', tenderEvidence: 'Selection criterion: “Otros requisitos económicos o financieros.”' });
  assert.equal(assess([core, financial], { countryCode: 'ES' }, company('Spain')).status, 'likely_fit');
  assert.equal(assess([core, unknown({ criterion: 'Minimum turnover EUR 20 million', category: 'economic_or_financial', tenderEvidence: '“Minimum turnover EUR 20 million”' })], { countryCode: 'ES' }, company('Spain')).status, 'needs_review');
});
test('notice location is checked through geography while Finnish actual reference and delivery requirements remain material', () => {
  const location = unknown({ criterion: 'Performance location: Arr. Leuven (BE242), Belgium', category: 'location', tenderEvidence: '“Country: Belgium.”' });
  assert.equal(assess([row(), location], { countryCode: 'BE' }, company('Belgium')).status, 'likely_fit');
  const core = row({ criterion: 'Demonstrated capability in building renovation/refurbishment', category: 'experience / scope', tenderEvidence: '“peruskorjataan laajasti”; “sisärakennus- sekä talotekniikkatöitä”', supplierEvidence: '“We carry out renovation and housing company refurbishment projects”' });
  const reference = unknown({ criterion: 'Relevant references for school renovation', category: 'experience', tenderEvidence: '“tarkentanut yritysreferenssien soveltuvuusvaatimuksia”' });
  assert.equal(assess([core, reference], { countryCode: 'FI' }, company('Finland')).status, 'needs_review');
});
