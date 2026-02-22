import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import AppHeader from "@/components/AppHeader";
import SubPageHeader from "@/components/SubPageHeader";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Copy, Check, Sparkles, Loader2, RefreshCw, ChevronRight, ChevronLeft, Blend } from "lucide-react";
import AuditInsight, { useAuditInsight } from "@/components/AuditInsight";
import EditableText from "@/components/EditableText";
import AiGeneratedMention from "@/components/AiGeneratedMention";

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
}

interface GeneratorAnswers {
  activity: string;
  target: string;
  differentiator: string;
  tone: string;
  action: string;
}

type View = "audit" | "generator" | "results" | "mixer" | "validated";

const TONE_OPTIONS = [
  { id: "pro", emoji: "🎯", label: "Pro et claire" },
  { id: "warm", emoji: "😊", label: "Chaleureuse et accessible" },
  { id: "punchy", emoji: "⚡", label: "Punchy et directe" },
  { id: "soft", emoji: "🌿", label: "Douce et poétique" },
  { id: "fun", emoji: "😄", label: "Fun et décalée" },
];

const ACTION_OPTIONS = [
  { id: "buy", emoji: "🛍️", label: "Achète / commande" },
  { id: "dm", emoji: "📩", label: "T'envoie un DM" },
  { id: "link", emoji: "🔗", label: "Clique sur ton lien" },
  { id: "newsletter", emoji: "📲", label: "S'abonne à ta newsletter" },
  { id: "rdv", emoji: "📞", label: "Prenne RDV" },
  { id: "explore", emoji: "👀", label: "Explore ton contenu" },
];

/* ═══════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════ */

