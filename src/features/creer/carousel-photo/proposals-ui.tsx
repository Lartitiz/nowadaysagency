// Images proposées d'office, côté écran « carrousel photo » (CarouselPhotoResult) :
// l'encart d'une slide qui attend son image, et « Une autre » sur une photo libre
// de droit proposée. Voir src/lib/carousel-photo-proposals.ts (26/11/2026).
import { useRef, useState } from "react";
import { ImagePlus, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { readableError } from "@/lib/error-messages";
import { stockPhotoToPhotoItem } from "@/lib/stock-photos";
import { isPexelsPhoto, toStockPhoto } from "@/lib/carousel-photo-proposals";
import type { PhotoItem } from "@/components/creer/PhotoUploadZone";

/** En-tête d'une slide sans image : recherche en cours, image idéale, ou simple invitation. */
export function CastingNotice({ searching, directive }: { searching: boolean; directive: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <div className="h-16 w-12 shrink-0 rounded-md border border-dashed border-border bg-background/60 flex items-center justify-center text-muted-foreground">
        {searching ? <Loader2 size={18} className="animate-spin" /> : <ImagePlus size={18} />}
      </div>
      <div className="min-w-0 flex-1" role={searching ? "status" : undefined}>
        <p className="text-2xs font-semibold uppercase tracking-wide text-warning">
          {searching ? "On te cherche une image…" : "Image à choisir"}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {searching ? (
            "D'abord dans ta bibliothèque, sinon parmi des photos libres de droit. Tu peux aussi en choisir une tout de suite."
          ) : directive ? (
            <><span className="font-medium text-foreground">L'image idéale ici :</span>{" "}{directive}</>
          ) : (
            "Choisis l'image qui va avec le texte de cette slide."
          )}
        </p>
      </div>
    </div>
  );
}

/**
 * « Une autre » : la photo libre de droit proposée laisse sa place à la suivante
 * déjà vérifiée par le serveur (stock_alternates), sans nouvel appel IA.
 */
export function useAnotherProposal({ slides, setSlides, onAddPhoto, onChange }: {
  slides: any[];
  setSlides: (slides: any[]) => void;
  onAddPhoto?: (photo: PhotoItem) => number;
  onChange: (slides: any[]) => void;
}) {
  const [loadingIdx, setLoadingIdx] = useState<number | null>(null);
  const slidesRef = useRef(slides);
  slidesRef.current = slides;
  const show = async (slideIdx: number) => {
    const target = slides[slideIdx];
    const [nextPhoto, ...rest] = (Array.isArray(target?.stock_alternates) ? target.stock_alternates : []).filter(isPexelsPhoto);
    if (!nextPhoto || loadingIdx !== null) return;
    setLoadingIdx(slideIdx);
    try {
      const item = { ...(await stockPhotoToPhotoItem(toStockPhoto(nextPhoto))), stockAmbient: true };
      const newIndex = onAddPhoto?.(item);
      if (!newIndex) return;
      // Les slides ont pu bouger pendant le téléchargement : on repart de l'état du moment.
      const current = slidesRef.current;
      const at = current.includes(target) ? current.indexOf(target) : slideIdx;
      if (current[at]?.cast_source !== "stock_ambient") return;
      const next = current.map((s: any, i: number) => i === at ? {
        ...s, photo_index: newIndex, cast_source: "stock_ambient", stock_alternates: rest.length ? rest : undefined,
        stock_credit: { source: "pexels", photographer: nextPhoto.photographer || "", source_url: nextPhoto.source_url || "" },
      } : s);
      setSlides(next);
      onChange(next);
    } catch (e) {
      toast.error("Cette photo n'a pas pu être chargée", { description: readableError(e, "Réessaie dans un instant.") });
    } finally {
      setLoadingIdx(null);
    }
  };
  return { loadingIdx, show };
}

export function AnotherProposalButton({ slide, idx, state }: { slide: any; idx: number; state: ReturnType<typeof useAnotherProposal> }) {
  if (slide?.cast_source !== "stock_ambient" || !Array.isArray(slide.stock_alternates) || slide.stock_alternates.length === 0) return null;
  return (
    <Button type="button" variant="outline" size="sm" className="h-7 text-xs" disabled={state.loadingIdx !== null} onClick={() => state.show(idx)}>
      {state.loadingIdx === idx ? <Loader2 size={13} className="mr-1 animate-spin" /> : <RefreshCw size={13} className="mr-1" />}
      Une autre
    </Button>
  );
}
