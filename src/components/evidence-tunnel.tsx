"use client";

import { useEffect, useId, useRef } from "react";
import { usePrefersReducedMotion } from "@/lib/use-reduced-motion";
import { Check, CircleHelp, FileText, Globe2, Radar, Search } from "lucide-react";
import "./evidence-tunnel.css";

const WIDTH = 724;
const HEIGHT = 360;
const CENTER_X = WIDTH / 2;
const CENTER_Y = HEIGHT / 2;
const START_X = -196;
const END_X = WIDTH + 196;
const SPAN = END_X - START_X;

type TileKind = "WEB" | "PDF" | "HILMA" | "TED";
type Actor = { x: number; lane: number; tilt: number; seed: number; kind: TileKind; unknown: boolean };

type DocumentContent = { criterion: string; ask: string; proof: string; proofLabel: string; source: string };
const CONTENT: DocumentContent[] = [
  { criterion: "Experience", ask: "≥ €1.5M", proof: "€2.4M", proofLabel: "School project", source: "school-reference" },
  { criterion: "Site team", ask: "Uusimaa", proof: "Uusimaa", proofLabel: "Team listed", source: "school-region" },
  { criterion: "Insurance", ask: "≥ €2M", proof: "Not public", proofLabel: "Insurance", source: "sports-insurance" },
  { criterion: "Quality", ask: "ISO 9001", proof: "ISO 9001", proofLabel: "Certificate", source: "school-quality" },
  { criterion: "Dust control", ask: "Required", proof: "Published", proofLabel: "Safety plan", source: "school-occupied" },
  { criterion: "Savings check", ask: "12 months", proof: "Not public", proofLabel: "Savings check", source: "library-savings" },
  { criterion: "Roof project", ask: "≥ €500k", proof: "€860k", proofLabel: "Roof reference", source: "roof-reference" },
  { criterion: "Environment", ask: "ISO 14001", proof: "ISO 14001", proofLabel: "Certificate", source: "library-environment" },
  { criterion: "Floor installer", ask: "Approved", proof: "Not public", proofLabel: "Approval", source: "sports-floor" },
  { criterion: "Waste records", ask: "Required", proof: "Published", proofLabel: "Waste policy", source: "roof-waste" },
];

const LANES = [-.75, .52, -.26, .9, -.95, .3, -.5, .72, -.08, -.68];
const KINDS: TileKind[] = ["WEB", "PDF", "HILMA", "TED", "PDF", "WEB", "TED", "PDF", "HILMA", "WEB"];
const INITIAL: Actor[] = KINDS.map((kind, index) => ({
  x: START_X + (index + .35) * SPAN / KINDS.length,
  lane: LANES[index],
  tilt: [-14, 11, -8, 16, -11, 7, -17, 13, -6, 9][index],
  seed: index * 1.71,
  kind,
  unknown: index === 2 || index === 5 || index === 8,
}));

function field(x: number) {
  const distance = (x - CENTER_X) / 142;
  return Math.exp(-distance * distance);
}
function velocity(x: number) { return 50 + 370 * field(x); }
function smoothstep(low: number, high: number, value: number) {
  const t = Math.max(0, Math.min(1, (value - low) / (high - low)));
  return t * t * (3 - 2 * t);
}
function pose(actor: Actor, time: number) {
  const force = field(actor.x);
  const spread = 1 - .87 * force;
  const y = CENTER_Y + actor.lane * 84 * spread + Math.sin(time * .85 + actor.seed) * 2 * (1 - force);
  const tangent = actor.lane * 84 * .87 * force * 2 * (actor.x - CENTER_X) / (142 * 142);
  const roll = actor.tilt * (1 - force * .94) + Math.atan(tangent) * 180 / Math.PI * .38 + Math.sin(time * .5 + actor.seed) * 1.4;
  const yaw = (actor.x - CENTER_X) / (SPAN / 2) * 9;
  const scale = .96 - .28 * force + .035 * Math.sin(actor.seed);
  return {
    transform: `translate3d(${(actor.x - 42).toFixed(3)}px,${(y - 46).toFixed(3)}px,0) rotate(${roll.toFixed(3)}deg) rotateY(${yaw.toFixed(3)}deg) scale(${scale.toFixed(4)})`,
    badge: smoothstep(CENTER_X + 35, CENTER_X + 90, actor.x),
    face: smoothstep(CENTER_X - 20, CENTER_X + 20, actor.x),
  };
}

