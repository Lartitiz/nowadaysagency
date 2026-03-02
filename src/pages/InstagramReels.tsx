import { useState, useEffect } from "react";
import { parseAIResponse } from "@/lib/parse-ai-response";
import { useWorkspaceFilter, useWorkspaceId } from "@/hooks/use-workspace-query";
import { useBrandProfile } from "@/hooks/use-profile";
import { useUserPlan } from "@/hooks/use-user-plan";
import CreditWarning from "@/components/CreditWarning";
import { useBrandProposition, useBrandStrategy, useEditorialLine } from "@/hooks/use-branding";
import BaseReminder from "@/components/BaseReminder";
import AiGeneratedMention from "@/components/AiGeneratedMention";
import ContentScoring from "@/components/ContentScoring";
import FeedbackLoop from "@/components/FeedbackLoop";
import PreGenQuestions, { PreGenAnswers } from "@/components/PreGenQuestions";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import AppHeader from "@/components/AppHeader";
import ContentProgressBar from "@/components/ContentProgressBar";
import ContentActions from "@/components/ContentActions";
import ReturnToOrigin from "@/components/ReturnToOrigin";
import { Link, useNavigate, useSearchParams, useLocation } from "react-router-dom";
import { ArrowLeft, Loader2, Copy, RefreshCw, CalendarDays, Info, Lightbulb } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TextareaWithVoice as Textarea } from "@/components/ui/textarea-with-voice";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import ReelInspirationUpload from "@/components/ReelInspirationUpload";
import RedFlagsChecker from "@/components/RedFlagsChecker";

// ── Types ──
interface Hook {
  id: string;
  type: string;
  type_label: string;
  text: string;
  word_count?: number;
  estimated_seconds?: number;
  text_overlay: string;
  format_recommande: string;
  format_label: string;
  duree_cible: string;
}

interface ScriptSection {
  section: string;
  timing: string;
  format_visuel: string;
  texte_parle: string;
  texte_overlay: string | null;
  cut: string | null;
  tip: string | null;
}

interface AmplificationStory {
  text: string;
  sticker_type: string;
  sticker_options: string[] | null;
}

interface ChecklistItem {
  item: string;
  auto: boolean;
}

interface ScriptResult {
  format_type: string;
  format_label: string;
  duree_cible: string;
  duree_justification: string;
  objectif: string;
  personal_tip?: string | null;
  script: ScriptSection[];
  caption: { text: string; cta: string };
  hashtags: string[];
  cover_text: string;
  alt_text: string;
  amplification_stories: AmplificationStory[];
  checklist: ChecklistItem[];
  garde_fou_alerte: string | null;
}

// ── Constants ──
const OBJECTIVES = [
  { id: "reach", emoji: "🚀", label: "Reach / Viralité", desc: "Toucher un max de nouvelles personnes" },
  { id: "saves", emoji: "💾", label: "Saves / Expert·e", desc: "Contenu qu'on sauvegarde" },
  { id: "engagement", emoji: "💬", label: "Engagement", desc: "Faire réagir, commenter, partager" },
  { id: "conversion", emoji: "💰", label: "Conversion", desc: "Amener vers ton offre" },
  { id: "branding", emoji: "🎨", label: "Branding / Ambiance", desc: "Montrer ton univers" },
];

const FACECAM_OPTIONS = [
  { id: "oui", emoji: "🎥", label: "Oui", desc: "Je parle à la caméra" },
  { id: "non", emoji: "📝", label: "Non", desc: "Texte overlay + B-roll + musique" },
  { id: "mixte", emoji: "🔀", label: "Mixte", desc: "Face cam + plans de coupe" },
];

const TIME_OPTIONS = [
  { id: "5min", emoji: "⚡", label: "5 min", desc: "Reel simple, 1 plan" },
  { id: "15min", emoji: "⏱️", label: "15 min", desc: "Reel avec quelques cuts" },
  { id: "30min", emoji: "🎬", label: "30 min", desc: "Reel travaillé, multi-plans" },
];

const DURATION_GUIDE = [
  { duree: "7-15 sec", retention: "60-80%", ideal: "Viralité, loops, fun" },
  { duree: "15-30 sec", retention: "40-60%", ideal: "Sweet spot polyvalent" },
  { duree: "30-60 sec", retention: "30-50%", ideal: "Storytelling, tutos" },
  { duree: "60-90 sec", retention: "25-40%", ideal: "Engagement profond" },
];

