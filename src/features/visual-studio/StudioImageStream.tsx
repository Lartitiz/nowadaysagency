// Galerie « Images créées dans cette discussion » du Studio : les 20 dernières
// images (plus sur demande), comparaison avec la source, choix d'une image,
// retour vers la slide du carrousel. Fiche 4 de docs/robustesse/gros-fichiers.md,
// lot 4 : JSX déplacé à l'identique depuis src/pages/VisualStudioPage.tsx ; le
// choix d'une image (sélection, jonction d'une scène) reste dans la page
// (`onSelectVersion`). Chantier P2 (18/10/2026) : chaque image prête dit si
// elle est rangée dans « Mes photos » et propose « Télécharger » et « Créer un
// contenu avec cette image » ; un lien expiré est renouvelé (`onImageExpired`).
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { useCarouselStudioReturn } from "@/features/carousel-studio/useCarouselStudioReturn";
import type { StudioState, StudioVersion } from "@/features/visual-studio/api";
import { cleanStudioSummary } from "@/features/visual-studio/summary";

export function StudioImageStream({
  current,
  galleryLimit,
  onShowOlder,
  selectedId,
  compare,
  comparisonSource,
  onSelectVersion,
  onImageExpired,
  onDownload,
  onCreateContent,
  actionBusy,
  carouselReturn,
  writable,
  busy,
  generating,
}: {
  current: StudioState;
  galleryLimit: number;
  onShowOlder: () => void;
  selectedId: string | null;
  compare: boolean;
  comparisonSource: string | undefined;
  onSelectVersion: (item: StudioVersion) => void;
  onImageExpired: (url: string) => void;
  onDownload: (item: StudioVersion, number: number) => void;
  onCreateContent: (item: StudioVersion) => void;
  actionBusy: string | null;
  carouselReturn: ReturnType<typeof useCarouselStudioReturn>;
  writable: boolean;
  busy: string;
  generating: boolean | undefined;
}) {
  return (
    <div className="studio-image-stream">
      {current.versions.length > galleryLimit && <Button variant="outline" onClick={onShowOlder}>Voir les images plus anciennes</Button>}
      {current.versions.slice(-galleryLimit).map((item) => {
        const number = current.versions.findIndex((entry) => entry.id === item.id) + 1;
        const selected = selectedId === item.id;
        return <article
          key={item.id}
          className={`studio-image-card${selected ? " selected" : ""}`}
          role={item.status === "ready" ? "option" : undefined}
          aria-selected={item.status === "ready" ? selected : undefined}
          tabIndex={item.status === "ready" ? 0 : undefined}
          onClick={item.status === "ready" ? () => onSelectVersion(item) : undefined}
          onKeyDown={item.status === "ready" ? (event) => {
            if (event.key !== "Enter" && event.key !== " ") return;
            event.preventDefault();
            onSelectVersion(item);
          } : undefined}
        >
          <div className="studio-image-card-head">
            <strong>Image {number}{item.proposal.series_size ? ` · série ${(item.proposal.series_index || 0) + 1}/${item.proposal.series_size}` : ""}</strong>
            <span>{item.status === "processing" ? "Création en cours" : item.status === "ready" ? "Prête" : item.status === "failed" ? "Échec" : "À vérifier"}</span>
          </div>
          {item.url ? <div className={selected && compare && comparisonSource ? "studio-comparison" : "studio-image-single"}>
            {selected && compare && comparisonSource && <figure><img src={comparisonSource} alt="Source de comparaison" /><figcaption>Source</figcaption></figure>}
            <figure><img src={item.url} alt={`Image ${number} créée dans cette discussion`} loading="lazy" onError={() => onImageExpired(item.url!)} /><figcaption>{cleanStudioSummary(item.proposal.summary)}</figcaption></figure>
          </div> : <p className="p-5 text-sm">{item.error_message || "Le résultat apparaîtra ici dès qu’il sera prêt."}</p>}
          {item.status === "ready" && <div className="studio-image-card-actions" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
            {carouselReturn.ticket && <Button size="sm" disabled={!writable || !!busy || carouselReturn.busy || !!generating} onClick={() => void carouselReturn.returnToCarousel(item)}>{carouselReturn.busy ? "Enregistrement…" : "Utiliser dans cette slide"}</Button>}
            <Button size="sm" variant={carouselReturn.ticket ? "outline" : "default"} disabled={!!actionBusy || (!item.library_photo_id && !writable)} onClick={() => onCreateContent(item)}>
              {actionBusy === `content:${item.id}` ? "Ouverture…" : "Créer un contenu avec cette image"}
            </Button>
            <Button size="sm" variant="outline" disabled={!!actionBusy || !item.url} onClick={() => onDownload(item, number)}>
              <Download className="mr-1.5 h-4 w-4" aria-hidden="true" />
              {actionBusy === `download:${item.id}` ? "Téléchargement…" : "Télécharger"}
            </Button>
            <span className="studio-image-library-status">{item.library_photo_id ? "Rangée dans Mes photos" : writable ? "Rangement dans Mes photos…" : ""}</span>
          </div>}
        </article>;
      })}
    </div>
  );
}
