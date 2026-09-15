import { LinkedInScope } from "@/components/linkedin/LinkedInScope";
import { useHydratedRows, useLinkedInPersistence } from "@/components/linkedin/useLinkedInPersistence";
import { useState, useEffect, useMemo, useCallback } from "react";
import { toast } from "sonner";
import EngagementCoachingDialog from "@/components/engagement/EngagementCoachingDialog";
import { toLocalDateStr } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspaceFilter, useWorkspaceId } from "@/hooks/use-workspace-query";
import AppHeader from "@/components/AppHeader";
import SubPageHeader from "@/components/SubPageHeader";
import { Button } from "@/components/ui/button";
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

export default function LinkedInEngagement() { return <LinkedInScope page={LinkedInEngagementForm} />; }

function LinkedInEngagementForm() {
  const { user } = useAuth();
  const { column, value } = useWorkspaceFilter();
  const workspaceId = useWorkspaceId();

  const [loading, setLoading] = useState(true);
  const [weeklyId, setWeeklyId] = useState<string | null>(null);
  const [coachingOpen, setCoachingOpen] = useState(false);
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

  const store = useLinkedInPersistence("engagement_weekly_linkedin", monday);
  const [extraError, setExtraError] = useState(false);

  const targets = TARGETS[objective] || TARGETS[5];
  const totalDone = commentsDone + messagesDone;
  const totalTarget = targets.comments + targets.messages;
  const progressPct = totalTarget > 0 ? Math.round((totalDone / totalTarget) * 100) : 0;

  const hydrate = (row: any) => {
    setWeeklyId(row?.id || null);
    setObjective(row?.objective ?? 5);
    setCommentsDone(row?.comments_done ?? 0);
    setMessagesDone(row?.messages_done ?? 0);
    setCommentedAccounts(new Set(Array.isArray(row?.commented_accounts) ? row.commented_accounts : []));
  };
  const hydrated = useHydratedRows(store.rows, rows => hydrate(rows[0]));
  const loadExtras = useCallback(async () => {
    setExtraError(false);
    setLoading(true);
    try {
      let historyQuery = (supabase.from("engagement_weekly_linkedin") as any).select("*").eq(column, value);
      let strategyQuery = (supabase.from("linkedin_comment_strategy") as any).select("accounts").eq(column, value);
      if (column === "user_id") { historyQuery = historyQuery.is("workspace_id", null); strategyQuery = strategyQuery.is("workspace_id", null); }
      const [histRes, stratRes] = await Promise.all([
        historyQuery.neq("week_start", monday).order("week_start", { ascending: false }).limit(10),
        strategyQuery.maybeSingle(),
      ]);
      if (!store.active.current) return;
      if (histRes.error || stratRes.error) throw histRes.error || stratRes.error;
      setHistory(histRes.data || []);
      const accounts = stratRes.data?.accounts;
      const parsed = typeof accounts === "string" ? JSON.parse(accounts) : accounts;
      setStrategyAccounts(Array.isArray(parsed) ? parsed : []);
    } catch { if (store.active.current) setExtraError(true); }
    finally { if (store.active.current) setLoading(false); }
  }, [column, value, monday, store.active]);
  useEffect(() => { void loadExtras(); }, [loadExtras]);

  const saveWeekly = async (newComments = commentsDone, newMessages = messagesDone, accounts = commentedAccounts, obj = objective) => {
    const t = TARGETS[obj] || TARGETS[5];
    try {
      const result = await store.save([{
        id: weeklyId || crypto.randomUUID(), objective: obj,
        comments_target: t.comments, comments_done: newComments,
        messages_target: t.messages, messages_done: newMessages,
        total_done: newComments + newMessages, commented_accounts: Array.from(accounts),
      }]);
      if (result) hydrate(result[0]);
    } catch { if (store.active.current) toast.error("Progression non enregistrée. Réessaie avant de quitter la page."); }
  };
  const incrementComments = () => { void saveWeekly(Math.min(commentsDone + 1, targets.comments)); };
  const incrementMessages = () => { void saveWeekly(commentsDone, Math.min(messagesDone + 1, targets.messages)); };
  const toggleAccountCommented = (name: string) => {
    const next = new Set(commentedAccounts);
    if (next.has(name)) next.delete(name); else next.add(name);
    void saveWeekly(commentsDone, messagesDone, next);
  };
  const changeObjective = (obj: number) => { void saveWeekly(0, 0, new Set(), obj); };

  if (store.error || extraError) return <div role="alert">Impossible de charger l’engagement. <Button onClick={() => { void store.reload(); void loadExtras(); }}>Réessayer</Button></div>;
  if (loading || !hydrated) return <div className="flex min-h-screen items-center justify-center bg-background"><div className="flex gap-1"><div className="h-3 w-3 rounded-full bg-primary animate-bounce-dot" /><div className="h-3 w-3 rounded-full bg-primary animate-bounce-dot" style={{ animationDelay: "0.16s" }} /><div className="h-3 w-3 rounded-full bg-primary animate-bounce-dot" style={{ animationDelay: "0.32s" }} /></div></div>;

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-3xl px-6 py-8 max-md:px-4">
        <SubPageHeader parentTo="/linkedin" parentLabel="LinkedIn" currentLabel="Mon engagement" />

        <h1 className="font-display text-2xl font-bold text-foreground mb-1">Ton engagement LinkedIn</h1>
        <p className="text-sm text-muted-foreground italic mb-4">Sur LinkedIn, les commentaires sont rois. C'est là que tu te rends visible et que tu crées des connexions.</p>

        <div className="rounded-xl border border-border bg-card p-4 flex items-center justify-between gap-3 mb-6">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">✨ Coaching commentaires</p>
            <p className="text-xs text-muted-foreground">On t'aide à écrire des commentaires qui attirent les bonnes personnes.</p>
          </div>
          <button onClick={() => setCoachingOpen(true)} className="shrink-0 rounded-pill bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:opacity-90 transition-opacity">
            Commencer
          </button>
        </div>

        <EngagementCoachingDialog open={coachingOpen} onOpenChange={setCoachingOpen} platform="linkedin" />
        <fieldset disabled={store.busy} className="contents">
          {store.saveError && <p role="alert" className="text-sm text-destructive mb-4">{store.saveError}</p>}
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
              <h2 className="font-body text-base font-bold text-foreground">🎯 Mes comptes à commenter cette semaine</h2>
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
        </fieldset>
      </main>
    </div>
  );
}
