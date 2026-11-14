"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import type { EvidenceSource, RequirementStatus, ScanResult, TenderChange, TenderRequirement, TenderResult } from "@/lib/types";

type ScanResponse = ScanResult & { changes: TenderChange[] };
type TenderFilter = "all" | "likely_fit" | "needs_review" | "potential_mismatch";

const STORAGE_KEY = "tender-fit-radar:last-scan";
const EXAMPLE_COMPANY_URL = "https://ehmera.fi/en/";

const statusLabel: Record<RequirementStatus, string> = {
  supported: "Evidence found",
  potential_gap: "Possible gap",
  unclear: "Needs review",
  not_found: "No evidence found",
};

const tenderStatusLabel: Record<TenderResult["status"], string> = {
  likely_fit: "Likely fit",
  needs_review: "Needs review",
  potential_mismatch: "Possible mismatch",
};

function Status({ value }: { value: TenderResult["status"] | RequirementStatus }) {
  const label = value in statusLabel
    ? statusLabel[value as RequirementStatus]
    : tenderStatusLabel[value as TenderResult["status"]];
  return <span className={`status status-${value}`}>{label}</span>;
}

function SourceLink({ item }: { item: EvidenceSource }) {
  return <a className="source-link" href={item.url} target="_blank" rel="noreferrer">
    <span>{item.label}</span><span aria-hidden="true"> ↗</span>
  </a>;
}

function formatDeadline(value: string) {
  const parsed = new Date(value);
  if (!value || Number.isNaN(parsed.getTime())) return { display: value || "Not stated", remaining: "" };
  const display = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(parsed);
  const days = Math.ceil((parsed.getTime() - Date.now()) / 86_400_000);
  if (days < 0) return { display, remaining: "Deadline passed" };
  if (days === 0) return { display, remaining: "Due today" };
  return { display, remaining: `${days} days left` };
}

function EvidenceTrail({ item }: { item: TenderRequirement }) {
  return <div className="evidence-trail">
    <div className="evidence-step">
      <span className="evidence-step-label">Tender requirement</span>
      <strong>{item.criterion}</strong>
      <p>{item.tenderEvidence || "The tender source needs a closer review."}</p>
      {item.tenderSource ? <SourceLink item={item.tenderSource} /> : <span className="source-missing">No verified tender source link</span>}
    </div>
    <div className="evidence-connector" aria-hidden="true"><span>compared with</span></div>
    <div className="evidence-step evidence-step-supplier">
      <span className="evidence-step-label">Supplier evidence</span>
      <strong>{statusLabel[item.status]}</strong>
      <p>{item.supplierEvidence || (item.status === "not_found" ? "No supporting statement was found in the researched supplier sources." : "No verified supplier evidence yet.")}</p>
      {item.supplierSource ? <SourceLink item={item.supplierSource} /> : <span className="source-missing">No verified supplier source link</span>}
    </div>
  </div>;
}

function EvidenceMap({ requirements }: { requirements: TenderRequirement[] }) {
  const [selectedId, setSelectedId] = useState(requirements[0]?.id ?? "");
  const selected = requirements.find((item) => item.id === selectedId) ?? requirements[0];

  if (!requirements.length) return <p className="muted">No structured checklist was returned. Review the original notice and documents directly.</p>;

  return <div className="evidence-map">
    <div className="evidence-map-heading">
      <div><span className="eyebrow">EVIDENCE TRAIL</span><h4>Requirement evidence</h4></div>
      <span className="map-count">{requirements.length} requirements</span>
    </div>
    <div className="requirement-map" role="group" aria-label="Tender requirements">
      {requirements.map((item, index) => (
        <button
          className={`requirement-node ${selected?.id === item.id ? "is-selected" : ""}`}
          type="button"
          key={`${item.id}-${index}`}
          onClick={() => setSelectedId(item.id)}
          aria-pressed={selected?.id === item.id}
        >
          <span className={`node-mark node-${item.status}`} aria-hidden="true">{item.status === "supported" ? "✓" : item.status === "potential_gap" ? "!" : "?"}</span>
          <span className="node-copy"><strong>{item.criterion}</strong><small>{item.category}{item.mandatory ? " · Mandatory" : " · Informational"}</small></span>
          <Status value={item.status} />
        </button>
      ))}
    </div>
    {selected && <EvidenceTrail key={selected.id} item={selected} />}
  </div>;
}

