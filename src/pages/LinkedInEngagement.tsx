import { useState, useEffect, useMemo } from "react";
import { toLocalDateStr } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspaceFilter, useWorkspaceId } from "@/hooks/use-workspace-query";
import AppHeader from "@/components/AppHeader";
import SubPageHeader from "@/components/SubPageHeader";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Link } from "react-router-dom";
import { Check, ExternalLink } from "lucide-react";

const TARGETS: Record<number, { comments: number; messages: number }> = {
  3: { comments: 2, messages: 1 },
  5: { comments: 3, messages: 2 },
  10: { comments: 6, messages: 4 },
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

interface StrategyAccount {
  name: string;
  niche?: string;
  url?: string;
}

export default function LinkedInEngagement() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { column, value } = useWorkspaceFilter();
  const workspaceId = useWorkspaceId();

  const [weeklyId, setWeeklyId] = useState<string | null>(null);
  const [objective, setObjective] = useState(5);
  const [commentsDone, setCommentsDone] = useState(0);
  const [messagesDone, setMessagesDone] = useState(0);
  const [history, setHistory] = useState<any[]>([]);

  // Strategy accounts
  const [strategyAccounts, setStrategyAccounts] = useState<StrategyAccount[]>([]);
  const [commentedAccounts, setCommentedAccounts] = useState<Set<string>>(new Set());

  const monday = useMemo(() => toLocalDateStr(getMonday(new Date())), []);
  const sunday = useMemo(() => {
    const m = getMonday(new Date());
    const s = new Date(m);
    s.setDate(s.getDate() + 6);
    return toLocalDateStr(s);
  }, []);

  const targets = TARGETS[objective] || TARGETS[5];
  const totalDone = commentsDone + messagesDone;
  const totalTarget = targets.comments + targets.messages;
  const progressPct = totalTarget > 0 ? Math.round((totalDone / totalTarget) * 100) : 0;

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const [weekRes, histRes, stratRes] = await Promise.all([
        (supabase.from("engagement_weekly_linkedin") as any).select("*").eq(column, value).eq("week_start", monday).maybeSingle(),
        (supabase.from("engagement_weekly_linkedin") as any).select("*").eq(column, value).neq("week_start", monday).order("week_start", { ascending: false }).limit(10),
        (supabase.from("linkedin_comment_strategy") as any).select("accounts").eq(column, value).maybeSingle(),
      ]);
      if (weekRes.data) {
        setWeeklyId(weekRes.data.id);
        setObjective(weekRes.data.objective ?? 5);
        setCommentsDone(weekRes.data.comments_done ?? 0);
        setMessagesDone(weekRes.data.messages_done ?? 0);
        // Load commented accounts from weekly data
        const saved = weekRes.data.commented_accounts;
        if (Array.isArray(saved)) setCommentedAccounts(new Set(saved));
      }
      setHistory(histRes.data || []);
      if (stratRes.data?.accounts) {
        try {
          const accs = typeof stratRes.data.accounts === "string" ? JSON.parse(stratRes.data.accounts) : stratRes.data.accounts;
          if (Array.isArray(accs)) setStrategyAccounts(accs);
        } catch { /* ignore */ }
      }
    };
    load();
  }, [user, monday]);

  const saveWeekly = async (newComments?: number, newMessages?: number, newCommentedAccounts?: Set<string>) => {
    if (!user) return;
    const c = newComments ?? commentsDone;
    const m = newMessages ?? messagesDone;
    const t = TARGETS[objective] || TARGETS[5];
    const ca = newCommentedAccounts ?? commentedAccounts;
    const payload: any = {
      user_id: user.id, workspace_id: workspaceId !== user.id ? workspaceId : undefined, week_start: monday, objective,
      comments_target: t.comments, comments_done: c,
      messages_target: t.messages, messages_done: m,
      total_done: c + m, commented_accounts: Array.from(ca), updated_at: new Date().toISOString(),
    };
    if (weeklyId) {
      await supabase.from("engagement_weekly_linkedin").update(payload).eq("id", weeklyId);
    } else {
      const { data } = await supabase.from("engagement_weekly_linkedin").insert(payload).select("id").single();
      if (data) setWeeklyId(data.id);
    }
  };

  const incrementComments = () => { const v = Math.min(commentsDone + 1, targets.comments); setCommentsDone(v); saveWeekly(v, messagesDone); };
  const incrementMessages = () => { const v = Math.min(messagesDone + 1, targets.messages); setMessagesDone(v); saveWeekly(commentsDone, v); };

  const toggleAccountCommented = (name: string) => {
    setCommentedAccounts(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      saveWeekly(undefined, undefined, next);
      return next;
    });
  };

  const changeObjective = async (obj: number) => {
    setObjective(obj);
    setCommentsDone(0); setMessagesDone(0);
    if (!user) return;
    const t = TARGETS[obj] || TARGETS[5];
    const payload: any = {
      user_id: user.id, workspace_id: workspaceId !== user.id ? workspaceId : undefined, week_start: monday, objective: obj,
      comments_target: t.comments, comments_done: 0,
      messages_target: t.messages, messages_done: 0,
      total_done: 0, commented_accounts: [], updated_at: new Date().toISOString(),
    };
    if (weeklyId) {
      await supabase.from("engagement_weekly_linkedin").update(payload).eq("id", weeklyId);
    } else {
      const { data } = await supabase.from("engagement_weekly_linkedin").insert(payload).select("id").single();
      if (data) setWeeklyId(data.id);
    }
    setCommentedAccounts(new Set());
  };

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-3xl px-6 py-8 max-md:px-4">
        <SubPageHeader parentTo="/linkedin" parentLabel="LinkedIn" currentLabel="Mon engagement" />

        <h1 className="font-display text-[22px] font-bold text-foreground mb-1">Ton engagement LinkedIn</h1>
        <p className="text-sm text-muted-foreground italic mb-6">Sur LinkedIn, les commentaires sont rois. C'est là que tu te rends visible et que tu crées des connexions.</p>

        {/* Guide – visible, not collapsed */}
        <div className="rounded-xl bg-rose-pale p-5 text-sm space-y-3 mb-8">
          <h3 className="font-semibold text-foreground">💡 5 règles pour commenter efficacement</h3>
          <p><strong>1. 15+ mots minimum.</strong> Les commentaires courts ("Super !", "Merci du partage") sont ignorés par l'algorithme.</p>
          <p><strong>2. Donne ton point de vue.</strong> Dire "c'est bien" ne sert à rien. Mouille-toi, apporte ton expertise.</p>
          <p><strong>3. Commente dans les 60 premières minutes.</strong> C'est la Golden Hour du post : ton commentaire sera vu par tout le monde.</p>
          <p><strong>4. Réponds aux réponses.</strong> Créer un thread sous un commentaire est plus puissant qu'un commentaire isolé.</p>
          <p><strong>5. Choisis les sujets, pas les gens.</strong> Commente ce qui t'intéresse vraiment, pas les gros comptes "pour prendre des abonnés".</p>
          <p className="text-muted-foreground">💡 Bonus : si un commentaire prend plus de 10% d'engagement par rapport au post original, transforme-le en publication.</p>
        </div>

        {/* Weekly checklist */}
        <section className="space-y-4">
          <h2 className="font-display text-xl font-bold">📋 Ma checklist engagement de la semaine</h2>
          <p className="text-xs text-muted-foreground">Semaine du {new Date(monday).toLocaleDateString("fr-FR")} au {new Date(sunday).toLocaleDateString("fr-FR")}</p>

          {/* Objective selector */}
          <div className="flex gap-2">
            {[3, 5, 10].map(obj => (
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

          {/* Comments */}
          <div className="rounded-xl border border-border p-4 space-y-2">
            <div className="flex justify-between items-center">
              <h4 className="text-sm font-bold text-foreground">💬 Commentaires</h4>
              <span className="text-xs font-mono text-primary">{commentsDone}/{targets.comments}</span>
            </div>
            <div className="flex gap-2">
              {Array.from({ length: targets.comments }).map((_, i) => (
                <div key={i} className={`w-8 h-8 rounded-full border-2 flex items-center justify-center text-xs transition-all ${i < commentsDone ? "bg-primary border-primary text-primary-foreground" : "border-border text-muted-foreground"}`}>
                  {i < commentsDone ? "✓" : i + 1}
                </div>
              ))}
              <Button size="sm" variant="outline" onClick={incrementComments} disabled={commentsDone >= targets.comments} className="ml-auto text-xs">+1</Button>
            </div>
          </div>

          {/* Messages */}
          <div className="rounded-xl border border-border p-4 space-y-2">
            <div className="flex justify-between items-center">
              <h4 className="text-sm font-bold text-foreground">✉️ Messages</h4>
              <span className="text-xs font-mono text-primary">{messagesDone}/{targets.messages}</span>
            </div>
            <div className="flex gap-2">
              {Array.from({ length: targets.messages }).map((_, i) => (
                <div key={i} className={`w-8 h-8 rounded-full border-2 flex items-center justify-center text-xs transition-all ${i < messagesDone ? "bg-primary border-primary text-primary-foreground" : "border-border text-muted-foreground"}`}>
                  {i < messagesDone ? "✓" : i + 1}
                </div>
              ))}
              <Button size="sm" variant="outline" onClick={incrementMessages} disabled={messagesDone >= targets.messages} className="ml-auto text-xs">+1</Button>
            </div>
          </div>
        </section>

        {/* Strategy accounts checklist */}
        {strategyAccounts.length > 0 && (
          <section className="mt-8 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-base font-bold text-foreground">🎯 Mes comptes à commenter cette semaine</h2>
              <Link to="/linkedin/comment-strategy" className="text-xs text-primary hover:underline flex items-center gap-1">
                Modifier ma liste <ExternalLink className="h-3 w-3" />
              </Link>
            </div>
            <div className="space-y-2">
              {strategyAccounts.map((acc) => {
                const isChecked = commentedAccounts.has(acc.name);
                return (
                  <button
                    key={acc.name}
                    onClick={() => toggleAccountCommented(acc.name)}
                    className={`w-full flex items-center gap-3 rounded-xl border p-3 text-left transition-all ${isChecked ? "border-primary/40 bg-primary/5" : "border-border bg-card hover:border-primary/30"}`}
                  >
                    <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${isChecked ? "bg-primary border-primary" : "border-border"}`}>
                      {isChecked && <Check className="h-3.5 w-3.5 text-primary-foreground" />}
                    </div>
                    <div className="min-w-0">
                      <p className={`text-sm font-medium ${isChecked ? "text-muted-foreground line-through" : "text-foreground"}`}>{acc.name}</p>
                      {acc.niche && <p className="text-xs text-muted-foreground truncate">{acc.niche}</p>}
                    </div>
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground">
              {commentedAccounts.size}/{strategyAccounts.length} commentés cette semaine
            </p>
          </section>
        )}

        {strategyAccounts.length === 0 && (
          <div className="mt-8 rounded-xl border border-dashed border-border p-5 text-center">
            <p className="text-sm text-muted-foreground mb-2">Tu n'as pas encore défini de comptes à commenter.</p>
            <Link to="/linkedin/comment-strategy">
              <Button variant="outline" size="sm" className="rounded-pill">🎯 Créer ma stratégie commentaires</Button>
            </Link>
          </div>
        )}

        {/* History */}
        {history.length > 0 && (
          <Accordion type="single" collapsible className="mt-6">
            <AccordionItem value="history">
              <AccordionTrigger className="text-sm font-semibold">Mes semaines précédentes</AccordionTrigger>
              <AccordionContent>
                <div className="space-y-2">
                  {history.map(w => {
                    const t = TARGETS[w.objective] || TARGETS[5];
                    const wTotal = t.comments + t.messages;
                    return (
                      <div key={w.id} className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2 text-sm">
                        <span>Semaine du {new Date(w.week_start).toLocaleDateString("fr-FR")}</span>
                        <span className="font-mono">{getEmoji(w.total_done ?? 0, wTotal)} {w.total_done ?? 0}/{wTotal}</span>
                      </div>
                    );
                  })}
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        )}
      </main>
    </div>
  );
}
