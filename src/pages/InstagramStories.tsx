import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import AppHeader from "@/components/AppHeader";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { ArrowLeft, Loader2, Copy, RefreshCw, CalendarDays, Sparkles, Mic, Lightbulb } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TextareaWithVoice as Textarea } from "@/components/ui/textarea-with-voice";
import SubjectPicker, { type SubjectPickerResult } from "@/components/stories/SubjectPicker";
import { toast } from "sonner";
import StickerGuide from "@/components/engagement/StickerGuide";
import StoryChecklist from "@/components/stories/StoryChecklist";
import { AddToCalendarDialog } from "@/components/calendar/AddToCalendarDialog";
import { SaveToIdeasDialog } from "@/components/SaveToIdeasDialog";

// Types
interface StorySticker {
  type: string;
  label: string;
  options?: string[];
  placement?: string;
}

interface HookOption {
  text: string;
  word_count: number;
  label: string;
}

interface StoryItem {
  number: number;
  timing: string;
  timing_emoji: string;
  role: string;
  format: string;
  format_label: string;
  text: string;
  hook_options?: { option_a: HookOption; option_b: HookOption } | null;
  sticker: StorySticker | null;
  tip: string;
  face_cam: boolean;
  sous_titres_needed: boolean;
}

interface SequenceResult {
  structure_type: string;
  structure_label: string;
  total_stories: number;
  estimated_time: string;
  stickers_used: string[];
  garde_fou_alerte: string | null;
  personal_tip: string | null;
  stories: StoryItem[];
}

// Objectives
const OBJECTIVES = [
  { id: "connexion", emoji: "💛", label: "Connexion", desc: "Créer du lien, montrer tes coulisses" },
  { id: "education", emoji: "📚", label: "Éducation", desc: "Enseigner, donner de la valeur" },
  { id: "vente", emoji: "💰", label: "Vente", desc: "Présenter une offre, convertir" },
  { id: "engagement", emoji: "💬", label: "Engagement", desc: "Faire réagir, booster l'algo" },
  { id: "amplification", emoji: "📣", label: "Amplification", desc: "Promouvoir un post feed ou reel" },
];

const PRICE_RANGES = [
  { id: "petit", emoji: "☕", label: "Petit prix (< 100€)", desc: "Atelier, e-book, template" },
  { id: "moyen", emoji: "💼", label: "Moyen (100-500€)", desc: "Formation, service" },
  { id: "premium", emoji: "💎", label: "Premium (500€+)", desc: "Programme, accompagnement" },
  { id: "gratuit", emoji: "🎁", label: "Gratuit", desc: "Freebie, lead magnet" },
  { id: "physique", emoji: "📦", label: "Produit physique", desc: "Artisanat, collection" },
];

const TIME_OPTIONS = [
  { id: "5min", emoji: "⚡", label: "5 min", desc: "1-2 stories texte/photo" },
  { id: "15min", emoji: "⏱️", label: "15 min", desc: "3-5 stories mixtes" },
  { id: "30min", emoji: "🎬", label: "30 min", desc: "5-8 stories avec face cam" },
];

const FACECAM_OPTIONS = [
  { id: "oui", emoji: "🎥", label: "Oui", desc: "Vidéo face cam" },
  { id: "non", emoji: "📝", label: "Non", desc: "Texte + visuels" },
  { id: "mixte", emoji: "🔀", label: "Mixte", desc: "Les deux" },
];

const ENERGY_OPTIONS = [
  { id: "punchy", emoji: "🔥", label: "Punchy" },
  { id: "intime", emoji: "🫶", label: "Intime" },
  { id: "pedago", emoji: "📚", label: "Pédago" },
  { id: "drole", emoji: "😄", label: "Drôle" },
  { id: "coup_de_gueule", emoji: "😤", label: "Coup de gueule doux" },
];