function OpportunityOption({ tender, active, onSelect }: { tender: TenderResult; active: boolean; onSelect: () => void }) {
  const deadline = formatDeadline(tender.deadline);
  return <button type="button" role="listitem" className={`opportunity-option ${active ? "is-active" : ""}`} onClick={onSelect} aria-pressed={active}>
    <span className="option-top"><span>{tender.authority || "Buyer not identified"}</span><Status value={tender.status} /></span>
    <strong>{tender.title}</strong>
    <span className="option-bottom"><span>{deadline.display}</span><span>{tender.location || "Finland"}</span></span>
  </button>;
}

function TenderDetail({ tender }: { tender: TenderResult }) {
  const deadline = formatDeadline(tender.deadline);
  const supported = tender.requirements.filter((item) => item.status === "supported").length;
  const needsReview = tender.requirements.filter((item) => item.status === "unclear" || item.status === "not_found").length;
  const possibleGaps = tender.requirements.filter((item) => item.status === "potential_gap").length;

  return <article className="active-tender" key={tender.id}>
    <header className="active-tender-heading">
      <div><div className="tender-meta"><span>{tender.procurementType || "Public procurement"}</span><span className="meta-separator">/</span><span>{tender.location || "Finland"}</span></div><h3>{tender.title}</h3><p className="buyer-line">{tender.authority || "Buyer not identified"}</p></div>
      <Status value={tender.status} />
    </header>
    <p className="active-tender-summary">{tender.summary}</p>
    <div className="detail-facts">
      <div><span>Deadline</span><strong>{deadline.display}</strong><small className={deadline.remaining === "Deadline passed" ? "fact-alert" : ""}>{deadline.remaining || "Confirm with buyer"}</small></div>
      <div><span>Estimated value</span><strong>{tender.estimatedValue || "Not stated"}</strong><small>Buyer published</small></div>
      <div><span>Documents read</span><strong>{tender.documentsRead}</strong><small>{tender.documentsFailed ? `${tender.documentsFailed} skipped` : "Tender pages and files"}</small></div>
    </div>
    {tender.requirements.length > 0 && <div className="fit-signal-row" aria-label="Requirement evidence summary">
      <span><i className="signal signal-supported" aria-hidden="true" />{supported} supported</span>
      <span><i className="signal signal-review" aria-hidden="true" />{needsReview} review</span>
      <span><i className="signal signal-gap" aria-hidden="true" />{possibleGaps} possible gap</span>
    </div>}
    <EvidenceMap requirements={tender.requirements} />
    <details className="source-drawer">
      <summary>Source documents <span>{tender.sources.length}</span></summary>
      <div className="document-links">{tender.sources.map((item) => <SourceLink key={item.url} item={item} />)}</div>
    </details>
    <a className="original-link" href={tender.url} target="_blank" rel="noreferrer">Open original tender <span aria-hidden="true">-&gt;</span></a>
  </article>;
}

