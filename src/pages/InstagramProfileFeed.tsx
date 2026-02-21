import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import AppHeader from "@/components/AppHeader";
import SubPageHeader from "@/components/SubPageHeader";
import { Checkbox } from "@/components/ui/checkbox";
import { Link } from "react-router-dom";

export default function InstagramProfileFeed() {
  const { user } = useAuth();
  const [auditScore, setAuditScore] = useState<number | null>(null);
  const [auditRecos, setAuditRecos] = useState<string[]>([]);
  const [checklist, setChecklist] = useState({
    formats: false,
    variety: false,
    face: false,
    colors: false,
    readable: false,
  });

  useEffect(() => {
    if (!user) return;
    supabase
      .from("instagram_audit")
      .select("score_feed, details")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setAuditScore(data.score_feed);
          const det = data.details as any;
          setAuditRecos(det?.sections?.feed?.recommandations || []);
        }
      });
  }, [user]);

  const toggle = (key: keyof typeof checklist) => {
    setChecklist(prev => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-3xl px-6 py-8 max-md:px-4">
        <SubPageHeader parentLabel="Mon profil" parentTo="/instagram/profil" currentLabel="Mon feed" />

        <h1 className="font-display text-[26px] font-bold text-foreground">🎨 Mon feed</h1>
        <p className="mt-2 text-sm text-muted-foreground mb-6">
          La cohérence visuelle de ton feed renforce ta crédibilité. Voici les points à vérifier.
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

        <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
          <p className="text-sm font-bold text-foreground">Checklist cohérence visuelle</p>
          {[
            { key: "formats" as const, label: "Mon feed alterne les formats (carrousel, photo, reel)" },
            { key: "variety" as const, label: "Il y a de la variété visuelle (pas que des photos produit)" },
            { key: "face" as const, label: "Mon visage apparaît régulièrement" },
            { key: "colors" as const, label: "Les couleurs sont cohérentes avec ma charte" },
            { key: "readable" as const, label: "Les accroches sont lisibles sur les miniatures" },
          ].map(item => (
            <label key={item.key} className="flex items-center gap-3 cursor-pointer">
              <Checkbox checked={checklist[item.key]} onCheckedChange={() => toggle(item.key)} />
              <span className="text-sm text-foreground">{item.label}</span>
            </label>
          ))}
        </div>

        <div className="mt-6 rounded-xl bg-rose-pale p-4">
          <p className="text-sm text-muted-foreground">
            📌 Besoin d'inspiration pour ton feed ?{" "}
            <Link to="/pinterest/tableaux" className="text-primary hover:underline font-medium">
              Créer un tableau d'inspiration sur Pinterest →
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
