import { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import AppHeader from "@/components/AppHeader";
import SubPageHeader from "@/components/SubPageHeader";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown } from "lucide-react";

export default function PinterestRoutine() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [routineId, setRoutineId] = useState<string | null>(null);
  const [rhythm, setRhythm] = useState("2h_monthly");
  const [pinsDone, setPinsDone] = useState(0);
  const [recycledDone, setRecycledDone] = useState(false);
  const [linksChecked, setLinksChecked] = useState(false);
  const [statsChecked, setStatsChecked] = useState(false);
  const [topPinsNoted, setTopPinsNoted] = useState(false);
  const [keywordsAdjusted, setKeywordsAdjusted] = useState(false);

  const pinsTarget = rhythm === "2h_biweekly" ? 10 : 5;
  const currentMonth = useMemo(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  }, []);
  const monthLabel = new Date().toLocaleDateString("fr-FR", { month: "long", year: "numeric" });

  useEffect(() => {
    if (!user) return;
    supabase.from("pinterest_routine").select("*").eq("user_id", user.id).eq("current_month", currentMonth).maybeSingle().then(({ data }) => {
      if (data) {
        setRoutineId(data.id);
        setRhythm(data.rhythm || "2h_monthly");
        setPinsDone(data.pins_done || 0);
        setRecycledDone(data.recycled_done || false);
        setLinksChecked(data.links_checked || false);
        setStatsChecked(data.stats_checked || false);
        setTopPinsNoted(data.top_pins_noted || false);
        setKeywordsAdjusted(data.keywords_adjusted || false);
      }
    });
  }, [user, currentMonth]);

  const save = async (overrides?: Partial<{ rhythm: string; pins_done: number; recycled_done: boolean; links_checked: boolean; stats_checked: boolean; top_pins_noted: boolean; keywords_adjusted: boolean }>) => {
    if (!user) return;
    const r = overrides?.rhythm ?? rhythm;
    const target = r === "2h_biweekly" ? 10 : 5;
    const payload: any = {
      user_id: user.id, rhythm: r, current_month: currentMonth, pins_target: target,
      pins_done: overrides?.pins_done ?? pinsDone,
      recycled_done: overrides?.recycled_done ?? recycledDone,
      links_checked: overrides?.links_checked ?? linksChecked,
      stats_checked: overrides?.stats_checked ?? statsChecked,
      top_pins_noted: overrides?.top_pins_noted ?? topPinsNoted,
      keywords_adjusted: overrides?.keywords_adjusted ?? keywordsAdjusted,
      updated_at: new Date().toISOString(),
    };
    if (routineId) { await supabase.from("pinterest_routine").update(payload).eq("id", routineId); }
    else { const { data } = await supabase.from("pinterest_routine").insert(payload).select("id").single(); if (data) setRoutineId(data.id); }
  };

  const changeRhythm = (r: string) => { setRhythm(r); setPinsDone(0); save({ rhythm: r, pins_done: 0 }); };
  const incrementPins = () => { const v = Math.min(pinsDone + 1, pinsTarget); setPinsDone(v); save({ pins_done: v }); };

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-3xl px-6 py-8 max-md:px-4">
        <SubPageHeader parentTo="/pinterest" parentLabel="Pinterest" currentLabel="Ma routine Pinterest" />
        <h1 className="font-display text-[22px] font-bold text-foreground mb-1">Ta routine Pinterest</h1>
        <p className="text-sm text-muted-foreground italic mb-6">Pinterest ne demande pas d'être là tous les jours. Un bon rythme : 2h par mois. C'est tout.</p>

        {/* Rhythm selection */}
        <section className="mb-8">
          <h3 className="font-display text-base font-bold mb-3">Ton rythme</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              { id: "2h_monthly", label: "2h par mois", desc: "Le minimum efficace. Tu publies tes épingles et tu lies à ton site." },
              { id: "2h_biweekly", label: "2h toutes les 2 semaines", desc: "Plus régulier. Tu postes, tu recycles, tu observes ce qui marche." },
            ].map(opt => (
              <button key={opt.id} onClick={() => changeRhythm(opt.id)} className={`rounded-xl border p-5 text-left transition-all ${rhythm === opt.id ? "border-primary border-2 bg-rose-pale" : "border-border bg-card hover:border-primary/40"}`}>
                <h4 className="font-display text-sm font-bold text-foreground">{opt.label}</h4>
                <p className="text-xs text-muted-foreground mt-1">{opt.desc}</p>
              </button>
            ))}
          </div>
        </section>

        {/* Monthly checklist */}
        <section className="rounded-xl border border-border bg-card p-5 space-y-4 mb-8">
          <h3 className="font-display text-base font-bold">📌 Ma routine Pinterest — {monthLabel}</h3>

          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold">CRÉATION</span>
              <span className="font-mono-ui text-xs font-bold text-primary">{pinsDone}/{pinsTarget}</span>
            </div>
            <Progress value={(pinsDone / pinsTarget) * 100} className="h-2 mb-3" />
            <div className="flex flex-wrap gap-2">
              {Array.from({ length: pinsTarget }).map((_, i) => (
                <div key={i} className={`w-8 h-8 rounded-full border-2 flex items-center justify-center text-xs transition-all ${i < pinsDone ? "bg-primary border-primary text-primary-foreground" : "border-border text-muted-foreground"}`}>
                  {i < pinsDone ? "✓" : i + 1}
                </div>
              ))}
              <Button size="sm" variant="outline" onClick={incrementPins} disabled={pinsDone >= pinsTarget} className="ml-auto text-xs">+1 épingle</Button>
            </div>
          </div>

          <div className="space-y-2 pt-2 border-t border-border">
            <p className="text-sm font-semibold">RECYCLAGE</p>
            <div className="flex items-center gap-2"><Checkbox checked={recycledDone} onCheckedChange={v => { setRecycledDone(!!v); save({ recycled_done: !!v }); }} /><span className="text-sm">J'ai recyclé des photos/posts Instagram en épingles</span></div>
            <div className="flex items-center gap-2"><Checkbox checked={linksChecked} onCheckedChange={v => { setLinksChecked(!!v); save({ links_checked: !!v }); }} /><span className="text-sm">J'ai ajouté les liens vers mon site sur chaque épingle</span></div>
          </div>

          <div className="space-y-2 pt-2 border-t border-border">
            <p className="text-sm font-semibold">OPTIMISATION</p>
            <div className="flex items-center gap-2"><Checkbox checked={statsChecked} onCheckedChange={v => { setStatsChecked(!!v); save({ stats_checked: !!v }); }} /><span className="text-sm">J'ai vérifié mes statistiques Pinterest</span></div>
            <div className="flex items-center gap-2"><Checkbox checked={topPinsNoted} onCheckedChange={v => { setTopPinsNoted(!!v); save({ top_pins_noted: !!v }); }} /><span className="text-sm">J'ai noté les épingles qui marchent le mieux</span></div>
            <div className="flex items-center gap-2"><Checkbox checked={keywordsAdjusted} onCheckedChange={v => { setKeywordsAdjusted(!!v); save({ keywords_adjusted: !!v }); }} /><span className="text-sm">J'ai ajusté mes mots-clés si besoin</span></div>
          </div>
        </section>

        {/* Tips */}
        <Collapsible>
          <CollapsibleTrigger className="flex items-center gap-2 text-sm font-semibold text-foreground"><ChevronDown className="h-4 w-4" /> 💡 Astuces gain de temps</CollapsibleTrigger>
          <CollapsibleContent className="mt-3 rounded-xl bg-rose-pale p-5 text-sm space-y-2">
            <p>• Recycle tes photos Instagram et tes shootings produit</p>
            <p>• Utilise Canva pour créer des épingles en lot (format 1000×1500px)</p>
            <p>• Si possible, utilise Tailwind pour programmer tes épingles</p>
            <p>• Les légendes courtes marchent très bien sur Pinterest</p>
            <p>• Épingle le même contenu dans plusieurs tableaux pertinents</p>
          </CollapsibleContent>
        </Collapsible>
      </main>
    </div>
  );
}
