import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useDemoContext } from "@/contexts/DemoContext";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { friendlyError } from "@/lib/error-messages";
import { getActivityExamples } from "@/lib/activity-examples";
import { TOTAL_STEPS } from "@/lib/onboarding-constants";
import { type DiagnosticData } from "@/lib/diagnostic-data";
import { useWorkspaceFilter } from "@/hooks/use-workspace-query";
import { posthog } from "@/lib/posthog";

/* ────────────────────────────────────────────── helpers */

function getStepName(step: number): string {
  const names: Record<number, string> = {
    0: "welcome",
    1: "promise",
    2: "prenom",
    3: "activite",
    4: "activity_type",
    5: "canaux",
    6: "blocage",
    7: "objectif",
    8: "temps",
    9: "instagram_website",
    10: "transition_branding",
    11: "positioning",
    12: "mission",
    13: "target_description",
    14: "tone_keywords",
    15: "offers",
    16: "values",
    17: "import_documents",
    18: "building_diagnostic",
  };
  return names[step] || "unknown_" + step;
}

/* ────────────────────────────────────────────── types */

export interface Answers {
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

export interface BrandingAnswers {
  positioning: string;
  mission: string;
  target_description: string;
  tone_keywords: string[];
  offers: { name: string; price: string; description: string }[];
  values: string[];
}

export interface UploadedFile {
  id: string;
  name: string;
  url: string;
}

interface AuditResults {
  documents: any;
  isLoading: boolean;
}

export function useOnboarding() {
  const { user } = useAuth();
  const { isDemoMode, demoData, skipDemoOnboarding } = useDemoContext();
  const { column, value } = useWorkspaceFilter();
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
    offers: isDemoMode ? (demoData?.offers?.map((o: any) => ({ name: o.name, price: o.price, description: o.description })) ?? []) : [{ name: "", price: "", description: "" }],
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
    if (isDemoMode || !user || step >= 18) return;
    const check = async () => {
      const { data: config } = await (supabase
        .from("user_plan_config") as any)
        .select("onboarding_completed")
        .eq(column, value)
        .maybeSingle();
      if (config?.onboarding_completed) {
        navigate("/dashboard", { replace: true });
      }
    };
    check();
  }, [user?.id, isDemoMode, navigate, step]);

  const set = useCallback(<K extends keyof Answers>(key: K, value: Answers[K]) => {
    setAnswers(prev => ({ ...prev, [key]: value }));
  }, []);

  const setBranding = useCallback(<K extends keyof BrandingAnswers>(key: K, value: BrandingAnswers[K]) => {
    setBrandingAnswers(prev => ({ ...prev, [key]: value }));
  }, []);

  const next = useCallback(() => setStep(s => {
    const newStep = s + 1;
    posthog.capture("onboarding_step_completed", {
      step: s,
      next_step: newStep,
      step_name: getStepName(s),
    });
    return newStep;
  }), []);
  const prev = useCallback(() => setStep(s => Math.max(0, s - 1)), []);

  // Endowed progress
  const progress = step === 0 ? 15 : step >= TOTAL_STEPS ? 100 : Math.max(15, ((step + 1) / TOTAL_STEPS) * 100);

  // Time remaining estimate
  const getTimeRemaining = (currentStep: number): string => {
    const stepsLeft = TOTAL_STEPS - currentStep;
    if (stepsLeft <= 1) return "Presque fini !";
    if (stepsLeft <= 3) return "Dernière ligne droite · ~1 min";
    if (stepsLeft <= 6) return "Plus que ~2 min";
    if (stepsLeft <= 10) return "Encore ~3 min";
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
    if (step < 11) return;
    auditsLaunched.current = true;
    setAuditResults(prev => ({ ...prev, isLoading: true }));

    const promises: Promise<void>[] = [];

    if (uploadedFiles.length > 0) {
      promises.push(
        supabase.functions
          .invoke("analyze-documents", {
            body: { document_ids: uploadedFiles.map(f => f.id) },
          })
          .then(res => {
            if (res.data?.extracted_data) {
              setAuditResults(prev => ({ ...prev, documents: res.data.extracted_data }));
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
      console.error("Erreur technique:", e);
      toast({ title: "Erreur", description: friendlyError(e), variant: "destructive" });
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
    if (isDemoMode) return;
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
      // Track onboarding completion
      posthog.capture("onboarding_completed", {
        total_steps: TOTAL_STEPS,
        has_instagram: Boolean(answers.instagram),
        has_website: Boolean(answers.website),
        uploaded_files: uploadedFiles.length,
      });

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
        await supabase.from("offers").insert(
          validOffers.map((o, i) => ({
            user_id: user.id,
            name: o.name,
            price_text: o.price || null,
            promise: o.description || null,
            offer_type: "paid",
            sort_order: i,
          })) as any
        );
      }

      localStorage.removeItem("lac_prenom");
      localStorage.removeItem("lac_activite");
    } catch (error: any) {
      console.error("Erreur technique:", error);
      toast({ title: "Erreur", description: friendlyError(error), variant: "destructive" });
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
    if (!user) {
      navigate("/dashboard", { replace: true });
      return;
    }
    try {
      if (diagnosticData) {
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
      }
    } catch (e) {
      console.error("Failed to save diagnostic:", e);
    }
    localStorage.removeItem("lac_onboarding_step");
    localStorage.removeItem("lac_onboarding_answers");
    localStorage.removeItem("lac_onboarding_branding");
    localStorage.removeItem("lac_onboarding_ts");
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

  return {
    step,
    setStep,
    answers,
    setAnswers,
    brandingAnswers,
    setBrandingAnswers,
    set,
    setBranding,
    next,
    prev,
    progress,
    saving,
    uploadedFiles,
    uploading,
    auditResults,
    diagnosticData,
    setDiagnosticData,
    isDemoMode,
    demoData,
    handleFileUpload,
    removeFile,
    handleFinish,
    handleSkipDemo,
    handleDiagnosticComplete,
    getPlaceholder,
    getTimeRemaining,
  };
}
