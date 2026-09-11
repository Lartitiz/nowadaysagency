import { supabase } from "@/integrations/supabase/client";

type ErrorKind = "render" | "runtime" | "promise" | "operation";
const routes = new Set(["creer", "calendrier", "dashboard", "onboarding", "parametres", "idees", "photos"]);
const seen = new Set<string>();
let installed = false;

export async function reportClientError(kind: ErrorKind, filename?: string) {
  if (!import.meta.env.PROD || typeof window === "undefined") return;
  const first = window.location.pathname.split("/")[1];
  const route = routes.has(first) ? first : "other";
  const candidate = filename?.split("/").pop()?.split("?")[0];
  const asset = candidate && /^[A-Za-z0-9_-]{1,120}\.js$/.test(candidate) ? candidate : null;
  const key = `${kind}:${route}:${asset}`;
  if (seen.has(key) || seen.size >= 20) return;
  seen.add(key);
  try {
    const { data } = await supabase.auth.getSession();
    if (!data.session) { seen.delete(key); return; }
    // Le schéma serveur valide des catégories fermées ; aucun message brut envoyé.
    const { error } = await supabase.rpc("report_client_error", {
      p_kind: kind, p_route: route, p_asset: asset,
    });
    if (error) seen.delete(key);
  } catch {
    // La télémétrie ne doit jamais causer une deuxième erreur dans le parcours.
    seen.delete(key);
  }
}

export function initClientErrorMonitor() {
  if (installed || !import.meta.env.PROD) return;
  installed = true;
  window.addEventListener("error", event => { void reportClientError("runtime", event.filename); });
  window.addEventListener("unhandledrejection", () => { void reportClientError("promise"); });
}
