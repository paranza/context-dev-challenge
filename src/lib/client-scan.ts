import type { EvidenceSource, ResearchField, ScanResult, SourceCoverage, TenderPageResult, TenderResult } from "./types";

export function normalizeCompanyUrl(value: string): string {
  const trimmed = value.trim();
  const url = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
  if (!/^https?:$/.test(url.protocol) || !url.hostname.includes(".") || url.username || url.password) throw new Error("Invalid company website");
  url.hash = "";
  return url.toString();
}

const record = (item: unknown): item is Record<string, unknown> => !!item && typeof item === "object" && !Array.isArray(item);
const strings = (item: unknown): item is string[] => Array.isArray(item) && item.every((part) => typeof part === "string");
const text = (item: Record<string, unknown>, keys: string[]) => keys.every((key) => typeof item[key] === "string");
const nonnegative = (item: unknown): item is number => typeof item === "number" && Number.isFinite(item) && item >= 0;
const numbers = (item: Record<string, unknown>, keys: string[]) => keys.every((key) => nonnegative(item[key]));
function sourceUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try { const url = new URL(value); return /^https?:$/.test(url.protocol) && !url.username && !url.password; }
  catch { return false; }
}
function source(item: unknown): item is EvidenceSource {
  return record(item) && typeof item.label === "string" && sourceUrl(item.url) &&
    (item.detail === undefined || typeof item.detail === "string") && (item.capturedAt === undefined || typeof item.capturedAt === "string");
}
const sources = (item: unknown) => Array.isArray(item) && item.every(source);
function researchField(item: unknown): item is ResearchField {
  return record(item) && (item.value === null || typeof item.value === "string") &&
    ["found", "not_stated", "source_unavailable", "not_searched", "conflict"].includes(item.status as string) &&
    (item.source === null || source(item.source)) && (item.details === undefined || strings(item.details));
}
function sourceOutcome(item: unknown): item is SourceCoverage {
  return record(item) && text(item, ["countryCode", "country", "sourceName"]) && sourceUrl(item.sourceUrl) &&
    ["searched", "failed", "not_available"].includes(item.status as string) && nonnegative(item.results) &&
    (item.resultUrls === undefined || (Array.isArray(item.resultUrls) && item.resultUrls.every(sourceUrl))) &&
    (item.detail === undefined || typeof item.detail === "string");
}
function extraCoverage(item: Record<string, unknown>) {
  return (item.sourceOutcomes === undefined || (Array.isArray(item.sourceOutcomes) && item.sourceOutcomes.every(sourceOutcome))) &&
    (item.countriesSearched === undefined || strings(item.countriesSearched)) &&
    (item.totalDiscovered === undefined || nonnegative(item.totalDiscovered));
}
function pagination(item: unknown): item is NonNullable<ScanResult["pagination"]> {
  return record(item) && typeof item.hasMore === "boolean" &&
    (item.nextCursor === null || typeof item.nextCursor === "string") && (!item.hasMore || (typeof item.nextCursor === "string" && item.nextCursor.length > 0)) &&
    numbers(item, ["pageSize", "totalFound", "totalResearched"]) && Number.isInteger(item.pageSize) && (item.pageSize as number) > 0;
}
export function isTenderResult(tender: unknown): tender is TenderResult {
  if (!record(tender) || !text(tender, ["id", "title", "authority", "location", "deadline", "estimatedValue", "procurementType", "summary", "updatedAt"]) || !sourceUrl(tender.url) ||
    !["likely_fit", "needs_review", "potential_mismatch"].includes(tender.status as string) || !numbers(tender, ["documentsRead", "documentsFailed"]) || !sources(tender.sources) || !Array.isArray(tender.requirements)) return false;
  if ((tender.authoritySource !== undefined && tender.authoritySource !== null && !source(tender.authoritySource)) ||
    (tender.countryCode !== undefined && typeof tender.countryCode !== "string") ||
    (tender.countryBasis !== undefined && !["execution_location", "buyer_country", "national_portal"].includes(tender.countryBasis as string)) ||
    (tender.relevanceReason !== undefined && typeof tender.relevanceReason !== "string")) return false;
  if (tender.researchFields !== undefined && (!record(tender.researchFields) || !["authority", "location", "deadline", "estimatedValue", "procurementType"].every(key => researchField((tender.researchFields as Record<string, unknown>)[key])))) return false;
  return tender.requirements.every((requirement: unknown) => record(requirement) && text(requirement, ["id", "criterion", "category", "tenderEvidence", "supplierEvidence"]) && typeof requirement.mandatory === "boolean" &&
    ["supported", "potential_gap", "unclear", "not_found"].includes(requirement.status as string) && (requirement.tenderSource === null || source(requirement.tenderSource)) && (requirement.supplierSource === null || source(requirement.supplierSource)));
}
function unresearched(items: unknown): items is ScanResult["unresearchedTenders"] {
  return Array.isArray(items) && items.every(item => record(item) && text(item, ["id", "title", "reason"]) && sourceUrl(item.url) &&
    (item.documentsRead === undefined || nonnegative(item.documentsRead)) && (item.documentsFailed === undefined || nonnegative(item.documentsFailed)));
}

