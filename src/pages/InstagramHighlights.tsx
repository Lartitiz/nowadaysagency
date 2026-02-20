import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import AppHeader from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Check, Star } from "lucide-react";
import { Link } from "react-router-dom";

const ALL_CATEGORIES = [
  { id: "about", label: "À propos", emoji: "👋" },
  { id: "offers", label: "Offres / Boutique", emoji: "🛍️" },
  { id: "testimonials", label: "Témoignages", emoji: "💬" },
  { id: "behind", label: "Coulisses", emoji: "🎬" },
  { id: "values", label: "Valeurs", emoji: "💛" },
  { id: "faq", label: "FAQ", emoji: "❓" },
  { id: "tips", label: "Tips", emoji: "💡" },
];

interface HighlightRow {
  id: string;
  category: string;
  notes: string;
  has_existing_stories: boolean;
  needs_content_creation: boolean;
  noted_in_calendar: boolean;
  stories_grouped: boolean;
  covers_created: boolean;
  added_to_profile: boolean;
  canva_link: string;
}

export default function InstagramHighlights() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [step, setStep] = useState(1);
  const [selected, setSelected] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, HighlightRow>>({});
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // Load existing data
  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const { data } = await supabase
        .from("highlight_categories")
        .select("*")
        .eq("user_id", user.id);
      if (data && data.length > 0) {
        const map: Record<string, HighlightRow> = {};
        const cats: string[] = [];
        data.forEach((r: any) => {
          map[r.category] = r;
          cats.push(r.category);
        });
        setSelected(cats);
        setRows(map);
        // Auto-advance to step 2 if categories already chosen
        setStep(2);
      }
      setLoaded(true);
    };
    load();
  }, [user]);

  const toggleCategory = (id: string) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : prev.length < 4 ? [...prev, id] : prev
    );
  };

  const saveCategories = async () => {
    if (!user || selected.length === 0) return;
    setSaving(true);
    // Delete removed categories
    const existingCats = Object.keys(rows);
    const toDelete = existingCats.filter((c) => !selected.includes(c));
    if (toDelete.length > 0) {
      await supabase
        .from("highlight_categories")
        .delete()
        .eq("user_id", user.id)
        .in("category", toDelete);
    }
    // Upsert new categories
    for (const cat of selected) {
      if (!rows[cat]) {
        await supabase.from("highlight_categories").insert({
          user_id: user.id,
          category: cat,
        });
      }
    }
    // Reload
    const { data } = await supabase
      .from("highlight_categories")
      .select("*")
      .eq("user_id", user.id);
    if (data) {
      const map: Record<string, HighlightRow> = {};
      data.forEach((r: any) => { map[r.category] = r; });
      setRows(map);
    }
    setSaving(false);
    setStep(2);
  };

  const updateField = useCallback(
    async (category: string, field: string, value: any) => {
      if (!user) return;
      const row = rows[category];
      if (!row) return;
      await supabase
        .from("highlight_categories")
        .update({ [field]: value })
        .eq("id", row.id);
      setRows((prev) => ({
        ...prev,
        [category]: { ...prev[category], [field]: value },
      }));
    },
    [user, rows]
  );

  // Debounced text save
  const [pendingTexts, setPendingTexts] = useState<Record<string, { field: string; value: string }>>({});

  useEffect(() => {
    const timer = setTimeout(() => {
      Object.entries(pendingTexts).forEach(([category, { field, value }]) => {
        updateField(category, field, value);
      });
      if (Object.keys(pendingTexts).length > 0) setPendingTexts({});
    }, 800);
    return () => clearTimeout(timer);
  }, [pendingTexts, updateField]);

  const handleTextChange = (category: string, field: string, value: string) => {
    setRows((prev) => ({ ...prev, [category]: { ...prev[category], [field]: value } }));
    setPendingTexts((prev) => ({ ...prev, [category]: { field, value } }));
  };

  if (!loaded) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex gap-1">
          <div className="h-3 w-3 rounded-full bg-primary animate-bounce-dot" />
          <div className="h-3 w-3 rounded-full bg-primary animate-bounce-dot" style={{ animationDelay: "0.16s" }} />
          <div className="h-3 w-3 rounded-full bg-primary animate-bounce-dot" style={{ animationDelay: "0.32s" }} />
        </div>
      </div>
    );
  }

  const catLabel = (id: string) => ALL_CATEGORIES.find((c) => c.id === id);

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-4xl px-6 py-8 max-md:px-4">
        <Link to="/instagram" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6">
          <ArrowLeft className="h-4 w-4" />
          Retour à Instagram
        </Link>

        <h1 className="font-display text-[26px] font-bold text-foreground">⭐ Stories à la une</h1>
        <p className="mt-2 text-sm text-muted-foreground mb-8">
          Organise tes highlights pour guider les visiteurs de ton profil. 4 étapes, à ton rythme.
        </p>

        {/* Stepper */}
        <div className="flex items-center gap-2 mb-8">
          {[1, 2, 3, 4].map((s) => (
            <button
              key={s}
              onClick={() => (s <= 2 || selected.length > 0) && setStep(s)}
              className={`flex items-center gap-1.5 rounded-pill px-4 py-1.5 text-sm font-medium transition-all ${
                step === s
                  ? "bg-primary text-primary-foreground"
                  : s < step
                  ? "bg-secondary text-foreground"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {s < step ? <Check className="h-3.5 w-3.5" /> : null}
              Étape {s}
            </button>
          ))}
        </div>

        {/* STEP 1: Choose categories */}
        {step === 1 && (
          <div className="space-y-6 animate-fade-in">
            <div className="rounded-2xl border border-border bg-card p-6">
              <h2 className="font-display text-xl font-bold mb-1">Choisis tes catégories</h2>
              <p className="text-sm text-muted-foreground mb-5">
                Sélectionne 3 à 4 catégories maximum. Ce sont les rubriques qui apparaîtront sur ton profil.
              </p>
              <div className="flex flex-wrap gap-3">
                {ALL_CATEGORIES.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => toggleCategory(cat.id)}
                    className={`flex items-center gap-2 rounded-xl border px-4 py-3 text-sm font-medium transition-all ${
                      selected.includes(cat.id)
                        ? "border-primary bg-rose-pale text-foreground"
                        : "border-border bg-card text-foreground hover:border-primary/40"
                    } ${!selected.includes(cat.id) && selected.length >= 4 ? "opacity-40 cursor-not-allowed" : ""}`}
                  >
                    <span>{cat.emoji}</span>
                    {cat.label}
                    {selected.includes(cat.id) && <Check className="h-4 w-4 text-primary" />}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-3">{selected.length}/4 sélectionnées</p>
            </div>
            <Button
              onClick={saveCategories}
              disabled={selected.length === 0 || saving}
              className="rounded-pill"
            >
              {saving ? "Enregistrement..." : "Valider mes catégories"}
            </Button>
          </div>
        )}

        {/* STEP 2: Organize content */}
        {step === 2 && (
          <div className="space-y-5 animate-fade-in">
            <h2 className="font-display text-xl font-bold">Organise le contenu</h2>
            <p className="text-sm text-muted-foreground mb-2">
              Pour chaque catégorie, fais le point sur ce que tu as déjà et ce qu'il te reste à créer.
            </p>
            {selected.map((catId) => {
              const cat = catLabel(catId);
              const row = rows[catId];
              if (!cat || !row) return null;
              return (
                <div key={catId} className="rounded-2xl border border-border bg-card p-5">
                  <h3 className="font-display text-lg font-bold mb-3">
                    {cat.emoji} {cat.label}
                  </h3>
                  <div className="space-y-3">
                    <CheckItem
                      label="J'ai des stories existantes à archiver"
                      checked={row.has_existing_stories}
                      onChange={(v) => updateField(catId, "has_existing_stories", v)}
                    />
                    <CheckItem
                      label="Je dois créer du contenu (face cam, Canva, texte)"
                      checked={row.needs_content_creation}
                      onChange={(v) => updateField(catId, "needs_content_creation", v)}
                    />
                    <CheckItem
                      label="C'est noté dans mon calendrier"
                      checked={row.noted_in_calendar}
                      onChange={(v) => updateField(catId, "noted_in_calendar", v)}
                    />
                  </div>
                  <div className="mt-4">
                    <label className="text-xs font-medium text-muted-foreground">Notes</label>
                    <Textarea
                      value={row.notes || ""}
                      onChange={(e) => handleTextChange(catId, "notes", e.target.value)}
                      placeholder="Notes libres sur cette catégorie..."
                      className="mt-1 min-h-[60px] text-sm"
                    />
                  </div>
                </div>
              );
            })}
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setStep(1)} className="rounded-pill">Modifier mes catégories</Button>
              <Button onClick={() => setStep(3)} className="rounded-pill">Étape suivante</Button>
            </div>
          </div>
        )}

        {/* STEP 3: Covers */}
        {step === 3 && (
          <div className="space-y-5 animate-fade-in">
            <div className="rounded-2xl border border-border bg-card p-6">
              <h2 className="font-display text-xl font-bold mb-2">Soigne tes couvertures</h2>
              <p className="text-sm text-muted-foreground leading-relaxed mb-4">
                2 options : des emojis lisibles sur un fond uni, ou des visuels Canva avec ta charte graphique. L'important, c'est la cohérence.
              </p>
              <div className="rounded-xl bg-muted/50 p-4 mb-5">
                <p className="text-sm text-foreground font-medium mb-1">💡 Astuce</p>
                <p className="text-sm text-muted-foreground">
                  Canva propose des templates gratuits pour les couvertures de highlights. Cherche "Instagram Highlight Cover" dans Canva.
                </p>
              </div>
              <div>
                <label className="text-sm font-medium text-foreground">Lien vers ton template Canva (optionnel)</label>
                <Input
                  value={rows[selected[0]]?.canva_link || ""}
                  onChange={(e) => {
                    // Save canva link on first category as a general link
                    if (selected[0]) handleTextChange(selected[0], "canva_link", e.target.value);
                  }}
                  placeholder="https://www.canva.com/..."
                  className="mt-1"
                />
              </div>
            </div>
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setStep(2)} className="rounded-pill">Retour</Button>
              <Button onClick={() => setStep(4)} className="rounded-pill">Étape suivante</Button>
            </div>
          </div>
        )}

        {/* STEP 4: Final checklist */}
        {step === 4 && (
          <div className="space-y-5 animate-fade-in">
            <div className="rounded-2xl border border-border bg-card p-6">
              <h2 className="font-display text-xl font-bold mb-2">Mettre en ligne</h2>
              <p className="text-sm text-muted-foreground mb-5">
                Dernière étape : vérifie que tout est prêt avant de publier tes highlights.
              </p>
              {selected.map((catId) => {
                const cat = catLabel(catId);
                const row = rows[catId];
                if (!cat || !row) return null;
                return (
                  <div key={catId} className="mb-4 last:mb-0">
                    <p className="text-sm font-bold text-foreground mb-2">{cat.emoji} {cat.label}</p>
                    <div className="space-y-2 ml-1">
                      <CheckItem
                        label="Stories regroupées dans la bonne rubrique"
                        checked={row.stories_grouped}
                        onChange={(v) => updateField(catId, "stories_grouped", v)}
                      />
                      <CheckItem
                        label="Couverture créée ou choisie"
                        checked={row.covers_created}
                        onChange={(v) => updateField(catId, "covers_created", v)}
                      />
                      <CheckItem
                        label="Ajoutée au profil"
                        checked={row.added_to_profile}
                        onChange={(v) => updateField(catId, "added_to_profile", v)}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Completion check */}
            {selected.every((catId) => {
              const r = rows[catId];
              return r?.stories_grouped && r?.covers_created && r?.added_to_profile;
            }) && (
              <div className="rounded-2xl border-l-4 border-l-primary bg-rose-pale p-5 animate-fade-in">
                <div className="flex items-center gap-2 mb-1">
                  <Star className="h-5 w-5 text-primary" />
                  <p className="text-sm font-bold text-foreground">Tes highlights sont en place !</p>
                </div>
                <p className="text-sm text-muted-foreground">
                  Bravo, ton profil est maintenant plus accueillant et professionnel. Pense à les mettre à jour régulièrement.
                </p>
              </div>
            )}

            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setStep(3)} className="rounded-pill">Retour</Button>
              <Link to="/instagram">
                <Button className="rounded-pill">Terminé</Button>
              </Link>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function CheckItem({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2.5 cursor-pointer group">
      <Checkbox checked={checked} onCheckedChange={(v) => onChange(!!v)} />
      <span className={`text-sm ${checked ? "line-through text-muted-foreground" : "text-foreground"}`}>
        {label}
      </span>
    </label>
  );
}
