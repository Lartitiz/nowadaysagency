// Pixel Meta (Facebook/Instagram Ads) — même logique de consentement que PostHog
// (src/lib/posthog.ts) : gardé par la clé localStorage "cookie_consent", posée
// depuis Paramètres > Cookies et traceurs (SettingsPage.tsx).
type FbqFn = {
  (...args: unknown[]): void;
  callMethod?: (...args: unknown[]) => void;
  queue?: unknown[][];
  loaded?: boolean;
  version?: string;
  push?: FbqFn;
};

declare global {
  interface Window {
    fbq?: FbqFn;
    _fbq?: FbqFn;
  }
}

let pixelLoaded = false;
let trackingEnabled = false;

function loadPixelScript(pixelId: string) {
  if (pixelLoaded) return;
  pixelLoaded = true;

  const fbq: FbqFn = (...args: unknown[]) => {
    if (fbq.callMethod) {
      fbq.callMethod(...args);
    } else {
      fbq.queue!.push(args);
    }
  };
  fbq.push = fbq;
  fbq.loaded = true;
  fbq.version = "2.0";
  fbq.queue = [];
  window.fbq = fbq;
  window._fbq = fbq;

  const script = document.createElement("script");
  script.async = true;
  script.src = "https://connect.facebook.net/en_US/fbevents.js";
  document.head.appendChild(script);

  fbq("init", pixelId);
}

function getPixelId(): string | undefined {
  return import.meta.env.VITE_META_PIXEL_ID;
}

// Appelé au chargement de l'app : ne démarre le pixel que si le consentement
// a déjà été donné une session précédente.
export function initMetaPixel() {
  if (typeof window === "undefined") return;
  const pixelId = getPixelId();
  if (!pixelId) return;
  if (localStorage.getItem("cookie_consent") !== "accepted") return;
  trackingEnabled = true;
  loadPixelScript(pixelId);
  window.fbq?.("track", "PageView");
}

// Appelé quand la personne accepte les cookies depuis Paramètres.
export function enableMetaPixel() {
  const pixelId = getPixelId();
  if (!pixelId) return;
  trackingEnabled = true;
  loadPixelScript(pixelId);
  window.fbq?.("track", "PageView");
}

// Appelé quand la personne révoque son consentement. Le pixel n'a pas d'API
// d'opt-out une fois chargé : on arrête simplement d'envoyer de nouveaux
// évènements depuis notre code.
export function disableMetaPixel() {
  trackingEnabled = false;
}

export function trackMetaEvent(eventName: string, params?: Record<string, unknown>) {
  if (!trackingEnabled || !window.fbq) return;
  window.fbq("track", eventName, params);
}
