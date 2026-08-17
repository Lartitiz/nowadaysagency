import { useState, useRef, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { invokeWithTimeout } from "@/lib/invoke-with-timeout";
import { useWorkspaceId } from "@/hooks/use-workspace-query";
import { friendlyError } from "@/lib/error-messages";
import { handleQuotaError } from "@/lib/quota-error-handler";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { TextareaWithVoice as Textarea } from "@/components/ui/textarea-with-voice";
import { Checkbox } from "@/components/ui/checkbox";
import { useSpeechRecognition } from "@/hooks/use-speech-recognition";
import BaseReminder from "@/components/BaseReminder";
import RedFlagsChecker from "@/components/RedFlagsChecker";
import AiLoadingIndicator from "@/components/AiLoadingIndicator";
import { Mic, MicOff, Sparkles, Loader2, Copy, RefreshCw, Upload, X, Plus, CalendarDays, Lightbulb } from "lucide-react";
import { toast } from "sonner";
import { UX_UPLOAD_LIMITS } from "@/lib/upload-limits";
import { posthog } from "@/lib/posthog";
import { AddToCalendarDialog } from "@/components/calendar/AddToCalendarDialog";
import { SaveToIdeasDialog } from "@/components/SaveToIdeasDialog";

// Aucun format pré-coché : un format « sélectionné d'office » a déjà fait
// croire à un bug (campagne QA du 17/07 : cliquer une case pré-cochée la
// décoche). Le choix appartient à l'utilisatrice ; un point d'entrée peut
// pré-cocher via l'URL (?format=stories ou ?format=carrousel,reel).
const FORMATS = [
  { id: "carrousel", label: "📑 Carrousel Instagram (8 slides)" },
  { id: "reel", label: "🎬 Script Reel (30-60 sec)" },
  { id: "stories", label: "📱 Séquence Stories (5 stories)" },
  { id: "linkedin", label: "💼 Post LinkedIn" },
  { id: "newsletter", label: "📧 Email / Newsletter" },
];

const ACCEPTED_TYPES = ["application/pdf", "image/png", "image/jpeg", "image/webp"];
const MAX_FILE_SIZE = UX_UPLOAD_LIMITS.media;
const MAX_FILES = 10;

interface UploadedFile {
  file: File;
  base64: string;
  mimeType: string;
}

function fileEmoji(mimeType: string) {
  return mimeType === "application/pdf" ? "📄" : "🖼️";
}

export default function ContentRecycling() {
  const { user } = useAuth();
  const workspaceId = useWorkspaceId();
  const [searchParams] = useSearchParams();
  const [source, setSource] = useState("");
  const [selectedFormats, setSelectedFormats] = useState<Record<string, boolean>>(() => {
    const fromUrl = (searchParams.get("format") || "")
      .split(",")
      .map(s => s.trim())
      .filter(id => FORMATS.some(f => f.id === id));
    return Object.fromEntries(FORMATS.map(f => [f.id, fromUrl.includes(f.id)]));
  });
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<Record<string, string>>({});
  const [topics, setTopics] = useState<Record<string, string>>({});
  const [carouselStructure, setCarouselStructure] = useState<
    | {
        slides: Array<{ slide_number: number; title: string; body: string }>;
        caption: { hook: string; body: string; cta: string };
      }
    | null
  >(null);
  const [activeTab, setActiveTab] = useState<string>("");
  const [showCalendarDialog, setShowCalendarDialog] = useState(false);
  const [showIdeasDialog, setShowIdeasDialog] = useState(false);

  const [files, setFiles] = useState<UploadedFile[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const { isListening, isSupported, toggle } = useSpeechRecognition((text) => {
    setSource(prev => prev + (prev ? " " : "") + text);
  });

  const formats = Object.entries(selectedFormats).filter(([, v]) => v).map(([k]) => k);

  const processFiles = useCallback(async (selectedFiles: FileList | File[]) => {
    const arr = Array.from(selectedFiles);
    const remaining = MAX_FILES - files.length;
    if (remaining <= 0) {
      toast.error("Maximum 10 fichiers");
      return;
    }
    const toAdd = arr.slice(0, remaining);
    if (arr.length > remaining) {
      toast.error(`Seulement ${remaining} fichier(s) ajouté(s)`, { description: "Maximum 10 fichiers au total." });
    }

    const newFiles: UploadedFile[] = [];
    for (const f of toAdd) {
      if (!ACCEPTED_TYPES.includes(f.type)) {
        toast.error(`${f.name} : format non supporté`, { description: "Formats acceptés : PDF, PNG, JPG, WEBP" });
        continue;
      }
      if (f.size > MAX_FILE_SIZE) {
        toast.error(`${f.name} : trop lourd`, { description: "Maximum 10 Mo par fichier." });
        continue;
      }
      const base64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).split(",")[1]);
        reader.readAsDataURL(f);
      });
      newFiles.push({ file: f, base64, mimeType: f.type });
    }
    if (newFiles.length > 0) {
      setFiles(prev => [...prev, ...newFiles]);
    }
  }, [files.length]);

  const handleFilesSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) await processFiles(e.target.files);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) await processFiles(e.dataTransfer.files);
  }, [processFiles]);

  const canRecycle = (source.trim() || files.length > 0) && formats.length > 0 && source.length <= 10000;

  const helpMessage = () => {
    const n = files.length;
    const hasText = source.trim().length > 0;
    if (n === 0) return null;
    if (n === 1 && !hasText) return "L'IA analysera le fichier et recyclera son contenu.";
    if (n === 1 && hasText) return "L'IA combinera le texte et le fichier pour le recyclage.";
    if (n > 1 && !hasText) return `L'IA analysera ${n} fichiers et recyclera leur contenu.`;
    return `L'IA combinera ${n} fichiers et ton texte pour le recyclage.`;
  };

  const handleRecycle = async () => {
    if (!canRecycle) return;
    setLoading(true);
    setResults({});
    try {
      const body: any = {
        step: "recycle",
        contentType: "recycle",
        context: `Recyclage de contenu en ${formats.length} formats`,
        profile: {},
        sourceText: source || undefined,
        formats,
        workspace_id: workspaceId,
      };

      if (files.length > 0) {
        body.files = files.map(f => ({ base64: f.base64, mimeType: f.mimeType, name: f.file.name }));
        // Backward compat: also set single file fields if only 1
        if (files.length === 1) {
          body.fileBase64 = files[0].base64;
          body.fileMimeType = files[0].mimeType;
        }
      }

      const recycleStartedAt = performance.now();
      const { data, error } = await invokeWithTimeout("creative-flow", { body }, 120000);
      if (error?.isRateLimit || data?.error === "limit_reached") {
        if (handleQuotaError({ message: error?.message || data?.message, data })) {
          return;
        }
      }
      if (error) throw new Error(error.message);
      const r = data?.results || {};
      if (Object.keys(r).length === 0) {
        toast.error("Génération incomplète", {
          description: "La génération a échoué en cours de route. Réessaie.",
        });
        return;
      }
      // Télémétrie de latence (PostHog) — même chantier que content_generation_timing.
      posthog.capture("recycle_timing", {
        duration_ms: Math.round(performance.now() - recycleStartedAt),
        formats_count: formats.length,
        with_files: files.length,
      });
      // Le pipeline par format peut livrer un résultat PARTIEL (un format
      // retombé après 2 essais) : on le dit honnêtement au lieu de laisser
      // un onglet vide sans explication.
      const failedFormats: string[] = Array.isArray(data?.failed_formats) ? data.failed_formats : [];
      if (failedFormats.length > 0) {
        toast.warning("Génération partielle", {
          description: `Le format ${failedFormats.join(", ")} n'a pas pu être généré cette fois. Relance le recyclage pour le récupérer.`,
        });
      }

      // Detect structured carousel and flatten to readable text for display
      const rawCarousel = r.carrousel;
      const display: Record<string, string> = {};
      let structure: typeof carouselStructure = null;
      for (const k of Object.keys(r)) {
        if (k === "carrousel" && rawCarousel && typeof rawCarousel === "object" && Array.isArray(rawCarousel.slides)) {
          const slides = rawCarousel.slides as Array<{ slide_number: number; title: string; body: string }>;
          const caption = rawCarousel.caption || { hook: "", body: "", cta: "" };
          structure = { slides, caption };
          const slidesText = slides
            .map((s) => `Slide ${s.slide_number} · ${s.title}\n${s.body}`)
            .join("\n\n");
          const captionText = [caption.hook, caption.body, caption.cta].filter(Boolean).join("\n\n");
          display[k] = `${slidesText}\n\n──────────\nLégende\n\n${captionText}`;
        } else {
          display[k] = typeof r[k] === "string" ? r[k] : JSON.stringify(r[k]);
        }
      }
      setCarouselStructure(structure);
      setResults(display);
      setTopics(data?.topics || {});
      setActiveTab(Object.keys(display)[0] || "");

      if (user) {
        const fileNames = files.map(f => f.file.name).join(", ");
        const { error: insertError } = await supabase.from("content_recycling").insert({
          user_id: user.id,
          source_text: source || (files.length > 0 ? `[Fichiers : ${fileNames}]` : ""),
          formats_requested: formats,
          results: r,
          ...(workspaceId && workspaceId !== user.id ? { workspace_id: workspaceId } : {}),
        });
        if (insertError) throw insertError;
      }
    } catch (e: any) {
      console.error("Erreur technique:", e);
      toast.error("Erreur", { description: friendlyError(e) });
    } finally {
      setLoading(false);
    }
  };

  const copyContent = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copié !");
  };

  const formatLabel = (id: string) => FORMATS.find(f => f.id === id)?.label || id;

  const getFormatShortLabel = (id: string) => {
    switch (id) {
      case "carrousel": return "Carrousel";
      case "reel": return "Reel";
      case "stories": return "Stories";
      case "linkedin": return "Post LinkedIn";
      case "newsletter": return "Newsletter";
      default: return id;
    }
  };
  const getCanal = (id: string) =>
    id === "linkedin" ? "linkedin" : id === "newsletter" ? "newsletter" : "instagram";
  const getCalendarFormat = (id: string) => {
    switch (id) {
      case "carrousel": return "carousel";
      case "reel": return "reel";
      case "stories": return "story_serie";
      case "linkedin": return "post";
      case "newsletter": return "newsletter";
      default: return "post";
    }
  };
  const getContentType = (id: string): "story" | "reel" | "post_instagram" | "post_linkedin" | "newsletter" => {
    switch (id) {
      case "reel": return "reel";
      case "stories": return "story";
      case "linkedin": return "post_linkedin";
      case "newsletter": return "newsletter";
      default: return "post_instagram";
    }
  };

  const getTopicFor = (id: string) => topics[id]?.trim() || (results[id] || "").split("\n").find(l => l.trim())?.slice(0, 80) || `Recyclage ${getFormatShortLabel(id)}`;

  const activeText = activeTab ? (results[activeTab] || "") : "";
  const canExport = activeText.trim().length > 0;

  const handleAddToCalendar = async (dateStr: string) => {
    if (!user || !activeTab) return;
    const text = results[activeTab] || "";
    const insertData: any = {
      user_id: user.id,
      date: dateStr,
      theme: getTopicFor(activeTab),
      canal: getCanal(activeTab),
      format: getCalendarFormat(activeTab),
      content_draft: text,
      accroche: (activeTab === "carrousel" && carouselStructure
        ? (carouselStructure.caption?.hook || carouselStructure.slides?.[0]?.title || "")
        : text.split("\n")[0] || ""
      ).slice(0, 200),
      status: "ready",
    };
    if (workspaceId && workspaceId !== user.id) insertData.workspace_id = workspaceId;
    if (activeTab === "carrousel" && carouselStructure) {
      insertData.story_sequence_detail = {
        type: "carousel",
        slides: carouselStructure.slides,
        caption: carouselStructure.caption,
      };
    }
    const { error } = await supabase.from("calendar_posts").insert(insertData);
    setShowCalendarDialog(false);
    if (error) {
      toast.error("Erreur lors de la planification");
    } else {
      toast.success("📅 Planifié dans ton calendrier !");
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {loading ? (
        <AiLoadingIndicator context="recycle" isLoading={loading} />
      ) : Object.keys(results).length === 0 ? (
        <>
          <div>
            <p className="text-sm text-muted-foreground mb-3">
              Colle un contenu existant ou importe des fichiers : newsletter, post, article, support de formation, PDF...
            </p>
            <div className="relative">
              <Textarea
                value={source}
                onChange={(e) => setSource(e.target.value)}
                placeholder="Colle ton contenu ici..."
                className="min-h-[160px] pr-12"
              />
              {isSupported && (
                <button
                  onClick={toggle}
                  className={`absolute right-3 top-3 p-1.5 rounded-lg transition-colors ${
                    isListening ? "bg-primary text-primary-foreground animate-pulse" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                </button>
              )}
            </div>
            <p className={`text-xs mt-1.5 ${source.length > 10000 ? "text-destructive" : "text-muted-foreground"}`}>
              {source.length} / 10 000 caractères
            </p>
            {source.length > 10000 && (
              <p className="text-xs text-destructive mt-1">
                Ton contenu est un peu long pour être traité d'un coup. Garde l'essentiel ou découpe-le en deux passages.
              </p>
            )}
          </div>

          {/* File upload zone */}
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.webp"
              multiple
              onChange={handleFilesSelect}
              className="hidden"
            />

            {/* Drop zone / upload button */}
            <div
              ref={dropRef}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              className={`rounded-xl border border-dashed transition-colors p-3 ${
                dragOver
                  ? "border-primary bg-primary/10"
                  : "border-border hover:border-primary/40"
              }`}
            >
              {files.length === 0 ? (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors w-full justify-center py-2"
                >
                  <Upload className="h-4 w-4" />
                  Importer des fichiers (PDF, images)
                </button>
              ) : (
                <div className="space-y-2">
                  {files.map((f, i) => (
                    <div key={i} className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-primary/20 bg-primary/5 text-sm">
                      <span>{fileEmoji(f.mimeType)}</span>
                      <span className="text-foreground truncate flex-1">{f.file.name}</span>
                      <span className="text-xs text-muted-foreground shrink-0">
                        {(f.file.size / 1024 / 1024).toFixed(1)} Mo
                      </span>
                      <button onClick={() => removeFile(i)} className="p-0.5 rounded hover:bg-muted transition-colors">
                        <X className="h-3.5 w-3.5 text-muted-foreground" />
                      </button>
                    </div>
                  ))}
                  <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
                    <span>📎 {files.length}/{MAX_FILES} fichiers</span>
                    {files.length < MAX_FILES && (
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        className="flex items-center gap-1 text-primary hover:underline"
                      >
                        <Plus className="h-3 w-3" /> Ajouter
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>

            {helpMessage() && (
              <p className="text-xs text-muted-foreground mt-1.5">{helpMessage()}</p>
            )}
          </div>

          <div>
            <p className="text-sm font-medium text-foreground mb-2">Transforme-le en :</p>
            <div className="space-y-2">
              {FORMATS.map(f => (
                <label key={f.id} className="flex items-center gap-2 cursor-pointer">
                  <Checkbox
                    checked={!!selectedFormats[f.id]}
                    onCheckedChange={(v) => setSelectedFormats(prev => ({ ...prev, [f.id]: !!v }))}
                  />
                  <span className="text-sm text-foreground">{f.label}</span>
                </label>
              ))}
            </div>
          </div>

          <Button onClick={handleRecycle} disabled={loading || !canRecycle} className="rounded-pill gap-1.5">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {loading ? "Recyclage en cours..." : "Recycler"}
          </Button>
        </>
      ) : (
        <>
          {/* Tabs */}
          <div className="flex flex-wrap gap-1.5 border-b border-border pb-2">
            {formats.map(f => (
              <button
                key={f}
                onClick={() => setActiveTab(f)}
                className={`px-3 py-1.5 text-sm font-medium rounded-t-lg transition-colors ${
                  activeTab === f
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {formatLabel(f)}
              </button>
            ))}
          </div>

          {activeTab && results[activeTab] && (
            <div className="space-y-3">
              <div className="rounded-xl bg-muted/30 p-4">
                <pre className="text-sm text-foreground whitespace-pre-wrap font-body">
                  {results[activeTab]}
                </pre>
              </div>

              <RedFlagsChecker
                content={results[activeTab]}
                onFix={(fixed) => { setResults(prev => ({ ...prev, [activeTab]: fixed })); if (activeTab === "carrousel") setCarouselStructure(null); }}
              />

              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => copyContent(results[activeTab])} className="rounded-pill gap-1.5">
                  <Copy className="h-3.5 w-3.5" /> Copier
                </Button>
                <Button variant="outline" size="sm" disabled={!canExport} onClick={() => setShowCalendarDialog(true)} className="rounded-pill gap-1.5">
                  <CalendarDays className="h-3.5 w-3.5" /> Planifier
                </Button>
                <Button variant="outline" size="sm" disabled={!canExport} onClick={() => setShowIdeasDialog(true)} className="rounded-pill gap-1.5">
                  <Lightbulb className="h-3.5 w-3.5" /> Sauvegarder en idée
                </Button>
                <Button variant="ghost" size="sm" onClick={() => { setResults({}); setTopics({}); setActiveTab(""); setFiles([]); setCarouselStructure(null); }} className="rounded-pill gap-1.5">
                  <RefreshCw className="h-3.5 w-3.5" /> Nouveau recyclage
                </Button>
              </div>

              <BaseReminder variant="atelier" />

              <AddToCalendarDialog
                open={showCalendarDialog}
                onOpenChange={setShowCalendarDialog}
                onConfirm={handleAddToCalendar}
                contentLabel={`♻️ Recyclage ${getFormatShortLabel(activeTab)}`}
                contentEmoji="♻️"
              />
              <SaveToIdeasDialog
                open={showIdeasDialog}
                onOpenChange={setShowIdeasDialog}
                contentType={getContentType(activeTab)}
                subject={getTopicFor(activeTab)}
                contentData={{ type: "recycling", format: activeTab, text: activeText }}
                sourceModule="recycling"
                format={getCalendarFormat(activeTab)}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
