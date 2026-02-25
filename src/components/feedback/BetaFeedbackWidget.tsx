import { useState, useRef } from "react";
import { useLocation } from "react-router-dom";
import { MessageSquarePlus, X, Bug, Lightbulb, Upload, Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspaceId } from "@/hooks/use-workspace-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type FeedbackType = "bug" | "suggestion" | null;
type Severity = "blocking" | "annoying" | "minor";
type Step = "choose" | "form" | "done";

const SEVERITIES: { value: Severity; label: string }[] = [
  { value: "blocking", label: "😤 Bloquant" },
  { value: "annoying", label: "😕 Gênant" },
  { value: "minor", label: "🤷 Mineur" },
];

export default function BetaFeedbackWidget() {
  const { user } = useAuth();
  const workspaceId = useWorkspaceId();
  const location = useLocation();

  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("choose");
  const [feedbackType, setFeedbackType] = useState<FeedbackType>(null);

  // Bug fields
  const [bugContent, setBugContent] = useState("");
  const [bugPage, setBugPage] = useState("");
  const [bugSeverity, setBugSeverity] = useState<Severity>("annoying");
  const [screenshotFile, setScreenshotFile] = useState<File | null>(null);

  // Suggestion fields
  const [suggTitle, setSuggTitle] = useState("");
  const [suggDetails, setSuggDetails] = useState("");
  const [suggPage, setSuggPage] = useState("");

  const [sending, setSending] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const resetForm = () => {
    setStep("choose");
    setFeedbackType(null);
    setBugContent("");
    setBugPage("");
    setBugSeverity("annoying");
    setScreenshotFile(null);
    setSuggTitle("");
    setSuggDetails("");
    setSuggPage("");
  };

  const handleOpen = () => {
    resetForm();
    setBugPage(location.pathname);
    setSuggPage(location.pathname);
    setOpen(true);
  };

  const selectType = (type: FeedbackType) => {
    setFeedbackType(type);
    setStep("form");
  };

  const handleScreenshot = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image trop lourde (max 5 Mo)");
      return;
    }
    setScreenshotFile(file);
  };

  const submit = async () => {
    if (!user) return;
    setSending(true);
    try {
      let screenshotUrl: string | null = null;

      if (screenshotFile) {
        const ext = screenshotFile.name.split(".").pop()?.toLowerCase() || "png";
        const path = `${user.id}/${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("beta-feedback")
          .upload(path, screenshotFile, { contentType: screenshotFile.type });
        if (upErr) throw upErr;
        const { data: signed } = await supabase.storage
          .from("beta-feedback")
          .createSignedUrl(path, 60 * 60 * 24 * 30);
        screenshotUrl = signed?.signedUrl || null;
      }

      const row: Record<string, unknown> = {
        user_id: user.id,
        type: feedbackType,
        content: feedbackType === "bug" ? bugContent : suggTitle,
        details: feedbackType === "bug" ? null : suggDetails || null,
        page_url: feedbackType === "bug" ? bugPage : suggPage,
        severity: feedbackType === "bug" ? bugSeverity : null,
        screenshot_url: screenshotUrl,
      };
      if (workspaceId && workspaceId !== user.id) {
        row.workspace_id = workspaceId;
      }

      const { error } = await supabase.from("beta_feedback").insert(row as any);
      if (error) throw error;

      setStep("done");
      toast.success("Merci pour ton retour ! 🙏");
      setTimeout(() => {
        setOpen(false);
        resetForm();
      }, 2000);
    } catch (e: any) {
      console.error(e);
      toast.error("Erreur lors de l'envoi");
    } finally {
      setSending(false);
    }
  };

  const canSubmitBug = bugContent.trim().length > 0;
  const canSubmitSugg = suggTitle.trim().length > 0;

  if (!user) return null;

  return (
    <>
      {/* Floating button */}
      {!open && (
        <button
          onClick={handleOpen}
          className="fixed bottom-6 right-6 max-md:bottom-20 max-md:right-4 z-50 h-14 w-14 rounded-full bg-background border-2 border-primary shadow-lg flex items-center justify-center hover:scale-105 transition-transform"
          aria-label="Feedback bêta"
        >
          <MessageSquarePlus className="h-6 w-6 text-primary" />
          <span className="absolute -top-1 -right-1 bg-primary text-primary-foreground font-mono text-[9px] px-1.5 py-0.5 rounded-full leading-none">
            BÊTA
          </span>
        </button>
      )}

      {/* Panel */}
      {open && (
        <div className="fixed bottom-6 right-6 max-md:bottom-4 max-md:right-4 max-md:left-4 z-50 w-[360px] max-md:w-auto bg-background border border-border rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-fade-in">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <div>
              <h3 className="text-sm font-semibold text-foreground">💬 Feedback bêta</h3>
              <p className="text-xs text-muted-foreground">Un bug ? Une idée ? Dis-nous tout.</p>
            </div>
            <button onClick={() => { setOpen(false); resetForm(); }} className="text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="p-4 max-h-[400px] overflow-y-auto">
            {/* Step: Choose type */}
            {step === "choose" && (
              <div className="space-y-3">
                <button
                  onClick={() => selectType("bug")}
                  className="w-full rounded-xl border-2 border-border p-4 text-left transition-all hover:border-destructive/60 hover:bg-destructive/5"
                >
                  <span className="flex items-center gap-2 text-sm font-semibold">
                    <Bug className="h-4 w-4" /> 🐛 Signaler un bug
                  </span>
                  <span className="text-xs text-muted-foreground mt-1 block">Quelque chose ne fonctionne pas comme prévu</span>
                </button>
                <button
                  onClick={() => selectType("suggestion")}
                  className="w-full rounded-xl border-2 border-border p-4 text-left transition-all hover:border-primary/60 hover:bg-primary/5"
                >
                  <span className="flex items-center gap-2 text-sm font-semibold">
                    <Lightbulb className="h-4 w-4" /> 💡 Proposer une amélioration
                  </span>
                  <span className="text-xs text-muted-foreground mt-1 block">Une idée pour rendre l'app encore mieux</span>
                </button>
              </div>
            )}

            {/* Bug form */}
            {step === "form" && feedbackType === "bug" && (
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-foreground">Qu'est-ce qui ne fonctionne pas ? *</label>
                  <textarea
                    value={bugContent}
                    onChange={(e) => setBugContent(e.target.value)}
                    placeholder="Décris le problème..."
                    className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm min-h-[80px] resize-none focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-foreground">Sur quelle page ?</label>
                  <input
                    value={bugPage}
                    onChange={(e) => setBugPage(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-foreground">Urgence</label>
                  <div className="flex gap-2 mt-1">
                    {SEVERITIES.map((s) => (
                      <button
                        key={s.value}
                        onClick={() => setBugSeverity(s.value)}
                        className={cn(
                          "text-xs px-3 py-1.5 rounded-full border transition-all",
                          bugSeverity === s.value
                            ? "bg-primary/10 text-primary border-primary/30"
                            : "border-border text-muted-foreground hover:border-primary/40"
                        )}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".png,.jpg,.jpeg,.webp"
                    className="hidden"
                    onChange={handleScreenshot}
                  />
                  <button
                    onClick={() => fileRef.current?.click()}
                    className="text-xs flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Upload className="h-3.5 w-3.5" />
                    {screenshotFile ? `📎 ${screenshotFile.name}` : "Ajouter une capture d'écran"}
                  </button>
                </div>
                <Button onClick={submit} disabled={!canSubmitBug || sending} className="w-full rounded-full gap-2">
                  {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Envoyer
                </Button>
              </div>
            )}

            {/* Suggestion form */}
            {step === "form" && feedbackType === "suggestion" && (
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-foreground">Ton idée en une phrase *</label>
                  <input
                    value={suggTitle}
                    onChange={(e) => setSuggTitle(e.target.value)}
                    placeholder="Ex: Pouvoir dupliquer un post..."
                    className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-foreground">Décris un peu plus (optionnel)</label>
                  <textarea
                    value={suggDetails}
                    onChange={(e) => setSuggDetails(e.target.value)}
                    placeholder="Plus de détails..."
                    className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm min-h-[60px] resize-none focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-foreground">Sur quelle fonctionnalité ?</label>
                  <input
                    value={suggPage}
                    onChange={(e) => setSuggPage(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
                <Button onClick={submit} disabled={!canSubmitSugg || sending} className="w-full rounded-full gap-2">
                  {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Envoyer
                </Button>
              </div>
            )}

            {/* Done */}
            {step === "done" && (
              <div className="text-center py-6">
                <p className="text-lg">🙏</p>
                <p className="text-sm font-medium text-foreground mt-2">Merci ! On regarde ça.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
