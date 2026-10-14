// Lot 7 reels : choix de l'angle d'attaque (hook) avant la génération.
// Sorti à l'identique de CreerUnifie.tsx (lot F, docs/robustesse/gros-fichiers.md, fiche 1).
// La page appelle ce hook à l'endroit où vivaient ses états : `hooksLoading` est
// lu tôt (garde de sortie) et `selectedReelHook` est passé à useDoGenerate, alors
// que `doGenerate` et `questions` n'existent que plus bas dans la page. Ce dont
// les actions ont besoin leur est donc passé au moment de l'appel.
import { useRef, useState } from "react";
import { invokeWithTimeout } from "@/lib/invoke-with-timeout";
import type { ReelHook } from "@/components/creer/HookSelectionStep";

type FetchContext = {
  questions: { id: string; question: string }[];
  ideaText: string;
  objective: string | null;
  workspaceId: string | null | undefined;
  userId: string | undefined;
};

type GenerateContext = {
  generating: boolean;
  streaming: boolean;
  setStep: (step: "result") => void;
  doGenerate: (answers: Record<string, string>, hook?: ReelHook) => Promise<unknown>;
};

export function useReelHooks() {
  // Les hooks ne sont PAS persistés (safeStep retombe sur "format" au reload) ;
  // le hook choisi est gardé en state pour que « Régénérer » réécrive sur le
  // MÊME angle.
  const [reelHooks, setReelHooks] = useState<ReelHook[]>([]);
  const [hooksLoading, setHooksLoading] = useState(false);
  const [hooksRefreshing, setHooksRefreshing] = useState(false);
  const [hooksError, setHooksError] = useState<string | null>(null);
  const [selectedReelHook, setSelectedReelHook] = useState<ReelHook | null>(null);
  const pendingReelAnswersRef = useRef<Record<string, string>>({});

  // ─── Lot 7 reels : étape de choix du hook ───
  // Appel GRATUIT (step "hooks" hors BILLED_STEPS côté edge). Jamais bloquant :
  // en cas d'échec, l'écran propose « Continuer sans choisir » (= hook auto,
  // comportement historique).
  const fetchReelHooks = async (ans: Record<string, string>, excludeHooks: string[] | undefined, { questions, ideaText, objective, workspaceId, userId }: FetchContext) => {
    const isRefresh = !!excludeHooks?.length;
    if (isRefresh) setHooksRefreshing(true);
    else { setHooksLoading(true); setReelHooks([]); }
    setHooksError(null);
    try {
      // Ré-indexation par le TEXTE de la question (même logique que doGenerate) :
      // l'edge reçoit "vraie question → réponse", pas "q_0 → réponse".
      const textById = new Map(questions.map((q) => [q.id, q.question]));
      const answersArray = Object.entries(ans)
        .filter(([, v]) => v && v.trim())
        .map(([id, v]) => ({ question: textById.get(id) || id, answer: v }));
      const { data, error: fnError } = await invokeWithTimeout("creative-flow", {
        body: {
          step: "hooks",
          contentType: "reel",
          context: ideaText,
          objective: objective || null,
          face_cam: "oui",
          answers: answersArray.length > 0 ? answersArray : null,
          workspace_id: workspaceId && workspaceId !== userId ? workspaceId : null,
          ...(excludeHooks?.length ? { exclude_hooks: excludeHooks.slice(0, 12) } : {}),
        },
      }, 60000);
      if (fnError) throw fnError;
      const hooks = Array.isArray((data as any)?.hooks) ? (data as any).hooks : [];
      if (hooks.length === 0) throw new Error("empty");
      setReelHooks(hooks.slice(0, 3));
    } catch (e) {
      console.error("[CreerUnifie] fetchReelHooks failed:", e);
      // Un refresh raté garde les cartes précédentes (toujours utilisables) —
      // mais il DOIT le dire. Sans message, l'écran affichait des angles et des
      // boutons qui semblaient ne rien faire, sans la moindre explication
      // (vécu live 03/08, sujet « brader mes savons »).
      const raw = (e as any)?.message;
      // "empty" = charge vide renvoyée en 200 par une edge pas encore
      // redéployée : message technique, jamais montré tel quel.
      const detail = typeof raw === "string" && raw.trim() && raw !== "empty" ? raw.trim() : null;
      setHooksError(
        isRefresh
          ? detail
            ? `Pas de nouveaux angles : ${detail.charAt(0).toLowerCase()}${detail.slice(1)}`
            : "Je n'ai pas réussi à trouver 3 autres angles. Ceux-ci restent valables."
          : detail || "Je n'ai pas réussi à préparer les angles d'attaque.",
      );
    } finally {
      setHooksLoading(false);
      setHooksRefreshing(false);
    }
  };

  const handleHookSelect = async (hook: ReelHook, { generating, streaming, setStep, doGenerate }: GenerateContext) => {
    if (generating || streaming) return;
    setSelectedReelHook(hook);
    setStep("result");
    await doGenerate(pendingReelAnswersRef.current, hook);
  };

  const handleHookSkip = async ({ generating, streaming, setStep, doGenerate }: GenerateContext) => {
    if (generating || streaming) return;
    setSelectedReelHook(null);
    setStep("result");
    await doGenerate(pendingReelAnswersRef.current);
  };

  return {
    reelHooks, hooksLoading, hooksRefreshing, hooksError,
    selectedReelHook, setSelectedReelHook, pendingReelAnswersRef,
    fetchReelHooks, handleHookSelect, handleHookSkip,
  };
}
