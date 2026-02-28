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
import { useWorkspaceFilter, useWorkspaceId } from "@/hooks/use-workspace-query";
import { posthog } from "@/lib/posthog";

/* ────────────────────────────────────────────── helpers */

function mapOnboardingTimeToPlan(temps: string): string {
  const mapping: Record<string, string> = {
    "15min": "less_2h",
    "30min": "less_2h",
    "1h": "less_2h",
    "2h": "2_5h",
    "more": "5_10h",
  };
  return mapping[temps] || "2_5h";
}

function mapObjectifToPlanGoal(objectif: string): string {
  const mapping: Record<string, string> = {
    "system": "structure",
    "visibility": "visibility",
    "sell": "clients",
    "zen": "structure",
    "expert": "visibility",
  };
  return mapping[objectif] || "visibility";
}

function getStepName(step: number): string {
  const names: Record<number, string> = {
    0: "welcome",
    1: "prenom_activite",
    2: "activity_type",
    3: "product_or_service",
    4: "links_docs",
    5: "canaux_combined",
    6: "objectif",
    7: "blocage",
    8: "temps",
    9: "affinage_1",
    10: "affinage_2",
    11: "building_diagnostic",
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
  desired_channels: string[];
  blocage: string;
  objectif: string;
  temps: string;
  instagram: string;
  website: string;
  linkedin: string;
  linkedin_summary: string;
  change_priority: string;
  product_or_service: string;
  uniqueness: string;
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  documents: any;
  isLoading: boolean;
}

export function useOnboarding() {
  const { user } = useAuth();
  const { isDemoMode, demoData, skipDemoOnboarding } = useDemoContext();
  const { column, value } = useWorkspaceFilter();
  const workspaceId = useWorkspaceId();
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
    desired_channels: isDemoMode ? ["tiktok", "newsletter"] : [],
    blocage: isDemoMode ? "invisible" : "",
    objectif: isDemoMode ? "visibility" : "",
    temps: isDemoMode ? "2h" : "",
    instagram: isDemoMode ? "@lea_portraits" : "",
    website: isDemoMode ? "www.leaportraits.fr" : "",
    linkedin: isDemoMode ? "" : "",
    linkedin_summary: isDemoMode ? "Photographe portraitiste spécialisée dans les portraits d'entrepreneures. J'aide les femmes à révéler leur image de marque à travers des photos authentiques." : "",
    change_priority: isDemoMode ? "Avoir une identité visuelle cohérente sur tous mes supports" : "",
    product_or_service: isDemoMode ? "services" : "",
    uniqueness: isDemoMode ? "Mon approche est très humaine, je mets les gens à l'aise" : "",
  });

  // Keep BrandingAnswers as state for backward compatibility (used by DiagnosticLoading fallback)
  const [brandingAnswers, setBrandingAnswers] = useState<BrandingAnswers>({
    positioning: isDemoMode ? (demoData?.branding.positioning ?? "") : "",
    mission: isDemoMode ? (demoData?.branding.mission ?? "") : "",
    target_description: isDemoMode ? "Femme entrepreneure, 30-45 ans, qui a lancé son activité depuis 1-3 ans." : "",
    tone_keywords: isDemoMode ? ["chaleureux", "direct", "inspirant"] : [],
    offers: isDemoMode ? (demoData?.offers?.map((o: { name: string; price: string; description: string }) => ({ name: o.name, price: o.price, description: o.description })) ?? []) : [{ name: "", price: "", description: "" }],
    values: isDemoMode ? ([...(demoData?.branding.values ?? [])]) : [],
  });

  // Persist step + answers to localStorage
  useEffect(() => {
    if (isDemoMode) return;
    localStorage.setItem("lac_onboarding_step", String(step));
    localStorage.setItem("lac_onboarding_answers", JSON.stringify(answers));
    localStorage.setItem("lac_onboarding_ts", new Date().toISOString());
  }, [step, isDemoMode, answers]);

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
      const savedStep = localStorage.getItem("lac_onboarding_step");
      if (savedAnswers) {
        const parsed = JSON.parse(savedAnswers);
        setAnswers(prev => ({ ...prev, ...parsed }));
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
    if (isDemoMode || !user || step >= TOTAL_STEPS) return;

    const check = async () => {
      const { data: profile } = await supabase
        .from("profiles")
        .select("onboarding_completed")
        .eq("user_id", user.id)
        .maybeSingle();
      if (profile?.onboarding_completed) {
        navigate("/dashboard", { replace: true });
        return;
      }
      const { data: config } = await (supabase
        .from("user_plan_config") as any)
        .select("onboarding_completed")
        .eq("user_id", user.id)
        .maybeSingle();
      if (config?.onboarding_completed) {
        navigate("/dashboard", { replace: true });
      }
    };
    check();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, isDemoMode]);

  const set = useCallback(<K extends keyof Answers>(key: K, val: Answers[K]) => {
    setAnswers(prev => ({ ...prev, [key]: val }));
  }, []);

  const setBranding = useCallback(<K extends keyof BrandingAnswers>(key: K, val: BrandingAnswers[K]) => {
    setBrandingAnswers(prev => ({ ...prev, [key]: val }));
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
    if (stepsLeft <= 5) return "Plus que ~2 min";
    return "~3 min";
  };

  // Keyboard shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && step > 0 && step < TOTAL_STEPS) prev();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [step, prev]);

  // Launch background audits when entering diagnostic phase
  const auditsLaunched = useRef(false);
  useEffect(() => {
    if (isDemoMode || !user || auditsLaunched.current) return;
    if (step < 8) return; // Start at affinage phase
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
    } catch (e: unknown) {
      console.error("Erreur technique:", e);
      toast({ title: "Erreur", description: friendlyError(e as Error), variant: "destructive" });
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
      // Use canaux from answers (user selection), enriched with link-based channels + desired channels
      const rawChannels: string[] = [...new Set([
        ...answers.canaux.filter(c => c !== "none"),
        ...answers.desired_channels,
      ])];
      if (answers.instagram && !rawChannels.includes("instagram")) rawChannels.push("instagram");
      if (answers.website && !rawChannels.includes("website")) rawChannels.push("website");
      if (answers.linkedin && !rawChannels.includes("linkedin")) rawChannels.push("linkedin");

      // Map onboarding keys to dashboard ChannelId keys
      const channelMapping: Record<string, string> = { "website": "site" };
      const canaux = rawChannels.map(c => channelMapping[c] || c);

      // 1. PROFILES
      const { data: existingProfile } = await supabase
        .from("profiles").select("id").eq("user_id", user.id).maybeSingle();

      const profileData: Record<string, unknown> = {
        prenom: answers.prenom,
        activite: answers.activite,
        type_activite: answers.activity_type,
        activity_detail: answers.activity_detail || null,
        canaux,
        main_blocker: answers.blocage,
        main_goal: answers.objectif,
        weekly_time: answers.temps,
        onboarding_completed: true,
        onboarding_completed_at: new Date().toISOString(),
        onboarding_step: TOTAL_STEPS,
      };
      if (answers.instagram) profileData.instagram_username = answers.instagram.replace(/^@/, "");
      if (answers.website) profileData.website_url = answers.website;
      if (answers.linkedin) profileData.linkedin_url = answers.linkedin;
      if (answers.linkedin_summary) profileData.linkedin_summary = answers.linkedin_summary;

      if (existingProfile) {
        const { error: updateErr } = await supabase.from("profiles").update(profileData).eq("user_id", user.id);
        if (updateErr) console.error("Failed to update profile:", updateErr);
      } else {
        const { error: insertErr } = await supabase.from("profiles").insert({ user_id: user.id, ...profileData });
        if (insertErr) console.error("Failed to insert profile:", insertErr);
      }

      // 2. user_plan_config — pre-configure plan from onboarding answers
      posthog.capture("onboarding_completed", {
        total_steps: TOTAL_STEPS,
        has_instagram: Boolean(answers.instagram),
        has_website: Boolean(answers.website),
        has_linkedin: Boolean(answers.linkedin),
        uploaded_files: uploadedFiles.length,
      });

      const planChannels = canaux.filter(c => c !== "none");
      const mappedGoal = mapObjectifToPlanGoal(answers.objectif);
      const mappedTime = mapOnboardingTimeToPlan(answers.temps);

      const { data: existingConfig } = await supabase
        .from("user_plan_config").select("id").eq("user_id", user.id).maybeSingle();
      const configData = {
        main_goal: mappedGoal,
        level: "beginner",
        weekly_time: mappedTime,
        channels: planChannels,
        onboarding_completed: true,
        onboarding_completed_at: new Date().toISOString(),
      };
      if (existingConfig) {
        const { error: updErr } = await supabase.from("user_plan_config").update(configData).eq("user_id", user.id);
        if (updErr) console.error("Failed to update plan_config:", updErr);
      } else {
        const { error: insErr } = await supabase.from("user_plan_config").insert({ user_id: user.id, ...configData });
        if (insErr) console.error("Failed to insert plan_config:", insErr);
      }

      // NOTE: brand_profile and persona are now filled by the deep-diagnostic edge function, not here.

      // 3. BRAND_PROPOSITION — save positioning if available
      if (brandingAnswers.positioning) {
        const { data: existingProp } = await supabase
          .from("brand_proposition").select("id").eq("user_id", user.id).maybeSingle();
        const propData = { version_complete: brandingAnswers.positioning };
        if (existingProp) {
          await supabase.from("brand_proposition").update(propData).eq("user_id", user.id);
        } else {
          await supabase.from("brand_proposition").insert({
            user_id: user.id,
            workspace_id: workspaceId !== user.id ? workspaceId : undefined,
            ...propData,
          } as any);
        }
      }

      // 4. BRAND_STRATEGY — distill objectif & blocage into strategy
      const strategyData: Record<string, unknown> = {};
      const goalToPillar: Record<string, string> = {
        system: "Organisation & régularité",
        visibility: "Visibilité & notoriété",
        sell: "Conversion & ventes",
        zen: "Communication sereine",
        expert: "Autorité & expertise",
      };
      if (answers.objectif) {
        strategyData.pillar_major = goalToPillar[answers.objectif] || answers.objectif;
      }
      if (answers.blocage) {
        const blockerToInsight: Record<string, string> = {
          invisible: "Priorité : augmenter la découvrabilité et le reach",
          lost: "Priorité : structurer un plan de com' simple et actionnable",
          no_time: "Priorité : automatiser et batcher pour gagner du temps",
          fear: "Priorité : trouver un ton authentique sans se surexposer",
          no_structure: "Priorité : canaliser les idées dans un cadre éditorial",
          boring: "Priorité : développer une voix distinctive et engageante",
        };
        strategyData.step_1_hidden_facets = blockerToInsight[answers.blocage] || null;
      }
      if (Object.keys(strategyData).length > 0) {
        const { data: existingStrategy } = await supabase
          .from("brand_strategy").select("id").eq("user_id", user.id).maybeSingle();
        if (existingStrategy) {
          await supabase.from("brand_strategy").update(strategyData).eq("user_id", user.id);
        } else {
          await supabase.from("brand_strategy").insert({
            user_id: user.id,
            workspace_id: workspaceId !== user.id ? workspaceId : undefined,
            ...strategyData,
          } as any);
        }
      }

      localStorage.removeItem("lac_prenom");
      localStorage.removeItem("lac_activite");
      localStorage.removeItem("lac_onboarding_step");
      localStorage.removeItem("lac_onboarding_answers");
      localStorage.removeItem("lac_onboarding_branding");
      localStorage.removeItem("lac_onboarding_ts");
    } catch (error: unknown) {
      console.error("Erreur technique:", error);
      toast({ title: "Erreur", description: friendlyError(error as Error), variant: "destructive" });
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
      // Safety net: ensure onboarding_completed is saved even if handleFinish failed
      await supabase
        .from("profiles")
        .update({
          onboarding_completed: true,
          onboarding_completed_at: new Date().toISOString(),
          onboarding_step: TOTAL_STEPS,
        })
        .eq("user_id", user.id);

      if (diagnosticData) {
        // Save diagnostic as branding audit
        await supabase.from("branding_audits").insert({
          user_id: user.id,
          workspace_id: workspaceId !== user.id ? workspaceId : undefined,
          score_global: diagnosticData.totalScore,
          synthese: `Diagnostic initial : score ${diagnosticData.totalScore}/100`,
          points_forts: diagnosticData.strengths.map((s: string) => ({ titre: s, detail: s, source: "diagnostic" })),
          points_faibles: diagnosticData.weaknesses.map((w: { title: string; why: string }) => ({ titre: w.title, detail: w.why, source: "diagnostic", priorite: "high" })),
        } as any);

        await supabase.from("profiles").update({
          diagnostic_data: diagnosticData as any,
        }).eq("user_id", user.id);
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
