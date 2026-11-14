"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { usePrefersReducedMotion } from "@/lib/use-reduced-motion";
import { ArrowUpRight, Check, CircleDot, FileCheck2, FileText, Globe2, Pause, Play, Radar } from "lucide-react";
import { AgentThinking } from "@/components/boardui/agent-thinking";
import { LogRow, SOFT_EASE } from "@/components/boardui/agent-log";
import type { ResearchProgress, ResearchStage } from "@/lib/research-progress";
import "./research-activity.css";

const STAGES: { id: ResearchStage; label: string }[] = [
  { id: "supplier", label: "Supplier context" },
  { id: "discovery", label: "Find opportunities" },
  { id: "analysis", label: "Read requirements" },
];
const SCOPE_TOPICS = ["project references", "supplier capabilities", "certifications", "submission deadlines", "qualification requirements"];
const FEED_ROWS = 3;

function sourceUrl(value: string) {
  try {
    const parsed = new URL(value);
    return ["http:", "https:"].includes(parsed.protocol) ? parsed : null;
  } catch { return null; }
}

function companyDomain(value: string) {
  return sourceUrl(value)?.hostname.replace(/^www\./, "") || value || "your company";
}

// The clock has its own render boundary: a time tick must not cause Motion to
// remeasure the live log, or re-render any of the decorative source flow.
function ResearchElapsed({ startedAt }: { startedAt: number }) {
  const [elapsed, setElapsed] = useState(() => Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
  useEffect(() => {
    const update = () => setElapsed(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
    update();
    const interval = window.setInterval(update, 1000);
    return () => window.clearInterval(interval);
  }, [startedAt]);
  return <time className="ra-elapsed" dateTime={`PT${elapsed}S`} aria-label={`Research elapsed time: ${Math.floor(elapsed / 60)} minutes, ${elapsed % 60} seconds`}>{Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")}</time>;
}

function ResearchWaiting({ startedAt }: { startedAt: number }) {
  const [takingLonger, setTakingLonger] = useState(() => Date.now() - startedAt >= 120_000);
  useEffect(() => {
    const remaining = Math.max(0, 120_000 - (Date.now() - startedAt));
    setTakingLonger(remaining === 0);
    const timeout = window.setTimeout(() => setTakingLonger(true), remaining);
    return () => window.clearTimeout(timeout);
  }, [startedAt]);
  return <p className="ra-waiting-copy">{takingLonger ? "Still working. Large supplier sites and tender PDFs can take a few minutes." : "Reading the public web. Your shortlist will appear when this scan finishes."}</p>;
}

function ResearchScope({ stopped }: { stopped: boolean }) {
  const [topic, setTopic] = useState(0);
  useEffect(() => {
    if (stopped) return;
    const interval = window.setInterval(() => setTopic((current) => (current + 1) % SCOPE_TOPICS.length), 4_200);
    return () => window.clearInterval(interval);
  }, [stopped]);
  return <span className="ra-scope-topic"><AnimatePresence initial={false}><motion.span key={topic} initial={stopped ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: stopped ? 0 : .3, ease: SOFT_EASE }}>{SCOPE_TOPICS[topic]}</motion.span></AnimatePresence></span>;
}

export function ResearchActivity({ startedAt, companyUrl, events }: {
  startedAt: number;
  companyUrl: string;
  events: ResearchProgress[];
}) {
  const [paused, setPaused] = useState(false);
  const [quiet, setQuiet] = useState(events.length === 0);
  const [heldFeedStart, setHeldFeedStart] = useState<number | null>(null);
  const reduce = usePrefersReducedMotion();
  const motionStopped = paused || reduce;

  useEffect(() => {
    setQuiet(events.length === 0);
    const timeout = window.setTimeout(() => setQuiet(true), 8_000);
    return () => window.clearTimeout(timeout);
  }, [events, startedAt]);

  const stageState = useMemo(() => {
    const state: Record<ResearchStage, "waiting" | "active" | "complete"> = { supplier: "waiting", discovery: "waiting", analysis: "waiting" };
    events.forEach((event) => { if (event.status === "active" || event.status === "complete") state[event.stage] = event.status; });
    return state;
  }, [events]);
  const firstVisibleIndex = heldFeedStart ?? Math.max(0, events.length - FEED_ROWS);
  const visibleEvents = events.slice(firstVisibleIndex, firstVisibleIndex + FEED_ROWS);
  const domain = companyDomain(companyUrl);

  return <section className={`ra-panel${motionStopped ? " ra-motion-paused" : ""}`} aria-label="Live opportunity research">
    <header className="ra-header"><div className="ra-header-copy"><div className="ra-running-status" role="status"><AgentThinking label="Researching live sources" variant="wave" paused={motionStopped} /></div><p>Finding the context behind <strong>{domain}</strong></p></div><div className="ra-controls"><ResearchElapsed startedAt={startedAt} /><button className="ra-pause" type="button" onClick={() => setPaused((value) => !value)} disabled={reduce} aria-pressed={paused} aria-label={reduce ? "Animations reduced by your system preference" : paused ? "Resume animations" : "Pause animations"} title={reduce ? "Animations follow your reduced-motion system preference. Research continues." : paused ? "Resume animations. Research continues either way." : "Pause animations only. Research will continue."}>{paused ? <Play size={14} aria-hidden="true" /> : <Pause size={14} aria-hidden="true" />}</button></div></header>

    <div className="ra-research-visual" aria-hidden="true"><div className="ra-visual-end"><span className="ra-paper-stack ra-source-stack"><span /><span /><Globe2 size={21} strokeWidth={1.5} /></span><span>Your website</span></div><span className="ra-flow-lane"><span className="ra-flight"><span className="ra-traveller"><FileText size={13} /></span></span><span className="ra-flight ra-flight-second"><span className="ra-traveller"><FileText size={13} /></span></span></span><div className="ra-visual-radar"><span className="ra-radar-halo" /><span className="ra-radar-center"><Radar size={29} strokeWidth={1.35} /></span><span>Radar</span></div><span className="ra-flow-lane ra-flow-output"><span className="ra-flight"><span className="ra-traveller"><FileText size={13} /></span></span><span className="ra-flight ra-flight-second"><span className="ra-traveller"><FileText size={13} /></span></span></span><div className="ra-visual-end"><span className="ra-paper-stack ra-evidence-stack"><span /><span /><FileCheck2 size={21} strokeWidth={1.5} /></span><span>The evidence</span></div></div>

    <div className="ra-stages" aria-label={events.length ? "Actual research stages" : "Research scope; stage updates are not yet available"}>{STAGES.map((stage) => <div key={stage.id} className={`ra-stage ra-stage-${stageState[stage.id]}`}><span className="ra-stage-icon" aria-hidden="true">{stageState[stage.id] === "complete" ? <Check size={13} /> : stageState[stage.id] === "active" ? <CircleDot size={13} /> : <span />}</span><span>{stage.label}<span className="ra-sr-only">: {stageState[stage.id] === "waiting" ? "not yet reported" : stageState[stage.id]}</span></span></div>)}</div>

    {visibleEvents.length > 0 ? <ol className="ra-event-feed" role="log" aria-label="Live research updates" aria-live="polite" aria-relevant="additions text" onFocusCapture={() => setHeldFeedStart(firstVisibleIndex)} onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setHeldFeedStart(null); }}><AnimatePresence initial={false} mode="popLayout">{visibleEvents.map((event, index) => {
      const source = event.source ? sourceUrl(event.source.url) : null;
      return <LogRow key={`${startedAt}-${firstVisibleIndex + index}`} first={index === 0} last={index === visibleEvents.length - 1} reduce={motionStopped} className="ra-event-row"><div className="ra-event-content" data-source={Boolean(source)}><span className={`ra-event-mark ra-event-${event.status}`} aria-hidden="true">{event.status === "complete" ? <Check size={12} /> : event.status === "active" ? <CircleDot size={12} /> : <FileText size={12} />}</span><div><p title={event.message}>{event.message}</p>{source && <a href={source.href} target="_blank" rel="noopener noreferrer" title={event.source?.label}>{source.hostname.replace(/^www\./, "")}<ArrowUpRight size={11} aria-hidden="true" /></a>}</div></div></LogRow>;
    })}</AnimatePresence></ol> : <ResearchWaiting startedAt={startedAt} />}

    <div className="ra-log-access">{events.length > 0 && <details className="ra-full-log"><summary>Full research log<span>{events.length}</span></summary><ol>{events.map((event, index) => {
      const source = event.source ? sourceUrl(event.source.url) : null;
      return <li key={`${startedAt}-history-${index}`}><p>{event.message}</p>{source && <a href={source.href} target="_blank" rel="noopener noreferrer">{event.source?.label || source.hostname}<ArrowUpRight size={11} aria-hidden="true" /></a>}</li>;
    })}</ol></details>}</div>

    <footer className="ra-footer"><span>{quiet ? "Research scope includes" : "Each finding stays connected to its source"}</span>{quiet && <ResearchScope stopped={motionStopped} />}{paused && <span className="ra-paused-note">Animation paused; research continues.</span>}</footer>
  </section>;
}
