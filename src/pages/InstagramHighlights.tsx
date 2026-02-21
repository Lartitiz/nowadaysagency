import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import AppHeader from "@/components/AppHeader";
import SubPageHeader from "@/components/SubPageHeader";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useSpeechRecognition } from "@/hooks/use-speech-recognition";
import { Check, Copy, Save, Sparkles, X, GripVertical, Mic, MicOff, Loader2 } from "lucide-react";
import AuditInsight from "@/components/AuditInsight";

interface StoryItem {
  content: string;
  format: string;
  tip?: string;
  done?: boolean;
}

interface HighlightCategory {
  id?: string;
  title: string;
  emoji: string;
  role: string;
  stories: StoryItem[];
  sort_order: number;
  is_selected: boolean;
}

export default function InstagramHighlights() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [categories, setCategories] = useState<HighlightCategory[]>([]);
  const [hiddenCategories, setHiddenCategories] = useState<HighlightCategory[]>([]);
  const [showHidden, setShowHidden] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [refining, setRefining] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  // Questions state
  const [q1, setQ1] = useState("");
  const [q2, setQ2] = useState("");
  const [q3, setQ3] = useState("");

  // Drag state
  const dragItem = useRef<number | null>(null);
  const dragOverItem = useRef<number | null>(null);

  // Load existing data
  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const [highlightsRes, questionsRes] = await Promise.all([
        supabase.from("instagram_highlights").select("*").eq("user_id", user.id).order("sort_order"),
        supabase.from("instagram_highlights_questions").select("*").eq("user_id", user.id).maybeSingle(),
      ]);
      if (highlightsRes.data && highlightsRes.data.length > 0) {
        const selected: HighlightCategory[] = [];
        const hidden: HighlightCategory[] = [];
        highlightsRes.data.forEach((r: any) => {
          const cat: HighlightCategory = {
            id: r.id,
            title: r.title,
            emoji: r.emoji || "",
            role: r.role || "",
            stories: (r.stories as StoryItem[]) || [],
            sort_order: r.sort_order || 0,
            is_selected: r.is_selected ?? true,
          };
          if (cat.is_selected) selected.push(cat);
          else hidden.push(cat);
        });
        setCategories(selected);
        setHiddenCategories(hidden);
      }
      if (questionsRes.data) {
        setQ1(questionsRes.data.frequent_questions || "");
        setQ2(questionsRes.data.client_journey || "");
        setQ3(questionsRes.data.recurring_content || "");
      }
      setLoaded(true);
    };
    load();
  }, [user]);

  const parseAIResponse = (content: string): HighlightCategory[] => {
    let cleaned = content.trim();
    // Remove markdown code fences
    if (cleaned.startsWith("```")) {
      cleaned = cleaned.replace(/^```(?:json)?\s*/, "").replace(/```\s*$/, "");
    }
    const arr = JSON.parse(cleaned);
    return arr.map((item: any, i: number) => ({
      title: item.title || "",
      emoji: item.emoji || "⭐",
      role: item.role || "",
      stories: (item.stories || []).map((s: any) => ({
        content: s.content || "",
        format: s.format || "",
        tip: s.tip || "",
        done: false,
      })),
      sort_order: i,
      is_selected: true,
    }));
  };

  const generateCategories = async () => {
    if (!user) return;
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("highlights-ai", {
        body: { type: "generate" },
      });
      if (error) throw error;
      const parsed = parseAIResponse(data.content);
      setCategories(parsed);
      setHiddenCategories([]);
      toast({ title: "Catégories générées !", description: `${parsed.length} catégories personnalisées créées.` });
    } catch (e: any) {
      console.error(e);
      toast({ title: "Erreur", description: "L'IA n'a pas pu générer. Réessaie.", variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  const refineCategories = async () => {
    if (!user) return;
    setRefining(true);
    try {
      // Save questions first
      await supabase.from("instagram_highlights_questions").upsert({
        user_id: user.id,
        frequent_questions: q1,
        client_journey: q2,
        recurring_content: q3,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });

      const allCats = [...categories, ...hiddenCategories];
      const { data, error } = await supabase.functions.invoke("highlights-ai", {
        body: {
          type: "refine",
          categories: allCats,
          questions: { frequent_questions: q1, client_journey: q2, recurring_content: q3 },
        },
      });
      if (error) throw error;
      const parsed = parseAIResponse(data.content);
      setCategories(parsed);
      setHiddenCategories([]);
      toast({ title: "Catégories affinées !", description: "Les catégories ont été personnalisées avec tes réponses." });
    } catch (e: any) {
      console.error(e);
      toast({ title: "Erreur", description: "L'IA n'a pas pu affiner. Réessaie.", variant: "destructive" });
    } finally {
      setRefining(false);
    }
  };

  const toggleSelect = (index: number) => {
    const cat = categories[index];
    const newCats = categories.filter((_, i) => i !== index);
    setCategories(newCats);
    setHiddenCategories((prev) => [...prev, { ...cat, is_selected: false }]);
  };

  const restoreCategory = (index: number) => {
    const cat = hiddenCategories[index];
    setHiddenCategories((prev) => prev.filter((_, i) => i !== index));
    setCategories((prev) => [...prev, { ...cat, is_selected: true }]);
  };

  const copyStories = (cat: HighlightCategory) => {
    const text = cat.stories.map((s, i) => `${i + 1}. ${s.content}\n   Format : ${s.format}${s.tip ? `\n   Tip : ${s.tip}` : ""}`).join("\n\n");
    navigator.clipboard.writeText(`${cat.emoji} ${cat.title}\n\n${text}`);
    toast({ title: "Copié !", description: "La série de stories a été copiée." });
  };

  const saveToIdeas = async (cat: HighlightCategory) => {
    if (!user) return;
    const ideas = cat.stories.map((s) => ({
      user_id: user.id,
      titre: `${cat.emoji} ${cat.title} - ${s.content.substring(0, 60)}`,
      angle: s.content,
      format: s.format,
      format_technique: "story",
      canal: "instagram",
      type: "idea" as const,
      objectif: cat.role,
    }));
    const { error } = await supabase.from("saved_ideas").insert(ideas);
    if (error) {
      toast({ title: "Erreur", description: "Impossible de sauvegarder.", variant: "destructive" });
    } else {
      toast({ title: "Sauvegardé !", description: `${ideas.length} idées ajoutées à ta boîte à idées.` });
    }
  };

  const saveSelection = async () => {
    if (!user || categories.length === 0) return;
    setSaving(true);
    try {
      // Delete existing
      await supabase.from("instagram_highlights").delete().eq("user_id", user.id);
      // Insert all (selected + hidden)
      const allToSave = [
        ...categories.map((c, i) => ({
          user_id: user.id,
          title: c.title,
          emoji: c.emoji,
          role: c.role,
          stories: c.stories as unknown as Json,
          sort_order: i,
          is_selected: true,
        })),
        ...hiddenCategories.map((c, i) => ({
          user_id: user.id,
          title: c.title,
          emoji: c.emoji,
          role: c.role,
          stories: c.stories as unknown as Json,
          sort_order: categories.length + i,
          is_selected: false,
        })),
      ];
      await supabase.from("instagram_highlights").insert(allToSave);
      toast({ title: "Sauvegardé !", description: "Ta sélection est enregistrée." });
    } catch {
      toast({ title: "Erreur", description: "Impossible de sauvegarder.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const toggleStoryDone = async (catIndex: number, storyIndex: number) => {
    setCategories((prev) => {
      const updated = [...prev];
      const stories = [...updated[catIndex].stories];
      stories[storyIndex] = { ...stories[storyIndex], done: !stories[storyIndex].done };
      updated[catIndex] = { ...updated[catIndex], stories };
      return updated;
    });
  };

  // Drag handlers
  const handleDragStart = (index: number) => { dragItem.current = index; };
  const handleDragEnter = (index: number) => { dragOverItem.current = index; };
  const handleDragEnd = () => {
    if (dragItem.current === null || dragOverItem.current === null) return;
    const items = [...categories];
    const [dragged] = items.splice(dragItem.current, 1);
    items.splice(dragOverItem.current, 0, dragged);
    setCategories(items.map((c, i) => ({ ...c, sort_order: i })));
    dragItem.current = null;
    dragOverItem.current = null;
  };

  // Counts
  const totalStories = categories.reduce((a, c) => a + c.stories.length, 0);
  const doneStories = categories.reduce((a, c) => a + c.stories.filter((s) => s.done).length, 0);

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

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-4xl px-6 py-8 max-md:px-4">
        <SubPageHeader parentLabel="Mon profil" parentTo="/instagram/profil" currentLabel="Stories à la une" />

        <h1 className="font-display text-[26px] font-bold text-foreground">Tes stories à la une</h1>
        <p className="mt-2 text-[15px] text-muted-foreground italic mb-6">
          C'est la première chose qu'une nouvelle visiteuse regarde après ta bio. On va les structurer comme un vrai parcours client.
        </p>

        <AuditInsight section="stories" />

        {/* Intro box */}
        <div className="rounded-xl bg-rose-pale border-l-[3px] border-l-primary p-5 mb-8">
          <p className="text-sm font-bold text-foreground mb-2">💡 Pense tes stories à la une comme un mini-site :</p>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Chaque catégorie a un rôle précis. Comme les pages d'un site web :<br />
            <span className="font-medium">"Qui suis-je"</span> = ta page À propos · <span className="font-medium">"Mon offre"</span> = ta page de vente · <span className="font-medium">"Avis"</span> = ta preuve sociale · <span className="font-medium">"Coulisses"</span> = ton blog · <span className="font-medium">"FAQ"</span> = ta page d'aide
          </p>
          <p className="text-sm text-muted-foreground mt-2">
            L'objectif : qu'une personne qui te découvre comprenne en 30 secondes qui tu es, ce que tu fais, et pourquoi elle devrait te suivre (ou acheter).
          </p>
        </div>

        {/* SECTION 1: Generate */}
        <section className="mb-10">
          <h2 className="font-display text-xl font-bold text-foreground mb-4">1. Générer mes catégories</h2>
          <Button onClick={generateCategories} disabled={generating} className="rounded-pill gap-2">
            {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {generating ? "Génération en cours..." : "✨ Générer mes catégories personnalisées"}
          </Button>

          {/* Category cards */}
          {categories.length > 0 && (
            <div className="mt-6 space-y-4">
              {categories.map((cat, index) => (
                <CategoryCard
                  key={`${cat.title}-${index}`}
                  cat={cat}
                  onRemove={() => toggleSelect(index)}
                  onCopy={() => copyStories(cat)}
                  onSaveIdeas={() => saveToIdeas(cat)}
                />
              ))}
            </div>
          )}

          {/* Hidden categories */}
          {hiddenCategories.length > 0 && (
            <div className="mt-4">
              <button onClick={() => setShowHidden(!showHidden)} className="text-sm text-primary hover:underline">
                {showHidden ? "Masquer" : `Voir les ${hiddenCategories.length} catégorie(s) masquée(s)`}
              </button>
              {showHidden && (
                <div className="mt-3 space-y-2">
                  {hiddenCategories.map((cat, i) => (
                    <div key={i} className="flex items-center gap-3 rounded-xl border border-border bg-muted/30 px-4 py-3">
                      <span>{cat.emoji} {cat.title}</span>
                      <Button size="sm" variant="ghost" onClick={() => restoreCategory(i)} className="ml-auto text-xs">
                        Restaurer
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>

        {/* SECTION 2: Refine */}
        {categories.length > 0 && (
          <section className="mb-10">
            <h2 className="font-display text-xl font-bold text-foreground mb-2">2. Affiner avec des questions</h2>
            <div className="rounded-2xl border border-border bg-card p-5 mb-4">
              <p className="text-sm text-muted-foreground mb-5">
                🎯 Réponds à ces questions pour que les catégories collent encore mieux à ton activité.
              </p>
              <QuestionField
                label="Qu'est-ce que tes visiteuses te demandent le plus souvent en DM ?"
                placeholder="Comment commander, les délais, les tailles, le prix..."
                value={q1}
                onChange={setQ1}
              />
              <QuestionField
                label="Quel est le parcours type de ta cliente ? (elle te découvre → elle achète)"
                placeholder="Elle voit un post → elle va sur mon profil → elle regarde mes stories → elle m'écrit en DM..."
                value={q2}
                onChange={setQ2}
              />
              <QuestionField
                label="Y a-t-il un contenu récurrent que tu fais déjà en stories ?"
                placeholder="Coulisses de fabrication, unboxing, questions/réponses du lundi..."
                value={q3}
                onChange={setQ3}
              />
              <Button onClick={refineCategories} disabled={refining} className="rounded-pill gap-2 mt-2">
                {refining ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                {refining ? "Affinage en cours..." : "✨ Affiner mes catégories"}
              </Button>
            </div>
          </section>
        )}

        {/* SECTION 3: Final selection with drag */}
        {categories.length > 0 && (
          <section className="mb-10">
            <h2 className="font-display text-xl font-bold text-foreground mb-2">3. Ma sélection finale</h2>
            <p className="text-sm text-muted-foreground mb-1">
              📱 Tes stories à la une (dans l'ordre d'affichage sur ton profil) :
            </p>
            <p className="text-xs text-muted-foreground mb-4 italic">
              💡 L'ordre compte. Mets en premier ce qui est le plus important pour ta conversion : ton offre, ta preuve sociale, ou ton histoire.
            </p>
            <div className="space-y-2 mb-4">
              {categories.map((cat, index) => (
                <div
                  key={`order-${index}`}
                  draggable
                  onDragStart={() => handleDragStart(index)}
                  onDragEnter={() => handleDragEnter(index)}
                  onDragEnd={handleDragEnd}
                  onDragOver={(e) => e.preventDefault()}
                  className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 cursor-grab active:cursor-grabbing hover:border-primary/40 transition-colors"
                >
                  <GripVertical className="h-4 w-4 text-muted-foreground" />
                  <span className="text-lg">{cat.emoji}</span>
                  <span className="text-sm font-medium text-foreground">{cat.title}</span>
                  <span className="text-xs text-muted-foreground ml-auto">{cat.stories.length} stories</span>
                </div>
              ))}
            </div>
            <Button onClick={saveSelection} disabled={saving} className="rounded-pill gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {saving ? "Enregistrement..." : "💾 Enregistrer ma sélection"}
            </Button>
          </section>
        )}

        {/* SECTION 4: Creation checklist */}
        {categories.length > 0 && (
          <section className="mb-10">
            <h2 className="font-display text-xl font-bold text-foreground mb-2">4. Checklist de création</h2>
            <p className="text-sm text-muted-foreground mb-4">
              <span className="font-semibold text-foreground">{doneStories} / {totalStories}</span> stories créées
            </p>
            {/* Progress bar */}
            <div className="h-2 w-full rounded-full bg-muted mb-6 overflow-hidden">
              <div
                className="h-full rounded-full bg-primary transition-all duration-500"
                style={{ width: totalStories > 0 ? `${(doneStories / totalStories) * 100}%` : "0%" }}
              />
            </div>
            {categories.map((cat, catIndex) => (
              <div key={`checklist-${catIndex}`} className="rounded-2xl border border-border bg-card p-5 mb-4">
                <p className="text-sm font-bold text-foreground mb-3">
                  📌 {cat.emoji} {cat.title} ({cat.stories.length} stories)
                </p>
                <div className="space-y-2">
                  {cat.stories.map((story, si) => (
                    <label key={si} className="flex items-start gap-2.5 cursor-pointer group">
                      <Checkbox
                        checked={!!story.done}
                        onCheckedChange={() => toggleStoryDone(catIndex, si)}
                        className="mt-0.5"
                      />
                      <span className={`text-sm leading-snug ${story.done ? "line-through text-muted-foreground" : "text-foreground"}`}>
                        Story {si + 1} : {story.content}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
            <Button onClick={saveSelection} disabled={saving} className="rounded-pill gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              💾 Sauvegarder ma progression
            </Button>
          </section>
        )}
      </main>
    </div>
  );
}

/* ── Sub-components ── */

function CategoryCard({
  cat,
  onRemove,
  onCopy,
  onSaveIdeas,
}: {
  cat: HighlightCategory;
  onRemove: () => void;
  onCopy: () => void;
  onSaveIdeas: () => void;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 transition-all">
      <div className="flex items-start justify-between mb-3">
        <h3 className="font-display text-lg font-bold text-foreground">
          {cat.emoji} {cat.title}
        </h3>
        <div className="flex gap-1.5">
          <Button size="sm" variant="ghost" className="text-xs h-8 gap-1 text-primary" onClick={onRemove}>
            <X className="h-3.5 w-3.5" /> Masquer
          </Button>
        </div>
      </div>
      <p className="text-sm text-muted-foreground italic mb-4">Rôle : {cat.role}</p>

      <p className="text-xs font-semibold text-foreground mb-2">📖 Contenu recommandé ({cat.stories.length} stories) :</p>
      <div className="space-y-2 mb-4">
        {cat.stories.map((story, i) => (
          <div key={i} className="rounded-lg bg-muted/40 p-3">
            <p className="text-sm text-foreground"><span className="font-semibold">{i + 1}.</span> {story.content}</p>
            <p className="text-xs text-muted-foreground mt-1">Format : {story.format}</p>
            {story.tip && <p className="text-xs text-muted-foreground">💡 {story.tip}</p>}
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={onCopy} className="rounded-pill gap-1.5 text-xs">
          <Copy className="h-3.5 w-3.5" /> Copier la série
        </Button>
        <Button size="sm" variant="outline" onClick={onSaveIdeas} className="rounded-pill gap-1.5 text-xs">
          <Save className="h-3.5 w-3.5" /> Sauvegarder dans mes idées
        </Button>
      </div>
    </div>
  );
}

function QuestionField({
  label,
  placeholder,
  value,
  onChange,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const { isListening, isSupported, toggle } = useSpeechRecognition((text) => {
    onChange(value ? `${value} ${text}` : text);
  });

  return (
    <div className="mb-4">
      <label className="text-sm font-medium text-foreground block mb-1.5">{label}</label>
      <div className="relative">
        <Textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="min-h-[80px] text-sm pr-10"
        />
        {isSupported && (
          <button
            onClick={toggle}
            className={`absolute right-2 top-2 p-1.5 rounded-full transition-colors ${
              isListening ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-primary"
            }`}
            title="Dictée vocale"
          >
            {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
          </button>
        )}
      </div>
    </div>
  );
}
