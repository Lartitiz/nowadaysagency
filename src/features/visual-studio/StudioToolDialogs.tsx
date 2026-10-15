// Fenêtres d'outils du Studio : mockup d'offre, préparation d'une photo,
// avant / après. Chaque image enregistrée revient dans la demande comme
// référence (rôle « composition », ou celui de la photo préparée). Fiche 4 de
// docs/robustesse/gros-fichiers.md, lot 2 : JSX déplacé à l'identique depuis
// src/pages/VisualStudioPage.tsx ; l'appel au serveur reste dans la page
// (`onAttach`).
import { OfferMockupDialog } from "@/components/photos/OfferMockupDialog";
import { AvantApresDialog } from "@/components/photos/AvantApresDialog";
import PhotoPreparationDialog from "@/components/photos/PhotoPreparationDialog";
import type { StudioMessage, StudioReference } from "@/features/visual-studio/api";

export type StudioExistingTool = "mockup" | "before_after" | null;
export type StudioPreparation = {
  source: { id: string; name: string; dataUrl: string };
  recipe?: StudioMessage["preparation"];
  role: StudioReference["role"];
} | null;

export function StudioToolDialogs({
  existingTool,
  setExistingTool,
  preparation,
  setPreparation,
  mockupImage,
  beforeAfterImages,
  onAttach,
}: {
  existingTool: StudioExistingTool;
  setExistingTool: (tool: StudioExistingTool) => void;
  preparation: StudioPreparation;
  setPreparation: (preparation: StudioPreparation) => void;
  mockupImage: string | undefined;
  beforeAfterImages: (string | undefined)[];
  onAttach: (photoId: string, role: StudioReference["role"]) => void;
}) {
  return (
    <>
      {existingTool === "mockup" && (
        <OfferMockupDialog
          open
          onOpenChange={(open) => {
            if (!open) setExistingTool(null);
          }}
          initialImage={mockupImage}
          onSaved={(photo) => {
            setExistingTool(null);
            onAttach(photo.id, "composition");
          }}
        />
      )}
      {preparation && (
        <PhotoPreparationDialog
          open
          onOpenChange={(open) => { if (!open) setPreparation(null); }}
          sources={[preparation.source]}
          initialRecipe={preparation.recipe}
          onSaved={(photo) => {
            setPreparation(null);
            onAttach(photo.id, preparation.role);
          }}
        />
      )}
      {existingTool === "before_after" && (
        <AvantApresDialog
          open
          onOpenChange={(open) => {
            if (!open) setExistingTool(null);
          }}
          initialImages={beforeAfterImages}
          onSaved={(photo) => {
            setExistingTool(null);
            onAttach(photo.id, "composition");
          }}
        />
      )}
    </>
  );
}
