"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { ArrowUpRight, ChevronDown, Shuffle, X } from "lucide-react";
import { testedConstructionExamples, type ConstructionCompanyExample } from "@/lib/construction-examples";
import "./company-examples.css";

type CompanyExamplesProps = {
  value: string;
  busy: boolean;
  onSelect: (url: string) => void;
};

function countryName(code: string) {
  return new Intl.DisplayNames(["en"], { type: "region" }).of(code) || code;
}

export function CompanyExamples({ value, busy, onSelect }: CompanyExamplesProps) {
  const examples = testedConstructionExamples();
  const preferred = ["vitali", "decker-de", "yit-fi"];
  const featured = [...examples].sort((a, b) => {
    const aRank = preferred.indexOf(a.id);
    const bRank = preferred.indexOf(b.id);
    return (aRank === -1 ? 99 : aRank) - (bRank === -1 ? 99 : bRank);
  }).slice(0, 3);
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const popover = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0, width: 620 });
  const positionPopover = useCallback(() => {
    const anchor = trigger.current?.getBoundingClientRect();
    if (!anchor) return;
    const width = Math.min(620, window.innerWidth - 32);
    setPosition({
      width,
      left: Math.max(16, Math.min(anchor.right - width, window.innerWidth - width - 16)),
      top: Math.max(16, Math.min(anchor.bottom + 10, window.innerHeight - Math.min(440, window.innerHeight - 32) - 16)),
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    window.addEventListener("resize", positionPopover);
    window.addEventListener("scroll", positionPopover, { passive: true, capture: true });
    return () => { window.removeEventListener("resize", positionPopover); window.removeEventListener("scroll", positionPopover, true); };
  }, [open, positionPopover]);
  useEffect(() => { if (busy && open) popover.current?.hidePopover(); }, [busy, open]);

  function select(example: ConstructionCompanyExample) {
    if (busy) return;
    if (popover.current?.matches(":popover-open")) popover.current.hidePopover();
    onSelect(example.url);
  }
  function surprise() {
    if (busy) return;
    const alternatives = examples.filter((example) => example.url !== value);
    const choices = alternatives.length ? alternatives : examples;
    if (choices.length) select(choices[Math.floor(Math.random() * choices.length)]);
  }

  if (!examples.length) return null;

  return <div className="ce-examples" aria-label="Example construction companies">
    <div className="ce-row"><span>Try a company</span><div className="ce-featured">{featured.map((example) => <button key={example.id} type="button" className="ce-chip" aria-pressed={value === example.url} title={`${example.name} · ${example.region}, ${countryName(example.country)}`} disabled={busy} onClick={() => select(example)}>{example.name}</button>)}</div>
      {examples.length > featured.length && <button ref={trigger} type="button" className="ce-more" popoverTarget={id} aria-haspopup="dialog" aria-expanded={open} disabled={busy} onClick={positionPopover}>Show more<ChevronDown size={12} aria-hidden="true" /></button>}
      <button type="button" className="ce-surprise" disabled={busy} onClick={surprise}><Shuffle size={13} aria-hidden="true" />Surprise me</button>
    </div>
    <div ref={popover} id={id} className="ce-popover" popover="auto" role="dialog" aria-labelledby={`${id}-title`} style={position} onToggle={(event) => setOpen(event.newState === "open")}>
      <header><div><h2 id={`${id}-title`}>Choose a construction company</h2><p>Select a website, then start your search.</p></div><button type="button" className="ce-close" popoverTarget={id} popoverTargetAction="hide" aria-label="Close company examples"><X size={17} aria-hidden="true" /></button></header>
      <div className="ce-grid">{examples.map((example) => <button type="button" key={example.id} className="ce-company" aria-pressed={value === example.url} disabled={busy} onClick={() => select(example)}><span className="ce-company-name">{example.name}<ArrowUpRight size={13} aria-hidden="true" /></span><span className="ce-company-region">{example.region}, {countryName(example.country)}</span><span className="ce-company-specialty">{example.specialty}</span></button>)}</div>
    </div>
  </div>;
}
