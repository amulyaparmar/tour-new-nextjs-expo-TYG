"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

import styles from "./session-detail.module.css";

type Props = {
  label: string;
  labelClassName?: string;
  phase?: string | null;
  text: string;
};

export function PlayerActiveCaption({ label, labelClassName, phase, text }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [isOverflowing, setIsOverflowing] = useState(false);
  const textRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    setExpanded(false);
  }, [text]);

  useEffect(() => {
    const element = textRef.current;
    if (!element || expanded) return;

    const measure = () => {
      setIsOverflowing(element.scrollWidth > element.clientWidth + 1);
    };

    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [text, expanded]);

  const canExpand = isOverflowing || expanded;

  const toggle = () => {
    if (!canExpand) return;
    setExpanded((current) => !current);
  };

  return (
    <div
      className={[
        styles.playerActiveMoment,
        canExpand ? styles.playerActiveMomentInteractive : "",
        expanded ? styles.playerActiveMomentExpanded : "",
      ].filter(Boolean).join(" ")}
      onClick={toggle}
      onKeyDown={(event) => {
        if (!canExpand) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          toggle();
        }
      }}
      role={canExpand ? "button" : undefined}
      tabIndex={canExpand ? 0 : undefined}
      aria-expanded={canExpand ? expanded : undefined}
    >
      <div className={styles.playerActiveMomentBody}>
        <div className={styles.playerActiveMomentHeader}>
          <span className={labelClassName ?? styles.playerActiveLabel}>{label}</span>
          {phase ? <span className={styles.playerActivePhase}>{phase}</span> : null}
        </div>
        <span
          ref={textRef}
          className={expanded ? styles.playerActiveTextExpanded : styles.playerActiveTextTruncated}
        >
          {text}
        </span>
      </div>
      {canExpand ? (
        <span className={styles.playerActiveToggle} aria-hidden="true">
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </span>
      ) : null}
    </div>
  );
}
