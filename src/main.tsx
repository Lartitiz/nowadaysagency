import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);

// Load analytics after initial render, when browser is idle
const loadAnalytics = () => {
  import("@/lib/sentry").then(({ initSentry }) => initSentry());
  import("@/lib/posthog").then(({ initPostHog }) => initPostHog());
};

if ("requestIdleCallback" in window) {
  requestIdleCallback(loadAnalytics);
} else {
  setTimeout(loadAnalytics, 2000);
}
