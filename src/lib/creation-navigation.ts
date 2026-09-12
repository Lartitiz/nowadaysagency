/** Only consume the fresh-start flag. The chosen channel is still needed later. */
export function consumeFreshStart(params: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams(params);
  next.delete("new");
  return next;
}

/** A brand review may only return to our creation flow, never an external URL. */
export function creationReturnPath(value: string | null | undefined): string | null {
  if (!value || !/^\/creer(?:\?|$)/.test(value) || /[\\\r\n]/.test(value)) return null;
  try {
    const url = new URL(value, "https://creation.local");
    return url.origin === "https://creation.local" && url.pathname === "/creer"
      ? url.pathname + url.search : null;
  } catch { return null; }
}
