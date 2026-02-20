import { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import AppHeader from "@/components/AppHeader";
import SubPageHeader from "@/components/SubPageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { Copy, Check, Sparkles, ChevronDown } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import Confetti from "@/components/Confetti";

const TARGETS: Record<number, { dm: number; comments: number; replies: number }> = {
  5: { dm: 2, comments: 2, replies: 1 },
  10: { dm: 4, comments: 4, replies: 2 },
  15: { dm: 6, comments: 6, replies: 3 },
};

function getMonday(d: Date) {
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.getFullYear(), d.getMonth(), diff);
}

function getEmoji(done: number, target: number) {
  const pct = target > 0 ? done / target : 0;
  if (pct >= 1) return "🎉";
  if (pct >= 0.7) return "✅";
  if (pct >= 0.4) return "⚠️";
  return "😅";
}

export default function InstagramEngagement() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [prenom, setPrenom] = useState("");
  const [showConfetti, setShowConfetti] = useState(false);
  const [copied, setCopied] = useState(false);

  // Exercise state
  const [exerciseId, setExerciseId] = useState<string | null>(null);
  const [followers, setFollowers] = useState<{ name: string; done: boolean }[]>(
    Array.from({ length: 5 }, () => ({ name: "", done: false }))
  );
  const [exerciseCompleted, setExerciseCompleted] = useState(false);

  // Weekly state
  const [weeklyId, setWeeklyId] = useState<string | null>(null);
  const [objective, setObjective] = useState(10);
  const [dmDone, setDmDone] = useState(0);
  const [commentsDone, setCommentsDone] = useState(0);
  const [repliesDone, setRepliesDone] = useState(0);
  const [history, setHistory] = useState<any[]>([]);

  const monday = useMemo(() => {
    const m = getMonday(new Date());
    return m.toISOString().split("T")[0];
  }, []);

  const sunday = useMemo(() => {
    const m = getMonday(new Date());
    const s = new Date(m);
    s.setDate(s.getDate() + 6);
    return s.toISOString().split("T")[0];
  }, []);

  const targets = TARGETS[objective] || TARGETS[10];
  const totalDone = dmDone + commentsDone + repliesDone;
  const totalTarget = targets.dm + targets.comments + targets.replies;

  // Load data
  useEffect(() => {
    if (!user) return;
    const load = async () => {
      // Profile
      const { data: profile } = await supabase.from("profiles").select("prenom").eq("user_id", user.id).maybeSingle();
      if (profile?.prenom) setPrenom(profile.prenom);

      // Exercise
      const { data: ex } = await supabase.from("engagement_exercise").select("*").eq("user_id", user.id).maybeSingle();
      if (ex) {
        setExerciseId(ex.id);
        setExerciseCompleted(ex.completed ?? false);
        setFollowers([
          { name: ex.follower_1_name ?? "", done: ex.follower_1_done ?? false },
          { name: ex.follower_2_name ?? "", done: ex.follower_2_done ?? false },
          { name: ex.follower_3_name ?? "", done: ex.follower_3_done ?? false },
          { name: ex.follower_4_name ?? "", done: ex.follower_4_done ?? false },
          { name: ex.follower_5_name ?? "", done: ex.follower_5_done ?? false },
        ]);
      }

      // Weekly - current week
      const { data: week } = await supabase.from("engagement_weekly").select("*").eq("user_id", user.id).eq("week_start", monday).maybeSingle();
      if (week) {
        setWeeklyId(week.id);
        setObjective(week.objective ?? 10);
        setDmDone(week.dm_done ?? 0);
        setCommentsDone(week.comments_done ?? 0);
        setRepliesDone(week.replies_done ?? 0);
      }

      // History
      const { data: hist } = await supabase.from("engagement_weekly").select("*").eq("user_id", user.id).neq("week_start", monday).order("week_start", { ascending: false }).limit(10);
      setHistory(hist || []);
    };
    load();
  }, [user, monday]);

  // Save exercise
  const saveExercise = async () => {
    if (!user) return;
    const allDone = followers.every(f => f.done);
    const payload: any = {
      user_id: user.id,
      follower_1_name: followers[0].name, follower_1_done: followers[0].done,
      follower_2_name: followers[1].name, follower_2_done: followers[1].done,
      follower_3_name: followers[2].name, follower_3_done: followers[2].done,
      follower_4_name: followers[3].name, follower_4_done: followers[3].done,
      follower_5_name: followers[4].name, follower_5_done: followers[4].done,
      completed: allDone,
    };
    if (exerciseId) {
      await supabase.from("engagement_exercise").update(payload).eq("id", exerciseId);
    } else {
      const { data } = await supabase.from("engagement_exercise").insert(payload).select("id").single();
      if (data) setExerciseId(data.id);
    }
    if (allDone && !exerciseCompleted) {
      setExerciseCompleted(true);
      setShowConfetti(true);
    }
  };

  const updateFollower = (idx: number, field: "name" | "done", value: any) => {
    setFollowers(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: value };
      return next;
    });
  };

  // Save + auto-save exercise on change
  useEffect(() => {
    if (!user || !exerciseId) return;
    const t = setTimeout(() => saveExercise(), 1000);
    return () => clearTimeout(t);
  }, [followers]);

  // Save weekly
  const saveWeekly = async (newDm?: number, newComments?: number, newReplies?: number) => {
    if (!user) return;
    const dm = newDm ?? dmDone;
    const comments = newComments ?? commentsDone;
    const replies = newReplies ?? repliesDone;
    const t = TARGETS[objective] || TARGETS[10];
    const payload: any = {
      user_id: user.id,
      week_start: monday,
      objective,
      dm_target: t.dm,
      dm_done: dm,
      comments_target: t.comments,
      comments_done: comments,
      replies_target: t.replies,
      replies_done: replies,
      total_done: dm + comments + replies,
      updated_at: new Date().toISOString(),
    };
    if (weeklyId) {
      await supabase.from("engagement_weekly").update(payload).eq("id", weeklyId);
    } else {
      const { data } = await supabase.from("engagement_weekly").insert(payload).select("id").single();
      if (data) setWeeklyId(data.id);
    }
  };

  const incrementDm = () => { const v = Math.min(dmDone + 1, targets.dm); setDmDone(v); saveWeekly(v, commentsDone, repliesDone); };
  const incrementComments = () => { const v = Math.min(commentsDone + 1, targets.comments); setCommentsDone(v); saveWeekly(dmDone, v, repliesDone); };
  const incrementReplies = () => { const v = Math.min(repliesDone + 1, targets.replies); setRepliesDone(v); saveWeekly(dmDone, commentsDone, v); };

  const changeObjective = async (obj: number) => {
    setObjective(obj);
    const t = TARGETS[obj] || TARGETS[10];
    // Reset counters when changing objective
    setDmDone(0); setCommentsDone(0); setRepliesDone(0);
    if (!user) return;
    const payload: any = {
      user_id: user.id,
      week_start: monday,
      objective: obj,
      dm_target: t.dm, dm_done: 0,
      comments_target: t.comments, comments_done: 0,
      replies_target: t.replies, replies_done: 0,
      total_done: 0,
      updated_at: new Date().toISOString(),
    };
    if (weeklyId) {
      await supabase.from("engagement_weekly").update(payload).eq("id", weeklyId);
    } else {
      const { data } = await supabase.from("engagement_weekly").insert(payload).select("id").single();
      if (data) setWeeklyId(data.id);
    }
  };

  const messageTemplate = `Hello [prénom],

Voilà, ça fait un moment que tu me suis, que tu soutiens ma petite entreprise en likant et commentant de temps en temps.

Je voulais tout simplement te remercier.

Tu ne te rends sûrement pas compte à quel point c'est important dans le développement de mon projet.

Donc encore merci pour tout 🌟

Et sinon comment tu as découvert mon compte ?

${prenom || "[Ton prénom]"}`;

  const copyMessage = () => {
    navigator.clipboard.writeText(messageTemplate);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({ title: "📋 Message copié !" });
  };

  const doneCount = followers.filter(f => f.done).length;
  const progressPct = totalTarget > 0 ? Math.round((totalDone / totalTarget) * 100) : 0;

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      {showConfetti && <Confetti />}
      <main className="mx-auto max-w-3xl px-6 py-8 max-md:px-4">
        <SubPageHeader parentTo="/instagram" parentLabel="Instagram" currentLabel="Ton engagement" />
        <p className="text-sm text-muted-foreground italic -mt-4 mb-4">Tu publies du contenu soigné mais l'engagement ne suit pas ? Peut-être que tu as oublié l'essence des réseaux sociaux : l'interaction humaine.</p>

        {/* Intro */}
        <div className="mt-6 rounded-xl bg-rose-pale p-5 text-sm text-foreground">
          Tes abonnés ne sont pas des chiffres : ce sont des vraies personnes. Et en tant que créatrice, tu as un super-pouvoir que les grandes marques n'ont pas : créer du lien direct, humain, chaleureux.
        </div>

        {/* Section 1: Guided exercise */}
        <section className="mt-10 space-y-4">
          <h2 className="font-display text-xl font-bold text-foreground">🚀 Ton premier exercice d'engagement</h2>
          <p className="text-sm text-muted-foreground">Sélectionne 5 abonnés engagés et envoie-leur un message de remerciement. Préfère des personnes en dehors de ton réseau proche.</p>

          {/* Message template */}
          <div className="rounded-xl bg-rose-pale p-5 relative">
            <button onClick={copyMessage} className="absolute top-3 right-3 text-xs flex items-center gap-1 text-primary hover:underline">
              {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              {copied ? "Copié !" : "📋 Copier"}
            </button>
            <p className="text-sm text-foreground whitespace-pre-line font-mono leading-relaxed">{messageTemplate}</p>
          </div>

          {/* Follower inputs */}
          <div className="space-y-3">
            {followers.map((f, idx) => (
              <div key={idx} className="flex items-center gap-3">
                <span className="text-xs font-mono text-muted-foreground w-4">{idx + 1}.</span>
                <Input
                  placeholder={`Nom/pseudo de l'abonné·e ${idx + 1}`}
                  value={f.name}
                  onChange={e => updateFollower(idx, "name", e.target.value)}
                  className="flex-1 text-sm"
                />
                <div className="flex items-center gap-2">
                  <Checkbox
                    checked={f.done}
                    onCheckedChange={v => { updateFollower(idx, "done", !!v); }}
                  />
                  <span className="text-xs text-muted-foreground">Envoyé</span>
                </div>
              </div>
            ))}
          </div>

          {/* Progress */}
          <div className="flex items-center gap-3">
            <Progress value={(doneCount / 5) * 100} className="flex-1 h-2" />
            <span className="text-sm font-mono font-bold text-primary">{doneCount}/5</span>
          </div>

          {!exerciseId && (
            <Button onClick={saveExercise} size="sm" variant="outline">Commencer l'exercice</Button>
          )}

          {exerciseCompleted && (
            <div className="rounded-xl bg-rose-pale border border-primary/20 p-4 text-sm text-foreground">
              🎉 Bravo ! Tu viens de créer 5 connexions vraies. Reviens la semaine prochaine.
            </div>
          )}
        </section>

        {/* Section 2: Weekly checklist */}
        <section className="mt-10 space-y-4">
          <h2 className="font-display text-xl font-bold text-foreground">📋 Ma checklist engagement de la semaine</h2>
          <p className="text-xs text-muted-foreground">Semaine du {new Date(monday).toLocaleDateString("fr-FR")} au {new Date(sunday).toLocaleDateString("fr-FR")}</p>

          {/* Objective selector */}
          <div className="flex gap-2">
            {[5, 10, 15].map(obj => (
              <button key={obj} onClick={() => changeObjective(obj)} className={`text-sm px-4 py-2 rounded-full border transition-all ${objective === obj ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border text-muted-foreground hover:border-primary/40"}`}>
                {obj}/semaine
              </button>
            ))}
          </div>

          {/* Progress ring */}
          <div className="flex items-center gap-4">
            <div className="relative w-20 h-20">
              <svg viewBox="0 0 36 36" className="w-20 h-20 -rotate-90">
                <circle cx="18" cy="18" r="16" fill="none" stroke="hsl(var(--border))" strokeWidth="3" />
                <circle cx="18" cy="18" r="16" fill="none" stroke="hsl(var(--primary))" strokeWidth="3" strokeDasharray={`${progressPct} 100`} strokeLinecap="round" className="transition-all duration-500" />
              </svg>
              <span className="absolute inset-0 flex items-center justify-center text-sm font-bold text-primary">{totalDone}/{totalTarget}</span>
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Actions cette semaine</p>
              <p className="text-xs text-muted-foreground">{getEmoji(totalDone, totalTarget)} {progressPct}% complété</p>
            </div>
          </div>

          {/* Checklist items */}
          <div className="space-y-4">
            {/* DMs */}
            <div className="rounded-xl border border-border p-4 space-y-2">
              <div className="flex justify-between items-center">
                <h4 className="text-sm font-bold text-foreground">💬 Messages privés</h4>
                <span className="text-xs font-mono text-primary">{dmDone}/{targets.dm}</span>
              </div>
              <div className="flex gap-2">
                {Array.from({ length: targets.dm }).map((_, i) => (
                  <div key={i} className={`w-8 h-8 rounded-full border-2 flex items-center justify-center text-xs transition-all ${i < dmDone ? "bg-primary border-primary text-primary-foreground" : "border-border text-muted-foreground"}`}>
                    {i < dmDone ? "✓" : i + 1}
                  </div>
                ))}
                <Button size="sm" variant="outline" onClick={incrementDm} disabled={dmDone >= targets.dm} className="ml-auto text-xs">
                  +1
                </Button>
              </div>
            </div>

            {/* Comments */}
            <div className="rounded-xl border border-border p-4 space-y-2">
              <div className="flex justify-between items-center">
                <h4 className="text-sm font-bold text-foreground">💬 Commentaires sur d'autres comptes</h4>
                <span className="text-xs font-mono text-primary">{commentsDone}/{targets.comments}</span>
              </div>
              <div className="flex gap-2">
                {Array.from({ length: targets.comments }).map((_, i) => (
                  <div key={i} className={`w-8 h-8 rounded-full border-2 flex items-center justify-center text-xs transition-all ${i < commentsDone ? "bg-primary border-primary text-primary-foreground" : "border-border text-muted-foreground"}`}>
                    {i < commentsDone ? "✓" : i + 1}
                  </div>
                ))}
                <Button size="sm" variant="outline" onClick={incrementComments} disabled={commentsDone >= targets.comments} className="ml-auto text-xs">
                  +1
                </Button>
              </div>
            </div>

            {/* Replies */}
            <div className="rounded-xl border border-border p-4 space-y-2">
              <div className="flex justify-between items-center">
                <h4 className="text-sm font-bold text-foreground">📩 Réponses</h4>
                <span className="text-xs font-mono text-primary">{repliesDone}/{targets.replies}</span>
              </div>
              <div className="flex gap-2">
                {Array.from({ length: targets.replies }).map((_, i) => (
                  <div key={i} className={`w-8 h-8 rounded-full border-2 flex items-center justify-center text-xs transition-all ${i < repliesDone ? "bg-primary border-primary text-primary-foreground" : "border-border text-muted-foreground"}`}>
                    {i < repliesDone ? "✓" : i + 1}
                  </div>
                ))}
                <Button size="sm" variant="outline" onClick={incrementReplies} disabled={repliesDone >= targets.replies} className="ml-auto text-xs">
                  +1
                </Button>
              </div>
            </div>
          </div>

          {/* History */}
          {history.length > 0 && (
            <Accordion type="single" collapsible>
              <AccordionItem value="history">
                <AccordionTrigger className="text-sm font-semibold">Mes semaines précédentes</AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-2">
                    {history.map(w => {
                      const wTarget = (TARGETS[w.objective] || TARGETS[10]);
                      const wTotal = wTarget.dm + wTarget.comments + wTarget.replies;
                      return (
                        <div key={w.id} className="flex items-center justify-between text-sm rounded-lg border border-border px-4 py-2">
                          <span className="text-muted-foreground">Semaine du {new Date(w.week_start).toLocaleDateString("fr-FR")}</span>
                          <span className="font-mono font-bold">{w.total_done}/{wTotal} {getEmoji(w.total_done, wTotal)}</span>
                        </div>
                      );
                    })}
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          )}
        </section>

        {/* Section 3: Quick guide */}
        <Collapsible className="mt-10">
          <CollapsibleTrigger className="flex items-center gap-2 text-sm font-semibold text-primary hover:underline">
            <ChevronDown className="h-4 w-4" />
            💡 Les bonnes pratiques d'engagement
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-3 rounded-xl bg-rose-pale p-5 text-sm text-foreground space-y-3">
            <div>
              <p className="font-bold">Messages privés :</p>
              <p>• Envoie un petit message à 1-3 nouvelles personnes chaque jour</p>
              <p>• Pas besoin d'un roman : un compliment sincère, une question, un merci</p>
            </div>
            <div>
              <p className="font-bold">Commentaires :</p>
              <p>• Commente des comptes qui t'inspirent pour créer de vraies connexions</p>
              <p>• Un commentaire de 2-3 phrases vaut 100 likes</p>
            </div>
            <div>
              <p className="font-bold">Stories interactives :</p>
              <p>• Utilise les sondages, quiz, questions</p>
              <p>• Réponds aux réactions en MP : c'est là que le lien se crée</p>
            </div>
            <div>
              <p className="font-bold">Le conseil qui change tout :</p>
              <p>• Limite tes abonnements à ~200 comptes max</p>
              <p>• Dès que tu te compares négativement à un compte : tu unfollow</p>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </main>
    </div>
  );
}
