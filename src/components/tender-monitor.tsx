"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowUpRight, Bell, ChevronDown, Pause } from "lucide-react";
import { isOfficialTenderUrl } from "@/lib/procurement-sources";
import type { TenderMonitorView, TenderResult } from "@/lib/types";
import "./tender-monitor.css";

const STORAGE_KEY = "tender-fit-radar:monitors:v1";
const POLL_MS = 45_000;
type MonitorMap = Record<string, TenderMonitorView>;

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function text(value: unknown, max = 1_000): string { return typeof value === "string" ? value.trim().slice(0, max) : ""; }
function date(value: unknown): string | null {
  const valueText = text(value, 60);
  return valueText && Number.isFinite(Date.parse(valueText)) ? new Date(valueText).toISOString() : null;
}
export function monitorUrl(value: string): string {
  if (!isOfficialTenderUrl(value)) return "";
  const url = new URL(value);
  url.hash = "";
  return url.href;
}

// Keep only the public view shape, including when loading old or damaged browser data.
export function normalizeMonitor(value: unknown): TenderMonitorView | null {
  const item = record(value);
  const token = text(item.token, 2_001);
  const tenderId = text(item.tenderId, 101);
  const tenderTitle = text(item.tenderTitle, 300);
  const tenderUrl = monitorUrl(text(item.tenderUrl, 2_000));
  const endsAt = date(item.endsAt);
  if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token) || token.length > 2_000 || !tenderId || tenderId.length > 100 || !tenderTitle || !tenderUrl || !endsAt || ![6, 24].includes(Number(item.frequencyHours)) || !["active", "paused", "failed"].includes(String(item.status))) return null;
  const changes: TenderMonitorView["changes"] = (Array.isArray(item.changes) ? item.changes : []).slice(0, 50).flatMap((value) => {
    const change = record(value);
    const id = text(change.id, 180);
    const detectedAt = date(change.detectedAt);
    if (!id || !detectedAt) return [];
    return [{ id, title: text(change.title, 180) || "Tender page changed", summary: text(change.summary), detectedAt, url: monitorUrl(text(change.url, 2_000)) || tenderUrl }];
  });
  return { token, tenderId, tenderTitle, tenderUrl, endsAt, frequencyHours: Number(item.frequencyHours), status: item.status as TenderMonitorView["status"], createdAt: date(item.createdAt), lastRunAt: date(item.lastRunAt), nextRunAt: date(item.nextRunAt), lastError: text(item.lastError, 400) || null, webhookConnected: item.webhookConnected === true, changes };
}

export function canMonitorTender(tender: TenderResult): boolean {
  const url = monitorUrl(tender.url);
  const sources = [...tender.sources, tender.authoritySource, ...Object.values(tender.researchFields ?? {}).filter((field) => field?.status === "found").map((field) => field?.source), ...tender.requirements.map((item) => item.tenderSource)];
  return Boolean(url && tender.documentsRead > 0 && sources.some((source) => source && monitorUrl(source.url) === url));
}

export function localMonitorDate(days: number): string {
  const value = new Date();
  value.setDate(value.getDate() + days);
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}
export function monitorEndTime(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value < localMonitorDate(1)) return null;
  // Local end of day must also fit the API's exact 180-day limit.
  const end = new Date(`${value}T23:59:59`);
  if (!Number.isFinite(end.getTime()) || end.getDate() !== Number(value.slice(-2)) || end.getTime() > Date.now() + 180 * 86_400_000) return null;
  return end.toISOString();
}

function safeError(value: unknown, token = ""): string {
  let message = value instanceof Error ? value.message : "The monitor could not be updated. Try again.";
  if (token) message = message.split(token).join("[redacted]");
  return message.replace(/Bearer\s+\S+/gi, "[redacted]").replace(/(?:sk|ctx)_[A-Za-z0-9_-]+/g, "[redacted]").replace(/[A-Za-z0-9_-]{40,}\.[A-Za-z0-9_-]*/g, "[redacted]").replace(/[A-Za-z0-9_-]{100,}/g, "[redacted]").slice(0, 400);
}
async function requestMonitor(path: string, init: RequestInit, fallback: string): Promise<TenderMonitorView> {
  const response = await fetch(path, { ...init, cache: "no-store" });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new Error(text(record(body).error, 400) || fallback);
  const monitor = normalizeMonitor(body);
  if (!monitor) throw new Error("The server returned incomplete monitor details. Refresh status before trying again.");
  return monitor;
}

