import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useSpeechRecognition } from "@/hooks/use-speech-recognition";
import { Mic, MicOff, RefreshCw, Undo2 } from "lucide-react";

interface FeedbackLoopProps {
  content: string;
  onUpdate: (newContent: string) => void;
}

export default function FeedbackLoop({ content, onUpdate }: FeedbackLoopProps) {
  const [open, setOpen] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [loading, setLoading] = useState(false);
  const [previousContent, setPreviousContent] = useState<string | null>(null);

  const { isListening, isSupported, toggle } = useSpeechRecognition((text) => {
    setFeedback((prev) => prev + (prev ? " " : "") + text);
  });

  const handleRewrite = async () => {
    if (!feedback.trim()) return;
    setLoading(true);
    setPreviousContent(content);
    try {
      const { data, error } = await supabase.functions.invoke("creative-flow", {
        body: {
          step: "adjust",
          contentType: "",
          context: "",
          profile: {},
          content,
          adjustment: feedback,
        },
      });
      if (error) throw error;
      if (data?.content) {
        onUpdate(data.content);
        setFeedback("");
        setOpen(false);
      }
    } catch {}
    setLoading(false);
  };

  const handleUndo = () => {
    if (previousContent) {
      onUpdate(previousContent);
      setPreviousContent(null);
    }
  };

  return (
    <div className="space-y-2">
      {previousContent && (
        <button onClick={handleUndo} className="text-xs text-primary hover:underline flex items-center gap-1">
          <Undo2 className="h-3 w-3" /> Voir la version précédente
        </button>
      )}

      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          💬 Un truc qui ne te plaît pas ?
        </button>
      ) : (
        <div className="rounded-2xl border border-border bg-card p-4 space-y-3 animate-fade-in">
          <p className="text-sm font-medium text-foreground">💬 Un truc qui ne te plaît pas ?</p>
          <div className="relative">
            <Textarea
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="Trop lisse au début, j'aimerais plus de punch et une référence à mon expérience..."
              className="pr-12 min-h-[80px]"
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
          <Button
            size="sm"
            onClick={handleRewrite}
            disabled={loading || !feedback.trim()}
            className="rounded-pill gap-1.5"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            {loading ? "Réécriture..." : "Réécrire avec ce feedback"}
          </Button>
        </div>
      )}
    </div>
  );
}