const REELS_TIPS = [
  { text: "1,7 seconde. C'est le temps que les gens mettent pour décider de rester ou scroller. Ton hook est tout.", source: "Données rétention Instagram" },
  { text: "Les partages en DM comptent 3 à 5 fois plus que les likes pour toucher de nouvelles personnes. Crée du contenu 'envoyable'.", source: "Adam Mosseri, Head of Instagram" },
  { text: "Un Reel de 10 sec avec 80% de rétention bat toujours un Reel de 60 sec avec 30%. C'est pas la durée, c'est 'garder les gens'.", source: "OpusClip" },
  { text: "Repartage ton Reel en story dans l'heure qui suit. C'est un signal croisé qui booste les deux algorithmes.", source: "Best practice Instagram" },
  { text: "Les petits comptes (<50K) sont dans le sweet spot : Instagram booste les créateur·ices émergent·es en Reels.", source: "Benchmarks créateur·ices Instagram" },
  { text: "Les Reels éducatifs convertissent mieux que les trends dansantes. Le divertissement attire des vues, l'éducation attire des client·es.", source: "Tendances Instagram" },
  { text: "60-80% des gens regardent sans le son. Pas de sous-titres = message invisible.", source: "Sprout Social" },
  { text: "Les Reels 'face cam brut' surperforment les Reels ultra-produits.", source: "Tendances Instagram" },
  { text: "La caption ne doit pas répéter le Reel. C'est un second hook + des mots-clés SEO + un CTA.", source: "Best practice" },
  { text: "Les comptes qui postent 3-5 Reels/semaine doublent leur croissance vs 1/semaine.", source: "Buffer" },
];

const HOOK_TYPE_EMOJIS: Record<string, string> = {
  confession: "🎤",
  affirmation_contraire: "💥",
  resultat_concret: "🔥",
  interpellation: "👉",
  teaser: "🔮",
  analogie: "🪞",
};

