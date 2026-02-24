import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspaceFilter } from "@/hooks/use-workspace-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { friendlyError } from "@/lib/error-messages";
import { Button } from "@/components/ui/button";
import { TextareaWithVoice as Textarea } from "@/components/ui/textarea-with-voice";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, ArrowRight, Copy, Loader2, AlertTriangle, Check, Sparkles } from "lucide-react";
// Prospect type - compatible with both old ProspectionSection and new ContactsPage
type Prospect = {
  id: string;
  instagram_username?: string;
  username?: string;
  display_name?: string | null;
  activity?: string | null;
  strengths?: string | null;
  probable_problem?: string | null;
  source?: string | null;
  note?: string | null;
  notes?: string | null;
  stage?: string;
  prospect_stage?: string;
  decision_phase?: string | null;
  relevant_offer?: string | null;
  last_interaction_at?: string | null;
  next_reminder_at?: string | null;
  next_followup_at?: string | null;
  next_reminder_text?: string | null;
  next_followup_text?: string | null;
  conversion_amount?: number | null;
  noted_interest?: string | null;
  to_avoid?: string | null;
  last_conversation?: string | null;
  last_dm_context?: string | null;
  created_at?: string;
  updated_at?: string;
  [key: string]: any;
};

type ProspectInteraction = {
  id: string;
  prospect_id?: string;
  contact_id?: string;
  interaction_type: string;
  content: string | null;
  ai_generated: boolean;
  responded: boolean | null;
  created_at: string;
};

export type { Prospect, ProspectInteraction };

const APPROACHES = [
  { key: "reconnect", emoji: "🫶", label: "Reprendre contact", desc: "Juste du lien humain, pas de vente." },
  { key: "resource", emoji: "💡", label: "Proposer une ressource", desc: "Offrir de la valeur gratuitement." },
  { key: "personalized", emoji: "🎯", label: "DM personnalisé", desc: "Montrer que tu connais son projet." },
  { key: "offer", emoji: "🤝", label: "Proposer un appel/offre", desc: "Message direct, relation chaude." },
];

interface Offer {
  id: string;
  name: string;
  offer_type: string;
  promise: string | null;
  price_text: string | null;
  sales_line: string | null;
  url_sales_page: string | null;
  url_booking: string | null;
  problem_deep: string | null;
  description_short: string | null;
}

interface Props {
  prospect: Prospect;
  interactions: ProspectInteraction[];
  onBack: () => void;
  onMessageSent: (content: string, approach: string, meta?: Record<string, any>) => void;
}

type Step = 1 | 2 | 3 | 4;

function getUsername(p: Prospect) {
  return p.instagram_username || p.username || "";
}

