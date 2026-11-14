"use client";

import { useMemo, useState } from "react";
import {
  ArrowDownLeft, ArrowUpRight, BookOpen, Building2, CalendarDays,
  Check, CheckCheck, ChevronDown, ChevronRight, CircleHelp,
  Clock3, FileText, Globe2, History, Info, MapPin,
  RefreshCw, Search, SlidersHorizontal, TriangleAlert, X,
} from "lucide-react";
import type {
  EvidenceSource, RequirementStatus, ScanResult, TenderChange,
  TenderRequirement, TenderResult, TenderStatus,
} from "@/lib/types";
import "./tender-workspace.css";

type ScanResponse = ScanResult & { changes: TenderChange[] };
type Filter = "all" | TenderStatus;
type View = "opportunities" | "supplier" | "changes";

type TenderWorkspaceProps = {
  scan: ScanResponse;
  comparisonAvailable: boolean;
  busy: boolean;
  isDemo: boolean;
  onRefresh: () => void;
};

const requirementLabels: Record<RequirementStatus, string> = {
  supported: "Evidence found",
  potential_gap: "Possible gap",
  unclear: "Needs review",
  not_found: "No evidence found",
};

const tenderLabels: Record<TenderStatus, string> = {
  likely_fit: "Likely fit",
  needs_review: "Needs review",
  potential_mismatch: "Possible mismatch",
};

const filters: { value: Filter; label: string }[] = [
  { value: "all", label: "All opportunities" },
  { value: "likely_fit", label: "Likely fit" },
  { value: "needs_review", label: "Needs review" },
  { value: "potential_mismatch", label: "Possible mismatch" },
];

function externalUrl(value: string) {
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

function domain(value: string) {
  try { return new URL(value).hostname.replace(/^www\./, ""); }
  catch { return value; }
}

function dateLabel(value: string, includeTime = false) {
  const parsed = new Date(value);
  if (!value || Number.isNaN(parsed.getTime())) return value || "Not stated";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric", month: "short", year: includeTime ? undefined : "numeric",
    ...(includeTime ? { hour: "2-digit", minute: "2-digit" } : {}),
    timeZone: "Europe/Helsinki",
  }).format(parsed);
}

