import { useState, useEffect, useMemo, useCallback } from "react";
import { toLocalDateStr } from "@/lib/utils";
import UpgradeGate from "@/components/UpgradeGate";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspaceFilter, useWorkspaceId } from "@/hooks/use-workspace-query";
import AppHeader from "@/components/AppHeader";
import SubPageHeader from "@/components/SubPageHeader";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import StreakSection from "@/components/engagement/StreakSection";
import DailyChecklist, { getDefaultItems } from "@/components/engagement/DailyChecklist";
import ContactsSection, { type Contact } from "@/components/engagement/ContactsSection";
import TipsSection from "@/components/engagement/TipsSection";
import ProspectionSection from "@/components/prospection/ProspectionSection";
import Confetti from "@/components/Confetti";
import { useDemoContext } from "@/contexts/DemoContext";
import { DEMO_DATA } from "@/lib/demo-data";
import { friendlyError } from "@/lib/error-messages";

function getMonday(d: Date) {
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.getFullYear(), d.getMonth(), diff);
}

function getTodayStr() {
  return toLocalDateStr(new Date());
}

function getDayIndex() {
  const d = new Date().getDay();
  return d === 0 ? 6 : d - 1;
}

export default function InstagramEngagement() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { isDemoMode } = useDemoContext();
  const { column, value } = useWorkspaceFilter();
  const workspaceId = useWorkspaceId();
  const [showConfetti, setShowConfetti] = useState(false);
  const [activeTab, setActiveTab] = useState("engagement");

  const [currentStreak, setCurrentStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [weekChecks, setWeekChecks] = useState<boolean[]>(Array(7).fill(false));

  const [checked, setChecked] = useState<string[]>([]);
  const [isLaunching, setIsLaunching] = useState(false);

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [contactFilter, setContactFilter] = useState("all");

  const today = useMemo(() => getTodayStr(), []);
  const todayIndex = useMemo(() => getDayIndex(), []);
  const monday = useMemo(() => getMonday(new Date()).toISOString().split("T")[0], []);

  const items = useMemo(() => getDefaultItems(isLaunching), [isLaunching]);
  const threshold = Math.ceil(items.length * 0.6);

  useEffect(() => {
    if (isDemoMode) {
      setCurrentStreak(2);
      setBestStreak(5);
      setWeekChecks([true, true, false, false, false, false, false]);
      setChecked(["reply_stories", "like_target"]);
      setContacts(DEMO_DATA.contacts.map((c, i) => ({
        id: `demo-${i}`,
        pseudo: c.name,
        tag: c.type === "prospect" ? "prospect" : c.type === "client" ? "client" : "paire",
        description: null,
        notes: c.note,
        last_interaction: null,
      })));
      return;
    }
    if (!user) return;
    const load = async () => {
      const { data: launches } = await (supabase
        .from("launches") as any)
        .select("id, status")
        .eq(column, value)
        .in("status", ["active", "teasing", "selling"])
        .limit(1);
      setIsLaunching((launches?.length ?? 0) > 0);

      const { data: streak } = await (supabase
        .from("engagement_streaks") as any)
        .select("*")
        .eq(column, value)
        .maybeSingle();
      if (streak) {
        setCurrentStreak(streak.current_streak ?? 0);
        setBestStreak(streak.best_streak ?? 0);
      }

      const { data: todayLog } = await (supabase
        .from("engagement_checklist_logs") as any)
        .select("*")
        .eq(column, value)
        .eq("log_date", today)
        .maybeSingle();
      if (todayLog?.items_checked) {
        setChecked(todayLog.items_checked as string[]);
      }

      const mondayDate = getMonday(new Date());
      const dates: string[] = [];
      for (let i = 0; i < 7; i++) {
        const d = new Date(mondayDate);
        d.setDate(d.getDate() + i);
        dates.push(d.toISOString().split("T")[0]);
      }
      const { data: weekLogs } = await (supabase
        .from("engagement_checklist_logs") as any)
        .select("log_date, streak_maintained")
        .eq(column, value)
        .in("log_date", dates);
      const logMap = new Map((weekLogs || []).map(l => [l.log_date, l.streak_maintained]));
      setWeekChecks(dates.map(d => logMap.get(d) === true));

      const { data: cont } = await (supabase
        .from("engagement_contacts") as any)
        .select("*")
        .eq(column, value)
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
  }, [user?.id, today, monday, isDemoMode]);

  const toggleItem = useCallback(async (id: string) => {
    if (!user) return;
    const prev = [...checked];
    const next = checked.includes(id) ? checked.filter(c => c !== id) : [...checked, id];
    setChecked(next); // optimistic update

    const streakMaintained = next.length >= threshold;

    try {
      const { data: existing, error: fetchErr } = await (supabase
        .from("engagement_checklist_logs") as any)
        .select("id")
        .eq(column, value)
        .eq("log_date", today)
        .maybeSingle();
      if (fetchErr) throw fetchErr;

      if (existing) {
        const { error } = await supabase.from("engagement_checklist_logs").update({
          items_checked: next,
          items_total: items.length,
          streak_maintained: streakMaintained,
        }).eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("engagement_checklist_logs").insert({
          user_id: user.id,
          workspace_id: workspaceId !== user.id ? workspaceId : undefined,
          log_date: today,
          items_checked: next,
          items_total: items.length,
          streak_maintained: streakMaintained,
        });
        if (error) throw error;
      }

      const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];
      const { data: streak, error: streakFetchErr } = await (supabase
        .from("engagement_streaks") as any)
        .select("*")
        .eq(column, value)
        .maybeSingle();
      if (streakFetchErr) throw streakFetchErr;

      if (!streak) {
        const ns = streakMaintained ? 1 : 0;
        const { error } = await supabase.from("engagement_streaks").insert({
          user_id: user.id,
          workspace_id: workspaceId !== user.id ? workspaceId : undefined,
          current_streak: ns,
          best_streak: ns,
          last_check_date: today,
        });
        if (error) throw error;
        setCurrentStreak(ns);
        setBestStreak(ns);
      } else {
        let newStreak: number;
        if (!streakMaintained) {
          newStreak = 0;
        } else if (streak.last_check_date === today) {
          newStreak = streak.current_streak ?? 1;
        } else if (streak.last_check_date === yesterday) {
          newStreak = (streak.current_streak ?? 0) + 1;
        } else {
          newStreak = 1;
        }
        const newBest = Math.max(streak.best_streak ?? 0, newStreak);

        const { error } = await supabase.from("engagement_streaks").update({
          current_streak: newStreak,
          best_streak: newBest,
          last_check_date: today,
        }).eq("id", streak.id);
        if (error) throw error;
        setCurrentStreak(newStreak);
        setBestStreak(newBest);
      }

      setWeekChecks(p => {
        const n = [...p];
        n[todayIndex] = streakMaintained;
        return n;
      });

      if (streakMaintained && !checked.includes(id) && next.length === threshold) {
        setShowConfetti(true);
        toast({ title: "🔥 Streak maintenu !" });
      }
    } catch (e) {
      console.error("Engagement save error:", e);
      setChecked(prev); // rollback
      toast({ title: "Erreur", description: friendlyError(e), variant: "destructive" });
    }
  }, [user, checked, threshold, items.length, today, todayIndex, toast, column, value, workspaceId]);

  const addContact = async (pseudo: string, tag: string) => {
    if (!user) return;
    const { data } = await supabase.from("engagement_contacts").insert({
      user_id: user.id, workspace_id: workspaceId !== user.id ? workspaceId : undefined, pseudo, tag, sort_order: contacts.length,
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
        <SubPageHeader parentTo="/instagram" parentLabel="Instagram" currentLabel="Routine d'engagement" />

        <StreakSection
          currentStreak={currentStreak}
          bestStreak={bestStreak}
          weekChecks={weekChecks}
          todayIndex={todayIndex}
        />

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="w-full grid grid-cols-3">
            <TabsTrigger value="engagement">💬 Engagement</TabsTrigger>
            <TabsTrigger value="contacts">👥 Contacts</TabsTrigger>
            <TabsTrigger value="prospection">🎯 Prospection</TabsTrigger>
          </TabsList>

          <TabsContent value="engagement" className="space-y-6 mt-4">
            <DailyChecklist
              date={new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}
              isLaunching={isLaunching}
              items={items}
              checked={checked}
              onToggle={toggleItem}
              threshold={threshold}
            />
            <TipsSection isLaunching={isLaunching} />
          </TabsContent>

          <TabsContent value="contacts" className="mt-4">
            <UpgradeGate feature="contacts_strategiques">
              <ContactsSection
                contacts={contacts}
                filter={contactFilter}
                onFilterChange={setContactFilter}
                onInteract={interactContact}
                onDelete={deleteContact}
                onAdd={addContact}
                onUpdateNotes={updateContactNotes}
              />
            </UpgradeGate>
          </TabsContent>

          <TabsContent value="prospection" className="mt-4">
            <UpgradeGate feature="prospection">
              <ProspectionSection />
            </UpgradeGate>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
