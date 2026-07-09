import { useEffect, useState } from "react";

/** Intervalle de polling : 5 minutes. */
const POLL_INTERVAL_MS = 5 * 60 * 1000;
/** Délai minimum entre deux vérifications (focus répétés). */
const MIN_CHECK_GAP_MS = 60 * 1000;

const BUNDLE_RE = /\/assets\/index-[\w-]+\.js/;

/** Chemin du bundle JS actuellement chargé par cet onglet (null en dev). */
function getLoadedBundlePath(): string | null {
  const scripts = document.querySelectorAll<HTMLScriptElement>('script[type="module"][src]');
  for (const script of scripts) {
    const match = script.getAttribute("src")?.match(BUNDLE_RE);
    if (match) return match[0];
  }
  return null;
}

/**
 * Détecte qu'un nouveau bundle a été publié pendant que l'onglet restait ouvert :
 * re-télécharge index.html (cache-buster) et compare le chemin du bundle
 * index-*.js à celui en cours d'exécution. À utiliser une seule fois dans un
 * composant racine ; inactif en dev (pas de bundle hashé).
 */
export function useVersionCheck() {
  const [updateAvailable, setUpdateAvailable] = useState(false);

  useEffect(() => {
    const loadedBundle = getLoadedBundlePath();
    if (!loadedBundle) return;

    let disposed = false;
    let lastCheck = 0;

    const check = async () => {
      const now = Date.now();
      if (now - lastCheck < MIN_CHECK_GAP_MS) return;
      lastCheck = now;
      try {
        const res = await fetch(`/index.html?v=${now}`, { cache: "no-store" });
        if (!res.ok) return;
        const html = await res.text();
        const liveBundle = html.match(BUNDLE_RE)?.[0];
        if (!disposed && liveBundle && liveBundle !== loadedBundle) {
          setUpdateAvailable(true);
        }
      } catch {
        // Hors ligne ou requête avortée : on retentera au prochain tick.
      }
    };

    const intervalId = window.setInterval(check, POLL_INTERVAL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") check();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);

    return () => {
      disposed = true;
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, []);

  return updateAvailable;
}
