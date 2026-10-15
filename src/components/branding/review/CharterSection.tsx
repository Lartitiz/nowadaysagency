import { useState } from "react";
import { Pencil, X, Check } from "lucide-react";
import type { AnalysisResult, CharterData } from "./types";
import { Chip } from "./ReviewBits";

export const CHARTER_COLOR_SLOTS = [
  { key: "color_primary", label: "Primaire" },
  { key: "color_secondary", label: "Secondaire" },
  { key: "color_accent", label: "Accent" },
  { key: "color_background", label: "Fond" },
] as const;

export function normalizeHex(v: string | undefined | null): string | null {
  let s = (v || "").trim();
  if (!s) return null;
  if (!s.startsWith("#")) s = `#${s}`;
  if (/^#[0-9a-fA-F]{3}$/.test(s)) s = `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`;
  return /^#[0-9a-fA-F]{6}$/.test(s) ? s.toUpperCase() : null;
}

export function CharterSection({ data, onUpdate }: { data: AnalysisResult["charter"]; onUpdate?: (charter: CharterData) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<CharterData>({});
  if (!data) return null;

  const colors = CHARTER_COLOR_SLOTS
    .map((s) => ({ label: s.label as string, hex: data[s.key] }))
    .filter((c): c is { label: string; hex: string } => !!c.hex);

  // Honnêteté sur la provenance : « détectées » SEULEMENT si elles sortent
  // vraiment du CSS du site (confidence high). En low, l'IA a proposé une
  // palette d'ambiance (cf prompt diagnostic-enrichment) — la présenter comme
  // détectée faisait passer une invention pour une lecture du site.
  const conf = data.confidence || "low";
  const colorsTitle = conf === "high"
    ? "Couleurs détectées sur ton site"
    : conf === "medium"
      ? "Couleurs estimées depuis ton logo / aperçu"
      : "Palette proposée d'après ton univers";

  const startEdit = () => {
    setDraft({ ...data });
    setEditing(true);
  };
  const cancelEdit = () => { setEditing(false); setDraft({}); };
  const confirmEdit = () => {
    if (onUpdate) {
      const cleaned: CharterData = { ...draft };
      for (const slot of CHARTER_COLOR_SLOTS) {
        const norm = normalizeHex(draft[slot.key]);
        if (norm) cleaned[slot.key] = norm; else delete cleaned[slot.key];
      }
      cleaned.font_title = (draft.font_title || "").trim() || undefined;
      cleaned.font_body = (draft.font_body || "").trim() || undefined;
      onUpdate(cleaned);
    }
    setEditing(false);
    setDraft({});
  };

  if (editing) {
    return (
      <div className="space-y-3">
        <p className="text-xs font-semibold text-bordeaux">Tes couleurs</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {CHARTER_COLOR_SLOTS.map((slot) => {
            const valid = normalizeHex(draft[slot.key]);
            return (
              <div key={slot.key} className="flex items-center gap-2.5 p-2.5 rounded-[10px] border border-border bg-background">
                {/* input color natif : pipette + palette système, aucune dépendance */}
                <input
                  type="color"
                  value={valid || "#CCCCCC"}
                  onChange={(e) => setDraft((d) => ({ ...d, [slot.key]: e.target.value.toUpperCase() }))}
                  className="w-9 h-9 rounded-[8px] border border-border cursor-pointer bg-transparent p-0.5"
                  aria-label={`Choisir la couleur ${slot.label.toLowerCase()}`}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-foreground mb-0.5">{slot.label}</p>
                  <input
                    value={draft[slot.key] || ""}
                    onChange={(e) => setDraft((d) => ({ ...d, [slot.key]: e.target.value }))}
                    placeholder="#A1B2C3 (vide = retirer)"
                    className={`w-full text-xs font-mono border rounded-lg px-2 py-1 bg-background focus:outline-none focus:ring-1 focus:ring-primary ${draft[slot.key] && !valid ? "border-destructive" : "border-border"}`}
                  />
                </div>
              </div>
            );
          })}
        </div>
        <p className="text-xs font-semibold text-bordeaux pt-1">Typographies</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <input value={draft.font_title || ""} onChange={(e) => setDraft((d) => ({ ...d, font_title: e.target.value }))} placeholder="Police des titres" className="w-full text-sm border border-border rounded-lg px-3 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-primary" />
          <input value={draft.font_body || ""} onChange={(e) => setDraft((d) => ({ ...d, font_body: e.target.value }))} placeholder="Police du texte courant" className="w-full text-sm border border-border rounded-lg px-3 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-primary" />
        </div>
        <div className="flex gap-3 pt-1">
          <button onClick={confirmEdit} className="inline-flex items-center gap-1 text-xs font-medium text-success"><Check className="h-3.5 w-3.5" /> OK</button>
          <button onClick={cancelEdit} className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /> Annuler</button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {colors.length > 0 ? (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <p className="text-xs font-semibold text-bordeaux">{colorsTitle}</p>
            {onUpdate && (
              <button onClick={startEdit} className="inline-flex items-center gap-1 text-xs font-medium text-primary-text hover:underline" title="Modifier les couleurs et typos">
                <Pencil className="h-3 w-3" /> Modifier
              </button>
            )}
          </div>
          {conf !== "high" && (
            <p className="text-xs text-muted-foreground mb-2">
              Je n'ai pas pu lire les couleurs exactes de ton site — celles-ci sont une proposition. Corrige-les ici si ce ne sont pas les tiennes.
            </p>
          )}
          <div className="flex flex-wrap gap-3">
            {colors.map((c, i) => (
              <div key={i} className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-[8px] border border-border shadow-sm" style={{ backgroundColor: c.hex }} />
                <div>
                  <p className="text-xs font-medium text-foreground">{c.label}</p>
                  <p className="text-2xs text-muted-foreground font-mono">{c.hex}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="rounded-[10px] bg-muted/50 border border-border px-3 py-2.5">
          <p className="text-xs text-muted-foreground">
            On n'a pas réussi à détecter automatiquement tes couleurs depuis ton site
            (elles sont parfois dans des fichiers que l'analyse ne peut pas lire).
            {onUpdate ? " Tu peux les saisir directement ici :" : " Tu pourras les ajouter en un clic : ou uploader ton logo : dans ta charte graphique."}
          </p>
          {onUpdate && (
            <button onClick={startEdit} className="inline-flex items-center gap-1 text-xs font-medium text-primary-text hover:underline mt-1.5">
              <Pencil className="h-3 w-3" /> Ajouter mes couleurs
            </button>
          )}
        </div>
      )}
      {(data.font_title || data.font_body) && (
        <div>
          <p className="text-xs font-semibold text-bordeaux mb-1">Typographies</p>
          <div className="flex flex-wrap gap-1.5">
            {data.font_title && <Chip>Titres : {data.font_title}</Chip>}
            {data.font_body && <Chip>Corps : {data.font_body}</Chip>}
          </div>
        </div>
      )}
      {data.mood_keywords?.length ? (
        <div>
          <p className="text-xs font-semibold text-bordeaux mb-1">Ambiance</p>
          <div className="flex flex-wrap gap-1.5">{data.mood_keywords.map((k, i) => <Chip key={i}>{k}</Chip>)}</div>
        </div>
      ) : null}
      {data.visual_style_description && <p className="text-sm text-muted-foreground italic">{data.visual_style_description}</p>}
    </div>
  );
}
