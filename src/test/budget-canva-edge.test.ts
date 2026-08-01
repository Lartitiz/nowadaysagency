import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

// Le pont Canva a deux horloges qui doivent s'accorder, dans DEUX runtimes :
//   - le front attend l'edge pendant CANVA_IMPORT_TIMEOUT_MS ;
//   - l'edge attend Canva pendant CANVA_POLL_BUDGET_MS.
// Aucun module ne peut être partagé entre un navigateur et une edge Deno : les
// deux nombres sont forcément écrits deux fois. C'est exactement ainsi qu'ils
// ont divergé — l'edge abandonnait à 60 s pendant que le front patientait
// jusqu'à 120 s, et un import de 70 s échouait alors qu'il suffisait d'attendre.
//
// Ce test est donc le SEUL lien mécanique entre les deux : il les lit dans le
// source et vérifie l'invariant. Modifier l'un sans l'autre fait tomber la CI.

/** Marge pour le reste du travail de l'edge : dépôt du PPTX, URL signée,
 *  lancement de l'import, lecture du design. En dessous, l'edge risque d'être
 *  coupée par le front alors qu'elle travaillait encore. */
const MARGE_MINIMALE_MS = 20000;

/** Au-delà, l'edge abandonne alors que le front aurait volontiers patienté :
 *  c'est le bug d'origine (l'edge lâchait à 60 s, le front attendait 120 s —
 *  une minute de patience jetée). */
const MARGE_MAXIMALE_MS = 40000;

/** Plafond de durée d'une edge function Supabase — on reste franchement en deçà. */
const PLAFOND_PLATEFORME_MS = 140000;

function litConstante(fichierRelatif: string, nom: string): number {
  const source = fs.readFileSync(path.join(RACINE, fichierRelatif), "utf8");
  const m = source.match(new RegExp(`${nom}\\s*=\\s*(\\d+)`));
  expect(m, `constante ${nom} introuvable dans ${fichierRelatif} — a-t-elle été renommée ?`).toBeTruthy();
  return Number(m![1]);
}

describe("les deux horloges du pont Canva", () => {
  const attenteFront = litConstante(
    "src/hooks/use-open-in-canva.ts",
    "CANVA_IMPORT_TIMEOUT_MS",
  );
  const attenteEdge = litConstante(
    "supabase/functions/social-canva-import/index.ts",
    "CANVA_POLL_BUDGET_MS",
  );

  it("le front attend plus longtemps que l'edge, marge comprise", () => {
    expect(
      attenteFront,
      `Le front attend ${attenteFront} ms, l'edge ${attenteEdge} ms. ` +
        `Le front doit laisser à l'edge le temps de finir SON travail (poll + dépôt + import), ` +
        `soit au moins ${MARGE_MINIMALE_MS} ms de marge.`,
    ).toBeGreaterThanOrEqual(attenteEdge + MARGE_MINIMALE_MS);
  });

  it("l'edge ne dépasse pas ce que la plateforme lui accorde", () => {
    expect(attenteEdge).toBeLessThanOrEqual(PLAFOND_PLATEFORME_MS - MARGE_MINIMALE_MS);
  });

  it("l'edge ne gaspille pas la patience du front", () => {
    // Le bug d'origine : 120 s côté front, 60 s côté edge. Un import de 70 s
    // échouait alors qu'il ne restait qu'à attendre une minute de plus.
    expect(
      attenteFront - attenteEdge,
      `L'edge abandonne ${attenteFront - attenteEdge} ms avant que le front ne se lasse. ` +
        `Au-delà de ${MARGE_MAXIMALE_MS} ms, c'est de la patience jetée : un import qui ` +
        `aurait abouti échoue.`,
    ).toBeLessThanOrEqual(MARGE_MAXIMALE_MS);
  });
});
