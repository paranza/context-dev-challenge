"use client";

/**
 * Adapted from BoardUI's free AgentThinking component (wave/spin variants).
 * Copyright (c) 2026 Mertcan Dundar Esmergul (BoardUI), MIT.
 * Original: https://github.com/boardui/boardui
 * License: ./LICENSE. Adaptations: local CSS tokens, externally paused motion,
 * live reduced-motion preference, and a compositor-driven phase schedule in
 * place of React state updates on every animation tick.
 */
import type { CSSProperties } from "react";
import { usePrefersReducedMotion } from "@/lib/use-reduced-motion";
import "./boardui.css";

export type AgentThinkingVariant = "wave" | "spin";

const DOTS_GRID = 3;
const DOTS_PERIOD_MS = 1_600;
const DOTS_SEED = [.55, .3, .15, .85, .55, .3, 1, .85, .55];

function dotScalar(variant: AgentThinkingVariant, col: number, row: number) {
  const m = DOTS_GRID - 1;
  if (variant === "wave") return ((col + row) / (2 * m)) * (DOTS_GRID / (DOTS_GRID + 1));
  const center = m / 2;
  return (Math.atan2(row - center, col - center) / (2 * Math.PI) + 1) % 1;
}

export function AgentThinking({ label = "Researching live sources", variant = "wave", paused = false, className = "" }: {
  label?: string;
  variant?: AgentThinkingVariant;
  paused?: boolean;
  className?: string;
}) {
  const reduce = usePrefersReducedMotion();
  const stopped = paused || reduce;

  return <span className={`bui-thinking ${className}`} data-motion={stopped ? "paused" : "running"}>
    <span className="bui-thinking-grid" aria-hidden="true">{DOTS_SEED.map((opacity, index) => {
      const phase = dotScalar(variant, index % DOTS_GRID, Math.floor(index / DOTS_GRID));
      return <span key={index} className="bui-thinking-dot" style={{
        opacity,
        "--bui-dot-delay": `${-(1 - phase) * DOTS_PERIOD_MS}ms`,
        "--bui-dot-period": `${DOTS_PERIOD_MS}ms`,
      } as CSSProperties} />;
    })}</span>
    <span className="bui-thinking-label">{label}</span>
  </span>;
}
