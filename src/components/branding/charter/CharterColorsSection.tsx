import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Slider } from "@/components/ui/slider";
import { X, Plus, Sparkles, ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { type Emotion, type Universe, type StyleAxis, type GeneratedPalette } from "@/lib/charter-palette-generator";
import { SECTOR_PALETTES, DEFAULT_SECTOR } from "@/lib/charter-palettes";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface CharterData {
  color_primary: string;
  color_secondary: string;
  color_accent: string;
  color_background: string;
  color_text: string;
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
  setSectorPalettesOpen,
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
      color_text: colors.text,
    });
  };

  const handleGeneratePalettes = async () => {
    if (!selectedUniverse || selectedEmotions.length === 0) return;
    setIsGenerating(true);
    toast.info("Appel à l'IA en cours…");
    try {
      const { data: result, error } = await supabase.functions.invoke("palette-ai", {
        body: { emotions: selectedEmotions, universe: selectedUniverse, styleAxes, userSector },
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
          {([
            ["color_primary", "Primaire"],
            ["color_secondary", "Secondaire"],
            ["color_accent", "Accent"],
            ["color_background", "Fond"],
            ["color_text", "Texte"],
          ] as const).map(([key, label]) => (
            <div key={key} className="flex items-center gap-3">
              <input
                type="color"
                value={data[key]}
                onChange={e => onDataChange({ [key]: e.target.value })}
                className="w-10 h-10 rounded-lg border border-border cursor-pointer p-0.5"
              />
              <span className="text-sm text-foreground font-medium w-24">{label}</span>
              <span className="font-mono text-xs text-muted-foreground uppercase">{data[key]}</span>
            </div>
          ))}

          {data.custom_colors.map((color: string, idx: number) => (
            <div key={idx} className="flex items-center gap-3">
              <input
                type="color"
                value={color}
                onChange={e => {
                  const newColors = [...data.custom_colors];
                  newColors[idx] = e.target.value;
                  onDataChange({ custom_colors: newColors });
                }}
                className="w-10 h-10 rounded-lg border border-border cursor-pointer p-0.5"
              />
              <span className="text-sm text-foreground font-medium w-24">Custom {idx + 1}</span>
              <span className="font-mono text-xs text-muted-foreground uppercase">{color}</span>
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
          {[data.color_primary, data.color_secondary, data.color_accent, data.color_background, data.color_text, ...data.custom_colors].map((c: string, i: number) => (
            <div
              key={i}
              className="w-10 h-10 rounded-full border-2 border-background shadow-sm"
              style={{ backgroundColor: c }}
              title={c}
            />
          ))}
        </div>

        {/* Palette Questionnaire */}
        <div className="mt-5 pt-5 border-t border-border space-y-5">
          <h3 className="text-sm font-semibold text-foreground">✨ Génère ta palette personnalisée</h3>

          {/* Q1: Emotions */}
          <div>
            <p className="text-xs font-medium text-foreground mb-2">Quelle émotion principale veux-tu transmettre ? <span className="text-muted-foreground">(max 2)</span></p>
            <div className="flex flex-wrap gap-2">
              {([
                { id: "confidence" as Emotion, label: "🌟 Confiance et expertise" },
                { id: "warmth" as Emotion, label: "💛 Chaleur et proximité" },
                { id: "energy" as Emotion, label: "⚡ Énergie et audace" },
                { id: "calm" as Emotion, label: "🌿 Calme et sérénité" },
                { id: "creativity" as Emotion, label: "🎨 Créativité et originalité" },
                { id: "engagement" as Emotion, label: "✊ Engagement et conviction" },
              ]).map(opt => {
                const selected = selectedEmotions.includes(opt.id);
                return (
                  <button
                    key={opt.id}
                    onClick={() => {
                      if (selected) {
                        setSelectedEmotions(prev => prev.filter(e => e !== opt.id));
                      } else if (selectedEmotions.length < 2) {
                        setSelectedEmotions(prev => [...prev, opt.id]);
                      }
                    }}
                    className={`text-xs px-3 py-1.5 rounded-full border transition-all ${selected ? "border-primary bg-primary/10 text-primary font-medium" : "border-border text-muted-foreground hover:border-primary/40"}`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Q2: Universe */}
          <div>
            <p className="text-xs font-medium text-foreground mb-2">Quel univers visuel te parle le plus ?</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {([
                { id: "warm" as Universe, label: "Tons chauds", desc: "terracotta, miel, rouille", swatches: ["#C4724E", "#D4A574", "#8B6F47", "#F5F0EB", "#3D2E24"] },
                { id: "cool" as Universe, label: "Tons froids", desc: "bleu, vert sauge, gris", swatches: ["#6B8FA3", "#8B9E7E", "#B8CDD6", "#F8FAFB", "#2C3E4A"] },
                { id: "pop" as Universe, label: "Pop & coloré", desc: "rose, jaune, bleu électrique", swatches: ["#E91E8C", "#FFE561", "#6C63FF", "#FFFFFF", "#1A1A2E"] },
                { id: "minimal" as Universe, label: "Minimaliste & neutre", desc: "noir, blanc, beige", swatches: ["#2C2C2C", "#E8E8E8", "#C4956A", "#FFFFFF", "#1A1A1A"] },
                { id: "nature" as Universe, label: "Nature & organique", desc: "vert forêt, brun, crème", swatches: ["#5C7A6E", "#8B6F47", "#A8C5B8", "#F5FAF7", "#2D3E36"] },
              ]).map(opt => (
                <button
                  key={opt.id}
                  onClick={() => setSelectedUniverse(opt.id)}
                  className={`text-left rounded-xl border p-3 transition-all ${selectedUniverse === opt.id ? "border-primary bg-primary/5 ring-1 ring-primary/20" : "border-border hover:border-primary/40"}`}
                >
                  <div className="flex items-center gap-1.5 mb-1.5">
                    {opt.swatches.map((c, i) => (
                      <div key={i} className="w-4 h-4 rounded-md border border-border" style={{ backgroundColor: c }} />
                    ))}
                  </div>
                  <p className="text-xs font-medium text-foreground">{opt.label}</p>
                  <p className="text-[10px] text-muted-foreground">{opt.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Q3: Style sliders */}
          <div>
            <p className="text-xs font-medium text-foreground mb-3">Tu préfères un style plutôt…</p>
            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-[10px] text-muted-foreground mb-1.5">
                  <span>Doux et féminin</span>
                  <span>Bold et affirmé</span>
                </div>
                <Slider value={[styleAxes.softBold]} min={0} max={100} step={5} onValueChange={([v]) => setStyleAxes(prev => ({ ...prev, softBold: v }))} />
              </div>
              <div>
                <div className="flex justify-between text-[10px] text-muted-foreground mb-1.5">
                  <span>Classique et intemporel</span>
                  <span>Moderne et tendance</span>
                </div>
                <Slider value={[styleAxes.classicModern]} min={0} max={100} step={5} onValueChange={([v]) => setStyleAxes(prev => ({ ...prev, classicModern: v }))} />
              </div>
            </div>
          </div>

          {/* Generate button */}
          <Button
            size="sm"
            className="w-full gap-2"
            disabled={selectedEmotions.length === 0 || !selectedUniverse || isGenerating}
            onClick={handleGeneratePalettes}
          >
            {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {isGenerating ? "Génération en cours…" : "Générer mes palettes"}
          </Button>

          {/* Generated palettes */}
          {generatedPalettes.length > 0 && (
            <div className="space-y-3 pt-2">
              <p className="text-xs font-semibold text-foreground">🎨 Tes palettes personnalisées</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {generatedPalettes.map((palette, idx) => (
                  <div key={idx} className="rounded-xl border border-border bg-background p-3 space-y-2">
                    <div className="flex items-center gap-1.5">
                      {Object.values(palette.colors).map((c, i) => (
                        <div key={i} className="w-7 h-7 rounded-lg border border-border" style={{ backgroundColor: c }} title={c} />
                      ))}
                    </div>
                    <p className="text-xs font-medium text-foreground">{palette.name}</p>
                    {(palette as any).explanation && (
                      <p className="text-[10px] text-muted-foreground leading-relaxed">{(palette as any).explanation}</p>
                    )}
                    <div className="flex gap-1.5">
                      <Button
                        size="sm"
                        variant="default"
                        className="flex-1 text-[10px] h-7"
                        onClick={() => {
                          applyPalette(palette.colors);
                          toast.success("Palette appliquée !");
                        }}
                      >
                        Appliquer
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1 text-[10px] h-7"
                        onClick={() => {
                          applyPalette(palette.colors);
                          toast.success("Palette chargée — personnalise les couleurs ci-dessus.");
                          window.scrollTo({ top: 0, behavior: "smooth" });
                        }}
                      >
                        Personnaliser
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Collapsible sector palettes */}
          <Collapsible open={sectorPalettesOpen} onOpenChange={setSectorPalettesOpen}>
            <CollapsibleTrigger asChild>
              <button className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mt-2">
                {sectorPalettesOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                Voir les palettes par secteur d'activité
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-3">
              <p className="text-xs text-muted-foreground mb-2">Secteur détecté : <span className="font-medium text-foreground">{userSector}</span></p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {(SECTOR_PALETTES[userSector] || SECTOR_PALETTES[DEFAULT_SECTOR]).map((palette) => (
                  <button
                    key={palette.name}
                    onClick={() => {
                      applyPalette(palette.colors);
                      toast.success("Palette appliquée !");
                    }}
                    className="rounded-xl border border-border hover:border-primary/50 bg-background p-3 text-left transition-all hover:shadow-sm"
                  >
                    <div className="flex items-center gap-1.5 mb-2">
                      {[palette.colors.primary, palette.colors.secondary, palette.colors.accent, palette.colors.background, palette.colors.text].map((c, i) => (
                        <div key={i} className="w-5 h-5 rounded-lg border border-border" style={{ backgroundColor: c }} />
                      ))}
                    </div>
                    <p className="text-xs font-medium text-foreground">{palette.name}</p>
                  </button>
                ))}
              </div>
              <Button variant="ghost" size="sm" onClick={() => setAllPalettesOpen(true)} className="text-xs text-muted-foreground mt-3">
                Voir toutes les palettes →
              </Button>
            </CollapsibleContent>
          </Collapsible>
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
