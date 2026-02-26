import { useState, useEffect } from "react";
import { parseAIResponse } from "@/lib/parse-ai-response";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspaceFilter, useWorkspaceId } from "@/hooks/use-workspace-query";
import { supabase } from "@/integrations/supabase/client";
import { useBrandProfile } from "@/hooks/use-profile";
import AppHeader from "@/components/AppHeader";
import ContentProgressBar from "@/components/ContentProgressBar";
import ContentActions from "@/components/ContentActions";
import ReturnToOrigin from "@/components/ReturnToOrigin";
import BaseReminder from "@/components/BaseReminder";
import { Link, useNavigate, useLocation, useSearchParams } from "react-router-dom";
import { ArrowLeft, Loader2, Copy, RefreshCw, CalendarDays, Sparkles, Mic, Lightbulb } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TextareaWithVoice as Textarea } from "@/components/ui/textarea-with-voice";
import SubjectPicker, { type SubjectPickerResult } from "@/components/stories/SubjectPicker";
import { toast } from "sonner";
import StickerGuide from "@/components/engagement/StickerGuide";
import StoryChecklist from "@/components/stories/StoryChecklist";
import { AddToCalendarDialog } from "@/components/calendar/AddToCalendarDialog";
import { SaveToIdeasDialog } from "@/components/SaveToIdeasDialog";
import { useFormPersist } from "@/hooks/use-form-persist";
import { DraftRestoredBanner } from "@/components/DraftRestoredBanner";
import RedFlagsChecker from "@/components/RedFlagsChecker";

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
  const { column, value } = useWorkspaceFilter();
  const workspaceId = useWorkspaceId();
  const { data: hookBrandProfile } = useBrandProfile();
  const location = useLocation();
  
  const [searchParams] = useSearchParams();
  const calendarId = searchParams.get("calendar_id");
  const calendarState = location.state as any;
  const fromObjectif = searchParams.get("objectif");
  const fromSujet = searchParams.get("sujet") ? decodeURIComponent(searchParams.get("sujet")!) : "";

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

  // Results
  const [sequenceResult, setSequenceResult] = useState<SequenceResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [showCalendarDialog, setShowCalendarDialog] = useState(false);
  const [showIdeasDialog, setShowIdeasDialog] = useState(false);

  // Pre-fill from calendar
  useEffect(() => {
    if (calendarState?.fromCalendar) {
      if (calendarState.theme) setSubject(calendarState.theme);
      if (calendarState.objectif) setObjective(calendarState.objectif);
      if (calendarState.notes) setSubject((prev) => prev ? `${prev}\n\nNotes: ${calendarState.notes}` : calendarState.notes);
    } else if (calendarId && user) {
      // Fallback: fetch if no state passed
      supabase.from("calendar_posts").select("*").eq("id", calendarId).single().then(({ data }) => {
        if (data) {
          if (data.theme) setSubject(data.theme);
          if (data.objectif) setObjective(data.objectif);
          if (data.notes) setSubject((prev) => prev ? `${prev}\n\nNotes: ${data.notes}` : data.notes);
        }
      });
    }
  }, [calendarId, user, calendarState]);

  // Pre-fill from URL params
  useEffect(() => {
    if (fromObjectif && !objective) {
      const objMap: Record<string, string> = { visibilite: "connexion", confiance: "education", vente: "vente", credibilite: "engagement" };
      const mapped = objMap[fromObjectif] || fromObjectif;
      if (OBJECTIVES.some(o => o.id === mapped)) setObjective(mapped);
    }
    if (fromSujet && !subject) setSubject(fromSujet);
  }, [fromObjectif, fromSujet]);

  const STORIES_STEPS = [
    { key: "setup", label: "Paramètres" },
    { key: "generate", label: "Séquence" },
    { key: "edit", label: "Édition" },
  ];
  const currentStepKey = step === 5 ? "edit" : "setup";

  const { restored: draftRestored, clearDraft } = useFormPersist(
    "stories-form",
    { step, objective, priceRange, timeAvailable, faceCam, subject, subjectDetails, rawIdea, clarifyContext, subjectDirection, isLaunch, subjectDone },
    (saved) => {
      // Don't restore if coming from calendar/ideas
      if (location.state || searchParams.get("calendar_id")) return;
      
      if (saved.step) setStep(saved.step);
      if (saved.objective) setObjective(saved.objective);
      if (saved.priceRange) setPriceRange(saved.priceRange);
      if (saved.timeAvailable) setTimeAvailable(saved.timeAvailable);
      if (saved.faceCam) setFaceCam(saved.faceCam);
      if (saved.subject) setSubject(saved.subject);
      if (saved.subjectDetails) setSubjectDetails(saved.subjectDetails);
      if (saved.rawIdea) setRawIdea(saved.rawIdea);
      if (saved.clarifyContext) setClarifyContext(saved.clarifyContext);
      if (saved.subjectDirection) setSubjectDirection(saved.subjectDirection);
      if (saved.isLaunch) setIsLaunch(saved.isLaunch);
      if (saved.subjectDone) setSubjectDone(saved.subjectDone);
    }
  );

  // Fetch branding context
  useEffect(() => {
    if (hookBrandProfile) {
      const data = hookBrandProfile as any;
      setBrandingCtx(`Ton: ${data.tone_register || "Authentique"}\nCible: ${data.target_description || "Entrepreneures"}\nMission: ${data.mission || ""}`);
    }
  }, [hookBrandProfile]);


  const handleGenerate = async (quickMode = false) => {
    if (!user) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("stories-ai", {
        body: {
          type: "sequence",
          objective: quickMode ? "connexion" : objective,
          price_range: priceRange,
          time_available: quickMode ? "5min" : timeAvailable,
          face_cam: quickMode ? "mixte" : faceCam,
          subject: quickMode ? "Ma journée (quick gen)" : subject,
          subject_details: subjectDetails,
          subject_direction: subjectDirection,
          branding_context: brandingCtx,
          is_launch: isLaunch,
          pre_gen_answers: quickMode ? undefined : {
            vecu: preGenVecu,
            energy: preGenEnergy,
            message_cle: preGenMessage,
          }
        },
      });

      if (error) throw error;
      const parsed = parseAIResponse(data?.content || "");
      
      setSequenceResult(parsed);
      setStep(5); // Result view
      clearDraft(); // Clear draft on success
    } catch (e) {
      console.error(e);
      toast.error("Erreur lors de la génération.");
    } finally {
      setLoading(false);
    }
  };

  const handleAddToCalendar = async (dateStr: string) => {
    if (!user || !sequenceResult) return;

    if (calendarId) {
      const { error } = await supabase.from("calendar_posts")
        .update({
          stories_count: sequenceResult.total_stories,
          stories_structure: sequenceResult.structure_label,
          stories_objective: objective,
          status: "ready",
          content_draft: sequenceResult.stories.map((s: any, i: number) => `Story ${i + 1}: ${s.texte || s.text || s.description || ""}`).join("\n\n"),
          story_sequence_detail: {
            stories: sequenceResult.stories,
            stickers_used: sequenceResult.stickers_used,
            garde_fou_alerte: sequenceResult.garde_fou_alerte,
            personal_tip: sequenceResult.personal_tip,
          } as any,
          updated_at: new Date().toISOString(),
        })
        .eq("id", calendarId);
      
      if (error) {
        toast.error("Erreur lors de la mise à jour");
      } else {
        toast.success("Séquence mise à jour !");
        setShowCalendarDialog(false);
      }
      return;
    }

    const { error } = await supabase.from("calendar_posts").insert({
      user_id: user.id, workspace_id: workspaceId !== user.id ? workspaceId : undefined,
      date: dateStr,
      theme: subject || sequenceResult.structure_label,
      canal: "instagram",
      format: "story_serie",
      objectif: objective,
      status: "ready",
      content_draft: sequenceResult.stories.map((s: any, i: number) => `Story ${i + 1}: ${s.texte || s.text || s.description || ""}`).join("\n\n"),
      stories_count: sequenceResult.total_stories,
      stories_structure: sequenceResult.structure_label,
      stories_objective: objective,
      stories_timing: {},
      story_sequence_detail: {
        stories: sequenceResult.stories,
        stickers_used: sequenceResult.stickers_used,
        garde_fou_alerte: sequenceResult.garde_fou_alerte,
        personal_tip: sequenceResult.personal_tip,
      } as any,
    });
    setShowCalendarDialog(false);
    if (error) toast.error("Erreur lors de l'ajout");
    else toast.success("Séquence ajoutée au calendrier !");
  };

  const handleCopySequence = () => {
    if (!sequenceResult) return;
    const text = sequenceResult.stories.map(s => `STORY ${s.number} (${s.timing})\n${s.format_label}\n\n"${s.text}"\n\n🎯 Sticker: ${s.sticker ? `${s.sticker.label}` : "Aucun"}\n💡 Tip: ${s.tip}`).join("\n\n───────────────\n\n");
    navigator.clipboard.writeText(text);
    toast.success("Séquence copiée !");
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader />
        <main className="mx-auto max-w-3xl px-6 py-16 text-center">
          <Loader2 className="h-10 w-10 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">L'IA imagine ta séquence de stories...</p>
        </main>
      </div>
    );
  }

  // ── STEP 5: Result ──
  if (step === 5 && sequenceResult) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader />
        <main className="mx-auto max-w-3xl px-6 py-8 max-md:px-4">
          <ReturnToOrigin />
          <ContentProgressBar steps={STORIES_STEPS} currentStep={currentStepKey} />

          <div className="mb-6">
            <h1 className="font-display text-2xl font-bold text-foreground">📱 Ta séquence Stories</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {sequenceResult.total_stories} stories · {sequenceResult.structure_label} · {sequenceResult.estimated_time}
            </p>
          </div>

          {sequenceResult.garde_fou_alerte && (
            <div className="mb-6 rounded-xl border border-primary/30 bg-rose-pale p-4 text-sm text-foreground">
              ⚠️ {sequenceResult.garde_fou_alerte}
            </div>
          )}

          {sequenceResult.personal_tip && (
            <div className="mb-6 rounded-xl border border-dashed border-accent bg-accent/10 p-4 text-sm text-foreground">
              💡 {sequenceResult.personal_tip}
            </div>
          )}

          {/* Stories list */}
          <div className="space-y-6">
            {sequenceResult.stories.map((story, i) => (
              <div key={i} className="relative pl-8 md:pl-0">
                {/* Connector line for mobile */}
                {i < sequenceResult.stories.length - 1 && (
                  <div className="absolute left-[15px] top-10 bottom-[-24px] w-0.5 bg-border md:hidden" />
                )}
                
                <div className="rounded-2xl border border-border bg-card p-5 space-y-3 relative">
                  {/* Badge number */}
                  <div className="absolute -left-3 top-5 w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center border-2 border-background md:static md:w-auto md:h-auto md:bg-transparent md:text-primary md:border-none md:justify-start md:mb-2 md:inline-flex md:items-center md:gap-2">
                    <span className="hidden md:inline">STORY {story.number}</span>
                    <span className="md:hidden">{story.number}</span>
                    <span className="hidden md:inline-block text-muted-foreground font-normal text-xs ml-2">
                      {story.timing_emoji} {story.timing}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 mb-2 md:hidden">
                    <span className="text-xs text-muted-foreground">{story.timing_emoji} {story.timing}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold px-2.5 py-1 rounded-full border bg-accent/10 text-accent-foreground border-accent/20">
                      {story.format_label}
                    </span>
                    {story.face_cam && <span className="text-xs text-muted-foreground">🎥 Face cam</span>}
                  </div>

                  <p className="text-[15px] leading-relaxed text-foreground whitespace-pre-line">
                    "{story.text}"
                  </p>

                  {story.sticker && (
                    <div className="border-l-[3px] border-primary bg-primary/5 rounded-r-lg px-4 py-2 mt-3">
                      <p className="text-sm font-bold text-primary-text">
                        🎯 Sticker : {story.sticker.label}
                        {story.sticker.options && <span className="font-normal text-foreground"> → {story.sticker.options.join(" / ")}</span>}
                      </p>
                      {story.sticker.placement && (
                        <p className="text-xs text-muted-foreground mt-0.5">Position : {story.sticker.placement}</p>
                      )}
                    </div>
                  )}

                  {story.hook_options && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                      <div className="rounded-lg border border-dashed border-border p-3 bg-muted/20">
                        <span className="text-xs font-bold text-muted-foreground mb-1 block">Option A ({story.hook_options.option_a.label})</span>
                        <p className="text-sm italic">"{story.hook_options.option_a.text}"</p>
                      </div>
                      <div className="rounded-lg border border-dashed border-border p-3 bg-muted/20">
                        <span className="text-xs font-bold text-muted-foreground mb-1 block">Option B ({story.hook_options.option_b.label})</span>
                        <p className="text-sm italic">"{story.hook_options.option_b.text}"</p>
                      </div>
                    </div>
                  )}

                  {story.tip && (
                    <p className="text-xs text-muted-foreground mt-2 flex items-start gap-1.5">
                      <span className="text-accent mt-0.5">💡</span> {story.tip}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Red flags checker */}
          <div className="mt-6">
            <RedFlagsChecker
              content={sequenceResult.stories.map((s: any) => s.texte || s.text || s.description || "").join("\n")}
              onFix={() => {}}
            />
          </div>

          <div className="mt-8 rounded-2xl border border-border bg-card p-5">
            <StoryChecklist />
          </div>

          {/* Actions */}
          <ContentActions
            content={sequenceResult.stories.map(s => `STORY ${s.number} (${s.timing})\n${s.format_label}\n\n"${s.text}"\n\n🎯 Sticker: ${s.sticker ? s.sticker.label : "Aucun"}\n💡 Tip: ${s.tip}`).join("\n\n───────────────\n\n")}
            canal="instagram"
            format="story_serie"
            theme={subject || sequenceResult.structure_label}
            objectif={objective}
            calendarPostId={calendarId || undefined}
            onRegenerate={() => { setSequenceResult(null); setStep(1); }}
            regenerateLabel="Nouvelle séquence"
            className="mt-6 pb-12"
          />

          <AddToCalendarDialog
            open={showCalendarDialog}
            onOpenChange={setShowCalendarDialog}
            onConfirm={handleAddToCalendar}
            contentLabel={`📱 Séquence Stories · ${sequenceResult.structure_label}`}
            contentEmoji="📱"
          />

          <SaveToIdeasDialog
            open={showIdeasDialog}
            onOpenChange={setShowIdeasDialog}
            contentType="story"
            subject={subject || sequenceResult.structure_label}
            objectif={objective}
            sourceModule="stories_generator"
            contentData={sequenceResult}
          />

          <BaseReminder variant="atelier" />
        </main>
      </div>
    );
  }

  // ── FORM FLOW ──
  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-3xl px-6 py-8 max-md:px-4">
        <div className="mb-8">
          <ReturnToOrigin />
          <ContentProgressBar steps={STORIES_STEPS} currentStep={currentStepKey} />
          <h1 className="font-display text-3xl font-bold text-foreground">Créer une séquence de Stories</h1>
          <p className="text-muted-foreground mt-2">
            L'IA structure tes stories pour engager ta communauté sans y passer des heures.
          </p>
        </div>

        {draftRestored && (
          <DraftRestoredBanner
            onContinue={() => {}}
            onDiscard={() => {
              clearDraft();
              setStep(1); setObjective(""); setPriceRange(""); setTimeAvailable(""); setFaceCam("");
              setSubject(""); setSubjectDetails(""); setRawIdea(""); setClarifyContext("");
              setSubjectDirection(""); setIsLaunch(false); setSubjectDone(false);
              setPreGenVecu(""); setPreGenEnergy(""); setPreGenMessage("");
            }}
          />
        )}

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
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{o.emoji}</span>
                  <div>
                    <p className="font-bold text-sm text-foreground">{o.label}</p>
                    <p className="text-xs text-muted-foreground">{o.desc}</p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Step 1.5: Price range (if sales) */}
        {step >= 1.5 && objective === "vente" && (
          <div className="mb-8">
            <h2 className="font-display text-lg font-bold text-foreground mb-3">Tu vends quoi ?</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {PRICE_RANGES.map((p) => (
                <button
                  key={p.id}
                  onClick={() => { setPriceRange(p.id); setStep(2); }}
                  className={`rounded-2xl border p-4 text-left transition-all ${priceRange === p.id ? "border-primary bg-rose-pale" : "border-border bg-card hover:border-primary/50"}`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xl">{p.emoji}</span>
                    <span className="font-bold text-sm">{p.label}</span>
                  </div>
                  <p className="text-xs text-muted-foreground ml-7">{p.desc}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 2: Time & Face Cam */}
        {step >= 2 && (
          <div className="mb-8 space-y-6">
            <div>
              <h2 className="font-display text-lg font-bold text-foreground mb-3">2. Tu as combien de temps ?</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
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
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
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
              initialSubject={subject}
            />
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