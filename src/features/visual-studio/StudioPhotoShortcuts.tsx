// Outils photo du Studio quand il s'ouvre sur une photo de « Mes photos »
// (13/11/2026, option B de l'audit « une seule porte pour modifier une
// photo ») : la fiche photo n'a plus qu'un bouton « Modifier la photo », qui
// mène ici. Écran simplifié du 13/11/2026 : plus de rangée de raccourcis dans
// la conversation (les besoins changent d'une personne à l'autre) ; les outils
// dédiés (format et lumière, fond blanc, portrait, décor, mise en scène) sont
// rangés dans le menu « Plus d'outils » de la zone de saisie. Ce sont les mêmes
// fenêtres que dans « Mes photos ».
import { useQuery } from "@tanstack/react-query";
import { Camera, Package, UserRound, Wand2 } from "lucide-react";
import { DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import type { UserPhotoRow } from "@/lib/photo-storage";
import { photoToolFit } from "@/lib/photo-tool-fit";
import { PackshotDialog } from "@/components/photos/PackshotDialog";
import { PortraitProDialog } from "@/components/photos/PortraitProDialog";
import { MiseEnSceneDialog } from "@/components/photos/MiseEnSceneDialog";
import { PhotoRetouchDialog } from "@/components/photos/PhotoRetouchDialog";

export type StudioPhotoTool = "packshot" | "portrait" | "mise-en-scene" | "decor" | null;

/** Photo de « Mes photos » sur laquelle la session a été ouverte. */
export function useStudioSourcePhoto(photoId: string | null | undefined, workspaceId: string) {
  return useQuery({
    queryKey: ["studio-source-photo", workspaceId, photoId],
    enabled: !!photoId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_photos")
        .select("*")
        .eq("id", photoId!)
        .eq("workspace_id", workspaceId)
        .maybeSingle();
      if (error) throw error;
      return (data as UserPhotoRow | null) ?? null;
    },
    staleTime: 60_000,
  }).data ?? null;
}

/** Lignes du menu « Plus d'outils » pour la photo d'origine. */
export function StudioPhotoMenuItems({ photo, disabled, onPrepare, onTool }: {
  photo: UserPhotoRow | null;
  disabled: boolean;
  /** Ouvre « Format et lumière » (sans crédit) sur la photo de la session. */
  onPrepare: () => void;
  onTool: (tool: Exclude<StudioPhotoTool, null>) => void;
}) {
  const fit = photoToolFit(photo);
  const ready = !!photo && photo.status === "ready";
  // Le type de photo choisit l'ordre : l'outil qui lui va passe en premier.
  const packshot = <DropdownMenuItem key="packshot" disabled={disabled} onClick={() => onTool("packshot")}>
    <Package className="h-4 w-4 mr-2 shrink-0" aria-hidden="true" /> Fond blanc pour ma boutique · 1 image
  </DropdownMenuItem>;
  const portrait = <DropdownMenuItem key="portrait" disabled={disabled} onClick={() => onTool("portrait")}>
    <UserRound className="h-4 w-4 mr-2 shrink-0" aria-hidden="true" /> Mon portrait sur un fond de marque · 1 image
  </DropdownMenuItem>;
  return <>
    <DropdownMenuItem disabled={disabled} onClick={onPrepare}>
      <Camera className="h-4 w-4 mr-2 shrink-0" aria-hidden="true" /> Format et lumière · sans crédit
    </DropdownMenuItem>
    {ready && <>
      {fit.isPortrait && !fit.isProduct ? [portrait, packshot] : [packshot, ...(fit.isPortrait ? [portrait] : [])]}
      <DropdownMenuItem disabled={disabled} onClick={() => onTool("mise-en-scene")}>
        <Package className="h-4 w-4 mr-2 shrink-0" aria-hidden="true" /> Mon produit porté ou en situation · 1 image
      </DropdownMenuItem>
      <DropdownMenuItem disabled={disabled} onClick={() => onTool("decor")}>
        <Wand2 className="h-4 w-4 mr-2 shrink-0" aria-hidden="true" />
        <span>
          Changer le décor · 1 image
          {fit.isPlace && (
            <span className="block text-2xs text-muted-foreground">
              Sur la photo d'un lieu, murs, sol et meubles peuvent changer.
            </span>
          )}
        </span>
      </DropdownMenuItem>
    </>}
    <DropdownMenuSeparator />
  </>;
}

/** Fenêtres des outils photo, montées seulement à l'ouverture. */
export function StudioPhotoToolDialogs({ photo, tool, onClose }: {
  photo: UserPhotoRow | null;
  tool: StudioPhotoTool;
  onClose: () => void;
}) {
  const close = (v: boolean) => { if (!v) onClose(); };
  return <>
    {tool === "packshot" && <PackshotDialog photo={photo} open onOpenChange={close} />}
    {tool === "portrait" && <PortraitProDialog photo={photo} open onOpenChange={close} />}
    {tool === "mise-en-scene" && <MiseEnSceneDialog photo={photo} open onOpenChange={close} />}
    {tool === "decor" && <PhotoRetouchDialog photo={photo} open onOpenChange={close} />}
  </>;
}
