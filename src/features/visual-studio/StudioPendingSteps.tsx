// Attente de la réponse du Studio (Loom du 27/11/2026) : ~10 à 25 s pendant
// lesquelles seul « Je lis ta demande… » tournait, et la réponse tombait d'un
// bloc. Le fil montre maintenant les étapes réelles du serveur au fil du
// temps : lecture de la demande, regard sur les images (vision), préparation
// de la proposition, vérifications (`turn/guardrails.ts`). Les durées sont
// approximatives : une étape n'est jamais annoncée finie avant la réponse.
import { useEffect, useState } from "react";
import { Check, Loader2 } from "lucide-react";

export function pendingSteps(withImages: boolean): { label: string; at: number }[] {
  return [
    { label: "Je lis ta demande…", at: 0 },
    ...(withImages ? [{ label: "Je regarde ta photo en détail…", at: 3 }] : []),
    { label: "Je prépare ma proposition…", at: withImages ? 8 : 4 },
    { label: "Je vérifie qu’elle respecte ce que tu veux garder…", at: withImages ? 15 : 10 },
    { label: "Encore quelques secondes, j’y suis presque…", at: 26 },
  ];
}

export function StudioPendingSteps({ withImages }: { withImages: boolean }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const started = Date.now();
    const timer = window.setInterval(() => setElapsed((Date.now() - started) / 1000), 500);
    return () => window.clearInterval(timer);
  }, []);
  const steps = pendingSteps(withImages);
  const reached = steps.filter((step) => elapsed >= step.at);
  return (
    <ul className="space-y-1" aria-live="polite">
      {reached.map((step, index) => {
        const doing = index === reached.length - 1;
        return (
          <li key={step.label} className={doing ? "" : "text-muted-foreground"}>
            {doing
              ? <Loader2 className="h-4 w-4 animate-spin inline mr-2" aria-hidden="true" />
              : <Check className="h-4 w-4 inline mr-2" aria-hidden="true" />}
            {step.label}
          </li>
        );
      })}
    </ul>
  );
}
