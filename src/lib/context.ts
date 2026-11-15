import ContextDev from "context.dev";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { isOfficialTenderUrl, PROCUREMENT_COUNTRIES } from "@/lib/procurement-sources";
import type {
  CompanyProfile,
  EvidenceSource,
  ResearchField,
  RequirementStatus,
  ScanProgressEvent,
  ScanResult,
  SourceCoverage,
  TenderChange,
  TenderPageResult,
  TenderRequirement,
  TenderResult,
  TenderStatus,
} from "@/lib/types";

type AnyRecord = Record<string, unknown>;
type SearchHit = { title: string; url: string; description: string; relevance: string; countryCode?: string; countryBasis?: "execution_location" | "buyer_country" | "national_portal"; authority?: string; publicationNumber?: string; sourceHost?: string };
type CrawledPage = { title: string; url: string; markdown: string; success: boolean };

const TENDER_PAGE_SIZE = 20;
const TED_API_URL = "https://api.ted.europa.eu/v3/notices/search";
const TED_FIELDS = [
  "publication-number", "notice-title", "buyer-name", "buyer-country",
  "place-of-performance-country-proc", "place-of-performance-country-part",
  "place-of-performance-country-lot", "classification-cpv", "publication-date",
  "deadline-receipt-tender-date-lot", "description-proc",
];
// Leave a byte margin because source text often contains multibyte characters.
const MAX_ANSWER_TASK_BYTES = 1_800;

type TenderCursor = {
  version: 1;
  companyUrl: string;
  profile: CompanyProfile;
  pendingHits: SearchHit[];
  tedNextToken: string | null;
  sourceOutcomes: SourceCoverage[];
  totalFound: number;
  seenIds: string[];
  checkedAt: string;
};

type ScanOptions = { onProgress?: (event: ScanProgressEvent) => void };

class TenderResearchError extends Error {
  constructor(message: string, readonly documentsRead: number, readonly documentsFailed: number) {
    super(message);
    this.name = "TenderResearchError";
  }
}

const MAX_ATTACHMENT_PAGES_PER_TENDER = 35;

function asRecord(value: unknown): AnyRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as AnyRecord) : {};
}

function jsonContentRecord(value: unknown): AnyRecord {
  if (typeof value === "string") {
    try {
      return asRecord(JSON.parse(value));
    } catch {
      return {};
    }
  }
  return asRecord(value);
}

function asString(value: unknown, fallback = ""): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return fallback;
}

function asBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "yes", "mandatory", "required", "1"].includes(normalized)) return true;
    if (["false", "no", "optional", "informational", "0", ""].includes(normalized)) return false;
  }
  return fallback;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (typeof item === "string" && item.trim()) return [item.trim()];
    const record = asRecord(item);
    const text = asString(record.value) || asString(record.name) || asString(record.detail);
    return text ? [text] : [];
  });
}

function cleanUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (!/^https?:$/.test(url.protocol) || !url.hostname.includes(".")) return null;
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function fitUtf8(value: string, maxBytes: number): string {
  if (Buffer.byteLength(value, "utf8") <= maxBytes) return value;
  let result = "";
  let bytes = 0;
  for (const character of value) {
    const characterBytes = Buffer.byteLength(character, "utf8");
    if (bytes + characterBytes > maxBytes) break;
    result += character;
    bytes += characterBytes;
  }
  return result;
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

function isSameCompanySite(candidateUrl: string, companyHost: string): boolean {
  const host = hostOf(candidateUrl);
  return host === companyHost || host.endsWith(`.${companyHost}`);
}

function unique<T>(items: T[], key: (item: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const value = key(item);
    if (!value || seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}

function source(label: string, url: string, detail?: string): EvidenceSource {
  return { label, url, detail, capturedAt: new Date().toISOString() };
}

function addCredits(counter: { value: number }, response: unknown) {
  const metadata = asRecord(asRecord(response).key_metadata);
  const consumed = Number(metadata.credits_consumed ?? 0);
  if (Number.isFinite(consumed)) counter.value += consumed;
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const index = next++;
      if (index >= items.length) return;
      results[index] = await fn(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

function extractLinks(markdown: string, baseUrl: string): string[] {
  const links = new Set<string>();
  const patterns = [
    /\[[^\]]*\]\(([^\s)]+)(?:\s+[^)]*)?\)/gi,
    /https?:\/\/[^\s<>"'\])}]+/gi,
  ];
  for (const pattern of patterns) {
    for (const match of markdown.matchAll(pattern)) {
      const raw = match[1] ?? match[0];
      const absolute = (() => { try { return new URL(raw, baseUrl).toString(); } catch { return ""; } })();
      const url = cleanUrl(raw.replace(/[.,;]+$/, "")) ?? cleanUrl(absolute);
      if (url) links.add(url);
    }
  }
  return [...links];
}

function isTenderDocument(url: string): boolean {
  const lower = url.toLowerCase();
  return /\.(pdf|docx?|xlsx?|pptx?|odt|ods|rtf|zip)(?:$|\?)/i.test(lower) ||
    /(attachment|document|download|appendix|annex|liite|asiakir|tarjouspyynt|clarification|question|answer|corrigendum|amendment|specification)/i.test(lower);
}

function procurementOverlap(reference: string, candidate: string): number {
  const ignored = new Set(["finland", "procurement", "tender", "notice", "appendices", "appendix", "specification", "specifications", "contract", "open", "works"]);
  const referenceWords = new Set(reference.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((word) => word.length >= 5 && !ignored.has(word)));
  const candidateText = candidate.toLowerCase();
  return [...referenceWords].filter((word) => candidateText.includes(word)).length;
}

function markdownExcerpt(markdown: string, needles: string[], maxLength = 440): string {
  const text = markdown.replace(/\s+/g, " ").trim();
  if (!text) return "";
  const lower = text.toLowerCase();
  let best = -1;
  for (const needle of needles) {
    if (!needle) continue;
    const index = lower.indexOf(needle.toLowerCase());
    if (index >= 0 && (best < 0 || index < best)) best = index;
  }
  const start = best < 0 ? 0 : Math.max(0, best - 120);
  return `${start ? "…" : ""}${text.slice(start, start + maxLength)}${start + maxLength < text.length ? "…" : ""}`;
}

function rankedSourceCatalog(pages: CrawledPage[], reference: string, maxPages: number, excerptLength: number): string {
  const ignored = new Set(["about", "after", "also", "been", "between", "company", "from", "have", "into", "more", "other", "public", "that", "their", "this", "with", "work", "works"]);
  const terms = unique(reference.toLowerCase().match(/[\p{L}\p{N}]{4,}/gu) ?? [], (term) => term)
    .filter((term) => !ignored.has(term))
    .slice(0, 24);
  return pages.filter((page) => page.success).map((page) => {
    const haystack = `${page.title} ${page.markdown}`.toLowerCase();
    const score = terms.reduce((total, term) => total + (haystack.includes(term) ? 1 : 0), 0);
    return { page, score };
  }).sort((a, b) => b.score - a.score)
    .slice(0, maxPages)
    .map(({ page }) => {
      const excerpt = markdownExcerpt(page.markdown, terms, excerptLength);
      return `${page.title} (${page.url}): ${excerpt}`;
    }).join("\n");
}

function fitSourceCatalog(catalog: string, maxBytes: number): string {
  const lines = catalog.split("\n");
  const kept: string[] = [];
  let bytes = 0;
  for (const line of lines) {
    const nextBytes = bytes + Buffer.byteLength(line, "utf8") + (kept.length ? 1 : 0);
    if (nextBytes > maxBytes) break;
    kept.push(line);
    bytes = nextBytes;
  }
  return kept.join("\n");
}

function textFromProfile(profile: AnyRecord): string[] {
  return [
    ...asStringArray(profile.capabilities),
    ...asStringArray(profile.certifications),
    ...asStringArray(profile.service_regions),
    ...asStringArray(profile.project_references),
    ...asStringArray(profile.equipment_and_resources),
    ...asStringArray(profile.quality_and_safety),
    ...asStringArray(profile.sustainability),
  ];
}

function isRegisteredTenderUrl(url: string): boolean {
  return isOfficialTenderUrl(url);
}

function countryByAnyCode(code: string) {
  const normalized = code.trim().toUpperCase();
  return PROCUREMENT_COUNTRIES.find((country) => country.code === normalized || country.tedCode === normalized);
}

function regionMatchesCountry(regions: string[], country: NonNullable<ReturnType<typeof countryByAnyCode>>): boolean {
  return regions.some((region) => {
    const normalized = region.toLowerCase();
    if (normalized.includes(country.name.toLowerCase())) return true;
    const tokens = normalized.split(/[^\p{L}\p{N}]+/u);
    return tokens.includes(country.code.toLowerCase()) || tokens.includes(country.tedCode.toLowerCase());
  });
}

function localizedText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) return value.map(localizedText).find(Boolean) ?? "";
  const record = asRecord(value);
  const preferred = ["eng", "en", "fin", "deu", "fra", "ita", "spa", "nld", "swe"];
  for (const key of preferred) {
    const item = asString(record[key]);
    if (item) return item;
  }
  return Object.values(record).map(localizedText).find(Boolean) ?? "";
}

function officialNoticeUrl(publicationNumber: string): string {
  return `https://ted.europa.eu/en/notice/${encodeURIComponent(publicationNumber)}/html`;
}

function tedNoticeToHit(value: unknown): SearchHit | null {
  const row = asRecord(value);
  const publicationNumber = asString(row["publication-number"] ?? row["notice-id"] ?? row["publication-number-notice"]);
  const urlValue = asString(row.url ?? row["notice-url"]);
  const url = cleanUrl(urlValue || (publicationNumber ? officialNoticeUrl(publicationNumber) : ""));
  if (!url) return null;
  const performanceCodes = [
    localizedText(row["place-of-performance-country-lot"]),
    localizedText(row["place-of-performance-country-part"]),
    localizedText(row["place-of-performance-country-proc"]),
  ].map((item) => item.toUpperCase());
  const performanceCountry = performanceCodes.map(countryByAnyCode).find(Boolean);
  const buyerCountry = countryByAnyCode(localizedText(row["buyer-country"]));
  const country = performanceCountry ?? buyerCountry;
  return {
    title: localizedText(row["notice-title"] ?? row["title-proc"]) || publicationNumber || url,
    url,
    description: localizedText(row["description-proc"]),
    relevance: "high",
    countryCode: country?.code,
    countryBasis: performanceCountry ? "execution_location" : buyerCountry ? "buyer_country" : undefined,
    authority: localizedText(row["buyer-name"]),
    publicationNumber,
    sourceHost: "ted.europa.eu",
  };
}

async function searchTedNotices(iterationNextToken: string | null): Promise<{ hits: SearchHit[]; nextToken: string | null; total: number }> {
  const today = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  const response = await fetch(TED_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      query: `classification-cpv=45* AND notice-type IN (cn-standard cn-social cn-desg pin-cfc-standard pin-cfc-social) AND deadline-receipt-tender-date-lot >= ${today} SORT BY publication-date DESC`,
      fields: TED_FIELDS,
      limit: 100,
      scope: "ACTIVE",
      paginationMode: "ITERATION",
      ...(iterationNextToken ? { iterationNextToken } : {}),
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(45_000),
  });
  const body = asRecord(await response.json().catch(() => ({})));
  if (!response.ok) throw new Error(asString(body.message, `TED search failed (${response.status}).`));
  const rows = Array.isArray(body.notices) ? body.notices : [];
  const inScopeCountries = new Set(PROCUREMENT_COUNTRIES.map((country) => country.code));
  return {
    hits: rows.map(tedNoticeToHit).filter((hit): hit is SearchHit => Boolean(hit?.countryCode && inScopeCountries.has(hit.countryCode))),
    nextToken: asString(body.iterationNextToken) || null,
    total: Number(body.totalNoticeCount ?? rows.length) || 0,
  };
}

