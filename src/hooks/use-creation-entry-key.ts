import { useRef } from "react";

/** Remount a restored editor for a fresh-start navigation, keeping that identity
 * when the editor consumes ?new=1. Ordinary URL cleanup must not reset work. */
export function useCreationEntryKey(search: string, navigationKey: string, navigationType?: string, hasState = false): string {
  const entry = useRef("initial");
  const params = new URLSearchParams(search);
  const hasIntent = hasState || ["sujet", "subject", "format", "canal", "auto", "idea_id"].some(key => params.has(key));
  // A new in-app request must run the same conflict gate as a full page load.
  // REPLACE is also used to consume startup params; it must not remount work.
  if (params.get("new") === "1" || (navigationType === "PUSH" && hasIntent)) entry.current = navigationKey;
  return entry.current;
}
