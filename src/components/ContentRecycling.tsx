import { useState, useRef } from "react";
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
import { Mic, MicOff, Sparkles, Loader2, Copy, RefreshCw, Upload, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const FORMATS = [
  { id: "carrousel", label: "📑 Carrousel Instagram (8 slides)", checked: true },
  { id: "reel", label: "🎬 Script Reel (30-60 sec)", checked: true },
  { id: "stories", label: "📱 Séquence Stories (5 stories)", checked: true },
  { id: "linkedin", label: "💼 Post LinkedIn", checked: false },
  { id: "newsletter", label: "📧 Email / Newsletter", checked: false },
];

const ACCEPTED_TYPES = ["application/pdf", "image/png", "image/jpeg", "image/webp"];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 Mo

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

  // File upload state
  const [file, setFile] = useState<File | null>(null);
  const [fileBase64, setFileBase64] = useState<string | null>(null);
  const [fileMimeType, setFileMimeType] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { isListening, isSupported, toggle } = useSpeechRecognition((text) => {
    setSource(prev => prev + (prev ? " " : "") + text);
  });

  const formats = Object.entries(selectedFormats).filter(([, v]) => v).map(([k]) => k);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;

    if (!ACCEPTED_TYPES.includes(selected.type)) {
      toast({ title: "Format non supporté", description: "Formats acceptés : PDF, PNG, JPG, WEBP", variant: "destructive" });
      return;
    }

    if (selected.size > MAX_FILE_SIZE) {
      toast({ title: "Fichier trop lourd", description: "Maximum 10 Mo.", variant: "destructive" });
      return;
    }

    setFile(selected);
    setFileMimeType(selected.type);

    // Convert to base64
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Remove data:...;base64, prefix
      const base64 = result.split(",")[1];
      setFileBase64(base64);
    };
    reader.readAsDataURL(selected);
  };

  const removeFile = () => {
    setFile(null);
    setFileBase64(null);
    setFileMimeType(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const canRecycle = (source.trim() || fileBase64) && formats.length > 0;

  const handleRecycle = async () => {
    if (!canRecycle) return;
    setLoading(true);
    setResults({});
    try {
      const { data, error } = await supabase.functions.invoke("creative-flow", {
        body: {
          step: "recycle",
          contentType: "recycle",
          context: `Recyclage de contenu en ${formats.length} formats`,
          profile: {},
          sourceText: source || undefined,
          formats,
          workspace_id: workspaceId,
          ...(fileBase64 && fileMimeType ? { fileBase64, fileMimeType } : {}),
        },
      });
      if (error) throw error;
      const r = data?.results || {};
      setResults(r);
      setActiveTab(formats[0] || "");

      // Save to DB
      if (user) {
        await supabase.from("content_recycling").insert({
          user_id: user.id,
          source_text: source || (file ? `[Fichier : ${file.name}]` : ""),
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
      {Object.keys(results).length === 0 ? (
        <>
          <div>
            <p className="text-sm text-muted-foreground mb-3">
              Colle un contenu existant ou importe un fichier : newsletter, post, article, support de formation, PDF...
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

          {/* File upload */}
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.webp"
              onChange={handleFileSelect}
              className="hidden"
            />
            {!file ? (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors px-3 py-2 rounded-xl border border-dashed border-border hover:border-primary/40"
              >
                <Upload className="h-4 w-4" />
                Importer un fichier (PDF, image)
              </button>
            ) : (
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-primary/30 bg-primary/5 text-sm">
                <span className="text-primary">📎</span>
                <span className="text-foreground truncate flex-1">{file.name}</span>
                <span className="text-xs text-muted-foreground">
                  {(file.size / 1024 / 1024).toFixed(1)} Mo
                </span>
                <button onClick={removeFile} className="p-0.5 rounded hover:bg-muted transition-colors">
                  <X className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              </div>
            )}
            {file && !source.trim() && (
              <p className="text-xs text-muted-foreground mt-1.5">
                L'IA analysera le fichier et recyclera son contenu.
              </p>
            )}
            {file && source.trim() && (
              <p className="text-xs text-muted-foreground mt-1.5">
                L'IA combinera le texte et le fichier pour le recyclage.
              </p>
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

          {/* Active content */}
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
                <Button variant="ghost" size="sm" onClick={() => { setResults({}); setActiveTab(""); removeFile(); }} className="rounded-pill gap-1.5">
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
