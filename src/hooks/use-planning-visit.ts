import { useEffect, useRef } from "react";

/** Each keyed planning screen owns its async results, including A → B → A. */
export function usePlanningVisit() {
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  return active;
}
