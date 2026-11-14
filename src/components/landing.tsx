"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode, type RefObject } from "react";
import { ArrowRight, ArrowUpRight, Check, CircleHelp, FileText, Globe2, RefreshCw, TriangleAlert, X } from "lucide-react";
import { ProcessScenes } from "@/components/process-scenes";
import "./landing.css";

export type LandingProps = {
  url: string;
  busy: boolean;
  error: string;
  onUrlChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onExplore: () => void;
  onRestore: () => void;
  hasPrevious: boolean;
  inputRef: RefObject<HTMLInputElement | null>;
  activity: ReactNode;
  onDismissError: () => void;
};

type ExampleState = "supported" | "unknown" | "gap";

const examples: {
  id: string;
  title: string;
  state: ExampleState;
  label: string;
  tender: string;
  tenderSource: string;
  supplier: string;
  supplierSource: string;
  conclusion: string;
  explanation: string;
}[] = [
  {
    id: "experience",
    title: "Renovation experience",
    state: "supported",
    label: "Evidence found",
    tender: "At least two comparable public building renovations completed within the past five years.",
    tenderSource: "Tender specification, section 4.2",
    supplier: "Three school renovations completed in Uusimaa since 2023, including work in buildings that remained in use.",
    supplierSource: "Supplier project references",
    conclusion: "Relevant experience, with evidence to back it up.",
    explanation: "The published project references support this requirement. Check the original documents before bidding.",
  },
  {
    id: "insurance",
    title: "Insurance coverage",
    state: "unknown",
    label: "No public evidence",
    tender: "The contractor must hold public liability insurance with a minimum coverage of €1 million.",
    tenderSource: "Tender specification, section 6.1",
    supplier: "The supplier’s public pages do not state the level of public liability insurance held.",
    supplierSource: "Supplier pages researched",
    conclusion: "A question to ask, before making the call.",
    explanation: "Missing public evidence does not mean missing insurance. Confirm the coverage directly with the supplier.",
  },
  {
    id: "response",
    title: "Regional response time",
    state: "gap",
    label: "Possible gap",
    tender: "An on-site team must be available within two hours of a service request in the Oulu region.",
    tenderSource: "Service requirements, section 3.3",
    supplier: "Our teams are based in Helsinki. On-site visits outside Uusimaa are available from the next business day.",
    supplierSource: "Supplier service areas",
    conclusion: "A possible gap worth discussing early.",
    explanation: "The stated response times differ. Verify whether the supplier can make a separate arrangement for this tender.",
  },
];

function ExampleIcon({ state, size = 17 }: { state: ExampleState; size?: number }) {
  if (state === "supported") return <Check size={size} aria-hidden="true" />;
  if (state === "gap") return <TriangleAlert size={size} aria-hidden="true" />;
  return <CircleHelp size={size} aria-hidden="true" />;
}

function EvidenceExample() {
  const [selected, setSelected] = useState(0);
  const example = examples[selected];

  return <div className="lf-demo" data-state={example.state}>
    <div className="lf-demo-heading"><span>Municipal building renovation</span><span>Illustrative example</span></div>
    <div className="lf-demo-options" role="group" aria-label="Choose an example requirement">
      {examples.map((item, index) => <button
        key={item.id} type="button" onClick={() => setSelected(index)}
        className={selected === index ? "lf-demo-selected" : ""}
        aria-pressed={selected === index} aria-controls="lf-evidence-example">
        <span className={`lf-example-symbol lf-symbol-${item.state}`}><ExampleIcon state={item.state} /></span>
        <span>{item.title}</span><ArrowUpRight size={15} className="lf-example-arrow" aria-hidden="true" />
      </button>)}
    </div>
    <div id="lf-evidence-example" aria-live="polite" aria-atomic="true">
      <div className="lf-comparison" key={example.id}>
        <div className="lf-comparison-side"><div className="lf-comparison-label"><FileText size={17} aria-hidden="true" /><h3>The tender asks</h3></div><blockquote>“{example.tender}”</blockquote><span className="lf-comparison-source"><FileText size={13} aria-hidden="true" />{example.tenderSource}<span>Sample source</span></span></div>
        <div className="lf-comparison-side"><div className="lf-comparison-label"><Globe2 size={17} aria-hidden="true" /><h3>Your website says</h3></div><blockquote>“{example.supplier}”</blockquote><span className="lf-comparison-source"><Globe2 size={13} aria-hidden="true" />{example.supplierSource}<span>Sample source</span></span></div>
        <span className="lf-comparison-connector" aria-hidden="true"><ArrowRight size={20} /></span>
      </div>
      <div className="lf-conclusion"><span className="lf-conclusion-symbol"><ExampleIcon state={example.state} size={20} /></span><div><span className="lf-conclusion-label">{example.label}</span><h3>{example.conclusion}</h3><p>{example.explanation}</p></div></div>
    </div>
  </div>;
}