export default function InstagramReels() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { column, value } = useWorkspaceFilter();
  const workspaceId = useWorkspaceId();
  const { data: hookBrandProfile } = useBrandProfile();
  const { data: propositionData } = useBrandProposition();
  const { data: strategyData } = useBrandStrategy();
  const { data: editorialLineData } = useEditorialLine();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const calendarId = searchParams.get("calendar_id");
  const calendarState = location.state as any;
  const fromObjectif = searchParams.get("objectif");
  const fromSujet = searchParams.get("sujet") ? decodeURIComponent(searchParams.get("sujet")!) : "";

  // Pre-fill from calendar
  useEffect(() => {
    if (calendarState?.fromCalendar) {
      if (calendarState.theme) setSubject(calendarState.theme);
      if (calendarState.objectif) setObjective(calendarState.objectif);
      if (calendarState.notes) setSubject((prev) => prev ? `${prev}\n\nNotes: ${calendarState.notes}` : calendarState.notes);
      
      // Auto-start if we have enough info
      if (calendarState.theme && !hooks.length) {
        // Optional: could trigger handleGenerateHooks here if we wanted auto-start
      }
    } else if (calendarId && user) {
      // Fallback: fetch if no state passed (e.g. direct link)
      supabase.from("calendar_posts").select("*").eq("id", calendarId).single().then(({ data }) => {
        if (data) {
          if (data.theme) setSubject(data.theme);
          if (data.objectif) setObjective(data.objectif);
          if (data.notes) setSubject((prev) => prev ? `${prev}\n\nNotes: ${data.notes}` : data.notes);
        }
      });
    }
  }, [calendarId, user, calendarState]);
  // Flow state — steps: 1=objective, 2=facecam, 3=subject, 4=time, 5=launch, 6=hooks, 6.5=preGenQ, 7=script
  const [step, setStep] = useState(1);
  const [objective, setObjective] = useState("");
  const [faceCam, setFaceCam] = useState("");
  const [subject, setSubject] = useState("");
  const [timeAvailable, setTimeAvailable] = useState("");
  const [isLaunch, setIsLaunch] = useState<boolean | null>(null);

  // Pre-fill from URL params
  useEffect(() => {
    if (fromObjectif && !objective) {
      const objMap: Record<string, string> = { visibilite: "reach", confiance: "saves", vente: "conversion", credibilite: "engagement" };
      const mapped = objMap[fromObjectif] || fromObjectif;
      if (OBJECTIVES.some(o => o.id === mapped)) setObjective(mapped);
    }
    if (fromSujet && !subject) setSubject(fromSujet);
  }, [fromObjectif, fromSujet]);

  const REEL_STEPS = [
    { key: "setup", label: "Paramètres" },
    { key: "hooks", label: "Hooks" },
    { key: "questions", label: "Questions" },
    { key: "script", label: "Script" },
  ];
  const stepKeyMap: Record<number, string> = { 1: "setup", 2: "setup", 3: "setup", 4: "setup", 5: "setup" };
  const currentStepKey = step === 7 ? "script" : step === 6.5 ? "questions" : step === 6 ? "hooks" : stepKeyMap[step] || "setup";

  // Results
  const [hooks, setHooks] = useState<Hook[]>([]);
  const [selectedHook, setSelectedHook] = useState<Hook | null>(null);
  const [preGenAnswers, setPreGenAnswers] = useState<PreGenAnswers | null>(null);
  const [scriptResult, setScriptResult] = useState<ScriptResult | null>(null);
  const [checkedItems, setCheckedItems] = useState<Record<number, boolean>>({});
  const [loading, setLoading] = useState(false);
  const { canGenerate, remainingTotal } = useUserPlan();
  const quotaBlocked = !canGenerate("content");
  const [showDurationGuide, setShowDurationGuide] = useState(false);
  const [inspirationAnalysis, setInspirationAnalysis] = useState<any>(null);
  const [cachedBrandingCtx, setCachedBrandingCtx] = useState<string>("");

  // Random tip
  const [tipIndex] = useState(() => Math.floor(Math.random() * REELS_TIPS.length));
  const currentTip = REELS_TIPS[tipIndex];

  const fetchBrandingContext = (): string => {
    if (!user) return "";
    const lines: string[] = [];
    const p = hookBrandProfile as any;
    if (p) {
      if (p.mission) lines.push(`Mission : ${p.mission}`);
      if (p.offer) lines.push(`Offre : ${p.offer}`);
      if (p.target_description) lines.push(`Cible : ${p.target_description}`);
      if (p.tone_register) lines.push(`Registre : ${p.tone_register}`);
      if (p.key_expressions) lines.push(`Expressions clés : ${p.key_expressions}`);
      if (p.things_to_avoid) lines.push(`À éviter : ${p.things_to_avoid}`);
      if (p.voice_description) lines.push(`Voix : ${p.voice_description}`);
      if (p.combat_cause) lines.push(`Cause : ${p.combat_cause}`);
    }
    const prop = propositionData as any;
    if (prop?.version_final) lines.push(`Proposition : ${prop.version_final}`);
    const s = strategyData as any;
    if (s?.pillar_major) lines.push(`Pilier majeur : ${s.pillar_major}`);
    const e = editorialLineData as any;
    if (e) {
      if (e.main_objective) lines.push(`Objectif Instagram : ${e.main_objective}`);
      const insights = e.content_insights as any;
      if (insights?.reels_best_format) lines.push(`Format Reel star : ${insights.reels_best_format}`);
      if (insights?.reels_best_hook) lines.push(`Hook Reel star : ${insights.reels_best_hook}`);
    }
    return lines.length ? `CONTEXTE BRANDING :\n${lines.join("\n")}` : "";
  };

  const handleGenerateHooks = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const brandingContext = fetchBrandingContext();
      setCachedBrandingCtx(brandingContext);
      const inspCtx = inspirationAnalysis ? `Patterns : ${inspirationAnalysis.patterns_communs}\nRecommandation : ${inspirationAnalysis.recommandation}` : undefined;
      const { data, error } = await supabase.functions.invoke("reels-ai", {
        body: { type: "hooks", objective, face_cam: faceCam, subject, time_available: timeAvailable, is_launch: isLaunch, branding_context: brandingContext, inspiration_context: inspCtx, workspace_id: workspaceId },
      });
      if (error) throw error;
      const parsed = parseAIResponse(data?.content || "");
      setHooks(parsed.hooks || []);
      setStep(6);
    } catch (e) {
      console.error(e);
      toast.error("Erreur lors de la génération des hooks.");
    } finally {
      setLoading(false);
    }
  };

  const handleSelectHook = (hook: Hook) => {
    setSelectedHook(hook);
    setStep(6.5); // Show pre-gen questions
  };

  const handlePreGenSubmit = (answers: PreGenAnswers) => {
    setPreGenAnswers(answers);
    if (selectedHook) handleGenerateScript(selectedHook, answers);
  };

  const handlePreGenSkip = () => {
    setPreGenAnswers(null);
    if (selectedHook) handleGenerateScript(selectedHook, null);
  };

  const handleGenerateScript = async (hook: Hook, answers: PreGenAnswers | null) => {
    if (!user) return;
    setLoading(true);
    try {
      const brandingContext = cachedBrandingCtx || fetchBrandingContext();
      const inspCtx = inspirationAnalysis ? `Patterns : ${inspirationAnalysis.patterns_communs}\nRecommandation : ${inspirationAnalysis.recommandation}` : undefined;
      const { data, error } = await supabase.functions.invoke("reels-ai", {
        body: {
          type: "script",
          objective,
          face_cam: faceCam,
          subject,
          time_available: timeAvailable,
          is_launch: isLaunch,
          branding_context: brandingContext,
          selected_hook: hook,
          pre_gen_answers: answers || undefined,
          inspiration_context: inspCtx,
          workspace_id: workspaceId,
        },
      });
      if (error) throw error;
      const parsed: ScriptResult = parseAIResponse(data?.content || "");
      setScriptResult(parsed);

      // Pre-check auto items
      const autoChecked: Record<number, boolean> = {};
      parsed.checklist.forEach((item, i) => { if (item.auto) autoChecked[i] = true; });
      setCheckedItems(autoChecked);

      // Save to DB
      await supabase.from("reels_scripts" as any).insert({
        user_id: user.id,
        objective,
        face_cam: faceCam,
        subject: subject || null,
        time_available: timeAvailable,
        is_launch: isLaunch,
        hook_type: hook.type,
        hook_text: hook.text,
        format_type: parsed.format_type,
        duree_cible: parsed.duree_cible,
        script_result: parsed as any,
        caption: parsed.caption.text,
        hashtags: parsed.hashtags as any,
        cover_text: parsed.cover_text,
        alt_text: parsed.alt_text,
      });

      setStep(7);
    } catch (e) {
      console.error(e);
      toast.error("Erreur lors de la génération du script.");
    } finally {
      setLoading(false);
    }
  };

  const sectionBadgeColor = (section: string) => {
    switch (section) {
      case "hook": return "bg-primary/10 text-primary border-primary/20";
      case "cta": return "bg-green-100 text-green-700 border-green-200";
      default: return "bg-accent/50 text-accent-foreground border-accent";
    }
  };

  const sectionEmoji = (section: string) => {
    switch (section) {
      case "hook": return "🪝";
      case "cta": return "🎯";
      default: return "📖";
    }
  };

  // ── Loading ──
  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader />
        <main className="mx-auto max-w-3xl px-4 sm:px-6 py-16 text-center">
          <Loader2 className="h-10 w-10 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">{step < 6 ? "L'IA prépare tes hooks..." : "L'IA écrit ton script Reel..."}</p>
        </main>
      </div>
    );
  }

  // ── STEP 7: Script result ──
  if (step === 7 && scriptResult) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader />
        <main className="mx-auto max-w-3xl px-6 py-8 max-md:px-4">
          <ReturnToOrigin />
          <ContentProgressBar steps={REEL_STEPS} currentStep={currentStepKey} />

          <div className="mb-6">
            <h1 className="font-display text-2xl font-bold text-foreground">🎬 Ton script Reel</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Format : {scriptResult.format_label} · {scriptResult.duree_cible} · Objectif : {OBJECTIVES.find(o => o.id === objective)?.label || objective}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground italic">⏱️ {scriptResult.duree_justification}</p>
          </div>

          {scriptResult.garde_fou_alerte && (
            <div className="mb-6 rounded-xl border border-primary/30 bg-rose-pale p-4 text-sm text-foreground">
              ⚠️ {scriptResult.garde_fou_alerte}
            </div>
          )}

          {scriptResult.personal_tip && (
            <div className="mb-6 rounded-xl border border-dashed border-accent bg-accent/10 p-4 text-sm text-foreground">
              💡 {scriptResult.personal_tip}
            </div>
          )}

          {/* Script sections */}
          <div className="space-y-4">
            {scriptResult.script.map((section, idx) => (
              <div key={idx} className="rounded-2xl border border-border bg-card p-5 space-y-3">
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${sectionBadgeColor(section.section)}`}>
                    {sectionEmoji(section.section)} {section.section.toUpperCase()} · {section.timing}
                  </span>
                </div>

                <p className="text-xs text-muted-foreground">{section.format_visuel}</p>

                <p className="text-[15px] leading-relaxed text-foreground whitespace-pre-line">
                  "{section.texte_parle}"
                </p>

                {section.texte_overlay && (
                  <div className="border-l-[3px] border-accent bg-accent/20 rounded-r-lg px-4 py-2">
                    <p className="text-sm font-bold text-accent-foreground">📝 {section.texte_overlay}</p>
                  </div>
                )}

                {section.cut && (
                  <p className="text-xs text-muted-foreground italic bg-muted/50 rounded-lg px-3 py-1.5">
                    ✂️ CUT → {section.cut}
                  </p>
                )}

                {section.tip && (
                  <p className="text-xs text-muted-foreground">💡 {section.tip}</p>
                )}
              </div>
            ))}
          </div>

          {/* Red flags checker on script */}
          <div className="mt-4">
            <RedFlagsChecker
              content={scriptResult.script.map(s => s.texte_parle).join("\n")}
              onFix={(fixed) => {
                const parts = fixed.split("\n");
                setScriptResult(prev => {
                  if (!prev) return prev;
                  const updatedScript = prev.script.map((s, i) => ({
                    ...s,
                    texte_parle: parts[i] !== undefined ? parts[i] : s.texte_parle,
                  }));
                  return { ...prev, script: updatedScript };
                });
              }}
            />
          </div>

          {/* Caption */}
          <div className="mt-6 rounded-2xl border border-border bg-card p-5 space-y-3">
            <h3 className="font-display text-sm font-bold text-foreground">📝 CAPTION</h3>
            <p className="text-sm text-foreground whitespace-pre-line">{scriptResult.caption.text}</p>
            <p className="text-sm text-primary font-medium">{scriptResult.caption.cta}</p>
            <p className="text-xs text-muted-foreground">{scriptResult.hashtags.join(" ")}</p>
          </div>

          {/* Cover + Alt text */}
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-xs font-semibold text-muted-foreground mb-1">🖼️ COVER</p>
              <p className="text-sm text-foreground">{scriptResult.cover_text}</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-xs font-semibold text-muted-foreground mb-1">📝 ALT TEXT</p>
              <p className="text-sm text-foreground">{scriptResult.alt_text}</p>
            </div>
          </div>

          {/* Amplification stories */}
          {scriptResult.amplification_stories?.length > 0 && (
            <div className="mt-6 rounded-2xl border border-accent bg-accent/10 p-5 space-y-3">
              <h3 className="font-display text-sm font-bold text-foreground">📱 STORIES D'AMPLIFICATION (à poster dans l'heure)</h3>
              {scriptResult.amplification_stories.map((story, i) => (
                <div key={i} className="rounded-xl border border-border bg-card p-4">
                  <p className="text-sm text-foreground">{story.text}</p>
                  <p className="text-xs text-primary font-medium mt-1">
                    🎯 Sticker : {story.sticker_type}{story.sticker_options ? ` → ${story.sticker_options.join(" / ")}` : ""}
                  </p>
                </div>
              ))}
            </div>
          )}

          {/* Checklist */}
          <div className="mt-6 rounded-2xl border border-border bg-card p-5 space-y-3">
            <h3 className="font-display text-sm font-bold text-foreground">✅ CHECKLIST AVANT DE POSTER</h3>
            <div className="space-y-2">
              {scriptResult.checklist.map((item, i) => (
                <label key={i} className="flex items-center gap-2 cursor-pointer">
                  <Checkbox
                    checked={!!checkedItems[i]}
                    onCheckedChange={(v) => setCheckedItems(prev => ({ ...prev, [i]: !!v }))}
                  />
                  <span className={`text-sm ${checkedItems[i] ? "text-foreground" : "text-muted-foreground"}`}>{item.item}</span>
                  {item.auto && <span className="text-[10px] text-primary font-medium">✓ Auto</span>}
                </label>
              ))}
            </div>
            <p className="text-xs text-muted-foreground italic">💡 Les cases marquées ✓ Auto ont été vérifiées automatiquement. Les autres sont à vérifier manuellement.</p>
          </div>

          {/* Actions */}
          <ContentActions
            content={scriptResult.script.map(s => `[${s.timing}] ${s.section.toUpperCase()}\n🎥 ${s.format_visuel}\n\n"${s.texte_parle}"${s.texte_overlay ? `\n\n📝 Texte overlay : ${s.texte_overlay}` : ""}${s.cut ? `\n\n✂️ CUT → ${s.cut}` : ""}`).join("\n\n───────────────\n\n") + `\n\n--- CAPTION ---\n${scriptResult.caption.text}\n\n${scriptResult.caption.cta}\n\n${scriptResult.hashtags.join(" ")}`}
            canal="instagram"
            format="reel"
            theme={subject || scriptResult.format_label}
            objectif={objective}
            calendarPostId={calendarId || undefined}
            onRegenerate={() => { setScriptResult(null); setStep(6); }}
            regenerateLabel="Rechoisir le hook"
            calendarData={{
              storySequenceDetail: {
                type: "reel",
                format_type: scriptResult.format_type,
                format_label: scriptResult.format_label,
                duree_cible: scriptResult.duree_cible,
                script: scriptResult.script,
                caption: scriptResult.caption,
                hashtags: scriptResult.hashtags,
                cover_text: scriptResult.cover_text,
                alt_text: scriptResult.alt_text,
                amplification_stories: scriptResult.amplification_stories,
                hook: selectedHook ? {
                  text: selectedHook.text,
                  type: selectedHook.type,
                  type_label: selectedHook.type_label,
                  text_overlay: selectedHook.text_overlay,
                } : null,
                personal_elements: preGenAnswers ? {
                  vecu: preGenAnswers.anecdote || null,
                  punchline: preGenAnswers.conviction || null,
                } : null,
              },
              accroche: selectedHook?.text || "",
            }}
            ideasData={{
              type: "reel",
              format_type: scriptResult.format_type,
              format_label: scriptResult.format_label,
              duree_cible: scriptResult.duree_cible,
              script: scriptResult.script,
              caption: scriptResult.caption,
              hashtags: scriptResult.hashtags,
              cover_text: scriptResult.cover_text,
              alt_text: scriptResult.alt_text,
              hook: selectedHook ? { text: selectedHook.text, type: selectedHook.type } : null,
            }}
            ideasContentType="reel"
            className="mt-6"
          />

          {/* Feedback loop for script */}
          <div className="mt-6">
            <FeedbackLoop
              content={scriptResult.script.map(s => `[${s.timing}] ${s.texte_parle}`).join("\n\n")}
              onUpdate={() => {
                toast.info("Regénère le script avec un nouveau hook pour appliquer tes retours.");
              }}
            />
          </div>

          {/* Content scoring for caption */}
          <div className="mt-4">
            <ContentScoring
              content={`${scriptResult.caption.text}\n\n${scriptResult.caption.cta}`}
              format="reel"
              objective={objective}
            />
          </div>

          <AiGeneratedMention />
          <BaseReminder variant="reels" />
        </main>
      </div>
    );
  }

  // ── STEP 6.5: Pre-gen questions ──
  if (step === 6.5 && selectedHook) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader />
        <main className="mx-auto max-w-3xl px-6 py-8 max-md:px-4">
          <button onClick={() => setStep(6)} className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline mb-6">
            <ArrowLeft className="h-4 w-4" /> Retour aux hooks
          </button>

          <div className="mb-6 rounded-2xl border border-primary/20 bg-rose-pale p-4">
            <p className="text-xs font-semibold text-muted-foreground mb-1">Hook sélectionné</p>
            <p className="text-[15px] font-medium text-foreground">"{selectedHook.text}"</p>
          </div>

          {/* Voice test */}
          <div className="mb-6 rounded-xl border border-dashed border-accent bg-accent/10 p-4">
            <p className="text-sm font-semibold text-foreground mb-1">🎤 Test rapide</p>
            <p className="text-xs text-muted-foreground">
              Dis ton hook à voix haute. ✅ Tu l'as dit en une respiration ? C'est bon. ❌ Tu as dû reprendre ton souffle ? Trop long.
            </p>
            <p className="text-xs text-muted-foreground mt-1 italic">💡 Le hook, c'est le premier contact. Pas le résumé. Le développement vient APRÈS.</p>
          </div>

          <PreGenQuestions
            variant="reels"
            onSubmit={handlePreGenSubmit}
            onSkip={handlePreGenSkip}
          />
        </main>
      </div>
    );
  }

  // ── STEP 6: Hook selection ──
  if (step === 6 && hooks.length > 0) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader />
        <main className="mx-auto max-w-3xl px-6 py-8 max-md:px-4">
          <button onClick={() => setStep(5)} className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline mb-6">
            <ArrowLeft className="h-4 w-4" /> Retour
          </button>

          <h1 className="font-display text-2xl font-bold text-foreground mb-2">🎬 Choisis ton hook</h1>
          <p className="text-sm text-muted-foreground mb-1">Sujet : {subject || "(suggéré par l'IA)"}</p>
          <p className="text-xs text-muted-foreground mb-6">Un bon hook se dit en 2 secondes face cam. Si tu dois reprendre ta respiration, c'est trop long.</p>

          <div className="space-y-3">
            {hooks.map((hook) => {
              const wordCount = hook.word_count || hook.text.split(/\s+/).length;
              const estSec = hook.estimated_seconds || Math.max(1.5, Math.min(3, wordCount * 0.3));
              const emoji = HOOK_TYPE_EMOJIS[hook.type] || "🪝";

              return (
                <button
                  key={hook.id}
                  onClick={() => handleSelectHook(hook)}
                  className="w-full rounded-2xl border border-border bg-card p-5 text-left hover:border-primary hover:shadow-md transition-all"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-lg">{emoji}</span>
                    <span className="text-xs font-semibold text-primary bg-rose-pale px-2 py-0.5 rounded-full">{hook.type_label}</span>
                    <span className="text-xs text-muted-foreground">· {wordCount} mots · ~{Number(estSec).toFixed(1)} sec</span>
                  </div>
                  <p className="text-[15px] font-medium text-foreground leading-relaxed">"{hook.text}"</p>
                  {hook.text_overlay && (
                    <p className="mt-2 text-xs font-bold text-accent-foreground bg-accent/20 rounded px-2 py-1 inline-block">
                      📝 {hook.text_overlay}
                    </p>
                  )}
                  <p className="mt-2 text-xs text-muted-foreground">
                    📊 Durée cible : {hook.duree_cible} · Format : {hook.format_label}
                  </p>
                </button>
              );
            })}
          </div>

          <button
            onClick={handleGenerateHooks}
            className="mt-4 text-sm text-primary font-medium hover:underline"
          >
            🔄 Proposer 3 autres hooks
          </button>
        </main>
      </div>
    );
  }

  // ── STEPS 1-5: Form flow ──
  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-3xl px-6 py-8 max-md:px-4">
        <ReturnToOrigin />
        <ContentProgressBar steps={REEL_STEPS} currentStep={currentStepKey} />

        <h1 className="font-display text-2xl font-bold text-foreground mb-2">🎬 Générateur de Scripts Reels</h1>
        <p className="text-sm text-muted-foreground mb-6">Flow guidé → 3 hooks au choix → script complet prêt à filmer.</p>
        <CreditWarning remaining={remainingTotal()} className="mb-4" />

        {/* Tip rotatif */}
        <div className="mb-8 rounded-2xl border border-dashed border-primary/30 bg-rose-pale p-4">
          <p className="text-sm text-foreground">💡 {currentTip.text}</p>
          <p className="text-[10px] text-muted-foreground mt-1">— {currentTip.source}</p>
        </div>

        {/* Inspiration upload */}
        <ReelInspirationUpload onAnalysisComplete={setInspirationAnalysis} />

        {/* Step 1: Objective */}
        <div className="mb-8">
          <h2 className="font-display text-lg font-bold text-foreground mb-3">1. Quel est ton objectif avec ce Reel ?</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {OBJECTIVES.map((o) => (
              <button
                key={o.id}
                onClick={() => { setObjective(o.id); if (step < 2) setStep(2); }}
                className={`rounded-2xl border p-4 text-left transition-all ${objective === o.id ? "border-primary bg-rose-pale" : "border-border bg-card hover:border-primary/50"}`}
              >
                <span className="text-lg">{o.emoji}</span>
                <p className="font-display text-sm font-bold mt-1">{o.label}</p>
                <p className="text-xs text-muted-foreground">{o.desc}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Step 2: Face cam */}
        {step >= 2 && (
          <div className="mb-8">
            <h2 className="font-display text-lg font-bold text-foreground mb-3">2. Tu veux être face cam ?</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {FACECAM_OPTIONS.map((o) => (
                <button
                  key={o.id}
                  onClick={() => { setFaceCam(o.id); if (step < 3) setStep(3); }}
                  className={`rounded-2xl border p-4 text-left transition-all ${faceCam === o.id ? "border-primary bg-rose-pale" : "border-border bg-card hover:border-primary/50"}`}
                >
                  <span className="text-lg">{o.emoji}</span>
                  <p className="font-display text-sm font-bold mt-1">{o.label}</p>
                  <p className="text-xs text-muted-foreground">{o.desc}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 3: Subject */}
        {step >= 3 && (
          <div className="mb-8">
            <h2 className="font-display text-lg font-bold text-foreground mb-3">3. C'est sur quel sujet ?</h2>
            <Textarea
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Les erreurs en bio Instagram... (laisse vide et l'IA proposera un sujet)"
              className="min-h-[60px]"
            />
            <Button size="sm" className="mt-3" onClick={() => { if (step < 4) setStep(4); }} variant={step >= 4 ? "outline" : "default"}>
              {subject ? "Suivant →" : "Laisser l'IA choisir →"}
            </Button>
          </div>
        )}

        {/* Step 4: Time */}
        {step >= 4 && (
          <div className="mb-8">
            <div className="flex items-center gap-2 mb-3">
              <h2 className="font-display text-lg font-bold text-foreground">4. Tu as combien de temps pour filmer ?</h2>
              <button onClick={() => setShowDurationGuide(!showDurationGuide)} className="text-muted-foreground hover:text-primary">
                <Info className="h-4 w-4" />
              </button>
            </div>

            {showDurationGuide && (
              <div className="mb-4 rounded-xl border border-border bg-card p-4">
                <p className="text-xs font-bold text-foreground mb-2">⏱️ Guide des durées</p>
                <table className="w-full text-xs">
                  <thead><tr className="text-muted-foreground"><th className="text-left py-1">Durée</th><th className="text-left py-1">Rétention</th><th className="text-left py-1">Idéal pour</th></tr></thead>
                  <tbody>
                    {DURATION_GUIDE.map((d) => (
                      <tr key={d.duree} className="border-t border-border"><td className="py-1 font-medium">{d.duree}</td><td className="py-1">{d.retention}</td><td className="py-1">{d.ideal}</td></tr>
                    ))}
                  </tbody>
                </table>
                <p className="mt-2 text-[10px] text-muted-foreground italic">💡 Un Reel de 10 sec avec 80% de rétention bat TOUJOURS un Reel de 60 sec avec 30%.</p>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {TIME_OPTIONS.map((o) => (
                <button
                  key={o.id}
                  onClick={() => { setTimeAvailable(o.id); if (step < 5) setStep(5); }}
                  className={`rounded-2xl border p-4 text-left transition-all ${timeAvailable === o.id ? "border-primary bg-rose-pale" : "border-border bg-card hover:border-primary/50"}`}
                >
                  <span className="text-lg">{o.emoji}</span>
                  <p className="font-display text-sm font-bold mt-1">{o.label}</p>
                  <p className="text-xs text-muted-foreground">{o.desc}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 5: Launch context */}
        {step >= 5 && (
          <div className="mb-8">
            <h2 className="font-display text-lg font-bold text-foreground mb-3">5. Tu es en période de lancement ?</h2>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => { setIsLaunch(true); }}
                className={`rounded-2xl border p-4 text-left transition-all ${isLaunch === true ? "border-primary bg-rose-pale" : "border-border bg-card hover:border-primary/50"}`}
              >
                <span className="text-lg">🚀</span>
                <p className="font-display text-sm font-bold mt-1">Oui</p>
              </button>
              <button
                onClick={() => { setIsLaunch(false); }}
                className={`rounded-2xl border p-4 text-left transition-all ${isLaunch === false ? "border-primary bg-rose-pale" : "border-border bg-card hover:border-primary/50"}`}
              >
                <span className="text-lg">🌊</span>
                <p className="font-display text-sm font-bold mt-1">Non</p>
              </button>
            </div>

            <CreditWarning remaining={remainingTotal()} className="mb-3" />
            <Button className="mt-3 w-full" size="lg" onClick={handleGenerateHooks} disabled={!objective || !faceCam || !timeAvailable || quotaBlocked}>
              ✨ Générer mes hooks
            </Button>
            {(!objective || !faceCam || !timeAvailable) && (
              <p className="text-xs text-muted-foreground mt-2">
                {!objective ? "☝️ Choisis un objectif (étape 1)" : !faceCam ? "☝️ Choisis un mode face cam (étape 2)" : "☝️ Indique ton temps disponible (étape 4)"}
              </p>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
