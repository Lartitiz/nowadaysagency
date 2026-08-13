import { useEffect, useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";

/* ── Écran d'attente de la fiche de marque (fin d'onboarding) ────────────────
   Remplace le spinner muet « Je finis de préparer ta marque… » : jusqu'à 79 s
   d'attente mesurées (audit 13/08) sans aucun signe de vie = le moment le plus
   fragile de l'activation. On montre des étapes qui s'égrènent au fil du temps.

   Honnêteté du libellé : l'enrichissement est UN seul appel IA — les étapes ne
   tracent pas un vrai pipeline, elles décrivent ce que la fiche contiendra
   (positionnement, ton, cible, piliers). C'est un rythme d'attente, pas une
   télémétrie : aucune étape ne prétend « terminé » sur un travail vérifiable.
   La dernière ligne reste volontairement active tant que la fiche n'est pas là.
   ── */

const STEPS: { label: string; doneAtSec: number }[] = [
  { label: "Je relis tout ce que tu m'as partagé", doneAtSec: 8 },
  { label: "Ton positionnement et ta mission", doneAtSec: 22 },
  { label: "Ton ton et ta voix", doneAtSec: 38 },
  { label: "Le portrait de ta cliente idéale", doneAtSec: 55 },
  // Jamais « done » par minuterie : c'est la fiche qui clôt l'attente.
  { label: "Tes piliers de contenu et tes premières idées", doneAtSec: Infinity },
];

export default function BrandEnrichmentWait() {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const currentIdx = STEPS.findIndex((s) => elapsed < s.doneAtSec);

  return (
    <div className="rounded-2xl border border-border bg-card p-8 space-y-6 mt-8 max-w-md mx-auto">
      <div className="text-center space-y-2">
        <h2 className="text-xl font-semibold">Je finis de préparer ta marque…</h2>
        <p className="text-sm text-muted-foreground">
          Encore quelques secondes : tu vas pouvoir relire et valider ce que j'ai
          capté avant de créer ton premier contenu.
        </p>
      </div>
      <ul className="space-y-3 text-left" aria-live="polite">
        {STEPS.map((step, i) => {
          const done = i < currentIdx;
          const active = i === currentIdx;
          return (
            <li
              key={step.label}
              className={`flex items-center gap-3 text-sm transition-opacity duration-500 ${
                done ? "text-muted-foreground" : active ? "text-foreground font-medium" : "text-muted-foreground/50"
              }`}
            >
              {done ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" strokeWidth={2} />
              ) : active ? (
                <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
              ) : (
                <span className="h-4 w-4 shrink-0 rounded-full border border-border" />
              )}
              <span>{step.label}</span>
            </li>
          );
        })}
      </ul>
      {elapsed > 45 && (
        <p className="text-xs text-muted-foreground text-center transition-opacity duration-500">
          C'est un peu plus long que d'habitude — j'y suis presque.
        </p>
      )}
    </div>
  );
}
