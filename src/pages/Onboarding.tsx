import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useDemoContext } from "@/contexts/DemoContext";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, SkipForward, Film, Upload, X, Plus, Trash2 } from "lucide-react";
import { useSpeechRecognition } from "@/hooks/use-speech-recognition";
import { getActivityExamples } from "@/lib/activity-examples";
import DiagnosticLoading from "@/components/onboarding/DiagnosticLoading";
import DiagnosticView from "@/components/onboarding/DiagnosticView";
import { type DiagnosticData } from "@/lib/diagnostic-data";

/* ────────────────────────────────────────────── constants */

const ACTIVITY_SECTIONS = [
  {
    label: "Créatrices & artisanes",
    items: [
      { key: "artisane", emoji: "🧶", label: "Artisane / Créatrice", desc: "bijoux, céramique, textile, maroquinerie" },
      { key: "mode_textile", emoji: "👗", label: "Mode & textile éthique", desc: "styliste, vêtements, accessoires" },
      { key: "art_design", emoji: "🎨", label: "Art & design", desc: "artiste visuelle, illustratrice, designer, DA" },
      { key: "deco_interieur", emoji: "🏡", label: "Déco & design d'intérieur", desc: "mobilier, upcycling, scénographie" },
      { key: "beaute_cosmetiques", emoji: "🌿", label: "Beauté & cosmétiques naturels", desc: "soins, coiffure, esthétique bio" },
    ],
  },
  {
    label: "Accompagnantes & prestataires",
    items: [
      { key: "bien_etre", emoji: "🧘", label: "Bien-être & corps", desc: "yoga, naturopathe, sophrologue" },
      { key: "coach", emoji: "🧠", label: "Coach / Thérapeute", desc: "dev perso, facilitatrice, retraites" },
      { key: "coach_sportive", emoji: "💪", label: "Coach sportive", desc: "fitness, pilates, sport bien-être" },
      { key: "consultante", emoji: "📱", label: "Consultante / Freelance", desc: "com', social media, rédaction, marketing" },
      { key: "formatrice", emoji: "📚", label: "Formatrice", desc: "ateliers, formations, pédagogie" },
    ],
  },
];

const CHANNELS = [
  { key: "instagram", emoji: "📱", label: "Instagram" },
  { key: "website", emoji: "🌐", label: "Site web" },
  { key: "newsletter", emoji: "✉️", label: "Newsletter" },
  { key: "linkedin", emoji: "💼", label: "LinkedIn" },
  { key: "pinterest", emoji: "📌", label: "Pinterest" },
  { key: "podcast", emoji: "🎙️", label: "Podcast" },
  { key: "none", emoji: "🤷", label: "Rien pour l'instant" },
];

const BLOCKERS = [
  { key: "invisible", emoji: "😶", label: "Je suis invisible malgré mes efforts" },
  { key: "lost", emoji: "😵", label: "Je sais pas par où commencer" },
  { key: "no_time", emoji: "⏰", label: "J'ai pas le temps" },
  { key: "fear", emoji: "🫣", label: "J'ai peur de me montrer / de vendre" },
  { key: "no_structure", emoji: "🌀", label: "J'ai trop d'idées, aucune structure" },
  { key: "boring", emoji: "😴", label: "Ma com' est plate, elle me ressemble pas" },
];

const OBJECTIVES = [
  { key: "system", emoji: "📅", label: "Avoir un système de com' clair et tenable" },
  { key: "visibility", emoji: "📈", label: "Être visible et attirer des client·es" },
  { key: "sell", emoji: "🛒", label: "Vendre régulièrement sans me forcer" },
  { key: "zen", emoji: "🧘", label: "Communiquer sans stress ni culpabilité" },
  { key: "expert", emoji: "🌟", label: "Être reconnue comme experte dans mon domaine" },
];

const TIME_OPTIONS = [
  { key: "15min", emoji: "😅", label: "15 min par-ci par-là" },
  { key: "30min", emoji: "⏱️", label: "30 minutes" },
  { key: "1h", emoji: "📱", label: "1 heure" },
  { key: "2h", emoji: "💪", label: "2 heures" },
  { key: "more", emoji: "🔥", label: "Plus de 2 heures" },
];

const TONE_OPTIONS = [
  { key: "chaleureux", emoji: "🤗", label: "Chaleureux" },
  { key: "direct", emoji: "🎯", label: "Direct" },
  { key: "fun", emoji: "😄", label: "Fun" },
  { key: "expert", emoji: "🧠", label: "Expert" },
  { key: "engage", emoji: "💪", label: "Engagé" },
  { key: "doux", emoji: "🌿", label: "Doux" },
  { key: "inspirant", emoji: "✨", label: "Inspirant" },
  { key: "provoc", emoji: "🔥", label: "Provoc" },
];

const VALUE_CHIPS = [
  "Authenticité", "Éthique", "Créativité", "Féminisme",
  "Slow", "Écologie", "Bienveillance", "Liberté",
  "Beauté", "Transmission", "Inclusivité", "Audace",
];

const TOTAL_STEPS = 16; // 0=welcome, 1-8=phase1, 9=import, 10-15=branding, 16=building

/* ────────────────────────────────────────────── types */

interface Answers {
  prenom: string;
  activite: string;
  activity_type: string;
  activity_detail: string;
  canaux: string[];
  blocage: string;
  objectif: string;
  temps: string;
  instagram: string;
  website: string;
}

interface BrandingAnswers {
  positioning: string;
  mission: string;
  target_description: string;
  tone_keywords: string[];
  offers: { name: string; price: string; description: string }[];
  values: string[];
}

interface UploadedFile {
  id: string;
  name: string;
  url: string;
}

interface AuditResults {
  documents: any;
  isLoading: boolean;
}

/* ────────────────────────────────────────────── animation */

const variants = {
  enter: { opacity: 0, y: 24 },
  center: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -24 },
};

/* ────────────────────────────────────────────── main */

