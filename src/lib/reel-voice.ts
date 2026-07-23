/**
 * reel-voice — enregistrement de la voix de la créatrice pour le montage reel.
 *
 * Chaîne : micro (MediaRecorder, WebM/Opus) → décodage WebAudio → WAV mono
 * (`encodeWav`, format lisible par le moteur de montage) → upload dans le
 * bucket public `calendar-media` (déjà en place, premier segment = user id,
 * même convention que CalendarPostDialog) → URL publique à poser sur la scène.
 */

import { supabase } from "@/integrations/supabase/client";
import { encodeWav, downmixToMono } from "@/lib/audio-wav";

/** Convertit un blob audio (WebM/Opus…) en WAV mono via WebAudio. */
export async function blobToWav(blob: Blob): Promise<Blob> {
  const arrayBuffer = await blob.arrayBuffer();
  const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctx();
  try {
    const decoded = await ctx.decodeAudioData(arrayBuffer);
    const channels: Float32Array[] = [];
    for (let c = 0; c < decoded.numberOfChannels; c++) channels.push(decoded.getChannelData(c));
    const wav = encodeWav(downmixToMono(channels), decoded.sampleRate);
    return new Blob([wav], { type: "audio/wav" });
  } finally {
    void ctx.close();
  }
}

/**
 * Upload d'un clip voix (WAV) et renvoi de son URL publique.
 * `sectionIndex` sert uniquement à un nom de fichier lisible.
 */
export async function uploadVoiceClip(wav: Blob, sectionIndex: number): Promise<string> {
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth?.user?.id;
  if (!userId) throw new Error("Connecte-toi pour enregistrer ta voix.");
  const path = `${userId}/reel-voice/${Date.now()}-s${sectionIndex + 1}-${Math.random().toString(36).slice(2)}.wav`;
  const { error } = await supabase.storage
    .from("calendar-media")
    .upload(path, wav, { contentType: "audio/wav" });
  if (error) {
    console.error("[uploadVoiceClip] upload échoué:", error);
    throw new Error("L'envoi de l'enregistrement a échoué. Réessaie.");
  }
  const { data } = supabase.storage.from("calendar-media").getPublicUrl(path);
  if (!data?.publicUrl) throw new Error("L'envoi de l'enregistrement a échoué. Réessaie.");
  return data.publicUrl;
}
