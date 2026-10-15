// Chantier D (15/10/2026) : choix de la police, sorti de TextSettings pour
// servir aussi au mode simple. Les polices Google se chargent à l'ouverture.
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ChevronDown } from "lucide-react";
import { GOOGLE_FONTS, googleFontUrl, type listDocumentFonts } from "@/lib/carousel-editor";

export function FontPicker({ css, documentFonts, fontQuery, pickFont, setFontQuery }: {
  css: Record<string, string>;
  documentFonts: ReturnType<typeof listDocumentFonts>;
  fontQuery: string;
  pickFont: (value: string, family?: string) => void;
  setFontQuery: (query: string) => void;
}) {
  return (
    <Popover onOpenChange={(open) => {
      // Aperçu : les polices Google se chargent dans la page à l'ouverture.
      if (!open || window.document.querySelector("link[data-font-preview]")) return;
      const link = window.document.createElement("link");
      link.rel = "stylesheet";
      link.href = googleFontUrl(GOOGLE_FONTS.map((f) => f.family));
      link.setAttribute("data-font-preview", "true");
      window.document.head.append(link);
    }}>
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline" aria-label="Choisir une police" className="h-8 w-full justify-between font-normal">
          <span className="truncate" style={{ fontFamily: css["font-family"] || undefined }}>
            {(css["font-family"] || "").split(",")[0].replace(/['"]/g, "").trim() || "Police du thème"}
          </span>
          <ChevronDown size={14} aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-2">
        <input
          aria-label="Chercher une police"
          placeholder="Chercher (ex. Playfair)"
          value={fontQuery}
          onChange={(e) => setFontQuery(e.target.value)}
          className="mb-2 w-full rounded border bg-background px-2 py-1 text-xs"
        />
        <div className="max-h-72 space-y-0.5 overflow-auto" role="listbox" aria-label="Polices">
          {[
            ...documentFonts.map((f) => ({ label: f.label, value: f.value, family: undefined as string | undefined, tag: "Ton carrousel" })),
            ...["Arial, sans-serif", "Georgia, serif", "Verdana, sans-serif", "Trebuchet MS, sans-serif"].map((f) => ({ label: f.split(",")[0], value: f, family: undefined as string | undefined, tag: "Classique" })),
            ...GOOGLE_FONTS.map((f) => ({
              label: f.family,
              value: `'${f.family}', ${f.kind === "serif" ? "serif" : f.kind === "script" ? "cursive" : "sans-serif"}`,
              family: f.family as string | undefined,
              tag: { serif: "Serif", sans: "Sans", display: "Affiche", script: "Manuscrite" }[f.kind],
            })),
          ]
            .filter((f) => f.label.toLowerCase().includes(fontQuery.toLowerCase()))
            .map((f) => (
              <button
                key={`${f.tag}-${f.value}`}
                type="button"
                role="option"
                aria-selected={(css["font-family"] || "") === f.value || (!!f.family && (css["font-family"] || "").includes(f.family))}
                onClick={() => pickFont(f.value, f.family)}
                className="flex w-full items-baseline justify-between rounded px-2 py-1.5 text-left hover:bg-muted aria-selected:bg-primary/10"
              >
                <span style={{ fontFamily: f.value, fontSize: 18 }}>{f.label}</span>
                <span className="text-2xs text-muted-foreground">{f.tag}</span>
              </button>
            ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
