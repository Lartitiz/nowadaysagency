import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import AppHeader from "@/components/AppHeader";
import SubPageHeader from "@/components/SubPageHeader";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { generateRoutineTasks } from "@/lib/routine-generator";
import { Save, RotateCcw } from "lucide-react";

const TIME_OPTIONS = [15, 30, 45, 60];
const DAYS = [
  { key: "lun", label: "L" },
  { key: "mar", label: "M" },
  { key: "mer", label: "Me" },
  { key: "jeu", label: "J" },
  { key: "ven", label: "V" },
  { key: "sam", label: "S" },
  { key: "dim", label: "D" },
];
const CHANNELS = [
  { key: "instagram", emoji: "📱", label: "Instagram" },
  { key: "linkedin", emoji: "💼", label: "LinkedIn" },
  { key: "newsletter", emoji: "📧", label: "Newsletter" },
  { key: "blog", emoji: "🌐", label: "Site web / blog" },
  { key: "pinterest", emoji: "📌", label: "Pinterest" },
];
const GOALS = [
  { key: "launch", emoji: "🚀", label: "Lancer une offre" },
  { key: "visibility", emoji: "📈", label: "Gagner en visibilité" },
  { key: "convert", emoji: "💰", label: "Convertir / vendre" },
  { key: "network", emoji: "🤝", label: "Développer mon réseau" },
  { key: "foundations", emoji: "🧱", label: "Poser les bases" },
];