function encodeCursor(payload: TenderCursor): string {
  const key = process.env.CONTEXT_DEV_API_KEY;
  if (!key) throw new Error("Context.dev is not configured.");
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", key).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

function decodeCursor(token: string): TenderCursor {
  const key = process.env.CONTEXT_DEV_API_KEY;
  if (!key) throw new Error("Context.dev is not configured.");
  if (token.length > 2_000_000) throw new Error("The continuation token is too large.");
  const [encoded, providedSignature] = token.split(".");
  if (!encoded || !providedSignature) throw new Error("The continuation token is invalid.");
  const expectedSignature = createHmac("sha256", key).update(encoded).digest();
  let actualSignature: Buffer;
  try {
    actualSignature = Buffer.from(providedSignature, "base64url");
  } catch {
    throw new Error("The continuation token is invalid.");
  }
  if (actualSignature.length !== expectedSignature.length || !timingSafeEqual(actualSignature, expectedSignature)) {
    throw new Error("The continuation token is invalid or expired.");
  }
  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    throw new Error("The continuation token is invalid.");
  }
  const cursor = asRecord(payload) as unknown as TenderCursor;
  if (cursor.version !== 1 || !cleanUrl(cursor.companyUrl) || !Array.isArray(cursor.pendingHits)) {
    throw new Error("The continuation token is invalid.");
  }
  const createdAt = Date.parse(cursor.checkedAt);
  if (!Number.isFinite(createdAt) || Date.now() - createdAt > 24 * 60 * 60 * 1000) {
    throw new Error("The continuation token has expired. Start a fresh scan.");
  }
  return cursor;
}

function emitProgress(options: ScanOptions, event: ScanProgressEvent) {
  try { options.onProgress?.(event); } catch { /* A disconnected progress client does not cancel research. */ }
}

function getSearchHits(response: unknown): SearchHit[] {
  const results = asRecord(response).results;
  if (!Array.isArray(results)) return [];
  return results.flatMap((item) => {
    const row = asRecord(item);
    const url = cleanUrl(asString(row.url));
    if (!url) return [];
    return [{
      title: asString(row.title, url),
      url,
      description: asString(row.description),
      relevance: asString(row.relevance, "medium"),
    }];
  });
}

function tenderStatus(requirements: TenderRequirement[]): TenderStatus {
  if (!requirements.length) return "needs_review";
  if (requirements.some((item) => item.mandatory && item.status === "potential_gap")) return "potential_mismatch";
  const supported = requirements.filter((item) => item.status === "supported").length;
  const evidenceRate = supported / requirements.length;
  if (evidenceRate >= 0.65 && !requirements.some((item) => item.mandatory && item.status !== "supported")) return "likely_fit";
  return "needs_review";
}

function parseRequirementStatus(value: unknown): RequirementStatus {
  const normalized = asString(value).toLowerCase().replace(/[ -]/g, "_");
  if (["supported", "meets", "likely_meets", "yes"].includes(normalized)) return "supported";
  if (["potential_gap", "gap", "does_not_meet", "no"].includes(normalized)) return "potential_gap";
  if (["not_found", "missing", "not_stated"].includes(normalized)) return "not_found";
  return "unclear";
}

