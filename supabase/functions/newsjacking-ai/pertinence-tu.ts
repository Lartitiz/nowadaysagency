// Le « 💡 » de chaque actu (champ `pertinence`) parle À l'utilisatrice : l'outil
// la tutoie partout, quel que soit son réglage tu / vous pour SON public.
// QA du 12/11/2026 (compte d'une marque qui vouvoie) : « les biens que vous
// achetez… votre expertise », alors que le schéma demande déjà le « tu » et que
// l'angle juste en dessous tutoie. Une consigne de prompt perd contre la règle
// de vouvoiement de la fiche de marque : garde par le code, comme les questions
// de creative-flow (#1879). Aucun appel si tout est déjà au « tu ».

import { enforceAudienceAddressInFields } from "../_shared/audience-address-fields.ts";
import { applyAudienceAddressPass } from "../_shared/audience-address-pass.ts";
import type { AudienceAddressPass } from "../_shared/audience-address.ts";

export const PERTINENCE_FIELDS = ["actus[].pertinence"];

export async function tutoyerPertinences(parsed: unknown, pass: AudienceAddressPass = applyAudienceAddressPass): Promise<void> {
  try {
    await enforceAudienceAddressInFields(parsed, PERTINENCE_FIELDS, "tu", {
      pass,
      abortTimeoutMs: 20_000,
      scope: "newsjacking-ai:pertinence",
      logger: (m) => console.log(`[newsjacking pertinence] ${m}`),
    });
  } catch (e) {
    // Condiment : en cas d'échec, les actus partent telles quelles.
    console.warn("[newsjacking pertinence] passe tu/vous en échec", e);
  }
}
