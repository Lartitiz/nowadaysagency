import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Download, Copy, RefreshCw, ExternalLink, Loader2, Pencil } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { calculateBrandingCompletion, fetchBrandingData } from "@/lib/branding-completion";

interface SynthesisData {
  brand: any;
  persona: any;
  storytelling: any;
  proposition: any;
  strategy: any;
  offers: any[];
  channels: string[];
  planConfig: any;
  brandingAudit: any;
  completion: number;
  completionDetail: any;
}

/* ── Helpers ── */

function parseStringList(value: any): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean).map(String);
  if (typeof value === "string") {
    return value
      .split(/[\n•\-–—]/)
      .map((s: string) => s.replace(/^\d+[\.\)]\s*/, "").trim())
      .filter(Boolean);
  }
  return [];
}

function safeParseJson(val: any): any {
  if (!val) return null;
  if (typeof val === "object") return val;
  try { return JSON.parse(val); } catch { return null; }
}

/* ── Empty state card ── */
function EmptySection({ message, linkLabel, link }: { message: string; linkLabel: string; link: string }) {
  const navigate = useNavigate();
  return (
    <div
      className="rounded-xl border-2 border-dashed border-border bg-muted/20 p-6 text-center cursor-pointer hover:border-primary/30 hover:bg-muted/40 transition-colors"
      onClick={() => navigate(link)}
    >
      <p className="text-sm text-muted-foreground mb-2">{message}</p>
      <span className="text-sm font-medium text-primary inline-flex items-center gap-1">
        {linkLabel} <ExternalLink className="h-3.5 w-3.5" />
      </span>
    </div>
  );
}

/* ── Section separator ── */
function SectionSep() {
  return <div className="border-t border-border my-8" />;
}

/* ── Section title ── */
function SectionTitle({ emoji, title }: { emoji: string; title: string }) {
  return (
    <h3 className="font-display text-base font-bold text-foreground mb-4 flex items-center gap-2 uppercase tracking-wide">
      <span>{emoji}</span> {title}
    </h3>
  );
}

/* ── Tag list ── */
function Tags({ items }: { items: string[] }) {
  if (!items || items.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((t, i) => (
        <Badge key={i} variant="secondary" className="bg-rose-pale text-primary border-0 text-xs font-medium px-3 py-1">
          {t}
        </Badge>
      ))}
    </div>
  );
}

/* ── Main component ── */

