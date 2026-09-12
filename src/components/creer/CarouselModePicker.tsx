import CarouselFormatPreview, { type CarouselPreviewMode } from "./CarouselFormatPreview";
import { cn } from "@/lib/utils";

export default function CarouselModePicker({ value, onChange, photos = [] }: { value: CarouselPreviewMode | null; onChange: (mode: CarouselPreviewMode) => void; photos?: string[] }) {
  return (
    <div className="space-y-3 animate-fade-in">
      <div>
        <p className="text-sm font-semibold text-foreground">Choisis le rendu de ton carrousel</p>
        <p className="text-xs text-muted-foreground mt-1">Exemples de mise en page. Tes textes, tes photos et ta charte remplaceront ces exemples.</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {([
          { id: "text", label: "Texte design", hint: "L’IA écrit et met en page. Une idée par slide, aux couleurs de ta marque." },
          { id: "photo", label: "Tes photos en fond", hint: "Une photo plein écran et un texte court superposé sur chaque slide." },
          { id: "mix", label: "Photos + slides design", hint: "Des photos et des slides de texte alternent pour donner du rythme." },
          { id: "pure_photo", label: "Photos brutes", hint: "Des photos sans texte dessus. L’IA écrit seulement la légende." },
          { id: "user_slides", label: "Mes slides", hint: "Tu fournis ton texte, slide par slide. L’IA le met en page sans le réécrire." },
        ] as { id: CarouselPreviewMode; label: string; hint: string }[]).map((mode) => (
          <button key={mode.id} type="button" aria-pressed={value === mode.id}
            onClick={() => onChange(mode.id)}
            className={cn("rounded-xl border-2 p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2", value === mode.id ? "border-primary bg-primary/5" : "border-border bg-card hover:border-primary/40")}
          >
            <CarouselFormatPreview mode={mode.id} photos={photos} />
            <span className="flex items-center justify-between gap-2 text-sm font-semibold text-foreground">{mode.label}{value === mode.id && <span className="text-xs text-primary">✓ Choisi</span>}</span>
            <span className="block text-xs text-muted-foreground mt-1 leading-relaxed">{mode.hint}</span>
          </button>
        ))}
      </div>
      {value === "text" && photos.length > 0 && <p className="text-xs text-muted-foreground">Le rendu Texte design n’utilise pas les photos sélectionnées. Elles restent disponibles si tu changes de rendu.</p>}
    </div>
  );
}
