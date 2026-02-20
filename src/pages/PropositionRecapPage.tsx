import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "react-router-dom";
import AppHeader from "@/components/AppHeader";
import SubPageHeader from "@/components/SubPageHeader";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Copy, Pencil } from "lucide-react";

const VERSION_CARDS = [
  { key: "version_pitch_naturel", icon: "☕", label: "Pitch naturel", usage: "Pour expliquer ton métier à une amie" },
  { key: "version_bio", icon: "📱", label: "Bio", usage: "Pour Instagram, LinkedIn, partout" },
  { key: "version_networking", icon: "🎤", label: "Pitch networking", usage: "Quand on te demande \"tu fais quoi ?\"" },
  { key: "version_site_web", icon: "🌐", label: "Site web", usage: "Pour ta page d'accueil" },
  { key: "version_engagee", icon: "🔥", label: "Engagée", usage: "Post LinkedIn, newsletter, page À propos" },
  { key: "version_one_liner", icon: "✨", label: "One-liner", usage: "Signature email, sticker, tote bag" },
];

export default function PropositionRecapPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    supabase.from("brand_proposition").select("*").eq("user_id", user.id).maybeSingle().then(({ data: d }) => {
      setData(d);
      setLoading(false);
    });
  }, [user]);

  const copyText = async (text: string) => {
    await navigator.clipboard.writeText(text);
    toast({ title: "Copié !" });
  };

  if (loading) return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <div className="flex justify-center py-20"><p className="text-muted-foreground">Chargement...</p></div>
    </div>
  );

  const finalVersion = data?.version_final || "";
  const otherVersions = VERSION_CARDS
    .map(v => ({ ...v, text: data?.[v.key] }))
    .filter(v => v.text && v.text !== finalVersion);

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-[700px] px-6 py-8 max-md:px-4">
        <SubPageHeader parentLabel="Branding" parentTo="/branding" currentLabel="Ma proposition de valeur" />

        <h1 className="font-display text-[26px] font-bold text-foreground mb-6">Ta proposition de valeur</h1>

        {/* Main card - version finale */}
        {finalVersion && (
          <div className="rounded-2xl bg-card border border-border p-6 shadow-card mb-6">
            <p className="font-mono-ui text-[10px] font-semibold text-muted-foreground mb-3">MA VERSION FINALE</p>
            <p className="font-display text-[18px] text-foreground leading-[1.8] whitespace-pre-line">
              {finalVersion}
            </p>
            <div className="flex gap-2 mt-4 pt-4 border-t border-border">
              <Button variant="outline" size="sm" onClick={() => copyText(finalVersion)} className="rounded-pill text-xs">
                <Copy className="h-3 w-3 mr-1" /> Copier
              </Button>
              <Link to="/branding/proposition">
                <Button variant="outline" size="sm" className="rounded-pill text-xs">
                  <Pencil className="h-3 w-3 mr-1" /> Modifier
                </Button>
              </Link>
            </div>
          </div>
        )}

        {!finalVersion && (
          <div className="rounded-2xl bg-card border border-border p-6 shadow-card mb-6">
            <p className="text-muted-foreground italic">Aucune version finale sélectionnée.</p>
            <Link to="/branding/proposition" className="text-sm text-primary hover:underline mt-2 inline-block">
              Aller créer ma proposition →
            </Link>
          </div>
        )}

        {/* All versions */}
        {otherVersions.length > 0 && (
          <>
            <h2 className="font-display text-lg font-bold text-foreground mb-3">Toutes les versions</h2>
            <div className="space-y-3 mb-8">
              {otherVersions.map((v, i) => (
                <div key={i} className="rounded-xl bg-card border border-border p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <span>{v.icon}</span>
                    <p className="font-mono-ui text-[11px] font-bold text-foreground">{v.label}</p>
                  </div>
                  <p className="font-mono-ui text-[10px] text-muted-foreground mb-2">{v.usage}</p>
                  <p className="text-[14px] text-foreground leading-relaxed mb-3">{v.text}</p>
                  <Button variant="outline" size="sm" onClick={() => copyText(v.text!)} className="rounded-pill text-[11px]">
                    <Copy className="h-3 w-3 mr-1" /> Copier
                  </Button>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Encouragement */}
        <div className="rounded-xl bg-rose-pale border-l-4 border-primary p-5 mb-6">
          <p className="text-[14px] text-foreground leading-relaxed mb-3">
            🎉 <strong>Tu viens de passer un point charnière dans ton projet.</strong>
          </p>
          <p className="text-[14px] text-foreground leading-relaxed mb-3">
            Ta proposition de valeur, c'est ton socle. Elle va maintenant te servir partout :
          </p>
          <ul className="text-[14px] text-foreground leading-relaxed space-y-1 mb-3">
            <li>✅ Sur ton site web (dès la première phrase)</li>
            <li>✅ Dans ta bio Instagram ou LinkedIn</li>
            <li>✅ En pitch, en entretien, en présentation</li>
            <li>✅ Dans tes newsletters, tes pages de vente, tes stories</li>
          </ul>
          <p className="text-[13px] text-muted-foreground italic">
            Avant chaque action, pose-toi cette question : "Est-ce que ce que je m'apprête à dire reflète vraiment ce que je veux apporter au monde ?"
          </p>
        </div>

        <Link to="/branding" className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline">
          ← Retour au Branding
        </Link>
      </main>
    </div>
  );
}
