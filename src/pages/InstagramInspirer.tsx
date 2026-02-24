import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspaceFilter, useWorkspaceId } from "@/hooks/use-workspace-query";
import AppHeader from "@/components/AppHeader";
import SubPageHeader from "@/components/SubPageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TextareaWithVoice as Textarea } from "@/components/ui/textarea-with-voice";
import { InputWithVoice as Input } from "@/components/ui/input-with-voice";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { toast } from "sonner";
import { Sparkles, Copy, Save, RefreshCw, ChevronDown, Eye, Trash2, Link2, Upload, X, Mic, MicOff } from "lucide-react";
import { useSpeechRecognition } from "@/hooks/use-speech-recognition";

interface Analysis {
  accroche: string;
  structure: string;
  ton: string;
  engagement: string;
}

interface InspirationResult {
  analysis: Analysis;
  adapted_content: string;
  format: string;
  objective: string;
  pillar: string;
}

interface HistoryItem {
  id: string;
  source_text: string | null;
  source_url: string | null;
  analysis: Analysis | null;
  adapted_content: string | null;
  recommended_format: string | null;
  objective: string | null;
  pillar: string | null;
  saved_to_ideas: boolean;
  created_at: string;
}

const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const MAX_FILES = 5;

function sanitizeFileName(fileName: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase() || "png";
  const timestamp = Date.now();
  const randomId = Math.random().toString(36).substring(2, 8);
  return `upload-${timestamp}-${randomId}.${ext}`;
}