export function useTenderMonitors(enabled: boolean) {
  const [monitors, setMonitors] = useState<MonitorMap>({});
  const current = useRef<MonitorMap>({});
  const locks = useRef(new Set<string>());
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [ready, setReady] = useState(false);
  const [storageError, setStorageError] = useState("");
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const save = useCallback((next: MonitorMap) => {
    current.current = next;
    if (alive.current) setMonitors(next);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.values(next))); if (alive.current) setStorageError(""); }
    catch { if (alive.current) setStorageError("Browser storage is unavailable. Keep this page open to manage this monitor."); }
  }, []);
  useEffect(() => {
    let next: MonitorMap = {};
    try {
      const stored: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      // Support both an earlier keyed store and the current compact list.
      const values = Array.isArray(stored) ? stored : Object.values(record(stored));
      next = Object.fromEntries(values.flatMap((item) => { const monitor = normalizeMonitor(item); return monitor ? [[monitor.tenderUrl, monitor]] : []; }));
    } catch { /* Ignore corrupt data; never let it replace the research results. */ }
    current.current = next;
    setMonitors(next);
    setReady(true);
  }, []);

  useEffect(() => {
    if (!enabled || !ready) return;
    let disposed = false;
    let running = false;
    let controller: AbortController | null = null;
    async function refresh() {
      if (disposed || running || document.visibilityState !== "visible") return;
      const snapshots = Object.values(current.current).filter((item) => item.status !== "paused" && !locks.current.has(item.tenderUrl));
      if (!snapshots.length) return;
      running = true;
      controller = new AbortController();
      const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(35_000)]);
      await Promise.allSettled(snapshots.map(async (snapshot) => {
        try {
          const monitor = await requestMonitor(`/api/monitors/${encodeURIComponent(snapshot.token)}`, { signal }, "Monitor status could not be loaded.");
          // A pause or a replacement made while this request ran takes precedence.
          if (!disposed && !signal.aborted && current.current[snapshot.tenderUrl] === snapshot && !locks.current.has(snapshot.tenderUrl)) {
            save({ ...current.current, [snapshot.tenderUrl]: monitor });
            setErrors((previous) => ({ ...previous, [snapshot.tenderUrl]: "" }));
          }
        } catch (error) {
          if (!disposed && !controller?.signal.aborted) setErrors((previous) => ({ ...previous, [snapshot.tenderUrl]: signal.aborted ? "Monitor status timed out. The last saved status is shown; checking again shortly." : safeError(error, snapshot.token) }));
        }
      }));
      running = false;
    }
    function visibility() { if (document.visibilityState === "visible") void refresh(); else controller?.abort(); }
    void refresh();
    const timer = window.setInterval(() => { void refresh(); }, POLL_MS);
    document.addEventListener("visibilitychange", visibility);
    return () => { disposed = true; controller?.abort(); window.clearInterval(timer); document.removeEventListener("visibilitychange", visibility); };
  }, [enabled, ready, save]);

  async function mutate(tender: TenderResult, endDate?: string, frequencyHours?: 6 | 24) {
    const url = monitorUrl(tender.url);
    if (!enabled || !ready || !url || locks.current.has(url)) return;
    const existing = current.current[url];
    if (endDate !== undefined && existing && existing.status !== "paused") return;
    locks.current.add(url);
    setPending((previous) => ({ ...previous, [url]: true }));
    setErrors((previous) => ({ ...previous, [url]: "" }));
    try {
      let monitor: TenderMonitorView;
      if (endDate !== undefined) {
        const endsAt = monitorEndTime(endDate);
        if (!canMonitorTender(tender)) throw new Error("Monitoring requires a researched notice with an attached official source.");
        if (!endsAt || (frequencyHours !== 6 && frequencyHours !== 24)) throw new Error("Choose a date from tomorrow to six months from now, and a check frequency.");
        monitor = await requestMonitor("/api/monitors", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tenderId: tender.id, title: tender.title, url, endsAt, frequencyHours }), signal: AbortSignal.timeout(65_000) }, "The monitor could not be created. Check status before trying again.");
      } else {
        if (!existing) return;
        monitor = await requestMonitor(`/api/monitors/${encodeURIComponent(existing.token)}`, { method: "PATCH", signal: AbortSignal.timeout(50_000) }, "The monitor could not be paused.");
      }
      // Persist even if the user selected another tender while the request ran.
      save({ ...current.current, [url]: monitor });
    } catch (error) { if (alive.current) setErrors((previous) => ({ ...previous, [url]: safeError(error, existing?.token) })); }
    finally {
      locks.current.delete(url);
      if (alive.current) setPending((previous) => ({ ...previous, [url]: false }));
    }
  }
  return { monitors, pending, errors, ready, storageError, start: (tender: TenderResult, endDate: string, frequency: 6 | 24) => mutate(tender, endDate, frequency), pause: (tender: TenderResult) => mutate(tender) };
}
type MonitorStore = ReturnType<typeof useTenderMonitors>;
function timeLabel(value: string | null | undefined): string {
  return value && Number.isFinite(Date.parse(value)) ? new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "Pending";
}

