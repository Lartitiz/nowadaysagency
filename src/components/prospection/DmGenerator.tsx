import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Copy, Loader2 } from "lucide-react";
import type { Prospect, ProspectInteraction } from "./ProspectionSection";

const APPROACHES = [
  {
    key: "reconnect",
    emoji: "🫶",
    label: "Reprendre contact naturellement",
    desc: "Commenter sa story, réagir à un post, juste être là. Pas de vente, juste du lien humain.",
    ideal: "Premier contact ou relation froide",
  },
  {
    key: "resource",
    emoji: "💡",
    label: "Proposer une ressource gratuite",
    desc: "Offrir un freebie, un conseil, un template. Tu donnes de la valeur avant de demander quoi que ce soit.",
    ideal: "Vous avez déjà échangé un peu",
  },
  {
    key: "personalized",
    emoji: "🎯",
    label: "DM personnalisé sur son activité",
    desc: "Un message qui montre que tu connais son projet et que tu as une idée pour l'aider.",
    ideal: "Elle est en phase exploration/hésitation",
  },
  {
    key: "offer",
    emoji: "🤝",
    label: "Proposer un appel ou une offre",
    desc: "Message direct qui propose un appel découverte ou présente ton offre.",
    ideal: "La relation est chaude et elle est prête",
  },
];

interface Props {
  prospect: Prospect;
  interactions: ProspectInteraction[];
  onBack: () => void;
  onMessageSent: (content: string, approach: string) => void;
}

export default function DmGenerator({ prospect, interactions, onBack, onMessageSent }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [selectedApproach, setSelectedApproach] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [variants, setVariants] = useState<{ variant_a: string; variant_b: string } | null>(null);
  const [editingVariant, setEditingVariant] = useState<"a" | "b" | null>(null);
  const [editedText, setEditedText] = useState("");

  const generateDm = async (approach: string) => {
    if (!user) return;
    setSelectedApproach(approach);
    setLoading(true);
    setVariants(null);

    try {
      // Get branding context
      const { data: brand } = await supabase
        .from("brand_profile")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

      const brandingContext = brand
        ? `Mission: ${brand.mission || "?"}\nOffre: ${brand.offer || "?"}\nTon: ${brand.tone_style || "?"} / ${brand.tone_register || "?"}\nÉviter: ${brand.things_to_avoid || "?"}`
        : "";

      const interactionsSummary = interactions
        .map(i => `${new Date(i.created_at).toLocaleDateString("fr-FR")} : ${i.interaction_type}${i.content ? ` - ${i.content}` : ""}`)
        .join("\n") || "Aucune interaction précédente.";

      const { data, error } = await supabase.functions.invoke("prospect-dm", {
        body: {
          prospect,
          approach_type: approach,
          interactions_summary: interactionsSummary,
          branding_context: brandingContext,
        },
      });

      if (error) throw error;
      setVariants(data);
    } catch (err: any) {
      toast({ title: "Erreur", description: err.message || "Impossible de générer le message", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const copyText = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      toast({ title: "📋 Message copié !" });
    });
  };

  // Step 1: Choose approach
  if (!selectedApproach) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h3 className="font-display text-sm font-bold">
            💬 Quel type de message pour @{prospect.instagram_username} ?
          </h3>
        </div>
        {APPROACHES.map(a => (
          <button
            key={a.key}
            onClick={() => generateDm(a.key)}
            className="w-full text-left rounded-lg border border-border p-3 hover:border-primary/40 transition-colors space-y-1"
          >
            <div className="font-semibold text-sm">{a.emoji} {a.label}</div>
            <p className="text-xs text-muted-foreground">{a.desc}</p>
            <p className="text-[10px] text-primary">Idéal si : {a.ideal}</p>
          </button>
        ))}
      </div>
    );
  }

  // Step 2: Loading
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">L'IA rédige ton message...</p>
      </div>
    );
  }

  // Step 3: Show variants
  if (variants) {
    const renderVariant = (label: string, text: string, key: "a" | "b") => (
      <div className="space-y-2">
        <p className="text-xs font-semibold text-muted-foreground">{label}</p>
        {editingVariant === key ? (
          <div className="space-y-2">
            <Textarea
              value={editedText}
              onChange={e => setEditedText(e.target.value)}
              className="text-sm min-h-[80px]"
            />
            <div className="flex gap-1">
              <Button size="sm" className="text-xs" onClick={() => {
                if (key === "a") setVariants({ ...variants, variant_a: editedText });
                else setVariants({ ...variants, variant_b: editedText });
                setEditingVariant(null);
              }}>Valider</Button>
              <Button size="sm" variant="ghost" className="text-xs" onClick={() => setEditingVariant(null)}>Annuler</Button>
            </div>
          </div>
        ) : (
          <>
            <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm whitespace-pre-wrap">
              {text}
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" className="text-xs" onClick={() => copyText(text)}>
                <Copy className="h-3 w-3 mr-1" /> Copier
              </Button>
              <Button size="sm" variant="ghost" className="text-xs" onClick={() => {
                setEditingVariant(key);
                setEditedText(text);
              }}>
                ✏️ Modifier
              </Button>
            </div>
          </>
        )}
      </div>
    );

    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={() => { setSelectedApproach(null); setVariants(null); }}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h3 className="font-display text-sm font-bold">
            💬 Message pour @{prospect.instagram_username}
          </h3>
        </div>

        {renderVariant("Variante A", variants.variant_a, "a")}
        {renderVariant("Variante B", variants.variant_b, "b")}

        <div className="border-t pt-3 space-y-2">
          <p className="text-xs text-muted-foreground">Après avoir envoyé le message :</p>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => onMessageSent(variants.variant_a, selectedApproach)} className="flex-1">
              ✅ Message envoyé
            </Button>
            <Button size="sm" variant="outline" onClick={onBack} className="flex-1">
              ⏭️ Pas maintenant
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
