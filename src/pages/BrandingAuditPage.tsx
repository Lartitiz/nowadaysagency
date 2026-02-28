import { useState, useRef, useCallback, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate, useLocation } from "react-router-dom";
import { useWorkspaceFilter, useWorkspaceId } from "@/hooks/use-workspace-query";
import AppHeader from "@/components/AppHeader";
import SubPageHeader from "@/components/SubPageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { TextareaWithVoice as Textarea } from "@/components/ui/textarea-with-voice";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { extractTextFromFile, isAcceptedFile, ACCEPTED_MIME_TYPES } from "@/lib/file-extractors";
import { Search, Loader2, Upload, FileText, X, ChevronDown, ChevronUp, ArrowRight } from "lucide-react";
import AiLoadingIndicator from "@/components/AiLoadingIndicator";
import RedFlagsChecker from "@/components/RedFlagsChecker";

/* ─── Types ─── */
interface PillarDetail {
  score: number;
  statut: string;
  ce_qui_existe: string | null;
  ce_qui_manque: string | null;
  recommandation: string | null;
}

interface PointFaibleAction {
  module: string;
  label: string;
  route: string;
  conseil: string;
}

interface AuditResult {
  score_global: number;
  synthese: string;
  points_forts: { titre: string; detail: string; source: string }[];
  points_faibles: { titre: string; detail: string; source: string; priorite: string; action?: PointFaibleAction }[];
  audit_detail: Record<string, PillarDetail>;
  plan_action_recommande: { priorite: number; action: string; module: string; temps_estime: string; lien: string; conseil?: string }[];
  extraction_branding?: Record<string, any>;
}

/* ─── Pillar labels ─── */
const PILLAR_META: Record<string, { emoji: string; label: string }> = {
  positionnement: { emoji: "🎯", label: "Positionnement" },
  cible: { emoji: "👤", label: "Cible" },
  ton_voix: { emoji: "🗣️", label: "Ton / Voix" },
  offres: { emoji: "🎁", label: "Offres" },
  storytelling: { emoji: "📖", label: "Storytelling" },
  identite_visuelle: { emoji: "🎨", label: "Identité visuelle" },
  coherence_cross_canal: { emoji: "🔗", label: "Cohérence canaux" },
  contenu: { emoji: "📝", label: "Contenu" },
};

const STATUT_COLORS: Record<string, string> = {
  absent: "text-red-500",
  flou: "text-amber-500",
  bon: "text-emerald-500",
  excellent: "text-emerald-600",
};

const SCORE_BAR_COLOR = (score: number) =>
  score >= 75 ? "bg-emerald-500" : score >= 50 ? "bg-amber-400" : "bg-red-500";

