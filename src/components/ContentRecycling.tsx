import { useState, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspaceId } from "@/hooks/use-workspace-query";
import { friendlyError } from "@/lib/error-messages";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { TextareaWithVoice as Textarea } from "@/components/ui/textarea-with-voice";
import { Checkbox } from "@/components/ui/checkbox";
import { useSpeechRecognition } from "@/hooks/use-speech-recognition";
import BaseReminder from "@/components/BaseReminder";
import RedFlagsChecker from "@/components/RedFlagsChecker";
import AiLoadingIndicator from "@/components/AiLoadingIndicator";
import { Mic, MicOff, Sparkles, Loader2, Copy, RefreshCw, Upload, X, Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const FORMATS = [
  { id: "carrousel", label: "📑 Carrousel Instagram (8 slides)", checked: true },
  { id: "reel", label: "🎬 Script Reel (30-60 sec)", checked: true },
  { id: "stories", label: "📱 Séquence Stories (5 stories)", checked: true },
  { id: "linkedin", label: "💼 Post LinkedIn", checked: false },
  { id: "newsletter", label: "📧 Email / Newsletter", checked: false },
];

const ACCEPTED_TYPES = ["application/pdf", "image/png", "image/jpeg", "image/webp"];
const MAX_FILE_SIZE = 10 * 1024 * 1024;
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
  const { toast } = useToast();
  const workspaceId = useWorkspaceId();
  const [source, setSource] = useState("");
  const [selectedFormats, setSelectedFormats] = useState<Record<string, boolean>>(
    Object.fromEntries(FORMATS.map(f => [f.id, f.checked]))
  );
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<Record<string, string>>({});
  const [activeTab, setActiveTab] = useState<string>("");

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
      toast({ title: "Maximum 10 fichiers", variant: "destructive" });
      return;
    }
    const toAdd = arr.slice(0, remaining);
    if (arr.length > remaining) {
      toast({ title: `Seulement ${remaining} fichier(s) ajouté(s)`, description: "Maximum 10 fichiers au total.", variant: "destructive" });
    }

    const newFiles: UploadedFile[] = [];
    for (const f of toAdd) {
      if (!ACCEPTED_TYPES.includes(f.type)) {
        toast({ title: `${f.name} : format non supporté`, description: "Formats acceptés : PDF, PNG, JPG, WEBP", variant: "destructive" });
        continue;
      }
      if (f.size > MAX_FILE_SIZE) {
        toast({ title: `${f.name} : trop lourd`, description: "Maximum 10 Mo par fichier.", variant: "destructive" });
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
  }, [files.length, toast]);

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

  const canRecycle = (source.trim() || files.length > 0) && formats.length > 0;

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

      const { data, error } = await supabase.functions.invoke("creative-flow", { body });
      if (error) throw error;
      const r = data?.results || {};
      setResults(r);
      setActiveTab(formats[0] || "");

      if (user) {
        const fileNames = files.map(f => f.file.name).join(", ");
        await supabase.from("content_recycling").insert({
          user_id: user.id,
          source_text: source || (files.length > 0 ? `[Fichiers : ${fileNames}]` : ""),
          formats_requested: formats,
          results: r,
        });
      }
    } catch (e: any) {
      console.error("Erreur technique:", e);
      toast({ title: "Erreur", description: friendlyError(e), variant: "destructive" });
    }
    setLoading(false);
  };

  const copyContent = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copié !" });
  };

  const formatLabel = (id: string) => FORMATS.find(f => f.id === id)?.label || id;

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
                onFix={(fixed) => setResults(prev => ({ ...prev, [activeTab]: fixed }))}
              />

              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => copyContent(results[activeTab])} className="rounded-pill gap-1.5">
                  <Copy className="h-3.5 w-3.5" /> Copier
                </Button>
                <Button variant="ghost" size="sm" onClick={() => { setResults({}); setActiveTab(""); setFiles([]); }} className="rounded-pill gap-1.5">
                  <RefreshCw className="h-3.5 w-3.5" /> Nouveau recyclage
                </Button>
              </div>

              <BaseReminder variant="atelier" />
            </div>
          )}
        </>
      )}
    </div>
  );
}
