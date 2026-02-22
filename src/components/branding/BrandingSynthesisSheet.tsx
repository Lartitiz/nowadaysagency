import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Download, Copy, RefreshCw, ExternalLink, Loader2 } from "lucide-react";
import { toast } from "sonner";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";

interface SynthesisData {
  brand: any;
  persona: any;
  storytelling: any;
  proposition: any;
  strategy: any;
  offers: any[];
  channels: string[];
  igAudit: any;
  liAudit: any;
}

function Field({ label, value, fallbackLink, fallbackLabel }: { label: string; value: any; fallbackLink?: string; fallbackLabel?: string }) {
  const isEmpty = value === null || value === undefined || (typeof value === "string" && value.trim() === "");
  if (isEmpty) {
    return (
      <div className="py-1.5">
        <span className="text-sm font-medium text-foreground">{label} : </span>
        <span className="text-sm text-muted-foreground/60 italic">Non renseigné</span>
        {fallbackLink && (
          <a href={fallbackLink} className="text-xs text-primary hover:underline ml-2 inline-flex items-center gap-0.5">
            Compléter <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>
    );
  }
  return (
    <div className="py-1.5">
      <span className="text-sm font-medium text-foreground">{label} : </span>
      <span className="text-sm text-muted-foreground whitespace-pre-line">{typeof value === "string" ? value : JSON.stringify(value)}</span>
    </div>
  );
}

function Section({ emoji, title, children }: { emoji: string; title: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <h3 className="font-display font-bold text-foreground text-base mb-2 flex items-center gap-2">
        <span>{emoji}</span> {title}
      </h3>
      <div className="border-t border-border pt-2">{children}</div>
    </div>
  );
}

export default function BrandingSynthesisSheet({ onClose }: { onClose: () => void }) {
  const { user } = useAuth();
  const [data, setData] = useState<SynthesisData | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);

  const loadData = async () => {
    if (!user) return;
    setLoading(true);
    const uid = user.id;

    const [brandRes, personaRes, storyRes, propRes, stratRes, offersRes, configRes, igAuditRes, liAuditRes] = await Promise.all([
      supabase.from("brand_profile").select("*").eq("user_id", uid).maybeSingle(),
      supabase.from("persona").select("*").eq("user_id", uid).maybeSingle(),
      supabase.from("storytelling").select("*").eq("user_id", uid).eq("is_primary", true).maybeSingle(),
      supabase.from("brand_proposition").select("*").eq("user_id", uid).maybeSingle(),
      supabase.from("brand_strategy").select("*").eq("user_id", uid).maybeSingle(),
      supabase.from("offers").select("*").eq("user_id", uid).order("created_at"),
      supabase.from("user_plan_config").select("channels").eq("user_id", uid).maybeSingle(),
      supabase.from("instagram_audit").select("*").eq("user_id", uid).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("linkedin_audit").select("*").eq("user_id", uid).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    ]);

    setData({
      brand: brandRes.data,
      persona: personaRes.data,
      storytelling: storyRes.data,
      proposition: propRes.data,
      strategy: stratRes.data,
      offers: offersRes.data || [],
      channels: (configRes.data?.channels as string[]) || [],
      igAudit: igAuditRes.data,
      liAudit: liAuditRes.data,
    });
    setLoading(false);
  };

  useEffect(() => { loadData(); }, [user?.id]);

  const channelLabels: Record<string, string> = {
    instagram: "📱 Instagram", linkedin: "💼 LinkedIn", newsletter: "📧 Newsletter",
    site: "🌐 Site web", pinterest: "📌 Pinterest", seo: "🔍 SEO",
  };

  const handleCopy = () => {
    if (!sheetRef.current) return;
    const text = sheetRef.current.innerText;
    navigator.clipboard.writeText(text);
    toast.success("Fiche copiée dans le presse-papier !");
  };

  const handleExportPdf = async () => {
    if (!sheetRef.current) return;
    setExporting(true);
    try {
      const canvas = await html2canvas(sheetRef.current, {
        scale: 2, backgroundColor: "#ffffff", useCORS: true,
      });
      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const margin = 10;
      const contentW = pageW - margin * 2;
      const imgH = (canvas.height / canvas.width) * contentW;

      let y = margin;
      let remaining = imgH;
      const pageContentH = pageH - margin * 2;

      // Multi-page support
      while (remaining > 0) {
        if (y !== margin) pdf.addPage();
        const sourceY = (imgH - remaining) / imgH * canvas.height;
        const sliceH = Math.min(pageContentH / contentW * canvas.width, canvas.height - sourceY);

        const sliceCanvas = document.createElement("canvas");
        sliceCanvas.width = canvas.width;
        sliceCanvas.height = sliceH;
        const ctx = sliceCanvas.getContext("2d")!;
        ctx.drawImage(canvas, 0, sourceY, canvas.width, sliceH, 0, 0, canvas.width, sliceH);

        const sliceImg = sliceCanvas.toDataURL("image/png");
        const sliceImgH = (sliceH / canvas.width) * contentW;
        pdf.addImage(sliceImg, "PNG", margin, margin, contentW, sliceImgH);
        remaining -= pageContentH;
        y = margin;
      }

      pdf.save(`fiche-branding-${new Date().toISOString().slice(0, 10)}.pdf`);
      toast.success("PDF téléchargé !");
    } catch {
      toast.error("Erreur lors de l'export PDF");
    } finally {
      setExporting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!data) return null;
  const { brand, persona, storytelling, proposition, strategy, offers, channels, igAudit, liAudit } = data;
  const today = new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });

  return (
    <div className="space-y-4">
      {/* Top bar */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <Button variant="ghost" size="sm" onClick={onClose} className="gap-1.5 text-muted-foreground">
          <ArrowLeft className="h-4 w-4" /> Retour
        </Button>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleCopy} className="gap-1.5 text-xs">
            <Copy className="h-3.5 w-3.5" /> Copier le texte
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportPdf} disabled={exporting} className="gap-1.5 text-xs">
            {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            Télécharger en PDF
          </Button>
          <Button variant="outline" size="sm" onClick={loadData} className="gap-1.5 text-xs">
            <RefreshCw className="h-3.5 w-3.5" /> Régénérer
          </Button>
        </div>
      </div>

      {/* Sheet content */}
      <div ref={sheetRef} className="bg-card border border-border rounded-2xl p-6 sm:p-8 space-y-2">
        <div className="text-center mb-6">
          <h2 className="font-display text-xl font-bold text-foreground">📋 Ma fiche branding</h2>
          <p className="text-xs text-muted-foreground mt-1">Générée le {today}</p>
        </div>

        {/* Positionnement */}
        <Section emoji="🎯" title="Positionnement">
          <Field label="Mission" value={brand?.mission} fallbackLink="/branding" />
          <Field label="Ce que je fais" value={brand?.offer} fallbackLink="/branding" />
          <Field label="Ma voix" value={brand?.voice_description} fallbackLink="/branding" />
        </Section>

        {/* Proposition de valeur */}
        <Section emoji="❤️" title="Proposition de valeur">
          <Field label="Ce que je fais" value={proposition?.step_1_what} fallbackLink="/branding/proposition" />
          <Field label="Ma méthode" value={proposition?.step_2a_process} fallbackLink="/branding/proposition" />
          <Field label="Mes valeurs" value={proposition?.step_2b_values} fallbackLink="/branding/proposition" />
          <Field label="Version finale" value={proposition?.version_final} fallbackLink="/branding/proposition" />
          <Field label="One-liner" value={proposition?.version_one_liner} fallbackLink="/branding/proposition" />
          <Field label="Pitch court" value={proposition?.version_short} fallbackLink="/branding/proposition" />
        </Section>

        {/* Ton */}
        <Section emoji="🎙️" title="Mon ton & mes combats">
          <Field label="Registre" value={brand?.tone_register} fallbackLink="/branding/ton" />
          <Field label="Style" value={brand?.tone_style} fallbackLink="/branding/ton" />
          <Field label="Niveau de proximité" value={brand?.tone_level} fallbackLink="/branding/ton" />
          <Field label="Expressions clés" value={brand?.key_expressions} fallbackLink="/branding/ton" />
          <Field label="À éviter" value={brand?.things_to_avoid} fallbackLink="/branding/ton" />
          <Field label="Ma cause" value={brand?.combat_cause} fallbackLink="/branding/ton" />
          <Field label="Mes combats" value={brand?.combat_fights} fallbackLink="/branding/ton" />
          <Field label="Ce que je refuse" value={brand?.combat_refusals} fallbackLink="/branding/ton" />
          <Field label="Mon alternative" value={brand?.combat_alternative} fallbackLink="/branding/ton" />
        </Section>

        {/* Cible */}
        <Section emoji="👤" title="Ma cible">
          <Field label="Portrait" value={persona?.portrait} fallbackLink="/branding/persona" />
          <Field label="Prénom fictif" value={persona?.portrait_prenom} fallbackLink="/branding/persona" />
          <Field label="Point de départ" value={persona?.starting_point} fallbackLink="/branding/persona" />
          <Field label="Frustrations" value={persona?.step_1_frustrations} fallbackLink="/branding/persona" />
          <Field label="Transformation souhaitée" value={persona?.step_2_transformation} fallbackLink="/branding/persona" />
          <Field label="Objections" value={persona?.step_3a_objections} fallbackLink="/branding/persona" />
          <Field label="Clichés à casser" value={persona?.step_3b_cliches} fallbackLink="/branding/persona" />
        </Section>

        {/* Histoire */}
        <Section emoji="📖" title="Mon histoire">
          {storytelling ? (
            <>
              <Field label="Titre" value={storytelling.title} />
              <Field label="L'histoire brute" value={storytelling.step_1_raw} fallbackLink="/branding/storytelling" />
              <Field label="Version polie" value={storytelling.step_7_polished} fallbackLink="/branding/storytelling" />
              <Field label="Pitch court" value={storytelling.pitch_short} fallbackLink="/branding/storytelling" />
            </>
          ) : (
            <Field label="Storytelling" value={null} fallbackLink="/branding/storytelling" fallbackLabel="Écrire mon histoire" />
          )}
        </Section>

        {/* Stratégie */}
        <Section emoji="🍒" title="Stratégie de contenu">
          <Field label="Pilier majeur" value={strategy?.pillar_major} fallbackLink="/branding/strategie" />
          <Field label="Pilier mineur 1" value={strategy?.pillar_minor_1} fallbackLink="/branding/strategie" />
          <Field label="Pilier mineur 2" value={strategy?.pillar_minor_2} fallbackLink="/branding/strategie" />
          <Field label="Pilier mineur 3" value={strategy?.pillar_minor_3} fallbackLink="/branding/strategie" />
          <Field label="Facette 1" value={strategy?.facet_1} fallbackLink="/branding/strategie" />
          <Field label="Facette 2" value={strategy?.facet_2} fallbackLink="/branding/strategie" />
          <Field label="Facette 3" value={strategy?.facet_3} fallbackLink="/branding/strategie" />
          <Field label="Twist créatif" value={strategy?.creative_concept} fallbackLink="/branding/strategie" />
        </Section>

        {/* Offres */}
        <Section emoji="🎁" title="Mes offres">
          {offers.length === 0 ? (
            <Field label="Offres" value={null} fallbackLink="/branding/offres" fallbackLabel="Créer une offre" />
          ) : (
            <div className="space-y-3">
              {offers.map((o) => (
                <div key={o.id} className="bg-muted/30 rounded-xl p-3 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm text-foreground">{o.name || "Sans nom"}</span>
                    {o.price_text && <span className="text-xs text-muted-foreground">— {o.price_text}</span>}
                  </div>
                  {o.description_short && <p className="text-xs text-muted-foreground">{o.description_short}</p>}
                  {o.problem_deep && <p className="text-xs text-muted-foreground">Problème profond : {o.problem_deep}</p>}
                  {o.promise && <p className="text-xs text-muted-foreground">Promesse : {o.promise}</p>}
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* Canaux */}
        <Section emoji="📱" title="Mes canaux actifs">
          {channels.length === 0 ? (
            <Field label="Canaux" value={null} fallbackLink="/mon-plan" fallbackLabel="Configurer mon plan" />
          ) : (
            <div className="flex flex-wrap gap-2 py-1">
              {channels.map((c) => (
                <span key={c} className="text-sm bg-muted rounded-full px-3 py-1">{channelLabels[c] || c}</span>
              ))}
            </div>
          )}
        </Section>

        {/* Audit Instagram */}
        {igAudit && (
          <Section emoji="📊" title="Audit Instagram">
            <Field label="Score global" value={igAudit.score_global ? `${igAudit.score_global}/100` : null} />
            <Field label="Score bio" value={igAudit.score_bio ? `${igAudit.score_bio}/100` : null} />
            <Field label="Score feed" value={igAudit.score_feed ? `${igAudit.score_feed}/100` : null} />
            <Field label="Score stories" value={igAudit.score_stories ? `${igAudit.score_stories}/100` : null} />
            <Field label="Résumé" value={igAudit.resume} />
            <Field label="Meilleur contenu" value={igAudit.best_content} />
            <Field label="À améliorer" value={igAudit.worst_content} />
          </Section>
        )}

        {/* Audit LinkedIn */}
        {liAudit && (
          <Section emoji="💼" title="Audit LinkedIn">
            <Field label="Score global" value={liAudit.score_global ? `${liAudit.score_global}/100` : null} />
            <Field label="Score profil" value={liAudit.score_profil ? `${liAudit.score_profil}/100` : null} />
            <Field label="Score contenu" value={liAudit.score_contenu ? `${liAudit.score_contenu}/100` : null} />
          </Section>
        )}
      </div>
    </div>
  );
}
