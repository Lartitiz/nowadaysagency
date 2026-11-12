import { Check } from "lucide-react";
import CarouselFormatPreview, { type CarouselPreviewMode } from "./CarouselFormatPreview";
import { cn } from "@/lib/utils";
import { LIBRARY_PHOTOS_FOR_PHOTO_CAROUSEL } from "@/lib/format-recommendation";

/** Une ligne courte (≈ 45 caractères : une ligne sur mobile) sous chaque rendu, qui dit ce qu'il produit (choix de Laetitia du 12/11/2026 : garder les 5 et les expliquer). */
export const CAROUSEL_MODES: { id: CarouselPreviewMode; label: string; hint: string }[] = [
  { id: "text", label: "Texte design", hint: "Du texte mis en page, sans photo." },
  { id: "photo", label: "Tes photos en fond", hint: "Un texte court posé sur chaque photo." },
  { id: "mix", label: "Photos + slides design", hint: "Une photo, puis une slide de texte." },
  { id: "pure_photo", label: "Photos brutes", hint: "Tes photos seules, sans texte dessus." },
  { id: "user_slides", label: "Mes slides", hint: "Ton texte à toi, mis en page par l’IA." },
];


/** Type de carrousel conseillé par défaut (choix de Laetitia du 15/10/2026) : avec des photos (jointes, ou au moins 3 dans « Mes photos »), « Tes photos en fond », sinon « Texte design ». */
export function defaultCarouselMode(attachedPhotos: number, libraryPhotos = 0): CarouselPreviewMode {
  return attachedPhotos > 0 || libraryPhotos >= LIBRARY_PHOTOS_FOR_PHOTO_CAROUSEL ? "photo" : "text";
}

/** Les 5 types restent toujours visibles, en liste : aperçu, nom, et une ligne qui dit à quoi sert chacun. */
export default function CarouselModePicker({ value, onChange, photos = [], recommended }: { value: CarouselPreviewMode | null; onChange: (mode: CarouselPreviewMode) => void; photos?: string[]; recommended?: CarouselPreviewMode }) {
  return (
    <div className="space-y-2 animate-fade-in">
      <p className="text-sm font-semibold text-foreground">Choisis le rendu de ton carrousel</p>
      <div className="grid grid-cols-1 gap-1.5">
        {CAROUSEL_MODES.map((mode) => (
          <button key={mode.id} type="button" aria-pressed={value === mode.id} data-testid={`carousel-mode-${mode.id}`}
            onClick={() => onChange(mode.id)}
            className={cn("relative flex items-center gap-3 rounded-xl border-2 py-1.5 pl-2 pr-8 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2", value === mode.id ? "border-primary bg-primary/5" : "border-border bg-card hover:border-primary/40")}
          >
            <div className="w-16 shrink-0 [&>div]:mb-0"><CarouselFormatPreview mode={mode.id} photos={photos} compact /></div>
            <span className="min-w-0">
              <span className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs font-semibold leading-tight text-foreground">{mode.label}</span>
                {recommended === mode.id && <span className="inline-block rounded-full bg-primary/10 px-1.5 py-0.5 text-2xs font-medium text-primary">Conseillé</span>}
              </span>
              <span className="mt-0.5 block text-xs leading-snug text-muted-foreground" data-testid={`carousel-mode-hint-${mode.id}`}>{mode.hint}</span>
            </span>
            {value === mode.id && <Check aria-hidden="true" className="absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 rounded-full bg-primary p-0.5 text-primary-foreground" />}
          </button>
        ))}
      </div>
      {value === "text" && photos.length > 0 && <p className="text-xs text-muted-foreground">Le rendu Texte design n’utilise pas les photos sélectionnées. Elles restent disponibles si tu changes de rendu.</p>}
    </div>
  );
}