function normalizeRequirementRows(raw: unknown, companySourceUrls: string[], tenderSourceUrls: string[]): TenderRequirement[] {
  if (!Array.isArray(raw)) return [];
  const knownCompany = new Set(companySourceUrls.map((item) => cleanUrl(item)).filter((item): item is string => Boolean(item)));
  const knownTender = new Set(tenderSourceUrls.map((item) => cleanUrl(item)).filter((item): item is string => Boolean(item)));
  return raw.slice(0, 80).map((item, index) => {
    const row = asRecord(item);
    const tenderSourceRaw = cleanUrl(asString(row.tender_source_url ?? row.tender_source));
    const companySourceRaw = cleanUrl(asString(row.supplier_source_url ?? row.company_source_url ?? row.company_source));
    const tenderSourceUrl = tenderSourceRaw && knownTender.has(tenderSourceRaw) ? tenderSourceRaw : "";
    const companySourceUrl = companySourceRaw && knownCompany.has(companySourceRaw) ? companySourceRaw : "";
    const tenderEvidence = asString(row.tender_evidence ?? row.evidence_from_tender ?? row.requirement_evidence);
    const supplierEvidence = asString(row.supplier_evidence ?? row.company_evidence ?? row.evidence_from_supplier);
    let status = parseRequirementStatus(row.status ?? row.match_status);
    if (!tenderEvidence || !tenderSourceUrl) status = "unclear";
    if (status === "supported" && (!supplierEvidence || !companySourceUrl)) status = "unclear";
    if (status === "potential_gap" && (!supplierEvidence || !companySourceUrl)) status = "unclear";
    return {
      id: createHash("sha1").update(`${asString(row.category, "other").toLowerCase()}|${asString(row.criterion ?? row.requirement ?? row.name, `req-${index + 1}`).toLowerCase()}`).digest("hex").slice(0, 12),
      criterion: asString(row.criterion ?? row.requirement ?? row.name, "Requirement to review"),
      category: asString(row.category, "Other"),
      mandatory: asBoolean(row.mandatory ?? row.is_mandatory),
      status,
      tenderEvidence,
      supplierEvidence,
      tenderSource: tenderEvidence && tenderSourceUrl ? source("Tender evidence", tenderSourceUrl, tenderEvidence) : null,
      supplierSource: companySourceUrl && supplierEvidence ? source("Supplier evidence", companySourceUrl, supplierEvidence) : null,
    };
  });
}

const COMPANY_PROFILE_FORMAT = {
  company_name: "",
  summary: "",
  capabilities: [{ value: "", source_url: "", evidence: "" }],
  certifications: [{ value: "", source_url: "", evidence: "" }],
  service_regions: [{ value: "", source_url: "", evidence: "" }],
  project_references: [{ value: "", source_url: "", evidence: "" }],
  equipment_and_resources: [{ value: "", source_url: "", evidence: "" }],
  quality_and_safety: [{ value: "", source_url: "", evidence: "" }],
  sustainability: [{ value: "", source_url: "", evidence: "" }],
};

const MATCH_FORMAT = {
  title: "",
  authority: "",
  authority_source_url: "",
  location: "",
  location_source_url: "",
  deadline: "",
  deadline_source_url: "",
  estimated_value: "",
  estimated_value_source_url: "",
  procurement_type: "",
  procurement_type_source_url: "",
  conflicts: [{ field: "", values: [{ value: "", source_url: "" }] }],
  summary: "",
  requirements: [{
    id: "",
    criterion: "",
    category: "",
    mandatory: true,
    status: "supported | potential_gap | unclear | not_found",
    tender_evidence: "",
    tender_source_url: "",
    supplier_evidence: "",
    supplier_source_url: "",
  }],
};

