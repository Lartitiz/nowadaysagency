import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspaceFilter, useWorkspaceId } from "@/hooks/use-workspace-query";
import AppHeader from "@/components/AppHeader";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";

const CMS_OPTIONS = [
  { value: "squarespace", label: "Squarespace" },
  { value: "wordpress", label: "WordPress" },
  { value: "shopify", label: "Shopify" },
  { value: "wix", label: "Wix" },
  { value: "autre", label: "Autre" },
  { value: "none", label: "Je n'ai pas encore de site" },
];

const CARDS = [
  { emoji: "🔍", title: "Audit de conversion", desc: "Diagnostique ton site et découvre ce qui empêche tes visiteuses de passer à l'action.", to: "/site/audit", tag: "IA + Guide" },
  { emoji: "🏠", title: "Ma page d'accueil / vente", desc: "Rédige les textes de ta page section par section. Page d'accueil, page de vente ou page de services.", to: "/site/accueil", tag: "IA + Guide" },
  { emoji: "🎁", title: "Ma page de capture", desc: "Récolte des emails avec un lead magnet. Structure minimale et efficace.", to: "/site/capture", tag: "IA + Guide" },
  { emoji: "👋", title: "Ma page À propos", desc: "Raconte ton histoire pour créer du lien.", to: "/site/a-propos", tag: "IA + Guide" },
  { emoji: "💬", title: "Mes témoignages", desc: "Récolte et structure des témoignages qui convertissent.", to: "/site/temoignages", tag: "IA + Guide" },
  { emoji: "🎨", title: "Inspirations visuelles", desc: "Des templates de sections à copier-coller, personnalisés avec ton branding.", to: "/site/inspirations", tag: "IA + Guide" },
  { emoji: "💚", title: "Mes pages produits", desc: "Des fiches produits qui donnent envie d'acheter.", to: "/site/produits", tag: "Bientôt", disabled: true },
  { emoji: "⚙️", title: "Autres optimisations", desc: "SEO, vitesse, accessibilité, mentions légales.", to: "/site/optimisations", tag: "Bientôt", disabled: true },
];

export default function SiteHub() {
  const { user } = useAuth();
  const { column, value } = useWorkspaceFilter();
  const workspaceId = useWorkspaceId();
  const [cms, setCms] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [homepageStep, setHomepageStep] = useState(0);
  const [lastAuditScore, setLastAuditScore] = useState<number | null>(null);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const [wpRes, hpRes, auditRes] = await Promise.all([
        (supabase.from("website_profile") as any).select("cms").eq(column, value).maybeSingle(),
        (supabase.from("website_homepage") as any).select("current_step, completed").eq(column, value).maybeSingle(),
        (supabase.from("website_audit" as any).select("score_global").eq(column, value).order("created_at", { ascending: false }).limit(1).maybeSingle()),
      ]);
      if (wpRes.data) setCms(wpRes.data.cms);
      if (hpRes.data) setHomepageStep(hpRes.data.completed ? 10 : (hpRes.data.current_step || 1));
      if ((auditRes as any).data?.score_global != null) setLastAuditScore((auditRes as any).data.score_global);
      setLoading(false);
    };
    load();
  }, [user?.id]);

  const saveCms = async (value: string) => {
    if (!user) return;
    setCms(value);
    const { error } = await supabase.from("website_profile").upsert({ 
      user_id: user.id, 
      workspace_id: workspaceId !== user.id ? workspaceId : undefined,
      cms: value 
    } as any, { onConflict: "user_id" });
    if (error) toast.error("Erreur de sauvegarde");
  };

  if (loading) return <div className="flex min-h-screen items-center justify-center bg-background"><div className="flex gap-1"><div className="h-3 w-3 rounded-full bg-primary animate-bounce-dot" /><div className="h-3 w-3 rounded-full bg-primary animate-bounce-dot" style={{ animationDelay: "0.16s" }} /><div className="h-3 w-3 rounded-full bg-primary animate-bounce-dot" style={{ animationDelay: "0.32s" }} /></div></div>;

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-5xl px-6 py-8 max-md:px-4">
        <Link to="/dashboard" className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline mb-6">
          <ArrowLeft className="h-4 w-4" /> Retour au hub
        </Link>
        <div className="mb-8">
          <h1 className="font-display text-[26px] sm:text-3xl font-bold text-foreground">🌐 Mon Site Web</h1>
          <p className="mt-1 text-[15px] text-muted-foreground">Analyse ton site, améliore ton SEO, retravaille tes pages : l'objectif c'est que Google te trouve avant tes concurrentes.</p>
        </div>

        {/* CMS selector */}
        {!cms && (
          <div className="rounded-2xl border border-primary bg-rose-pale p-6 mb-8">
            <p className="font-display text-base font-bold text-foreground mb-4">Quel outil utilises-tu pour ton site ?</p>
            <div className="flex flex-wrap gap-2">
              {CMS_OPTIONS.map((opt) => (
                <button key={opt.value} onClick={() => saveCms(opt.value)} className="font-mono-ui text-[12px] font-semibold px-4 py-2 rounded-pill border-2 border-border bg-card hover:border-primary hover:bg-rose-pale transition-colors">
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {cms && (
          <div className="text-xs text-muted-foreground mb-6 flex items-center gap-2">
            <span>🔧 Outil : <strong>{CMS_OPTIONS.find(o => o.value === cms)?.label}</strong></span>
            <button onClick={() => setCms(null)} className="underline text-primary text-xs">Changer</button>
          </div>
        )}
        {lastAuditScore !== null && lastAuditScore < 60 && (
          <div className="rounded-2xl border border-primary bg-rose-pale p-5 mb-6 flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <div className="flex-1">
              <p className="text-sm font-medium text-foreground">
                Ton dernier audit montre un score de <strong>{lastAuditScore}/100</strong>. Quelques ajustements peuvent faire une vraie différence.
              </p>
            </div>
            <Link to="/site/audit" className="shrink-0 inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline">
              Voir mes recommandations →
            </Link>
          </div>
        )}

        {/* Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {CARDS.map((card) => {
            const label: string | null = null;
            const inner = (
              <div className={`group relative rounded-2xl border bg-card p-6 transition-all ${card.disabled ? "opacity-45 cursor-default" : "hover:border-primary hover:shadow-md cursor-pointer"}`}>
                {label && <span className="absolute top-4 right-4 font-mono-ui text-[10px] font-semibold text-muted-foreground bg-rose-pale px-2 py-0.5 rounded-pill">{label}</span>}
                <span className="text-2xl mb-3 block">{card.emoji}</span>
                <h3 className="font-display text-lg font-bold text-foreground group-hover:text-primary transition-colors">{card.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{card.desc}</p>
                <span className={`mt-3 inline-block font-mono-ui text-[10px] font-semibold px-2.5 py-0.5 rounded-pill ${card.disabled ? "bg-secondary text-muted-foreground" : "text-primary bg-rose-pale"}`}>{card.tag}</span>
              </div>
            );
            if (card.disabled) return <div key={card.to}>{inner}</div>;
            return <Link key={card.to} to={card.to}>{inner}</Link>;
          })}
        </div>
      </main>
    </div>
  );
}