export default function Onboarding() {
  const { user } = useAuth();
  const { isDemoMode, demoData, skipDemoOnboarding } = useDemoContext();
  const navigate = useNavigate();
  const { toast } = useToast();

  const demoDefaults = demoData?.onboarding;

  const [step, setStep] = useState(() => {
    if (isDemoMode) return 0;
    const saved = localStorage.getItem("lac_onboarding_step");
    return saved ? parseInt(saved, 10) : 0;
  });
  const [restoredFromSave, setRestoredFromSave] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [auditResults, setAuditResults] = useState<AuditResults>({
    documents: null,
    isLoading: false,
  });
  const [diagnosticData, setDiagnosticData] = useState<DiagnosticData | null>(null);

  const [answers, setAnswers] = useState<Answers>({
    prenom: isDemoMode ? (demoDefaults?.prenom ?? "") : (localStorage.getItem("lac_prenom") || ""),
    activite: isDemoMode ? (demoDefaults?.activite ?? "") : (localStorage.getItem("lac_activite") || ""),
    activity_type: isDemoMode ? "art_design" : "",
    activity_detail: "",
    canaux: isDemoMode ? ["instagram", "website", "newsletter"] : [],
    blocage: isDemoMode ? "invisible" : "",
    objectif: isDemoMode ? "visibility" : "",
    temps: isDemoMode ? "2h" : "",
    instagram: isDemoMode ? "@lea_portraits" : "",
    website: isDemoMode ? "www.leaportraits.fr" : "",
  });

  const [brandingAnswers, setBrandingAnswers] = useState<BrandingAnswers>({
    positioning: isDemoMode ? (demoData?.branding.positioning ?? "") : "",
    mission: isDemoMode ? (demoData?.branding.mission ?? "") : "",
    target_description: isDemoMode ? "Femme entrepreneure, 30-45 ans, qui a lancé son activité depuis 1-3 ans. Elle sait qu'elle a besoin de photos pro mais elle repousse parce qu'elle ne se trouve pas photogénique. Elle veut des images qui lui ressemblent, pas des photos corporate sans âme." : "",
    tone_keywords: isDemoMode ? ["chaleureux", "direct", "inspirant"] : [],
    offers: isDemoMode ? (demoData?.offers?.map(o => ({ name: o.name, price: o.price, description: o.description })) ?? []) : [{ name: "", price: "", description: "" }],
    values: isDemoMode ? ([...(demoData?.branding.values ?? [])]) : [],
  });

  // Persist step + all answers to localStorage
  useEffect(() => {
    if (isDemoMode) return;
    localStorage.setItem("lac_onboarding_step", String(step));
    localStorage.setItem("lac_onboarding_answers", JSON.stringify(answers));
    localStorage.setItem("lac_onboarding_branding", JSON.stringify(brandingAnswers));
    localStorage.setItem("lac_onboarding_ts", new Date().toISOString());
  }, [step, isDemoMode, answers, brandingAnswers]);

  // Restore answers from localStorage on mount
  useEffect(() => {
    if (isDemoMode) return;
    try {
      const savedTs = localStorage.getItem("lac_onboarding_ts");
      if (savedTs) {
        const saved = new Date(savedTs);
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        if (saved < sevenDaysAgo) {
          localStorage.removeItem("lac_onboarding_step");
          localStorage.removeItem("lac_onboarding_answers");
          localStorage.removeItem("lac_onboarding_branding");
          localStorage.removeItem("lac_onboarding_ts");
          return;
        }
      }
      const savedAnswers = localStorage.getItem("lac_onboarding_answers");
      const savedBranding = localStorage.getItem("lac_onboarding_branding");
      const savedStep = localStorage.getItem("lac_onboarding_step");
      if (savedAnswers) {
        const parsed = JSON.parse(savedAnswers);
        setAnswers(prev => ({ ...prev, ...parsed }));
      }
      if (savedBranding) {
        const parsed = JSON.parse(savedBranding);
        setBrandingAnswers(prev => ({ ...prev, ...parsed }));
      }
      if (savedStep && parseInt(savedStep, 10) > 0) {
        setRestoredFromSave(true);
      }
    } catch { /* ignore parse errors */ }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Toast when restored
  useEffect(() => {
    if (restoredFromSave && step > 0) {
      toast({ title: "On reprend où tu en étais 🌸" });
      setRestoredFromSave(false);
    }
  }, [restoredFromSave]); // eslint-disable-line react-hooks/exhaustive-deps

  // Check if onboarding already completed
  useEffect(() => {
    if (isDemoMode || !user) return;
    const check = async () => {
      const { data: config } = await supabase
        .from("user_plan_config")
        .select("onboarding_completed")
        .eq("user_id", user.id)
        .maybeSingle();
      if (config?.onboarding_completed) {
        navigate("/dashboard", { replace: true });
      }
    };
    check();
  }, [user?.id, isDemoMode, navigate]);

  const set = useCallback(<K extends keyof Answers>(key: K, value: Answers[K]) => {
    setAnswers(prev => ({ ...prev, [key]: value }));
  }, []);

  const setBranding = useCallback(<K extends keyof BrandingAnswers>(key: K, value: BrandingAnswers[K]) => {
    setBrandingAnswers(prev => ({ ...prev, [key]: value }));
  }, []);

  const next = useCallback(() => setStep(s => s + 1), []);
  const prev = useCallback(() => setStep(s => Math.max(0, s - 1)), []);

  // Endowed progress: start at ~5% so step 0 already shows progress
  const progress = step === 0 ? 5 : step >= TOTAL_STEPS ? 100 : Math.max(5, ((step + 1) / TOTAL_STEPS) * 100);

  // Time remaining estimate
  const getTimeRemaining = (currentStep: number): string => {
    const stepsLeft = TOTAL_STEPS - currentStep;
    if (stepsLeft <= 1) return "Presque fini !";
    if (stepsLeft <= 3) return "Dernière ligne droite · ~1 min";
    if (stepsLeft <= 5) return "Plus que ~2 min";
    if (stepsLeft <= 8) return "Encore ~3 min";
    return "~4 min";
  };

  // Keyboard shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && step > 0 && step < TOTAL_STEPS) prev();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [step, prev]);

  // Launch background audits when entering phase 3 (step 10)
  const auditsLaunched = useRef(false);
  useEffect(() => {
    if (isDemoMode || !user || auditsLaunched.current) return;
    if (step < 10) return;
    auditsLaunched.current = true;
    setAuditResults(prev => ({ ...prev, isLoading: true }));

    const promises: Promise<void>[] = [];

    if (uploadedFiles.length > 0) {
      promises.push(
        supabase.functions
          .invoke("analyze-documents", {
            body: { user_id: user.id, document_ids: uploadedFiles.map(f => f.id) },
          })
          .then(res => {
            if (res.data?.extracted_data) {
              setAuditResults(prev => ({ ...prev, documents: res.data.extracted_data }));
              // Pre-fill branding answers from documents
              const d = res.data.extracted_data;
              setBrandingAnswers(prev => ({
                positioning: prev.positioning || d.positioning || "",
                mission: prev.mission || d.mission || "",
                target_description: prev.target_description || d.target_description || "",
                tone_keywords: prev.tone_keywords.length > 0 ? prev.tone_keywords : (d.tone_keywords || []),
                offers: prev.offers[0]?.name ? prev.offers : (d.offers?.length ? d.offers : prev.offers),
                values: prev.values.length > 0 ? prev.values : (d.values || []),
              }));
            }
          })
          .catch(e => console.error("Document analysis failed:", e))
      );
    }

    Promise.allSettled(promises).then(() => {
      setAuditResults(prev => ({ ...prev, isLoading: false }));
    });
  }, [step, isDemoMode, user?.id, uploadedFiles]);

  /* ── file upload ── */
  const handleFileUpload = async (files: FileList | null) => {
    if (!files || !user) return;
    setUploading(true);
    try {
      for (const file of Array.from(files).slice(0, 5 - uploadedFiles.length)) {
        const ext = file.name.split(".").pop()?.toLowerCase();
        const allowed = ["pdf", "docx", "doc", "txt", "md", "png", "jpg", "jpeg", "webp"];
        if (!ext || !allowed.includes(ext)) {
          toast({ title: "Format non supporté", description: `${file.name} ignoré`, variant: "destructive" });
          continue;
        }

        const filePath = `${user.id}/onboarding/${Date.now()}_${file.name}`;
        const { error: uploadError } = await supabase.storage
          .from("onboarding-uploads")
          .upload(filePath, file);

        if (uploadError) {
          console.error("Upload error:", uploadError);
          toast({ title: "Erreur", description: `Upload de ${file.name} échoué`, variant: "destructive" });
          continue;
        }

        const { data: urlData } = supabase.storage
          .from("onboarding-uploads")
          .getPublicUrl(filePath);

        const { data: docRecord } = await supabase
          .from("user_documents")
          .insert({
            user_id: user.id,
            file_name: file.name,
            file_url: filePath,
            file_type: ext,
            context: "onboarding",
          })
          .select("id")
          .single();

        if (docRecord) {
          setUploadedFiles(prev => [...prev, {
            id: docRecord.id,
            name: file.name,
            url: filePath,
          }]);
        }
      }
    } catch (e: any) {
      toast({ title: "Erreur", description: e.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const removeFile = async (fileId: string) => {
    const file = uploadedFiles.find(f => f.id === fileId);
    if (file) {
      await supabase.storage.from("onboarding-uploads").remove([file.url]);
      await supabase.from("user_documents").delete().eq("id", fileId);
    }
    setUploadedFiles(prev => prev.filter(f => f.id !== fileId));
  };

  /* ── save all ── */
  const handleFinish = async () => {
    if (isDemoMode) {
      skipDemoOnboarding();
      navigate("/dashboard", { replace: true });
      return;
    }
    if (!user) return;
    setSaving(true);
    try {
      // 1. PROFILES
      const { data: existingProfile } = await supabase
        .from("profiles").select("id").eq("user_id", user.id).maybeSingle();

      const profileData: Record<string, unknown> = {
        prenom: answers.prenom,
        activite: answers.activite,
        type_activite: answers.activity_type,
        activity_detail: answers.activity_detail || null,
        canaux: answers.canaux,
        main_blocker: answers.blocage,
        main_goal: answers.objectif,
        weekly_time: answers.temps,
        onboarding_completed: true,
        onboarding_completed_at: new Date().toISOString(),
        onboarding_step: TOTAL_STEPS,
      };
      if (answers.instagram) profileData.instagram_username = answers.instagram.replace(/^@/, "");
      if (answers.website) profileData.website_url = answers.website;

      if (existingProfile) {
        await supabase.from("profiles").update(profileData).eq("user_id", user.id);
      } else {
        await supabase.from("profiles").insert({ user_id: user.id, ...profileData });
      }

      // 2. user_plan_config
      const { data: existingConfig } = await supabase
        .from("user_plan_config").select("id").eq("user_id", user.id).maybeSingle();
      const configData = {
        main_goal: answers.objectif,
        level: "beginner",
        weekly_time: answers.temps,
        onboarding_completed: true,
        onboarding_completed_at: new Date().toISOString(),
      };
      if (existingConfig) {
        await supabase.from("user_plan_config").update(configData).eq("user_id", user.id);
      } else {
        await supabase.from("user_plan_config").insert({ user_id: user.id, ...configData });
      }

      // 3. BRAND_PROFILE (upsert)
      const { data: existingBrand } = await supabase
        .from("brand_profile").select("id").eq("user_id", user.id).maybeSingle();
      const brandData = {
        positioning: brandingAnswers.positioning || null,
        mission: brandingAnswers.mission || null,
        values: brandingAnswers.values.length > 0 ? brandingAnswers.values : null,
        tone_keywords: brandingAnswers.tone_keywords.length > 0 ? brandingAnswers.tone_keywords : null,
      };
      if (existingBrand) {
        await supabase.from("brand_profile").update(brandData).eq("user_id", user.id);
      } else {
        await supabase.from("brand_profile").insert({ user_id: user.id, ...brandData });
      }

      // 4. PERSONA (upsert description)
      if (brandingAnswers.target_description) {
        const { data: existingPersona } = await supabase
          .from("persona").select("id").eq("user_id", user.id).maybeSingle();
        if (existingPersona) {
          await supabase.from("persona").update({ description: brandingAnswers.target_description }).eq("user_id", user.id);
        } else {
          await supabase.from("persona").insert({ user_id: user.id, description: brandingAnswers.target_description });
        }
      }

      // 5. OFFERS (insert)
      const validOffers = brandingAnswers.offers.filter(o => o.name.trim());
      if (validOffers.length > 0) {
        await supabase.from("user_offers").insert(
          validOffers.map((o, i) => ({
            user_id: user.id,
            name: o.name,
            price: o.price || null,
            description: o.description || null,
            sort_order: i,
          }))
        );
      }

      localStorage.removeItem("lac_prenom");
      localStorage.removeItem("lac_activite");
      localStorage.removeItem("lac_onboarding_step");
      localStorage.removeItem("lac_onboarding_answers");
      localStorage.removeItem("lac_onboarding_branding");
      localStorage.removeItem("lac_onboarding_ts");
    } catch (error: any) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleSkipDemo = () => {
    skipDemoOnboarding();
    navigate("/dashboard", { replace: true });
  };

  const handleDiagnosticComplete = async () => {
    if (isDemoMode) {
      skipDemoOnboarding();
      navigate("/dashboard", { replace: true });
      return;
    }
    if (!user || !diagnosticData) {
      navigate("/dashboard", { replace: true });
      return;
    }
    try {
      const recs = diagnosticData.priorities.map((p, i) => ({
        user_id: user.id,
        titre: p.title,
        label: p.title,
        module: p.channel,
        route: p.route,
        priorite: p.impact,
        temps_estime: p.time,
        position: i + 1,
      }));
      await supabase.from("audit_recommendations").insert(recs);
    } catch (e) {
      console.error("Failed to save diagnostic:", e);
    }
    navigate("/dashboard", { replace: true });
  };

  const getPlaceholder = (field: string) => {
    const examples = getActivityExamples(answers.activity_type || answers.activite);
    const map: Record<string, string> = {
      positioning: (examples as any).post_examples?.[0] || "Ex: Je capture la confiance. Photographe portrait pour les femmes entrepreneures.",
      mission: "Ex: Rendre visible les femmes qui créent. Par l'image, par le regard, par la confiance.",
      target: "Ex: Marion, 35 ans, solopreneuse créative. Elle a besoin de photos pro mais repousse toujours...",
    };
    return map[field] || "";
  };

  const isCurrentStep = step < TOTAL_STEPS;

  return (
    <div className="min-h-screen bg-[hsl(var(--rose-pale))] flex flex-col">
      {/* Demo skip banner */}
      {isDemoMode && (
        <div className="sticky top-0 z-50 flex items-center justify-between px-4 py-2.5 bg-secondary border-b border-border">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Film className="h-4 w-4 text-primary" />
            <span>🎬 Mode démo · {demoData?.profile.first_name}, {demoData?.profile.activity}</span>
          </div>
          <Button variant="outline" size="sm" onClick={handleSkipDemo} className="h-8 text-xs gap-1.5 border-primary/30 hover:bg-primary/5">
            <SkipForward className="h-3.5 w-3.5" />
            Skip → Voir l'outil rempli
          </Button>
        </div>
      )}

      {/* Progress bar — visible from step 0 */}
      {step <= 15 && (
        <div className="fixed top-0 left-0 right-0 z-40 h-1 bg-border/30">
          <div
            className="h-full bg-primary transition-all duration-500 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      {/* Back button */}
      {step > 0 && step <= 15 && (
        <button
          onClick={prev}
          className="fixed top-4 left-4 z-40 text-muted-foreground hover:text-foreground text-sm flex items-center gap-1 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> Retour
        </button>
      )}

      {/* Content */}
      {step <= 16 ? (
        <div className="flex-1 flex flex-col items-center justify-center p-6">
          <div className="max-w-lg w-full flex-1 flex items-center">
            <div className="w-full">
            <AnimatePresence mode="wait">
              <motion.div
                key={step}
                variants={variants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.3, ease: "easeOut" }}
              >
                {/* PHASE 1: QUI ES-TU */}
                {step === 0 && <WelcomeScreen onNext={next} />}
                {step === 1 && <PrenomScreen value={answers.prenom} onChange={v => set("prenom", v)} onNext={next} />}
                {step === 2 && <ActiviteScreen prenom={answers.prenom} value={answers.activite} onChange={v => set("activite", v)} onNext={next} />}
                {step === 3 && <TypeScreen value={answers.activity_type} detailValue={answers.activity_detail} onChange={v => { set("activity_type", v); if (v !== "autre") { set("activity_detail", ""); setTimeout(next, 600); } }} onDetailChange={v => set("activity_detail", v)} onNext={next} />}
                {step === 4 && <CanauxScreen value={answers.canaux} onChange={v => set("canaux", v)} onNext={next} />}
                {step === 5 && <BlocageScreen value={answers.blocage} onChange={v => { set("blocage", v); setTimeout(next, 500); }} />}
                {step === 6 && <ObjectifScreen value={answers.objectif} onChange={v => { set("objectif", v); setTimeout(next, 500); }} />}
                {step === 7 && <TempsScreen value={answers.temps} onChange={v => { set("temps", v); setTimeout(next, 500); }} />}
                {step === 8 && <InstagramScreen answers={answers} set={set} onNext={next} onSkip={next} />}

                {/* PHASE 2: NOURRIR L'OUTIL */}
                {step === 9 && (
                  <ImportScreen
                    files={isDemoMode ? [{ id: "demo-file", name: "Brief_Lea_Portraits.pdf", url: "" }] : uploadedFiles}
                    uploading={uploading}
                    onUpload={isDemoMode ? () => {} : handleFileUpload}
                    onRemove={isDemoMode ? () => {} : removeFile}
                    onNext={next}
                    onSkip={next}
                    isDemoMode={isDemoMode}
                  />
                )}

                {/* PHASE 3: BRANDING CONVERSATIONNEL */}
                {step === 10 && (
                  <PositioningScreen
                    value={brandingAnswers.positioning}
                    onChange={v => setBranding("positioning", v)}
                    placeholder={getPlaceholder("positioning")}
                    hasAiSuggestion={!!auditResults.documents?.positioning && !brandingAnswers.positioning}
                    onNext={next}
                  />
                )}
                {step === 11 && (
                  <MissionScreen
                    value={brandingAnswers.mission}
                    onChange={v => setBranding("mission", v)}
                    placeholder={getPlaceholder("mission")}
                    onNext={next}
                  />
                )}
                {step === 12 && (
                  <TargetScreen
                    value={brandingAnswers.target_description}
                    onChange={v => setBranding("target_description", v)}
                    placeholder={getPlaceholder("target")}
                    onNext={next}
                  />
                )}
                {step === 13 && (
                  <ToneScreen
                    value={brandingAnswers.tone_keywords}
                    onChange={v => setBranding("tone_keywords", v)}
                    onNext={next}
                  />
                )}
                {step === 14 && (
                  <OffersScreen
                    value={brandingAnswers.offers}
                    onChange={v => setBranding("offers", v)}
                    onNext={next}
                  />
                )}
                {step === 15 && (
                  <ValuesScreen
                    value={brandingAnswers.values}
                    onChange={v => setBranding("values", v)}
                    onNext={() => { next(); handleFinish(); }}
                  />
                )}

                {/* PHASE 4: DIAGNOSTIC LOADING */}
                {step === 16 && (
                  <DiagnosticLoading
                    hasInstagram={answers.canaux.includes("instagram") && !!answers.instagram}
                    hasWebsite={answers.canaux.includes("website") && !!answers.website}
                    hasDocuments={isDemoMode ? true : uploadedFiles.length > 0}
                    isDemoMode={isDemoMode}
                    answers={answers}
                    brandingAnswers={brandingAnswers}
                    onReady={(data) => {
                      setDiagnosticData(data);
                      setStep(17);
                    }}
                  />
                )}
              </motion.div>
            </AnimatePresence>
            </div>
          </div>

          {/* Time remaining indicator */}
          {step > 0 && step <= 15 && (
            <p className="text-center text-xs text-muted-foreground/60 pb-4 mt-2">
              {getTimeRemaining(step)}
            </p>
          )}
        </div>
      ) : diagnosticData ? (
        <DiagnosticView
          data={diagnosticData}
          prenom={answers.prenom}
          onComplete={handleDiagnosticComplete}
          hasInstagram={answers.canaux.includes("instagram") && !!answers.instagram}
          hasWebsite={answers.canaux.includes("website") && !!answers.website}
        />
      ) : null}
    </div>
  );
}

/* ════════════════════════════════════════════════════════
   SCREEN COMPONENTS - PHASE 1
   ════════════════════════════════════════════════════════ */

function WelcomeScreen({ onNext }: { onNext: () => void }) {
  return (
    <div className="text-center space-y-8">
      <div className="space-y-5">
        <p className="text-3xl md:text-4xl font-display font-bold text-foreground leading-tight">
          Hey 👋<br />Je suis ton assistante com'.
        </p>
        <p className="text-base text-muted-foreground leading-relaxed max-w-sm mx-auto">
          Avant de commencer, j'ai besoin de te poser quelques questions pour personnaliser ton espace.
        </p>
        <p className="text-sm text-muted-foreground">
          Ça prend 5 minutes. Promis.
        </p>
        <p className="text-xs text-muted-foreground/70 italic">
          Tu peux répondre en tapant ou en vocal 🎤
        </p>
      </div>
      <Button onClick={onNext} size="lg" className="rounded-full px-8 gap-2">
        C'est parti →
      </Button>
    </div>
  );
}

/* ── Text input with voice ── */
function VoiceInput({ value, onChange, placeholder, onEnter, autoFocus = true, multiline = false }: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  onEnter?: () => void;
  autoFocus?: boolean;
  multiline?: boolean;
}) {
  const { isListening, toggle } = useSpeechRecognition(
    (transcript) => onChange(value ? value + " " + transcript : transcript),
  );

  if (multiline) {
    return (
      <div className="relative w-full">
        <textarea
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          autoFocus={autoFocus}
          rows={4}
          className="w-full text-base p-4 pr-12 border-2 border-border rounded-xl focus:border-primary outline-none bg-card transition-colors text-foreground placeholder:text-muted-foreground/50 resize-none"
        />
        <button
          type="button"
          onClick={toggle}
          className={`absolute right-3 bottom-3 p-2 rounded-full transition-all ${
            isListening
              ? "bg-destructive text-destructive-foreground animate-pulse"
              : "bg-muted text-muted-foreground hover:bg-secondary"
          }`}
        >
          🎤
        </button>
      </div>
    );
  }

  return (
    <div className="relative w-full">
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter" && onEnter) onEnter(); }}
        placeholder={placeholder}
        autoFocus={autoFocus}
        className="w-full text-xl p-4 border-b-2 border-border focus:border-primary outline-none bg-transparent transition-colors text-foreground placeholder:text-muted-foreground/50"
      />
      <button
        type="button"
        onClick={toggle}
        className={`absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-full transition-all ${
          isListening
            ? "bg-destructive text-destructive-foreground animate-pulse"
            : "bg-muted text-muted-foreground hover:bg-secondary"
        }`}
      >
        🎤
      </button>
    </div>
  );
}

function PrenomScreen({ value, onChange, onNext }: { value: string; onChange: (v: string) => void; onNext: () => void }) {
  const canNext = value.trim().length > 0;
  return (
    <div className="space-y-8">
      <h1 className="text-2xl md:text-3xl font-display font-bold text-foreground text-center">
        C'est quoi ton prénom ?
      </h1>
      <VoiceInput value={value} onChange={onChange} placeholder="Ton prénom" onEnter={canNext ? onNext : undefined} />
      <div className="text-center space-y-2">
        <p className="text-xs text-muted-foreground/60">Appuie sur Entrée ↵</p>
        <Button onClick={onNext} disabled={!canNext} className="rounded-full px-8">Suivant →</Button>
      </div>
    </div>
  );
}

function ActiviteScreen({ prenom, value, onChange, onNext }: { prenom: string; value: string; onChange: (v: string) => void; onNext: () => void }) {
  const canNext = value.trim().length > 0;
  return (
    <div className="space-y-8">
      <div className="text-center space-y-2">
        <h1 className="text-2xl md:text-3xl font-display font-bold text-foreground">
          Enchanté·e {prenom} !<br />Tu fais quoi dans la vie ?
        </h1>
        <p className="text-sm text-muted-foreground italic">en une phrase, comme tu le dirais à quelqu'un dans un café</p>
      </div>
      <VoiceInput value={value} onChange={onChange} placeholder="Photographe portrait pour entrepreneures" onEnter={canNext ? onNext : undefined} />
      <div className="text-center">
        <Button onClick={onNext} disabled={!canNext} className="rounded-full px-8">Suivant →</Button>
      </div>
    </div>
  );
}

function TypeScreen({ value, detailValue, onChange, onDetailChange, onNext }: {
  value: string;
  detailValue: string;
  onChange: (v: string) => void;
  onDetailChange: (v: string) => void;
  onNext: () => void;
}) {
  const showDetail = value === "autre";
  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <h1 className="text-2xl md:text-3xl font-display font-bold text-foreground">Tu te reconnais dans quoi ?</h1>
        <p className="text-sm text-muted-foreground italic">choisis ce qui te correspond le mieux</p>
      </div>
      <div className="space-y-5 max-h-[60vh] overflow-y-auto pr-1">
        {ACTIVITY_SECTIONS.map(section => (
          <div key={section.label}>
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-1">{section.label}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {section.items.map(t => (
                <button key={t.key} type="button" onClick={() => onChange(t.key)}
                  className={`relative text-left rounded-xl border-2 px-4 py-3.5 transition-all duration-200 ${
                    value === t.key ? "border-primary bg-secondary shadow-sm" : "border-border bg-card hover:border-primary/40 hover:bg-secondary/30"
                  }`}>
                  <div className="flex items-start gap-3">
                    <span className="text-2xl leading-none mt-0.5">{t.emoji}</span>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-semibold text-foreground">{t.label}</span>
                      <p className="text-xs text-muted-foreground mt-0.5">{t.desc}</p>
                    </div>
                  </div>
                  {value === t.key && <span className="absolute top-2.5 right-3 text-primary font-bold text-sm">✓</span>}
                </button>
              ))}
            </div>
          </div>
        ))}
        <div>
          <button type="button" onClick={() => onChange("autre")}
            className={`w-full text-left rounded-xl border-2 px-4 py-3.5 transition-all duration-200 ${
              showDetail ? "border-primary bg-secondary shadow-sm" : "border-border bg-card hover:border-primary/40 hover:bg-secondary/30"
            }`}>
            <span className="flex items-center gap-3">
              <span className="text-2xl">✏️</span>
              <span className="text-sm font-semibold text-foreground">Autre</span>
              {showDetail && <span className="ml-auto text-primary font-bold text-sm">✓</span>}
            </span>
          </button>
          {showDetail && (
            <div className="mt-3 space-y-3">
              <input type="text" value={detailValue} onChange={e => onDetailChange(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && detailValue.trim()) onNext(); }}
                placeholder="Décris ton activité en quelques mots" autoFocus
                className="w-full text-base p-3 border-b-2 border-border focus:border-primary outline-none bg-transparent transition-colors text-foreground placeholder:text-muted-foreground/50" />
              <div className="text-center">
                <Button onClick={onNext} disabled={!detailValue.trim()} className="rounded-full px-8">Suivant →</Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CanauxScreen({ value, onChange, onNext }: { value: string[]; onChange: (v: string[]) => void; onNext: () => void }) {
  const toggle = (key: string) => {
    if (key === "none") { onChange(["none"]); return; }
    const without = value.filter(v => v !== "none");
    if (without.includes(key)) onChange(without.filter(v => v !== key));
    else onChange([...without, key]);
  };
  return (
    <div className="space-y-8">
      <div className="text-center space-y-2">
        <h1 className="text-2xl md:text-3xl font-display font-bold text-foreground">Tu communiques où aujourd'hui ?</h1>
        <p className="text-sm text-muted-foreground italic">sélectionne tout ce que tu utilises, même un petit peu</p>
      </div>
      <div className="flex flex-wrap justify-center gap-3">
        {CHANNELS.map(c => (
          <button key={c.key} onClick={() => toggle(c.key)}
            className={`px-5 py-3 rounded-full border-2 text-sm font-medium transition-all ${
              value.includes(c.key) ? "border-primary bg-secondary text-primary" : "border-border bg-card text-foreground hover:border-primary/40"
            }`}>
            {c.emoji} {c.label}
          </button>
        ))}
      </div>
      <div className="text-center">
        <Button onClick={onNext} disabled={value.length === 0} className="rounded-full px-8">Suivant →</Button>
      </div>
    </div>
  );
}

function BlocageScreen({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-8">
      <div className="text-center space-y-2">
        <h1 className="text-2xl md:text-3xl font-display font-bold text-foreground">C'est quoi ton plus gros blocage en com' aujourd'hui ?</h1>
        <p className="text-sm text-muted-foreground italic">ce qui te fait soupirer quand tu y penses</p>
      </div>
      <div className="space-y-3">
        {BLOCKERS.map(b => (
          <ChoiceCard key={b.key} emoji={b.emoji} label={b.label} selected={value === b.key} onClick={() => onChange(b.key)} />
        ))}
      </div>
    </div>
  );
}

function ObjectifScreen({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-8">
      <div className="text-center space-y-2">
        <h1 className="text-2xl md:text-3xl font-display font-bold text-foreground">Et si tout marchait bien dans 6 mois, ça ressemblerait à quoi ?</h1>
      </div>
      <div className="space-y-3">
        {OBJECTIVES.map(o => (
          <ChoiceCard key={o.key} emoji={o.emoji} label={o.label} selected={value === o.key} onClick={() => onChange(o.key)} />
        ))}
      </div>
    </div>
  );
}

function TempsScreen({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-8">
      <div className="text-center space-y-2">
        <h1 className="text-2xl md:text-3xl font-display font-bold text-foreground">Tu peux consacrer combien de temps à ta com' par semaine ?</h1>
        <p className="text-sm text-muted-foreground italic">sois honnête, on s'adapte</p>
      </div>
      <div className="space-y-3">
        {TIME_OPTIONS.map(t => (
          <ChoiceCard key={t.key} emoji={t.emoji} label={t.label} selected={value === t.key} onClick={() => onChange(t.key)} />
        ))}
      </div>
    </div>
  );
}

function InstagramScreen({ answers, set, onNext, onSkip }: {
  answers: Answers;
  set: <K extends keyof Answers>(k: K, v: Answers[K]) => void;
  onNext: () => void;
  onSkip: () => void;
}) {
  return (
    <div className="space-y-8">
      <div className="text-center space-y-2">
        <h1 className="text-2xl md:text-3xl font-display font-bold text-foreground">Ton @ Instagram ?</h1>
        <p className="text-sm text-muted-foreground italic">pour analyser ton profil et te donner des conseils personnalisés</p>
      </div>
      <div className="space-y-6">
        <input type="text" value={answers.instagram} onChange={e => set("instagram", e.target.value)}
          placeholder="@" autoFocus
          className="w-full text-xl p-4 border-b-2 border-border focus:border-primary outline-none bg-transparent transition-colors text-foreground placeholder:text-muted-foreground/50" />
        <div>
          <p className="text-sm text-muted-foreground mb-2">Et ton site web ? <span className="italic">(optionnel)</span></p>
          <input type="text" value={answers.website} onChange={e => set("website", e.target.value)}
            placeholder="https://"
            className="w-full text-xl p-4 border-b-2 border-border focus:border-primary outline-none bg-transparent transition-colors text-foreground placeholder:text-muted-foreground/50" />
        </div>
      </div>
      <div className="flex justify-center gap-4">
        <Button variant="ghost" onClick={onSkip} className="rounded-full text-muted-foreground">Passer →</Button>
        <Button onClick={onNext} className="rounded-full px-8">Suivant →</Button>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════
   SCREEN COMPONENTS - PHASE 2: IMPORT
   ════════════════════════════════════════════════════════ */

function ImportScreen({ files, uploading, onUpload, onRemove, onNext, onSkip, isDemoMode }: {
  files: UploadedFile[];
  uploading: boolean;
  onUpload: (files: FileList | null) => void;
  onRemove: (id: string) => void;
  onNext: () => void;
  onSkip: () => void;
  isDemoMode?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="space-y-8">
      <div className="text-center space-y-3">
        <h1 className="text-2xl md:text-3xl font-display font-bold text-foreground">
          Tu as des documents qui décrivent ta marque ?
        </h1>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Un brief, un PDF, un moodboard... tout ce qui m'aide à mieux te connaître.
        </p>
        <p className="text-xs text-muted-foreground/70 italic">
          (c'est optionnel, mais ça me permet de pré-remplir ton espace)
        </p>
      </div>

      {!isDemoMode && (
        <div
          onClick={() => inputRef.current?.click()}
          onDragOver={e => { e.preventDefault(); e.stopPropagation(); }}
          onDrop={e => { e.preventDefault(); e.stopPropagation(); onUpload(e.dataTransfer.files); }}
          className="border-2 border-dashed border-border rounded-2xl p-8 text-center cursor-pointer hover:border-primary/50 hover:bg-secondary/30 transition-colors"
        >
          <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-3" />
          <p className="text-sm font-medium text-foreground">📎 Glisse tes fichiers ici</p>
          <p className="text-xs text-muted-foreground mt-1">ou clique pour importer</p>
          <p className="text-xs text-muted-foreground/70 mt-2">PDF, Word, PNG, JPG · Max 5 fichiers</p>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept=".pdf,.docx,.doc,.txt,.md,.png,.jpg,.jpeg,.webp"
            onChange={e => onUpload(e.target.files)}
            className="hidden"
          />
        </div>
      )}

      {uploading && (
        <p className="text-sm text-muted-foreground text-center animate-pulse">Upload en cours...</p>
      )}

      {files.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Fichiers importés :</p>
          {files.map(f => (
            <div key={f.id} className="flex items-center gap-3 bg-card rounded-xl border border-border px-4 py-2.5">
              <span className="text-sm">📄</span>
              <span className="text-sm text-foreground flex-1 truncate">{f.name}</span>
              <button onClick={() => onRemove(f.id)} className="text-muted-foreground hover:text-destructive transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex justify-center gap-4">
        <Button variant="ghost" onClick={onSkip} className="rounded-full text-muted-foreground">Passer →</Button>
        {files.length > 0 && (
          <Button onClick={onNext} className="rounded-full px-8">Suivant →</Button>
        )}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════
   SCREEN COMPONENTS - PHASE 3: BRANDING
   ════════════════════════════════════════════════════════ */

function PositioningScreen({ value, onChange, placeholder, hasAiSuggestion, onNext }: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  hasAiSuggestion: boolean;
  onNext: () => void;
}) {
  return (
    <div className="space-y-8">
      <div className="text-center space-y-2">
        <h1 className="text-2xl md:text-3xl font-display font-bold text-foreground">
          Comment tu présenterais ce que tu fais à quelqu'un dans un café ?
        </h1>
        <p className="text-sm text-muted-foreground italic">en 2-3 phrases, comme tu le dirais à l'oral</p>
      </div>
      {hasAiSuggestion && value && (
        <p className="text-xs text-primary flex items-center gap-1.5 justify-center">
          ✨ Suggestion basée sur tes documents
        </p>
      )}
      <VoiceInput value={value} onChange={onChange} placeholder={placeholder} multiline />
      <div className="text-center">
        <Button onClick={onNext} disabled={!value.trim()} className="rounded-full px-8">Suivant →</Button>
      </div>
    </div>
  );
}

function MissionScreen({ value, onChange, placeholder, onNext }: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  onNext: () => void;
}) {
  return (
    <div className="space-y-8">
      <div className="text-center space-y-2">
        <h1 className="text-2xl md:text-3xl font-display font-bold text-foreground">
          C'est quoi ta mission profonde ?
        </h1>
        <p className="text-sm text-muted-foreground italic">Le truc qui te fait te lever le matin, au-delà de gagner ta vie.</p>
      </div>
      <VoiceInput value={value} onChange={onChange} placeholder={placeholder} multiline />
      <div className="text-center">
        <Button onClick={onNext} disabled={!value.trim()} className="rounded-full px-8">Suivant →</Button>
      </div>
    </div>
  );
}

function TargetScreen({ value, onChange, placeholder, onNext }: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  onNext: () => void;
}) {
  return (
    <div className="space-y-8">
      <div className="text-center space-y-2">
        <h1 className="text-2xl md:text-3xl font-display font-bold text-foreground">
          Décris ta cliente idéale en quelques mots.
        </h1>
        <p className="text-sm text-muted-foreground italic">Qui est-elle ? Qu'est-ce qui la bloque ? Qu'est-ce qu'elle veut ?</p>
      </div>
      <VoiceInput value={value} onChange={onChange} placeholder={placeholder} multiline />
      <div className="text-center">
        <Button onClick={onNext} disabled={!value.trim()} className="rounded-full px-8">Suivant →</Button>
      </div>
    </div>
  );
}

function ToneScreen({ value, onChange, onNext }: {
  value: string[];
  onChange: (v: string[]) => void;
  onNext: () => void;
}) {
  const toggle = (key: string) => {
    if (value.includes(key)) {
      onChange(value.filter(v => v !== key));
    } else if (value.length < 3) {
      onChange([...value, key]);
    }
  };
  const atMax = value.length >= 3;

  return (
    <div className="space-y-8">
      <div className="text-center space-y-2">
        <h1 className="text-2xl md:text-3xl font-display font-bold text-foreground">
          Si ta marque était une personne, elle parlerait comment ?
        </h1>
        <p className="text-sm text-muted-foreground italic">choisis 2-3 mots</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {TONE_OPTIONS.map(t => {
          const selected = value.includes(t.key);
          const disabled = atMax && !selected;
          return (
            <button key={t.key} onClick={() => toggle(t.key)} disabled={disabled}
              className={`px-4 py-3.5 rounded-xl border-2 text-sm font-medium transition-all ${
                selected
                  ? "border-primary bg-secondary text-primary"
                  : disabled
                    ? "border-border bg-muted/50 text-muted-foreground/50 cursor-not-allowed"
                    : "border-border bg-card text-foreground hover:border-primary/40"
              }`}>
              {t.emoji} {t.label}
            </button>
          );
        })}
      </div>
      <div className="text-center">
        <Button onClick={onNext} disabled={value.length < 2} className="rounded-full px-8">Suivant →</Button>
      </div>
    </div>
  );
}

function OffersScreen({ value, onChange, onNext }: {
  value: { name: string; price: string; description: string }[];
  onChange: (v: { name: string; price: string; description: string }[]) => void;
  onNext: () => void;
}) {
  const updateOffer = (idx: number, field: string, val: string) => {
    const updated = [...value];
    updated[idx] = { ...updated[idx], [field]: val };
    onChange(updated);
  };
  const addOffer = () => {
    if (value.length < 3) onChange([...value, { name: "", price: "", description: "" }]);
  };
  const removeOffer = (idx: number) => {
    if (value.length > 1) onChange(value.filter((_, i) => i !== idx));
  };

  const canNext = value.some(o => o.name.trim());

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <h1 className="text-2xl md:text-3xl font-display font-bold text-foreground">
          C'est quoi ton offre principale ?
        </h1>
        <p className="text-sm text-muted-foreground italic">celle qui te fait vivre ou que tu veux pousser en priorité</p>
      </div>

      <div className="space-y-6">
        {value.map((offer, idx) => (
          <div key={idx} className="space-y-3 bg-card rounded-xl border border-border p-4">
            {value.length > 1 && (
              <div className="flex justify-between items-center">
                <span className="text-xs font-semibold text-muted-foreground">Offre {idx + 1}</span>
                <button onClick={() => removeOffer(idx)} className="text-muted-foreground hover:text-destructive">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            )}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Nom de l'offre</label>
              <Input value={offer.name} onChange={e => updateOffer(idx, "name", e.target.value)} placeholder="Ex: Séance Confiance" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Prix</label>
              <Input value={offer.price} onChange={e => updateOffer(idx, "price", e.target.value)} placeholder="Ex: 350€" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">En une phrase, elle sert à quoi ?</label>
              <VoiceInput value={offer.description} onChange={v => updateOffer(idx, "description", v)} placeholder="Ex: Séance portrait 2h avec coaching posture inclus" autoFocus={false} />
            </div>
          </div>
        ))}
      </div>

      {value.length < 3 && (
        <button onClick={addOffer} className="text-sm text-primary font-medium flex items-center gap-1.5 mx-auto hover:underline">
          <Plus className="h-4 w-4" /> Ajouter une autre offre
        </button>
      )}

      <div className="text-center">
        <Button onClick={onNext} disabled={!canNext} className="rounded-full px-8">Suivant →</Button>
      </div>
    </div>
  );
}

function ValuesScreen({ value, onChange, onNext }: {
  value: string[];
  onChange: (v: string[]) => void;
  onNext: () => void;
}) {
  const updateValue = (idx: number, val: string) => {
    const updated = [...value];
    if (idx < updated.length) {
      updated[idx] = val;
    } else {
      updated.push(val);
    }
    onChange(updated);
  };

  const addChip = (chip: string) => {
    if (value.includes(chip)) return;
    if (value.length < 3) {
      onChange([...value, chip]);
    } else {
      // Replace last empty one
      const emptyIdx = value.findIndex(v => !v.trim());
      if (emptyIdx >= 0) {
        const updated = [...value];
        updated[emptyIdx] = chip;
        onChange(updated);
      }
    }
  };

  // Ensure 3 slots
  const slots = [value[0] || "", value[1] || "", value[2] || ""];
  const canNext = slots.filter(s => s.trim()).length >= 2;

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <h1 className="text-2xl md:text-3xl font-display font-bold text-foreground">
          3 valeurs qui portent ton projet ?
        </h1>
      </div>

      <div className="space-y-3">
        {slots.map((val, idx) => (
          <Input
            key={idx}
            value={val}
            onChange={e => updateValue(idx, e.target.value)}
            placeholder={`${idx + 1}.`}
          />
        ))}
      </div>

      <div>
        <p className="text-xs text-muted-foreground mb-2">Ou choisis parmi :</p>
        <div className="flex flex-wrap gap-2">
          {VALUE_CHIPS.map(chip => {
            const isSelected = value.includes(chip);
            return (
              <button key={chip} onClick={() => addChip(chip)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                  isSelected
                    ? "border-primary bg-secondary text-primary"
                    : "border-border bg-card text-foreground hover:border-primary/40"
                }`}>
                {chip}
              </button>
            );
          })}
        </div>
      </div>

      <div className="text-center">
        <Button onClick={onNext} disabled={!canNext} className="rounded-full px-8">Terminer →</Button>
      </div>
    </div>
  );
}

/* BuildingScreen removed — replaced by DiagnosticLoading + DiagnosticView */

/* ────────────────────────────────────────────── shared */

function ChoiceCard({ emoji, label, selected, onClick }: {
  emoji: string;
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick}
      className={`w-full text-left rounded-xl border-2 px-5 py-4 transition-all duration-200 ${
        selected ? "border-primary bg-secondary shadow-sm" : "border-border bg-card hover:border-primary/40 hover:bg-secondary/30"
      }`}>
      <span className="flex items-center gap-3">
        <span className="text-xl">{emoji}</span>
        <span className="text-sm font-medium text-foreground flex-1">{label}</span>
        {selected && <span className="text-primary font-bold">✓</span>}
      </span>
    </button>
  );
}