export default function InstagramStories() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const highlightState = location.state as any;

  // Form state
  const [step, setStep] = useState(1);
  const [objective, setObjective] = useState("");
  const [priceRange, setPriceRange] = useState("");
  const [timeAvailable, setTimeAvailable] = useState("");
  const [faceCam, setFaceCam] = useState("");
  const [subject, setSubject] = useState("");
  const [subjectDetails, setSubjectDetails] = useState("");
  const [rawIdea, setRawIdea] = useState("");
  const [clarifyContext, setClarifyContext] = useState("");
  const [subjectDirection, setSubjectDirection] = useState("");
  const [isLaunch, setIsLaunch] = useState(false);
  const [subjectDone, setSubjectDone] = useState(false);
  const [brandingCtx, setBrandingCtx] = useState("");
  const [showStickerGuide, setShowStickerGuide] = useState(false);

  // Pre-gen questions
  const [preGenVecu, setPreGenVecu] = useState("");
  const [preGenEnergy, setPreGenEnergy] = useState("");
  const [preGenMessage, setPreGenMessage] = useState("");

  // Hook selection for story 1
  const [selectedHookOption, setSelectedHookOption] = useState<"a" | "b" | null>(null);
  const [showCalendarDialog, setShowCalendarDialog] = useState(false);
  const [showIdeasDialog, setShowIdeasDialog] = useState(false);

  // Pre-fill from highlights navigation
  useEffect(() => {
    if (highlightState?.fromHighlights) {
      if (highlightState.objective) setObjective(highlightState.objective);
      if (highlightState.price_range) setPriceRange(highlightState.price_range);
      if (highlightState.time_available) setTimeAvailable(highlightState.time_available);
      if (highlightState.face_cam) setFaceCam(highlightState.face_cam);
      if (highlightState.subject) { setSubject(highlightState.subject); setSubjectDone(true); }
      setStep(3);
    }
  }, []);

  // Pre-fetch branding context for SubjectPicker
  useEffect(() => {
    if (user && !brandingCtx) fetchBrandingContext().then(setBrandingCtx);
  }, [user?.id]);

  // Result state
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SequenceResult | null>(null);

  const handleGenerate = async (isDaily = false) => {
    if (!user) return;
    setLoading(true);

    try {
      const preGenAnswers = (preGenVecu || preGenEnergy || preGenMessage) ? {
        vecu: preGenVecu || undefined,
        energy: preGenEnergy || undefined,
        message_cle: preGenMessage || undefined,
      } : undefined;

      const { data: brandRes } = await supabase.functions.invoke("stories-ai", {
        body: {
          type: isDaily ? "daily" : "generate",
          objective,
          price_range: priceRange,
          time_available: timeAvailable,
          face_cam: faceCam,
          subject,
          subject_details: subjectDetails || undefined,
          raw_idea: rawIdea || undefined,
          clarify_context: clarifyContext || undefined,
          direction: subjectDirection || undefined,
          is_launch: isLaunch,
          branding_context: await fetchBrandingContext(),
          pre_gen_answers: isDaily ? undefined : preGenAnswers,
        },
      });

      if (brandRes?.error) {
        toast.error(brandRes.error);
        setLoading(false);
        return;
      }

      const raw = brandRes?.content || "";
      const jsonStr = raw.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
      const parsed: SequenceResult = JSON.parse(jsonStr);
      setResult(parsed);
      setSelectedHookOption(null);

      // Save to DB
      const { error: saveError } = await supabase.from("stories_sequences" as any).insert({
        user_id: user.id,
        objective: isDaily ? "quotidien" : objective,
        price_range: priceRange || null,
        time_available: isDaily ? "10min" : timeAvailable,
        face_cam: isDaily ? "mixte" : faceCam,
        subject: subject || null,
        is_launch: isLaunch,
        structure_type: parsed.structure_type,
        total_stories: parsed.total_stories,
        sequence_result: parsed as any,
      });

      if (saveError) console.error("Save error:", saveError);
      setStep(6); // Results step
    } catch (e) {
      console.error(e);
      toast.error("Erreur lors de la génération. Réessaie.");
    }
    setLoading(false);
  };

  const fetchBrandingContext = async (): Promise<string> => {
    if (!user) return "";
    const lines: string[] = [];

    const [profRes, toneRes, propRes, stratRes, editoRes] = await Promise.all([
      supabase.from("brand_profile").select("mission, offer, target_description, tone_register, key_expressions, things_to_avoid").eq("user_id", user.id).maybeSingle(),
      supabase.from("brand_profile").select("voice_description, tone_style, tone_humor, combat_cause").eq("user_id", user.id).maybeSingle(),
      supabase.from("brand_proposition").select("version_final").eq("user_id", user.id).maybeSingle(),
      supabase.from("brand_strategy").select("pillar_major, pillar_minor_1, pillar_minor_2, pillar_minor_3").eq("user_id", user.id).maybeSingle(),
      supabase.from("instagram_editorial_line").select("main_objective, pillars, preferred_formats, posts_frequency, stories_frequency").eq("user_id", user.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    ]);

    const p = profRes.data;
    if (p) {
      if (p.mission) lines.push(`Mission : ${p.mission}`);
      if (p.offer) lines.push(`Offre : ${p.offer}`);
      if (p.target_description) lines.push(`Cible : ${p.target_description}`);
      if (p.tone_register) lines.push(`Registre : ${p.tone_register}`);
      if (p.key_expressions) lines.push(`Expressions clés : ${p.key_expressions}`);
      if (p.things_to_avoid) lines.push(`À éviter : ${p.things_to_avoid}`);
    }
    const t = toneRes.data;
    if (t) {
      if (t.voice_description) lines.push(`Voix : ${t.voice_description}`);
      if (t.combat_cause) lines.push(`Cause : ${t.combat_cause}`);
    }
    if (propRes.data?.version_final) lines.push(`Proposition : ${propRes.data.version_final}`);
    const s = stratRes.data;
    if (s?.pillar_major) lines.push(`Pilier majeur : ${s.pillar_major}`);
    const e = editoRes.data;
    if (e) {
      if (e.main_objective) lines.push(`Objectif Instagram : ${e.main_objective}`);
      if (e.stories_frequency) lines.push(`Fréquence stories : ${e.stories_frequency}`);
    }

    return lines.length ? `CONTEXTE BRANDING :\n${lines.join("\n")}` : "";
  };

  const handleAddToCalendar = async (dateStr: string) => {
    if (!user || !result) return;
    const { error } = await supabase.from("calendar_posts").insert({
      user_id: user.id,
      date: dateStr,
      theme: subject || `Stories : ${result.structure_label}`,
      canal: "instagram",
      format: "story_serie",
      objectif: objective,
      stories_count: result.total_stories,
      stories_structure: result.structure_label,
      stories_objective: objective,
      content_draft: result.stories.map((s) => `Story ${s.number} (${s.role}) : ${s.text}`).join("\n\n"),
      status: "ready",
      story_sequence_detail: {
        ...result,
        personal_elements: {
          vecu: preGenVecu || null,
          energy: preGenEnergy || null,
          message_cle: preGenMessage || null,
        },
      } as any,
    });
    setShowCalendarDialog(false);
    if (error) {
      toast.error("Erreur lors de l'ajout au calendrier");
    } else {
      toast.success("Séquence ajoutée au calendrier !");
    }
  };

  const handleCopyAll = () => {
    if (!result) return;
    const text = result.stories
      .map((s) => `${s.timing_emoji} STORY ${s.number} · ${s.role}\n${s.format_label}\n\n${s.text}${s.sticker ? `\n\n🎯 Sticker : ${s.sticker.label}${s.sticker.options ? ` → ${s.sticker.options.join(" / ")}` : ""}` : ""}`)
      .join("\n\n───────────────\n\n");
    navigator.clipboard.writeText(text);
    toast.success("Séquence copiée !");
  };

  const handleSelectHook = (option: "a" | "b") => {
    if (!result) return;
    setSelectedHookOption(option);
    const hookOpts = result.stories[0]?.hook_options;
    if (hookOpts) {
      const newText = option === "a" ? hookOpts.option_a.text : hookOpts.option_b.text;
      const updatedStories = [...result.stories];
      updatedStories[0] = { ...updatedStories[0], text: newText };
      setResult({ ...result, stories: updatedStories });
    }
  };

  const timingColor = (timing: string) => {
    switch (timing) {
      case "matin": return "bg-rose-pale text-primary";
      case "midi": return "bg-secondary text-secondary-foreground";
      case "soir": return "bg-accent text-accent-foreground";
      default: return "bg-muted text-muted-foreground";
    }
  };

  // Render loading
  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader />
        <main className="mx-auto max-w-3xl px-6 py-16 text-center">
          <Loader2 className="h-10 w-10 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">L'IA crée ta séquence stories...</p>
        </main>
      </div>
    );
  }

  // Results step
  if (step === 6 && result) {
    const story1 = result.stories[0];
    const hasHookOptions = story1?.hook_options?.option_a && story1?.hook_options?.option_b;

    return (
      <div className="min-h-screen bg-background">
        <AppHeader />
        <main className="mx-auto max-w-3xl px-6 py-8 max-md:px-4">
          <button onClick={() => { setStep(1); setResult(null); setPreGenVecu(""); setPreGenEnergy(""); setPreGenMessage(""); setSubjectDone(false); setSubjectDetails(""); setRawIdea(""); setClarifyContext(""); setSubjectDirection(""); }} className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline mb-6">
            <ArrowLeft className="h-4 w-4" /> Nouvelle séquence
          </button>

          <div className="mb-6">
            <h1 className="font-display text-2xl font-bold text-foreground">📱 Ta séquence stories</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Type : {result.structure_label} · {result.total_stories} stories · ~{result.estimated_time}
            </p>
            {result.stickers_used?.length > 0 && (
              <p className="text-xs text-muted-foreground mt-1">Stickers : {result.stickers_used.join(", ")}</p>
            )}
          </div>

          {result.garde_fou_alerte && (
            <div className="mb-6 rounded-xl border border-primary/30 bg-rose-pale p-4 text-sm text-foreground">
              {result.garde_fou_alerte}
            </div>
          )}

          {/* Hook options for story 1 */}
          {hasHookOptions && !selectedHookOption && (
            <div className="mb-6 rounded-2xl border border-primary/30 bg-card p-5">
              <h2 className="font-display text-base font-bold text-foreground mb-1">🎬 Story 1 · Choisis ton accroche</h2>
              <p className="text-xs text-muted-foreground mb-4">La story 1, c'est l'apéro. Pas le plat principal. Moins tu en dis, plus on veut la suite.</p>
              <div className="space-y-3">
                <button
                  onClick={() => handleSelectHook("a")}
                  className="w-full rounded-xl border border-border bg-background p-4 text-left hover:border-primary transition-colors"
                >
                  <p className="text-xs font-semibold text-primary mb-1">Option A : {story1.hook_options!.option_a.label}</p>
                  <p className="text-[15px] font-medium text-foreground">"{story1.hook_options!.option_a.text}"</p>
                  <p className="text-xs text-muted-foreground mt-1">{story1.hook_options!.option_a.word_count} mots · {story1.format_label}</p>
                </button>
                <button
                  onClick={() => handleSelectHook("b")}
                  className="w-full rounded-xl border border-border bg-background p-4 text-left hover:border-primary transition-colors"
                >
                  <p className="text-xs font-semibold text-primary mb-1">Option B : {story1.hook_options!.option_b.label}</p>
                  <p className="text-[15px] font-medium text-foreground">"{story1.hook_options!.option_b.text}"</p>
                  <p className="text-xs text-muted-foreground mt-1">{story1.hook_options!.option_b.word_count} mots · {story1.format_label}</p>
                </button>
              </div>
            </div>
          )}

          <div className="space-y-4">
            {result.stories.map((story) => (
              <div key={story.number} className="rounded-2xl border border-border bg-card p-5">
                <div className="flex items-center gap-2 mb-3">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${timingColor(story.timing)}`}>
                    {story.timing_emoji} {story.timing.charAt(0).toUpperCase() + story.timing.slice(1)}
                  </span>
                  <span className="font-display text-sm font-bold text-foreground">
                    Story {story.number} · {story.role}
                  </span>
                </div>

                <p className="text-xs text-muted-foreground mb-2">{story.format_label}</p>

                <p className="text-[15px] leading-relaxed text-foreground whitespace-pre-line">{story.text}</p>

                {story.sous_titres_needed && (
                  <p className="mt-2 text-xs text-muted-foreground">💡 Prévois les sous-titres (60-80% regardent sans le son)</p>
                )}

                {story.sticker && (
                  <div className="mt-3 rounded-xl border border-primary/20 bg-rose-pale p-3">
                    <p className="text-sm font-semibold text-primary">🎯 {story.sticker.label}</p>
                    {story.sticker.options && (
                      <p className="text-xs text-muted-foreground mt-0.5">{story.sticker.options.join(" / ")}</p>
                    )}
                  </div>
                )}

                {story.tip && (
                  <p className="mt-3 text-xs text-muted-foreground italic">💡 {story.tip}</p>
                )}
              </div>
            ))}
          </div>

          {/* Post-generation micro-copy */}
          <div className="mt-6 rounded-2xl border border-dashed border-primary/30 bg-rose-pale p-5">
            <p className="font-display text-sm font-bold text-foreground mb-2">🚲 Séquence prête. Maintenant fais-la sonner comme toi.</p>
            <div className="space-y-1.5 text-sm text-muted-foreground">
              <p>□ Ajoute un truc vécu (story 1 ou 2)</p>
              <p>□ Dis le face cam avec TES mots (pas au mot près)</p>
              <p>□ Vérifie que le hook arrête le swipe</p>
              <p>□ Ajoute les sous-titres sur les face cam</p>
            </div>
            <p className="mt-3 text-xs text-muted-foreground italic">L'IA structure. Toi, tu incarnes.</p>
            {result.personal_tip && (
              <p className="mt-2 text-xs text-primary font-medium">💡 {result.personal_tip}</p>
            )}
          </div>

          {/* Checklist */}
          <div className="mt-6">
            <StoryChecklist
              hasHook={!!(result.stories[0]?.text)}
              hasSticker={result.stories.some(s => s.sticker !== null)}
              hasCTA={result.stories.some(s => s.role?.toLowerCase().includes("cta") || s.text?.toLowerCase().includes("dm") || s.text?.toLowerCase().includes("écris"))}
              hasFaceCam={result.stories.some(s => s.face_cam)}
            />
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <Button variant="outline" size="sm" onClick={handleCopyAll}>
              <Copy className="h-4 w-4" /> Copier tout
            </Button>
            <Button variant="outline" size="sm" onClick={() => { setResult(null); setStep(1); }}>
              <RefreshCw className="h-4 w-4" /> Regénérer
            </Button>
            <Button size="sm" onClick={() => setShowCalendarDialog(true)}>
              <CalendarDays className="h-4 w-4" /> Ajouter au calendrier
            </Button>
            <Button variant="outline" size="sm" onClick={() => setShowIdeasDialog(true)}>
              <Lightbulb className="h-4 w-4" /> Sauvegarder dans mes idées
            </Button>
          </div>

          <AddToCalendarDialog
            open={showCalendarDialog}
            onOpenChange={setShowCalendarDialog}
            onConfirm={handleAddToCalendar}
            contentLabel={`📱 ${result.total_stories} stories · ${result.structure_label}`}
            contentEmoji="📱"
          />

          <SaveToIdeasDialog
            open={showIdeasDialog}
            onOpenChange={setShowIdeasDialog}
            contentType="stories"
            subject={subject || result.structure_label}
            objectif={objective}
            sourceModule="stories_generator"
            contentData={{
              ...result,
              personal_elements: {
                vecu: preGenVecu || null,
                energy: preGenEnergy || null,
                message_cle: preGenMessage || null,
              },
            }}
            personalElements={preGenVecu || preGenEnergy || preGenMessage ? {
              vecu: preGenVecu || null,
              energy: preGenEnergy || null,
              message_cle: preGenMessage || null,
            } : null}
          />
        </main>
      </div>
    );
  }

  // Steps 1-5 form
  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-3xl px-6 py-8 max-md:px-4">
        <Link to={new URLSearchParams(window.location.search).get("from") || "/instagram/creer"} className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline mb-6">
          <ArrowLeft className="h-4 w-4" /> Retour
        </Link>

        <h1 className="font-display text-2xl font-bold text-foreground mb-2">📱 Générateur de Stories</h1>
        <p className="text-sm text-muted-foreground mb-8">
          Crée des séquences stories complètes avec le bon sticker et le bon CTA.
        </p>

        {/* Sticker guide toggle */}
        {showStickerGuide ? (
          <div className="mb-8 rounded-2xl border border-border bg-card p-5">
            <StickerGuide onClose={() => setShowStickerGuide(false)} />
          </div>
        ) : (
          <>
            {/* Quick buttons row */}
            <div className="flex flex-wrap gap-3 mb-8">
              <button
                onClick={() => handleGenerate(true)}
                className="flex-1 min-w-[200px] rounded-2xl border border-dashed border-primary/30 bg-rose-pale p-4 text-left hover:border-primary transition-colors"
              >
                <p className="font-display text-sm font-bold text-primary">🆘 Pas d'inspi aujourd'hui ?</p>
                <p className="text-xs text-muted-foreground mt-0.5">5 stories du quotidien en 1 clic</p>
              </button>
              <button
                onClick={() => setShowStickerGuide(true)}
                className="flex-1 min-w-[200px] rounded-2xl border border-dashed border-primary/30 bg-rose-pale p-4 text-left hover:border-primary transition-colors"
              >
                <p className="font-display text-sm font-bold text-primary">🎯 Quel sticker utiliser ?</p>
                <p className="text-xs text-muted-foreground mt-0.5">Guide interactif par objectif</p>
              </button>
            </div>

        {/* Step 1: Objective */}
        <div className="mb-8">
          <h2 className="font-display text-lg font-bold text-foreground mb-3">
            1. Quel est ton objectif ?
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {OBJECTIVES.map((o) => (
              <button
                key={o.id}
                onClick={() => { setObjective(o.id); setStep(o.id === "vente" ? 1.5 : 2); }}
                className={`rounded-2xl border p-4 text-left transition-all ${objective === o.id ? "border-primary bg-rose-pale" : "border-border bg-card hover:border-primary/50"}`}
              >
                <span className="text-lg">{o.emoji}</span>
                <p className="font-display text-sm font-bold mt-1">{o.label}</p>
                <p className="text-xs text-muted-foreground">{o.desc}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Step 1.5: Price range (only for vente) */}
        {objective === "vente" && step >= 1.5 && (
          <div className="mb-8">
            <h2 className="font-display text-lg font-bold text-foreground mb-3">Quelle gamme de prix ?</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {PRICE_RANGES.map((pr) => (
                <button
                  key={pr.id}
                  onClick={() => { setPriceRange(pr.id); setStep(2); }}
                  className={`rounded-2xl border p-4 text-left transition-all ${priceRange === pr.id ? "border-primary bg-rose-pale" : "border-border bg-card hover:border-primary/50"}`}
                >
                  <span className="text-lg">{pr.emoji}</span>
                  <p className="font-display text-sm font-bold mt-1">{pr.label}</p>
                  <p className="text-xs text-muted-foreground">{pr.desc}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 2: Constraints */}
        {step >= 2 && (
          <div className="mb-8 space-y-6">
            <div>
              <h2 className="font-display text-lg font-bold text-foreground mb-3">2. Tu as combien de temps ?</h2>
              <div className="grid grid-cols-3 gap-3">
                {TIME_OPTIONS.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setTimeAvailable(t.id)}
                    className={`rounded-2xl border p-4 text-center transition-all ${timeAvailable === t.id ? "border-primary bg-rose-pale" : "border-border bg-card hover:border-primary/50"}`}
                  >
                    <span className="text-lg">{t.emoji}</span>
                    <p className="font-display text-sm font-bold mt-1">{t.label}</p>
                    <p className="text-xs text-muted-foreground">{t.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <h2 className="font-display text-lg font-bold text-foreground mb-3">Tu veux faire de la face cam ?</h2>
              <div className="grid grid-cols-3 gap-3">
                {FACECAM_OPTIONS.map((fc) => (
                  <button
                    key={fc.id}
                    onClick={() => { setFaceCam(fc.id); setStep(3); }}
                    className={`rounded-2xl border p-4 text-center transition-all ${faceCam === fc.id ? "border-primary bg-rose-pale" : "border-border bg-card hover:border-primary/50"}`}
                  >
                    <span className="text-lg">{fc.emoji}</span>
                    <p className="font-display text-sm font-bold mt-1">{fc.label}</p>
                    <p className="text-xs text-muted-foreground">{fc.desc}</p>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Subject picker */}
        {step >= 3 && !subjectDone && (
          <div className="mb-8 space-y-4">
            <SubjectPicker
              onComplete={(result: SubjectPickerResult) => {
                setSubject(result.subject);
                setSubjectDetails(result.subject_details || "");
                setRawIdea(result.raw_idea || "");
                setClarifyContext(result.clarify_context || "");
                setSubjectDirection(result.direction || "");
                setSubjectDone(true);
              }}
              brandingContext={brandingCtx}
            />

            <div className="mt-4">
              <h2 className="font-display text-sm font-bold text-foreground mb-2">Tu es en période de lancement ?</h2>
              <div className="flex gap-3">
                <button
                  onClick={() => setIsLaunch(true)}
                  className={`rounded-xl border px-4 py-2 text-sm transition-all ${isLaunch ? "border-primary bg-rose-pale font-bold" : "border-border bg-card"}`}
                >
                  🚀 Oui
                </button>
                <button
                  onClick={() => setIsLaunch(false)}
                  className={`rounded-xl border px-4 py-2 text-sm transition-all ${!isLaunch ? "border-primary bg-rose-pale font-bold" : "border-border bg-card"}`}
                >
                  🌊 Non
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Step 3 done → show continue to step 4 */}
        {step >= 3 && subjectDone && step < 4 && (
          <div className="mb-8">
            <div className="rounded-xl border border-primary/20 bg-rose-pale p-3 text-sm text-foreground mb-4">
              ✅ Sujet : <span className="font-medium">{subject}</span>
              <button onClick={() => setSubjectDone(false)} className="ml-2 text-xs text-primary hover:underline">Modifier</button>
            </div>
            <Button onClick={() => setStep(4)} className="w-full" disabled={!objective || !timeAvailable || !faceCam}>
              Continuer
            </Button>
          </div>
        )}

        {/* Step 4: Pre-gen questions */}
        {step >= 4 && (
          <div className="mb-8 rounded-2xl border border-primary/20 bg-card p-5">
            <h2 className="font-display text-lg font-bold text-foreground mb-1">💬 Avant de créer ta séquence</h2>
            <p className="text-xs text-muted-foreground mb-5">(Tu peux passer, mais tes stories sonneront plus toi si tu réponds.)</p>

            <div className="space-y-5">
              {/* Question 1 */}
              <div>
                <label className="text-sm font-medium text-foreground block mb-1.5">
                  1. T'as vécu un truc récemment en lien avec ce sujet ?
                </label>
                <p className="text-xs text-muted-foreground mb-2">(un truc client, un moment de ta journée, une galère)</p>
                <Textarea
                  value={preGenVecu}
                  onChange={(e) => setPreGenVecu(e.target.value)}
                  placeholder="Ce matin une cliente m'a dit que..."
                  className="min-h-[60px]"
                />
              </div>

              {/* Question 2 */}
              <div>
                <label className="text-sm font-medium text-foreground block mb-2">
                  2. Tu veux que ta séquence donne quelle énergie ?
                </label>
                <div className="flex flex-wrap gap-2">
                  {ENERGY_OPTIONS.map((en) => (
                    <button
                      key={en.id}
                      onClick={() => setPreGenEnergy(en.id)}
                      className={`rounded-full border px-3 py-1.5 text-sm transition-all ${preGenEnergy === en.id ? "border-primary bg-rose-pale font-bold" : "border-border bg-background hover:border-primary/50"}`}
                    >
                      {en.emoji} {en.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Question 3 */}
              <div>
                <label className="text-sm font-medium text-foreground block mb-1.5">
                  3. Un message que tu veux faire passer ?
                </label>
                <p className="text-xs text-muted-foreground mb-2">(la phrase que tu veux que les gens retiennent)</p>
                <Textarea
                  value={preGenMessage}
                  onChange={(e) => setPreGenMessage(e.target.value)}
                  placeholder="La visibilité, c'est pas de la vanité..."
                  className="min-h-[60px]"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-5">
              <Button onClick={() => handleGenerate(false)} className="flex-1">
                <Sparkles className="h-4 w-4" /> Générer avec mes réponses
              </Button>
              <Button variant="outline" onClick={() => { setPreGenVecu(""); setPreGenEnergy(""); setPreGenMessage(""); handleGenerate(false); }}>
                ⏭️ Passer
              </Button>
            </div>
          </div>
        )}
          </>
        )}
      </main>
    </div>
  );
}
