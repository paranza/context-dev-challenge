"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import type { EvidenceSource, RequirementStatus, ScanProgressEvent, ScanResult, SourceCoverage, TenderChange, TenderMonitorView, TenderRequirement, TenderResult, TenderPageResult } from "@/lib/types";

type ScanResponse = ScanResult & { changes: TenderChange[] };
type TenderFilter = "all" | "likely_fit" | "needs_review" | "potential_mismatch";

const STORAGE_KEY = "tender-fit-radar:last-scan";
const MONITORS_STORAGE_KEY = "tender-fit-radar:monitors";
const EXAMPLE_COMPANY_URL = "https://ehmera.fi/en/";

async function readEventStream<T>(response: Response, onProgress: (event: ScanProgressEvent) => void): Promise<T> {
  if (!response.ok) {
    const text = await response.text();
    let message = `Research request failed (HTTP ${response.status}).`;
    try { message = JSON.parse(text).error || message; } catch { /* Keep the safe status message. */ }
    throw new Error(message);
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error("The live research stream is not available in this browser.");
  const decoder = new TextDecoder();
  let buffer = "";
  let completed: T | null = null;
  const consume = (frame: string) => {
    const lines = frame.split(/\r?\n/);
    const eventName = lines.find((line) => line.startsWith("event:"))?.slice(6).trim() || "message";
    const data = lines.filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trim()).join("\n");
    if (!data) return;
    let payload: unknown;
    try { payload = JSON.parse(data); } catch { return; }
    if (eventName === "complete") { completed = payload as T; return; }
    if (eventName === "error") throw new Error(typeof (payload as { error?: unknown })?.error === "string" ? (payload as { error: string }).error : "The live research scan failed.");
    onProgress(payload as ScanProgressEvent);
  };
  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const frames = buffer.split(/\r?\n\r?\n/);
      buffer = frames.pop() || "";
      for (const frame of frames) consume(frame);
      if (done) break;
    }
    if (buffer.trim()) consume(buffer);
    if (completed === null) throw new Error("The research stream ended before the scan result arrived.");
    return completed;
  } catch (error) {
    await reader.cancel(error).catch(() => undefined);
    throw error;
  } finally {
    reader.releaseLock();
  }
}

