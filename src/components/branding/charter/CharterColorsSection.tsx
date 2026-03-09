import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Slider } from "@/components/ui/slider";
import { X, Plus, Sparkles, ChevronDown, ChevronUp, Loader2, HelpCircle } from "lucide-react";
import { type Emotion, type Universe, type StyleAxis, type GeneratedPalette } from "@/lib/charter-palette-generator";
import { SECTOR_PALETTES, DEFAULT_SECTOR } from "@/lib/charter-palettes";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

const NEUTRAL_FALLBACKS: Record<string, string> = {
  color_primary: "#888888",
  color_secondary: "#555555",
  color_accent: "#AAAAAA",
  color_background: "#FFFFFF",
  color_text: "#333333",
};

const COLOR_LABELS: Record<string, { label: string; tooltip: string }> = {
  color_primary: { label: "Ma couleur signature", tooltip: "La couleur principale de ta marque, celle qu'on reconnaît au premier coup d'œil" },
  color_secondary: { label: "Ma couleur complémentaire", tooltip: "Elle accompagne ta couleur signature pour créer du contraste et de la richesse" },
  color_accent: { label: "Ma couleur d'accentuation", tooltip: "Pour les boutons, liens, éléments qu'on veut faire ressortir" },
  color_background: { label: "Mon fond", tooltip: "La couleur d'arrière-plan de tes visuels et de ton site" },
  color_text: { label: "Mon texte", tooltip: "La couleur principale de tes textes" },
};

function ColorTooltip({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-flex items-center">
      <button
        type="button"
        className="text-muted-foreground hover:text-foreground transition-colors"
        onClick={() => setOpen((v) => !v)}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        aria-label="Aide"
      >
        <HelpCircle className="h-3.5 w-3.5" />
      </button>
      {open && (
        <span className="absolute left-6 top-1/2 -translate-y-1/2 z-50 max-w-[220px] rounded-lg border border-border bg-card px-3 py-2 text-xs text-muted-foreground shadow-md animate-fade-in">
          {text}
        </span>
      )}
    </span>
  );
}

interface CharterData {
  color_primary: string | null;
  color_secondary: string | null;
  color_accent: string | null;
  color_background: string | null;
  color_text: string | null;
  custom_colors: string[];
  [key: string]: any;
}

interface CharterColorsSectionProps {
  data: CharterData;
  onDataChange: (updates: Partial<CharterData>) => void;
  userSector: string;
  selectedEmotions: Emotion[];
  setSelectedEmotions: React.Dispatch<React.SetStateAction<Emotion[]>>;
  selectedUniverse: Universe | null;
  setSelectedUniverse: React.Dispatch<React.SetStateAction<Universe | null>>;
  styleAxes: StyleAxis;
  setStyleAxes: React.Dispatch<React.SetStateAction<StyleAxis>>;
  generatedPalettes: GeneratedPalette[];
  setGeneratedPalettes: React.Dispatch<React.SetStateAction<GeneratedPalette[]>>;
  allPalettesOpen: boolean;
  setAllPalettesOpen: React.Dispatch<React.SetStateAction<boolean>>;
  sectorPalettesOpen: boolean;
  setSectorPalettesOpen: React.Dispatch<React.SetStateAction<boolean>>;
}

