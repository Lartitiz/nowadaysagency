// Captures d'écran de l'onboarding (une mission : trier les fichiers reçus et
// nettoyer un envoi resté sans ligne `user_documents`). Importé par
// src/hooks/use-onboarding.ts. Bucket privé `onboarding-uploads`.
import { supabase } from "@/integrations/supabase/client";

const CAPTURE_FORMATS = ["png", "jpg", "jpeg", "webp"];

export function captureExtension(name: string): string | undefined {
  return name.split(".").pop()?.toLowerCase();
}

/**
 * Sépare les fichiers refusés pour leur format des fichiers acceptés, et
 * n'accepte que `remaining` fichiers au plus : un fichier refusé ne prend
 * pas la place d'une capture valable.
 */
export function pickOnboardingCaptures(files: File[], remaining: number): { accepted: File[]; rejected: File[] } {
  const accepted: File[] = [];
  const rejected: File[] = [];
  for (const file of files) {
    const ext = captureExtension(file.name);
    if (!ext || !CAPTURE_FORMATS.includes(ext)) rejected.push(file);
    else if (accepted.length < remaining) accepted.push(file);
  }
  return { accepted, rejected };
}

/** Fichier envoyé mais sans ligne `user_documents` : le retirer du bucket. */
export async function removeOrphanCapture(path: string, recordError: unknown): Promise<void> {
  console.error("Capture record error:", recordError);
  try {
    const { error } = await supabase.storage.from("onboarding-uploads").remove([path]);
    if (error) console.warn("Failed to clean up orphan onboarding upload:", error);
  } catch (error) {
    console.warn("Failed to clean up orphan onboarding upload:", error);
  }
}