export async function runTenderScan(companyInput: string, options: ScanOptions = {}): Promise<ScanResult> {
  const companyUrl = cleanUrl(companyInput);
  if (!companyUrl) throw new Error("Enter a full company website address, such as https://company.fi.");
  const key = process.env.CONTEXT_DEV_API_KEY;
  if (!key) throw new Error("Context.dev is not configured. Add CONTEXT_DEV_API_KEY to the repository's .env.local file.");

  const client = new ContextDev({ apiKey: key, timeout: 125_000, maxRetries: 1 });
  const credits = { value: 0 };
  const companyDomain = hostOf(companyUrl);
  emitProgress(options, { type: "stage", stage: "supplier", message: "Reading the supplier website and building its evidence-based profile." });

  const [crawlResult, sitemapResult, brandResult, companyAnswer, newsResult] = await Promise.allSettled([
    client.web.webCrawlMd({
      url: companyUrl, maxPages: 500, maxDepth: 12, followSubdomains: true,
      includeLinks: true, includeImages: true, shortenBase64Images: true,
      pdf: { shouldParse: true }, maxAgeMs: 0, stopAfterMs: 110_000, timeoutMS: 120_000,
    }),
    client.web.webScrapeSitemap({ domain: companyDomain, maxLinks: 10_000, timeoutMS: 60_000 }),
    client.brand.retrieve({ domain: companyDomain, maxAgeMs: 0 }),
    fetchAnswers(key, "Build a source-grounded supplier profile from " + companyUrl + " and the company's public pages. Identify only explicitly supported capabilities, construction services, certifications, service regions, project references, equipment and resources, quality and safety practices, and sustainability evidence. Include a short evidence excerpt and exact URL for each fact. If a fact is not public or cannot be verified, leave it out.", COMPANY_PROFILE_FORMAT),
    fetchCompanyNews(key, companyDomain),
  ]);

  if (crawlResult.status === "rejected") throw new Error("Could not crawl the supplier website: " + messageOf(crawlResult.reason));
  const companyCrawl = crawlResult.value;
  addCredits(credits, companyCrawl);
  const sitemap = sitemapResult.status === "fulfilled" ? sitemapResult.value : null;
  if (sitemap) addCredits(credits, sitemap);
  const brandResponse = brandResult.status === "fulfilled" ? brandResult.value : null;
  if (brandResponse) addCredits(credits, brandResponse);
  const profileAnswer = companyAnswer.status === "fulfilled" ? companyAnswer.value : null;
  if (profileAnswer) addCredits(credits, profileAnswer);
  const companyNews = newsResult.status === "fulfilled" ? newsResult.value : null;
  if (companyNews) addCredits(credits, companyNews);

  const companyPages: CrawledPage[] = companyCrawl.results.map((page) => ({
    title: page.metadata.title || page.metadata.finalUrl,
    url: page.metadata.finalUrl || page.metadata.sourceUrl,
    markdown: page.markdown || "",
    success: page.metadata.success,
  }));
  const profileData = jsonContentRecord(profileAnswer?.json_content);
  const brand = asRecord(brandResponse?.brand);
  const brandName = asString(brand.name) || asString(brand.company_name) || asString(brand.domain);
  const profile = createCompanyProfile(companyUrl, companyDomain, profileData, companyPages, Number(sitemap?.urls?.length ?? 0), brandName, brand.description);
  profile.news = parseCompanyNews(companyNews);
  emitProgress(options, { type: "stage", stage: "supplier", message: "Supplier profile ready from " + profile.sourceCount + " successfully read pages." });

  const companySearchQuery = (brandName || companyDomain) + " " + profile.capabilities.slice(0, 5).join(" ") + " construction projects certifications public supplier";
  const supplierSignalSearch = await Promise.allSettled([
    client.web.search({ query: companySearchQuery + " site:" + companyDomain, numResults: 30, queryFanout: true, markdownOptions: { enabled: true, maxAgeMs: 0 } }),
    client.web.search({ query: '"' + companyDomain + '" company projects certifications', numResults: 30, queryFanout: true, markdownOptions: { enabled: true, maxAgeMs: 0 } }),
  ]);
  let externalSupplierHits: SearchHit[] = [];
  for (const result of supplierSignalSearch) {
    if (result.status !== "fulfilled") continue;
    addCredits(credits, result.value);
    externalSupplierHits = externalSupplierHits.concat(getSearchHits(result.value));
  }
  const externalSupplierPages = await mapLimit(unique(externalSupplierHits, (hit) => hit.url).slice(0, 12), 8, async (hit) => {
    try {
      const page = await client.web.webScrapeMd({ url: hit.url, includeLinks: true, pdf: { shouldParse: true }, maxAgeMs: 0, timeoutMS: 90_000 });
      addCredits(credits, page);
      return { title: page.metadata.title || page.url, url: page.metadata.finalUrl || page.url, markdown: page.markdown || "", success: page.success };
    } catch { return null; }
  });
  const externalPages = externalSupplierPages.filter((page): page is CrawledPage => Boolean(page?.success));
  const externalSources = externalPages.map((page) => source(page.title || "Public company reference", page.url, markdownExcerpt(page.markdown, ["construction", "project", "contract", "supplier", "rakennus", "urakka", "certificate"], 180)));
  profile.sources = unique([...profile.sources, ...externalSources], (item) => item.url).slice(0, 48);
  profile.sourceCount += externalPages.length;

  emitProgress(options, { type: "stage", stage: "discovery", message: "Searching TED and registered national procurement portals across Europe." });
  const sourceOutcomes: SourceCoverage[] = [];
  const nationalRuns = await mapLimit(PROCUREMENT_COUNTRIES, 6, async (country) => {
    if (!country.domains.length) {
      const outcome: SourceCoverage = {
        countryCode: country.code, country: country.name, sourceName: country.sourceName,
        sourceUrl: country.sourceUrl, status: "not_available", results: 0,
        detail: country.availabilityDetail || "No public national search endpoint is registered; TED was searched where available.",
      };
      sourceOutcomes.push(outcome);
      emitProgress(options, { type: "source", stage: "discovery", countryCode: country.code, sourceUrl: country.sourceUrl, message: country.name + ": national portal search unavailable; TED was checked." });
      return [] as SearchHit[];
    }
    try {
      const countryQuery = country.name + " open public procurement construction works tender " + profile.capabilities.slice(0, 4).join(" ");
      const response = await client.web.search({
        query: countryQuery,
        ...(country.searchCountry === null ? {} : { country: (country.searchCountry || country.code).toLowerCase() }),
        numResults: 25,
        queryFanout: true,
        includeDomains: country.domains,
        markdownOptions: { enabled: false },
        timeoutMS: 60_000,
      });
      addCredits(credits, response);
      const hits = getSearchHits(response)
        .filter((hit) => isRegisteredTenderUrl(hit.url))
        .map((hit) => ({ ...hit, countryCode: country.code, countryBasis: "national_portal" as const, sourceHost: hostOf(hit.url) }));
      sourceOutcomes.push({
        countryCode: country.code, country: country.name, sourceName: country.sourceName,
        sourceUrl: country.sourceUrl, status: "searched", results: hits.length,
        resultUrls: hits.slice(0, 10).map((hit) => hit.url),
        detail: ["Context.dev returned up to 25 indexed results. This is a discovery subset, not a complete portal export.", country.availabilityDetail].filter(Boolean).join(" "),
      });
      emitProgress(options, { type: "source", stage: "discovery", countryCode: country.code, sourceUrl: country.sourceUrl, query: countryQuery, completed: sourceOutcomes.length, total: PROCUREMENT_COUNTRIES.length, message: country.name + ": " + hits.length + " official portal results found." });
      return hits;
    } catch (error) {
      sourceOutcomes.push({
        countryCode: country.code, country: country.name, sourceName: country.sourceName,
        sourceUrl: country.sourceUrl, status: "failed", results: 0, detail: messageOf(error),
      });
      emitProgress(options, { type: "source", stage: "discovery", countryCode: country.code, sourceUrl: country.sourceUrl, completed: sourceOutcomes.length, total: PROCUREMENT_COUNTRIES.length, message: country.name + ": portal search failed." });
      return [] as SearchHit[];
    }
  });

  let tedPage: { hits: SearchHit[]; nextToken: string | null; total: number };
  emitProgress(options, { type: "source", stage: "discovery", countryCode: "EU", sourceUrl: "https://ted.europa.eu/", query: "Active construction CPV notices, current deadline, newest first; paginated", message: "Searching TED for active construction notices." });
  try {
    tedPage = await searchTedNotices(null);
    sourceOutcomes.push({
      countryCode: "EU", country: "TED / cross-border search", sourceName: "Tenders Electronic Daily (TED)",
      sourceUrl: "https://ted.europa.eu/", status: "searched", results: tedPage.hits.length,
      resultUrls: tedPage.hits.slice(0, 10).map((hit) => hit.url),
      detail: "TED reports " + tedPage.total + " active construction notices matching this query across TED. This is a TED-wide query total, not a count limited to the countries shown here. Returned rows are filtered to this demo's registered country set. This scan fetches pages on demand; the continuation cursor loads more. National portal searches are reported separately.",
    });
  } catch (error) {
    tedPage = { hits: [], nextToken: null, total: 0 };
    sourceOutcomes.push({
      countryCode: "EU", country: "TED / cross-border search", sourceName: "Tenders Electronic Daily (TED)",
      sourceUrl: "https://ted.europa.eu/", status: "failed", results: 0, detail: messageOf(error),
    });
  }
  const tedAggregate = sourceOutcomes.find((item) => item.countryCode === "EU");
  for (const country of PROCUREMENT_COUNTRIES) {
    const countryHits = tedPage.hits.filter((hit) => hit.countryCode === country.code);
    sourceOutcomes.push({
      countryCode: country.code,
      country: country.name,
      sourceName: "TED",
      sourceUrl: "https://ted.europa.eu/",
      status: tedAggregate?.status ?? "failed",
      results: countryHits.length,
      resultUrls: countryHits.slice(0, 10).map((hit) => hit.url),
      detail: tedAggregate?.status === "searched" ? "Count reflects TED pages fetched so far. More may be available through the continuation cursor." : tedAggregate?.detail,
    });
  }
  const candidates = unique([...tedPage.hits, ...nationalRuns.flat()], candidateKey)
    .filter((hit) => isRegisteredTenderUrl(hit.url));
  const rankedHits = rankCompanyMatches(candidates, profile);
  if (!rankedHits.length && sourceOutcomes.every((item) => item.status !== "searched")) {
    throw new Error("Tender discovery could not reach TED or any registered national portal.");
  }

  const firstBatch = rankedHits.slice(0, TENDER_PAGE_SIZE);
  const cursor: TenderCursor = {
    version: 1, companyUrl, profile,
    pendingHits: rankedHits.slice(TENDER_PAGE_SIZE),
    tedNextToken: tedPage.nextToken,
    sourceOutcomes,
    totalFound: rankedHits.length,
    seenIds: rankedHits.map(candidateKey),
    checkedAt: new Date().toISOString(),
  };
  const result = await researchPageHits(cursor, firstBatch, { client, key, credits, options });
  const nextCursor = cursor.pendingHits.length || cursor.tedNextToken ? encodeCursor(cursor) : null;
  const searchedHosts = [...new Set(sourceOutcomes.filter((item) => item.status === "searched").flatMap((item) => {
    const host = hostOf(item.sourceUrl);
    return host ? [host] : [];
  }))];

  emitProgress(options, { type: "stage", stage: "complete", message: "First result page completed. More notices are available through the continuation cursor when present." });
  return {
    companyUrl,
    company: profile,
    tenders: result.tenders.sort((a, b) => tenderRank(a.status) - tenderRank(b.status)),
    unresearchedTenders: result.unresearchedTenders,
    coverage: {
      searchSources: searchedHosts,
      searchResults: candidates.length,
      uniqueTenders: rankedHits.length,
      tenderPagesRead: result.coverage.tenderPagesRead,
      tenderPagesFailed: result.coverage.tenderPagesFailed,
      attachmentPagesRead: result.tenders.reduce((sum, tender) => sum + Math.max(0, tender.documentsRead - 1), 0) + result.unresearchedTenders.reduce((sum, tender) => sum + Math.max(0, (tender.documentsRead ?? 0) - 1), 0),
      creditsUsed: credits.value,
      sourceOutcomes: sourceOutcomes.sort((a, b) => a.countryCode.localeCompare(b.countryCode)),
      countriesSearched: [...new Set(sourceOutcomes.filter((item) => item.status === "searched").map((item) => item.countryCode))],
      totalDiscovered: rankedHits.length,
    },
    pagination: {
      hasMore: Boolean(nextCursor), nextCursor, pageSize: TENDER_PAGE_SIZE,
      totalFound: rankedHits.length, totalResearched: result.tenders.length,
    },
    checkedAt: cursor.checkedAt,
  };
}

