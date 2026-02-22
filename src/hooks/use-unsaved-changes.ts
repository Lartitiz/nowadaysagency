import { useEffect, useCallback } from "react";
import { useBlocker } from "react-router-dom";

export function useUnsavedChanges(hasChanges: boolean) {
  // Browser beforeunload
  useEffect(() => {
    if (!hasChanges) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [hasChanges]);

  // React Router navigation blocking
  const blocker = useBlocker(
    useCallback(
      ({ currentLocation, nextLocation }: { currentLocation: { pathname: string }; nextLocation: { pathname: string } }) =>
        hasChanges && currentLocation.pathname !== nextLocation.pathname,
      [hasChanges]
    )
  );

  return blocker;
}
