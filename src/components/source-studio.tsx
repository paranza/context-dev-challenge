"use client";

import { BadgeCheck, Building2, Check, FileText, Globe2, MapPin } from "lucide-react";
import "./source-studio.css";

const SOURCES = [
  { label: "Company website", Icon: Globe2, period: "2.2s", phase: "-.4s" },
  { label: "Project references", Icon: Building2, period: "2.8s", phase: "-1.1s" },
  { label: "Quality certificates", Icon: BadgeCheck, period: "3.4s", phase: "-1.8s" },
  { label: "Service regions", Icon: MapPin, period: "2.6s", phase: "-.8s" },
];

function SourceGroup() {
  return <div className="ss-source-group">{SOURCES.map(({ label, Icon, period, phase }) => <div className="ss-source-capsule" key={label}><span className="ss-capsule-ring" style={{ animationDuration: period, animationDelay: phase }} /><Icon size={23} strokeWidth={1.6} /><span>{label}</span><span className="ss-capsule-tail" /></div>)}</div>;
}

function BackgroundPaper({ side }: { side: "left" | "right" }) {
  return <div className={`ss-background-paper ss-background-paper-${side}`}><span className="ss-background-icon">{side === "left" ? <Globe2 size={34} strokeWidth={1.2} /> : <BadgeCheck size={36} strokeWidth={1.2} />}</span><span className="ss-paper-rule" /><span className="ss-paper-rule" /><span className="ss-paper-rule ss-rule-short" /><span className="ss-background-seal"><Check size={17} /></span></div>;
}

/** Original supplier-source illustration. The conveyor repeats its complete
 * group twice, including identical trailing spacing, so its -50% seam aligns.
 * The foreground information never disappears or changes position. */
export function SupplierStudioScene() {
  return <div className="ps-stage ss-scene" aria-hidden="true"><span className="ss-atmosphere" /><span className="ss-survey-corner ss-corner-left" /><span className="ss-survey-corner ss-corner-right" /><span className="ss-scene-label">Supplier context</span><div className="ss-source-window"><div className="ss-source-conveyor"><SourceGroup /><SourceGroup /></div></div><BackgroundPaper side="left" /><BackgroundPaper side="right" /><div className="ss-profile-stack"><span className="ss-profile-under ss-profile-under-back" /><span className="ss-profile-under ss-profile-under-middle" /><div className="ss-profile-face"><header className="ss-profile-heading"><span className="ss-profile-mark"><Building2 size={24} strokeWidth={1.5} /></span><div><strong>Northline</strong><span>Construction · example supplier</span></div></header><div className="ss-profile-facts"><div className="ss-profile-fact"><span>Services</span><strong>Renovation & roofing</strong></div><div className="ss-profile-fact"><span>References</span><strong>3 completed projects</strong></div></div><div className="ss-profile-tags"><span>Uusimaa</span><span>ISO 9001</span><span>32 employees</span></div><div className="ss-profile-footnote"><FileText size={14} />Public pages behind every finding.</div></div><span className="ss-source-stamp"><Check size={15} strokeWidth={2.5} />Sources attached</span></div></div>;
}