// Strict validation for current network results, including optional new fields.
export function isScanResult(value: unknown): value is ScanResult {
  if (!record(value) || !text(value, ["companyUrl", "checkedAt"]) || !record(value.company) || !record(value.coverage) || !Array.isArray(value.tenders)) return false;
  try { normalizeCompanyUrl(value.companyUrl as string); } catch { return false; }
  if (Number.isNaN(Date.parse(value.checkedAt as string))) return false;
  const company = value.company;
  if (!text(company, ["name", "domain", "summary"]) || !numbers(company, ["sourceCount", "failedCount", "sitemapUrls"]) || !sources(company.sources) || !sources(company.news)) return false;
  if (!["capabilities", "certifications", "serviceRegions", "projectReferences", "equipmentAndResources", "qualityAndSafety", "sustainability"].every((key) => strings(company[key]))) return false;
  if (!strings(value.coverage.searchSources) || !numbers(value.coverage, ["searchResults", "uniqueTenders", "tenderPagesRead", "tenderPagesFailed", "attachmentPagesRead", "creditsUsed"]) || !extraCoverage(value.coverage)) return false;
  return value.tenders.every(isTenderResult) && unresearched(value.unresearchedTenders) && (value.pagination === undefined || pagination(value.pagination));
}

/** Old saved scans predate the unresearched list; retain all new metadata. */
export function normalizeScanResult(value: unknown): ScanResult | null {
  if (!record(value)) return null;
  const normalized = { ...value, unresearchedTenders: value.unresearchedTenders === undefined ? [] : value.unresearchedTenders };
  return isScanResult(normalized) ? normalized : null;
}

export function isTenderPageResult(value: unknown): value is TenderPageResult {
  return record(value) && Array.isArray(value.tenders) && value.tenders.every(isTenderResult) && unresearched(value.unresearchedTenders) && pagination(value.pagination) &&
    record(value.coverage) && numbers(value.coverage, ["tenderPagesRead", "tenderPagesFailed", "creditsUsed"]) && extraCoverage(value.coverage);
}

/** Continuation counters are increments; discovery/source coverage is a snapshot. */
export function mergeResearchPage<T extends ScanResult>(scan: T, page: TenderPageResult): T {
  const byId = new Map(scan.tenders.map(tender => [tender.id, tender]));
  page.tenders.forEach(tender => byId.set(tender.id, tender));
  const tenders = [...byId.values()];
  const pending = new Map((scan.unresearchedTenders ?? []).map(tender => [tender.id, tender]));
  page.unresearchedTenders.forEach(tender => pending.set(tender.id, tender));
  const researchedUrls = new Set(tenders.map(tender => tender.url));
  pending.forEach((tender, id) => { if (byId.has(id) || researchedUrls.has(tender.url)) pending.delete(id); });
  const attachments = [...page.tenders, ...page.unresearchedTenders].reduce((sum, tender) => sum + Math.max(0, (tender.documentsRead ?? 0) - 1), 0);
  return {
    ...scan,
    tenders,
    unresearchedTenders: [...pending.values()],
    coverage: {
      ...scan.coverage,
      ...page.coverage,
      uniqueTenders: page.coverage.totalDiscovered ?? page.pagination.totalFound,
      tenderPagesRead: scan.coverage.tenderPagesRead + page.coverage.tenderPagesRead,
      tenderPagesFailed: scan.coverage.tenderPagesFailed + page.coverage.tenderPagesFailed,
      attachmentPagesRead: scan.coverage.attachmentPagesRead + attachments,
      creditsUsed: scan.coverage.creditsUsed + page.coverage.creditsUsed,
    },
    pagination: { ...page.pagination, totalResearched: tenders.length },
  };
}
