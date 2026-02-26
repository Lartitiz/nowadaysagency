import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspaceFilter } from "@/hooks/use-workspace-query";
import { useProfile, useBrandProfile } from "@/hooks/use-profile";
import { useBrandCharter } from "@/hooks/use-branding";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useAutoSave, SaveIndicator } from "@/hooks/use-auto-save";
import AppHeader from "@/components/AppHeader";
import SubPageHeader from "@/components/SubPageHeader";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { ArrowLeft, Upload, X, Sparkles, FileText, Loader2, CheckCircle2, GripVertical } from "lucide-react";
import { type Emotion, type Universe, type StyleAxis, type GeneratedPalette } from "@/lib/charter-palette-generator";
import CharterColorsSection from "@/components/branding/charter/CharterColorsSection";
import CharterTypographySection from "@/components/branding/charter/CharterTypographySection";
import CharterTemplatesSection from "@/components/branding/charter/CharterTemplatesSection";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import BrandingCoachingFlow from "@/components/branding/BrandingCoachingFlow";
import { ACTIVITY_TO_SECTOR, DEFAULT_SECTOR } from "@/lib/charter-palettes";

const MOOD_OPTIONS = [
  "Minimaliste", "Coloré", "Vintage", "Épuré", "Artisanal", "Pop",
  "Luxe", "Naturel", "Audacieux", "Doux", "Géométrique", "Organique",
];

const DEFAULT_COLORS = {
  color_primary: "#E91E8C",
  color_secondary: "#1A1A2E",
  color_accent: "#FFE561",
  color_background: "#FFFFFF",
  color_text: "#1A1A2E",
};

interface CharterData {
  id?: string;
  logo_url?: string | null;
  logo_variants?: any[];
  color_primary: string;
  color_secondary: string;
  color_accent: string;
  color_background: string;
  color_text: string;
  custom_colors: string[];
  font_title: string;
  font_body: string;
  font_accent: string | null;
  photo_style: string | null;
  photo_keywords: string[];
  mood_keywords: string[];
  visual_donts: string | null;
  mood_board_urls: string[];
  icon_style: string;
  border_radius: string;
  uploaded_templates: { url: string; name: string }[];
  completion_pct: number;
  ai_generated_brief: string | null;
  updated_at?: string;
  moodboard_images: { url: string; path: string; name: string }[];
  moodboard_description: string | null;
}

const INITIAL: CharterData = {
  color_primary: "#E91E8C",
  color_secondary: "#1A1A2E",
  color_accent: "#FFE561",
  color_background: "#FFFFFF",
  color_text: "#1A1A2E",
  custom_colors: [],
  font_title: "Inter",
  font_body: "Inter",
  font_accent: null,
  photo_style: null,
  photo_keywords: [],
  mood_keywords: [],
  visual_donts: null,
  mood_board_urls: [],
  icon_style: "outline",
  border_radius: "rounded",
  uploaded_templates: [],
  completion_pct: 0,
  ai_generated_brief: null,
  moodboard_images: [],
  moodboard_description: null,
};

function computeCompletion(d: CharterData): number {
  let pct = 0;
  if (d.logo_url) pct += 20;
  const changedColors = (["color_primary", "color_secondary", "color_accent", "color_background", "color_text"] as const)
    .filter(k => d[k] !== DEFAULT_COLORS[k]).length;
  if (changedColors >= 3) pct += 25;
  if (d.font_title !== "Inter" && d.font_body !== "Inter") pct += 20;
  if (d.mood_keywords.length >= 3) pct += 20;
  if (d.photo_style && d.photo_style.trim().length > 0) pct += 15;
  return pct;
}

