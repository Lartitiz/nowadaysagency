/**
 * `test` de la visite qui RANGE derrière lui sur le compte de référence (Camille).
 *
 * Pourquoi : dès qu'un parcours passe par /creer, l'app range toute seule un
 * brouillon dans « Mes idées » (table saved_ideas). Une spec qui ne retire pas
 * ses lignes en laisse donc à chaque passage : le 27/11/2026, Camille en avait
 * plus de 1000, la lecture des idées était coupée par la base sur téléphone et
 * le panneau du calendrier montrait trois fois la même fiche de test.
 *
 * Usage : dans une spec, remplacer
 *   import { test, expect } from "@playwright/test";
 * par
 *   import { test, expect } from "./test-propre";
 * Rien d'autre à écrire. À la fin de CHAQUE test, réussi ou non, les lignes que
 * ce test a créées sont supprimées.
 *
 * Règle inchangée (cf. nettoyage-camille.ts) : on ne supprime que des
 * identifiants vus passer pendant le test, jamais par titre. Le ménage ne fait
 * jamais échouer un test : il imprime une ligne 🧹 qui se lit.
 */
import { test as base } from "@playwright/test";
import { supprimeLignesCreees, traceurDeCreations } from "./nettoyage-camille";

export * from "@playwright/test";

export const test = base.extend<{ menageCamille: void }>({
  menageCamille: [
    async ({ context }, use, testInfo) => {
      const traceur = traceurDeCreations();
      traceur.branche(context);
      await use();
      const lignes = await traceur.collectees();
      if (lignes.length === 0) return; // silence quand il n'y a rien : la sortie reste lisible
      const res = await supprimeLignesCreees(lignes);
      console.log(`🧹 ménage après « ${testInfo.title.slice(0, 60)} » : ${res}`);
    },
    // Son propre délai : le ménage ne doit pas être coupé parce que le test a
    // mangé tout son temps (c'est justement là qu'il reste des lignes).
    { auto: true, timeout: 120_000 },
  ],
});
