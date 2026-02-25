import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspaceFilter, useWorkspaceId } from "@/hooks/use-workspace-query";
import AppHeader from "@/components/AppHeader";
import SubPageHeader from "@/components/SubPageHeader";
import AuditRecommendationBanner from "@/components/AuditRecommendationBanner";
import { Button } from "@/components/ui/button";
import { TextareaWithVoice as Textarea } from "@/components/ui/textarea-with-voice";
import { useToast } from "@/hooks/use-toast";
import { Copy, Check, Sparkles, Loader2, RefreshCw, ChevronLeft, Blend, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import AuditInsight, { useAuditInsight } from "@/components/AuditInsight";
import AiGeneratedMention from "@/components/AiGeneratedMention";
import { Link } from "react-router-dom";
import { useActivityExamples } from "@/hooks/use-activity-examples";
import { useDemoContext } from "@/contexts/DemoContext";
import BioBeforeAfter from "@/components/bio/BioBeforeAfter";
import CharacterCounter from "@/components/bio/CharacterCounter";
import BioHistoryDrawer from "@/components/bio/BioHistoryDrawer";

/* ═══════════════════════════════════════════════
   TYPES
   ═══════════════════════════════════════════════ */

interface BioAnalysis {
  bio_displayed: string;
  score: number;
  works_well: { point: string; why: string }[];
  to_improve: { point: string; why: string; suggestion: string }[];
  missing: { point: string; why: string }[];
}

interface BioVersion {
  label: string;
  bio_text: string;
  character_count: number;
  style_note: string;
  pourquoi?: string;
  structure?: string;
  score?: number;
}

interface BrandingContext {
  positioning: string;
  valueProposition: string;
  target: string;
  tone: string;
  keywords: string;
  story: string;
  offer: string;
  mission: string;
  combats: string;
}

type View = "audit" | "branding-check" | "structure-choice" | "differentiation" | "cta" | "results" | "mixer" | "validated";

const BIO_STRUCTURES = [
  {
    id: "directe",
    name: "La Directe",
    emoji: "🎯",
    description: "Hook percutant + qui tu es + CTA. Droit au but.",
    perfect_for: "Prestataires de services, freelances",
    example_format: "Ligne 1 : hook / ce que tu fais\nLigne 2 : pour qui\nLigne 3 : preuve ou personnalité\nLigne 4 : CTA",
  },
  {
    id: "stratege",
    name: "La Stratège",
    emoji: "♟️",
    description: "Problème de ta cible + ta solution + CTA. Tu montres que tu comprends.",
    perfect_for: "Coachs, consultantes, formatrices",
    example_format: "Ligne 1 : problème de ta cible\nLigne 2 : ta solution\nLigne 3 : crédibilité\nLigne 4 : CTA",
  },
  {
    id: "engagee",
    name: "L'Engagée",
    emoji: "✊",
    description: "Ta mission + ta personnalité + CTA. Pour celles qui ont un positionnement militant.",
    perfect_for: "Marques engagées, militantes, valeurs fortes",
    example_format: "Ligne 1 : ta mission / ton combat\nLigne 2 : comment tu agis\nLigne 3 : ta touche perso\nLigne 4 : CTA",
  },
  {
    id: "prouveuse",
    name: "La Prouveuse",
    emoji: "📊",
    description: "Résultat concret + méthode + CTA. Les chiffres parlent.",
    perfect_for: "Celles qui ont des résultats mesurables",
    example_format: "Ligne 1 : résultat clé chiffré\nLigne 2 : comment (ta méthode)\nLigne 3 : crédibilité ou personnalité\nLigne 4 : CTA",
  },
  {
    id: "storytelleuse",
    name: "La Storytelleuse",
    emoji: "📖",
    description: "Mini-histoire en 4 lignes. Ta personnalité EST le produit.",
    perfect_for: "Profils incarnés, artistes, créatrices",
    example_format: "Ligne 1 : mini-récit (d'où tu viens)\nLigne 2 : ce que tu fais maintenant\nLigne 3 : ton style unique\nLigne 4 : CTA",
  },
  {
    id: "convertisseuse",
    name: "La Convertisseuse",
    emoji: "🚀",
    description: "Micro-landing page. Offre + bénéfice + urgence + CTA. Pour les lancements.",
    perfect_for: "Lancements, offres limitées, promos",
    example_format: "Ligne 1 : offre spécifique\nLigne 2 : bénéfice clé\nLigne 3 : urgence ou preuve sociale\nLigne 4 : CTA direct",
  },
];

const DIFF_ANGLES = [
  { id: "parcours", emoji: "🎓", label: "Mon parcours / expertise", prompt: "Résume ton parcours en 1 phrase (d'où tu viens, ce qui t'a amenée là)" },
  { id: "valeurs", emoji: "🌱", label: "Mes valeurs / engagements", prompt: "C'est quoi LA valeur pour laquelle tu te bats ?" },
  { id: "methode", emoji: "🛠️", label: "Ma méthode / approche unique", prompt: "Qu'est-ce que tu fais différemment des autres dans ton domaine ?" },
  { id: "clients", emoji: "💬", label: "Ce que mes client·es disent", prompt: "C'est quoi LE compliment qu'on te fait le plus souvent ?" },
  { id: "style", emoji: "🎨", label: "Mon style / esthétique", prompt: "Si ta marque était une personne, comment on la décrirait en 3 mots ?" },
];

const CTA_OPTIONS = [
  { id: "freebie", emoji: "📩", label: "Télécharger un freebie / ressource gratuite" },
  { id: "rdv", emoji: "📞", label: "Prendre RDV / appel découverte" },
  { id: "boutique", emoji: "🛍️", label: "Voir ma boutique / mes offres" },
  { id: "newsletter", emoji: "📰", label: "S'inscrire à ma newsletter" },
  { id: "dm", emoji: "💬", label: "M'envoyer un DM" },
  { id: "site", emoji: "🔗", label: "Visiter mon site" },
];

/* ═══════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════ */

export default function InstagramBio() {
  const { user } = useAuth();
  const { toast } = useToast();
  useAuditInsight("bio");
  const activityExamples = useActivityExamples();
  const { isDemoMode, demoData } = useDemoContext();
  const { column, value } = useWorkspaceFilter();
  const workspaceId = useWorkspaceId();

  // Profile data
  const [profile, setProfile] = useState<any>(null);

  // Views
  const [view, setView] = useState<View>("audit");

  // Audit analysis
  const [bioAnalysis, setBioAnalysis] = useState<BioAnalysis | null>(null);
  const [analyzingBio, setAnalyzingBio] = useState(false);
  const [currentBioText, setCurrentBioText] = useState("");

  // Branding context
  const [brandingCtx, setBrandingCtx] = useState<BrandingContext | null>(null);
  const [brandingLoaded, setBrandingLoaded] = useState(false);

  // Generator — only 2 questions
  const [diffAngle, setDiffAngle] = useState<string>("");
  const [diffText, setDiffText] = useState("");
  const [ctaType, setCtaType] = useState("");
  const [ctaText, setCtaText] = useState("");
  const [bioStructure, setBioStructure] = useState<string>("");

  const [generating, setGenerating] = useState(false);
  const [versions, setVersions] = useState<BioVersion[]>([]);

  // Mixer
  const [selectedLines, setSelectedLines] = useState<{ version: number; line: number }[]>([]);

  // Validation
  const [validatedBio, setValidatedBio] = useState<string | null>(null);
  const [validatedAt, setValidatedAt] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  // Load profile, branding, and existing validation
  useEffect(() => {
    if (isDemoMode) {
      // Demo mode: inject fake data directly
      setProfile({ prenom: demoData?.profile.first_name, activite: demoData?.profile.activity, instagram_username: "lea_portraits" });
      setBrandingCtx({
        positioning: demoData?.branding.positioning || "",
        valueProposition: demoData?.branding.unique_proposition || "",
        target: demoData?.persona.situation || "",
        tone: demoData?.branding.tone?.description || "",
        keywords: demoData?.branding.tone?.keywords?.join(", ") || "",
        story: demoData?.story_summary || "",
        offer: demoData?.offers?.[0]?.name || "",
        mission: demoData?.branding.mission || "",
        combats: "",
      });
      setBrandingLoaded(true);
      setValidatedBio(demoData?.bio || null);
      setValidatedAt("2026-02-20T10:00:00Z");
      setView("validated");
      return;
    }
    if (!user || brandingLoaded) return;
    const load = async () => {
      const [{ data: prof }, { data: val }, { data: bp }, { data: persona }, { data: prop }, { data: strat }, { data: story }] = await Promise.all([
        (supabase.from("profiles") as any).select("*").eq(column, value).single(),
        (supabase.from("audit_validations") as any).select("*").eq(column, value).eq("section", "bio").maybeSingle(),
        (supabase.from("brand_profile") as any).select("voice_description, tone_register, tone_level, tone_style, tone_humor, tone_engagement, key_expressions, things_to_avoid, combat_cause, combat_fights, combat_alternative, combat_refusals, mission, offer").eq(column, value).maybeSingle(),
        (supabase.from("persona") as any).select("step_1_frustrations, step_2_transformation").eq(column, value).maybeSingle(),
        (supabase.from("brand_proposition") as any).select("version_final, version_bio, version_pitch_naturel").eq(column, value).maybeSingle(),
        (supabase.from("brand_strategy") as any).select("pillar_major, pillar_minor_1, pillar_minor_2, pillar_minor_3").eq(column, value).maybeSingle(),
        (supabase.from("storytelling") as any).select("step_7_polished").eq(column, value).maybeSingle(),
      ]);

      if (prof) {
        setProfile(prof);
        if ((prof as any).differentiation_type) setDiffAngle((prof as any).differentiation_type);
        if ((prof as any).differentiation_text) setDiffText((prof as any).differentiation_text);
        if ((prof as any).bio_cta_type) setCtaType((prof as any).bio_cta_type);
        if ((prof as any).bio_cta_text) setCtaText((prof as any).bio_cta_text);
      }

      const toneArr = [bp?.tone_register, bp?.tone_level, bp?.tone_style, bp?.tone_humor, bp?.tone_engagement].filter(Boolean);
      const combatArr = [bp?.combat_cause, bp?.combat_fights, bp?.combat_alternative, bp?.combat_refusals].filter(Boolean);
      const pillars = [strat?.pillar_major, strat?.pillar_minor_1, strat?.pillar_minor_2, strat?.pillar_minor_3].filter(Boolean);

      setBrandingCtx({
        positioning: (prof as any)?.activite || bp?.mission || "",
        valueProposition: prop?.version_final || prop?.version_bio || prop?.version_pitch_naturel || "",
        target: (prof as any)?.cible || (persona?.step_2_transformation ? `Cible qui veut : ${persona.step_2_transformation}` : ""),
        tone: bp?.voice_description || toneArr.join(", ") || "",
        keywords: [bp?.key_expressions, pillars.join(", ")].filter(Boolean).join(" · ") || "",
        story: story?.step_7_polished || "",
        offer: bp?.offer || (prof as any)?.offre || "",
        mission: bp?.mission || (prof as any)?.mission || "",
        combats: combatArr.join(" · "),
      });
      setBrandingLoaded(true);

      if (val) {
        const v = val as any;
        if (v.status === "validated" && v.validated_content?.bio) {
          setValidatedBio(v.validated_content.bio);
          setValidatedAt(v.validated_at);
          setView("validated");
        }
      }
    };
    load();
  }, [user?.id, isDemoMode]);

  const brandingFilled = brandingCtx
    ? [brandingCtx.positioning, brandingCtx.valueProposition, brandingCtx.target, brandingCtx.tone].filter(Boolean).length
    : 0;

  // ── ANALYZE CURRENT BIO ──
  const handleAnalyzeBio = async () => {
    if (!user || !currentBioText.trim()) {
      toast({ title: "Colle ta bio actuelle pour l'analyser" });
      return;
    }
    setAnalyzingBio(true);
    try {
      const res = await supabase.functions.invoke("generate-content", {
        body: { type: "bio-audit", profile: profile || {}, bioText: currentBioText },
      });
      if (res.error) throw new Error(res.error.message);
      const content = res.data?.content || "";
      let parsed: BioAnalysis;
      try { parsed = JSON.parse(content); } catch {
        const match = content.match(/\{[\s\S]*\}/);
        if (match) parsed = JSON.parse(match[0]);
        else throw new Error("Format inattendu");
      }
      setBioAnalysis(parsed);
    } catch (e: any) {
      toast({ title: "Erreur d'analyse", description: e.message, variant: "destructive" });
    }
    setAnalyzingBio(false);
  };

  // ── GENERATE BIO VERSIONS ──
  const handleGenerate = async () => {
    if (!user) return;
    setGenerating(true);
    try {
      // Save differentiation + CTA to profile
      await (supabase.from("profiles") as any).update({
        differentiation_type: diffAngle || null,
        differentiation_text: diffText || null,
        bio_cta_type: ctaType || null,
        bio_cta_text: ctaText || null,
      } as any).eq(column, value);

      const res = await supabase.functions.invoke("generate-content", {
        body: {
          type: "bio-generator",
          profile: profile || {},
          brandingContext: brandingCtx,
          differentiation: { type: diffAngle, text: diffText },
          ctaInfo: { type: ctaType, text: ctaText },
          structureChoice: bioStructure,
        },
      });
      if (res.error) throw new Error(res.error.message);
      const content = res.data?.content || "";
      let parsed: { bios?: BioVersion[]; versions?: BioVersion[] };
      try { parsed = JSON.parse(content); } catch {
        const match = content.match(/\{[\s\S]*\}/);
        if (match) parsed = JSON.parse(match[0]);
        else throw new Error("Format inattendu");
      }
      setVersions(parsed.bios || parsed.versions || []);
      setView("results");
    } catch (e: any) {
      toast({ title: "Erreur de génération", description: e.message, variant: "destructive" });
    }
    setGenerating(false);
  };

  // ── VALIDATE BIO ──
  const handleValidate = async (bioText: string) => {
    if (!user) return;
    try {
      // Save to bio history
      await (supabase.from("bio_versions") as any).insert({
        user_id: user.id,
        workspace_id: workspaceId !== user.id ? workspaceId : null,
        platform: "instagram",
        bio_text: bioText,
        score: bioAnalysis?.score || null,
        structure_type: bioStructure || null,
        source: "generated",
      });

      await supabase.from("audit_validations").upsert({
        user_id: user.id,
        workspace_id: workspaceId !== user.id ? workspaceId : undefined,
        section: "bio",
        status: "validated",
        validated_at: new Date().toISOString(),
        validated_content: { bio: bioText },
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id,section" });
      await (supabase.from("profiles") as any).update({
        validated_bio: bioText,
        validated_bio_at: new Date().toISOString(),
      } as any).eq(column, value);
      setValidatedBio(bioText);
      setValidatedAt(new Date().toISOString());
      setView("validated");
      toast({ title: "✅ Bio sauvegardée. Tu peux la copier-coller dans Instagram." });
    } catch {
      toast({ title: "Erreur de sauvegarde", variant: "destructive" });
    }
  };

  const copyBio = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(key);
    setTimeout(() => setCopiedField(null), 2000);
  };

  // Mixer preview
  const mixedBio = selectedLines
    .sort((a, b) => a.line - b.line || a.version - b.version)
    .map(sl => {
      const v = versions[sl.version];
      if (!v) return "";
      return v.bio_text.split("\n")[sl.line] || "";
    })
    .filter(Boolean)
    .join("\n");

  if (!profile || !brandingLoaded) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex gap-1">
          <div className="h-3 w-3 rounded-full bg-primary animate-bounce-dot" />
          <div className="h-3 w-3 rounded-full bg-primary animate-bounce-dot" style={{ animationDelay: "0.16s" }} />
          <div className="h-3 w-3 rounded-full bg-primary animate-bounce-dot" style={{ animationDelay: "0.32s" }} />
        </div>
      </div>
    );
  }

  const startGenerator = () => {
    if (brandingFilled >= 3) {
      setView("branding-check");
    } else {
      setView("branding-check");
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-3xl px-6 py-8 max-md:px-4">
        <SubPageHeader parentLabel="Mon profil" parentTo="/instagram/profil" currentLabel="Optimiser ma bio" useFromParam />
        <AuditRecommendationBanner />

        <h1 className="font-display text-[26px] font-bold text-foreground">✍️ Optimiser ma bio</h1>
        <p className="mt-2 text-sm text-muted-foreground mb-6">
          Ta bio, c'est ta première impression. Elle doit montrer en quelques mots : à qui tu t'adresses, ce que tu proposes, et pourquoi toi.
        </p>

        <AuditInsight section="bio" />

        {/* ═══════════════════════════════════════
           VIEW: VALIDATED
           ═══════════════════════════════════════ */}
        {view === "validated" && validatedBio && (
          <div className="space-y-4 animate-fade-in">
            <div className="rounded-2xl border-2 border-green-200 bg-green-50/50 p-6">
              <div className="flex items-center gap-2 mb-4">
                <span className="text-sm font-bold text-foreground">📝 BIO</span>
                <span className="text-xs font-medium text-green-700 bg-green-100 px-2.5 py-0.5 rounded-pill">
                  ✅ Validée le {validatedAt ? new Date(validatedAt).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }) : ""}
                </span>
              </div>
              <BioPreviewCard bio={validatedBio} />
              <CharacterCounter text={validatedBio} maxLength={150} />
              <div className="flex flex-wrap gap-2 mt-4">
                <Button variant="outline" size="sm" className="rounded-pill gap-1.5" onClick={() => copyBio(validatedBio, "validated")}>
                  {copiedField === "validated" ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {copiedField === "validated" ? "Copié !" : "Copier"}
                </Button>
                <Button variant="outline" size="sm" className="rounded-pill gap-1.5" onClick={() => setView("audit")}>
                  ✏️ Modifier
                </Button>
                <Button variant="outline" size="sm" className="rounded-pill gap-1.5" onClick={() => startGenerator()}>
                  <RefreshCw className="h-3.5 w-3.5" /> Refaire
                </Button>
              </div>
            </div>
            <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" onClick={() => setHistoryOpen(true)}>
              📜 Voir l'historique de mes bios
            </Button>
          </div>
        )}

        {/* ═══════════════════════════════════════
           VIEW: AUDIT (analyze current bio)
           ═══════════════════════════════════════ */}
        {view === "audit" && (
          <div className="space-y-6 animate-fade-in">
            <div className="rounded-2xl border border-border bg-card p-6 space-y-4">
              <h2 className="font-display text-base font-bold text-foreground">📝 Ta bio actuelle</h2>
              <p className="text-sm text-muted-foreground">Colle ta bio Instagram ici pour recevoir une analyse détaillée.</p>
              <Textarea
                value={currentBioText}
                onChange={e => setCurrentBioText(e.target.value)}
                placeholder={activityExamples.bio_example}
                className="min-h-[120px]"
              />
              <CharacterCounter text={currentBioText} maxLength={150} />
              <div className="flex flex-wrap gap-3">
                <Button onClick={handleAnalyzeBio} disabled={analyzingBio || !currentBioText.trim()} className="rounded-pill gap-2">
                  {analyzingBio ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  Analyser ma bio
                </Button>
                <Button variant="outline" className="rounded-pill gap-2" onClick={startGenerator}>
                  <Sparkles className="h-4 w-4" />
                  Créer une nouvelle bio
                </Button>
                {!validatedBio && (
                  <Button variant="ghost" className="rounded-pill text-green-700" onClick={() => {
                    if (currentBioText.trim()) handleValidate(currentBioText);
                    else toast({ title: "Colle ta bio d'abord" });
                  }}>
                    ✅ Ma bio me convient
                  </Button>
                )}
              </div>
            </div>

            {/* Analysis results */}
            {bioAnalysis && (
              <div className="space-y-4 animate-fade-in">
                <div className="rounded-2xl border border-border bg-card p-5">
                  <BioPreviewCard bio={bioAnalysis.bio_displayed} />
                  <div className="mt-3 text-right">
                    <span className="text-sm font-bold text-foreground">Score : {bioAnalysis.score}/100</span>
                  </div>
                </div>

                {bioAnalysis.works_well.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground font-mono-ui">Ce qui fonctionne ✅</h3>
                    {bioAnalysis.works_well.map((item, i) => (
                      <div key={i} className="rounded-xl border border-green-200 bg-green-50/50 p-4">
                        <p className="text-sm text-foreground font-medium">✅ {item.point}</p>
                        <p className="text-xs text-muted-foreground mt-1">{item.why}</p>
                      </div>
                    ))}
                  </div>
                )}

                {bioAnalysis.to_improve.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground font-mono-ui">Ce qui pourrait être amélioré 🟡</h3>
                    {bioAnalysis.to_improve.map((item, i) => (
                      <div key={i} className="rounded-xl border border-amber-200 bg-amber-50/50 p-4">
                        <p className="text-sm text-foreground font-medium">🟡 {item.point}</p>
                        <p className="text-xs text-muted-foreground mt-1">{item.why}</p>
                        {item.suggestion && <p className="text-xs text-primary mt-1 italic">💡 {item.suggestion}</p>}
                      </div>
                    ))}
                  </div>
                )}

                {bioAnalysis.missing.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground font-mono-ui">Ce qui manque ❌</h3>
                    {bioAnalysis.missing.map((item, i) => (
                      <div key={i} className="rounded-xl border border-red-200 bg-red-50/50 p-4">
                        <p className="text-sm text-foreground font-medium">❌ {item.point}</p>
                        <p className="text-xs text-muted-foreground mt-1">{item.why}</p>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex flex-wrap gap-3">
                  <Button className="rounded-pill gap-2" onClick={startGenerator}>
                    <Sparkles className="h-4 w-4" /> Créer une meilleure bio
                  </Button>
                  <Button variant="ghost" className="rounded-pill text-green-700" onClick={() => handleValidate(currentBioText)}>
                    ✅ Ma bio me convient
                  </Button>
                </div>
                <AiGeneratedMention />
              </div>
            )}
            <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" onClick={() => setHistoryOpen(true)}>
              📜 Voir l'historique de mes bios
            </Button>
          </div>
        )}

        {/* ═══════════════════════════════════════
           VIEW: BRANDING CHECK — show what we already know
           ═══════════════════════════════════════ */}
        {view === "branding-check" && brandingCtx && (
          <div className="space-y-6 animate-fade-in">
            <div className="rounded-2xl border border-border bg-card p-6 space-y-5">
              <div className="text-center space-y-2">
                <h2 className="font-display text-lg font-bold text-foreground">📝 Créons ta bio</h2>
              </div>

              {brandingFilled >= 2 ? (
                <>
                  <p className="text-sm text-muted-foreground">Je pars de ce que tu as déjà rempli dans ton branding :</p>
                  <div className="rounded-xl bg-muted/30 border border-border p-4 space-y-2.5">
                    {brandingCtx.positioning && (
                      <div className="flex items-start gap-2 text-sm">
                        <span className="shrink-0">🎯</span>
                        <div><span className="font-semibold text-foreground">Positionnement :</span> <span className="text-muted-foreground">{brandingCtx.positioning}</span></div>
                      </div>
                    )}
                    {brandingCtx.tone && (
                      <div className="flex items-start gap-2 text-sm">
                        <span className="shrink-0">💬</span>
                        <div><span className="font-semibold text-foreground">Ton :</span> <span className="text-muted-foreground">{brandingCtx.tone}</span></div>
                      </div>
                    )}
                    {brandingCtx.target && (
                      <div className="flex items-start gap-2 text-sm">
                        <span className="shrink-0">👤</span>
                        <div><span className="font-semibold text-foreground">Cible :</span> <span className="text-muted-foreground">{brandingCtx.target}</span></div>
                      </div>
                    )}
                    {brandingCtx.valueProposition && (
                      <div className="flex items-start gap-2 text-sm">
                        <span className="shrink-0">✨</span>
                        <div><span className="font-semibold text-foreground">Proposition de valeur :</span> <span className="text-muted-foreground">{brandingCtx.valueProposition}</span></div>
                      </div>
                    )}
                    {brandingCtx.offer && (
                      <div className="flex items-start gap-2 text-sm">
                        <span className="shrink-0">🎁</span>
                        <div><span className="font-semibold text-foreground">Offre :</span> <span className="text-muted-foreground">{brandingCtx.offer}</span></div>
                      </div>
                    )}
                    {brandingCtx.combats && (
                      <div className="flex items-start gap-2 text-sm">
                        <span className="shrink-0">✊</span>
                        <div><span className="font-semibold text-foreground">Combats :</span> <span className="text-muted-foreground">{brandingCtx.combats}</span></div>
                      </div>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-3 pt-2">
                    <Button className="rounded-pill gap-2" onClick={() => setView("structure-choice")}>
                      Tout est bon 👍 <ArrowRight className="h-4 w-4" />
                    </Button>
                    <Link to="/branding">
                      <Button variant="outline" className="rounded-pill gap-2">
                        ✏️ Modifier mon branding d'abord
                      </Button>
                    </Link>
                  </div>
                </>
              ) : (
                <>
                  <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4 space-y-2">
                    <p className="text-sm text-foreground font-medium">⚠️ Ton branding n'est pas encore complet.</p>
                    <p className="text-xs text-muted-foreground">Plus tu remplis ton branding, plus ta bio sera précise et personnalisée.</p>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <Link to="/branding">
                      <Button className="rounded-pill gap-2">
                        🎨 Compléter mon branding d'abord
                      </Button>
                    </Link>
                    <Button variant="outline" className="rounded-pill gap-2" onClick={() => setView("structure-choice")}>
                      Continuer quand même <ArrowRight className="h-4 w-4" />
                    </Button>
                  </div>
                </>
              )}

              <Button variant="ghost" size="sm" className="rounded-pill gap-1" onClick={() => setView("audit")}>
                <ChevronLeft className="h-4 w-4" /> Retour
              </Button>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════
           VIEW: STRUCTURE CHOICE
           ═══════════════════════════════════════ */}
        {view === "structure-choice" && (
          <div className="space-y-4 animate-fade-in">
            <div className="text-center space-y-2">
              <h2 className="text-lg font-bold">Quelle stratégie pour ta bio ?</h2>
              <p className="text-sm text-muted-foreground">Choisis la structure qui correspond le mieux à ta situation. L'IA adaptera ses propositions.</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {BIO_STRUCTURES.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setBioStructure(s.id)}
                  className={cn(
                    "text-left p-4 rounded-xl border-2 transition-all hover:shadow-md",
                    bioStructure === s.id
                      ? "border-primary bg-primary/5 shadow-sm"
                      : "border-border hover:border-primary/40"
                  )}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xl">{s.emoji}</span>
                    <span className="font-bold text-sm">{s.name}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mb-2">{s.description}</p>
                  <p className="text-xs text-primary/70">Parfait pour : {s.perfect_for}</p>
                </button>
              ))}
            </div>
            {bioStructure && (
              <div className="bg-muted/50 rounded-lg p-3 text-xs text-muted-foreground">
                <p className="font-medium mb-1">Format :</p>
                <pre className="whitespace-pre-wrap">{BIO_STRUCTURES.find(s => s.id === bioStructure)?.example_format}</pre>
              </div>
            )}
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" className="rounded-pill gap-1" onClick={() => setView("branding-check")}>
                ← Retour
              </Button>
              <Button
                className="rounded-pill gap-2 flex-1"
                disabled={!bioStructure}
                onClick={() => setView("differentiation")}
              >
                Continuer →
              </Button>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════
           VIEW: DIFFERENTIATION (question 1)
           ═══════════════════════════════════════ */}
        {view === "differentiation" && (
          <div className="space-y-6 animate-fade-in">
            <div className="rounded-2xl border border-border bg-card p-6 space-y-5">
              <div className="text-center space-y-1">
                <h2 className="font-display text-lg font-bold text-foreground">Qu'est-ce qui te différencie concrètement ?</h2>
                <p className="text-xs text-muted-foreground">Pas ta mission (ça j'ai déjà). Plutôt ta manière de faire, ton parcours atypique, tes valeurs non-négociables...</p>
                <div className="flex justify-center gap-1.5 mt-2">
                  <div className="h-1.5 w-8 rounded-full bg-primary" />
                  <div className="h-1.5 w-8 rounded-full bg-muted" />
                </div>
                <p className="text-xs text-muted-foreground">Étape 1/2</p>
              </div>

              {/* Angle chips */}
              <p className="text-xs font-semibold text-foreground">Choisis un angle de différenciation :</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {DIFF_ANGLES.map(a => (
                  <button
                    key={a.id}
                    onClick={() => setDiffAngle(a.id)}
                    className={`text-left px-4 py-3 rounded-xl border transition-all text-sm ${
                      diffAngle === a.id
                        ? "border-primary bg-primary/5 text-foreground font-medium"
                        : "border-border bg-card text-muted-foreground hover:border-primary/40"
                    }`}
                  >
                    {a.emoji} {a.label}
                  </button>
                ))}
              </div>

              {/* Context-aware prompt */}
              {diffAngle && (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">
                    {DIFF_ANGLES.find(a => a.id === diffAngle)?.prompt}
                  </p>
                  <Textarea
                    value={diffText}
                    onChange={e => setDiffText(e.target.value)}
                    placeholder="Ex: J'enseigne la com' en écoles de mode, j'ai cofondé un éco-lieu, et je refuse le marketing manipulatoire"
                    className="min-h-[100px]"
                  />
                </div>
              )}

              <div className="flex justify-between pt-2">
                <Button variant="ghost" size="sm" className="rounded-pill gap-1" onClick={() => setView("structure-choice")}>
                  <ChevronLeft className="h-4 w-4" /> Précédent
                </Button>
                <Button size="sm" className="rounded-pill gap-1" onClick={() => setView("cta")} disabled={!diffAngle}>
                  Suivant <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════
           VIEW: CTA (question 2)
           ═══════════════════════════════════════ */}
        {view === "cta" && (
          <div className="space-y-6 animate-fade-in">
            <div className="rounded-2xl border border-border bg-card p-6 space-y-5">
              <div className="text-center space-y-1">
                <h2 className="font-display text-lg font-bold text-foreground">Qu'est-ce que tu veux que les gens FASSENT ?</h2>
                <p className="text-xs text-muted-foreground">Après avoir lu ta bio, tu veux qu'ils…</p>
                <div className="flex justify-center gap-1.5 mt-2">
                  <div className="h-1.5 w-8 rounded-full bg-primary" />
                  <div className="h-1.5 w-8 rounded-full bg-primary" />
                </div>
                <p className="text-xs text-muted-foreground">Étape 2/2</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {CTA_OPTIONS.map(o => (
                  <button
                    key={o.id}
                    onClick={() => setCtaType(o.id)}
                    className={`text-left px-4 py-3 rounded-xl border transition-all text-sm ${
                      ctaType === o.id
                        ? "border-primary bg-primary/5 text-foreground font-medium"
                        : "border-border bg-card text-muted-foreground hover:border-primary/40"
                    }`}
                  >
                    {o.emoji} {o.label}
                  </button>
                ))}
              </div>

              {(ctaType === "freebie" || ctaType === "newsletter") && (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">
                    {ctaType === "freebie" ? "C'est quoi le nom de ta ressource gratuite ?" : "C'est quoi le nom de ta newsletter ?"}
                  </p>
                  <Textarea
                    value={ctaText}
                    onChange={e => setCtaText(e.target.value)}
                    placeholder={ctaType === "freebie" ? "Ex: Mini-formation gratuite" : "Ex: La Lettre du Lundi"}
                    className="min-h-[60px]"
                  />
                </div>
              )}

              <div className="flex justify-between pt-2">
                <Button variant="ghost" size="sm" className="rounded-pill gap-1" onClick={() => setView("differentiation")}>
                  <ChevronLeft className="h-4 w-4" /> Précédent
                </Button>
                <Button onClick={handleGenerate} disabled={generating || !ctaType} className="rounded-pill gap-2">
                  {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  Générer ma bio
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════
           VIEW: RESULTS (3 versions)
           ═══════════════════════════════════════ */}
        {view === "results" && (
          <div className="space-y-6 animate-fade-in">
            <h2 className="font-display text-lg font-bold text-foreground">📝 {versions.length} propositions de bio</h2>
            <AiGeneratedMention />

            {bioAnalysis && bioAnalysis.score > 0 && versions.length > 0 && (
              <BioBeforeAfter
                currentBio={bioAnalysis.bio_displayed}
                currentScore={bioAnalysis.score}
                bestBio={versions.reduce((best, v) => (v.score || 0) > (best.score || 0) ? v : best, versions[0])}
              />
            )}

            {versions.map((v, i) => (
              <div key={i} className="rounded-2xl border border-border bg-card p-6 space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-display text-sm font-bold text-foreground">
                      {String.fromCharCode(65 + i)} · {v.label}
                    </h3>
                    {v.structure && (
                      <span className="text-[10px] bg-muted px-2 py-0.5 rounded-full text-muted-foreground">
                        {BIO_STRUCTURES.find(s => s.id === v.structure)?.name || v.structure}
                      </span>
                    )}
                    {v.score && (
                      <span className={cn(
                        "text-sm font-bold px-2 py-0.5 rounded-full",
                        v.score >= 70 ? "text-green-700 bg-green-50" : v.score >= 40 ? "text-amber-700 bg-amber-50" : "text-red-700 bg-red-50"
                      )}>
                        {v.score}/100
                      </span>
                    )}
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-pill ${v.character_count <= 150 ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                    {v.character_count}/150 car.
                  </span>
                </div>
                {v.pourquoi && <p className="text-xs text-muted-foreground italic">{v.pourquoi}</p>}
                {!v.pourquoi && v.style_note && <p className="text-xs text-muted-foreground italic">{v.style_note}</p>}
                <BioPreviewCard bio={v.bio_text} />
                <CharacterCounter text={v.bio_text} maxLength={150} />
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" className="rounded-pill gap-1.5" onClick={() => copyBio(v.bio_text, `v${i}`)}>
                    {copiedField === `v${i}` ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    {copiedField === `v${i}` ? "Copié !" : "Copier"}
                  </Button>
                  <Button size="sm" className="rounded-pill gap-1.5 bg-green-600 hover:bg-green-700 text-white" onClick={() => handleValidate(v.bio_text)}>
                    ⭐ Choisir celle-ci
                  </Button>
                </div>
              </div>
            ))}

            <div className="flex flex-wrap gap-3">
              <Button variant="outline" className="rounded-pill gap-2" onClick={handleGenerate} disabled={generating}>
                {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Regénérer de nouvelles propositions
              </Button>
              <Button variant="outline" className="rounded-pill gap-2" onClick={() => { setSelectedLines([]); setView("mixer"); }}>
                <Blend className="h-4 w-4" /> Mixer : prendre des bouts de chaque
              </Button>
              <Button variant="ghost" className="rounded-pill" onClick={() => setView("differentiation")}>
                ← Modifier mes réponses
              </Button>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════
           VIEW: MIXER
           ═══════════════════════════════════════ */}
        {view === "mixer" && versions.length > 0 && (
          <div className="space-y-6 animate-fade-in">
            <h2 className="font-display text-lg font-bold text-foreground">🎨 Mixe ta bio idéale</h2>
            <p className="text-sm text-muted-foreground">Clique sur les lignes que tu veux garder :</p>

            {versions.map((v, vi) => (
              <div key={vi} className="space-y-1">
                <p className="text-xs font-bold text-foreground mb-1">Version {String.fromCharCode(65 + vi)} :</p>
                {v.bio_text.split("\n").map((line, li) => {
                  if (!line.trim()) return null;
                  const isSelected = selectedLines.some(sl => sl.version === vi && sl.line === li);
                  return (
                    <button
                      key={li}
                      onClick={() => {
                        if (isSelected) {
                          setSelectedLines(prev => prev.filter(sl => !(sl.version === vi && sl.line === li)));
                        } else {
                          setSelectedLines(prev => [...prev, { version: vi, line: li }]);
                        }
                      }}
                      className={`w-full text-left px-3 py-2 rounded-lg border text-sm transition-all ${
                        isSelected
                          ? "border-primary bg-primary/5 text-foreground font-medium"
                          : "border-border bg-card text-muted-foreground hover:border-primary/30"
                      }`}
                    >
                      <span className="mr-2">{isSelected ? "☑" : "☐"}</span>
                      {line}
                    </button>
                  );
                })}
              </div>
            ))}

            {selectedLines.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground font-mono-ui">Prévisualisation</h3>
                <BioPreviewCard bio={mixedBio} />
                <p className={`text-xs ${mixedBio.length <= 150 ? "text-green-600" : "text-red-600"}`}>
                  {mixedBio.length}/150 caractères {mixedBio.length <= 150 ? "✅" : "⚠️ Trop long"}
                </p>
              </div>
            )}

            <div className="flex flex-wrap gap-3">
              {selectedLines.length > 0 && (
                <Button className="rounded-pill gap-1.5 bg-green-600 hover:bg-green-700 text-white" onClick={() => handleValidate(mixedBio)}>
                  ✅ Valider cette bio
                </Button>
              )}
              <Button variant="outline" className="rounded-pill" onClick={() => setView("results")}>
                ← Retour aux versions
              </Button>
            </div>
          </div>
        )}

        {/* Guide */}
        {(view === "audit" || view === "validated") && (
          <div className="rounded-2xl border-l-4 border-l-primary bg-rose-pale p-5 mt-8">
            <span className="inline-block font-mono-ui text-[11px] font-semibold uppercase tracking-wider bg-jaune text-[#2D2235] px-3 py-1 rounded-pill mb-2">
              📖 Guide
            </span>
            <p className="text-sm text-foreground leading-relaxed">
              💡 Une bonne bio Instagram tient en 4 lignes :<br />
              1. Ce que tu proposes<br />
              2. Ce qui te rend unique<br />
              3. Pour qui<br />
              4. Un appel à l'action (lien, DM, inscription...)
            </p>
          </div>
        )}
      <BioHistoryDrawer
        platform="instagram"
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        onReuse={(text) => { setCurrentBioText(text); setView("audit"); }}
      />
      </main>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   BIO PREVIEW CARD
   ═══════════════════════════════════════════════ */

function BioPreviewCard({ bio }: { bio: string }) {
  return (
    <div className="rounded-2xl border border-border bg-muted/30 p-5 max-w-sm mx-auto font-sans">
      {bio.split("\n").map((line, i) => (
        <p key={i} className="text-sm text-foreground leading-snug">{line}</p>
      ))}
    </div>
  );
}
