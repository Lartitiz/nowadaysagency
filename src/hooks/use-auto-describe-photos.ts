// Légende des photos importées dès leur ajout (26/11/2026, retour de Laetitia :
// « si c'est déjà écrit, ça ne sert à rien cette étape »). Avant, la légende
// d'une photo venue de l'ordinateur n'était demandée qu'au clic sur « Générer »,
// dans la fenêtre « Que montre chaque photo ? », qui s'ouvrait donc à chaque fois.
// Ici, chaque photo importée sans description part tout de suite chez
// photo-describe (sans crédit) ; au moment de créer, toutes les lignes sont
// remplies et la fenêtre ne s'ouvre plus. Une légende pas encore revenue (clic
// très rapide) ou en échec : la fenêtre s'ouvre comme avant, rien n'est perdu.
import { useEffect, useRef } from "react";
import type { Dispatch, SetStateAction } from "react";
import { describeImportedPhoto } from "@/features/creer/describe-imported-photo";
import { splitPairMark, suggestPhotoContext } from "@/features/creer/photo-context-step";

type AutoPhoto = {
  id?: string;
  base64?: string;
  mimeType?: string;
  name?: string;
  context?: string;
  libraryContext?: string;
  autoContext?: string;
  stockAmbient?: boolean;
};

/** Photo qui n'a encore aucune ligne et qu'on peut décrire. */
export function needsAutoDescription(p: AutoPhoto): boolean {
  if (!p?.id || !p.base64 || p.stockAmbient) return false;
  if (splitPairMark(p.context).text) return false;
  return !suggestPhotoContext(p).text;
}

export function useAutoDescribePhotos<T extends AutoPhoto>({
  photos, setPhotos, workspaceId, enabled = true,
}: {
  photos: T[];
  setPhotos: Dispatch<SetStateAction<T[]>>;
  /** Espace d'une autre personne (binôme) : envoyé au serveur, sinon undefined. */
  workspaceId?: string;
  enabled?: boolean;
}) {
  const requested = useRef(new Set<string>());
  useEffect(() => {
    if (!enabled) return;
    for (const photo of photos) {
      if (!needsAutoDescription(photo) || requested.current.has(photo.id!)) continue;
      requested.current.add(photo.id!);
      void describeImportedPhoto(photo, workspaceId).then((text) => {
        if (!text) return;
        setPhotos((prev) => {
          let changed = false;
          const next = prev.map((p) => {
            if (p.id !== photo.id || p.autoContext || splitPairMark(p.context).text) return p;
            changed = true;
            return { ...p, autoContext: text };
          });
          return changed ? next : prev;
        });
      });
    }
  }, [photos, enabled, workspaceId, setPhotos]);
}
