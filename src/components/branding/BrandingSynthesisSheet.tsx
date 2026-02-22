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

/* ── Helpers ── */

function EmptyField({ label, link, linkLabel }: { label: string; link?: string; linkLabel?: string }) {
  return (
    <div className="py-1.5 flex items-center gap-2">
      <span className="text-sm text-muted-foreground/50 italic">Non renseigné</span>
      {link && (
        <a href={link} className="text-xs text-primary hover:underline inline-flex items-center gap-0.5">
          {linkLabel || "Compléter"} <ExternalLink className="h-3 w-3" />
        </a>
      )}
    </div>
  );
}

function TextField({ label, value, link }: { label: string; value: string | null | undefined; link?: string }) {
  if (!value || value.trim() === "") return <EmptyField label={label} link={link} />;
  return (
    <div className="py-1.5">
      <span className="text-sm font-medium text-foreground">{label} : </span>
      <span className="text-sm text-muted-foreground whitespace-pre-line">{value}</span>
    </div>
  );
}

function QuoteList({ items, emoji = "💬" }: { items: string[]; emoji?: string }) {
  if (!items || items.length === 0) return null;
  return (
    <div className="space-y-2 py-1">
      {items.map((item, i) => (
        <p key={i} className="text-sm text-foreground flex items-start gap-2">
          <span className="shrink-0">{emoji}</span>
          <span className="italic">"{item}"</span>
        </p>
      ))}
    </div>
  );
}

