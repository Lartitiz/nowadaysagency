import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import AppHeader from "@/components/AppHeader";
import SubPageHeader from "@/components/SubPageHeader";
import { Button } from "@/components/ui/button";
import { TextareaWithVoice as Textarea } from "@/components/ui/textarea-with-voice";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { friendlyError } from "@/lib/error-messages";
import { RefreshCw, Copy, Check, Sparkles, Loader2, CalendarDays, Lightbulb } from "lucide-react";
import RedFlagsChecker from "@/components/RedFlagsChecker";
import BaseReminder from "@/components/BaseReminder";
import CrosspostFileUploader, { type UploadedFile } from "@/components/crosspost/CrosspostFileUploader";
import { cn } from "@/lib/utils";
import { AddToCalendarDialog } from "@/components/calendar/AddToCalendarDialog";
import { SaveToIdeasDialog } from "@/components/SaveToIdeasDialog";
import { toast } from "sonner";
import { useWorkspaceId } from "@/hooks/use-workspace-query";

const SOURCE_TYPES = [
  { id: "newsletter", label: "📧 Ma newsletter" },
  { id: "instagram", label: "📸 Mon post Instagram" },
  { id: "linkedin", label: "💼 Mon post LinkedIn" },
  { id: "libre", label: "📝 Texte libre" },
];

const TARGET_CHANNELS = [
  { id: "linkedin", label: "💼 Post LinkedIn", desc: "Version expert·e, données" },
  { id: "instagram", label: "📸 Carrousel Instagram", desc: "Version visuelle, pédago" },
  { id: "reel", label: "🎬 Script Reel", desc: "Version punchy, 30-60 sec" },
  { id: "stories", label: "📱 Séquence Stories", desc: "Version intime, 5 stories" },
];

interface CrosspostResult {
  versions: Record<string, { full_text?: string; script?: string; sequence?: any[]; character_count?: number; angle_choisi: string; duration?: string }>;
}

