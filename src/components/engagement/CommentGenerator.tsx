import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Copy, Loader2 } from "lucide-react";
import type { Contact } from "./ContactsSection";

interface GeneratedComment {
  type: string;
  label: string;
  emoji: string;
  text: string;
  word_count: number;
}

const ANGLES = [
  { value: "all", label: "Tous" },
  { value: "value", label: "💡 Valeur" },
  { value: "question", label: "❓ Question" },
  { value: "remarkable", label: "⚡ Remarquable" },
  { value: "expertise", label: "🎓 Expertise" },
];

interface Props {
  contact: Contact;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCommentPosted: (contactId: string) => void;
  prospectId?: string | null;
}

export default function CommentGenerator({ contact, open, onOpenChange, onCommentPosted, prospectId }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [caption, setCaption] = useState("");
  const [intent, setIntent] = useState("");
  const [angle, setAngle] = useState("all");
  const [loading, setLoading] = useState(false);
  const [comments, setComments] = useState<GeneratedComment[]>([]);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editedText, setEditedText] = useState("");

  const generate = async () => {
    if (!user || !caption.trim()) {
      toast({ title: "Ajoute la légende du post", variant: "destructive" });
      return;
    }
    setLoading(true);
    setComments([]);

    try {
      const { data: brand } = await supabase
        .from("brand_profile")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

      const brandingContext = brand
        ? `Nom/Activité: ${brand.mission || "?"}\nOffre: ${brand.offer || "?"}\nTon: ${brand.tone_style || "?"} / ${brand.tone_register || "?"}\nExpertise: ${brand.voice_description || "?"}`
        : "";

      const { data, error } = await supabase.functions.invoke("generate-comment", {
        body: {
          target_username: contact.pseudo,
          post_caption: caption,
          user_intent: intent || undefined,
          angle,
          branding_context: brandingContext,
        },
      });

      if (error) throw error;
      if (data?.comments) setComments(data.comments);
      else throw new Error("Réponse inattendue");
    } catch (err: any) {
      toast({ title: "Erreur", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const copyText = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      toast({ title: "📋 Commentaire copié !" });
    });
  };

  const markPosted = async (comment: GeneratedComment, finalText?: string) => {
    if (!user) return;

    // Save to engagement_comments
    await supabase.from("engagement_comments").insert({
      user_id: user.id,
      contact_id: contact.id,
      prospect_id: prospectId || null,
      target_username: contact.pseudo,
      post_caption: caption,
      user_intent: intent || null,
      comment_type: comment.type,
      generated_text: comment.text,
      final_text: finalText || comment.text,
      was_posted: true,
      posted_at: new Date().toISOString(),
    });

    // If prospect exists, log interaction
    if (prospectId) {
      await supabase.from("prospect_interactions").insert({
        prospect_id: prospectId,
        user_id: user.id,
        interaction_type: "comment_sent",
        content: (finalText || comment.text).substring(0, 200),
        ai_generated: true,
      });
    }

    onCommentPosted(contact.id);
    toast({ title: "✅ Commentaire noté !" });
    onOpenChange(false);
    // Reset
    setComments([]);
    setCaption("");
    setIntent("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>💬 Commenter un post de @{contact.pseudo}</DialogTitle>
        </DialogHeader>

        {comments.length === 0 ? (
          <div className="space-y-4">
            {/* Caption input */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground">Légende du post (copie-colle depuis Instagram)</label>
              <Textarea
                value={caption}
                onChange={e => setCaption(e.target.value)}
                placeholder="Colle ici la légende du post..."
                className="text-sm min-h-[80px]"
              />
            </div>

            {/* User intent */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground">Ce que tu voudrais dire (optionnel)</label>
              <Textarea
                value={intent}
                onChange={e => setIntent(e.target.value)}
                placeholder="Je voudrais rebondir sur..."
                className="text-sm min-h-[50px]"
              />
            </div>

            <p className="text-[10px] text-muted-foreground italic">💡 Plus tu donnes de contexte, plus le commentaire sera pertinent.</p>

            {/* Angle selection */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground">Ton angle (optionnel)</label>
              <div className="flex flex-wrap gap-1.5">
                {ANGLES.map(a => (
                  <button
                    key={a.value}
                    onClick={() => setAngle(a.value)}
                    className={`text-[11px] px-3 py-1 rounded-full border transition-all ${
                      angle === a.value ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border text-muted-foreground hover:border-primary/40"
                    }`}
                  >
                    {a.label}
                  </button>
                ))}
              </div>
            </div>

            <Button onClick={generate} disabled={loading || !caption.trim()} className="w-full">
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              ✨ Générer des commentaires
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">💬 {comments.length} commentaires proposés</p>

            {comments.map((c, idx) => (
              <div key={idx} className="space-y-2">
                <p className="text-[11px] font-semibold text-muted-foreground">{c.emoji} {c.label}</p>
                {editingIdx === idx ? (
                  <div className="space-y-2">
                    <Textarea
                      value={editedText}
                      onChange={e => setEditedText(e.target.value)}
                      className="text-sm min-h-[60px]"
                    />
                    <div className="flex gap-1">
                      <Button size="sm" className="text-xs" onClick={() => {
                        const updated = [...comments];
                        updated[idx] = { ...c, text: editedText };
                        setComments(updated);
                        setEditingIdx(null);
                      }}>Valider</Button>
                      <Button size="sm" variant="ghost" className="text-xs" onClick={() => setEditingIdx(null)}>Annuler</Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm whitespace-pre-wrap">
                      {c.text}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-muted-foreground">{c.word_count} mots</span>
                      <Button size="sm" variant="ghost" className="text-xs h-7" onClick={() => copyText(c.text)}>
                        <Copy className="h-3 w-3 mr-1" /> Copier
                      </Button>
                      <Button size="sm" variant="ghost" className="text-xs h-7" onClick={() => { setEditingIdx(idx); setEditedText(c.text); }}>
                        ✏️ Modifier
                      </Button>
                    </div>
                  </>
                )}
              </div>
            ))}

            <div className="border-t pt-3 space-y-2">
              <p className="text-xs text-muted-foreground">Après avoir posté le commentaire :</p>
              <div className="flex gap-2">
                <Button size="sm" onClick={() => markPosted(comments[0])} className="flex-1">
                  ✅ Commentaire posté
                </Button>
                <Button size="sm" variant="outline" onClick={() => onOpenChange(false)} className="flex-1">
                  ⏭️ Pas maintenant
                </Button>
              </div>
            </div>

            <Button size="sm" variant="ghost" className="text-xs w-full" onClick={() => setComments([])}>
              ← Modifier les paramètres
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
