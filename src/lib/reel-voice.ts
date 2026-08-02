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

/** Une prise de voix convertie : le fichier WAV et sa durée RÉELLE, en secondes. */
export interface VoiceTake {
  wav: Blob;
  /** Durée mesurée de la prise. Sert à caler la scène sur la voix, pas sur le script. */
  duration: number;
}

/**
 * Convertit un blob audio (WebM/Opus…) en WAV mono via WebAudio.
 *
 * Renvoie AUSSI la durée décodée : c'est la seule mesure fiable de la longueur
 * de la prise, et c'est elle qui doit fixer la durée de la scène au montage
 * (sinon une lecture posée se fait couper par la durée estimée du script).
 */
export async function blobToWav(blob: Blob): Promise<VoiceTake> {
  const arrayBuffer = await blob.arrayBuffer();
  const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctx();
  try {
    const decoded = await ctx.decodeAudioData(arrayBuffer);
    const channels: Float32Array[] = [];
    for (let c = 0; c < decoded.numberOfChannels; c++) channels.push(decoded.getChannelData(c));
    const wav = encodeWav(downmixToMono(channels), decoded.sampleRate);
    return { wav: new Blob([wav], { type: "audio/wav" }), duration: decoded.duration };
  } finally {
    void ctx.close();
  }
}

/** Prise déposée : son URL publique et sa durée réelle, en secondes. */
export interface VoiceClip {
  url: string;
  duration: number;
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