export default function LinkedInCrosspost() {
  const { user } = useAuth();
  const { toast: toastHook } = useToast();
  const workspaceId = useWorkspaceId();
  const [sourceType, setSourceType] = useState("libre");
  const [sourceContent, setSourceContent] = useState("");
  const [targets, setTargets] = useState<Set<string>>(new Set(["linkedin", "instagram"]));
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<CrosspostResult | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [inputMode, setInputMode] = useState<"text" | "files" | "both">("text");
  const [showCalendarDialog, setShowCalendarDialog] = useState(false);
  const [showIdeasDialog, setShowIdeasDialog] = useState(false);
  const [activeVersionKey, setActiveVersionKey] = useState<string>("");

  const toggleTarget = (id: string) => {
    const next = new Set(targets);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setTargets(next);
  };

  const uploadFileToSupabase = async (file: File): Promise<string> => {
    const ext = file.name.split(".").pop()?.toLowerCase() || "png";
    const path = `${user!.id}/crosspost-${Date.now()}-${Math.random().toString(36).substring(2, 8)}.${ext}`;
    const { error } = await supabase.storage.from("crosspost-uploads").upload(path, file, { contentType: file.type, upsert: false });
    if (error) throw error;
    const { data: signedData } = await supabase.storage.from("crosspost-uploads").createSignedUrl(path, 3600);
    if (signedData?.signedUrl) return signedData.signedUrl;
    throw new Error("Impossible de créer l'URL signée");
  };

  const canGenerate = () => {
    if (targets.size === 0) return false;
    if (inputMode === "text") return sourceContent.trim().length > 0;
    if (inputMode === "files") return files.length > 0;
    return sourceContent.trim().length > 0 || files.length > 0;
  };

  const generate = async () => {
    if (!canGenerate()) return;
    setGenerating(true);
    setResult(null);
    try {
      // Upload files if any
      let fileUrls: { url: string; type: string; name: string }[] = [];
      if (files.length > 0) {
        for (const f of files) {
          const url = await uploadFileToSupabase(f.file);
          fileUrls.push({ url, type: f.type, name: f.name });
        }
      }

      const res = await supabase.functions.invoke("linkedin-ai", {
        body: {
          action: "crosspost",
          sourceContent: sourceContent || "",
          sourceType,
          targetChannels: Array.from(targets),
          fileUrls,
        },
      });
      if (res.error) throw new Error(res.error.message);
      const content = res.data?.content || "";
      let parsed: CrosspostResult;
      try { parsed = JSON.parse(content); } catch {
        const match = content.match(/\{[\s\S]*\}/);
        if (match) parsed = JSON.parse(match[0]);
        else throw new Error("Format de réponse inattendu");
      }
      setResult(parsed);
      setActiveVersionKey(Object.keys(parsed.versions || {})[0] || "");

      // Cleanup uploaded files (non-blocking)
      if (fileUrls.length > 0) {
        Promise.all(fileUrls.map(f => {
          const path = f.url.split("/crosspost-uploads/")[1]?.split("?")[0];
          if (path) return supabase.storage.from("crosspost-uploads").remove([path]);
        })).catch(console.error);
      }
    } catch (e: any) {
      console.error("Erreur technique:", e);
      toastHook({ title: "Erreur", description: friendlyError(e), variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };

  const getActiveVersion = () => result?.versions?.[activeVersionKey] || null;
  const getActiveVersionText = () => {
    const v = getActiveVersion();
    if (!v) return "";
    return v.full_text || v.script || JSON.stringify(v.sequence, null, 2) || "";
  };
  const getActiveChannelLabel = () => TARGET_CHANNELS.find((c) => c.id === activeVersionKey)?.label || activeVersionKey;
  const getActiveChannelCanal = () => activeVersionKey === "linkedin" ? "linkedin" : "instagram";
  const getActiveFormat = () => {
    if (activeVersionKey === "reel") return "reel";
    if (activeVersionKey === "stories") return "story_serie";
    if (activeVersionKey === "instagram") return "carousel";
    return "post";
  };

  const handleAddToCalendar = async (dateStr: string) => {
    if (!user) return;
    const text = getActiveVersionText();
    const label = getActiveChannelLabel();
    const version = getActiveVersion();
    const insertData: any = {
      user_id: user.id,
      date: dateStr,
      theme: `Crosspost ${label} : ${sourceType}`,
      canal: getActiveChannelCanal(),
      format: getActiveFormat(),
      content_draft: text.slice(0, 500),
      accroche: text.split("\n")[0]?.slice(0, 200) || "",
      status: "ready",
      story_sequence_detail: {
        type: "crosspost",
        source_type: sourceType,
        target_channel: activeVersionKey,
        angle_choisi: version?.angle_choisi || "",
        full_content: text,
      },
    };
    if (workspaceId && workspaceId !== user.id) {
      insertData.workspace_id = workspaceId;
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
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-3xl px-6 py-8 max-md:px-4">
        <SubPageHeader parentTo="/linkedin" parentLabel="LinkedIn" currentLabel="Crossposting" />

        <h1 className="font-display text-[22px] font-bold text-foreground mb-1">🔄 Crossposting intelligent</h1>
        <p className="text-sm text-muted-foreground mb-6">Un contenu source → adapté pour chaque canal. Pas du copier-coller : chaque version apporte un angle spécifique.</p>

        {/* Input mode toggle */}
        <div className="mb-4">
          <p className="text-sm font-medium text-foreground mb-2">Contenu source :</p>
          <div className="flex gap-2 mb-3">
            {([
              { key: "text" as const, label: "✏️ Texte" },
              { key: "files" as const, label: "📎 Fichiers" },
              { key: "both" as const, label: "✏️📎 Les deux" },
            ]).map((m) => (
              <button
                key={m.key}
                onClick={() => setInputMode(m.key)}
                className={cn(
                  "text-sm px-4 py-2 rounded-full border transition-all flex items-center gap-1.5",
                  inputMode === m.key ? "bg-primary text-primary-foreground border-primary" : "border-border hover:border-primary/40"
                )}
              >
                {m.label}
              </button>
            ))}
          </div>

          {/* Text input */}
          {(inputMode === "text" || inputMode === "both") && (
            <>
              <div className="flex flex-wrap gap-2 mb-2">
                {SOURCE_TYPES.map((s) => (
                  <button key={s.id} onClick={() => setSourceType(s.id)} className={`text-xs px-3 py-1.5 rounded-full border transition-all ${sourceType === s.id ? "bg-primary/10 text-primary border-primary/30" : "border-border hover:border-primary/40 text-muted-foreground"}`}>
                    {s.label}
                  </button>
                ))}
              </div>
              <Textarea
                value={sourceContent}
                onChange={(e) => setSourceContent(e.target.value)}
                placeholder={inputMode === "both" ? "Ajoute du contexte ou du texte complémentaire..." : "Colle ton contenu ici..."}
                className="min-h-[120px] mb-3"
              />
            </>
          )}

          {/* File upload */}
          {(inputMode === "files" || inputMode === "both") && (
            <CrosspostFileUploader
              files={files}
              onFilesChange={setFiles}
              maxFiles={10}
              disabled={generating}
            />
          )}
        </div>

        {/* Target channels */}
        <div className="mb-5">
          <p className="text-sm font-medium text-foreground mb-2">Transformer en :</p>
          <div className="grid grid-cols-2 gap-2">
            {TARGET_CHANNELS.map((ch) => (
              <button
                key={ch.id}
                onClick={() => toggleTarget(ch.id)}
                className={`rounded-xl border-2 p-3 text-left transition-all ${targets.has(ch.id) ? "border-primary bg-secondary" : "border-border hover:border-primary/40"}`}
              >
                <span className="text-sm font-semibold block">{ch.label}</span>
                <span className="text-xs text-muted-foreground">{ch.desc}</span>
              </button>
            ))}
          </div>
        </div>

        <Button onClick={generate} disabled={generating || !canGenerate()} className="rounded-full gap-2 mb-6">
          {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {generating
            ? files.length > 0
              ? `Extraction de ${files.length} fichier${files.length > 1 ? "s" : ""} + adaptation...`
              : "Adaptation en cours..."
            : "✨ Adapter pour chaque canal"
          }
        </Button>

        {/* Results */}
        {result && result.versions && !generating && (
          <div className="space-y-4 animate-fade-in">
            <Tabs defaultValue={Object.keys(result.versions)[0]} onValueChange={setActiveVersionKey}>
              <TabsList>
                {Object.keys(result.versions).map((key) => {
                  const label = TARGET_CHANNELS.find((c) => c.id === key)?.label || key;
                  return <TabsTrigger key={key} value={key}>{label}</TabsTrigger>;
                })}
              </TabsList>
              {Object.entries(result.versions).map(([key, version]) => {
                const text = version.full_text || version.script || JSON.stringify(version.sequence, null, 2) || "";
                return (
                  <TabsContent key={key} value={key} className="space-y-3">
                    <div className="rounded-xl border border-border bg-card p-5">
                      <p className="whitespace-pre-line text-sm text-foreground leading-relaxed">{text}</p>
                      {version.character_count && (
                        <p className="text-xs text-muted-foreground mt-3">📊 {version.character_count} caractères</p>
                      )}
                      <p className="text-xs text-primary mt-1">💡 Angle choisi : {version.angle_choisi}</p>
                    </div>
                    <RedFlagsChecker content={text} onFix={(fixed) => {
                      if (!result) return;
                      const updatedVersions = { ...result.versions };
                      const version = updatedVersions[key];
                      if (version.full_text) updatedVersions[key] = { ...version, full_text: fixed };
                      else if (version.script) updatedVersions[key] = { ...version, script: fixed };
                      setResult({ ...result, versions: updatedVersions });
                    }} />
                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" size="sm" onClick={() => handleCopy(text, key)} className="rounded-full gap-1.5">
                        {copied === key ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                        {copied === key ? "Copié !" : "Copier"}
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => { setActiveVersionKey(key); setShowCalendarDialog(true); }} className="rounded-full gap-1.5">
                        <CalendarDays className="h-3.5 w-3.5" /> Planifier
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => { setActiveVersionKey(key); setShowIdeasDialog(true); }} className="rounded-full gap-1.5">
                        <Lightbulb className="h-3.5 w-3.5" /> Sauvegarder en idée
                      </Button>
                    </div>
                  </TabsContent>
                );
              })}
            </Tabs>
            <BaseReminder variant="atelier" />

            <AddToCalendarDialog
              open={showCalendarDialog}
              onOpenChange={setShowCalendarDialog}
              onConfirm={handleAddToCalendar}
              contentLabel={`🔄 Crosspost ${getActiveChannelLabel()}`}
              contentEmoji="🔄"
            />
            <SaveToIdeasDialog
              open={showIdeasDialog}
              onOpenChange={setShowIdeasDialog}
              contentType={activeVersionKey === "linkedin" ? "post_linkedin" : "post_instagram"}
              subject={`Crosspost ${getActiveChannelLabel()} : ${sourceType}`}
              contentData={{
                type: "crosspost",
                source_type: sourceType,
                target_channel: activeVersionKey,
                text: getActiveVersionText(),
                angle_choisi: getActiveVersion()?.angle_choisi || "",
              }}
              sourceModule="crosspost"
              format={getActiveFormat()}
            />
          </div>
        )}
      </main>
    </div>
  );
}
