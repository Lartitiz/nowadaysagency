// Images proposées d'office, côté écran « carrousel photo » (CarouselPhotoResult) :
// l'encart d'une slide qui attend son image, et « Une autre » sur une photo libre
// de droit proposée. Voir src/lib/carousel-photo-proposals.ts (26/11/2026).
import { useRef, useState } from "react";
import { ImagePlus, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { readableError } from "@/lib/error-messages";
import { stockPhotoToPhotoItem } from "@/lib/stock-photos";
import { fetchPhotoProposals, isPexelsPhoto, pexelsIdFromCredit, slidePassage, toStockPhoto, type ServerStockPhoto } from "@/lib/carousel-photo-proposals";
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
 * déjà vérifiée par le serveur (stock_alternates), sans nouvel appel IA. Réserve
 * vide (26/11/2026 : le bouton disparaissait sans explication) : on redemande au
 * serveur des photos pour cette slide, sans celles déjà montrées.
 */
export function useAnotherProposal({ slides, setSlides, onAddPhoto, onChange, subject, workspaceId }: {
  slides: any[];
  setSlides: (slides: any[]) => void;
  onAddPhoto?: (photo: PhotoItem) => number;
  onChange: (slides: any[]) => void;
  subject?: string;
  workspaceId?: string | null;
}) {
  const [loadingIdx, setLoadingIdx] = useState<number | null>(null);
  const slidesRef = useRef(slides);
  slidesRef.current = slides;
  // Photos déjà montrées pendant cette visite, par passage : jamais redemandées.
  const seenRef = useRef(new Map<string, Set<string>>());
  const show = async (slideIdx: number) => {
    const target = slides[slideIdx];
    if (target?.cast_source !== "stock_ambient" || loadingIdx !== null) return;
    const passage = slidePassage(target);
    const seen = seenRef.current.get(passage) ?? new Set<string>();
    seenRef.current.set(passage, seen);
    const current = pexelsIdFromCredit(target);
    if (current) seen.add(current);
    setLoadingIdx(slideIdx);
    try {
      let [nextPhoto, ...rest]: ServerStockPhoto[] = (Array.isArray(target?.stock_alternates) ? target.stock_alternates : []).filter(isPexelsPhoto);
      if (!nextPhoto) {
        const [fresh] = await fetchPhotoProposals({ raw: { slides }, targets: [slideIdx + 1], subject, libraryRows: [], workspaceId, exclude: [...seen] });
        if (isPexelsPhoto(fresh?.stock)) [nextPhoto, ...rest] = [fresh.stock, ...(fresh.alternates || []).filter(isPexelsPhoto)];
      }
      if (!nextPhoto) {
        toast("Pas d'autre photo trouvée pour ce passage", { description: "Tu peux en choisir une toi-même avec « Changer la photo »." });
        return;
      }
      seen.add(nextPhoto.id);
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
  if (slide?.cast_source !== "stock_ambient") return null;
  return (
    <Button type="button" variant="outline" size="sm" className="h-7 text-xs" disabled={state.loadingIdx !== null} onClick={() => state.show(idx)}>
      {state.loadingIdx === idx ? <Loader2 size={13} className="mr-1 animate-spin" /> : <RefreshCw size={13} className="mr-1" />}
      Une autre
    </Button>
  );
}