function candidateKey(hit: SearchHit): string {
  return hit.publicationNumber ? "ted:" + hit.publicationNumber : hit.url;
}

function rankCompanyMatches(hits: SearchHit[], profile: CompanyProfile): SearchHit[] {
  return unique(hits, candidateKey).map((hit) => ({
    ...hit,
    relevance: String(opportunityRank(hit, profile)),
  })).sort((a, b) => opportunityRank(b, profile) - opportunityRank(a, profile));
}

async function researchPageHits(
  cursor: TenderCursor,
  hits: SearchHit[],
  context: { client: ContextDev; key: string; credits: { value: number }; options: ScanOptions },
): Promise<TenderPageResult> {
  const companyDomain = hostOf(cursor.companyUrl);
  const companyPages: CrawledPage[] = cursor.profile.sources
    .filter((item) => isSameCompanySite(item.url, companyDomain))
    .map((item) => ({ title: item.label, url: item.url, markdown: item.detail || "", success: true }));
  emitProgress(context.options, { type: "stage", stage: "documents", message: "Reading " + hits.length + " tender notices and linked documents." });
  const runs = await mapLimit(hits, 4, async (hit, index) => {
    emitProgress(context.options, { type: "stage", stage: "matching", completed: index, total: hits.length, message: "Researching " + (index + 1) + " of " + hits.length + ": " + hit.title });
    try {
      const tender = await researchTender(context.client, context.key, hit, cursor.companyUrl, companyDomain, companyPages, cursor.profile, context.credits, context.options);
      if (tender) {
        emitProgress(context.options, { type: "tender", stage: "matching", completed: index + 1, total: hits.length, message: "Finished: " + tender.title, tender });
        return { tender, failure: "", documentsRead: tender.documentsRead, documentsFailed: tender.documentsFailed };
      }
      return { tender: null, failure: "This notice could not be confirmed as open.", documentsRead: 0, documentsFailed: 0 };
    } catch (error) {
      return {
        tender: null,
        failure: messageOf(error),
        documentsRead: error instanceof TenderResearchError ? error.documentsRead : 0,
        documentsFailed: error instanceof TenderResearchError ? error.documentsFailed : 0,
      };
    }
  });
  const tenders = runs.flatMap((item) => item.tender ? [item.tender] : []);
  const unresearchedTenders = runs.flatMap((item, index) => item.tender ? [] : [{
    id: createHash("sha1").update(candidateKey(hits[index])).digest("hex").slice(0, 16),
    title: hits[index].title, url: hits[index].url,
    reason: item.failure || "The notice could not be fully researched.",
    documentsRead: item.documentsRead,
    documentsFailed: item.documentsFailed,
  }]);
  return {
    tenders,
    unresearchedTenders,
    pagination: { hasMore: false, nextCursor: null, pageSize: TENDER_PAGE_SIZE, totalFound: cursor.totalFound, totalResearched: tenders.length },
    coverage: {
      sourceOutcomes: cursor.sourceOutcomes,
      countriesSearched: [...new Set(cursor.sourceOutcomes.filter((item) => item.status === "searched").map((item) => item.countryCode))],
      totalDiscovered: cursor.totalFound,
      tenderPagesRead: runs.reduce((sum, run) => sum + run.documentsRead, 0),
      tenderPagesFailed: runs.reduce((sum, run) => sum + run.documentsFailed, 0),
      creditsUsed: context.credits.value,
    },
  };
}

