import WaitingScreen from "@/components/creer/WaitingScreen";
import { initialRows, stepPhotos, type ContextStepPhoto } from "@/features/creer/photo-context-step";

/**
 * Loader de l'étape "structure" des carrousels photo/mix.
 *
 * Remplace l'ancien spinner figé + texte "ça prend quelques secondes" (qui
 * mentait : l'IA fait une analyse visuelle de toutes les photos ; mesuré le
 * 09/10/2026 à 55-64 s pour 3 photos et 10 slides).
 *
 * Apporte :
 *  - une barre de progression animée (même ressenti que l'étape génération),
 *  - des messages qui tournent et décrivent ce qui se passe vraiment,
 *  - une attente honnête + l'annonce qu'il y a 2 étapes (structure → génération).
 */

const MESSAGES_PHOTOS = [
  "Je regarde chacune de tes photos…",
  "Je repère ce qu'elles racontent…",
  "Je construis le fil narratif slide par slide…",
  "J'ordonne tes idées pour que ça accroche…",
];

const MESSAGES_SANS_PHOTOS = [
  "Je structure ton sujet en slides…",
  "Je construis le fil narratif…",
  "J'ordonne tes idées pour que ça accroche…",
];

// Un peu après la relance serveur du plan (80 s, carousel-ai/structure-hedge.ts).
const SLOW_AFTER_S = 85;

/**
 * 26/11/2026 (test filmé de Laetitia, maquette validée) : la première minute ne
 * montrait qu'une phrase et une barre. Le serveur ne dit rien pendant le plan,
 * donc on n'invente pas d'étapes : on montre ce qu'on a vraiment en main, les
 * photos telles qu'elles sont comprises (avec leur avant / après) et les
 * réponses données aux questions.
 */
const ROLE_LABEL = { before: "Avant", after: "Après" } as const;

export default function CarouselStructureLoader({ hasPhotos = false, photos = [], answers = [] }: { hasPhotos?: boolean; photos?: ContextStepPhoto[]; answers?: string[] }) {
  const chosen = stepPhotos(photos);
  const rows = initialRows(photos);
  const understood = chosen.map((p, i) => ({ preview: p.preview, text: rows[i]?.text || "", role: rows[i]?.role || null })).filter((p) => p.preview);
  const kept = answers.map((a) => a.trim()).filter(Boolean).slice(0, 3);
  const rich = understood.length > 0 || kept.length > 0;
  const messages = hasPhotos ? MESSAGES_PHOTOS : MESSAGES_SANS_PHOTOS;

  return (
    <WaitingScreen
      className={`${rich ? "py-8 max-w-2xl" : "py-16 max-w-md"} text-center space-y-5 animate-fade-in mx-auto`}
      badge={
        <span className="inline-block text-2xs font-semibold uppercase tracking-wide text-primary/70 bg-primary/10 rounded-full px-3 py-1">
          D'abord le plan des slides
        </span>
      }
      rotation={{ messages, everyMs: 3500 }}
      // Barre calée sur ~1 min (constante 25 s) : le plan dure 55-64 s avec 3 photos
      // et 10 slides (mesure du 09/10/2026). À 14 s, elle restait figée à 90 %.
      tauSeconds={25}
      ceiling={90}
      // Départ du chrono partagé avec l'écran de rédaction (« Déjà X s » total).
      shareClock
      // Le serveur relance un second plan identique à 80 s (structure-hedge.ts).
      notes={[{ afterSeconds: SLOW_AFTER_S, text: "C'est plus long que d'habitude : je relance la structure en parallèle, encore une minute environ." }]}
      // Depuis #568, la structure est auto-validée (plus d'écran de review) :
      // ne rien promettre que le flux ne fait plus.
      hint={hasPhotos
        ? "J'analyse tes photos une par une (environ une minute), puis je rédige les slides. Compte 3 à 4 minutes en tout pour ton carrousel."
        : "Je prépare le plan (environ une minute), puis je rédige les slides. Compte 3 à 4 minutes en tout pour ton carrousel."}
      elapsedTestId="structure-elapsed"
    >
      {rich && (
        <div className="grid gap-5 text-left sm:grid-cols-2" data-testid="structure-material">
          {understood.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">Tes photos, comme je les ai comprises</p>
              <ul className="space-y-2">
                {understood.map((p, i) => (
                  <li key={i} className="flex gap-3">
                    <img src={p.preview} alt="" className="h-14 w-14 shrink-0 rounded-lg object-cover" />
                    <div className="min-w-0 text-xs leading-snug text-foreground">
                      <p className="line-clamp-3">{p.text || `Photo ${i + 1}`}</p>
                      {p.role && <span className="mt-1 inline-block rounded-full bg-primary/10 px-2 py-0.5 text-2xs font-medium text-primary">{ROLE_LABEL[p.role]}</span>}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {kept.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">Ce que je retiens de tes réponses</p>
              <ul className="space-y-2">
                {kept.map((a, i) => (
                  <li key={i} className="border-l-2 border-primary/25 pl-3 text-xs leading-snug text-foreground line-clamp-4">« {a} »</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </WaitingScreen>
  );
}
