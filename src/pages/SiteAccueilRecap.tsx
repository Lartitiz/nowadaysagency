import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspaceFilter } from "@/hooks/use-workspace-query";
import AppHeader from "@/components/AppHeader";
import { Link } from "react-router-dom";
import { ArrowLeft, Copy, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface FaqItem { question: string; reponse: string }

export default function SiteAccueilRecap() {
  const { user } = useAuth();
  const { column, value } = useWorkspaceFilter();
  const [data, setData] = useState<any>(null);
  const [cms, setCms] = useState("");

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const [hpRes, wpRes] = await Promise.all([
        (supabase.from("website_homepage") as any).select("*").eq(column, value).maybeSingle(),
        (supabase.from("website_profile") as any).select("cms").eq(column, value).maybeSingle(),
      ]);
      if (hpRes.data) {
        const faq = Array.isArray(hpRes.data.faq) ? hpRes.data.faq : [];
        setData({ ...hpRes.data, faq });
      }
      if (wpRes.data) setCms(wpRes.data.cms || "");
    };
    load();
  }, [user?.id]);

  const copyText = (text: string) => { navigator.clipboard.writeText(text); toast.success("Copié !"); };

  const copyAll = () => {
    if (!data) return;
    const sections = [
      `🎯 HOOK\n${data.hook_title}\n${data.hook_subtitle}`,
      `😩 LE PROBLÈME\n${data.problem_block || ""}`,
      `✨ LES BÉNÉFICES\n${data.benefits_block || ""}`,
      `💚 L'OFFRE\n${data.offer_block || ""}`,
      `👋 QUI TU ES\n${data.presentation_block || ""}`,
      `🦋 FAQ\n${(data.faq as FaqItem[]).map((f: FaqItem) => `Q : ${f.question}\nR : ${f.reponse}`).join("\n\n")}`,
      `🔘 CTA\n${data.cta_primary || ""}${data.cta_secondary ? `\n${data.cta_secondary}` : ""}`,
    ].filter(s => s.trim().length > 10);
    copyText(sections.join("\n\n---\n\n"));
  };

  const cmsLabel = { squarespace: "Squarespace", wordpress: "WordPress", shopify: "Shopify", wix: "Wix", autre: "ton outil", none: "ton site" }[cms] || "ton site";

  if (!data) return <div className="flex min-h-screen items-center justify-center bg-background"><div className="flex gap-1"><div className="h-3 w-3 rounded-full bg-primary animate-bounce-dot" /><div className="h-3 w-3 rounded-full bg-primary animate-bounce-dot" style={{ animationDelay: "0.16s" }} /><div className="h-3 w-3 rounded-full bg-primary animate-bounce-dot" style={{ animationDelay: "0.32s" }} /></div></div>;

  const sections = [
    { icon: "🎯", label: "Hook", content: `${data.hook_title || ""}\n${data.hook_subtitle || ""}`.trim(), step: 1 },
    { icon: "😩", label: "Le problème", content: data.problem_block || "", step: 2 },
    { icon: "✨", label: "Les bénéfices", content: data.benefits_block || "", step: 3 },
    { icon: "💚", label: "L'offre", content: data.offer_block || "", step: 3 },
    { icon: "👋", label: "Qui tu es", content: data.presentation_block || "", step: 4 },
    { icon: "🦋", label: "FAQ", content: (data.faq as FaqItem[]).map((f: FaqItem) => `Q : ${f.question}\nR : ${f.reponse}`).join("\n\n"), step: 5 },
    { icon: "🔘", label: "CTA", content: [data.cta_primary, data.cta_secondary].filter(Boolean).join("\n"), step: 5 },
  ].filter(s => s.content.trim().length > 0);

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-3xl px-6 py-8 max-md:px-4">
        <Link to="/site/accueil" className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline mb-6">
          <ArrowLeft className="h-4 w-4" /> Retour à l'éditeur
        </Link>

        <div className="mb-6">
          <h1 className="font-display text-[26px] font-bold text-foreground">📋 Récap de ta page d'accueil</h1>
          <p className="mt-2 text-sm text-muted-foreground">Ta page d'accueil est rédigée. Tu n'as plus qu'à copier-coller chaque section dans {cmsLabel}. Reviens la modifier quand ton offre ou ton positionnement évolue.</p>
        </div>

        <Button onClick={copyAll} className="mb-6">
          <Copy className="h-4 w-4 mr-2" /> Copier toute la page
        </Button>

        <div className="space-y-4">
          {sections.map((s, i) => (
            <div key={i} className="rounded-2xl border border-border bg-card p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-display text-base font-bold">{s.icon} {s.label}</h3>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={() => copyText(s.content)}>
                    <Copy className="h-3.5 w-3.5 mr-1" /> Copier
                  </Button>
                  <Link to={`/site/accueil?step=${s.step}`}>
                    <Button variant="ghost" size="sm">
                      <Pencil className="h-3.5 w-3.5 mr-1" /> Modifier
                    </Button>
                  </Link>
                </div>
              </div>
              <p className="text-sm text-foreground whitespace-pre-line leading-relaxed">{s.content}</p>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
