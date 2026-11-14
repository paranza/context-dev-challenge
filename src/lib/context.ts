import ContextDev from "context.dev";
import { createHash } from "node:crypto";
import type { ResearchProgress, ResearchProgressListener } from "@/lib/research-progress";
import type {
  CompanyProfile,
  EvidenceSource,
  RequirementStatus,
  ScanResult,
  TenderChange,
  TenderRequirement,
  TenderResult,
  TenderStatus,
} from "@/lib/types";

type AnyRecord = Record<string, unknown>;
type SearchHit = { title: string; url: string; description: string; relevance: string };
type CrawledPage = { title: string; url: string; markdown: string; success: boolean };

const TENDER_DOMAINS = ["hankintailmoitukset.fi", "ted.europa.eu"];
const MAX_TENDERS = 5;
const MAX_ATTACHMENT_PAGES_PER_TENDER = 35;

function reportProgress(listener: ResearchProgressListener | undefined, progress: ResearchProgress) {
  try {
    listener?.(progress);
  } catch {
    // A disconnected progress consumer must never interrupt the research itself.
  }
}

function asRecord(value: unknown): AnyRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as AnyRecord) : {};
}

function asString(value: unknown, fallback = ""): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
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

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const index = next++;
      if (index >= items.length) return;
      results[index] = await fn(items[index]);
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