function BulletList({ items, emoji = "•" }: { items: string[]; emoji?: string }) {
  if (!items || items.length === 0) return null;
  return (
    <ul className="space-y-1.5 py-1">
      {items.map((item, i) => (
        <li key={i} className="text-sm text-foreground flex items-start gap-2">
          <span className="shrink-0">{emoji}</span>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function TagList({ items }: { items: string[] }) {
  if (!items || items.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5 py-1">
      {items.map((t, i) => (
        <span key={i} className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-muted text-muted-foreground">{t}</span>
      ))}
    </div>
  );
}

function Section({ emoji, title, children }: { emoji: string; title: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <h3 className="font-display font-bold text-foreground text-base mb-3 flex items-center gap-2">
        <span>{emoji}</span> {title}
      </h3>
      <div className="border-t border-border pt-3 space-y-1">{children}</div>
    </div>
  );
}

function SubSection({ emoji, title, children }: { emoji: string; title: string; children: React.ReactNode }) {
  return (
    <div className="py-2">
      <p className="text-sm font-semibold text-foreground flex items-center gap-1.5 mb-1.5">
        <span>{emoji}</span> {title}
      </p>
      {children}
    </div>
  );
}

/* ── Parsers for JSON / mixed fields ── */

function parseStringList(value: any): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean).map(String);
  if (typeof value === "string") {
    // Try splitting by newlines, bullets, or numbered lists
    return value
      .split(/[\n•\-–—]/)
      .map((s: string) => s.replace(/^\d+[\.\)]\s*/, "").trim())
      .filter(Boolean);
  }
  return [];
}

/* ── Main component ── */

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

  /* ── Parse persona portrait ── */
  const portrait = persona?.portrait as any;

  /* ── Parse strategy recap ── */
  const stratRecap = strategy?.recap_summary as any;

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

        {/* ═══ POSITIONNEMENT ═══ */}
        <Section emoji="🎯" title="Positionnement">
          <TextField label="Mission" value={brand?.mission} link="/branding" />
          <TextField label="Ce que je fais" value={brand?.offer} link="/branding" />
          <TextField label="Ma voix" value={brand?.voice_description} link="/branding" />
        </Section>

        {/* ═══ PROPOSITION DE VALEUR ═══ */}
        <Section emoji="❤️" title="Proposition de valeur">
          <TextField label="Ce que je fais" value={proposition?.step_1_what} link="/branding/proposition" />
          <TextField label="Ma méthode" value={proposition?.step_2a_process} link="/branding/proposition" />
          <TextField label="Mes valeurs" value={proposition?.step_2b_values} link="/branding/proposition" />
          {proposition?.version_final && (
            <SubSection emoji="✨" title="Version finale">
              <p className="text-sm text-foreground italic">"{proposition.version_final}"</p>
            </SubSection>
          )}
          {proposition?.version_one_liner && (
            <SubSection emoji="💡" title="One-liner">
              <p className="text-sm text-foreground italic">"{proposition.version_one_liner}"</p>
            </SubSection>
          )}
          {proposition?.version_short && (
            <SubSection emoji="🎤" title="Pitch court">
              <p className="text-sm text-foreground italic">"{proposition.version_short}"</p>
            </SubSection>
          )}
          {!proposition && <EmptyField label="Proposition" link="/branding/proposition" />}
        </Section>

        {/* ═══ MON TON & MES COMBATS ═══ */}
        <Section emoji="🎙️" title="Mon ton & mes combats">
          <TextField label="Registre" value={brand?.tone_register} link="/branding/ton" />
          <TextField label="Style" value={brand?.tone_style} link="/branding/ton" />
          <TextField label="Niveau de proximité" value={brand?.tone_level} link="/branding/ton" />
          {brand?.key_expressions && (
            <SubSection emoji="💬" title="Mes expressions clés">
              <BulletList items={parseStringList(brand.key_expressions)} emoji="💬" />
            </SubSection>
          )}
          {brand?.things_to_avoid && (
            <SubSection emoji="⛔" title="Les mots à éviter">
              <BulletList items={parseStringList(brand.things_to_avoid)} emoji="❌" />
            </SubSection>
          )}
          {brand?.combat_cause && (
            <SubSection emoji="✊" title="Mon combat">
              <p className="text-sm text-foreground">{brand.combat_cause}</p>
            </SubSection>
          )}
          {brand?.combat_fights && (
            <SubSection emoji="🥊" title="Ce que je combats">
              <BulletList items={parseStringList(brand.combat_fights)} emoji="🚫" />
            </SubSection>
          )}
          {brand?.combat_refusals && (
            <SubSection emoji="🙅" title="Ce que je refuse">
              <BulletList items={parseStringList(brand.combat_refusals)} emoji="❌" />
            </SubSection>
          )}
          {brand?.combat_alternative && (
            <SubSection emoji="🌱" title="Mon alternative">
              <p className="text-sm text-foreground">{brand.combat_alternative}</p>
            </SubSection>
          )}
        </Section>

        {/* ═══ MA CIBLE ═══ */}
        <Section emoji="👤" title="Ma cible">
          {portrait ? (
            <>
              {/* Portrait header */}
              {(portrait.prenom || persona?.portrait_prenom) && (
                <p className="text-sm font-semibold text-foreground mb-2">
                  👋 {persona?.portrait_prenom || portrait.prenom}
                  {portrait.qui_elle_est?.age && `, ${portrait.qui_elle_est.age}`}
                </p>
              )}

              {/* Qui elle est */}
              {portrait.qui_elle_est && (
                <SubSection emoji="👤" title="Portrait">
                  {portrait.qui_elle_est.metier && <p className="text-sm text-foreground">💼 {portrait.qui_elle_est.metier}</p>}
                  {portrait.qui_elle_est.situation && <p className="text-sm text-foreground">📍 {portrait.qui_elle_est.situation}</p>}
                  {portrait.qui_elle_est.ca && <p className="text-sm text-foreground">💰 {portrait.qui_elle_est.ca}</p>}
                  {portrait.qui_elle_est.temps_com && <p className="text-sm text-foreground">⏰ {portrait.qui_elle_est.temps_com}</p>}
                </SubSection>
              )}

              {/* Ses mots */}
              {portrait.ses_mots?.length > 0 && (
                <SubSection emoji="💬" title="Ce qu'elle dit">
                  <QuoteList items={portrait.ses_mots} />
                </SubSection>
              )}

              {/* Blocages */}
              {portrait.blocages?.length > 0 && (
                <SubSection emoji="🚫" title="Ses blocages">
                  <BulletList items={portrait.blocages} emoji="🚫" />
                </SubSection>
              )}

              {/* Frustrations */}
              {portrait.frustrations?.length > 0 && (
                <SubSection emoji="😤" title="Ses frustrations">
                  <BulletList items={portrait.frustrations} emoji="😤" />
                </SubSection>
              )}

              {/* Objectifs */}
              {portrait.objectifs?.length > 0 && (
                <SubSection emoji="✨" title="Ce qu'elle veut">
                  <BulletList items={portrait.objectifs} emoji="✨" />
                </SubSection>
              )}

              {/* Comment lui parler */}
              {portrait.comment_parler && (
                <SubSection emoji="🗣️" title="Comment lui parler">
                  {portrait.comment_parler.ton && <p className="text-sm text-foreground">🎯 Ton : {portrait.comment_parler.ton}</p>}
                  {portrait.comment_parler.canal && <p className="text-sm text-foreground">📱 Canal : {portrait.comment_parler.canal}</p>}
                  {portrait.comment_parler.convainc && <p className="text-sm text-foreground">💡 Ce qui la convainc : {portrait.comment_parler.convainc}</p>}
                  {portrait.comment_parler.fuir?.length > 0 && (
                    <p className="text-sm text-foreground">❌ À fuir : {portrait.comment_parler.fuir.join(" · ")}</p>
                  )}
                </SubSection>
              )}

              {/* Phrase signature */}
              {portrait.phrase_signature && (
                <SubSection emoji="✍️" title="Sa phrase signature">
                  <p className="text-sm text-foreground italic">"{portrait.phrase_signature}"</p>
                </SubSection>
              )}
            </>
          ) : (
            <>
              {/* Fallback to raw persona fields */}
              <TextField label="Frustrations" value={persona?.step_1_frustrations} link="/branding/persona" />
              <TextField label="Transformation souhaitée" value={persona?.step_2_transformation} link="/branding/persona" />
              <TextField label="Objections" value={persona?.step_3a_objections} link="/branding/persona" />
              {!persona && <EmptyField label="Cible" link="/branding/persona" linkLabel="Définir ma cible" />}
            </>
          )}
        </Section>

        {/* ═══ MON HISTOIRE ═══ */}
        <Section emoji="📖" title="Mon histoire">
          {storytelling ? (
            <>
              {storytelling.title && <p className="text-sm font-semibold text-foreground mb-2">📌 {storytelling.title}</p>}
              {storytelling.pitch_short && (
                <SubSection emoji="🎤" title="Mon pitch">
                  <p className="text-sm text-foreground italic">"{storytelling.pitch_short}"</p>
                </SubSection>
              )}
              {(storytelling.step_7_polished || storytelling.step_6_full_story) && (
                <SubSection emoji="📝" title="Mon histoire complète">
                  <p className="text-sm text-muted-foreground whitespace-pre-line leading-relaxed">
                    {storytelling.step_7_polished || storytelling.step_6_full_story}
                  </p>
                </SubSection>
              )}
              {/* Storytelling recap summary */}
              {storytelling.recap_summary && (() => {
                const sr = storytelling.recap_summary as any;
                return (
                  <div className="mt-2 space-y-2">
                    {sr.before && <p className="text-sm text-foreground">🔵 <span className="font-medium">Avant :</span> {sr.before}</p>}
                    {sr.trigger && <p className="text-sm text-foreground">💥 <span className="font-medium">Déclic :</span> {sr.trigger}</p>}
                    {sr.after && <p className="text-sm text-foreground">🌱 <span className="font-medium">Après :</span> {sr.after}</p>}
                    {sr.values?.length > 0 && (
                      <SubSection emoji="❤️" title="Mes valeurs">
                        <TagList items={sr.values} />
                      </SubSection>
                    )}
                    {sr.unique?.length > 0 && (
                      <SubSection emoji="💪" title="Ce qui me rend unique">
                        <BulletList items={sr.unique} emoji="💪" />
                      </SubSection>
                    )}
                  </div>
                );
              })()}
            </>
          ) : (
            <EmptyField label="Storytelling" link="/branding/storytelling" linkLabel="Écrire mon histoire" />
          )}
        </Section>

        {/* ═══ STRATÉGIE ═══ */}
        <Section emoji="🍒" title="Stratégie de contenu">
          {strategy ? (
            <>
              {strategy.creative_concept && (
                <SubSection emoji="🎨" title="Mon concept créatif">
                  <p className="text-sm text-foreground italic">"{strategy.creative_concept}"</p>
                </SubSection>
              )}

              {/* Pillars from raw data */}
              {(strategy.pillar_major || strategy.pillar_minor_1) && (
                <SubSection emoji="📊" title="Mes piliers de contenu">
                  {strategy.pillar_major && (
                    <p className="text-sm text-foreground">🔥 <span className="font-medium">Pilier majeur :</span> {strategy.pillar_major}</p>
                  )}
                  {[strategy.pillar_minor_1, strategy.pillar_minor_2, strategy.pillar_minor_3].filter(Boolean).map((p: string, i: number) => (
                    <p key={i} className="text-sm text-foreground">🌱 <span className="font-medium">Pilier mineur :</span> {p}</p>
                  ))}
                </SubSection>
              )}

              {/* Facets */}
              {(strategy.facet_1 || strategy.facet_2 || strategy.facet_3) && (
                <SubSection emoji="🎭" title="Mes facettes">
                  <TagList items={[strategy.facet_1, strategy.facet_2, strategy.facet_3].filter(Boolean)} />
                </SubSection>
              )}

              {/* Content mix from recap */}
              {stratRecap?.content_mix && (
                <SubSection emoji="📈" title="Mon mix de contenu">
                  <div className="space-y-1">
                    <MixLine emoji="👁️" label="Visibilité" value={stratRecap.content_mix.visibility} />
                    <MixLine emoji="🤝" label="Confiance" value={stratRecap.content_mix.trust} />
                    <MixLine emoji="💰" label="Vente" value={stratRecap.content_mix.sales} />
                  </div>
                </SubSection>
              )}

              {stratRecap?.creative_gestures?.length > 0 && (
                <SubSection emoji="✨" title="Mes gestes créatifs">
                  <BulletList items={stratRecap.creative_gestures} emoji="✨" />
                </SubSection>
              )}
            </>
          ) : (
            <EmptyField label="Stratégie" link="/branding/strategie" linkLabel="Créer ma stratégie" />
          )}
        </Section>

        {/* ═══ MES OFFRES ═══ */}
        <Section emoji="🎁" title="Mes offres">
          {offers.length === 0 ? (
            <EmptyField label="Offres" link="/branding/offres" linkLabel="Créer une offre" />
          ) : (
            <div className="space-y-3">
              {offers.map((o) => (
                <div key={o.id} className="bg-muted/30 rounded-xl p-4 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm text-foreground">{o.name || "Sans nom"}</span>
                    {o.price_text && <span className="text-xs text-muted-foreground">— {o.price_text}</span>}
                  </div>
                  {o.description_short && <p className="text-sm text-muted-foreground">{o.description_short}</p>}
                  {o.problem_deep && (
                    <p className="text-sm text-muted-foreground">
                      <span className="font-medium">Problème résolu :</span> {o.problem_deep}
                    </p>
                  )}
                  {o.promise && (
                    <p className="text-sm text-muted-foreground">
                      <span className="font-medium">Promesse :</span> {o.promise}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* ═══ CANAUX ═══ */}
        <Section emoji="📱" title="Mes canaux actifs">
          {channels.length === 0 ? (
            <EmptyField label="Canaux" link="/mon-plan" linkLabel="Configurer mon plan" />
          ) : (
            <div className="flex flex-wrap gap-2 py-1">
              {channels.map((c) => (
                <span key={c} className="text-sm bg-muted rounded-full px-3 py-1">{channelLabels[c] || c}</span>
              ))}
            </div>
          )}
        </Section>

        {/* ═══ AUDIT INSTAGRAM ═══ */}
        {igAudit && (
          <Section emoji="📊" title="Audit Instagram">
            {igAudit.score_global != null && (
              <div className="flex items-center gap-3 mb-2">
                <span className="text-2xl font-bold text-foreground">{igAudit.score_global}</span>
                <span className="text-sm text-muted-foreground">/100</span>
                <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${igAudit.score_global}%` }} />
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
              {[
                { label: "Bio", value: igAudit.score_bio },
                { label: "Feed", value: igAudit.score_feed },
                { label: "Stories", value: igAudit.score_stories },
                { label: "Édito", value: igAudit.score_edito },
              ].filter(s => s.value != null).map((s) => (
                <div key={s.label} className="bg-muted/40 rounded-lg p-2 text-center">
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                  <p className="text-sm font-bold text-foreground">{s.value}/100</p>
                </div>
              ))}
            </div>
            {igAudit.resume && <TextField label="Résumé" value={igAudit.resume} />}
            {igAudit.best_content && <TextField label="Points forts" value={igAudit.best_content} />}
            {igAudit.worst_content && <TextField label="À améliorer" value={igAudit.worst_content} />}
          </Section>
        )}

        {/* ═══ AUDIT LINKEDIN ═══ */}
        {liAudit && (
          <Section emoji="💼" title="Audit LinkedIn">
            {liAudit.score_global != null && (
              <div className="flex items-center gap-3 mb-2">
                <span className="text-2xl font-bold text-foreground">{liAudit.score_global}</span>
                <span className="text-sm text-muted-foreground">/100</span>
                <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${liAudit.score_global}%` }} />
                </div>
              </div>
            )}
            {liAudit.score_profil != null && <TextField label="Score profil" value={`${liAudit.score_profil}/100`} />}
            {liAudit.score_contenu != null && <TextField label="Score contenu" value={`${liAudit.score_contenu}/100`} />}
          </Section>
        )}
      </div>
    </div>
  );
}

/* ── Small helpers ── */

function MixLine({ emoji, label, value }: { emoji: string; label: string; value: number }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span>{emoji}</span>
      <span className="text-muted-foreground w-20">{label}</span>
      <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
        <div className="h-full rounded-full bg-primary" style={{ width: `${(value / 10) * 100}%` }} />
      </div>
      <span className="text-xs text-muted-foreground w-10 text-right">{value}/10</span>
    </div>
  );
}