function SourceIcon({ kind }: { kind: TileKind }) {
  if (kind === "WEB") return <Globe2 size={31} strokeWidth={1.5} />;
  if (kind === "PDF") return <FileText size={31} strokeWidth={1.5} />;
  if (kind === "HILMA") return <Search size={29} strokeWidth={1.6} />;
  return <FileText size={29} strokeWidth={1.6} />;
}

/** An original illustrative evidence lens. Tiles are persistent DOM objects;
 * all per-frame work is transform/opacity writes in a shared, time-based field. */
export function EvidenceTunnelScene({ paused = false }: { paused?: boolean }) {
  const reduce = usePrefersReducedMotion();
  const id = useId().replace(/:/g, "");
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const nodes = useRef<(HTMLDivElement | null)[]>([]);
  const badges = useRef<(HTMLSpanElement | null)[]>([]);
  const askFaces = useRef<(HTMLSpanElement | null)[]>([]);
  const proofFaces = useRef<(HTMLSpanElement | null)[]>([]);
  const faceOpacity = useRef<number[]>(INITIAL.map(actor => pose(actor, 0).face));
  const actors = useRef<Actor[]>(INITIAL.map(actor => ({ ...actor })));
  const simulationTime = useRef(0);

  useEffect(() => {
    const stage = stageRef.current;
    const canvas = canvasRef.current;
    if (!stage || !canvas) return;
    const resize = () => {
      const scale = Math.min(stage.clientWidth / WIDTH, 1.1);
      canvas.style.setProperty("--et-scale", String(scale));
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (paused || reduce || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let frame: number | null = null;
    let previous: number | null = null;
    let disposed = false;
    const tick = (now: number) => {
      frame = null;
      if (disposed || document.hidden) { previous = null; return; }
      const dt = previous === null ? 0 : Math.min(32, Math.max(0, now - previous)) / 1000;
      previous = now;
      simulationTime.current += dt;
      actors.current.forEach((actor, index) => {
        // Midpoint integration keeps the center acceleration smooth even when
        // frame cadence changes. Recycling occurs well outside the clipped art.
        const midpoint = actor.x + velocity(actor.x) * dt / 2;
        actor.x += velocity(midpoint) * dt;
        if (actor.x > END_X) actor.x = START_X + (actor.x - END_X) % SPAN;
        const next = pose(actor, simulationTime.current);
        const node = nodes.current[index];
        if (node) node.style.transform = next.transform;
        const badge = badges.current[index];
        if (badge) badge.style.opacity = String(next.badge);
        if (faceOpacity.current[index] !== next.face) {
          const ask = askFaces.current[index];
          const proof = proofFaces.current[index];
          if (ask) ask.style.opacity = String(1 - next.face);
          if (proof) proof.style.opacity = String(next.face);
          faceOpacity.current[index] = next.face;
        }
      });
      frame = requestAnimationFrame(tick);
    };
    const visibility = () => {
      previous = null;
      if (document.hidden) {
        if (frame !== null) cancelAnimationFrame(frame);
        frame = null;
      } else if (!disposed && frame === null) frame = requestAnimationFrame(tick);
    };
    document.addEventListener("visibilitychange", visibility);
    if (!document.hidden) frame = requestAnimationFrame(tick);
    return () => {
      disposed = true;
      if (frame !== null) cancelAnimationFrame(frame);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [paused, reduce]);

  return <div ref={stageRef} className="ps-stage et-scene" aria-hidden="true" data-paused={paused || reduce}>
    <div ref={canvasRef} className="et-canvas">
      <svg className="et-corridor" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} fill="none">
        <defs>
          <linearGradient id={`${id}-light`} x1="0" y1="180" x2="724" y2="180" gradientUnits="userSpaceOnUse"><stop stopColor="#fff1e9" /><stop offset=".27" stopColor="#d9e9ff" /><stop offset=".51" stopColor="#b8d9f5" /><stop offset=".75" stopColor="#ffd9bb" /><stop offset="1" stopColor="#fff8f1" /></linearGradient>
          <linearGradient id={`${id}-roof`} x1="362" y1="0" x2="362" y2="128" gradientUnits="userSpaceOnUse"><stop stopColor="#263147" /><stop offset="1" stopColor="#465575" /></linearGradient>
          <linearGradient id={`${id}-floor`} x1="362" y1="230" x2="362" y2="360" gradientUnits="userSpaceOnUse"><stop stopColor="#344662" /><stop offset="1" stopColor="#202c42" /></linearGradient>
          <linearGradient id={`${id}-rim`} x1="0" y1="150" x2="724" y2="190" gradientUnits="userSpaceOnUse"><stop stopColor="#f6be97" /><stop offset=".5" stopColor="#e1efff" /><stop offset="1" stopColor="#f39b6d" /></linearGradient>
        </defs>
        <path d="M-24 18C112 20 136 88 264 112C318 123 406 123 460 112C588 88 612 20 748 18V342C612 340 588 272 460 248C406 237 318 237 264 248C136 272 112 340-24 342V18Z" fill={`url(#${id}-light)`} />
        <path d="M0 0H724V22C602 30 574 93 458 116C404 127 320 127 266 116C150 93 122 30 0 22V0Z" fill={`url(#${id}-roof)`} />
        <path d="M0 360H724V338C602 330 574 267 458 244C404 233 320 233 266 244C150 267 122 330 0 338V360Z" fill={`url(#${id}-floor)`} />
        <path d="M-8 22C122 30 150 93 266 116C320 127 404 127 458 116C574 93 602 30 732 22" stroke={`url(#${id}-rim)`} strokeWidth="4" strokeOpacity=".7" />
        <path d="M-8 338C122 330 150 267 266 244C320 233 404 233 458 244C574 267 602 330 732 338" stroke={`url(#${id}-rim)`} strokeWidth="4" strokeOpacity=".6" />
        <path d="M0 12C128 22 151 78 272 103C325 114 399 114 452 103C573 78 596 22 724 12" stroke="white" strokeOpacity=".09" />
        <path d="M0 349C128 339 151 283 272 258C325 247 399 247 452 258C573 283 596 339 724 349" stroke="white" strokeOpacity=".08" />
      </svg>
      <div className="et-lens-shadow" />
      <div className="et-actors">{INITIAL.map((actor, index) => {
        const initial = pose(actor, 0);
        const content = CONTENT[index];
        return <div key={index} ref={node => { nodes.current[index] = node; }} className={`et-tile et-kind-${actor.kind.toLowerCase()}`} style={{ transform: initial.transform }}>
          <span className="et-tile-fold" />
          <span ref={node => { askFaces.current[index] = node; }} className="et-tile-face et-face-ask" data-example={content.source} style={{ opacity: 1 - initial.face }}><span className="et-tile-icon"><SourceIcon kind={actor.kind} /></span><strong className={content.ask.length >= 7 ? "et-value-long" : ""}>{content.ask}</strong><span className="et-criterion-label">{content.criterion}</span></span>
          <span ref={node => { proofFaces.current[index] = node; }} className="et-tile-face et-face-proof" data-example={content.source} style={{ opacity: initial.face }}><span className="et-tile-icon"><SourceIcon kind={actor.kind} /></span><strong className={content.proof.length >= 7 ? "et-value-long" : ""}>{content.proof}</strong><span className="et-criterion-label">{content.proofLabel}</span></span>
          <span className="et-tile-baseline" />
          <span ref={node => { badges.current[index] = node; }} className={`et-outcome${actor.unknown ? " et-outcome-unknown" : ""}`} style={{ opacity: initial.badge }}>{actor.unknown ? <CircleHelp size={17} strokeWidth={2} /> : <Check size={17} strokeWidth={2.4} />}</span>
        </div>;
      })}</div>
      <div className="et-lens"><span className="et-lens-outer" /><span className="et-lens-rim" /><span className="et-lens-glass" /><span className="et-medallion"><Radar size={50} strokeWidth={1.35} /></span><span className="et-lens-glint" /></div>
      <div className="et-foreground-top" /><div className="et-foreground-bottom" />
    </div>
    <span className="et-scene-heading">Example · Tender asks <span>→</span> Supplier evidence</span>
    <span className="et-scene-key"><span><Check size={12} />Evidence found</span><span><CircleHelp size={12} />Confirm with supplier</span></span>
  </div>;
}