function loadGoogleFont(font: string) {
  const id = `gf-${font.replace(/\s+/g, "-")}`;
  if (document.getElementById(id)) return;
  const link = document.createElement("link");
  link.id = id;
  link.rel = "stylesheet";
  link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(font)}:wght@400;700&display=swap`;
  document.head.appendChild(link);
}

// ── MoodboardSection component ──
function MoodboardSection({ images, description, onImagesChange, onDescriptionChange, userId }: {
  images: { url: string; path: string; name: string }[];
  description: string | null;
  onImagesChange: (imgs: { url: string; path: string; name: string }[]) => void;
  onDescriptionChange: (desc: string | null) => void;
  userId: string;
}) {
  const [uploading, setUploading] = useState(false);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (files: FileList | null) => {
    if (!files || !userId) return;
    const remaining = 9 - images.length;
    if (remaining <= 0) {
      toast.info("Maximum 9 images pour le moodboard");
      return;
    }
    const toUpload = Array.from(files).slice(0, remaining);
    if (toUpload.length === 0) return;
    setUploading(true);
    try {
      const newImages = [...images];
      for (const file of toUpload) {
        const ext = file.name.split(".").pop();
        const path = `${userId}/${Date.now()}-${file.name}`;
        const { error } = await supabase.storage.from("moodboards").upload(path, file);
        if (error) throw error;
        // Get signed URL (private bucket)
        const { data: signedData } = await supabase.storage.from("moodboards").createSignedUrl(path, 60 * 60 * 24 * 365);
        newImages.push({ url: signedData?.signedUrl || "", path, name: file.name });
      }
      onImagesChange(newImages);
      toast.success("Images ajoutées !");
    } catch (err: any) {
      console.error(err);
      toast.error("Erreur lors de l'upload");
    } finally {
      setUploading(false);
    }
  };

  const removeImage = async (idx: number) => {
    const img = images[idx];
    if (img.path) {
      await supabase.storage.from("moodboards").remove([img.path]);
    }
    onImagesChange(images.filter((_, i) => i !== idx));
  };

  const handleDragStart = (idx: number) => setDragIdx(idx);
  const handleDragOver = (e: React.DragEvent, idx: number) => { e.preventDefault(); setDragOverIdx(idx); };
  const handleDrop = (idx: number) => {
    if (dragIdx === null || dragIdx === idx) { setDragIdx(null); setDragOverIdx(null); return; }
    const reordered = [...images];
    const [moved] = reordered.splice(dragIdx, 1);
    reordered.splice(idx, 0, moved);
    onImagesChange(reordered);
    setDragIdx(null);
    setDragOverIdx(null);
  };

  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <h2 className="font-display text-base font-bold text-foreground mb-4">🎭 Mon moodboard</h2>
      <p className="text-xs text-muted-foreground mb-4">Ajoute 4 à 9 images qui représentent l'univers visuel de ta marque. Glisse pour réordonner.</p>

      {/* Grid */}
      {images.length > 0 && (
        <div className="grid grid-cols-3 gap-2 mb-4">
          {images.map((img, idx) => (
            <div
              key={img.path || idx}
              draggable
              onDragStart={() => handleDragStart(idx)}
              onDragOver={(e) => handleDragOver(e, idx)}
              onDrop={() => handleDrop(idx)}
              onDragEnd={() => { setDragIdx(null); setDragOverIdx(null); }}
              className={`relative group aspect-square rounded-xl border overflow-hidden cursor-grab transition-all ${
                dragOverIdx === idx ? "border-primary ring-2 ring-primary/20" : "border-border"
              }`}
            >
              <img src={img.url} alt={img.name} className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-foreground/0 group-hover:bg-foreground/10 transition-colors" />
              <button
                onClick={() => removeImage(idx)}
                className="absolute top-1.5 right-1.5 bg-background/80 backdrop-blur-sm rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X className="h-3 w-3 text-foreground" />
              </button>
              <div className="absolute top-1.5 left-1.5 opacity-0 group-hover:opacity-60 transition-opacity">
                <GripVertical className="h-4 w-4 text-foreground" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Upload zone */}
      {images.length < 9 && (
        <label
          className="flex flex-col items-center gap-2 cursor-pointer rounded-xl border-2 border-dashed border-border hover:border-primary/40 transition-colors p-6"
        >
          <Upload className="h-6 w-6 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">
            {uploading ? "Upload en cours..." : `Ajouter des images (${images.length}/9)`}
          </span>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => { handleUpload(e.target.files); e.target.value = ""; }}
            disabled={uploading}
          />
        </label>
      )}

      {/* Description */}
      <div className="mt-4">
        <label className="text-sm font-medium text-foreground mb-1.5 block">Décris l'ambiance de ton moodboard (optionnel)</label>
        <Textarea
          value={description || ""}
          onChange={(e) => onDescriptionChange(e.target.value || null)}
          placeholder="Ex : ambiance chaleureuse, couleurs terre, lumière dorée, textures naturelles…"
          rows={2}
          className="text-sm"
        />
      </div>
    </section>
  );
}

export default function BrandCharterPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialTab = searchParams.get("tab") === "coaching" ? "coaching" : "fiche";
  const [activeTab, setActiveTab] = useState(initialTab);
  const { column, value } = useWorkspaceFilter();
  const queryClient = useQueryClient();
  const { data: charterHookData, isLoading: charterHookLoading } = useBrandCharter();
  const [data, setData] = useState<CharterData>(INITIAL);
  const [loading, setLoading] = useState(true);
  const [logoUploading, setLogoUploading] = useState(false);
  const [templatesUploading, setTemplatesUploading] = useState(false);
  const dataRef = useRef(data);
  dataRef.current = data;

  // Audit state
  const [auditing, setAuditing] = useState(false);
  const [auditResult, setAuditResult] = useState<any>(null);
  const [auditDialogOpen, setAuditDialogOpen] = useState(false);
  const [userSector, setUserSector] = useState<string>(DEFAULT_SECTOR);
  const [allPalettesOpen, setAllPalettesOpen] = useState(false);
  const [toneKeywords, setToneKeywords] = useState<string[]>([]);
  const [sectorPalettesOpen, setSectorPalettesOpen] = useState(false);

  // Palette questionnaire state
  const [selectedEmotions, setSelectedEmotions] = useState<Emotion[]>([]);
  const [selectedUniverse, setSelectedUniverse] = useState<Universe | null>(null);
  const [styleAxes, setStyleAxes] = useState<StyleAxis>({ softBold: 50, classicModern: 50 });
  const [generatedPalettes, setGeneratedPalettes] = useState<GeneratedPalette[]>([]);
  // Load user sector + tone from profile/brand_profile (cached via hooks)
  const { data: profileData } = useProfile();
  const { data: brandProfileData } = useBrandProfile();

  useEffect(() => {
    if (profileData?.type_activite) {
      setUserSector(ACTIVITY_TO_SECTOR[profileData.type_activite] || DEFAULT_SECTOR);
    }
    if (brandProfileData) {
      const words: string[] = [];
      if (brandProfileData.tone_register) words.push(brandProfileData.tone_register.toLowerCase());
      if (brandProfileData.tone_style) words.push(brandProfileData.tone_style.toLowerCase());
      if (brandProfileData.tone_humor) words.push(brandProfileData.tone_humor.toLowerCase());
      if (Array.isArray(brandProfileData.tone_keywords)) {
        words.push(...brandProfileData.tone_keywords.map((k: string) => k.toLowerCase()));
      }
      setToneKeywords(words);
    }
  }, [profileData, brandProfileData]);

  // Load fonts on data change
  useEffect(() => {
    if (data.font_title) loadGoogleFont(data.font_title);
    if (data.font_body) loadGoogleFont(data.font_body);
    if (data.font_accent) loadGoogleFont(data.font_accent);
  }, [data.font_title, data.font_body, data.font_accent]);

  // Load data from hook
  useEffect(() => {
    if (charterHookLoading) return;
    if (charterHookData) {
      const row = charterHookData as any;
      setData({
        ...INITIAL,
        ...row,
        custom_colors: row.custom_colors || [],
        mood_keywords: row.mood_keywords || [],
        photo_keywords: row.photo_keywords || [],
        mood_board_urls: row.mood_board_urls || [],
        uploaded_templates: row.uploaded_templates || [],
        moodboard_images: row.moodboard_images || [],
        moodboard_description: row.moodboard_description || null,
      });
    }
    setLoading(false);
  }, [charterHookLoading, charterHookData]);

  // Auto-save
  const saveFn = useCallback(async () => {
    if (!user) return;
    const d = dataRef.current;
    const pct = computeCompletion(d);
    const payload: any = {
      color_primary: d.color_primary,
      color_secondary: d.color_secondary,
      color_accent: d.color_accent,
      color_background: d.color_background,
      color_text: d.color_text,
      custom_colors: d.custom_colors,
      font_title: d.font_title,
      font_body: d.font_body,
      font_accent: d.font_accent,
      photo_style: d.photo_style,
      photo_keywords: d.photo_keywords,
      mood_keywords: d.mood_keywords,
      visual_donts: d.visual_donts,
      mood_board_urls: d.mood_board_urls,
      icon_style: d.icon_style,
      border_radius: d.border_radius,
      uploaded_templates: d.uploaded_templates,
      completion_pct: pct,
      logo_url: d.logo_url,
      logo_variants: d.logo_variants || [],
      moodboard_images: d.moodboard_images,
      moodboard_description: d.moodboard_description,
    };

    if (d.id) {
      await supabase.from("brand_charter").update(payload).eq("id", d.id);
      queryClient.invalidateQueries({ queryKey: ["brand-charter"] });
    } else {
      payload.user_id = user.id;
      const { data: inserted } = await (supabase.from("brand_charter") as any)
        .insert(payload)
        .select("id")
        .single();
      if (inserted) {
        setData(prev => ({ ...prev, id: inserted.id }));
        queryClient.invalidateQueries({ queryKey: ["brand-charter"] });
      }
    }
  }, [user]);

  const { saved, saving, triggerSave } = useAutoSave(saveFn, 1200, "brand_charter");

  const update = <K extends keyof CharterData>(key: K, val: CharterData[K]) => {
    setData(prev => ({ ...prev, [key]: val }));
    triggerSave();
  };

  // Logo upload
  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setLogoUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `${user.id}/logo/logo.${ext}`;
      const { error } = await supabase.storage.from("brand-assets").upload(path, file, { upsert: true });
      if (error) throw error;
      const { data: urlData } = supabase.storage.from("brand-assets").getPublicUrl(path);
      update("logo_url", urlData.publicUrl);
      toast.success("Logo uploadé !");
    } catch (err: any) {
      toast.error("Erreur lors de l'upload du logo");
      console.error(err);
    } finally {
      setLogoUploading(false);
    }
  };

  const toggleMood = (keyword: string) => {
    const current = data.mood_keywords;
    if (current.includes(keyword)) {
      update("mood_keywords", current.filter(k => k !== keyword));
    } else if (current.length < 5) {
      update("mood_keywords", [...current, keyword]);
    } else {
      toast.info("Maximum 5 mots-clés");
    }
  };


  // Audit templates
  const handleAuditTemplates = async () => {
    if (!user || data.uploaded_templates.length === 0) return;
    setAuditing(true);
    try {
      const templateUrls = data.uploaded_templates.map(t => t.url);
      const { data: result, error } = await supabase.functions.invoke("audit-visual-templates", {
        body: { template_urls: templateUrls },
      });
      if (error) throw error;
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      setAuditResult(result.result);
      setAuditDialogOpen(true);
    } catch (err: any) {
      console.error(err);
      toast.error("Erreur lors de l'audit des templates");
    } finally {
      setAuditing(false);
    }
  };

  const applyDetectedCharter = () => {
    if (!auditResult?.extracted_charter) return;
    const ec = auditResult.extracted_charter;
    const updates: Partial<CharterData> = {};
    if (ec.color_primary) updates.color_primary = ec.color_primary;
    if (ec.color_secondary) updates.color_secondary = ec.color_secondary;
    if (ec.color_accent) updates.color_accent = ec.color_accent;
    if (ec.mood_keywords?.length) updates.mood_keywords = ec.mood_keywords;
    setData(prev => ({ ...prev, ...updates }));
    triggerSave();
    setAuditDialogOpen(false);
    toast.success("Charte détectée appliquée !");
  };

  const completionPct = computeCompletion(data);

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader />
        <div className="flex justify-center py-20">
          <div className="flex gap-1">
            <div className="h-3 w-3 rounded-full bg-primary animate-bounce-dot" />
            <div className="h-3 w-3 rounded-full bg-primary animate-bounce-dot" style={{ animationDelay: "0.16s" }} />
            <div className="h-3 w-3 rounded-full bg-primary animate-bounce-dot" style={{ animationDelay: "0.32s" }} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-[700px] px-6 py-8 max-md:px-4">
        <SubPageHeader breadcrumbs={[{ label: "Branding", to: "/branding" }]} currentLabel="Ma charte graphique" />

        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Retour
        </button>

        <div className="flex items-center gap-3 mb-2">
          <span className="text-2xl">🎨</span>
          <h1 className="font-display text-[26px] font-bold text-foreground">Ma charte graphique</h1>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-6">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="coaching" className="gap-1.5">
              <Sparkles className="h-3.5 w-3.5" /> Coaching IA
            </TabsTrigger>
            <TabsTrigger value="fiche" className="gap-1.5">
              <FileText className="h-3.5 w-3.5" /> Ma fiche
            </TabsTrigger>
          </TabsList>

          <TabsContent value="coaching" className="mt-4">
            <BrandingCoachingFlow
              section="charter"
              onComplete={() => {
                setActiveTab("fiche");
                // Reload charter data
                const reload = async () => {
                  const { data: row } = await (supabase.from("brand_charter") as any)
                    .select("*")
                    .eq(column, value)
                    .maybeSingle();
                  if (row) {
                    setData({
                      ...INITIAL,
                      ...row,
                      custom_colors: row.custom_colors || [],
                      mood_keywords: row.mood_keywords || [],
                      photo_keywords: row.photo_keywords || [],
                      mood_board_urls: row.mood_board_urls || [],
                      uploaded_templates: row.uploaded_templates || [],
                      moodboard_images: row.moodboard_images || [],
                      moodboard_description: row.moodboard_description || null,
                    });
                  }
                };
                reload();
              }}
              onBack={() => navigate("/branding")}
            />
          </TabsContent>

          <TabsContent value="fiche" className="mt-4">

        {/* Completion bar */}
        <div className="flex items-center gap-3 mb-6">
          <div className="h-2 bg-muted rounded-full flex-1 overflow-hidden">
            <div className="h-full bg-primary rounded-full transition-all duration-500" style={{ width: `${completionPct}%` }} />
          </div>
          <span className="text-xs text-muted-foreground font-medium">{completionPct}%</span>
          <SaveIndicator saved={saved} saving={saving} />
        </div>

        <div className="space-y-6">
          {/* SECTION 1: Logo */}
          <section className="rounded-2xl border border-border bg-card p-5">
            <h2 className="font-display text-base font-bold text-foreground mb-4">🖼️ Mon logo</h2>
            {data.logo_url ? (
              <div className="flex flex-col items-center gap-3">
                <img src={data.logo_url} alt="Logo" className="max-h-32 max-w-full object-contain rounded-xl border border-border" />
                <label className="cursor-pointer">
                  <span className="text-xs text-primary hover:underline">Changer le logo</span>
                  <input type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
                </label>
              </div>
            ) : (
              <label className="flex flex-col items-center gap-2 cursor-pointer rounded-xl border-2 border-dashed border-border hover:border-primary/40 transition-colors p-8">
                <Upload className="h-8 w-8 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">{logoUploading ? "Upload en cours..." : "Clique pour uploader ton logo"}</span>
                <input type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} disabled={logoUploading} />
              </label>
            )}
          </section>

          {/* SECTION 2: Palette de couleurs */}
          <CharterColorsSection
            data={data}
            onDataChange={(updates) => { setData(prev => ({ ...prev, ...updates })); triggerSave(); }}
            userSector={userSector}
            selectedEmotions={selectedEmotions}
            setSelectedEmotions={setSelectedEmotions}
            selectedUniverse={selectedUniverse}
            setSelectedUniverse={setSelectedUniverse}
            styleAxes={styleAxes}
            setStyleAxes={setStyleAxes}
            generatedPalettes={generatedPalettes}
            setGeneratedPalettes={setGeneratedPalettes}
            allPalettesOpen={allPalettesOpen}
            setAllPalettesOpen={setAllPalettesOpen}
            sectorPalettesOpen={sectorPalettesOpen}
            setSectorPalettesOpen={setSectorPalettesOpen}
          />

          {/* SECTION 3: Typographies */}
          <CharterTypographySection
            data={data}
            onDataChange={(updates) => { setData(prev => ({ ...prev, ...updates })); triggerSave(); }}
            toneKeywords={toneKeywords}
          />

          {/* SECTION: Moodboard */}
          <MoodboardSection
            images={data.moodboard_images}
            description={data.moodboard_description}
            onImagesChange={(imgs) => update("moodboard_images", imgs)}
            onDescriptionChange={(desc) => update("moodboard_description", desc)}
            userId={user?.id || ""}
          />

          <section className="rounded-2xl border border-border bg-card p-5">
            <h2 className="font-display text-base font-bold text-foreground mb-4">✨ Mon style visuel</h2>
            <p className="text-xs text-muted-foreground mb-3">Choisis 3 à 5 mots-clés qui définissent ton univers visuel :</p>
            <div className="flex flex-wrap gap-2 mb-5">
              {MOOD_OPTIONS.map(keyword => {
                const selected = data.mood_keywords.includes(keyword);
                return (
                  <button
                    key={keyword}
                    onClick={() => toggleMood(keyword)}
                    className={`rounded-full px-3.5 py-1.5 text-xs font-medium border transition-all ${
                      selected
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-muted/50 text-muted-foreground border-border hover:border-primary/40"
                    }`}
                  >
                    {keyword}
                  </button>
                );
              })}
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-foreground mb-1.5 block">Style photo</label>
                <Textarea
                  value={data.photo_style || ""}
                  onChange={e => update("photo_style", e.target.value)}
                  placeholder="Ex : lumière naturelle, tons chauds, cadrage serré"
                  rows={2}
                  className="text-sm"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground mb-1.5 block">Ce que je ne fais JAMAIS visuellement</label>
                <Textarea
                  value={data.visual_donts || ""}
                  onChange={e => update("visual_donts", e.target.value)}
                  placeholder="Ex : stock photos, néons, fonds blancs cliniques..."
                  rows={2}
                  className="text-sm"
                />
              </div>
            </div>
          </section>

          {/* SECTION 5: Templates */}
          <CharterTemplatesSection
            data={data}
            onDataChange={(updates) => { setData(prev => ({ ...prev, ...updates })); triggerSave(); }}
            userId={user?.id || ""}
            templatesUploading={templatesUploading}
            setTemplatesUploading={setTemplatesUploading}
            onAuditTemplates={handleAuditTemplates}
            auditing={auditing}
          />
        </div>

        {data.updated_at && (
          <p className="text-xs text-muted-foreground mt-6">
            Dernière modification : {format(new Date(data.updated_at), "d MMMM yyyy 'à' HH:mm", { locale: fr })}
          </p>
        )}

          {/* Audit Dialog */}
          <Dialog open={auditDialogOpen} onOpenChange={setAuditDialogOpen}>
            <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">🔍 Audit de tes templates</DialogTitle>
                <DialogDescription>Analyse visuelle de tes templates existants</DialogDescription>
              </DialogHeader>

              {auditResult && (
                <div className="space-y-5 mt-2">
                  {/* Coherence score */}
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground mb-1">Score de cohérence</p>
                    <div className="relative inline-flex items-center justify-center w-20 h-20">
                      <svg className="w-20 h-20 -rotate-90" viewBox="0 0 36 36">
                        <path
                          d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                          fill="none"
                          stroke="hsl(var(--muted))"
                          strokeWidth="3"
                        />
                        <path
                          d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                          fill="none"
                          stroke={auditResult.coherence_score >= 70 ? "hsl(var(--primary))" : auditResult.coherence_score >= 40 ? "hsl(45, 93%, 47%)" : "hsl(0, 84%, 60%)"}
                          strokeWidth="3"
                          strokeDasharray={`${auditResult.coherence_score}, 100`}
                        />
                      </svg>
                      <span className="absolute text-lg font-bold text-foreground">{auditResult.coherence_score}</span>
                    </div>
                    {auditResult.coherence_notes && (
                      <p className="text-xs text-muted-foreground mt-1">{auditResult.coherence_notes}</p>
                    )}
                  </div>

                  {/* Detected colors */}
                  {auditResult.detected_colors?.length > 0 && (
                    <div>
                      <p className="text-sm font-medium text-foreground mb-2">Couleurs détectées</p>
                      <div className="flex gap-2 flex-wrap">
                        {auditResult.detected_colors.map((c: string, i: number) => (
                          <div key={i} className="flex items-center gap-1.5">
                            <div className="w-8 h-8 rounded-full border-2 border-background shadow-sm" style={{ backgroundColor: c }} />
                            <span className="font-mono text-[10px] text-muted-foreground uppercase">{c}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Detected mood */}
                  {auditResult.detected_mood?.length > 0 && (
                    <div>
                      <p className="text-sm font-medium text-foreground mb-2">Ambiance détectée</p>
                      <div className="flex gap-2 flex-wrap">
                        {auditResult.detected_mood.map((m: string, i: number) => (
                          <span key={i} className="rounded-full px-3 py-1 text-xs font-medium bg-primary/10 text-primary border border-primary/20">
                            {m}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Font style & layout */}
                  {auditResult.detected_font_style && (
                    <div>
                      <p className="text-sm font-medium text-foreground mb-1">Style typographique</p>
                      <p className="text-xs text-muted-foreground">{auditResult.detected_font_style}</p>
                    </div>
                  )}
                  {auditResult.detected_layout && (
                    <div>
                      <p className="text-sm font-medium text-foreground mb-1">Mise en page</p>
                      <p className="text-xs text-muted-foreground">{auditResult.detected_layout}</p>
                    </div>
                  )}

                  {/* Gaps */}
                  {auditResult.gaps?.length > 0 && (
                    <div>
                      <p className="text-sm font-medium text-foreground mb-2">⚠️ Incohérences détectées</p>
                      <ul className="space-y-1">
                        {auditResult.gaps.map((g: string, i: number) => (
                          <li key={i} className="text-xs text-muted-foreground flex gap-1.5">
                            <span className="text-amber-500 shrink-0">•</span> {g}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Recommendations */}
                  {auditResult.recommendations?.length > 0 && (
                    <div>
                      <p className="text-sm font-medium text-foreground mb-2">💡 Recommandations</p>
                      <ul className="space-y-1">
                        {auditResult.recommendations.map((r: string, i: number) => (
                          <li key={i} className="text-xs text-muted-foreground flex gap-1.5">
                            <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" /> {r}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              <DialogFooter className="mt-4 gap-2">
                <Button variant="outline" size="sm" onClick={() => setAuditDialogOpen(false)}>
                  Fermer
                </Button>
                {auditResult?.extracted_charter && (
                  <Button size="sm" onClick={applyDetectedCharter} className="gap-1.5">
                    📥 Appliquer la charte détectée
                  </Button>
                )}
              </DialogFooter>
            </DialogContent>
          </Dialog>

          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
