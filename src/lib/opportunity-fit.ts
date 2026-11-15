import type { CompanyProfile, EvidenceSource, TenderRequirement, TenderResult, TenderStatus } from "./types";
import { buildDiscoveryPlan, normalizeCountryCode } from "./research-plan";

export type OpportunityFitContext = {
  scopeMatch?: "direct" | "adjacent" | "unrelated";
  geographicReview?: boolean;
  noticeOpen?: boolean;
  eligibilityReview?: string;
};
export type OpportunityFitAssessment = {
  status: TenderStatus;
  reason: string;
  checks: string[];
  eligibility: "not_verified" | "partly_verified" | "verified";
};

type Role = "delivery" | "qualification" | "bid_check" | "scored";
const normalized = (text: string) => text.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/ß/g, "ss");
const bounded = (text: string, limit = 180) => text.replace(/\s+/g, " ").trim().slice(0, limit);
function sourceExists(source: EvidenceSource | null | undefined): boolean {
  if (!source?.url) return false;
  try { return /^https?:$/.test(new URL(source.url).protocol); } catch { return false; }
}
function hasQuote(text: string): boolean {
  return Boolean(text?.trim()) && !/^(?:not (?:found|stated|available|searched)|unknown|unclear|none|n\/?a|source[_ ](?:missing|unavailable)|no evidence)[.!\s]*$/i.test(text.trim());
}
function supported(row: TenderRequirement): boolean {
  const text = normalized(row.supplierEvidence ?? "");
  return row.status === "supported" && sourceExists(row.tenderSource) && sourceExists(row.supplierSource)
    && hasQuote(row.tenderEvidence) && hasQuote(row.supplierEvidence)
    && !/\b(?:not verified|unverified|source[_ ]missing|no (?:retrieved |published |direct |supplier )?evidence|does not (?:establish|prove|confirm)|not established|not (?:found|documented))\b/.test(text);
}

// Interpret the requirement itself, never supplier certifications mentioned only
// on the other side of a comparison. Specific obligations outrank a bad role tag.
function roleOf(row: TenderRequirement): Role {
  const text = normalized(`${row.criterion} ${row.tenderEvidence}`);
  const category = normalized(row.category);
  const explicit = (row as TenderRequirement & { role?: Role }).role;
  const scored = /\b(?:award criterion|award criteria|optional|bonus|scoring|weight|zuschlagskriter|criteri[oa] di aggiudicazione|punteggio|gewahrleistungsverlangerung|beweislastumkehr)\b/.test(text)
    || /^(?:award|scored|scoring|aggiudicazione)$/.test(category);
  if (scored) return "scored";
  // These rows identify paperwork or a notice fact, not a contractor's
  // technical capacity. Keep named certifications and numerical thresholds
  // below as material requirements.
  if (/^(?:location|geographic)$/.test(category)) return "bid_check";
  if (/\b(?:names and professional qualifications|noms et qualifications professionnelles)\b/.test(text) && /\bnot required\b/.test(normalized(row.tenderEvidence))) return "bid_check";
  if (/\b(?:other economic or financial requirements|otros requisitos economicos o financieros)\b/.test(text)
    && !/\b(?:minimum|at least|turnover|fatturato|umsatz|solvency|ratio|insurance)\b|\d/.test(text)) return "bid_check";
  const specificQualification = /\b(?:s\.?o\.?a\.?|og\s?\d+|os\s?\d+|iso\s?\d{4,5}|en\s?\d{4,5}|licen[cs]e|licen[cs]ing|licenza|patentino|accreditation|mandatory (?:site )?visit|sopralluogo|ortsbesichtigung|turnover|fatturato|umsatz|reference[s]?|referenz[a-z]*|referenze|technical certific[a-z]*|professional qualif[a-z]*|qualificazione professionale)\b/.test(text);
  const specificDelivery = /\b(?:bim|radiation|proton|strahlenschutz[a-z]*|deep foundations?|tiefgrundung|spezialtiefbau|piling|piles|asbestos|amianto|design (?:and|scope|services)|planning and construction|planungs[a-z]*|progettazione)\b/.test(text)
    || /\b(?:specialist|specialized|specialised)\b.{0,50}\b(?:work|construction|install|equipment)/.test(text);
  // A named financial minimum is material; buying the ordinary bid bond or
  // completing an insurance form is a task for bid preparation.
  if (specificQualification || /\b(?:insurance|assicurazione)\b.{0,60}(?:\d[\d., ]*\s*(?:eur|euro|million)|minimum|at least)/.test(text)) return "qualification";
  if (specificDelivery || (/\b(?:capacity|capacita|kapazitat)\b/.test(text) && (!/\b(?:procurement documents?|selection criteria)\b/.test(text) || /\d/.test(text)))) return "delivery";
  if (/\b(?:procurement document|selection criteria|criteri di selezione|requisiti di selezione|vergab[eua][a-z]*|exclusion|esclusione|espd|dgue|electronic|elettronica|signature|firma|submission|submit|language|lingu[ae]|variants?|insurance|assicurazione|fideiussoria|bid bond|bank guarantee|bankgarantie|performance bond|borgtocht|cciaa|c\.c\.i\.a\.a|trade registration|subappalt|duration|durata|start date|contract execution duration)\b/.test(text)
    || /(?:submission|soumission|procedur|formal eligibility)/.test(category)
    || /\b(?:soumettre|soumission|deposer|remise des offres)\b.{0,100}\b(?:electronique|francais|offre|offres)\b/.test(text)
    || /\b(?:health and safety|occupational|prevention)\b.{0,100}\bdocumentation\b/.test(text)) return "bid_check";
  if (/(?:scope|delivery|performance|esecuzione|settore|esperienza|experience|technical)/.test(category)) return "delivery";
  if (explicit) return explicit;
  if (/(?:qualification|qualific|capacity|capacita|personnel|certif)/.test(category)) return "qualification";
  return row.mandatory ? "qualification" : "bid_check";
}

