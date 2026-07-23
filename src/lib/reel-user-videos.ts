/**
 * reel-user-videos — les propres vidéos de la créatrice pour le montage reel.
 *
 * Stockage : bucket public `calendar-media` existant (plafond serveur 150 Mo),
 * sous `user.id/reel-videos/…` (même convention que la voix et le calendrier —
 * zéro migration SQL). On ne coupe PAS la vidéo côté client : on stocke le
 * fichier tel quel et le moteur de montage ne lit que la fenêtre choisie
 * (`seek` + durée). La garde de taille évite les fichiers déraisonnables.
 */

import { supabase } from "@/integrations/supabase/client";
import { checkUploadSize } from "@/lib/upload-limits";

export interface UserReelVideo {
  name: string;
  url: string;
  /** Date de dépôt (tri du plus récent au plus ancien). */
  createdAt: string;
}

const FOLDER = "reel-videos";

async function userId(): Promise<string> {
  const { data } = await supabase.auth.getUser();
  const id = data?.user?.id;
  if (!id) throw new Error("Connecte-toi pour utiliser tes vidéos.");
  return id;
}

/** Upload d'une vidéo perso, renvoie son URL publique. */
export async function uploadReelVideo(file: File): Promise<UserReelVideo> {
  if (!file.type.startsWith("video/")) {
    throw new Error("Ce fichier n'est pas une vidéo.");
  }
  const sizeErr = checkUploadSize(file, "calendar-media");
  if (sizeErr) throw new Error(sizeErr);

  const uid = await userId();
  const ext = file.name.split(".").pop()?.toLowerCase() || "mp4";
  const path = `${uid}/${FOLDER}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const { error } = await supabase.storage
    .from("calendar-media")
    .upload(path, file, { contentType: file.type });
  if (error) {
    console.error("[uploadReelVideo] upload échoué:", error);
    throw new Error("L'envoi de la vidéo a échoué. Réessaie.");
  }
  const { data } = supabase.storage.from("calendar-media").getPublicUrl(path);
  if (!data?.publicUrl) throw new Error("L'envoi de la vidéo a échoué. Réessaie.");
  return { name: file.name, url: data.publicUrl, createdAt: new Date().toISOString() };
}

/**
 * Durée (secondes) d'une vidéo distante, lue via ses métadonnées (léger : ne
 * télécharge pas le fichier). `null` si indisponible sous 10 s.
 */
export function loadVideoDuration(url: string): Promise<number | null> {
  return new Promise((resolve) => {
    const v = document.createElement("video");
    v.preload = "metadata";
    const done = (d: number | null) => {
      v.removeAttribute("src");
      v.load();
      resolve(d);
    };
    const timer = setTimeout(() => done(null), 10_000);
    v.onloadedmetadata = () => {
      clearTimeout(timer);
      done(Number.isFinite(v.duration) ? v.duration : null);
    };
    v.onerror = () => {
      clearTimeout(timer);
      done(null);
    };
    v.src = url;
  });
}

/** Vidéos déjà déposées, la plus récente d'abord. Best-effort : [] si vide/erreur. */
export async function listReelVideos(): Promise<UserReelVideo[]> {
  let uid: string;
  try {
    uid = await userId();
  } catch {
    return [];
  }
  const { data, error } = await supabase.storage
    .from("calendar-media")
    .list(`${uid}/${FOLDER}`, { limit: 50, sortBy: { column: "created_at", order: "desc" } });
  if (error || !Array.isArray(data)) return [];
  return data
    .filter((f) => f.name && !f.name.startsWith("."))
    .map((f) => {
      const { data: pub } = supabase.storage
        .from("calendar-media")
        .getPublicUrl(`${uid}/${FOLDER}/${f.name}`);
      return { name: f.name, url: pub?.publicUrl ?? "", createdAt: f.created_at ?? "" };
    })
    .filter((v) => v.url);
}