export default function CommPlanPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [existingId, setExistingId] = useState<string | null>(null);

  // Plan state
  const [dailyTime, setDailyTime] = useState(30);
  const [activeDays, setActiveDays] = useState(["lun", "mar", "mer", "jeu", "ven"]);
  const [channels, setChannels] = useState(["instagram"]);
  const [igPosts, setIgPosts] = useState(3);
  const [igStories, setIgStories] = useState(3);
  const [igReels, setIgReels] = useState(2);
  const [liPosts, setLiPosts] = useState(1);
  const [nlFreq, setNlFreq] = useState("none");
  const [goal, setGoal] = useState("visibility");
  const [goalDetail, setGoalDetail] = useState("");

  useEffect(() => {
    if (!user) return;
    supabase
      .from("communication_plans")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setExistingId(data.id);
          setDailyTime(data.daily_time || 30);
          setActiveDays((data.active_days as string[]) || ["lun", "mar", "mer", "jeu", "ven"]);
          setChannels((data.channels as string[]) || ["instagram"]);
          setIgPosts(data.instagram_posts_week || 3);
          setIgStories(data.instagram_stories_week || 3);
          setIgReels(data.instagram_reels_month || 2);
          setLiPosts(data.linkedin_posts_week || 1);
          setNlFreq(data.newsletter_frequency || "none");
          setGoal(data.monthly_goal || "visibility");
          setGoalDetail(data.monthly_goal_detail || "");
        }
      });
  }, [user]);

  const toggleDay = (day: string) => {
    setActiveDays(prev => prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]);
  };

  const toggleChannel = (ch: string) => {
    setChannels(prev => prev.includes(ch) ? prev.filter(c => c !== ch) : [...prev, ch]);
  };

  const savePlan = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const planData = {
        user_id: user.id,
        daily_time: dailyTime,
        active_days: activeDays,
        channels,
        instagram_posts_week: igPosts,
        instagram_stories_week: igStories,
        instagram_reels_month: igReels,
        linkedin_posts_week: liPosts,
        newsletter_frequency: nlFreq,
        monthly_goal: goal,
        monthly_goal_detail: goalDetail || null,
      };

      if (existingId) {
        await supabase.from("communication_plans").update(planData).eq("id", existingId);
      } else {
        const { data } = await supabase.from("communication_plans").insert(planData).select("id").single();
        if (data) setExistingId(data.id);
      }

      // Generate routine tasks
      await supabase.from("routine_tasks").delete().eq("user_id", user.id).eq("is_auto_generated", true);

      const generated = generateRoutineTasks({
        daily_time: dailyTime,
        active_days: activeDays,
        channels,
        instagram_posts_week: igPosts,
        instagram_stories_week: igStories,
        instagram_reels_month: igReels,
        linkedin_posts_week: liPosts,
        newsletter_frequency: nlFreq,
        monthly_goal: goal,
      });

      if (generated.length > 0) {
        await supabase.from("routine_tasks").insert(
          generated.map(t => ({ ...t, user_id: user.id, is_auto_generated: true }))
        );
      }

      toast.success("Plan enregistré ! Tes routines ont été mises à jour.");
      navigate("/dashboard");
    } catch (e) {
      toast.error("Erreur lors de l'enregistrement");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-[700px] px-6 py-8 max-md:px-4">
        <SubPageHeader
          parentLabel="Dashboard"
          parentTo="/dashboard"
          currentLabel="Mon plan de com'"
        />
        <p className="text-sm text-muted-foreground -mt-4 mb-2">
          Dis-nous comment tu communiques. On génère tes routines automatiquement.
        </p>

        <div className="space-y-8 mt-6">
          {/* Temps */}
          <Section emoji="⏱️" title="Combien de temps par jour pour ta com' ?">
            <div className="flex flex-wrap gap-2">
              {TIME_OPTIONS.map(t => (
                <ChipButton key={t} active={dailyTime === t} onClick={() => setDailyTime(t)}>
                  ⏱️ {t >= 60 ? `${t / 60}h` : `${t} min`}{t >= 60 ? "+" : ""}
                </ChipButton>
              ))}
            </div>
          </Section>

          {/* Jours */}
          <Section emoji="📅" title="Quels jours tu bosses ta com' ?">
            <div className="flex flex-wrap gap-2">
              {DAYS.map(d => (
                <ChipButton key={d.key} active={activeDays.includes(d.key)} onClick={() => toggleDay(d.key)}>
                  {d.label}
                </ChipButton>
              ))}
            </div>
          </Section>

          {/* Canaux */}
          <Section emoji="📡" title="Sur quels canaux tu communiques ?">
            <div className="flex flex-wrap gap-2">
              {CHANNELS.map(ch => (
                <ChipButton key={ch.key} active={channels.includes(ch.key)} onClick={() => toggleChannel(ch.key)}>
                  {ch.emoji} {ch.label}
                </ChipButton>
              ))}
            </div>
          </Section>

          {/* Objectifs par canal */}
          {channels.includes("instagram") && (
            <Section emoji="📱" title="Tes objectifs Instagram">
              <div className="space-y-4">
                <FreqPicker label="Posts par semaine" value={igPosts} options={[1,2,3,4,5]} onChange={setIgPosts} suffix="/sem" />
                <FreqPicker label="Stories par semaine" value={igStories} options={[1,2,3,5,7]} onChange={setIgStories} labels={["1-2","3","3-5","5","Quotidien"]} suffix="/sem" />
                <FreqPicker label="Reels par mois" value={igReels} options={[0,1,2,4]} onChange={setIgReels} suffix="/mois" />
              </div>
            </Section>
          )}

          {channels.includes("linkedin") && (
            <Section emoji="💼" title="Tes objectifs LinkedIn">
              <FreqPicker label="Posts par semaine" value={liPosts} options={[1,2,3]} onChange={setLiPosts} suffix="/sem" />
            </Section>
          )}

          {channels.includes("newsletter") && (
            <Section emoji="📧" title="Ta fréquence newsletter">
              <div className="flex flex-wrap gap-2">
                {[
                  { key: "weekly", label: "Hebdo" },
                  { key: "bimonthly", label: "Bi-mensuelle" },
                  { key: "monthly", label: "Mensuelle" },
                  { key: "none", label: "Pas encore" },
                ].map(f => (
                  <ChipButton key={f.key} active={nlFreq === f.key} onClick={() => setNlFreq(f.key)}>
                    {f.label}
                  </ChipButton>
                ))}
              </div>
            </Section>
          )}

          {/* Objectif du mois */}
          <Section emoji="🎯" title="Ce mois-ci, ta priorité c'est quoi ?">
            <div className="flex flex-wrap gap-2 mb-4">
              {GOALS.map(g => (
                <ChipButton key={g.key} active={goal === g.key} onClick={() => setGoal(g.key)}>
                  {g.emoji} {g.label}
                </ChipButton>
              ))}
            </div>
            <Textarea
              placeholder="Précise si tu veux (optionnel) : ex. Je lance ma nouvelle offre coaching le 15 mars..."
              value={goalDetail}
              onChange={(e) => setGoalDetail(e.target.value)}
              className="min-h-[80px]"
            />
          </Section>

          {/* Save */}
          <div className="flex gap-3">
            <Button onClick={savePlan} disabled={saving || activeDays.length === 0} className="flex-1 gap-2">
              <Save className="h-4 w-4" />
              {existingId ? "Mettre à jour mon plan" : "Enregistrer mon plan"}
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}

/* ─── Sub-components ─── */

function Section({ emoji, title, children }: { emoji: string; title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="font-display text-base font-bold text-foreground mb-3">
        {emoji} {title}
      </h3>
      {children}
    </div>
  );
}

function ChipButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-4 py-2 rounded-xl text-sm font-medium transition-all border ${
        active
          ? "bg-primary text-primary-foreground border-primary shadow-sm"
          : "bg-card text-foreground border-border hover:border-primary/40"
      }`}
    >
      {children}
    </button>
  );
}

function FreqPicker({
  label,
  value,
  options,
  onChange,
  labels,
  suffix,
}: {
  label: string;
  value: number;
  options: number[];
  onChange: (v: number) => void;
  labels?: string[];
  suffix?: string;
}) {
  return (
    <div>
      <p className="text-sm text-muted-foreground mb-2">{label}</p>
      <div className="flex flex-wrap gap-2">
        {options.map((opt, i) => (
          <ChipButton key={opt} active={value === opt} onClick={() => onChange(opt)}>
            {labels ? labels[i] : opt}{!labels && suffix ? suffix : ""}
          </ChipButton>
        ))}
      </div>
    </div>
  );
}
