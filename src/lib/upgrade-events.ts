import { posthog } from "@/lib/posthog";
import { hasAnalyticsConsent } from "@/lib/analytics-consent";

// Explicit allow-list: never collect briefs, account identifiers, session ids or URLs.
export function trackUpgrade(event: "limit_encountered" | "invitation_shown" | "invitation_clicked" | "checkout_opened" | "purchase_confirmed" | "creation_resumed", props: { surface?: string; reason?: string; plan?: string; kind?: string } = {}) {
  if (!hasAnalyticsConsent()) return;
  const safe = { surface: props.surface, reason: props.reason, plan: props.plan, kind: props.kind };
  const key = `upgrade_event:${event}:${JSON.stringify(safe)}`;
  try {
    if (["limit_encountered", "invitation_shown", "purchase_confirmed"].includes(event)) {
      const previous = Number(sessionStorage.getItem(key) || 0);
      if (Date.now() - previous < 60_000) return;
      sessionStorage.setItem(key, String(Date.now()));
    }
  } catch { /* Analytics must never block an action. */ }
  posthog.capture(`upgrade_${event}`, safe);
}