export function Landing({ url, busy, error, onUrlChange, onSubmit, onExplore, onRestore, hasPrevious, inputRef, activity, onDismissError }: LandingProps) {
  const errorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (error) errorRef.current?.focus({ preventScroll: true });
  }, [error]);

  function dismissError() {
    onDismissError();
    inputRef.current?.focus({ preventScroll: true });
  }

  return <div className="lf-landing">
    <section className="lf-hero" aria-labelledby="lf-hero-title">
      <div className="lf-hero-art" aria-hidden="true"><img src="/images/opportunity-sky.webp" alt="" fetchPriority="high" width="1672" height="941" /></div>
      <div className="lf-hero-content">
        <h1 id="lf-hero-title">Your next contract.<em>Already on the radar.</em></h1>
        <p className="lf-hero-description">Find Finnish public tenders that fit your business.<span>One website. Every requirement. The evidence behind it.</span></p>
        <form className="lf-website-form" onSubmit={onSubmit} aria-label="Find public tenders for your company">
          <label htmlFor="company-url">Start with your company website</label>
          <div className="lf-input-shell"><Globe2 size={20} aria-hidden="true" /><input
            id="company-url" name="companyUrl" ref={inputRef} type="text" inputMode="url"
            autoCapitalize="none" autoComplete="url" spellCheck={false} required
            placeholder="yourcompany.fi" value={url} onChange={(event) => onUrlChange(event.target.value)}
            disabled={busy} aria-describedby={error ? "lf-form-error" : undefined}
          /><button className="lf-primary-button" type="submit" disabled={busy}>{busy ? "Researching…" : "Find my tenders"}{busy ? <RefreshCw size={17} aria-hidden="true" /> : <ArrowUpRight size={18} aria-hidden="true" />}</button></div>
        </form>
        {error && <div className="lf-form-error" id="lf-form-error" role="alert" ref={errorRef} tabIndex={-1}><CircleHelp size={19} aria-hidden="true" /><div><strong>We couldn’t complete the research</strong><p>{error}</p></div><button type="button" onClick={dismissError} aria-label="Dismiss scan error"><X size={17} aria-hidden="true" /></button></div>}
        {activity && <div className="lf-activity">{activity}</div>}
        <div className="lf-secondary-actions"><button type="button" onClick={onExplore} disabled={busy}>Explore the sample workspace<ArrowRight size={16} aria-hidden="true" /></button>{hasPrevious && <button type="button" className="lf-restore" onClick={onRestore} disabled={busy}>Continue your last scan<ArrowUpRight size={15} aria-hidden="true" /></button>}</div>
      </div>
    </section>

    <section className="lf-source-strip" aria-label="Public sources researched"><div className="lf-wrap"><p>A clearer picture,<br />from the original sources.</p><div className="lf-source-names"><span className="lf-hilma">HILMA<span>Finnish public procurement</span></span><span className="lf-ted">TED<span>EU tender notices</span></span><span>Supplier websites<span>Capabilities & references</span></span><span>Source documents<span>The detail behind the notice</span></span></div></div></section>

    <section className="lf-evidence-section lf-wrap" id="evidence" aria-labelledby="lf-evidence-title">
      <div className="lf-section-intro"><h2 id="lf-evidence-title">Every requirement.<em>Both sides of the story.</em></h2><p>We connect what the tender asks with what your business can show. Follow the evidence, see the unknowns, and decide what deserves a closer look.</p></div>
      <EvidenceExample />
      <p className="lf-example-note">A fictional supplier and tender illustrate the workflow. A fit finding is research guidance; verify the original documents before bidding.</p>
    </section>

    <ProcessScenes />

    <section className="lf-closing" aria-labelledby="lf-closing-title"><div className="lf-wrap"><div><h2 id="lf-closing-title">A better bid starts<br /><em>with better context.</em></h2><p>Find relevant work. See the evidence behind the fit.</p></div><div className="lf-closing-action"><button type="button" onClick={onExplore} disabled={busy}>Explore the sample workspace<ArrowUpRight size={19} aria-hidden="true" /></button><span>Explore freely with illustrative supplier data.</span></div></div></section>
  </div>;
}
