import { useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Sparkles, X } from "lucide-react";
import { GOOGLE_FONTS_LIST } from "@/lib/google-fonts-list";
import { FONT_COMBOS } from "@/lib/charter-fonts";
import { toast } from "sonner";

// Fonts validées par le coaching IA (cohérence visuelle garantie sur les exports)
const AI_RECOMMENDED_FONTS = new Set([
  "Inter", "Poppins", "Montserrat", "Playfair Display", "Libre Baskerville",
  "Lora", "Raleway", "Open Sans", "Nunito", "DM Sans", "Space Grotesk",
  "Outfit", "Cormorant Garamond", "Josefin Sans", "Work Sans",
]);

function loadGoogleFont(font: string) {
  const id = `gf-${font.replace(/\s+/g, "-")}`;
  if (document.getElementById(id)) return;
  const link = document.createElement("link");
  link.id = id;
  link.rel = "stylesheet";
  link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(font)}:wght@400;700&display=swap`;
  document.head.appendChild(link);
}

function FontAutocomplete({ label, value, onChange, allowEmpty }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  allowEmpty?: boolean;
}) {
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => { setQuery(value); }, [value]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filtered = GOOGLE_FONTS_LIST.filter(f =>
    f.toLowerCase().includes(query.toLowerCase())
  )
    // AI-recommended remontées en premier
    .sort((a, b) => Number(AI_RECOMMENDED_FONTS.has(b)) - Number(AI_RECOMMENDED_FONTS.has(a)))
    .slice(0, 12);

  const selectFont = (font: string) => {
    loadGoogleFont(font);
    onChange(font);
    setQuery(font);
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative">
      <label className="text-sm font-medium text-foreground mb-1.5 block">{label}</label>
      <Input
        value={query}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder="Tape pour chercher une police Google Fonts…"
        className="text-sm"
      />
      {allowEmpty && query && (
        <button
          onClick={() => { onChange(""); setQuery(""); }}
          className="absolute right-3 top-[38px] text-muted-foreground hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
      {open && filtered.length > 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-xl border border-border bg-card shadow-lg max-h-60 overflow-y-auto">
          {filtered.map(font => {
            loadGoogleFont(font);
            return (
              <button
                key={font}
                onMouseDown={(e) => { e.preventDefault(); selectFont(font); }}
                className="w-full text-left px-3 py-2.5 hover:bg-muted/50 transition-colors flex items-center justify-between gap-3"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-medium text-foreground">{font}</span>
                    {AI_RECOMMENDED_FONTS.has(font) && (
                      <Sparkles className="h-3 w-3 text-primary" aria-label="Recommandée par l'IA" />
                    )}
                  </div>
                  <p
                    style={{ fontFamily: `'${font}', sans-serif`, fontWeight: 400 }}
                    className="text-sm text-muted-foreground truncate mt-0.5"
                  >
                    Communique sans te trahir
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      )}
      {value && (
        <p
          className="mt-2 text-base text-muted-foreground"
          style={{ fontFamily: `'${value}', sans-serif` }}
        >
          Communique sans te trahir
        </p>
      )}
    </div>
  );
}

interface CharterData {
  font_title: string;
  font_body: string;
  font_accent: string | null;
  font_rationale?: string | null;
  [key: string]: any;
}

interface CharterTypographySectionProps {
  data: CharterData;
  onDataChange: (updates: Partial<CharterData>) => void;
  toneKeywords: string[];
}

const UNIVERSAL_COMBO_NAMES = ["Moderne & Clean", "Chaleureux & Accessible", "Classique Élégant"];

function pickSuggestedCombos(toneKeywords: string[]) {
  const normalized = toneKeywords.map(k => k.toLowerCase().trim()).filter(Boolean);

  if (normalized.length === 0) {
    return FONT_COMBOS.filter(c => UNIVERSAL_COMBO_NAMES.includes(c.name)).slice(0, 3);
  }

  const scored = FONT_COMBOS.map(combo => {
    const score = combo.tone_match.reduce(
      (acc, m) => acc + (normalized.some(n => n.includes(m) || m.includes(n)) ? 1 : 0),
      0,
    );
    return { combo, score };
  });

  const matched = scored.filter(s => s.score > 0).sort((a, b) => b.score - a.score).map(s => s.combo);
  if (matched.length >= 3) return matched.slice(0, 3);

  // Compléter avec les universels manquants
  const remaining = FONT_COMBOS.filter(
    c => UNIVERSAL_COMBO_NAMES.includes(c.name) && !matched.includes(c),
  );
  return [...matched, ...remaining].slice(0, 3);
}

export default function CharterTypographySection({ data, onDataChange, toneKeywords }: CharterTypographySectionProps) {
  const suggestions = pickSuggestedCombos(toneKeywords || []);

  const applyCombo = (combo: typeof FONT_COMBOS[number]) => {
    loadGoogleFont(combo.title);
    loadGoogleFont(combo.body);
    onDataChange({ font_title: combo.title, font_body: combo.body });
    toast.success(`Duo "${combo.name}" appliqué`);
  };

  const isActive = (combo: typeof FONT_COMBOS[number]) =>
    data.font_title === combo.title && data.font_body === combo.body;

  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <h2 className="font-display text-base font-bold text-foreground mb-4">🔤 Mes typographies</h2>
      <div className="space-y-5">
        {([
          ["font_title", "Police titres"] as const,
          ["font_body", "Police corps de texte"] as const,
        ]).map(([key, label]) => (
          <FontAutocomplete
            key={key}
            label={label}
            value={data[key]}
            onChange={(v) => { onDataChange({ [key]: v }); loadGoogleFont(v); }}
          />
        ))}
        <FontAutocomplete
          label="Police accent (optionnel)"
          value={data.font_accent || ""}
          onChange={(v) => { onDataChange({ font_accent: v || null }); if (v) loadGoogleFont(v); }}
          allowEmpty
        />
      </div>

      {suggestions.length > 0 && (
        <div className="mt-6 pt-5 border-t border-border">
          <p className="text-xs font-medium text-muted-foreground mb-3">
            💡 {toneKeywords?.length ? "Suggestions adaptées à ton ton" : "Duos qui marchent à tous les coups"}
          </p>
          <div className="grid gap-2.5">
            {suggestions.map((combo) => {
              const active = isActive(combo);
              // Load fonts immédiatement pour que le preview s'affiche correctement
              loadGoogleFont(combo.title);
              loadGoogleFont(combo.body);
              return (
                <button
                  key={combo.name}
                  type="button"
                  onClick={() => applyCombo(combo)}
                  className={`text-left rounded-xl border p-3 transition-all hover:border-primary/40 hover:bg-muted/30 ${
                    active ? "border-primary bg-primary/5" : "border-border"
                  }`}
                >
                  <div className="flex items-baseline justify-between gap-3 mb-1">
                    <span className="text-xs font-medium text-foreground">{combo.name}</span>
                    {active && <span className="text-[10px] text-primary font-medium">Sélectionné</span>}
                  </div>
                  <div className="flex items-baseline gap-3 mb-1.5">
                    <span
                      className="text-lg text-foreground truncate"
                      style={{ fontFamily: `'${combo.title}', serif`, fontWeight: 700 }}
                    >
                      {combo.title}
                    </span>
                    <span className="text-xs text-muted-foreground">+</span>
                    <span
                      className="text-sm text-muted-foreground truncate"
                      style={{ fontFamily: `'${combo.body}', sans-serif` }}
                    >
                      {combo.body}
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground/80 leading-snug">{combo.description}</p>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