export default function InstagramBio() {
  const { user } = useAuth();
  const { toast } = useToast();
  const auditData = useAuditInsight("bio");

  // Profile data
  const [profile, setProfile] = useState<any>(null);

  // Views
  const [view, setView] = useState<View>("audit");

  // Audit analysis
  const [bioAnalysis, setBioAnalysis] = useState<BioAnalysis | null>(null);
  const [analyzingBio, setAnalyzingBio] = useState(false);
  const [currentBioText, setCurrentBioText] = useState("");

  // Generator
  const [step, setStep] = useState(1);
  const [answers, setAnswers] = useState<GeneratorAnswers>({
    activity: "", target: "", differentiator: "", tone: "", action: "",
  });
  const [generating, setGenerating] = useState(false);
  const [versions, setVersions] = useState<BioVersion[]>([]);

  // Mixer
  const [selectedLines, setSelectedLines] = useState<{ version: number; line: number }[]>([]);

  // Validation
  const [validatedBio, setValidatedBio] = useState<string | null>(null);
  const [validatedAt, setValidatedAt] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Load profile and existing validation
  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const [{ data: prof }, { data: val }] = await Promise.all([
        supabase.from("profiles").select("*").eq("user_id", user.id).single(),
        supabase.from("audit_validations" as any).select("*").eq("user_id", user.id).eq("section", "bio").maybeSingle(),
      ]);
      if (prof) {
        setProfile(prof);
        // Pre-fill generator with profile data
        setAnswers(prev => ({
          ...prev,
          activity: (prof as any).activite || "",
          target: (prof as any).cible || "",
        }));
        // Load saved generator answers
        if ((prof as any).bio_generator_answers) {
          setAnswers((prof as any).bio_generator_answers);
        }
      }
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
  }, [user]);

  // ── ANALYZE CURRENT BIO ──
  const handleAnalyzeBio = async () => {
    if (!user || !currentBioText.trim()) {
      toast({ title: "Colle ta bio actuelle pour l'analyser" });
      return;
    }
    setAnalyzingBio(true);
    try {
      const res = await supabase.functions.invoke("generate-content", {
        body: {
          type: "bio-audit",
          profile: profile || {},
          bioText: currentBioText,
        },
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
      // Save answers for later pre-fill
      await supabase.from("profiles").update({
        bio_generator_answers: answers as any,
      }).eq("user_id", user.id);

      const res = await supabase.functions.invoke("generate-content", {
        body: {
          type: "bio-generator",
          profile: profile || {},
          generatorAnswers: answers,
        },
      });
      if (res.error) throw new Error(res.error.message);
      const content = res.data?.content || "";
      let parsed: { versions: BioVersion[] };
      try { parsed = JSON.parse(content); } catch {
        const match = content.match(/\{[\s\S]*\}/);
        if (match) parsed = JSON.parse(match[0]);
        else throw new Error("Format inattendu");
      }
      setVersions(parsed.versions || []);
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
      await supabase.from("audit_validations" as any).upsert({
        user_id: user.id,
        section: "bio",
        status: "validated",
        validated_at: new Date().toISOString(),
        validated_content: { bio: bioText },
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id,section" });
      await supabase.from("profiles").update({
        validated_bio: bioText,
        validated_bio_at: new Date().toISOString(),
      }).eq("user_id", user.id);
      setValidatedBio(bioText);
      setValidatedAt(new Date().toISOString());
      setView("validated");
      toast({ title: "✅ Bio validée !" });
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

  if (!profile) {
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

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-3xl px-6 py-8 max-md:px-4">
        <SubPageHeader parentLabel="Mon profil" parentTo="/instagram/profil" currentLabel="Optimiser ma bio" />

        <h1 className="font-display text-[26px] font-bold text-foreground">✍️ Optimiser ma bio</h1>
        <p className="mt-2 text-sm text-muted-foreground mb-6">
          Ta bio, c'est ta première impression. Elle doit montrer en quelques mots : à qui tu t'adresses, ce que tu proposes, et pourquoi toi.
        </p>

        {/* Show audit insight from existing audit */}
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
              <div className="flex flex-wrap gap-2 mt-4">
                <Button variant="outline" size="sm" className="rounded-pill gap-1.5" onClick={() => copyBio(validatedBio, "validated")}>
                  {copiedField === "validated" ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {copiedField === "validated" ? "Copié !" : "Copier"}
                </Button>
                <Button variant="outline" size="sm" className="rounded-pill gap-1.5" onClick={() => setView("audit")}>
                  ✏️ Modifier
                </Button>
                <Button variant="outline" size="sm" className="rounded-pill gap-1.5" onClick={() => { setStep(1); setView("generator"); }}>
                  <RefreshCw className="h-3.5 w-3.5" /> Refaire
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════
           VIEW: AUDIT (analyze current bio)
           ═══════════════════════════════════════ */}
        {view === "audit" && (
          <div className="space-y-6 animate-fade-in">
            {/* Input current bio */}
            <div className="rounded-2xl border border-border bg-card p-6 space-y-4">
              <h2 className="font-display text-base font-bold text-foreground">📝 Ta bio actuelle</h2>
              <p className="text-sm text-muted-foreground">Colle ta bio Instagram ici pour recevoir une analyse détaillée.</p>
              <Textarea
                value={currentBioText}
                onChange={e => setCurrentBioText(e.target.value)}
                placeholder={"🌿 Créatrice bijoux éthiques\n✨ Fait main à Marseille\n🌍 Mode responsable\n📩 Commandes en DM"}
                className="min-h-[120px]"
              />
              <div className="flex flex-wrap gap-3">
                <Button onClick={handleAnalyzeBio} disabled={analyzingBio || !currentBioText.trim()} className="rounded-pill gap-2">
                  {analyzingBio ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  Analyser ma bio
                </Button>
                <Button variant="outline" className="rounded-pill gap-2" onClick={() => { setStep(1); setView("generator"); }}>
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
                {/* Current bio displayed */}
                <div className="rounded-2xl border border-border bg-card p-5">
                  <BioPreviewCard bio={bioAnalysis.bio_displayed} />
                  <div className="mt-3 text-right">
                    <span className="text-sm font-bold text-foreground">Score : {bioAnalysis.score}/100</span>
                  </div>
                </div>

                {/* What works */}
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

                {/* To improve */}
                {bioAnalysis.to_improve.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground font-mono-ui">Ce qui pourrait être amélioré 🟡</h3>
                    {bioAnalysis.to_improve.map((item, i) => (
                      <div key={i} className="rounded-xl border border-amber-200 bg-amber-50/50 p-4">
                        <p className="text-sm text-foreground font-medium">🟡 {item.point}</p>
                        <p className="text-xs text-muted-foreground mt-1">{item.why}</p>
                        {item.suggestion && (
                          <p className="text-xs text-primary mt-1 italic">💡 {item.suggestion}</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Missing */}
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
                  <Button className="rounded-pill gap-2" onClick={() => { setStep(1); setView("generator"); }}>
                    <Sparkles className="h-4 w-4" /> Créer une meilleure bio
                  </Button>
                  <Button variant="ghost" className="rounded-pill text-green-700" onClick={() => handleValidate(currentBioText)}>
                    ✅ Ma bio me convient
                  </Button>
                </div>

                <AiGeneratedMention />
              </div>
            )}
          </div>
        )}

        {/* ═══════════════════════════════════════
           VIEW: GENERATOR (5-step flow)
           ═══════════════════════════════════════ */}
        {view === "generator" && (
          <div className="space-y-6 animate-fade-in">
            <div className="rounded-2xl border border-border bg-card p-6 space-y-5">
              <div className="text-center space-y-2">
                <h2 className="font-display text-lg font-bold text-foreground">✨ Créons ta bio</h2>
                <div className="flex justify-center gap-1.5 mt-2">
                  {[1, 2, 3, 4, 5].map(s => (
                    <div key={s} className={`h-1.5 w-8 rounded-full transition-colors ${s <= step ? "bg-primary" : "bg-muted"}`} />
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">Étape {step}/5</p>
              </div>

              {step === 1 && (
                <div className="space-y-3">
                  <h3 className="text-sm font-bold text-foreground">C'est quoi ton activité ?</h3>
                  <p className="text-xs text-muted-foreground">En une phrase simple, comme si tu l'expliquais à quelqu'un dans un dîner.</p>
                  <Textarea
                    value={answers.activity}
                    onChange={e => setAnswers(a => ({ ...a, activity: e.target.value }))}
                    placeholder="Je crée des bijoux éthiques en pierres naturelles"
                    className="min-h-[80px]"
                  />
                  <p className="text-xs text-muted-foreground italic">💡 Pas besoin d'être parfaite, c'est un brouillon.</p>
                </div>
              )}

              {step === 2 && (
                <div className="space-y-3">
                  <h3 className="text-sm font-bold text-foreground">C'est pour qui ?</h3>
                  <p className="text-xs text-muted-foreground">Qui sont tes client·es idéal·es ?</p>
                  <Textarea
                    value={answers.target}
                    onChange={e => setAnswers(a => ({ ...a, target: e.target.value }))}
                    placeholder="Femmes qui cherchent des bijoux avec du sens"
                    className="min-h-[80px]"
                  />
                </div>
              )}

              {step === 3 && (
                <div className="space-y-3">
                  <h3 className="text-sm font-bold text-foreground">Qu'est-ce qui te différencie ?</h3>
                  <p className="text-xs text-muted-foreground">Pourquoi toi et pas quelqu'un d'autre ? (fabrication, valeurs, approche, parcours...)</p>
                  <Textarea
                    value={answers.differentiator}
                    onChange={e => setAnswers(a => ({ ...a, differentiator: e.target.value }))}
                    placeholder="Tout est fait main dans mon atelier à Marseille, pierres sourcées éthiquement"
                    className="min-h-[80px]"
                  />
                </div>
              )}

              {step === 4 && (
                <div className="space-y-3">
                  <h3 className="text-sm font-bold text-foreground">Quel ton pour ta bio ?</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {TONE_OPTIONS.map(t => (
                      <button
                        key={t.id}
                        onClick={() => setAnswers(a => ({ ...a, tone: t.id }))}
                        className={`text-left px-4 py-3 rounded-xl border transition-all text-sm ${
                          answers.tone === t.id
                            ? "border-primary bg-primary/5 text-foreground font-medium"
                            : "border-border bg-card text-muted-foreground hover:border-primary/40"
                        }`}
                      >
                        {t.emoji} {t.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {step === 5 && (
                <div className="space-y-3">
                  <h3 className="text-sm font-bold text-foreground">Qu'est-ce que tu veux que les gens fassent ?</h3>
                  <p className="text-xs text-muted-foreground">Quand quelqu'un arrive sur ton profil, tu veux qu'iel :</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {ACTION_OPTIONS.map(a => (
                      <button
                        key={a.id}
                        onClick={() => setAnswers(prev => ({ ...prev, action: a.id }))}
                        className={`text-left px-4 py-3 rounded-xl border transition-all text-sm ${
                          answers.action === a.id
                            ? "border-primary bg-primary/5 text-foreground font-medium"
                            : "border-border bg-card text-muted-foreground hover:border-primary/40"
                        }`}
                      >
                        {a.emoji} {a.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Navigation */}
              <div className="flex justify-between pt-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => step === 1 ? setView("audit") : setStep(s => s - 1)}
                  className="rounded-pill gap-1"
                >
                  <ChevronLeft className="h-4 w-4" />
                  {step === 1 ? "Retour" : "Précédent"}
                </Button>

                {step < 5 ? (
                  <Button size="sm" onClick={() => setStep(s => s + 1)} className="rounded-pill gap-1">
                    Suivant <ChevronRight className="h-4 w-4" />
                  </Button>
                ) : (
                  <Button onClick={handleGenerate} disabled={generating} className="rounded-pill gap-2">
                    {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                    Générer ma bio
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════
           VIEW: RESULTS (3 versions)
           ═══════════════════════════════════════ */}
        {view === "results" && (
          <div className="space-y-6 animate-fade-in">
            <h2 className="font-display text-lg font-bold text-foreground">✨ 3 propositions de bio</h2>
            <AiGeneratedMention />

            {versions.map((v, i) => (
              <div key={i} className="rounded-2xl border border-border bg-card p-6 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-display text-sm font-bold text-foreground">Version {String.fromCharCode(65 + i)} : {v.label}</h3>
                  <span className={`text-xs px-2 py-0.5 rounded-pill ${v.character_count <= 150 ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                    {v.character_count}/150 car.
                  </span>
                </div>
                <p className="text-xs text-muted-foreground italic">{v.style_note}</p>
                <BioPreviewCard bio={v.bio_text} />
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" className="rounded-pill gap-1.5" onClick={() => copyBio(v.bio_text, `v${i}`)}>
                    {copiedField === `v${i}` ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    {copiedField === `v${i}` ? "Copié !" : "Copier"}
                  </Button>
                  <Button size="sm" className="rounded-pill gap-1.5 bg-green-600 hover:bg-green-700 text-white" onClick={() => handleValidate(v.bio_text)}>
                    ✅ C'est celle-là !
                  </Button>
                </div>
              </div>
            ))}

            <div className="flex flex-wrap gap-3">
              <Button variant="outline" className="rounded-pill gap-2" onClick={handleGenerate} disabled={generating}>
                {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Regénérer 3 nouvelles versions
              </Button>
              <Button variant="outline" className="rounded-pill gap-2" onClick={() => { setSelectedLines([]); setView("mixer"); }}>
                <Blend className="h-4 w-4" /> Mixer : prendre des bouts de chaque
              </Button>
              <Button variant="ghost" className="rounded-pill" onClick={() => { setStep(1); setView("generator"); }}>
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

            {/* Preview */}
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

        {/* Guide (always visible except during generator) */}
        {view !== "generator" && (
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