export function TenderMonitor({ tender, isDemo, store }: { tender: TenderResult; isDemo: boolean; store: MonitorStore }) {
  const [setupOpen, setSetupOpen] = useState(false);
  const [endDate, setEndDate] = useState(() => localMonitorDate(7));
  const [frequency, setFrequency] = useState<6 | 24>(24);
  const url = monitorUrl(tender.url);
  const monitor = !isDemo ? store.monitors[url] : undefined;
  const busy = Boolean(store.pending[url]);
  const canCreate = !isDemo && store.ready && canMonitorTender(tender);
  const running = monitor && monitor.status !== "paused";
  const error = store.errors[url];
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); void store.start(tender, endDate, frequency); }

  return <section className="tw-monitor" aria-label="Tender change monitoring" aria-busy={busy}>
    <div className="tw-monitor-heading"><h3><Bell size={14} aria-hidden="true" />Notice monitoring</h3>{monitor && <span className="tw-monitor-state" data-status={monitor.status}>{monitor.status === "active" ? "Active" : monitor.status === "paused" ? "Paused" : "Needs attention"}</span>}</div>
    {monitor ? <>
      <p>{monitor.status === "paused" ? "Configured to check" : "Checks"} {monitor.frequencyHours === 6 ? "every 6 hours" : "daily"} until {timeLabel(monitor.endsAt)} (your local time).</p>
      <dl className="tw-monitor-times"><div><dt>Last check</dt><dd>{timeLabel(monitor.lastRunAt)}</dd></div>{running && <div><dt>Next check</dt><dd>{timeLabel(monitor.nextRunAt)}</dd></div>}</dl>
      {running && <p className="tw-monitor-note">{monitor.webhookConnected ? "The monitor pauses after the first scheduled check on or after the end date." : "Without a public webhook, pausing after the end date requires opening this page in a visible tab."}</p>}
      {monitor.lastError && <p className="tw-monitor-error">Latest check issue: {safeError(new Error(monitor.lastError), monitor.token)}</p>}
      <details className="tw-monitor-changes" open={monitor.changes.length > 0}><summary>Detected changes <span className="tw-count">{monitor.changes.length}</span><ChevronDown size={14} aria-hidden="true" /></summary><div>{monitor.changes.length ? monitor.changes.map((change) => <article key={change.id}><time dateTime={change.detectedAt}>{timeLabel(change.detectedAt)}</time><h4>{change.title}</h4><p>{change.summary || "A notice change was detected. Review the source."}</p><a className="tw-source" href={change.url} target="_blank" rel="noopener noreferrer">Review changed source<ArrowUpRight size={12} aria-hidden="true" /></a></article>) : <p>No changes have been detected yet.</p>}</div></details>
      {running && <button type="button" className="tw-button" disabled={busy} onClick={() => { void store.pause(tender); }}><Pause size={13} aria-hidden="true" />{busy ? "Pausing…" : "Pause monitoring"}</button>}
    </> : <p>Check for changes to the deadline, scope, requirements and documents.</p>}
    {!running && <>
      {isDemo ? <p className="tw-monitor-note">Monitoring is available for researched notices after a live scan.</p> : !canCreate ? <p className="tw-monitor-note">{!store.ready ? "Loading saved monitor details…" : "An attached official notice source is required to start monitoring."}</p> : setupOpen ? <form className="tw-monitor-form" onSubmit={submit}>
        <label>Monitor until<input type="date" required min={localMonitorDate(1)} max={localMonitorDate(179)} value={endDate} onChange={(event) => setEndDate(event.target.value)} disabled={busy} /></label>
        <label>Check frequency<select value={frequency} onChange={(event) => setFrequency(event.target.value === "6" ? 6 : 24)} disabled={busy}><option value={24}>Daily</option><option value={6}>Every 6 hours</option></select></label>
        <p className="tw-monitor-note">Scheduled checks use Context.dev credits. Monitor details are saved in this browser.</p>
        <div className="tw-monitor-actions"><button className="tw-button tw-button-dark" type="submit" disabled={busy}>{busy ? "Starting…" : "Start monitoring"}</button><button className="tw-button" type="button" disabled={busy} onClick={() => setSetupOpen(false)}>Cancel</button></div>
      </form> : <button className="tw-button" type="button" onClick={() => setSetupOpen(true)}>{monitor ? "Set up new monitor" : "Choose end date and frequency"}</button>}
    </>}
    {error && <p className="tw-monitor-error" role="alert">{error}</p>}
    {store.storageError && !isDemo && <p className="tw-monitor-error" role="alert">{store.storageError}</p>}
  </section>;
}
