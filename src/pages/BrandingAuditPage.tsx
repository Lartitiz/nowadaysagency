import { useState, useRef, useCallback, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate, useLocation } from "react-router-dom";
import { useWorkspaceFilter, useWorkspaceId, useProfileUserId } from "@/hooks/use-workspace-query";
import AppHeader from "@/components/AppHeader";
import SubPageHeader from "@/components/SubPageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { TextareaWithVoice as Textarea } from "@/components/ui/textarea-with-voice";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { supabase } from "@/integrations/supabase/client";
import { invokeWithTimeout } from "@/lib/invoke-with-timeout";
import { applyPositioningToProposition } from "@/lib/positioning-write";
import { toast } from "sonner";
import { extractTextFromFile, isAcceptedFile, ACCEPTED_MIME_TYPES } from "@/lib/file-extractors";
import { Search, Loader2, Upload, FileText, X, ChevronDown, ChevronUp, ArrowRight } from "lucide-react";
import AiLoadingIndicator from "@/components/AiLoadingIndicator";
import RedFlagsChecker from "@/components/RedFlagsChecker";
import { useDiagnosticCache } from "@/hooks/use-diagnostic-cache";
import DiagnosticCacheBanner from "@/components/audit/DiagnosticCacheBanner";
import QuotaExhaustedCard from "@/components/QuotaExhaustedCard";
import { useUserPlan } from "@/hooks/use-user-plan";
import { friendlyError } from "@/lib/error-messages";

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
  absent: "text-error",
  flou: "text-warning",
  bon: "text-success",
  excellent: "text-success",
};

const SCORE_BAR_COLOR = (score: number) =>
  score >= 75 ? "bg-success" : score >= 50 ? "bg-warning" : "bg-error";

/* ─── Render-safety ───
   Les audits sont produits par l'IA et certains anciens audits ont un schéma
   différent : un champ attendu comme texte peut être un objet (ex. { title, detail }).
   Rendre cet objet tel quel dans le JSX fait planter toute la page (React error #31).
   asText() coerce n'importe quelle valeur en chaîne sûre et ne rend jamais un objet brut. */
function asText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(asText).filter(Boolean).join(", ");
  if (typeof value === "object") {
    const o = value as Record<string, unknown>;
    const heading = o.titre ?? o.title ?? o.label;
    const body = o.detail ?? o.description ?? o.text;
    const parts = [heading, body].filter((p) => typeof p === "string" && p) as string[];
    return parts.join(" : ");
  }
  return "";
}

