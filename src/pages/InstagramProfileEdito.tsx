import { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import AppHeader from "@/components/AppHeader";
import SubPageHeader from "@/components/SubPageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { useToast } from "@/hooks/use-toast";
import { useSpeechRecognition } from "@/hooks/use-speech-recognition";
import { Save, Loader2, Sparkles, Mic, MicOff, Plus, X } from "lucide-react";

/* ─── Types ─── */
interface Pillar {
  name: string;
  description: string;
  percentage: number;
  is_major: boolean;
}

interface EditorialLine {
  id?: string;
  main_objective: string;
  objective_details: string;
  posts_frequency: string;
  stories_frequency: string;
  time_available: string;
  pillars: Pillar[];
  preferred_formats: string[];
  do_more: string;
  stop_doing: string;
  free_notes: string;
  source: string;
}

const EMPTY_LINE: EditorialLine = {
  main_objective: "",
  objective_details: "",
  posts_frequency: "",
  stories_frequency: "",
  time_available: "",
  pillars: [],
  preferred_formats: [],
  do_more: "",
  stop_doing: "",
  free_notes: "",
  source: "manual",
};

const OBJECTIVES = [
  "Vendre mes produits/services",
  "Me faire connaître",
  "Créer une communauté engagée",
  "Rediriger vers mon site/boutique",
  "Trouver des partenaires/collaborations",
  "Asseoir ma crédibilité",
];

const POSTS_FREQ = ["1x/semaine", "2x/semaine", "3x/semaine", "4-5x/semaine"];
const STORIES_FREQ = ["Tous les jours", "3-4x/semaine", "1-2x/semaine", "Quand j'ai envie"];
const TIME_OPTIONS = ["1h", "2h", "3h", "4h+"];

const FORMATS = [
  "Carrousel éducatif",
  "Post photo + caption longue",
  "Reel face cam",
  "Reel montage/transitions",
  "Reel coulisses",
  "Story face cam",
  "Story texte/sondage",
  "Live",
  "Collaboration / post invité",
];

/* ─── Helpers ─── */
function MicBtn({ onResult }: { onResult: (t: string) => void }) {
  const { isListening, isSupported, toggle } = useSpeechRecognition(onResult);
  if (!isSupported) return null;
  return (
    <button
      type="button"
      onClick={toggle}
      className={`absolute right-3 top-3 p-1.5 rounded-lg transition-colors ${
        isListening ? "bg-primary text-primary-foreground animate-pulse" : "text-muted-foreground hover:text-foreground hover:bg-muted"
      }`}
    >
      {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
    </button>
  );
}

function Chip({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-pill px-4 py-2 text-sm font-medium transition-colors border ${
        selected
          ? "bg-primary text-primary-foreground border-primary"
          : "bg-card text-foreground border-border hover:border-primary/40"
      }`}
    >
      {label}
    </button>
  );
}

function getTimeTip(time: string, posts: string): string | null {
  if (!time || !posts) return null;
  const tips: Record<string, Record<string, string>> = {
    "1h": {
      "1x/semaine": "Avec 1h/semaine, 1 post + stories 1-2x c'est tenable. Mieux vaut un rythme régulier que des rafales suivies de silence.",
      "2x/semaine": "2 posts avec 1h/semaine c'est ambitieux. Privilégie 1 post bien travaillé.",
      "3x/semaine": "3 posts en 1h c'est très serré. Réduis à 1-2 posts pour la qualité.",
      "4-5x/semaine": "4-5 posts en 1h c'est irréaliste. Commence par 1 post/semaine bien fait.",
    },
    "2h": {
      "1x/semaine": "Avec 2h/semaine, 1 post + stories 3-4x c'est confortable. Tu peux soigner tes visuels.",
      "2x/semaine": "2 posts + stories régulières avec 2h, c'est le sweet spot.",
      "3x/semaine": "3 posts en 2h ça se tient si tu batch tes contenus.",
      "4-5x/semaine": "4-5 posts en 2h c'est serré. Essaie 3 posts pour commencer.",
    },
    "3h": {
      "1x/semaine": "3h pour 1 post c'est luxueux. Profites-en pour des formats ambitieux (carrousels, reels montés).",
      "2x/semaine": "2 posts + stories quotidiennes avec 3h, c'est très confortable.",
      "3x/semaine": "3 posts + stories avec 3h, c'est un bon rythme pro.",
      "4-5x/semaine": "4-5 posts en 3h c'est faisable si tu batch tout en une session.",
    },
    "4h+": {
      "1x/semaine": "Avec 4h+ pour 1 post, tu peux créer du contenu premium et batché sur plusieurs semaines.",
      "2x/semaine": "2 posts avec 4h+, tu as le temps de tester des formats variés.",
      "3x/semaine": "3 posts + stories régulières avec 4h+, c'est un rythme de créatrice pro.",
      "4-5x/semaine": "4-5 posts avec 4h+ c'est ambitieux mais faisable. Organise tes sessions de batch.",
    },
  };
  return tips[time]?.[posts] || null;
}

/* ─── Main ─── */
export default function InstagramProfileEdito() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [editorial, setEditorial] = useState<EditorialLine>({ ...EMPTY_LINE });
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [suggestingPillars, setSuggestingPillars] = useState(false);
  const [suggestingFormats, setSuggestingFormats] = useState(false);

  // Load existing data + branding pillars
  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const [editoRes, stratRes, auditRes] = await Promise.all([
        supabase.from("instagram_editorial_line").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
        supabase.from("brand_strategy").select("pillar_major, pillar_minor_1, pillar_minor_2, pillar_minor_3").eq("user_id", user.id).maybeSingle(),
        supabase.from("instagram_audit").select("details, successful_content_notes, unsuccessful_content_notes").eq("user_id", user.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      ]);

      if (editoRes.data) {
        const d = editoRes.data;
        setEditorial({
          id: d.id,
          main_objective: d.main_objective || "",
          objective_details: (d as any).objective_details || "",
          posts_frequency: (d as any).posts_frequency || "",
          stories_frequency: (d as any).stories_frequency || "",
          time_available: (d as any).time_available || "",
          pillars: Array.isArray((d as any).pillars) ? (d as any).pillars : [],
          preferred_formats: Array.isArray(d.preferred_formats) ? d.preferred_formats as string[] : [],
          do_more: d.do_more || "",
          stop_doing: d.stop_doing || "",
          free_notes: (d as any).free_notes || "",
          source: (d as any).source || "manual",
        });
      } else {
        // Pre-fill from branding strategy
        const s = stratRes.data;
        const pillars: Pillar[] = [];
        if (s?.pillar_major) pillars.push({ name: s.pillar_major, description: "", percentage: 40, is_major: true });
        if (s?.pillar_minor_1) pillars.push({ name: s.pillar_minor_1, description: "", percentage: 25, is_major: false });
        if (s?.pillar_minor_2) pillars.push({ name: s.pillar_minor_2, description: "", percentage: 20, is_major: false });
        if (s?.pillar_minor_3) pillars.push({ name: s.pillar_minor_3, description: "", percentage: 15, is_major: false });

        // Pre-fill from audit
        const det = auditRes.data?.details as any;
        const doMore = det?.sections?.edito?.recommandations?.join("\n") || "";
        const stopDoing = "";

        setEditorial((prev) => ({
          ...prev,
          pillars: pillars.length > 0 ? pillars : prev.pillars,
          do_more: doMore || prev.do_more,
          stop_doing: stopDoing || prev.stop_doing,
          source: auditRes.data ? "audit" : "manual",
        }));
      }
      setLoaded(true);
    };
    load();
  }, [user]);

  const totalPercent = useMemo(() => editorial.pillars.reduce((s, p) => s + p.percentage, 0), [editorial.pillars]);
  const timeTip = getTimeTip(editorial.time_available, editorial.posts_frequency);

  const updateField = <K extends keyof EditorialLine>(key: K, value: EditorialLine[K]) =>
    setEditorial((prev) => ({ ...prev, [key]: value }));

  const updatePillar = (index: number, field: keyof Pillar, value: any) => {
    setEditorial((prev) => {
      const pillars = [...prev.pillars];
      pillars[index] = { ...pillars[index], [field]: value };
      return { ...prev, pillars };
    });
  };

  const addPillar = () => {
    setEditorial((prev) => ({
      ...prev,
      pillars: [...prev.pillars, { name: "", description: "", percentage: 0, is_major: false }],
    }));
  };

  const removePillar = (index: number) => {
    setEditorial((prev) => ({
      ...prev,
      pillars: prev.pillars.filter((_, i) => i !== index),
    }));
  };

  const toggleFormat = (format: string) => {
    setEditorial((prev) => ({
      ...prev,
      preferred_formats: prev.preferred_formats.includes(format)
        ? prev.preferred_formats.filter((f) => f !== format)
        : [...prev.preferred_formats, format],
    }));
  };

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const payload = {
        user_id: user.id,
        main_objective: editorial.main_objective,
        objective_details: editorial.objective_details,
        posts_frequency: editorial.posts_frequency,
        stories_frequency: editorial.stories_frequency,
        time_available: editorial.time_available,
        pillars: editorial.pillars as any,
        preferred_formats: editorial.preferred_formats as any,
        do_more: editorial.do_more,
        stop_doing: editorial.stop_doing,
        free_notes: editorial.free_notes,
        source: editorial.source,
        // Keep legacy fields in sync
        recommended_rhythm: `${editorial.posts_frequency} posts, stories ${editorial.stories_frequency}`,
        pillar_distribution: editorial.pillars.reduce((acc: Record<string, number>, p) => {
          if (p.name) acc[p.name] = p.percentage;
          return acc;
        }, {}),
      };

      if (editorial.id) {
        await supabase.from("instagram_editorial_line").update(payload).eq("id", editorial.id);
      } else {
        const { data } = await supabase.from("instagram_editorial_line").insert(payload).select("id").single();
        if (data) setEditorial((prev) => ({ ...prev, id: data.id }));
      }
      toast({ title: "Ligne éditoriale sauvegardée !" });
    } catch (e: any) {
      toast({ title: "Erreur", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const suggestPillarDistribution = async () => {
    if (!user) return;
    setSuggestingPillars(true);
    try {
      const res = await supabase.functions.invoke("generate-content", {
        body: {
          type: "instagram-edito-pillars",
          profile: {
            objective: editorial.main_objective,
            posts_frequency: editorial.posts_frequency,
            pillars: editorial.pillars.map((p) => p.name).filter(Boolean),
          },
        },
      });
      if (res.error) throw new Error(res.error.message);
      const content = res.data?.content || "";
      let parsed: any;
      try { parsed = JSON.parse(content); } catch {
        const m = content.match(/\{[\s\S]*\}/);
        if (m) parsed = JSON.parse(m[0]); else throw new Error("Format inattendu");
      }
      if (parsed.pillars && Array.isArray(parsed.pillars)) {
        setEditorial((prev) => ({ ...prev, pillars: parsed.pillars }));
      }
    } catch (e: any) {
      toast({ title: "Erreur", description: e.message, variant: "destructive" });
    } finally {
      setSuggestingPillars(false);
    }
  };

  const suggestFormats = async () => {
    if (!user) return;
    setSuggestingFormats(true);
    try {
      const res = await supabase.functions.invoke("generate-content", {
        body: {
          type: "instagram-edito-formats",
          profile: {
            objective: editorial.main_objective,
            pillars: editorial.pillars.map((p) => p.name).filter(Boolean),
            posts_frequency: editorial.posts_frequency,
          },
        },
      });
      if (res.error) throw new Error(res.error.message);
      const content = res.data?.content || "";
      let parsed: any;
      try { parsed = JSON.parse(content); } catch {
        const m = content.match(/\{[\s\S]*\}/);
        if (m) parsed = JSON.parse(m[0]); else throw new Error("Format inattendu");
      }
      if (parsed.formats && Array.isArray(parsed.formats)) {
        setEditorial((prev) => ({ ...prev, preferred_formats: parsed.formats }));
      }
    } catch (e: any) {
      toast({ title: "Erreur", description: e.message, variant: "destructive" });
    } finally {
      setSuggestingFormats(false);
    }
  };

  if (!loaded) return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-3xl px-6 py-8 flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </main>
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-3xl px-6 py-8 max-md:px-4">
        <SubPageHeader parentLabel="Mon profil" parentTo="/instagram/profil" currentLabel="Ligne éditoriale" />

        <h1 className="font-display text-[26px] font-bold text-foreground">📊 Ma ligne éditoriale</h1>
        <p className="mt-2 text-sm text-muted-foreground mb-8">
          Définis ton rythme, tes formats et la répartition de tes contenus par pilier.
        </p>

        <div className="space-y-8">
          {/* ── Section A: Objectif ── */}
          <section className="rounded-2xl border border-border bg-card p-5">
            <h2 className="text-base font-display font-bold text-foreground mb-3">🎯 Mon objectif principal</h2>
            <div className="flex flex-wrap gap-2 mb-3">
              {OBJECTIVES.map((obj) => (
                <Chip
                  key={obj}
                  label={obj}
                  selected={editorial.main_objective === obj}
                  onClick={() => updateField("main_objective", editorial.main_objective === obj ? "" : obj)}
                />
              ))}
            </div>
            <div className="relative">
              <Textarea
                value={editorial.objective_details}
                onChange={(e) => updateField("objective_details", e.target.value)}
                placeholder="Mon objectif cette année c'est surtout..."
                className="pr-12 min-h-[60px]"
              />
              <MicBtn onResult={(t) => updateField("objective_details", editorial.objective_details + (editorial.objective_details ? " " : "") + t)} />
            </div>
            <p className="text-xs text-muted-foreground mt-1">Précise si besoin</p>
          </section>

          {/* ── Section B: Rythme ── */}
          <section className="rounded-2xl border border-border bg-card p-5">
            <h2 className="text-base font-display font-bold text-foreground mb-3">📅 Mon rythme</h2>

            <div className="space-y-4">
              <div>
                <p className="text-sm font-medium text-foreground mb-2">Fréquence posts feed</p>
                <div className="flex flex-wrap gap-2">
                  {POSTS_FREQ.map((f) => (
                    <Chip key={f} label={f} selected={editorial.posts_frequency === f} onClick={() => updateField("posts_frequency", editorial.posts_frequency === f ? "" : f)} />
                  ))}
                </div>
              </div>

              <div>
                <p className="text-sm font-medium text-foreground mb-2">Fréquence stories</p>
                <div className="flex flex-wrap gap-2">
                  {STORIES_FREQ.map((f) => (
                    <Chip key={f} label={f} selected={editorial.stories_frequency === f} onClick={() => updateField("stories_frequency", editorial.stories_frequency === f ? "" : f)} />
                  ))}
                </div>
              </div>

              <div>
                <p className="text-sm font-medium text-foreground mb-2">Temps dispo par semaine</p>
                <div className="flex flex-wrap gap-2">
                  {TIME_OPTIONS.map((t) => (
                    <Chip key={t} label={t} selected={editorial.time_available === t} onClick={() => updateField("time_available", editorial.time_available === t ? "" : t)} />
                  ))}
                </div>
              </div>

              {timeTip && (
                <div className="rounded-xl bg-rose-pale p-3">
                  <p className="text-sm text-foreground">💡 {timeTip}</p>
                </div>
              )}
            </div>
          </section>

          {/* ── Section C: Piliers ── */}
          <section className="rounded-2xl border border-border bg-card p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-display font-bold text-foreground">📊 Mes piliers et leur répartition</h2>
              <Button
                variant="ghost"
                size="sm"
                onClick={suggestPillarDistribution}
                disabled={suggestingPillars}
                className="text-xs gap-1"
              >
                {suggestingPillars ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                Suggérer une répartition
              </Button>
            </div>

            <div className="space-y-4">
              {editorial.pillars.map((pillar, i) => (
                <div key={i} className="rounded-xl border border-border p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="text-sm">{pillar.is_major ? "🔥" : "🌱"}</span>
                    <Input
                      value={pillar.name}
                      onChange={(e) => updatePillar(i, "name", e.target.value)}
                      placeholder="Nom du pilier"
                      className="flex-1"
                    />
                    <button onClick={() => removePillar(i)} className="p-1.5 text-muted-foreground hover:text-destructive transition-colors">
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  <Textarea
                    value={pillar.description}
                    onChange={(e) => updatePillar(i, "description", e.target.value)}
                    placeholder="De quoi tu parles dans ce pilier ?"
                    className="min-h-[60px]"
                  />

                  <div className="flex items-center gap-3">
                    <Slider
                      value={[pillar.percentage]}
                      onValueChange={([v]) => updatePillar(i, "percentage", v)}
                      min={0}
                      max={100}
                      step={5}
                      className="flex-1"
                    />
                    <span className="text-sm font-semibold text-foreground w-12 text-right">{pillar.percentage}%</span>
                  </div>
                </div>
              ))}

              <button onClick={addPillar} className="flex items-center gap-1.5 text-sm text-primary hover:underline">
                <Plus className="h-3.5 w-3.5" /> Ajouter un pilier
              </button>

              {editorial.pillars.length > 0 && (
                <p className={`text-xs font-medium ${totalPercent === 100 ? "text-green-600" : "text-orange-500"}`}>
                  Total : {totalPercent}% {totalPercent === 100 ? "✅" : totalPercent > 100 ? "⚠️ Dépasse 100%" : `(il manque ${100 - totalPercent}%)`}
                </p>
              )}
            </div>
          </section>

          {/* ── Section D: Formats ── */}
          <section className="rounded-2xl border border-border bg-card p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-display font-bold text-foreground">📌 Mes formats préférés</h2>
              <Button
                variant="ghost"
                size="sm"
                onClick={suggestFormats}
                disabled={suggestingFormats}
                className="text-xs gap-1"
              >
                {suggestingFormats ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                Suggérer des formats
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {FORMATS.map((f) => (
                <Chip
                  key={f}
                  label={f}
                  selected={editorial.preferred_formats.includes(f)}
                  onClick={() => toggleFormat(f)}
                />
              ))}
            </div>
          </section>

          {/* ── Section E: Do more / Stop doing ── */}
          <section className="rounded-2xl border border-border bg-card p-5">
            <h2 className="text-base font-display font-bold text-foreground mb-3">🔥 Ce que je fais plus / Ce que j'arrête</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-sm font-medium text-foreground mb-1.5">Ce que je fais plus</p>
                <div className="relative">
                  <Textarea
                    value={editorial.do_more}
                    onChange={(e) => updateField("do_more", e.target.value)}
                    placeholder="Montrer mon visage, parler de mes convictions, faire des carrousels..."
                    className="pr-12 min-h-[100px]"
                  />
                  <MicBtn onResult={(t) => updateField("do_more", editorial.do_more + (editorial.do_more ? " " : "") + t)} />
                </div>
              </div>
              <div>
                <p className="text-sm font-medium text-foreground mb-1.5">Ce que j'arrête</p>
                <div className="relative">
                  <Textarea
                    value={editorial.stop_doing}
                    onChange={(e) => updateField("stop_doing", e.target.value)}
                    placeholder="Les photos produit sans contexte, les citations génériques..."
                    className="pr-12 min-h-[100px]"
                  />
                  <MicBtn onResult={(t) => updateField("stop_doing", editorial.stop_doing + (editorial.stop_doing ? " " : "") + t)} />
                </div>
              </div>
            </div>
          </section>

          {/* ── Section F: Notes libres ── */}
          <section className="rounded-2xl border border-border bg-card p-5">
            <h2 className="text-base font-display font-bold text-foreground mb-3">✍️ Notes libres</h2>
            <div className="relative">
              <Textarea
                value={editorial.free_notes}
                onChange={(e) => updateField("free_notes", e.target.value)}
                placeholder="Je veux toujours parler en tutoiement, jamais poster le dimanche, alterner contenu perso et pro..."
                className="pr-12 min-h-[100px]"
              />
              <MicBtn onResult={(t) => updateField("free_notes", editorial.free_notes + (editorial.free_notes ? " " : "") + t)} />
            </div>
          </section>

          {/* ── Save button ── */}
          <Button onClick={handleSave} disabled={saving} className="w-full rounded-pill gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            💾 Enregistrer ma ligne éditoriale
          </Button>
        </div>
      </main>
    </div>
  );
}