export async function continueTenderScan(token: string, options: ScanOptions = {}): Promise<TenderPageResult> {
  const cursor = decodeCursor(token);
  const key = process.env.CONTEXT_DEV_API_KEY;
  if (!key) throw new Error("Context.dev is not configured.");
  const client = new ContextDev({ apiKey: key, timeout: 125_000, maxRetries: 1 });
  const credits = { value: 0 };
  const hits = cursor.pendingHits.splice(0, TENDER_PAGE_SIZE);
  const seen = new Set(cursor.seenIds);
  hits.forEach((hit) => seen.add(candidateKey(hit)));
  while (hits.length < TENDER_PAGE_SIZE && cursor.tedNextToken) {
    emitProgress(options, { type: "stage", stage: "discovery", message: "Loading the next page of active TED notices." });
    const previousToken = cursor.tedNextToken;
    const page = await searchTedNotices(previousToken);
    cursor.tedNextToken = page.nextToken;
    const tedAggregate = cursor.sourceOutcomes.find((item) => item.countryCode === "EU" && item.sourceName === "Tenders Electronic Daily (TED)");
    if (tedAggregate) {
      tedAggregate.results += page.hits.length;
      tedAggregate.resultUrls = unique([...(tedAggregate.resultUrls ?? []), ...page.hits.map((hit) => hit.url)], (url) => url).slice(0, 10);
    }
    for (const country of PROCUREMENT_COUNTRIES) {
      const countryHits = page.hits.filter((hit) => hit.countryCode === country.code);
      const outcome = cursor.sourceOutcomes.find((item) => item.countryCode === country.code && item.sourceName === "TED");
      if (!outcome) continue;
      outcome.results += countryHits.length;
      outcome.resultUrls = unique([...(outcome.resultUrls ?? []), ...countryHits.map((hit) => hit.url)], (url) => url).slice(0, 10);
    }
    const fresh = rankCompanyMatches(page.hits, cursor.profile).filter((hit) => !seen.has(candidateKey(hit)));
    for (const hit of fresh) {
      if (hits.length < TENDER_PAGE_SIZE) hits.push(hit);
      else cursor.pendingHits.push(hit);
    }
    fresh.forEach((hit) => seen.add(candidateKey(hit)));
    cursor.totalFound += fresh.length;
    if (!page.hits.length || !page.nextToken || page.nextToken === previousToken) cursor.tedNextToken = null;
  }
  if (!hits.length) {
    return {
      tenders: [], unresearchedTenders: [],
      pagination: { hasMore: false, nextCursor: null, pageSize: TENDER_PAGE_SIZE, totalFound: cursor.totalFound, totalResearched: 0 },
      coverage: { sourceOutcomes: cursor.sourceOutcomes, countriesSearched: [...new Set(cursor.sourceOutcomes.filter((item) => item.status === "searched").map((item) => item.countryCode))], totalDiscovered: cursor.totalFound, tenderPagesRead: 0, tenderPagesFailed: 0, creditsUsed: 0 },
    };
  }
  cursor.seenIds = [...seen];
  const result = await researchPageHits(cursor, hits, { client, key, credits, options });
  const nextCursor = cursor.pendingHits.length || cursor.tedNextToken ? encodeCursor(cursor) : null;
  return {
    ...result,
    pagination: { hasMore: Boolean(nextCursor), nextCursor, pageSize: TENDER_PAGE_SIZE, totalFound: cursor.totalFound, totalResearched: result.tenders.length },
  };
}
async function researchTender(
  client: ContextDev,
  key: string,
  hit: SearchHit,
  companyUrl: string,
  companyDomain: string,
  companyPages: CrawledPage[],
  profile: CompanyProfile,
  credits: { value: number },
  options: ScanOptions,
): Promise<TenderResult | null> {
  let notice: CrawledPage | null = null;
  emitProgress(options, { type: "source", stage: "documents", countryCode: hit.countryCode, sourceUrl: hit.url, message: "Reading the official notice: " + hit.title });
  try {
    const page = await client.web.webScrapeMd({
      url: hit.url,
      includeLinks: true,
      includeImages: true,
      shortenBase64Images: true,
      pdf: { shouldParse: true },
      maxAgeMs: 0,
      timeoutMS: 90_000,
    });
    addCredits(credits, page);
    notice = { title: page.metadata.title || hit.title, url: page.metadata.finalUrl || page.url, markdown: page.markdown || "", success: page.success };
  } catch {
    notice = null;
  }
  emitProgress(options, { type: "source", stage: "documents", countryCode: hit.countryCode, sourceUrl: hit.url, message: notice?.success ? "Official notice read successfully." : "Official notice could not be read." });

  if (!notice?.success || notice.markdown.trim().length < 120) {
    throw new TenderResearchError("Tender notice could not be read.", notice?.success ? 1 : 0, 1);
  }

  const tenderPages: CrawledPage[] = notice?.success ? [notice] : [];
  let documentsFailed = 0;

  const markdown = tenderPages.map((page) => page.markdown).join("\n\n");
  const allAttachmentUrls = unique(extractLinks(markdown, hit.url).filter(isTenderDocument).filter((url) => url !== hit.url), (url) => url);
  const attachmentLimitReached = allAttachmentUrls.length > MAX_ATTACHMENT_PAGES_PER_TENDER;
  const attachmentUrls = allAttachmentUrls.slice(0, MAX_ATTACHMENT_PAGES_PER_TENDER);
  const attachments = await mapLimit(attachmentUrls, 8, async (url, index) => {
    try {
      emitProgress(options, { type: "source", stage: "documents", countryCode: hit.countryCode, sourceUrl: url, message: "Reading a document linked from the notice." });
      const page = await client.web.webScrapeMd({
        url,
        includeLinks: true,
        includeImages: true,
        shortenBase64Images: true,
        pdf: { shouldParse: true },
        maxAgeMs: 0,
        timeoutMS: 90_000,
      });
      addCredits(credits, page);
      if (!page.success) documentsFailed += 1;
      emitProgress(options, { type: "source", stage: "documents", countryCode: hit.countryCode, sourceUrl: url, completed: index + 1, total: attachmentUrls.length, message: page.success ? "Linked tender document read successfully." : "Linked tender document could not be read." });
      return { title: page.metadata.title || page.url, url: page.metadata.finalUrl || page.url, markdown: page.markdown || "", success: page.success };
    } catch {
      documentsFailed += 1;
      emitProgress(options, { type: "source", stage: "documents", countryCode: hit.countryCode, sourceUrl: url, completed: index + 1, total: attachmentUrls.length, message: "Linked tender document request failed." });
      return null;
    }
  });
  const attachmentPages = attachments.filter((page): page is CrawledPage => Boolean(page?.success));

  const tenderIdentity = `${hit.title} ${hit.description}`.trim();
  const companyPageUrls = new Set(companyPages.filter((page) => page.success).map((page) => page.url));
  const profileEvidence = profile.sources.filter((item) => companyPageUrls.has(item.url))
    .map((item) => ({ item, score: procurementOverlap(tenderIdentity, `${item.label} ${item.detail ?? ""}`) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map(({ item }) => `${item.label} (${item.url}): ${item.detail ?? ""}`)
    .join("\n");
  const companyPageCatalog = rankedSourceCatalog(
    companyPages,
    `${tenderIdentity} ${profile.capabilities.join(" ")} ${profile.certifications.join(" ")}`,
    6,
    160,
  );
  const companyEvidenceCatalog = [profileEvidence, companyPageCatalog].filter(Boolean).join("\n");

  // Tender evidence comes from the official notice and its explicitly linked documents.
  // Search-engine results are not treated as verified buyer-side evidence.
  const buyerPages: CrawledPage[] = [];

  const tenderSourceCatalog = rankedSourceCatalog(
    unique([...tenderPages, ...attachmentPages, ...buyerPages], (page) => page.url),
    `${tenderIdentity} ${companyEvidenceCatalog}`,
    10,
    220,
  );
  const matchInstructions = "Use only the official notice and its linked tender documents, plus the supplied supplier pages. Return contracting authority, contract location (not buyer address), deadline and timezone, estimated value, procurement type, and a concise summary. Extract distinct mandatory and scored requirements. For each, quote tender evidence and compare direct supplier evidence with the exact URL of a supplied, successfully read page. Use supported only with direct positive supplier evidence, potential_gap only with a direct contradiction, and unclear when evidence is insufficient. Never infer failure from silence. For every named field and requirement, provide its exact source URL from the supplied pages. If the buyer is truly not named, leave authority and authority_source_url empty, do not guess, and do not cite a source for absence. Leave other unknown fields empty. Report conflicts only when two supplied sources disagree, with each value and exact source URL.";
  const matchHeader = `Supplier URL: ${companyUrl}\nTender URL: ${hit.url}\n${matchInstructions}\n`;
  const catalogBudget = Math.max(0, MAX_ANSWER_TASK_BYTES - Buffer.byteLength(matchHeader, "utf8") - 56);
  const supplierBudget = Math.floor(catalogBudget * 0.4);
  const tenderBudget = catalogBudget - supplierBudget;
  const evidenceContext = `Tender pages and attachments:\n${fitSourceCatalog(tenderSourceCatalog, tenderBudget)}\nSupplier evidence:\n${fitSourceCatalog(companyEvidenceCatalog, supplierBudget)}`;
  const matchTask = fitUtf8(`${matchHeader}${evidenceContext}`, MAX_ANSWER_TASK_BYTES);
  emitProgress(options, { type: "stage", stage: "matching", countryCode: hit.countryCode, sourceUrl: hit.url, message: "Comparing the read tender requirements with source-backed supplier facts." });
  let answer: AnyRecord;
  try {
    answer = await fetchAnswers(key, matchTask, MATCH_FORMAT);
  } catch (error) {
    throw new TenderResearchError(messageOf(error), tenderPages.length + attachmentPages.length, documentsFailed);
  }
  addCredits(credits, answer);
  const answerData = jsonContentRecord(answer.json_content);
  if (!Array.isArray(answerData.requirements) || answerData.requirements.length === 0) {
    throw new TenderResearchError("The notice and documents were read, but no structured requirements were returned.", tenderPages.length + attachmentPages.length, documentsFailed);
  }
  const companySourceUrls = companyPages.filter((page) => page.success).map((page) => page.url);
  const readTenderUrls = unique([
    ...tenderPages.map((page) => page.url),
    ...attachmentPages.map((page) => page.url),
    ...buyerPages.map((page) => page.url),
  ], (url) => url);
  const tenderSourceUrls = readTenderUrls;
  const requirements = normalizeRequirementRows(answerData.requirements, companySourceUrls, tenderSourceUrls);
  if (!requirements.length) throw new TenderResearchError("Requirements could not be linked to verified source evidence.", tenderPages.length + attachmentPages.length, documentsFailed);

  const checkedAt = new Date().toISOString();
  const title = asString(answerData.title, hit.title);
  const conflictRows = Array.isArray(answerData.conflicts) ? answerData.conflicts.map(asRecord) : [];
  const conflictDetails = (field: string): string[] => conflictRows.flatMap((row) => {
    if (asString(row.field).toLowerCase().replace(/[^a-z]/g, "") !== field.toLowerCase().replace(/[^a-z]/g, "")) return [];
    const values = Array.isArray(row.values) ? row.values : [];
    return values.flatMap((value) => {
      const item = asRecord(value);
      const text = asString(item.value);
      const url = cleanUrl(asString(item.source_url));
      if (!text || !url || !readTenderUrls.includes(url)) return [];
      return [text + " (" + url + ")"];
    });
  });
  const authorityConflict = conflictDetails("authority");
  const authorityAnswerUrl = cleanUrl(asString(answerData.authority_source_url));
  const authorityAnswerValue = asString(answerData.authority);
  const authoritySourceUrl = hit.authority ? notice.url : authorityAnswerUrl && readTenderUrls.includes(authorityAnswerUrl) ? authorityAnswerUrl : "";
  const authorityValue = authorityConflict.length
    ? "Conflicting authority names in reviewed sources"
    : hit.authority || (authoritySourceUrl ? authorityAnswerValue : "");
  const authoritySource = authorityValue && !authorityConflict.length && authoritySourceUrl
    ? source("Contracting authority", authoritySourceUrl, "Identified in successfully read official tender material.")
    : null;
  const locationValue = asString(answerData.location);
  const deadlineValue = asString(answerData.deadline);
  const estimatedValue = asString(answerData.estimated_value);
  const procurementType = asString(answerData.procurement_type);
  const fieldSource = (value: string, label: string, answerUrl: unknown): EvidenceSource | null => {
    if (!value) return null;
    const candidate = cleanUrl(asString(answerUrl));
    if (!candidate || !readTenderUrls.includes(candidate)) return null;
    return source(label, candidate, "Extracted from successfully read official tender material.");
  };
  const researchField = (value: string, label: string, answerUrl: unknown, field: string): ResearchField => {
    const conflicts = conflictDetails(field);
    const verifiedSource = fieldSource(value, label, answerUrl);
    return {
      value: conflicts.length || (value && !verifiedSource) ? null : value || null,
      status: conflicts.length ? "conflict" : value && !verifiedSource ? "source_unavailable" : value ? "found" : documentsFailed > 0 ? "source_unavailable" : attachmentLimitReached ? "not_searched" : "not_stated",
      source: conflicts.length ? null : verifiedSource,
      ...(conflicts.length ? { details: conflicts } : value && !verifiedSource ? { details: ["The extracted value was hidden because its source URL was not among the pages successfully read."] } : {}),
    };
  };
  const authorityCountry = countryByAnyCode(hit.countryCode ?? "");
  const serviceMatch = authorityCountry && regionMatchesCountry(profile.serviceRegions, authorityCountry);
  const matchedCapabilities = profile.capabilities.filter((capability) => procurementOverlap(`${hit.title} ${hit.description}`, capability) > 0);
  const authorityField = researchField(authorityValue || authorityAnswerValue, "Contracting authority", authoritySourceUrl, "authority");
  const locationField = researchField(locationValue, "Contract location", answerData.location_source_url, "location");
  const deadlineField = researchField(deadlineValue, "Tender deadline", answerData.deadline_source_url, "deadline");
  const estimatedValueField = researchField(estimatedValue, "Estimated value", answerData.estimated_value_source_url, "estimated_value");
  const procurementTypeField = researchField(procurementType, "Procurement type", answerData.procurement_type_source_url, "procurement_type");
  const sourceItems = unique(tenderSourceUrls.map((url) => {
    const page = [...tenderPages, ...attachmentPages, ...buyerPages].find((item) => item.url === url);
    return source(page?.title || (url === hit.url ? title : "Tender document"), url, page?.success ? "Fetched from the public tender record" : undefined);
  }), (item) => item.url).slice(0, 50);
  const tender: TenderResult = {
    id: createHash("sha1").update(hit.url).digest("hex").slice(0, 16),
    title: notice.title || hit.title,
    authority: authorityValue || "Buyer not identified in reviewed sources",
    authoritySource: authorityField.source,
    researchFields: {
      authority: authorityField,
      location: locationField,
      deadline: deadlineField,
      estimatedValue: estimatedValueField,
      procurementType: procurementTypeField,
    },
    countryCode: hit.countryCode,
    countryBasis: hit.countryBasis,
    relevanceReason: [
      matchedCapabilities.length ? "Capability overlap: " + matchedCapabilities.slice(0, 3).join(", ") : "Construction category match; supplier capability evidence is limited.",
      serviceMatch && hit.countryBasis === "execution_location" ? "Contract location matches a stated service area." : serviceMatch && hit.countryBasis === "national_portal" ? "Notice was found in a portal for a stated service area; exact delivery location needs review." : serviceMatch ? "Buyer country matches a stated service area; contract location may differ." : authorityCountry && hit.countryBasis === "execution_location" ? "Contract location is outside the supplier's stated service areas or no service area was found." : authorityCountry ? "Notice was found in another country's source; delivery location needs review." : "Contract country was not identified in source metadata.",
    ].join(" "),
    location: locationField.value || "Not stated in verified sources",
    deadline: deadlineField.value || "Not stated in verified sources",
    estimatedValue: estimatedValueField.value || "Not stated in verified sources",
    procurementType: procurementTypeField.value || "Not stated in verified sources",
    url: hit.url,
    summary: asString(answerData.summary, hit.description || "Tender notice found. Review the original notice and documents."),
    status: tenderStatus(requirements),
    requirements,
    documentsRead: tenderPages.filter((page) => page.success).length + attachmentPages.length + buyerPages.length,
    documentsFailed,
    sources: sourceItems,
    updatedAt: checkedAt,
  };

  const deadlineDate = Date.parse(tender.deadline);
  if (Number.isFinite(deadlineDate) && deadlineDate < Date.now()) {
    throw new TenderResearchError("This notice is expired based on its stated deadline.", tender.documentsRead, tender.documentsFailed);
  }

  return tender;
}

async function fetchAnswers(key: string, task: string, jsonFormat: AnyRecord): Promise<AnyRecord> {
  const response = await fetch("https://api.context.dev/v1/web/answers", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ mode: "ultra", task: fitUtf8(task, MAX_ANSWER_TASK_BYTES), json_format: jsonFormat }),
    cache: "no-store",
    signal: AbortSignal.timeout(125_000),
  });
  const responseText = await response.text();
  let body: AnyRecord;
  try {
    body = asRecord(JSON.parse(responseText));
  } catch {
    throw new Error(`Context.dev returned invalid JSON (${response.status}).`);
  }
  if (!response.ok) {
    const errorMessages: string[] = [];
    const collectMessages = (value: unknown, depth = 0) => {
      if (depth > 8 || value == null) return;
      if (Array.isArray(value)) { value.forEach((item) => collectMessages(item, depth + 1)); return; }
      if (typeof value !== "object") return;
      const record = asRecord(value);
      for (const key of ["message", "detail", "reason", "description"]) {
        const message = asString(record[key]);
        if (message) errorMessages.push(message);
      }
      Object.values(record).forEach((item) => {
        if (item && typeof item === "object") collectMessages(item, depth + 1);
      });
    };
    collectMessages(body);
    const errorMessage = errorMessages.at(-1) || asString(body.message) || asString(body.detail) || asString(body.error);
    const errorCode = asString(body.error_code) || asString(asRecord(body.error).code);
    const requestId = asString(body.request_id);
    const safeMessage = errorMessage.replace(/Bearer\s+\S+/gi, "Bearer [redacted]").replace(/(?:sk|ctx)_[A-Za-z0-9_-]{12,}/g, "[redacted]");
    const details = [safeMessage || "Context.dev rejected the research request.", requestId ? `Request ID: ${requestId}` : ""]
      .filter(Boolean)
      .join(" ")
      .slice(0, 600);
    throw new Error(`Context.dev research failed (${response.status}${errorCode ? `, ${errorCode}` : ""}). ${details}`.slice(0, 700));
  }
  if (body.partial === true) throw new Error("Context.dev returned a partial research result.");
  if (!body.json_content) throw new Error("Context.dev returned no structured research data.");
  return body;
}

