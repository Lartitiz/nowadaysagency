import { Check } from "lucide-react";
import CarouselFormatPreview, { type CarouselPreviewMode } from "./CarouselFormatPreview";
import { cn } from "@/lib/utils";

const MODES: { id: CarouselPreviewMode; label: string; hint: string }[] = [
  { id: "text", label: "Texte design", hint: "L’IA écrit et met en page. Une idée par slide, aux couleurs de ta marque." },
  { id: "photo", label: "Tes photos en fond", hint: "Une photo plein écran et un texte court superposé sur chaque slide." },
  { id: "mix", label: "Photos + slides design", hint: "Des photos et des slides de texte alternent pour donner du rythme." },
  { id: "pure_photo", label: "Photos brutes", hint: "Des photos sans texte dessus. L’IA écrit seulement la légende." },
  { id: "user_slides", label: "Mes slides", hint: "Tu fournis ton texte, slide par slide. L’IA le met en page sans le réécrire." },
];

/** À partir de ce nombre de photos dans « Mes photos », on conseille « Tes photos en fond » (choix de Laetitia du 16/10/2026). */
export const LIBRARY_PHOTOS_FOR_PHOTO_CAROUSEL = 3;

/** Type de carrousel conseillé par défaut (choix de Laetitia du 15/10/2026) : avec des photos (jointes, ou au moins 3 dans « Mes photos »), « Tes photos en fond », sinon « Texte design ». */
export function defaultCarouselMode(attachedPhotos: number, libraryPhotos = 0): CarouselPreviewMode {
  return attachedPhotos > 0 || libraryPhotos >= LIBRARY_PHOTOS_FOR_PHOTO_CAROUSEL ? "photo" : "text";
}

/** Les 5 types restent toujours visibles, en cartes compactes ; la description du type choisi s'affiche dessous. */
export default function CarouselModePicker({ value, onChange, photos = [], recommended }: { value: CarouselPreviewMode | null; onChange: (mode: CarouselPreviewMode) => void; photos?: string[]; recommended?: CarouselPreviewMode }) {
  const selected = MODES.find((m) => m.id === value);
  return (
    <div className="space-y-2 animate-fade-in">
      <p className="text-sm font-semibold text-foreground">Choisis le rendu de ton carrousel</p>
      <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
        {MODES.map((mode) => (
          <button key={mode.id} type="button" aria-pressed={value === mode.id} data-testid={`carousel-mode-${mode.id}`}
            onClick={() => onChange(mode.id)}
            className={cn("relative rounded-xl border-2 p-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2", value === mode.id ? "border-primary bg-primary/5" : "border-border bg-card hover:border-primary/40")}
          >
            <CarouselFormatPreview mode={mode.id} photos={photos} compact />
            <span className="block text-xs font-semibold leading-tight text-foreground">{mode.label}</span>
            {recommended === mode.id && <span className="mt-1 inline-block rounded-full bg-primary/10 px-1.5 py-0.5 text-2xs font-medium text-primary">Conseillé</span>}
            {value === mode.id && <Check aria-hidden="true" className="absolute right-1 top-1 h-4 w-4 rounded-full bg-primary p-0.5 text-primary-foreground" />}
          </button>
        ))}
      </div>
      {selected && <p className="text-xs text-muted-foreground" data-testid="carousel-mode-hint">{selected.label} : {selected.hint}</p>}
      {value === "text" && photos.length > 0 && <p className="text-xs text-muted-foreground">Le rendu Texte design n’utilise pas les photos sélectionnées. Elles restent disponibles si tu changes de rendu.</p>}
    </div>
  );
}
