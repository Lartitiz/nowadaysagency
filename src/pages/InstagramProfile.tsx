import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import AppHeader from "@/components/AppHeader";
import SubPageHeader from "@/components/SubPageHeader";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Sparkles, PenLine, BookmarkCheck, Pin, Palette, BarChart3 } from "lucide-react";

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

const SECTIONS = [
  { key: "nom", emoji: "📝", label: "Mon nom", icon: PenLine, route: "/instagram/profil/nom", moduleRoute: "/instagram/profil/nom", moduleLabel: "Optimiser" },
  { key: "bio", emoji: "✍️", label: "Ma bio", icon: PenLine, route: "/instagram/profil/bio", moduleRoute: "/instagram/profil/bio", moduleLabel: "Créer ma bio" },
  { key: "stories", emoji: "📌", label: "Stories à la une", icon: BookmarkCheck, route: "/instagram/profil/stories", moduleRoute: "/instagram/profil/stories", moduleLabel: "Module highlights" },
  { key: "epingles", emoji: "📌", label: "Posts épinglés", icon: Pin, route: "/instagram/profil/epingles", moduleRoute: "/instagram/profil/epingles", moduleLabel: "Choisir mes posts" },
  { key: "feed", emoji: "🎨", label: "Mon feed", icon: Palette, route: "/instagram/profil/feed", moduleRoute: "/instagram/profil/feed", moduleLabel: "Recommandations" },
  { key: "edito", emoji: "📊", label: "Ma ligne éditoriale", icon: BarChart3, route: "/instagram/profil/edito", moduleRoute: "/instagram/rythme", moduleLabel: "Ligne éditoriale" },
];

function scoreBadge(score: number | null) {
  if (score === null || score === undefined) return { label: "Pas fait", color: "bg-muted text-muted-foreground" };
  if (score >= 80) return { label: "Bien", color: "bg-green-100 text-green-700" };
  if (score >= 50) return { label: "À améliorer", color: "bg-orange-100 text-orange-700" };
  if (score > 0) return { label: "Prioritaire", color: "bg-red-100 text-red-700" };
  return { label: "Pas fait", color: "bg-muted text-muted-foreground" };
}

