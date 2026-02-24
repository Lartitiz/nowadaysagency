import { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspaceFilter, useWorkspaceId } from "@/hooks/use-workspace-query";
import AppHeader from "@/components/AppHeader";
import SubPageHeader from "@/components/SubPageHeader";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { useToast } from "@/hooks/use-toast";
import { Save, CalendarDays, ChevronDown } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Link } from "react-router-dom";

const SLOT_OPTIONS = [
  "Lundi matin", "Lundi après-midi", "Lundi soir",
  "Mardi matin", "Mardi après-midi", "Mardi soir",
  "Mercredi matin", "Mercredi après-midi", "Mercredi soir",
  "Jeudi matin", "Jeudi après-midi", "Jeudi soir",
  "Vendredi matin", "Vendredi après-midi", "Vendredi soir",
  "Samedi matin", "Samedi après-midi", "Samedi soir",
  "Dimanche matin", "Dimanche après-midi", "Dimanche soir",
];

export default function InstagramRythme() {
  const { user } = useAuth();
  const { column, value } = useWorkspaceFilter();
  const workspaceId = useWorkspaceId();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [existingId, setExistingId] = useState<string | null>(null);

  const [timeIdeas, setTimeIdeas] = useState(60);
  const [timeVisuals, setTimeVisuals] = useState(90);
  const [timeTexts, setTimeTexts] = useState(30);
  const [timeScheduling, setTimeScheduling] = useState(15);
  const [timeWeekly, setTimeWeekly] = useState(120);
  const [orgMode, setOrgMode] = useState<"freestyle" | "batching">("batching");
  const [selectedSlots, setSelectedSlots] = useState<string[]>([]);

  // Load existing data
  useEffect(() => {
    if (!user) return;
    (supabase.from("user_rhythm") as any).select("*").eq(column, value).maybeSingle().then(({ data }) => {
      if (data) {
        setExistingId(data.id);
        setTimeIdeas(data.time_ideas_monthly ?? 60);
        setTimeVisuals(data.time_visuals_per_content ?? 90);
        setTimeTexts(data.time_texts_per_content ?? 30);
        setTimeScheduling(data.time_scheduling_per_content ?? 15);
        setTimeWeekly(data.time_available_weekly ?? 120);
        setOrgMode((data.organization_mode as any) ?? "batching");
        try {
          setSelectedSlots(data.preferred_slots ? JSON.parse(data.preferred_slots) : []);
        } catch { setSelectedSlots([]); }
      }
    });
  }, [user?.id]);

  // Calculations
  const calcs = useMemo(() => {
    const perContent = timeVisuals + timeTexts + timeScheduling;
    const planningWeekly = timeIdeas / 4;
    const creaWeekly = timeWeekly - planningWeekly;
    const postsPerWeek = creaWeekly > 0 ? Math.floor((creaWeekly / perContent) * 2) / 2 : 0;
    const postsPerMonth = Math.round(postsPerWeek * 4.3);
    const remaining = Math.max(0, creaWeekly - postsPerWeek * perContent);
    const storiesPerDay = Math.floor(remaining / 10 / 7);
    return { perContent, postsPerWeek: Math.max(0, postsPerWeek), postsPerMonth, storiesPerDay };
  }, [timeIdeas, timeVisuals, timeTexts, timeScheduling, timeWeekly]);

  const getRecommendation = () => {
    if (timeWeekly < 60) return "1 contenu/semaine + stories quand tu peux";
    if (timeWeekly < 120) return "1-2 contenus/semaine + stories 2-3x/semaine";
    if (timeWeekly < 240) return "2-3 contenus/semaine + stories quotidiennes";
    if (timeWeekly < 360) return "3-4 contenus/semaine + stories quotidiennes";
    return "4-5 contenus/semaine + stories + engagement actif";
  };

  const toggleSlot = (slot: string) => {
    setSelectedSlots(prev => prev.includes(slot) ? prev.filter(s => s !== slot) : [...prev, slot]);
  };

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    const payload = {
      user_id: user.id,
      workspace_id: workspaceId !== user.id ? workspaceId : undefined,
      time_ideas_monthly: timeIdeas,
      time_visuals_per_content: timeVisuals,
      time_texts_per_content: timeTexts,
      time_scheduling_per_content: timeScheduling,
      time_available_weekly: timeWeekly,
      organization_mode: orgMode,
      preferred_slots: JSON.stringify(selectedSlots),
      posts_per_week: calcs.postsPerWeek,
      stories_per_day: calcs.storiesPerDay,
      updated_at: new Date().toISOString(),
    };
    const { error } = existingId
      ? await supabase.from("user_rhythm").update(payload).eq("id", existingId)
      : await supabase.from("user_rhythm").insert(payload);
    setSaving(false);
    if (error) { toast({ title: "Erreur", description: error.message, variant: "destructive" }); return; }
    toast({ title: "💾 Rythme enregistré !" });
  };

  const formatMin = (m: number) => m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? String(m % 60).padStart(2, "0") : ""}` : `${m} min`;

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-3xl px-6 py-8 max-md:px-4">
        <SubPageHeader parentTo="/instagram" parentLabel="Instagram" currentLabel="Ton temps & ton rythme" />
        <p className="text-sm text-muted-foreground italic -mt-4 mb-4">On part de ta réalité, pas d'un idéal impossible. Combien de temps t'as vraiment ? On calcule.</p>

        {/* Section 1: Time per step */}
        <section className="mt-8 space-y-6">
          <h2 className="font-display text-xl font-bold text-foreground">Combien de temps te prend chaque étape ?</h2>

          {[
            { label: "Idées + planning (calendrier édito)", help: "Le temps que tu passes à chercher des idées et planifier. ~1h par mois.", value: timeIdeas, set: setTimeIdeas, min: 0, max: 180, step: 15, unit: "min/mois" },
            { label: "Visuels (photos, vidéos, Canva, montage)", help: "Le temps moyen pour produire UN visuel.", value: timeVisuals, set: setTimeVisuals, min: 15, max: 240, step: 15, unit: "min/contenu" },
            { label: "Textes (légendes, accroches)", help: "Le temps pour écrire une légende.", value: timeTexts, set: setTimeTexts, min: 10, max: 90, step: 5, unit: "min/contenu" },
            { label: "Programmation + réponses aux messages", help: "Publier, programmer, répondre aux commentaires et DM.", value: timeScheduling, set: setTimeScheduling, min: 5, max: 60, step: 5, unit: "min/contenu" },
          ].map(({ label, help, value, set, min, max, step, unit }) => (
            <div key={label} className="space-y-2">
              <div className="flex justify-between items-baseline">
                <label className="text-sm font-semibold text-foreground">{label}</label>
                <span className="text-sm font-mono text-primary font-bold">{formatMin(value)}</span>
              </div>
              <p className="text-xs text-muted-foreground">{help}</p>
              <Slider value={[value]} onValueChange={([v]) => set(v)} min={min} max={max} step={step} className="[&_[role=slider]]:bg-primary" />
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>{formatMin(min)}</span>
                <span>{unit}</span>
                <span>{formatMin(max)}</span>
              </div>
            </div>
          ))}

          {/* Real-time calculation */}
          <div className="rounded-xl bg-rose-pale p-5 space-y-1">
            <p className="text-sm font-semibold text-foreground">⏱️ Temps estimé par contenu : <span className="text-primary">{formatMin(calcs.perContent)}</span></p>
            <p className="text-xs text-muted-foreground">(visuels + textes + programmation)</p>
          </div>
        </section>

        {/* Section 2: Weekly availability */}
        <section className="mt-10 space-y-4">
          <h2 className="font-display text-xl font-bold text-foreground">Combien de temps t'as par semaine ?</h2>
          <div className="space-y-2">
            <div className="flex justify-between items-baseline">
              <label className="text-sm font-semibold text-foreground">Temps disponible par semaine pour ta communication</label>
              <span className="text-sm font-mono text-primary font-bold">{formatMin(timeWeekly)}</span>
            </div>
            <Slider value={[timeWeekly]} onValueChange={([v]) => setTimeWeekly(v)} min={30} max={600} step={30} className="[&_[role=slider]]:bg-primary" />
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>30 min</span>
              <span>10h</span>
            </div>
          </div>

          {/* Result card */}
          <div className="rounded-2xl border-2 border-primary bg-card p-6 shadow-md space-y-3">
            <h3 className="font-display text-lg font-bold text-foreground">🎯 Ton rythme idéal</h3>
            <p className="text-sm text-muted-foreground">Avec <span className="font-bold text-foreground">{formatMin(timeWeekly)}</span> par semaine, tu peux réalistement :</p>
            <div className="space-y-1.5 text-sm">
              <p>📱 Publier <span className="font-bold text-primary">{calcs.postsPerWeek}</span> contenu{calcs.postsPerWeek > 1 ? "s" : ""} par semaine</p>
              <p>📸 Soit <span className="font-bold text-primary">{calcs.postsPerMonth}</span> contenus par mois</p>
              <p>📖 Faire <span className="font-bold text-primary">{calcs.storiesPerDay}</span> min de stories par jour</p>
            </div>
            <div className="pt-2 border-t border-border">
              <p className="text-xs text-muted-foreground italic">💡 {getRecommendation()}</p>
              <p className="text-xs text-muted-foreground mt-1">Mieux vaut 1 contenu par semaine pendant 6 mois que 5 par semaine pendant 2 semaines.</p>
            </div>
          </div>
        </section>

        {/* Section 3: Organization mode */}
        <section className="mt-10 space-y-4">
          <h2 className="font-display text-xl font-bold text-foreground">Ton mode d'organisation</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              { mode: "freestyle" as const, emoji: "🌊", title: "Freestyle", desc: "Tu crées quand l'inspiration vient. Tu publies au fil de l'eau." },
              { mode: "batching" as const, emoji: "📦", title: "Batching", desc: "Tu bloques un créneau et tu crées tout d'un coup. Plus efficace, moins de charge mentale." },
            ].map(({ mode, emoji, title, desc }) => (
              <button key={mode} onClick={() => setOrgMode(mode)} className={`rounded-xl border-2 p-5 text-left transition-all ${orgMode === mode ? "border-primary bg-rose-pale" : "border-border bg-card hover:border-primary/40"}`}>
                <span className="text-2xl">{emoji}</span>
                <h4 className="font-display font-bold mt-2">{title}</h4>
                <p className="text-xs text-muted-foreground mt-1">{desc}</p>
              </button>
            ))}
          </div>

          <div className="mt-4">
            <label className="text-sm font-semibold text-foreground block mb-3">Tes meilleurs créneaux dans la semaine</label>
            <div className="flex flex-wrap gap-2">
              {SLOT_OPTIONS.map(slot => (
                <button key={slot} onClick={() => toggleSlot(slot)} className={`text-xs px-3 py-1.5 rounded-full border transition-all ${selectedSlots.includes(slot) ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border text-muted-foreground hover:border-primary/40"}`}>
                  {slot}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* Section 4: Simple plan */}
        {selectedSlots.length > 0 && (
          <section className="mt-10">
            <div className="rounded-xl bg-rose-pale border-l-4 border-primary p-5 space-y-2">
              <h3 className="font-display font-bold text-foreground">📋 Ton plan réaliste</h3>
              {selectedSlots.slice(0, Math.ceil(calcs.postsPerWeek)).map((slot, i) => (
                <p key={i} className="text-sm text-foreground">• <span className="font-semibold">{slot}</span> : création de contenu ({formatMin(calcs.perContent)})</p>
              ))}
              {selectedSlots.length > Math.ceil(calcs.postsPerWeek) && (
                <p className="text-sm text-foreground">• <span className="font-semibold">{selectedSlots[Math.ceil(calcs.postsPerWeek)]}</span> : stories + réponses aux messages (30 min)</p>
              )}
              <p className="text-xs text-muted-foreground mt-2 italic">Objectif : {calcs.postsPerWeek} contenu{calcs.postsPerWeek > 1 ? "s" : ""}/semaine, tenable sur la durée. N'oublie pas : la régularité bat toujours l'intensité.</p>
            </div>
          </section>
        )}

        {/* Action buttons */}
        <div className="mt-8 flex flex-wrap gap-3">
          <Button onClick={handleSave} disabled={saving} className="gap-2">
            <Save className="h-4 w-4" />
            {saving ? "Enregistrement..." : "💾 Enregistrer mon rythme"}
          </Button>
          <Button variant="outline" asChild className="gap-2">
            <Link to="/calendrier?canal=instagram">
              <CalendarDays className="h-4 w-4" />
              📅 Appliquer au calendrier →
            </Link>
          </Button>
        </div>

        {/* Tips */}
        <Collapsible className="mt-10">
          <CollapsibleTrigger className="flex items-center gap-2 text-sm font-semibold text-primary hover:underline">
            <ChevronDown className="h-4 w-4" />
            💡 Trucs pour aller plus vite
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-3 rounded-xl bg-rose-pale p-5 text-sm text-foreground space-y-2">
            <p>• Avoir une banque de templates Canva (on t'en donne dans les guides)</p>
            <p>• Te faire une base de légendes types ou de prompts à adapter (c'est ce que fait l'atelier d'idées)</p>
            <p>• Utiliser Meta Business Suite pour planifier à l'avance</p>
            <p>• Quand t'as vraiment pas le temps : communique juste en stories</p>
            <p>• Prendre des photos et vidéos au quotidien pour avoir une base</p>
          </CollapsibleContent>
        </Collapsible>
      </main>
    </div>
  );
}
