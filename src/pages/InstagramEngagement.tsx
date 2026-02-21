import { useState, useEffect, useMemo, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import AppHeader from "@/components/AppHeader";
import SubPageHeader from "@/components/SubPageHeader";
import { useToast } from "@/hooks/use-toast";
import StreakSection from "@/components/engagement/StreakSection";
import DailyChecklist, { getDefaultItems } from "@/components/engagement/DailyChecklist";
import MetricsSection from "@/components/engagement/MetricsSection";
import ContactsSection, { type Contact } from "@/components/engagement/ContactsSection";
import TipsSection from "@/components/engagement/TipsSection";
import Confetti from "@/components/Confetti";

function getMonday(d: Date) {
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.getFullYear(), d.getMonth(), diff);
}

function getTodayStr() {
  return new Date().toISOString().split("T")[0];
}

function getDayIndex() {
  const d = new Date().getDay();
  return d === 0 ? 6 : d - 1; // Mon=0 ... Sun=6
}

export default function InstagramEngagement() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [showConfetti, setShowConfetti] = useState(false);

  // Streak
  const [currentStreak, setCurrentStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [weekChecks, setWeekChecks] = useState<boolean[]>(Array(7).fill(false));

  // Checklist
  const [checked, setChecked] = useState<string[]>([]);
  const [isLaunching, setIsLaunching] = useState(false);

  // Metrics
  const [metrics, setMetrics] = useState<any>({});
  const [prevMetrics, setPrevMetrics] = useState<any>(undefined);
  const [metricsHistory, setMetricsHistory] = useState<any[]>([]);
  const [metricsId, setMetricsId] = useState<string | null>(null);
  const [aiInsight, setAiInsight] = useState<string>("");
  const [isGenerating, setIsGenerating] = useState(false);

  // Contacts
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [contactFilter, setContactFilter] = useState("all");

  const today = useMemo(() => getTodayStr(), []);
  const todayIndex = useMemo(() => getDayIndex(), []);
  const monday = useMemo(() => getMonday(new Date()).toISOString().split("T")[0], []);
  const sundayDate = useMemo(() => {
    const m = getMonday(new Date());
    m.setDate(m.getDate() + 6);
    return m;
  }, []);
  const weekLabel = useMemo(() => {
    const m = getMonday(new Date());
    return `Semaine du ${m.toLocaleDateString("fr-FR")} au ${sundayDate.toLocaleDateString("fr-FR")}`;
  }, [sundayDate]);

  const items = useMemo(() => getDefaultItems(isLaunching), [isLaunching]);
  const threshold = Math.ceil(items.length * 0.6);

  // Load all data
  useEffect(() => {
    if (!user) return;
    const load = async () => {
      // Check if launching
      const { data: launches } = await supabase
        .from("launches")
        .select("id, status")
        .eq("user_id", user.id)
        .in("status", ["active", "teasing", "selling"])
        .limit(1);
      setIsLaunching((launches?.length ?? 0) > 0);

      // Streak
      const { data: streak } = await supabase
        .from("engagement_streaks")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();
      if (streak) {
        setCurrentStreak(streak.current_streak ?? 0);
        setBestStreak(streak.best_streak ?? 0);
      }

      // Today's checklist
      const { data: todayLog } = await supabase
        .from("engagement_checklist_logs")
        .select("*")
        .eq("user_id", user.id)
        .eq("log_date", today)
        .maybeSingle();
      if (todayLog?.items_checked) {
        setChecked(todayLog.items_checked as string[]);
      }

      // Week checks (Mon-Sun)
      const mondayDate = getMonday(new Date());
      const dates: string[] = [];
      for (let i = 0; i < 7; i++) {
        const d = new Date(mondayDate);
        d.setDate(d.getDate() + i);
        dates.push(d.toISOString().split("T")[0]);
      }
      const { data: weekLogs } = await supabase
        .from("engagement_checklist_logs")
        .select("log_date, streak_maintained")
        .eq("user_id", user.id)
        .in("log_date", dates);
      const logMap = new Map((weekLogs || []).map(l => [l.log_date, l.streak_maintained]));
      setWeekChecks(dates.map(d => logMap.get(d) === true));

      // Metrics current week
      const { data: met } = await supabase
        .from("engagement_metrics")
        .select("*")
        .eq("user_id", user.id)
        .eq("week_start", monday)
        .maybeSingle();
      if (met) {
        setMetricsId(met.id);
        setMetrics(met);
        setAiInsight(met.ai_insight || "");
      }

      // Metrics history
      const { data: hist } = await supabase
        .from("engagement_metrics")
        .select("*")
        .eq("user_id", user.id)
        .order("week_start", { ascending: true })
        .limit(8);
      setMetricsHistory(hist || []);
      if (hist && hist.length > 0) {
        const prev = hist.filter((h: any) => h.week_start !== monday);
        if (prev.length > 0) setPrevMetrics(prev[prev.length - 1]);
      }

      // Contacts
      const { data: cont } = await supabase
        .from("engagement_contacts")
        .select("*")
        .eq("user_id", user.id)
        .order("sort_order", { ascending: true });
      setContacts((cont || []).map((c: any) => ({
        id: c.id,
        pseudo: c.pseudo,
        tag: c.tag || "paire",
        description: c.description,
        notes: c.notes,
        last_interaction: c.last_interaction,
      })));
    };
    load();
  }, [user, today, monday]);

  // Toggle checklist item
  const toggleItem = useCallback(async (id: string) => {
    if (!user) return;
    const next = checked.includes(id) ? checked.filter(c => c !== id) : [...checked, id];
    setChecked(next);

    const streakMaintained = next.length >= threshold;

    // Upsert today's log
    const { data: existing } = await supabase
      .from("engagement_checklist_logs")
      .select("id")
      .eq("user_id", user.id)
      .eq("log_date", today)
      .maybeSingle();

    if (existing) {
      await supabase.from("engagement_checklist_logs").update({
        items_checked: next,
        items_total: items.length,
        streak_maintained: streakMaintained,
      }).eq("id", existing.id);
    } else {
      await supabase.from("engagement_checklist_logs").insert({
        user_id: user.id,
        log_date: today,
        items_checked: next,
        items_total: items.length,
        streak_maintained: streakMaintained,
      });
    }

    // Update streak
    const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];
    const { data: streak } = await supabase
      .from("engagement_streaks")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!streak) {
      const ns = streakMaintained ? 1 : 0;
      await supabase.from("engagement_streaks").insert({
        user_id: user.id,
        current_streak: ns,
        best_streak: ns,
        last_check_date: today,
      });
      setCurrentStreak(ns);
      setBestStreak(ns);
    } else {
      const isConsecutive = streak.last_check_date === yesterday || streak.last_check_date === today;
      const newStreak = streakMaintained
        ? (streak.last_check_date === today ? Math.max(streak.current_streak, 1) : (isConsecutive ? (streak.current_streak ?? 0) + 1 : 1))
        : 0;
      const newBest = Math.max(streak.best_streak ?? 0, newStreak);

      await supabase.from("engagement_streaks").update({
        current_streak: newStreak,
        best_streak: newBest,
        last_check_date: today,
      }).eq("id", streak.id);
      setCurrentStreak(newStreak);
      setBestStreak(newBest);
    }

    // Update week checks
    setWeekChecks(prev => {
      const n = [...prev];
      n[todayIndex] = streakMaintained;
      return n;
    });

    if (streakMaintained && !checked.includes(id) && next.length === threshold) {
      setShowConfetti(true);
      toast({ title: "🔥 Streak maintenu !" });
    }
  }, [user, checked, threshold, items.length, today, todayIndex, toast]);

  // Save metrics
  const saveMetrics = async (data: any) => {
    if (!user) return;
    const payload = { ...data, user_id: user.id, week_start: monday, updated_at: new Date().toISOString() };
    delete payload.id;
    delete payload.created_at;

    if (metricsId) {
      await supabase.from("engagement_metrics").update(payload).eq("id", metricsId);
    } else {
      const { data: ins } = await supabase.from("engagement_metrics").insert(payload).select("id").single();
      if (ins) setMetricsId(ins.id);
    }
    toast({ title: "💾 Métriques sauvegardées" });
  };

  const generateInsight = async () => {
    if (!user) return;
    setIsGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("engagement-insight", {
        body: { currentWeek: metrics, history: metricsHistory.filter((h: any) => h.week_start !== monday) },
      });
      if (error) throw error;
      const insight = data?.insight || "";
      setAiInsight(insight);
      // Save insight
      if (metricsId) {
        await supabase.from("engagement_metrics").update({ ai_insight: insight }).eq("id", metricsId);
      }
    } catch (e) {
      console.error(e);
      toast({ title: "Erreur lors de l'analyse", variant: "destructive" });
    }
    setIsGenerating(false);
  };

  const onMetricChange = (field: string, value: number) => {
    setMetrics((prev: any) => ({ ...prev, [field]: value }));
  };

  // Contacts CRUD
  const addContact = async (pseudo: string, tag: string) => {
    if (!user) return;
    const { data } = await supabase.from("engagement_contacts").insert({
      user_id: user.id, pseudo, tag, sort_order: contacts.length,
    }).select("*").single();
    if (data) setContacts(prev => [...prev, { id: data.id, pseudo: data.pseudo, tag: data.tag || "paire", description: data.description, notes: data.notes, last_interaction: data.last_interaction }]);
  };

  const interactContact = async (id: string) => {
    await supabase.from("engagement_contacts").update({ last_interaction: today, updated_at: new Date().toISOString() }).eq("id", id);
    setContacts(prev => prev.map(c => c.id === id ? { ...c, last_interaction: today } : c));
    toast({ title: "💬 Interaction notée !" });
  };

  const deleteContact = async (id: string) => {
    await supabase.from("engagement_contacts").delete().eq("id", id);
    setContacts(prev => prev.filter(c => c.id !== id));
  };

  const updateContactNotes = async (id: string, notes: string) => {
    await supabase.from("engagement_contacts").update({ notes, updated_at: new Date().toISOString() }).eq("id", id);
    setContacts(prev => prev.map(c => c.id === id ? { ...c, notes } : c));
  };

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      {showConfetti && <Confetti />}
      <main className="mx-auto max-w-3xl px-6 py-8 max-md:px-4 space-y-6">
        <SubPageHeader parentTo="/instagram" parentLabel="Instagram" currentLabel="Mon engagement" />

        <StreakSection
          currentStreak={currentStreak}
          bestStreak={bestStreak}
          weekChecks={weekChecks}
          todayIndex={todayIndex}
        />

        <DailyChecklist
          date={new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}
          isLaunching={isLaunching}
          items={items}
          checked={checked}
          onToggle={toggleItem}
          threshold={threshold}
        />

        <MetricsSection
          weekLabel={weekLabel}
          metrics={metrics}
          prevMetrics={prevMetrics}
          history={metricsHistory}
          isLaunching={isLaunching}
          aiInsight={aiInsight}
          onSave={saveMetrics}
          onGenerateInsight={generateInsight}
          isGenerating={isGenerating}
          onChange={onMetricChange}
        />

        <ContactsSection
          contacts={contacts}
          filter={contactFilter}
          onFilterChange={setContactFilter}
          onInteract={interactContact}
          onDelete={deleteContact}
          onAdd={addContact}
          onUpdateNotes={updateContactNotes}
        />

        <TipsSection isLaunching={isLaunching} />
      </main>
    </div>
  );
}