function parseDeadline(value: string): { date: Date; dateOnly: boolean } | null {
  const raw = value.trim();
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(raw);
  const timestamp = /^\d{4}-\d{2}-\d{2}[Tt ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:[Zz]|[+-]\d{2}:?\d{2})$/.test(raw);
  // An unspecified timezone or an ambiguous date must remain the buyer's wording.
  if (!dateOnly && !timestamp) return null;
  const calendarDate = new Date(`${raw.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(calendarDate.getTime()) || calendarDate.toISOString().slice(0, 10) !== raw.slice(0, 10)) return null;
  const date = dateOnly ? calendarDate : new Date(raw);
  return Number.isNaN(date.getTime()) ? null : { date, dateOnly };
}

function helsinkiCalendarDay(date: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    year: "numeric", month: "2-digit", day: "2-digit", timeZone: "Europe/Helsinki",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((item) => item.type === type)?.value);
  return Date.UTC(part("year"), part("month") - 1, part("day")) / 86_400_000;
}

function deadlineDisplay(value: string, includeTime = false) {
  const parsed = parseDeadline(value);
  if (!parsed) return value.trim() || "Not stated";
  if (parsed.dateOnly) return new Intl.DateTimeFormat("en-GB", {
    day: "numeric", month: "short", year: "numeric", timeZone: "UTC",
  }).format(parsed.date);
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Helsinki",
    ...(includeTime ? { hour: "2-digit", minute: "2-digit", timeZoneName: "short" } as const : {}),
  }).format(parsed.date) + (includeTime ? " (Helsinki)" : "");
}

function compactDeadline(value: string) {
  if (parseDeadline(value)) return deadlineDisplay(value);
  // Extract only an unambiguous calendar date from verbose buyer wording. The
  // full wording and any qualification of its cutoff remain in the detail.
  const match = value.match(/\b(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})\b/i);
  if (match) {
    const months = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
    const iso = `${match[3]}-${String(months.indexOf(match[2].toLowerCase()) + 1).padStart(2, "0")}-${match[1].padStart(2, "0")}`;
    if (parseDeadline(iso)) return deadlineDisplay(iso);
  }
  return value.trim() ? "Confirm deadline" : "Not stated";
}

function previewText(value: string, limit = 440) {
  if (value.length <= limit) return value;
  const cutoff = value.lastIndexOf(" ", limit);
  return `${value.slice(0, cutoff > limit * .6 ? cutoff : limit).trim()}…`;
}

function displayCopy(value: string) {
  const labels: Record<string, string> = {
    not_found: "no public evidence found",
    potential_gap: "possible gap",
    likely_fit: "likely fit",
    needs_review: "needs review",
    potential_mismatch: "possible mismatch",
    supported: "evidence found",
  };
  // Translate internal enum names in prose, without changing ordinary words
  // such as “supported” or mutating any evidence/status data.
  return value.replace(/`(not_found|potential_gap|likely_fit|needs_review|potential_mismatch|supported)`|\b(not_found|potential_gap|likely_fit|needs_review|potential_mismatch)\b/g,
    (_match, code: string | undefined, plain: string | undefined) => labels[code || plain || ""]);
}

function deadlineLabel(value: string, now = new Date()) {
  const parsed = parseDeadline(value);
  if (!parsed) return "Confirm with buyer";
  if (!parsed.dateOnly && parsed.date.getTime() <= now.getTime()) return "Deadline passed";
  // A date-only notice has no known cutoff time, so compare dates rather than midnight timestamps.
  const targetDay = parsed.dateOnly ? parsed.date.getTime() / 86_400_000 : helsinkiCalendarDay(parsed.date);
  const remaining = targetDay - helsinkiCalendarDay(now);
  if (remaining < 0) return "Deadline passed";
  if (remaining === 0) return parsed.dateOnly ? "Due today · confirm time" : "Due today";
  return `${remaining} ${remaining === 1 ? "day" : "days"} remaining`;
}

function StatusIcon({ status, size = 13 }: { status: RequirementStatus | TenderStatus; size?: number }) {
  if (status === "supported" || status === "likely_fit") return <Check size={size} aria-hidden="true" />;
  if (status === "potential_gap" || status === "potential_mismatch") return <TriangleAlert size={size} aria-hidden="true" />;
  if (status === "not_found") return <Search size={size} aria-hidden="true" />;
  return <CircleHelp size={size} aria-hidden="true" />;
}

function Status({ value, compact = false }: { value: RequirementStatus | TenderStatus; compact?: boolean }) {
  const label = value in requirementLabels
    ? requirementLabels[value as RequirementStatus]
    : tenderLabels[value as TenderStatus];
  return <span className={`tw-status tw-status-${value}${compact ? " tw-status-compact" : ""}`}>
    <StatusIcon status={value} /><span>{label}</span>
  </span>;
}

function SourceLink({ source, isDemo }: { source: EvidenceSource; isDemo: boolean }) {
  const href = externalUrl(source.url);
  if (isDemo) return <span className="tw-source tw-source-sample" title="Illustrative sample source"><FileText size={13} aria-hidden="true" /><span>{source.label}</span><span className="tw-source-sample-tag">Sample</span></span>;
  if (!href) return <span className="tw-source tw-source-unavailable"><FileText size={13} aria-hidden="true" /><span>{source.label || "Source unavailable"}</span></span>;
  return <a className="tw-source" href={href} target="_blank" rel="noopener noreferrer">
    <FileText size={13} aria-hidden="true" /><span>{source.label || domain(href)}</span><ArrowUpRight size={13} aria-hidden="true" />
  </a>;
}

function Evidence({ requirement, isDemo, animate }: { requirement: TenderRequirement; isDemo: boolean; animate: boolean }) {
  const tenderLinked = Boolean(requirement.tenderSource && externalUrl(requirement.tenderSource.url));
  const supplierLinked = Boolean(requirement.supplierSource && externalUrl(requirement.supplierSource.url));
  return <div className="tw-evidence-block" data-state={requirement.status} data-animate={animate} aria-label={`Evidence for ${requirement.criterion}`}>
    <div className="tw-registration" aria-hidden="true"><span /><span /><span /><span /></div>
    <div className="tw-evidence-heading"><span>Both sides of the story.</span></div>
    <div className="tw-evidence-route" role="group" aria-label="Tender and supplier source comparison">
      <div className="tw-route-node" data-present={tenderLinked}>
        <span className="tw-route-symbol">{tenderLinked ? <BookOpen size={15} aria-hidden="true" /> : <CircleHelp size={15} aria-hidden="true" />}</span>
        <span><strong>Tender source</strong><small title={requirement.tenderSource?.url}>{tenderLinked ? isDemo ? "Sample source" : domain(requirement.tenderSource!.url) : "Not established"}</small></span>
      </div>
      <span className="tw-route-rail tw-route-first" data-present={tenderLinked} aria-hidden="true"><span /><i /><i /><i /></span>
      <div className="tw-route-finding" role="status"><Status value={requirement.status} compact /></div>
      <span className="tw-route-rail tw-route-second" data-present={supplierLinked} aria-hidden="true"><span /><i /><i /><i /></span>
      <div className="tw-route-node tw-route-supplier" data-present={supplierLinked}>
        <span className="tw-route-symbol">{supplierLinked ? <Globe2 size={15} aria-hidden="true" /> : <CircleHelp size={15} aria-hidden="true" />}</span>
        <span><strong>Supplier source</strong><small title={requirement.supplierSource?.url}>{supplierLinked ? isDemo ? "Sample source" : domain(requirement.supplierSource!.url) : "Not established"}</small></span>
      </div>
    </div>
    <div className="tw-evidence">
    <div className="tw-evidence-half">
      <span className="tw-evidence-label"><BookOpen size={14} aria-hidden="true" />The tender asks</span>
      <p>{displayCopy(requirement.tenderEvidence) || "The published requirement needs a closer review in the original notice."}</p>
      {requirement.tenderSource
        ? <SourceLink source={requirement.tenderSource} isDemo={isDemo} />
        : <span className="tw-source-missing">No verified tender source</span>}
    </div>
    <div className="tw-evidence-half tw-evidence-supplier">
      <span className="tw-evidence-label"><Building2 size={14} aria-hidden="true" />Your public evidence</span>
      <p>{displayCopy(requirement.supplierEvidence) || (requirement.status === "not_found"
        ? "No supporting statement was found in the public supplier pages researched. Verify this directly with the supplier."
        : "The researched sources do not establish this yet. Review with the supplier.")}</p>
      {requirement.supplierSource
        ? <SourceLink source={requirement.supplierSource} isDemo={isDemo} />
        : <span className="tw-source-missing">No verified supplier source</span>}
    </div>
    </div>
  </div>;
}

function TenderDetails({ tender, isDemo }: { tender: TenderResult; isDemo: boolean }) {
  const [selectedRequirement, setSelectedRequirement] = useState(0);
  const [animateEvidence, setAnimateEvidence] = useState(false);
  const selected = tender.requirements[selectedRequirement] ?? tender.requirements[0];
  const supported = tender.requirements.filter((item) => item.status === "supported").length;
  const gaps = tender.requirements.filter((item) => item.status === "potential_gap").length;
  const review = tender.requirements.length - supported - gaps;
  const noticeUrl = externalUrl(tender.url);
  const deadlineStatus = deadlineLabel(tender.deadline);
  const summary = displayCopy(tender.summary);

  return <article className="tw-detail" aria-label={tender.title}>
    <header className="tw-detail-header">
      <div className="tw-detail-kicker"><span><Globe2 size={13} aria-hidden="true" />{isDemo ? "Sample public notice" : domain(tender.url) || "Public notice"}</span><Status value={tender.status} /></div>
      <div className="tw-detail-title-row"><h2>{tender.title}</h2></div>
      <div className="tw-buyer-location"><p className="tw-buyer"><Building2 size={14} aria-hidden="true" />{tender.authority || "Buyer not identified"}</p><p className="tw-location"><MapPin size={14} aria-hidden="true" />{tender.location || "Finland"}</p></div>
      {tender.summary && <p className="tw-detail-summary">{previewText(summary)}</p>}
      {summary.length > 440 && <details className="tw-summary-details"><summary>Read the full research summary<ChevronDown size={13} aria-hidden="true" /></summary><p>{summary}</p></details>}
    </header>

    <dl className="tw-facts">
      <div><dt><CalendarDays size={13} aria-hidden="true" />Deadline</dt><dd>{parseDeadline(tender.deadline) ? deadlineDisplay(tender.deadline, true) : compactDeadline(tender.deadline)}</dd><span className={deadlineStatus === "Deadline passed" ? "tw-overdue" : ""}>{deadlineStatus}</span>{!parseDeadline(tender.deadline) && tender.deadline.trim() && <details className="tw-deadline-details"><summary>Original deadline wording<ChevronDown size={12} aria-hidden="true" /></summary><p>{tender.deadline}</p></details>}</div>
      <div><dt><span className="tw-currency-icon" aria-hidden="true">€</span>Estimated value</dt><dd>{tender.estimatedValue || "Not stated"}</dd><span>As published by buyer</span></div>
      <div><dt><FileText size={13} aria-hidden="true" />Documents read</dt><dd>{tender.documentsRead}</dd><span>{tender.documentsFailed ? `${tender.documentsFailed} failed or skipped` : "Notice and linked files"}</span></div>
    </dl>

    <section className="tw-checklist" aria-labelledby={`tw-checklist-${tender.id}`}>
      <div className="tw-section-heading"><h3 id={`tw-checklist-${tender.id}`}>The fit, <em>in detail.</em></h3><span>{tender.requirements.length} requirements</span></div>
      {tender.requirements.length > 0 ? <>
        <div className="tw-fit-summary" aria-label="Requirement summary">
          <span className="tw-summary-supported"><CheckCheck size={13} aria-hidden="true" />{supported} supported</span>
          <span><CircleHelp size={13} aria-hidden="true" />{review} to review</span>
          {gaps > 0 && <span className="tw-summary-gap"><TriangleAlert size={13} aria-hidden="true" />{gaps} possible {gaps === 1 ? "gap" : "gaps"}</span>}
        </div>
        <div className="tw-requirements" role="group" aria-label="Choose a requirement to inspect its evidence">
          {tender.requirements.map((item, index) => <button
            type="button" className={`tw-requirement${selected === item ? " tw-is-selected" : ""}`}
            key={`${item.id}-${index}`} onClick={(event) => { setAnimateEvidence(event.detail !== 0); setSelectedRequirement(index); }} aria-pressed={selected === item}
            aria-controls={`tw-evidence-${tender.id}`}>
            <span className={`tw-check-icon tw-check-${item.status}`}><StatusIcon status={item.status} size={14} /></span>
            <span className="tw-requirement-copy"><strong>{item.criterion}</strong><small>{item.category || "Requirement"}<span aria-hidden="true"> · </span>{item.mandatory ? "Mandatory" : "Non-mandatory"}</small></span>
            <Status value={item.status} compact /><ChevronRight size={14} className="tw-requirement-arrow" aria-hidden="true" />
          </button>)}
        </div>
        <div id={`tw-evidence-${tender.id}`}>
          {selected && <Evidence key={selected.id} requirement={selected} isDemo={isDemo} animate={animateEvidence} />}
        </div>
        <p className="tw-evidence-note"><Info size={13} aria-hidden="true" />Missing public evidence does not mean the supplier is unqualified.</p>
      </> : <div className="tw-inline-empty"><CircleHelp size={23} aria-hidden="true" /><strong>This notice needs a manual check.</strong><p>A structured checklist could not be established. Read the notice and linked documents before making a fit decision.</p></div>}
    </section>

    {tender.procurementType && <details className="tw-disclosure tw-procurement-details"><summary><span>Procurement details</span><ChevronDown size={15} aria-hidden="true" /></summary><p>{displayCopy(tender.procurementType)}</p></details>}
    <details className="tw-disclosure">
      <summary><span><FileText size={14} aria-hidden="true" />Source documents <span className="tw-count">{tender.sources.length}</span></span><ChevronDown size={15} aria-hidden="true" /></summary>
      <div className="tw-document-list">{tender.sources.length ? tender.sources.map((source, index) => <div key={`${source.url}-${index}`}><SourceLink source={source} isDemo={isDemo} />{source.detail && <p>{displayCopy(source.detail)}</p>}</div>) : <p className="tw-muted">No verified source documents were returned. Check the original notice.</p>}</div>
    </details>
    <div className="tw-detail-footer"><span><Clock3 size={12} aria-hidden="true" />{isDemo ? "Illustrative tender" : `Read ${dateLabel(tender.updatedAt, true)}`}</span>{noticeUrl && !isDemo && <a className="tw-button tw-button-dark" href={noticeUrl} target="_blank" rel="noopener noreferrer">Open original notice <ArrowUpRight size={14} aria-hidden="true" /></a>}{isDemo && <span className="tw-sample-label">Sample notice</span>}</div>
  </article>;
}

function Coverage({ scan, isDemo }: { scan: ScanResult; isDemo: boolean }) {
  const stats: [number, string][] = [
    [scan.coverage.searchResults, "Search results"],
    [scan.coverage.uniqueTenders, "Notices discovered"],
    [scan.tenders.length, "Notices researched"],
    [scan.coverage.tenderPagesRead, "Tender pages read"],
    [scan.coverage.attachmentPagesRead, "Additional pages read"],
    [scan.coverage.tenderPagesFailed, "Pages failed or skipped"],
    [scan.coverage.creditsUsed, "Context.dev credits"],
  ];
  return <details className="tw-coverage">
    <summary><span><Globe2 size={14} aria-hidden="true" />Scan coverage & sources</span><span className="tw-coverage-preview">{scan.company.sourceCount} supplier pages · {scan.tenders.length} researched notices<ChevronDown size={15} aria-hidden="true" /></span></summary>
    <div className="tw-coverage-content"><dl>{stats.map(([value, label]) => <div key={label}><dt>{label}</dt><dd>{value.toLocaleString("en-GB")}</dd></div>)}</dl><p>{isDemo ? "These figures illustrate a scan; no API credits were used." : `Search sources: ${scan.coverage.searchSources.join(", ") || "Hilma and TED"}. Checked ${dateLabel(scan.checkedAt, true)} (Helsinki). A scan deeply researches up to five notices.`}</p></div>
  </details>;
}

function SupplierProfile({ scan, isDemo }: { scan: ScanResult; isDemo: boolean }) {
  const { company } = scan;
  const groups: [string, string[]][] = [
    ["Capabilities", company.capabilities], ["Certifications", company.certifications],
    ["Service areas", company.serviceRegions], ["Project references", company.projectReferences],
    ["Equipment & resources", company.equipmentAndResources], ["Quality & safety", company.qualityAndSafety],
    ["Sustainability", company.sustainability],
  ];
  const website = externalUrl(scan.companyUrl);
  return <section className="tw-supplier" aria-labelledby="tw-supplier-title">
    <header className="tw-supplier-heading"><div><h2 id="tw-supplier-title">A public picture of {company.name}</h2><p>{displayCopy(company.summary) || "Capabilities and qualifications gathered from public supplier sources."}</p></div>{website && !isDemo && <a className="tw-button" href={website} target="_blank" rel="noopener noreferrer">Visit website <ArrowUpRight size={14} aria-hidden="true" /></a>}</header>
    <dl className="tw-profile-stats"><div><dt>Supplier pages read</dt><dd>{company.sourceCount}</dd></div><div><dt>URLs in sitemap</dt><dd>{company.sitemapUrls}</dd></div><div><dt>Failed or skipped</dt><dd>{company.failedCount}</dd></div></dl>
    <div className="tw-profile-groups">{groups.map(([label, values]) => <section key={label}><h3>{label}</h3>{values.length ? <ul>{values.map((value, index) => <li key={index}>{displayCopy(value)}</li>)}</ul> : <p className="tw-muted">No public evidence established yet.</p>}</section>)}</div>
    {company.news.length > 0 && <details className="tw-disclosure"><summary><span><History size={14} aria-hidden="true" />Recent public news <span className="tw-count">{company.news.length}</span></span><ChevronDown size={15} aria-hidden="true" /></summary><div className="tw-document-list">{company.news.map((source, index) => <div key={`${source.url}-${index}`}><SourceLink source={source} isDemo={isDemo} />{source.detail && <p>{displayCopy(source.detail)}</p>}</div>)}</div></details>}
    <details className="tw-disclosure"><summary><span><Globe2 size={14} aria-hidden="true" />Supplier source pages <span className="tw-count">{company.sources.length}</span></span><ChevronDown size={15} aria-hidden="true" /></summary><div className="tw-document-list">{company.sources.length ? company.sources.map((source, index) => <div key={`${source.url}-${index}`}><SourceLink source={source} isDemo={isDemo} /></div>) : <p className="tw-muted">No supplier source pages available.</p>}</div></details>
  </section>;
}

function Changes({ changes, comparisonAvailable, isDemo }: { changes: TenderChange[]; comparisonAvailable: boolean; isDemo: boolean }) {
  if (!comparisonAvailable && !isDemo) return <div className="tw-empty tw-changes-empty"><History size={30} strokeWidth={1.4} aria-hidden="true" /><h2>Your first point of comparison.</h2><p>Refresh this supplier later to see changes in deadlines, requirements and fit. The previous scan is saved in this browser.</p></div>;
  if (!changes.length) return <div className="tw-empty tw-changes-empty"><CheckCheck size={30} strokeWidth={1.4} aria-hidden="true" /><h2>You’re up to date.</h2><p>No tender or fit changes were found compared with this browser’s previous scan.</p></div>;
  return <section className="tw-changes" aria-labelledby="tw-changes-title"><header><h2 id="tw-changes-title">Since your previous scan</h2><p>{isDemo ? "Illustrative updates show how a refresh comparison works." : "Changes compared with the last scan saved in this browser. Check amendments in the original notices."}</p></header><div className="tw-timeline">{changes.map((change, index) => <article key={`${change.tenderId}-${index}`}><span className={`tw-change-icon tw-change-${change.kind}`}>{change.kind === "new" ? <ArrowUpRight size={16} aria-hidden="true" /> : change.kind === "removed" ? <ArrowDownLeft size={16} aria-hidden="true" /> : <RefreshCw size={15} aria-hidden="true" />}</span><div><span className={`tw-change-label tw-change-${change.kind}`}>{change.kind === "new" ? "New opportunity" : change.kind === "removed" ? "No longer found" : "Updated"}</span><h3>{change.tenderTitle}</h3>{change.details.map((detail, detailIndex) => <p key={detailIndex}>{displayCopy(detail)}</p>)}{change.kind === "removed" && <p className="tw-muted">Not found in this bounded scan. This does not establish that the notice is closed or deleted.</p>}</div></article>)}</div></section>;
}

export function TenderWorkspace({ scan, comparisonAvailable, busy, isDemo, onRefresh }: TenderWorkspaceProps) {
  const [view, setView] = useState<View>("opportunities");
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(scan.tenders[0]?.id ?? "");
  const counts = useMemo(() => ({
    all: scan.tenders.length,
    likely_fit: scan.tenders.filter((tender) => tender.status === "likely_fit").length,
    needs_review: scan.tenders.filter((tender) => tender.status === "needs_review").length,
    potential_mismatch: scan.tenders.filter((tender) => tender.status === "potential_mismatch").length,
  }), [scan.tenders]);
  const tenders = useMemo(() => scan.tenders.filter((tender) =>
    (filter === "all" || tender.status === filter) &&
    `${tender.title} ${tender.authority} ${tender.location}`.toLowerCase().includes(query.trim().toLowerCase())), [scan.tenders, filter, query]);
  const selected = tenders.find((tender) => tender.id === selectedId) ?? tenders[0];

  function resetFilters() { setFilter("all"); setQuery(""); }

  return <section className="tw-workspace" aria-labelledby="tw-workspace-title" aria-busy={busy}>
    <header className="tw-workspace-header">
      <div className="tw-company-heading"><h1 id="tw-workspace-title">Opportunities for <em>{scan.company.name || domain(scan.companyUrl)}</em></h1><div className="tw-workspace-meta"><span><Globe2 size={12} aria-hidden="true" />{domain(scan.companyUrl)}</span><span className="tw-meta-divider" aria-hidden="true">/</span><span><Clock3 size={12} aria-hidden="true" />{isDemo ? "Sample workspace" : `Checked ${dateLabel(scan.checkedAt, true)}`}</span></div></div>
      {!isDemo && <button className="tw-button tw-refresh" type="button" disabled={busy} onClick={onRefresh}><RefreshCw size={14} aria-hidden="true" />{busy ? "Refreshing…" : "Refresh research"}<ArrowUpRight size={14} aria-hidden="true" /></button>}
    </header>

    <nav className="tw-views" aria-label="Workspace sections"><button type="button" onClick={() => setView("opportunities")} aria-pressed={view === "opportunities"} className={view === "opportunities" ? "tw-active-view" : ""}><SlidersHorizontal size={15} aria-hidden="true" />Opportunities<span className="tw-count">{scan.tenders.length}</span></button><button type="button" onClick={() => setView("supplier")} aria-pressed={view === "supplier"} className={view === "supplier" ? "tw-active-view" : ""}><Building2 size={15} aria-hidden="true" />Supplier profile</button><button type="button" onClick={() => setView("changes")} aria-pressed={view === "changes"} className={view === "changes" ? "tw-active-view" : ""}><History size={15} aria-hidden="true" />Changes{(comparisonAvailable || isDemo) && scan.changes.length > 0 && <span className="tw-count tw-change-count">{scan.changes.length}</span>}</button></nav>

    {view === "opportunities" && <div className="tw-opportunities"><div className="tw-filter-toolbar"><div className="tw-filters" role="group" aria-label="Filter by fit">{filters.map((item) => <button type="button" key={item.value} aria-pressed={filter === item.value} onClick={() => setFilter(item.value)} className={filter === item.value ? "tw-active-filter" : ""}>{item.label}<span>{counts[item.value]}</span></button>)}</div><label className="tw-search"><Search size={14} aria-hidden="true" /><input type="search" aria-label="Search opportunities" placeholder="Search opportunities" value={query} onChange={(event) => setQuery(event.target.value)} /></label></div>
      {tenders.length ? <div className="tw-explorer"><aside className="tw-shortlist" aria-label="Opportunity shortlist"><div className="tw-shortlist-label"><span>The shortlist</span><span>{tenders.length} {tenders.length === 1 ? "notice" : "notices"}</span></div><ul>{tenders.map((tender) => <li key={tender.id}><button className={`tw-opportunity${selected?.id === tender.id ? " tw-selected-opportunity" : ""}`} type="button" aria-pressed={selected?.id === tender.id} onClick={() => setSelectedId(tender.id)}><span className="tw-option-buyer">{tender.authority || "Buyer not identified"}</span><strong>{tender.title}</strong><span className="tw-option-location" title={tender.location}><MapPin size={12} aria-hidden="true" /><span>{tender.location || "Finland"}</span></span><span className="tw-option-bottom"><Status value={tender.status} compact /><span><CalendarDays size={11} aria-hidden="true" />{compactDeadline(tender.deadline)}</span></span></button></li>)}</ul><p className="tw-shortlist-note"><Info size={13} aria-hidden="true" />Fit is based on public evidence. Review the source before you bid.</p></aside>{selected && <TenderDetails key={`${scan.checkedAt}-${selected.id}`} tender={selected} isDemo={isDemo} />}</div> : <div className="tw-empty"><Search size={30} strokeWidth={1.4} aria-hidden="true" /><h2>{scan.tenders.length ? "No opportunities in this view." : "No current opportunities found."}</h2><p>{scan.tenders.length ? "Try another fit filter or search for a different buyer or location." : "This scan did not establish a current match. Check your supplier profile and scan coverage, or refresh later for new notices."}</p>{scan.tenders.length > 0 && <button type="button" className="tw-button" onClick={resetFilters}><X size={14} aria-hidden="true" />Clear filters</button>}</div>}
    </div>}
    {view === "supplier" && <SupplierProfile scan={scan} isDemo={isDemo} />}
    {view === "changes" && <Changes changes={scan.changes} comparisonAvailable={comparisonAvailable} isDemo={isDemo} />}
    <Coverage scan={scan} isDemo={isDemo} />
    <p className="tw-disclaimer"><Info size={13} aria-hidden="true" /><span>Research guidance, not an eligibility decision. Verify requirements, deadlines and amendments in the original procurement system.</span></p>
  </section>;
}
