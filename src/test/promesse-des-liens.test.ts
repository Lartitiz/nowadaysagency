import { describe, it, expect } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  liensQuiMentent,
  releveLesCliquables,
  FAMILLES,
} from "./promesse-des-liens.scan";

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

// Garde du 01/08/2026. Sept boutons affichant « Passer au Premium — 39 €/mois »
// pointaient sur /mon-plan, qui est le plan de COMMUNICATION (éditorial) : on
// cliquait pour payer, on atterrissait sur son calendrier de contenus. Aucun
// signal technique ne pouvait le voir — la page s'affichait vite, sans erreur,
// sans souci d'accessibilité. Elle n'était juste pas celle qu'on promettait.

describe("le lien tient sa promesse", () => {
  it("aucun bouton n'emmène ailleurs que là où son texte l'annonce", () => {
    const menteurs = liensQuiMentent(RACINE);
    const rapport = menteurs
      .map(
        (v) =>
          `  ${v.fichier}:${v.ligne}\n` +
          `    « ${v.label} »\n` +
          `    emmène sur ${v.destination}, or un libellé « ${v.famille} » doit mener à ${v.attendu.join(" ou ")}`,
      )
      .join("\n\n");
    expect(menteurs, `Lien(s) qui ne tiennent pas leur promesse :\n\n${rapport}\n`).toEqual([]);
  });

  // Une garde qui ne regarde plus rien passe au vert pour de mauvaises raisons.
  // Ces deux tests vérifient que la sonde a toujours des yeux.
  it("relève bien les éléments cliquables de l'app", () => {
    expect(releveLesCliquables(RACINE).length).toBeGreaterThan(80);
  });

  it("chaque famille surveille au moins un bouton réel", () => {
    const cliquables = releveLesCliquables(RACINE);
    for (const { famille, libelle } of FAMILLES) {
      const concernes = cliquables.filter((c) => libelle.test(c.label));
      expect(concernes.length, `aucun bouton ne relève de la famille « ${famille} »`).toBeGreaterThan(0);
    }
  });
});
