import { Check, Loader2 } from "lucide-react";

/** Script du reel tel qu'écrit, avant relecture (évènement SSE `draft` de creative-flow). */
export interface ReelDraft {
  /** Accroche : celle choisie par la cliente dès le départ, puis celle du brouillon. */
  hook: string;
  sections: { timing?: string; texte_parle?: string; texte_overlay?: string }[];
  /** Texte parlé en entier, pendant qu'il s'écrit (avant les scènes, 27/11/2026). */
  monologue?: string;
}

const STEPS = ["Accroche", "Script scène par scène", "Relecture"] as const;

/**
 * REEL EN BROUILLON (13/11/2026). Laetitia : 1 à 2 minutes devant un
 * téléphone vide, « au temps perçu, ça fait trop long ». Comme le carrousel :
 * l'accroche choisie s'affiche tout de suite dans le téléphone, puis les scènes
 * arrivent dès que le script est écrit, grisées et signalées « Brouillon » pendant
 * la relecture finale. Le script relu les remplace.
 */
export function ReelDraftPreview({ draft, stage }: { draft: ReelDraft; stage?: string | null }) {
  const sections = draft.sections.filter((s) => (s.texte_parle || s.texte_overlay || "").trim());
  const hasScript = sections.length > 0;
  const monologue = (draft.monologue || "").trim();
  // Depuis le 27/11/2026 les scènes arrivent PENDANT l'écriture : la relecture
  // ne commence qu'à l'étape « correcting » envoyée par le serveur.
  const reviewing = stage === "correcting";
  const current = reviewing ? 2 : hasScript || monologue || draft.hook ? 1 : 0;
  // L'accroche n'est cochée que quand elle existe (choisie, écrite, ou portée
  // par la 1re scène) : le modèle écrit tout le texte parlé AVANT l'accroche,
  // elle était donc cochée ~3 s trop tôt (vu en ligne le 27/11/2026).
  const hookDone = !!draft.hook || hasScript;
  const done = (i: number) => i < current && (i !== 0 || hookDone);
  const message = reviewing
    ? "Je relis ton script pour gommer les tournures d'IA…"
    : monologue && !hasScript
    ? "J'écris ton texte, puis je le découpe en scènes…"
    : "J'écris ton script scène par scène…";
  const hookShown = draft.hook || sections[0]?.texte_overlay || "";

  return (
    <div className="space-y-4 animate-fade-in" data-testid="reel-draft-preview">
      <div className="rounded-xl border border-border bg-card px-4 py-3 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" aria-hidden="true" />
          <p className="text-sm font-medium text-foreground min-w-0" role="status" aria-live="polite">{message}</p>
          {(hasScript || monologue) && (
            <span className="ml-auto text-2xs font-medium rounded-full px-2.5 py-0.5 bg-amber-100 text-amber-900">
              Brouillon, sera relu
            </span>
          )}
        </div>
        <ol className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground" data-reel-draft-steps>
          {STEPS.map((label, i) => (
            <li key={label} className={`flex items-center gap-1 ${i === current ? "text-foreground font-medium" : ""}`}>
              {done(i) ? <Check className="h-3.5 w-3.5 text-primary" aria-hidden="true" /> : <span className="inline-block h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />}
              {label}
            </li>
          ))}
        </ol>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 items-center sm:items-start">
        <div
          className="w-32 shrink-0 aspect-[9/16] rounded-2xl bg-primary/10 border border-border flex items-center justify-center p-3 overflow-hidden"
          aria-label="Aperçu de l'accroche du reel"
          data-testid="reel-draft-phone"
        >
          {hookShown ? (
            <p className="text-sm font-semibold leading-snug text-center text-foreground line-clamp-[8] animate-fade-in">{hookShown}</p>
          ) : (
            <div className="w-full space-y-2" aria-hidden="true">
              <div className="h-2.5 rounded bg-secondary animate-pulse" />
              <div className="h-2.5 rounded bg-secondary animate-pulse w-3/4 mx-auto" />
            </div>
          )}
        </div>

        {hasScript ? (
          <ol className="flex-1 min-w-0 w-full space-y-2" aria-label="Scènes du reel en brouillon" data-testid="reel-draft-scenes">
            {sections.map((s, i) => (
              <li
                key={i}
                className="rounded-lg border border-border bg-secondary/30 px-3 py-2 text-muted-foreground animate-fade-in"
                style={{ animationDelay: `${i * 180}ms`, animationFillMode: "backwards" }}
              >
                <span className="block text-2xs text-muted-foreground/70 mb-0.5">
                  Scène {i + 1}{s.timing ? ` · ${s.timing}` : ""}
                </span>
                {s.texte_parle && <p className="text-xs leading-snug">{s.texte_parle}</p>}
                {s.texte_overlay && <p className="text-2xs mt-1 text-muted-foreground/80">À l'écran : {s.texte_overlay}</p>}
              </li>
            ))}
          </ol>
        ) : monologue ? (
          <div className="flex-1 min-w-0 w-full rounded-lg border border-border bg-secondary/30 px-3 py-2 text-muted-foreground" data-testid="reel-draft-monologue">
            <span className="block text-2xs text-muted-foreground/70 mb-0.5">Ton texte parlé, en cours d'écriture</span>
            <p className="text-xs leading-snug whitespace-pre-line">{monologue}<span className="inline-block w-1.5 h-3 ml-0.5 align-middle bg-primary/60 animate-pulse" aria-hidden="true" /></p>
          </div>
        ) : (
          <div className="flex-1 min-w-0 w-full space-y-2" aria-hidden="true" data-testid="reel-draft-skeleton">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="rounded-lg border border-dashed border-border px-3 py-2 space-y-1.5">
                <div className="h-2 w-16 rounded bg-secondary animate-pulse" />
                <div className="h-2.5 rounded bg-secondary animate-pulse" style={{ width: `${90 - i * 12}%` }} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** Accroche choisie par la cliente (objet du tool `proposer_hooks` ou texte), pour l'afficher dès le départ. */
export function chosenHookText(selectedHook: unknown): string {
  if (typeof selectedHook === "string") return selectedHook.trim();
  const text = (selectedHook as { text?: unknown } | null)?.text;
  return typeof text === "string" ? text.trim() : "";
}

/**
 * Brouillon suivant (27/11/2026) : le dernier envoi, juste avant la relecture,
 * n'a ni accroche ni texte parlé. Ce qui est déjà affiché reste : l'accroche
 * ne disparaît pas du téléphone et les scènes ne reculent jamais.
 */
export function mergeReelDraft(prev: ReelDraft | null, next: Partial<ReelDraft> & { sections: ReelDraft["sections"] }, chosenHook = ""): ReelDraft {
  const sections = next.sections.length >= (prev?.sections.length ?? 0) ? next.sections : prev!.sections;
  return {
    hook: chosenHook || next.hook || prev?.hook || "",
    sections,
    monologue: (typeof next.monologue === "string" && next.monologue) || prev?.monologue || "",
  };
}
