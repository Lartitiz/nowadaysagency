import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import AppHeader from "@/components/AppHeader";
import SubPageHeader from "@/components/SubPageHeader";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import AuditVisualResult, { type AuditVisualData, type AuditEvolution } from "@/components/audit/AuditVisualResult";
import AuditBioBeforeAfter from "@/components/audit/AuditBioBeforeAfter";
import AuditInputForm, { type AuditFormData } from "@/components/audit/AuditInputForm";
import ContentAnalysisResults from "@/components/audit/ContentAnalysisResults";
import { calculateAuditScore, getScoreLabel, type ProfileForScore } from "@/lib/audit-score";
import { Progress } from "@/components/ui/progress";

export default function InstagramAudit() {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [analyzing, setAnalyzing] = useState(false);
  const [auditResult, setAuditResult] = useState<any>(null);
  const [auditId, setAuditId] = useState<string | null>(null);
  const [auditDate, setAuditDate] = useState<string | null>(null);
  const [loadingExisting, setLoadingExisting] = useState(true);
  const [previousAudit, setPreviousAudit] = useState<any>(null);
  const [profileData, setProfileData] = useState<any>(null);
  const [liveScore, setLiveScore] = useState<number | null>(null);

  // Load existing audit + profile on mount
  useEffect(() => {
    if (!user) return;
    Promise.all([
      supabase.from("instagram_audit").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(2),
      supabase.from("profiles").select("instagram_display_name, instagram_username, instagram_bio, instagram_bio_link, instagram_photo_description, instagram_photo_url, instagram_highlights, instagram_highlights_count, instagram_pinned_posts, instagram_feed_description, instagram_followers, instagram_posts_per_month, instagram_frequency, instagram_pillars").eq("user_id", user.id).maybeSingle(),
    ]).then(([{ data: rows }, { data: profile }]) => {
      if (rows && rows.length > 0) {
        const latest = rows[0];
        if (latest.details || latest.content_analysis) {
          setAuditResult(latest.details || latest);
          setAuditId(latest.id);
          setAuditDate(latest.created_at);
        }
        if (rows.length > 1) setPreviousAudit(rows[1]);
      }
      if (profile) {
        setProfileData(profile);
        const pfs: ProfileForScore = {
          instagram_display_name: profile.instagram_display_name,
          instagram_bio: profile.instagram_bio,
          instagram_bio_link: profile.instagram_bio_link,
          instagram_photo_description: profile.instagram_photo_description,
          instagram_photo_url: profile.instagram_photo_url,
          instagram_highlights: profile.instagram_highlights as string[] | null,
          instagram_highlights_count: profile.instagram_highlights_count,
          instagram_pinned_posts: profile.instagram_pinned_posts as any,
          instagram_pillars: profile.instagram_pillars as string[] | null,
        };
        setLiveScore(calculateAuditScore(pfs));
      }
      setLoadingExisting(false);
    });
  }, [user]);

  const sanitizeFileName = (fileName: string) => {
    const ext = fileName.split(".").pop()?.toLowerCase() || "png";
    return `upload-${Date.now()}-${Math.random().toString(36).substring(2, 8)}.${ext}`;
  };

  const uploadFile = async (file: File, prefix: string) => {
    const path = `${user!.id}/${prefix}-${sanitizeFileName(file.name)}`;
    const { error } = await supabase.storage.from("audit-screenshots").upload(path, file, { contentType: file.type, upsert: false });
    if (error) throw error;
    return supabase.storage.from("audit-screenshots").getPublicUrl(path).data.publicUrl;
  };

  const handleSubmit = async (form: AuditFormData) => {
    if (!user) return;
    setAnalyzing(true);
    setAuditResult(null);

    try {
      // 1. Save profile data to profiles table
      const highlightsArray = form.highlights ? form.highlights.split(",").map((s) => s.trim()).filter(Boolean) : [];
      const pinnedPosts = [form.pinnedPost1, form.pinnedPost2, form.pinnedPost3].filter(Boolean).map((d) => ({ description: d }));
      const pillarsArray = form.pillars ? form.pillars.split(",").map((s) => s.trim()).filter(Boolean) : [];

      await supabase.from("profiles").update({
        instagram_display_name: form.displayName || null,
        instagram_username: form.username || null,
        instagram_bio: form.bio || null,
        instagram_bio_link: form.bioLink || null,
        instagram_photo_description: form.photoDescription || null,
        instagram_highlights: highlightsArray.length ? highlightsArray : null,
        instagram_highlights_count: form.highlightsCount ? parseInt(form.highlightsCount) : highlightsArray.length || null,
        instagram_pinned_posts: pinnedPosts.length ? pinnedPosts : null,
        instagram_feed_description: form.feedDescription || null,
        instagram_followers: form.followers ? parseInt(form.followers) : null,
        instagram_posts_per_month: form.postsPerMonth ? parseInt(form.postsPerMonth) : null,
        instagram_frequency: form.frequency || null,
        instagram_pillars: pillarsArray.length ? pillarsArray : null,
      } as any).eq("user_id", user.id);

      // 2. Upload screenshots if any
      const screenshotUrls: string[] = [];
      for (const f of form.profileScreenshots) {
        screenshotUrls.push(await uploadFile(f, "profile"));
      }
      if (form.feedScreenshot) {
        screenshotUrls.push(await uploadFile(form.feedScreenshot, "feed"));
      }
      if (form.highlightsScreenshot) {
        screenshotUrls.push(await uploadFile(form.highlightsScreenshot, "highlights"));
      }

      // 3. Call AI audit
      const res = await supabase.functions.invoke("generate-content", {
        body: {
          type: "instagram-audit",
          profile: {},
          screenshots: screenshotUrls.length ? screenshotUrls : undefined,
          // Text-based inputs
          auditTextData: {
            displayName: form.displayName,
            username: form.username,
            bio: form.bio,
            bioLink: form.bioLink,
            photoDescription: form.photoDescription,
            highlights: highlightsArray,
            highlightsCount: form.highlightsCount ? parseInt(form.highlightsCount) : highlightsArray.length,
            pinnedPosts,
            feedDescription: form.feedDescription,
            followers: form.followers ? parseInt(form.followers) : null,
            postsPerMonth: form.postsPerMonth ? parseInt(form.postsPerMonth) : null,
            frequency: form.frequency,
            pillars: pillarsArray,
          },
        },
      });

      if (res.error) throw new Error(res.error.message);

      let parsed: any;
      const content = res.data?.content || "";
      try {
        parsed = JSON.parse(content);
      } catch {
        const match = content.match(/\{[\s\S]*\}/);
        if (match) parsed = JSON.parse(match[0]);
        else throw new Error("Format de réponse inattendu");
      }

      // 4. Save audit to DB
      const { data: insertData } = await supabase.from("instagram_audit").insert({
        user_id: user.id,
        score_global: parsed.score_global,
        score_nom: parsed.sections?.nom?.score ?? parsed.visual_audit?.elements?.find((e: any) => e.element === "nom")?.score ?? 0,
        score_bio: parsed.sections?.bio?.score ?? parsed.visual_audit?.elements?.find((e: any) => e.element === "bio")?.score ?? 0,
        score_stories: parsed.sections?.stories?.score ?? parsed.visual_audit?.elements?.find((e: any) => e.element === "highlights")?.score ?? 0,
        score_epingles: parsed.sections?.epingles?.score ?? parsed.visual_audit?.elements?.find((e: any) => e.element === "posts_epingles")?.score ?? 0,
        score_feed: parsed.sections?.feed?.score ?? parsed.visual_audit?.elements?.find((e: any) => e.element === "feed")?.score ?? 0,
        score_edito: parsed.sections?.edito?.score ?? 0,
        resume: parsed.resume,
        details: parsed,
        profile_url: null,
      }).select("id").single();

      if (insertData) setAuditId(insertData.id);
      setAuditDate(new Date().toISOString());
      setAuditResult(parsed);
      toast({ title: "Audit terminé !" });
    } catch (e: any) {
      toast({ title: "Erreur", description: e.message, variant: "destructive" });
    } finally {
      setAnalyzing(false);
    }
  };

  const handleAdoptBio = async (bio: string) => {
    if (!user) return;
    try {
      await supabase.from("profiles").update({
        instagram_bio: bio,
        validated_bio: bio,
        validated_bio_at: new Date().toISOString(),
      } as any).eq("user_id", user.id);

      await supabase.from("audit_validations").upsert({
        user_id: user.id,
        section: "bio",
        status: "validated",
        validated_at: new Date().toISOString(),
        validated_content: { bio },
      }, { onConflict: "user_id,section" });

      toast({ title: "✅ Bio adoptée et sauvegardée !" });
    } catch (e: any) {
      toast({ title: "Erreur", description: e.message, variant: "destructive" });
    }
  };

  const handleSaveToEditorial = async () => {
    if (!user || !auditResult?.editorial_recommendations) return;
    try {
      const insights = {
        best_format: auditResult.editorial_recommendations.best_format,
        best_angle: auditResult.editorial_recommendations.best_angle,
        best_content_types: auditResult.editorial_recommendations.best_content_types,
        worst_content_types: auditResult.editorial_recommendations.worst_content_types,
        recommended_mix: auditResult.editorial_recommendations.recommended_mix,
        combo_gagnant: auditResult.combo_gagnant,
        analyzed_at: new Date().toISOString(),
      };
      const { data: existing } = await supabase.from("instagram_editorial_line").select("id").eq("user_id", user.id).maybeSingle();
      if (existing) {
        await supabase.from("instagram_editorial_line").update({ content_insights: insights }).eq("user_id", user.id);
      } else {
        await supabase.from("instagram_editorial_line").insert({ user_id: user.id, content_insights: insights });
      }
      toast({ title: "Insights sauvegardés dans ta ligne éditoriale !" });
    } catch (e: any) {
      toast({ title: "Erreur", description: e.message, variant: "destructive" });
    }
  };

  // ── Build visual data ──
  const buildVisualData = (): AuditVisualData | null => {
    if (!auditResult?.visual_audit) return null;
    const va = auditResult.visual_audit;
    const elements = (va.elements || []).map((el: any) => ({
      ...el,
      link_to: el.element === "highlights" ? "/instagram/profil/stories" : el.element === "posts_epingles" ? "/instagram/profil/epingles" : el.element === "bio" ? "/instagram/profil/bio" : el.element === "nom" ? "/instagram/profil/nom" : el.element === "feed" ? "/instagram/profil/feed" : undefined,
      link_label: el.element === "highlights" ? "📖 Module highlights" : el.element === "posts_epingles" ? "📌 Choisir mes posts" : el.element === "bio" ? "✏️ Créer ma bio" : el.element === "nom" ? "✏️ Optimiser mon nom" : el.element === "feed" ? "🎨 Recommandations" : undefined,
    }));
    return {
      score_global: auditResult.score_global || va.score_global || 0,
      elements,
      priorite_1: va.priorite_1,
      resume: va.resume || { ok_count: 0, improve_count: 0, critical_count: 0 },
    };
  };

  const buildEvolution = (): AuditEvolution | null => {
    if (!previousAudit || !auditResult) return null;
    const prevDetails = previousAudit.details as any;
    const prevVisual = prevDetails?.visual_audit;
    if (!prevVisual?.elements) return null;
    const currentElements = auditResult.visual_audit?.elements || [];
    const prevElements = prevVisual.elements || [];
    const statusLabel = (s: string) => s === "ok" ? "🟢" : s === "improve" ? "🟡" : "🔴";
    const improved: AuditEvolution["improved"] = [];
    const unchanged: AuditEvolution["unchanged"] = [];
    for (const cur of currentElements) {
      const prev = prevElements.find((p: any) => p.element === cur.element);
      if (!prev) continue;
      if (prev.status !== cur.status) {
        const order = { critical: 0, improve: 1, ok: 2 };
        if ((order[cur.status as keyof typeof order] || 0) > (order[prev.status as keyof typeof order] || 0)) {
          improved.push({ label: cur.label, from: statusLabel(prev.status), to: statusLabel(cur.status) });
        }
      } else {
        unchanged.push({ label: cur.label, status: statusLabel(cur.status) });
      }
    }
    return { previous_score: prevDetails?.score_global || previousAudit.score_global || 0, previous_date: previousAudit.created_at, improved, unchanged };
  };

  // ── Loading ──
  if (loadingExisting) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader />
        <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      </div>
    );
  }

  // ── Results view ──
  if (auditResult) {
    const visualData = buildVisualData();
    const evolution = buildEvolution();
    const bioElement = auditResult.visual_audit?.elements?.find((e: any) => e.element === "bio");

    return (
      <div className="min-h-screen bg-background">
        <AppHeader />
        <main className="mx-auto max-w-3xl px-6 py-8 max-md:px-4">
          <SubPageHeader parentLabel="Mon profil" parentTo="/instagram/profil" currentLabel="Audit" />
          <div className="flex items-center justify-between mb-6 flex-wrap gap-2">
            <h1 className="font-display text-[26px] font-bold text-foreground">🔍 Résultat de ton audit</h1>
            {auditDate && (
              <span className="text-xs text-muted-foreground">
                {new Date(auditDate).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}
              </span>
            )}
          </div>

          {/* Live score recalc banner */}
          {liveScore !== null && auditResult.score_global && liveScore > auditResult.score_global && (
            <div className="rounded-2xl border border-border bg-green-50/50 dark:bg-green-950/20 p-4 mb-6">
              <p className="text-sm text-foreground">
                📈 Tu as amélioré des éléments depuis cet audit. Ton score estimé est passé de <strong>{auditResult.score_global}</strong> à <strong>{liveScore}</strong>.
              </p>
              <Button variant="outline" size="sm" className="rounded-pill mt-2 gap-1.5" onClick={() => { setAuditResult(null); setAuditId(null); setAuditDate(null); }}>
                🔍 Relancer l'audit complet
              </Button>
            </div>
          )}

          {visualData && (
            <AuditVisualResult data={visualData} evolution={evolution} onRegenerate={() => { setAuditResult(null); setAuditId(null); setAuditDate(null); }} />
          )}

          {/* Bio before/after section */}
          {bioElement && bioElement.lignes && (
            <div className="mt-6 rounded-2xl border border-border bg-card p-5 space-y-4">
              <h3 className="font-display text-base font-bold text-foreground">📝 Détail de ta bio</h3>
              <AuditBioBeforeAfter
                currentBio={bioElement.current || profileData?.instagram_bio || ""}
                lignes={bioElement.lignes}
                proposedBio={bioElement.proposition || ""}
                onAdoptBio={handleAdoptBio}
              />
            </div>
          )}

          {/* Content analysis */}
          {(auditResult.content_analysis || auditResult.content_dna) && (
            <div className="mt-8">
              <ContentAnalysisResults
                contentAnalysis={auditResult.content_analysis}
                contentDna={auditResult.content_dna}
                comboGagnant={auditResult.combo_gagnant}
                editorialRecommendations={auditResult.editorial_recommendations}
                onSaveToEditorial={handleSaveToEditorial}
              />
            </div>
          )}

          <div className="flex flex-wrap gap-3 mt-8">
            <Button variant="outline" onClick={() => { setAuditResult(null); setAuditId(null); setAuditDate(null); }} className="rounded-pill gap-2">
              🔄 Refaire l'audit
            </Button>
            <Button onClick={() => navigate("/instagram/profil")} className="rounded-pill gap-2">
              👤 Voir mon profil
            </Button>
          </div>
        </main>
      </div>
    );
  }

  // ── Input form view ──
  const initialForm: Partial<AuditFormData> = profileData ? {
    displayName: profileData.instagram_display_name || "",
    username: profileData.instagram_username || "",
    bio: profileData.instagram_bio || "",
    bioLink: profileData.instagram_bio_link || "",
    photoDescription: profileData.instagram_photo_description || "",
    highlights: (profileData.instagram_highlights as string[] || []).join(", "),
    highlightsCount: profileData.instagram_highlights_count?.toString() || "",
    hasPinned: profileData.instagram_pinned_posts ? true : null,
    pinnedPost1: (profileData.instagram_pinned_posts as any)?.[0]?.description || "",
    pinnedPost2: (profileData.instagram_pinned_posts as any)?.[1]?.description || "",
    pinnedPost3: (profileData.instagram_pinned_posts as any)?.[2]?.description || "",
    feedDescription: profileData.instagram_feed_description || "",
    followers: profileData.instagram_followers?.toString() || "",
    postsPerMonth: profileData.instagram_posts_per_month?.toString() || "",
    frequency: profileData.instagram_frequency || "",
    pillars: (profileData.instagram_pillars as string[] || []).join(", "),
  } : undefined;

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-3xl px-6 py-8 max-md:px-4">
        <SubPageHeader parentLabel="Mon profil" parentTo="/instagram/profil" currentLabel="Audit" />
        <h1 className="font-display text-[26px] font-bold text-foreground">🔍 Audit de ton profil Instagram</h1>
        <p className="mt-2 text-sm text-muted-foreground italic mb-8">
          Remplis les infos de ton profil. L'IA analyse tout et te donne un score avec des recommandations concrètes.
        </p>
        <AuditInputForm initial={initialForm} onSubmit={handleSubmit} loading={analyzing} />
      </main>
    </div>
  );
}
