import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Check, ChevronLeft, ChevronRight, Copy, RefreshCw, Sparkles, X, BookOpen } from "lucide-react";
import type { UserProfile } from "@/pages/Dashboard";
import { getGuide } from "@/lib/production-guides";

interface RedactionIdea {
  titre: string;
  format: string;
  angle: string;
}

interface Props {
  idea: RedactionIdea;
  profile: UserProfile;
  canal: string;
  objectif: string;
  onClose: () => void;
}

const STEPS = [
  { num: 1, label: "Structure" },
  { num: 2, label: "Accroches" },
  { num: 3, label: "Premier jet" },
  { num: 4, label: "Édition" },
  { num: 5, label: "Checklist" },
];

const CHECKLIST_ITEMS = [
  "L'accroche donne envie de lire la suite (pas de intro molle)",
  "Chaque slide/paragraphe apporte une valeur ou fait avancer le récit",
  "Le ton est cohérent du début à la fin",
  "Il y a une ouverture à la fin (question, invitation, réflexion) et pas un CTA agressif",
  "Le texte utilise mon vocabulaire et mes expressions",
  "Pas de jargon marketing ni de promesses chiffrées",
  "J'ai relu à voix haute et ça sonne naturel",
  "Le contenu est adapté au format choisi (longueur, rythme)",
];

