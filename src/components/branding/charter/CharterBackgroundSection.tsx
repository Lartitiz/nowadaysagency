/**
 * CharterBackgroundSection — choix du fond des visuels générés :
 * aplat uni (color_background) ou « matière » (texture papier/lin générée
 * une fois par marque via l'edge recraft-texture, teintée sur la charte).
 */

import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { invokeWithTimeout } from "@/lib/invoke-with-timeout";

export const TEXTURE_MATERIALS = [
  { key: "papier_grain", label: "Papier grainé", desc: "grain fin, discret" },
  { key: "papier_craft", label: "Papier craft", desc: "chaleureux, artisanal" },
  { key: "lin", label: "Lin", desc: "tissu naturel" },
  { key: "papier_recycle", label: "Papier recyclé", desc: "fibres visibles" },
  { key: "grain_mineral", label: "Minéral doux", desc: "pierre claire" },
] as const;

interface CharterBackgroundSectionProps {
  textureEnabled: boolean;
  textureMaterial: string | null;
  textureUrl: string | null;
  colorBackground: string | null;
  workspaceIdForApi: string | null;
  onDataChange: (updates: { texture_enabled?: boolean; texture_material?: string | null; texture_url?: string | null }) => void;
}

export default function CharterBackgroundSection({
  textureEnabled,
  textureMaterial,
  textureUrl,
  colorBackground,
  workspaceIdForApi,
  onDataChange,
}: CharterBackgroundSectionProps) {
  const [generating, setGenerating] = useState(false);

  const handleGenerate = async () => {
    if (!textureMaterial) {
      toast.error("Choisis d'abord une matière");
      return;
    }
    setGenerating(true);
    try {
      const { data, error } = await invokeWithTimeout(
        "recraft-texture",
        {
          body: {
            material: textureMaterial,
            ...(workspaceIdForApi ? { workspace_id: workspaceIdForApi } : {}),
          },
        },
        90_000,
      );
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      if (!data?.texture_url) throw new Error("Réponse inattendue du serveur");

      onDataChange({ texture_url: data.texture_url, texture_enabled: true });
      toast.success("Texture générée ! Tes prochains visuels l'utiliseront.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "La génération de la texture a échoué, réessaie.");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <h2 className="font-display text-base font-bold text-foreground mb-1">🧵 Fond de tes visuels</h2>
      <p className="text-xs text-muted-foreground mb-4">
        Le fond utilisé par l'IA pour tes carrousels : un aplat de ta couleur de fond, ou une matière
        (papier, lin…) générée une seule fois aux couleurs de ta marque.
      </p>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <button
          type="button"
          onClick={() => onDataChange({ texture_enabled: false })}
          className={cn(
            "rounded-xl border-2 p-3 text-left transition-colors",
            !textureEnabled ? "border-primary bg-primary/5" : "border-border hover:border-primary/40",
          )}
        >
          <div
            className="h-10 w-full rounded-lg border border-border mb-2"
            style={{ background: colorBackground || "#F6F4F0" }}
          />
          <span className="text-sm font-medium text-foreground">Uni</span>
          <p className="text-xs text-muted-foreground">Ta couleur de fond, simple et net</p>
        </button>

        <button
          type="button"
          onClick={() => onDataChange({ texture_enabled: true })}
          className={cn(
            "rounded-xl border-2 p-3 text-left transition-colors",
            textureEnabled ? "border-primary bg-primary/5" : "border-border hover:border-primary/40",
          )}
        >
          {textureUrl ? (
            <img
              src={textureUrl}
              alt="Texture de marque"
              className="h-10 w-full rounded-lg border border-border object-cover mb-2"
            />
          ) : (
            <div
              className="h-10 w-full rounded-lg border border-dashed border-border mb-2 flex items-center justify-center text-[10px] text-muted-foreground"
              style={{ background: colorBackground || "#F6F4F0" }}
            >
              à générer
            </div>
          )}
          <span className="text-sm font-medium text-foreground">Matière</span>
          <p className="text-xs text-muted-foreground">Texture papier aux couleurs de ta marque</p>
        </button>
      </div>

      {textureEnabled && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {TEXTURE_MATERIALS.map((m) => {
              const selected = textureMaterial === m.key;
              return (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => onDataChange({ texture_material: m.key })}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-xs transition-colors",
                    selected
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border text-foreground hover:border-primary/40",
                  )}
                  title={m.desc}
                >
                  {m.label}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-3">
            <Button onClick={handleGenerate} disabled={generating || !textureMaterial} size="sm">
              {generating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Génération en cours…
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  {textureUrl ? "Régénérer ma texture" : "Générer ma texture"}
                </>
              )}
            </Button>
            <span className="text-xs text-muted-foreground">1 crédit retouche photo, une seule fois</span>
          </div>

          {!textureUrl && (
            <p className="text-xs text-muted-foreground">
              Tant que la texture n'est pas générée, tes visuels gardent le fond uni.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
