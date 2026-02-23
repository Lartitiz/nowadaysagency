import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Download, Copy, RefreshCw, ExternalLink, Loader2, Pencil, ChevronDown, ChevronUp } from "lucide-react";
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

/* ── Smart text formatting ── */

interface FormattedBlock {
  type: "paragraph" | "heading" | "numbered-item" | "quote";
  title?: string;
  body?: string;
  number?: number;
  text: string;
}

function formatSmartText(raw: string): FormattedBlock[] {
  if (!raw) return [];
  const blocks: FormattedBlock[] = [];
  // Split by numbered items like "1." "2." etc.
  const numberedPattern = /(?:^|\n)\s*(\d+)\.\s*/;
  const hasNumbered = numberedPattern.test(raw);

  if (hasNumbered) {
    // Split on numbered items
    const parts = raw.split(/(?:^|\n)\s*\d+\.\s*/);
    const numbers = raw.match(/(?:^|\n)\s*(\d+)\.\s*/g);
    // Text before first number
    const preamble = parts[0]?.trim();
    if (preamble) {
      blocks.push({ type: "paragraph", text: preamble });
    }
    for (let i = 1; i < parts.length; i++) {
      const content = parts[i]?.trim();
      if (!content) continue;
      const num = numbers?.[i - 1]?.trim().replace(".", "") || String(i);
      // First sentence = title, rest = body
      const firstLine = content.split(/\n/)[0];
      const rest = content.substring(firstLine.length).trim();
      blocks.push({
        type: "numbered-item",
        number: parseInt(num),
        title: firstLine,
        body: rest || undefined,
        text: content,
      });
    }
    return blocks;
  }

  // Detect uppercase headings (lines that are ALL CAPS, min 4 chars)
  const lines = raw.split("\n");
  let currentParagraph: string[] = [];

  const flushParagraph = () => {
    const text = currentParagraph.join("\n").trim();
    if (text) {
      blocks.push({ type: "paragraph", text });
    }
    currentParagraph = [];
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      flushParagraph();
      continue;
    }
    // Detect uppercase headings
    if (trimmed.length >= 4 && trimmed === trimmed.toUpperCase() && /[A-ZÀ-Ÿ]/.test(trimmed)) {
      flushParagraph();
      // Convert to title case
      const titleCase = trimmed.charAt(0) + trimmed.slice(1).toLowerCase();
      blocks.push({ type: "heading", text: titleCase });
    } else {
      currentParagraph.push(trimmed);
    }
  }
  flushParagraph();

  return blocks;
}

const numberEmojis = ["0️⃣", "1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣"];

function SmartFormattedText({ blocks }: { blocks: FormattedBlock[] }) {
  return (
    <div className="space-y-3">
      {blocks.map((block, i) => {
        if (block.type === "heading") {
          return (
            <p key={i} className="text-sm font-bold text-foreground mt-4 mb-1">
              {block.text}
            </p>
          );
        }
        if (block.type === "numbered-item") {
          const emoji = block.number != null && block.number >= 0 && block.number <= 9 ? numberEmojis[block.number] : `${block.number}.`;
          return (
            <div key={i} className="flex items-start gap-2.5">
              <span className="shrink-0 text-sm">{emoji}</span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">{block.title}</p>
                {block.body && (
                  <p className="text-sm text-muted-foreground mt-0.5 break-words overflow-wrap-anywhere">{block.body}</p>
                )}
              </div>
            </div>
          );
        }
        // paragraph
        return (
          <p key={i} className="text-sm text-muted-foreground leading-relaxed break-words overflow-wrap-anywhere">
            {block.text}
          </p>
        );
      })}
    </div>
  );
}

