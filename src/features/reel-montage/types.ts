// Types et petits outils de l'écran de montage d'un reel (ReelMontage).
// Sortis de ReelMontage.tsx à l'identique (fiche 16 de
// docs/robustesse/gros-fichiers.md, lot 1). `ReelMontageProject` est la forme
// de `result.montage_project`, sauvegardée en base : ne renommer aucun champ.
import type { StockVideo } from "@/lib/stock-videos";
import type { UserReelVideo } from "@/lib/reel-user-videos";
import type { VoiceClip } from "@/lib/reel-voice";

export interface Section {
  timing?: string;
  texte_parle?: string;
  texte_overlay?: string;
  format_visuel?: string;
}

export type Phase = "idle" | "rendering" | "done" | "error";

/** Clip retenu pour une section : banque libre ou vidéo de la créatrice. */
export interface SelectedClip {
  id: string;
  url: string;
  thumbnail: string | null;
  /** Durée du clip source (pour la fenêtre), null si inconnue. */
  duration: number | null;
  source: "stock" | "mine" | "studio";
  studioJobId?: string;
  label: string;
  /** Seconde d'entrée dans le clip (fenêtre choisie). */
  seek: number;
}

export interface StudioCutaway { jobId: string; url: string; duration: number; start: number; seek: number; label: string }
export interface ReelMontageProject {
  version: 1;
  sectionTexts: string[];
  montageMode: MontageMode | null;
  voiceMode: "recorded" | "silent";
  clips: (SelectedClip | null)[];
  voiceClips: (VoiceClip | null)[];
  cutaways: (StudioCutaway | null)[];
}

export function fromStock(v: StockVideo): SelectedClip {
  return {
    id: `stock-${v.id}`,
    url: v.url,
    thumbnail: v.thumbnail || null,
    duration: v.duration,
    source: "stock",
    label: "Banque libre",
    seek: 0,
  };
}

export function fromMine(v: UserReelVideo, duration: number | null): SelectedClip {
  return {
    id: `mine-${v.url}`,
    url: v.url,
    thumbnail: null,
    duration,
    source: "mine",
    label: v.name,
    seek: 0,
  };
}

/**
 * "filme" = prise face cam, on garde le son ; "cache" = comportement existant
 * (clip muet + voix posée). Fourche à deux modes ÉGAUX (décidée le 01/08) :
 * `null` tant que la cliente n'a pas choisi — aucun des deux n'est un défaut,
 * beaucoup de clientes ne se montreront jamais.
 */
export type MontageMode = "filme" | "cache";

// Petit helper immuable : remplace l'index i d'un tableau.
export function set<T>(arr: T[], i: number, v: T): T[] {
  const copy = arr.slice();
  copy[i] = v;
  return copy;
}
