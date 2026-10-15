import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { initClientErrorMonitor } from "@/lib/client-error-monitor";
import { loadSentry } from "@/lib/sentry-lazy";

initClientErrorMonitor();
createRoot(document.getElementById("root")!).render(<App />);

// Sentry (~140 Ko) : chargé APRÈS le premier affichage complet (évènement
// « load » + 3 s, puis moment calme), pour ne plus concurrencer le chargement de la
// page d'accueil. Une erreur survenue avant le charge tout de suite via la
// façade `@/lib/sentry-lazy` (rien n'est perdu).
const loadSentryWhenIdle = () => {
  const run = () => {
    loadSentry().catch((e) => console.warn("Sentry init failed:", e));
  };
  window.setTimeout(() => {
    if ("requestIdleCallback" in window) requestIdleCallback(run, { timeout: 5000 });
    else run();
  }, 3000);
};
if (document.readyState === "complete") loadSentryWhenIdle();
else window.addEventListener("load", loadSentryWhenIdle, { once: true });

// Load analytics after initial render, when browser is idle
const loadAnalytics = async () => {
  try {
    // Sans consentement, initPostHog ne fait rien : inutile de télécharger le SDK.
    // (Si le consentement est donné plus tard, la page Paramètres le charge.)
    const { hasAnalyticsConsent } = await import("@/lib/analytics-consent");
    if (hasAnalyticsConsent()) {
      const { initPostHog } = await import("@/lib/posthog");
      initPostHog();
    }
  } catch (e) {
    console.warn("PostHog init failed:", e);
  }
  try {
    const { initMetaPixel } = await import("@/lib/meta-pixel");
    initMetaPixel();
  } catch (e) {
    console.warn("Meta Pixel init failed:", e);
  }
};

if ("requestIdleCallback" in window) {
  requestIdleCallback(() => loadAnalytics());
} else {
  setTimeout(() => loadAnalytics(), 2000);
}
