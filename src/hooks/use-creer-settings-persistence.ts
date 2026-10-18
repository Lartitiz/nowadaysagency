import { useEffect, useRef } from "react";

// Chantier J (18/10/2026) : réglages de /creer qui ne survivaient pas au
// rechargement (photo du post, lien et tableau Pinterest, « Rédaction la plus
// soignée », angle choisi du reel…). Ils partent dans la même copie de secours
// que `useAutoPersistFlow` (use-creer-flow-persistence.ts), à côté de ses clés,
// et reviennent une fois à l'ouverture de la page.
// ⚠️ Un nouveau réglage choisi par l'utilisatrice = une clé ici, sinon il se
// perd en silence au rechargement (src/test/creer-reglages-rechargement.test.tsx).

export const CREER_SETTINGS_KEYS = [
  "photoMode", "pinterestData", "qualityMax", "coverIllustration", "explicitTextFirstMix", "photoDumpEnabled",
  "existingCalendarContent", "selectedReelHook", "lastConfirmedStructure", "lastScenarioOrigin", "lastNarrativeThread",
] as const;
export type CreerSettingKey = typeof CREER_SETTINGS_KEYS[number];
export type CreerSettings = Partial<Record<CreerSettingKey, unknown>>;

export function pickCreerSettings(saved: Record<string, unknown> | null | undefined): CreerSettings {
  const out: CreerSettings = {};
  if (!saved) return out;
  for (const key of CREER_SETTINGS_KEYS) if (saved[key] !== undefined && saved[key] !== null) out[key] = saved[key];
  return out;
}

export function useCreerSettingsPersistence<S>({ ps, conflictPending, values, setters, saveFlowState }: {
  ps: object | null | undefined;
  conflictPending: boolean;
  values: Record<CreerSettingKey, unknown>;
  setters: Record<CreerSettingKey, (value: any) => void>;
  saveFlowState: (state: S) => void;
}) {
  const restored = useRef(false);
  // Le rendu qui restaure porte encore les valeurs par défaut : ne pas les écrire.
  const skipNext = useRef(false);
  useEffect(() => {
    if (restored.current || conflictPending) return;
    restored.current = true;
    const saved = pickCreerSettings(ps as Record<string, unknown>);
    skipNext.current = Object.keys(saved).length > 0;
    for (const key of Object.keys(saved) as CreerSettingKey[]) setters[key](saved[key]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conflictPending]);

  const signature = JSON.stringify(values);
  useEffect(() => {
    if (conflictPending || !restored.current) return;
    if (skipNext.current) { skipNext.current = false; return; }
    // null et pas undefined : une clé absente garderait l'ancienne valeur enregistrée.
    const state: Record<string, unknown> = {};
    for (const key of CREER_SETTINGS_KEYS) state[key] = values[key] ?? null;
    saveFlowState(state as S);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conflictPending, signature]);
}