async function fetchCompanyNews(key: string, domain: string): Promise<AnyRecord> {
  const response = await fetch("https://api.context.dev/v1/news/search", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ searchBy: { type: "entity", entity: { type: "domain", domain } }, limit: 50 }),
    cache: "no-store",
    signal: AbortSignal.timeout(45_000),
  });
  const body = asRecord(await response.json().catch(() => ({})));
  if (!response.ok) throw new Error(asString(body.message, `Company news search failed (${response.status}).`));
  return body;
}

function parseCompanyNews(response: unknown): EvidenceSource[] {
  const items = asRecord(response).data;
  if (!Array.isArray(items)) return [];
  return items.flatMap((item) => {
    const row = asRecord(item);
    const url = cleanUrl(asString(row.url));
    const title = asString(row.title);
    if (!url || !title) return [];
    const details = [asString(row.published_at), asString(row.description)].filter(Boolean).join(" · ");
    return [source(title, url, details)];
  }).slice(0, 30);
}

function createCompanyProfile(
  companyUrl: string,
  domain: string,
  profileData: AnyRecord,
  pages: CrawledPage[],
  sitemapUrls: number,
  brandName: string,
  brandSummary: string,
): CompanyProfile {
  const sourcePages = pages.filter((page) => page.success);
  const readUrls = new Set(sourcePages.map((page) => cleanUrl(page.url)).filter((item): item is string => Boolean(item)));
  const verifiedValues = (key: string) => (Array.isArray(profileData[key]) ? profileData[key] : []).flatMap((item) => {
    const fact = asRecord(item);
    const value = asString(fact.value);
    const url = cleanUrl(asString(fact.source_url));
    return value && url && readUrls.has(url) ? [value] : [];
  });
  const citedItems = [
    ...["capabilities", "certifications", "service_regions", "project_references", "equipment_and_resources", "quality_and_safety", "sustainability"].flatMap((key) =>
      (Array.isArray(profileData[key]) ? profileData[key] : []).map((item) => asRecord(item))),
  ];
  const citedSources = citedItems.flatMap((item) => {
    const url = cleanUrl(asString(item.source_url));
    const value = asString(item.value);
    return url && value && readUrls.has(url) ? [source(value, url, asString(item.evidence))] : [];
  });
  const previewNeedles = ["service", "construction", "rakennus", "certificate", "quality", "project", "reference", "kalusto", "sertifika", "laatu", "työturvallisuus"];
  const crawlEvidence = sourcePages
    .map((page) => ({ page, excerpt: markdownExcerpt(page.markdown, previewNeedles, 240) }))
    .filter((item) => item.excerpt)
    .slice(0, 20)
    .map(({ page, excerpt }) => source(page.title || "Supplier website", page.url, excerpt));
  return {
    name: asString(profileData.company_name, brandName || domain),
    domain,
    summary: asString(profileData.summary, brandSummary || "Company profile built from the submitted public website."),
    capabilities: verifiedValues("capabilities"),
    certifications: verifiedValues("certifications"),
    serviceRegions: verifiedValues("service_regions"),
    projectReferences: verifiedValues("project_references"),
    equipmentAndResources: verifiedValues("equipment_and_resources"),
    qualityAndSafety: verifiedValues("quality_and_safety"),
    sustainability: verifiedValues("sustainability"),
    sourceCount: sourcePages.length,
    failedCount: pages.length - sourcePages.length,
    sitemapUrls,
    sources: unique([...citedSources, ...crawlEvidence], (item) => item.url).slice(0, 40),
    news: [],
  };
}

