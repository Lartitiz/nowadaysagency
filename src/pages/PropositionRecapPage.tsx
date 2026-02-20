import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "react-router-dom";
import AppHeader from "@/components/AppHeader";
import SubPageHeader from "@/components/SubPageHeader";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Copy, Pencil } from "lucide-react";

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

  const finalVersion = data?.version_final || data?.version_complete || "";
  const otherVersions = [
    { label: "Courte à l'indicatif", text: data?.version_short },
    { label: "Émotionnelle", text: data?.version_emotional },
    { label: "Pitch express", text: data?.version_pitch },
  ].filter(v => v.text && v.text !== finalVersion);

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-[700px] px-6 py-8 max-md:px-4">
        <SubPageHeader parentLabel="Branding" parentTo="/branding" currentLabel="Ma proposition de valeur" />

        <h1 className="font-display text-[26px] font-bold text-foreground mb-6">Ta proposition de valeur</h1>

        {/* Main card */}
        <div className="rounded-2xl bg-card border border-border p-6 shadow-card mb-6">
          <p className="font-display text-[18px] text-foreground leading-[1.8] whitespace-pre-line">
            {finalVersion || "Aucune proposition de valeur rédigée."}
          </p>
          <div className="flex gap-2 mt-4 pt-4 border-t border-border">
            <Button variant="outline" size="sm" onClick={() => copyText(finalVersion)} className="rounded-pill text-xs" disabled={!finalVersion}>
              <Copy className="h-3 w-3 mr-1" /> Copier
            </Button>
            <Link to="/branding/proposition">
              <Button variant="outline" size="sm" className="rounded-pill text-xs">
                <Pencil className="h-3 w-3 mr-1" /> Modifier
              </Button>
            </Link>
          </div>
        </div>

        {/* Other versions */}
        {otherVersions.length > 0 && (
          <>
            <h2 className="font-display text-lg font-bold text-foreground mb-3">Autres versions</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-8">
              {otherVersions.map((v, i) => (
                <div key={i} className="rounded-2xl bg-card border border-border p-4">
                  <p className="font-mono-ui text-[10px] font-semibold text-muted-foreground mb-2">{v.label}</p>
                  <p className="text-[13px] text-foreground leading-relaxed mb-3 min-h-[50px]">{v.text}</p>
                  <Button variant="outline" size="sm" onClick={() => copyText(v.text!)} className="rounded-pill text-[11px] w-full">
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
