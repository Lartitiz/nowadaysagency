import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "react-router-dom";
import AppHeader from "@/components/AppHeader";
import SubPageHeader from "@/components/SubPageHeader";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Copy, Pencil } from "lucide-react";

export default function NicheRecapPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    supabase.from("brand_niche").select("*").eq("user_id", user.id).maybeSingle().then(({ data: d }) => {
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

  const finalVersion = data?.version_final || data?.version_descriptive || "";
  const otherVersions = [
    { label: "Pitch", text: data?.version_pitch },
    { label: "Manifeste", text: data?.version_manifeste },
    { label: "Descriptive", text: data?.version_descriptive },
  ].filter(v => v.text && v.text !== finalVersion);

  const combats = data?.ai_combats || [];

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-[700px] px-6 py-8 max-md:px-4">
        <SubPageHeader parentLabel="Branding" parentTo="/branding" currentLabel="Ma niche" />

        <h1 className="font-display text-[26px] font-bold text-foreground mb-6">Ta niche</h1>

        {/* Main card */}
        <div className="rounded-2xl bg-card border border-border p-6 shadow-card mb-6">
          <p className="font-display text-[18px] text-foreground leading-[1.8] whitespace-pre-line">
            {finalVersion || "Aucune niche rédigée."}
          </p>
          <div className="flex gap-2 mt-4 pt-4 border-t border-border">
            <Button variant="outline" size="sm" onClick={() => copyText(finalVersion)} className="rounded-pill text-xs" disabled={!finalVersion}>
              <Copy className="h-3 w-3 mr-1" /> Copier
            </Button>
            <Link to="/branding/niche">
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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-8">
              {otherVersions.map((v, i) => (
                <div key={i} className="rounded-2xl bg-card border border-border p-4">
                  <p className="font-mono-ui text-[10px] font-semibold text-muted-foreground mb-2">{v.label}</p>
                  <p className="text-[13px] text-foreground leading-relaxed mb-3 min-h-[50px] whitespace-pre-line">{v.text}</p>
                  <Button variant="outline" size="sm" onClick={() => copyText(v.text!)} className="rounded-pill text-[11px] w-full">
                    <Copy className="h-3 w-3 mr-1" /> Copier
                  </Button>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Combats */}
        {combats.length > 0 && (
          <>
            <h2 className="font-display text-lg font-bold text-foreground mb-3">Tes combats</h2>
            <div className="space-y-3 mb-8">
              {combats.map((c: any, i: number) => (
                <div key={i} className="rounded-xl bg-card border border-border p-4">
                  <p className="text-[13px] text-foreground mb-1"><span className="font-semibold">❌</span> {c.refuse}</p>
                  <p className="text-[13px] text-foreground mb-2"><span className="font-semibold">✅</span> {c.propose}</p>
                  <div className="rounded-lg bg-rose-pale p-3 mb-2">
                    <p className="text-[14px] text-foreground font-semibold italic">"{c.manifeste}"</p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => copyText(c.manifeste)} className="rounded-pill text-[11px]">
                    <Copy className="h-3 w-3 mr-1" /> Copier
                  </Button>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Limits */}
        {data?.ai_limits && Array.isArray(data.ai_limits) && data.ai_limits.length > 0 && (
          <>
            <h2 className="font-display text-lg font-bold text-foreground mb-3">Tes limites</h2>
            <div className="space-y-2 mb-8">
              {data.ai_limits.map((l: any, i: number) => (
                <div key={i} className="rounded-xl bg-card border border-border p-4 grid grid-cols-2 gap-3">
                  <div>
                    <p className="font-mono-ui text-[10px] font-semibold text-muted-foreground mb-1">CE QUE JE REFUSE</p>
                    <p className="text-[13px] text-foreground">{l.refuse}</p>
                  </div>
                  <div>
                    <p className="font-mono-ui text-[10px] font-semibold text-muted-foreground mb-1">CE QUE ÇA DIT DE MA NICHE</p>
                    <p className="text-[13px] text-foreground">{l.eclaire}</p>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Message */}
        <div className="rounded-xl bg-rose-pale border-l-4 border-primary p-5 mb-6">
          <p className="text-[14px] text-foreground leading-relaxed">
            Ta niche va évoluer avec toi. Ce n'est pas une prison : c'est un phare. Reviens la mettre à jour quand ton projet grandit.
          </p>
        </div>

        <Link to="/branding" className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline">
          ← Retour au Branding
        </Link>
      </main>
    </div>
  );
}
