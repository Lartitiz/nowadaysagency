import { useState, useRef, useCallback, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import AppHeader from "@/components/AppHeader";
import SubPageHeader from "@/components/SubPageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { TextareaWithVoice as Textarea } from "@/components/ui/textarea-with-voice";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { extractTextFromFile, isAcceptedFile, ACCEPTED_MIME_TYPES } from "@/lib/file-extractors";
import { Search, Loader2, Upload, FileText, X, ChevronDown, ChevronUp, ArrowRight, ExternalLink } from "lucide-react";

/* ─── Types ─── */
interface PillarDetail {
  score: number;
  statut: string;
  ce_qui_existe: string | null;
  ce_qui_manque: string | null;
  recommandation: string | null;
}

interface AuditResult {
  score_global: number;
  synthese: string;
  points_forts: { titre: string; detail: string; source: string }[];
  points_faibles: { titre: string; detail: string; source: string; priorite: string }[];
  audit_detail: Record<string, PillarDetail>;
  plan_action_recommande: { priorite: number; action: string; module: string; temps_estime: string; lien: string }[];
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

/* ══════════════════════════════════════════ */
export default function BrandingAuditPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

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

  /* ─── Pre-fill from profile ─── */
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: profile } = await supabase
        .from("profiles")
        .select("website_url, instagram_url, linkedin_url")
        .eq("id", user.id)
        .maybeSingle();
      if (profile?.website_url) { setSiteUrl(profile.website_url); }
      if (profile?.instagram_url) {
        const match = profile.instagram_url.match(/instagram\.com\/([^/?]+)/);
        if (match) setInstagramUsername(match[1]);
      }
      if (profile?.linkedin_url) { setLinkedinUrl(profile.linkedin_url); }

      // Check for previous audit
      const { data: prevAudit } = await supabase
        .from("branding_audits")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (prevAudit) setPreviousAudit(prevAudit);
    })();
  }, [user]);

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

      const { data, error } = await supabase.functions.invoke("audit-branding", { body: payload });

      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      if (!data?.audit) throw new Error("Réponse inattendue");

      setResult(data.audit as AuditResult);
    } catch (e: any) {
      toast.error(e.message || "Erreur lors de l'audit. Réessaie.");
    } finally {
      setLoading(false);
    }
  };

  /* ─── View previous audit ─── */
  const showPreviousAudit = () => {
    if (!previousAudit) return;
    setResult({
      score_global: previousAudit.score_global,
      synthese: previousAudit.synthese,
      points_forts: previousAudit.points_forts || [],
      points_faibles: previousAudit.points_faibles || [],
      audit_detail: previousAudit.audit_detail || {},
      plan_action_recommande: previousAudit.plan_action || [],
      extraction_branding: previousAudit.extraction_branding,
    });
  };

  /* ════════════════════════════════════ RENDER ════════════════════════════════════ */

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader />
        <main className="container max-w-2xl mx-auto px-4 py-8">
          <div className="rounded-2xl border-2 border-dashed border-primary/30 bg-primary/5 p-10 text-center">
            <Loader2 className="h-10 w-10 animate-spin text-primary mx-auto mb-4" />
            <p className="font-display font-bold text-lg mb-1">🔍 On analyse ta com'…</p>
            <p className="text-sm text-muted-foreground">Ça peut prendre 30 secondes. On regarde tout en détail.</p>
          </div>
        </main>
      </div>
    );
  }

  if (result) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader />
        <main className="container max-w-2xl mx-auto px-4 py-6 pb-24">
          <SubPageHeader currentLabel="🔍 Audit de ta communication" parentLabel="Branding" parentTo="/branding" />
          <AuditResults result={result} expandedPillar={expandedPillar} setExpandedPillar={setExpandedPillar} navigate={navigate} onRedo={() => setResult(null)} />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="container max-w-2xl mx-auto px-4 py-6 pb-24">
        <SubPageHeader currentLabel="🔍 Audit de ta communication" parentLabel="Branding" parentTo="/branding" />

        <p className="text-sm text-muted-foreground mb-6">
          Donne-moi ce que t'as, je te dis où t'en es. L'outil analyse ton site, ton Instagram, tes documents et te fait un diagnostic complet.
        </p>

        {previousAudit && (
          <button onClick={showPreviousAudit} className="w-full rounded-xl border border-border bg-card hover:bg-muted/50 transition-colors p-4 mb-6 text-left">
            <p className="text-sm font-medium flex items-center gap-2">
              📊 Voir mon dernier audit ({previousAudit.score_global}/100)
              <span className="text-xs text-muted-foreground ml-auto">
                {new Date(previousAudit.created_at).toLocaleDateString("fr-FR")}
              </span>
            </p>
          </button>
        )}

        <h3 className="font-display font-bold text-sm mb-4">Qu'est-ce que tu veux analyser ?</h3>

        {/* Site web */}
        <SourceToggle checked={useSite} onToggle={setUseSite} label="Mon site web">
          <Input placeholder="https://monsite.com" value={siteUrl} onChange={(e) => setSiteUrl(e.target.value)} />
        </SourceToggle>

        {/* Instagram */}
        <SourceToggle checked={useInstagram} onToggle={setUseInstagram} label="Mon compte Instagram">
          <Input placeholder="@moncompte" value={instagramUsername} onChange={(e) => setInstagramUsername(e.target.value)} />
        </SourceToggle>

        {/* LinkedIn */}
        <SourceToggle checked={useLinkedin} onToggle={setUseLinkedin} label="Mon profil LinkedIn">
          <Input placeholder="https://linkedin.com/in/..." value={linkedinUrl} onChange={(e) => setLinkedinUrl(e.target.value)} />
        </SourceToggle>

        {/* Document */}
        <SourceToggle checked={useDocument} onToggle={setUseDocument} label="Un document stratégique (brief, plan de com')">
          <div
            className={`rounded-xl border-2 border-dashed p-4 text-center cursor-pointer transition-colors
              ${dragOver ? "border-primary bg-primary/10" : "border-border bg-card hover:border-primary/40"}`}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            {file ? (
              <div className="flex items-center justify-center gap-3">
                <FileText className="h-4 w-4 text-primary shrink-0" />
                <span className="text-sm truncate max-w-[200px]">{file.name}</span>
                <button onClick={(e) => { e.stopPropagation(); setFile(null); }} className="text-muted-foreground hover:text-foreground">
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

        {/* Free text */}
        <SourceToggle checked={useFreeText} onToggle={setUseFreeText} label="Du texte libre (notes, idées en vrac)">
          <Textarea placeholder="Colle ici tout ce que tu veux…" value={freeText} onChange={(e) => setFreeText(e.target.value)} className="min-h-[80px]" />
        </SourceToggle>

        <Button onClick={handleAudit} disabled={!hasSource} className="w-full gap-2 mt-6" size="lg">
          <Search className="h-4 w-4" />
          Lancer l'audit
        </Button>

        <p className="text-xs text-muted-foreground text-center mt-3">
          ⏰ L'analyse prend environ 30 secondes. · 💡 Plus tu donnes de sources, plus l'audit est précis.
        </p>
      </main>
    </div>
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
function AuditResults({ result, expandedPillar, setExpandedPillar, navigate, onRedo }: {
  result: AuditResult; expandedPillar: string | null; setExpandedPillar: (p: string | null) => void;
  navigate: (path: string) => void; onRedo: () => void;
}) {
  const scoreColor = result.score_global >= 75 ? "text-emerald-500" : result.score_global >= 50 ? "text-amber-500" : "text-red-500";

  return (
    <div className="space-y-6">
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
          <h3 className="font-display font-bold text-sm mb-3">Plan d'action recommandé</h3>
          <div className="space-y-2">
            {result.plan_action_recommande.map((a, i) => (
              <button key={i} onClick={() => navigate(a.lien)} className="w-full rounded-xl border border-border bg-card hover:bg-muted/50 transition-colors p-4 text-left flex items-center gap-3">
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

      {/* Actions */}
      <div className="space-y-3 pt-2">
        {result.extraction_branding && (
          <Button variant="outline" className="w-full gap-2" onClick={() => navigate("/branding")}>
            📋 Pré-remplir mon branding avec les infos extraites
          </Button>
        )}
        <Button variant="outline" className="w-full gap-2" onClick={onRedo}>
          🔄 Refaire l'audit
        </Button>
      </div>
    </div>
  );
}