function localDateAfter(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

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

function FieldEvidence({ label, field }: { label: string; field: NonNullable<TenderResult["researchFields"]>["authority"] }) {
  const statusText = field.status === "found" ? "Verified in reviewed source"
    : field.status === "not_stated" ? "Not stated in the reviewed notice"
    : field.status === "conflict" ? "Sources disagree"
    : field.status === "not_searched" ? "Not fully searched"
    : "Could not verify from the pages read";
  return <div className="field-evidence">
    <span>{label}</span>
    <strong>{field.value || statusText}</strong>
    {field.source ? <SourceLink item={field.source} /> : <small>{field.details?.[0] || (field.status === "not_stated" ? "No source link is shown because the notice does not state a value." : "No verified source link for this value.")}</small>}
  </div>;
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
    <span className="option-bottom"><span>{deadline.display}</span><span>{tender.location || "Location not verified"}</span></span>
  </button>;
}

function TenderMonitorPanel({ tender, monitor, onChange }: { tender: TenderResult; monitor?: TenderMonitorView; onChange: (value: TenderMonitorView) => void }) {
  const [setupOpen, setSetupOpen] = useState(false);
  const [endDate, setEndDate] = useState(() => localDateAfter(7));
  const [frequencyHours, setFrequencyHours] = useState<6 | 24>(6);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const isActive = Boolean(monitor && monitor.status !== "paused");

  async function startMonitoring(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const endsAt = new Date(`${endDate}T23:59:59`).toISOString();
      const response = await fetch("/api/monitors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenderId: tender.id, title: tender.title, url: tender.url, endsAt, frequencyHours }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "The monitor could not be created.");
      onChange(body as TenderMonitorView);
      setSetupOpen(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The monitor could not be created.");
    } finally {
      setBusy(false);
    }
  }

  async function pauseMonitoring() {
    if (!monitor) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/monitors/${encodeURIComponent(monitor.token)}`, { method: "PATCH" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "The monitor could not be paused.");
      onChange(body as TenderMonitorView);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The monitor could not be paused.");
    } finally {
      setBusy(false);
    }
  }

  return <section className="monitor-panel" aria-label="Tender change monitoring">
    <div className="monitor-heading">
      <div><span className="eyebrow">CHANGE MONITOR</span><strong>{isActive ? "Watching this notice" : "Watch this notice"}</strong></div>
      {monitor && <span className={`monitor-state monitor-${monitor.status}`}>{monitor.status === "active" ? "Active" : monitor.status === "paused" ? "Paused" : "Needs attention"}</span>}
    </div>
    {isActive && monitor ? <>
      <p>Checks {monitor.frequencyHours === 24 ? "daily" : "every 6 hours"} until {new Date(monitor.endsAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}. Next check: {monitor.nextRunAt ? new Date(monitor.nextRunAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }) : "pending"}.</p>
      {monitor.webhookConnected ? <small>Automatic end-date pause is connected. It runs after the first scheduled check on or after your end date.</small> : <small>Scheduled checks run in Context.dev. Without a public webhook, this demo pauses the monitor the next time the dashboard checks after your end date.</small>}
      <small>Scheduled runs use Context.dev credits.</small>
      {monitor.lastError && <p className="monitor-error">Latest monitor issue: {monitor.lastError}</p>}
      <div className="monitor-change-list">
        {monitor.changes.length ? monitor.changes.slice(0, 5).map((change) => <article key={change.id}>
          <span>{new Date(change.detectedAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</span>
          <strong>{change.title}</strong><p>{change.summary || "A tender page change was detected."}</p>
          <a href={change.url} target="_blank" rel="noreferrer">Review changed source <span aria-hidden="true">-&gt;</span></a>
        </article>) : <span className="muted">No changes detected yet.</span>}
      </div>
      <button type="button" className="text-button" onClick={pauseMonitoring} disabled={busy}>{busy ? "Pausing…" : "Stop monitoring"}</button>
    </> : <>
      <p>Get scheduled checks for changes to the deadline, scope, eligibility rules, documents, or cancellation. Scheduled checks use Context.dev credits.</p>
      {setupOpen ? <form className="monitor-form" onSubmit={startMonitoring}>
        <label htmlFor={`monitor-end-${tender.id}`}>Monitor until</label>
        <input id={`monitor-end-${tender.id}`} type="date" min={localDateAfter(1)} max={localDateAfter(180)} value={endDate} onChange={(event) => setEndDate(event.target.value)} required />
        <label htmlFor={`monitor-frequency-${tender.id}`}>Check frequency</label>
        <select id={`monitor-frequency-${tender.id}`} value={frequencyHours} onChange={(event) => setFrequencyHours(Number(event.target.value) as 6 | 24)}>
          <option value={6}>Every 6 hours</option><option value={24}>Daily</option>
        </select>
        <div className="monitor-form-actions"><button type="submit" className="primary-button" disabled={busy}>{busy ? "Starting…" : "Start monitoring"}</button><button type="button" className="quiet-link" onClick={() => setSetupOpen(false)} disabled={busy}>Cancel</button></div>
      </form> : <button type="button" className="text-button" onClick={() => setSetupOpen(true)}>{monitor?.status === "paused" ? "Set up again" : "Choose end date and frequency"}</button>}
    </>}
    {error && <p className="monitor-error" role="alert">{error}</p>}
  </section>;
}

function TenderDetail({ tender, monitor, onMonitorChange }: { tender: TenderResult; monitor?: TenderMonitorView; onMonitorChange: (value: TenderMonitorView) => void }) {
  const deadline = formatDeadline(tender.deadline);
  const supported = tender.requirements.filter((item) => item.status === "supported").length;
  const needsReview = tender.requirements.filter((item) => item.status === "unclear" || item.status === "not_found").length;
  const possibleGaps = tender.requirements.filter((item) => item.status === "potential_gap").length;

  return <article className="active-tender" key={tender.id}>
    <header className="active-tender-heading">
      <div><div className="tender-meta"><span>{tender.procurementType || "Public procurement"}</span><span className="meta-separator">/</span><span>{tender.location || "Location not verified"}</span></div><h3>{tender.title}</h3><p className="buyer-line">Buyer: {tender.authority || "Not identified in reviewed sources"}{tender.authoritySource && <> <SourceLink item={tender.authoritySource} /></>}</p></div>
      <Status value={tender.status} />
    </header>
    <p className="active-tender-summary">{tender.summary}</p>
    <div className="detail-facts">
      <div><span>Deadline</span><strong>{deadline.display}</strong><small className={deadline.remaining === "Deadline passed" ? "fact-alert" : ""}>{deadline.remaining || "Confirm with buyer"}</small></div>
      <div><span>Estimated value</span><strong>{tender.estimatedValue || "Not stated"}</strong><small>Buyer published</small></div>
      <div><span>Documents read</span><strong>{tender.documentsRead}</strong><small>{tender.documentsFailed ? `${tender.documentsFailed} skipped` : "Tender pages and files"}</small></div>
    </div>
    {tender.researchFields && <div className="field-evidence-grid">
      <FieldEvidence label="Buyer" field={tender.researchFields.authority} />
      <FieldEvidence label="Contract location" field={tender.researchFields.location} />
      <FieldEvidence label="Deadline" field={tender.researchFields.deadline} />
      <FieldEvidence label="Estimated value" field={tender.researchFields.estimatedValue} />
      <FieldEvidence label="Procedure type" field={tender.researchFields.procurementType} />
    </div>}
    {tender.requirements.length > 0 && <div className="fit-signal-row" aria-label="Requirement evidence summary">
      <span><i className="signal signal-supported" aria-hidden="true" />{supported} supported</span>
      <span><i className="signal signal-review" aria-hidden="true" />{needsReview} review</span>
      <span><i className="signal signal-gap" aria-hidden="true" />{possibleGaps} possible gap</span>
    </div>}
    <EvidenceMap requirements={tender.requirements} />
    <TenderMonitorPanel tender={tender} monitor={monitor} onChange={onMonitorChange} />
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
  const outcomes = scan.coverage.sourceOutcomes ?? [];
  const searched = outcomes.filter((item) => item.status === "searched");
  return <details className="coverage-details">
    <summary>Scan coverage and sources <span>Details</span></summary>
    <div className="coverage-content">
      <div className="coverage-stat-grid">
        <div><strong>{scan.coverage.searchResults}</strong><span>search results</span></div>
          <div><strong>{scan.coverage.uniqueTenders}</strong><span>unique notices discovered so far</span></div>
        <div><strong>{scan.coverage.tenderPagesRead}</strong><span>tender pages read</span></div>
        <div><strong>{scan.coverage.attachmentPagesRead}</strong><span>additional pages read</span></div>
        <div><strong>{scan.coverage.tenderPagesFailed}</strong><span>pages failed or skipped</span></div>
        <div><strong>{scan.coverage.creditsUsed}</strong><span>Context.dev credits used</span></div>
      </div>
      <p>Search sources that returned: {searched.length ? [...new Set(searched.map((item) => item.sourceName))].join(", ") : "None confirmed"}. Checked {new Date(scan.checkedAt).toLocaleString()}.</p>
      <div className="source-coverage-list" aria-label="Country procurement source outcomes">
        {outcomes.map((item, index) => <details className="source-coverage-item" key={`${item.countryCode}-${item.sourceName}-${index}`}>
          <summary><span className={`coverage-dot coverage-${item.status}`} aria-hidden="true" />{item.country} · {item.sourceName}<b>{item.status === "searched" ? `${item.results} found` : item.status === "failed" ? "Search failed" : "Not available"}</b></summary>
          <p>{item.detail || "No extra source details were returned."}</p>
          <a href={item.sourceUrl} target="_blank" rel="noreferrer">Open registered source <span aria-hidden="true">-&gt;</span></a>
          {item.resultUrls?.length ? <div className="source-result-list">{item.resultUrls.slice(0, 5).map((url) => <a key={url} href={url} target="_blank" rel="noreferrer">{url}</a>)}</div> : null}
        </details>)}
      </div>
    </div>
  </details>;
}

function ResearchProgress({ events }: { events: ScanProgressEvent[] }) {
  const latest = events.at(-1);
  if (!events.length) return null;
  return <section className="research-progress" role="status" aria-live="polite">
    <div className="progress-heading"><span className="progress-pulse" aria-hidden="true" /><div><strong>{latest?.message || "Live research is running"}</strong><p>{events.filter((event) => event.type === "tender").length} notices fully researched so far · {events.filter((event) => event.type === "source").length} source updates</p></div></div>
    <details className="research-steps" open>
      <summary>Live research steps <span>{events.length} updates</span></summary>
      <ol>{events.slice(-8).reverse().map((event, index) => <li key={`${event.type}-${event.stage}-${event.countryCode || ""}-${event.sourceUrl || ""}-${index}`}>
        <span className={`step-dot step-${event.type}`} aria-hidden="true" />
        <div><strong>{event.countryCode || event.stage}</strong><p>{event.message}{event.completed !== undefined && event.total ? ` (${event.completed}/${event.total})` : ""}</p>
          {event.sourceUrl && <a href={event.sourceUrl} target="_blank" rel="noreferrer">Open source <span aria-hidden="true">-&gt;</span></a>}
          {event.query && <details className="query-detail"><summary>What this search looked for</summary><p>{event.query}</p></details>}
          {event.tender && <a href={event.tender.url} target="_blank" rel="noreferrer">Open researched notice <span aria-hidden="true">-&gt;</span></a>}
        </div>
      </li>)}</ol>
    </details>
  </section>;
}

function EvaluationEvidence({ scan, activeMonitorCount }: { scan: ScanResult; activeMonitorCount: number }) {
  const outcomes = scan.coverage.sourceOutcomes ?? [];
  const liveSources = new Set(outcomes.filter((item) => item.status === "searched").map((item) => item.sourceUrl)).size;
  const attempted = scan.tenders.length + (scan.unresearchedTenders?.length ?? 0);
  const unresearched = scan.unresearchedTenders?.length ?? 0;
  const found = scan.pagination?.totalFound ?? scan.coverage.totalDiscovered ?? scan.coverage.uniqueTenders;
  const requirements = scan.tenders.flatMap((tender) => tender.requirements);
  const cited = requirements.filter((item) => item.tenderSource && (["supported", "potential_gap"].includes(item.status) ? item.supplierSource : true)).length;
  return <section className="evaluation-evidence" aria-labelledby="evaluation-evidence-title">
    <div className="section-heading-compact"><div><span className="eyebrow">DEMO EVIDENCE</span><h3 id="evaluation-evidence-title">Evidence for the five challenge criteria</h3></div><span>Evidence view, not a self-awarded grade</span></div>
    <div className="criterion-grid">
      <article><span>01 · Live web data</span><strong>{liveSources} procurement sources searched</strong><p>TED public data, national procurement portals, supplier pages, company news, and linked tender files are combined in one scan.</p></article>
      <article><span>02 · Real-timeness</span><strong>{activeMonitorCount} active scheduled monitors</strong><p>On-demand scans use fresh reads and compare against the previous browser scan. Monitoring checks the selected notice on a 6-hour or daily schedule. Unattended end-date pausing needs a public HTTPS webhook.</p></article>
      <article><span>03 · Real-world impact</span><strong>Business evidence plus {scan.company.sourceCount} supplier pages read</strong><p>The European Commission's business survey found that 32% rated unfamiliar legal rules or formalities as a high cross-border barrier, and 23% rated language that way. This scan read public supplier evidence from {scan.company.name}. Direct Tender Fit Radar interviews or product trials: 0 recorded.</p><div className="criterion-sources"><a href="https://www.eca.europa.eu/en/publications/SR-2023-28" target="_blank" rel="noreferrer">European Court of Auditors, report 28/2023</a><a href="https://eur-lex.europa.eu/legal-content/EN/TXT/PDF/?rid=1&uri=CELEX%3A52020SC0054" target="_blank" rel="noreferrer">European Commission, SWD(2020) 54, business barriers table</a></div></article>
      <article><span>04 · Completeness</span><strong>{scan.tenders.length} of {found} notices discovered so far fully researched</strong><p>{attempted} notices were attempted; {unresearched} are not fully researched and show their reason. {scan.pagination?.hasMore ? "More results are available through the next-page control." : "No continuation page is currently available."} National portal search is an indexed subset.</p></article>
      <article><span>05 · Technical execution</span><strong>{cited} source-linked requirement checks</strong><p>The app streams its research steps, paginates results, verifies citations against pages it read, and exposes API errors with their actual cause.</p></article>
    </div>
    <p className="market-evidence-note">The external reports support the existence of the problem. They are not customer quotes or validation of Tender Fit Radar. Record real supplier interviews or product trials before claiming product validation.</p>
  </section>;
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

function UnresearchedNotices({ items }: { items: ScanResult["unresearchedTenders"] }) {
  if (!items?.length) return null;
  return <details className="unresearched-panel">
    <summary>Not fully researched <span>{items.length}</span></summary>
    <div className="unresearched-list">{items.map((item) => <article key={item.id}>
      <a href={item.url} target="_blank" rel="noreferrer">{item.title} <span aria-hidden="true">-&gt;</span></a>
      <p>{item.reason}</p>
    </article>)}</div>
  </details>;
}

export default function Home() {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [loadingNext, setLoadingNext] = useState(false);
  const [progressEvents, setProgressEvents] = useState<ScanProgressEvent[]>([]);
  const [scan, setScan] = useState<ScanResponse | null>(null);
  const [previous, setPrevious] = useState<ScanResult | null>(null);
  const [monitors, setMonitors] = useState<TenderMonitorView[]>([]);
  const [comparisonAvailable, setComparisonAvailable] = useState(false);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<TenderFilter>("all");
  const [selectedTenderId, setSelectedTenderId] = useState("");

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const value = JSON.parse(stored) as ScanResult;
        setPrevious(value);
        setScan({ ...value, changes: [] });
        setSelectedTenderId(value.tenders?.[0]?.id ?? "");
        setUrl(value.companyUrl);
      }
    } catch {
      setPrevious(null);
    }
    try {
      const storedMonitors = localStorage.getItem(MONITORS_STORAGE_KEY);
      if (storedMonitors) setMonitors(JSON.parse(storedMonitors) as TenderMonitorView[]);
    } catch { setMonitors([]); }
  }, []);

  const filteredTenders = useMemo(() => scan?.tenders.filter((tender) => filter === "all" || tender.status === filter) ?? [], [scan, filter]);
  const selectedTender = filteredTenders.find((tender) => tender.id === selectedTenderId) ?? filteredTenders[0];
  const selectedMonitor = monitors.filter((monitor) => monitor.tenderId === selectedTender?.id).sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""))[0];
  const activeMonitorCount = monitors.filter((monitor) => monitor.status !== "paused").length;
  const activeMonitorTokens = monitors.filter((monitor) => monitor.status !== "paused").map((monitor) => monitor.token).join("|");
  const filterCounts = useMemo(() => ({
    all: scan?.tenders.length ?? 0,
    likely_fit: scan?.tenders.filter((tender) => tender.status === "likely_fit").length ?? 0,
    needs_review: scan?.tenders.filter((tender) => tender.status === "needs_review").length ?? 0,
    potential_mismatch: scan?.tenders.filter((tender) => tender.status === "potential_mismatch").length ?? 0,
  }), [scan]);

  function saveMonitor(monitor: TenderMonitorView) {
    setMonitors((current) => {
      const next = [...current.filter((item) => item.token !== monitor.token), monitor];
      try { localStorage.setItem(MONITORS_STORAGE_KEY, JSON.stringify(next)); } catch { /* The monitor remains in current memory. */ }
      return next;
    });
  }

  useEffect(() => {
    if (!activeMonitorTokens) return;
    let active = true;
    const tokens = activeMonitorTokens.split("|").filter(Boolean);
    const poll = async () => {
      if (!active || document.visibilityState !== "visible") return;
      const updates = await Promise.all(tokens.map(async (token) => {
        try {
          const response = await fetch(`/api/monitors/${encodeURIComponent(token)}`, { cache: "no-store" });
          const body = await response.json();
          if (!response.ok) throw new Error(body.error || "Monitor status could not be refreshed.");
          return body as TenderMonitorView;
        } catch (error) {
          return { token, error: error instanceof Error ? error.message : "Monitor status could not be refreshed." };
        }
      }));
      if (!active) return;
      setMonitors((current) => {
        const byToken = new Map(updates.map((value) => [value.token, value]));
        const next = current.map((item) => {
          const updated = byToken.get(item.token);
          if (!updated) return item;
          if ("error" in updated) return { ...item, lastError: updated.error };
          return updated;
        });
        try { localStorage.setItem(MONITORS_STORAGE_KEY, JSON.stringify(next)); } catch { /* Keep the current session state. */ }
        return next;
      });
    };
    void poll();
    const timer = window.setInterval(() => void poll(), 120_000);
    const onVisibility = () => { if (document.visibilityState === "visible") void poll(); };
    document.addEventListener("visibilitychange", onVisibility);
    return () => { active = false; window.clearInterval(timer); document.removeEventListener("visibilitychange", onVisibility); };
  }, [activeMonitorTokens]);

  async function startScan(companyUrl: string) {
    if (loadingNext) return;
    setUrl(companyUrl);
    setBusy(true);
    setError("");
    setProgressEvents([]);
    const last = previous && previous.companyUrl.replace(/\/$/, "") === companyUrl.replace(/\/$/, "") ? previous : null;
    try {
      const response = await fetch("/api/search/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
        body: JSON.stringify({ companyUrl, previous: last }),
      });
      const complete = await readEventStream<ScanResponse>(response, (event) => setProgressEvents((current) => [...current, event].slice(-120)));
      if (!Array.isArray(complete.tenders) || !complete.company) throw new Error("The research API response is missing scan data.");
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

  async function loadNextPage() {
    if (!scan?.pagination?.nextCursor || loadingNext || busy) return;
    setLoadingNext(true);
    setError("");
    setProgressEvents([]);
    try {
      const response = await fetch("/api/search/page/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
        body: JSON.stringify({ cursor: scan.pagination.nextCursor }),
      });
      const page = await readEventStream<TenderPageResult>(response, (event) => setProgressEvents((current) => [...current, event].slice(-120)));
      const mergedTenders = [...new Map([...scan.tenders, ...page.tenders].map((item) => [item.id, item])).values()];
      const mergedUnresearched = [...new Map([...(scan.unresearchedTenders ?? []), ...page.unresearchedTenders].map((item) => [item.id, item])).values()];
      const next: ScanResponse = {
        ...scan,
        tenders: mergedTenders,
        unresearchedTenders: mergedUnresearched,
        pagination: { ...page.pagination, totalResearched: mergedTenders.length },
        coverage: {
          ...scan.coverage,
          uniqueTenders: page.pagination.totalFound,
          totalDiscovered: page.pagination.totalFound,
          searchResults: Math.max(scan.coverage.searchResults, page.pagination.totalFound),
          tenderPagesRead: scan.coverage.tenderPagesRead + page.coverage.tenderPagesRead,
          tenderPagesFailed: scan.coverage.tenderPagesFailed + page.coverage.tenderPagesFailed,
          attachmentPagesRead: scan.coverage.attachmentPagesRead + page.tenders.reduce((sum, tender) => sum + Math.max(0, tender.documentsRead - 1), 0) + page.unresearchedTenders.reduce((sum, item) => sum + Math.max(0, (item.documentsRead ?? 0) - 1), 0),
          creditsUsed: scan.coverage.creditsUsed + page.coverage.creditsUsed,
          sourceOutcomes: page.coverage.sourceOutcomes ?? scan.coverage.sourceOutcomes,
        },
      };
      setScan(next);
      setPrevious(next);
      setSelectedTenderId(selectedTenderId || page.tenders[0]?.id || "");
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* The current scan remains available in memory. */ }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The next tender page could not be researched.");
    } finally {
      setLoadingNext(false);
    }
  }

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await startScan(url);
  }

  return <main className="app-shell">
    <header className="topbar">
      <a className="brand" href="#top" aria-label="Tender Fit Radar home"><span className="brand-mark">TF</span><span>Tender Fit <b>Radar</b></span></a>
      <div className="topbar-meta"><span className="live-indicator" aria-hidden="true" />European public procurement</div>
    </header>

    <section className="hero" id="top">
      <div className="hero-copy">
        <span className="eyebrow">EUROPEAN TENDER RADAR</span>
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
          <div className="entry"><input id="company-url" type="url" required placeholder="https://yourcompany.eu" value={url} onChange={(event) => setUrl(event.target.value)} disabled={busy || loadingNext} aria-describedby="scan-scope" />
            <button className="primary-button" type="submit" disabled={busy || !url.trim()}>{busy ? "Researching…" : scan ? "Refresh scan" : "Find tenders"}<span aria-hidden="true">↗</span></button>
          </div>
        </form>
        <div className="example-row"><button type="button" className="example-button" disabled={busy} onClick={() => startScan(EXAMPLE_COMPANY_URL)}><span className="example-mark">E</span><span><strong>Try Ehmera Oy</strong><small>Construction supplier</small></span><span className="example-arrow" aria-hidden="true">-&gt;</span></button></div>
        <p className="scan-scope" id="scan-scope">Searches TED and registered European national portals, then reads the supplier site and tender documents. Results load in pages.</p>
      </div>
    </section>

    {(busy || loadingNext) && (progressEvents.length ? <ResearchProgress events={progressEvents} /> : <section className="scan-progress" role="status" aria-live="polite"><div className="progress-symbol" aria-hidden="true"><span /></div><div><strong>{loadingNext ? "Loading the next notices" : "Starting live research"}</strong><p>Connecting to supplier pages, TED, and national procurement portals.</p></div><div className="indeterminate-track" aria-hidden="true"><span /></div></section>)}
    {error && <div className="notice" role="alert"><div><strong>The scan could not be completed</strong><p>{error}</p></div><button type="button" onClick={() => startScan(url)} disabled={busy}>Try again</button></div>}

    {scan ? <>
      <section className="scan-overview" aria-labelledby="scan-overview-title">
        <div className="overview-heading"><div><span className="eyebrow">{new Date(scan.checkedAt).toLocaleString()}</span><h2 id="scan-overview-title">Scan results</h2></div><button type="button" className="text-button" onClick={() => startScan(scan.companyUrl)} disabled={busy}>Refresh</button></div>
        <div className="summary-metrics">
          <div className="summary-metric metric-primary"><span>Notices discovered so far</span><strong>{scan.pagination?.totalFound ?? scan.coverage.totalDiscovered ?? scan.coverage.uniqueTenders}</strong></div>
          <div className="summary-metric"><span>Fully researched</span><strong>{scan.tenders.length}</strong></div>
          <div className="summary-metric"><span>Not fully researched</span><strong>{scan.unresearchedTenders?.length ?? 0}</strong></div>
          <div className="summary-metric"><span>Likely fit</span><strong>{filterCounts.likely_fit}</strong></div>
          <div className="summary-metric"><span>Needs review</span><strong>{filterCounts.needs_review}</strong></div>
          <div className="summary-metric"><span>Possible mismatch</span><strong>{filterCounts.potential_mismatch}</strong></div>
        </div>
        <p className="scan-count-note">{scan.pagination?.hasMore ? `${Math.max(0, (scan.pagination.totalFound || 0) - scan.tenders.length - (scan.unresearchedTenders?.length ?? 0))} discovered notices are still queued. Load more to research the next page.` : "No continuation page is currently available. Notices under ‘Not fully researched’ still need review."}</p>
        <ScanCoverage scan={scan} />
      </section>

      <CompanySummary scan={scan} />

      <section className="results-section" aria-labelledby="results-title">
        <div className="results-heading"><h2 id="results-title">Tender matches</h2><span className="results-total">{scan.tenders.length}</span></div>
        {comparisonAvailable && <ChangesPanel changes={scan.changes} />}
        <UnresearchedNotices items={scan.unresearchedTenders ?? []} />
        {scan.pagination?.hasMore && <div className="load-more-row"><p>More notices are available. The next page will show its own live research steps.</p><button type="button" className="primary-button" onClick={loadNextPage} disabled={loadingNext || busy}>{loadingNext ? "Researching next page…" : `Research next ${scan.pagination.pageSize} notices`}<span aria-hidden="true">-&gt;</span></button></div>}
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
          {selectedTender && <TenderDetail key={`${filter}-${selectedTender.id}`} tender={selectedTender} monitor={selectedMonitor} onMonitorChange={saveMonitor} />}
        </div> : <div className="empty-state"><span className="empty-mark">!</span><h3>{scan.unresearchedTenders?.length ? "Notices found, but not fully researched" : scan.pagination?.totalFound ? "Notices are queued for the next page" : scan.tenders.length ? "No matches" : "No current tenders found"}</h3></div>}
        {progressEvents.length > 0 && !busy && !loadingNext && <ResearchProgress events={progressEvents} />}
        <EvaluationEvidence scan={scan} activeMonitorCount={activeMonitorCount} />
      </section>
      <p className="disclaimer">Tender Fit Radar is a research aid, not a legal eligibility decision. Confirm requirements, deadlines, and changes in the original procurement system.</p>
    </> : <div className="landing-spacer" aria-hidden="true" />}

    <footer className="footer"><span>Powered by live public web data</span><span>Verify every requirement with the contracting authority.</span></footer>
  </main>;
}
