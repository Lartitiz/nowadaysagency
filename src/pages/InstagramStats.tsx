import { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import AppHeader from "@/components/AppHeader";
import SubPageHeader from "@/components/SubPageHeader";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sparkles, Save, ChevronDown, ChevronUp, TrendingUp, TrendingDown } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import AiGeneratedMention from "@/components/AiGeneratedMention";

function getMonday(d: Date) {
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.getFullYear(), d.getMonth(), diff);
}

function getSunday(monday: Date) {
  const s = new Date(monday);
  s.setDate(s.getDate() + 6);
  return s;
}

function formatDateShort(d: Date) {
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

const NUM_FIELDS = {
  // Compte
  followers: "Abonné·es",
  profile_visits: "Visites profil",
  link_clicks: "Clics lien bio",
  new_followers: "Nouveaux abonné·es",
  // Posts
  posts_count: "Nombre de posts",
  posts_reach_avg: "Reach moyen/post",
  posts_likes_avg: "Likes moyen/post",
  posts_saves_avg: "Saves moyen/post",
  posts_comments_avg: "Commentaires moy.",
  posts_shares_avg: "Partages moyen",
  // Reels
  reels_count: "Nombre de Reels",
  reels_views_avg: "Vues moyennes",
  reels_likes_avg: "Likes moyen",
  reels_saves_avg: "Saves moyen",
  reels_shares_avg: "Partages moyen",
  // Stories
  stories_count: "Stories publiées",
  stories_views_avg: "Vues moyennes",
  stories_replies: "Réponses reçues",
  stories_sticker_clicks: "Clics stickers",
  stories_retention_pct: "Taux de rétention (%)",
  // Engagement
  dm_received: "DM reçus",
  dm_sent: "DM envoyés",
  comments_received: "Commentaires reçus",
  comments_made: "Commentaires faits",
  // Lancement
  launch_signups: "Inscriptions",
  launch_dms: "DM liés lancement",
  launch_link_clicks: "Clics lien vente",
  launch_story_views: "Vues stories lanc.",
  launch_conversions: "Conversions",
} as const;

const TEXT_FIELDS = {
  best_post: "Meilleur post",
  best_reel: "Meilleur Reel",
} as const;

type StatsData = Record<string, any>;

const SECTIONS = [
  { emoji: "📊", title: "Compte", fields: ["followers", "profile_visits", "link_clicks", "new_followers"] },
  { emoji: "📸", title: "Posts", fields: ["posts_count", "posts_reach_avg", "posts_likes_avg", "posts_saves_avg", "posts_comments_avg", "posts_shares_avg"], textFields: ["best_post"] },
  { emoji: "🎬", title: "Reels", fields: ["reels_count", "reels_views_avg", "reels_likes_avg", "reels_saves_avg", "reels_shares_avg"], textFields: ["best_reel"] },
  { emoji: "📱", title: "Stories", fields: ["stories_count", "stories_views_avg", "stories_replies", "stories_sticker_clicks", "stories_retention_pct"] },
  { emoji: "💬", title: "Engagement", fields: ["dm_received", "dm_sent", "comments_received", "comments_made"] },
];

const LAUNCH_SECTION = {
  emoji: "🚀", title: "Lancement", fields: ["launch_signups", "launch_dms", "launch_link_clicks", "launch_story_views", "launch_conversions"],
};

export default function InstagramStats() {
  const { user } = useAuth();
  const { toast } = useToast();

  const mondayDate = useMemo(() => getMonday(new Date()), []);
  const sundayDate = useMemo(() => getSunday(mondayDate), [mondayDate]);
  const monday = useMemo(() => mondayDate.toISOString().split("T")[0], [mondayDate]);
  const sunday = useMemo(() => sundayDate.toISOString().split("T")[0], [sundayDate]);

  const [stats, setStats] = useState<StatsData>({});
  const [statsId, setStatsId] = useState<string | null>(null);
  const [history, setHistory] = useState<StatsData[]>([]);
  const [isLaunching, setIsLaunching] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [showChart, setShowChart] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const [currentRes, historyRes, launchRes] = await Promise.all([
        supabase.from("instagram_weekly_stats" as any).select("*").eq("user_id", user.id).eq("week_start", monday).maybeSingle(),
        supabase.from("instagram_weekly_stats" as any).select("*").eq("user_id", user.id).order("week_start", { ascending: false }).limit(8),
        supabase.from("launches").select("id").eq("user_id", user.id).in("status", ["active", "teasing", "selling"]).limit(1),
      ]);

      if (currentRes.data) {
        const d = currentRes.data as any;
        setStatsId(d.id);
        setStats(d);
        setAiAnalysis(d.ai_analysis || "");
      }
      setHistory((historyRes.data || []) as any[]);
      setIsLaunching((launchRes.data?.length ?? 0) > 0);
    };
    load();
  }, [user, monday]);

  const handleChange = (field: string, value: string) => {
    const isText = field === "best_post" || field === "best_reel";
    setStats(prev => ({ ...prev, [field]: isText ? value : (value === "" ? null : Number(value)) }));
  };

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    const payload: any = { ...stats, user_id: user.id, week_start: monday, week_end: sunday, updated_at: new Date().toISOString() };
    delete payload.id;
    delete payload.created_at;

    try {
      if (statsId) {
        await supabase.from("instagram_weekly_stats" as any).update(payload).eq("id", statsId);
      } else {
        const { data: ins } = await supabase.from("instagram_weekly_stats" as any).insert(payload).select("id").single();
        if (ins) setStatsId((ins as any).id);
      }
      toast({ title: "💾 Stats sauvegardées" });
    } catch {
      toast({ title: "Erreur lors de la sauvegarde", variant: "destructive" });
    }
    setSaving(false);
  };

  const handleAnalyze = async () => {
    if (!user) return;
    setIsGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("engagement-insight", {
        body: {
          currentWeek: stats,
          history: history.filter((h: any) => h.week_start !== monday),
          mode: "full_stats",
        },
      });
      if (error) throw error;
      const insight = data?.insight || "";
      setAiAnalysis(insight);
      if (statsId) {
        await supabase.from("instagram_weekly_stats" as any).update({ ai_analysis: insight }).eq("id", statsId);
      }
    } catch {
      toast({ title: "Erreur lors de l'analyse", variant: "destructive" });
    }
    setIsGenerating(false);
  };

  const prevWeek = history.length > 1 ? history.find((h: any) => h.week_start !== monday) : null;

  const chartData = useMemo(() => {
    return [...history].reverse().map((h: any) => ({
      week: new Date(h.week_start).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" }),
      abonnees: h.followers ?? 0,
      reach: h.posts_reach_avg ?? 0,
    }));
  }, [history]);

  const allSections = isLaunching ? [...SECTIONS, LAUNCH_SECTION] : SECTIONS;

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-3xl px-6 py-8 max-md:px-4 space-y-6">
        <SubPageHeader parentTo="/instagram" parentLabel="Instagram" currentLabel="Mes stats" />

        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">📈 Mes stats</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Remplis tes stats chaque semaine pour suivre ta progression.
          </p>
        </div>

        {/* API placeholder banner */}
        <div className="rounded-xl border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground flex items-start gap-2">
          <span>📸</span>
          <span>Bientôt : connecte ton Instagram pour remplir tes stats automatiquement. En attendant, saisis-les à la main.</span>
        </div>

        {/* Week label */}
        <div className="text-sm font-medium text-foreground">
          Semaine du {formatDateShort(mondayDate)} au {formatDateShort(sundayDate)}
        </div>

        {/* Sections */}
        {allSections.map((section) => (
          <StatsSection
            key={section.title}
            emoji={section.emoji}
            title={section.title}
            fields={section.fields}
            textFields={"textFields" in section ? (section as any).textFields : undefined}
            stats={stats}
            prevWeek={prevWeek}
            onChange={handleChange}
          />
        ))}

        {/* Actions */}
        <div className="flex flex-wrap gap-3">
          <Button onClick={handleSave} disabled={saving} className="gap-2">
            <Save className="h-4 w-4" />
            {saving ? "Sauvegarde..." : "Sauvegarder"}
          </Button>
          <Button variant="outline" onClick={handleAnalyze} disabled={isGenerating} className="gap-2">
            <Sparkles className="h-4 w-4" />
            {isGenerating ? "Analyse en cours..." : "✨ Analyser avec l'IA"}
          </Button>
        </div>

        {/* AI Analysis */}
        {aiAnalysis && (
          <div className="rounded-xl border border-border bg-card p-5 space-y-2">
            <AiGeneratedMention />
            <div className="text-sm text-foreground whitespace-pre-line leading-relaxed">{aiAnalysis}</div>
          </div>
        )}

        {/* History */}
        {history.length > 0 && (
          <section className="space-y-3">
            <h2 className="font-display text-lg font-bold text-foreground flex items-center gap-2">
              📅 Historique
            </h2>
            <div className="rounded-xl border border-border bg-card divide-y divide-border">
              {history.map((h: any) => {
                const ws = new Date(h.week_start);
                const we = getSunday(ws);
                return (
                  <div key={h.id} className="flex items-center justify-between px-4 py-3 text-sm">
                    <span className="text-muted-foreground">
                      Sem. {ws.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })} – {we.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })}
                    </span>
                    <div className="flex items-center gap-4 text-foreground">
                      <span>{h.followers ?? "–"} abo</span>
                      <span>Reach moy: {h.posts_reach_avg ?? "–"}</span>
                      <span>{h.posts_count ?? 0} posts</span>
                    </div>
                  </div>
                );
              })}
            </div>
            <Button variant="ghost" size="sm" onClick={() => setShowChart(!showChart)} className="gap-1.5 text-primary">
              {showChart ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              📈 {showChart ? "Masquer" : "Voir"} l'évolution
            </Button>
            {showChart && chartData.length > 1 && (
              <div className="rounded-xl border border-border bg-card p-4">
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={chartData}>
                    <XAxis dataKey="week" fontSize={11} />
                    <YAxis fontSize={11} />
                    <Tooltip />
                    <Line type="monotone" dataKey="abonnees" stroke="hsl(var(--primary))" name="Abonné·es" strokeWidth={2} dot={{ r: 3 }} />
                    <Line type="monotone" dataKey="reach" stroke="hsl(var(--muted-foreground))" name="Reach moy." strokeWidth={2} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}

/* ─── Stats section ─── */
function StatsSection({
  emoji,
  title,
  fields,
  textFields,
  stats,
  prevWeek,
  onChange,
}: {
  emoji: string;
  title: string;
  fields: string[];
  textFields?: string[];
  stats: StatsData;
  prevWeek: StatsData | null;
  onChange: (field: string, value: string) => void;
}) {
  return (
    <section className="space-y-3">
      <h3 className="font-display text-sm font-bold text-foreground flex items-center gap-1.5 uppercase tracking-wide">
        {emoji} {title}
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {fields.map((field) => {
          const label = NUM_FIELDS[field as keyof typeof NUM_FIELDS] || field;
          const current = stats[field];
          const prev = prevWeek ? prevWeek[field] : null;
          const diff = current != null && prev != null ? current - prev : null;
          return (
            <div key={field} className="flex items-center gap-3">
              <label className="text-sm text-muted-foreground w-40 shrink-0">{label}</label>
              <Input
                type="number"
                value={current ?? ""}
                onChange={(e) => onChange(field, e.target.value)}
                className="max-w-[120px]"
                placeholder="–"
              />
              {diff !== null && diff !== 0 && (
                <span className={`text-xs flex items-center gap-0.5 ${diff > 0 ? "text-green-600" : "text-red-500"}`}>
                  {diff > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                  {diff > 0 ? "+" : ""}{diff}
                </span>
              )}
            </div>
          );
        })}
        {textFields?.map((field) => {
          const label = TEXT_FIELDS[field as keyof typeof TEXT_FIELDS] || field;
          return (
            <div key={field} className="flex items-center gap-3 sm:col-span-2">
              <label className="text-sm text-muted-foreground w-40 shrink-0">{label}</label>
              <Input
                type="text"
                value={stats[field] ?? ""}
                onChange={(e) => onChange(field, e.target.value)}
                placeholder="Description…"
              />
            </div>
          );
        })}
      </div>
    </section>
  );
}
