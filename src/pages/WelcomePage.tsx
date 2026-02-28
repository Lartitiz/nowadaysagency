import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspaceFilter } from "@/hooks/use-workspace-query";
import { useNavigate, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useProfile } from "@/hooks/use-profile";

const GOAL_LABELS: Record<string, string> = {
  start: "🌱 Poser les bases",
  visibility: "📱 Être plus visible",
  launch: "🎁 Lancer une offre",
  clients: "🎯 Trouver des client·es",
  structure: "🗂️ Structurer",
};

const TIME_LABELS: Record<string, string> = {
  less_2h: "Moins de 2h",
  "2_5h": "2 à 5h",
  "5_10h": "5 à 10h",
  more_10h: "Plus de 10h",
};

const IMPACT_COLORS: Record<string, string> = {
  high: "bg-destructive/10 text-destructive",
  medium: "bg-primary/10 text-primary",
  low: "bg-muted text-muted-foreground",
};

const STEPS = [
  {
    num: "1️⃣",
    title: "Pose tes fondations",
    emoji: "🎨",
    module: "Branding",
    time: "30 min",
    desc: "Définis ton positionnement, ta cible, ton ton de communication. C'est la base de tout.",
    cta: "👉 C'est ta première étape.",
  },
  {
    num: "2️⃣",
    title: "Audite et optimise tes canaux",
    emoji: "📱",
    module: "Audit Instagram",
    time: "15 min",
    desc: "Analyse ton profil et ta bio. L'outil te dit exactement quoi améliorer.",
  },
  {
    num: "3️⃣",
    title: "Crée tes premiers contenus",
    emoji: "✨",
    module: "Atelier créatif",
    time: "20 min",
    desc: "Posts, Reels, Stories, Carrousels. L'outil t'accompagne de l'idée au texte final.",
  },
  {
    num: "4️⃣",
    title: "Planifie et engage",
    emoji: "📅",
    module: "Calendrier + Contacts",
    time: "15 min",
    desc: "Planifie tes publications et mets en place ta routine d'engagement.",
  },
];

interface Recommendation {
  id: string;
  titre: string | null;
  label: string;
  detail: string | null;
  module: string;
  route: string;
  priorite: string | null;
  temps_estime: string | null;
  position: number | null;
}

interface BrandingCard {
  emoji: string;
  title: string;
  content: string;
  route: string;
}

interface BrandProfileData {
  positioning: string | null;
  mission: string | null;
  tone_keywords: string[] | null;
  values: string[] | null;
  content_pillars: { name: string }[] | null;
  combats: string | null;
  tone_style: string | null;
}

