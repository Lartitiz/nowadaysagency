import { useState } from "react";
import { Button } from "@/components/ui/button";
import { TextareaWithVoice as Textarea } from "@/components/ui/textarea-with-voice";
import { Sparkles, Loader2, ChevronLeft, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

const BIO_STRUCTURES = [
  {
    id: "directe",
    name: "La Directe",
    emoji: "🎯",
    description: "Hook percutant + qui tu es + CTA. Droit au but.",
    perfect_for: "Prestataires de services, freelances",
    example_format: "Ligne 1 : hook / ce que tu fais\nLigne 2 : pour qui\nLigne 3 : preuve ou personnalité\nLigne 4 : CTA",
  },
  {
    id: "stratege",
    name: "La Stratège",
    emoji: "♟️",
    description: "Problème de ta cible + ta solution + CTA. Tu montres que tu comprends.",
    perfect_for: "Coachs, consultantes, formatrices",
    example_format: "Ligne 1 : problème de ta cible\nLigne 2 : ta solution\nLigne 3 : crédibilité\nLigne 4 : CTA",
  },
  {
    id: "engagee",
    name: "L'Engagée",
    emoji: "✊",
    description: "Ta mission + ta personnalité + CTA. Pour celles qui ont un positionnement militant.",
    perfect_for: "Marques engagées, militantes, valeurs fortes",
    example_format: "Ligne 1 : ta mission / ton combat\nLigne 2 : comment tu agis\nLigne 3 : ta touche perso\nLigne 4 : CTA",
  },
  {
    id: "prouveuse",
    name: "La Prouveuse",
    emoji: "📊",
    description: "Résultat concret + méthode + CTA. Les chiffres parlent.",
    perfect_for: "Celles qui ont des résultats mesurables",
    example_format: "Ligne 1 : résultat clé chiffré\nLigne 2 : comment (ta méthode)\nLigne 3 : crédibilité ou personnalité\nLigne 4 : CTA",
  },
  {
    id: "storytelleuse",
    name: "La Storytelleuse",
    emoji: "📖",
    description: "Mini-histoire en 4 lignes. Ta personnalité EST le produit.",
    perfect_for: "Profils incarnés, artistes, créatrices",
    example_format: "Ligne 1 : mini-récit (d'où tu viens)\nLigne 2 : ce que tu fais maintenant\nLigne 3 : ton style unique\nLigne 4 : CTA",
  },
  {
    id: "convertisseuse",
    name: "La Convertisseuse",
    emoji: "🚀",
    description: "Micro-landing page. Offre + bénéfice + urgence + CTA. Pour les lancements.",
    perfect_for: "Lancements, offres limitées, promos",
    example_format: "Ligne 1 : offre spécifique\nLigne 2 : bénéfice clé\nLigne 3 : urgence ou preuve sociale\nLigne 4 : CTA direct",
  },
];

const DIFF_ANGLES = [
  { id: "parcours", emoji: "🎓", label: "Mon parcours / expertise", prompt: "Résume ton parcours en 1 phrase (d'où tu viens, ce qui t'a amenée là)" },
  { id: "valeurs", emoji: "🌱", label: "Mes valeurs / engagements", prompt: "C'est quoi LA valeur pour laquelle tu te bats ?" },
  { id: "methode", emoji: "🛠️", label: "Ma méthode / approche unique", prompt: "Qu'est-ce que tu fais différemment des autres dans ton domaine ?" },
  { id: "clients", emoji: "💬", label: "Ce que mes client·es disent", prompt: "C'est quoi LE compliment qu'on te fait le plus souvent ?" },
  { id: "style", emoji: "🎨", label: "Mon style / esthétique", prompt: "Si ta marque était une personne, comment on la décrirait en 3 mots ?" },
];

const CTA_OPTIONS = [
  { id: "freebie", emoji: "📩", label: "Télécharger un freebie / ressource gratuite" },
  { id: "rdv", emoji: "📞", label: "Prendre RDV / appel découverte" },
  { id: "boutique", emoji: "🛍️", label: "Voir ma boutique / mes offres" },
  { id: "newsletter", emoji: "📰", label: "S'inscrire à ma newsletter" },
  { id: "dm", emoji: "💬", label: "M'envoyer un DM" },
  { id: "site", emoji: "🔗", label: "Visiter mon site" },
];

type Step = "structure-choice" | "differentiation" | "cta";

interface BioGeneratorViewProps {
  bioStructure: string;
  setBioStructure: (v: string) => void;
  diffAngle: string;
  setDiffAngle: (v: string) => void;
  diffText: string;
  setDiffText: (v: string) => void;
  ctaType: string;
  setCtaType: (v: string) => void;
  ctaText: string;
  setCtaText: (v: string) => void;
  generating: boolean;
  onGenerate: () => void;
  onBack: () => void;
  activityExamples: any;
}

export default function BioGeneratorView({
  bioStructure,
  setBioStructure,
  diffAngle,
  setDiffAngle,
  diffText,
  setDiffText,
  ctaType,
  setCtaType,
  ctaText,
  setCtaText,
  generating,
  onGenerate,
  onBack,
}: BioGeneratorViewProps) {
  const [step, setStep] = useState<Step>("structure-choice");

  return (
    <>
      {/* ═══════════════════════════════════════
         STEP: STRUCTURE CHOICE
         ═══════════════════════════════════════ */}
      {step === "structure-choice" && (
        <div className="space-y-4 animate-fade-in">
          <div className="text-center space-y-2">
            <h2 className="text-lg font-bold">Quelle stratégie pour ta bio ?</h2>
            <p className="text-sm text-muted-foreground">Choisis la structure qui correspond le mieux à ta situation. L'IA adaptera ses propositions.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {BIO_STRUCTURES.map((s) => (
              <button
                key={s.id}
                onClick={() => setBioStructure(s.id)}
                className={cn(
                  "text-left p-4 rounded-xl border-2 transition-all hover:shadow-md",
                  bioStructure === s.id
                    ? "border-primary bg-primary/5 shadow-sm"
                    : "border-border hover:border-primary/40"
                )}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xl">{s.emoji}</span>
                  <span className="font-bold text-sm">{s.name}</span>
                </div>
                <p className="text-xs text-muted-foreground mb-2">{s.description}</p>
                <p className="text-xs text-primary/70">Parfait pour : {s.perfect_for}</p>
              </button>
            ))}
          </div>
          {bioStructure && (
            <div className="bg-muted/50 rounded-lg p-3 text-xs text-muted-foreground">
              <p className="font-medium mb-1">Format :</p>
              <pre className="whitespace-pre-wrap">{BIO_STRUCTURES.find(s => s.id === bioStructure)?.example_format}</pre>
            </div>
          )}
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" className="rounded-pill gap-1" onClick={onBack}>
              ← Retour
            </Button>
            <Button
              className="rounded-pill gap-2 flex-1"
              disabled={!bioStructure}
              onClick={() => setStep("differentiation")}
            >
              Continuer →
            </Button>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════
         STEP: DIFFERENTIATION (question 1)
         ═══════════════════════════════════════ */}
      {step === "differentiation" && (
        <div className="space-y-6 animate-fade-in">
          <div className="rounded-2xl border border-border bg-card p-6 space-y-5">
            <div className="text-center space-y-1">
              <h2 className="font-display text-lg font-bold text-foreground">Qu'est-ce qui te différencie concrètement ?</h2>
              <p className="text-xs text-muted-foreground">Pas ta mission (ça j'ai déjà). Plutôt ta manière de faire, ton parcours atypique, tes valeurs non-négociables...</p>
              <div className="flex justify-center gap-1.5 mt-2">
                <div className="h-1.5 w-8 rounded-full bg-primary" />
                <div className="h-1.5 w-8 rounded-full bg-muted" />
              </div>
              <p className="text-xs text-muted-foreground">Étape 1/2</p>
            </div>

            {/* Angle chips */}
            <p className="text-xs font-semibold text-foreground">Choisis un angle de différenciation :</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {DIFF_ANGLES.map(a => (
                <button
                  key={a.id}
                  onClick={() => setDiffAngle(a.id)}
                  className={`text-left px-4 py-3 rounded-xl border transition-all text-sm ${
                    diffAngle === a.id
                      ? "border-primary bg-primary/5 text-foreground font-medium"
                      : "border-border bg-card text-muted-foreground hover:border-primary/40"
                  }`}
                >
                  {a.emoji} {a.label}
                </button>
              ))}
            </div>

            {/* Context-aware prompt */}
            {diffAngle && (
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">
                  {DIFF_ANGLES.find(a => a.id === diffAngle)?.prompt}
                </p>
                <Textarea
                  value={diffText}
                  onChange={e => setDiffText(e.target.value)}
                  placeholder="Ex: J'enseigne la com' en écoles de mode, j'ai cofondé un éco-lieu, et je refuse le marketing manipulatoire"
                  className="min-h-[100px]"
                />
              </div>
            )}

            <div className="flex justify-between pt-2">
              <Button variant="ghost" size="sm" className="rounded-pill gap-1" onClick={() => setStep("structure-choice")}>
                <ChevronLeft className="h-4 w-4" /> Précédent
              </Button>
              <Button size="sm" className="rounded-pill gap-1" onClick={() => setStep("cta")} disabled={!diffAngle}>
                Suivant <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════
         STEP: CTA (question 2)
         ═══════════════════════════════════════ */}
      {step === "cta" && (
        <div className="space-y-6 animate-fade-in">
          <div className="rounded-2xl border border-border bg-card p-6 space-y-5">
            <div className="text-center space-y-1">
              <h2 className="font-display text-lg font-bold text-foreground">Qu'est-ce que tu veux que les gens FASSENT ?</h2>
              <p className="text-xs text-muted-foreground">Après avoir lu ta bio, tu veux qu'ils…</p>
              <div className="flex justify-center gap-1.5 mt-2">
                <div className="h-1.5 w-8 rounded-full bg-primary" />
                <div className="h-1.5 w-8 rounded-full bg-primary" />
              </div>
              <p className="text-xs text-muted-foreground">Étape 2/2</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {CTA_OPTIONS.map(o => (
                <button
                  key={o.id}
                  onClick={() => setCtaType(o.id)}
                  className={`text-left px-4 py-3 rounded-xl border transition-all text-sm ${
                    ctaType === o.id
                      ? "border-primary bg-primary/5 text-foreground font-medium"
                      : "border-border bg-card text-muted-foreground hover:border-primary/40"
                  }`}
                >
                  {o.emoji} {o.label}
                </button>
              ))}
            </div>

            {(ctaType === "freebie" || ctaType === "newsletter") && (
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">
                  {ctaType === "freebie" ? "C'est quoi le nom de ta ressource gratuite ?" : "C'est quoi le nom de ta newsletter ?"}
                </p>
                <Textarea
                  value={ctaText}
                  onChange={e => setCtaText(e.target.value)}
                  placeholder={ctaType === "freebie" ? "Ex: Mini-formation gratuite" : "Ex: La Lettre du Lundi"}
                  className="min-h-[60px]"
                />
              </div>
            )}

            <div className="flex justify-between pt-2">
              <Button variant="ghost" size="sm" className="rounded-pill gap-1" onClick={() => setStep("differentiation")}>
                <ChevronLeft className="h-4 w-4" /> Précédent
              </Button>
              <Button onClick={onGenerate} disabled={generating || !ctaType} className="rounded-pill gap-2">
                {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                Générer ma bio
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
