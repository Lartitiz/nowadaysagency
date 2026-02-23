import { useState, useEffect, useMemo, useCallback, useRef } from "react";

const TOOLTIPS_KEY = "nowadays_tooltips_seen";

// Global singleton to ensure only 1 tooltip visible at a time
let globalDismiss: (() => void) | null = null;

function getSeenTooltips(): string[] {
  try {
    const data = localStorage.getItem(TOOLTIPS_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

function markTooltipSeen(id: string) {
  const seen = getSeenTooltips();
  if (!seen.includes(id)) {
    seen.push(id);
    localStorage.setItem(TOOLTIPS_KEY, JSON.stringify(seen));
  }
}

export function useFirstTimeTooltip(tooltipId: string) {
  const [show, setShow] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const alreadySeen = useMemo(() => getSeenTooltips().includes(tooltipId), [tooltipId]);

  const handleDismiss = useCallback(() => {
    setShow(false);
    setDismissed(true);
    markTooltipSeen(tooltipId);
    if (globalDismiss === handleDismiss) globalDismiss = null;
    if (timerRef.current) clearTimeout(timerRef.current);
  }, [tooltipId]);

  const handleMouseEnter = useCallback(() => {
    if (alreadySeen || dismissed) return;
    // Dismiss any other active tooltip
    if (globalDismiss && globalDismiss !== handleDismiss) {
      globalDismiss();
    }
    globalDismiss = handleDismiss;
    setShow(true);
  }, [alreadySeen, dismissed, handleDismiss]);

  // Auto-dismiss after 5s
  useEffect(() => {
    if (show) {
      timerRef.current = setTimeout(handleDismiss, 5000);
      return () => { if (timerRef.current) clearTimeout(timerRef.current); };
    }
  }, [show, handleDismiss]);

  // Dismiss on scroll
  useEffect(() => {
    if (!show) return;
    const onScroll = () => handleDismiss();
    window.addEventListener("scroll", onScroll, { passive: true, capture: true });
    return () => window.removeEventListener("scroll", onScroll, true);
  }, [show, handleDismiss]);

  return { show: show && !alreadySeen, handleMouseEnter, handleDismiss, alreadySeen };
}