function CompanySummary({ scan }: { scan: ScanResult }) {
  const { company } = scan;
  const groups: [string, string[]][] = [
    ["Capabilities", company.capabilities],
    ["Certifications", company.certifications],
    ["Service areas", company.serviceRegions],
    ["Project references", company.projectReferences],
    ["Equipment and resources", company.equipmentAndResources],
    ["Quality and safety", company.qualityAndSafety],
    ["Sustainability", company.sustainability],
  ];

  return <details className="company-panel">
    <summary className="company-panel-summary"><span className="eyebrow">SUPPLIER</span><strong>{company.name}</strong><span>{company.sourceCount} pages read</span></summary>
    <div className="company-panel-content">
    <div className="company-panel-heading">
      <div><span className="eyebrow">COMPANY PROFILE</span><h2 id="company-profile-title">{company.name}</h2></div>
      <a className="quiet-link" href={scan.companyUrl} target="_blank" rel="noreferrer">Open website <span aria-hidden="true">-&gt;</span></a>
    </div>
    <div className="company-metrics">
      <div><strong>{company.sourceCount}</strong><span>supplier pages read</span></div>
      <div><strong>{company.sitemapUrls}</strong><span>URLs found in sitemap</span></div>
      <div><strong>{company.failedCount}</strong><span>pages failed or skipped</span></div>
    </div>
    {groups.some(([, values]) => values.length > 0) && <div className="profile-groups">
      {groups.filter(([, values]) => values.length > 0).map(([label, values]) => <div className="profile-group" key={label}>
        <h3>{label}</h3><ul>{values.map((value, index) => <li key={`${label}-${index}`}>{value}</li>)}</ul>
      </div>)}
    </div>}
    {company.news.length > 0 && <details className="supporting-details">
      <summary>Recent public company news <span>{company.news.length}</span></summary>
      <div className="supporting-link-list">{company.news.slice(0, 8).map((item) => <div key={item.url}><SourceLink item={item} />{item.detail && <p>{item.detail}</p>}</div>)}</div>
    </details>}
    <details className="supporting-details">
      <summary>Supplier source pages <span>{company.sources.length}</span></summary>
      <div className="supporting-link-list">{company.sources.map((item) => <SourceLink key={item.url} item={item} />)}</div>
    </details>
    </div>
  </details>;
}

function ScanCoverage({ scan }: { scan: ScanResult }) {
  return <details className="coverage-details">
    <summary>Scan coverage and sources <span>Details</span></summary>
    <div className="coverage-content">
      <div className="coverage-stat-grid">
        <div><strong>{scan.coverage.searchResults}</strong><span>search results</span></div>
        <div><strong>{scan.coverage.uniqueTenders}</strong><span>unique notices found</span></div>
        <div><strong>{scan.coverage.tenderPagesRead}</strong><span>tender pages read</span></div>
        <div><strong>{scan.coverage.attachmentPagesRead}</strong><span>additional pages read</span></div>
        <div><strong>{scan.coverage.tenderPagesFailed}</strong><span>pages failed or skipped</span></div>
        <div><strong>{scan.coverage.creditsUsed}</strong><span>Context.dev credits used</span></div>
      </div>
      <p>Search sources: {scan.coverage.searchSources.length ? scan.coverage.searchSources.join(", ") : "Hilma and TED"}. Checked {new Date(scan.checkedAt).toLocaleString()}.</p>
    </div>
  </details>;
}

function ChangesPanel({ changes }: { changes: TenderChange[] }) {
  if (!changes.length) return <div className="no-changes"><span aria-hidden="true">✓</span><p>No tender or fit changes were found since your last scan.</p></div>;
  return <section className="change-panel" aria-labelledby="changes-title">
    <div className="section-heading-compact"><div><span className="eyebrow">WHAT CHANGED</span><h3 id="changes-title">Since your last scan</h3></div><span>{changes.length} updates</span></div>
    <div className="change-list">{changes.map((change, index) => <article key={`${change.tenderId}-${index}`}>
      <span className={`change-kind change-${change.kind}`}>{change.kind === "new" ? "New tender" : change.kind === "removed" ? "No longer found" : "Updated"}</span>
      <strong>{change.tenderTitle}</strong>
      {change.details.map((detail) => <p key={detail}>{detail}</p>)}
    </article>)}</div>
  </section>;
}