function coreTrade(row: TenderRequirement): boolean {
  if (!supported(row) || roleOf(row) !== "delivery") return false;
  const text = normalized(`${row.criterion} ${row.tenderEvidence}`);
  // Generic CPV 45 / "Works" and public-building settings do not establish
  // overlap with the actual contract trade.
  return /\b(?:road[a-z-]*|motorway[a-z]*|bridge[a-z]*|tunnel[a-z]*|building (?:construction|renovation|refurbishment)|construction (?:of buildings|work for)|sewer[a-z]*|pipeline[a-z]*|electrical installation|hvac|roofing|waterproofing|demolition|earthworks?|concrete|masonry|asphalt|asphalting|bituminous pavements|paving|railway|(?:rail|track) (?:construction|renewal|rehabilitation)|peruskorja[a-z]*|strad[a-z]*|autostrad[a-z]*|ponti|gallerie|edili[a-z]*|ediliz[a-z]*|ristrutturazion[a-z]*|costruzion[a-z]*|fogn[a-z]*|acquedott[a-z]*|calcestruzzo|muratura|impianti|hochbau[a-z]*|rohbau[a-z]*|baumeister[a-z]*|wohnungsbrauchbarmach[a-z]*|strassenbau|kanalbau|beton[a-z]*|mauer[a-z]*|rakenn[a-z]*|talonrakenn[a-z]*)\b/.test(text)
    || /\bconstruction\b.{0,120}\b(?:school|residential|buildings?|apartments?)\b/.test(text)
    || /\btravaux de (?:construction|rehabilitation|renovation)\b.{0,100}\bbatiment\b/.test(text);
}

function mismatch(row: TenderRequirement): boolean {
  if (row.status !== "potential_gap" || !["delivery", "qualification"].includes(roleOf(row))) return false;
  if (!sourceExists(row.tenderSource) || !sourceExists(row.supplierSource) || !hasQuote(row.tenderEvidence) || !hasQuote(row.supplierEvidence)) return false;
  // A missing document is an unknown, even if extraction mislabeled the row.
  return !/\b(?:not (?:found|verified|documented)|no (?:retrieved |published |direct |supplier )?evidence|does not (?:establish|prove|confirm)|not established|unknown|unverified|source[_ ]missing)\b/.test(normalized(row.supplierEvidence));
}

