export type RequirementStatus = "supported" | "potential_gap" | "unclear" | "not_found";
export type TenderStatus = "likely_fit" | "needs_review" | "potential_mismatch";

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
  coverage: {
    searchSources: string[];
    searchResults: number;
    uniqueTenders: number;
    tenderPagesRead: number;
    tenderPagesFailed: number;
    attachmentPagesRead: number;
    creditsUsed: number;
  };
  checkedAt: string;
};

export type ScanSnapshot = Pick<ScanResult, "companyUrl" | "tenders" | "checkedAt">;

export type TenderChange = {
  tenderId: string;
  tenderTitle: string;
  kind: "new" | "changed" | "removed";
  details: string[];
};