export default function Home() {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [scan, setScan] = useState<ScanResponse | null>(null);
  const [previous, setPrevious] = useState<ScanResult | null>(null);
  const [comparisonAvailable, setComparisonAvailable] = useState(false);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<TenderFilter>("all");
  const [selectedTenderId, setSelectedTenderId] = useState("");

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) return;
      const value = JSON.parse(stored) as ScanResult;
      setPrevious(value);
      setUrl(value.companyUrl);
    } catch {
      setPrevious(null);
    }
  }, []);

  const filteredTenders = useMemo(() => scan?.tenders.filter((tender) => filter === "all" || tender.status === filter) ?? [], [scan, filter]);
  const selectedTender = filteredTenders.find((tender) => tender.id === selectedTenderId) ?? filteredTenders[0];
  const filterCounts = useMemo(() => ({
    all: scan?.tenders.length ?? 0,
    likely_fit: scan?.tenders.filter((tender) => tender.status === "likely_fit").length ?? 0,
    needs_review: scan?.tenders.filter((tender) => tender.status === "needs_review").length ?? 0,
    potential_mismatch: scan?.tenders.filter((tender) => tender.status === "potential_mismatch").length ?? 0,
  }), [scan]);

  async function startScan(companyUrl: string) {
    setUrl(companyUrl);
    setBusy(true);
    setError("");
    const last = previous && previous.companyUrl.replace(/\/$/, "") === companyUrl.replace(/\/$/, "") ? previous : null;
    try {
      const response = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyUrl, previous: last }),
      });
      const result = await response.json() as ScanResponse | { error?: string };
      if (!response.ok) throw new Error("error" in result ? result.error || "Research failed." : "Research failed.");
      const complete = result as ScanResponse;
      setScan(complete);
      setComparisonAvailable(Boolean(last));
      setPrevious(complete);
      setFilter("all");
      setSelectedTenderId(complete.tenders[0]?.id ?? "");
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(complete));
      } catch {
        // The current scan remains available when browser storage is unavailable or full.
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not finish the live scan. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await startScan(url);
  }

  return <main className="app-shell">
    <header className="topbar">
      <a className="brand" href="#top" aria-label="Tender Fit Radar home"><span className="brand-mark">TF</span><span>Tender Fit <b>Radar</b></span></a>
      <div className="topbar-meta"><span className="live-indicator" aria-hidden="true" />Finnish public procurement</div>
    </header>

    <section className="hero" id="top">
      <div className="hero-copy">
        <span className="eyebrow">FINNISH TENDER RADAR</span>
        <h1>Find your<br /><em>next contract.</em></h1>
        <div className="signal-graphic" aria-label="Supplier profile matched to tender requirements">
          <div className="signal-node"><span className="signal-node-icon">01</span><strong>Supplier</strong></div>
          <span className="signal-rail" aria-hidden="true"><i /></span>
          <div className="signal-node"><span className="signal-node-icon signal-node-active">02</span><strong>Tender</strong></div>
          <span className="signal-rail" aria-hidden="true"><i /></span>
          <div className="signal-node"><span className="signal-node-icon signal-node-result">03</span><strong>Evidence</strong></div>
        </div>
      </div>
      <div className="search-panel">
        <div className="search-panel-heading"><span className="step-label">SEARCH A SUPPLIER</span><span className="private-note">Live web data</span></div>
        <form onSubmit={search}>
          <label htmlFor="company-url">Supplier website</label>
          <div className="entry"><input id="company-url" type="url" required placeholder="https://yourcompany.fi" value={url} onChange={(event) => setUrl(event.target.value)} disabled={busy} aria-describedby="scan-scope" />
            <button className="primary-button" type="submit" disabled={busy || !url.trim()}>{busy ? "Researching…" : scan ? "Refresh scan" : "Find tenders"}<span aria-hidden="true">↗</span></button>
          </div>
        </form>
        <div className="example-row"><button type="button" className="example-button" disabled={busy} onClick={() => startScan(EXAMPLE_COMPANY_URL)}><span className="example-mark">E</span><span><strong>Try Ehmera Oy</strong><small>Construction supplier</small></span><span className="example-arrow" aria-hidden="true">-&gt;</span></button></div>
        <p className="scan-scope" id="scan-scope">Up to 500 supplier pages. Live scan may take a few minutes.</p>
      </div>
    </section>

    {busy && <section className="scan-progress" role="status" aria-live="polite">
      <div className="progress-symbol" aria-hidden="true"><span /></div>
        <div><strong>Live research is running</strong><p>Searching supplier pages, notices, and tender documents.</p></div>
      <div className="indeterminate-track" aria-hidden="true"><span /></div>
    </section>}
    {error && <div className="notice" role="alert"><div><strong>The scan could not be completed</strong><p>{error}</p></div><button type="button" onClick={() => startScan(url)} disabled={busy}>Try again</button></div>}

    {scan ? <>
      <section className="scan-overview" aria-labelledby="scan-overview-title">
        <div className="overview-heading"><div><span className="eyebrow">{new Date(scan.checkedAt).toLocaleString()}</span><h2 id="scan-overview-title">Scan results</h2></div><button type="button" className="text-button" onClick={() => startScan(scan.companyUrl)} disabled={busy}>Refresh</button></div>
        <div className="summary-metrics">
          <div className="summary-metric metric-primary"><span>Researched</span><strong>{scan.tenders.length}</strong></div>
          <div className="summary-metric"><span>Likely fit</span><strong>{filterCounts.likely_fit}</strong></div>
          <div className="summary-metric"><span>Review</span><strong>{filterCounts.needs_review}</strong></div>
          <div className="summary-metric"><span>Mismatch</span><strong>{filterCounts.potential_mismatch}</strong></div>
        </div>
        <ScanCoverage scan={scan} />
      </section>

      <CompanySummary scan={scan} />

      <section className="results-section" aria-labelledby="results-title">
        <div className="results-heading"><h2 id="results-title">Tender matches</h2><span className="results-total">{scan.tenders.length}</span></div>
        {comparisonAvailable && <ChangesPanel changes={scan.changes} />}
        <div className="filter-bar" role="group" aria-label="Filter tenders by match status">
          {(["all", "likely_fit", "needs_review", "potential_mismatch"] as TenderFilter[]).map((value) => {
            const labels: Record<TenderFilter, string> = { all: "All", likely_fit: "Likely fit", needs_review: "Needs review", potential_mismatch: "Possible mismatch" };
            return <button key={value} type="button" className={`filter-button ${filter === value ? "is-active" : ""}`} onClick={() => setFilter(value)} aria-pressed={filter === value}>{labels[value]} <span>{filterCounts[value]}</span></button>;
          })}
        </div>
        {filteredTenders.length ? <div className="opportunity-explorer">
          <div className="opportunity-list" role="list" aria-label="Tender opportunities">
            {filteredTenders.map((tender) => <OpportunityOption key={tender.id} tender={tender} active={selectedTender?.id === tender.id} onSelect={() => setSelectedTenderId(tender.id)} />)}
          </div>
          {selectedTender && <TenderDetail key={`${filter}-${selectedTender.id}`} tender={selectedTender} />}
        </div> : <div className="empty-state"><span className="empty-mark">!</span><h3>{scan.tenders.length ? "No matches" : "No current tenders found"}</h3></div>}
      </section>
      <p className="disclaimer">Tender Fit Radar is a research aid, not a legal eligibility decision. Confirm requirements, deadlines, and changes in the original procurement system.</p>
    </> : <div className="landing-spacer" aria-hidden="true" />}

    <footer className="footer"><span>Powered by live public web data</span><span>Verify every requirement with the contracting authority.</span></footer>
  </main>;
}
