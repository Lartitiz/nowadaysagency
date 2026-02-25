import { useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { X } from "lucide-react";
import { GOOGLE_FONTS_LIST } from "@/lib/google-fonts-list";
import { FONT_COMBOS } from "@/lib/charter-fonts";
import { toast } from "sonner";

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
  ).slice(0, 12);

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
                  <span className="text-xs font-medium text-foreground">{font}</span>
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
  [key: string]: any;
}

interface CharterTypographySectionProps {
  data: CharterData;
  onDataChange: (updates: Partial<CharterData>) => void;
  toneKeywords: string[];
}

export default function CharterTypographySection({ data, onDataChange, toneKeywords }: CharterTypographySectionProps) {
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

      {/* Font combo suggestions */}
      <div className="mt-5 pt-5 border-t border-border">
        <h3 className="text-sm font-semibold text-foreground mb-1">💡 Combinaisons typographiques suggérées</h3>
        {toneKeywords.length === 0 ? (
          <p className="text-xs text-muted-foreground mb-3">
            Remplis ta section <a href="/branding/voice" className="text-primary hover:underline">Ma voix & mes combats</a> pour des suggestions personnalisées.
          </p>
        ) : (
          <p className="text-xs text-muted-foreground mb-3">Basées sur ton style de voix</p>
        )}
        <div className="space-y-2">
          {(() => {
            const scored = FONT_COMBOS.map(combo => {
              const score = toneKeywords.length > 0
                ? combo.tone_match.filter(t => toneKeywords.some(tk => tk.includes(t) || t.includes(tk))).length
                : 0;
              return { ...combo, score };
            });
            const sorted = [...scored].sort((a, b) => b.score - a.score);
            const toShow = toneKeywords.length > 0 ? sorted.slice(0, 3) : sorted;
            toShow.forEach(c => { loadGoogleFont(c.title); loadGoogleFont(c.body); });
            return toShow.map(combo => (
              <button
                key={combo.name}
                onClick={() => {
                  onDataChange({ font_title: combo.title, font_body: combo.body });
                  loadGoogleFont(combo.title);
                  loadGoogleFont(combo.body);
                  toast.success(`Combo "${combo.name}" appliqué !`);
                }}
                className="w-full rounded-xl border border-border hover:border-primary/50 bg-background p-4 text-left transition-all hover:shadow-sm"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-foreground">{combo.name}</span>
                  {combo.score > 0 && (
                    <span className="text-[10px] text-primary font-medium">✦ Recommandé</span>
                  )}
                </div>
                <p style={{ fontFamily: `'${combo.title}', serif`, fontWeight: 700 }} className="text-base text-foreground leading-tight mb-1">
                  Communique sans te trahir
                </p>
                <p style={{ fontFamily: `'${combo.body}', sans-serif` }} className="text-sm text-muted-foreground leading-snug mb-2">
                  Et voici le corps de texte pour voir le contraste entre les deux polices.
                </p>
                <p className="text-[10px] text-muted-foreground">{combo.description}</p>
              </button>
            ));
          })()}
        </div>
      </div>
    </section>
  );
}
