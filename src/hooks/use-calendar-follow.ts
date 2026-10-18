// Choix C3 (Laetitia, 18/10/2026) : une retouche faite après « Mettre au
// calendrier » met à jour le calendrier toute seule tant que le contenu n'est
// pas publié, et l'encadré d'enregistrement le dit (CarouselSaveStatus).
// Ce hook décide QUAND envoyer : le contenu du calendrier relié (ouvert depuis
// le calendrier, ou fiche de Mes idées déjà mise au calendrier), après la
// sauvegarde continue, seulement si les visuels ou le texte ont changé.
// L'écriture elle-même est dans use-calendar-save.ts (même contrôle de version
// que « Sauvegarder dans le calendrier »).
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type CalendarFollowOutcome =
  | { kind: "updated" | "published" | "conflict" | "gone" | "skipped" }
  | { kind: "blocked" | "error"; message: string };

export type CalendarFollowStatus =
  | { status: "off" }
  | { status: "following" }
  | { status: "syncing" }
  | { status: "updated" }
  | { status: "published" }
  | { status: "conflict" }
  | { status: "blocked" | "error"; message: string };

/** Délai après la sauvegarde continue : quelques retouches d'affilée = un seul envoi. */
export const CALENDAR_FOLLOW_DELAY_MS = 5000;

interface Options {
  enabled: boolean;
  autosaveStatus: string;
  ideaId: string | null;
  calendarPostId: string | null;
  /** Ce qui part au calendrier (visuels + texte), sous forme comparable. */
  signature: string;
  seed: (postId: string, updatedAt: string) => void;
  push: (postId: string, options?: { force?: boolean }) => Promise<CalendarFollowOutcome>;
}

export function useCalendarFollow({ enabled, autosaveStatus, ideaId, calendarPostId, signature, seed, push }: Options) {
  const [target, setTarget] = useState<string | null>(null);
  const [state, setState] = useState<CalendarFollowStatus>({ status: "off" });
  // Version déjà au calendrier, et dernière version refusée (pas de relance en boucle).
  const synced = useRef<string | null>(null);
  const failed = useRef<string | null>(null);
  const latest = useRef({ signature, push, seed, target, state });
  latest.current = { signature, push, seed, target, state };

  useEffect(() => {
    if (!enabled) { setTarget(null); setState({ status: "off" }); return; }
    let alive = true;
    const off = () => { if (alive) { setTarget(null); setState({ status: "off" }); } };
    (async () => {
      let postId = calendarPostId;
      if (!postId && ideaId) {
        const { data } = await supabase.from("saved_ideas").select("calendar_post_id").eq("id", ideaId).maybeSingle();
        postId = (data as any)?.calendar_post_id || null;
      }
      if (!postId) return off();
      const { data: post } = await supabase.from("calendar_posts")
        .select("id,status,publish_status,updated_at").eq("id", postId).maybeSingle();
      if (!alive) return;
      if (!post) return off();
      latest.current.seed(postId, (post as any).updated_at);
      synced.current = latest.current.signature;
      failed.current = null;
      setTarget(postId);
      const published = (post as any).status === "published" || ["publishing", "published"].includes((post as any).publish_status || "");
      setState({ status: published ? "published" : "following" });
    })().catch(off);
    return () => { alive = false; };
  }, [enabled, ideaId, calendarPostId]);

  const sync = useCallback(async (force?: boolean) => {
    const postId = latest.current.target;
    if (!postId) return;
    const sent = latest.current.signature;
    setState({ status: "syncing" });
    const out = await latest.current.push(postId, force ? { force } : undefined);
    if (latest.current.target !== postId) return;
    if (out.kind === "updated") { synced.current = sent; failed.current = null; setState({ status: "updated" }); }
    else if (out.kind === "published") setState({ status: "published" });
    else if (out.kind === "conflict") setState({ status: "conflict" });
    else if (out.kind === "gone") { setTarget(null); setState({ status: "off" }); }
    else if (out.kind === "blocked" || out.kind === "error") { failed.current = sent; setState({ status: out.kind, message: out.message }); }
    else setState({ status: "following" });
  }, []);

  const pending = !!target && signature !== synced.current
    && !["off", "published", "conflict"].includes(state.status);

  useEffect(() => {
    if (!pending || autosaveStatus !== "saved" || state.status === "syncing" || signature === failed.current) return;
    const timer = window.setTimeout(() => void sync(), CALENDAR_FOLLOW_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [pending, autosaveStatus, signature, state.status, sync]);

  // Quitter l'éditeur juste après une retouche : l'envoi part quand même
  // (l'app reste chargée) ; fermer l'onglet avant la fin : le navigateur prévient.
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      const { target: t, signature: sig, state: s } = latest.current;
      if (t && (s.status === "syncing" || (sig !== synced.current && !["off", "published", "conflict"].includes(s.status)))) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      const { target: t, signature: sig, state: s, push: send } = latest.current;
      if (t && sig !== synced.current && sig !== failed.current && ["following", "updated", "error", "blocked"].includes(s.status)) void send(t);
    };
  }, []);

  return {
    ...state,
    pending,
    /** « Mettre à jour quand même » après un changement fait ailleurs, ou « Réessayer ». */
    retry: (force?: boolean) => void sync(force),
    /** « Sauvegarder dans le calendrier » vient d'écrire cette version : rien à renvoyer. */
    markSynced: () => { synced.current = latest.current.signature; },
  };
}
