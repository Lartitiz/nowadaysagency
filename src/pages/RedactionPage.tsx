import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspaceFilter } from "@/hooks/use-workspace-query";
import { useSearchParams, useNavigate } from "react-router-dom";
import AppHeader from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { TextareaWithVoice as Textarea } from "@/components/ui/textarea-with-voice";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { friendlyError } from "@/lib/error-messages";
import SubPageHeader from "@/components/SubPageHeader";
import { Sparkles, Copy, Check, CalendarDays, Save } from "lucide-react";
import { Link } from "react-router-dom";
import { getGuide, getInstagramFormatReco } from "@/lib/production-guides";
import { formatIdToGuideKey, QUALITY_CHECKLIST, OBJECTIFS } from "@/lib/atelier-data";
import BrandingPrompt from "@/components/BrandingPrompt";

const STEPS = [
  { num: 1, label: "Structure" },
  { num: 2, label: "Accroches" },
  { num: 3, label: "Premier jet" },
  { num: 4, label: "Édition" },
  { num: 5, label: "Checklist" },
];

export default function RedactionPage() {
  const { user } = useAuth();
  const { column, value } = useWorkspaceFilter();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const canal = searchParams.get("canal") || "instagram";
  const format = searchParams.get("format") || "";
  const theme = searchParams.get("theme") || "";
  const angle = searchParams.get("angle") || "";
  const objectif = searchParams.get("objectif") || null;

  const [step, setStep] = useState(1);
  const [profile, setProfile] = useState<any>(null);
  const [brandProfile, setBrandProfile] = useState<any>(null);

  // Step 1: Structure
  const [structure, setStructure] = useState<string>("");
  const [loadingStructure, setLoadingStructure] = useState(false);

  // Step 2: Accroches
  const [accroches, setAccroches] = useState<string[]>([]);
  const [selectedAccroche, setSelectedAccroche] = useState<string>("");
  const [customAccroche, setCustomAccroche] = useState("");
  const [loadingAccroches, setLoadingAccroches] = useState(false);

  // Step 3: Draft
  const [draft, setDraft] = useState("");
  const [loadingDraft, setLoadingDraft] = useState(false);

  // Step 4: Edited content
  const [editedContent, setEditedContent] = useState("");

  // Step 5: Checklist
  const [checkedItems, setCheckedItems] = useState<boolean[]>(QUALITY_CHECKLIST.map(() => false));
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);

  // Load profile
  useEffect(() => {
    if (!user) return;
    Promise.all([
      (supabase.from("profiles") as any).select("*").eq(column, value).single(),
      (supabase.from("brand_profile") as any).select("*").eq(column, value).maybeSingle(),
    ]).then(([profRes, bpRes]) => {
      if (profRes.data) setProfile(profRes.data);
      if (bpRes.data) setBrandProfile(bpRes.data);
    });
  }, [user?.id]);

  const mergedProfile = profile
    ? {
        ...profile,
        mission: brandProfile?.mission || profile.mission,
        offre: brandProfile?.offer || profile.offre,
        cible: brandProfile?.target_description || profile.cible,
        probleme_principal: brandProfile?.target_problem || profile.probleme_principal,
        croyances_limitantes: brandProfile?.target_beliefs || profile.croyances_limitantes,
        verbatims: brandProfile?.target_verbatims || profile.verbatims,
        expressions_cles: brandProfile?.key_expressions || profile.expressions_cles,
        ce_quon_evite: brandProfile?.things_to_avoid || profile.ce_quon_evite,
      }
    : null;

  // Get the guide for the format
  const guideKey = format;
  const guideSteps = getGuide(guideKey);
  const formatReco = canal === "instagram" ? getInstagramFormatReco(guideKey) : null;
  const objLabel = OBJECTIFS.find((o) => o.id === objectif)?.label;

  // ── Step 1: Load structure ──
  const loadStructure = async () => {
    if (!mergedProfile) return;
    // Use local guide if available
    if (guideSteps) {
      const text = guideSteps.map((s, i) => `${i + 1}. ${s.label}\n   ${s.detail}`).join("\n\n");
      setStructure(text);
      return;
    }
    // Fallback to AI
    setLoadingStructure(true);
    try {
      const res = await supabase.functions.invoke("generate-content", {
        body: { type: "redaction-structure", profile: mergedProfile, format, sujet: theme, canal },
      });
      if (res.error) throw new Error(res.error.message);
      setStructure(res.data?.content || "");
    } catch (e: any) {
      console.error("Erreur technique:", e);
      toast({ title: "Erreur", description: friendlyError(e), variant: "destructive" });
    } finally {
      setLoadingStructure(false);
    }
  };

  useEffect(() => {
    if (profile) loadStructure();
  }, [profile]);

  // ── Step 2: Generate accroches ──
  const generateAccroches = async () => {
    if (!mergedProfile) return;
    setLoadingAccroches(true);
    try {
      const res = await supabase.functions.invoke("generate-content", {
        body: { type: "redaction-accroches", profile: mergedProfile, format, sujet: theme, canal, objectif },
      });
      if (res.error) throw new Error(res.error.message);
      const content = res.data?.content || "";
      let parsed: string[];
      try {
        parsed = JSON.parse(content);
      } catch {
        const match = content.match(/\[[\s\S]*\]/);
        if (match) parsed = JSON.parse(match[0]);
        else throw new Error("Format de réponse inattendu");
      }
      setAccroches(parsed);
    } catch (e: any) {
      console.error("Erreur technique:", e);
      toast({ title: "Erreur", description: friendlyError(e), variant: "destructive" });
    } finally {
      setLoadingAccroches(false);
    }
  };

  // ── Step 3: Generate draft ──
  const generateDraft = async () => {
    if (!mergedProfile) return;
    setLoadingDraft(true);
    try {
      const chosenAccroche = selectedAccroche || customAccroche;
      const res = await supabase.functions.invoke("generate-content", {
        body: {
          type: "redaction-draft",
          profile: mergedProfile,
          format,
          sujet: theme,
          canal,
          objectif,
          structure,
          accroche: chosenAccroche,
        },
      });
      if (res.error) throw new Error(res.error.message);
      const content = res.data?.content || "";
      setDraft(content);
      setEditedContent(content);
    } catch (e: any) {
      console.error("Erreur technique:", e);
      toast({ title: "Erreur", description: friendlyError(e), variant: "destructive" });
    } finally {
      setLoadingDraft(false);
    }
  };

  // ── Actions ──
  const copyContent = async () => {
    await navigator.clipboard.writeText(editedContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const saveDraft = async () => {
    if (!user) return;
    setSaving(true);
    try {
      await supabase.from("content_drafts").insert({
        user_id: user.id,
        canal,
        objectif,
        format,
        theme,
        accroche: selectedAccroche || customAccroche,
        content: editedContent,
        status: "draft",
      });
      toast({ title: "Brouillon enregistré !" });
    } catch {
      toast({ title: "Erreur", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const planInCalendar = () => {
    navigate(`/calendrier?canal=${canal}&prefill_theme=${encodeURIComponent(theme)}&prefill_content=${encodeURIComponent(editedContent)}`);
  };

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-4xl px-6 py-8 max-md:px-4">
        <SubPageHeader parentLabel="Dashboard" parentTo="/dashboard" currentLabel="Rédaction" />

        <h1 className="font-display text-[26px] font-bold text-foreground mb-1">✏️ Rédiger un contenu</h1>
        <BrandingPrompt section="tone" />
        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground mb-6">
          <span className="bg-rose-pale text-primary px-2 py-0.5 rounded-md font-semibold">{format}</span>
          {objLabel && <span className="bg-muted px-2 py-0.5 rounded-md">{objLabel}</span>}
          <span className="truncate max-w-[200px]">{theme}</span>
        </div>
        {formatReco && (
          <p className="text-xs text-muted-foreground mb-6">📐 {formatReco}</p>
        )}

        {/* ── Stepper ── */}
        <div className="flex items-center gap-1.5 mb-8 overflow-x-auto pb-2">
          {STEPS.map((s) => (
            <button
              key={s.num}
              onClick={() => setStep(s.num)}
              className={`flex items-center gap-1 rounded-pill px-3 py-1.5 text-xs font-medium border transition-all whitespace-nowrap ${
                step === s.num
                  ? "bg-primary text-primary-foreground border-primary"
                  : s.num < step
                    ? "bg-secondary text-foreground border-secondary"
                    : "bg-card text-muted-foreground border-border"
              }`}
            >
              {s.num < step && <Check className="h-3 w-3" />}
              {s.num}. {s.label}
            </button>
          ))}
        </div>

        {/* ── Step 1: Structure ── */}
        {step === 1 && (
          <div className="space-y-4 animate-fade-in">
            <div className="rounded-2xl border border-border bg-card p-6">
              {!format ? (
                <>
                  <h2 className="font-display text-lg font-bold mb-3">Quel format pour ce contenu ?</h2>
                  <p className="text-sm text-muted-foreground mb-4">Choisis un format avant de commencer la rédaction.</p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {[
                      { id: "post_carrousel", label: "📑 Carrousel" },
                      { id: "reel", label: "🎬 Reel" },
                      { id: "post_photo", label: "🖼️ Post" },
                      { id: "stories", label: "📱 Stories" },
                    ].map((f) => (
                      <button
                        key={f.id}
                        onClick={() => {
                          const params = new URLSearchParams(searchParams);
                          params.set("format", f.id);
                          navigate(`/atelier/rediger?${params.toString()}`, { replace: true });
                        }}
                        className="p-4 border border-border rounded-xl hover:border-primary hover:bg-rose-pale transition text-center text-sm font-medium"
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <>
                  <h2 className="font-display text-lg font-bold mb-3">Structure du format "{format}"</h2>
                  <p className="text-sm text-muted-foreground mb-4">
                    Voici le plan détaillé que tu vas suivre pour rédiger ton contenu. C'est ton guide.
                  </p>
                  {loadingStructure ? (
                    <div className="flex gap-1 py-4 justify-center">
                      <div className="h-2.5 w-2.5 rounded-full bg-primary animate-bounce-dot" />
                      <div className="h-2.5 w-2.5 rounded-full bg-primary animate-bounce-dot" style={{ animationDelay: "0.16s" }} />
                      <div className="h-2.5 w-2.5 rounded-full bg-primary animate-bounce-dot" style={{ animationDelay: "0.32s" }} />
                    </div>
                  ) : (
                    <div className="whitespace-pre-wrap text-sm text-foreground bg-muted/30 rounded-xl p-4 leading-relaxed">
                      {structure}
                    </div>
                  )}
                </>
              )}
            </div>
            {format && (
              <Button onClick={() => setStep(2)} className="rounded-pill">
                Étape suivante : Accroches →
              </Button>
            )}
          </div>
        )}

        {/* ── Step 2: Accroches ── */}
        {step === 2 && (
          <div className="space-y-4 animate-fade-in">
            <div className="rounded-2xl border border-border bg-card p-6">
              <h2 className="font-display text-lg font-bold mb-3">Choisis ton accroche</h2>
              <p className="text-sm text-muted-foreground mb-4">
                L'accroche, c'est la première phrase que ta lectrice va voir. Elle doit donner envie de lire la suite.
              </p>

              {accroches.length === 0 && !loadingAccroches && (
                <Button onClick={generateAccroches} className="rounded-pill gap-2">
                  <Sparkles className="h-4 w-4" />
                  Générer 3 accroches
                </Button>
              )}

              {loadingAccroches && (
                <div className="flex items-center gap-3 py-4 justify-center">
                  <div className="flex gap-1">
                    <div className="h-2.5 w-2.5 rounded-full bg-primary animate-bounce-dot" />
                    <div className="h-2.5 w-2.5 rounded-full bg-primary animate-bounce-dot" style={{ animationDelay: "0.16s" }} />
                    <div className="h-2.5 w-2.5 rounded-full bg-primary animate-bounce-dot" style={{ animationDelay: "0.32s" }} />
                  </div>
                  <span className="text-sm italic text-muted-foreground">L'IA rédige des accroches...</span>
                </div>
              )}

              {accroches.length > 0 && !loadingAccroches && (
                <div className="space-y-2 mb-4">
                  {accroches.map((a, i) => (
                    <button
                      key={i}
                      onClick={() => { setSelectedAccroche(a); setCustomAccroche(""); }}
                      className={`w-full text-left rounded-xl border p-4 text-sm transition-all ${
                        selectedAccroche === a
                          ? "border-primary bg-rose-pale"
                          : "border-border bg-card hover:border-primary/40"
                      }`}
                    >
                      "{a}"
                    </button>
                  ))}
                  <Button variant="outline" onClick={generateAccroches} size="sm" className="rounded-pill gap-1.5 mt-2">
                    <Sparkles className="h-3.5 w-3.5" />
                    Regénérer
                  </Button>
                </div>
              )}

              {/* Custom accroche */}
              <div className="mt-4">
                <label className="text-xs font-medium text-muted-foreground block mb-1.5">Ou écris la tienne</label>
                <Textarea
                  value={customAccroche}
                  onChange={(e) => { setCustomAccroche(e.target.value); setSelectedAccroche(""); }}
                  placeholder="Ton accroche personnalisée..."
                  className="min-h-[60px]"
                />
              </div>
            </div>
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setStep(1)} className="rounded-pill">Retour</Button>
              <Button
                onClick={() => setStep(3)}
                disabled={!selectedAccroche && !customAccroche}
                className="rounded-pill"
              >
                Étape suivante : Premier jet →
              </Button>
            </div>
          </div>
        )}

        {/* ── Step 3: First draft ── */}
        {step === 3 && (
          <div className="space-y-4 animate-fade-in">
            <div className="rounded-2xl border border-border bg-card p-6">
              <h2 className="font-display text-lg font-bold mb-3">Génère le premier jet</h2>
              <p className="text-sm text-muted-foreground mb-4">
                L'IA va rédiger un premier jet basé sur ta structure, ton accroche et ton profil de marque.
              </p>

              {!draft && !loadingDraft && (
                <Button onClick={generateDraft} className="rounded-pill gap-2">
                  <Sparkles className="h-4 w-4" />
                  Générer le contenu
                </Button>
              )}

              {loadingDraft && (
                <div className="flex items-center gap-3 py-8 justify-center">
                  <div className="flex gap-1">
                    <div className="h-2.5 w-2.5 rounded-full bg-primary animate-bounce-dot" />
                    <div className="h-2.5 w-2.5 rounded-full bg-primary animate-bounce-dot" style={{ animationDelay: "0.16s" }} />
                    <div className="h-2.5 w-2.5 rounded-full bg-primary animate-bounce-dot" style={{ animationDelay: "0.32s" }} />
                  </div>
                  <span className="text-sm italic text-muted-foreground">L'IA rédige ton contenu...</span>
                </div>
              )}

              {draft && !loadingDraft && (
                <div className="whitespace-pre-wrap text-sm text-foreground bg-muted/30 rounded-xl p-4 leading-relaxed">
                  {draft}
                </div>
              )}
            </div>
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setStep(2)} className="rounded-pill">Retour</Button>
              {draft && (
                <Button onClick={() => setStep(4)} className="rounded-pill">
                  Étape suivante : Édition →
                </Button>
              )}
            </div>
          </div>
        )}

        {/* ── Step 4: Edit ── */}
        {step === 4 && (
          <div className="space-y-4 animate-fade-in">
            <div className="rounded-2xl border border-border bg-card p-6">
              <h2 className="font-display text-lg font-bold mb-3">Édite ton contenu</h2>
              <p className="text-sm text-muted-foreground mb-4">
                C'est ton texte maintenant. Modifie-le à ta guise pour qu'il te ressemble à 100%.
              </p>
              <Textarea
                value={editedContent}
                onChange={(e) => setEditedContent(e.target.value)}
                className="min-h-[300px] text-sm leading-relaxed"
              />
            </div>
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setStep(3)} className="rounded-pill">Retour</Button>
              <Button onClick={() => setStep(5)} className="rounded-pill">
                Étape suivante : Checklist →
              </Button>
            </div>
          </div>
        )}

        {/* ── Step 5: Quality checklist ── */}
        {step === 5 && (
          <div className="space-y-4 animate-fade-in">
            <div className="rounded-2xl border border-border bg-card p-6">
              <h2 className="font-display text-lg font-bold mb-3">Checklist qualité</h2>
              <p className="text-sm text-muted-foreground mb-4">
                Avant de publier, vérifie ces points.
              </p>
              <div className="space-y-3">
                {QUALITY_CHECKLIST.map((item, i) => (
                  <label key={i} className="flex items-center gap-2.5 cursor-pointer">
                    <Checkbox
                      checked={checkedItems[i]}
                      onCheckedChange={(v) => setCheckedItems((prev) => prev.map((c, j) => (j === i ? !!v : c)))}
                    />
                    <span className={`text-sm ${checkedItems[i] ? "line-through text-muted-foreground" : "text-foreground"}`}>
                      {item}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-wrap gap-3">
              <Button onClick={copyContent} variant="outline" className="rounded-pill gap-1.5">
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copied ? "Copié !" : "Copier le texte"}
              </Button>
              <Button onClick={saveDraft} variant="outline" disabled={saving} className="rounded-pill gap-1.5">
                <Save className="h-4 w-4" />
                {saving ? "Enregistré !" : "Enregistrer le brouillon"}
              </Button>
              <Button onClick={planInCalendar} variant="ghost" className="rounded-pill gap-1.5">
                <CalendarDays className="h-4 w-4" />
                Planifier dans le calendrier
              </Button>
            </div>

            <Button variant="outline" onClick={() => setStep(4)} className="rounded-pill">Retour</Button>
          </div>
        )}
      </main>
    </div>
  );
}
