"use client";

/**
 * Adapted from BoardUI's free AgentLog LogRow and RowConnector primitives.
 * Copyright (c) 2026 Mertcan Dundar Esmergul (BoardUI), MIT.
 * Original: https://github.com/boardui/boardui
 * License: ./LICENSE. Adaptations: event-driven rows and local CSS; reveals
 * animate only opacity/transform, with position-only FLIP for arriving events.
 */
import { forwardRef, type ReactNode } from "react";
import { motion } from "motion/react";
import "./boardui.css";

export const SOFT_EASE = [.22, 1, .36, 1] as const;
// Match the fixed live-feed row pitch. Every row moves the same distance:
// the outgoing row leaves above while its replacement enters from below.
export const UNIT_INITIAL = { opacity: 0, y: 52 };
export const UNIT_ANIMATE = { opacity: 1, y: 0 };
export const UNIT_TRANSITION = { duration: .36, ease: SOFT_EASE };

const BRANCH_Y = 14;
const BRANCH_RADIUS = 6;
const BRANCH_WIDTH = 12;
const BRANCH_PATH = `M0.5 0 V${BRANCH_Y - BRANCH_RADIUS} Q0.5 ${BRANCH_Y} ${.5 + BRANCH_RADIUS} ${BRANCH_Y} H11.5`;

export function RowConnector({ first, last, reduce }: { first: boolean; last: boolean; reduce: boolean }) {
  return <span className="bui-row-connector" aria-hidden="true">
    <motion.svg width={BRANCH_WIDTH} height={BRANCH_Y + 1} viewBox={`0 0 ${BRANCH_WIDTH} ${BRANCH_Y + 1}`} fill="none"
      className="bui-row-branch" initial={reduce ? false : { opacity: 0, scaleX: .95 }} animate={{ opacity: 1, scaleX: 1 }}
      transition={{ duration: .2, ease: SOFT_EASE, delay: first ? 0 : .08 }}>
      <path d={BRANCH_PATH} stroke="currentColor" strokeWidth="1" />
    </motion.svg>
    {!last && <motion.span className="bui-row-trunk" initial={reduce ? false : { scaleY: 0 }} animate={{ scaleY: 1 }} transition={{ duration: .18, ease: SOFT_EASE }} />}
  </span>;
}

type LogRowProps = {
  first: boolean;
  last: boolean;
  reduce: boolean;
  children: ReactNode;
  className?: string;
};

// The forwarded DOM ref lets AnimatePresence's popLayout remove an outgoing
// row from flow immediately. Remaining rows then glide to their new positions
// instead of jumping after the exit animation finishes.
export const LogRow = forwardRef<HTMLLIElement, LogRowProps>(function LogRow({ first, last, reduce, children, className = "" }, ref) {
  return <motion.li ref={ref} className={`bui-log-row ${className}`} layout={reduce ? false : "position"} initial={reduce ? false : UNIT_INITIAL}
    animate={UNIT_ANIMATE} exit={reduce ? { opacity: 0 } : { opacity: 0, y: -52 }}
    transition={reduce ? { duration: 0 } : { ...UNIT_TRANSITION, layout: UNIT_TRANSITION }}>
    <RowConnector first={first} last={last} reduce={reduce} />{children}
  </motion.li>;
});