function hasOfficialTenderHost(url: string): boolean {
  const host = hostOf(url);
  return TENDER_DOMAINS.some((domain) => host === domain || host.endsWith(`.${domain}`));
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

function normalizeRequirementRows(raw: unknown, answerSources: string[], companySourceUrls: string[], tenderSourceUrls: string[], tenderUrl: string): TenderRequirement[] {
  if (!Array.isArray(raw)) return [];
  const knownSources = answerSources.map((item) => cleanUrl(item)).filter((item): item is string => Boolean(item));
  const knownCompany = new Set(companySourceUrls.map((item) => cleanUrl(item)).filter((item): item is string => Boolean(item)));
  const knownTender = new Set(tenderSourceUrls.map((item) => cleanUrl(item)).filter((item): item is string => Boolean(item)));
  return raw.slice(0, 80).map((item, index) => {
    const row = asRecord(item);
    const tenderSourceRaw = cleanUrl(asString(row.tender_source_url ?? row.tender_source));
    const companySourceRaw = cleanUrl(asString(row.supplier_source_url ?? row.company_source_url ?? row.company_source));
    const tenderSourceUrl = tenderSourceRaw && knownTender.has(tenderSourceRaw)
      ? tenderSourceRaw
      : knownSources.find((url) => knownTender.has(url)) ?? cleanUrl(tenderUrl) ?? tenderUrl;
    const companySourceUrl = companySourceRaw && knownCompany.has(companySourceRaw)
      ? companySourceRaw
      : knownSources.find((url) => knownCompany.has(url)) ?? "";
    const tenderEvidence = asString(row.tender_evidence ?? row.evidence_from_tender ?? row.requirement_evidence);
    const supplierEvidence = asString(row.supplier_evidence ?? row.company_evidence ?? row.evidence_from_supplier);
    let status = parseRequirementStatus(row.status ?? row.match_status);
    if (status === "supported" && (!supplierEvidence || !companySourceUrl)) status = "unclear";
    if (status === "potential_gap" && (!supplierEvidence || !companySourceUrl)) status = "unclear";
    return {
      id: createHash("sha1").update(`${asString(row.category, "other").toLowerCase()}|${asString(row.criterion ?? row.requirement ?? row.name, `req-${index + 1}`).toLowerCase()}`).digest("hex").slice(0, 12),
      criterion: asString(row.criterion ?? row.requirement ?? row.name, "Requirement to review"),
      category: asString(row.category, "Other"),
      mandatory: Boolean(row.mandatory ?? row.is_mandatory),
      status,
      tenderEvidence,
      supplierEvidence,
      tenderSource: tenderEvidence ? source("Tender evidence", tenderSourceUrl, tenderEvidence) : null,
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
  location: "",
  deadline: "",
  estimated_value: "",
  procurement_type: "",
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

export async function runTenderScan(companyInput: string, onProgress?: ResearchProgressListener): Promise<ScanResult> {
  const companyUrl = cleanUrl(companyInput);
  if (!companyUrl) throw new Error("Enter a full company website address, such as https://company.fi.");
  const key = process.env.CONTEXT_DEV_API_KEY;
  if (!key) throw new Error("Context.dev is not configured. Add CONTEXT_DEV_API_KEY to the repository's .env.local file.");

  const client = new ContextDev({ apiKey: key, timeout: 125_000, maxRetries: 1 });
  const credits = { value: 0 };
  const companyDomain = hostOf(companyUrl);

  reportProgress(onProgress, { stage: "supplier", status: "active", message: `Researching ${companyDomain} and its public supplier information` });

  const [crawlResult, sitemapResult, brandResult, companyAnswer, newsResult] = await Promise.allSettled([
    client.web.webCrawlMd({
      url: companyUrl,
      maxPages: 500,
      maxDepth: 12,
      followSubdomains: true,
      includeLinks: true,
      includeImages: true,
      shortenBase64Images: true,
      pdf: { shouldParse: true },
      maxAgeMs: 0,
      stopAfterMs: 110_000,
      timeoutMS: 120_000,
    }).then((result) => {
      const readPages = result.results.filter((page) => page.metadata.success);
      const firstPage = readPages[0];
      reportProgress(onProgress, {
        stage: "supplier", status: "info", message: `Read ${readPages.length} supplier ${readPages.length === 1 ? "page" : "pages"}`,
        count: readPages.length,
        ...(firstPage ? { source: { label: firstPage.metadata.title || companyDomain, url: firstPage.metadata.finalUrl || firstPage.metadata.sourceUrl } } : {}),
      });
      return result;
    }),
    client.web.webScrapeSitemap({ domain: companyDomain, maxLinks: 10_000, timeoutMS: 60_000 }).then((result) => {
      const count = result.urls?.length ?? 0;
      reportProgress(onProgress, { stage: "supplier", status: "info", message: `Discovered ${count} supplier sitemap ${count === 1 ? "URL" : "URLs"}`, count });
      return result;
    }),
    client.brand.retrieve({ domain: companyDomain, maxAgeMs: 0 }).then((result) => {
      reportProgress(onProgress, { stage: "supplier", status: "info", message: "Retrieved the company identity and brand profile" });
      return result;
    }),
    fetchAnswers(key, `Build a source-grounded supplier profile from ${companyUrl} and the company's public pages. Identify only explicitly supported capabilities, construction services, certifications, service regions, project references, equipment and resources, quality and safety practices, and sustainability evidence. Include a short evidence excerpt and the exact URL for each fact. If a fact is not public or cannot be verified, leave it out.`, COMPANY_PROFILE_FORMAT).then((result) => {
      reportProgress(onProgress, { stage: "supplier", status: "info", message: "Read public supplier capability and qualification information" });
      return result;
    }),
    fetchCompanyNews(key, companyDomain).then((result) => {
      const count = parseCompanyNews(result).length;
      reportProgress(onProgress, { stage: "supplier", status: "info", message: `Found ${count} recent public company news ${count === 1 ? "item" : "items"}`, count });
      return result;
    }),
  ]);

  if (crawlResult.status === "rejected") throw new Error(`Could not crawl the supplier website: ${messageOf(crawlResult.reason)}`);
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
  const readCompanyPages = companyPages.filter((page) => page.success);
  const profileData = asRecord(profileAnswer?.json_content);
  const brand = asRecord(brandResponse?.brand);
  const brandName = asString(brand.name) || asString(brand.company_name) || asString(brand.domain);
  const profile = createCompanyProfile(companyUrl, companyDomain, profileData, companyPages, Number(sitemap?.urls?.length ?? 0), brandName, asString(brand.description));
  profile.news = parseCompanyNews(companyNews);

  reportProgress(onProgress, { stage: "supplier", status: "info", message: `Assembled the public supplier profile for ${profile.name || companyDomain}` });
  reportProgress(onProgress, { stage: "supplier", status: "info", message: "Looking for public company references and project information" });

  const companySearchQuery = `${brandName || companyDomain} ${profile.capabilities.slice(0, 5).join(" ")} Finland construction projects certifications public supplier`;
  const supplierSignalSearch = await Promise.allSettled([
    client.web.search({ query: `${companySearchQuery} site:${companyDomain}`, country: "fi", numResults: 30, queryFanout: true, markdownOptions: { enabled: true, maxAgeMs: 0 } }),
    client.web.search({ query: `"${companyDomain}" company projects certifications Finland`, country: "fi", numResults: 30, queryFanout: true, markdownOptions: { enabled: true, maxAgeMs: 0 } }),
  ]);
  let externalSupplierHits: SearchHit[] = [];
  for (const result of supplierSignalSearch) {
    if (result.status !== "fulfilled") continue;
    addCredits(credits, result.value);
    externalSupplierHits = externalSupplierHits.concat(getSearchHits(result.value));
  }
  const externalSupplierPages = await mapLimit(unique(externalSupplierHits, (hit) => hit.url).slice(0, 12), 8, async (hit): Promise<CrawledPage | null> => {
    try {
      const page = await client.web.webScrapeMd({ url: hit.url, includeLinks: true, pdf: { shouldParse: true }, maxAgeMs: 0, timeoutMS: 90_000 });
      addCredits(credits, page);
      return { title: page.metadata.title || page.url, url: page.metadata.finalUrl || page.url, markdown: page.markdown || "", success: page.success };
    } catch {
      return null;
    }
  });
  const externalPages = externalSupplierPages.filter((page): page is CrawledPage => Boolean(page?.success));
  const externalSources = externalPages.map((page) => source(page.title || "Public company reference", page.url, markdownExcerpt(page.markdown, ["construction", "project", "contract", "supplier", "rakennus", "urakka", "sertifika"], 180)));
  profile.sources = unique([...profile.sources, ...externalSources], (item) => item.url).slice(0, 48);
  profile.sourceCount += externalPages.length;

  reportProgress(onProgress, { stage: "supplier", status: "info", message: `Read ${externalPages.length} additional company ${externalPages.length === 1 ? "reference" : "references"}`, count: externalPages.length });
  reportProgress(onProgress, { stage: "supplier", status: "complete", message: "Supplier research complete", count: readCompanyPages.length + externalPages.length });
  reportProgress(onProgress, { stage: "discovery", status: "active", message: "Searching Hilma and TED for relevant Finnish procurement notices" });

  const discoveryQueries = unique([
    "Finland current open public procurement construction works tender building renovation Hilma",
    "Suomi avoimet rakennusurakat tarjouspyyntö Hilma rakennustyöt peruskorjaus",
    `Finland TED open works tender construction ${profile.capabilities.slice(0, 3).join(" ")}`,
    companySearchQuery,
  ], (query) => query.toLowerCase()).slice(0, 4);

  const searchResults = await Promise.allSettled(discoveryQueries.map((query) => client.web.search({
    query,
    country: "fi",
    numResults: 50,
    queryFanout: true,
    includeDomains: TENDER_DOMAINS,
    markdownOptions: { enabled: true, includeLinks: true, includeImages: true, pdf: { shouldParse: true }, maxAgeMs: 0, timeoutMS: 120_000 },
    timeoutMS: 120_000,
  })));

  const hits: SearchHit[] = [];
  const searchSources = new Set<string>();
  let successfulSearches = 0;
  for (const result of searchResults) {
    if (result.status !== "fulfilled") continue;
    successfulSearches += 1;
    addCredits(credits, result.value);
    getSearchHits(result.value).forEach((hit) => {
      if (hasOfficialTenderHost(hit.url)) {
        hits.push(hit);
        searchSources.add(hostOf(hit.url));
      }
    });
  }
  if (!successfulSearches) throw new Error("Tender discovery failed for both Hilma and TED. Try again in a moment.");

  const rankedHits = unique(hits, (hit) => hit.url).sort((a, b) =>
    opportunityRank(b, profile) - opportunityRank(a, profile),
  );
  reportProgress(onProgress, { stage: "discovery", status: "complete", message: `Found ${rankedHits.length} candidate procurement ${rankedHits.length === 1 ? "notice" : "notices"}`, count: rankedHits.length });
  const candidateCount = Math.min(rankedHits.length, MAX_TENDERS);
  reportProgress(onProgress, { stage: "analysis", status: "active", message: candidateCount ? `Reading documents and checking requirements for ${candidateCount} candidate ${candidateCount === 1 ? "notice" : "notices"}` : "Checking the discovery results for opportunities to research", count: candidateCount });
  const tenderRuns = await mapLimit(rankedHits.slice(0, MAX_TENDERS), 4, async (hit) => {
    try {
      return await researchTender(client, key, hit, companyUrl, companyDomain, companyPages.filter((page) => isSameCompanySite(page.url, companyDomain)), credits, onProgress);
    } catch {
      reportProgress(onProgress, { stage: "analysis", status: "info", message: "This notice needs a manual review after a research error", source: { label: hit.title || "Procurement notice", url: hit.url } });
      return makeFallbackTender(hit, companyUrl);
    }
  });
  const tenders = tenderRuns.filter((item): item is TenderResult => Boolean(item));
  reportProgress(onProgress, { stage: "analysis", status: "complete", message: `Prepared ${tenders.length} researched ${tenders.length === 1 ? "opportunity" : "opportunities"}`, count: tenders.length });
  return {
    companyUrl,
    company: profile,
    tenders: tenders.sort((a, b) => tenderRank(a.status) - tenderRank(b.status)),
    coverage: {
      searchSources: [...searchSources],
      searchResults: hits.length,
      uniqueTenders: rankedHits.length,
      tenderPagesRead: tenders.reduce((sum, tender) => sum + tender.documentsRead, 0),
      tenderPagesFailed: tenderRuns.reduce((sum, tender) => sum + (tender?.documentsFailed ?? 1), 0),
      attachmentPagesRead: tenders.reduce((sum, tender) => sum + Math.max(0, tender.documentsRead - 1), 0),
      creditsUsed: credits.value,
    },
    checkedAt: new Date().toISOString(),
  };
}

async function researchTender(
  client: ContextDev,
  key: string,
  hit: SearchHit,
  companyUrl: string,
  companyDomain: string,
  companyPages: CrawledPage[],
  credits: { value: number },
  onProgress?: ResearchProgressListener,
): Promise<TenderResult | null> {
  reportProgress(onProgress, { stage: "analysis", status: "active", message: "Researching procurement notice", source: { label: hit.title || "Procurement notice", url: hit.url } });
  let notice: CrawledPage | null = null;
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

  const tenderPages: CrawledPage[] = notice?.success ? [notice] : [];
  if (notice?.success) reportProgress(onProgress, { stage: "analysis", status: "info", message: "Read the procurement notice", source: { label: notice.title || hit.title, url: notice.url }, count: 1 });
  let documentsFailed = 0;
  if (!notice?.success) documentsFailed += 1;

  const markdown = tenderPages.map((page) => page.markdown).join("\n\n");
  const attachmentUrls = unique(extractLinks(markdown, hit.url).filter(isTenderDocument).filter((url) => url !== hit.url), (url) => url)
    .slice(0, MAX_ATTACHMENT_PAGES_PER_TENDER);
  const attachments = await mapLimit(attachmentUrls, 8, async (url): Promise<CrawledPage | null> => {
    try {
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
      return { title: page.metadata.title || page.url, url: page.metadata.finalUrl || page.url, markdown: page.markdown || "", success: page.success };
    } catch {
      documentsFailed += 1;
      return null;
    }
  });
  const attachmentPages = attachments.filter((page): page is CrawledPage => Boolean(page?.success));
  if (attachmentUrls.length) reportProgress(onProgress, {
    stage: "analysis", status: "info", message: `Read ${attachmentPages.length} linked tender ${attachmentPages.length === 1 ? "document" : "documents"}`,
    count: attachmentPages.length,
    ...(attachmentPages[0] ? { source: { label: attachmentPages[0].title || "Tender document", url: attachmentPages[0].url } } : {}),
  });

  const companyEvidenceCatalog = companyPages.filter((page) => page.success).slice(0, 18).map((page) =>
    `${page.title}: ${page.url} | ${markdownExcerpt(page.markdown, ["certification", "experience", "construction", "project", "quality", "safety", "service", "rakennus", "referenssi"], 100)}`,
  ).join("\n").slice(0, 420);

  const buyerPages: CrawledPage[] = [];
  const tenderIdentity = `${hit.title} ${hit.description}`.trim();
  if (tenderIdentity) {
    try {
      const buyerSearch = await client.web.search({
        query: `"${hit.title}" ${hit.description.slice(0, 220)} Finland procurement specifications appendices`,
        country: "fi",
        numResults: 20,
        queryFanout: true,
        markdownOptions: { enabled: false },
        timeoutMS: 90_000,
      });
      addCredits(credits, buyerSearch);
      const buyerHits = unique(getSearchHits(buyerSearch)
        .filter((item) => item.url !== hit.url && hostOf(item.url) !== companyDomain)
        .map((item) => ({ ...item, score: procurementOverlap(tenderIdentity, `${item.title} ${item.description}`) }))
        .filter((item) => item.score >= 2)
        .sort((a, b) => b.score - a.score), (item) => item.url).slice(0, 8);
      const scrapedBuyerPages = await mapLimit(buyerHits, 6, async (buyerHit): Promise<CrawledPage | null> => {
        try {
          const page = await client.web.webScrapeMd({ url: buyerHit.url, includeLinks: true, pdf: { shouldParse: true }, maxAgeMs: 0, timeoutMS: 90_000 });
          addCredits(credits, page);
          return { title: page.metadata.title || page.url, url: page.metadata.finalUrl || page.url, markdown: page.markdown || "", success: page.success };
        } catch {
          documentsFailed += 1;
          return null;
        }
      });
      buyerPages.push(...scrapedBuyerPages.filter((page): page is CrawledPage => Boolean(page?.success)));
      if (buyerPages.length) reportProgress(onProgress, { stage: "analysis", status: "info", message: `Read ${buyerPages.length} buyer-side source ${buyerPages.length === 1 ? "page" : "pages"}`, count: buyerPages.length, source: { label: buyerPages[0].title || "Buyer source", url: buyerPages[0].url } });
    } catch {
      // The notice and its linked documents remain the authoritative tender sources.
    }
  }

  const tenderSourceCatalog = unique([...tenderPages, ...attachmentPages, ...buyerPages], (page) => page.url)
    .map((page) => `${page.title}: ${page.url} | ${markdownExcerpt(page.markdown, ["qualification", "requirement", "certification", "deadline", "delivery", "insurance", "quality", "safety", "submission", "tarjous", "vaatimus"], 130)}`)
    .join("\n").slice(0, 600);
  const matchTask = `Compare supplier ${companyUrl} with this public tender. Supplier source pages already read: ${companyEvidenceCatalog}. Tender notice, linked specifications and documents, and relevant buyer pages already read: ${tenderSourceCatalog}. Tender URL: ${hit.url}. Extract every distinct eligibility, qualification, capability, certification, experience, capacity, delivery, location, language, financial, insurance, safety, sustainability, pricing and submission requirement. For each, say mandatory/scored, quote evidence and exact URLs, compare supplier evidence. supported requires direct positive evidence; potential_gap requires direct contradiction; not_found means searched without evidence; never infer failure from silence. Return title, authority, location, deadline/timezone, estimated value, type and concise summary.`;
  let answer: AnyRecord | null = null;
  try {
    answer = await fetchAnswers(key, matchTask, MATCH_FORMAT);
    addCredits(credits, answer);
  } catch {
    documentsFailed += 1;
  }

  const answerData = asRecord(answer?.json_content);
  const rawAnswerSources = Array.isArray(answer?.sources) ? answer.sources.map((item) => cleanUrl(asString(item))).filter((item): item is string => Boolean(item)) : [];
  const companySourceUrls = companyPages.filter((page) => page.success).map((page) => page.url);
  const readTenderUrls = unique([
    ...tenderPages.map((page) => page.url),
    ...attachmentPages.map((page) => page.url),
    ...buyerPages.map((page) => page.url),
  ], (url) => url);
  const knownReadUrls = new Set([...companySourceUrls, ...readTenderUrls].map((url) => cleanUrl(url)).filter((item): item is string => Boolean(item)));
  const answerSources = rawAnswerSources.filter((url) => knownReadUrls.has(url));
  const tenderSourceUrls = readTenderUrls;
  const requirements = normalizeRequirementRows(answerData.requirements, answerSources, companySourceUrls, tenderSourceUrls, hit.url);

  const checkedAt = new Date().toISOString();
  const title = asString(answerData.title, hit.title);
  const sourceItems = unique(tenderSourceUrls.map((url) => {
    const page = [...tenderPages, ...attachmentPages, ...buyerPages].find((item) => item.url === url);
    return source(page?.title || (url === hit.url ? title : "Tender document"), url, page?.success ? "Fetched from the public tender record" : undefined);
  }), (item) => item.url).slice(0, 50);
  const tender: TenderResult = {
    id: createHash("sha1").update(hit.url).digest("hex").slice(0, 16),
    title,
    authority: asString(answerData.authority, "Buyer not identified"),
    location: asString(answerData.location, "Location not identified"),
    deadline: asString(answerData.deadline, "Deadline not identified"),
    estimatedValue: asString(answerData.estimated_value, "Not stated"),
    procurementType: asString(answerData.procurement_type, "Not identified"),
    url: hit.url,
    summary: asString(answerData.summary, hit.description || "Tender notice found. Review the original notice and documents."),
    status: tenderStatus(requirements),
    requirements,
    documentsRead: tenderPages.filter((page) => page.success).length + attachmentPages.length + buyerPages.length,
    documentsFailed,
    sources: sourceItems,
    updatedAt: checkedAt,
  };

  reportProgress(onProgress, { stage: "analysis", status: "info", message: `Reviewed ${tender.documentsRead} source ${tender.documentsRead === 1 ? "document" : "documents"} and compared ${requirements.length} ${requirements.length === 1 ? "requirement" : "requirements"}`, count: tender.documentsRead, source: { label: title || hit.title, url: hit.url } });

  const deadlineDate = Date.parse(tender.deadline);
  if (Number.isFinite(deadlineDate) && deadlineDate < Date.now()) {
    reportProgress(onProgress, { stage: "analysis", status: "info", message: "Excluded a notice whose deadline has passed", source: { label: title || hit.title, url: hit.url } });
    return null;
  }

  return tender;
}

async function fetchAnswers(key: string, task: string, jsonFormat: AnyRecord): Promise<AnyRecord> {
  const response = await fetch("https://api.context.dev/v1/web/answers", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ mode: "ultra", task: task.slice(0, 1_950), json_format: jsonFormat }),
    cache: "no-store",
    signal: AbortSignal.timeout(125_000),
  });
  const body = asRecord(await response.json().catch(() => ({})));
  if (!response.ok) throw new Error(asString(body.message, `Context.dev research failed (${response.status}).`));
  if (body.partial === true) throw new Error("Context.dev returned a partial research result.");
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

function makeFallbackTender(hit: SearchHit, companyUrl: string): TenderResult {
  return {
    id: createHash("sha1").update(hit.url).digest("hex").slice(0, 16),
    title: hit.title,
    authority: "Buyer not identified",
    location: "Location not identified",
    deadline: "Deadline not identified",
    estimatedValue: "Not stated",
    procurementType: "Not identified",
    url: hit.url,
    summary: hit.description || "A public procurement result was found. The notice could not be fully researched. Open the source to review it.",
    status: "needs_review",
    requirements: [],
    documentsRead: 0,
    documentsFailed: 1,
    sources: [source("Tender notice", hit.url), source("Supplier website", companyUrl)],
    updatedAt: new Date().toISOString(),
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
  return relevanceRank(hit.relevance) * 3 + matched.size;
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
  for (const tender of previousTenders) {
    if (!newById.has(tender.id)) changes.push({ tenderId: tender.id, tenderTitle: tender.title, kind: "removed", details: ["This opportunity did not appear in the current scan. It may have closed, moved, or fallen outside the limited results researched this time."] });
  }
  return changes;
}