export default function InstagramInspirer() {
  const { user } = useAuth();
  const { column, value } = useWorkspaceFilter();
  const workspaceId = useWorkspaceId();
  const [tab, setTab] = useState("text");
  const [sourceText, setSourceText] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [fetchingLink, setFetchingLink] = useState(false);
  const [result, setResult] = useState<InspirationResult | null>(null);
  const [editedContent, setEditedContent] = useState("");
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [viewingHistory, setViewingHistory] = useState<HistoryItem | null>(null);

  // Screenshot state
  const [files, setFiles] = useState<File[]>([]);
  const [screenshotContext, setScreenshotContext] = useState("");
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Speech recognition for context field
  const { isListening, isSupported, toggle: toggleMic } = useSpeechRecognition((text) => {
    setScreenshotContext((prev) => (prev ? prev + " " + text : text));
  });

  // Load history
  useEffect(() => {
    if (!user) return;
    (supabase.from("instagram_inspirations") as any)
      .select("*")
      .eq(column, value)
      .order("created_at", { ascending: false })
      .limit(20)
      .then(({ data }) => {
        if (data) setHistory(data as unknown as HistoryItem[]);
      });
  }, [user?.id]);

  const fetchFromLink = async () => {
    if (!sourceUrl.trim()) return;
    setFetchingLink(true);
    try {
      const { data, error } = await supabase.functions.invoke("fetch-instagram-post", {
        body: { url: sourceUrl.trim() },
      });

      if (error) {
        toast.info("Le lien n'a pas fonctionné. Colle le texte du post directement 👇");
        setTab("text");
        return;
      }

      if (data?.error) {
        toast.info(data.message || "Le lien n'a pas fonctionné. Colle le texte du post directement 👇");
        setTab("text");
        return;
      }

      if (data?.caption) {
        setSourceText(data.caption);
        if (data.author) {
          setScreenshotContext(`Post de @${data.author}`);
        }
        setTab("text");
        toast.success("Contenu récupéré ! Tu peux le modifier avant d'analyser.");
      } else {
        toast.info("On a trouvé le post mais pas de texte. Colle la caption manuellement ou envoie un screenshot 👇");
        setTab("text");
      }
    } catch {
      toast.info("Erreur réseau. Colle le texte directement 👇");
      setTab("text");
    } finally {
      setFetchingLink(false);
    }
  };

  // File handling
  const addFiles = (newFiles: FileList | File[]) => {
    const valid: File[] = [];
    for (const f of Array.from(newFiles)) {
      if (!ACCEPTED_TYPES.includes(f.type)) {
        toast.error(`Format non accepté : ${f.name}`);
        continue;
      }
      if (f.size > MAX_FILE_SIZE) {
        toast.error(`Fichier trop lourd (max 10 Mo) : ${f.name}`);
        continue;
      }
      valid.push(f);
    }
    setFiles((prev) => {
      const combined = [...prev, ...valid].slice(0, MAX_FILES);
      if (prev.length + valid.length > MAX_FILES) {
        toast.error(`Maximum ${MAX_FILES} fichiers.`);
      }
      return combined;
    });
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files.length > 0) addFiles(e.dataTransfer.files);
  };

  // Convert file to base64 data URL
  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const analyze = useCallback(async () => {
    const isScreenshot = tab === "screenshot";

    if (isScreenshot) {
      if (files.length === 0) {
        toast.error("Ajoute au moins un screenshot.");
        return;
      }
    } else {
      if (!user || !sourceText.trim() || sourceText.trim().length < 20) {
        toast.error("Colle au moins 20 caractères de contenu.");
        return;
      }
    }

    setLoading(true);
    setResult(null);
    try {
      let body: any;

      if (isScreenshot) {
        // Convert all files (images + PDFs) to base64
        const imageData: { data: string; type: string }[] = [];
        for (const f of files) {
          const b64 = await fileToBase64(f);
          imageData.push({ data: b64, type: f.type });
        }
        body = {
          source_type: "screenshot",
          images: imageData,
          context: screenshotContext.trim() || undefined,
        };
      } else {
        body = { source_text: sourceText.trim() };
      }

      const { data, error } = await supabase.functions.invoke("inspire-ai", { body });
      if (error || data?.error) {
        toast.error(data?.error || "Erreur lors de l'analyse");
        return;
      }
      const r = data as InspirationResult;
      setResult(r);
      setEditedContent(r.adapted_content);

      // Save to history
      const { data: saved } = await supabase
        .from("instagram_inspirations")
        .insert({
          user_id: user!.id,
          workspace_id: workspaceId !== user!.id ? workspaceId : undefined,
          source_text: isScreenshot
            ? `[Screenshots: ${files.map((f) => f.name).join(", ")}]${screenshotContext ? ` — ${screenshotContext}` : ""}`
            : sourceText.trim(),
          source_url: sourceUrl.trim() || null,
          analysis: r.analysis as any,
          adapted_content: r.adapted_content,
          recommended_format: r.format,
          objective: r.objective,
          pillar: r.pillar,
        })
        .select()
        .single();

      if (saved) {
        setHistory((prev) => [saved as unknown as HistoryItem, ...prev]);
      }
    } catch {
      toast.error("Erreur lors de l'analyse");
    } finally {
      setLoading(false);
    }
  }, [user, sourceText, sourceUrl, tab, files, screenshotContext]);

  const copyContent = () => {
    navigator.clipboard.writeText(editedContent);
    toast.success("Copié !");
  };

  const saveToIdeas = async () => {
    if (!user || !editedContent.trim()) return;
    try {
      await supabase.from("saved_ideas").insert({
        user_id: user.id,
        workspace_id: workspaceId !== user.id ? workspaceId : undefined,
        type: "draft",
        status: "ready",
        canal: "instagram",
        titre: editedContent.slice(0, 60) + (editedContent.length > 60 ? "..." : ""),
        angle: "Adapté de : " + (sourceUrl.trim() || "contenu externe"),
        format: result?.format || "Post",
        content_draft: editedContent,
        format_technique: result?.format || null,
        objectif: result?.objective || null,
      });
      toast.success("Sauvegardé dans tes idées !");
    } catch {
      toast.error("Erreur lors de la sauvegarde");
    }
  };

  const deleteHistoryItem = async (id: string) => {
    await supabase.from("instagram_inspirations").delete().eq("id", id);
    setHistory((prev) => prev.filter((h) => h.id !== id));
    if (viewingHistory?.id === id) setViewingHistory(null);
    toast.success("Supprimé");
  };

  const viewHistoryItem = (item: HistoryItem) => {
    setViewingHistory(item);
    if (item.analysis && item.adapted_content) {
      setResult({
        analysis: item.analysis,
        adapted_content: item.adapted_content,
        format: item.recommended_format || "",
        objective: item.objective || "",
        pillar: item.pillar || "",
      });
      setEditedContent(item.adapted_content);
      setSourceText(item.source_text || "");
      setSourceUrl(item.source_url || "");
    }
  };

  const canAnalyze =
    tab === "screenshot"
      ? files.length > 0
      : sourceText.trim().length >= 20;

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-4xl px-6 py-8 max-md:px-4">
        <SubPageHeader parentLabel="Instagram" parentTo="/instagram" currentLabel="M'inspirer" />

        <h1 className="font-display text-[26px] font-bold text-foreground">M'inspirer</h1>
        <p className="mt-1 text-sm italic text-muted-foreground">
          Colle un contenu qui t'a plu. L'IA décrypte pourquoi ça marche et t'en crée une version à toi.
        </p>

        {/* Input zone */}
        <Card className="mt-6">
          <CardContent className="p-5">
            <Tabs value={tab} onValueChange={setTab}>
              <TabsList className="mb-4">
                <TabsTrigger value="text">📝 Coller un texte</TabsTrigger>
                <TabsTrigger value="link">🔗 Coller un lien</TabsTrigger>
                <TabsTrigger value="screenshot">📸 Screenshot</TabsTrigger>
              </TabsList>

              <TabsContent value="text">
                <Textarea
                  className="min-h-[200px]"
                  placeholder="Colle ici la caption, le texte du post, le script du reel..."
                  value={sourceText}
                  onChange={(e) => setSourceText(e.target.value)}
                />
              </TabsContent>

              <TabsContent value="link">
                <Input
                  placeholder="https://www.instagram.com/p/..."
                  value={sourceUrl}
                  onChange={(e) => setSourceUrl(e.target.value)}
                />
                <p className="mt-2 text-xs text-muted-foreground">
                  L'IA va tenter de récupérer le contenu du post automatiquement.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={fetchFromLink}
                  disabled={fetchingLink || !sourceUrl.trim()}
                >
                  <Link2 className="h-4 w-4 mr-1" />
                  {fetchingLink ? "Récupération..." : "Récupérer le contenu"}
                </Button>
              </TabsContent>

              <TabsContent value="screenshot">
                {/* Drop zone */}
                <div
                  onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`cursor-pointer rounded-xl border-2 border-dashed p-8 text-center transition-colors ${
                    dragging
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/40"
                  }`}
                >
                  <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                  <p className="text-sm font-medium text-foreground">
                    Glisse tes screenshots ici
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Post, carrousel, reel, story… (max {MAX_FILES} fichiers, 10 Mo chacun)
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    JPG, PNG, WebP, PDF
                  </p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".jpg,.jpeg,.png,.webp,.pdf"
                    multiple
                    className="hidden"
                    onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ""; }}
                  />
                </div>

                {/* File previews */}
                {files.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-3">
                    {files.map((f, i) => (
                      <div key={i} className="relative group">
                        {f.type.startsWith("image/") ? (
                          <img
                            src={URL.createObjectURL(f)}
                            alt={f.name}
                            className="h-20 w-20 rounded-lg object-cover border border-border"
                          />
                        ) : (
                          <div className="h-20 w-20 rounded-lg border border-border bg-muted flex items-center justify-center text-xs text-muted-foreground">
                            PDF
                          </div>
                        )}
                        <button
                          onClick={(e) => { e.stopPropagation(); removeFile(i); }}
                          className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Context textarea */}
                <div className="mt-3 relative">
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">
                    Contexte (optionnel)
                  </label>
                  <Textarea
                    className="min-h-[80px]"
                    placeholder="C'est un carrousel d'une coach bien-être, il a eu 500 likes..."
                    value={screenshotContext}
                    onChange={(e) => setScreenshotContext(e.target.value)}
                  />
                  {isSupported && (
                    <button
                      type="button"
                      onClick={toggleMic}
                      className={`absolute right-3 bottom-3 p-1.5 rounded-lg transition-colors ${
                        isListening ? "bg-primary text-primary-foreground animate-pulse" : "text-muted-foreground hover:text-foreground hover:bg-muted"
                      }`}
                    >
                      {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                    </button>
                  )}
                </div>
              </TabsContent>
            </Tabs>

            <Button
              className="mt-4 w-full"
              size="lg"
              onClick={analyze}
              disabled={loading || !canAnalyze}
            >
              <Sparkles className="h-4 w-4 mr-2" />
              {loading ? "Analyse en cours..." : "Analyser et adapter à mon univers"}
            </Button>
          </CardContent>
        </Card>

        {/* Results */}
        {result && (
          <div className="mt-8 space-y-6">
            {/* Analysis block */}
            <Card className="bg-accent/30 border-accent">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">🧠 Pourquoi ça marche</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <AnalysisPoint label="L'accroche" text={result.analysis.accroche} />
                <AnalysisPoint label="La structure" text={result.analysis.structure} />
                <AnalysisPoint label="Le ton" text={result.analysis.ton} />
                <AnalysisPoint label="Le déclencheur d'engagement" text={result.analysis.engagement} />
              </CardContent>
            </Card>

            {/* Adapted content block */}
            <Card className="border-l-[3px] border-l-primary">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">✨ Ta version</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <Textarea
                  className="min-h-[200px]"
                  value={editedContent}
                  onChange={(e) => setEditedContent(e.target.value)}
                />
                <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                  {result.format && <Badge variant="secondary">Format : {result.format}</Badge>}
                  {result.objective && <Badge variant="secondary">Objectif : {result.objective}</Badge>}
                  {result.pillar && <Badge variant="secondary">Pilier : {result.pillar}</Badge>}
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={copyContent}>
                    <Copy className="h-4 w-4 mr-1" /> Copier
                  </Button>
                  <Button variant="outline" size="sm" onClick={saveToIdeas}>
                    <Save className="h-4 w-4 mr-1" /> Sauvegarder dans mes idées
                  </Button>
                  <Button variant="outline" size="sm" onClick={analyze} disabled={loading}>
                    <RefreshCw className="h-4 w-4 mr-1" /> Regénérer
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* History */}
        {history.length > 0 && (
          <Collapsible open={historyOpen} onOpenChange={setHistoryOpen} className="mt-8">
            <CollapsibleTrigger className="flex items-center gap-2 text-sm font-semibold text-foreground hover:text-primary transition-colors">
              <ChevronDown className={`h-4 w-4 transition-transform ${historyOpen ? "rotate-180" : ""}`} />
              📚 Mes inspirations précédentes ({history.length})
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-3 space-y-2">
              {history.map((item) => (
                <div key={item.id} className="flex items-center justify-between rounded-lg border border-border bg-card p-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-muted-foreground">
                      {new Date(item.created_at).toLocaleDateString("fr-FR")}
                    </p>
                    <p className="text-sm text-foreground truncate">
                      {item.source_text?.slice(0, 80) || item.source_url || "..."}
                    </p>
                  </div>
                  <div className="flex gap-1 ml-3 shrink-0">
                    <Button variant="ghost" size="sm" onClick={() => viewHistoryItem(item)}>
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => {
                      if (item.adapted_content) {
                        navigator.clipboard.writeText(item.adapted_content);
                        toast.success("Copié !");
                      }
                    }}>
                      <Copy className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => deleteHistoryItem(item.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </CollapsibleContent>
          </Collapsible>
        )}

        <div className="h-12" />
      </main>
    </div>
  );
}

function AnalysisPoint({ label, text }: { label: string; text: string }) {
  return (
    <div>
      <span className="text-sm font-semibold text-foreground">{label} : </span>
      <span className="text-sm text-muted-foreground">{text}</span>
    </div>
  );
}