/* ── Collapsible long text ── */
function CollapsibleText({ text, label, maxChars = 200, isQuote }: { text: string; label?: string; maxChars?: number; isQuote?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = text.length > maxChars;
  const blocks = formatSmartText(text);
  const hasStructure = blocks.some(b => b.type === "numbered-item" || b.type === "heading");

  // For short text or structured text that fits, show directly
  if (!isLong && !hasStructure) {
    return (
      <div className="break-words overflow-wrap-anywhere">
        {isQuote ? (
          <div className="rounded-lg bg-muted/30 border-l-2 border-primary/30 px-4 py-3">
            <p className="text-sm text-foreground italic leading-relaxed">"{text}"</p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground leading-relaxed">{text}</p>
        )}
      </div>
    );
  }

  // Structured or long: show with collapsible
  const previewBlocks = expanded ? blocks : blocks.slice(0, hasStructure ? 3 : 1);

  return (
    <div className="break-words overflow-wrap-anywhere">
      {isQuote && !hasStructure ? (
        <div className="rounded-lg bg-muted/30 border-l-2 border-primary/30 px-4 py-3">
          <p className="text-sm text-foreground italic leading-relaxed">
            {expanded ? `"${text}"` : `"${text.substring(0, maxChars)}…"`}
          </p>
        </div>
      ) : (
        <SmartFormattedText blocks={previewBlocks} />
      )}
      {(isLong || (hasStructure && blocks.length > 3)) && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-2 text-xs text-primary font-medium hover:underline inline-flex items-center gap-1"
        >
          {expanded ? (
            <>Réduire <ChevronUp className="h-3 w-3" /></>
          ) : (
            <>Lire la suite <ChevronDown className="h-3 w-3" /></>
          )}
        </button>
      )}
    </div>
  );
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

/* ── Level 2 section card (Cible, Ton, Offres) ── */
function SectionCard({ emoji, title, children }: { emoji: string; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card shadow-sm p-5 sm:p-6 space-y-6">
      <h3 className="font-display text-base font-bold text-foreground flex items-center gap-2 uppercase tracking-wide">
        <span>{emoji}</span> {title}
      </h3>
      {children}
    </div>
  );
}

/* ── Level 3 section (no card, just separator) ── */
function SectionLight({ emoji, title, children }: { emoji: string; title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <h3 className="font-display text-sm font-bold text-muted-foreground flex items-center gap-2 uppercase tracking-wide">
        <span>{emoji}</span> {title}
      </h3>
      {children}
    </div>
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
    <div className="space-y-4 max-w-full overflow-x-hidden">
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
      <div ref={sheetRef} className="bg-card border border-border rounded-2xl p-4 sm:p-8 md:p-10 space-y-0 max-w-full overflow-hidden" style={{ wordBreak: "break-word", overflowWrap: "anywhere" }}>

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

        {/* ═══ LEVEL 1 — POSITIONNEMENT (hero card) ═══ */}
        <SectionSep />
        <h3 className="font-display text-base font-bold text-foreground flex items-center gap-2 uppercase tracking-wide mb-4">
          <span>🎯</span> Mon positionnement
        </h3>

        {proposition?.version_final || proposition?.version_one_liner || brand?.mission ? (
          <div className="space-y-4">
            {/* Hero positioning card — Level 1 emphasis */}
            {(proposition?.version_final || proposition?.version_one_liner) && (
              <div className="rounded-xl bg-rose-pale border border-rose-soft p-5 sm:p-6">
                <p className="text-lg sm:text-xl font-display font-bold text-foreground leading-relaxed italic text-center">
                  "{proposition.version_final || proposition.version_one_liner}"
                </p>
              </div>
            )}

            {brand?.mission && (
              <div>
                <p className="text-sm font-semibold text-foreground mb-1">Ma mission</p>
                <CollapsibleText text={brand.mission} />
              </div>
            )}

            {proposition?.step_2b_values && (
              <div>
                <p className="text-sm font-semibold text-foreground mb-1">Ce qui me rend unique</p>
                <CollapsibleText text={proposition.step_2b_values} />
              </div>
            )}

            {brand?.voice_description && (
              <div>
                <p className="text-sm font-semibold text-foreground mb-1">Mes valeurs</p>
                <Tags items={parseStringList(brand.voice_description)} />
              </div>
            )}
          </div>
        ) : (
          <EmptySection
            message="Tu n'as pas encore défini ton positionnement."
            linkLabel="Définir mon positionnement →"
            link="/branding/proposition"
          />
        )}

        {/* ═══ LEVEL 2 — MA CIBLE (card) ═══ */}
        <SectionSep />

        {portrait ? (
          <SectionCard emoji="👤" title="Ma cible">
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
                      <span className="shrink-0">✨</span> <span className="break-words">{o}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Main blocker */}
            {portrait.blocages?.length > 0 && (
              <div>
                <p className="text-sm font-semibold text-foreground mb-1.5">Son blocage principal</p>
                <div className="rounded-lg bg-muted/30 border-l-2 border-primary/30 px-4 py-3">
                  <p className="text-sm text-foreground italic break-words">"{portrait.blocages[0]}"</p>
                </div>
              </div>
            )}

            {/* Signature phrase */}
            {portrait.ses_mots?.length > 0 && (
              <div>
                <p className="text-sm font-semibold text-foreground mb-1.5">Sa phrase signature</p>
                <div className="rounded-lg bg-muted/30 border-l-2 border-primary/30 px-4 py-3">
                  <p className="text-sm text-foreground italic flex items-start gap-2 break-words">
                    <span className="shrink-0">💬</span>
                    "{portrait.ses_mots[0]}"
                  </p>
                </div>
              </div>
            )}
          </SectionCard>
        ) : persona ? (
          <SectionCard emoji="👤" title="Ma cible">
            {persona.step_1_frustrations && (
              <div>
                <p className="text-sm font-semibold text-foreground mb-1">Ses frustrations</p>
                <CollapsibleText text={persona.step_1_frustrations} />
              </div>
            )}
            {persona.step_2_transformation && (
              <div>
                <p className="text-sm font-semibold text-foreground mb-1">Sa transformation souhaitée</p>
                <CollapsibleText text={persona.step_2_transformation} />
              </div>
            )}
            <p className="text-xs text-muted-foreground">Certaines infos manquent. <span className="text-primary cursor-pointer" onClick={() => navigate("/branding/persona")}>Compléter →</span></p>
          </SectionCard>
        ) : (
          <>
            <h3 className="font-display text-base font-bold text-foreground flex items-center gap-2 uppercase tracking-wide mb-4">
              <span>👤</span> Ma cible
            </h3>
            <EmptySection
              message="Tu n'as pas encore défini ta cible."
              linkLabel="Définir ma cible →"
              link="/branding/persona"
            />
          </>
        )}

        {/* ═══ LEVEL 2 — MON TON (card) ═══ */}
        <SectionSep />

        {brand && (brand.tone_register || brand.tone_style || brand.combat_cause) ? (
          <SectionCard emoji="🗣️" title="Mon ton">
            {/* Tone tags */}
            <Tags items={[brand.tone_register, brand.tone_style, brand.tone_level, brand.tone_humor, brand.tone_engagement].filter(Boolean)} />

            {/* Voice description */}
            {brand.voice_description && (
              <div>
                <p className="text-sm font-semibold text-foreground mb-1">Comment je parle à ma cible</p>
                <CollapsibleText text={brand.voice_description} isQuote />
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
          </SectionCard>
        ) : (
          <>
            <h3 className="font-display text-base font-bold text-foreground flex items-center gap-2 uppercase tracking-wide mb-4">
              <span>🗣️</span> Mon ton
            </h3>
            <EmptySection
              message="Tu n'as pas encore défini ton ton et tes combats."
              linkLabel="Définir mon ton →"
              link="/branding/ton"
            />
          </>
        )}

        {/* ═══ LEVEL 3 — MON HISTOIRE (light) ═══ */}
        <SectionSep />

        {storytelling ? (
          <SectionLight emoji="📖" title="Mon histoire">
            {storytelling.pitch_short && (
              <CollapsibleText text={storytelling.pitch_short} />
            )}
            {!storytelling.pitch_short && (storytelling.step_7_polished || storytelling.step_6_full_story) && (
              <CollapsibleText text={storytelling.step_7_polished || storytelling.step_6_full_story} maxChars={250} />
            )}
            {storytelling.recap_summary && (() => {
              const sr = storytelling.recap_summary as any;
              return (
                <div className="space-y-1.5">
                  {sr.before && <p className="text-sm text-foreground break-words">🔵 <span className="font-medium">Avant :</span> {sr.before}</p>}
                  {sr.trigger && <p className="text-sm text-foreground break-words">💥 <span className="font-medium">Déclic :</span> {sr.trigger}</p>}
                  {sr.after && <p className="text-sm text-foreground break-words">🌱 <span className="font-medium">Après :</span> {sr.after}</p>}
                </div>
              );
            })()}
          </SectionLight>
        ) : (
          <SectionLight emoji="📖" title="Mon histoire">
            <EmptySection
              message="Tu n'as pas encore écrit ton histoire."
              linkLabel="Écrire mon histoire →"
              link="/branding/storytelling"
            />
          </SectionLight>
        )}

        {/* ═══ LEVEL 2 — MES OFFRES (card) ═══ */}
        <SectionSep />
        <h3 className="font-display text-base font-bold text-foreground flex items-center gap-2 uppercase tracking-wide mb-4">
          <span>🎁</span> Mes offres
        </h3>

        {offers.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {offers.map((o) => (
              <div key={o.id} className="rounded-xl border border-border bg-card shadow-sm p-4 space-y-1.5">
                <div className="flex items-center gap-2">
                  <span>🎁</span>
                  <span className="font-semibold text-sm text-foreground break-words">{o.name || "Sans nom"}</span>
                </div>
                {o.price_text && <p className="text-xs text-muted-foreground">{o.price_text}</p>}
                {o.description_short && <p className="text-sm text-muted-foreground break-words">{o.description_short}</p>}
                {o.promise && (
                  <div className="rounded-lg bg-muted/30 border-l-2 border-primary/30 px-3 py-2">
                    <p className="text-sm text-muted-foreground italic break-words">"{o.promise}"</p>
                  </div>
                )}
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

        {/* ═══ LEVEL 3 — MA LIGNE ÉDITORIALE (light) ═══ */}
        <SectionSep />

        {strategy ? (
          <SectionLight emoji="📝" title="Ma ligne éditoriale">
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
                <CollapsibleText text={strategy.creative_concept} maxChars={200} />
              </div>
            )}
          </SectionLight>
        ) : (
          <SectionLight emoji="📝" title="Ma ligne éditoriale">
            <EmptySection
              message="Tu n'as pas encore défini ta ligne éditoriale."
              linkLabel="Créer ma ligne →"
              link="/branding/strategie"
            />
          </SectionLight>
        )}

        {/* ═══ LEVEL 3 — MES CANAUX (light) ═══ */}
        <SectionSep />
        <SectionLight emoji="📱" title="Mes canaux">
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
        </SectionLight>

        {/* ═══ LEVEL 3 — MON DERNIER AUDIT (light) ═══ */}
        <SectionSep />

        {brandingAudit ? (
          <SectionLight emoji="🔍" title="Mon dernier audit">
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
                        <span className="break-words">{a.action || a}</span>
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
          </SectionLight>
        ) : (
          <SectionLight emoji="🔍" title="Mon dernier audit">
            <EmptySection
              message="Tu n'as pas encore fait ton audit."
              linkLabel="Lancer un audit →"
              link="/branding/audit"
            />
          </SectionLight>
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