/** Recommendation fit is separate from a verified decision to submit a bid. */
export function assessOpportunityFit(tender: TenderResult, company: CompanyProfile, context: OpportunityFitContext = {}): OpportunityFitAssessment {
  const rows = tender.requirements ?? [];
  const formal = rows.filter((row) => ["qualification", "bid_check"].includes(roleOf(row)));
  const verifiedFormal = formal.filter(supported);
  const eligibility: OpportunityFitAssessment["eligibility"] = formal.length > 0 && verifiedFormal.length === formal.length && context.eligibilityReview === "complete"
    ? "verified" : verifiedFormal.length > 0 ? "partly_verified" : "not_verified";
  const checks: string[] = [];
  const add = (text: string) => { const value = bounded(text); if (value && checks.length < 6 && !checks.includes(value)) checks.push(value); };
  const result = (status: TenderStatus, reason: string): OpportunityFitAssessment => ({ status, reason: bounded(reason, 260), checks, eligibility });
  const contradictions = rows.filter(mismatch);
  if (contradictions.length) {
    contradictions.forEach((row) => add(`Resolve the documented gap: ${row.criterion}`));
    return result("potential_mismatch", `Published evidence conflicts with a material requirement: ${contradictions[0].criterion}`);
  }
  const unresolved = rows.filter((row) => ["delivery", "qualification"].includes(roleOf(row)) && !supported(row));
  unresolved.forEach((row) => add(`Verify ${row.criterion}`));
  const core = rows.find(coreTrade);
  const scopeKnown = Boolean(core) && context.scopeMatch !== "adjacent" && context.scopeMatch !== "unrelated";
  if (!scopeKnown) add(context.scopeMatch === "adjacent" ? "Confirm that the adjacent work scope matches the company's actual trade." : "Verify the actual contract trade against directly sourced company work.");

  const deadline = tender.researchFields?.deadline;
  const time = deadline?.value ? Date.parse(deadline.value) : NaN;
  const deadlineKnown = deadline?.status === "found" && sourceExists(deadline.source) && Number.isFinite(time) && time > Date.now();
  const open = context.noticeOpen !== false && deadlineKnown;
  if (!open) add(context.noticeOpen === false ? "Confirm that the notice is open for bids." : "Verify a current bidding deadline in the official notice.");
  const country = normalizeCountryCode(tender.countryCode);
  const home = sourceExists(company.headquarters?.source) ? normalizeCountryCode(company.headquarters?.country) : undefined;
  const operating = buildDiscoveryPlan(company).operatingCountries ?? [];
  const geographicFit = Boolean(country && tender.countryBasis && tender.countryBasis !== "buyer_country" && (country === home || operating.includes(country)) && !context.geographicReview);
  if (!geographicFit) add(country ? `Verify execution capability in ${country}${tender.countryBasis === "buyer_country" ? "; only the buyer's country is known" : ""}.` : "Verify the contract's execution country and the company's operating coverage.");
  // Missing attachments prompt a concrete check, but are not a blanket veto on
  // otherwise evidenced recommendation fit.
  if (tender.documentsFailed > 0) add("Read the tender documents that could not be retrieved before preparing a bid.");
  rows.filter((row) => !supported(row) && ["bid_check", "scored"].includes(roleOf(row))).forEach((row) => add(`Check before bidding: ${row.criterion}`));

  if (unresolved.length) return result("needs_review", `The work may fit, but a material requirement needs verification: ${unresolved[0].criterion}`);
  if (!scopeKnown) return result("needs_review", context.scopeMatch === "adjacent" ? "The work is adjacent to the company's evidenced trade; confirm the actual delivery scope." : "A direct match to the actual contract trade has not been established with sources.");
  if (!open) return result("needs_review", "The work scope matches, but an open bidding deadline needs verification.");
  if (!geographicFit) return result("needs_review", "The work scope matches, but delivery in the execution country needs verification.");
  return result("likely_fit", `The actual work matches published company capabilities and falls within its home or operating country. ${eligibility === "verified" ? "Recorded bid checks are verified." : "Formal bid eligibility still needs checking."}`);
}
