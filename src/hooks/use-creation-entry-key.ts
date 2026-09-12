import { useRef } from "react";

/** Remount a restored editor for a fresh-start navigation, keeping that identity
 * when the editor consumes ?new=1. Ordinary URL cleanup must not reset work. */
export function useCreationEntryKey(search: string, navigationKey: string): string {
  const entry = useRef("initial");
  if (new URLSearchParams(search).get("new") === "1") entry.current = navigationKey;
  return entry.current;
}
