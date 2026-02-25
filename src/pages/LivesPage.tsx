import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspaceFilter } from "@/hooks/use-workspace-query";
import { useUserPlan } from "@/hooks/use-user-plan";
import { supabase } from "@/integrations/supabase/client";
import AppHeader from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { TextareaWithVoice as Textarea } from "@/components/ui/textarea-with-voice";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import UpgradeGate from "@/components/UpgradeGate";
import {
  Video, CalendarDays, Clock, Bell, BellOff, Send,
  Play, Lock, Star, Loader2,
} from "lucide-react";

interface Live {
  id: string;
  title: string;
  description: string | null;
  scheduled_at: string | null;
  duration_minutes: number | null;
  meeting_link: string | null;
  replay_url: string | null;
  live_type: string;
  status: string;
}

type Filter = "all" | "monthly" | "studio";

export default function LivesPage() {
  const { user } = useAuth();
  const { column, value } = useWorkspaceFilter();
  const { isPaid, isStudio, loading: planLoading } = useUserPlan();
  const { toast } = useToast();

  const [lives, setLives] = useState<Live[]>([]);
  const [reminders, setReminders] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");
  const [questionLiveId, setQuestionLiveId] = useState<string | null>(null);
  const [questionText, setQuestionText] = useState("");
  const [sendingQuestion, setSendingQuestion] = useState(false);

  useEffect(() => {
    loadData();
  }, [user?.id]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [livesRes, remindersRes] = await Promise.all([
        supabase.from("lives").select("*").order("scheduled_at", { ascending: false }),
        user
          ? (supabase.from("live_reminders") as any).select("live_id").eq(column, value)
          : Promise.resolve({ data: [] }),
      ]);
      if (livesRes.data) setLives(livesRes.data as Live[]);
      if (remindersRes.data) setReminders(new Set(remindersRes.data.map((r: any) => r.live_id)));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const toggleReminder = async (liveId: string) => {
    if (!user) return;
    if (reminders.has(liveId)) {
      await (supabase.from("live_reminders") as any).delete().eq("live_id", liveId).eq(column, value);
      setReminders((prev) => { const n = new Set(prev); n.delete(liveId); return n; });
      toast({ title: "Rappel retiré" });
    } else {
      await supabase.from("live_reminders").insert({ live_id: liveId, user_id: user.id });
      setReminders((prev) => new Set(prev).add(liveId));
      toast({ title: "🔔 Rappel activé !" });
    }
  };

  const sendQuestion = async () => {
    if (!user || !questionLiveId || !questionText.trim()) return;
    setSendingQuestion(true);
    await supabase.from("live_questions").insert({
      live_id: questionLiveId,
      user_id: user.id,
      question: questionText.trim(),
    });
    setSendingQuestion(false);
    setQuestionText("");
    setQuestionLiveId(null);
    toast({ title: "Question envoyée ✓" });
  };

  // Gate: free users can't access
  if (!planLoading && !isPaid) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader />
        <main className="mx-auto max-w-2xl px-4 py-12">
          <UpgradeGate feature="lives">
            <></>
          </UpgradeGate>
        </main>
      </div>
    );
  }

  const upcoming = lives.filter((l) => l.status === "upcoming" || l.status === "live");
  const replays = lives.filter((l) => l.status === "replay");

  const filteredReplays = replays.filter((l) => {
    if (filter === "all") return true;
    return l.live_type === filter;
  });

  const nextLive = upcoming[0];

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-3xl px-4 py-8 animate-fade-in">
        <div className="flex items-center gap-3 mb-6">
          <div className="h-10 w-10 rounded-xl bg-rose-pale flex items-center justify-center">
            <Video className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold text-foreground">Lives</h1>
            <p className="text-sm text-muted-foreground">Lives mensuels et replays exclusifs.</p>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : (
          <>
            {/* ─── Prochain live ─── */}
            {nextLive && (
              <div className="rounded-2xl border-2 border-primary/20 bg-card p-6 mb-6">
                <p className="text-xs font-medium text-primary uppercase tracking-wide mb-2">
                  {nextLive.status === "live" ? "🔴 En direct" : "Prochain live"}
                </p>
                <h2 className="font-display text-xl font-bold text-foreground mb-1">
                  {nextLive.title}
                </h2>
                {nextLive.description && (
                  <p className="text-sm text-muted-foreground mb-3">{nextLive.description}</p>
                )}
                <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground mb-4">
                  {nextLive.scheduled_at && (
                    <span className="flex items-center gap-1">
                      <CalendarDays className="h-4 w-4" />
                      {new Date(nextLive.scheduled_at).toLocaleDateString("fr-FR", {
                        weekday: "long", day: "numeric", month: "long",
                      })} · {new Date(nextLive.scheduled_at).toLocaleTimeString("fr-FR", {
                        hour: "2-digit", minute: "2-digit",
                      })}
                    </span>
                  )}
                  {nextLive.live_type === "studio" && (
                    <Badge variant="secondary" className="gap-1">
                      <Star className="h-3 w-3" /> Studio
                    </Badge>
                  )}
                </div>

                <div className="flex flex-wrap gap-2">
                  {nextLive.status === "live" && nextLive.meeting_link && (
                    <Button className="rounded-full gap-2" asChild>
                      <a href={nextLive.meeting_link} target="_blank" rel="noopener noreferrer">
                        <Play className="h-4 w-4" /> Rejoindre le live
                      </a>
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    className="rounded-full gap-2"
                    onClick={() => toggleReminder(nextLive.id)}
                  >
                    {reminders.has(nextLive.id) ? (
                      <><BellOff className="h-4 w-4" /> Rappel activé</>
                    ) : (
                      <><Bell className="h-4 w-4" /> Me rappeler</>
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    className="rounded-full gap-2"
                    onClick={() => setQuestionLiveId(questionLiveId === nextLive.id ? null : nextLive.id)}
                  >
                    📝 Poser une question
                  </Button>
                </div>

                {questionLiveId === nextLive.id && (
                  <div className="mt-4 space-y-2">
                    <Textarea
                      placeholder="Ta question pour le live..."
                      value={questionText}
                      onChange={(e) => setQuestionText(e.target.value)}
                      className="rounded-xl"
                      rows={2}
                    />
                    <Button
                      size="sm"
                      className="rounded-full gap-1"
                      onClick={sendQuestion}
                      disabled={sendingQuestion || !questionText.trim()}
                    >
                      <Send className="h-3 w-3" /> Envoyer
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* ─── Replays ─── */}
            <div>
              <h2 className="font-display text-lg font-bold text-foreground mb-3">Replays</h2>

              <div className="flex gap-2 mb-4 flex-wrap">
                {(["all", "monthly", "studio"] as Filter[]).map((f) => (
                  <Button
                    key={f}
                    variant={filter === f ? "default" : "outline"}
                    size="sm"
                    className="rounded-full"
                    onClick={() => setFilter(f)}
                  >
                    {f === "all" ? "Tous" : f === "monthly" ? "Mensuels" : "🌟 Studio"}
                  </Button>
                ))}
              </div>

              {filteredReplays.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">Aucun replay disponible.</p>
              ) : (
                <div className="space-y-3">
                  {filteredReplays.map((live) => {
                    const isStudioLive = live.live_type === "studio";
                    const locked = isStudioLive && !isStudio;

                    return (
                      <div
                        key={live.id}
                        className={`rounded-2xl border border-border bg-card p-4 ${locked ? "opacity-70" : ""}`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              {live.scheduled_at && (
                                <span className="text-xs text-muted-foreground">
                                  {new Date(live.scheduled_at).toLocaleDateString("fr-FR", {
                                    day: "numeric", month: "short",
                                  })}
                                </span>
                              )}
                              {isStudioLive && (
                                <Badge variant="secondary" className="gap-1 text-xs">
                                  <Star className="h-3 w-3" /> Studio
                                </Badge>
                              )}
                              {live.duration_minutes && (
                                <span className="text-xs text-muted-foreground flex items-center gap-1">
                                  <Clock className="h-3 w-3" /> {live.duration_minutes} min
                                </span>
                              )}
                            </div>
                            <p className="text-sm font-medium text-foreground">{live.title}</p>
                          </div>

                          {locked ? (
                            <Button variant="outline" size="sm" className="rounded-full gap-1 shrink-0" asChild>
                              <a href="/studio/discover">
                                <Lock className="h-3 w-3" /> Studio
                              </a>
                            </Button>
                          ) : live.replay_url ? (
                            <Button variant="outline" size="sm" className="rounded-full gap-1 shrink-0" asChild>
                              <a href={live.replay_url} target="_blank" rel="noopener noreferrer">
                                <Play className="h-3 w-3" /> Replay
                              </a>
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
