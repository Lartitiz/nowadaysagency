// Raccourcis du Studio quand il s'ouvre sur une photo de « Mes photos »
// (13/11/2026, option B de l'audit « une seule porte pour modifier une
// photo ») : la fiche photo n'a plus qu'un bouton « Modifier la photo », qui
// mène ici. Les retouches courantes sont à un clic, le reste se dit avec ses
// mots dans la conversation. Les outils dédiés (fond blanc, portrait, décor,
// mise en scène) restent les mêmes fenêtres que dans « Mes photos ».
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Camera, ChevronDown, Package, Sparkles, UserRound, Wand2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import type { UserPhotoRow } from "@/lib/photo-storage";
import { photoToolFit } from "@/lib/photo-tool-fit";
import { PackshotDialog } from "@/components/photos/PackshotDialog";
import { PortraitProDialog } from "@/components/photos/PortraitProDialog";
import { MiseEnSceneDialog } from "@/components/photos/MiseEnSceneDialog";
import { PhotoRetouchDialog } from "@/components/photos/PhotoRetouchDialog";

/** Phrase pré-remplie : la personne n'a plus qu'à dire ce qu'elle change. */
export const WRITE_STARTER = "Garde ma photo telle quelle, mais ";

type Tool = "packshot" | "portrait" | "mise-en-scene" | "decor" | null;

export function StudioPhotoShortcuts({
  photoId,
  workspaceId,
  disabled,
  onPrepare,
  onWrite,
}: {
  photoId: string;
  workspaceId: string;
  disabled: boolean;
  /** Ouvre « Format et lumière » (sans crédit) sur la photo de la session. */
  onPrepare: () => void;
  /** Pré-remplit la conversation. */
  onWrite: (text: string) => void;
}) {
  const [tool, setTool] = useState<Tool>(null);
  const { data: photo } = useQuery({
    queryKey: ["studio-source-photo", workspaceId, photoId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_photos")
        .select("*")
        .eq("id", photoId)
        .eq("workspace_id", workspaceId)
        .maybeSingle();
      if (error) throw error;
      return (data as UserPhotoRow | null) ?? null;
    },
    staleTime: 60_000,
  });
  const fit = photoToolFit(photo);
  const ready = !!photo && photo.status === "ready";

  return (
    <div className="studio-shortcuts" aria-label="Retouches rapides">
      <p className="studio-shortcuts-title">Que veux-tu faire avec cette photo ?</p>
      <div className="studio-shortcuts-row">
        <button type="button" className="studio-toolbar-btn" disabled={disabled} onClick={onPrepare}>
          <Camera className="h-3.5 w-3.5" aria-hidden="true" />
          Format et lumière
          <span className="studio-shortcut-cost"> · sans crédit</span>
        </button>
        <button type="button" className="studio-toolbar-btn" disabled={disabled}
          onClick={() => {
            onWrite(WRITE_STARTER);
            // Curseur au bout de la phrase : il ne reste qu'à dire quoi changer.
            requestAnimationFrame(() => {
              const box = document.querySelector<HTMLTextAreaElement>(".studio-composer textarea");
              if (box) { box.focus(); box.setSelectionRange(box.value.length, box.value.length); }
            });
          }}>
          <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
          Ranger, éclaircir, retirer un objet…
        </button>
        {ready && fit.isProduct && (
          <button type="button" className="studio-toolbar-btn" disabled={disabled} onClick={() => setTool("packshot")}>
            <Package className="h-3.5 w-3.5" aria-hidden="true" />
            Fond blanc pour ma boutique
            <span className="studio-shortcut-cost"> · 1 image</span>
          </button>
        )}
        {ready && fit.isPortrait && (
          <button type="button" className="studio-toolbar-btn" disabled={disabled} onClick={() => setTool("portrait")}>
            <UserRound className="h-3.5 w-3.5" aria-hidden="true" />
            Mon portrait sur un fond de marque
            <span className="studio-shortcut-cost"> · 1 image</span>
          </button>
        )}
        {ready && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className="studio-toolbar-btn" disabled={disabled}>
                Autres outils
                <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="max-w-xs">
              {!fit.isProduct && (
                <DropdownMenuItem onClick={() => setTool("packshot")}>
                  <Package className="h-4 w-4 mr-2 shrink-0" /> Fond blanc pour ma boutique · 1 image
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={() => setTool("mise-en-scene")}>
                <Package className="h-4 w-4 mr-2 shrink-0" /> Mon produit porté ou en situation · 1 image
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setTool("decor")}>
                <Wand2 className="h-4 w-4 mr-2 shrink-0" />
                <span>
                  Changer le décor · 1 image
                  {fit.isPlace && (
                    <span className="block text-2xs text-muted-foreground">
                      Sur la photo d'un lieu, murs, sol et meubles peuvent changer.
                    </span>
                  )}
                </span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      {/* Montées seulement à l'ouverture : chaque fenêtre lit ses propres données. */}
      {tool === "packshot" && <PackshotDialog photo={photo ?? null} open onOpenChange={(v) => !v && setTool(null)} />}
      {tool === "portrait" && <PortraitProDialog photo={photo ?? null} open onOpenChange={(v) => !v && setTool(null)} />}
      {tool === "mise-en-scene" && <MiseEnSceneDialog photo={photo ?? null} open onOpenChange={(v) => !v && setTool(null)} />}
      {tool === "decor" && <PhotoRetouchDialog photo={photo ?? null} open onOpenChange={(v) => !v && setTool(null)} />}
    </div>
  );
}
