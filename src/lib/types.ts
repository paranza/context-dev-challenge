export type RequirementStatus = "supported" | "potential_gap" | "unclear" | "not_found";
export type TenderStatus = "likely_fit" | "needs_review" | "potential_mismatch";
export type ResearchFieldStatus = "found" | "not_stated" | "source_unavailable" | "not_searched" | "conflict";

export type ResearchField = {
  value: string | null;
  status: ResearchFieldStatus;
  source: EvidenceSource | null;
  details?: string[];
};

export type SourceCoverage = {
  countryCode: string;
  country: string;
  sourceName: string;
  sourceUrl: string;
  status: "searched" | "failed" | "not_available";
  results: number;
  resultUrls?: string[];
  detail?: string;
};

export type ScanProgressEvent = {
  type: "stage" | "source" | "tender" | "error";
  stage: string;
  message: string;
  countryCode?: string;
  sourceUrl?: string;
  query?: string;
  completed?: number;
  total?: number;
  tender?: TenderResult;
};

export type EvidenceSource = {
  label: string;
  url: string;
  detail?: string;
  capturedAt?: string;
};

export type TenderRequirement = {
  id: string;
  criterion: string;
  category: string;
  mandatory: boolean;
  status: RequirementStatus;
  tenderEvidence: string;
  supplierEvidence: string;
  tenderSource: EvidenceSource | null;
  supplierSource: EvidenceSource | null;
};

export type TenderResult = {
  id: string;
  title: string;
  authority: string;
  authoritySource?: EvidenceSource | null;
  researchFields?: {
    authority: ResearchField;
    location: ResearchField;
    deadline: ResearchField;
    estimatedValue: ResearchField;
    procurementType: ResearchField;
  };
  countryCode?: string;
  countryBasis?: "execution_location" | "buyer_country" | "national_portal";
  relevanceReason?: string;
  location: string;
  deadline: string;
  estimatedValue: string;
  procurementType: string;
  url: string;
  summary: string;
  status: TenderStatus;
  requirements: TenderRequirement[];
  documentsRead: number;
  documentsFailed: number;
  sources: EvidenceSource[];
  updatedAt: string;
};

export type CompanyProfile = {
  name: string;
  domain: string;
  summary: string;
  capabilities: string[];
  certifications: string[];
  serviceRegions: string[];
  projectReferences: string[];
  equipmentAndResources: string[];
  qualityAndSafety: string[];
  sustainability: string[];
  sourceCount: number;
  failedCount: number;
  sitemapUrls: number;
  sources: EvidenceSource[];
  news: EvidenceSource[];
};

export type ScanResult = {
  companyUrl: string;
  company: CompanyProfile;
  tenders: TenderResult[];
  unresearchedTenders: { id: string; title: string; url: string; reason: string; documentsRead?: number; documentsFailed?: number }[];
  coverage: {
    searchSources: string[];
    searchResults: number;
    uniqueTenders: number;
    tenderPagesRead: number;
    tenderPagesFailed: number;
    attachmentPagesRead: number;
    creditsUsed: number;
    sourceOutcomes?: SourceCoverage[];
    countriesSearched?: string[];
    totalDiscovered?: number;
  };
  pagination?: {
    hasMore: boolean;
    nextCursor: string | null;
    pageSize: number;
    totalFound: number;
    totalResearched: number;
  };
  checkedAt: string;
};

export type TenderPageResult = {
  tenders: TenderResult[];
  unresearchedTenders: ScanResult["unresearchedTenders"];
  pagination: NonNullable<ScanResult["pagination"]>;
  coverage: Pick<ScanResult["coverage"], "sourceOutcomes" | "countriesSearched" | "totalDiscovered" | "tenderPagesRead" | "tenderPagesFailed" | "creditsUsed">;
};

export type ScanSnapshot = Pick<ScanResult, "companyUrl" | "tenders" | "checkedAt">;

export type TenderChange = {
  tenderId: string;
  tenderTitle: string;
  kind: "new" | "changed" | "removed";
  details: string[];
};