export default function RedactionFlow({ idea, profile, canal, objectif, onClose }: Props) {
  const { toast } = useToast();
  const [step, setStep] = useState(1);

  // Step 1: Structure
  const [structure, setStructure] = useState("");
  const [loadingStructure, setLoadingStructure] = useState(false);

  // Step 2: Accroches
  const [accroches, setAccroches] = useState<string[]>([]);
  const [selectedAccroche, setSelectedAccroche] = useState<number | null>(null);
  const [loadingAccroches, setLoadingAccroches] = useState(false);

  // Step 3: Premier jet
  const [draft, setDraft] = useState("");
  const [loadingDraft, setLoadingDraft] = useState(false);

  // Step 4: Edited content
  const [editedContent, setEditedContent] = useState("");

  // Step 5: Checklist
  const [checks, setChecks] = useState<boolean[]>(new Array(CHECKLIST_ITEMS.length).fill(false));

  const profilePayload = {
    prenom: profile.prenom,
    activite: profile.activite,
    type_activite: profile.type_activite,
    cible: profile.cible,
    probleme_principal: profile.probleme_principal,
    piliers: profile.piliers,
    tons: profile.tons,
    mission: (profile as any).mission || "",
    offre: (profile as any).offre || "",
    croyances_limitantes: (profile as any).croyances_limitantes || "",
    verbatims: (profile as any).verbatims || "",
    expressions_cles: (profile as any).expressions_cles || "",
    ce_quon_evite: (profile as any).ce_quon_evite || "",
    style_communication: (profile as any).style_communication || [],
  };

  const generateStructure = async () => {
    setLoadingStructure(true);
    try {
      const res = await supabase.functions.invoke("generate-content", {
        body: {
          type: "redaction-structure",
          format: idea.format,
          sujet: idea.titre,
          canal,
          objectif,
          angle: idea.angle,
          profile: profilePayload,
        },
      });
      if (res.error) throw new Error(res.error.message);
      setStructure(res.data?.content || "");
    } catch (e: any) {
      toast({ title: "Erreur", description: e.message, variant: "destructive" });
    } finally {
      setLoadingStructure(false);
    }
  };

  const generateAccroches = async () => {
    setLoadingAccroches(true);
    try {
      const res = await supabase.functions.invoke("generate-content", {
        body: {
          type: "redaction-accroches",
          format: idea.format,
          sujet: idea.titre,
          canal,
          objectif,
          angle: idea.angle,
          profile: profilePayload,
        },
      });
      if (res.error) throw new Error(res.error.message);
      const content = res.data?.content || "";
      let parsed: string[];
      try {
        parsed = JSON.parse(content);
      } catch {
        const match = content.match(/\[[\s\S]*\]/);
        parsed = match ? JSON.parse(match[0]) : content.split("\n").filter((l: string) => l.trim());
      }
      setAccroches(parsed.slice(0, 3));
    } catch (e: any) {
      toast({ title: "Erreur", description: e.message, variant: "destructive" });
    } finally {
      setLoadingAccroches(false);
    }
  };

  const generateDraft = async () => {
    setLoadingDraft(true);
    try {
      const chosenAccroche = selectedAccroche !== null ? accroches[selectedAccroche] : "";
      const res = await supabase.functions.invoke("generate-content", {
        body: {
          type: "redaction-draft",
          format: idea.format,
          sujet: idea.titre,
          canal,
          objectif,
          angle: idea.angle,
          structure,
          accroche: chosenAccroche,
          profile: profilePayload,
        },
      });
      if (res.error) throw new Error(res.error.message);
      const content = res.data?.content || "";
      setDraft(content);
      setEditedContent(content);
    } catch (e: any) {
      toast({ title: "Erreur", description: e.message, variant: "destructive" });
    } finally {
      setLoadingDraft(false);
    }
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(editedContent || draft);
    toast({ title: "Contenu copié !" });
  };

  const goToStep = (s: number) => {
    setStep(s);
    // Auto-generate on first visit
    if (s === 1 && !structure && !loadingStructure) generateStructure();
    if (s === 2 && accroches.length === 0 && !loadingAccroches) generateAccroches();
    if (s === 3 && !draft && !loadingDraft) generateDraft();
  };

  // Auto-generate structure on mount
  useState(() => {
    if (!structure && !loadingStructure) generateStructure();
  });

  const LoadingDots = ({ text }: { text: string }) => (
    <div className="flex items-center gap-3 py-8 justify-center animate-fade-in">
      <div className="flex gap-1">
        <div className="h-2 w-2 rounded-full bg-primary animate-bounce-dot" />
        <div className="h-2 w-2 rounded-full bg-primary animate-bounce-dot" style={{ animationDelay: "0.16s" }} />
        <div className="h-2 w-2 rounded-full bg-primary animate-bounce-dot" style={{ animationDelay: "0.32s" }} />
      </div>
      <span className="text-sm italic text-muted-foreground">{text}</span>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-start justify-center overflow-y-auto py-8 px-4">
      <div className="w-full max-w-3xl bg-card rounded-2xl border border-border shadow-lg animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div>
            <h2 className="font-display text-lg font-bold text-bordeaux">Aide-moi à rédiger</h2>
            <p className="text-sm text-muted-foreground mt-0.5 truncate max-w-md">{idea.titre}</p>
          </div>
          <button onClick={onClose} className="rounded-full p-2 hover:bg-muted transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Stepper */}
        <div className="px-5 py-4 border-b border-border">
          <div className="flex items-center justify-between">
            {STEPS.map((s, i) => (
              <div key={s.num} className="flex items-center">
                <button
                  onClick={() => goToStep(s.num)}
                  className={`flex items-center gap-2 transition-all ${
                    step === s.num
                      ? "text-primary font-semibold"
                      : step > s.num
                        ? "text-primary/60"
                        : "text-muted-foreground"
                  }`}
                >
                  <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all ${
                    step === s.num
                      ? "bg-primary text-primary-foreground border-primary"
                      : step > s.num
                        ? "bg-primary/20 text-primary border-primary/40"
                        : "bg-muted border-border"
                  }`}>
                    {step > s.num ? <Check className="h-3.5 w-3.5" /> : s.num}
                  </span>
                  <span className="text-xs hidden sm:inline">{s.label}</span>
                </button>
                {i < STEPS.length - 1 && (
                  <div className={`w-8 sm:w-12 h-0.5 mx-1 ${step > s.num ? "bg-primary/40" : "bg-border"}`} />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="p-5 min-h-[300px]">
          {/* Step 1: Structure */}
          {step === 1 && (
            <div className="animate-fade-in space-y-5">
              {/* Contextual Nowadays guide */}
              {(() => {
                const guide = getGuide(idea.angle);
                if (!guide) return null;
                return (
                  <div className="rounded-xl border border-primary/20 bg-secondary/50 p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <BookOpen className="h-4 w-4 text-primary" />
                      <h4 className="font-display text-sm font-bold">Guide de production – {idea.angle}</h4>
                    </div>
                    <ol className="space-y-2">
                      {guide.map((s, i) => (
                        <li key={i} className="text-[13px] leading-relaxed">
                          <span className="font-semibold text-primary">{s.label}</span>
                          <span className="text-muted-foreground"> — {s.detail}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                );
              })()}

              {/* AI-generated structure */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Sparkles className="h-4 w-4 text-primary" />
                  <h3 className="font-display text-base font-bold">Structure proposée par l'IA</h3>
                  <span className="font-mono-ui text-xs bg-muted px-2 py-0.5 rounded-full text-muted-foreground">{idea.format}</span>
                </div>
                <p className="text-sm text-muted-foreground mb-4">Voici un squelette personnalisé basé sur ton profil. Tu peux t'en inspirer librement.</p>
                {loadingStructure ? (
                  <LoadingDots text="Je prépare la structure..." />
                ) : (
                  <>
                    <div className="bg-rose-pale rounded-xl p-4 text-sm leading-relaxed whitespace-pre-wrap">{structure}</div>
                    <Button variant="outline" size="sm" onClick={generateStructure} className="rounded-full gap-1.5 mt-3">
                      <RefreshCw className="h-3.5 w-3.5" />
                      Régénérer
                    </Button>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Step 2: Accroches */}
          {step === 2 && (
            <div className="animate-fade-in">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="h-4 w-4 text-primary" />
                <h3 className="font-display text-base font-bold">3 accroches au choix</h3>
              </div>
              <p className="text-sm text-muted-foreground mb-4">Choisis celle qui te parle le plus. Elle sera utilisée pour le premier jet.</p>
              {loadingAccroches ? (
                <LoadingDots text="Je travaille sur tes accroches..." />
              ) : (
                <>
                  <div className="space-y-3">
                    {accroches.map((a, i) => (
                      <button
                        key={i}
                        onClick={() => setSelectedAccroche(i)}
                        className={`w-full text-left rounded-xl border-2 p-4 text-sm leading-relaxed transition-all ${
                          selectedAccroche === i
                            ? "border-primary bg-secondary"
                            : "border-border hover:border-primary/40"
                        }`}
                      >
                        <span className="font-mono-ui text-xs text-muted-foreground mb-1 block">Option {i + 1}</span>
                        {a}
                      </button>
                    ))}
                  </div>
                  <Button variant="outline" size="sm" onClick={generateAccroches} className="rounded-full gap-1.5 mt-3">
                    <RefreshCw className="h-3.5 w-3.5" />
                    3 nouvelles accroches
                  </Button>
                </>
              )}
            </div>
          )}

          {/* Step 3: Premier jet */}
          {step === 3 && (
            <div className="animate-fade-in">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="h-4 w-4 text-primary" />
                <h3 className="font-display text-base font-bold">Premier jet</h3>
              </div>
              <p className="text-sm text-muted-foreground mb-4">Un premier jet complet basé sur ta structure et ton accroche. Tu pourras le modifier à l'étape suivante.</p>
              {loadingDraft ? (
                <LoadingDots text="Je rédige ton contenu..." />
              ) : draft ? (
                <>
                  <div className="bg-rose-pale rounded-xl p-4 text-sm leading-relaxed whitespace-pre-wrap">{draft}</div>
                  <Button variant="outline" size="sm" onClick={generateDraft} className="rounded-full gap-1.5 mt-3">
                    <RefreshCw className="h-3.5 w-3.5" />
                    Régénérer
                  </Button>
                </>
              ) : (
                <div className="text-center py-8">
                  <Button onClick={generateDraft} className="rounded-full gap-2">
                    <Sparkles className="h-4 w-4" />
                    Générer le premier jet
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Step 4: Édition */}
          {step === 4 && (
            <div className="animate-fade-in">
              <h3 className="font-display text-base font-bold mb-3">À toi de jouer</h3>
              <p className="text-sm text-muted-foreground mb-4">Ajuste le texte à ta sauce. Change les mots, réorganise, ajoute ta touche perso.</p>
              <Textarea
                value={editedContent}
                onChange={(e) => setEditedContent(e.target.value)}
                className="rounded-xl min-h-[300px] text-sm leading-relaxed"
                placeholder="Ton contenu apparaîtra ici..."
              />
              <div className="flex gap-2 mt-3">
                <Button variant="outline" size="sm" onClick={handleCopy} className="rounded-full gap-1.5">
                  <Copy className="h-3.5 w-3.5" />
                  Copier le texte
                </Button>
                <Button variant="outline" size="sm" onClick={() => setEditedContent(draft)} className="rounded-full gap-1.5">
                  <RefreshCw className="h-3.5 w-3.5" />
                  Revenir au jet initial
                </Button>
              </div>
            </div>
          )}

          {/* Step 5: Checklist */}
          {step === 5 && (
            <div className="animate-fade-in">
              <h3 className="font-display text-base font-bold mb-1">Checklist qualité</h3>
              <p className="text-sm text-muted-foreground mb-4">Avant de publier, vérifie ces points. C'est pas obligatoire, c'est pour t'aider.</p>
              <div className="space-y-3">
                {CHECKLIST_ITEMS.map((item, i) => (
                  <label key={i} className="flex items-start gap-3 cursor-pointer group">
                    <div
                      onClick={() => setChecks(prev => { const n = [...prev]; n[i] = !n[i]; return n; })}
                      className={`mt-0.5 w-5 h-5 rounded flex-shrink-0 border-2 flex items-center justify-center transition-all ${
                        checks[i] ? "bg-primary border-primary" : "border-border group-hover:border-primary/40"
                      }`}
                    >
                      {checks[i] && <Check className="h-3 w-3 text-primary-foreground" />}
                    </div>
                    <span className={`text-sm leading-relaxed transition-colors ${checks[i] ? "text-muted-foreground line-through" : "text-foreground"}`}>{item}</span>
                  </label>
                ))}
              </div>
              <div className="mt-6 rounded-xl bg-rose-pale border-l-4 border-primary p-4">
                <p className="text-sm text-foreground font-medium">
                  {checks.filter(Boolean).length === CHECKLIST_ITEMS.length
                    ? "Ton contenu est prêt. Tu peux être fière de toi !"
                    : `${checks.filter(Boolean).length}/${CHECKLIST_ITEMS.length} points validés. Prends le temps qu'il faut.`
                  }
                </p>
              </div>
              <Button onClick={handleCopy} className="w-full rounded-full mt-4 gap-2">
                <Copy className="h-4 w-4" />
                Copier mon contenu final
              </Button>
            </div>
          )}
        </div>

        {/* Footer nav */}
        <div className="flex items-center justify-between p-5 border-t border-border">
          <Button
            variant="outline"
            onClick={() => step > 1 ? setStep(step - 1) : onClose}
            className="rounded-full gap-1.5"
          >
            <ChevronLeft className="h-4 w-4" />
            {step === 1 ? "Fermer" : "Retour"}
          </Button>
          {step < 5 && (
            <Button
              onClick={() => goToStep(step + 1)}
              className="rounded-full gap-1.5"
            >
              Suivant
              <ChevronRight className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