export default function InstagramProfile() {
  const { user } = useAuth();
  const [audit, setAudit] = useState<AuditData | null>(null);
  const [loading, setLoading] = useState(true);
  const [validations, setValidations] = useState<ValidationStatus[]>([]);
  const [snippets, setSnippets] = useState<ProfileSnippets>({});

  useEffect(() => {
    if (!user) return;
    const fetchData = async () => {
      const [{ data: auditData }, { data: valData }, { data: profileData }] = await Promise.all([
        supabase
          .from("instagram_audit")
          .select("score_global, score_nom, score_bio, score_stories, score_epingles, score_feed, score_edito, resume")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("audit_validations" as any)
          .select("section, status")
          .eq("user_id", user.id),
        supabase
          .from("profiles")
          .select("instagram_display_name, instagram_bio, instagram_highlights, instagram_highlights_count, instagram_pinned_posts, instagram_feed_description, instagram_pillars")
          .eq("user_id", user.id)
          .maybeSingle(),
      ]);
      if (auditData) setAudit(auditData as AuditData);
      if (valData) setValidations(valData as unknown as ValidationStatus[]);
      if (profileData) setSnippets(profileData as unknown as ProfileSnippets);
      setLoading(false);
    };
    fetchData();
  }, [user?.id]);

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

  const validatedCount = validations.filter(v => v.status === "validated").length;

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

        <h1 className="font-display text-[26px] font-bold text-foreground">👤 Mon profil Instagram</h1>
        <p className="mt-2 text-sm text-muted-foreground italic mb-8">
          Audite ton compte, optimise chaque élément. L'IA compare ton profil avec ton branding et te dit exactement quoi améliorer.
        </p>

        {/* Audit suggestion or score */}
        {!audit ? (
          <div className="rounded-2xl border border-border bg-rose-pale p-6 mb-8">
            <p className="text-foreground font-medium mb-2">
              🔍 On commence par un audit ?
            </p>
            <p className="text-sm text-muted-foreground mb-4">
              Envoie des screenshots de ton profil Instagram. L'IA va analyser ton compte et te donner un score avec des recommandations personnalisées basées sur ton branding.
            </p>
            <div className="flex gap-3 flex-wrap">
              <Link to="/instagram/audit">
                <Button className="rounded-pill gap-2">
                  <Sparkles className="h-4 w-4" />
                  🔍 Lancer mon premier audit
                </Button>
              </Link>
              <Button variant="outline" className="rounded-pill" onClick={() => {}}>
                ⏭️ Passer aux optimisations
              </Button>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-border bg-card p-6 mb-8">
            <div className="text-center mb-4">
              <p className="text-xs font-mono-ui uppercase tracking-wider text-muted-foreground mb-1">Ton score profil</p>
              <p className="text-5xl font-display font-bold text-foreground">{audit.score_global}<span className="text-2xl text-muted-foreground">/100</span></p>
              <span className={`inline-block mt-2 text-xs font-semibold px-3 py-1 rounded-pill ${scoreBadge(audit.score_global).color}`}>
                {scoreBadge(audit.score_global).label}
              </span>
            </div>
            <div className="flex flex-wrap justify-center gap-3 mb-4">
              {SECTIONS.map(s => {
                const sc = getScore(s.key);
                const vs = getValidationStatus(s.key);
                return (
                  <span key={s.key} className="text-xs text-muted-foreground">
                    {vs === "validated" ? "✅" : s.emoji} {s.label.replace("Mon ", "").replace("Ma ", "")}: <strong>{sc ?? "?"}</strong>
                  </span>
                );
              })}
            </div>
            {audit.resume && (
              <p className="text-sm text-muted-foreground text-center italic leading-relaxed">
                "{audit.resume}"
              </p>
            )}
            <div className="flex flex-wrap justify-center gap-3 mt-4">
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
        )}

        {/* Sub-section cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {SECTIONS.map(s => {
            const sc = getScore(s.key);
            const badge = scoreBadge(sc);
            const vs = getValidationStatus(s.key);
            const snippet = s.key === "bio" ? snippets.instagram_bio
              : s.key === "nom" ? snippets.instagram_display_name
              : s.key === "stories" ? (snippets.instagram_highlights as string[] || []).join(" · ") || null
              : s.key === "epingles" ? (snippets.instagram_pinned_posts as any[] || []).map((p: any) => p.description).join(", ") || null
              : s.key === "feed" ? snippets.instagram_feed_description
              : s.key === "edito" ? (snippets.instagram_pillars as string[] || []).join(", ") || null
              : null;
            const improvementCount = sc !== null && sc < 70 ? Math.max(1, Math.ceil((70 - sc) / 20)) : 0;
            return (
              <Link
                key={s.key}
                to={s.route}
                className="group rounded-2xl border border-border bg-card p-5 hover:border-primary hover:shadow-md transition-all"
              >
                <div className="flex items-start justify-between mb-3">
                  <span className="text-2xl">{s.emoji}</span>
                  <div className="flex items-center gap-1.5">
                    {vs === "validated" && (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-pill bg-green-100 text-green-700">✅</span>
                    )}
                    {sc !== null && (
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-pill ${badge.color}`}>
                        {sc}/100
                      </span>
                    )}
                  </div>
                </div>
                <h3 className="font-display text-base font-bold text-foreground group-hover:text-primary transition-colors">
                  {s.label}
                </h3>
                {snippet && (
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2 italic">"{snippet.substring(0, 60)}{snippet.length > 60 ? "…" : ""}"</p>
                )}
                {sc !== null && improvementCount > 0 && (
                  <p className="text-xs text-amber-600 mt-1 font-medium">{improvementCount} amélioration{improvementCount > 1 ? "s" : ""} suggérée{improvementCount > 1 ? "s" : ""}</p>
                )}
                {sc !== null && improvementCount === 0 && (
                  <p className="text-xs text-green-600 mt-1 font-medium">✅ {vs === "validated" ? "Validé" : "Bien"}</p>
                )}
              </Link>
            );
          })}
        </div>
      </main>
    </div>
  );
}
