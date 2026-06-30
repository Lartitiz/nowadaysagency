import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspaceFilter } from "@/hooks/use-workspace-query";
import AppHeader from "@/components/AppHeader";
import SubPageHeader from "@/components/SubPageHeader";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Sparkles, PenLine, BookmarkCheck, Pin, Palette, BarChart3 } from "lucide-react";
import { useDemoContext } from "@/contexts/DemoContext";

interface AuditData {
  score_global: number;
  score_nom: number;
  score_bio: number;
  score_stories: number;
  score_epingles: number;
  score_feed: number;
  score_edito: number;
  resume: string;
}

interface ValidationStatus {
  section: string;
  status: string;
}

interface ProfileSnippets {
  instagram_display_name?: string | null;
  instagram_bio?: string | null;
  instagram_highlights?: string[] | null;
  instagram_highlights_count?: number | null;
  instagram_pinned_posts?: { description: string }[] | null;
  instagram_feed_description?: string | null;
  instagram_pillars?: string[] | null;
}

// heavy = élément piloté par l'IA, ouvre un outil dédié (vs édition légère sur sa page)
const SECTIONS = [
  { key: "nom", emoji: "📝", label: "Mon nom", icon: PenLine, route: "/instagram/profil/nom", moduleRoute: "/instagram/profil/nom", moduleLabel: "Optimiser", heavy: false },
  { key: "bio", emoji: "✍️", label: "Ma bio", icon: PenLine, route: "/instagram/profil/bio", moduleRoute: "/instagram/profil/bio", moduleLabel: "Créer ma bio", heavy: true },
  { key: "stories", emoji: "📌", label: "Stories à la une", icon: BookmarkCheck, route: "/instagram/profil/stories", moduleRoute: "/instagram/profil/stories", moduleLabel: "Module highlights", heavy: true },
  { key: "epingles", emoji: "📌", label: "Posts épinglés", icon: Pin, route: "/instagram/profil/epingles", moduleRoute: "/instagram/profil/epingles", moduleLabel: "Choisir mes posts", heavy: false },
  { key: "feed", emoji: "🎨", label: "Mon feed", icon: Palette, route: "/instagram/profil/feed", moduleRoute: "/instagram/profil/feed", moduleLabel: "Recommandations", heavy: false },
  { key: "edito", emoji: "📊", label: "Ma ligne éditoriale", icon: BarChart3, route: "/instagram/profil/edito", moduleRoute: "/instagram/rythme", moduleLabel: "Ligne éditoriale", heavy: true },
];

function scoreBadge(score: number | null) {
  if (score === null || score === undefined) return { label: "Pas fait", color: "bg-muted text-muted-foreground" };
  if (score >= 80) return { label: "Bien", color: "bg-success-bg text-success" };
  if (score >= 50) return { label: "À améliorer", color: "bg-warning-bg text-warning" };
  if (score > 0) return { label: "Prioritaire", color: "bg-error-bg text-error" };
  return { label: "Pas fait", color: "bg-muted text-muted-foreground" };
}