function relevanceRank(value: string): number {
  if (value === "high") return 3;
  if (value === "medium") return 2;
  return 1;
}

function opportunityRank(hit: SearchHit, profile: CompanyProfile): number {
  const text = `${hit.title} ${hit.description}`.toLowerCase();
  const tradeTerms = [
    "construction", "building", "renovation", "repair", "works", "contract notice", "rakennus", "urakka", "korjaus", "rakennustyö",
    "infra", "putki", "sähkö", "maalaus", "betoni", "katto", "talotekniikka", "lvi", "maanrakennus",
    ...profile.capabilities.flatMap((value) => value.toLowerCase().split(/[^\p{L}\p{N}]+/u)).filter((value) => value.length > 3),
  ];
  const matched = new Set(tradeTerms.filter((term) => text.includes(term)));
  const rawScore = Number(hit.relevance);
  const searchScore = Number.isFinite(rawScore) ? Math.min(10, rawScore) : relevanceRank(hit.relevance) * 3;
  const country = countryByAnyCode(hit.countryCode ?? "");
  const serviceRegionMatch = Boolean(country && regionMatchesCountry(profile.serviceRegions, country));
  return searchScore + matched.size + (serviceRegionMatch ? 12 : 0);
}

function tenderRank(value: TenderStatus): number {
  if (value === "likely_fit") return 0;
  if (value === "needs_review") return 1;
  return 2;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}

export function compareSnapshots(previous: ScanResult | null, current: ScanResult): TenderChange[] {
  if (!previous || !Array.isArray(previous.tenders) || previous.companyUrl !== current.companyUrl) return [];
  const oldById = new Map(previous.tenders.map((tender) => [tender.id, tender]));
  const newById = new Map(current.tenders.map((tender) => [tender.id, tender]));
  const changes: TenderChange[] = [];
  for (const tender of current.tenders) {
    const old = oldById.get(tender.id);
    if (!old) {
      changes.push({ tenderId: tender.id, tenderTitle: tender.title, kind: "new", details: ["New opportunity found since the previous scan."] });
      continue;
    }
    const details: string[] = [];
    if (old.deadline !== tender.deadline) details.push(`Deadline changed from ${old.deadline} to ${tender.deadline}.`);
    if (old.status !== tender.status) details.push(`Fit assessment changed from ${old.status.replaceAll("_", " ")} to ${tender.status.replaceAll("_", " ")}.`);
    if (tender.documentsRead > old.documentsRead) details.push(`${tender.documentsRead - old.documentsRead} additional tender or buyer pages/documents were read.`);
    const oldRequirements = new Map(old.requirements.map((item) => [item.id, item]));
    for (const requirement of tender.requirements) {
      const prior = oldRequirements.get(requirement.id);
      if (prior && prior.status !== requirement.status) details.push(`“${requirement.criterion}” changed from ${prior.status.replaceAll("_", " ")} to ${requirement.status.replaceAll("_", " ")}.`);
      if (!prior) details.push(`New requirement found: “${requirement.criterion}”.`);
    }
    if (details.length) changes.push({ tenderId: tender.id, tenderTitle: tender.title, kind: "changed", details });
  }
  const previousTenders = Array.isArray(previous.tenders) ? previous.tenders : [];
  if (!current.pagination?.hasMore) for (const tender of previousTenders) {
    if (!newById.has(tender.id)) changes.push({ tenderId: tender.id, tenderTitle: tender.title, kind: "removed", details: ["This opportunity did not appear in the completed current scan. It may have closed, moved, or fallen outside the available source results."] });
  }
  return changes;
}
