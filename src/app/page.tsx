"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowRight, ArrowUpRight, CircleHelp, Radar, X } from "lucide-react";
import { LiveResearchActivity as ResearchActivity } from "@/components/live-research-activity";
import { readResearchResponse } from "@/lib/research-client";
import { researchFeed } from "@/lib/research-feed";
import { Landing } from "@/components/landing";
import { TenderWorkspace } from "@/components/tender-workspace";
import { DEMO_SCAN } from "@/lib/demo";
import { isScanResult, normalizeCompanyUrl } from "@/lib/client-scan";
import type { ScanResult, TenderChange } from "@/lib/types";

type ScanResponse = ScanResult & { changes: TenderChange[] };
const STORAGE_KEY = "tender-fit-radar:last-scan";
export default function Home() {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
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

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) return;
      const value: unknown = JSON.parse(stored);
      if (isScanResult(value)) { setPrevious(value); setUrl(value.companyUrl); }
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
    researchFeed.reset();
    const last = previous && normalizeCompanyUrl(previous.companyUrl) === companyUrl ? previous : null;
    try {
      const response = await fetch("/api/search", { method: "POST", headers: { "Content-Type": "application/json", "Accept": "text/event-stream" }, body: JSON.stringify({ companyUrl, previous: last }) });
      const complete = await readResearchResponse(response, researchFeed.push);
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

  function exploreDemo() { if (busy) return; setScan(DEMO_SCAN); setIsDemo(true); setComparisonAvailable(true); setError(""); setView("workspace"); }
  function newScan() { setView("home"); setError(""); window.setTimeout(() => { window.scrollTo({ top: 0, behavior: "instant" }); inputRef.current?.focus({ preventScroll: true }); }, 0); }
  function restorePrevious() { if (!previous) return; setScan({ ...previous, changes: [] }); setIsDemo(false); setComparisonAvailable(false); setView("workspace"); }
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); void startScan(url); }

  return <div className={`site-shell ${view === "workspace" ? "workspace-mode" : ""}`}>
    <a className="skip-link" href="#main-content">Skip to content</a>
    <header className="site-header wrap">
      <a className="brand" href="#" onClick={(event) => { event.preventDefault(); if (!busy) newScan(); }} aria-label="Tender Fit Radar home"><span className="brand-icon"><Radar size={30} strokeWidth={1.8} /></span><span>tenderfit<span className="brand-dot">.</span></span></a>
      <nav className="header-nav" aria-label="Main navigation">
        {view === "home" ? <>
          <a className="nav-how" href="#how-it-works">How it works</a>
          <a className="nav-evidence" href="#evidence">Follow the evidence</a>
          <button type="button" className="nav-workspace" onClick={exploreDemo} disabled={busy}>Explore demo<ArrowUpRight size={14} /></button>
          <a className="nav-start" href="#company-url" onClick={() => inputRef.current?.focus()}>Find my tenders<ArrowUpRight size={15} /></a>
        </> : <>
          <button type="button" onClick={newScan} disabled={busy}>New scan<ArrowUpRight size={14} /></button>
          <a className="context-credit" href="https://www.context.dev/" target="_blank" rel="noreferrer"><span>Powered by</span><span className="context-wordmark">context.dev</span><ArrowUpRight size={12} /></a>
        </>}
      </nav>
    </header>
    <main id="main-content" className="wrap">
      {view === "home" && <Landing url={url} busy={busy} error={error} onUrlChange={setUrl} onSubmit={submit} onExplore={exploreDemo} onRestore={restorePrevious} hasPrevious={Boolean(previous)} inputRef={inputRef} activity={busy ? <ResearchActivity startedAt={startedAt} companyUrl={url} /> : null} onDismissError={() => setError("")} />}
      {view === "workspace" && scan && <div ref={workspaceHeading} tabIndex={-1} className="workspace-container">
        {isDemo && <div className="demo-banner"><span><span className="demo-dot" /><strong>Sample workspace</strong><span>Fictional supplier and tenders, so you can explore freely.</span></span><button type="button" onClick={newScan} disabled={busy}>Research your company<ArrowRight size={14} /></button></div>}
        {busy && <ResearchActivity startedAt={startedAt} companyUrl={url} />}
        {error && <div className="error-notice" role="alert"><CircleHelp size={19} /><div><strong>Your previous results are still here</strong><p>{error}</p></div><button type="button" aria-label="Dismiss error" onClick={() => setError("")}><X size={16} /></button></div>}
        <TenderWorkspace key={`${scan.companyUrl}-${scan.checkedAt}`} scan={scan} comparisonAvailable={comparisonAvailable} busy={busy} isDemo={isDemo} onRefresh={() => void startScan(scan.companyUrl)} />
      </div>}
    </main>
    <footer className="site-footer wrap"><span><span className="footer-mark"><Radar size={14} /></span>Tender Fit Radar</span><span>{view === "home" ? <a href="https://www.context.dev/" target="_blank" rel="noreferrer">Powered by context.dev ↗</a> : "Research guidance. Verify requirements in the original tender."}</span></footer>
  </div>;
}