export default function WelcomePage() {
  const { user } = useAuth();
  const { column, value } = useWorkspaceFilter();
  const navigate = useNavigate();
  const { data: profileData } = useProfile();
  const [goal, setGoal] = useState("");
  const [time, setTime] = useState("");
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [diagnosticSummary, setDiagnosticSummary] = useState("");
  const [brandingCards, setBrandingCards] = useState<BrandingCard[]>([]);
  const [loading, setLoading] = useState(true);

  const prenom = (profileData as any)?.prenom || "";
  const channels: string[] = (profileData as any)?.canaux || [];

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      // Config
      const { data: config } = await (supabase.from("user_plan_config") as any)
        .select("main_goal, weekly_time, welcome_seen, onboarding_completed")
        .eq(column, value)
        .maybeSingle();
      if (!config?.onboarding_completed) {
        navigate("/onboarding", { replace: true });
        return;
      }
      if (config) {
        setGoal(config.main_goal || "");
        setTime(config.weekly_time || "");
      }

      // Load all branding data in parallel
      const [
        brandProfileRes,
        personaRes,
        offersRes,
        storyRes,
        profileRes,
        recsRes,
      ] = await Promise.all([
        (supabase.from("brand_profile") as any)
          .select("positioning, mission, tone_keywords, values, content_pillars, combats, tone_style")
          .eq(column, value)
          .maybeSingle(),
        (supabase.from("persona") as any)
          .select("description")
          .eq(column, value)
          .eq("is_primary", true)
          .maybeSingle(),
        (supabase.from("offers") as any)
          .select("name, promise, price_text")
          .eq(column, value)
          .order("sort_order")
          .limit(5),
        (supabase.from("storytelling") as any)
          .select("imported_text")
          .eq(column, value)
          .eq("is_primary", true)
          .maybeSingle(),
        supabase.from("profiles")
          .select("diagnostic_data")
          .eq("user_id", user.id)
          .maybeSingle(),
        (supabase.from("audit_recommendations") as any)
          .select("*")
          .eq(column, value)
          .order("position", { ascending: true })
          .limit(3),
      ]);

      // Diagnostic summary
      const diagData = (profileRes.data as any)?.diagnostic_data;
      if (diagData?.summary) {
        setDiagnosticSummary(diagData.summary);
      }

      // Recommendations
      if (recsRes.data && recsRes.data.length > 0) {
        setRecommendations(recsRes.data as Recommendation[]);
      }

      // Build branding cards
      const cards: BrandingCard[] = [];
      const bp = brandProfileRes.data as BrandProfileData | null;

      if (bp?.positioning) {
        cards.push({ emoji: "🎯", title: "Positionnement", content: bp.positioning, route: "/proposition" });
      }
      if (bp?.mission) {
        cards.push({ emoji: "🚀", title: "Mission", content: bp.mission, route: "/branding" });
      }
      if (bp?.tone_style || (bp?.tone_keywords && bp.tone_keywords.length > 0)) {
        const toneContent = bp.tone_style || (bp.tone_keywords || []).join(", ");
        cards.push({ emoji: "💬", title: "Ton de voix", content: toneContent, route: "/ton-style" });
      }
      if (bp?.combats) {
        cards.push({ emoji: "⚔️", title: "Combats", content: bp.combats, route: "/ton-style" });
      }
      if (bp?.values && bp.values.length > 0) {
        cards.push({ emoji: "💎", title: "Valeurs", content: (bp.values as any[]).map(v => typeof v === "string" ? v : (v as any).name || v).join(", "), route: "/ton-style" });
      }
      if (bp?.content_pillars && bp.content_pillars.length > 0) {
        const pillarsText = (bp.content_pillars as any[]).map(p => typeof p === "string" ? p : (p as any).name || p).join(", ");
        cards.push({ emoji: "📝", title: "Piliers de contenu", content: pillarsText, route: "/strategie" });
      }

      const persona = personaRes.data as any;
      if (persona?.description) {
        cards.push({ emoji: "🎭", title: "Persona", content: persona.description, route: "/persona" });
      }

      const offers = offersRes.data as any[];
      if (offers && offers.length > 0) {
        const offersText = offers.map((o: any) => o.name).filter(Boolean).join(", ");
        if (offersText) {
          cards.push({ emoji: "🛍️", title: "Offres", content: offersText, route: "/offre" });
        }
      }

      const story = storyRes.data as any;
      if (story?.imported_text) {
        cards.push({ emoji: "📖", title: "Ton histoire", content: story.imported_text, route: "/storytelling" });
      }

      setBrandingCards(cards);
      setLoading(false);
    };
    load();
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const markSeen = async (destination: string) => {
    if (!user) return;
    await (supabase.from("user_plan_config") as any).update({ welcome_seen: true }).eq(column, value);
    navigate(destination);
  };

  const hasRecs = recommendations.length > 0;
  const hasBranding = brandingCards.length > 0;

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-2xl animate-fade-in space-y-8">
        {/* A) Header personnalisé */}
        <div className="text-center space-y-3">
          <h1 className="font-display text-2xl md:text-3xl text-foreground">
            ✨ {prenom ? `${prenom}, voilà` : "Voilà"} ce que j'ai préparé pour toi
          </h1>
          <p className="text-sm text-muted-foreground">
            J'ai pré-rempli ton branding à partir de ce que j'ai trouvé. Vérifie, ajuste, et c'est parti.
          </p>
        </div>

        {/* B) Diagnostic summary */}
        {diagnosticSummary && !loading && (
          <div className="rounded-2xl bg-[hsl(var(--rose-pale))] border border-border p-5">
            <p className="text-sm text-foreground italic leading-relaxed">
              {diagnosticSummary}
            </p>
          </div>
        )}

        {/* C) Branding pré-rempli */}
        {!loading && (
          <div className="space-y-4">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              Ton branding pré-rempli
            </h2>
            {hasBranding ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {brandingCards.map((card, i) => (
                  <div key={i} className="bg-card border border-border rounded-xl p-4 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{card.emoji}</span>
                      <span className="text-sm font-semibold text-foreground">{card.title}</span>
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-3">
                      {card.content}
                    </p>
                    <Link
                      to={card.route}
                      onClick={() => {
                        if (user) (supabase.from("user_plan_config") as any).update({ welcome_seen: true }).eq(column, value);
                      }}
                      className="inline-block text-xs font-semibold text-primary hover:underline"
                    >
                      Voir et modifier →
                    </Link>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-xl bg-card border border-border p-5">
                <p className="text-sm text-muted-foreground">
                  Le diagnostic n'a pas pu pré-remplir ton branding cette fois. Pas de souci, on va le construire ensemble.
                </p>
              </div>
            )}
          </div>
        )}

        {/* D) Priorities / Steps */}
        <div className="rounded-2xl bg-card border border-border p-6 space-y-5">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            {hasRecs ? "Tes priorités personnalisées" : "Ton parcours en 4 étapes"}
          </h2>

          {loading ? (
            <div className="flex justify-center py-8 gap-1.5">
              {[0, 1, 2].map(i => (
                <div key={i} className="h-2 w-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: `${i * 0.16}s` }} />
              ))}
            </div>
          ) : hasRecs ? (
            <div className="space-y-3">
              {recommendations.map((rec, i) => (
                <div
                  key={rec.id}
                  className={`rounded-xl border p-4 transition-colors ${
                    i === 0 ? "border-primary bg-secondary" : "border-border hover:border-primary/40"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <span className="text-lg mt-0.5">{i === 0 ? "🎯" : i === 1 ? "📌" : "💡"}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold text-foreground">
                          {rec.titre || rec.label}
                        </p>
                        {rec.priorite && (
                          <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${IMPACT_COLORS[rec.priorite] || IMPACT_COLORS.medium}`}>
                            {rec.priorite === "high" ? "prioritaire" : rec.priorite === "medium" ? "important" : "bonus"}
                          </span>
                        )}
                      </div>
                      {rec.detail && (
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{rec.detail}</p>
                      )}
                      <div className="flex items-center gap-3 mt-2">
                        {rec.temps_estime && (
                          <span className="text-[11px] text-muted-foreground">⏱️ {rec.temps_estime}</span>
                        )}
                        <Link
                          to={rec.route}
                          onClick={() => {
                            if (user) (supabase.from("user_plan_config") as any).update({ welcome_seen: true }).eq(column, value);
                          }}
                          className="text-[11px] font-semibold text-primary hover:underline"
                        >
                          {i === 0 ? "👉 Commencer →" : "Voir →"}
                        </Link>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {STEPS.map((s, i) => (
                <div
                  key={i}
                  className={`rounded-xl border p-4 ${
                    i === 0 ? "border-primary bg-secondary" : "border-border"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <span className="text-lg">{s.emoji}</span>
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-foreground">
                        {s.num} {s.title}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {s.module} · {s.time}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">{s.desc}</p>
                      {s.cta && (
                        <p className="text-xs font-semibold text-primary mt-1">{s.cta}</p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* E) Config recap */}
        <div className="rounded-2xl bg-card border border-border p-6 space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            Ton outil s'adapte
          </h2>
          <div className="flex flex-wrap gap-2">
            {goal && (
              <span className="text-xs bg-secondary text-foreground px-3 py-1.5 rounded-pill font-medium">
                🎯 {GOAL_LABELS[goal] || goal}
              </span>
            )}
            {time && (
              <span className="text-xs bg-secondary text-foreground px-3 py-1.5 rounded-pill font-medium">
                ⏰ {TIME_LABELS[time] || time}
              </span>
            )}
            {channels.map((ch) => (
              <span key={ch} className="text-xs bg-secondary text-foreground px-3 py-1.5 rounded-pill font-medium">
                📱 {ch}
              </span>
            ))}
          </div>
        </div>

        {/* Import suggestion */}
        <div className="rounded-2xl bg-[hsl(var(--rose-pale))] border border-border p-5">
          <p className="text-sm text-foreground">
            💡 Tu as déjà un document stratégique (plan de com', brief, site web) ?
            Importe-le dans le Branding pour gagner du temps.
          </p>
          <Link
            to="/branding"
            onClick={() => {
              if (user) (supabase.from("user_plan_config") as any).update({ welcome_seen: true }).eq(column, value);
            }}
            className="inline-flex items-center gap-1 text-sm font-semibold text-primary mt-2 hover:underline"
          >
            📄 Importer un document →
          </Link>
        </div>

        {/* F) CTAs */}
        <div className="flex flex-col sm:flex-row gap-3">
          <Button
            onClick={() => markSeen("/branding")}
            className="flex-1 rounded-pill gap-2"
            size="lg"
          >
            🎯 Valider mon branding →
          </Button>
          <Button
            variant="outline"
            onClick={() => markSeen("/dashboard")}
            className="rounded-pill"
            size="lg"
          >
            📊 Aller au Dashboard →
          </Button>
        </div>
      </div>
    </div>
  );
}
