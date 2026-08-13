import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useDemoContext } from "@/contexts/DemoContext";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { friendlyError } from "@/lib/error-messages";
import { getActivityExamples } from "@/lib/activity-examples";
import { TOTAL_STEPS } from "@/lib/onboarding-constants";
import { type DiagnosticData } from "@/lib/diagnostic-data";
import { useWorkspaceFilter, useWorkspaceId, useProfileUserId } from "@/hooks/use-workspace-query";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { posthog } from "@/lib/posthog";
import { resolveOnboardingStatus } from "@/lib/onboarding-status";

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
    2: "product_or_service",
    3: "links_docs",
    4: "canaux_combined",
    5: "objectif",
    6: "blocage",
    7: "temps",
    8: "affinage_1",
    9: "affinage_2",
    10: "building_diagnostic",
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


export function useOnboarding() {
  const { user } = useAuth();
  const { isDemoMode, demoData, skipDemoOnboarding } = useDemoContext();
  const { column, value } = useWorkspaceFilter();
  const workspaceId = useWorkspaceId();
  const profileUserId = useProfileUserId();
  const { ownWorkspace } = useWorkspace();
  const navigate = useNavigate();

  const demoDefaults = demoData?.onboarding;

  const [step, setStep] = useState(() => {
    if (isDemoMode) return 0;
    const saved = localStorage.getItem("lac_onboarding_step");
    return saved ? parseInt(saved, 10) : 0;
  });

  // ── Espace déjà brandé : prévenir plutôt que geler ────────────────────────
  // `diagnostic-enrichment` refuse d'écrire dès qu'un positionnement/mission
  // existe (garde-fou anti-injection sur le mauvais espace). Utile, mais du
  // coup refaire son onboarding volontairement ne rafraîchissait plus RIEN :
  // le diagnostic tournait, l'identité restait celle d'avant. On détecte donc
  // le cas ici pour poser la question à l'écran, et on ne remplace que sur un
  // « oui » explicite (`overwriteConfirmed`), transmis jusqu'à l'edge.
  const [brandedSpaceName, setBrandedSpaceName] = useState<string | null>(null);
  const [overwriteConfirmed, setOverwriteConfirmed] = useState(false);
  const [restoredFromSave, setRestoredFromSave] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [uploading, setUploading] = useState(false);
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

  // Persist step + answers to localStorage (debounced)
  useEffect(() => {
    if (isDemoMode) return;
    const timer = setTimeout(() => {
      localStorage.setItem("lac_onboarding_step", String(step));
      localStorage.setItem("lac_onboarding_answers", JSON.stringify(answers));
      localStorage.setItem("lac_onboarding_branding", JSON.stringify(brandingAnswers));
      localStorage.setItem("lac_onboarding_ts", new Date().toISOString());
    }, 500);
    return () => clearTimeout(timer);
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
      const savedStep = localStorage.getItem("lac_onboarding_step");
      if (savedAnswers) {
        const parsed = JSON.parse(savedAnswers);
        setAnswers(prev => ({ ...prev, ...parsed }));
      }
      try {
        const savedBranding = localStorage.getItem("lac_onboarding_branding");
        if (savedBranding) {
          const parsedBranding = JSON.parse(savedBranding);
          setBrandingAnswers(prev => ({ ...prev, ...parsedBranding }));
        }
      } catch { /* ignore branding parse errors */ }
      if (savedStep && parseInt(savedStep, 10) > 0) {
        setRestoredFromSave(true);
      }
    } catch { /* ignore parse errors */ }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Toast when restored
  useEffect(() => {
    if (restoredFromSave && step > 0) {
      toast("On reprend où tu en étais 🌸");
      setRestoredFromSave(false);
    }
  }, [restoredFromSave]); // eslint-disable-line react-hooks/exhaustive-deps

  // Check if onboarding already completed OR if step is stale after a reset
  // Also pre-fill answers from DB when profile exists but onboarding not completed
  const prefillDone = useRef(false);
  useEffect(() => {
    if (isDemoMode || !user) return;

    const check = async () => {
      const { data: profile } = await (supabase.from("profiles") as any)
        .select("onboarding_completed, prenom, activite, type_activite, activity_detail, canaux, main_blocker, main_goal, weekly_time, website_url, instagram_username, linkedin_url, linkedin_summary")
        .eq("user_id", profileUserId)
        .maybeSingle();

      const status = await resolveOnboardingStatus({
        profileUserId: profileUserId,
        planConfigUserId: user.id,
      });
      const done = status === "done";

      if (done) {
        navigate("/dashboard", { replace: true });
        return;
      }

      // Safety: DB says NOT completed but localStorage has a step beyond the flow → reset to 0
      if (!done && step >= TOTAL_STEPS) {
        console.warn("[onboarding] Stale step detected after reset, resetting to 0");
        localStorage.removeItem("lac_onboarding_step");
        localStorage.removeItem("lac_onboarding_answers");
        localStorage.removeItem("lac_onboarding_branding");
        localStorage.removeItem("lac_onboarding_ts");
        setStep(0);
        setAnswers({
          prenom: "", activite: "", activity_type: "", activity_detail: "",
          canaux: [], desired_channels: [], blocage: "", objectif: "", temps: "",
          instagram: "", website: "", linkedin: "", linkedin_summary: "",
          change_priority: "", product_or_service: "", uniqueness: "",
        });
      }

      // Pre-fill from DB when profile has data but onboarding not completed
      // Only if localStorage doesn't already have saved answers.
      // Fallback user_metadata : l'inscription y écrit prénom/activité (SignupForm),
      // seul canal qui survit à une confirmation d'email sur un autre appareil
      // (localStorage vide + insert profiles raté faute de session).
      const metaPrenom = typeof user.user_metadata?.prenom === "string" ? user.user_metadata.prenom : "";
      const metaActivite = typeof user.user_metadata?.activite === "string" ? user.user_metadata.activite : "";
      if (!done && (profile?.prenom || metaPrenom) && !prefillDone.current) {
        prefillDone.current = true;
        const hasLocalSave = !!localStorage.getItem("lac_onboarding_answers");
        if (!hasLocalSave) {
          console.log("[onboarding] Pre-filling answers from existing profile data");
          setAnswers(prev => ({
            ...prev,
            prenom: profile?.prenom || metaPrenom || prev.prenom,
            activite: profile?.activite || metaActivite || prev.activite,
            activity_type: profile?.type_activite || prev.activity_type,
            activity_detail: profile?.activity_detail || prev.activity_detail,
            canaux: (profile?.canaux?.length ? profile.canaux : prev.canaux),
            blocage: profile?.main_blocker || prev.blocage,
            objectif: profile?.main_goal || prev.objectif,
            temps: profile?.weekly_time || prev.temps,
            instagram: profile?.instagram_username ? `@${profile.instagram_username}` : prev.instagram,
            website: profile?.website_url || prev.website,
            linkedin: profile?.linkedin_url || prev.linkedin,
            linkedin_summary: profile?.linkedin_summary || prev.linkedin_summary,
          }));
        }
      }
    };
    check();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, isDemoMode]);

  // Cet espace porte-t-il déjà une identité de marque écrite ?
  // Effet SÉPARÉ et calé sur `ownWorkspace.id` : l'espace arrive de façon
  // asynchrone (WorkspaceContext), donc le tester dans l'effet ci-dessus le
  // trouvait encore vide une fois sur deux → avertissement jamais affiché,
  // panne silencieuse. On interroge l'espace OWNER, pas l'espace actif : c'est
  // celui que le diagnostic écrit réellement (cf DiagnosticLoading, 30/06).
  useEffect(() => {
    if (isDemoMode || !user || !ownWorkspace?.id) return;
    let cancelled = false;
    (async () => {
      const { data: branded } = await (supabase.from("brand_profile") as any)
        .select("mission, positioning")
        .eq("workspace_id", ownWorkspace.id)
        .maybeSingle();
      if (cancelled) return;
      setBrandedSpaceName(
        branded && (branded.mission || branded.positioning) ? (ownWorkspace.name || "") : null
      );
    })();
    return () => { cancelled = true; };
  }, [user, isDemoMode, ownWorkspace?.id, ownWorkspace?.name]);

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

  // Pre-scrape website in background (triggered on leaving step 4)
  const preScrapeTriggered = useRef(false);
  const triggerPreScrape = useCallback(() => {
    if (isDemoMode || !user || preScrapeTriggered.current) return;
    const url = answers.website?.trim();
    if (!url || url.length < 5 || !url.includes(".")) return;
    preScrapeTriggered.current = true;
    supabase.functions.invoke("pre-scrape-website", {
      body: { userId: user.id, websiteUrl: url },
    }).catch(e => console.warn("Pre-scrape failed (non-blocking):", e));
  }, [isDemoMode, user, answers.website]);


  /* ── file upload ── */
  function sanitizeFileName(name: string): string {
    const ext = name.split(".").pop()?.toLowerCase() || "png";
    const base = name.replace(/\.[^.]+$/, "");
    const clean = base
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9_-]/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_|_$/g, "")
      .slice(0, 50);
    return `${clean || "screenshot"}.${ext}`;
  }

  const handleFileUpload = async (files: FileList | null) => {
    if (!files || !user) return;
    setUploading(true);
    try {
      for (const file of Array.from(files).slice(0, 3 - uploadedFiles.length)) {
        const ext = file.name.split(".").pop()?.toLowerCase();
        const allowed = ["png", "jpg", "jpeg", "webp"];
        if (!ext || !allowed.includes(ext)) {
          toast.error("Format non supporté", { description: `${file.name} ignoré` });
          continue;
        }

        // Compress large images before upload (target: 1.5 MB max)
        const { compressImageFile } = await import("@/lib/image-compress");
        const compressedFile = await compressImageFile(file);

        const safeName = sanitizeFileName(compressedFile.name);
        const filePath = `${user.id}/onboarding/${Date.now()}_${safeName}`;
        const { error: uploadError } = await supabase.storage
          .from("onboarding-uploads")
          .upload(filePath, compressedFile);

        if (uploadError) {
          console.error("Upload error:", uploadError);
          toast.error("Erreur", { description: `Upload de ${file.name} échoué` });
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
      toast.error("Erreur", { description: friendlyError(e as Error) });
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
        .from("profiles").select("id").eq("user_id", profileUserId).maybeSingle();

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
      // Écriture INCONDITIONNELLE : le formulaire fait foi, y compris quand il
      // est vide. En « n'écrire que si non vide », un mauvais handle ou un vieux
      // texte « à propos » devenait indéboulonnable — l'onboarding le re-pré-
      // remplit depuis le profil, donc l'effacer à l'écran ne l'effaçait jamais
      // en base, et deep-diagnostic continuait de le manger à chaque passage.
      profileData.instagram_username = answers.instagram ? answers.instagram.replace(/^@/, "") : null;
      profileData.website_url = answers.website || null;
      profileData.linkedin_url = answers.linkedin || null;
      profileData.linkedin_summary = answers.linkedin_summary || null;

      if (existingProfile) {
        const { error: updateErr } = await supabase.from("profiles").update(profileData).eq("user_id", profileUserId);
        if (updateErr) {
          console.error("Failed to update profile:", updateErr);
          toast.error("Erreur de sauvegarde", { description: "Ton profil n'a pas pu être enregistré. Vérifie ta connexion et réessaie." });
        }
      } else {
        const { error: insertErr } = await supabase.from("profiles").insert({ user_id: profileUserId, ...profileData });
        if (insertErr) {
          console.error("Failed to insert profile:", insertErr);
          toast.error("Erreur de sauvegarde", { description: "Ton profil n'a pas pu être enregistré. Vérifie ta connexion et réessaie." });
        }
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
        if (updErr) {
          console.error("Failed to update plan_config:", updErr);
          toast.error("Erreur de sauvegarde", { description: "Ton profil n'a pas pu être enregistré. Vérifie ta connexion et réessaie." });
        }
      } else {
        const { error: insErr } = await supabase.from("user_plan_config").insert({ user_id: user.id, ...configData });
        if (insErr) {
          console.error("Failed to insert plan_config:", insErr);
          toast.error("Erreur de sauvegarde", { description: "Ton profil n'a pas pu être enregistré. Vérifie ta connexion et réessaie." });
        }
      }

      // NOTE: brand_profile and persona are now filled by the deep-diagnostic edge function, not here.

      // 3. BRAND_PROPOSITION — save positioning if available
      // Lecture ET écriture scopées à l'espace actif, puis update PAR ID :
      // filtrer sur le seul `user_id` écrasait la proposition de TOUS les
      // espaces de la personne (dont ceux de ses clientes) d'un coup.
      if (brandingAnswers.positioning) {
        // `as any` : le nom de colonne est dynamique (user_id | workspace_id),
        // ce que les types générés de Supabase ne savent pas résoudre (TS2589).
        const { data: existingProp } = await (supabase.from("brand_proposition") as any)
          .select("id").eq(column, value).maybeSingle();
        const propData = { version_complete: brandingAnswers.positioning };
        if (existingProp) {
          await supabase.from("brand_proposition").update(propData).eq("id", existingProp.id);
        } else {
          await supabase.from("brand_proposition").insert({
            user_id: profileUserId,
            workspace_id: workspaceId !== profileUserId ? workspaceId : undefined,
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
        // Même scoping espace + update par id que brand_proposition ci-dessus.
        const { data: existingStrategy } = await (supabase.from("brand_strategy") as any)
          .select("id").eq(column, value).order("updated_at", { ascending: false }).limit(1).maybeSingle();
        if (existingStrategy) {
          await supabase.from("brand_strategy").update(strategyData).eq("id", existingStrategy.id);
        } else {
          await supabase.from("brand_strategy").insert({
            user_id: profileUserId,
            workspace_id: workspaceId !== profileUserId ? workspaceId : undefined,
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
      toast.error("Erreur", { description: friendlyError(error as Error) });
    } finally {
      setSaving(false);
    }
  };

  const handleSkipDemo = () => {
    skipDemoOnboarding();
    navigate("/dashboard", { replace: true });
  };

  const handleDiagnosticComplete = async (goCreate = false) => {
    if (isDemoMode) {
      skipDemoOnboarding();
      navigate("/welcome", { replace: true });
      return;
    }
    if (!user) {
      navigate("/welcome", { replace: true });
      return;
    }
    // ── Écritures de COMPLETION : elles décident si toute l'app laisse passer ──
    // Tant qu'aucune des deux tables ne dit onboarding_completed=true,
    // ProtectedRoute renvoie vers /onboarding depuis n'importe quelle page.
    // supabase-js ne LÈVE pas ses erreurs : sans lire `error`, un échec
    // (réseau, RLS) partait en console.error muet et l'utilisatrice se faisait
    // téléporter au début de l'onboarding un peu plus tard (vécu 13/08, en
    // plein 1er contenu). On vérifie donc, on retente une fois, et on prévient
    // clairement si rien n'a pu être écrit.
    const completionProfile = {
      onboarding_completed: true,
      onboarding_completed_at: new Date().toISOString(),
      onboarding_step: TOTAL_STEPS,
    };
    let profileCompletionError: unknown = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      const { error } = await supabase
        .from("profiles")
        .update(completionProfile)
        .eq("user_id", profileUserId);
      profileCompletionError = error;
      if (!error) break;
      console.error("[onboarding] completion write (profiles) failed:", error);
    }

    try {

      if (diagnosticData) {
        // Save diagnostic as branding audit
        await supabase.from("branding_audits").insert({
          user_id: profileUserId,
          workspace_id: workspaceId !== profileUserId ? workspaceId : undefined,
          score_global: diagnosticData.totalScore,
          synthese: `Diagnostic initial : score ${diagnosticData.totalScore}/100`,
          points_forts: diagnosticData.strengths.map((s: string) => ({ titre: s, detail: s, source: "diagnostic" })),
          points_faibles: diagnosticData.weaknesses.map((w: { title: string; why: string }) => ({ titre: w.title, detail: w.why, source: "diagnostic", priorite: "high" })),
        } as any);

        await supabase.from("profiles").update({
          diagnostic_data: diagnosticData as any,
        }).eq("user_id", profileUserId);
      }
    } catch (e) {
      console.error("Failed to save diagnostic:", e);
    }
    localStorage.removeItem("lac_onboarding_step");
    localStorage.removeItem("lac_onboarding_answers");
    localStorage.removeItem("lac_onboarding_branding");
    localStorage.removeItem("lac_onboarding_ts");

    // Ensure user_plan_config.onboarding_completed is set
    // (safety net in case handleFinish had a silent failure)
    let configCompletionError: unknown = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      const { error } = await (supabase.from("user_plan_config") as any)
        .update({ onboarding_completed: true })
        .eq("user_id", user.id);
      configCompletionError = error;
      if (!error) break;
      console.error("[onboarding] completion write (user_plan_config) failed:", error);
    }

    // Les DEUX écritures ont échoué (après retry) : le compte serait renvoyé
    // au début de l'onboarding à la prochaine vérification. On le dit au lieu
    // de continuer comme si de rien n'était.
    if (profileCompletionError && configCompletionError) {
      toast.error("Ta fin d'onboarding n'a pas pu être enregistrée", {
        description: "Vérifie ta connexion — sans ça, l'app te redemandera l'onboarding à la prochaine visite.",
        duration: 10000,
      });
    }

    if (goCreate) {
      // On n'envoie plus direct sur /creer : on intercale l'écran de validation
      // de marque (BrandingReview, rendu par /branding quand une fiche
      // « à valider » existe). Une fois la marque relue + confirmée, BrandingPage
      // enchaîne sur « générer mon 1er contenu » (next=creer, via le helper
      // resolveFirstContentDestination partagé).
      navigate("/branding?from=onboarding&next=creer", { replace: true });
      return;
    }
    navigate("/welcome", { replace: true });
  };

  const getPlaceholder = (field: string) => {
    const examples = getActivityExamples(answers.activity_detail || answers.activite || answers.activity_type);
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
    
    diagnosticData,
    setDiagnosticData,
    isDemoMode,
    demoData,
    handleFileUpload,
    removeFile,
    handleFinish,
    handleSkipDemo,
    brandedSpaceName,
    overwriteConfirmed,
    setOverwriteConfirmed,
    handleDiagnosticComplete,
    getPlaceholder,
    getTimeRemaining,
    triggerPreScrape,
  };
}
