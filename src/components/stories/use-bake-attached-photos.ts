// Photos jointes à la création des stories, enregistrées avec les stories
// (13/11/2026). Avant, elles ne vivaient que dans le navigateur (flux /creer) :
// le calendrier, Mes idées, un autre appareil et les téléchargements depuis le
// calendrier montraient des stories sans photo. Ici, dès qu'une photo jointe
// s'affiche sur une story, elle est envoyée une fois dans le stockage public
// (calendar-visuals, comme les photos des carrousels) et son adresse est écrite
// dans visual.photo_url : chaque enregistrement (idée, calendrier) l'emporte.
// Tout ou rien : si un envoi échoue, rien n'est écrit (la répartition des
// photos dans l'ordre resterait sinon décalée), on réessaiera au prochain rendu.
import { useEffect, useRef, type MutableRefObject } from "react";
import { supabase } from "@/integrations/supabase/client";
import { attachedPhotoUrl, type AttachedPhotoLike } from "@/lib/story-attached-photos";

/** Une photo jointe → son adresse publique, pour ne l'envoyer qu'une fois par page. */
const uploadedByPhoto = new Map<string, Promise<string>>();

async function photoBlob(source: string): Promise<Blob> {
  const match = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(source);
  if (!match) return (await fetch(source)).blob(); // aperçu blob: ou adresse distante
  const text = match[2] ? atob(match[3]) : decodeURIComponent(match[3]);
  const bytes = Uint8Array.from(text, (c) => c.charCodeAt(0));
  return new Blob([bytes], { type: match[1] || "image/jpeg" });
}

async function uploadAttachedPhoto(source: string, userId: string): Promise<string> {
  const blob = await photoBlob(source);
  const mime = blob.type === "image/png" ? "image/png" : "image/jpeg";
  const path = `${userId}/stories/${crypto.randomUUID()}.${mime === "image/png" ? "png" : "jpg"}`;
  const { error } = await supabase.storage.from("calendar-visuals").upload(path, blob, { contentType: mime, upsert: false });
  if (error) throw error;
  return supabase.storage.from("calendar-visuals").getPublicUrl(path).data.publicUrl;
}

/** Stories à qui l'on écrit leur photo jointe (adresse publique par numéro de photo). */
export function withBakedPhotos<T extends { visual?: any }>(stories: T[], slots: Map<number, number>, urlBySlot: Map<number, string>): T[] {
  return stories.map((story, i) => {
    const slot = slots.get(i);
    const url = slot === undefined ? undefined : urlBySlot.get(slot);
    const v = story?.visual;
    if (!url || !v || v.background !== "photo" || v.photo_url || v.photo_id) return story;
    const { attached_slot: _slot, ...visual } = v;
    return { ...story, visual: { ...visual, photo_url: url } };
  });
}

export function useBakeAttachedPhotos<T extends { visual?: any }>({ stories, slots, photos, setStories, onStoriesUpdate, automaticChange }: {
  stories: T[];
  slots: Map<number, number>;
  photos: AttachedPhotoLike[] | undefined;
  setStories: (update: (prev: T[]) => T[]) => void;
  onStoriesUpdate?: (stories: T[]) => void;
  automaticChange: MutableRefObject<boolean>;
}) {
  const running = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  // Dernière répartition connue : l'envoi peut finir après un geste sur la séquence.
  const latestSlots = useRef(slots);
  latestSlots.current = slots;
  const wanted = [...new Set(slots.values())].sort((a, b) => a - b);
  const sources = new Map(wanted.map((slot) => [slot, attachedPhotoUrl(photos?.[slot])]));
  const signature = [...slots].map(([i, slot]) => `${i}:${slot}`).join(",");
  // Les adresses data: sont longues : longueur + fin suffisent à repérer un changement.
  const sourcesSignature = [...sources.values()].map((s) => (s ? `${s.length}:${s.slice(-24)}` : "-")).join("|");

  useEffect(() => {
    if (!signature || running.current) return;
    if ([...sources.values()].some((s) => !s)) return;
    running.current = true;
    (async () => {
      try {
        const { data } = await supabase.auth.getUser();
        const userId = data?.user?.id;
        if (!userId) return;
        const entries = await Promise.all(wanted.map(async (slot) => {
          const source = sources.get(slot) as string;
          let pending = uploadedByPhoto.get(source);
          if (!pending) {
            pending = uploadAttachedPhoto(source, userId);
            uploadedByPhoto.set(source, pending);
            pending.catch(() => uploadedByPhoto.delete(source));
          }
          return [slot, await pending] as const;
        }));
        if (!mounted.current) return;
        const urlBySlot = new Map(entries);
        setStories((prev) => {
          const updated = withBakedPhotos(prev, latestSlots.current, urlBySlot);
          if (updated.every((s, i) => s === prev[i])) return prev;
          // Pas un geste de l'utilisatrice : « Annuler » ne doit pas le défaire.
          automaticChange.current = true;
          onStoriesUpdate?.(updated);
          return updated;
        });
      } catch {
        // Hors ligne ou envoi refusé : la photo reste affichée, nouvel essai au prochain changement.
      } finally {
        running.current = false;
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, sourcesSignature]);
}
