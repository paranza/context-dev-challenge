"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowRight, ArrowUpRight, CircleHelp, Radar, X } from "lucide-react";
import { LiveResearchActivity as ResearchActivity } from "@/components/live-research-activity";
import { readResearchResponse, readTenderPageResponse } from "@/lib/research-client";
import { researchFeed } from "@/lib/research-feed";
import { Landing } from "@/components/landing";
import { TenderWorkspace } from "@/components/tender-workspace";
import { DEMO_SCAN } from "@/lib/demo";
import { mergeResearchPage, normalizeScanResult, normalizeCompanyUrl } from "@/lib/client-scan";
import { compareScanSnapshots } from "@/lib/scan-comparison";
import type { ScanResult, TenderChange } from "@/lib/types";

type ScanResponse = ScanResult & { changes: TenderChange[] };
const STORAGE_KEY = "tender-fit-radar:last-scan";
export default function Home() {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [pageError, setPageError] = useState("");
  const working = busy || loadingMore;
  const [startedAt, setStartedAt] = useState(0);
  const [scan, setScan] = useState<ScanResponse | null>(null);
  const [previous, setPrevious] = useState<ScanResult | null>(null);
  const [comparisonAvailable, setComparisonAvailable] = useState(false);
  const [isDemo, setIsDemo] = useState(false);
  const [view, setView] = useState<"home" | "workspace">("home");
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const workspaceHeading = useRef<HTMLDivElement>(null);
  const inFlight = useRef(false);
  const comparisonBase = useRef<ScanResult | null>(null);
  const consumedCursors = useRef(new Set<string>());

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) return;
      const value: unknown = JSON.parse(stored);
      const restored = normalizeScanResult(value);
      if (restored) { setPrevious(restored); setUrl(restored.companyUrl); }
    } catch { /* A blocked or malformed browser store must not prevent a fresh scan. */ }
  }, []);

  useEffect(() => {
    if (view === "workspace") {
      window.scrollTo({ top: 0, behavior: "instant" });
      workspaceHeading.current?.focus({ preventScroll: true });
    }
  }, [view]);

  async function startScan(input: string) {
    if (inFlight.current) return;
    let companyUrl: string;
    try { companyUrl = normalizeCompanyUrl(input); }
    catch { setError("Enter a valid company website, such as yourcompany.fi."); inputRef.current?.focus(); return; }
    inFlight.current = true;
    setUrl(companyUrl);
    setBusy(true);
    setStartedAt(Date.now());
    setError("");
    setPageError("");
    researchFeed.reset();
    const last = previous && normalizeCompanyUrl(previous.companyUrl) === companyUrl ? previous : null;
    try {
      const response = await fetch("/api/search/stream", { method: "POST", headers: { "Content-Type": "application/json", "Accept": "text/event-stream" }, body: JSON.stringify({ companyUrl, previous: last }) });
      const complete = await readResearchResponse(response, researchFeed.push);
      comparisonBase.current = last;
      consumedCursors.current.clear();
      setScan(complete);
      setComparisonAvailable(Boolean(last));
      setPrevious(complete);
      setIsDemo(false);
      setView("workspace");
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(complete)); } catch { /* Current results remain available if storage is full. */ }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The live scan could not be completed. Please try again.");
    } finally { setBusy(false); inFlight.current = false; }
  }

  async function loadMore() {
    const cursor = scan?.pagination?.nextCursor;
    if (inFlight.current || isDemo || !scan || !scan.pagination?.hasMore || !cursor || consumedCursors.current.has(cursor)) return;
    inFlight.current = true;
    setLoadingMore(true);
    setPageError("");
    setStartedAt(Date.now());
    researchFeed.reset();
    try {
      const response = await fetch("/api/search/page/stream", { method: "POST", headers: { "Content-Type": "application/json", "Accept": "text/event-stream" }, body: JSON.stringify({ cursor }) });
      const page = await readTenderPageResponse(response, researchFeed.push);
      if (page.pagination.hasMore && page.pagination.nextCursor === cursor) throw new Error("The research service returned the same continuation. Refresh research to start again.");
      const merged = mergeResearchPage(scan, page);
      const complete = { ...merged, changes: comparisonBase.current ? compareScanSnapshots(comparisonBase.current, merged) : merged.changes };
      consumedCursors.current.add(cursor);
      setScan(complete);
      setPrevious(complete);
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(complete)); } catch { /* Loaded results remain usable when storage is unavailable. */ }
    } catch (caught) {
      setPageError(caught instanceof Error ? caught.message : "The next notices could not be researched. Your existing results are still available.");
    } finally { setLoadingMore(false); inFlight.current = false; }
  }

  function exploreDemo() { if (inFlight.current) return; setScan(DEMO_SCAN); setIsDemo(true); setComparisonAvailable(true); setError(""); setPageError(""); setView("workspace"); }
  function newScan() { if (inFlight.current) return; setView("home"); setError(""); setPageError(""); window.setTimeout(() => { window.scrollTo({ top: 0, behavior: "instant" }); inputRef.current?.focus({ preventScroll: true }); }, 0); }
  function restorePrevious() { if (!previous || inFlight.current) return; comparisonBase.current = null; consumedCursors.current.clear(); setScan({ ...previous, changes: [] }); setIsDemo(false); setComparisonAvailable(false); setPageError(""); setView("workspace"); }
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); void startScan(url); }

  return <div className={`site-shell ${view === "workspace" ? "workspace-mode" : ""}`}>
    <a className="skip-link" href="#main-content">Skip to content</a>
    <header className="site-header wrap">
      <a className="brand" href="#" onClick={(event) => { event.preventDefault(); if (!working) newScan(); }} aria-label="Tender Fit Radar home"><span className="brand-icon"><Radar size={30} strokeWidth={1.8} /></span><span>tenderfit<span className="brand-dot">.</span></span></a>
      <nav className="header-nav" aria-label="Main navigation">
        {view === "home" ? <>
          <a className="nav-how" href="#how-it-works">How it works</a>
          <a className="nav-evidence" href="#evidence">Follow the evidence</a>
          <button type="button" className="nav-workspace" onClick={exploreDemo} disabled={working}>Explore demo<ArrowUpRight size={14} /></button>
          <a className="nav-start" href="#company-url" onClick={() => inputRef.current?.focus()}>Find my tenders<ArrowUpRight size={15} /></a>
        </> : <>
          <button type="button" onClick={newScan} disabled={working}>New scan<ArrowUpRight size={14} /></button>
          <a className="context-credit" href="https://www.context.dev/" target="_blank" rel="noreferrer"><span>Powered by</span><span className="context-wordmark">context.dev</span><ArrowUpRight size={12} /></a>
        </>}
      </nav>
    </header>
    <main id="main-content" className="wrap">
      {view === "home" && <Landing url={url} busy={working} error={error} onUrlChange={setUrl} onSubmit={submit} onExplore={exploreDemo} onRestore={restorePrevious} hasPrevious={Boolean(previous)} inputRef={inputRef} activity={working ? <ResearchActivity startedAt={startedAt} companyUrl={url} /> : null} onDismissError={() => setError("")} />}
      {view === "workspace" && scan && <div ref={workspaceHeading} tabIndex={-1} className="workspace-container">
        {isDemo && <div className="demo-banner"><span><span className="demo-dot" /><strong>Sample workspace</strong><span>Fictional supplier and tenders, so you can explore freely.</span></span><button type="button" onClick={newScan} disabled={working}>Research your company<ArrowRight size={14} /></button></div>}
        {working && <ResearchActivity startedAt={startedAt} companyUrl={url} />}
        {error && <div className="error-notice" role="alert"><CircleHelp size={19} /><div><strong>Your previous results are still here</strong><p>{error}</p></div><button type="button" aria-label="Dismiss error" onClick={() => setError("")}><X size={16} /></button></div>}
        <TenderWorkspace key={`${scan.companyUrl}-${scan.checkedAt}`} scan={scan} comparisonAvailable={comparisonAvailable} busy={working} isDemo={isDemo} onRefresh={() => void startScan(scan.companyUrl)} onLoadMore={() => void loadMore()} loadingMore={loadingMore} pageError={pageError} />
      </div>}
    </main>
    <footer className="site-footer wrap"><span><span className="footer-mark"><Radar size={14} /></span>Tender Fit Radar</span><span>{view === "home" ? <a href="https://www.context.dev/" target="_blank" rel="noreferrer">Powered by context.dev ↗</a> : "Research guidance. Verify requirements in the original tender."}</span></footer>
  </div>;
}
