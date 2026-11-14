"use client";

import { useEffect, useRef, useState } from "react";
import { usePrefersReducedMotion } from "@/lib/use-reduced-motion";
import { Crosshair, Pause, Play } from "lucide-react";
import { SupplierStudioScene } from "./source-studio";
import { EvidenceTunnelScene } from "./evidence-tunnel";
import "./process-scenes.css";

export function ProcessScenes() {
  const sectionRef = useRef<HTMLElement>(null);
  const [paused, setPaused] = useState(false);
  const [inView, setInView] = useState(true);
  const reduce = usePrefersReducedMotion();
  const motionStopped = paused || reduce || !inView;

  useEffect(() => {
    const section = sectionRef.current;
    if (!section || !("IntersectionObserver" in window)) return;
    const enterObserver = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) setInView(true);
    }, { rootMargin: "80px" });
    const leaveObserver = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) setInView(false);
    }, { rootMargin: "320px" });
    enterObserver.observe(section);
    leaveObserver.observe(section);
    return () => { enterObserver.disconnect(); leaveObserver.disconnect(); };
  }, []);

  return <section ref={sectionRef} className={`ps-section${motionStopped ? " ps-motion-paused" : ""}`} id="how-it-works" aria-labelledby="ps-title">
    <div className="ps-wrap">
      <header className="ps-heading">
        <div><p>How it works</p><h2 id="ps-title">From scattered pages<br />to a clearer next move.</h2></div>
        <button type="button" className="ps-motion-control" onClick={() => setPaused(value => !value)} disabled={reduce} aria-pressed={paused}
          aria-label={reduce ? "Animations reduced by your system preference" : paused ? "Play explanatory animations" : "Pause explanatory animations"}>
          {reduce ? <Crosshair size={15} aria-hidden="true" /> : paused ? <Play size={15} aria-hidden="true" /> : <Pause size={15} aria-hidden="true" />}
          {reduce ? "Static preview" : paused ? "Play animations" : "Pause animations"}
        </button>
      </header>
      <div className="ps-scenes">
        <article className="ps-feature">
          <SupplierStudioScene />
          <div className="ps-caption"><span className="ps-caption-index">01</span><h3>Know the business.</h3><p>Your website, project references and qualifications become a supplier profile with the original evidence attached.</p></div>
        </article>
        <article className="ps-feature">
          <EvidenceTunnelScene paused={motionStopped} />
          <div className="ps-caption"><span className="ps-caption-index">02</span><h3>Understand the opportunity.</h3><p>Read the notice and its documents alongside your capabilities. See where the evidence supports a fit, and what still needs a conversation.</p></div>
        </article>
      </div>
    </div>
  </section>;
}