export default function BrandingSynthesisSheet({ onClose }: { onClose: () => void }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState<SynthesisData | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);

  const loadData = async () => {
    if (!user) return;
    setLoading(true);
    const uid = user.id;

    const [brandRes, personaRes, storyRes, propRes, stratRes, offersRes, configRes, auditRes, brandingRaw] = await Promise.all([
      supabase.from("brand_profile").select("*").eq("user_id", uid).maybeSingle(),
      supabase.from("persona").select("*").eq("user_id", uid).maybeSingle(),
      supabase.from("storytelling").select("*").eq("user_id", uid).eq("is_primary", true).maybeSingle(),
      supabase.from("brand_proposition").select("*").eq("user_id", uid).maybeSingle(),
      supabase.from("brand_strategy").select("*").eq("user_id", uid).maybeSingle(),
      supabase.from("offers").select("*").eq("user_id", uid).order("created_at"),
      supabase.from("user_plan_config").select("*").eq("user_id", uid).maybeSingle(),
      supabase.from("branding_audits").select("*").eq("user_id", uid).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      fetchBrandingData(uid),
    ]);

    const completion = calculateBrandingCompletion(brandingRaw);

    setData({
      brand: brandRes.data,
      persona: personaRes.data,
      storytelling: storyRes.data,
      proposition: propRes.data,
      strategy: stratRes.data,
      offers: offersRes.data || [],
      channels: (configRes.data?.channels as string[]) || [],
      planConfig: configRes.data,
      brandingAudit: auditRes.data,
      completion: completion.total,
      completionDetail: completion,
    });
    setLoading(false);
  };

  useEffect(() => { loadData(); }, [user?.id]);

  const handleCopy = () => {
    if (!sheetRef.current) return;
    navigator.clipboard.writeText(sheetRef.current.innerText);
    toast.success("Fiche copiée !");
  };

  const handleExportPdf = async () => {
    if (!sheetRef.current) return;
    setExporting(true);
    try {
      const canvas = await html2canvas(sheetRef.current, { scale: 2, backgroundColor: "#ffffff", useCORS: true });
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const margin = 10;
      const contentW = pageW - margin * 2;
      const imgH = (canvas.height / canvas.width) * contentW;
      let remaining = imgH;
      const pageContentH = pageH - margin * 2;
      let isFirst = true;

      while (remaining > 0) {
        if (!isFirst) pdf.addPage();
        isFirst = false;
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
      }

      pdf.save(`synthese-branding-${new Date().toISOString().slice(0, 10)}.pdf`);
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
  const { brand, persona, storytelling, proposition, strategy, offers, channels, planConfig, brandingAudit, completion, completionDetail } = data;
  const today = new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });

  const portrait = safeParseJson(persona?.portrait);

  const allChannels = [
    { id: "instagram", label: "Instagram", emoji: "📱" },
    { id: "linkedin", label: "LinkedIn", emoji: "💼" },
    { id: "newsletter", label: "Newsletter", emoji: "📧" },
    { id: "pinterest", label: "Pinterest", emoji: "📌" },
    { id: "site", label: "Site web", emoji: "🌐" },
    { id: "seo", label: "SEO", emoji: "🔍" },
  ];

  const missingParts: string[] = [];
  if (completionDetail.storytelling === 0) missingParts.push("ton histoire");
  if (completionDetail.persona === 0) missingParts.push("ta cible");
  if (completionDetail.proposition === 0) missingParts.push("ta proposition de valeur");
  if (completionDetail.tone === 0) missingParts.push("ton ton & tes combats");
  if (completionDetail.strategy === 0) missingParts.push("ta ligne éditoriale");

  return (
    <div className="space-y-4">
      {/* Top bar */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <Button variant="ghost" size="sm" onClick={onClose} className="gap-1.5 text-muted-foreground">
          <ArrowLeft className="h-4 w-4" /> Retour
        </Button>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleCopy} className="gap-1.5 text-xs">
            <Copy className="h-3.5 w-3.5" /> Copier
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportPdf} disabled={exporting} className="gap-1.5 text-xs">
            {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            PDF
          </Button>
          <Button variant="outline" size="sm" onClick={loadData} className="gap-1.5 text-xs">
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Sheet content */}
      <div ref={sheetRef} className="bg-card border border-border rounded-2xl p-6 sm:p-10 space-y-0">

        {/* ═══ HEADER ═══ */}
        <div className="mb-8">
          <h2 className="font-display text-xl sm:text-2xl font-bold text-foreground">✨ Ma stratégie de communication</h2>
          <p className="text-xs text-muted-foreground mt-1">Dernière mise à jour : {today}</p>

          <div className="mt-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-foreground">Ta stratégie est complète à {completion}%</span>
            </div>
            <Progress value={completion} className="h-3" />
            {missingParts.length > 0 && (
              <p className="text-xs text-muted-foreground">
                Il te manque : {missingParts.join(", ")}.
              </p>
            )}
          </div>
        </div>

        {/* ═══ POSITIONNEMENT ═══ */}
        <SectionSep />
        <SectionTitle emoji="🎯" title="Mon positionnement" />

        {proposition?.version_final || proposition?.version_one_liner || brand?.mission ? (
          <>
            {/* Hero positioning card */}
            {(proposition?.version_final || proposition?.version_one_liner) && (
              <div className="rounded-xl bg-rose-pale border border-rose-soft p-5 sm:p-6 mb-4">
                <p className="text-base sm:text-lg font-display font-bold text-foreground leading-relaxed italic">
                  "{proposition.version_final || proposition.version_one_liner}"
                </p>
              </div>
            )}

            {brand?.mission && (
              <div className="mb-3">
                <p className="text-sm font-semibold text-foreground mb-1">Ma mission</p>
                <p className="text-sm text-muted-foreground">{brand.mission}</p>
              </div>
            )}

            {proposition?.step_2b_values && (
              <div className="mb-3">
                <p className="text-sm font-semibold text-foreground mb-1">Ce qui me rend unique</p>
                <p className="text-sm text-muted-foreground">{proposition.step_2b_values}</p>
              </div>
            )}

            {brand?.voice_description && (
              <div className="mb-3">
                <p className="text-sm font-semibold text-foreground mb-1">Mes valeurs</p>
                <Tags items={parseStringList(brand.voice_description)} />
              </div>
            )}
          </>
        ) : (
          <EmptySection
            message="Tu n'as pas encore défini ton positionnement."
            linkLabel="Définir mon positionnement →"
            link="/branding/proposition"
          />
        )}

        {/* ═══ MA CIBLE ═══ */}
        <SectionSep />
        <SectionTitle emoji="👤" title="Ma cible" />

        {portrait ? (
          <div className="space-y-4">
            {/* Portrait header */}
            <div>
              <p className="text-base font-semibold text-foreground">
                {persona?.portrait_prenom || portrait.prenom || "Ma cliente idéale"}
                {portrait.qui_elle_est?.age && `, ${portrait.qui_elle_est.age}`}
              </p>
              {portrait.qui_elle_est?.metier && (
                <p className="text-sm text-muted-foreground">{portrait.qui_elle_est.metier}</p>
              )}
              {portrait.qui_elle_est?.situation && (
                <p className="text-sm text-muted-foreground">{portrait.qui_elle_est.situation}</p>
              )}
              {portrait.qui_elle_est?.ca && (
                <p className="text-sm text-muted-foreground">CA : {portrait.qui_elle_est.ca}</p>
              )}
            </div>

            {/* Desires */}
            {portrait.objectifs?.length > 0 && (
              <div>
                <p className="text-sm font-semibold text-foreground mb-1.5">Ce qu'elle veut</p>
                <ul className="space-y-1">
                  {portrait.objectifs.map((o: string, i: number) => (
                    <li key={i} className="text-sm text-foreground flex items-start gap-2">
                      <span className="shrink-0">✨</span> {o}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Main blocker */}
            {portrait.blocages?.length > 0 && (
              <div>
                <p className="text-sm font-semibold text-foreground mb-1.5">Son blocage principal</p>
                <p className="text-sm text-muted-foreground italic">"{portrait.blocages[0]}"</p>
              </div>
            )}

            {/* Signature phrase */}
            {portrait.ses_mots?.length > 0 && (
              <div>
                <p className="text-sm font-semibold text-foreground mb-1.5">Sa phrase signature</p>
                <p className="text-sm text-foreground italic flex items-start gap-2">
                  <span className="shrink-0">💬</span>
                  "{portrait.ses_mots[0]}"
                </p>
              </div>
            )}
          </div>
        ) : persona ? (
          <div className="space-y-3">
            {persona.step_1_frustrations && (
              <div>
                <p className="text-sm font-semibold text-foreground mb-1">Ses frustrations</p>
                <p className="text-sm text-muted-foreground">{persona.step_1_frustrations}</p>
              </div>
            )}
            {persona.step_2_transformation && (
              <div>
                <p className="text-sm font-semibold text-foreground mb-1">Sa transformation souhaitée</p>
                <p className="text-sm text-muted-foreground">{persona.step_2_transformation}</p>
              </div>
            )}
            <p className="text-xs text-muted-foreground">Certaines infos manquent. <span className="text-primary cursor-pointer" onClick={() => navigate("/branding/persona")}>Compléter →</span></p>
          </div>
        ) : (
          <EmptySection
            message="Tu n'as pas encore défini ta cible."
            linkLabel="Définir ma cible →"
            link="/branding/persona"
          />
        )}

        {/* ═══ MON TON ═══ */}
        <SectionSep />
        <SectionTitle emoji="🗣️" title="Mon ton" />

        {brand && (brand.tone_register || brand.tone_style || brand.combat_cause) ? (
          <div className="space-y-4">
            {/* Tone tags */}
            <Tags items={[brand.tone_register, brand.tone_style, brand.tone_level, brand.tone_humor, brand.tone_engagement].filter(Boolean)} />

            {/* Voice description */}
            {brand.voice_description && (
              <div>
                <p className="text-sm font-semibold text-foreground mb-1">Comment je parle à ma cible</p>
                <p className="text-sm text-muted-foreground italic">"{brand.voice_description}"</p>
              </div>
            )}

            {/* Things to avoid */}
            {brand.things_to_avoid && (
              <div>
                <p className="text-sm font-semibold text-foreground mb-1">Ce que je fuis</p>
                <div className="flex flex-wrap gap-2">
                  {parseStringList(brand.things_to_avoid).map((item, i) => (
                    <span key={i} className="text-xs bg-muted text-muted-foreground rounded-full px-3 py-1 flex items-center gap-1">
                      ❌ {item}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <EmptySection
            message="Tu n'as pas encore défini ton ton et tes combats."
            linkLabel="Définir mon ton →"
            link="/branding/ton"
          />
        )}

        {/* ═══ MON HISTOIRE ═══ */}
        <SectionSep />
        <SectionTitle emoji="📖" title="Mon histoire" />

        {storytelling ? (
          <div className="space-y-3">
            {storytelling.pitch_short && (
              <p className="text-sm text-foreground leading-relaxed">{storytelling.pitch_short}</p>
            )}
            {!storytelling.pitch_short && (storytelling.step_7_polished || storytelling.step_6_full_story) && (
              <p className="text-sm text-muted-foreground leading-relaxed line-clamp-4">
                {(storytelling.step_7_polished || storytelling.step_6_full_story).substring(0, 300)}…
              </p>
            )}
            {storytelling.recap_summary && (() => {
              const sr = storytelling.recap_summary as any;
              return (
                <div className="space-y-1.5">
                  {sr.before && <p className="text-sm text-foreground">🔵 <span className="font-medium">Avant :</span> {sr.before}</p>}
                  {sr.trigger && <p className="text-sm text-foreground">💥 <span className="font-medium">Déclic :</span> {sr.trigger}</p>}
                  {sr.after && <p className="text-sm text-foreground">🌱 <span className="font-medium">Après :</span> {sr.after}</p>}
                </div>
              );
            })()}
          </div>
        ) : (
          <EmptySection
            message="Tu n'as pas encore écrit ton histoire."
            linkLabel="Écrire mon histoire →"
            link="/branding/storytelling"
          />
        )}

        {/* ═══ MES OFFRES ═══ */}
        <SectionSep />
        <SectionTitle emoji="🎁" title="Mes offres" />

        {offers.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {offers.map((o) => (
              <div key={o.id} className="rounded-xl border border-border bg-muted/20 p-4 space-y-1.5">
                <div className="flex items-center gap-2">
                  <span>🎁</span>
                  <span className="font-semibold text-sm text-foreground">{o.name || "Sans nom"}</span>
                </div>
                {o.price_text && <p className="text-xs text-muted-foreground">{o.price_text}</p>}
                {o.description_short && <p className="text-sm text-muted-foreground">{o.description_short}</p>}
                {o.promise && <p className="text-sm text-muted-foreground italic">"{o.promise}"</p>}
              </div>
            ))}
          </div>
        ) : (
          <EmptySection
            message="Tu n'as pas encore défini tes offres."
            linkLabel="Créer mes offres →"
            link="/branding/offres"
          />
        )}

        {/* ═══ MA LIGNE ÉDITORIALE ═══ */}
        <SectionSep />
        <SectionTitle emoji="📝" title="Ma ligne éditoriale" />

        {strategy ? (
          <div className="space-y-4">
            {/* Pillars */}
            {(strategy.pillar_major || strategy.pillar_minor_1) && (
              <div>
                <p className="text-sm font-semibold text-foreground mb-1.5">Mes piliers de contenu</p>
                <Tags items={[strategy.pillar_major, strategy.pillar_minor_1, strategy.pillar_minor_2, strategy.pillar_minor_3].filter(Boolean)} />
              </div>
            )}

            {/* Content mix from recap */}
            {strategy.recap_summary && (() => {
              const recap = strategy.recap_summary as any;
              if (!recap?.content_mix) return null;
              const mix = recap.content_mix;
              return (
                <div>
                  <p className="text-sm font-semibold text-foreground mb-2">Mon mix contenu</p>
                  <div className="flex items-center gap-3 flex-wrap">
                    {mix.visibility != null && (
                      <span className="text-xs flex items-center gap-1.5">
                        <span className="h-2.5 w-2.5 rounded-full bg-[hsl(var(--obj-visibilite))]" />
                        Visibilité {Math.round((mix.visibility / 10) * 100)}%
                      </span>
                    )}
                    {mix.trust != null && (
                      <span className="text-xs flex items-center gap-1.5">
                        <span className="h-2.5 w-2.5 rounded-full bg-[hsl(var(--obj-confiance))]" />
                        Confiance {Math.round((mix.trust / 10) * 100)}%
                      </span>
                    )}
                    {mix.sales != null && (
                      <span className="text-xs flex items-center gap-1.5">
                        <span className="h-2.5 w-2.5 rounded-full bg-[hsl(var(--obj-vente))]" />
                        Vente {Math.round((mix.sales / 10) * 100)}%
                      </span>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* Creative concept */}
            {strategy.creative_concept && (
              <div>
                <p className="text-sm font-semibold text-foreground mb-1">Mon twist créatif</p>
                <p className="text-sm text-muted-foreground italic">"{strategy.creative_concept}"</p>
              </div>
            )}
          </div>
        ) : (
          <EmptySection
            message="Tu n'as pas encore défini ta ligne éditoriale."
            linkLabel="Créer ma ligne →"
            link="/branding/strategie"
          />
        )}

        {/* ═══ MES CANAUX ═══ */}
        <SectionSep />
        <SectionTitle emoji="📱" title="Mes canaux" />

        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {allChannels.map((ch) => {
              const active = channels.includes(ch.id);
              return (
                <span
                  key={ch.id}
                  className={`text-sm px-3 py-1.5 rounded-full ${
                    active
                      ? "bg-rose-pale text-foreground font-medium"
                      : "bg-muted/40 text-muted-foreground/50"
                  }`}
                >
                  {active ? "✅" : "🔜"} {ch.label}
                </span>
              );
            })}
          </div>

          {planConfig && (
            <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
              {planConfig.daily_time && (
                <span>⏰ Temps dispo : {planConfig.daily_time < 60 ? `${planConfig.daily_time} min/jour` : `${Math.round(planConfig.daily_time / 60)}h/semaine`}</span>
              )}
              {planConfig.monthly_goal && (
                <span>🎯 Objectif : {planConfig.monthly_goal}</span>
              )}
            </div>
          )}
        </div>

        {/* ═══ MON DERNIER AUDIT ═══ */}
        <SectionSep />
        <SectionTitle emoji="🔍" title="Mon dernier audit" />

        {brandingAudit ? (
          <div className="space-y-3">
            {brandingAudit.score_global != null && (
              <div>
                <div className="flex items-baseline gap-2 mb-2">
                  <span className="text-2xl font-bold text-foreground">{brandingAudit.score_global}</span>
                  <span className="text-sm text-muted-foreground">/100</span>
                </div>
                <Progress
                  value={brandingAudit.score_global}
                  className={`h-3 ${
                    brandingAudit.score_global >= 75 ? "[&>div]:bg-[hsl(var(--obj-vente))]" :
                    brandingAudit.score_global >= 50 ? "[&>div]:bg-[hsl(var(--obj-confiance))]" :
                    "[&>div]:bg-destructive"
                  }`}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {new Date(brandingAudit.created_at).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}
                </p>
              </div>
            )}

            {brandingAudit.plan_action && (() => {
              const actions = Array.isArray(brandingAudit.plan_action) ? brandingAudit.plan_action.slice(0, 3) : [];
              if (actions.length === 0) return null;
              return (
                <div>
                  <p className="text-sm font-semibold text-foreground mb-1.5">Top recommandations :</p>
                  <ol className="space-y-1">
                    {actions.map((a: any, i: number) => (
                      <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                        <span className="font-semibold text-foreground shrink-0">{i + 1}.</span>
                        <span>{a.action || a}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              );
            })()}

            <button
              onClick={() => navigate("/branding/audit")}
              className="text-sm text-primary font-medium hover:underline inline-flex items-center gap-1"
            >
              Voir l'audit complet <ExternalLink className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <EmptySection
            message="Tu n'as pas encore fait ton audit."
            linkLabel="Lancer un audit →"
            link="/branding/audit"
          />
        )}

        {/* ═══ FOOTER ACTIONS ═══ */}
        <SectionSep />
        <div className="flex flex-col sm:flex-row items-center gap-3 justify-center pt-2">
          <Button variant="outline" size="sm" className="gap-2 text-sm" onClick={() => { onClose(); navigate("/branding"); }}>
            <Pencil className="h-3.5 w-3.5" /> Modifier le branding
          </Button>
        </div>
      </div>
    </div>
  );
}