export default function DmGenerator({ prospect, interactions, onBack, onMessageSent }: Props) {
  const { user } = useAuth();
  const { column, value } = useWorkspaceFilter();
  const { toast } = useToast();

  // Step state
  const [step, setStep] = useState<Step>(1);

  // Step 1: Conversation history
  const [conversationHistory, setConversationHistory] = useState((prospect as any).last_conversation || "");
  const [skippedHistory, setSkippedHistory] = useState(false);

  // Step 2: Context questions
  const [offers, setOffers] = useState<Offer[]>([]);
  const [selectedOfferId, setSelectedOfferId] = useState<string>("none");
  const [notedInterest, setNotedInterest] = useState((prospect as any).noted_interest || "");
  const [prospectProblem, setProspectProblem] = useState(prospect.probable_problem || "");
  const [toAvoid, setToAvoid] = useState((prospect as any).to_avoid || "");
  const [messageContext, setMessageContext] = useState((prospect as any).last_dm_context || "");

  // Step 3: Approach
  const [selectedApproach, setSelectedApproach] = useState<string | null>(null);
  const [suggestedApproach, setSuggestedApproach] = useState<string | null>(null);
  const [suggestionReason, setSuggestionReason] = useState("");

  // Step 4: Generation
  const [loading, setLoading] = useState(false);
  const [variants, setVariants] = useState<{ variant_a: string; variant_b: string } | null>(null);
  const [editingVariant, setEditingVariant] = useState<"a" | "b" | null>(null);
  const [editedText, setEditedText] = useState("");

  // Load offers on mount
  useEffect(() => {
    if (!user) return;
    (supabase.from("offers") as any)
      .select("id, name, offer_type, promise, price_text, sales_line, url_sales_page, url_booking, problem_deep, description_short")
      .eq(column, value)
      .then(({ data }) => {
        if (data) setOffers(data as Offer[]);
      });
  }, [user?.id]);

  // Compute suggestion when entering step 3
  useEffect(() => {
    if (step !== 3) return;
    const hasConvo = conversationHistory.trim().length > 0;
    const avoidSales = toAvoid.toLowerCase().includes("vent") || toAvoid.toLowerCase().includes("frontal") || toAvoid.toLowerCase().includes("commercial");
    const selectedOffer = offers.find(o => o.id === selectedOfferId);
    const isFreeOffer = selectedOffer?.offer_type === "free";

    let suggestion = "personalized";
    let reason = "Un DM personnalisé est l'approche la plus polyvalente.";

    if (avoidSales) {
      suggestion = isFreeOffer ? "resource" : "reconnect";
      reason = `Elle est méfiante des approches commerciales. ${isFreeOffer ? "Proposer ta ressource gratuite sera naturel." : "Mieux vaut reprendre contact doucement."}`;
    } else if (isFreeOffer) {
      suggestion = "resource";
      reason = "Tu as sélectionné une offre gratuite — proposer une ressource sera le plus naturel.";
    } else if (hasConvo && notedInterest) {
      suggestion = "personalized";
      reason = `Vu votre conversation, un message personnalisé rebondissant sur son intérêt (${notedInterest.slice(0, 50)}…) sera le plus efficace.`;
    } else if (prospect.decision_phase === "ready") {
      suggestion = "offer";
      reason = "Elle est en phase 'Prête à décider'. Tu peux proposer directement.";
    } else if (!hasConvo && prospect.decision_phase === "unaware") {
      suggestion = "reconnect";
      reason = "Pas de conversation récente et elle est encore inconsciente du problème. Crée du lien d'abord.";
    }

    setSuggestedApproach(suggestion);
    setSuggestionReason(reason);
    if (!selectedApproach) setSelectedApproach(suggestion);
  }, [step, conversationHistory, toAvoid, offers, selectedOfferId, notedInterest, prospect.decision_phase]);

  const generateDm = async () => {
    if (!user || !selectedApproach) return;
    setStep(4);
    setLoading(true);
    setVariants(null);

    try {
      const selectedOffer = offers.find(o => o.id === selectedOfferId);
      const interactionsSummary = interactions
        .map(i => `${new Date(i.created_at).toLocaleDateString("fr-FR")} : ${i.interaction_type}${i.content ? ` - ${i.content}` : ""}`)
        .join("\n") || "Aucune interaction précédente.";

      const { data, error } = await supabase.functions.invoke("prospect-dm", {
        body: {
          prospect: {
            ...prospect,
            noted_interest: notedInterest,
            probable_problem: prospectProblem,
            to_avoid: toAvoid,
            last_dm_context: messageContext,
          },
          approach_type: selectedApproach,
          interactions_summary: interactionsSummary,
          conversation_history: skippedHistory ? "" : conversationHistory,
          selected_offer: selectedOffer || null,
        },
      });

      if (error) throw error;
      setVariants(data);
    } catch (err: any) {
      console.error("Erreur technique:", err);
      toast({ title: "Erreur", description: friendlyError(err), variant: "destructive" });
      setStep(3);
    } finally {
      setLoading(false);
    }
  };

  const copyText = (text: string) => {
    navigator.clipboard.writeText(text).then(() => toast({ title: "📋 Copié !" }));
  };

  const handleSent = (text: string) => {
    // Save context back to prospect
    if (user) {
      const updates: Record<string, any> = {};
      if (conversationHistory.trim()) updates.last_conversation = conversationHistory;
      if (notedInterest.trim()) updates.noted_interest = notedInterest;
      if (prospectProblem.trim()) updates.probable_problem = prospectProblem;
      if (toAvoid.trim()) updates.to_avoid = toAvoid;
      if (messageContext.trim()) updates.last_dm_context = messageContext;
      if (Object.keys(updates).length > 0) {
        supabase.from("prospects").update(updates).eq("id", prospect.id).then(() => {});
      }
    }

    const selectedOffer = offers.find(o => o.id === selectedOfferId);
    onMessageSent(text, selectedApproach!, {
      offer_id: selectedOffer?.id,
      conversation_provided: !skippedHistory && conversationHistory.trim().length > 0,
      approach: selectedApproach,
    });
  };

  const handlePostpone = () => {
    // Save context even if not sending now
    if (user) {
      const updates: Record<string, any> = {};
      if (conversationHistory.trim()) updates.last_conversation = conversationHistory;
      if (notedInterest.trim()) updates.noted_interest = notedInterest;
      if (prospectProblem.trim()) updates.probable_problem = prospectProblem;
      if (toAvoid.trim()) updates.to_avoid = toAvoid;
      if (messageContext.trim()) updates.last_dm_context = messageContext;
      if (Object.keys(updates).length > 0) {
        supabase.from("prospects").update(updates).eq("id", prospect.id).then(() => {});
      }
    }
    onBack();
  };

  // ─── STEP 1: Conversation History ───
  if (step === 1) {
    return (
      <div className="space-y-4">
        <StepHeader step={1} label="VOTRE CONVERSATION" prospect={prospect} onBack={onBack} />
        <p className="text-xs text-muted-foreground">
          Copie-colle ici les derniers messages échangés avec @{getUsername(prospect)} (DM Instagram) :
        </p>
        <Textarea
          value={conversationHistory}
          onChange={e => setConversationHistory(e.target.value)}
          placeholder={"Moi : Hey ! J'ai adoré ta dernière story...\nElle : Merci ! J'hésite toujours à montrer ce genre de trucs..."}
          className="text-sm min-h-[120px]"
        />
        <p className="text-[11px] text-muted-foreground">
          💡 Copie juste les derniers échanges pertinents. L'IA les analysera pour écrire un message qui fait suite naturellement.
        </p>
        {(prospect as any).last_conversation && conversationHistory === (prospect as any).last_conversation && (
          <p className="text-[11px] text-primary">
            📩 Conversation précédente chargée. Mets à jour si tu as de nouveaux échanges.
          </p>
        )}
        <div className="flex justify-between items-center pt-2">
          <button
            onClick={() => { setSkippedHistory(true); setStep(2); }}
            className="text-xs text-muted-foreground hover:text-primary transition-colors"
          >
            ⏭️ Passer cette étape
          </button>
          <Button size="sm" onClick={() => { setSkippedHistory(false); setStep(2); }}>
            Suivant <ArrowRight className="h-3.5 w-3.5 ml-1" />
          </Button>
        </div>
      </div>
    );
  }

  // ─── STEP 2: Context Questions ───
  if (step === 2) {
    return (
      <div className="space-y-4">
        <StepHeader step={2} label="CONTEXTE" prospect={prospect} onBack={() => setStep(1)} />

        {/* Offer selection */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-foreground">🎁 Quelle offre tu veux proposer ?</label>
          {offers.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Tu n'as pas encore renseigné tes offres.{" "}
              <a href="/branding" className="text-primary hover:underline">Aller dans Mes offres →</a>
            </p>
          ) : (
            <Select value={selectedOfferId} onValueChange={setSelectedOfferId}>
              <SelectTrigger className="text-xs h-9">
                <SelectValue placeholder="Sélectionner une offre" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">⏭️ Pas d'offre précise</SelectItem>
                {offers.map(o => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.offer_type === "free" ? "🎁" : "💎"} {o.name}
                    {o.price_text ? ` (${o.price_text})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {/* Interest */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-foreground">💡 Elle a montré un intérêt pour quelque chose ?</label>
          <Textarea
            value={notedInterest}
            onChange={e => setNotedInterest(e.target.value)}
            placeholder="Elle a dit qu'elle avait besoin de se structurer sur sa com'..."
            className="text-xs min-h-[60px]"
          />
        </div>

        {/* Problem */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-foreground">⚠️ Son problème principal d'après toi ?</label>
          <Textarea
            value={prospectProblem}
            onChange={e => setProspectProblem(e.target.value)}
            placeholder="Elle a du super contenu mais aucune stratégie..."
            className="text-xs min-h-[60px]"
          />
        </div>

        {/* Message context */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-foreground">💬 Qu'est-ce que tu veux lui dire ? (contexte du message)</label>
          <Textarea
            value={messageContext}
            onChange={e => setMessageContext(e.target.value)}
            placeholder="Ex : Je veux lui parler de mon atelier Instagram, rebondir sur sa story d'hier, lui proposer un café virtuel..."
            className="text-xs min-h-[60px]"
          />
        </div>

        {/* To avoid */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-foreground">🚫 Un truc à éviter dans le message ?</label>
          <Textarea
            value={toAvoid}
            onChange={e => setToAvoid(e.target.value)}
            placeholder="Ne pas être trop frontale sur la vente..."
            className="text-xs min-h-[50px]"
          />
        </div>

        <div className="flex justify-between pt-2">
          <Button size="sm" variant="ghost" onClick={() => setStep(1)}>
            <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Retour
          </Button>
          <Button size="sm" onClick={() => setStep(3)}>
            Suivant <ArrowRight className="h-3.5 w-3.5 ml-1" />
          </Button>
        </div>
      </div>
    );
  }

  // ─── STEP 3: Approach Selection ───
  if (step === 3) {
    return (
      <div className="space-y-4">
        <StepHeader step={3} label="TON APPROCHE" prospect={prospect} onBack={() => setStep(2)} />

        {suggestedApproach && (
          <div className="rounded-xl bg-primary/5 border border-primary/20 p-3">
            <p className="text-xs text-foreground">
              <Sparkles className="h-3.5 w-3.5 inline mr-1 text-primary" />
              <strong>Suggestion :</strong> {suggestionReason}
            </p>
          </div>
        )}

        {!skippedHistory && !conversationHistory.trim() && (
          <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 p-2.5">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-600 mt-0.5 shrink-0" />
            <p className="text-[11px] text-amber-800">
              Pas d'historique de conversation fourni. Le message sera moins pertinent.
            </p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          {APPROACHES.map(a => (
            <button
              key={a.key}
              onClick={() => setSelectedApproach(a.key)}
              className={`text-left rounded-xl border p-3 transition-all ${
                selectedApproach === a.key
                  ? "border-primary bg-primary/5 ring-1 ring-primary"
                  : "border-border hover:border-primary/40"
              }`}
            >
              <div className="flex items-center gap-1.5 mb-1">
                <span className="text-base">{a.emoji}</span>
                <span className="font-semibold text-xs text-foreground">{a.label}</span>
              </div>
              <p className="text-[10px] text-muted-foreground">{a.desc}</p>
              {suggestedApproach === a.key && (
                <span className="inline-block mt-1 text-[9px] font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                  💡 suggéré
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="flex justify-between pt-2">
          <Button size="sm" variant="ghost" onClick={() => setStep(2)}>
            <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Retour
          </Button>
          <Button size="sm" onClick={generateDm} disabled={!selectedApproach}>
            <Sparkles className="h-3.5 w-3.5 mr-1" /> Générer le message
          </Button>
        </div>
      </div>
    );
  }

  // ─── STEP 4: Generation Result ───
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">L'IA rédige ton message...</p>
        <p className="text-[10px] text-muted-foreground">
          Analyse de {conversationHistory.trim() ? "la conversation + " : ""}ton contexte en cours
        </p>
      </div>
    );
  }

  if (variants) {
    const selectedOffer = offers.find(o => o.id === selectedOfferId);
    const contextSummary = [
      !skippedHistory && conversationHistory.trim() ? `✅ Conversation analysée` : "⚠️ Pas de conversation",
      selectedOffer ? `${selectedOffer.offer_type === "free" ? "🎁" : "💎"} ${selectedOffer.name}` : "Pas d'offre",
      notedInterest ? `Intérêt : ${notedInterest.slice(0, 40)}…` : null,
      toAvoid ? `Éviter : ${toAvoid.slice(0, 40)}…` : null,
    ].filter(Boolean);

    const renderVariant = (label: string, text: string, key: "a" | "b") => (
      <div className="space-y-2">
        <p className="text-xs font-semibold text-muted-foreground">{label}</p>
        {editingVariant === key ? (
          <div className="space-y-2">
            <Textarea value={editedText} onChange={e => setEditedText(e.target.value)} className="text-sm min-h-[80px]" />
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
            <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm whitespace-pre-wrap">{text}</div>
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" className="text-xs" onClick={() => copyText(text)}>
                <Copy className="h-3 w-3 mr-1" /> Copier
              </Button>
              <Button size="sm" variant="ghost" className="text-xs" onClick={() => { setEditingVariant(key); setEditedText(text); }}>
                ✏️ Modifier
              </Button>
            </div>
          </>
        )}
      </div>
    );

    return (
      <div className="space-y-4">
        <StepHeader step={4} label="TON MESSAGE" prospect={prospect} onBack={() => setStep(3)} />

        {/* Context summary */}
        <div className="rounded-xl bg-muted/40 p-3 space-y-1">
          <p className="text-[10px] font-semibold text-muted-foreground">📩 Contexte pris en compte :</p>
          {contextSummary.map((s, i) => (
            <p key={i} className="text-[10px] text-muted-foreground">· {s}</p>
          ))}
        </div>

        {renderVariant("Variante A", variants.variant_a, "a")}
        {renderVariant("Variante B", variants.variant_b, "b")}

        <div className="border-t pt-3 space-y-2">
          <div className="flex gap-2">
            <Button size="sm" onClick={() => handleSent(variants.variant_a)} className="flex-1">
              <Check className="h-3.5 w-3.5 mr-1" /> Message envoyé
            </Button>
            <Button size="sm" variant="outline" onClick={handlePostpone} className="flex-1">
              ⏭️ Pas maintenant
            </Button>
          </div>
          <Button size="sm" variant="ghost" className="w-full text-xs" onClick={() => { setStep(3); setVariants(null); }}>
            🔄 Regénérer
          </Button>
        </div>
      </div>
    );
  }

  return null;
}

/* ─── Step Header ─── */
function StepHeader({ step, label, prospect, onBack }: { step: number; label: string; prospect: Prospect; onBack: () => void }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Button size="sm" variant="ghost" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h3 className="font-display text-sm font-bold">
          📩 DM pour @{getUsername(prospect)}
        </h3>
      </div>
      {/* Step indicator */}
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4].map(s => (
          <div key={s} className="flex items-center gap-1">
            <div className={`h-1.5 rounded-full transition-all ${s <= step ? "bg-primary w-8" : "bg-border w-4"}`} />
          </div>
        ))}
        <span className="text-[10px] text-muted-foreground ml-2">
          ÉTAPE {step}/4 : {label}
        </span>
      </div>
    </div>
  );
}