export default function InstagramProfile() {
  const { user } = useAuth();
  const { isDemoMode, demoData } = useDemoContext();
  const { column, value } = useWorkspaceFilter();
  const [audit, setAudit] = useState<AuditData | null>(null);
  const [loading, setLoading] = useState(true);
  const [validations, setValidations] = useState<ValidationStatus[]>([]);
  const [snippets, setSnippets] = useState<ProfileSnippets>({});

  useEffect(() => {
    if (isDemoMode && demoData) {
      setAudit({
        score_global: (demoData as any).audit.score,
        score_nom: 70,
        score_bio: 45,
        score_stories: 55,
        score_epingles: 60,
        score_feed: 75,
        score_edito: 65,
        resume: "Profil cohérent visuellement mais manque de CTA et de structure dans les highlights.",
      });
      setSnippets({
        instagram_display_name: (demoData as any).profile.first_name + " Portraits",
        instagram_bio: (demoData as any).bio,
        instagram_highlights: ["Séances", "Avis", "Coulisses"],
        instagram_pillars: (demoData as any).branding.editorial.pillars.map((p: any) => p.name),
      });
      setValidations([{ section: "feed", status: "validated" }]);
      setLoading(false);
      return;
    }
    if (!user) return;
    const fetchData = async () => {
      const [{ data: auditData }, { data: valData }, { data: profileData }] = await Promise.all([
        (supabase
          .from("instagram_audit") as any)
          .select("score_global, score_nom, score_bio, score_stories, score_epingles, score_feed, score_edito, resume")
          .eq(column, value)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        (supabase
          .from("audit_validations" as any) as any)
          .select("section, status")
          .eq(column, value),
        (supabase
          .from("profiles") as any)
          .select("instagram_display_name, instagram_bio, instagram_highlights, instagram_highlights_count, instagram_pinned_posts, instagram_feed_description, instagram_pillars")
          .eq(column, value)
          .maybeSingle(),
      ]);
      if (auditData) setAudit(auditData as AuditData);
      if (valData) setValidations(valData as unknown as ValidationStatus[]);
      if (profileData) setSnippets(profileData as unknown as ProfileSnippets);
      setLoading(false);
    };
    fetchData();
  }, [user?.id, isDemoMode]);

  const getScore = (key: string): number | null => {
    if (!audit) return null;
    switch (key) {
      case "nom": return audit.score_nom;
      case "bio": return audit.score_bio;
      case "stories": return audit.score_stories;
      case "epingles": return audit.score_epingles;
      case "feed": return audit.score_feed;
      case "edito": return audit.score_edito;
      default: return null;
    }
  };

  const getValidationStatus = (key: string): string | null => {
    const v = validations.find(v => v.section === key);
    return v?.status || null;
  };

  // Un élément est "optimisé" s'il a été validé manuellement (ex. bio adoptée)
  // OU si son score d'audit est bon (≥ 80). Sans ce 2e critère, seule la bio
  // écrit jamais dans audit_validations → la barre plafonnait à 1/6.
  const isOptimised = (key: string): boolean => {
    if (getValidationStatus(key) === "validated") return true;
    const sc = getScore(key);
    return sc !== null && sc >= 80;
  };
  const optimisedCount = SECTIONS.filter(s => isOptimised(s.key)).length;

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex gap-1">
          <div className="h-3 w-3 rounded-full bg-primary animate-bounce-dot" />
          <div className="h-3 w-3 rounded-full bg-primary animate-bounce-dot" style={{ animationDelay: "0.16s" }} />
          <div className="h-3 w-3 rounded-full bg-primary animate-bounce-dot" style={{ animationDelay: "0.32s" }} />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-5xl px-6 py-8 max-md:px-4">
        <SubPageHeader parentLabel="Instagram" parentTo="/instagram" currentLabel="Mon profil" />

        <h1 className="font-display text-3xl font-bold text-foreground">👤 Mon profil Instagram</h1>
        <p className="mt-2 text-sm text-muted-foreground mb-6">
          Optimise chaque élément de ton profil. Chaque case cochée, c'est un profil qui donne plus envie de te suivre.
        </p>

        {/* Progression — indicateur unifié (même cadre que LinkedIn & Pinterest) */}
        <div className="mb-8">
          <div className="flex items-center justify-between text-sm text-muted-foreground mb-1.5">
            <span>Progression du profil</span>
            <span><strong className="text-foreground">{optimisedCount}</strong> / {SECTIONS.length} optimisés</span>
          </div>
          <div className="h-2 rounded-pill bg-muted overflow-hidden">
            <div className="h-full bg-success transition-all" style={{ width: `${(optimisedCount / SECTIONS.length) * 100}%` }} />
          </div>
        </div>

        {/* Cartes des éléments du profil */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {SECTIONS.map(s => {
            const sc = getScore(s.key);
            const done = isOptimised(s.key);
            const snippet = s.key === "bio" ? snippets.instagram_bio
              : s.key === "nom" ? snippets.instagram_display_name
              : s.key === "stories" ? (snippets.instagram_highlights as string[] || []).join(" · ") || null
              : s.key === "epingles" ? (snippets.instagram_pinned_posts as any[] || []).map((p: any) => p.description).join(", ") || null
              : s.key === "feed" ? snippets.instagram_feed_description
              : s.key === "edito" ? (snippets.instagram_pillars as string[] || []).join(", ") || null
              : null;
            return (
              <Link
                key={s.key}
                to={s.route}
                className="group rounded-2xl border border-border bg-card p-5 hover:border-primary hover:shadow-md transition-all"
              >
                <div className="flex items-start justify-between mb-3">
                  <span className="text-2xl">{s.emoji}</span>
                  <span className={`text-2xs font-semibold px-2 py-0.5 rounded-pill ${done ? "bg-success-bg text-success" : "bg-warning-bg text-warning"}`}>
                    {done ? "Fait" : "À faire"}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <h3 className="font-display text-base font-bold text-foreground group-hover:text-primary transition-colors">
                    {s.label}
                  </h3>
                  {s.heavy && (
                    <span className="text-2xs text-muted-foreground border border-border rounded-pill px-1.5 py-0.5 shrink-0">Outil</span>
                  )}
                </div>
                {snippet && (
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2 italic">"{snippet.substring(0, 60)}{snippet.length > 60 ? "…" : ""}"</p>
                )}
                <div className="flex items-center justify-between mt-2">
                  <span className="text-xs text-primary font-medium">{s.moduleLabel} →</span>
                  {sc !== null && <span className="text-2xs text-muted-foreground">Score {sc}/100</span>}
                </div>
              </Link>
            );
          })}
        </div>

        {/* Audit — insight secondaire (pour aller plus loin) */}
        {!audit ? (
          <div className="rounded-2xl border border-border bg-rose-pale p-6 mt-8">
            <p className="text-foreground font-medium mb-2">
              🔍 Envie d'un regard d'expert sur ton profil ?
            </p>
            <p className="text-sm text-muted-foreground mb-4">
              Envoie des screenshots de ton profil Instagram. L'IA l'analyse face à ton branding et te donne un score avec des recommandations personnalisées.
            </p>
            <div className="flex gap-3 flex-wrap">
              <Link to="/instagram/audit">
                <Button className="rounded-pill gap-2">
                  <Sparkles className="h-4 w-4" />
                  🔍 Lancer un audit
                </Button>
              </Link>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-border bg-card p-6 mt-8">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-3">
                <div>
                  <p className="text-xs font-mono-ui uppercase tracking-wider text-muted-foreground mb-0.5">Score d'audit</p>
                  <p className="text-3xl font-display font-bold text-foreground leading-none">{audit.score_global}<span className="text-lg text-muted-foreground">/100</span></p>
                </div>
                <span className={`text-xs font-semibold px-3 py-1 rounded-pill ${scoreBadge(audit.score_global).color}`}>
                  {scoreBadge(audit.score_global).label}
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link to="/instagram/audit?view=results">
                  <Button size="sm" className="rounded-pill gap-1.5">
                    <BarChart3 className="h-3.5 w-3.5" />
                    📊 Voir mes résultats
                  </Button>
                </Link>
                <Link to="/instagram/audit?view=form">
                  <Button variant="outline" size="sm" className="rounded-pill gap-1.5">
                    🔄 Refaire l'audit
                  </Button>
                </Link>
              </div>
            </div>
            {audit.resume && (
              <p className="text-sm text-muted-foreground italic leading-relaxed mt-3">
                "{audit.resume}"
              </p>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
