import type { ScanResult } from "./types";

export function normalizeCompanyUrl(value: string): string {
  const trimmed = value.trim();
  const url = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
  if (!/^https?:$/.test(url.protocol) || !url.hostname.includes(".") || url.username || url.password) throw new Error("Invalid company website");
  url.hash = "";
  return url.toString();
}

// Validate saved scans and network responses before restoring a workspace.
export function isScanResult(value: unknown): value is ScanResult {
  const record = (item: unknown): item is Record<string, unknown> => !!item && typeof item === "object" && !Array.isArray(item);
  const strings = (item: unknown) => Array.isArray(item) && item.every((part) => typeof part === "string");
  const text = (item: Record<string, unknown>, keys: string[]) => keys.every((key) => typeof item[key] === "string");
  const numbers = (item: Record<string, unknown>, keys: string[]) => keys.every((key) => typeof item[key] === "number" && Number.isFinite(item[key]));
  const source = (item: unknown) => record(item) && text(item, ["label", "url"]) && /^https?:\/\//.test(item.url as string) && (item.detail === undefined || typeof item.detail === "string") && (item.capturedAt === undefined || typeof item.capturedAt === "string");
  const sources = (item: unknown) => Array.isArray(item) && item.every(source);
  if (!record(value) || !text(value, ["companyUrl", "checkedAt"]) || !record(value.company) || !record(value.coverage) || !Array.isArray(value.tenders)) return false;
  try { normalizeCompanyUrl(value.companyUrl as string); } catch { return false; }
  if (Number.isNaN(Date.parse(value.checkedAt as string))) return false;
  const company = value.company;
  if (!text(company, ["name", "domain", "summary"]) || !numbers(company, ["sourceCount", "failedCount", "sitemapUrls"]) || !sources(company.sources) || !sources(company.news)) return false;
  if (!["capabilities", "certifications", "serviceRegions", "projectReferences", "equipmentAndResources", "qualityAndSafety", "sustainability"].every((key) => strings(company[key]))) return false;
  if (!strings(value.coverage.searchSources) || !numbers(value.coverage, ["searchResults", "uniqueTenders", "tenderPagesRead", "tenderPagesFailed", "attachmentPagesRead", "creditsUsed"])) return false;
  return value.tenders.every((tender: unknown) => {
    if (!record(tender) || !text(tender, ["id", "title", "authority", "location", "deadline", "estimatedValue", "procurementType", "url", "summary", "updatedAt"]) || !["likely_fit", "needs_review", "potential_mismatch"].includes(tender.status as string) || !numbers(tender, ["documentsRead", "documentsFailed"]) || !sources(tender.sources) || !Array.isArray(tender.requirements)) return false;
    return tender.requirements.every((requirement: unknown) => record(requirement) && text(requirement, ["id", "criterion", "category", "tenderEvidence", "supplierEvidence"]) && typeof requirement.mandatory === "boolean" && ["supported", "potential_gap", "unclear", "not_found"].includes(requirement.status as string) && (requirement.tenderSource === null || source(requirement.tenderSource)) && (requirement.supplierSource === null || source(requirement.supplierSource)));
  });
}
