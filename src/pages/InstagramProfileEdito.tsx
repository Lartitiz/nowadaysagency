import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import AppHeader from "@/components/AppHeader";
import SubPageHeader from "@/components/SubPageHeader";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Sparkles, Save, Loader2 } from "lucide-react";

interface EditorialLine {
  id?: string;
  main_objective: string;
  recommended_rhythm: string;
  pillar_distribution: Record<string, number>;
  preferred_formats: string[];
  stop_doing: string;
  do_more: string;
}

export default function InstagramProfileEdito() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [auditScore, setAuditScore] = useState<number | null>(null);
  const [auditRecos, setAuditRecos] = useState<string[]>([]);
  const [editorial, setEditorial] = useState<EditorialLine | null>(null);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const [auditRes, editoRes] = await Promise.all([
        supabase.from("instagram_audit").select("score_edito, details").eq("user_id", user.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
        supabase.from("instagram_editorial_line").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      ]);
      if (auditRes.data) {
        setAuditScore(auditRes.data.score_edito);
        const det = auditRes.data.details as any;
        setAuditRecos(det?.sections?.edito?.recommandations || []);
      }
      if (editoRes.data) {
        setEditorial({
          id: editoRes.data.id,
          main_objective: editoRes.data.main_objective || "",
          recommended_rhythm: editoRes.data.recommended_rhythm || "",
          pillar_distribution: (editoRes.data.pillar_distribution as Record<string, number>) || {},
          preferred_formats: (editoRes.data.preferred_formats as string[]) || [],
          stop_doing: editoRes.data.stop_doing || "",
          do_more: editoRes.data.do_more || "",
        });
      }
    };
    load();
  }, [user]);

  const handleGenerate = async () => {
    if (!user) return;
    setGenerating(true);
    try {
      const res = await supabase.functions.invoke("generate-content", {
        body: { type: "instagram-edito", profile: {} },
      });
      if (res.error) throw new Error(res.error.message);
      const content = res.data?.content || "";
      let parsed: any;
      try {
        parsed = JSON.parse(content);
      } catch {
        const match = content.match(/\{[\s\S]*\}/);
        if (match) parsed = JSON.parse(match[0]);
        else throw new Error("Format inattendu");
      }
      setEditorial({
        main_objective: parsed.main_objective || "",
        recommended_rhythm: parsed.recommended_rhythm || "",
        pillar_distribution: parsed.pillar_distribution || {},
        preferred_formats: parsed.preferred_formats || [],
        stop_doing: parsed.stop_doing || "",
        do_more: parsed.do_more || "",
      });
    } catch (e: any) {
      toast({ title: "Erreur", description: e.message, variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  const handleSave = async () => {
    if (!user || !editorial) return;
    setSaving(true);
    try {
      if (editorial.id) {
        await supabase.from("instagram_editorial_line").update({
          main_objective: editorial.main_objective,
          recommended_rhythm: editorial.recommended_rhythm,
          pillar_distribution: editorial.pillar_distribution,
          preferred_formats: editorial.preferred_formats,
          stop_doing: editorial.stop_doing,
          do_more: editorial.do_more,
        }).eq("id", editorial.id);
      } else {
        const { data } = await supabase.from("instagram_editorial_line").insert({
          user_id: user.id,
          main_objective: editorial.main_objective,
          recommended_rhythm: editorial.recommended_rhythm,
          pillar_distribution: editorial.pillar_distribution,
          preferred_formats: editorial.preferred_formats,
          stop_doing: editorial.stop_doing,
          do_more: editorial.do_more,
        }).select("id").single();
        if (data) setEditorial(prev => prev ? { ...prev, id: data.id } : prev);
      }
      toast({ title: "Ligne éditoriale sauvegardée !" });
    } catch (e: any) {
      toast({ title: "Erreur", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-3xl px-6 py-8 max-md:px-4">
        <SubPageHeader parentLabel="Mon profil" parentTo="/instagram/profil" currentLabel="Ligne éditoriale" />

        <h1 className="font-display text-[26px] font-bold text-foreground">📊 Ma ligne éditoriale</h1>
        <p className="mt-2 text-sm text-muted-foreground mb-6">
          Définis ton rythme, tes formats et la répartition de tes contenus par pilier.
        </p>

        {auditScore !== null && (
          <div className="rounded-xl bg-rose-pale p-4 mb-6">
            <p className="text-sm font-medium">🔍 Score actuel : <strong>{auditScore}/100</strong></p>
            {auditRecos.length > 0 && (
              <ul className="mt-2 space-y-1">
                {auditRecos.map((r, i) => (
                  <li key={i} className="text-sm text-muted-foreground">• {r}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        <Button onClick={handleGenerate} disabled={generating} className="w-full rounded-pill gap-2 mb-6">
          {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {generating ? "Génération..." : "✨ Créer ma ligne éditoriale"}
        </Button>

        {editorial && (
          <div className="space-y-4 animate-fade-in">
            {editorial.main_objective && (
              <div className="rounded-2xl border border-border bg-card p-5">
                <p className="text-xs font-mono-ui uppercase text-muted-foreground mb-1">🎯 Objectif</p>
                <p className="text-sm font-medium text-foreground">{editorial.main_objective}</p>
              </div>
            )}

            {editorial.recommended_rhythm && (
              <div className="rounded-2xl border border-border bg-card p-5">
                <p className="text-xs font-mono-ui uppercase text-muted-foreground mb-1">📅 Rythme recommandé</p>
                <p className="text-sm font-medium text-foreground">{editorial.recommended_rhythm}</p>
              </div>
            )}

            {Object.keys(editorial.pillar_distribution).length > 0 && (
              <div className="rounded-2xl border border-border bg-card p-5">
                <p className="text-xs font-mono-ui uppercase text-muted-foreground mb-2">📊 Répartition par pilier</p>
                <div className="space-y-2">
                  {Object.entries(editorial.pillar_distribution).map(([pillar, pct]) => (
                    <div key={pillar} className="flex items-center gap-3">
                      <div className="flex-1">
                        <div className="flex justify-between text-xs mb-1">
                          <span className="font-medium text-foreground">{pillar}</span>
                          <span className="text-muted-foreground">{pct}%</span>
                        </div>
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                          <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {editorial.preferred_formats.length > 0 && (
              <div className="rounded-2xl border border-border bg-card p-5">
                <p className="text-xs font-mono-ui uppercase text-muted-foreground mb-2">📌 Formats à privilégier</p>
                <div className="flex flex-wrap gap-2">
                  {editorial.preferred_formats.map((f, i) => (
                    <span key={i} className="rounded-pill bg-rose-pale px-3 py-1 text-xs font-medium text-foreground">{f}</span>
                  ))}
                </div>
              </div>
            )}

            {editorial.stop_doing && (
              <div className="rounded-2xl border border-border bg-card p-5">
                <p className="text-xs font-mono-ui uppercase text-muted-foreground mb-1">⚡ Ce que tu devrais arrêter</p>
                <p className="text-sm text-foreground whitespace-pre-wrap">{editorial.stop_doing}</p>
              </div>
            )}

            {editorial.do_more && (
              <div className="rounded-2xl border border-border bg-card p-5">
                <p className="text-xs font-mono-ui uppercase text-muted-foreground mb-1">🔥 Ce que tu devrais faire plus</p>
                <p className="text-sm text-foreground whitespace-pre-wrap">{editorial.do_more}</p>
              </div>
            )}

            <Button onClick={handleSave} disabled={saving} variant="outline" className="w-full rounded-pill gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              💾 Enregistrer ma ligne éditoriale
            </Button>
          </div>
        )}
      </main>
    </div>
  );
}
