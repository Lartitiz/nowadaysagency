import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspaceId } from "@/hooks/use-workspace-query";
import AppHeader from "@/components/AppHeader";
import SubPageHeader from "@/components/SubPageHeader";
import { Button } from "@/components/ui/button";
import { InputWithVoice as Input } from "@/components/ui/input-with-voice";
import { TextareaWithVoice as Textarea } from "@/components/ui/textarea-with-voice";
import { Copy, Sparkles, Loader2 } from "lucide-react";
import { toast } from "sonner";
import RedFlagsChecker from "@/components/RedFlagsChecker";
import { friendlyError } from "@/lib/error-messages";

export default function SiteCapturePage() {
  const { user } = useAuth();
  const workspaceId = useWorkspaceId();
  const [leadName, setLeadName] = useState("");
  const [leadDesc, setLeadDesc] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  const copyText = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copié !");
  };

  const generate = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("website-ai", {
        body: { action: "capture-page", lead_magnet_name: leadName, lead_magnet_description: leadDesc, workspace_id: workspaceId },
      });
      if (error) throw error;
      const raw = data?.content || "";
      const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      setResult(JSON.parse(cleaned));
    } catch (e: any) {
      console.error("Erreur technique:", e);
      toast.error(friendlyError(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-3xl px-6 py-8 max-md:px-4">
        <SubPageHeader parentLabel="Mon Site Web" parentTo="/site" currentLabel="Page de capture" />

        <h1 className="font-display text-[26px] font-bold text-foreground mb-2">🎁 Ta page de capture</h1>
        <p className="text-sm text-muted-foreground mb-8">
          Récolte des emails avec un lead magnet. Structure minimale : titre bénéfice + 3-4 bullets + formulaire (prénom + email) + CTA.
          <br />
          <span className="italic">Chaque champ supplémentaire = -4% de conversion. 2 champs suffisent.</span>
        </p>

        <div className="rounded-2xl border border-border bg-card p-6 mb-6">
          <div className="space-y-4">
            <div>
              <label className="text-sm font-semibold block mb-1">Nom du lead magnet</label>
              <Input value={leadName} onChange={(e) => setLeadName(e.target.value)} placeholder="Ex : Le guide de la com' éthique en 7 étapes" />
            </div>
            <div>
              <label className="text-sm font-semibold block mb-1">Description (ce qu'il contient)</label>
              <Textarea className="min-h-[80px]" value={leadDesc} onChange={(e) => setLeadDesc(e.target.value)} placeholder="7 étapes concrètes pour rendre ta marque visible sans marketing agressif..." />
            </div>
            <Button onClick={generate} disabled={loading || !leadName.trim()}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Sparkles className="h-4 w-4 mr-2" />}
              {loading ? "Génération..." : "Générer ma page de capture"}
            </Button>
          </div>
        </div>

        {result && (
          <div className="rounded-2xl border border-border bg-card p-6 space-y-6">
            {/* Title */}
            <div>
              <p className="font-mono-ui text-[11px] font-semibold text-primary mb-1">🎯 TITRE</p>
              <p className="text-xl font-bold text-foreground">{result.title}</p>
              {result.subtitle && <p className="text-sm text-muted-foreground mt-1">{result.subtitle}</p>}
              <RedFlagsChecker content={result.title} onFix={() => {}} />
            </div>

            {/* Bullets */}
            {result.bullets && (
              <div>
                <p className="font-mono-ui text-[11px] font-semibold text-primary mb-2">📋 CE QUE TU VAS RECEVOIR</p>
                <ul className="space-y-2">
                  {result.bullets.map((b: string, i: number) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-foreground">
                      <span className="text-primary mt-0.5">✅</span>
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* CTA */}
            <div className="rounded-xl bg-rose-pale p-4 text-center">
              <p className="font-display text-base font-bold text-foreground mb-1">{result.cta_text}</p>
              {result.micro_copy && <p className="text-[12px] text-muted-foreground">{result.micro_copy}</p>}
            </div>

            {/* Copy all */}
            <Button variant="outline" size="sm" onClick={() => {
              const text = [
                result.title,
                result.subtitle,
                result.bullets?.map((b: string) => `✅ ${b}`).join("\n"),
                `CTA : ${result.cta_text}`,
                result.micro_copy,
              ].filter(Boolean).join("\n\n");
              copyText(text);
            }}>
              <Copy className="h-4 w-4 mr-1" /> Copier tout
            </Button>
          </div>
        )}
      </main>
    </div>
  );
}
