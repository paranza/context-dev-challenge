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
      <div><span className="eyebrow">EVIDENCE TRAIL</span><h4>See why this tender was matched</h4></div>
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
    {selected && <EvidenceTrail item={selected} />}
  </div>;
}

function TenderCard({ tender }: { tender: TenderResult }) {
  const deadline = formatDeadline(tender.deadline);
  const supported = tender.requirements.filter((item) => item.status === "supported").length;
  const needsReview = tender.requirements.filter((item) => item.status === "unclear" || item.status === "not_found").length;
  const possibleGaps = tender.requirements.filter((item) => item.status === "potential_gap").length;

  return <article className="tender-card">
    <div className="tender-card-top">
      <div className="tender-title-group">
        <div className="tender-meta"><span>{tender.procurementType || "Public procurement"}</span><span className="meta-separator">·</span><span>{tender.location || "Location not stated"}</span></div>
        <h3>{tender.title}</h3>
        <p className="buyer-line">Published by <strong>{tender.authority || "Buyer not identified"}</strong></p>
      </div>
      <Status value={tender.status} />
    </div>
    <p className="tender-summary">{tender.summary}</p>
    <div className="tender-facts">
      <div><span className="fact-label">Submission deadline</span><strong>{deadline.display}</strong><span className={deadline.remaining === "Deadline passed" ? "fact-alert" : "fact-note"}>{deadline.remaining || "Confirm on original notice"}</span></div>
      <div><span className="fact-label">Estimated value</span><strong>{tender.estimatedValue || "Not stated"}</strong><span className="fact-note">As listed by the buyer</span></div>
      <div><span className="fact-label">Documents reviewed</span><strong>{tender.documentsRead}</strong><span className="fact-note">{tender.documentsFailed ? `${tender.documentsFailed} could not be read` : "Linked pages read"}</span></div>
    </div>
    {tender.requirements.length > 0 && <div className="fit-signal-row" aria-label="Requirement evidence summary">
      <span><i className="signal signal-supported" aria-hidden="true" />{supported} evidence found</span>
      <span><i className="signal signal-review" aria-hidden="true" />{needsReview} need review</span>
      <span><i className="signal signal-gap" aria-hidden="true" />{possibleGaps} possible gaps</span>
    </div>}
    <details className="tender-details">
      <summary><span>Review evidence and documents</span><span className="details-count">{tender.requirements.length} requirements <b aria-hidden="true">＋</b></span></summary>
      <EvidenceMap requirements={tender.requirements} />
      <div className="document-sources">
        <div><span className="eyebrow">SOURCE MATERIAL</span><h4>Tender notice and documents</h4></div>
        <div className="document-links">{tender.sources.map((item) => <SourceLink key={item.url} item={item} />)}</div>
        <a className="original-link" href={tender.url} target="_blank" rel="noreferrer">Open original tender notice <span aria-hidden="true">↗</span></a>
      </div>
    </details>
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

  return <section className="company-panel" aria-labelledby="company-profile-title">
    <div className="company-panel-heading">
      <div><span className="eyebrow">SUPPLIER PROFILE</span><h2 id="company-profile-title">{company.name}</h2><p>{company.summary}</p></div>
      <a className="quiet-link" href={scan.companyUrl} target="_blank" rel="noreferrer">Visit company website <span aria-hidden="true">↗</span></a>
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
  </section>;
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
        <span className="eyebrow">A clearer way into public tenders</span>
        <h1>Find the tenders<br /><em>your team can deliver.</em></h1>
        <p>We research your company and current tender documents, then show which requirements have supporting evidence and which need your review.</p>
        <div className="hero-proof"><span className="proof-mark">✓</span><span>Every finding links back to its source.</span></div>
      </div>
      <div className="search-panel">
        <div className="search-panel-heading"><span className="step-label">START WITH A COMPANY WEBSITE</span><span className="private-note">Public sources only</span></div>
        <form onSubmit={search}>
          <label htmlFor="company-url">Supplier website</label>
          <div className="entry"><input id="company-url" type="url" required placeholder="https://yourcompany.fi" value={url} onChange={(event) => setUrl(event.target.value)} disabled={busy} aria-describedby="scan-scope" />
            <button className="primary-button" type="submit" disabled={busy || !url.trim()}>{busy ? "Researching…" : scan ? "Refresh scan" : "Find tenders"}<span aria-hidden="true">↗</span></button>
          </div>
        </form>
        <div className="example-row"><span>Want to see it in action?</span><button type="button" className="example-button" disabled={busy} onClick={() => startScan(EXAMPLE_COMPANY_URL)}><span className="example-mark">E</span><span><strong>Try Ehmera Oy</strong><small>Finnish construction supplier</small></span><span className="example-arrow" aria-hidden="true">↗</span></button></div>
        <p className="scan-scope" id="scan-scope">A deep scan can take a few minutes. It may read up to 500 supplier pages and linked tender documents. Unstated facts stay uncertain.</p>
      </div>
    </section>

    {busy && <section className="scan-progress" role="status" aria-live="polite">
      <div className="progress-symbol" aria-hidden="true"><span /></div>
      <div><strong>Live research is running</strong><p>Reading the company website and searching current notices and tender documents. This can take a few minutes.</p></div>
      <div className="indeterminate-track" aria-hidden="true"><span /></div>
    </section>}
    {error && <div className="notice" role="alert"><div><strong>The scan could not be completed</strong><p>{error}</p></div><button type="button" onClick={() => startScan(url)} disabled={busy}>Try again</button></div>}

    {scan ? <>
      <section className="scan-overview" aria-labelledby="scan-overview-title">
        <div className="overview-heading"><div><span className="eyebrow">LIVE RESEARCH</span><h2 id="scan-overview-title">Research summary</h2><p>Checked {new Date(scan.checkedAt).toLocaleString()}</p></div><button type="button" className="text-button" onClick={() => startScan(scan.companyUrl)} disabled={busy}>Run scan again <span aria-hidden="true">↻</span></button></div>
        <div className="summary-metrics">
          <div className="summary-metric metric-primary"><span>Opportunities reviewed</span><strong>{scan.tenders.length}</strong><small>From {scan.coverage.uniqueTenders} unique notices found</small></div>
          <div className="summary-metric"><span>Likely fit</span><strong>{filterCounts.likely_fit}</strong><small>Evidence supports further review</small></div>
          <div className="summary-metric"><span>Needs review</span><strong>{filterCounts.needs_review}</strong><small>Important evidence is uncertain</small></div>
          <div className="summary-metric"><span>Possible mismatch</span><strong>{filterCounts.potential_mismatch}</strong><small>Check before investing time</small></div>
        </div>
        <ScanCoverage scan={scan} />
      </section>

      <CompanySummary scan={scan} />

      <section className="results-section" aria-labelledby="results-title">
        <div className="results-heading"><div><span className="eyebrow">CURRENT OPPORTUNITIES</span><h2 id="results-title">Tender matches</h2><p>Review each result against the original notice before deciding.</p></div><span className="results-total">{scan.tenders.length} researched</span></div>
        {comparisonAvailable && <ChangesPanel changes={scan.changes} />}
        <div className="filter-bar" role="group" aria-label="Filter tenders by match status">
          {(["all", "likely_fit", "needs_review", "potential_mismatch"] as TenderFilter[]).map((value) => {
            const labels: Record<TenderFilter, string> = { all: "All", likely_fit: "Likely fit", needs_review: "Needs review", potential_mismatch: "Possible mismatch" };
            return <button key={value} type="button" className={`filter-button ${filter === value ? "is-active" : ""}`} onClick={() => setFilter(value)} aria-pressed={filter === value}>{labels[value]} <span>{filterCounts[value]}</span></button>;
          })}
        </div>
        {filteredTenders.length ? <div className="tender-list">{filteredTenders.map((tender) => <TenderCard key={tender.id} tender={tender} />)}</div> : <div className="empty-state"><span className="empty-mark">⌕</span><h3>{scan.tenders.length ? "No tenders in this filter" : "No matching notices found"}</h3><p>{scan.tenders.length ? "Choose another status to see the researched opportunities." : "The scan did not find a suitable current notice. Check the supplier website or try again later."}</p></div>}
      </section>
      <p className="disclaimer">Tender Fit Radar is a research aid, not a legal eligibility decision. Confirm requirements, deadlines, and changes in the original procurement system.</p>
    </> : <section className="how-it-works" aria-label="How Tender Fit Radar works">
      <div className="how-heading"><span className="eyebrow">FROM COMPANY PROFILE TO TENDER EVIDENCE</span><h2>Make the opportunity easier to judge.</h2></div>
      <div className="flow-steps">
        <article><span className="flow-number">01</span><h3>Research the supplier</h3><p>Read public services, capabilities, and relevant company information.</p></article>
        <article><span className="flow-number">02</span><h3>Find current notices</h3><p>Search public procurement notices and read their linked documents.</p></article>
        <article><span className="flow-number">03</span><h3>Connect the evidence</h3><p>See what appears supported, what is missing, and what needs a human check.</p></article>
      </div>
    </section>}

    <footer className="footer"><span>Powered by live public web data</span><span>Verify every requirement with the contracting authority.</span></footer>
  </main>;
}
