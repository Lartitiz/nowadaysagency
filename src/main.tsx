import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);

// Load analytics after initial render, when browser is idle
const loadAnalytics = async () => {
  try {
    const { initSentry } = await import("@/lib/sentry");
    initSentry();
  } catch (e) {
    console.warn("Sentry init failed:", e);
  }
  try {
    const { initPostHog } = await import("@/lib/posthog");
    initPostHog();
  } catch (e) {
    console.warn("PostHog init failed:", e);
  }
};

if ("requestIdleCallback" in window) {
  requestIdleCallback(() => loadAnalytics());
} else {
  setTimeout(() => loadAnalytics(), 2000);
}