export default function BrandingAuditPage() {
  const { user } = useAuth();
  const { column, value } = useWorkspaceFilter();
  const workspaceId = useWorkspaceId();
  const navigate = useNavigate();
  const location = useLocation();

  /* ─── Source toggles ─── */
  const [useSite, setUseSite] = useState(false);
  const [siteUrl, setSiteUrl] = useState("");
  const [useInstagram, setUseInstagram] = useState(false);
  const [instagramUsername, setInstagramUsername] = useState("");
  const [useLinkedin, setUseLinkedin] = useState(false);
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [useDocument, setUseDocument] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [useFreeText, setUseFreeText] = useState(false);
  const [freeText, setFreeText] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  /* ─── State ─── */
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AuditResult | null>(null);
  const [expandedPillar, setExpandedPillar] = useState<string | null>(null);
  const [previousAudit, setPreviousAudit] = useState<any>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [autofilling, setAutofilling] = useState(false);
  const formRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  /* ─── Pre-fill from profile & load previous audit ─── */
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: profile } = await supabase
        .from("profiles")
        .select("website_url, instagram_url, linkedin_url")
        .eq("id", user.id)
        .maybeSingle();
      if (profile?.website_url) setSiteUrl(profile.website_url);
      if (profile?.instagram_url) {
        const match = profile.instagram_url.match(/instagram\.com\/([^/?]+)/);
        if (match) setInstagramUsername(match[1]);
      }
      if (profile?.linkedin_url) setLinkedinUrl(profile.linkedin_url);

      const { data: prevAudit } = await (supabase
        .from("branding_audits") as any)
        .select("*")
        .eq(column, value)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (prevAudit) {
        setPreviousAudit(prevAudit);
        // Auto-display results
        setResult({
          score_global: prevAudit.score_global as number,
          synthese: prevAudit.synthese as string,
          points_forts: (prevAudit.points_forts || []) as any,
          points_faibles: (prevAudit.points_faibles || []) as any,
          audit_detail: (prevAudit.audit_detail || {}) as any,
          plan_action_recommande: (prevAudit.plan_action || []) as any,
          extraction_branding: prevAudit.extraction_branding as any,
        });
      } else {
        // No previous audit → show form directly
        setFormOpen(true);
      }
    })();
  }, [user]);

  // If navigated with ?refaire hash, open form
  useEffect(() => {
    if (location.hash === "#refaire") {
      setFormOpen(true);
      setTimeout(() => formRef.current?.scrollIntoView({ behavior: "smooth" }), 200);
    }
  }, [location.hash]);

  const hasSource = (useSite && siteUrl.trim()) || (useInstagram && instagramUsername.trim()) ||
    (useLinkedin && linkedinUrl.trim()) || (useDocument && file) || (useFreeText && freeText.trim().length > 20);

  /* ─── File handling ─── */
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f && isAcceptedFile(f)) { setFile(f); setUseDocument(true); }
    else toast.error("Format non supporté.");
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f && isAcceptedFile(f)) { setFile(f); setUseDocument(true); }
    else if (f) toast.error("Format non supporté.");
  };

  /* ─── Launch audit ─── */
  const handleAudit = async () => {
    if (!hasSource) return;
    setLoading(true);
    setResult(null);

    try {
      let documentText: string | undefined;
      if (useDocument && file) {
        documentText = await extractTextFromFile(file);
        if (documentText.trim().length < 50) {
          toast.error("Le fichier ne contient pas assez de texte.");
          setLoading(false);
          return;
        }
      }

      let cleanSiteUrl = siteUrl.trim();
      if (useSite && cleanSiteUrl && !cleanSiteUrl.startsWith("http")) {
        cleanSiteUrl = `https://${cleanSiteUrl}`;
      }

      const payload: Record<string, any> = {};
      if (useSite && cleanSiteUrl) payload.site_url = cleanSiteUrl;
      if (useInstagram && instagramUsername.trim()) payload.instagram_username = instagramUsername.trim().replace("@", "");
      if (useLinkedin && linkedinUrl.trim()) payload.linkedin_url = linkedinUrl.trim();
      if (documentText) payload.document_text = documentText;
      if (useFreeText && freeText.trim()) payload.free_text = freeText.trim();

      const { data, error } = await supabase.functions.invoke("audit-branding", { body: { ...payload, workspace_id: workspaceId } });

      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      if (!data?.audit) throw new Error("Réponse inattendue");

      setResult(data.audit as AuditResult);
      setFormOpen(false);
      // Scroll to top to see results
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e: any) {
      toast.error(e.message || "Erreur lors de l'audit. Réessaie.");
    } finally {
      setLoading(false);
    }
  };

  const handleRedoClick = () => {
    setFormOpen(true);
    setTimeout(() => formRef.current?.scrollIntoView({ behavior: "smooth" }), 200);
  };

  /* ─── Autofill branding from extraction ─── */
  const handleAutofillBranding = async () => {
    if (!user || !result?.extraction_branding) return;
    setAutofilling(true);
    try {
      const ext = result.extraction_branding;
      const wId = workspaceId;
      const fCol = wId ? "workspace_id" : "user_id";
      const fVal = wId || user.id;

      // 1. brand_profile: positioning, mission, values, voice, offer, content_pillars
      const brandUpdate: Record<string, any> = {};
      if (ext.positioning?.value) brandUpdate.positioning = ext.positioning.value;
      if (ext.mission?.value) brandUpdate.mission = ext.mission.value;
      if (ext.voice_description?.value) brandUpdate.voice_description = ext.voice_description.value;
      if (ext.offers?.value) brandUpdate.offer = ext.offers.value;
      if (ext.values?.value) {
        brandUpdate.values = typeof ext.values.value === "string"
          ? ext.values.value.split(",").map((v: string) => v.trim()).filter(Boolean)
          : ext.values.value;
      }
      if (ext.content_pillars?.value) {
        brandUpdate.content_pillars = typeof ext.content_pillars.value === "string"
          ? ext.content_pillars.value.split(",").map((v: string) => v.trim()).filter(Boolean)
          : ext.content_pillars.value;
      }

      if (Object.keys(brandUpdate).length > 0) {
        const { data: existing } = await supabase
          .from("brand_profile")
          .select("id, positioning, mission, voice_description, offer, values, content_pillars")
          .eq(fCol, fVal)
          .maybeSingle();

        if (existing) {
          const safeUpdate: Record<string, any> = {};
          for (const [k, v] of Object.entries(brandUpdate)) {
            const cur = (existing as any)[k];
            if (!cur || (typeof cur === "string" && cur.trim() === "") || (Array.isArray(cur) && cur.length === 0)) {
              safeUpdate[k] = v;
            }
          }
          if (Object.keys(safeUpdate).length > 0) {
            await supabase.from("brand_profile").update(safeUpdate).eq("id", existing.id);
          }
        } else {
          await supabase.from("brand_profile").insert({
            user_id: user.id,
            workspace_id: wId || null,
            ...brandUpdate,
          } as any);
        }
      }

      // 2. persona: description
      const personaDesc = ext.for_whom?.value || ext.target_description?.value;
      if (personaDesc) {
        const { data: existingPersona } = await supabase
          .from("persona")
          .select("id, description")
          .eq(fCol, fVal)
          .maybeSingle();

        if (existingPersona) {
          if (!existingPersona.description || existingPersona.description.trim() === "") {
            await supabase.from("persona").update({ description: personaDesc }).eq("id", existingPersona.id);
          }
        } else {
          await supabase.from("persona").insert({
            user_id: user.id,
            workspace_id: wId || null,
            description: personaDesc,
          } as any);
        }
      }

      // 3. storytelling: imported_text
      if (ext.story?.value) {
        const { data: existingStory } = await supabase
          .from("storytelling")
          .select("id, imported_text, step_1_raw")
          .eq(fCol, fVal)
          .maybeSingle();

        if (existingStory) {
          if (!existingStory.imported_text && !existingStory.step_1_raw) {
            await supabase.from("storytelling").update({
              imported_text: ext.story.value,
              source: "audit",
            }).eq("id", existingStory.id);
          }
        } else {
          await supabase.from("storytelling").insert({
            user_id: user.id,
            workspace_id: wId || null,
            imported_text: ext.story.value,
            source: "audit",
          } as any);
        }
      }

      queryClient.invalidateQueries({ queryKey: ["brand-profile"] });
      queryClient.invalidateQueries({ queryKey: ["persona"] });
      queryClient.invalidateQueries({ queryKey: ["storytelling-primary"] });
      queryClient.invalidateQueries({ queryKey: ["branding-completion"] });

      toast.success("Branding pré-rempli avec les données de ton audit !");
      navigate("/branding");
    } catch (e: any) {
      toast.error("Erreur lors du pré-remplissage : " + (e.message || "Réessaie."));
    } finally {
      setAutofilling(false);
    }
  };

  /* ════════════════════════════════════ RENDER ════════════════════════════════════ */

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader />
        <main className="container max-w-2xl mx-auto px-4 py-8">
          <AiLoadingIndicator context="audit" isLoading={loading} />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="container max-w-2xl mx-auto px-4 py-6 pb-24">
        <SubPageHeader currentLabel="🔍 Audit de ta communication" parentLabel="Mon identité" parentTo="/branding" />

        {/* ─── Results section (shown first if audit exists) ─── */}
        {result && (
          <div id="resultats">
            <AuditResults
              result={result}
              previousAudit={previousAudit}
              expandedPillar={expandedPillar}
              setExpandedPillar={setExpandedPillar}
              navigate={navigate}
              onRedo={handleRedoClick}
              autofilling={autofilling}
              onAutofillBranding={handleAutofillBranding}
            />
          </div>
        )}

        {/* ─── Form section ─── */}
        <div ref={formRef}>
          {result ? (
            /* If results exist, form is collapsible */
            <Collapsible open={formOpen} onOpenChange={setFormOpen}>
              <CollapsibleTrigger asChild>
                <button className="w-full rounded-xl border border-border bg-card hover:bg-muted/50 transition-colors p-4 mt-6 text-left flex items-center justify-between">
                  <span className="text-sm font-medium flex items-center gap-2">🔄 Refaire un audit</span>
                  {formOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="mt-4">
                  <AuditForm
                    useSite={useSite} setUseSite={setUseSite} siteUrl={siteUrl} setSiteUrl={setSiteUrl}
                    useInstagram={useInstagram} setUseInstagram={setUseInstagram} instagramUsername={instagramUsername} setInstagramUsername={setInstagramUsername}
                    useLinkedin={useLinkedin} setUseLinkedin={setUseLinkedin} linkedinUrl={linkedinUrl} setLinkedinUrl={setLinkedinUrl}
                    useDocument={useDocument} setUseDocument={setUseDocument} file={file} setFile={setFile}
                    useFreeText={useFreeText} setUseFreeText={setUseFreeText} freeText={freeText} setFreeText={setFreeText}
                    fileInputRef={fileInputRef} dragOver={dragOver} setDragOver={setDragOver}
                    handleDrop={handleDrop} handleFileSelect={handleFileSelect}
                    hasSource={hasSource} handleAudit={handleAudit}
                  />
                </div>
              </CollapsibleContent>
            </Collapsible>
          ) : (
            /* No results → show form directly */
            <div>
              <p className="text-sm text-muted-foreground mb-6">
                Donne-moi ce que t'as, je te dis où t'en es. L'outil analyse ton site, ton Instagram, tes documents et te fait un diagnostic complet.
              </p>
              <AuditForm
                useSite={useSite} setUseSite={setUseSite} siteUrl={siteUrl} setSiteUrl={setSiteUrl}
                useInstagram={useInstagram} setUseInstagram={setUseInstagram} instagramUsername={instagramUsername} setInstagramUsername={setInstagramUsername}
                useLinkedin={useLinkedin} setUseLinkedin={setUseLinkedin} linkedinUrl={linkedinUrl} setLinkedinUrl={setLinkedinUrl}
                useDocument={useDocument} setUseDocument={setUseDocument} file={file} setFile={setFile}
                useFreeText={useFreeText} setUseFreeText={setUseFreeText} freeText={freeText} setFreeText={setFreeText}
                fileInputRef={fileInputRef} dragOver={dragOver} setDragOver={setDragOver}
                handleDrop={handleDrop} handleFileSelect={handleFileSelect}
                hasSource={hasSource} handleAudit={handleAudit}
              />
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

/* ─── Audit Form (extracted component) ─── */
function AuditForm({
  useSite, setUseSite, siteUrl, setSiteUrl,
  useInstagram, setUseInstagram, instagramUsername, setInstagramUsername,
  useLinkedin, setUseLinkedin, linkedinUrl, setLinkedinUrl,
  useDocument, setUseDocument, file, setFile,
  useFreeText, setUseFreeText, freeText, setFreeText,
  fileInputRef, dragOver, setDragOver,
  handleDrop, handleFileSelect,
  hasSource, handleAudit,
}: any) {
  return (
    <>
      <h3 className="font-display font-bold text-sm mb-4">Qu'est-ce que tu veux analyser ?</h3>

      <SourceToggle checked={useSite} onToggle={setUseSite} label="Mon site web">
        <Input placeholder="https://monsite.com" value={siteUrl} onChange={(e: any) => setSiteUrl(e.target.value)} />
      </SourceToggle>

      <SourceToggle checked={useInstagram} onToggle={setUseInstagram} label="Mon compte Instagram">
        <Input placeholder="@moncompte" value={instagramUsername} onChange={(e: any) => setInstagramUsername(e.target.value)} />
      </SourceToggle>

      <SourceToggle checked={useLinkedin} onToggle={setUseLinkedin} label="Mon profil LinkedIn">
        <Input placeholder="https://linkedin.com/in/..." value={linkedinUrl} onChange={(e: any) => setLinkedinUrl(e.target.value)} />
      </SourceToggle>

      <SourceToggle checked={useDocument} onToggle={setUseDocument} label="Un document stratégique (brief, plan de com')">
        <div
          className={`rounded-xl border-2 border-dashed p-4 text-center cursor-pointer transition-colors
            ${dragOver ? "border-primary bg-primary/10" : "border-border bg-card hover:border-primary/40"}`}
          onDragOver={(e: any) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          {file ? (
            <div className="flex items-center justify-center gap-3">
              <FileText className="h-4 w-4 text-primary shrink-0" />
              <span className="text-sm truncate max-w-[200px]">{file.name}</span>
              <button onClick={(e: any) => { e.stopPropagation(); setFile(null); }} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <>
              <Upload className="h-5 w-5 text-muted-foreground mx-auto mb-1" />
              <p className="text-xs text-muted-foreground">PDF, Word, texte</p>
            </>
          )}
          <input ref={fileInputRef} type="file" accept={ACCEPTED_MIME_TYPES} onChange={handleFileSelect} className="hidden" />
        </div>
      </SourceToggle>

      <SourceToggle checked={useFreeText} onToggle={setUseFreeText} label="Du texte libre (notes, idées en vrac)">
        <Textarea showVoiceTip placeholder="Colle ici tout ce que tu veux…" value={freeText} onChange={(e: any) => setFreeText(e.target.value)} className="min-h-[80px]" />
      </SourceToggle>

      <Button onClick={handleAudit} disabled={!hasSource} className="w-full gap-2 mt-6" size="lg">
        <Search className="h-4 w-4" />
        Lancer l'audit
      </Button>

      <p className="text-xs text-muted-foreground text-center mt-3">
        ⏰ L'analyse prend environ 30 secondes. · 💡 Plus tu donnes de sources, plus l'audit est précis.
      </p>
    </>
  );
}

/* ─── Source toggle component ─── */
function SourceToggle({ checked, onToggle, label, children }: { checked: boolean; onToggle: (v: boolean) => void; label: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <label className="flex items-center gap-3 cursor-pointer mb-2">
        <Checkbox checked={checked} onCheckedChange={(v) => onToggle(!!v)} />
        <span className="text-sm font-medium">{label}</span>
      </label>
      {checked && <div className="ml-7">{children}</div>}
    </div>
  );
}

/* ─── Audit Results Display ─── */
function AuditResults({ result, previousAudit, expandedPillar, setExpandedPillar, navigate, onRedo, autofilling, onAutofillBranding }: {
  result: AuditResult; previousAudit: any; expandedPillar: string | null; setExpandedPillar: (p: string | null) => void;
  navigate: (path: string) => void; onRedo: () => void; autofilling: boolean; onAutofillBranding: () => void;
}) {
  const scoreColor = result.score_global >= 75 ? "text-emerald-500" : result.score_global >= 50 ? "text-amber-500" : "text-red-500";

  const navigateWithContext = (route: string, conseil?: string, module?: string) => {
    if (conseil && module) {
      sessionStorage.setItem("audit_recommendation", JSON.stringify({ module, conseil }));
    }
    navigate(route);
  };

  return (
    <div className="space-y-6">
      {/* Date */}
      {previousAudit?.created_at && (
        <p className="text-xs text-muted-foreground">
          🔍 Audit du {new Date(previousAudit.created_at).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}
        </p>
      )}

      {/* Score global */}
      <div className="rounded-2xl border border-border bg-card p-6 text-center">
        <p className={`text-5xl font-display font-bold ${scoreColor}`}>{result.score_global}<span className="text-lg text-muted-foreground">/100</span></p>
        <div className="w-full max-w-xs mx-auto mt-3">
          <div className="h-3 rounded-full bg-muted overflow-hidden">
            <div className={`h-full rounded-full transition-all ${SCORE_BAR_COLOR(result.score_global)}`} style={{ width: `${result.score_global}%` }} />
          </div>
        </div>
        <p className="text-sm text-muted-foreground mt-4 leading-relaxed">{result.synthese}</p>
      </div>

      {/* Points forts */}
      {result.points_forts?.length > 0 && (
        <div>
          <h3 className="font-display font-bold text-sm mb-3">Ce qui marche ✅</h3>
          <div className="space-y-2">
            {result.points_forts.map((p, i) => (
              <div key={i} className="rounded-xl border border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/30 p-4">
                <p className="text-sm font-medium text-foreground">✅ {p.titre}</p>
                <p className="text-xs text-muted-foreground mt-1">{p.detail}</p>
                <p className="text-[10px] text-muted-foreground/70 mt-1">Source : {p.source}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Points faibles */}
      {result.points_faibles?.length > 0 && (
        <div>
          <h3 className="font-display font-bold text-sm mb-3">Ce qui manque ⚠️</h3>
          <div className="space-y-2">
            {result.points_faibles.map((p, i) => (
              <div key={i} className={`rounded-xl border p-4 ${p.priorite === "haute" ? "border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30" : "border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30"}`}>
                <p className="text-sm font-medium text-foreground">{p.priorite === "haute" ? "🔴" : "🟡"} {p.titre}</p>
                <p className="text-xs text-muted-foreground mt-1">{p.detail}</p>
                <p className="text-[10px] text-muted-foreground/70 mt-1">Priorité : {p.priorite}</p>
                {p.action && (
                  <div className="mt-3 pt-3 border-t border-border/50">
                    <p className="text-xs text-muted-foreground mb-2">💡 {p.action.conseil}</p>
                    <Button
                      size="sm"
                      className="gap-1.5 text-xs"
                      onClick={() => navigateWithContext(p.action!.route, p.action!.conseil, p.action!.module)}
                    >
                      {p.action.label} <ArrowRight className="h-3 w-3" />
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Detail par pilier */}
      <div>
        <h3 className="font-display font-bold text-sm mb-3">Détail par pilier</h3>
        <div className="space-y-2">
          {Object.entries(result.audit_detail || {}).map(([key, pillar]) => {
            const meta = PILLAR_META[key] || { emoji: "📋", label: key };
            const isExpanded = expandedPillar === key;
            return (
              <div key={key} className="rounded-xl border border-border bg-card overflow-hidden">
                <button className="w-full flex items-center gap-3 p-4 text-left" onClick={() => setExpandedPillar(isExpanded ? null : key)}>
                  <span className="text-base">{meta.emoji}</span>
                  <span className="text-sm font-medium flex-1">{meta.label}</span>
                  <span className={`text-xs font-mono ${STATUT_COLORS[pillar.statut] || "text-muted-foreground"}`}>
                    {pillar.score}/100 · {pillar.statut}
                  </span>
                  <div className="w-20 h-2 rounded-full bg-muted overflow-hidden">
                    <div className={`h-full rounded-full ${SCORE_BAR_COLOR(pillar.score)}`} style={{ width: `${pillar.score}%` }} />
                  </div>
                  {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                </button>
                {isExpanded && (
                  <div className="px-4 pb-4 space-y-2 border-t border-border pt-3">
                    {pillar.ce_qui_existe && (
                      <div><p className="text-[10px] font-semibold text-emerald-600 uppercase">Ce qui existe</p><p className="text-xs text-muted-foreground">{pillar.ce_qui_existe}</p></div>
                    )}
                    {pillar.ce_qui_manque && (
                      <div><p className="text-[10px] font-semibold text-amber-600 uppercase">Ce qui manque</p><p className="text-xs text-muted-foreground">{pillar.ce_qui_manque}</p></div>
                    )}
                    {pillar.recommandation && (
                      <div><p className="text-[10px] font-semibold text-primary uppercase">Recommandation</p><p className="text-xs text-muted-foreground">{pillar.recommandation}</p></div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Plan d'action */}
      {result.plan_action_recommande?.length > 0 && (
        <div>
          <h3 className="font-display font-bold text-sm mb-2">📋 Ton plan d'action</h3>
          <p className="text-xs text-muted-foreground mb-3">Par quoi commencer ? Voici l'ordre recommandé :</p>
          <div className="space-y-2">
            {result.plan_action_recommande.map((a, i) => (
              <button key={i} onClick={() => navigateWithContext(a.lien, a.conseil, a.module)} className="w-full rounded-xl border border-border bg-card hover:bg-muted/50 transition-colors p-4 text-left flex items-center gap-3">
                <span className="w-6 h-6 rounded-lg bg-primary/10 text-primary text-xs font-bold flex items-center justify-center shrink-0">{a.priorite}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{a.action}</p>
                  <p className="text-[10px] text-muted-foreground">{a.temps_estime}</p>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground text-center mt-2">💡 Ces actions correspondent aux modules de l'app.</p>
        </div>
      )}

      {/* Red flags checker */}
      <RedFlagsChecker
        content={[
          result.synthese,
          ...(result.points_forts?.map((p: any) => p.detail) || []),
          ...(result.points_faibles?.map((p: any) => p.detail) || []),
        ].filter(Boolean).join("\n\n")}
        onFix={() => {}}
      />

      {/* Actions */}
      <div className="space-y-3 pt-2">
        {result.extraction_branding && (
          <Button variant="outline" className="w-full gap-2" disabled={autofilling} onClick={onAutofillBranding}>
            {autofilling ? <Loader2 className="h-4 w-4 animate-spin" /> : "📋"} Pré-remplir mon branding avec les infos extraites
          </Button>
        )}
        <Button variant="outline" className="w-full gap-2" onClick={onRedo}>
          🔄 Refaire l'audit
        </Button>
      </div>
    </div>
  );
}