export default function BrandingAuditPage() {
  const { user } = useAuth();
  const { column, value } = useWorkspaceFilter();
  const workspaceId = useWorkspaceId();
  const profileUserId = useProfileUserId();
  const navigate = useNavigate();
  const location = useLocation();
  const { diagnosticData: diagCache, isRecent: diagIsRecent } = useDiagnosticCache();
  const { plan } = useUserPlan();
  const [quotaExhausted, setQuotaExhausted] = useState<{ message?: string } | null>(null);

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
        .eq("user_id", profileUserId)
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
  }, [user, profileUserId, column, value]);

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
    setQuotaExhausted(null);

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

      const { data, error } = await invokeWithTimeout("audit-branding", { body: { ...payload, workspace_id: workspaceId } }, 120000);

      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      if (!data?.audit) throw new Error("Réponse inattendue");

      setResult(data.audit as AuditResult);
      setFormOpen(false);
      // Scroll to top to see results
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e: any) {
      const errStr = e?.message || String(e);
      if (/quota|crédit|limit_reached|limit/i.test(errStr)) {
        setQuotaExhausted({ message: "" });
      } else {
        toast.error(friendlyError(e));
      }
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

      // 1. brand_profile: mission, values, voice, offer, content_pillars
      // (le positionnement va dans brand_proposition.version_final, cf. plus bas)
      const brandUpdate: Record<string, any> = {};
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
        const { data: existing } = await (supabase
          .from("brand_profile")
          .select("id, mission, voice_description, offer, values, content_pillars") as any)
          .eq(column, value)
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
            workspace_id: column === "workspace_id" ? value : null,
            ...brandUpdate,
          } as any);
        }
      }

      // 1b. Positionnement → brand_proposition.version_final (source de vérité unique
      // lue par la génération + le Coach). Ne remplit que si version_final est vide.
      if (ext.positioning?.value) {
        await applyPositioningToProposition(column, value, profileUserId, ext.positioning.value);
      }

      // 2. persona: description
      const personaDesc = ext.for_whom?.value || ext.target_description?.value;
      if (personaDesc) {
        const { data: existingPersona } = await (supabase
          .from("persona")
          .select("id, description") as any)
          .eq(column, value)
          .maybeSingle();


        if (existingPersona) {
          if (!existingPersona.description || existingPersona.description.trim() === "") {
            await supabase.from("persona").update({ description: personaDesc }).eq("id", existingPersona.id);
          }
        } else {
          await supabase.from("persona").insert({
            user_id: user.id,
            workspace_id: column === "workspace_id" ? value : null,
            description: personaDesc,
          } as any);
        }
      }

      // 3. storytelling: imported_text
      if (ext.story?.value) {
        const { data: existingStory } = await (supabase
          .from("storytelling")
          .select("id, imported_text, step_1_raw") as any)
          .eq(column, value)
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
            workspace_id: column === "workspace_id" ? value : null,
            imported_text: ext.story.value,
            source: "audit",
          } as any);
        }
      }

      queryClient.invalidateQueries({ queryKey: ["brand-profile"] });
      queryClient.invalidateQueries({ queryKey: ["brand-proposition"] });
      queryClient.invalidateQueries({ queryKey: ["persona"] });
      queryClient.invalidateQueries({ queryKey: ["storytelling-primary"] });
      queryClient.invalidateQueries({ queryKey: ["branding-completion"] });

      toast.success("Branding pré-rempli avec les données de ton audit !");
      navigate("/branding");
    } catch (e: any) {
      toast.error("Erreur lors du pré-remplissage : " + (friendlyError(e)));
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

        {/* Quota exhausted */}
        {quotaExhausted && !loading && (
          <QuotaExhaustedCard
            category="audits"
            renewalMessage={quotaExhausted.message || undefined}
            plan={plan}
          />
        )}

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
              {!previousAudit && diagIsRecent && diagCache && diagCache.scores?.branding != null && (
                <div className="mb-6">
                  <DiagnosticCacheBanner diagnosticData={diagCache} domain="branding" onRelaunch={() => {}} />
                </div>
              )}
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
      <h3 className="font-body font-bold text-sm mb-4">Qu'est-ce que tu veux analyser ?</h3>

      <SourceToggle checked={useSite} onToggle={setUseSite} label="Mon site web">
        <Input aria-label="URL de ton site web" placeholder="https://monsite.com" value={siteUrl} onChange={(e: any) => setSiteUrl(e.target.value)} />
      </SourceToggle>

      <SourceToggle checked={useInstagram} onToggle={setUseInstagram} label="Mon compte Instagram">
        <Input aria-label="Nom d'utilisateur Instagram" placeholder="@moncompte" value={instagramUsername} onChange={(e: any) => setInstagramUsername(e.target.value)} />
      </SourceToggle>

      <SourceToggle checked={useLinkedin} onToggle={setUseLinkedin} label="Mon profil LinkedIn">
        <Input aria-label="URL de ton profil LinkedIn" placeholder="https://linkedin.com/in/..." value={linkedinUrl} onChange={(e: any) => setLinkedinUrl(e.target.value)} />
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
        <Textarea aria-label="Texte libre à analyser" showVoiceTip placeholder="Colle ici tout ce que tu veux…" value={freeText} onChange={(e: any) => setFreeText(e.target.value)} className="min-h-[80px]" />
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
  const scoreColor = result.score_global >= 75 ? "text-success" : result.score_global >= 50 ? "text-warning" : "text-error";

  const navigateWithContext = (route: string, conseil?: string, module?: string) => {
    if (conseil && module) {
      sessionStorage.setItem("audit_recommendation", JSON.stringify({ module, conseil, ts: Date.now() }));
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
        <p className="text-sm text-muted-foreground mt-4 leading-relaxed">{asText(result.synthese)}</p>
      </div>

      {/* Points forts */}
      {result.points_forts?.length > 0 && (
        <div>
          <h3 className="font-body font-bold text-sm mb-3">Ce qui marche ✅</h3>
          <div className="space-y-2">
            {result.points_forts.map((p, i) => (
              <div key={i} className="rounded-xl border border-success/30 bg-success-bg p-4">
                <p className="text-sm font-medium text-foreground">✅ {asText(p.titre)}</p>
                <p className="text-xs text-muted-foreground mt-1">{asText(p.detail)}</p>
                <p className="text-2xs text-muted-foreground/70 mt-1">Source : {asText(p.source)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Points faibles */}
      {result.points_faibles?.length > 0 && (
        <div>
          <h3 className="font-body font-bold text-sm mb-3">Ce qui manque ⚠️</h3>
          <div className="space-y-2">
            {result.points_faibles.map((p, i) => (
              <div key={i} className={`rounded-xl border p-4 ${p.priorite === "haute" ? "border-error/30 bg-error-bg" : "border-warning/30 bg-warning-bg"}`}>
                <p className="text-sm font-medium text-foreground">{p.priorite === "haute" ? "🔴" : "🟡"} {asText(p.titre)}</p>
                <p className="text-xs text-muted-foreground mt-1">{asText(p.detail)}</p>
                <p className="text-2xs text-muted-foreground/70 mt-1">Priorité : {asText(p.priorite)}</p>
                {p.action && (
                  <div className="mt-3 pt-3 border-t border-border/50">
                    <p className="text-xs text-muted-foreground mb-2">💡 {asText(p.action.conseil)}</p>
                    <Button
                      size="sm"
                      className="gap-1.5 text-xs"
                      onClick={() => navigateWithContext(p.action!.route, p.action!.conseil, p.action!.module)}
                    >
                      {asText(p.action.label)} <ArrowRight className="h-3 w-3" />
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
        <h3 className="font-body font-bold text-sm mb-3">Détail par pilier</h3>
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
                    {pillar.score}/100 · {asText(pillar.statut)}
                  </span>
                  <div className="w-20 h-2 rounded-full bg-muted overflow-hidden">
                    <div className={`h-full rounded-full ${SCORE_BAR_COLOR(pillar.score)}`} style={{ width: `${pillar.score}%` }} />
                  </div>
                  {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                </button>
                {isExpanded && (
                  <div className="px-4 pb-4 space-y-2 border-t border-border pt-3">
                    {pillar.ce_qui_existe && (
                      <div><p className="text-2xs font-semibold text-success uppercase">Ce qui existe</p><p className="text-xs text-muted-foreground">{asText(pillar.ce_qui_existe)}</p></div>
                    )}
                    {pillar.ce_qui_manque && (
                      <div><p className="text-2xs font-semibold text-warning uppercase">Ce qui manque</p><p className="text-xs text-muted-foreground">{asText(pillar.ce_qui_manque)}</p></div>
                    )}
                    {pillar.recommandation && (
                      <div><p className="text-2xs font-semibold text-primary uppercase">Recommandation</p><p className="text-xs text-muted-foreground">{asText(pillar.recommandation)}</p></div>
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
          <h3 className="font-body font-bold text-sm mb-2">📋 Ton plan d'action</h3>
          <p className="text-xs text-muted-foreground mb-3">Par quoi commencer ? Voici l'ordre recommandé :</p>
          <div className="space-y-2">
            {result.plan_action_recommande.map((a, i) => (
              <button key={i} onClick={() => navigateWithContext(a.lien, a.conseil, a.module)} className="w-full rounded-xl border border-border bg-card hover:bg-muted/50 transition-colors p-4 text-left flex items-center gap-3">
                <span className="w-6 h-6 rounded-lg bg-primary/10 text-primary text-xs font-bold flex items-center justify-center shrink-0">{a.priorite}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{asText(a.action)}</p>
                  <p className="text-2xs text-muted-foreground">{asText(a.temps_estime)}</p>
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
