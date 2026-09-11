export function hasAnalyticsConsent(): boolean {
  try {
    return typeof window !== "undefined" && localStorage.getItem("cookie_consent") === "accepted";
  } catch {
    return false;
  }
}