export default function CharterColorsSection({
  data,
  onDataChange,
  userSector,
  selectedEmotions,
  setSelectedEmotions,
  selectedUniverse,
  setSelectedUniverse,
  styleAxes,
  setStyleAxes,
  generatedPalettes,
  setGeneratedPalettes,
  allPalettesOpen,
  setAllPalettesOpen,
  sectorPalettesOpen,
  setSectorPalettesOpen
}: CharterColorsSectionProps) {
  const [isGenerating, setIsGenerating] = useState(false);

  const addCustomColor = () => {
    if (data.custom_colors.length >= 5) {
      toast.info("Maximum 5 couleurs supplémentaires");
      return;
    }
    onDataChange({ custom_colors: [...data.custom_colors, "#cccccc"] });
  };

  const removeCustomColor = (idx: number) => {
    onDataChange({ custom_colors: data.custom_colors.filter((_: string, i: number) => i !== idx) });
  };

  const applyPalette = (colors: { primary: string; secondary: string; accent: string; background: string; text: string }) => {
    onDataChange({
      color_primary: colors.primary,
      color_secondary: colors.secondary,
      color_accent: colors.accent,
      color_background: colors.background,
      color_text: colors.text
    });
  };

  const handleGeneratePalettes = async () => {
    if (!selectedUniverse || selectedEmotions.length === 0) return;
    setIsGenerating(true);
    toast.info("Appel à l'IA en cours…");
    try {
      const { data: result, error } = await supabase.functions.invoke("palette-ai", {
        body: { emotions: selectedEmotions, universe: selectedUniverse, styleAxes, userSector }
      });
      if (error) {
        const name = (error as any)?.name || "Error";
        const msg = (error as any)?.message || String(error);
        console.error("palette-ai invoke error:", name, msg, error);
        if (name === "FunctionsFetchError" || msg.includes("Failed to fetch")) {
          throw new Error("La fonction IA n'est pas accessible. Vérifie ta connexion ou réessaie.");
        }
        if (msg.includes("402") || msg.includes("Payment Required")) {
          throw new Error("Crédits IA insuffisants. Passe à un plan supérieur pour continuer.");
        }
        if (msg.includes("429") || msg.includes("Too Many Requests")) {
          throw new Error("Trop de requêtes. Attends quelques secondes puis réessaie.");
        }
        throw new Error(`Erreur serveur (${name}): ${msg}`);
      }
      if (result?.error) throw new Error(result.error);
      if (result?.palettes?.length) {
        setGeneratedPalettes(result.palettes);
        toast.success("Palettes générées par l'IA !");
      } else {
        console.error("palette-ai unexpected response:", result);
        throw new Error("Aucune palette reçue de l'IA");
      }
    } catch (e: any) {
      console.error("Palette generation error:", e?.name, e?.message, e);
      toast.error(e.message || "Erreur lors de la génération. Réessaie.");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <>
      <section className="rounded-2xl border border-border bg-card p-5">
        <h2 className="font-display text-base font-bold text-foreground mb-4">🎨 Ma palette de couleurs</h2>
        <div className="space-y-3">
          {(Object.keys(COLOR_LABELS) as Array<keyof typeof COLOR_LABELS>).map((key) => {
            const { label, tooltip } = COLOR_LABELS[key];
            return (
              <div key={key} className="flex items-center gap-3">
                <input
                  type="color"
                  value={data[key] || NEUTRAL_FALLBACKS[key] || "#888888"}
                  onChange={(e) => onDataChange({ [key]: e.target.value })}
                  className="w-10 h-10 rounded-lg border border-border cursor-pointer p-0.5"
                />
                <span className="text-sm text-foreground font-medium w-40 flex items-center gap-1.5">
                  {label}
                  <ColorTooltip text={tooltip} />
                </span>
                <input
                  type="text"
                  value={data[key] || ""}
                  placeholder="#000000"
                  onChange={(e) => {
                    let v = e.target.value;
                    if (v && !v.startsWith("#")) v = "#" + v;
                    if (v === "#" || /^#[0-9A-Fa-f]{0,6}$/.test(v)) {
                      onDataChange({ [key]: v });
                    }
                  }}
                  onBlur={(e) => {
                    const v = e.target.value;
                    if (v && !/^#[0-9A-Fa-f]{6}$/.test(v)) {
                      onDataChange({ [key]: data[key] });
                    }
                  }}
                  className="font-mono text-xs uppercase text-foreground bg-secondary/50 border border-border rounded-lg px-2 py-1.5 hover:border-primary/50 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/20 w-24 transition-colors"
                />
              </div>
            );
          })}

          {data.custom_colors.map((color: string, idx: number) => (
            <div key={idx} className="flex items-center gap-3">
              <input
                type="color"
                value={color}
                onChange={(e) => {
                  const newColors = [...data.custom_colors];
                  newColors[idx] = e.target.value;
                  onDataChange({ custom_colors: newColors });
                }}
                className="w-10 h-10 rounded-lg border border-border cursor-pointer p-0.5"
              />
              <span className="text-sm text-foreground font-medium w-40">Couleur perso {idx + 1}</span>
              <input
                type="text"
                value={color}
                onChange={(e) => {
                  let v = e.target.value;
                  if (v && !v.startsWith("#")) v = "#" + v;
                  if (v === "#" || /^#[0-9A-Fa-f]{0,6}$/.test(v)) {
                    const newColors = [...data.custom_colors];
                    newColors[idx] = v;
                    onDataChange({ custom_colors: newColors });
                  }
                }}
                className="font-mono text-xs uppercase text-foreground bg-secondary/50 border border-border rounded-lg px-2 py-1.5 hover:border-primary/50 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/20 w-24 transition-colors"
              />
              <button onClick={() => removeCustomColor(idx)} className="ml-auto text-muted-foreground hover:text-destructive">
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}

          {data.custom_colors.length < 5 && (
            <Button variant="outline" size="sm" onClick={addCustomColor} className="gap-1.5 text-xs">
              <Plus className="h-3.5 w-3.5" /> Ajouter une couleur
            </Button>
          )}
        </div>

        {/* Live preview */}
        <div className="flex items-center gap-2 mt-4 pt-4 border-t border-border">
          {[data.color_primary, data.color_secondary, data.color_accent, data.color_background, data.color_text, ...data.custom_colors].filter(Boolean).map((c: string | null, i: number) => (
            <div
              key={i}
              className="w-10 h-10 rounded-full border-2 border-background shadow-sm"
              style={{ backgroundColor: c || "#888" }}
              title={c || "Non défini"}
            />
          ))}
        </div>
      </section>

      {/* All palettes dialog */}
      <Dialog open={allPalettesOpen} onOpenChange={setAllPalettesOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Toutes les palettes</DialogTitle>
            <DialogDescription>Choisis une palette pour l'appliquer à ta charte graphique.</DialogDescription>
          </DialogHeader>
          <div className="space-y-5">
            {Object.entries(SECTOR_PALETTES).map(([sector, palettes]) => (
              <div key={sector}>
                <h4 className="text-sm font-semibold text-foreground mb-2">{sector}</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {palettes.map((palette) => (
                    <button
                      key={palette.name}
                      onClick={() => {
                        applyPalette(palette.colors);
                        toast.success("Palette appliquée ! Tu peux ajuster chaque couleur.");
                        setAllPalettesOpen(false);
                      }}
                      className="rounded-xl border border-border hover:border-primary/50 bg-background p-3 text-left transition-all hover:shadow-sm"
                    >
                      <div className="flex items-center gap-1.5 mb-1.5">
                        {[palette.colors.primary, palette.colors.secondary, palette.colors.accent, palette.colors.background, palette.colors.text].map((c, i) => (
                          <div key={i} className="w-5 h-5 rounded-full border border-border" style={{ backgroundColor: c }} />
                        ))}
                      </div>
                      <p className="text-xs font-medium text-foreground">{palette.name}</p>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
